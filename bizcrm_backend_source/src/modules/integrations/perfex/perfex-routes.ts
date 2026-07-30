// HTTP API for managing the PerfexCRM integration (config, test, manual sync, status, logs).
// Self-contained in the Perfex module; registered in app.ts. Owner/admin only.

import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../auth/auth-middleware.js'
import { prisma } from '../../../shared/prisma-client.js'
import { encryptToken, decryptToken } from '../../../shared/crypto.js'
import { PERFEX_INTEGRATION_TYPE, loadPerfexIntegration, normalizeConfig } from './perfex-config.js'
import { refreshPerfexEnabledCache, getDebounceSeconds } from './perfex-enabled-cache.js'
import { schedulePerfexFlush } from './perfex-queue.js'
import { PerfexClient } from './perfex-client.js'
import { PerfexError } from './perfex-errors.js'
import type { PerfexIntegrationConfig } from './perfex-types.js'

interface AuthUser { id: string; orgId: string; role: string }
const isAdmin = (u: AuthUser) => ['owner', 'admin'].includes(u.role)

/** Strip the secret before sending config to the client. */
function maskConfig(cfg: PerfexIntegrationConfig) {
  const { authTokenEnc, ...rest } = cfg
  return { ...rest, hasToken: Boolean(authTokenEnc) }
}

export async function perfexRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // GET config (token never returned — only hasToken flag)
  app.get('/api/v1/integrations/perfex/config', async (request, reply) => {
    const user = request.user as AuthUser
    if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })
    const row = await loadPerfexIntegration(user.orgId)
    return { enabled: row?.enabled ?? false, config: maskConfig(row?.config ?? normalizeConfig({})) }
  })

  // PUT config — upsert Integration(type='perfex'); encrypt token only if a new one is sent
  app.put<{ Body: Partial<PerfexIntegrationConfig> & { enabled?: boolean; authToken?: string } }>(
    '/api/v1/integrations/perfex/config',
    async (request, reply) => {
      const user = request.user as AuthUser
      if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })

      const existing = await loadPerfexIntegration(user.orgId)
      const b = request.body
      const merged = normalizeConfig({ ...(existing?.config ?? {}), ...b })
      // Token: keep existing unless a new plaintext authToken is provided.
      merged.authTokenEnc = b.authToken ? encryptToken(b.authToken) : existing?.config.authTokenEnc ?? ''
      const enabled = b.enabled ?? existing?.enabled ?? false

      if (existing) {
        await prisma.integration.update({
          where: { id: existing.integrationId },
          data: { enabled, config: merged as object },
        })
      } else {
        await prisma.integration.create({
          data: { orgId: user.orgId, type: PERFEX_INTEGRATION_TYPE, name: 'PerfexCRM', enabled, config: merged as object },
        })
      }
      await refreshPerfexEnabledCache() // so the subscriber picks up enable/disable immediately
      return { enabled, config: maskConfig(merged) }
    },
  )

  // POST test — probe connectivity/auth. Uses body baseUrl+authToken if given, else saved config.
  app.post<{ Body: { baseUrl?: string; authToken?: string } }>(
    '/api/v1/integrations/perfex/test',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, // throttle SSRF/probing
    async (request, reply) => {
      const user = request.user as AuthUser
      if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })
      try {
        const saved = await loadPerfexIntegration(user.orgId)
        const baseUrl = request.body.baseUrl || saved?.config.baseUrl || ''
        const authToken = request.body.authToken || (saved ? safeDecrypt(saved.config.authTokenEnc) : '')
        if (!baseUrl || !authToken) return { ok: false, error: 'Thiếu baseUrl hoặc authToken' }
        const ok = await new PerfexClient({ baseUrl, authToken }).ping()
        return { ok, ...(ok ? {} : { error: 'Không xác thực được (kiểm tra token/URL)' }) }
      } catch (err) {
        // Surface only known Perfex errors; never leak raw network/DNS messages (internal hostnames).
        const msg = err instanceof PerfexError ? err.message : 'Không kết nối được tới server Perfex'
        return { ok: false, error: msg }
      }
    },
  )

  // POST sync-now — bulk-enqueue all contacts + companies for a full re-sync
  app.post('/api/v1/integrations/perfex/sync-now', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = request.user as AuthUser
    if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })
    const integration = await loadPerfexIntegration(user.orgId)
    if (!integration?.enabled) return reply.status(400).send({ error: 'PerfexCRM chưa được bật' })

    // Idempotency: don't pile on a second full re-sync while one is still draining.
    const pendingCount = await prisma.syncOutbox.count({ where: { orgId: user.orgId, status: 'pending' } })
    if (pendingCount > 0) {
      return reply.status(409).send({ error: 'Đang có đợt đồng bộ chưa hoàn tất', queued: 0 })
    }

    const [companies, contacts] = await Promise.all([
      prisma.company.findMany({ where: { orgId: user.orgId, deletedAt: null }, select: { id: true } }),
      prisma.contact.findMany({
        where: { orgId: user.orgId, deletedAt: null, mergedInto: null, isGroup: false },
        select: { id: true },
      }),
    ])
    const rows = [
      ...companies.map((c: { id: string }) => ({ orgId: user.orgId, localType: 'company', localId: c.id, op: 'upsert', status: 'pending' })),
      ...contacts.map((c: { id: string }) => ({ orgId: user.orgId, localType: 'contact', localId: c.id, op: 'upsert', status: 'pending' })),
    ]
    if (rows.length > 0) {
      await prisma.syncOutbox.createMany({ data: rows })
      await schedulePerfexFlush(user.orgId, getDebounceSeconds(user.orgId) * 1000)
    }
    return { queued: rows.length }
  })

  // GET status — outbox counts + last sync + recent failures
  app.get('/api/v1/integrations/perfex/status', async (request, reply) => {
    const user = request.user as AuthUser
    if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })
    const [grouped, integration, failures] = await Promise.all([
      prisma.syncOutbox.groupBy({ by: ['status'], where: { orgId: user.orgId }, _count: { _all: true } }),
      prisma.integration.findFirst({ where: { orgId: user.orgId, type: PERFEX_INTEGRATION_TYPE }, select: { lastSyncAt: true } }),
      prisma.syncOutbox.findMany({
        where: { orgId: user.orgId, status: 'failed' },
        orderBy: { processedAt: 'desc' },
        take: 5,
        select: { localType: true, localId: true, errorMessage: true, processedAt: true },
      }),
    ])
    const counts: Record<string, number> = {}
    for (const g of grouped) counts[g.status] = g._count._all
    return { counts, lastSyncAt: integration?.lastSyncAt ?? null, failures }
  })

  // GET logs — paginated outbox rows (newest first)
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/api/v1/integrations/perfex/logs',
    async (request, reply) => {
      const user = request.user as AuthUser
      if (!isAdmin(user)) return reply.status(403).send({ error: 'Only admin/owner can manage integrations' })
      const page = Math.max(1, parseInt(request.query.page ?? '1'))
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20')))
      const [rows, total] = await Promise.all([
        prisma.syncOutbox.findMany({
          where: { orgId: user.orgId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: { id: true, localType: true, localId: true, op: true, status: true, attempts: true, errorMessage: true, skipReason: true, createdAt: true, processedAt: true },
        }),
        prisma.syncOutbox.count({ where: { orgId: user.orgId } }),
      ])
      return { rows, total, page, limit }
    },
  )
}

function safeDecrypt(enc: string): string {
  if (!enc) return ''
  try {
    return decryptToken(enc)
  } catch {
    return ''
  }
}
