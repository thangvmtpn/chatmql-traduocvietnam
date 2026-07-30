// BullMQ queue + worker for debounced per-org Perfex flushes.
// Debounce: one job per org via `jobId = orgId`. While a delayed job for that org exists,
// re-adds are no-ops → at most one scheduled flush per org. The flush reads ALL pending
// outbox rows, so events arriving during the window are still picked up.

import { Queue, Worker, type Job } from 'bullmq'
import { connection, REDIS_PREFIX } from '../../../shared/queue.js'
import { logger } from '../../../shared/logger.js'
import { flushOrg } from './perfex-sync-service.js'

const QUEUE_NAME = 'perfex-sync' // no ':' — BullMQ ≥5 forbids it in names

interface PerfexFlushJob {
  orgId: string
}

let queue: Queue<PerfexFlushJob> | null = null
let worker: Worker<PerfexFlushJob> | null = null

function getQueue(): Queue<PerfexFlushJob> {
  if (!queue) {
    queue = new Queue<PerfexFlushJob>(QUEUE_NAME, {
      connection,
      prefix: REDIS_PREFIX,
      defaultJobOptions: {
        attempts: 1, // flushOrg does its own per-row retry; whole-batch retry handled by next schedule
        removeOnComplete: true, // free the jobId immediately so the next change can reschedule
        removeOnFail: { age: 604800 },
      },
    })
  }
  return queue
}

/** Schedule a debounced flush for an org. No-op if one is already pending for that org. */
export async function schedulePerfexFlush(orgId: string, debounceMs: number): Promise<void> {
  await getQueue().add('flush', { orgId }, { jobId: orgId, delay: debounceMs })
}

/** Start the flush worker. Called once from the Perfex integration init. */
export function startPerfexWorker(): void {
  if (worker) return
  const concurrency = parseInt(process.env.PERFEX_FLUSH_CONCURRENCY || '2')
  worker = new Worker<PerfexFlushJob>(
    QUEUE_NAME,
    async (job: Job<PerfexFlushJob>) => {
      await flushOrg(job.data.orgId)
    },
    { connection, prefix: REDIS_PREFIX, concurrency },
  )
  worker.on('failed', (job, err) => {
    logger.error({ orgId: job?.data.orgId, err: err.message }, '[perfex] flush job failed')
  })
  logger.info({ concurrency }, '[perfex] flush worker started')
}
