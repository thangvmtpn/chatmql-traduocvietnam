/**
 * quote-csv.ts — xuất danh sách báo giá ra CSV cho kế toán.
 * PURE: nhận mảng đã serialize, trả chuỗi CSV. Không đụng DB.
 */
import { statusLabelVi } from './quote-types.js';
const HEADERS = [
    'Số chứng từ', 'Loại', 'Trạng thái', 'Khách hàng', 'Công ty', 'Tiêu đề',
    'Tiền hàng', 'Chiết khấu', 'Thuế suất (%)', 'Tiền thuế', 'Tổng cộng',
    'Ngày tạo', 'Hiệu lực đến', 'Ngày gửi', 'Ngày phản hồi', 'Lượt xem', 'Phụ trách',
];
/**
 * Bọc 1 ô CSV.
 * ⚠️ Chặn CSV injection: ô bắt đầu bằng = + - @ sẽ bị Excel thực thi như công
 * thức. Tên khách hàng do người ngoài nhập → phải khử.
 */
function cell(value) {
    if (value == null)
        return '';
    let s = String(value);
    if (/^[=+\-@\t\r]/.test(s))
        s = `'${s}`;
    if (/["\n,;]/.test(s))
        s = `"${s.replace(/"/g, '""')}"`;
    return s;
}
const date = (v) => {
    if (!v)
        return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN');
};
export function quotesToCsv(quotes) {
    const lines = [HEADERS.join(',')];
    for (const q of quotes) {
        lines.push([
            cell(q.number),
            cell(q.type === 'contract' ? 'Hợp đồng' : 'Báo giá'),
            cell(statusLabelVi(q.status)),
            cell(q.contact?.crmName || q.contact?.fullName || ''),
            cell(q.company?.name ?? ''),
            cell(q.title ?? ''),
            cell(q.subtotal),
            cell(q.discountAmount),
            cell(q.taxRate),
            cell(q.taxAmount),
            cell(q.total),
            cell(date(q.createdAt)),
            cell(date(q.validUntil)),
            cell(date(q.sentAt)),
            cell(date(q.respondedAt)),
            cell(q.viewCount ?? 0),
            cell(q.assignedUser?.fullName ?? ''),
        ].join(','));
    }
    // BOM để Excel trên Windows đọc đúng tiếng Việt UTF-8
    return '﻿' + lines.join('\r\n');
}
//# sourceMappingURL=quote-csv.js.map