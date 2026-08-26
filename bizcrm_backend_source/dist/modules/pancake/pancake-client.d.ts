/**
 * pancake-client.ts — HTTP client for Pancake (pages.fm) public API.
 *
 * Features:
 * - Per-page rate limiting (5 req/s — Pancake's limit)
 * - Retry with exponential backoff for 429/5xx
 * - Token passed via query param (Pancake convention)
 * - Avoids logging URLs containing tokens
 *
 * API base: https://pages.fm/api
 *   - User-level:  /v1/pages (list pages)
 *   - Page-level:  /public_api/v2/pages/{id}/conversations
 *                  /public_api/v1/pages/{id}/page_customers
 */
export interface PancakePage {
    id: string;
    name: string;
    platform: string;
    shop_id: number;
    settings?: {
        page_access_token?: string;
        [key: string]: unknown;
    };
    users?: Array<{
        user_id: string;
        name: string;
        fb_id: string;
        phone_number: string | null;
        status: string;
    }>;
    active_user_ids?: string[];
    [key: string]: unknown;
}
export interface PancakeListPagesResponse {
    success: boolean;
    categorized: {
        activated: PancakePage[];
        activated_page_ids: string[];
        hidden: PancakePage[];
        inactivated: PancakePage[];
        nopermission: PancakePage[];
    };
}
export interface PancakeConversation {
    id: string;
    type: string;
    from?: {
        id: string;
        name: string;
        email?: string;
        page_customer_id?: string;
    };
    snippet?: string;
    seen?: boolean;
    is_replied?: boolean;
    message_count?: number;
    inserted_at?: string;
    updated_at?: string;
    tags?: Array<{
        id: number;
        text: string;
        color: string;
    }> | null;
    page_customer?: {
        id: string;
        name?: string;
        customer_id?: string;
        psid?: string;
        gender?: string;
        global_id?: string;
        birthday?: string | null;
        notes?: string | null;
        inserted_at?: string;
        recent_orders?: any;
    };
    customers?: Array<{
        id: string;
        name?: string;
        fb_id?: string;
    }>;
    customer_id?: string;
    has_phone?: boolean;
    recent_phone_numbers?: Array<{
        phone_number: string;
        captured?: string;
        status?: number;
        length?: number;
        m_id?: string;
        offset?: number;
    }>;
    ads?: Array<{
        ad_id: string;
        inserted_at?: string;
        post_id?: string;
    }>;
    ad_ids?: string[];
    last_sent_by?: {
        id: string;
        name: string;
        admin_name?: string;
        uid?: string;
    };
    assignee_ids?: string[];
    assignee_group_id?: string | null;
    [key: string]: unknown;
}
export interface PancakeMessage {
    id: string;
    message?: string;
    original_message?: string;
    from?: {
        id: string;
        name: string;
    };
    inserted_at?: string;
    created_time?: string;
    attachments?: Array<{
        type: string;
        url?: string;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}
export interface PancakeCustomer {
    id: string;
    name?: string;
    phone_numbers?: string[];
    emails?: string[];
    birthday?: string;
    gender?: string | number;
    lives_in?: string;
    can_inbox?: boolean;
    thread_id?: string;
    tags?: Array<{
        id: number;
        text: string;
    } | null>;
    notes?: string;
    [key: string]: unknown;
}
/**
 * List all pages accessible by the user access token.
 * Uses the user-level API endpoint.
 */
export declare function listPages(userAccessToken: string): Promise<PancakeListPagesResponse>;
/**
 * Get conversations for a page.
 * @param pageId - Pancake page ID
 * @param pageToken - Page access token
 * @param type - 'INBOX' | 'COMMENT' | 'SPAM' | 'DONE'
 * @param cursor - Pagination cursor (conversation ID to start after)
 */
export declare function getConversations(pageId: string, pageToken: string, opts?: {
    type?: string;
    cursor?: string;
    limit?: number;
}): Promise<{
    conversations: PancakeConversation[];
}>;
/**
 * Get messages for a conversation.
 */
export declare function getMessages(pageId: string, conversationId: string, pageToken: string, opts?: {
    before?: string;
    limit?: number;
}): Promise<{
    messages: PancakeMessage[];
}>;
/**
 * Send a message in a conversation.
 * action: 'reply_inbox' | 'reply_comment' | 'private_reply'
 */
export declare function sendMessage(pageId: string, conversationId: string, pageToken: string, payload: {
    action?: string;
    message?: string;
    content_ids?: string[];
    message_id?: string;
}): Promise<{
    success: boolean;
    message?: PancakeMessage;
}>;
/**
 * Get customers for a page (paginated).
 */
export declare function getCustomers(pageId: string, pageToken: string, opts?: {
    since?: string;
    until?: string;
    page?: number;
    limit?: number;
}): Promise<{
    page_customers: PancakeCustomer[];
}>;
/**
 * Update a customer's data on Pancake.
 * Only used in 2-way sync mode.
 */
export declare function updateCustomer(pageId: string, customerId: string, pageToken: string, data: Partial<{
    name: string;
    phone_numbers: string[];
    notes: string;
}>): Promise<any>;
/**
 * Get tags for a page.
 */
export declare function getPageTags(pageId: string, pageToken: string): Promise<{
    tags: Array<{
        id: number;
        text: string;
        color: string;
    }>;
}>;
/**
 * Add a tag to a conversation.
 */
export declare function addConversationTag(pageId: string, conversationId: string, pageToken: string, tagId: number): Promise<any>;
/**
 * Upload content (images/videos) for later sending.
 * Returns content_id to use in sendMessage.
 */
export declare function uploadContent(pageId: string, pageToken: string, fileUrl: string): Promise<{
    content_id: string;
}>;
/**
 * Get page statistics (campaigns, ads).
 */
export declare function getPageStatistics(pageId: string, pageToken: string, opts?: {
    since?: string;
    until?: string;
}): Promise<any>;
