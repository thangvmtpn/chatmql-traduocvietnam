/**
 * product-query-service.ts — Unified product + knowledge retrieval (P3).
 * 3 modes (borrowed from FlowBot's dataset_query): semantic / filter / aggregate.
 * orgId is always the first arg → company filter enforced. Used by the REST
 * endpoint and (future) the AI harness tool — orgId must come from the caller's
 * session context, never from LLM-provided arguments.
 */
import { prisma } from '../../shared/prisma-client.js';
import { listProducts } from './product-service.js';
import { retrieveProductSemantic } from './product-embedding.js';
import { listKbEntries } from '../knowledge/kb-service.js';
import { retrieveKbSemantic } from '../knowledge/embedding-service.js';
import { retrieveKb } from '../knowledge/kb-service.js';
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** Mode 1 — semantic (RAG): vector search over products and/or knowledge. */
export async function semanticSearch(orgId, query, opts = {}) {
    const topK = clamp(opts.topK ?? 5, 1, 20);
    const scope = opts.scope ?? 'all';
    const out = {};
    if (scope === 'products' || scope === 'all') {
        out.products = await retrieveProductSemantic(orgId, query, topK, { categoryId: opts.categoryId });
    }
    if (scope === 'knowledge' || scope === 'all') {
        out.knowledge = await retrieveKbSemantic(orgId, query, topK, retrieveKb);
    }
    return out;
}
/** Mode 2 — filter (SQL): structured listing, no embedding cost. */
export async function structuredFilter(orgId, opts = {}) {
    const scope = opts.scope ?? 'all';
    const limit = clamp(opts.limit ?? 20, 1, 100);
    const out = {};
    if (scope === 'products' || scope === 'all') {
        const r = await listProducts(orgId, {
            categoryId: opts.categoryId, status: opts.status, search: opts.search, pageSize: limit,
        });
        out.products = r.items;
    }
    if (scope === 'knowledge' || scope === 'all') {
        out.knowledge = (await listKbEntries(orgId, {
            categoryId: opts.categoryId, productId: opts.productId, type: opts.type, status: opts.status ?? 'active',
        })).slice(0, limit);
    }
    return out;
}
/** Mode 3 — aggregate: counts per category (products + knowledge). */
export async function aggregate(orgId) {
    const [prodGroups, kbGroups, prodCats, kbCats] = await Promise.all([
        prisma.product.groupBy({ by: ['categoryId'], where: { orgId }, _count: { _all: true } }),
        prisma.knowledgeEntry.groupBy({ by: ['categoryId'], where: { orgId }, _count: { _all: true } }),
        prisma.productCategory.findMany({ where: { orgId }, select: { id: true, name: true } }),
        prisma.knowledgeCategory.findMany({ where: { orgId }, select: { id: true, name: true } }),
    ]);
    const prodName = new Map(prodCats.map((c) => [c.id, c.name]));
    const kbName = new Map(kbCats.map((c) => [c.id, c.name]));
    return {
        productsByCategory: prodGroups.map((g) => ({
            categoryId: g.categoryId, category: g.categoryId ? prodName.get(g.categoryId) ?? null : 'Chưa phân loại', count: g._count._all,
        })),
        knowledgeByCategory: kbGroups.map((g) => ({
            categoryId: g.categoryId, category: g.categoryId ? kbName.get(g.categoryId) ?? null : 'Chưa phân loại', count: g._count._all,
        })),
    };
}
//# sourceMappingURL=product-query-service.js.map