/**
 * pancake-message-handler.ts — Process inbound Pancake webhook events.
 *
 * Follows the exact same flow as zalo-webhook.ts:
 *   1. Lookup ChannelAccount
 *   2. Upsert Contact (by pancakeUid)
 *   3. Upsert Conversation (by externalThreadId)
 *   4. Create Message record
 *   5. Emit Socket.IO real-time event
 *   6. Run automation rules
 *
 * Handles both INBOX (chat) and COMMENT events from Pancake.
 */
import { prisma } from '../../shared/prisma-client.js';
import { SenderType } from '../../shared/constants.js';
import { emitNewMessage } from '../realtime/socket-gateway.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
import { logger } from '../../shared/logger.js';
import { stripHtml, parsePancakeTime, mapAttachmentType, extractAttachments } from './pancake-helpers.js';
// Content type mapping and attachment extraction imported from ./pancake-helpers.ts
// extractAttachments imported from ./pancake-helpers.ts
// ─── Main Event Processor ────────────────────────────────────────────────────
/**
 * Process a single Pancake webhook event.
 * Called asynchronously from the webhook route (fire-and-forget).
 */
export async function processPancakeEvent(channelAccountId, orgId, payload) {
    // ── Extract message data ──────────────────────────────────────────
    const data = payload.data || payload;
    const message = data.message;
    const conversation = data.conversation;
    if (!message || !conversation) {
        logger.debug('[pancake-handler] No message/conversation in payload — skipping');
        return;
    }
    const convExternalId = String(conversation.id);
    const msgExternalId = String(message.id || '');
    const senderInfo = message.from || {};
    const senderName = senderInfo.name || 'Unknown';
    const senderExternalId = senderInfo.id || '';
    const pancakeCustomerId = senderInfo.page_customer_id || senderExternalId;
    const messageText = message.original_message || stripHtml(message.message || '');
    const contentType = mapAttachmentType(message.attachments);
    const attachments = extractAttachments(message.attachments);
    const sentAt = parsePancakeTime(message.inserted_at || message.created_time);
    // C3 fix: Detect if message is from page (staff) or customer
    // Fetch the page's externalPageId to compare with sender
    const channelAccount = await prisma.channelAccount.findUnique({
        where: { id: channelAccountId },
        select: { externalPageId: true },
    });
    const isFromPage = channelAccount?.externalPageId === senderExternalId;
    const senderType = isFromPage ? SenderType.SELF : SenderType.CONTACT;
    // Skip if empty (no text and no attachments)
    if (!messageText && attachments.length === 0) {
        logger.debug('[pancake-handler] Empty message — skipping');
        return;
    }
    // ── 1. Upsert Contact ──────────────────────────────────────────────
    let contact = await prisma.contact.findFirst({
        where: { orgId, pancakeUid: pancakeCustomerId },
    });
    if (!contact) {
        // Also check by name match to avoid duplicates from different channels
        contact = await prisma.contact.create({
            data: {
                orgId,
                fullName: senderName,
                pancakeUid: pancakeCustomerId,
                source: 'pancake',
                lifecycleStage: 'subscriber',
            },
        });
        logger.info({ contactId: contact.id, name: senderName }, '[pancake-handler] Created new contact');
        // Fire contact_created automation (fire-and-forget)
        runAutomationRules('contact_created', {
            orgId,
            contactId: contact.id,
        }).catch(err => logger.error('[pancake-handler] contact_created automation error:', err));
        emitDomainEvent({ type: 'contact.created', orgId, id: contact.id });
    }
    // ── 2. Upsert Conversation ─────────────────────────────────────────
    let conv = await prisma.conversation.findFirst({
        where: { channelAccountId, externalThreadId: convExternalId },
    });
    if (!conv) {
        conv = await prisma.conversation.create({
            data: {
                orgId,
                channelAccountId,
                contactId: contact.id,
                externalThreadId: convExternalId,
                displayName: senderName || contact.fullName || null,
                tab: 'main',
                lastMessageAt: sentAt,
                unreadCount: 1,
                isReplied: false,
            },
        });
        logger.info({ convId: conv.id, externalId: convExternalId }, '[pancake-handler] Created new conversation');
    }
    else {
        await prisma.conversation.update({
            where: { id: conv.id },
            data: {
                lastMessageAt: sentAt,
                unreadCount: { increment: 1 },
                isReplied: false,
            },
        });
    }
    // ── 3. Dedup + Create Message ──────────────────────────────────
    // C2 fix: Scope dedup by conversationId to prevent cross-tenant blocking.
    // Two orgs can sync the same Pancake message — each should have its own copy.
    if (msgExternalId) {
        const existing = await prisma.message.findFirst({
            where: { conversationId: conv.id, externalMsgId: msgExternalId },
            select: { id: true },
        });
        if (existing) {
            logger.debug({ msgExternalId }, '[pancake-handler] Duplicate message — skipping');
            return;
        }
    }
    const msg = await prisma.message.create({
        data: {
            conversationId: conv.id,
            externalMsgId: msgExternalId || null,
            senderType,
            senderUid: senderExternalId,
            senderName: senderName || contact.fullName,
            content: messageText || (attachments.length > 0 ? `[${contentType}]` : ''),
            contentType,
            attachments: attachments.length > 0 ? attachments : [],
            sentAt,
        },
    });
    // ── 4. Emit Socket.IO real-time event ──────────────────────────
    // H1 fix: Use detected senderType, not hardcoded CONTACT
    try {
        emitNewMessage(orgId, conv.id, {
            ...msg,
            senderType,
            senderName: senderName || contact.fullName,
        });
    }
    catch { /* socket not connected */ }
    // ── 5. Trigger automation rules (customer messages only) ───────
    // H3 fix: Skip automation for staff messages to prevent infinite loops
    // (staff reply → automation sends message → triggers another webhook → …)
    if (senderType === SenderType.CONTACT) {
        runAutomationRules('message_received', {
            orgId,
            conversationId: conv.id,
            contactId: contact.id,
            messageText: messageText || '',
        }).catch(err => logger.error('[pancake-handler] message_received automation error:', err));
    }
    logger.info({
        convId: conv.id,
        contactId: contact.id,
        msgId: msg.id,
        contentType,
    }, '[pancake-handler] Message processed');
}
// Helpers imported from ./pancake-helpers.ts
//# sourceMappingURL=pancake-message-handler.js.map