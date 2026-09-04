/** Tách riêng để test gọi được mà không cần chờ cron. */
export declare function runTraceRetention(now?: Date): Promise<{
    orgs: number;
    deleted: number;
}>;
export declare function initTraceRetentionCron(): void;
