/**
 * quote-analytics-service.ts — số liệu báo cáo cho Báo giá & Hợp đồng.
 *
 * ⚠️ MULTI-TENANT: orgId luôn là tham số đầu và luôn có trong mọi mệnh đề
 * where / WHERE của raw SQL.
 *
 * Mốc thời gian dùng `createdAt` cho phễu (báo giá tạo trong kỳ) nhưng
 * `respondedAt` cho doanh thu (tiền ghi nhận lúc chốt, không phải lúc tạo).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma-client.js'
import {
  buildFunnel, winRate, avgDaysToClose, rankUsers, fillPeriods,
  type StatusCounts, type UserRow,
} from './quote-analytics-calc.js'

const EMPTY: StatusCounts = {
  draft: 0, sent: 0, viewed: 0, accepted: 0, rejected: 0, expired: 0, canceled: 0,
}

export interface QuoteAnalytics {
  kpi: {
    totalCreated: number
    totalSent: number
    winRate: number
    wonValue: number
    /** Giá trị đang chờ khách trả lời — dự báo dòng tiền */
    pipelineValue: number
    avgDealSize: number
    avgDaysToClose: number | null
  }
  funnel: ReturnType<typeof buildFunnel>
  trend: Array<{ period: string; count: number; value: number }>
  byUser: ReturnType<typeof rankUsers>
  topProducts: Array<{ name: string; quantity: number; value: number; quotes: number }>
  rejectionReasons: Array<{ reason: string; count: number }>
}

export async function getQuoteAnalytics(
  orgId: string,
  from: Date,
  to: Date,
): Promise<QuoteAnalytics> {
  // +1 ngày để bao trọn ngày cuối
  const toExcl = new Date(to)
  toExcl.setDate(toExcl.getDate() + 1)

  const inPeriod: Prisma.QuoteWhereInput = {
    orgId,
    deletedAt: null,
    createdAt: { gte: from, lt: toExcl },
  }

  const [statusGroups, closedRows, userGroups, users, lineRows, reasonRows, trendRows, pipelineAgg] =
    await Promise.all([
      // Đếm theo trạng thái
      prisma.quote.groupBy({ by: ['status'], where: inPeriod, _count: { _all: true } }),

      // Cặp mốc thời gian để tính thời gian chốt trung bình
      prisma.quote.findMany({
        where: { ...inPeriod, status: 'accepted' },
        select: { sentAt: true, respondedAt: true },
        take: 2000,
      }),

      // Theo sale — đếm trạng thái
      prisma.quote.groupBy({
        by: ['assignedUserId', 'status'],
        where: inPeriod,
        _count: { _all: true },
        _sum: { total: true },
      }),

      prisma.user.findMany({ where: { orgId }, select: { id: true, fullName: true } }),

      // Sản phẩm bán chạy — chỉ tính trên báo giá ĐÃ CHỐT
      prisma.$queryRaw<Array<{ name: string; quantity: string; value: string; quotes: bigint }>>`
        SELECT ql.name,
               SUM(ql.quantity)::text AS quantity,
               SUM(ql.amount)::text   AS value,
               COUNT(DISTINCT ql.quote_id) AS quotes
        FROM quote_lines ql
        JOIN quotes q ON q.id = ql.quote_id
        WHERE q.org_id = ${orgId}
          AND q.deleted_at IS NULL
          AND q.status = 'accepted'
          AND q.created_at >= ${from} AND q.created_at < ${toExcl}
        GROUP BY ql.name
        ORDER BY SUM(ql.amount) DESC
        LIMIT 10
      `,

      // Lý do từ chối hay gặp
      prisma.$queryRaw<Array<{ reason: string; count: bigint }>>`
        SELECT COALESCE(NULLIF(TRIM(reject_reason), ''), '(không ghi lý do)') AS reason,
               COUNT(*) AS count
        FROM quotes
        WHERE org_id = ${orgId}
          AND deleted_at IS NULL
          AND status = 'rejected'
          AND created_at >= ${from} AND created_at < ${toExcl}
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `,

      // Doanh thu theo NGÀY CHỐT (không phải ngày tạo)
      prisma.$queryRaw<Array<{ period: string; count: bigint; value: string }>>`
        SELECT TO_CHAR(responded_at, 'YYYY-MM-DD') AS period,
               COUNT(*) AS count,
               SUM(total)::text AS value
        FROM quotes
        WHERE org_id = ${orgId}
          AND deleted_at IS NULL
          AND status = 'accepted'
          AND responded_at >= ${from} AND responded_at < ${toExcl}
        GROUP BY 1
        ORDER BY 1
      `,

      // Giá trị đang chờ khách trả lời
      prisma.quote.aggregate({
        where: { orgId, deletedAt: null, status: { in: ['sent', 'viewed'] } },
        _sum: { total: true },
      }),
    ])

  const counts: StatusCounts = { ...EMPTY }
  for (const g of statusGroups) {
    if (g.status in counts) counts[g.status as keyof StatusCounts] = g._count._all
  }

  const wonValue = userGroups
    .filter((g) => g.status === 'accepted')
    .reduce((sum, g) => sum + Number(g._sum.total ?? 0), 0)

  const userName = new Map(users.map((u) => [u.id, u.fullName]))
  const byUserMap = new Map<string, UserRow>()
  for (const g of userGroups) {
    const key = g.assignedUserId ?? '—'
    const row = byUserMap.get(key) ?? {
      userId: g.assignedUserId,
      userName: g.assignedUserId ? (userName.get(g.assignedUserId) ?? 'Không rõ') : 'Chưa gán',
      sent: 0, accepted: 0, rejected: 0, expired: 0, wonValue: 0,
    }
    const n = g._count._all
    if (g.status !== 'draft' && g.status !== 'canceled') row.sent += n
    if (g.status === 'accepted') { row.accepted += n; row.wonValue += Number(g._sum.total ?? 0) }
    if (g.status === 'rejected') row.rejected += n
    if (g.status === 'expired') row.expired += n
    byUserMap.set(key, row)
  }

  const funnel = buildFunnel(counts)

  return {
    kpi: {
      totalCreated: funnel[0].count,
      totalSent: funnel[1].count,
      winRate: winRate(counts),
      wonValue,
      pipelineValue: Number(pipelineAgg._sum.total ?? 0),
      avgDealSize: counts.accepted > 0 ? Math.round(wonValue / counts.accepted) : 0,
      avgDaysToClose: avgDaysToClose(closedRows),
    },
    funnel,
    trend: fillPeriods(
      trendRows.map((r) => ({ period: r.period, count: Number(r.count), value: Number(r.value) })),
      from, to,
    ),
    byUser: rankUsers([...byUserMap.values()]),
    topProducts: lineRows.map((r) => ({
      name: r.name,
      quantity: Number(r.quantity),
      value: Number(r.value),
      quotes: Number(r.quotes),
    })),
    rejectionReasons: reasonRows.map((r) => ({ reason: r.reason, count: Number(r.count) })),
  }
}
