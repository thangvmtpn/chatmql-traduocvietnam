import { authMiddleware } from './auth-middleware.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-key-service.js';
function requireUserOwnerAdmin(request, reply) {
    const user = request.user;
    if (user.via === 'api_key') {
        reply.status(403).send({ error: 'API key không được quản lý API key' });
        return null;
    }
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được quản lý API key' });
        return null;
    }
    return user;
}
export async function apiKeyRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    app.post('/api/v1/api-keys', async (request, reply) => {
        const user = requireUserOwnerAdmin(request, reply);
        if (!user)
            return;
        const { name } = (request.body ?? {});
        if (!name || !name.trim())
            return reply.status(400).send({ error: 'Cần tên (name) cho API key' });
        try {
            const { rawKey, key } = await createApiKey(user.orgId, user.id, name);
            // rawKey is shown ONCE — the client must store it now.
            return reply.status(201).send({ apiKey: rawKey, key });
        }
        catch (err) {
            return reply.status(400).send({ error: err instanceof Error ? err.message : 'Không tạo được API key' });
        }
    });
    app.get('/api/v1/api-keys', async (request, reply) => {
        const user = requireUserOwnerAdmin(request, reply);
        if (!user)
            return;
        return reply.send({ items: await listApiKeys(user.orgId) });
    });
    app.delete('/api/v1/api-keys/:id', async (request, reply) => {
        const user = requireUserOwnerAdmin(request, reply);
        if (!user)
            return;
        const { id } = request.params;
        const ok = await revokeApiKey(user.orgId, id);
        if (!ok)
            return reply.status(404).send({ error: 'API key không tồn tại hoặc đã thu hồi' });
        return reply.send({ ok: true });
    });
}
export default apiKeyRoutes;
//# sourceMappingURL=api-key-routes.js.map