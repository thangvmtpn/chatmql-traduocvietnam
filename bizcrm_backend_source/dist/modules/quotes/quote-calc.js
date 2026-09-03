/**
 * quote-calc.ts — toàn bộ phép tính tiền của báo giá. PURE, không đụng DB.
 *
 * Thứ tự tính (chuẩn kế toán VN): chiết khấu dòng → subtotal → chiết khấu tổng
 * → THUẾ TÍNH SAU CHIẾT KHẤU → total.
 *
 * Frontend dùng chung công thức này để hiện realtime; backend luôn tính lại
 * khi ghi DB (không tin số client gửi lên).
 */
/** Làm tròn 2 số lẻ, tránh lỗi dấu phẩy động (0.1+0.2). */
export function round2(n) {
    if (!Number.isFinite(n))
        return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function clampPercent(n) {
    if (n == null || !Number.isFinite(n))
        return 0;
    return Math.min(100, Math.max(0, n));
}
function nonNegative(n) {
    if (n == null || !Number.isFinite(n))
        return 0;
    return Math.max(0, n);
}
/** Thành tiền 1 dòng = SL × đơn giá × (1 − chiết khấu dòng %). */
export function calcLineAmount(quantity, unitPrice, discountPercent = 0) {
    const qty = nonNegative(quantity);
    const price = nonNegative(unitPrice);
    const disc = clampPercent(discountPercent);
    return round2(qty * price * (1 - disc / 100));
}
/**
 * Tổng hợp toàn bộ báo giá.
 * - discountAmount không bao giờ vượt subtotal (không cho tổng âm)
 * - taxableBase = subtotal − discountAmount → thuế tính trên phần này
 */
export function calcTotals(lines, opts = {}) {
    const subtotal = round2(lines.reduce((sum, l) => sum + calcLineAmount(l.quantity, l.unitPrice, l.discountPercent), 0));
    const discountType = opts.discountType ?? 'none';
    const discountValue = nonNegative(opts.discountValue);
    let discountAmount = 0;
    if (discountType === 'percent') {
        discountAmount = round2(subtotal * (clampPercent(discountValue) / 100));
    }
    else if (discountType === 'amount') {
        discountAmount = round2(Math.min(discountValue, subtotal));
    }
    const taxableBase = round2(subtotal - discountAmount);
    const taxAmount = round2(taxableBase * (clampPercent(opts.taxRate) / 100));
    const total = round2(taxableBase + taxAmount);
    return { subtotal, discountAmount, taxAmount, total };
}
/**
 * Chiết khấu hiệu dụng (%) của cả báo giá — dùng để kiểm tra trần chiết khấu
 * theo vai trò. Gộp cả chiết khấu dòng lẫn chiết khấu tổng.
 */
export function effectiveDiscountPercent(lines, opts = {}) {
    const gross = round2(lines.reduce((sum, l) => sum + nonNegative(l.quantity) * nonNegative(l.unitPrice), 0));
    if (gross <= 0)
        return 0;
    const { subtotal, discountAmount } = calcTotals(lines, opts);
    const totalDiscount = round2(gross - subtotal + discountAmount);
    return round2((totalDiscount / gross) * 100);
}
//# sourceMappingURL=quote-calc.js.map