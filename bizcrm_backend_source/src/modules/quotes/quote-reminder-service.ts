/**
 * quote-reminder-service.ts — nhắc sale bám theo báo giá đã gửi.
 *
 * Hai tình huống mất đơn phổ biến nhất:
 *  1. Báo giá sắp hết hiệu lực mà khách chưa trả lời → gọi chốt trước khi mất
 *  2. Gửi vài ngày rồi mà khách chưa mở → có thể gửi nhầm kênh / trôi tin
 *
 * Job hệ thống, quét mọi org; mỗi bản ghi tự mang orgId khi tạo thông báo.
 * Dùng QuoteEvent làm cờ chống nhắc trùng — không cần thêm cột.
 */
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { formatMoney } from './money-to-words.js'

/** Nhắc khi còn <= 3 ngày là hết hiệu lực. */
const EXPIRING_WITHIN_DAYS = 3
/** Nhắc khi đã gửi >= 3 ngày mà khách chưa mở lần nào. */
const UNVIEWED_AFTER_DAYS = 3

const DAY_MS = 86_400_000

type ReminderKind = 'reminded_expiring' | 'reminded_unviewed'

interface QuoteRow {
  id: string
  orgId: string
  number: string
  total: unknown
  validUntil: Date | null
  sentAt: Date | null
  assignedUserId: string | null
  createdById: string | null
  contact: { fullName: string | null; crmName: string | null } | null
}

const SELECT = {
  id: true, orgId: true, number: true, total: true, validUntil: true, sentAt: true,
  assignedUserId: true, createdById: true,
  contact: { select: { fullName: true, crmName: true } },
} as const

/** Số ngày CÒN LẠI — làm tròn LÊN ("còn 2 ngày" khi còn 1,5 ngày). */
const daysRemaining = (now: Date, until: Date): number =>
  Math.max(1, Math.ceil((until.getTime() - now.getTime()) / DAY_MS))

/** Số ngày ĐÃ TRÔI QUA — làm tròn XUỐNG (gửi 9,2 ngày trước = "9 ngày trước"). */
const daysElapsed = (since: Date, now: Date): number =>
  Math.max(1, Math.floor((now.getTime() - since.getTime()) / DAY_MS))

/** Đã nhắc loại này cho báo giá này chưa? QuoteEvent đóng vai trò cờ. */
async function alreadyReminded(quoteId: string, kind: ReminderKind): Promise<boolean> {
  const hit = await prisma.quoteEvent.findFirst({
    where: { quoteId, type: kind },
    select: { id: true },
  })
  return hit != null
}

async function notify(quote: QuoteRow, kind: ReminderKind, title: string, body: string): Promise<boolean> {
  const target = quote.assignedUserId ?? quote.createdById
  if (!target) return false

  // Người nhận phải cùng org — chặn thông báo lạc sang org khác
  const user = await prisma.user.findFirst({
    where: { id: target, orgId: quote.orgId, isActive: true },
    select: { id: true },
  })
  if (!user) return false

  await prisma.$transaction(async (tx) => {
    await tx.notification.create({
      data: {
        orgId: quote.orgId, userId: user.id, type: 'quote',
        title, body, link: `/quotes?id=${quote.id}`,
      },
    })
    await tx.quoteEvent.create({
      data: { quoteId: quote.id, orgId: quote.orgId, type: kind, actorType: 'system' },
    })
  })
  return true
}

const customerName = (q: QuoteRow) => q.contact?.crmName || q.contact?.fullName || 'Khách hàng'

/** Báo giá sắp hết hiệu lực mà khách chưa phản hồi. */
export async function remindExpiringQuotes(now = new Date()): Promise<number> {
  const deadline = new Date(now.getTime() + EXPIRING_WITHIN_DAYS * DAY_MS)
  const rows = await prisma.quote.findMany({
    where: {
      deletedAt: null,
      status: { in: ['sent', 'viewed'] },
      validUntil: { gt: now, lte: deadline },
    },
    select: SELECT,
    take: 500,
  })

  let sent = 0
  for (const q of rows) {
    try {
      if (await alreadyReminded(q.id, 'reminded_expiring')) continue
      const days = q.validUntil ? daysRemaining(now, q.validUntil) : 1
      const ok = await notify(
        q, 'reminded_expiring',
        'Báo giá sắp hết hiệu lực',
        `${q.number} cho ${customerName(q)} (${formatMoney(Number(q.total))}đ) còn ${days} ngày — nên gọi chốt.`,
      )
      if (ok) sent++
    } catch (err) {
      logger.error({ err, quoteId: q.id }, '[quotes] nhắc sắp hết hạn thất bại')
    }
  }
  return sent
}

/** Đã gửi vài ngày mà khách chưa mở link lần nào. */
export async function remindUnviewedQuotes(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNVIEWED_AFTER_DAYS * DAY_MS)
  const rows = await prisma.quote.findMany({
    where: {
      deletedAt: null,
      status: 'sent', // 'viewed' nghĩa là khách đã mở rồi
      firstViewedAt: null,
      sentAt: { lte: cutoff },
    },
    select: SELECT,
    take: 500,
  })

  let sent = 0
  for (const q of rows) {
    try {
      if (await alreadyReminded(q.id, 'reminded_unviewed')) continue
      const ok = await notify(
        q, 'reminded_unviewed',
        'Khách chưa mở báo giá',
        // Dùng số ngày THỰC TẾ, không phải hằng ngưỡng — báo giá có thể đã
        // nằm đó 10 ngày chứ không phải đúng 3.
        `${q.number} gửi ${q.sentAt ? daysElapsed(q.sentAt, now) : UNVIEWED_AFTER_DAYS} ngày trước, ${customerName(q)} chưa mở lần nào — kiểm tra lại kênh gửi.`,
      )
      if (ok) sent++
    } catch (err) {
      logger.error({ err, quoteId: q.id }, '[quotes] nhắc chưa xem thất bại')
    }
  }
  return sent
}
