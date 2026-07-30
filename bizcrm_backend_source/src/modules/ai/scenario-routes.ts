/**
 * scenario-routes.ts — CRUD for modular logic SCENARIOS (skills).
 * Reads: any authenticated user. Writes: owner/admin only.
 * Endpoints under /api/v1/ai/scenarios.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import {
  listScenarios, getScenario, createScenario, updateScenario, deleteScenario,
  getScenarioVersions, backfillScenarioEmbeddings, type ScenarioInput,
} from './scenario-service.js'

function ownerAdminOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = request.user as { role: string }
  if (!['owner', 'admin'].includes(user.role)) {
    reply.status(403).send({ error: 'Chỉ owner/admin được sửa kịch bản AI' })
    return false
  }
  return true
}

function validateInput(body: Partial<ScenarioInput>): string | null {
  if (!body.name?.trim()) return 'name là bắt buộc'
  if (!body.description?.trim()) return 'description là bắt buộc'
  if (!body.content?.trim()) return 'content là bắt buộc'
  if (body.loadMode && !['always', 'auto'].includes(body.loadMode)) return "loadMode phải là 'always' hoặc 'auto'"
  return null
}

export async function scenarioRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // List (meta only — the "overview pass": names + descriptions, no content)
  app.get('/api/v1/ai/scenarios', async (request) => {
    const user = request.user as { orgId: string }
    const q = request.query as { enabledOnly?: string }
    const scenarios = await listScenarios(user.orgId, { enabledOnly: q.enabledOnly === 'true' })
    return { scenarios }
  })

  // Get one (full content + version history)
  app.get<{ Params: { id: string } }>('/api/v1/ai/scenarios/:id', async (request, reply) => {
    const user = request.user as { orgId: string }
    const scenario = await getScenario(user.orgId, request.params.id)
    if (!scenario) return reply.status(404).send({ error: 'Không tìm thấy kịch bản' })
    const versions = await getScenarioVersions(user.orgId, request.params.id)
    return { scenario, versions: versions ?? [] }
  })

  // Create
  app.post<{ Body: ScenarioInput }>('/api/v1/ai/scenarios', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string; id: string }
    const err = validateInput(request.body ?? {})
    if (err) return reply.status(400).send({ error: err })
    try {
      const scenario = await createScenario(user.orgId, request.body, user.id)
      return reply.status(201).send({ scenario })
    } catch (e) {
      app.log.error({ e }, '[scenario] create failed')
      return reply.status(500).send({ error: (e as Error).message })
    }
  })

  // Update
  app.put<{ Params: { id: string }; Body: Partial<ScenarioInput> & { changeNote?: string } }>(
    '/api/v1/ai/scenarios/:id',
    async (request, reply) => {
      if (!ownerAdminOnly(request, reply)) return
      const user = request.user as { orgId: string; id: string }
      const b = request.body ?? {}
      if (b.loadMode && !['always', 'auto'].includes(b.loadMode)) {
        return reply.status(400).send({ error: "loadMode phải là 'always' hoặc 'auto'" })
      }
      const scenario = await updateScenario(user.orgId, request.params.id, b, user.id)
      if (!scenario) return reply.status(404).send({ error: 'Không tìm thấy kịch bản' })
      return { scenario }
    },
  )

  // Delete
  app.delete<{ Params: { id: string } }>('/api/v1/ai/scenarios/:id', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string }
    const ok = await deleteScenario(user.orgId, request.params.id)
    if (!ok) return reply.status(404).send({ error: 'Không tìm thấy kịch bản' })
    return { deleted: true }
  })

  // Backfill embeddings (idempotent)
  app.post('/api/v1/ai/scenarios/embeddings/backfill', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string }
    const result = await backfillScenarioEmbeddings(user.orgId)
    return result
  })
}
