/**
 * queue.ts — BullMQ Queue Manager for BizCRM
 *
 * Provides:
 * - Shared Redis connection (IORedis)
 * - Named queues for automation triggers and delay jobs
 * - Helper functions to enqueue jobs
 * - Worker initialization for processing
 *
 * Config via env:
 *   REDIS_URL    — Redis connection string (default: redis://localhost:6379)
 *   REDIS_PREFIX — Key namespace prefix (default: 'bizcrm') — allows multiple
 *                  projects to share one Redis instance without key collisions
 *   AUTOMATION_MAX_PARALLEL — max concurrent actions per BFS level (default: 5)
 *   AUTOMATION_TRIGGER_CONCURRENCY — max concurrent trigger workers (default: 3)
 */
import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger.js';
// ─── Redis Connection ─────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
/** Namespace prefix — isolates this project's keys from others on the same Redis */
export const REDIS_PREFIX = process.env.REDIS_PREFIX || 'bizcrm';
function getRedisOptions() {
    const urlStr = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
        const url = new URL(urlStr);
        return {
            host: url.hostname || '127.0.0.1',
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            db: url.pathname && url.pathname !== '/' ? parseInt(url.pathname.replace('/', '') || '0', 10) : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        };
    }
    catch {
        return { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null, enableReadyCheck: false };
    }
}
export const connection = getRedisOptions();
/** Shared IORedis instance for BullMQ queue utilities */
export const redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
});
redisConnection.on('connect', () => logger.info({ prefix: REDIS_PREFIX, url: REDIS_URL }, '[queue] Redis connected'));
redisConnection.on('error', (err) => logger.error({ err }, '[queue] Redis error'));
// ─── Queue Names ──────────────────────────────────────────────────────────────
// BullMQ ≥5 forbids ':' in queue names (it's the Redis key delimiter).
// Use dashes; the `prefix` option already namespaces these in Redis.
export const QUEUE_NAMES = {
    AUTOMATION_TRIGGER: 'automation-trigger',
    AUTOMATION_DELAY: 'automation-delay',
    ZNS_SEND: 'zns-send',
    AI_REPLY: 'ai-reply',
    EMBEDDING: 'kb-embedding',
};
// ─── Queues ───────────────────────────────────────────────────────────────────
export const triggerQueue = new Queue(QUEUE_NAMES.AUTOMATION_TRIGGER, {
    connection,
    prefix: REDIS_PREFIX,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400, count: 1000 }, // keep 24h or 1000 jobs
        removeOnFail: { age: 604800 }, // keep failed 7 days
    },
});
export const delayQueue = new Queue(QUEUE_NAMES.AUTOMATION_DELAY, {
    connection,
    prefix: REDIS_PREFIX,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { age: 86400, count: 500 },
        removeOnFail: { age: 604800 },
    },
});
export const aiReplyQueue = new Queue(QUEUE_NAMES.AI_REPLY, {
    connection,
    prefix: REDIS_PREFIX,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 86400 },
    },
});
export const embeddingQueue = new Queue(QUEUE_NAMES.EMBEDDING, {
    connection,
    prefix: REDIS_PREFIX,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 86400 },
    },
});
export const znsSendQueue = new Queue(QUEUE_NAMES.ZNS_SEND, {
    connection,
    prefix: REDIS_PREFIX,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 5000 },
        removeOnFail: { age: 604800 },
    },
});
// ─── Enqueue Helpers ──────────────────────────────────────────────────────────
/** Enqueue a trigger for background processing */
export async function enqueueTrigger(data) {
    const job = await triggerQueue.add(`trigger:${data.trigger}`, data, { priority: getPriority(data.trigger) });
    logger.debug({ jobId: job.id, trigger: data.trigger }, '[queue] Trigger enqueued');
    return job.id;
}
/** Enqueue a single ZNS recipient send. Used by campaign starter. */
export async function enqueueZnsSend(data) {
    const job = await znsSendQueue.add(`zns:${data.campaignId}`, data, {
        // Tiny jitter so a 10k-recipient blast doesn't slam Zalo with simultaneous workers.
        delay: Math.floor(Math.random() * 250),
    });
    return job.id;
}
/**
 * Enqueue an AI reply processing job for a conversation.
 * Uses convId as jobId so each subsequent message REPLACES the pending job
 * (debounce: the timer resets on every new message).
 * Removes any existing delayed job for the same convId before adding.
 */
export async function enqueueAiReply(convId, delayMs) {
    // Remove existing delayed job (debounce reset) — best-effort
    try {
        const existingJob = await aiReplyQueue.getJob(convId);
        if (existingJob) {
            await existingJob.remove();
        }
    }
    catch {
        // Non-fatal
    }
    const job = await aiReplyQueue.add('ai-reply', { convId }, 
    // attempts:1 — never auto-retry an AI send (avoids duplicate customer messages).
    { jobId: convId, delay: delayMs, attempts: 1, removeOnComplete: true, removeOnFail: true });
    logger.debug({ jobId: job.id, convId, delayMs }, '[queue] AI reply job enqueued');
    return job.id;
}
/**
 * Enqueue an embedding job for a KB entry.
 * Idempotent: uses `orgId:entryId` as jobId so duplicate enqueues
 * are collapsed into one pending job.
 */
export async function enqueueEmbed(orgId, entryId) {
    const job = await embeddingQueue.add('embed', { orgId, entryId, kind: 'kb' }, { jobId: `embed-${entryId}`, removeOnComplete: true, removeOnFail: false });
    logger.debug({ jobId: job.id, orgId, entryId }, '[queue] Embed job enqueued');
    return job.id;
}
/** Enqueue an embedding job for a product. */
export async function enqueueProductEmbed(orgId, productId) {
    const job = await embeddingQueue.add('embed', { orgId, productId, kind: 'product' }, { jobId: `embed-product-${productId}`, removeOnComplete: true, removeOnFail: false });
    logger.debug({ jobId: job.id, orgId, productId }, '[queue] Product embed job enqueued');
    return job.id;
}
/** Enqueue a delayed flow continuation */
export async function enqueueDelay(data, delayMs) {
    const job = await delayQueue.add(`delay:${data.ruleId}`, data, { delay: delayMs });
    logger.debug({ jobId: job.id, ruleId: data.ruleId, delayMs }, '[queue] Delay job enqueued');
    return job.id;
}
/** Priority mapping: lower = higher priority */
function getPriority(trigger) {
    switch (trigger) {
        case 'message_received': return 1; // Real-time conversation
        case 'message_sent': return 1;
        case 'contact_created': return 2;
        default: return 5; // CDP events, tags, etc.
    }
}
// ─── Worker Initialization ────────────────────────────────────────────────────
let triggerWorker = null;
let delayWorker = null;
let znsSendWorker = null;
let aiReplyWorker = null;
let embeddingWorker = null;
/**
 * Initialize BullMQ workers. Call once from app.ts on startup.
 * @param processTrigger — handler for trigger jobs
 * @param processDelay — handler for delay jobs
 */
export function initWorkers(processTrigger, processDelay) {
    const triggerConcurrency = parseInt(process.env.AUTOMATION_TRIGGER_CONCURRENCY || '3');
    triggerWorker = new Worker(QUEUE_NAMES.AUTOMATION_TRIGGER, processTrigger, { connection, prefix: REDIS_PREFIX, concurrency: triggerConcurrency });
    triggerWorker.on('completed', (job) => {
        logger.info({ jobId: job.id, trigger: job.data.trigger }, '[queue] Trigger job completed');
    });
    triggerWorker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err: err.message }, '[queue] Trigger job failed');
    });
    delayWorker = new Worker(QUEUE_NAMES.AUTOMATION_DELAY, processDelay, { connection, prefix: REDIS_PREFIX, concurrency: 2 });
    delayWorker.on('completed', (job) => {
        logger.info({ jobId: job.id, ruleId: job.data.ruleId }, '[queue] Delay job completed');
    });
    delayWorker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err: err.message }, '[queue] Delay job failed');
    });
    logger.info({ triggerConcurrency, prefix: REDIS_PREFIX }, '[queue] Workers initialized');
}
/**
 * Initialize the ZNS-send worker. Called once from app.ts after initWorkers.
 * Rate-limited via `limiter` to respect Zalo OA quotas (default 5/sec; tune
 * with ZNS_SEND_RATE — max jobs per second).
 */
export function initZnsSendWorker(processor) {
    const rateMax = parseInt(process.env.ZNS_SEND_RATE || '5');
    const concurrency = parseInt(process.env.ZNS_SEND_CONCURRENCY || '5');
    znsSendWorker = new Worker(QUEUE_NAMES.ZNS_SEND, processor, {
        connection,
        prefix: REDIS_PREFIX,
        concurrency,
        limiter: { max: rateMax, duration: 1000 },
    });
    znsSendWorker.on('completed', (job) => {
        logger.debug({ jobId: job.id, campaignId: job.data.campaignId }, '[queue] ZNS send completed');
    });
    znsSendWorker.on('failed', (job, err) => {
        logger.warn({ jobId: job?.id, err: err.message }, '[queue] ZNS send failed');
    });
    logger.info({ rateMax, concurrency, prefix: REDIS_PREFIX }, '[queue] ZNS send worker initialized');
}
/**
 * Initialize the AI reply worker. Call once from app.ts after initWorkers.
 * Uses concurrency=1 so each conversation is processed serially — combined with
 * the jobId=convId debounce this guarantees at most one in-flight job per conv.
 */
export function initAiReplyWorker(processor) {
    // concurrency:1 — one in-flight job per worker; combined with jobId=convId
    // debounce this prevents two jobs for the same conversation auto-sending at once.
    aiReplyWorker = new Worker(QUEUE_NAMES.AI_REPLY, processor, { connection, prefix: REDIS_PREFIX, concurrency: 1 });
    aiReplyWorker.on('completed', (job) => {
        logger.debug({ jobId: job.id, convId: job.data.convId }, '[queue] AI reply job completed');
    });
    aiReplyWorker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, convId: job?.data?.convId, err: err.message }, '[queue] AI reply job failed');
    });
    logger.info({ prefix: REDIS_PREFIX }, '[queue] AI reply worker initialized');
}
/**
 * Initialize the KB embedding worker.
 * Concurrency=3: embedding is I/O-bound (HTTP to OpenAI) — parallelism is fine.
 * Call once from app.ts after initWorkers.
 */
export function initEmbeddingWorker(processor) {
    embeddingWorker = new Worker(QUEUE_NAMES.EMBEDDING, processor, { connection, prefix: REDIS_PREFIX, concurrency: 3 });
    embeddingWorker.on('completed', (job) => {
        logger.debug({ jobId: job.id, entryId: job.data.entryId }, '[queue] Embed job completed');
    });
    embeddingWorker.on('failed', (job, err) => {
        logger.warn({ jobId: job?.id, entryId: job?.data?.entryId, err: err.message }, '[queue] Embed job failed');
    });
    logger.info({ prefix: REDIS_PREFIX }, '[queue] Embedding worker initialized');
}
/** Graceful shutdown — close workers and connection */
export async function shutdownQueue() {
    await triggerWorker?.close();
    await delayWorker?.close();
    await znsSendWorker?.close();
    await aiReplyWorker?.close();
    await embeddingWorker?.close();
    await redisConnection.quit();
    logger.info('[queue] Queue shutdown complete');
}
//# sourceMappingURL=queue.js.map