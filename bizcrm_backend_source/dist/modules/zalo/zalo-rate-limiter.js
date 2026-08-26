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
/** Category-specific limits */
const CATEGORY_LIMITS = {
    message: { dailyLimit: 200, burstLimit: 5, burstWindowMs: 30_000 },
    reaction: { dailyLimit: 50, burstLimit: 3, burstWindowMs: 30_000 },
    chat_action: { dailyLimit: 30, burstLimit: 2, burstWindowMs: 30_000 },
    friend_action: { dailyLimit: 20, burstLimit: 1, burstWindowMs: 30_000 },
};
/** In-memory storage per account */
const buckets = new Map();
/** Get midnight reset timestamp (Vietnam time UTC+7) */
function getVNMidnight() {
    const now = new Date();
    // Shift to UTC+7
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const vnMidnight = new Date(vnNow);
    vnMidnight.setUTCHours(0, 0, 0, 0);
    // Add 1 day for next reset
    vnMidnight.setUTCDate(vnMidnight.getUTCDate() + 1);
    // Shift back to UTC
    return vnMidnight.getTime() - 7 * 60 * 60 * 1000;
}
/** Ensure bucket exists for an account */
function ensureBucket(accountId) {
    let bucket = buckets.get(accountId);
    if (!bucket) {
        bucket = { daily: {}, burst: {} };
        buckets.set(accountId, bucket);
    }
    return bucket;
}
/**
 * Check if an operation is allowed under rate limits.
 * Does NOT consume a token — call `recordAction()` after successful operation.
 */
export function checkLimits(accountId, category = 'message') {
    const limits = CATEGORY_LIMITS[category];
    if (!limits) {
        return { allowed: true, remaining: { daily: 999, burst: 999 }, category };
    }
    const bucket = ensureBucket(accountId);
    const now = Date.now();
    // ── Daily limit check ───────────────────────────────────────────
    let daily = bucket.daily[category];
    if (!daily || now >= daily.resetAt) {
        daily = { count: 0, resetAt: getVNMidnight() };
        bucket.daily[category] = daily;
    }
    const dailyRemaining = limits.dailyLimit - daily.count;
    if (dailyRemaining <= 0) {
        return {
            allowed: false,
            reason: `Đã đạt giới hạn ${limits.dailyLimit} ${category} trong ngày. Thử lại vào ngày mai.`,
            remaining: { daily: 0, burst: 0 },
            category,
        };
    }
    // ── Burst limit check ───────────────────────────────────────────
    let burst = bucket.burst[category];
    if (!burst) {
        burst = { timestamps: [] };
        bucket.burst[category] = burst;
    }
    // Prune old timestamps outside the window
    const windowStart = now - limits.burstWindowMs;
    burst.timestamps = burst.timestamps.filter(t => t > windowStart);
    const burstRemaining = limits.burstLimit - burst.timestamps.length;
    if (burstRemaining <= 0) {
        const oldestInWindow = burst.timestamps[0];
        const waitMs = oldestInWindow + limits.burstWindowMs - now;
        const waitSec = Math.ceil(waitMs / 1000);
        return {
            allowed: false,
            reason: `Gửi quá nhanh. Vui lòng đợi ${waitSec}s trước khi ${category} tiếp.`,
            remaining: { daily: dailyRemaining, burst: 0 },
            category,
        };
    }
    return {
        allowed: true,
        remaining: { daily: dailyRemaining, burst: burstRemaining },
        category,
    };
}
/**
 * Record a successful operation — consumes rate limit tokens.
 * Call AFTER the operation succeeds (not before).
 */
export function recordAction(accountId, category = 'message') {
    const bucket = ensureBucket(accountId);
    const now = Date.now();
    // Increment daily counter
    let daily = bucket.daily[category];
    if (!daily || now >= daily.resetAt) {
        daily = { count: 0, resetAt: getVNMidnight() };
        bucket.daily[category] = daily;
    }
    daily.count++;
    // Record burst timestamp
    let burst = bucket.burst[category];
    if (!burst) {
        burst = { timestamps: [] };
        bucket.burst[category] = burst;
    }
    burst.timestamps.push(now);
}
/**
 * Get current rate limit status for an account.
 * Useful for the frontend to show remaining quotas.
 */
export function getRateLimitStatus(accountId) {
    const result = {};
    const now = Date.now();
    for (const [cat, limits] of Object.entries(CATEGORY_LIMITS)) {
        const category = cat;
        const bucket = buckets.get(accountId);
        let dailyUsed = 0;
        if (bucket?.daily[category] && now < bucket.daily[category].resetAt) {
            dailyUsed = bucket.daily[category].count;
        }
        let burstUsed = 0;
        if (bucket?.burst[category]) {
            const windowStart = now - limits.burstWindowMs;
            burstUsed = bucket.burst[category].timestamps.filter(t => t > windowStart).length;
        }
        result[category] = {
            daily: limits.dailyLimit - dailyUsed,
            burst: limits.burstLimit - burstUsed,
            dailyLimit: limits.dailyLimit,
            burstLimit: limits.burstLimit,
        };
    }
    return result;
}
/**
 * Legacy compatibility — simple boolean check for message category.
 * Matches the old checkRateLimit() signature used in chat-routes.ts
 */
export function checkRateLimitCompat(accountId) {
    const result = checkLimits(accountId, 'message');
    return result.allowed;
}
/**
 * Legacy compatibility — record a message send.
 * Matches the old usage pattern in chat-routes.ts
 */
export function recordSendCompat(accountId) {
    recordAction(accountId, 'message');
}
//# sourceMappingURL=zalo-rate-limiter.js.map