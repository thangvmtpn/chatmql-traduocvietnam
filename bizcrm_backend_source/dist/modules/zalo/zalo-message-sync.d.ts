/**
 * Sync recent group messages for one account.
 * Returns the number of newly inserted messages.
 */
export declare function syncGroupMessages(api: any, accountId: string): Promise<number>;
/** Start periodic group sync for an account. */
export declare function startMessageSync(api: any, accountId: string): void;
/** Stop periodic sync for an account. */
export declare function stopMessageSync(accountId: string): void;
