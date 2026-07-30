/**
 * web-chat-routes.ts — REST for the in-CRM web "test chat" (owner/admin).
 *
 * POST /api/v1/web-chat/messages       → deliver a visitor message into the real
 *                                         AI pipeline (creates conv on first send)
 * GET  /api/v1/web-chat/conversations  → list web/test conversations for the org
 *
 * Message history + AI-mode changes reuse the existing conversation routes
 * (GET /conversations/:id/messages, PATCH /conversations/:id/ai-mode).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { deliverWebVisitorMessage, getOrCreateWebChannel } from './web-chat-service.js'

function ownerAdminOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  const user = request.user as { role: string }
  if (!['owner', 'admin'].includes(user.role)) {
    reply.status(403).send({ error: 'Chỉ owner/admin được dùng web chat' })
    return false
  }
  return true
}

export async function webChatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // Send a visitor (customer) message into the real pipeline.
  app.post<{
    Body: { conversationId?: string; text?: string; visitorName?: string; aiMode?: string }
  }>('/api/v1/web-chat/messages', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string; id: string }
    const { conversationId, text, visitorName, aiMode } = request.body ?? {}
    if (!text?.trim()) return reply.status(400).send({ error: 'text là bắt buộc' })
    try {
      const res = await deliverWebVisitorMessage({
        orgId: user.orgId,
        ownerUserId: user.id,
        conversationId,
        text: text.trim(),
        visitorName,
        aiMode,
      })
      return reply.status(201).send(res)
    } catch (err: any) {
      app.log.error({ err }, '[web-chat] send failed')
      return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Lỗi gửi tin web' })
    }
  })

  // List web/test conversations for the org.
  app.get('/api/v1/web-chat/conversations', async (request, reply) => {
    if (!ownerAdminOnly(request, reply)) return
    const user = request.user as { orgId: string; id: string }
    try {
      const channelId = await getOrCreateWebChannel(user.orgId, user.id)
      const conversations = await prisma.conversation.findMany({
        where: { orgId: user.orgId, channelAccountId: channelId },
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
        select: {
          id: true, displayName: true, aiMode: true, lastMessageAt: true,
          _count: { select: { messages: true } },
        },
      })
      return { conversations }
    } catch (err) {
      app.log.error({ err }, '[web-chat] list conversations failed')
      return reply.status(500).send({ error: (err as Error).message })
    }
  })
}
