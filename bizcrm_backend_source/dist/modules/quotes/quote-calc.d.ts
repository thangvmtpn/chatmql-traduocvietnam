/**
 * quote-calc.ts — toàn bộ phép tính tiền của báo giá. PURE, không đụng DB.
 *
 * Thứ tự tính (chuẩn kế toán VN): chiết khấu dòng → subtotal → chiết khấu tổng
 * → THUẾ TÍNH SAU CHIẾT KHẤU → total.
 *
 * Frontend dùng chung công thức này để hiện realtime; backend luôn tính lại
 * khi ghi DB (không tin số client gửi lên).
 */
export type DiscountType = 'none' | 'percent' | 'amount';
export interface LineInput {
    quantity: number;
    unitPrice: number;
    /** Chiết khấu riêng của dòng, đơn vị % (0–100) */
    discountPercent?: number;
}
export interface TotalsInput {
    discountType?: DiscountType;
    /** % nếu discountType='percent', số tiền nếu 'amount' */
    discountValue?: number;
    /** VAT VN: 0 | 5 | 8 | 10 */
    taxRate?: number;
}
export interface Totals {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
}
/** Làm tròn 2 số lẻ, tránh lỗi dấu phẩy động (0.1+0.2). */
export declare function round2(n: number): number;
/** Thành tiền 1 dòng = SL × đơn giá × (1 − chiết khấu dòng %). */
export declare function calcLineAmount(quantity: number, unitPrice: number, discountPercent?: number): number;
/**
 * Tổng hợp toàn bộ báo giá.
 * - discountAmount không bao giờ vượt subtotal (không cho tổng âm)
 * - taxableBase = subtotal − discountAmount → thuế tính trên phần này
 */
export declare function calcTotals(lines: LineInput[], opts?: TotalsInput): Totals;
/**
 * Chiết khấu hiệu dụng (%) của cả báo giá — dùng để kiểm tra trần chiết khấu
 * theo vai trò. Gộp cả chiết khấu dòng lẫn chiết khấu tổng.
 */
export declare function effectiveDiscountPercent(lines: LineInput[], opts?: TotalsInput): number;
