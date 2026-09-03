/**
 * quote-service.ts — CRUD + vòng đời báo giá (org-scoped).
 *
 * ⚠️ MULTI-TENANT: orgId LUÔN là tham số đầu tiên và LUÔN có trong mệnh đề where.
 * Không hàm nào ở đây được query bằng id trần.
 *
 * Bất biến nghiệp vụ:
 * - Chỉ `draft` mới sửa được dòng hàng/giá → đã gửi thì phải `reviseQuote`
 * - `accepted` không xoá/huỷ được (chứng từ tài chính)
 * - Tổng tiền LUÔN tính lại ở server, không tin số client gửi lên
 */
import { Prisma } from '@prisma/client';
import { type CreateQuoteInput, type QuoteFilters, type UpdateQuoteInput } from './quote-types.js';
export declare class QuoteNotFoundError extends Error {
    readonly code = "NOT_FOUND";
    constructor();
}
export declare class QuoteForbiddenError extends Error {
    readonly code = "FORBIDDEN";
    constructor(message: string);
}
export declare class QuoteValidationError extends Error {
    readonly code = "VALIDATION_ERROR";
    constructor(message: string);
}
export declare function listQuotes(orgId: string, user: {
    id: string;
    role: string;
}, filters?: QuoteFilters, page?: {
    page: number;
    limit: number;
}): Promise<{
    items: {
        [x: string]: any;
    }[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}>;
export declare function getQuote(orgId: string, id: string, user?: {
    id: string;
    role: string;
}): Promise<{
    [x: string]: any;
}>;
export declare function getQuoteEvents(orgId: string, id: string): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    actorId: string | null;
    type: string;
    meta: Prisma.JsonValue;
    actorType: string;
    quoteId: string;
}[]>;
export declare function createQuote(orgId: string, user: {
    id: string;
    role: string;
}, input: CreateQuoteInput): Promise<{
    [x: string]: any;
}>;
export declare function updateQuote(orgId: string, id: string, user: {
    id: string;
    role: string;
}, input: UpdateQuoteInput): Promise<{
    [x: string]: any;
}>;
export declare function softDeleteQuote(orgId: string, id: string, user: {
    id: string;
    role: string;
}): Promise<void>;
export declare function markQuoteSent(orgId: string, id: string, user: {
    id: string;
    role: string;
}, sentVia: string): Promise<{
    [x: string]: any;
}>;
/**
 * Nhân bản báo giá — tạo bản nháp MỚI, không có lineage với bản gốc.
 * Khác `reviseQuote` ở chỗ đây là chứng từ độc lập; cho phép đổi sang khách
 * khác (sale hay báo cùng một gói dịch vụ cho nhiều khách).
 */
export declare function duplicateQuote(orgId: string, id: string, user: {
    id: string;
    role: string;
}, targetContactId?: string): Promise<{
    [x: string]: any;
}>;
/** Tạo bản sửa đổi từ một báo giá đã gửi. Bản cũ giữ nguyên (bất biến). */
export declare function reviseQuote(orgId: string, id: string, user: {
    id: string;
    role: string;
}): Promise<{
    [x: string]: any;
}>;
/** Chuyển báo giá đã chấp nhận thành hợp đồng (bản mới, giữ lineage). */
export declare function convertToContract(orgId: string, id: string, user: {
    id: string;
    role: string;
}): Promise<{
    [x: string]: any;
}>;
/** Nhân viên tự ghi nhận phản hồi của khách (khách trả lời qua điện thoại/chat). */
export declare function respondByStaff(orgId: string, id: string, user: {
    id: string;
    role: string;
}, action: 'accept' | 'reject', reason?: string): Promise<{
    [x: string]: any;
}>;
/** Job: đánh dấu hết hạn các báo giá quá `validUntil`. */
export declare function expireOverdueQuotes(): Promise<number>;
