/**
 * ensure-vector-indexes.ts — idempotent pgvector HNSW index creation.
 *
 * db push can't declare an index on an Unsupported("vector") column, so we
 * create the HNSW (cosine) indexes here at boot with IF NOT EXISTS. Without an
 * index, every <=> search is a full table scan — fine for a few hundred vectors,
 * but it degrades as a tenant's catalog/KB/scenarios grow. Non-fatal: if the
 * pgvector build lacks hnsw or the role can't CREATE EXTENSION, cosine search
 * still works (just unindexed) and the app boots normally.
 */
import { prisma } from './prisma-client.js';
import { logger } from './logger.js';
// Static SQL only (no user input) — safe with executeRawUnsafe.
const INDEX_STMTS = [
    'CREATE INDEX IF NOT EXISTS idx_knowledge_entries_embedding_hnsw ON knowledge_entries USING hnsw (embedding vector_cosine_ops)',
    'CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw ON products USING hnsw (embedding vector_cosine_ops)',
    'CREATE INDEX IF NOT EXISTS idx_ai_scenarios_embedding_hnsw ON ai_scenarios USING hnsw (embedding vector_cosine_ops)',
];
// Non-vector indexes (no pgvector dependency) — run regardless of the extension.
const OTHER_INDEX_STMTS = [
    // Atomic dedup of OPEN knowledge gaps: a partial UNIQUE index so two concurrent
    // identical turns can't both insert (recordKnowledgeGap catches the violation and
    // increments instead). md5(lower(question)) keeps the indexed value btree-sized.
    "CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_gaps_open_dedup ON ai_knowledge_gaps (org_id, gap_type, md5(lower(question))) WHERE status = 'open'",
];
export async function ensureVectorIndexes() {
    // Non-vector indexes first — independent of the pgvector extension.
    for (const stmt of OTHER_INDEX_STMTS) {
        try {
            await prisma.$executeRawUnsafe(stmt);
        }
        catch (err) {
            logger.warn({ err: err.message, stmt }, '[db] index ensure failed');
        }
    }
    try {
        await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    }
    catch (err) {
        logger.warn({ err: err.message }, '[vector] CREATE EXTENSION vector failed — skipping HNSW index build');
        return;
    }
    let ok = 0;
    for (const stmt of INDEX_STMTS) {
        try {
            await prisma.$executeRawUnsafe(stmt);
            ok++;
        }
        catch (err) {
            logger.warn({ err: err.message, stmt }, '[vector] HNSW index ensure failed (cosine scans still work)');
        }
    }
    logger.info({ ensured: ok, total: INDEX_STMTS.length }, '[vector] HNSW indexes ensured');
}
//# sourceMappingURL=ensure-vector-indexes.js.map