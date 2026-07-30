/**
 * note-routes.ts — CRUD API for internal notes
 * Scoped to orgId via authMiddleware.
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { runAutomationRules } from '../automation/automation-engine.js'
import { logger } from '../../shared/logger.js'

export async function noteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // GET /api/v1/notes — list notes by contactId or conversationId
  app.get<{
    Querystring: { contactId?: string; conversationId?: string }
  }>('/api/v1/notes', async (request) => {
    const user = request.user as { orgId: string }
    const { contactId, conversationId } = request.query

    const where: any = { orgId: user.orgId }
    if (contactId) where.contactId = contactId
    if (conversationId) where.conversationId = conversationId

    const notes = await prisma.note.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    })

    return { notes, total: notes.length }
  })

  // POST /api/v1/notes — create note
  app.post<{
    Body: { contactId?: string; conversationId?: string; content: string; isPinned?: boolean }
  }>('/api/v1/notes', async (request, reply) => {
    const user = request.user as { id: string; orgId: string }
    const { contactId, conversationId, content, isPinned } = request.body

    if (!content?.trim()) {
      return reply.status(400).send({ error: 'Nội dung ghi chú không được để trống' })
    }

    const note = await prisma.note.create({
      data: {
        orgId: user.orgId,
        contactId: contactId || null,
        conversationId: conversationId || null,
        createdByUserId: user.id,
        content: content.trim(),
        isPinned: isPinned ?? false,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    })

    // Fire automation trigger for note creation
    if (contactId) {
      runAutomationRules('note_added', {
        orgId: user.orgId,
        contactId,
        triggerData: { content: content.trim().slice(0, 200) },
      }).catch(err => logger.error({ err }, '[automation] note_added trigger failed'))
    }

    return note
  })

  // PUT /api/v1/notes/:id — update note
  app.put<{
    Params: { id: string }
    Body: Partial<{ content: string; isPinned: boolean }>
  }>('/api/v1/notes/:id', async (request, reply) => {
    const user = request.user as { orgId: string }
    const existing = await prisma.note.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    })
    if (!existing) return reply.status(404).send({ error: 'Note not found' })

    const data: any = {}
    if (request.body.content !== undefined) {
      if (typeof request.body.content !== 'string') {
        return reply.status(400).send({ error: 'content must be a string' })
      }
      data.content = request.body.content.trim()
    }
    if (request.body.isPinned !== undefined) data.isPinned = request.body.isPinned

    const updated = await prisma.note.update({
      where: { id: request.params.id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    })

    return updated
  })

  // DELETE /api/v1/notes/:id — delete note
  app.delete<{ Params: { id: string } }>('/api/v1/notes/:id', async (request, reply) => {
    const user = request.user as { orgId: string }
    const existing = await prisma.note.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    })
    if (!existing) return reply.status(404).send({ error: 'Note not found' })

    await prisma.note.delete({ where: { id: request.params.id } })
    return { ok: true }
  })

  // PATCH /api/v1/notes/:id/pin — toggle pin
  app.patch<{ Params: { id: string } }>('/api/v1/notes/:id/pin', async (request, reply) => {
    const user = request.user as { orgId: string }
    const existing = await prisma.note.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    })
    if (!existing) return reply.status(404).send({ error: 'Note not found' })

    const updated = await prisma.note.update({
      where: { id: request.params.id },
      data: { isPinned: !existing.isPinned },
      include: {
        createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    })

    return updated
  })
}
