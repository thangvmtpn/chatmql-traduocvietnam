/**
 * kb-routes.ts — Fastify plugin: KnowledgeEntry CRUD + approval, ContactMemory edit.
 * ACL: KB write = owner/admin. Memory edit = any authenticated member.
 * Registration: caller (app.ts via orchestrator) calls app.register(kbRoutes).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import {
  listKbEntries,
  getKbEntry,
  getKbEntryVersions,
  createKbEntry,
  updateKbEntry,
  deleteKbEntry,
  approveEntry,
  rejectEntry,
  revertEntry,
} from './kb-service.js'
import {
  listContactMemory,
  getMemoryFact,
  updateMemoryFact,
  deleteMemoryFact,
} from './memory-service.js'
import {
  listKnowledgeCategories,
  createKnowledgeCategory,
  updateKnowledgeCategory,
  deleteKnowledgeCategory,
  seedDefaultKnowledgeCategories,
} from './knowledge-category-service.js'
import { backfillEmbeddings } from './embedding-service.js'

function isKbAdmin(role: string): boolean {
  return ['owner', 'admin'].includes(role)
}

function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ success: false, error: { code: 'ERROR', message } })
}

export default async function kbRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ── KnowledgeEntry CRUD ──────────────────────────────────────────────────────

  app.get('/api/v1/knowledge', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const qs = request.query as { status?: string; categoryId?: string; productId?: string; type?: string; format?: string }
      const entries = await listKbEntries(user.orgId, {
        status: qs.status, categoryId: qs.categoryId, productId: qs.productId, type: qs.type, format: qs.format,
      })
      return { success: true, data: entries }
    } catch (err: any) {
      app.log.error({ err }, '[kb] list failed')
      return sendError(reply, 500, 'Failed to list knowledge entries')
    }
  })

  app.get<{ Params: { id: string } }>('/api/v1/knowledge/:id', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const entry = await getKbEntry(user.orgId, request.params.id)
      if (!entry) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: entry }
    } catch (err: any) {
      app.log.error({ err }, '[kb] get failed')
      return sendError(reply, 500, 'Failed to get knowledge entry')
    }
  })

  app.get<{ Params: { id: string } }>('/api/v1/knowledge/:id/versions', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const versions = await getKbEntryVersions(user.orgId, request.params.id)
      if (!versions) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: versions }
    } catch (err: any) {
      app.log.error({ err }, '[kb] versions failed')
      return sendError(reply, 500, 'Failed to get versions')
    }
  })

  app.post<{
    Body: {
      type: string
      title?: string | null
      content: string
      risk: string
      source?: string
      confidence?: number
      categoryId?: string | null
      productId?: string | null
      format?: string
      keywords?: string | null
    }
  }>('/api/v1/knowledge', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string; id: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can create KB entries')

      const { type, title, content, risk, source, confidence, categoryId, productId, format, keywords } = request.body
      if (!type || !content || !risk) {
        return sendError(reply, 400, 'type, content, risk are required')
      }
      // FAQ entries use `title` as the question — required. Articles have no title.
      if ((type === 'faq' || format === 'qa') && !title?.trim()) {
        return sendError(reply, 400, 'Câu hỏi (title) is required for FAQ entries')
      }
      const entry = await createKbEntry(
        user.orgId,
        { type, title, content, risk, source: source ?? 'staff_manual', confidence, categoryId, productId, format, keywords },
        user.id,
      )
      return reply.status(201).send({ success: true, data: entry })
    } catch (err: any) {
      app.log.error({ err }, '[kb] create failed')
      return sendError(reply, 500, 'Failed to create knowledge entry')
    }
  })

  app.put<{
    Params: { id: string }
    Body: {
      type?: string
      title?: string
      content?: string
      risk?: string
      confidence?: number
      changeNote?: string
      categoryId?: string | null
      productId?: string | null
      format?: string
      keywords?: string | null
    }
  }>('/api/v1/knowledge/:id', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string; id: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can update KB entries')

      const updated = await updateKbEntry(user.orgId, request.params.id, request.body, user.id)
      if (!updated) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: updated }
    } catch (err: any) {
      app.log.error({ err }, '[kb] update failed')
      return sendError(reply, 500, 'Failed to update knowledge entry')
    }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/knowledge/:id', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can delete KB entries')

      const deleted = await deleteKbEntry(user.orgId, request.params.id)
      if (!deleted) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: { deleted: true } }
    } catch (err: any) {
      app.log.error({ err }, '[kb] delete failed')
      return sendError(reply, 500, 'Failed to delete knowledge entry')
    }
  })

  // ── Approval actions ──────────────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/api/v1/knowledge/:id/approve', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string; id: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can approve entries')

      const entry = await approveEntry(user.orgId, request.params.id, user.id)
      if (!entry) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: entry }
    } catch (err: any) {
      app.log.error({ err }, '[kb] approve failed')
      return sendError(reply, 500, 'Failed to approve entry')
    }
  })

  app.post<{ Params: { id: string } }>('/api/v1/knowledge/:id/reject', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string; id: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can reject entries')

      const entry = await rejectEntry(user.orgId, request.params.id, user.id)
      if (!entry) return sendError(reply, 404, 'Knowledge entry not found')
      return { success: true, data: entry }
    } catch (err: any) {
      app.log.error({ err }, '[kb] reject failed')
      return sendError(reply, 500, 'Failed to reject entry')
    }
  })

  app.post<{
    Params: { id: string }
    Body: { version: number }
  }>('/api/v1/knowledge/:id/revert', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string; id: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can revert entries')

      const { version } = request.body
      if (!version || !Number.isInteger(version)) {
        return sendError(reply, 400, 'version (integer) is required')
      }
      const entry = await revertEntry(user.orgId, request.params.id, version, user.id)
      if (!entry) return sendError(reply, 404, 'Knowledge entry or version not found')
      return { success: true, data: entry }
    } catch (err: any) {
      app.log.error({ err }, '[kb] revert failed')
      return sendError(reply, 500, 'Failed to revert entry')
    }
  })

  // ── Embeddings backfill (owner/admin) ─────────────────────────────────────────
  // Body: { force?: boolean }. force=true re-embeds ALL active entries so old ones
  // pick up keywords/edits made before keywords counted; default fills only NULLs.
  app.post<{ Body: { force?: boolean } }>('/api/v1/knowledge/embeddings/backfill', async (request, reply) => {
    try {
      const user = request.user as { orgId: string; role: string }
      if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can backfill embeddings')
      const result = await backfillEmbeddings(user.orgId, { force: request.body?.force === true })
      return { success: true, data: result }
    } catch (err: any) {
      app.log.error({ err }, '[kb] backfill failed')
      return sendError(reply, 500, 'Failed to backfill embeddings')
    }
  })

  // ── ContactMemory (any authenticated member) ──────────────────────────────────

  app.get<{ Params: { id: string } }>('/api/v1/contacts/:id/memory', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const facts = await listContactMemory(user.orgId, request.params.id)
      return { success: true, data: facts }
    } catch (err: any) {
      app.log.error({ err }, '[memory] list failed')
      return sendError(reply, 500, 'Failed to list contact memory')
    }
  })

  app.put<{
    Params: { id: string }
    Querystring: { factId: string }
    Body: { content?: string; kind?: string; isActive?: boolean }
  }>('/api/v1/contacts/:id/memory', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const { factId } = request.query
      if (!factId) return sendError(reply, 400, 'factId query param required')

      const updated = await updateMemoryFact(user.orgId, factId, request.body)
      if (!updated) return sendError(reply, 404, 'Memory fact not found')
      return { success: true, data: updated }
    } catch (err: any) {
      app.log.error({ err }, '[memory] update failed')
      return sendError(reply, 500, 'Failed to update memory fact')
    }
  })

  app.delete<{
    Params: { id: string }
    Querystring: { factId: string }
  }>('/api/v1/contacts/:id/memory', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      const { factId } = request.query
      if (!factId) return sendError(reply, 400, 'factId query param required')

      const deleted = await deleteMemoryFact(user.orgId, factId)
      if (!deleted) return sendError(reply, 404, 'Memory fact not found')
      return { success: true, data: { deleted: true } }
    } catch (err: any) {
      app.log.error({ err }, '[memory] delete failed')
      return sendError(reply, 500, 'Failed to delete memory fact')
    }
  })

  // ── Knowledge Categories (sales/consulting taxonomy) ──────────────────────────
  app.get('/api/v1/knowledge-categories', async (request, reply) => {
    try {
      const user = request.user as { orgId: string }
      return { success: true, data: await listKnowledgeCategories(user.orgId) }
    } catch (err: any) {
      app.log.error({ err }, '[kb-cat] list failed')
      return sendError(reply, 500, 'Failed to list knowledge categories')
    }
  })

  app.post('/api/v1/knowledge-categories', async (request, reply) => {
    const user = request.user as { orgId: string; role: string }
    if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can manage categories')
    const body = (request.body ?? {}) as any
    if (!body.name) return sendError(reply, 400, 'name is required')
    try {
      const cat = await createKnowledgeCategory(user.orgId, body)
      return reply.status(201).send({ success: true, data: cat })
    } catch (err: any) { return sendError(reply, err.statusCode ?? 500, err.message ?? 'Failed') }
  })

  app.post('/api/v1/knowledge-categories/seed', async (request, reply) => {
    const user = request.user as { orgId: string; role: string }
    if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can seed categories')
    const created = await seedDefaultKnowledgeCategories(user.orgId)
    return { success: true, data: { created } }
  })

  app.patch<{ Params: { id: string } }>('/api/v1/knowledge-categories/:id', async (request, reply) => {
    const user = request.user as { orgId: string; role: string }
    if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can manage categories')
    try {
      const cat = await updateKnowledgeCategory(user.orgId, request.params.id, (request.body ?? {}) as any)
      if (!cat) return sendError(reply, 404, 'Category not found')
      return { success: true, data: cat }
    } catch (err: any) { return sendError(reply, err.statusCode ?? 500, err.message ?? 'Failed') }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/knowledge-categories/:id', async (request, reply) => {
    const user = request.user as { orgId: string; role: string }
    if (!isKbAdmin(user.role)) return sendError(reply, 403, 'Only owner/admin can manage categories')
    const ok = await deleteKnowledgeCategory(user.orgId, request.params.id)
    if (!ok) return sendError(reply, 404, 'Category not found')
    return { success: true, data: { deleted: true } }
  })
}
