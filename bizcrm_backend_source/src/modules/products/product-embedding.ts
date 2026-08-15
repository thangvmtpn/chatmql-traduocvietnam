/**
 * product-embedding.ts — pgvector storage + semantic search for products.
 * Reuses embedText/toVectorLiteral from the KB embedding-service.
 * Vector SQL is centralized here and ALWAYS parameterizes org_id (anti
 * cross-company): no raw vector query for products lives anywhere else.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma-client.js'
import { embedText, embedTexts, toVectorLiteral, DEFAULT_RAG_MIN_SCORE } from '../knowledge/embedding-service.js'

/** Build the text we embed for a product. */
export function productEmbedText(p: {
  name: string; keywords?: string | null; description?: string | null
}): string {
  return [p.name, p.keywords, p.description].filter(Boolean).join('\n\n')
}

/** Embed a product by id and store the vector. No-op if no API key. */
export async function embedAndStoreProduct(orgId: string, productId: string): Promise<boolean> {
  const p = await prisma.product.findFirst({
    where: { id: productId, orgId },
    select: { name: true, keywords: true, description: true },
  })
  if (!p) return false
  const vec = await embedText(orgId, productEmbedText(p))
  if (!vec) return false
  await storeProductEmbedding(orgId, productId, vec)
  return true
}

/**
 * Batch-embed many products in as few API calls as possible (one request per
 * ~96 products) and store each vector. Use for bulk paths (import, backfill)
 * instead of N single-product calls. A product whose embed failed is left for a
 * later backfill (its vector slot comes back null).
 */
export async function embedAndStoreProductsBatch(orgId: string, productIds: string[]): Promise<{ embedded: number; failed: number }> {
  if (productIds.length === 0) return { embedded: 0, failed: 0 }
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, orgId },
    select: { id: true, name: true, keywords: true, description: true },
  })
  if (products.length === 0) return { embedded: 0, failed: 0 }

  const vectors = await embedTexts(orgId, products.map((p) => productEmbedText(p)))
  let embedded = 0
  let failed = 0
  for (let i = 0; i < products.length; i++) {
    const vec = vectors[i]
    if (vec) { await storeProductEmbedding(orgId, products[i].id, vec); embedded++ }
    else failed++
  }
  return { embedded, failed }
}

/** Idempotent: embed all active products missing a vector (batched API calls). */
export async function backfillProductEmbeddings(orgId: string): Promise<{ embedded: number; failed: number }> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM products WHERE org_id = ${orgId} AND status = 'active' AND embedding IS NULL`,
  )
  return embedAndStoreProductsBatch(orgId, rows.map((r) => r.id))
}

export async function storeProductEmbedding(orgId: string, productId: string, vec: number[]): Promise<void> {
  const literal = toVectorLiteral(vec) // derived from float array only — injection-safe
  await prisma.$executeRaw(
    Prisma.sql`UPDATE products SET embedding = ${literal}::vector WHERE id = ${productId} AND org_id = ${orgId}`,
  )
}

export type ProductSemanticRow = {
  id: string; name: string; description: string | null; price: number | null
  priceMax: number | null; priceType: string; currency: string; categoryId: string | null
  /** Cosine similarity 0..1 for semantic hits; null for keyword-only matches. */
  score?: number | null
}

/**
 * Hybrid product retrieval: cosine semantic search (pgvector <=>) with a
 * relevance threshold, plus keyword backfill (name/code/keywords) for recall.
 * Below `minScore` a semantic hit is off-topic noise and is dropped so it can
 * never become grounding. org_id is ALWAYS filtered (anti cross-company).
 */
export async function retrieveProductSemantic(
  orgId: string,
  query: string,
  topK: number,
  opts: { categoryId?: string; categoryIds?: string[]; minScore?: number } = {},
): Promise<ProductSemanticRow[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const vec = await embedText(orgId, trimmed)
  if (!vec) return retrieveProductKeyword(orgId, trimmed, topK, opts.categoryIds)
  const literal = toVectorLiteral(vec)
  const minScore = opts.minScore ?? DEFAULT_RAG_MIN_SCORE
  // Build the optional category filter conditionally — avoids binding a NULL
  // parameter with a ::uuid cast (Postgres can't infer its type).
  // categoryIds (guardrail allow-list, empty = no limit) takes precedence over
  // the single categoryId filter.
  try {
    const catFilter = opts.categoryIds && opts.categoryIds.length > 0
      ? Prisma.sql`AND category_id::text IN (${Prisma.join(opts.categoryIds)})`
      : opts.categoryId
        ? Prisma.sql`AND category_id = ${opts.categoryId}::uuid`
        : Prisma.empty

    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; description: string | null; price: Prisma.Decimal | null; price_max: Prisma.Decimal | null; price_type: string; currency: string; category_id: string | null; score: number }>>(
      Prisma.sql`
        SELECT id, name, description, price, price_max, price_type, currency, category_id,
               (1 - (embedding <=> ${literal}::vector)) AS score
        FROM products
        WHERE org_id = ${orgId}
          AND status = 'active'
          AND embedding IS NOT NULL
          ${catFilter}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${topK}
      `,
    )
    const out: ProductSemanticRow[] = rows
      .filter((r) => Number(r.score) >= minScore)
      .map((r) => ({
        id: r.id, name: r.name, description: r.description,
        price: r.price != null ? Number(r.price) : null,
        priceMax: r.price_max != null ? Number(r.price_max) : null,
        priceType: r.price_type, currency: r.currency, categoryId: r.category_id,
        score: Math.round(Number(r.score) * 1000) / 1000,
      }))

    // Hybrid backfill: exact name/code/keyword matches the embedding ranked too low.
    if (out.length < topK) {
      const seen = new Set(out.map((r) => r.id))
      for (const kw of await retrieveProductKeyword(orgId, trimmed, topK, opts.categoryIds)) {
        if (out.length >= topK) break
        if (!seen.has(kw.id)) { out.push(kw); seen.add(kw.id) }
      }
    }
    return out
  } catch (err) {
    return retrieveProductKeyword(orgId, trimmed, topK, opts.categoryIds)
  }
}

/** Keyword product search (name/code/keywords/description token overlap). score=null. */
async function retrieveProductKeyword(
  orgId: string, query: string, topK: number, categoryIds?: string[],
): Promise<ProductSemanticRow[]> {
  const clean = query.trim().toLowerCase()
  if (!clean) return []

  const tokens = clean
    .split(/[\s,.;:!?+-_/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 10)

  if (tokens.length === 0) return []

  // Pull active candidates for this org / category filter
  const rows = await prisma.product.findMany({
    where: {
      orgId,
      status: 'active',
      ...(categoryIds?.length ? { categoryId: { in: categoryIds } } : {}),
      OR: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: 'insensitive' as const } },
          { description: { contains: t, mode: 'insensitive' as const } },
          { keywords: { contains: t, mode: 'insensitive' as const } },
          { code: { contains: t, mode: 'insensitive' as const } },
        ],
      })),
    },
    take: topK * 3,
    select: { id: true, name: true, description: true, keywords: true, code: true, price: true, priceMax: true, priceType: true, currency: true, categoryId: true },
  })

  // Rank by token match count
  const scored = rows.map((r) => {
    const haystack = `${r.name} ${r.description || ''} ${r.keywords || ''} ${r.code || ''}`.toLowerCase()
    let matchCount = 0
    for (const t of tokens) {
      if (haystack.includes(t)) matchCount++
    }
    return { row: r, matchCount }
  })

  scored.sort((a, b) => b.matchCount - a.matchCount)

  return scored.slice(0, topK).map(({ row: r }) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    price: r.price != null ? Number(r.price) : null,
    priceMax: r.priceMax != null ? Number(r.priceMax) : null,
    priceType: r.priceType,
    currency: r.currency,
    categoryId: r.categoryId,
    score: null,
  }))
}
