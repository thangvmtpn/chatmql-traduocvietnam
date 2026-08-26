/**
 * Centralized query limits — single source of truth for all pagination/take values.
 * Replaces magic numbers (10000, 500, 200, 50) scattered across routes.
 */
export declare const LIMITS: {
    /** Maximum contacts returned per segment evaluation query (per-condition) */
    readonly CDP_SEGMENT_MAX_CONTACTS: 10000;
    /** Default items per page for paginated endpoints */
    readonly DEFAULT_PAGE_SIZE: 50;
    /** Maximum items per page for paginated endpoints */
    readonly MAX_PAGE_SIZE: 200;
    /** Default limit for CDP events batch fetch */
    readonly CDP_EVENTS_BATCH: 100;
    /** Timeline items per page */
    readonly TIMELINE_PAGE_SIZE: 50;
    /** Sync logs shown per integration */
    readonly SYNC_LOGS_LIMIT: 50;
    /** Maximum contacts processed in a single tag update batch */
    readonly TAG_BATCH_SIZE: 500;
};
