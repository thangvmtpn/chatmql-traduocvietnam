import { SenderType } from '../../shared/constants.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/prisma-client.js';
import { getPoolEntry } from '../zalo/zalo-pool.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { checkLimits, recordAction } from '../zalo/zalo-rate-limiter.js';
import { emitNewMessage } from '../realtime/socket-gateway.js';
import { logger } from '../../shared/logger.js';
// ── Helpers ───────────────────────────────────────────────────────────────────
async function getConversation(id, orgId) {
    return prisma.conversation.findFirst({
        where: { id, orgId },
        select: {
            id: true, orgId: true, channelAccountId: true, threadType: true,
            externalThreadId: true,
        },
    });
}
async function resolveMessageRefs(conversationId, messageId, orgId) {
    const message = await prisma.message.findFirst({
        where: {
            id: messageId,
            conversationId,
            conversation: { orgId },
        },
        select: { id: true, externalMsgId: true, senderUid: true, repliedByUserId: true },
    });
    if (!message?.externalMsgId)
        return null;
    return {
        messageId: message.id,
        externalMsgId: message.externalMsgId,
        cliMsgId: message.externalMsgId, // zca-js uses same value
        ownerId: message.senderUid || '',
        repliedByUserId: message.repliedByUserId || null,
    };
}
export async function chatOperationsRoutes(app) {
    app.addHook('preHandler', async (request) => { await request.jwtVerify(); });
    const chatAccess = { preHandler: requireZaloAccess() };
    // ── POST /mark-read — đánh dấu đã đọc ────────────────────────────────────
    app.post('/api/v1/conversations/:id/mark-read', chatAccess, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const conv = await getConversation(id, user.orgId);
        if (!conv)
            return reply.status(404).send({ error: 'Conversation not found' });
        // Reset unread count in DB
        await prisma.conversation.update({
            where: { id },
            data: { unreadCount: 0 },
        });
        return { success: true };
    });
    // ── POST /messages/:msgId/undo — thu hồi tin nhắn trên Zalo ───────────────
    app.post('/api/v1/conversations/:id/messages/:msgId/undo', chatAccess, async (request, reply) => {
        const user = request.user;
        const { id, msgId } = request.params;
        const conv = await getConversation(id, user.orgId);
        if (!conv)
            return reply.status(404).send({ error: 'Conversation not found' });
        const refs = await resolveMessageRefs(id, msgId, user.orgId);
        if (!refs)
            return reply.status(404).send({ error: 'Message not found or has no Zalo message ID' });
        // Only allow undo of own messages
        if (refs.repliedByUserId && refs.repliedByUserId !== user.id) {
            return reply.status(403).send({ error: 'Can only undo your own messages' });
        }
        const entry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined;
        if (!entry?.api || entry.status !== 'connected') {
            return reply.status(503).send({ error: 'Zalo account not connected' });
        }
        const rateCheck = checkLimits(conv.channelAccountId, 'chat_action');
        if (!rateCheck.allowed)
            return reply.status(429).send({ error: rateCheck.reason });
        try {
            const threadType = conv.threadType === 'group' ? 1 : 0;
            const threadId = conv.externalThreadId || '';
            await entry.api.undo({ msgId: refs.externalMsgId, cliMsgId: refs.cliMsgId }, threadId, threadType);
            recordAction(conv.channelAccountId, 'chat_action');
            // Mark as deleted locally
            await prisma.message.update({
                where: { id: refs.messageId },
                data: { isDeleted: true, deletedAt: new Date() },
            });
            // Emit real-time event
            try {
                const io = (await import('../realtime/socket-gateway.js')).getIO();
                io?.emit('chat:deleted', {
                    conversationId: id,
                    messageId: refs.messageId,
                    externalMsgId: refs.externalMsgId,
                });
            }
            catch { /* socket not connected */ }
            return { success: true };
        }
        catch (err) {
            logger.error('[chat-ops] undo error:', err.message);
            return reply.status(500).send({ error: err.message || 'Failed to undo message' });
        }
    });
    // ── POST /sticker — gửi sticker qua Zalo ──────────────────────────────────
    app.post('/api/v1/conversations/:id/sticker', chatAccess, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { stickerId, cateId, stickerType = 2 } = request.body ?? {};
        if (!stickerId || !cateId) {
            return reply.status(400).send({ error: 'stickerId and cateId are required' });
        }
        const conv = await getConversation(id, user.orgId);
        if (!conv)
            return reply.status(404).send({ error: 'Conversation not found' });
        const entry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined;
        if (!entry?.api || entry.status !== 'connected') {
            return reply.status(503).send({ error: 'Zalo account not connected' });
        }
        const rateCheck = checkLimits(conv.channelAccountId, 'message');
        if (!rateCheck.allowed)
            return reply.status(429).send({ error: rateCheck.reason });
        try {
            const threadType = conv.threadType === 'group' ? 1 : 0;
            const threadId = conv.externalThreadId || '';
            const result = await entry.api.sendSticker({ id: stickerId, cateId, type: stickerType }, threadId, threadType);
            recordAction(conv.channelAccountId, 'message');
            // Create local message record
            const message = await prisma.message.create({
                data: {
                    id: randomUUID(),
                    conversationId: id,
                    senderType: SenderType.SELF,
                    senderUid: '',
                    senderName: 'Staff',
                    content: String(stickerId),
                    contentType: 'sticker',
                    sentAt: new Date(),
                    repliedByUserId: user.id,
                },
            });
            // Update conversation lastMessageAt
            await prisma.conversation.update({
                where: { id },
                data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
            });
            // Emit real-time event
            try {
                emitNewMessage(conv.orgId, id, {
                    ...message,
                    senderType: SenderType.SELF,
                    senderName: 'Staff',
                });
            }
            catch { /* socket not connected */ }
            return { success: true, result };
        }
        catch (err) {
            logger.error('[chat-ops] sticker error:', err.message);
            return reply.status(500).send({ error: err.message || 'Failed to send sticker' });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // STICKER CATALOG — Cached via fastify-cache-plugin (global scope)
    //   Pack data:     24h TTL — sticker packs rarely change
    //   Search results: 1h TTL — may evolve
    //   Sticker detail: NOT needed — images rendered via CDN URL (webpc?eid=X&size=130)
    // ═══════════════════════════════════════════════════════════════════════════
    // ── GET /stickers/category/:cateId — auto-cached by plugin ────────────────
    app.get('/api/v1/stickers/category/:cateId', { config: { cache: { ttl: 86400 } } }, async (request, reply) => {
        const user = request.user;
        const cateId = Number(request.params.cateId);
        if (isNaN(cateId) || cateId < 0)
            return reply.status(400).send({ error: 'Invalid cateId' });
        const entry = await findConnectedEntry(user.orgId, request.query.accountId);
        if (!entry)
            return reply.status(503).send({ error: 'No connected Zalo account' });
        const stickers = await entry.api.getStickerCategoryDetail(cateId);
        return { success: true, stickers };
    });
    // ── GET /stickers/search — auto-cached by plugin ──────────────────────────
    app.get('/api/v1/stickers/search', { config: { cache: { ttl: 3600, keyParams: ['keyword', 'limit'] } } }, async (request, reply) => {
        const user = request.user;
        const { keyword, limit: limitStr } = request.query;
        if (!keyword)
            return reply.status(400).send({ error: 'keyword is required' });
        const entry = await findConnectedEntry(user.orgId, request.query.accountId);
        if (!entry)
            return reply.status(503).send({ error: 'No connected Zalo account' });
        const limit = limitStr ? Number(limitStr) : 50;
        const stickers = await entry.api.searchSticker(keyword, limit);
        return { success: true, stickers };
    });
}
/** Find first connected Zalo pool entry for an org (optionally by specific accountId) */
async function findConnectedEntry(orgId, accountId) {
    if (accountId) {
        const entry = getPoolEntry(accountId);
        if (entry?.api && entry.status === 'connected')
            return entry;
    }
    const accounts = await prisma.channelAccount.findMany({
        where: { orgId },
        select: { id: true },
    });
    for (const acc of accounts) {
        const entry = getPoolEntry(acc.id);
        if (entry?.api && entry.status === 'connected')
            return entry;
    }
    return null;
}
//# sourceMappingURL=chat-operations-routes.js.map