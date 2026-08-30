/**
 * Register custom APIs into zca-js instance (e.g. getUserChatHistory).
 */
export declare function registerCustomApis(api: any): void;
/**
 * Sync recent group messages for one account.
 */
export declare function syncGroupMessages(api: any, accountId: string): Promise<number>;
/**
 * Sync recent 1-1 user messages for one account.
 */
export declare function syncUserMessages(api: any, accountId: string): Promise<number>;
/**
 * Deep backfill for a single conversation (Group or 1-1 User) with pagination.
 */
export declare function backfillConversation(api: any, accountId: string, threadId: string, threadType?: 'user' | 'group', maxMessages?: number): Promise<{
    inserted: number;
    skipped: number;
    total: number;
}>;
/**
 * Backfill all conversations for an account.
 */
export declare function backfillAllAccountConversations(api: any, accountId: string, orgId: string, maxMessages?: number): Promise<{
    totalConversations: number;
    totalInserted: number;
    totalSkipped: number;
    errors: any[];
}>;
/** Start periodic group & user sync for an account. */
export declare function startMessageSync(api: any, accountId: string): void;
/** Stop periodic sync for an account. */
export declare function stopMessageSync(accountId: string): void;
