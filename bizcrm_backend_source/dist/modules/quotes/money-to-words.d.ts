/**
 * money-to-words.ts — đọc số tiền thành chữ tiếng Việt.
 * Gần như bắt buộc trên chứng từ VN ("Số tiền bằng chữ: ...").
 *
 * PURE, không đụng DB. Chỉ xử lý phần nguyên (VND không dùng hào/xu trên chứng từ).
 */
/**
 * "1200000" → "Một triệu hai trăm nghìn đồng"
 * Số âm → thêm tiền tố "Âm". Số 0 → "Không đồng".
 */
export declare function moneyToWords(amount: number, currencyLabel?: string): string;
/** Định dạng tiền kiểu VN: 1200000 → "1.200.000". */
export declare function formatMoney(amount: number): string;
