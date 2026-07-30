/**
 * trace-routes.ts — Debug API for AiTrace inspection.
 *
 * ACL: owner/admin only (payload may contain internal prompts).
 *
 * Endpoints:
 *   GET /api/v1/ai/trace?conversationId=<id>  — list trace steps for a conversation
 *   GET /api/v1/ai/trace?runId=<id>           — list trace steps for a specific run
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../../auth/auth-middleware.js'
import { prisma } from '../../../shared/prisma-client.js'

const PAGE_SIZE = 100 // max rows per request

function ownerAdminOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = request.user as { role: string }
  if (!['owner', 'admin'].includes(user.role)) {
    reply.status(403).send({ error: 'Chỉ owner/admin được xem trace AI' })
    return false
  }
  return true
}

export async function traceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  app.get<{
    Querystring: { conversationId?: string; runId?: string; cursor?: string }
  }>('/api/v1/ai/trace', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return

    const user = request.user as { orgId: string }
    const { conversationId, runId, cursor } = request.query

    if (!conversationId && !runId) {
      return reply.status(400).send({ error: 'conversationId or runId is required' })
    }

    try {
      const where: Record<string, unknown> = { orgId: user.orgId }
      if (conversationId) where['conversationId'] = conversationId
      if (runId) where['aiReplyRunId'] = runId
      if (cursor) {
        const cursorDate = new Date(cursor)
        if (isNaN(cursorDate.getTime())) {
          return reply.status(400).send({ error: 'invalid cursor' })
        }
        where['createdAt'] = { lt: cursorDate }
      }

      const rows = await prisma.aiTrace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        select: {
          id: true,
          conversationId: true,
          aiReplyRunId: true,
          step: true,
          level: true,
          payload: true,
          latencyMs: true,
          createdAt: true,
          expiresAt: true,
        },
      })

      const nextCursor = rows.length === PAGE_SIZE
        ? rows[rows.length - 1].createdAt.toISOString()
        : null

      return { traces: rows, nextCursor }
    } catch (err) {
      app.log.error({ err }, '[trace] fetch failed')
      return reply.status(500).send({ error: 'Failed to fetch traces' })
    }
  })

  /**
   * GET /api/v1/ai/reply-runs?conversationId=&limit=
   * Recent AI reply runs (the per-turn summary) for the org — optionally by conversation.
   */
  app.get<{
    Querystring: { conversationId?: string; limit?: string }
  }>('/api/v1/ai/reply-runs', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string }
    const { conversationId, limit } = request.query
    const take = Math.min(Math.max(parseInt(limit || '50', 10) || 50, 1), 100)

    try {
      const runs = await prisma.aiReplyRun.findMany({
        where: { orgId: user.orgId, ...(conversationId ? { conversationId } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          conversationId: true,
          mode: true,
          status: true,
          handoff: true,
          confidence: true,
          latencyMs: true,
          createdAt: true,
        },
      })
      return { runs }
    } catch (err) {
      app.log.error({ err }, '[trace] reply-runs fetch failed')
      return reply.status(500).send({ error: 'Failed to fetch reply runs' })
    }
  })
}
