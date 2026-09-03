/**
 * quote-expiry-cron.ts — job nền hằng ngày cho báo giá.
 *
 * 1. Đánh dấu báo giá quá hạn. Không có job này thì báo giá quá `validUntil`
 *    vẫn nằm "Đã gửi" trong danh sách sale (chỉ đổi trạng thái nếu khách tình
 *    cờ mở link) → phễu báo cáo và win-rate sai lệch.
 * 2. Nhắc sale bám theo: sắp hết hiệu lực, và khách chưa mở sau vài ngày.
 *
 * Chạy 02:00 giờ VN (19:00 UTC hôm trước). Quét MỌI org — job hệ thống, mỗi
 * bản ghi tự mang orgId của nó khi ghi log, tạo thông báo và bắn event.
 * Nhắc TRƯỚC khi đánh dấu hết hạn, nếu không cái sắp hết hạn sẽ bị chuyển
 * trạng thái mất trước khi kịp nhắc.
 */
import cron from 'node-cron';
import { logger } from '../../shared/logger.js';
import { expireOverdueQuotes } from './quote-service.js';
import { remindExpiringQuotes, remindUnviewedQuotes } from './quote-reminder-service.js';
let task = null;
/** Tách riêng để test gọi được mà không cần chờ cron. */
export async function runQuoteDailyJobs() {
    const expiring = await remindExpiringQuotes();
    const unviewed = await remindUnviewedQuotes();
    const expired = await expireOverdueQuotes();
    return { expiring, unviewed, expired };
}
export function initQuoteExpiryCron() {
    if (task)
        return; // idempotent — gọi 2 lần không tạo job trùng
    task = cron.schedule('0 19 * * *', async () => {
        try {
            const r = await runQuoteDailyJobs();
            if (r.expiring || r.unviewed || r.expired) {
                logger.info(r, '[quotes] job hằng ngày xong');
            }
        }
        catch (err) {
            logger.error({ err }, '[quotes] job hằng ngày thất bại');
        }
    });
    logger.info('[quotes] daily cron registered (02:00 VN — nhắc + đánh dấu hết hạn)');
}
//# sourceMappingURL=quote-expiry-cron.js.map