import { getPoolEntry } from './zalo-pool.js';
import { requireZaloAccess } from './zalo-access-middleware.js';
import { checkLimits, recordAction } from './zalo-rate-limiter.js';
const BASE = '/api/v1/zalo-accounts/:id/friends';
function getApi(id) {
    const entry = getPoolEntry(id);
    if (!entry?.api || entry.status !== 'connected')
        return null;
    return entry.api;
}
export async function friendRoutes(app) {
    // All routes require auth (handled by Fastify JWT decorator)
    app.addHook('preHandler', async (request) => { await request.jwtVerify(); });
    // ── Friend Queries ──────────────────────────────────────────────────────
    // GET .../friends/find?phone=... — find user by phone number
    app.get(`${BASE}/find`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { phone } = request.query;
        if (!phone)
            return reply.status(400).send({ error: 'phone query param is required' });
        const api = getApi(request.params.id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.findUser(phone);
            return { data };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to find user' });
        }
    });
    // ── Friend Requests ─────────────────────────────────────────────────────
    // POST .../friends/requests — send friend request { userId, message? }
    app.post(`${BASE}/requests`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { id } = request.params;
        const { userId, message = '' } = request.body ?? {};
        if (!userId)
            return reply.status(400).send({ error: 'userId is required' });
        const rateCheck = checkLimits(id, 'friend_action');
        if (!rateCheck.allowed)
            return reply.status(429).send({ error: rateCheck.reason });
        const api = getApi(id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.sendFriendRequest(message, userId);
            recordAction(id, 'friend_action');
            return reply.status(201).send({ data });
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to send friend request' });
        }
    });
    // POST .../friends/requests/:userId/accept — accept incoming request
    app.post(`${BASE}/requests/:userId/accept`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { id, userId } = request.params;
        const rateCheck = checkLimits(id, 'friend_action');
        if (!rateCheck.allowed)
            return reply.status(429).send({ error: rateCheck.reason });
        const api = getApi(id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.acceptFriendRequest(userId);
            recordAction(id, 'friend_action');
            return { data };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to accept friend request' });
        }
    });
    // DELETE .../friends/:userId — remove friend
    app.delete(`${BASE}/:userId`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { id, userId } = request.params;
        const rateCheck = checkLimits(id, 'friend_action');
        if (!rateCheck.allowed)
            return reply.status(429).send({ error: rateCheck.reason });
        const api = getApi(id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.removeFriend(userId);
            recordAction(id, 'friend_action');
            return { data };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to remove friend' });
        }
    });
    // ── Privacy ─────────────────────────────────────────────────────────────
    // POST .../friends/:userId/block — block user
    app.post(`${BASE}/:userId/block`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { id, userId } = request.params;
        const api = getApi(id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.blockUser(userId);
            return { data };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to block user' });
        }
    });
    // DELETE .../friends/:userId/block — unblock user
    app.delete(`${BASE}/:userId/block`, { preHandler: requireZaloAccess() }, async (request, reply) => {
        const { id, userId } = request.params;
        const api = getApi(id);
        if (!api)
            return reply.status(503).send({ error: 'Zalo account not connected' });
        try {
            const data = await api.unblockUser(userId);
            return { data };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'Failed to unblock user' });
        }
    });
}
//# sourceMappingURL=friend-routes.js.map