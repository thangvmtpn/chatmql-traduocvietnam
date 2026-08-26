import { redisCache } from '../../shared/redis-cache.js';
import { getPoolEntry } from './zalo-pool.js';
import { logger } from '../../shared/logger.js';
// In-memory Promise map to prevent Cache Stampede (Thundering Herd) when rebuilding alias maps
const rebuildPromises = new Map();
/**
 * Resolves a contact's custom alias (biệt danh) using Zalo's getAliasList.
 * Utilizes `updateTime` as an index cache key to avoid paginating through thousands
 * of friends unnecessarily.
 */
export async function resolveZaloAlias(accountId, externalUid) {
    const entry = getPoolEntry(accountId);
    if (!entry?.api || typeof entry.api.getAliasList !== 'function')
        return undefined;
    try {
        // Fast path: if a rebuild is already in-flight, skip the API probe entirely
        // and just await the existing promise. This prevents N concurrent callers
        // from each hitting getAliasList(200, 1) during burst traffic.
        const existingRebuild = rebuildPromises.get(accountId);
        if (existingRebuild) {
            const aliasMap = await existingRebuild;
            return aliasMap[externalUid];
        }
        // 1. Check Redis cache first (no API call needed if cache is fresh)
        const cacheKey = `zalo:alias:${accountId}`;
        const cached = await redisCache.get(cacheKey);
        // 2. Fetch the first page to get the `updateTime` (index)
        const firstPage = await entry.api.getAliasList(200, 1);
        if (!firstPage || !firstPage.updateTime)
            return undefined;
        // 3. Cache hit with matching index → return immediately
        if (cached && cached.updateTime === firstPage.updateTime) {
            return cached.aliasMap[externalUid];
        }
        // 4. Cache Miss or `updateTime` mismatch: Rebuild the full map (deduped)
        let rebuildPromise = rebuildPromises.get(accountId);
        if (!rebuildPromise) {
            rebuildPromise = (async () => {
                try {
                    logger.info(`[zalo-alias] Cache miss/update for account ${accountId}. Rebuilding alias map...`);
                    const aliasMap = {};
                    // Process first page (already fetched above)
                    const firstItems = firstPage.items || [];
                    for (const item of firstItems) {
                        if (item.alias && item.userId) {
                            aliasMap[item.userId] = item.alias;
                        }
                    }
                    // If there might be more items, paginate
                    let page = 2;
                    let hasMore = firstItems.length >= 200;
                    while (hasMore) {
                        try {
                            const next = await entry.api.getAliasList(200, page);
                            const items = next?.items || [];
                            for (const item of items) {
                                if (item.alias && item.userId) {
                                    aliasMap[item.userId] = item.alias;
                                }
                            }
                            if (items.length < 200 || page >= 20) { // Max 20 pages (4000 friends) to prevent infinite loops
                                hasMore = false;
                            }
                            else {
                                page++;
                            }
                        }
                        catch (err) {
                            logger.warn({ err }, `[zalo-alias] Error fetching alias list page ${page}`);
                            hasMore = false;
                        }
                    }
                    // 5. Save to Redis (TTL: 24 hours just in case, though it relies on updateTime)
                    await redisCache.set(cacheKey, {
                        updateTime: firstPage.updateTime,
                        aliasMap,
                    }, 86400);
                    return aliasMap;
                }
                finally {
                    rebuildPromises.delete(accountId);
                }
            })();
            rebuildPromises.set(accountId, rebuildPromise);
        }
        const aliasMap = await rebuildPromise;
        return aliasMap[externalUid];
    }
    catch (err) {
        logger.warn({ err }, '[zalo-alias] resolveZaloAlias error');
        return undefined;
    }
}
//# sourceMappingURL=zalo-alias.js.map