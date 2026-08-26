/**
 * pancake-sync.ts — Sync conversations, messages, and customers from Pancake.
 *
 * Supports 3 sync directions:
 *   - 'pull': Pancake → BizCRM (read-only, safe for production)
 *   - 'push': BizCRM → Pancake (writes back to Pancake — use with caution)
 *   - 'both': Full bidirectional sync
 *
 * Default is 'pull' to prevent accidental data writes to production Pancake.
 */
export type SyncDirection = 'pull' | 'push' | 'both';
/**
 * Sync a single Pancake page — conversations, messages, and customers.
 *
 * @param orgId - Organization ID
 * @param channelAccountId - BizCRM ChannelAccount.id
 * @param pageId - Pancake page ID
 * @param pageToken - Decrypted page access token
 * @param direction - Sync direction (default: 'pull')
 */
export declare function syncPancakePage(orgId: string, channelAccountId: string, pageId: string, pageToken: string, direction?: SyncDirection): Promise<{
    conversations: number;
    messages: number;
    customers: number;
}>;
