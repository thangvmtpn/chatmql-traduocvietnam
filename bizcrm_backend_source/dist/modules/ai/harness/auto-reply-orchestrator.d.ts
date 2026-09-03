/**
 * Execute AI reply pipeline for a conversation with timeout protection and concurrency lock.
 */
export declare function processAiReply(convId: string): Promise<void>;
/**
 * Initialize the AI reply worker. Call once from app.ts on startup.
 */
export declare function initAiReplyOrchestrator(): void;
