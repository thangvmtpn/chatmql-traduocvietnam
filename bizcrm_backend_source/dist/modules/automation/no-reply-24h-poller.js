/**
 * no-reply-24h-poller.ts — Polls for conversations where the contact
 * sent a message but no agent has replied for 24+ hours, and fires
 * the `no_reply_24h` automation trigger.
 *
 * Runs every 5 minutes via setInterval in app.ts.
 * Reuses ConversationIdleCheckpoint table for dedup (threshold = 'no_reply_24h').
 *
 * Key difference from conversation_idle:
 * - conversation_idle fires for ANY idle conversation (regardless of last sender)
 * - no_reply_24h fires ONLY when last sender is 'contact' (customer waiting for reply)
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { runAutomationRules } from './automation-engine.js';
/** Threshold key used in ConversationIdleCheckpoint */
const CHECKPOINT_KEY = 'no_reply_24h';
/** 24 hours in milliseconds */
const NO_REPLY_THRESHOLD_MS = 24 * 3600_000;
/**
 * Scan conversations where:
 * - Contact sent the last message (isReplied = false)
 * - Last message was 24+ hours ago
 * - Not already triggered for this lastMessageAt
 *
 * Returns total number of triggers dispatched this cycle.
 */
export async function pollNoReply24h() {
    const cutoff = new Date(Date.now() - NO_REPLY_THRESHOLD_MS);
    let dispatched = 0;
    // Find conversations unreplied for 24+ hours
    // isReplied = false means the CONTACT sent the last message and agent hasn't replied
    const conversations = await prisma.conversation.findMany({
        where: {
            isReplied: false,
            lastMessageAt: {
                not: null,
                lte: cutoff, // older than 24h
                gte: new Date(Date.now() - 7 * 24 * 3600_000), // within last 7 days (ignore dead convs)
            },
            contactId: { not: null },
            threadType: 'user', // skip group chats
        },
        select: {
            id: true,
            orgId: true,
            contactId: true,
            lastMessageAt: true,
            idleCheckpoints: {
                where: { threshold: CHECKPOINT_KEY },
                select: { lastCheckedAt: true },
            },
        },
        take: 100, // batch size
    });
    for (const conv of conversations) {
        const lastMsg = conv.lastMessageAt;
        const checkpoint = conv.idleCheckpoints[0];
        // Skip if already triggered for this lastMessageAt
        if (checkpoint && checkpoint.lastCheckedAt >= lastMsg)
            continue;
        // Verify last message was from contact (double-check beyond isReplied flag)
        const lastMessage = await prisma.message.findFirst({
            where: { conversationId: conv.id },
            orderBy: { sentAt: 'desc' },
            select: { senderType: true, content: true, sentAt: true },
        });
        // Only trigger if last message was from contact (not self/system)
        if (!lastMessage || lastMessage.senderType !== 'contact')
            continue;
        const noReplyDurationMs = Date.now() - lastMsg.getTime();
        // Dispatch automation trigger (via BullMQ queue)
        runAutomationRules('no_reply_24h', {
            orgId: conv.orgId,
            conversationId: conv.id,
            contactId: conv.contactId,
            triggerData: {
                noReplyDurationMs,
                noReplyHours: Math.round(noReplyDurationMs / 3600_000),
                lastMessageAt: lastMsg.toISOString(),
                lastMessageText: lastMessage.content?.substring(0, 200) || null,
            },
        }).catch(err => logger.error({ err, convId: conv.id }, '[no-reply-24h] trigger failed'));
        // Upsert checkpoint to prevent re-triggering
        await prisma.conversationIdleCheckpoint.upsert({
            where: {
                conversationId_threshold: {
                    conversationId: conv.id,
                    threshold: CHECKPOINT_KEY,
                },
            },
            create: {
                conversationId: conv.id,
                threshold: CHECKPOINT_KEY,
                lastCheckedAt: lastMsg,
            },
            update: { lastCheckedAt: lastMsg },
        });
        dispatched++;
    }
    if (dispatched > 0) {
        logger.info({ dispatched }, '[no-reply-24h] No-reply triggers dispatched');
    }
    return dispatched;
}
//# sourceMappingURL=no-reply-24h-poller.js.map