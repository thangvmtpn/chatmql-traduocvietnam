/**
 * redis-cache.ts — Simple Redis-backed key/value cache utility for BizCRM
 *
 * Reuses the shared IORedis connection from queue.ts.
 * Prefix: `bizcrm:kv:` (separate from plugin's `bizcrm:cache:`)
 *
 * Use for per-entity granular caching where the plugin's request-level
 * caching is not appropriate (e.g. individual sticker detail by ID).
 *
 * Usage:
 *   await redisCache.get<StickerDetail>('stk:detail:123')
 *   await redisCache.set('stk:detail:123', data, 86400)  // 24h TTL
 */
import { redisConnection } from './queue.js';
import { logger } from './logger.js';
const CACHE_PREFIX = 'bizcrm:kv:';
export const redisCache = {
    /** Get cached value. Returns null if miss or expired. */
    async get(key) {
        try {
            const raw = await redisConnection.get(CACHE_PREFIX + key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch (err) {
            logger.warn({ key, err }, '[redis-cache] GET parse error');
            return null;
        }
    },
    /** Set value with TTL in seconds. */
    async set(key, data, ttlSeconds) {
        try {
            await redisConnection.set(CACHE_PREFIX + key, JSON.stringify(data), 'EX', ttlSeconds);
        }
        catch (err) {
            logger.warn({ key, err }, '[redis-cache] SET error');
        }
    },
    /** Delete a cached key. */
    async del(key) {
        try {
            await redisConnection.del(CACHE_PREFIX + key);
        }
        catch (err) {
            logger.warn({ key, err }, '[redis-cache] DEL error');
        }
    },
};
//# sourceMappingURL=redis-cache.js.map