/**
 * quote-analytics-calc.ts — phép tính cho báo cáo báo giá. PURE, không đụng DB.
 *
 * Tách riêng vì mấy công thức này dễ sai một cách âm thầm: chia cho 0, đếm
 * nhầm mẫu số của tỉ lệ chốt, phần trăm chuyển đổi tính so với bước trước hay
 * so với tổng.
 */

export interface StatusCounts {
  draft: number
  sent: number
  viewed: number
  accepted: number
  rejected: number
  expired: number
  canceled: number
}

export interface FunnelStep {
  key: string
  label: string
  count: number
  /** % so với bước ĐẦU TIÊN (tỉ lệ sống sót của phễu) */
  pctOfTop: number
  /** % so với bước LIỀN TRƯỚC (chỗ rơi rụng nhiều nhất) */
  pctOfPrev: number
}

const pct = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10

/**
 * Phễu TÍCH LUỸ: một báo giá đã `accepted` thì cũng từng `sent` và `viewed`.
 * Nếu chỉ đếm theo trạng thái hiện tại, phễu sẽ trông như thủng đáy.
 */
export function buildFunnel(c: StatusCounts): FunnelStep[] {
  const created = c.draft + c.sent + c.viewed + c.accepted + c.rejected + c.expired + c.canceled
  const sent = c.sent + c.viewed + c.accepted + c.rejected + c.expired
  // Chỉ đếm được "đã xem" cho bản còn ở viewed hoặc đã phản hồi — bản `sent`
  // thuần tuý là chưa mở. `expired` không suy ra được nên không tính vào.
  const viewed = c.viewed + c.accepted + c.rejected
  const accepted = c.accepted

  const steps = [
    { key: 'created', label: 'Đã tạo', count: created },
    { key: 'sent', label: 'Đã gửi', count: sent },
    { key: 'viewed', label: 'Khách đã xem', count: viewed },
    { key: 'accepted', label: 'Chấp nhận', count: accepted },
  ]

  return steps.map((s, i) => ({
    ...s,
    pctOfTop: pct(s.count, steps[0].count),
    pctOfPrev: i === 0 ? 100 : pct(s.count, steps[i - 1].count),
  }))
}

/**
 * Tỉ lệ chốt = chấp nhận / (chấp nhận + từ chối + hết hạn).
 * KHÔNG tính bản nháp và bản đang chờ vào mẫu số — chúng chưa ngã ngũ, đưa
 * vào sẽ làm tỉ lệ tụt giả tạo.
 */
export function winRate(c: StatusCounts): number {
  return pct(c.accepted, c.accepted + c.rejected + c.expired)
}

/** Số ngày trung bình từ lúc gửi tới lúc khách chấp nhận. */
export function avgDaysToClose(pairs: Array<{ sentAt: Date | null; respondedAt: Date | null }>): number | null {
  const spans = pairs
    .filter((p): p is { sentAt: Date; respondedAt: Date } => p.sentAt != null && p.respondedAt != null)
    .map((p) => (p.respondedAt.getTime() - p.sentAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0)
  if (spans.length === 0) return null
  return Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
}

export interface UserRow {
  userId: string | null
  userName: string
  sent: number
  accepted: number
  rejected: number
  expired: number
  wonValue: number
}

/** Xếp hạng sale: doanh thu đã chốt trước, rồi tới tỉ lệ chốt. */
export function rankUsers(rows: UserRow[]): Array<UserRow & { winRate: number }> {
  return rows
    .map((r) => ({
      ...r,
      winRate: pct(r.accepted, r.accepted + r.rejected + r.expired),
    }))
    .sort((a, b) => b.wonValue - a.wonValue || b.winRate - a.winRate)
}

/** Chuỗi thời gian đủ mọi kỳ, kể cả kỳ không có dữ liệu (biểu đồ không bị đứt). */
export function fillPeriods(
  rows: Array<{ period: string; count: number; value: number }>,
  from: Date,
  to: Date,
): Array<{ period: string; count: number; value: number }> {
  const byPeriod = new Map(rows.map((r) => [r.period, r]))
  const out: Array<{ period: string; count: number; value: number }> = []
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  let guard = 0
  while (cur <= end && guard++ < 400) {
    const key = cur.toISOString().slice(0, 10)
    out.push(byPeriod.get(key) ?? { period: key, count: 0, value: 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}
