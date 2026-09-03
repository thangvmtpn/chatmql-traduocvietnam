import { SenderType } from '../../shared/constants.js';
import { prisma } from '../../shared/prisma-client.js';
import { emitNewMessage } from '../realtime/socket-gateway.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
import { logger } from '../../shared/logger.js';
import { extractPhoneFromName } from '../contacts/phone-extractor.js';
export async function zaloWebhookRoutes(app) {
    /**
     * Internal endpoint — called by the zca-js listener or a bridge service.
     * No JWT auth — secured by internal network / API key.
     */
    app.post('/api/internal/zalo/webhook', async (request, reply) => {
        const apiKey = request.headers['x-internal-key'];
        if (apiKey !== (process.env.INTERNAL_API_KEY || 'bizcrm-internal-dev')) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const { accountId, senderUid, senderName, content, contentType = 'text', externalMsgId, attachments, quote, timestamp, } = request.body;
        if (!accountId || !senderUid || !content) {
            return reply.status(400).send({ error: 'accountId, senderUid, content required' });
        }
        // ── 1. Validate account (must be live — not soft-deleted / disabled) ──
        // A removed account keeps receiving OA webhook events from Zalo's side,
        // so without this guard chat would keep flowing after the user deletes
        // the connection in the UI.
        const account = await prisma.channelAccount.findFirst({
            where: { id: accountId, deletedAt: null, isDisabled: false },
            select: { id: true, orgId: true },
        });
        if (!account) {
            return reply.status(404).send({ error: 'Zalo account not found or disconnected' });
        }
        const orgId = account.orgId;
        // ── 2. Upsert contact ─────────────────────────────────────────
        let contact = await prisma.contact.findFirst({
            where: { orgId, zaloUid: senderUid },
        });
        if (!contact) {
            // Auto-extract VN phone from Zalo display name
            const extractedPhone = extractPhoneFromName(senderName);
            contact = await prisma.contact.create({
                data: {
                    orgId,
                    fullName: senderName || `Zalo ${senderUid.slice(-4)}`,
                    ...(extractedPhone ? { phone: extractedPhone } : {}),
                    zaloUid: senderUid,
                    source: 'zalo',
                    lifecycleStage: 'subscriber',
                },
            });
            logger.info(`[zalo-webhook] Created new contact ${contact.id} for ${senderName}`);
            // Fire contact_created automation (fire-and-forget)
            runAutomationRules('contact_created', {
                orgId,
                contactId: contact.id,
            }).catch(err => logger.error('[automation] contact_created error:', err));
            emitDomainEvent({ type: 'contact.created', orgId, id: contact.id });
        }
        // ── 3. Upsert conversation ────────────────────────────────────
        let conversation = await prisma.conversation.findFirst({
            where: { orgId, channelAccountId: accountId, contactId: contact.id },
        });
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    orgId,
                    channelAccountId: accountId,
                    contactId: contact.id,
                    displayName: senderName || contact.fullName || null,
                    tab: 'main',
                    lastMessageAt: new Date(),
                    unreadCount: 1,
                    isReplied: false,
                    aiMode: 'auto',
                },
            });
        }
        else {
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    lastMessageAt: new Date(),
                    unreadCount: { increment: 1 },
                    isReplied: false,
                },
            });
        }
        // ── 4. Create message record ──────────────────────────────────
        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                externalMsgId: externalMsgId ?? null,
                senderType: SenderType.CONTACT,
                senderUid,
                senderName: senderName || contact.fullName,
                content,
                contentType,
                attachments: attachments ?? [],
                quote: quote ?? null,
                sentAt: timestamp ? new Date(timestamp) : new Date(),
            },
        });
        // ── 5. Emit real-time event ───────────────────────────────────
        try {
            emitNewMessage(orgId, conversation.id, {
                ...message,
                senderType: SenderType.CONTACT,
                senderName: senderName || contact.fullName,
            });
        }
        catch { /* socket not connected yet */ }
        // ── 6. Trigger automation rules (fire-and-forget) ─────────────
        runAutomationRules('message_received', {
            orgId,
            conversationId: conversation.id,
            contactId: contact.id,
            messageText: content,
        }).catch(err => logger.error('[automation] message_received error:', err));
        return reply.status(200).send({
            ok: true,
            messageId: message.id,
            conversationId: conversation.id,
            contactId: contact.id,
        });
    });
    /**
     * Health check for the webhook endpoint
     */
    app.get('/api/internal/zalo/webhook/health', async () => {
        return { status: 'ok', service: 'zalo-webhook' };
    });
}
//# sourceMappingURL=zalo-webhook.js.map