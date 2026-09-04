/**
 * trace-retention-cron.ts — dọn ai_traces theo cấu hình giữ log của từng org.
 *
 * Mỗi bước AI ghi cả prompt vào ai_traces (~5 KB/dòng). Cấu hình đã có
 * trace_retention_days / trace_error_retention_days nhưng trước đây KHÔNG có
 * job nào đọc tới → bảng phình vô hạn trên máy chủ thật.
 *
 * Chạy 20:00 UTC = 03:00 giờ VN. Lỗi (level=error) giữ theo mốc riêng vì
 * cần lâu hơn để điều tra.
 */
import cron from 'node-cron';
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
let task = null;
/** Tách riêng để test gọi được mà không cần chờ cron. */
export async function runTraceRetention(now = new Date()) {
    const cfgs = await prisma.aiConfig.findMany({
        select: { orgId: true, traceRetentionDays: true, traceErrorRetentionDays: true },
    });
    let deleted = 0;
    for (const c of cfgs) {
        const keepDays = Math.max(1, c.traceRetentionDays ?? 14);
        const keepErrDays = Math.max(keepDays, c.traceErrorRetentionDays ?? keepDays);
        const cutoff = new Date(now.getTime() - keepDays * 86_400_000);
        const errCutoff = new Date(now.getTime() - keepErrDays * 86_400_000);
        const a = await prisma.aiTrace.deleteMany({
            where: { orgId: c.orgId, level: { not: 'error' }, createdAt: { lt: cutoff } },
        });
        const b = await prisma.aiTrace.deleteMany({
            where: { orgId: c.orgId, level: 'error', createdAt: { lt: errCutoff } },
        });
        deleted += a.count + b.count;
    }
    return { orgs: cfgs.length, deleted };
}
export function initTraceRetentionCron() {
    if (task)
        return; // idempotent
    task = cron.schedule('0 20 * * *', async () => {
        try {
            const r = await runTraceRetention();
            if (r.deleted)
                logger.info(r, '[ai-trace] đã dọn trace cũ');
        }
        catch (err) {
            logger.error({ err }, '[ai-trace] dọn trace thất bại');
        }
    });
    logger.info('[ai-trace] retention cron started (20:00 UTC)');
}
//# sourceMappingURL=trace-retention-cron.js.map