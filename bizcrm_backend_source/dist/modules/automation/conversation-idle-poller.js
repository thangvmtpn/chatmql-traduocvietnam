/**
 * conversation-idle-poller.ts — Polls for idle conversations and fires
 * the `conversation_idle` automation trigger.
 *
 * Runs every 60s via setInterval in app.ts.
 * Uses ConversationIdleCheckpoint table for dedup.
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { runAutomationRules } from './automation-engine.js';
// ─── Thresholds ──────────────────────────────────────────────────────
export const IDLE_THRESHOLDS = [
    { key: '30m', ms: 30 * 60_000, label: '30 phút' },
    { key: '1h', ms: 60 * 60_000, label: '1 giờ' },
    { key: '24h', ms: 24 * 3600_000, label: '24 giờ' },
];
// ─── Poller ──────────────────────────────────────────────────────────
/**
 * Scan conversations that have been idle past each threshold.
 * For each match, dispatch `conversation_idle` trigger with context.
 *
 * Returns total number of triggers dispatched this cycle.
 */
export async function pollConversationIdle() {
    let dispatched = 0;
    for (const threshold of IDLE_THRESHOLDS) {
        const cutoff = new Date(Date.now() - threshold.ms);
        // Find conversations idle past this threshold that haven't been
        // processed yet (no checkpoint, or checkpoint.lastCheckedAt < conv.lastMessageAt)
        const conversations = await prisma.conversation.findMany({
            where: {
                lastMessageAt: { not: null, lte: cutoff },
                contactId: { not: null },
                threadType: 'user', // skip group chats
            },
            select: {
                id: true,
                orgId: true,
                contactId: true,
                lastMessageAt: true,
                idleCheckpoints: {
                    where: { threshold: threshold.key },
                    select: { lastCheckedAt: true },
                },
            },
            take: 100, // batch size per threshold
        });
        for (const conv of conversations) {
            const lastMsg = conv.lastMessageAt;
            const checkpoint = conv.idleCheckpoints[0];
            // Skip if already processed for this lastMessageAt
            if (checkpoint && checkpoint.lastCheckedAt >= lastMsg)
                continue;
            // Lookup last message to determine senderType
            const lastMessage = await prisma.message.findFirst({
                where: { conversationId: conv.id },
                orderBy: { sentAt: 'desc' },
                select: { senderType: true, sentAt: true },
            });
            const lastSenderType = lastMessage?.senderType || 'contact';
            // Dispatch automation trigger
            runAutomationRules('conversation_idle', {
                orgId: conv.orgId,
                conversationId: conv.id,
                contactId: conv.contactId,
                triggerData: {
                    idleThreshold: threshold.key,
                    idleDurationMs: Date.now() - lastMsg.getTime(),
                    lastSenderType,
                    lastMessageAt: lastMsg.toISOString(),
                },
            }).catch(err => logger.error({ err, convId: conv.id }, '[idle-poller] trigger failed'));
            // Upsert checkpoint
            await prisma.conversationIdleCheckpoint.upsert({
                where: {
                    conversationId_threshold: {
                        conversationId: conv.id,
                        threshold: threshold.key,
                    },
                },
                create: {
                    conversationId: conv.id,
                    threshold: threshold.key,
                    lastCheckedAt: lastMsg,
                },
                update: { lastCheckedAt: lastMsg },
            });
            dispatched++;
        }
    }
    if (dispatched > 0) {
        logger.info({ dispatched }, '[idle-poller] Conversation idle triggers dispatched');
    }
    return dispatched;
}
// ─── Checkpoint Reset ────────────────────────────────────────────────
/**
 * Reset all idle checkpoints for a conversation.
 * Call this when a new message arrives so the idle timer restarts.
 */
export async function resetIdleCheckpoints(conversationId) {
    await prisma.conversationIdleCheckpoint.deleteMany({
        where: { conversationId },
    }).catch(() => { });
}
/**
 * Pre-seed idle checkpoints so the poller treats a conversation as ALREADY
 * processed up to `lastMessageAt` (skip condition: lastCheckedAt >= lastMessageAt).
 *
 * Used by bulk importers (e.g. Pancake sync) so a batch of historical
 * conversations doesn't get swept as "newly idle" → firing `conversation_idle`
 * automation (incl. ai_cdp Customer 360, an AI call per conversation). Future
 * REAL activity advances lastMessageAt past the checkpoint and re-arms idle
 * naturally — so this only suppresses the one-time historical sweep.
 */
export async function seedIdleCheckpoints(conversationId, lastMessageAt) {
    try {
        await Promise.all(IDLE_THRESHOLDS.map((t) => prisma.conversationIdleCheckpoint.upsert({
            where: { conversationId_threshold: { conversationId, threshold: t.key } },
            create: { conversationId, threshold: t.key, lastCheckedAt: lastMessageAt },
            update: { lastCheckedAt: lastMessageAt },
        })));
    }
    catch (err) {
        // Non-fatal: worst case the poller fires once for this conversation.
        logger.warn({ err: err.message, conversationId }, '[idle-poller] seed checkpoints failed');
    }
}
//# sourceMappingURL=conversation-idle-poller.js.map