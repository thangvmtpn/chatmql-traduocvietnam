/**
 * quote-types.ts — hằng số + kiểu dùng chung cho module báo giá.
 * Theo convention repo: dùng String + union type, KHÔNG dùng Prisma enum.
 */
import type { DiscountType } from './quote-calc.js';
export declare const QUOTE_STATUSES: readonly ["draft", "sent", "viewed", "accepted", "rejected", "expired", "canceled"];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export declare const QUOTE_TYPES: readonly ["quote", "contract"];
export type QuoteType = (typeof QUOTE_TYPES)[number];
export declare function statusLabelVi(status: string): string;
export declare const SEND_CHANNELS: readonly ["zalo", "zalo_oa", "facebook", "link"];
export type SendChannel = (typeof SEND_CHANNELS)[number];
/** Trạng thái coi là "đã chốt" — không cho sửa/xoá nữa. */
export declare const LOCKED_STATUSES: readonly QuoteStatus[];
/** Trạng thái đã gửi khách — sửa phải qua revise. */
export declare const SENT_STATUSES: readonly QuoteStatus[];
/**
 * Trần chiết khấu theo vai trò (%). Tránh nhân viên tự ý giảm giá sâu.
 * owner/admin không giới hạn.
 */
export declare const DISCOUNT_CEILING_BY_ROLE: Record<string, number>;
export declare function discountCeilingFor(role: string): number;
/** Ai được tạo/sửa báo giá. Theo pattern canManage của repo. */
export declare function canManageQuotes(role: string): boolean;
/** Ai được xem báo giá của người khác. member chỉ xem của mình. */
export declare function canViewAllQuotes(role: string): boolean;
/** Ai được xoá (soft delete). */
export declare function canDeleteQuotes(role: string): boolean;
export interface QuoteLineInput {
    productId?: string | null;
    name: string;
    description?: string | null;
    quantity: number;
    unit?: string;
    unitPrice: number;
    discountPercent?: number;
}
export interface CreateQuoteInput {
    contactId: string;
    companyId?: string | null;
    type?: QuoteType;
    title?: string | null;
    templateId?: string | null;
    lines: QuoteLineInput[];
    discountType?: DiscountType;
    discountValue?: number;
    taxRate?: number;
    notes?: string | null;
    internalNotes?: string | null;
    validUntil?: string | Date | null;
    assignedUserId?: string | null;
    source?: string;
}
export type UpdateQuoteInput = Partial<Omit<CreateQuoteInput, 'contactId'>>;
export interface QuoteFilters {
    status?: string;
    type?: string;
    contactId?: string;
    companyId?: string;
    assignedUserId?: string;
    search?: string;
    from?: string;
    to?: string;
}
