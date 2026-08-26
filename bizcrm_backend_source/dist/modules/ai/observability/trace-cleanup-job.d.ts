/**
 * Start the AiTrace cleanup scheduler. Call once from app.ts after server starts.
 * Returns the interval handle for graceful shutdown.
 */
export declare function initTraceCleanup(): NodeJS.Timeout;
