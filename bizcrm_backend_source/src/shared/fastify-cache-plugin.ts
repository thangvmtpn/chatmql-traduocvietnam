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
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createHash } from 'node:crypto'
import { redisConnection } from './queue.js'
import { logger } from './logger.js'

// ── Types ───────────────────────────────────────────────────────────────────

export interface RouteCacheConfig {
  /** TTL in seconds */
  ttl: number
  /** Cache isolation scope (default: 'global') */
  scope?: 'global' | 'org' | 'user'
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
  keyParams?: string[]
  /** Skip cache if this returns false */
  condition?: (req: FastifyRequest) => boolean
}

// Augment Fastify route config type
declare module 'fastify' {
  interface FastifyContextConfig {
    cache?: RouteCacheConfig
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'bizcrm:cache:'
/** Max key length before params are hashed (Redis max key = 512MB, but readability matters) */
const KEY_HASH_THRESHOLD = 128
const CACHE_HIT_HEADER = 'x-cache'

// ── Plugin ──────────────────────────────────────────────────────────────────

async function cachePlugin(app: FastifyInstance) {
  // preHandler: check cache → short-circuit if HIT
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const cacheConfig = request.routeOptions.config?.cache
    if (!cacheConfig) return // no cache config → skip

    // Optional condition gate
    if (cacheConfig.condition && !cacheConfig.condition(request)) return

    const key = buildCacheKey(request, cacheConfig)
    ;(request as any).__cacheKey = key

    try {
      const cached = await redisConnection.get(key)
      if (cached) {
        // Remaining TTL for accurate Cache-Control
        const remainingTtl = await redisConnection.ttl(key)
        const maxAge = remainingTtl > 0 ? remainingTtl : cacheConfig.ttl

        reply.header(CACHE_HIT_HEADER, 'HIT')
        reply.header('cache-control', `public, max-age=${maxAge}`)
        reply.header('content-type', 'application/json; charset=utf-8')
        reply.send(cached) // raw JSON string — no double-serialize
        return reply // short-circuit
      }
    } catch (err) {
      // Cache read failure → proceed without cache
      logger.warn({ key, err }, '[cache] Redis GET failed, proceeding uncached')
    }
  })

  // onSend: store response in cache after handler completes
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const key = (request as any).__cacheKey as string | undefined
    if (!key) return payload // no cache key → not a cached route

    // Only cache successful responses
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload

    // Already a cache hit → don't re-cache
    if (reply.getHeader(CACHE_HIT_HEADER) === 'HIT') return payload

    const ttl = request.routeOptions.config?.cache?.ttl
    if (!ttl) return payload

    try {
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
      await redisConnection.set(key, body, 'EX', ttl)
      reply.header(CACHE_HIT_HEADER, 'MISS')
      reply.header('cache-control', `public, max-age=${ttl}`)
    } catch (err) {
      logger.warn({ key, err }, '[cache] Redis SET failed')
    }

    return payload
  })

  logger.info('[cache] Fastify route-cache plugin registered')
}

// ── Key Builder ─────────────────────────────────────────────────────────────

function buildCacheKey(request: FastifyRequest, config: RouteCacheConfig): string {
  const method = request.method
  // Use route pattern (e.g. "/api/v1/stickers/category/:cateId") for grouping
  const routeUrl = request.routeOptions.url || request.url

  // Build scope segment
  let scopeSegment: string
  switch (config.scope) {
    case 'org': {
      const user = request.user as { orgId?: string } | undefined
      scopeSegment = `o:${user?.orgId || 'anon'}`
      break
    }
    case 'user': {
      const user = request.user as { id?: string } | undefined
      scopeSegment = `u:${user?.id || 'anon'}`
      break
    }
    default:
      scopeSegment = 'g'
  }

  // Build params segment
  const paramParts: string[] = []
  const params = (request.params || {}) as Record<string, string>
  const query = (request.query || {}) as Record<string, string>
  const user = (request.user || {}) as Record<string, string>

  if (config.keyParams) {
    // Explicit key list — respect prefixes
    for (const raw of config.keyParams) {
      if (raw.startsWith('@')) {
        // @key → from request.user
        const k = raw.slice(1)
        const v = user[k]
        if (v != null) paramParts.push(`u:${k}=${v}`)
      } else {
        // No prefix → auto-detect from params first, then query
        const v = params[raw] ?? query[raw]
        if (v != null) paramParts.push(`${raw}=${v}`)
      }
    }
  } else {
    // No keyParams → collect all params + query (sorted, skip accountId)
    for (const [k, v] of Object.entries(params).sort()) {
      paramParts.push(`p:${k}=${v}`)
    }
    for (const [k, v] of Object.entries(query).sort()) {
      if (k === 'accountId') continue
      paramParts.push(`q:${k}=${v}`)
    }
  }

  const paramStr = paramParts.join('&')

  // Build full key
  const rawKey = `${CACHE_PREFIX}${method}:${routeUrl}|${scopeSegment}|${paramStr}`

  // Hash if too long → keep readable prefix + hash suffix
  if (rawKey.length > KEY_HASH_THRESHOLD) {
    const hash = createHash('sha256').update(paramStr).digest('hex').slice(0, 16)
    const prefix = `${CACHE_PREFIX}${method}:${routeUrl}|${scopeSegment}`
    return `${prefix}|h:${hash}`
  }

  return rawKey
}

export default fp(cachePlugin, {
  name: 'fastify-route-cache',
  fastify: '5.x',
})
