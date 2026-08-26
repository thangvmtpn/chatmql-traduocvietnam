/**
 * pancake-message-handler.ts — Process inbound Pancake webhook events.
 *
 * Follows the exact same flow as zalo-webhook.ts:
 *   1. Lookup ChannelAccount
 *   2. Upsert Contact (by pancakeUid)
 *   3. Upsert Conversation (by externalThreadId)
 *   4. Create Message record
 *   5. Emit Socket.IO real-time event
 *   6. Run automation rules
 *
 * Handles both INBOX (chat) and COMMENT events from Pancake.
 */
interface PancakeWebhookPayload {
    event_type?: string;
    page_id?: string;
    data?: {
        page_id?: string;
        conversation?: {
            id: string;
            type?: string;
        };
        message?: {
            id: string;
            message?: string;
            original_message?: string;
            from?: {
                id: string;
                name: string;
                email?: string;
                page_customer_id?: string;
            };
            inserted_at?: string;
            attachments?: Array<{
                type: string;
                url?: string;
                payload?: {
                    url?: string;
                };
            }>;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
/**
 * Process a single Pancake webhook event.
 * Called asynchronously from the webhook route (fire-and-forget).
 */
export declare function processPancakeEvent(channelAccountId: string, orgId: string, payload: PancakeWebhookPayload): Promise<void>;
export {};
