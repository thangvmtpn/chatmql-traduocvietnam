import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { deliverWebVisitorMessage, getOrCreateWebChannel } from './web-chat-service.js';
function ownerAdminOnly(request, reply) {
    const user = request.user;
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được dùng web chat' });
        return false;
    }
    return true;
}
export async function webChatRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // Send a visitor (customer) message into the real pipeline.
    app.post('/api/v1/web-chat/messages', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        const { conversationId, text, visitorName, aiMode } = request.body ?? {};
        if (!text?.trim())
            return reply.status(400).send({ error: 'text là bắt buộc' });
        try {
            const res = await deliverWebVisitorMessage({
                orgId: user.orgId,
                ownerUserId: user.id,
                conversationId,
                text: text.trim(),
                visitorName,
                aiMode,
            });
            return reply.status(201).send(res);
        }
        catch (err) {
            app.log.error({ err }, '[web-chat] send failed');
            return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Lỗi gửi tin web' });
        }
    });
    // List web/test conversations for the org.
    app.get('/api/v1/web-chat/conversations', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        try {
            const channelId = await getOrCreateWebChannel(user.orgId, user.id);
            const conversations = await prisma.conversation.findMany({
                where: { orgId: user.orgId, channelAccountId: channelId },
                orderBy: { lastMessageAt: 'desc' },
                take: 50,
                select: {
                    id: true, displayName: true, aiMode: true, lastMessageAt: true,
                    _count: { select: { messages: true } },
                },
            });
            return { conversations };
        }
        catch (err) {
            app.log.error({ err }, '[web-chat] list conversations failed');
            return reply.status(500).send({ error: err.message });
        }
    });
}
//# sourceMappingURL=web-chat-routes.js.map