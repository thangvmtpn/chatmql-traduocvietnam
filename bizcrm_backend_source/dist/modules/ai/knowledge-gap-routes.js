import { authMiddleware } from '../auth/auth-middleware.js';
import { listKnowledgeGaps, resolveGap, resolveGapViaMaster, dismissGap } from './knowledge-gap-service.js';
const VALID_GAP_STATUSES = ['open', 'resolved', 'dismissed'];
const MAX_CONTENT_LEN = 50_000;
function requireOwnerAdmin(request, reply) {
    const user = request.user;
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được truy cập' });
        return false;
    }
    return true;
}
export async function knowledgeGapRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    app.get('/api/v1/ai/knowledge-gaps', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        try {
            const raw = request.query?.status;
            const status = VALID_GAP_STATUSES.includes(raw ?? '') ? raw : undefined;
            const limit = Math.min(parseInt(request.query?.limit ?? '50', 10) || 50, 100);
            const offset = Math.max(parseInt(request.query?.offset ?? '0', 10) || 0, 0);
            const { items, total } = await listKnowledgeGaps(user.orgId, status, limit, offset);
            return { data: items, total };
        }
        catch (err) {
            app.log.error({ err }, '[ai] knowledge-gaps list failed');
            return reply.status(500).send({ error: 'Không tải được danh sách phản hồi' });
        }
    });
    // Resolve directly → create a KnowledgeEntry (auto-embedded)
    app.post('/api/v1/ai/knowledge-gaps/:id/resolve', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const b = request.body ?? {};
        if (!b.content || !b.content.trim())
            return reply.status(400).send({ error: 'content is required' });
        if (b.content.length > MAX_CONTENT_LEN)
            return reply.status(400).send({ error: 'Nội dung quá dài (tối đa 50.000 ký tự)' });
        try {
            const res = await resolveGap(request.params.id, user.orgId, user.id, {
                content: b.content, title: b.title, type: b.type, format: b.format,
                categoryId: b.categoryId, risk: b.risk, notes: b.notes,
            });
            if (!res.ok)
                return reply.status(400).send({ error: res.error });
            return { success: true, entryId: res.entryId };
        }
        catch (err) {
            app.log.error({ err }, '[ai] knowledge-gap resolve failed');
            return reply.status(500).send({ error: 'Không tạo được tri thức' });
        }
    });
    // Resolve via AI Master → seed feedback into the improve loop.
    // `note` = the staff's own directive, carried into the feedback so the Master
    // proposes what the human wants (e.g. a scenario update), not just a FAQ.
    app.post('/api/v1/ai/knowledge-gaps/:id/resolve-master', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        const note = typeof request.body?.note === 'string' ? request.body.note.slice(0, MAX_CONTENT_LEN) : undefined;
        try {
            const res = await resolveGapViaMaster(request.params.id, user.orgId, user.id, note);
            if (!res.ok)
                return reply.status(400).send({ error: res.error });
            return { success: true, feedbackId: res.feedbackId };
        }
        catch (err) {
            app.log.error({ err }, '[ai] knowledge-gap resolve-master failed');
            return reply.status(500).send({ error: 'Không chuyển được cho Master' });
        }
    });
    app.post('/api/v1/ai/knowledge-gaps/:id/dismiss', async (request, reply) => {
        if (!requireOwnerAdmin(request, reply))
            return;
        const user = request.user;
        try {
            const ok = await dismissGap(request.params.id, user.orgId, user.id);
            if (!ok)
                return reply.status(400).send({ error: 'Không thể bỏ qua (đã xử lý hoặc không tồn tại)' });
            return { success: true };
        }
        catch (err) {
            app.log.error({ err }, '[ai] knowledge-gap dismiss failed');
            return reply.status(500).send({ error: 'Không bỏ qua được' });
        }
    });
}
export default knowledgeGapRoutes;
//# sourceMappingURL=knowledge-gap-routes.js.map