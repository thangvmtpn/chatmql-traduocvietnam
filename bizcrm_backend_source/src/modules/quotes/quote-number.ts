/**
 * quote-number.ts — sinh số chứng từ theo org.
 *
 * Dùng bảng QuoteCounter + `upsert … increment` ATOMIC. Phải gọi TRONG cùng
 * transaction với việc tạo quote, nếu không hai request đồng thời sẽ trùng số.
 */
import type { Prisma } from '@prisma/client'

/** Kỳ đánh số — hiện reset theo năm. Đổi sang 'YYYY-MM' nếu muốn reset theo tháng. */
export function currentPeriod(now = new Date()): string {
  return String(now.getFullYear())
}

/**
 * Tăng bộ đếm và trả về số chứng từ. Ví dụ: BG-2026-0001
 * @param tx Prisma transaction client — BẮT BUỘC, để đảm bảo atomic.
 */
export function normalizePrefix(prefix: string | null | undefined): string {
  return (prefix || 'BG').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BG'
}

export async function nextQuoteNumber(
  tx: Prisma.TransactionClient,
  orgId: string,
  prefix = 'BG',
  now = new Date(),
): Promise<string> {
  const safePrefix = normalizePrefix(prefix)
  // Khoá bộ đếm gồm cả prefix → báo giá (BG) và hợp đồng (HD) chạy hai dãy số
  // ĐỘC LẬP. Nếu dùng chung, hợp đồng đầu tiên của công ty sẽ mang số kiểu
  // HD-2026-0026 (nối tiếp dãy báo giá) — kế toán VN không chấp nhận.
  // Cột `period` chứa "<PREFIX>-<năm>"; không cần đổi schema.
  const period = `${safePrefix}-${currentPeriod(now)}`
  const counter = await tx.quoteCounter.upsert({
    where: { orgId_period: { orgId, period } },
    update: { seq: { increment: 1 } },
    create: { orgId, period, seq: 1 },
  })
  return `${safePrefix}-${currentPeriod(now)}-${String(counter.seq).padStart(4, '0')}`
}
