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
import { logger } from '../../shared/logger.js';
const buckets = new Map();
const MAX_TOKENS = 5;
const REFILL_INTERVAL_MS = 1000; // 5 tokens per 1 second
async function acquireToken(pageId) {
    let bucket = buckets.get(pageId);
    if (!bucket) {
        bucket = { tokens: MAX_TOKENS, lastRefill: Date.now() };
        buckets.set(pageId, bucket);
    }
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor(elapsed / REFILL_INTERVAL_MS) * MAX_TOKENS;
    if (refill > 0) {
        bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refill);
        bucket.lastRefill = now;
    }
    if (bucket.tokens > 0) {
        bucket.tokens--;
        return;
    }
    // Wait for next refill
    const waitMs = REFILL_INTERVAL_MS - (now - bucket.lastRefill);
    await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 100)));
    return acquireToken(pageId); // Retry
}
// ─── Core HTTP ───────────────────────────────────────────────────────────────
const BASE_URL = 'https://pages.fm/api';
const MAX_RETRIES = 3;
async function request(path, token, opts = {}) {
    const { method = 'GET', body, rateLimitKey } = opts;
    if (rateLimitKey) {
        await acquireToken(rateLimitKey);
    }
    const url = new URL(`${BASE_URL}${path}`);
    // Token types: user-level uses access_token, page-level uses page_access_token
    const paramName = path.startsWith('/v1/') ? 'access_token' : 'page_access_token';
    url.searchParams.set(paramName, token);
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const fetchOpts = {
                method,
                headers: { 'Content-Type': 'application/json' },
            };
            if (body && method !== 'GET') {
                fetchOpts.body = JSON.stringify(body);
            }
            const res = await fetch(url.toString(), fetchOpts);
            if (res.status === 429) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn({ attempt, delay }, '[pancake-client] Rate limited (429), backing off');
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            if (res.status >= 500) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn({ status: res.status, attempt }, '[pancake-client] Server error, retrying');
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Pancake API ${res.status}: ${text.slice(0, 200)}`);
            }
            return (await res.json());
        }
        catch (err) {
            lastError = err;
            if (err.message?.includes('Pancake API'))
                throw err; // Don't retry client errors
            const delay = Math.pow(2, attempt) * 500;
            logger.warn({ err: err.message, attempt }, '[pancake-client] Network error, retrying');
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError || new Error('Pancake API request failed after retries');
}
// ─── Public API Methods ──────────────────────────────────────────────────────
/**
 * List all pages accessible by the user access token.
 * Uses the user-level API endpoint.
 */
export async function listPages(userAccessToken) {
    return request('/v1/pages', userAccessToken);
}
/**
 * Get conversations for a page.
 * @param pageId - Pancake page ID
 * @param pageToken - Page access token
 * @param type - 'INBOX' | 'COMMENT' | 'SPAM' | 'DONE'
 * @param cursor - Pagination cursor (conversation ID to start after)
 */
export async function getConversations(pageId, pageToken, opts = {}) {
    const { type = 'INBOX', cursor, limit = 60 } = opts;
    let path = `/public_api/v2/pages/${pageId}/conversations?type=${type}&limit=${limit}`;
    if (cursor)
        path += `&after=${cursor}`;
    return request(path, pageToken, { rateLimitKey: pageId });
}
/**
 * Get messages for a conversation.
 */
export async function getMessages(pageId, conversationId, pageToken, opts = {}) {
    const { before, limit = 30 } = opts;
    let path = `/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?limit=${limit}`;
    if (before)
        path += `&before=${before}`;
    return request(path, pageToken, { rateLimitKey: pageId });
}
/**
 * Send a message in a conversation.
 * action: 'reply_inbox' | 'reply_comment' | 'private_reply'
 */
export async function sendMessage(pageId, conversationId, pageToken, payload) {
    return request(`/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`, pageToken, {
        method: 'POST',
        body: { action: 'reply_inbox', ...payload },
        rateLimitKey: pageId,
    });
}
/**
 * Get customers for a page (paginated).
 */
export async function getCustomers(pageId, pageToken, opts = {}) {
    const { since, until, page = 1, limit = 100 } = opts;
    let path = `/public_api/v1/pages/${pageId}/page_customers?page=${page}&limit=${limit}`;
    if (since)
        path += `&since=${since}`;
    if (until)
        path += `&until=${until}`;
    return request(path, pageToken, { rateLimitKey: pageId });
}
/**
 * Update a customer's data on Pancake.
 * Only used in 2-way sync mode.
 */
export async function updateCustomer(pageId, customerId, pageToken, data) {
    return request(`/public_api/v1/pages/${pageId}/page_customers/${customerId}`, pageToken, { method: 'PUT', body: data, rateLimitKey: pageId });
}
/**
 * Get tags for a page.
 */
export async function getPageTags(pageId, pageToken) {
    return request(`/public_api/v1/pages/${pageId}/tags`, pageToken, { rateLimitKey: pageId });
}
/**
 * Add a tag to a conversation.
 */
export async function addConversationTag(pageId, conversationId, pageToken, tagId) {
    return request(`/public_api/v1/pages/${pageId}/conversations/${conversationId}/tags`, pageToken, { method: 'POST', body: { tag_id: tagId }, rateLimitKey: pageId });
}
/**
 * Upload content (images/videos) for later sending.
 * Returns content_id to use in sendMessage.
 */
export async function uploadContent(pageId, pageToken, fileUrl) {
    return request(`/public_api/v1/pages/${pageId}/upload_contents`, pageToken, { method: 'POST', body: { url: fileUrl }, rateLimitKey: pageId });
}
/**
 * Get page statistics (campaigns, ads).
 */
export async function getPageStatistics(pageId, pageToken, opts = {}) {
    const { since, until } = opts;
    let path = `/public_api/v1/pages/${pageId}/statistics/pages_campaigns`;
    const params = [];
    if (since)
        params.push(`since=${since}`);
    if (until)
        params.push(`until=${until}`);
    if (params.length)
        path += `?${params.join('&')}`;
    return request(path, pageToken, { rateLimitKey: pageId });
}
//# sourceMappingURL=pancake-client.js.map