/**
 * quote-number.ts — sinh số chứng từ theo org.
 *
 * Dùng bảng QuoteCounter + `upsert … increment` ATOMIC. Phải gọi TRONG cùng
 * transaction với việc tạo quote, nếu không hai request đồng thời sẽ trùng số.
 */
import type { Prisma } from '@prisma/client';
/** Kỳ đánh số — hiện reset theo năm. Đổi sang 'YYYY-MM' nếu muốn reset theo tháng. */
export declare function currentPeriod(now?: Date): string;
/**
 * Tăng bộ đếm và trả về số chứng từ. Ví dụ: BG-2026-0001
 * @param tx Prisma transaction client — BẮT BUỘC, để đảm bảo atomic.
 */
export declare function normalizePrefix(prefix: string | null | undefined): string;
export declare function nextQuoteNumber(tx: Prisma.TransactionClient, orgId: string, prefix?: string, now?: Date): Promise<string>;
