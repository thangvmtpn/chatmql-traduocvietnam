/** Schedule a debounced flush for an org. No-op if one is already pending for that org. */
export declare function schedulePerfexFlush(orgId: string, debounceMs: number): Promise<void>;
/** Start the flush worker. Called once from the Perfex integration init. */
export declare function startPerfexWorker(): void;
