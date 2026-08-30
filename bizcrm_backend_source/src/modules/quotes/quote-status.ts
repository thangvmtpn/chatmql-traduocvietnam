/**
 * quote-status.ts — luật chuyển trạng thái báo giá. PURE, không đụng DB.
 *
 * draft ──► sent ──► viewed ──► accepted
 *   │        │         │    └──► rejected
 *   │        │         └───────► expired
 *   └──► canceled ◄── (từ mọi trạng thái TRỪ accepted)
 */
import type { QuoteStatus } from './quote-types.js'

const ALLOWED: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent', 'canceled'],
  sent: ['viewed', 'accepted', 'rejected', 'expired', 'canceled'],
  viewed: ['accepted', 'rejected', 'expired', 'canceled'],
  accepted: [], // đã chốt — bất biến
  rejected: ['canceled'],
  expired: ['canceled'],
  canceled: [],
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new QuoteStateError(`Không thể chuyển báo giá từ "${from}" sang "${to}"`)
  }
}

/** Chỉ bản nháp mới được sửa dòng hàng/giá. Đã gửi → phải revise ra bản mới. */
export function isEditable(status: QuoteStatus): boolean {
  return status === 'draft'
}

/** Đã chốt thì không xoá/huỷ được nữa (chứng từ tài chính). */
export function isLocked(status: QuoteStatus): boolean {
  return status === 'accepted'
}

/** Khách còn phản hồi được không (dùng ở route public). */
export function canRespond(status: QuoteStatus): boolean {
  return status === 'sent' || status === 'viewed'
}

/** Lỗi nghiệp vụ → route map sang HTTP 409, không phải 500. */
export class QuoteStateError extends Error {
  readonly code = 'INVALID_STATE'
  constructor(message: string) {
    super(message)
    this.name = 'QuoteStateError'
  }
}
