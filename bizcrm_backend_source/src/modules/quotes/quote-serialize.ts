/**
 * quote-serialize.ts — chuyển Decimal → number trước khi trả JSON.
 *
 * ⚠️ Prisma Decimal serialize thành STRING trong JSON → frontend làm `a + b`
 * sẽ nối chuỗi. Mọi field tiền BẮT BUỘC đi qua đây.
 * Theo đúng pattern của product-service.ts.
 *
 * `toPublicQuote` là allowlist cho route công khai — KHÔNG trả field nội bộ
 * (internalNotes, createdById, assignedUserId, orgId…).
 */
import type { Prisma } from '@prisma/client'
import { moneyToWords, formatMoney } from './money-to-words.js'

type Dec = Prisma.Decimal | number | null | undefined

export const toNum = (d: Dec): number => (d != null ? Number(d) : 0)
export const toNumOrNull = (d: Dec): number | null => (d != null ? Number(d) : null)

/** Row Prisma (lỏng kiểu vì include khác nhau tuỳ query). */
type AnyRow = Record<string, any>

export function serializeQuoteLine(l: AnyRow): AnyRow {
  return {
    ...l,
    quantity: toNum(l.quantity),
    unitPrice: toNum(l.unitPrice),
    discountPercent: toNum(l.discountPercent),
    amount: toNum(l.amount),
  }
}

/** Bản đầy đủ cho người dùng đã đăng nhập trong org. */
export function serializeQuote(q: AnyRow): AnyRow {
  const total = toNum(q.total)
  return {
    ...q,
    subtotal: toNum(q.subtotal),
    discountValue: toNum(q.discountValue),
    discountAmount: toNum(q.discountAmount),
    taxRate: toNum(q.taxRate),
    taxAmount: toNum(q.taxAmount),
    total,
    totalInWords: moneyToWords(total),
    totalFormatted: formatMoney(total),
    lines: Array.isArray(q.lines) ? q.lines.map(serializeQuoteLine) : undefined,
  }
}

export function serializeQuoteTemplate(t: AnyRow): AnyRow {
  return { ...t, defaultTaxRate: toNum(t.defaultTaxRate) }
}

/**
 * ALLOWLIST cho route public `/api/public/quotes/:token`.
 * Chỉ liệt kê field an toàn — thêm field mới vào Quote KHÔNG tự động lộ ra đây.
 */
export function toPublicQuote(q: AnyRow): AnyRow {
  const total = toNum(q.total)
  const snap = (q.templateSnapshot ?? {}) as Record<string, unknown>

  return {
    number: q.number,
    type: q.type,
    status: q.status,
    title: q.title,
    currency: q.currency,

    subtotal: toNum(q.subtotal),
    discountAmount: toNum(q.discountAmount),
    taxRate: toNum(q.taxRate),
    taxAmount: toNum(q.taxAmount),
    total,
    totalInWords: moneyToWords(total),

    notes: q.notes, // ghi chú CÔNG KHAI (internalNotes không bao giờ ra đây)
    validUntil: q.validUntil,
    sentAt: q.sentAt,
    respondedAt: q.respondedAt,
    createdAt: q.createdAt,

    lines: Array.isArray(q.lines)
      ? q.lines.map((l: AnyRow) => ({
          name: l.name,
          description: l.description,
          quantity: toNum(l.quantity),
          unit: l.unit,
          unitPrice: toNum(l.unitPrice),
          discountPercent: toNum(l.discountPercent),
          amount: toNum(l.amount),
          sortOrder: l.sortOrder,
        }))
      : [],

    // Bên mua — chỉ tên hiển thị, KHÔNG lộ id/điện thoại/email/tag
    buyer: q.contact
      ? {
          name: q.contact.crmName || q.contact.fullName || '',
          companyName: q.company?.name ?? null,
          taxCode: q.company?.taxCode ?? null,
        }
      : null,

    // Bên bán — lấy từ snapshot đã đóng băng lúc gửi
    seller: {
      name: snap.sellerName ?? null,
      taxCode: snap.sellerTaxCode ?? null,
      address: snap.sellerAddress ?? null,
      phone: snap.sellerPhone ?? null,
      email: snap.sellerEmail ?? null,
      logoUrl: snap.logoUrl ?? null,
      bankInfo: snap.bankInfo ?? null,
      signerName: snap.signerName ?? null,
      signerTitle: snap.signerTitle ?? null,
      termsText: snap.termsText ?? null,
      footerNote: snap.footerNote ?? null,
      accentColor: snap.accentColor ?? null,
    },
  }
}
