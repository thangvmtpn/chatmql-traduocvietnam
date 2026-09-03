const ALLOWED = {
    draft: ['sent', 'canceled'],
    sent: ['viewed', 'accepted', 'rejected', 'expired', 'canceled'],
    viewed: ['accepted', 'rejected', 'expired', 'canceled'],
    accepted: [], // đã chốt — bất biến
    rejected: ['canceled'],
    expired: ['canceled'],
    canceled: [],
};
export function canTransition(from, to) {
    return ALLOWED[from]?.includes(to) ?? false;
}
export function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new QuoteStateError(`Không thể chuyển báo giá từ "${from}" sang "${to}"`);
    }
}
/** Chỉ bản nháp mới được sửa dòng hàng/giá. Đã gửi → phải revise ra bản mới. */
export function isEditable(status) {
    return status === 'draft';
}
/** Đã chốt thì không xoá/huỷ được nữa (chứng từ tài chính). */
export function isLocked(status) {
    return status === 'accepted';
}
/** Khách còn phản hồi được không (dùng ở route public). */
export function canRespond(status) {
    return status === 'sent' || status === 'viewed';
}
/** Lỗi nghiệp vụ → route map sang HTTP 409, không phải 500. */
export class QuoteStateError extends Error {
    code = 'INVALID_STATE';
    constructor(message) {
        super(message);
        this.name = 'QuoteStateError';
    }
}
//# sourceMappingURL=quote-status.js.map