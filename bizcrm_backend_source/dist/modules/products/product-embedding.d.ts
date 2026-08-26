/** Build the text we embed for a product. */
export declare function productEmbedText(p: {
    name: string;
    keywords?: string | null;
    description?: string | null;
}): string;
/** Embed a product by id and store the vector. No-op if no API key. */
export declare function embedAndStoreProduct(orgId: string, productId: string): Promise<boolean>;
/**
 * Batch-embed many products in as few API calls as possible (one request per
 * ~96 products) and store each vector. Use for bulk paths (import, backfill)
 * instead of N single-product calls. A product whose embed failed is left for a
 * later backfill (its vector slot comes back null).
 */
export declare function embedAndStoreProductsBatch(orgId: string, productIds: string[]): Promise<{
    embedded: number;
    failed: number;
}>;
/** Idempotent: embed all active products missing a vector (batched API calls). */
export declare function backfillProductEmbeddings(orgId: string): Promise<{
    embedded: number;
    failed: number;
}>;
export declare function storeProductEmbedding(orgId: string, productId: string, vec: number[]): Promise<void>;
export type ProductSemanticRow = {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    priceMax: number | null;
    priceType: string;
    currency: string;
    categoryId: string | null;
    /** Cosine similarity 0..1 for semantic hits; null for keyword-only matches. */
    score?: number | null;
};
/**
 * Hybrid product retrieval: cosine semantic search (pgvector <=>) with a
 * relevance threshold, plus keyword backfill (name/code/keywords) for recall.
 * Below `minScore` a semantic hit is off-topic noise and is dropped so it can
 * never become grounding. org_id is ALWAYS filtered (anti cross-company).
 */
export declare function retrieveProductSemantic(orgId: string, query: string, topK: number, opts?: {
    categoryId?: string;
    categoryIds?: string[];
    minScore?: number;
}): Promise<ProductSemanticRow[]>;
