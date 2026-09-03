export const QUOTE_STATUSES = [
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'canceled',
];
export const QUOTE_TYPES = ['quote', 'contract'];
/** Nhãn tiếng Việt — dùng cho CSV và thông báo. Đồng bộ với frontend lib/quote-status.ts */
const STATUS_LABELS = {
    draft: 'Nháp', sent: 'Đã gửi', viewed: 'Khách đã xem', accepted: 'Đã chấp nhận',
    rejected: 'Từ chối', expired: 'Hết hiệu lực', canceled: 'Đã huỷ',
};
export function statusLabelVi(status) {
    return STATUS_LABELS[status] ?? status;
}
export const SEND_CHANNELS = ['zalo', 'zalo_oa', 'facebook', 'link'];
/** Trạng thái coi là "đã chốt" — không cho sửa/xoá nữa. */
export const LOCKED_STATUSES = ['accepted'];
/** Trạng thái đã gửi khách — sửa phải qua revise. */
export const SENT_STATUSES = ['sent', 'viewed', 'accepted', 'rejected', 'expired'];
/**
 * Trần chiết khấu theo vai trò (%). Tránh nhân viên tự ý giảm giá sâu.
 * owner/admin không giới hạn.
 */
export const DISCOUNT_CEILING_BY_ROLE = {
    owner: 100,
    admin: 100,
    manager: 20,
    member: 10,
};
export function discountCeilingFor(role) {
    return DISCOUNT_CEILING_BY_ROLE[role] ?? 10;
}
/** Ai được tạo/sửa báo giá. Theo pattern canManage của repo. */
export function canManageQuotes(role) {
    return ['owner', 'admin', 'manager', 'member'].includes(role);
}
/** Ai được xem báo giá của người khác. member chỉ xem của mình. */
export function canViewAllQuotes(role) {
    return ['owner', 'admin', 'manager'].includes(role);
}
/** Ai được xoá (soft delete). */
export function canDeleteQuotes(role) {
    return ['owner', 'admin', 'manager'].includes(role);
}
//# sourceMappingURL=quote-types.js.map