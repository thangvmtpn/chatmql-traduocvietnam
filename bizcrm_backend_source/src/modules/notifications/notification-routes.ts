/**
 * notification-routes.ts — REST API for in-app notifications.
 * Lists, marks as read, and marks all as read.
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ── List notifications ───────────────────────────────────────────
  app.get<{
    Querystring: { limit?: string }
  }>('/api/v1/notifications', async (request) => {
    const user = request.user as { id: string; orgId: string }
    const limit = Math.min(parseInt(String(request.query.limit || '20')), 50)

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, orgId: user.orgId, isRead: false },
    })

    return { notifications, unreadCount }
  })

  // ── Mark single notification as read ─────────────────────────────
  app.patch<{
    Params: { id: string }
  }>('/api/v1/notifications/:id/read', async (request, reply) => {
    const user = request.user as { id: string; orgId: string }
    const notif = await prisma.notification.findFirst({
      where: { id: request.params.id, userId: user.id },
    })
    if (!notif) return reply.status(404).send({ error: 'Notification not found' })

    await prisma.notification.update({
      where: { id: request.params.id },
      data: { isRead: true },
    })
    return { success: true }
  })

  // ── Mark all as read ─────────────────────────────────────────────
  app.post('/api/v1/notifications/read-all', async (request) => {
    const user = request.user as { id: string; orgId: string }
    await prisma.notification.updateMany({
      where: { userId: user.id, orgId: user.orgId, isRead: false },
      data: { isRead: true },
    })
    return { success: true }
  })
}
