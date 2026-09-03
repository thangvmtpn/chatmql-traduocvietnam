/**
 * quote-status.ts — luật chuyển trạng thái báo giá. PURE, không đụng DB.
 *
 * draft ──► sent ──► viewed ──► accepted
 *   │        │         │    └──► rejected
 *   │        │         └───────► expired
 *   └──► canceled ◄── (từ mọi trạng thái TRỪ accepted)
 */
import type { QuoteStatus } from './quote-types.js';
export declare function canTransition(from: QuoteStatus, to: QuoteStatus): boolean;
export declare function assertTransition(from: QuoteStatus, to: QuoteStatus): void;
/** Chỉ bản nháp mới được sửa dòng hàng/giá. Đã gửi → phải revise ra bản mới. */
export declare function isEditable(status: QuoteStatus): boolean;
/** Đã chốt thì không xoá/huỷ được nữa (chứng từ tài chính). */
export declare function isLocked(status: QuoteStatus): boolean;
/** Khách còn phản hồi được không (dùng ở route public). */
export declare function canRespond(status: QuoteStatus): boolean;
/** Lỗi nghiệp vụ → route map sang HTTP 409, không phải 500. */
export declare class QuoteStateError extends Error {
    readonly code = "INVALID_STATE";
    constructor(message: string);
}
