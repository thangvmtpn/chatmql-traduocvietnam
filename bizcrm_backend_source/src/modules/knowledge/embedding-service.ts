/**
 * embedding-service.ts — Text embedding via OpenAI-compatible API + pgvector storage.
 *
 * - embedText: POST /v1/embeddings → number[1536] | null (graceful on error/no key)
 * - toVectorLiteral: number[] → '[x,y,…]' string for pgvector cast
 * - storeKbEmbedding: raw SQL UPDATE on knowledge_entries.embedding
 * - retrieveKbSemantic: cosine-similarity search via <=> operator
 * - backfillEmbeddings: idempotent on-demand embed for entries where embedding IS NULL
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma-client.js'
import { getProviderApiKey } from '../ai/ai-config-service.js'
import { getProviderConfig } from '../ai/provider-registry.js'
import { logUsage } from '../ai/ai-service.js'
import { logger } from '../../shared/logger.js'
import { deriveKbLabel, type KbSnippet } from './kb-service.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_EMBEDDING_PROVIDER = 'openai'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const MAX_INPUT_CHARS = 8_000
const EMBED_TIMEOUT_MS = 15_000
const EMBED_BATCH_TIMEOUT_MS = 30_000
const EMBED_BATCH_SIZE = 96 // inputs per /v1/embeddings request (well under provider limits)

/**
 * Minimum cosine similarity (0..1) a semantic hit must reach to count as
 * "relevant". Below this, a hit is OFF-TOPIC noise (top-K always returns the
 * nearest vectors even when nothing actually matches) and is dropped so it can
 * never leak into the reply's grounding. 0.35 measured on text-embedding-3-small:
 * cleanly keeps same-topic FAQs (~0.42+) and drops cross-topic ones (~0.20-0.34).
 * Tunable per query via opts.minScore (Master/criteria can raise it for sensitive
 * intents). Keyword (hybrid) backfill still recovers exact-term matches.
 */
export const DEFAULT_RAG_MIN_SCORE = 0.35

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a float array to pgvector literal: '[0.1,0.2,…]' */
export function toVectorLiteral(arr: number[]): string {
  return '[' + arr.join(',') + ']'
}

// ── Embedding provider resolution ─────────────────────────────────────────────

type EmbedConfig = {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}

async function resolveEmbedConfig(orgId: string): Promise<EmbedConfig | null> {
  // Check if org has a custom embedding provider configured in AiConfig
  const aiConfig = await prisma.aiConfig.findUnique({
    where: { orgId },
    select: { embeddingProvider: true, embeddingModel: true },
  })

  const provider = aiConfig?.embeddingProvider || DEFAULT_EMBEDDING_PROVIDER
  const model = aiConfig?.embeddingModel || DEFAULT_EMBEDDING_MODEL

  const providerDef = getProviderConfig(provider)
  if (!providerDef) {
    logger.warn({ orgId, provider }, '[embedding] Unknown provider — falling back to openai')
    return resolveWithProvider(orgId, DEFAULT_EMBEDDING_PROVIDER, DEFAULT_EMBEDDING_MODEL)
  }

  const apiKey = await getProviderApiKey(orgId, provider)
  if (!apiKey) {
    // Try default provider as fallback
    if (provider !== DEFAULT_EMBEDDING_PROVIDER) {
      return resolveWithProvider(orgId, DEFAULT_EMBEDDING_PROVIDER, DEFAULT_EMBEDDING_MODEL)
    }
    return null
  }

  return { provider, model, apiKey, baseUrl: providerDef.baseUrl }
}

async function resolveWithProvider(orgId: string, provider: string, model: string): Promise<EmbedConfig | null> {
  const providerDef = getProviderConfig(provider)
  if (!providerDef) return null
  const apiKey = await getProviderApiKey(orgId, provider)
  if (!apiKey) return null
  return { provider, model, apiKey, baseUrl: providerDef.baseUrl }
}

// ── Core embed ────────────────────────────────────────────────────────────────

/**
 * Embed text for an org. Returns 1536-float array or null on error/no key.
 * Uses AiConfig.embeddingProvider/Model if set; otherwise openai/text-embedding-3-small.
 */
export async function embedText(orgId: string, text: string): Promise<number[] | null> {
  const cfg = await resolveEmbedConfig(orgId)
  if (!cfg) {
    logger.debug({ orgId }, '[embedding] No API key configured — skipping embed')
    return null
  }

  const input = text.slice(0, MAX_INPUT_CHARS)
  const url = `${cfg.baseUrl}/v1/embeddings`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, input }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logger.warn({ orgId, status: response.status, body: body.slice(0, 200) }, '[embedding] API error')
      return null
    }

    const data = await response.json() as {
      data?: Array<{ embedding: number[] }>
      usage?: { prompt_tokens?: number }
    }

    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      logger.warn({ orgId, got: embedding?.length }, '[embedding] Unexpected embedding shape')
      return null
    }

    // Cost accounting — embeds are cheap but real (every RAG query + backfill).
    // Excluded from the daily call quota (see ai-config-service), counted in cost.
    logUsage({
      orgId,
      provider: cfg.provider,
      model: cfg.model,
      type: 'embedding',
      raw: { text: '', tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: 0 },
      feature: 'embedding',
    }).catch(() => { /* non-fatal */ })

    return embedding
  } catch (err) {
    const isAbort = (err as Error).name === 'AbortError'
    logger.warn({ orgId, err: isAbort ? 'timeout' : (err as Error).message }, '[embedding] embedText failed')
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Batch-embed many texts using ONE API call per chunk (~96 inputs) instead of one
 * call per text. Returns vectors aligned to the input order; an entry is null when
 * that item (or its whole chunk) failed — callers store the rest and can retry nulls.
 * Use for bulk paths (import, backfill) to avoid hammering the provider with N calls.
 */
export async function embedTexts(orgId: string, texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = new Array(texts.length).fill(null)
  if (texts.length === 0) return out

  const cfg = await resolveEmbedConfig(orgId)
  if (!cfg) {
    logger.debug({ orgId }, '[embedding] No API key configured — skipping batch embed')
    return out
  }
  const url = `${cfg.baseUrl}/v1/embeddings`

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const slice = texts.slice(start, start + EMBED_BATCH_SIZE)
    // Each input must be non-empty; cap per-item length like the single embed.
    const input = slice.map((t) => (t && t.trim() ? t : '-').slice(0, MAX_INPUT_CHARS))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), EMBED_BATCH_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, input }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        logger.warn({ orgId, status: response.status, body: body.slice(0, 200) }, '[embedding] batch API error')
        continue // leave this chunk's slots null — caller can backfill later
      }
      const data = await response.json() as {
        data?: Array<{ embedding: number[]; index?: number }>
        usage?: { prompt_tokens?: number }
      }
      const arr = data?.data ?? []
      for (let j = 0; j < arr.length; j++) {
        const item = arr[j]
        const vec = item?.embedding
        // OpenAI returns results in input order with an explicit `index`; fall back
        // to array position if a provider omits it.
        const pos = typeof item?.index === 'number' ? item.index : j
        if (Array.isArray(vec) && vec.length === EMBEDDING_DIMENSIONS) out[start + pos] = vec
      }

      logUsage({
        orgId, provider: cfg.provider, model: cfg.model, type: 'embedding',
        raw: { text: '', tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: 0 },
        feature: 'embedding',
      }).catch(() => { /* non-fatal */ })
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError'
      logger.warn({ orgId, err: isAbort ? 'timeout' : (err as Error).message }, '[embedding] embedTexts chunk failed')
      // leave chunk null
    } finally {
      clearTimeout(timeout)
    }
  }
  return out
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Write the embedding vector to knowledge_entries via raw SQL.
 * The vector literal is the only inlined value; ids/orgId are parameterized.
 */
export async function storeKbEmbedding(
  orgId: string,
  entryId: string,
  vec: number[],
): Promise<void> {
  const literal = toVectorLiteral(vec)
  // NOTE: literal is computed from the float array (no user input) — injection-safe.
  // orgId and entryId are Prisma parameters.
  await prisma.$executeRaw(
    Prisma.sql`UPDATE knowledge_entries SET embedding = ${literal}::vector WHERE id = ${entryId} AND org_id = ${orgId}`,
  )
}

// ── Semantic retrieval ────────────────────────────────────────────────────────

type SemanticRow = { id: string; title: string | null; content: string; type: string; score: number }

const MAX_SNIPPET_CHARS = 400

/**
 * Hybrid KB retrieval: cosine semantic search (pgvector <=>) with a relevance
 * threshold, plus keyword backfill for recall.
 *
 * 1. Semantic: nearest vectors, each scored (cosine similarity 0..1). Hits below
 *    `minScore` are DROPPED — they are off-topic noise, not grounding.
 * 2. Backfill: if strong semantic hits < topK, fill the gap with keyword matches
 *    (exact-term overlap the embedding missed). Keyword hits carry score=null.
 * Falls back to pure keyword search when no embedding is available (no API key).
 */
export async function retrieveKbSemantic(
  orgId: string,
  query: string,
  topK: number,
  keywordFallback: (orgId: string, query: string, topK: number) => Promise<KbSnippet[]>,
  opts?: { categoryIds?: string[]; format?: string; minScore?: number },
): Promise<KbSnippet[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const vec = await embedText(orgId, trimmed)
  if (!vec) {
    // No embedding available — use keyword search (already category-scoped by caller's fallback)
    return keywordFallback(orgId, trimmed, topK)
  }

  const literal = toVectorLiteral(vec)
  const minScore = opts?.minScore ?? DEFAULT_RAG_MIN_SCORE

  // Guardrail: restrict to allowed knowledge categories (empty = no limit).
  // Compare as text (category_id::text) so we bind plain string params — avoids
  // Prisma's array/uuid-cast pitfalls (operator does not exist: text = uuid).
  const catFilter = opts?.categoryIds && opts.categoryIds.length > 0
    ? Prisma.sql`AND category_id::text IN (${Prisma.join(opts.categoryIds)})`
    : Prisma.empty
  const fmtFilter = opts?.format ? Prisma.sql`AND format = ${opts.format}` : Prisma.empty

  // orgId is parameterized; literal is derived from float array only — no user input.
  // score = cosine similarity (1 - distance); used to drop off-topic hits.
  const rows = await prisma.$queryRaw<SemanticRow[]>(
    Prisma.sql`
      SELECT id, title, content, type, (1 - (embedding <=> ${literal}::vector)) AS score
      FROM knowledge_entries
      WHERE org_id = ${orgId}
        AND status = 'active'
        AND embedding IS NOT NULL
        ${catFilter}
        ${fmtFilter}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${topK}
    `,
  )

  // Keep only relevant hits — below threshold = off-topic noise, drop it.
  const strong = rows.filter((r) => Number(r.score) >= minScore)
  const out: KbSnippet[] = strong.map((r) => ({
    id: r.id,
    title: deriveKbLabel(r.title, r.content),
    content: r.content.length > MAX_SNIPPET_CHARS ? r.content.slice(0, MAX_SNIPPET_CHARS) + '…' : r.content,
    type: r.type,
    score: Math.round(Number(r.score) * 1000) / 1000,
  }))

  // Hybrid backfill: top up with keyword matches (exact-term recall) when the
  // relevant semantic set is thin. Keyword requires token overlap, so it cannot
  // reintroduce the cross-topic noise the threshold just removed.
  if (out.length < topK) {
    const seen = new Set(out.map((r) => r.id))
    for (const kw of await keywordFallback(orgId, trimmed, topK)) {
      if (out.length >= topK) break
      if (!seen.has(kw.id)) { out.push({ ...kw, score: null }); seen.add(kw.id) }
    }
  }

  return out
}

// ── Per-entry embed (single source of truth for the KB embed text) ──────────────

/**
 * Build the text we embed for a KB entry. Includes `keywords` (alt phrasings) so
 * they boost semantic recall. MUST stay the only place that builds this string —
 * the on-save worker and the backfill both go through embedAndStoreKbEntry so an
 * old entry can never end up with a vector that ignores its keywords.
 */
export function kbEmbedText(e: { title: string | null; keywords: string | null; content: string }): string {
  return [e.title, e.keywords, e.content].filter(Boolean).join('\n\n')
}

/** Embed one KB entry by id and store the vector. No-op if not found / no API key. */
export async function embedAndStoreKbEntry(orgId: string, entryId: string): Promise<boolean> {
  const entry = await prisma.knowledgeEntry.findFirst({
    where: { id: entryId, orgId },
    select: { title: true, keywords: true, content: true },
  })
  if (!entry) return false // entry deleted — skip silently
  const vec = await embedText(orgId, kbEmbedText(entry))
  if (!vec) return false
  await storeKbEmbedding(orgId, entryId, vec)
  return true
}

// ── Backfill ──────────────────────────────────────────────────────────────────

/**
 * Idempotent backfill: re-embed active entries via embedAndStoreKbEntry.
 * - default: only entries missing a vector (embedding IS NULL) — cheap gap-fill.
 * - force=true: re-embed ALL active entries — use after the embed text changes
 *   (e.g. keywords were added to entries embedded before keywords counted).
 * Call on demand (admin endpoint). NOT called on startup.
 */
export async function backfillEmbeddings(
  orgId: string,
  opts: { force?: boolean } = {},
): Promise<{ embedded: number; failed: number }> {
  const rows = opts.force
    ? await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM knowledge_entries WHERE org_id = ${orgId} AND status = 'active'`,
      )
    : await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM knowledge_entries WHERE org_id = ${orgId} AND status = 'active' AND embedding IS NULL`,
      )

  let embedded = 0
  let failed = 0
  for (const r of rows) {
    if (await embedAndStoreKbEntry(orgId, r.id)) embedded++
    else failed++
  }

  logger.info({ orgId, embedded, failed, force: !!opts.force }, '[embedding] KB backfill complete')
  return { embedded, failed }
}
