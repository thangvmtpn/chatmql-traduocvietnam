/**
 * quote-types.ts — hằng số + kiểu dùng chung cho module báo giá.
 * Theo convention repo: dùng String + union type, KHÔNG dùng Prisma enum.
 */
import type { DiscountType } from './quote-calc.js'

export const QUOTE_STATUSES = [
  'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'canceled',
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const QUOTE_TYPES = ['quote', 'contract'] as const
export type QuoteType = (typeof QUOTE_TYPES)[number]

/** Nhãn tiếng Việt — dùng cho CSV và thông báo. Đồng bộ với frontend lib/quote-status.ts */
const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp', sent: 'Đã gửi', viewed: 'Khách đã xem', accepted: 'Đã chấp nhận',
  rejected: 'Từ chối', expired: 'Hết hiệu lực', canceled: 'Đã huỷ',
}
export function statusLabelVi(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export const SEND_CHANNELS = ['zalo', 'zalo_oa', 'facebook', 'link'] as const
export type SendChannel = (typeof SEND_CHANNELS)[number]

/** Trạng thái coi là "đã chốt" — không cho sửa/xoá nữa. */
export const LOCKED_STATUSES: readonly QuoteStatus[] = ['accepted']
/** Trạng thái đã gửi khách — sửa phải qua revise. */
export const SENT_STATUSES: readonly QuoteStatus[] = ['sent', 'viewed', 'accepted', 'rejected', 'expired']

/**
 * Trần chiết khấu theo vai trò (%). Tránh nhân viên tự ý giảm giá sâu.
 * owner/admin không giới hạn.
 */
export const DISCOUNT_CEILING_BY_ROLE: Record<string, number> = {
  owner: 100,
  admin: 100,
  manager: 20,
  member: 10,
}

export function discountCeilingFor(role: string): number {
  return DISCOUNT_CEILING_BY_ROLE[role] ?? 10
}

/** Ai được tạo/sửa báo giá. Theo pattern canManage của repo. */
export function canManageQuotes(role: string): boolean {
  return ['owner', 'admin', 'manager', 'member'].includes(role)
}

/** Ai được xem báo giá của người khác. member chỉ xem của mình. */
export function canViewAllQuotes(role: string): boolean {
  return ['owner', 'admin', 'manager'].includes(role)
}

/** Ai được xoá (soft delete). */
export function canDeleteQuotes(role: string): boolean {
  return ['owner', 'admin', 'manager'].includes(role)
}

export interface QuoteLineInput {
  productId?: string | null
  name: string
  description?: string | null
  quantity: number
  unit?: string
  unitPrice: number
  discountPercent?: number
}

export interface CreateQuoteInput {
  contactId: string
  companyId?: string | null
  type?: QuoteType
  title?: string | null
  templateId?: string | null
  lines: QuoteLineInput[]
  discountType?: DiscountType
  discountValue?: number
  taxRate?: number
  notes?: string | null
  internalNotes?: string | null
  validUntil?: string | Date | null
  assignedUserId?: string | null
  source?: string
}

export type UpdateQuoteInput = Partial<Omit<CreateQuoteInput, 'contactId'>>

export interface QuoteFilters {
  status?: string
  type?: string
  contactId?: string
  companyId?: string
  assignedUserId?: string
  search?: string
  from?: string
  to?: string
}
