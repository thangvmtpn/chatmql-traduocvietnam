/**
 * money-to-words.ts — đọc số tiền thành chữ tiếng Việt.
 * Gần như bắt buộc trên chứng từ VN ("Số tiền bằng chữ: ...").
 *
 * PURE, không đụng DB. Chỉ xử lý phần nguyên (VND không dùng hào/xu trên chứng từ).
 */
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
/** Đơn vị theo nhóm 3 chữ số. Tỷ lặp lại cho số cực lớn (nghìn tỷ, triệu tỷ). */
const GROUPS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ', 'tỷ tỷ'];
/**
 * Đọc 1 nhóm 3 chữ số.
 * @param full true = nhóm có nhóm lớn hơn đứng trước → phải đọc đủ "không trăm ..."
 */
function readTriple(n, full) {
    const hundred = Math.floor(n / 100);
    const ten = Math.floor((n % 100) / 10);
    const unit = n % 10;
    const parts = [];
    if (hundred > 0 || full) {
        parts.push(`${DIGITS[hundred]} trăm`);
    }
    if (ten > 1) {
        parts.push(`${DIGITS[ten]} mươi`);
        if (unit === 1)
            parts.push('mốt');
        else if (unit === 5)
            parts.push('lăm');
        else if (unit > 0)
            parts.push(DIGITS[unit]);
    }
    else if (ten === 1) {
        parts.push('mười');
        if (unit === 1)
            parts.push('một');
        else if (unit === 5)
            parts.push('lăm');
        else if (unit > 0)
            parts.push(DIGITS[unit]);
    }
    else {
        // ten === 0
        if (unit > 0) {
            // "linh"/"lẻ" chỉ khi có hàng trăm đứng trước
            if (hundred > 0 || full)
                parts.push('linh');
            parts.push(DIGITS[unit]);
        }
    }
    return parts.join(' ');
}
/** Viết hoa chữ cái đầu (chỉ ký tự đầu, giữ nguyên phần còn lại). */
function capitalize(s) {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * "1200000" → "Một triệu hai trăm nghìn đồng"
 * Số âm → thêm tiền tố "Âm". Số 0 → "Không đồng".
 */
export function moneyToWords(amount, currencyLabel = 'đồng') {
    if (!Number.isFinite(amount))
        return '';
    const negative = amount < 0;
    // Làm tròn về số nguyên — chứng từ VND không đọc phần lẻ
    let n = Math.floor(Math.abs(amount) + 0.5);
    if (n === 0)
        return capitalize(`không ${currencyLabel}`);
    // Tách thành các nhóm 3 chữ số, nhóm nhỏ nhất trước
    const triples = [];
    while (n > 0) {
        triples.push(n % 1000);
        n = Math.floor(n / 1000);
    }
    if (triples.length > GROUPS.length)
        return ''; // vượt sức đọc, bỏ qua
    const parts = [];
    for (let i = triples.length - 1; i >= 0; i--) {
        const value = triples[i];
        // Nhóm rỗng ở giữa vẫn phải bỏ qua, nhưng không được mất đơn vị của nhóm sau
        if (value === 0)
            continue;
        // full=true khi không phải nhóm cao nhất → đọc đủ "không trăm ..."
        const isHighest = i === triples.length - 1;
        const text = readTriple(value, !isHighest);
        const group = GROUPS[i];
        parts.push(group ? `${text} ${group}` : text);
    }
    const words = parts.join(' ').replace(/\s+/g, ' ').trim();
    return capitalize(`${negative ? 'âm ' : ''}${words} ${currencyLabel}`);
}
/** Định dạng tiền kiểu VN: 1200000 → "1.200.000". */
export function formatMoney(amount) {
    if (!Number.isFinite(amount))
        return '0';
    return Math.round(amount).toLocaleString('vi-VN');
}
//# sourceMappingURL=money-to-words.js.map