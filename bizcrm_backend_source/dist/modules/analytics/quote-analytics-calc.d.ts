/**
 * quote-analytics-calc.ts — phép tính cho báo cáo báo giá. PURE, không đụng DB.
 *
 * Tách riêng vì mấy công thức này dễ sai một cách âm thầm: chia cho 0, đếm
 * nhầm mẫu số của tỉ lệ chốt, phần trăm chuyển đổi tính so với bước trước hay
 * so với tổng.
 */
export interface StatusCounts {
    draft: number;
    sent: number;
    viewed: number;
    accepted: number;
    rejected: number;
    expired: number;
    canceled: number;
}
export interface FunnelStep {
    key: string;
    label: string;
    count: number;
    /** % so với bước ĐẦU TIÊN (tỉ lệ sống sót của phễu) */
    pctOfTop: number;
    /** % so với bước LIỀN TRƯỚC (chỗ rơi rụng nhiều nhất) */
    pctOfPrev: number;
}
/**
 * Phễu TÍCH LUỸ: một báo giá đã `accepted` thì cũng từng `sent` và `viewed`.
 * Nếu chỉ đếm theo trạng thái hiện tại, phễu sẽ trông như thủng đáy.
 */
export declare function buildFunnel(c: StatusCounts): FunnelStep[];
/**
 * Tỉ lệ chốt = chấp nhận / (chấp nhận + từ chối + hết hạn).
 * KHÔNG tính bản nháp và bản đang chờ vào mẫu số — chúng chưa ngã ngũ, đưa
 * vào sẽ làm tỉ lệ tụt giả tạo.
 */
export declare function winRate(c: StatusCounts): number;
/** Số ngày trung bình từ lúc gửi tới lúc khách chấp nhận. */
export declare function avgDaysToClose(pairs: Array<{
    sentAt: Date | null;
    respondedAt: Date | null;
}>): number | null;
export interface UserRow {
    userId: string | null;
    userName: string;
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
    wonValue: number;
}
/** Xếp hạng sale: doanh thu đã chốt trước, rồi tới tỉ lệ chốt. */
export declare function rankUsers(rows: UserRow[]): Array<UserRow & {
    winRate: number;
}>;
/** Chuỗi thời gian đủ mọi kỳ, kể cả kỳ không có dữ liệu (biểu đồ không bị đứt). */
export declare function fillPeriods(rows: Array<{
    period: string;
    count: number;
    value: number;
}>, from: Date, to: Date): Array<{
    period: string;
    count: number;
    value: number;
}>;
