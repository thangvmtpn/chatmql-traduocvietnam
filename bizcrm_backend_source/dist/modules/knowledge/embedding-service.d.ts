import { type KbSnippet } from './kb-service.js';
/**
 * Minimum cosine similarity (0..1) a semantic hit must reach to count as
 * "relevant". Below this, a hit is OFF-TOPIC noise (top-K always returns the
 * nearest vectors even when nothing actually matches) and is dropped so it can
 * never leak into the reply's grounding. 0.35 measured on text-embedding-3-small:
 * cleanly keeps same-topic FAQs (~0.42+) and drops cross-topic ones (~0.20-0.34).
 * Tunable per query via opts.minScore (Master/criteria can raise it for sensitive
 * intents). Keyword (hybrid) backfill still recovers exact-term matches.
 */
export declare const DEFAULT_RAG_MIN_SCORE = 0.35;
/** Convert a float array to pgvector literal: '[0.1,0.2,…]' */
export declare function toVectorLiteral(arr: number[]): string;
/**
 * Embed text for an org. Returns 1536-float array or null on error/no key.
 * Uses AiConfig.embeddingProvider/Model if set; otherwise openai/text-embedding-3-small.
 */
export declare function embedText(orgId: string, text: string): Promise<number[] | null>;
/**
 * Batch-embed many texts using ONE API call per chunk (~96 inputs) instead of one
 * call per text. Returns vectors aligned to the input order; an entry is null when
 * that item (or its whole chunk) failed — callers store the rest and can retry nulls.
 * Use for bulk paths (import, backfill) to avoid hammering the provider with N calls.
 */
export declare function embedTexts(orgId: string, texts: string[]): Promise<(number[] | null)[]>;
/**
 * Write the embedding vector to knowledge_entries via raw SQL.
 * The vector literal is the only inlined value; ids/orgId are parameterized.
 */
export declare function storeKbEmbedding(orgId: string, entryId: string, vec: number[]): Promise<void>;
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
export declare function retrieveKbSemantic(orgId: string, query: string, topK: number, keywordFallback: (orgId: string, query: string, topK: number) => Promise<KbSnippet[]>, opts?: {
    categoryIds?: string[];
    format?: string;
    minScore?: number;
}): Promise<KbSnippet[]>;
/**
 * Build the text we embed for a KB entry. Includes `keywords` (alt phrasings) so
 * they boost semantic recall. MUST stay the only place that builds this string —
 * the on-save worker and the backfill both go through embedAndStoreKbEntry so an
 * old entry can never end up with a vector that ignores its keywords.
 */
export declare function kbEmbedText(e: {
    title: string | null;
    keywords: string | null;
    content: string;
}): string;
/** Embed one KB entry by id and store the vector. No-op if not found / no API key. */
export declare function embedAndStoreKbEntry(orgId: string, entryId: string): Promise<boolean>;
/**
 * Idempotent backfill: re-embed active entries via embedAndStoreKbEntry.
 * - default: only entries missing a vector (embedding IS NULL) — cheap gap-fill.
 * - force=true: re-embed ALL active entries — use after the embed text changes
 *   (e.g. keywords were added to entries embedded before keywords counted).
 * Call on demand (admin endpoint). NOT called on startup.
 */
export declare function backfillEmbeddings(orgId: string, opts?: {
    force?: boolean;
}): Promise<{
    embedded: number;
    failed: number;
}>;
