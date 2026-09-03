/** Tách riêng để test gọi được mà không cần chờ cron. */
export declare function runQuoteDailyJobs(): Promise<{
    expiring: number;
    unviewed: number;
    expired: number;
}>;
export declare function initQuoteExpiryCron(): void;
