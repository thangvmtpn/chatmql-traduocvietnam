/**
 * zalo-rate-limiter.ts — Multi-category rate limiter for Zalo anti-block.
 *
 * Enforces both daily limits and burst windows per operation category
 * to prevent Zalo from blocking the account.
 *
 * Categories:
 *   message      — 200/day, max 5 per 30s burst
 *   reaction     — 50/day,  max 3 per 30s burst
 *   chat_action  — 30/day,  max 2 per 30s burst
 *   friend_action — 20/day, max 1 per 30s burst
 *
 * Uses in-memory storage (Map). Can be extended to Redis for multi-instance.
 *
 * Ported from ZaloCRM reference: zalo-rate-limiter.ts
 */
export type RateLimitCategory = 'message' | 'reaction' | 'chat_action' | 'friend_action';
export interface RateLimitResult {
    allowed: boolean;
    reason?: string;
    remaining: {
        daily: number;
        burst: number;
    };
    category: RateLimitCategory;
}
/**
 * Check if an operation is allowed under rate limits.
 * Does NOT consume a token — call `recordAction()` after successful operation.
 */
export declare function checkLimits(accountId: string, category?: RateLimitCategory): RateLimitResult;
/**
 * Record a successful operation — consumes rate limit tokens.
 * Call AFTER the operation succeeds (not before).
 */
export declare function recordAction(accountId: string, category?: RateLimitCategory): void;
/**
 * Get current rate limit status for an account.
 * Useful for the frontend to show remaining quotas.
 */
export declare function getRateLimitStatus(accountId: string): Record<RateLimitCategory, {
    daily: number;
    burst: number;
    dailyLimit: number;
    burstLimit: number;
}>;
/**
 * Legacy compatibility — simple boolean check for message category.
 * Matches the old checkRateLimit() signature used in chat-routes.ts
 */
export declare function checkRateLimitCompat(accountId: string): boolean;
/**
 * Legacy compatibility — record a message send.
 * Matches the old usage pattern in chat-routes.ts
 */
export declare function recordSendCompat(accountId: string): void;
