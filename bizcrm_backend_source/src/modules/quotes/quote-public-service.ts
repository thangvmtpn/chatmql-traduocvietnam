/**
 * quote-public-service.ts — luồng KHÁCH HÀNG xem báo giá qua link công khai.
 *
 * ⚠️ Không có JWT ở đây. Xác thực = `publicToken` (24 byte random).
 * Mọi thứ trả ra PHẢI đi qua `toPublicQuote` (allowlist) — tuyệt đối không
 * trả thẳng object Prisma.
 */
import { prisma } from '../../shared/prisma-client.js'
import { emitDomainEvent } from '../../shared/domain-events.js'
import { toPublicQuote } from './quote-serialize.js'
import { canRespond } from './quote-status.js'
import type { QuoteStatus } from './quote-types.js'

/** Cùng IP xem lại trong 30 phút thì không tính là lượt xem mới. */
const VIEW_DEDUP_MS = 30 * 60 * 1000

/** Org bị suspend hoặc hết hạn license → ngừng phục vụ trang khách. */
export function isOrgActive(org: { status: string; expiresAt: Date | null } | null | undefined): boolean {
  if (!org) return false
  if (org.status !== 'active') return false
  if (org.expiresAt != null && org.expiresAt.getTime() < Date.now()) return false
  return true
}

export type PublicQuoteOutcome =
  | { kind: 'ok'; quote: ReturnType<typeof toPublicQuote>; canRespond: boolean }
  | { kind: 'not_found' }
  | { kind: 'gone'; reason: 'canceled' }
  | { kind: 'expired'; quote: { number: string; validUntil: Date | null } }

const PUBLIC_SELECT = {
  id: true, orgId: true, number: true, type: true, status: true, title: true,
  org: { select: { status: true, expiresAt: true } },
  currency: true, subtotal: true, discountAmount: true, taxRate: true, taxAmount: true,
  total: true, notes: true, validUntil: true, sentAt: true, respondedAt: true,
  createdAt: true, templateSnapshot: true, lastViewedAt: true, firstViewedAt: true,
  contact: { select: { fullName: true, crmName: true } },
  company: { select: { name: true, taxCode: true } },
  lines: {
    select: {
      name: true, description: true, quantity: true, unit: true,
      unitPrice: true, discountPercent: true, amount: true, sortOrder: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const

/**
 * Lấy báo giá theo token + ghi nhận lượt xem.
 * @param meta ip/userAgent để ghi nhật ký (chống giả mạo phản hồi)
 */
export async function getPublicQuote(
  token: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<PublicQuoteOutcome> {
  if (!token || token.length < 20 || token.length > 100) return { kind: 'not_found' }

  // KHÔNG lọc deletedAt ở đây: khách đã cầm link hợp lệ, báo "đã thu hồi" dễ
  // hiểu hơn nhiều so với 404 (khách tưởng link hỏng rồi gọi điện hỏi).
  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    select: { ...PUBLIC_SELECT, deletedAt: true },
  })
  if (!quote) return { kind: 'not_found' }

  // Org bị khoá / hết hạn → không phục vụ trang khách nữa
  if (!isOrgActive(quote.org)) return { kind: 'not_found' }

  // Đã thu hồi hoặc huỷ → báo rõ, không hiện giá
  if (quote.deletedAt != null || quote.status === 'canceled') return { kind: 'gone', reason: 'canceled' }
  // Bản nháp chưa từng gửi → coi như không tồn tại
  if (quote.status === 'draft') return { kind: 'not_found' }

  // Hết hạn → KHÔNG hiện giá
  const isExpired = quote.status === 'expired'
    || (quote.validUntil != null && quote.validUntil.getTime() < Date.now()
        && (quote.status === 'sent' || quote.status === 'viewed'))
  if (isExpired) {
    if (quote.status !== 'expired') {
      await prisma.quote.update({ where: { id: quote.id }, data: { status: 'expired' } }).catch(() => {})
    }
    return { kind: 'expired', quote: { number: quote.number, validUntil: quote.validUntil } }
  }

  await trackView(quote, meta)

  return {
    kind: 'ok',
    quote: toPublicQuote(quote),
    canRespond: canRespond(quote.status as QuoteStatus),
  }
}

/** Ghi lượt xem (chống đếm ảo) + chuyển sent → viewed. Không bao giờ làm hỏng request. */
async function trackView(
  quote: { id: string; orgId: string; status: string; lastViewedAt: Date | null; firstViewedAt: Date | null },
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  const recentlyViewed = quote.lastViewedAt != null
    && Date.now() - quote.lastViewedAt.getTime() < VIEW_DEDUP_MS
  if (recentlyViewed) return

  const now = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: now,
          ...(quote.firstViewedAt == null ? { firstViewedAt: now } : {}),
          ...(quote.status === 'sent' ? { status: 'viewed' } : {}),
        },
      })
      await tx.quoteEvent.create({
        data: {
          quoteId: quote.id, orgId: quote.orgId, type: 'viewed', actorType: 'contact',
          meta: { ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
        },
      })
    })
    emitDomainEvent({ type: 'quote.viewed', orgId: quote.orgId, id: quote.id })
  } catch {
    // Đếm view không phải việc sống còn — im lặng bỏ qua
  }
}

export type RespondOutcome =
  | { kind: 'ok'; status: 'accepted' | 'rejected' }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }

/** Khách bấm Đồng ý / Từ chối trên trang public. Chỉ cho phản hồi 1 lần. */
export async function respondToPublicQuote(
  token: string,
  action: 'accept' | 'reject',
  meta: { ip?: string; userAgent?: string; reason?: string } = {},
): Promise<RespondOutcome> {
  if (!token || token.length < 20 || token.length > 100) return { kind: 'not_found' }

  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    select: {
      id: true, orgId: true, status: true, validUntil: true, respondedAt: true, deletedAt: true,
      org: { select: { status: true, expiresAt: true } },
    },
  })
  if (!quote) return { kind: 'not_found' }
  if (!isOrgActive(quote.org)) return { kind: 'not_found' }

  // Tab cũ vẫn mở rồi bấm Đồng ý sau khi sale thu hồi — báo rõ thay vì 404
  if (quote.deletedAt != null) return { kind: 'conflict', message: 'Báo giá này đã được thu hồi' }
  if (quote.respondedAt != null) return { kind: 'conflict', message: 'Báo giá này đã được phản hồi trước đó' }
  if (!canRespond(quote.status as QuoteStatus)) {
    return { kind: 'conflict', message: 'Báo giá không còn ở trạng thái có thể phản hồi' }
  }
  if (quote.validUntil != null && quote.validUntil.getTime() < Date.now()) {
    return { kind: 'conflict', message: 'Báo giá đã hết hiệu lực' }
  }

  const status = action === 'accept' ? 'accepted' : 'rejected'

  // updateMany + điều kiện respondedAt: null → chống double-submit (2 tab bấm cùng lúc)
  const res = await prisma.quote.updateMany({
    where: { id: quote.id, respondedAt: null, status: { in: ['sent', 'viewed'] } },
    data: {
      status,
      respondedAt: new Date(),
      rejectReason: action === 'reject' ? (meta.reason?.slice(0, 500) ?? null) : null,
    },
  })
  if (res.count === 0) return { kind: 'conflict', message: 'Báo giá này đã được phản hồi trước đó' }

  await prisma.quoteEvent.create({
    data: {
      quoteId: quote.id, orgId: quote.orgId, type: status, actorType: 'contact',
      meta: {
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        reason: meta.reason?.slice(0, 500) ?? null,
      },
    },
  }).catch(() => {})

  emitDomainEvent({ type: action === 'accept' ? 'quote.accepted' : 'quote.rejected', orgId: quote.orgId, id: quote.id })
  return { kind: 'ok', status }
}
