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
import { Queue, type Job, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
/** Namespace prefix — isolates this project's keys from others on the same Redis */
export declare const REDIS_PREFIX: string;
export declare const connection: ConnectionOptions;
/** Shared IORedis instance for BullMQ queue utilities */
export declare const redisConnection: IORedis;
export declare const QUEUE_NAMES: {
    readonly AUTOMATION_TRIGGER: "automation-trigger";
    readonly AUTOMATION_DELAY: "automation-delay";
    readonly ZNS_SEND: "zns-send";
    readonly AI_REPLY: "ai-reply";
    readonly EMBEDDING: "kb-embedding";
};
export declare const triggerQueue: Queue<any, any, string, any, any, string>;
export declare const delayQueue: Queue<any, any, string, any, any, string>;
export declare const aiReplyQueue: Queue<any, any, string, any, any, string>;
export declare const embeddingQueue: Queue<any, any, string, any, any, string>;
export declare const znsSendQueue: Queue<any, any, string, any, any, string>;
export interface TriggerJobData {
    trigger: string;
    context: {
        orgId: string;
        conversationId?: string;
        contactId?: string;
        messageText?: string;
        triggerData?: Record<string, any>;
    };
}
export interface DelayJobData {
    orgId: string;
    ruleId: string;
    flowConfig: any;
    resumeFromNodeIds: string[];
    context: any;
    scheduledFor: string;
}
export interface ZnsSendJobData {
    campaignId: string;
    recipientId: string;
}
export interface AiReplyJobData {
    convId: string;
}
export interface EmbedJobData {
    orgId: string;
    entryId?: string;
    productId?: string;
    kind?: 'kb' | 'product';
}
/** Enqueue a trigger for background processing */
export declare function enqueueTrigger(data: TriggerJobData): Promise<string>;
/** Enqueue a single ZNS recipient send. Used by campaign starter. */
export declare function enqueueZnsSend(data: ZnsSendJobData): Promise<string>;
/**
 * Enqueue an AI reply processing job for a conversation.
 * Uses reliable in-memory debouncing before triggering the AI reply orchestrator.
 * This guarantees 100% reliability with 0 Redis/BullMQ stalls.
 */
export declare function enqueueAiReply(convId: string, delayMs?: number): Promise<string>;
/**
 * Enqueue an embedding job for a KB entry.
 * Idempotent: uses `orgId:entryId` as jobId so duplicate enqueues
 * are collapsed into one pending job.
 */
export declare function enqueueEmbed(orgId: string, entryId: string): Promise<string>;
/** Enqueue an embedding job for a product. */
export declare function enqueueProductEmbed(orgId: string, productId: string): Promise<string>;
/** Enqueue a delayed flow continuation */
export declare function enqueueDelay(data: DelayJobData, delayMs: number): Promise<string>;
/**
 * Initialize BullMQ workers. Call once from app.ts on startup.
 * @param processTrigger — handler for trigger jobs
 * @param processDelay — handler for delay jobs
 */
export declare function initWorkers(processTrigger: (job: Job<TriggerJobData>) => Promise<void>, processDelay: (job: Job<DelayJobData>) => Promise<void>): void;
/**
 * Initialize the ZNS-send worker. Called once from app.ts after initWorkers.
 * Rate-limited via `limiter` to respect Zalo OA quotas (default 5/sec; tune
 * with ZNS_SEND_RATE — max jobs per second).
 */
export declare function initZnsSendWorker(processor: (job: Job<ZnsSendJobData>) => Promise<void>): void;
/**
 * Initialize the AI reply worker. Call once from app.ts after initWorkers.
 * Uses concurrency=5 with an in-memory active conversation Set so each conversation
 * is processed serially without blocking other conversations.
 */
export declare function initAiReplyWorker(processor: (job: Job<AiReplyJobData>) => Promise<void>): void;
/**
 * Initialize the KB embedding worker.
 * Concurrency=3: embedding is I/O-bound (HTTP to OpenAI) — parallelism is fine.
 * Call once from app.ts after initWorkers.
 */
export declare function initEmbeddingWorker(processor: (job: Job<EmbedJobData>) => Promise<void>): void;
/** Graceful shutdown — close workers and connection */
export declare function shutdownQueue(): Promise<void>;
