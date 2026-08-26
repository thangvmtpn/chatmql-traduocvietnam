export type QueryScope = 'products' | 'knowledge' | 'all';
/** Mode 1 — semantic (RAG): vector search over products and/or knowledge. */
export declare function semanticSearch(orgId: string, query: string, opts?: {
    scope?: QueryScope;
    topK?: number;
    categoryId?: string;
}): Promise<{
    products?: unknown[];
    knowledge?: unknown[];
}>;
/** Mode 2 — filter (SQL): structured listing, no embedding cost. */
export declare function structuredFilter(orgId: string, opts?: {
    scope?: QueryScope;
    categoryId?: string;
    productId?: string;
    status?: string;
    type?: string;
    search?: string;
    limit?: number;
}): Promise<{
    products?: unknown[];
    knowledge?: unknown[];
}>;
/** Mode 3 — aggregate: counts per category (products + knowledge). */
export declare function aggregate(orgId: string): Promise<{
    productsByCategory: {
        categoryId: string | null;
        category: string | null;
        count: number;
    }[];
    knowledgeByCategory: {
        categoryId: string | null;
        category: string | null;
        count: number;
    }[];
}>;
