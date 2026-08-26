import { authMiddleware } from '../auth/auth-middleware.js';
import { recordFeedback, listFeedback } from './feedback-service.js';
import { listProposals, applyProposal, rejectProposal } from './master/logic-proposal-service.js';
import { openSession, sendMasterMessage, getSession, closeSession } from './master/master-agent.js';
// ── ACL helpers ─────────────────────────────────────────────────────────
function requireOwnerAdmin(request, reply) {
    const user = request.user;
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được truy cập AI Master' });
        return false;
    }
    return true;
}
// ── Error serializer ────────────────────────────────────────────────────
function sendErr(reply, err, status = 500) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes('not found'))
        return reply.status(404).send({ error: msg });
    if (lower.includes('cannot apply') || lower.includes('already applied') || lower.includes('rejected')) {
        return reply.status(409).send({ error: msg });
    }
    if (lower.includes('not configured') || lower.includes('disabled') || lower.includes('invalid')) {
        return reply.status(400).send({ error: msg });
    }
    if (lower.includes('quota'))
        return reply.status(429).send({ error: msg });
    return reply.status(status).send({ error: msg });
}
// ── Plugin ──────────────────────────────────────────────────────────────
export async function masterRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── Feedback ────────────────────────────────────────────────────────────
    /**
     * POST /api/v1/ai/feedback
     * Body: { conversationId?, messageId?, aiReplyRunId?, text, category? }
     * ACL: any member
     */
    app.post('/api/v1/ai/feedback', async (request, reply) => {
        const user = request.user;
        const body = request.body;
        if (!body.text || !body.text.trim()) {
            return reply.status(400).send({ error: 'text is required' });
        }
        try {
            const feedback = await recordFeedback({
                orgId: user.orgId,
                conversationId: body.conversationId,
                messageId: body.messageId,
                aiReplyRunId: body.aiReplyRunId,
                authorUserId: user.id,
                text: body.text,
                category: body.category,
            });
            return reply.status(201).send({ feedback });
        }
        catch (err) {
            return sendErr(reply, err, 400);
        }
    });
    /**
     * GET /api/v1/ai/feedback?status=&limit=&offset=
     * ACL: any member
     */
    app.get('/api/v1/ai/feedback', async (request, reply) => {
        const user = request.user;
        const query = request.query;
        const status = query.status;
        const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
        const offset = parseInt(query.offset ?? '0', 10) || 0;
        try {
            const items = await listFeedback(user.orgId, status, limit, offset);
            return reply.send({ items, limit, offset });
        }
        catch (err) {
            return sendErr(reply, err, 400);
        }
    });
    // ── Master Sessions ─────────────────────────────────────────────────────
    /**
     * POST /api/v1/ai/master/sessions
     * Body: { contextConversationId?, seedFeedbackId? }
     * ACL: owner/admin
     */
    app.post('/api/v1/ai/master/sessions', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const body = request.body;
        try {
            const session = await openSession({
                orgId: user.orgId,
                openedByUserId: user.id,
                contextConversationId: body.contextConversationId,
                seedFeedbackId: body.seedFeedbackId,
            });
            return reply.status(201).send({ session });
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
    /**
     * GET /api/v1/ai/master/sessions/:id
     * ACL: owner/admin
     */
    app.get('/api/v1/ai/master/sessions/:id', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const { id } = request.params;
        try {
            const session = await getSession(id, user.orgId);
            if (!session)
                return reply.status(404).send({ error: 'Session not found' });
            return reply.send({ session });
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
    /**
     * POST /api/v1/ai/master/sessions/:id/messages
     * Body: { text }
     * ACL: owner/admin
     */
    app.post('/api/v1/ai/master/sessions/:id/messages', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        if (!body.text || !body.text.trim()) {
            return reply.status(400).send({ error: 'text is required' });
        }
        try {
            const result = await sendMasterMessage(id, user.orgId, body.text);
            return reply.send(result);
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
    /**
     * POST /api/v1/ai/master/sessions/:id/close
     * ACL: owner/admin
     */
    app.post('/api/v1/ai/master/sessions/:id/close', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const { id } = request.params;
        try {
            await closeSession(id, user.orgId);
            return reply.send({ ok: true });
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
    // ── Logic Proposals ─────────────────────────────────────────────────────
    /**
     * GET /api/v1/ai/master/proposals?status=&limit=&offset=
     * ACL: owner/admin
     */
    app.get('/api/v1/ai/master/proposals', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const query = request.query;
        const status = query.status;
        const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);
        const offset = parseInt(query.offset ?? '0', 10) || 0;
        try {
            const items = await listProposals(user.orgId, status, limit, offset);
            return reply.send({ items, limit, offset });
        }
        catch (err) {
            return sendErr(reply, err, 400);
        }
    });
    /**
     * POST /api/v1/ai/master/proposals/:id/reject
     * ACL: owner/admin
     */
    app.post('/api/v1/ai/master/proposals/:id/reject', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const { id } = request.params;
        try {
            const result = await rejectProposal(id, user.orgId, user.id);
            return reply.send(result);
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
    /**
     * POST /api/v1/ai/master/proposals/:id/apply
     * ACL: owner/admin (gated — human confirmation required)
     */
    app.post('/api/v1/ai/master/proposals/:id/apply', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const { id } = request.params;
        try {
            const result = await applyProposal(id, user.orgId, user.id);
            return reply.send(result);
        }
        catch (err) {
            return sendErr(reply, err);
        }
    });
}
export default masterRoutes;
//# sourceMappingURL=master-routes.js.map