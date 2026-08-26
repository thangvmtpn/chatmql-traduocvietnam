/**
 * trace-cleanup-job.ts — Periodic purge of expired AiTrace rows.
 *
 * Uses a setInterval (same pattern as conversation-idle-poller.ts) rather than
 * BullMQ to avoid creating extra queue names. Batch-deletes to avoid table locks.
 * Runs every CLEANUP_INTERVAL_MS (default: 6 hours).
 */
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BATCH_SIZE = 500; // rows per delete to avoid long locks
async function purgeExpiredTraces() {
    const now = new Date();
    let total = 0;
    try {
        // Batch delete by expiresAt (covers both info and error levels via pre-set expiresAt)
        while (true) {
            const rows = await prisma.aiTrace.findMany({
                where: { expiresAt: { lt: now } },
                select: { id: true },
                take: BATCH_SIZE,
            });
            if (rows.length === 0)
                break;
            const ids = rows.map(r => r.id);
            const deleted = await prisma.aiTrace.deleteMany({ where: { id: { in: ids } } });
            total += deleted.count;
            if (rows.length < BATCH_SIZE)
                break; // last batch
        }
        if (total > 0) {
            logger.info({ deletedCount: total }, '[trace-cleanup] purged expired AiTrace rows');
        }
    }
    catch (err) {
        logger.error({ err }, '[trace-cleanup] purge failed — will retry next cycle');
    }
}
/**
 * Start the AiTrace cleanup scheduler. Call once from app.ts after server starts.
 * Returns the interval handle for graceful shutdown.
 */
export function initTraceCleanup() {
    // Run once shortly after startup to catch stale rows from previous runs
    setTimeout(() => {
        purgeExpiredTraces().catch(err => logger.error({ err }, '[trace-cleanup] initial run failed'));
    }, 30_000);
    const handle = setInterval(() => {
        purgeExpiredTraces().catch(err => logger.error({ err }, '[trace-cleanup] scheduled run failed'));
    }, CLEANUP_INTERVAL_MS);
    logger.info({ intervalHours: CLEANUP_INTERVAL_MS / 3_600_000 }, '[trace-cleanup] AiTrace cleanup scheduler started');
    return handle;
}
//# sourceMappingURL=trace-cleanup-job.js.map