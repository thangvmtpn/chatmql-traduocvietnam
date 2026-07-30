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

import { logger } from '../../shared/logger.js'

// ─── Rate Limiter (per-page, 5 req/s) ────────────────────────────────────────
// Simple token-bucket limiter without external dependencies.

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()
const MAX_TOKENS = 5
const REFILL_INTERVAL_MS = 1000 // 5 tokens per 1 second

async function acquireToken(pageId: string): Promise<void> {
  let bucket = buckets.get(pageId)
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: Date.now() }
    buckets.set(pageId, bucket)
  }

  // Refill tokens based on elapsed time
  const now = Date.now()
  const elapsed = now - bucket.lastRefill
  const refill = Math.floor(elapsed / REFILL_INTERVAL_MS) * MAX_TOKENS
  if (refill > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  if (bucket.tokens > 0) {
    bucket.tokens--
    return
  }

  // Wait for next refill
  const waitMs = REFILL_INTERVAL_MS - (now - bucket.lastRefill)
  await new Promise(resolve => setTimeout(resolve, Math.max(waitMs, 100)))
  return acquireToken(pageId) // Retry
}

// ─── Core HTTP ───────────────────────────────────────────────────────────────

const BASE_URL = 'https://pages.fm/api'
const MAX_RETRIES = 3

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: Record<string, unknown>
  /** Rate-limit key (page ID). If omitted, no rate limiting. */
  rateLimitKey?: string
}

async function request<T = any>(path: string, token: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, rateLimitKey } = opts

  if (rateLimitKey) {
    await acquireToken(rateLimitKey)
  }

  const url = new URL(`${BASE_URL}${path}`)
  // Token types: user-level uses access_token, page-level uses page_access_token
  const paramName = path.startsWith('/v1/') ? 'access_token' : 'page_access_token'
  url.searchParams.set(paramName, token)

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const fetchOpts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      }
      if (body && method !== 'GET') {
        fetchOpts.body = JSON.stringify(body)
      }

      const res = await fetch(url.toString(), fetchOpts)

      if (res.status === 429) {
        const delay = Math.pow(2, attempt) * 1000
        logger.warn({ attempt, delay }, '[pancake-client] Rate limited (429), backing off')
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (res.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000
        logger.warn({ status: res.status, attempt }, '[pancake-client] Server error, retrying')
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Pancake API ${res.status}: ${text.slice(0, 200)}`)
      }

      return (await res.json()) as T
    } catch (err: any) {
      lastError = err
      if (err.message?.includes('Pancake API')) throw err // Don't retry client errors
      const delay = Math.pow(2, attempt) * 500
      logger.warn({ err: err.message, attempt }, '[pancake-client] Network error, retrying')
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError || new Error('Pancake API request failed after retries')
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PancakePage {
  id: string
  name: string
  platform: string // 'facebook' | 'instagram_official' | 'tiktok'
  shop_id: number
  settings?: {
    page_access_token?: string
    [key: string]: unknown
  }
  users?: Array<{
    user_id: string
    name: string
    fb_id: string
    phone_number: string | null
    status: string
  }>
  active_user_ids?: string[]
  [key: string]: unknown
}

export interface PancakeListPagesResponse {
  success: boolean
  categorized: {
    activated: PancakePage[]
    activated_page_ids: string[]
    hidden: PancakePage[]
    inactivated: PancakePage[]
    nopermission: PancakePage[]
  }
}

export interface PancakeConversation {
  id: string
  type: string // INBOX, COMMENT
  from?: {
    id: string
    name: string
    email?: string
    page_customer_id?: string
  }
  snippet?: string
  seen?: boolean
  is_replied?: boolean
  message_count?: number
  inserted_at?: string     // ISO e.g. "2026-06-13T07:56:41.308486"
  updated_at?: string      // ISO — last activity time
  tags?: Array<{ id: number; text: string; color: string }> | null
  // Embedded customer profile from Pancake
  page_customer?: {
    id: string
    name?: string
    customer_id?: string
    psid?: string
    gender?: string        // "male" | "female"
    global_id?: string
    birthday?: string | null
    notes?: string | null
    inserted_at?: string
    recent_orders?: any
  }
  // Linked customer references
  customers?: Array<{ id: string; name?: string; fb_id?: string }>
  customer_id?: string     // Global customer ID
  // Phone numbers detected from messages
  has_phone?: boolean
  recent_phone_numbers?: Array<{
    phone_number: string
    captured?: string
    status?: number
    length?: number
    m_id?: string
    offset?: number
  }>
  // Ad source tracking
  ads?: Array<{ ad_id: string; inserted_at?: string; post_id?: string }>
  ad_ids?: string[]
  // Staff assignment
  last_sent_by?: { id: string; name: string; admin_name?: string; uid?: string }
  assignee_ids?: string[]
  assignee_group_id?: string | null
  [key: string]: unknown
}

export interface PancakeMessage {
  id: string
  message?: string           // HTML-wrapped text (has <div> tags)
  original_message?: string  // Clean text (no HTML)
  from?: {
    id: string
    name: string
  }
  inserted_at?: string       // ISO timestamp e.g. "2026-06-13T07:56:29.000000"
  created_time?: string      // Fallback (some endpoints)
  attachments?: Array<{
    type: string
    url?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface PancakeCustomer {
  id: string
  name?: string
  phone_numbers?: string[]
  emails?: string[]
  birthday?: string
  gender?: string | number
  lives_in?: string
  can_inbox?: boolean
  thread_id?: string
  tags?: Array<{ id: number; text: string } | null>
  notes?: string
  [key: string]: unknown
}

// ─── Public API Methods ──────────────────────────────────────────────────────

/**
 * List all pages accessible by the user access token.
 * Uses the user-level API endpoint.
 */
export async function listPages(userAccessToken: string): Promise<PancakeListPagesResponse> {
  return request<PancakeListPagesResponse>('/v1/pages', userAccessToken)
}

/**
 * Get conversations for a page.
 * @param pageId - Pancake page ID
 * @param pageToken - Page access token
 * @param type - 'INBOX' | 'COMMENT' | 'SPAM' | 'DONE'
 * @param cursor - Pagination cursor (conversation ID to start after)
 */
export async function getConversations(
  pageId: string,
  pageToken: string,
  opts: { type?: string; cursor?: string; limit?: number } = {},
): Promise<{ conversations: PancakeConversation[] }> {
  const { type = 'INBOX', cursor, limit = 60 } = opts
  let path = `/public_api/v2/pages/${pageId}/conversations?type=${type}&limit=${limit}`
  if (cursor) path += `&after=${cursor}`
  return request(path, pageToken, { rateLimitKey: pageId })
}

/**
 * Get messages for a conversation.
 */
export async function getMessages(
  pageId: string,
  conversationId: string,
  pageToken: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: PancakeMessage[] }> {
  const { before, limit = 30 } = opts
  let path = `/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?limit=${limit}`
  if (before) path += `&before=${before}`
  return request(path, pageToken, { rateLimitKey: pageId })
}

/**
 * Send a message in a conversation.
 * action: 'reply_inbox' | 'reply_comment' | 'private_reply'
 */
export async function sendMessage(
  pageId: string,
  conversationId: string,
  pageToken: string,
  payload: {
    action?: string
    message?: string
    content_ids?: string[]
    message_id?: string // Required for reply_comment / private_reply
  },
): Promise<{ success: boolean; message?: PancakeMessage }> {
  return request(
    `/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`,
    pageToken,
    {
      method: 'POST',
      body: { action: 'reply_inbox', ...payload } as Record<string, unknown>,
      rateLimitKey: pageId,
    },
  )
}

/**
 * Get customers for a page (paginated).
 */
export async function getCustomers(
  pageId: string,
  pageToken: string,
  opts: { since?: string; until?: string; page?: number; limit?: number } = {},
): Promise<{ page_customers: PancakeCustomer[] }> {
  const { since, until, page = 1, limit = 100 } = opts
  let path = `/public_api/v1/pages/${pageId}/page_customers?page=${page}&limit=${limit}`
  if (since) path += `&since=${since}`
  if (until) path += `&until=${until}`
  return request(path, pageToken, { rateLimitKey: pageId })
}

/**
 * Update a customer's data on Pancake.
 * Only used in 2-way sync mode.
 */
export async function updateCustomer(
  pageId: string,
  customerId: string,
  pageToken: string,
  data: Partial<{ name: string; phone_numbers: string[]; notes: string }>,
): Promise<any> {
  return request(
    `/public_api/v1/pages/${pageId}/page_customers/${customerId}`,
    pageToken,
    { method: 'PUT', body: data as Record<string, unknown>, rateLimitKey: pageId },
  )
}

/**
 * Get tags for a page.
 */
export async function getPageTags(
  pageId: string,
  pageToken: string,
): Promise<{ tags: Array<{ id: number; text: string; color: string }> }> {
  return request(`/public_api/v1/pages/${pageId}/tags`, pageToken, { rateLimitKey: pageId })
}

/**
 * Add a tag to a conversation.
 */
export async function addConversationTag(
  pageId: string,
  conversationId: string,
  pageToken: string,
  tagId: number,
): Promise<any> {
  return request(
    `/public_api/v1/pages/${pageId}/conversations/${conversationId}/tags`,
    pageToken,
    { method: 'POST', body: { tag_id: tagId }, rateLimitKey: pageId },
  )
}

/**
 * Upload content (images/videos) for later sending.
 * Returns content_id to use in sendMessage.
 */
export async function uploadContent(
  pageId: string,
  pageToken: string,
  fileUrl: string,
): Promise<{ content_id: string }> {
  return request(
    `/public_api/v1/pages/${pageId}/upload_contents`,
    pageToken,
    { method: 'POST', body: { url: fileUrl }, rateLimitKey: pageId },
  )
}

/**
 * Get page statistics (campaigns, ads).
 */
export async function getPageStatistics(
  pageId: string,
  pageToken: string,
  opts: { since?: string; until?: string } = {},
): Promise<any> {
  const { since, until } = opts
  let path = `/public_api/v1/pages/${pageId}/statistics/pages_campaigns`
  const params: string[] = []
  if (since) params.push(`since=${since}`)
  if (until) params.push(`until=${until}`)
  if (params.length) path += `?${params.join('&')}`
  return request(path, pageToken, { rateLimitKey: pageId })
}
