import { authMiddleware } from '../auth/auth-middleware.js';
import { listCases, createCase, updateCase, deleteCase, listRuns, getRun, runEval, EvalBusyError, } from './ai-eval-service.js';
function ownerAdminOnly(request, reply) {
    const user = request.user;
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được quản lý bộ kiểm định AI' });
        return false;
    }
    return true;
}
function sendError(reply, err, fallback) {
    const msg = err instanceof Error && err.message ? err.message : fallback;
    const status = /không tồn tại/i.test(msg) ? 404 : /bắt buộc|để trống|Chưa có câu hỏi/i.test(msg) ? 400 : 500;
    return reply.status(status).send({ error: msg });
}
export async function aiEvalRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── Câu hỏi (cases) ────────────────────────────────────────────────
    app.get('/api/v1/ai/eval/cases', async (request, reply) => {
        try {
            const user = request.user;
            return { cases: await listCases(user.orgId) };
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] list cases failed');
            return sendError(reply, err, 'Không tải được danh sách câu hỏi kiểm định');
        }
    });
    app.post('/api/v1/ai/eval/cases', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        try {
            const user = request.user;
            const evalCase = await createCase(user.orgId, request.body ?? {});
            return reply.status(201).send({ case: evalCase });
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] create case failed');
            return sendError(reply, err, 'Không tạo được câu hỏi kiểm định');
        }
    });
    app.put('/api/v1/ai/eval/cases/:id', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        try {
            const user = request.user;
            const evalCase = await updateCase(user.orgId, request.params.id, request.body ?? {});
            return { case: evalCase };
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] update case failed');
            return sendError(reply, err, 'Không cập nhật được câu hỏi kiểm định');
        }
    });
    app.delete('/api/v1/ai/eval/cases/:id', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        try {
            const user = request.user;
            return await deleteCase(user.orgId, request.params.id);
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] delete case failed');
            return sendError(reply, err, 'Không xoá được câu hỏi kiểm định');
        }
    });
    // ── Lượt chạy (runs) ───────────────────────────────────────────────
    app.post('/api/v1/ai/eval/runs', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        try {
            const user = request.user;
            const { proposalId } = request.body ?? {};
            const run = await runEval(user.orgId, user.id, {
                trigger: proposalId ? 'proposal' : 'manual',
                proposalId: proposalId ?? null,
            });
            return reply.status(201).send({ run });
        }
        catch (err) {
            if (err instanceof EvalBusyError) {
                return reply.status(409).send({ error: err.message });
            }
            app.log.error({ err }, '[ai-eval] start run failed');
            return sendError(reply, err, 'Không khởi động được lượt kiểm định');
        }
    });
    app.get('/api/v1/ai/eval/runs', async (request, reply) => {
        try {
            const user = request.user;
            const limit = Number(request.query.limit) || 20;
            return { runs: await listRuns(user.orgId, limit) };
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] list runs failed');
            return sendError(reply, err, 'Không tải được lịch sử kiểm định');
        }
    });
    app.get('/api/v1/ai/eval/runs/:id', async (request, reply) => {
        try {
            const user = request.user;
            const data = await getRun(user.orgId, request.params.id);
            if (!data)
                return reply.status(404).send({ error: 'Lượt kiểm định không tồn tại' });
            return data;
        }
        catch (err) {
            app.log.error({ err }, '[ai-eval] get run failed');
            return sendError(reply, err, 'Không tải được lượt kiểm định');
        }
    });
}
//# sourceMappingURL=ai-eval-routes.js.map