import { authMiddleware } from '../auth/auth-middleware.js';
import { listScenarios, getScenario, createScenario, updateScenario, deleteScenario, getScenarioVersions, backfillScenarioEmbeddings, } from './scenario-service.js';
function ownerAdminOnly(request, reply) {
    const user = request.user;
    if (!['owner', 'admin'].includes(user.role)) {
        reply.status(403).send({ error: 'Chỉ owner/admin được sửa kịch bản AI' });
        return false;
    }
    return true;
}
function validateInput(body) {
    if (!body.name?.trim())
        return 'name là bắt buộc';
    if (!body.description?.trim())
        return 'description là bắt buộc';
    if (!body.content?.trim())
        return 'content là bắt buộc';
    if (body.loadMode && !['always', 'auto'].includes(body.loadMode))
        return "loadMode phải là 'always' hoặc 'auto'";
    return null;
}
export async function scenarioRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // List (meta only — the "overview pass": names + descriptions, no content)
    app.get('/api/v1/ai/scenarios', async (request) => {
        const user = request.user;
        const q = request.query;
        const scenarios = await listScenarios(user.orgId, { enabledOnly: q.enabledOnly === 'true' });
        return { scenarios };
    });
    // Get one (full content + version history)
    app.get('/api/v1/ai/scenarios/:id', async (request, reply) => {
        const user = request.user;
        const scenario = await getScenario(user.orgId, request.params.id);
        if (!scenario)
            return reply.status(404).send({ error: 'Không tìm thấy kịch bản' });
        const versions = await getScenarioVersions(user.orgId, request.params.id);
        return { scenario, versions: versions ?? [] };
    });
    // Create
    app.post('/api/v1/ai/scenarios', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        const err = validateInput(request.body ?? {});
        if (err)
            return reply.status(400).send({ error: err });
        try {
            const scenario = await createScenario(user.orgId, request.body, user.id);
            return reply.status(201).send({ scenario });
        }
        catch (e) {
            app.log.error({ e }, '[scenario] create failed');
            return reply.status(500).send({ error: e.message });
        }
    });
    // Update
    app.put('/api/v1/ai/scenarios/:id', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        const b = request.body ?? {};
        if (b.loadMode && !['always', 'auto'].includes(b.loadMode)) {
            return reply.status(400).send({ error: "loadMode phải là 'always' hoặc 'auto'" });
        }
        const scenario = await updateScenario(user.orgId, request.params.id, b, user.id);
        if (!scenario)
            return reply.status(404).send({ error: 'Không tìm thấy kịch bản' });
        return { scenario };
    });
    // Delete
    app.delete('/api/v1/ai/scenarios/:id', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        const ok = await deleteScenario(user.orgId, request.params.id);
        if (!ok)
            return reply.status(404).send({ error: 'Không tìm thấy kịch bản' });
        return { deleted: true };
    });
    // Backfill embeddings (idempotent)
    app.post('/api/v1/ai/scenarios/embeddings/backfill', async (request, reply) => {
        if (!ownerAdminOnly(request, reply))
            return;
        const user = request.user;
        const result = await backfillScenarioEmbeddings(user.orgId);
        return result;
    });
}
//# sourceMappingURL=scenario-routes.js.map