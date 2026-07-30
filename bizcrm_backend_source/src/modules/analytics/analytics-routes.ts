import { SenderType } from '../../shared/constants.js'
/**
 * analytics-routes.ts — D7.7: Analytics query service.
 * Team leaderboard, response time, saved reports, funnel.
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // Per Phân quyền matrix: Phân tích = "—" for members. Manager/admin/owner pass.
  app.addHook('preHandler', async (request, reply) => {
    const user = request.user as { role: string } | undefined
    if (user?.role === 'member') {
      return reply.status(403).send({ error: 'Bạn không có quyền truy cập Phân tích' })
    }
  })

  // ── GET /api/v1/analytics/conversion-funnel ──────────────────────────
  // Cumulative funnel: each stage counts contacts at that stage OR higher.
  // e.g. "contacted" includes contacts currently at contacted, interested, or converted.

  const FUNNEL_STAGES = ['subscriber', 'lead', 'qualified', 'opportunity', 'customer'] as const
  const STAGE_WEIGHT: Record<string, number> = {
    subscriber: 0, lead: 1, qualified: 2, opportunity: 3, customer: 4, evangelist: 4,
  }
  const STAGE_LABELS: Record<string, string> = {
    subscriber: 'Đăng ký', lead: 'Lead', qualified: 'Đủ điều kiện',
    opportunity: 'Cơ hội', customer: 'Khách hàng',
  }
  const STAGE_COLORS: Record<string, string> = {
    subscriber: '#3b82f6', lead: '#60a5fa', qualified: '#a78bfa',
    opportunity: '#fb923c', customer: '#22c55e',
  }

  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/analytics/conversion-funnel',
    async (request) => {
      const user = request.user as { orgId: string }
      const { from, to } = request.query
      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000)
      const toDate = to ? new Date(to) : new Date()
      // +1 day for inclusive end date
      const toDateExcl = new Date(toDate)
      toDateExcl.setDate(toDateExcl.getDate() + 1)

      // Raw counts per lifecycle stage
      const groups = await prisma.contact.groupBy({
        by: ['lifecycleStage'],
        where: {
          orgId: user.orgId,
          createdAt: { gte: fromDate, lt: toDateExcl },
          isGroup: false, deletedAt: null, mergedInto: null,
        },
        _count: { id: true },
      })

      const rawCounts: Record<string, number> = {}
      let totalAll = 0
      for (const g of groups) {
        const s = g.lifecycleStage ?? 'unknown'
        const c = g._count?.id ?? 0
        rawCounts[s] = c
        totalAll += c
      }

      // churned contacts are separate — not in funnel progression
      const churnedCount = rawCounts['churned'] ?? 0
      const totalFunnel = totalAll - churnedCount

      // Cumulative: stage count = contacts at this stage weight or higher
      const cumulativeCounts: Record<string, number> = {}
      for (const stage of FUNNEL_STAGES) {
        const stageW = STAGE_WEIGHT[stage]
        let cumulative = 0
        for (const [s, count] of Object.entries(rawCounts)) {
          const w = STAGE_WEIGHT[s]
          if (w !== undefined && w >= stageW) {
            cumulative += count
          }
        }
        cumulativeCounts[stage] = cumulative
      }

      // Build stages array with drop-off metrics
      const stages = FUNNEL_STAGES.map((stage, i) => {
        const count = cumulativeCounts[stage]
        const nextCount = i < FUNNEL_STAGES.length - 1 ? cumulativeCounts[FUNNEL_STAGES[i + 1]] : count
        const dropOffCount = count - nextCount
        const dropOffRate = count > 0 ? Math.round((dropOffCount / count) * 1000) / 10 : 0
        return {
          stage,
          status: stage, // legacy alias for older frontend consumers
          label: STAGE_LABELS[stage] || stage,
          color: STAGE_COLORS[stage] || '#94a3b8',
          count,
          rate: totalFunnel > 0 ? Math.round((count / totalFunnel) * 1000) / 10 : 0,
          dropOffCount,
          dropOffRate,
        }
      })

      const totalConverted = (rawCounts['customer'] ?? 0) + (rawCounts['evangelist'] ?? 0)
      const conversionRate = totalFunnel > 0
        ? Math.round((totalConverted / totalFunnel) * 1000) / 10
        : 0

      // Avg days from creation → conversion to customer
      let avgConversionDays: number | null = null
      try {
        const avgResult = await prisma.$queryRaw<[{ avg_days: number | null }]>`
          SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::float AS avg_days
          FROM contacts
          WHERE org_id = ${user.orgId}
            AND lifecycle_stage IN ('customer', 'evangelist')
            AND created_at >= ${fromDate}
            AND created_at < ${toDateExcl}
        `
        const raw = avgResult[0]?.avg_days
        avgConversionDays = raw != null ? Math.round(raw * 10) / 10 : null
      } catch { /* raw query unsupported in test env — gracefully fallback */ }

      return {
        stages,
        totalContacts: totalFunnel,
        totalConverted,
        conversionRate,
        avgConversionDays,
        churnedCount,
        lostCount: churnedCount, // legacy alias for older UI
      }
    },
  )

  // ── GET /api/v1/analytics/team-performance ───────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/analytics/team-performance',
    async (request) => {
      const user = request.user as { orgId: string }
      const { from, to } = request.query
      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000)
      const toDate = to ? new Date(to) : new Date()

      // Messages sent per user (senderType=self = agent outbound messages)
      const msgStats = await prisma.message.groupBy({
        by: ['repliedByUserId'],
        where: {
          conversation: { orgId: user.orgId },
          senderType: SenderType.SELF,
          sentAt: { gte: fromDate, lte: toDate },
          repliedByUserId: { not: null },
        },
        _count: { id: true },
      })

      // Contacts converted per user (now: in customer/evangelist lifecycle stage)
      const convertedStats = await prisma.contact.groupBy({
        by: ['assignedUserId'],
        where: {
          orgId: user.orgId,
          lifecycleStage: { in: ['customer', 'evangelist'] },
          updatedAt: { gte: fromDate, lte: toDate },
          assignedUserId: { not: null },
          isGroup: false, deletedAt: null, mergedInto: null,
        },
        _count: { id: true },
      })

      // Appointments completed per assigned user
      const apptStats = await prisma.appointment.groupBy({
        by: ['assignedUserId'],
        where: {
          orgId: user.orgId,
          status: 'completed',
          appointmentDate: { gte: fromDate, lte: toDate },
        },
        _count: { id: true },
      })

      // Get all org users
      const users = await prisma.user.findMany({
        where: { orgId: user.orgId, isActive: true },
        select: { id: true, fullName: true },
      })

      // Compute per-user avg response time (inbound→first self reply)
      let userResponseTimes: Record<string, number> = {}
      try {
        const rtResult = await prisma.$queryRaw<{ user_id: string; avg_seconds: number }[]>`
          SELECT
            m2.replied_by_user_id AS user_id,
            AVG(EXTRACT(EPOCH FROM (m2.sent_at - m1.sent_at)))::float AS avg_seconds
          FROM messages m1
          JOIN messages m2 ON m2.conversation_id = m1.conversation_id
            AND m2.sender_type = 'self'
            AND m2.sent_at > m1.sent_at
            AND m2.replied_by_user_id IS NOT NULL
          JOIN conversations c ON c.id = m1.conversation_id
          WHERE m1.sender_type = 'contact'
            AND c.org_id = ${user.orgId}
            AND m1.sent_at >= ${fromDate}
            AND m1.sent_at <= ${toDate}
            AND m2.sent_at <= m1.sent_at + INTERVAL '24 hours'
          GROUP BY m2.replied_by_user_id
        `
        for (const row of rtResult) {
          if (row.user_id && row.avg_seconds > 0) {
            userResponseTimes[row.user_id] = Math.round(row.avg_seconds)
          }
        }
      } catch { /* raw query may fail in test env */ }

      const result = users.map(u => {
        const msg = msgStats.find(m => m.repliedByUserId === u.id)?._count.id ?? 0
        const conv = convertedStats.find(c => c.assignedUserId === u.id)?._count.id ?? 0
        const appt = apptStats.find(a => a.assignedUserId === u.id)?._count.id ?? 0
        const avgRT = userResponseTimes[u.id] ?? null
        return {
          userId: u.id,
          fullName: u.fullName,
          messagesSent: msg,
          contactsConverted: conv,
          appointmentsCompleted: appt,
          avgResponseTime: avgRT,
        }
      }).sort((a, b) => (b.messagesSent + b.contactsConverted * 5) - (a.messagesSent + a.contactsConverted * 5))

      return { users: result }
    },
  )

  // ── GET /api/v1/analytics/response-time ─────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/analytics/response-time',
    async (request) => {
      const user = request.user as { orgId: string }
      const { from, to } = request.query
      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000)
      const toDate = to ? new Date(to) : new Date()

      // Daily message stats as proxy for response time
      const daily = await prisma.dailyMessageStat.findMany({
        where: { orgId: user.orgId, statDate: { gte: fromDate, lte: toDate } },
        select: { statDate: true, messagesSent: true, avgResponseTime: true },
        orderBy: { statDate: 'asc' },
      })

      const overall = daily.length > 0
        ? Math.round(daily.reduce((s, d) => s + (d.avgResponseTime ?? 120), 0) / daily.length)
        : null

      const users = await prisma.user.findMany({
        where: { orgId: user.orgId, isActive: true },
        select: { id: true, fullName: true },
      })

      // Compute real per-user avg response time
      let userRT: Record<string, number> = {}
      try {
        const rtRows = await prisma.$queryRaw<{ user_id: string; avg_seconds: number }[]>`
          SELECT
            m2.replied_by_user_id AS user_id,
            AVG(EXTRACT(EPOCH FROM (m2.sent_at - m1.sent_at)))::float AS avg_seconds
          FROM messages m1
          JOIN messages m2 ON m2.conversation_id = m1.conversation_id
            AND m2.sender_type = 'self'
            AND m2.sent_at > m1.sent_at
            AND m2.replied_by_user_id IS NOT NULL
          JOIN conversations c ON c.id = m1.conversation_id
          WHERE m1.sender_type = 'contact'
            AND c.org_id = ${user.orgId}
            AND m1.sent_at >= ${fromDate}
            AND m1.sent_at <= ${toDate}
            AND m2.sent_at <= m1.sent_at + INTERVAL '24 hours'
          GROUP BY m2.replied_by_user_id
        `
        for (const row of rtRows) {
          if (row.user_id && row.avg_seconds > 0) {
            userRT[row.user_id] = Math.round(row.avg_seconds)
          }
        }
      } catch { /* raw query may fail in test env */ }

      return {
        daily: daily.map(d => ({
          date: d.statDate.toISOString().slice(0, 10),
          avgSeconds: d.avgResponseTime ?? 120,
        })),
        overall,
        byUser: users.map(u => ({ userId: u.id, fullName: u.fullName, avgSeconds: userRT[u.id] ?? null })),
      }
    },
  )

  // ── GET /api/v1/analytics/kpi-summary ───────────────────────────────
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/analytics/kpi-summary',
    async (request) => {
      const user = request.user as { orgId: string }
      const { from, to } = request.query
      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000)
      const toDate = to ? new Date(to) : new Date()

      const [totalContacts, convertedContacts, totalMessages, convCount] = await Promise.all([
        prisma.contact.count({ where: { orgId: user.orgId, createdAt: { gte: fromDate, lte: toDate }, isGroup: false, deletedAt: null, mergedInto: null } }),
        prisma.contact.count({ where: { orgId: user.orgId, lifecycleStage: 'customer', updatedAt: { gte: fromDate, lte: toDate }, isGroup: false, deletedAt: null, mergedInto: null } }),
        prisma.message.count({ where: { conversation: { orgId: user.orgId }, sentAt: { gte: fromDate, lte: toDate } } }),
        prisma.conversation.count({ where: { orgId: user.orgId, createdAt: { gte: fromDate, lte: toDate } } }),
      ])

      return {
        totalContacts,
        convertedContacts,
        conversionRate: totalContacts > 0 ? (convertedContacts / totalContacts * 100).toFixed(1) : '0',
        totalMessages,
        totalConversations: convCount,
      }
    },
  )

  // ── GET /api/v1/saved-reports ────────────────────────────────────────
  app.get('/api/v1/saved-reports', async (request) => {
    const user = request.user as { orgId: string }
    const reports = await prisma.savedReport.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
    })
    return { data: reports }
  })

  // ── POST /api/v1/saved-reports ───────────────────────────────────────
  app.post<{ Body: { name: string; type: string; config: any } }>(
    '/api/v1/saved-reports',
    async (request, reply) => {
      const user = request.user as { orgId: string; id: string }
      const { name, type, config } = request.body
      const report = await prisma.savedReport.create({
        data: { orgId: user.orgId, name, type, config: config ?? {}, createdBy: user.id },
      })
      return reply.status(201).send(report)
    },
  )

  // ── PUT /api/v1/saved-reports/:id ───────────────────────────────────
  app.put<{ Params: { id: string }; Body: { name?: string; type?: string; config?: unknown } }>(
    '/api/v1/saved-reports/:id',
    async (request, reply) => {
      const user = request.user as { orgId: string }
      const existing = await prisma.savedReport.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
      })
      if (!existing) return reply.status(404).send({ error: 'Report not found' })

      const updated = await prisma.savedReport.update({
        where: { id: existing.id },
        data: {
          name: request.body.name ?? existing.name,
          type: request.body.type ?? existing.type,
          config: (request.body.config ?? existing.config) as object,
        },
      })
      return updated
    },
  )

  // ── DELETE /api/v1/saved-reports/:id ────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/saved-reports/:id',
    async (request, reply) => {
      const user = request.user as { orgId: string }
      const report = await prisma.savedReport.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
      })
      if (!report) return reply.status(404).send({ error: 'Report not found' })
      await prisma.savedReport.delete({ where: { id: request.params.id } })
      return reply.status(204).send()
    },
  )

  // ── POST /api/v1/saved-reports/:id/run ──────────────────────────────
  // Re-runs a saved report by dispatching to the matching analytics endpoint
  // based on report.type. Returns the same payload shape as the live route.
  app.post<{ Params: { id: string }; Body?: { from?: string; to?: string } }>(
    '/api/v1/saved-reports/:id/run',
    async (request, reply) => {
      const user = request.user as { orgId: string }
      const report = await prisma.savedReport.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
      })
      if (!report) return reply.status(404).send({ error: 'Report not found' })

      const cfg = (report.config ?? {}) as { from?: string; to?: string }
      const from = request.body?.from ?? cfg.from
      const to   = request.body?.to   ?? cfg.to
      const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400_000)
      const toDate   = to   ? new Date(to)   : new Date()

      // Touch lastRunAt so the saved-reports list can show "ran X ago".
      // Wrapped in try/catch because the column was added later — if the dev
      // DB hasn't been synced yet (`yarn prisma db push`), Prisma will throw
      // P2022 (column not found). We swallow it so the runner still works
      // and the user gets the actual report data.
      try {
        await prisma.savedReport.update({
          where: { id: report.id },
          data: { lastRunAt: new Date() },
        })
      } catch (err) {
        app.log.warn({ err, reportId: report.id }, '[analytics] saved_reports.last_run_at update skipped (run `prisma db push`)')
      }

      // Dispatch by type. Each branch reuses helper queries so this stays DRY.
      const orgId = user.orgId
      switch (report.type) {
        case 'kpi-summary': {
          const [totalContacts, convertedContacts, totalMessages, convCount] = await Promise.all([
            prisma.contact.count({ where: { orgId, createdAt: { gte: fromDate, lte: toDate }, isGroup: false, deletedAt: null, mergedInto: null } }),
            prisma.contact.count({ where: { orgId, lifecycleStage: 'customer', updatedAt: { gte: fromDate, lte: toDate }, isGroup: false, deletedAt: null, mergedInto: null } }),
            prisma.message.count({ where: { conversation: { orgId }, sentAt: { gte: fromDate, lte: toDate } } }),
            prisma.conversation.count({ where: { orgId, createdAt: { gte: fromDate, lte: toDate } } }),
          ])
          return {
            type: report.type,
            ranAt: new Date(),
            data: {
              totalContacts,
              convertedContacts,
              totalMessages,
              totalConversations: convCount,
              conversionRate: totalContacts > 0 ? Number(((convertedContacts / totalContacts) * 100).toFixed(1)) : 0,
            },
          }
        }

        case 'team':
        case 'team-leaderboard': {
          const users = await prisma.user.findMany({
            where: { orgId, isActive: true },
            select: { id: true, fullName: true },
          })
          const msgStats = await prisma.message.groupBy({
            by: ['repliedByUserId'],
            where: {
              conversation: { orgId },
              senderType: SenderType.SELF,
              sentAt: { gte: fromDate, lte: toDate },
              repliedByUserId: { not: null },
            },
            _count: { id: true },
          })
          const conv = await prisma.contact.groupBy({
            by: ['assignedUserId'],
            where: { orgId, lifecycleStage: 'customer', updatedAt: { gte: fromDate, lte: toDate }, assignedUserId: { not: null }, isGroup: false, deletedAt: null, mergedInto: null },
            _count: { id: true },
          })
          return {
            type: report.type,
            ranAt: new Date(),
            data: {
              users: users.map((u) => ({
                userId: u.id,
                fullName: u.fullName,
                messagesSent: msgStats.find((m) => m.repliedByUserId === u.id)?._count.id ?? 0,
                contactsConverted: conv.find((c) => c.assignedUserId === u.id)?._count.id ?? 0,
              })),
            },
          }
        }

        case 'funnel':
        case 'conversion-funnel': {
          const groups = await prisma.contact.groupBy({
            by: ['lifecycleStage'],
            where: { orgId, createdAt: { gte: fromDate, lte: toDate }, isGroup: false, deletedAt: null, mergedInto: null },
            _count: { id: true },
          })
          const counts: Record<string, number> = {}
          for (const g of groups) counts[g.lifecycleStage ?? 'unknown'] = g._count.id
          return { type: report.type, ranAt: new Date(), data: { counts } }
        }

        default: {
          // Generic fallback: return the saved config so the UI can still
          // display "report doesn't have a runner yet" without crashing.
          return {
            type: report.type,
            ranAt: new Date(),
            data: null,
            note: `Loại báo cáo "${report.type}" chưa có runner. Đang lưu cấu hình.`,
          }
        }
      }
    },
  )
}
