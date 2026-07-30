/**
 * group-routes.ts — REST API for Zalo group management.
 * Ported from ZaloCRM reference: group info, CRUD, membership management.
 * All routes: /api/v1/zalo-accounts/:id/groups
 */
import type { FastifyInstance } from 'fastify'
import { getPoolEntry } from './zalo-pool.js'
import { requireZaloAccess } from './zalo-access-middleware.js'
import { checkLimits, recordAction } from './zalo-rate-limiter.js'

const BASE = '/api/v1/zalo-accounts/:id/groups'

function getApi(id: string) {
  const entry = getPoolEntry(id)
  if (!entry?.api || entry.status !== 'connected') return null
  return entry.api
}

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request) => { await request.jwtVerify() })

  // ── Group Info ──────────────────────────────────────────────────────────



  // GET .../groups/:groupId — get group info
  app.get<{ Params: { id: string; groupId: string } }>(
    `${BASE}/:groupId`,
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const { id, groupId } = request.params
      const api = getApi(id)
      if (!api) return reply.status(503).send({ error: 'Zalo account not connected' })
      try {
        const group = await api.getGroupInfo(groupId)
        return { group }
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || 'Failed to get group info' })
      }
    },
  )

  // ── Group CRUD ──────────────────────────────────────────────────────────

  // POST .../groups — create group { name, memberIds }
  app.post<{ Params: { id: string }; Body: { name: string; memberIds: string[] } }>(
    BASE,
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const { id } = request.params
      const { name, memberIds } = request.body ?? {}
      if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
        return reply.status(400).send({ error: 'name and memberIds are required' })
      }

      const rateCheck = checkLimits(id, 'chat_action')
      if (!rateCheck.allowed) return reply.status(429).send({ error: rateCheck.reason })

      const api = getApi(id)
      if (!api) return reply.status(503).send({ error: 'Zalo account not connected' })
      try {
        const group = await api.createGroup({ name, members: memberIds })
        recordAction(id, 'chat_action')
        return reply.status(201).send({ group })
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || 'Failed to create group' })
      }
    },
  )

  // ── Membership ──────────────────────────────────────────────────────────

  // POST .../groups/:groupId/members — add members { userIds }
  app.post<{ Params: { id: string; groupId: string }; Body: { userIds: string[] } }>(
    `${BASE}/:groupId/members`,
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const { id, groupId } = request.params
      const { userIds } = request.body ?? {}
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return reply.status(400).send({ error: 'userIds array is required' })
      }

      const rateCheck = checkLimits(id, 'chat_action')
      if (!rateCheck.allowed) return reply.status(429).send({ error: rateCheck.reason })

      const api = getApi(id)
      if (!api) return reply.status(503).send({ error: 'Zalo account not connected' })
      try {
        const result = await api.addUserToGroup(userIds, groupId)
        recordAction(id, 'chat_action')
        return { result }
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || 'Failed to add members' })
      }
    },
  )

  // DELETE .../groups/:groupId/members — remove members { userIds }
  app.delete<{ Params: { id: string; groupId: string }; Body: { userIds: string[] } }>(
    `${BASE}/:groupId/members`,
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const { id, groupId } = request.params
      const { userIds } = request.body ?? {}
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return reply.status(400).send({ error: 'userIds array is required' })
      }

      const api = getApi(id)
      if (!api) return reply.status(503).send({ error: 'Zalo account not connected' })
      try {
        const result = await api.removeUserFromGroup(userIds, groupId)
        return { result }
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || 'Failed to remove members' })
      }
    },
  )
}
