export interface Customer360Result {
    portrait: string[];
    summary: string;
    opportunity: string;
    actions: string[];
    generatedAt: string;
    fromCache: boolean;
    aiAvailable: boolean;
    /** Lý do phần AI không chạy được — để giao diện nói thật thay vì im lặng. */
    aiError?: string;
}
export declare function analyzeCustomer360(input: {
    orgId: string;
    conversationId: string;
    forceFresh?: boolean;
}): Promise<Customer360Result>;
