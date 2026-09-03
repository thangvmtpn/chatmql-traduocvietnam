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
import type { Prisma } from '@prisma/client';
type Dec = Prisma.Decimal | number | null | undefined;
export declare const toNum: (d: Dec) => number;
export declare const toNumOrNull: (d: Dec) => number | null;
/** Row Prisma (lỏng kiểu vì include khác nhau tuỳ query). */
type AnyRow = Record<string, any>;
export declare function serializeQuoteLine(l: AnyRow): AnyRow;
/** Bản đầy đủ cho người dùng đã đăng nhập trong org. */
export declare function serializeQuote(q: AnyRow): AnyRow;
export declare function serializeQuoteTemplate(t: AnyRow): AnyRow;
/**
 * ALLOWLIST cho route public `/api/public/quotes/:token`.
 * Chỉ liệt kê field an toàn — thêm field mới vào Quote KHÔNG tự động lộ ra đây.
 */
export declare function toPublicQuote(q: AnyRow): AnyRow;
export {};
