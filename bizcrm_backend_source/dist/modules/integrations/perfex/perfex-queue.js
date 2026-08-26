// BullMQ queue + worker for debounced per-org Perfex flushes.
// Debounce: one job per org via `jobId = orgId`. While a delayed job for that org exists,
// re-adds are no-ops → at most one scheduled flush per org. The flush reads ALL pending
// outbox rows, so events arriving during the window are still picked up.
import { Queue, Worker } from 'bullmq';
import { connection, REDIS_PREFIX } from '../../../shared/queue.js';
import { logger } from '../../../shared/logger.js';
import { flushOrg } from './perfex-sync-service.js';
const QUEUE_NAME = 'perfex-sync'; // no ':' — BullMQ ≥5 forbids it in names
let queue = null;
let worker = null;
function getQueue() {
    if (!queue) {
        queue = new Queue(QUEUE_NAME, {
            connection,
            prefix: REDIS_PREFIX,
            defaultJobOptions: {
                attempts: 1, // flushOrg does its own per-row retry; whole-batch retry handled by next schedule
                removeOnComplete: true, // free the jobId immediately so the next change can reschedule
                removeOnFail: { age: 604800 },
            },
        });
    }
    return queue;
}
/** Schedule a debounced flush for an org. No-op if one is already pending for that org. */
export async function schedulePerfexFlush(orgId, debounceMs) {
    await getQueue().add('flush', { orgId }, { jobId: orgId, delay: debounceMs });
}
/** Start the flush worker. Called once from the Perfex integration init. */
export function startPerfexWorker() {
    if (worker)
        return;
    const concurrency = parseInt(process.env.PERFEX_FLUSH_CONCURRENCY || '2');
    worker = new Worker(QUEUE_NAME, async (job) => {
        await flushOrg(job.data.orgId);
    }, { connection, prefix: REDIS_PREFIX, concurrency });
    worker.on('failed', (job, err) => {
        logger.error({ orgId: job?.data.orgId, err: err.message }, '[perfex] flush job failed');
    });
    logger.info({ concurrency }, '[perfex] flush worker started');
}
//# sourceMappingURL=perfex-queue.js.map