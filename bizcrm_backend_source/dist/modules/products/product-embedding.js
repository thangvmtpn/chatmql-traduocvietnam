/**
 * product-embedding.ts — pgvector storage + semantic search for products.
 * Reuses embedText/toVectorLiteral from the KB embedding-service.
 * Vector SQL is centralized here and ALWAYS parameterizes org_id (anti
 * cross-company): no raw vector query for products lives anywhere else.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma-client.js';
import { embedText, embedTexts, toVectorLiteral, DEFAULT_RAG_MIN_SCORE } from '../knowledge/embedding-service.js';
/** Build the text we embed for a product. */
export function productEmbedText(p) {
    return [p.name, p.keywords, p.description].filter(Boolean).join('\n\n');
}
/** Embed a product by id and store the vector. No-op if no API key. */
export async function embedAndStoreProduct(orgId, productId) {
    const p = await prisma.product.findFirst({
        where: { id: productId, orgId },
        select: { name: true, keywords: true, description: true },
    });
    if (!p)
        return false;
    const vec = await embedText(orgId, productEmbedText(p));
    if (!vec)
        return false;
    await storeProductEmbedding(orgId, productId, vec);
    return true;
}
/**
 * Batch-embed many products in as few API calls as possible (one request per
 * ~96 products) and store each vector. Use for bulk paths (import, backfill)
 * instead of N single-product calls. A product whose embed failed is left for a
 * later backfill (its vector slot comes back null).
 */
export async function embedAndStoreProductsBatch(orgId, productIds) {
    if (productIds.length === 0)
        return { embedded: 0, failed: 0 };
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, orgId },
        select: { id: true, name: true, keywords: true, description: true },
    });
    if (products.length === 0)
        return { embedded: 0, failed: 0 };
    const vectors = await embedTexts(orgId, products.map((p) => productEmbedText(p)));
    let embedded = 0;
    let failed = 0;
    for (let i = 0; i < products.length; i++) {
        const vec = vectors[i];
        if (vec) {
            await storeProductEmbedding(orgId, products[i].id, vec);
            embedded++;
        }
        else
            failed++;
    }
    return { embedded, failed };
}
/** Idempotent: embed all active products missing a vector (or all if force=true). */
export async function backfillProductEmbeddings(orgId, opts = {}) {
    const whereClause = opts.force
        ? Prisma.sql `WHERE org_id = ${orgId} AND status = 'active'`
        : Prisma.sql `WHERE org_id = ${orgId} AND status = 'active' AND embedding IS NULL`;
    const rows = await prisma.$queryRaw(Prisma.sql `SELECT id FROM products ${whereClause}`);
    return embedAndStoreProductsBatch(orgId, rows.map((r) => r.id));
}
export async function storeProductEmbedding(orgId, productId, vec) {
    const literal = toVectorLiteral(vec); // derived from float array only — injection-safe
    await prisma.$executeRaw(Prisma.sql `UPDATE products SET embedding = ${literal}::vector WHERE id = ${productId} AND org_id = ${orgId}`);
}
/**
 * Hybrid product retrieval (Anti-Shadowing):
 * Runs pgvector semantic search in parallel with keyword search, merging them
 * with strict priority for exact / strong product name matches over partial vector hits.
 * This ensures that even if semantic search returns topK items or vector is stale,
 * exact-name hits are never shadowed.
 */
export async function retrieveProductSemantic(orgId, query, topK, opts = {}) {
    const trimmed = query.trim();
    if (!trimmed)
        return [];
    const minScore = opts.minScore ?? DEFAULT_RAG_MIN_SCORE;
    // ALWAYS run keyword retrieval in parallel (anti-shadowing for exact product names/codes)
    const keywordPromise = retrieveProductKeyword(orgId, trimmed, topK, opts.categoryIds);
    const vec = await embedText(orgId, trimmed);
    let semanticOut = [];
    if (vec) {
        const literal = toVectorLiteral(vec);
        try {
            const catFilter = opts.categoryIds && opts.categoryIds.length > 0
                ? Prisma.sql `AND category_id::text IN (${Prisma.join(opts.categoryIds)})`
                : opts.categoryId
                    ? Prisma.sql `AND category_id = ${opts.categoryId}::uuid`
                    : Prisma.empty;
            const rows = await prisma.$queryRaw(Prisma.sql `
          SELECT id, name, description, price, price_max, price_type, currency, category_id,
                 (1 - (embedding <=> ${literal}::vector)) AS score
          FROM products
          WHERE org_id = ${orgId}
            AND status = 'active'
            AND embedding IS NOT NULL
            ${catFilter}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${topK}
        `);
            semanticOut = rows
                .filter((r) => Number(r.score) >= minScore)
                .map((r) => ({
                id: r.id, name: r.name, description: r.description,
                price: r.price != null ? Number(r.price) : null,
                priceMax: r.price_max != null ? Number(r.price_max) : null,
                priceType: r.price_type, currency: r.currency, categoryId: r.category_id,
                score: Math.round(Number(r.score) * 1000) / 1000,
            }));
        }
        catch {
            // ignore vector error, fallback to keyword
        }
    }
    const keywordOut = await keywordPromise;
    // Merge semantic + keyword with priority:
    // 1. Exact / strong product name matches (anti-shadowing)
    // 2. High cosine semantic hits
    // 3. Remaining keyword hits
    const mergedMap = new Map();
    const cleanLower = trimmed.toLowerCase();
    // Step 1: Insert exact / high-confidence product name matches at the VERY TOP
    for (const kw of keywordOut) {
        const nameLower = kw.name.toLowerCase();
        const isExactName = cleanLower.includes(nameLower) || nameLower.includes(cleanLower);
        if (isExactName) {
            const sem = semanticOut.find((s) => s.id === kw.id);
            mergedMap.set(kw.id, {
                ...kw,
                score: sem?.score ?? 0.99,
            });
        }
    }
    // Step 2: Insert semantic hits (ordered by cosine similarity)
    for (const sem of semanticOut) {
        if (!mergedMap.has(sem.id)) {
            mergedMap.set(sem.id, sem);
        }
    }
    // Step 3: Insert remaining keyword hits
    for (const kw of keywordOut) {
        if (!mergedMap.has(kw.id)) {
            mergedMap.set(kw.id, kw);
        }
    }
    const merged = Array.from(mergedMap.values());
    return merged.slice(0, topK);
}
/** Keyword product search (name/code/keywords/description token overlap). score=null. */
async function retrieveProductKeyword(orgId, query, topK, categoryIds) {
    const clean = query.trim().toLowerCase();
    if (!clean)
        return [];
    const tokens = clean
        .split(/[\s,.;:!?+-_/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
        .slice(0, 10);
    if (tokens.length === 0)
        return [];
    // Pull active candidates for this org / category filter
    const rows = await prisma.product.findMany({
        where: {
            orgId,
            status: 'active',
            ...(categoryIds?.length ? { categoryId: { in: categoryIds } } : {}),
            OR: tokens.map((t) => ({
                OR: [
                    { name: { contains: t, mode: 'insensitive' } },
                    { description: { contains: t, mode: 'insensitive' } },
                    { keywords: { contains: t, mode: 'insensitive' } },
                    { code: { contains: t, mode: 'insensitive' } },
                ],
            })),
        },
        take: topK * 3,
        select: { id: true, name: true, description: true, keywords: true, code: true, price: true, priceMax: true, priceType: true, currency: true, categoryId: true },
    });
    // Rank by name match, phrase match, and token match count
    const scored = rows.map((r) => {
        const nameLower = r.name.toLowerCase();
        const descLower = (r.description || '').toLowerCase();
        const kwLower = (r.keywords || '').toLowerCase();
        const codeLower = (r.code || '').toLowerCase();
        let score = 0;
        // Exact name match or query contains product name
        if (clean.includes(nameLower) || nameLower.includes(clean)) {
            score += 100;
        }
        // Name token matches (heavily weighted)
        for (const t of tokens) {
            if (nameLower.includes(t))
                score += 10;
            if (codeLower.includes(t))
                score += 10;
            if (kwLower.includes(t))
                score += 5;
            if (descLower.includes(t))
                score += 1;
        }
        return { row: r, score };
    });
    scored.sort((a, b) => b.score - a.score);
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
    }));
}
//# sourceMappingURL=product-embedding.js.map