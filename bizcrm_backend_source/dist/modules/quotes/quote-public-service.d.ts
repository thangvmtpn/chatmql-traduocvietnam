import { toPublicQuote } from './quote-serialize.js';
/** Org bị suspend hoặc hết hạn license → ngừng phục vụ trang khách. */
export declare function isOrgActive(org: {
    status: string;
    expiresAt: Date | null;
} | null | undefined): boolean;
export type PublicQuoteOutcome = {
    kind: 'ok';
    quote: ReturnType<typeof toPublicQuote>;
    canRespond: boolean;
} | {
    kind: 'not_found';
} | {
    kind: 'gone';
    reason: 'canceled';
} | {
    kind: 'expired';
    quote: {
        number: string;
        validUntil: Date | null;
    };
};
/**
 * Lấy báo giá theo token + ghi nhận lượt xem.
 * @param meta ip/userAgent để ghi nhật ký (chống giả mạo phản hồi)
 */
export declare function getPublicQuote(token: string, meta?: {
    ip?: string;
    userAgent?: string;
}): Promise<PublicQuoteOutcome>;
export type RespondOutcome = {
    kind: 'ok';
    status: 'accepted' | 'rejected';
} | {
    kind: 'not_found';
} | {
    kind: 'conflict';
    message: string;
};
/** Khách bấm Đồng ý / Từ chối trên trang public. Chỉ cho phản hồi 1 lần. */
export declare function respondToPublicQuote(token: string, action: 'accept' | 'reject', meta?: {
    ip?: string;
    userAgent?: string;
    reason?: string;
}): Promise<RespondOutcome>;
