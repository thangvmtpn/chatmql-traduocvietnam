import { SenderType } from '../../shared/constants.js'
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import dayjs from 'dayjs'

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // GET /api/v1/dashboard/kpi
  app.get('/api/v1/dashboard/kpi', async (request) => {
    const user = request.user as { orgId: string }
    const today = dayjs().startOf('day').toDate()
    const weekAgo = dayjs().subtract(7, 'day').toDate()

    const [totalContacts, newContactsThisWeek, appointmentsToday, messagesUnreplied, messagesToday, unreadConversations] = await Promise.all([
      prisma.contact.count({ where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null } }),
      prisma.contact.count({ where: { orgId: user.orgId, createdAt: { gte: weekAgo }, mergedInto: null, isGroup: false, deletedAt: null } }),
      prisma.appointment.count({ where: { orgId: user.orgId, appointmentDate: { gte: today, lte: dayjs().endOf('day').toDate() } } }),
      prisma.conversation.count({ where: { orgId: user.orgId, isReplied: false } }),
      prisma.message.count({ where: { conversation: { orgId: user.orgId }, sentAt: { gte: today } } }),
      prisma.conversation.count({ where: { orgId: user.orgId, unreadCount: { gt: 0 } } }),
    ])

    return {
      messagesToday,
      messagesUnreplied,
      messagesUnread: unreadConversations,
      appointmentsToday,
      newContactsThisWeek,
      totalContacts,
    }
  })

  // GET /api/v1/dashboard/pipeline — count contacts per lifecycle stage.
  // Returns { status, _count } shape for back-compat with frontend that
  // expects the old `status` key — `status` is now the lifecycle stage.
  app.get('/api/v1/dashboard/pipeline', async (request) => {
    const user = request.user as { orgId: string }
    const grouped = await prisma.contact.groupBy({
      by: ['lifecycleStage'],
      where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null },
      _count: { _all: true },
    })
    return grouped.map(g => ({ status: g.lifecycleStage, lifecycleStage: g.lifecycleStage, _count: g._count }))
  })

  // GET /api/v1/dashboard/sources
  app.get('/api/v1/dashboard/sources', async (request) => {
    const user = request.user as { orgId: string }
    const grouped = await prisma.contact.groupBy({
      by: ['source'],
      where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null },
      _count: { _all: true },
    })
    return grouped.map(g => ({ source: g.source ?? 'Không rõ', _count: g._count }))
  })

  // GET /api/v1/dashboard/message-volume — last 7 days
  app.get('/api/v1/dashboard/message-volume', async (request) => {
    const user = request.user as { orgId: string }
    const days: { date: string; sent: number; received: number }[] = []

    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day')
      const start = d.startOf('day').toDate()
      const end = d.endOf('day').toDate()

      const [sent, received] = await Promise.all([
        prisma.message.count({
          where: {
            conversation: { orgId: user.orgId },
            senderType: SenderType.SELF,
            sentAt: { gte: start, lte: end },
          },
        }),
        prisma.message.count({
          where: {
            conversation: { orgId: user.orgId },
            senderType: SenderType.CONTACT,
            sentAt: { gte: start, lte: end },
          },
        }),
      ])

      days.push({ date: d.format('YYYY-MM-DD'), sent, received })
    }

    return { data: days }
  })
}
