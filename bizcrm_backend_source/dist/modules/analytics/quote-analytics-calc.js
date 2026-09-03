/**
 * quote-analytics-calc.ts — phép tính cho báo cáo báo giá. PURE, không đụng DB.
 *
 * Tách riêng vì mấy công thức này dễ sai một cách âm thầm: chia cho 0, đếm
 * nhầm mẫu số của tỉ lệ chốt, phần trăm chuyển đổi tính so với bước trước hay
 * so với tổng.
 */
const pct = (part, whole) => whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;
/**
 * Phễu TÍCH LUỸ: một báo giá đã `accepted` thì cũng từng `sent` và `viewed`.
 * Nếu chỉ đếm theo trạng thái hiện tại, phễu sẽ trông như thủng đáy.
 */
export function buildFunnel(c) {
    const created = c.draft + c.sent + c.viewed + c.accepted + c.rejected + c.expired + c.canceled;
    const sent = c.sent + c.viewed + c.accepted + c.rejected + c.expired;
    // Chỉ đếm được "đã xem" cho bản còn ở viewed hoặc đã phản hồi — bản `sent`
    // thuần tuý là chưa mở. `expired` không suy ra được nên không tính vào.
    const viewed = c.viewed + c.accepted + c.rejected;
    const accepted = c.accepted;
    const steps = [
        { key: 'created', label: 'Đã tạo', count: created },
        { key: 'sent', label: 'Đã gửi', count: sent },
        { key: 'viewed', label: 'Khách đã xem', count: viewed },
        { key: 'accepted', label: 'Chấp nhận', count: accepted },
    ];
    return steps.map((s, i) => ({
        ...s,
        pctOfTop: pct(s.count, steps[0].count),
        pctOfPrev: i === 0 ? 100 : pct(s.count, steps[i - 1].count),
    }));
}
/**
 * Tỉ lệ chốt = chấp nhận / (chấp nhận + từ chối + hết hạn).
 * KHÔNG tính bản nháp và bản đang chờ vào mẫu số — chúng chưa ngã ngũ, đưa
 * vào sẽ làm tỉ lệ tụt giả tạo.
 */
export function winRate(c) {
    return pct(c.accepted, c.accepted + c.rejected + c.expired);
}
/** Số ngày trung bình từ lúc gửi tới lúc khách chấp nhận. */
export function avgDaysToClose(pairs) {
    const spans = pairs
        .filter((p) => p.sentAt != null && p.respondedAt != null)
        .map((p) => (p.respondedAt.getTime() - p.sentAt.getTime()) / 86_400_000)
        .filter((d) => d >= 0);
    if (spans.length === 0)
        return null;
    return Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10;
}
/** Xếp hạng sale: doanh thu đã chốt trước, rồi tới tỉ lệ chốt. */
export function rankUsers(rows) {
    return rows
        .map((r) => ({
        ...r,
        winRate: pct(r.accepted, r.accepted + r.rejected + r.expired),
    }))
        .sort((a, b) => b.wonValue - a.wonValue || b.winRate - a.winRate);
}
/** Chuỗi thời gian đủ mọi kỳ, kể cả kỳ không có dữ liệu (biểu đồ không bị đứt). */
export function fillPeriods(rows, from, to) {
    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    const out = [];
    const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    let guard = 0;
    while (cur <= end && guard++ < 400) {
        const key = cur.toISOString().slice(0, 10);
        out.push(byPeriod.get(key) ?? { period: key, count: 0, value: 0 });
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
}
//# sourceMappingURL=quote-analytics-calc.js.map