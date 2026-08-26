/**
 * fastify-cache-plugin.ts — Declarative route-level Redis caching for Fastify
 *
 * Register once, then add `config.cache` to any route for automatic caching.
 *
 * Cache Key Format (human-readable, auto-hashed when too long):
 *   bizcrm:cache:{METHOD}:{routePattern}|{scope}|{params}
 *
 * With keyParams (explicit):
 *   bizcrm:cache:GET:/api/v1/stickers/category/:cateId|g|cateId=1
 *   bizcrm:cache:GET:/api/v1/stickers/search|g|keyword=hello&limit=50
 *   bizcrm:cache:GET:/api/v1/contacts|o:9f1a|page=1&limit=20&u:orgId=9f1a
 *
 * Without keyParams (all params + query auto-collected):
 *   bizcrm:cache:GET:/api/v1/stickers/category/:cateId|g|p:cateId=1
 *   bizcrm:cache:GET:/api/v1/contacts|o:9f1a|q:limit=20&q:page=1
 *
 * Long keys (>128 chars) → auto-hashed:
 *   bizcrm:cache:GET:/api/v1/stickers/search|g|h:a3f2c1b4e5d67890
 *
 * Scope prefixes:
 *   g  = global (shared across all users)
 *   o: = org-scoped (per orgId)
 *   u: = user-scoped (per userId)
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
export interface RouteCacheConfig {
    /** TTL in seconds */
    ttl: number;
    /** Cache isolation scope (default: 'global') */
    scope?: 'global' | 'org' | 'user';
    /**
     * Keys to include in cache key (default: all params + query).
     *
     * Prefix conventions:
     *   'key'   — auto-detect from path params or query string
     *   '@key'  — from request.user (e.g. '@orgId', '@id')
     *
     * Examples:
     *   keyParams: ['cateId']                    // path param only
     *   keyParams: ['keyword', 'limit']           // query params
     *   keyParams: ['page', '@orgId']             // query + user prop
     */
    keyParams?: string[];
    /** Skip cache if this returns false */
    condition?: (req: FastifyRequest) => boolean;
}
declare module 'fastify' {
    interface FastifyContextConfig {
        cache?: RouteCacheConfig;
    }
}
declare function cachePlugin(app: FastifyInstance): Promise<void>;
declare const _default: typeof cachePlugin;
export default _default;
