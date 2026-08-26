/**
 * A display/search label for an entry. FAQ entries have a real title (the
 * question); articles have none, so fall back to the content's first line.
 */
export declare function deriveKbLabel(title: string | null | undefined, content: string): string;
export type KbEntryInput = {
    type: string;
    title?: string | null;
    content: string;
    risk: string;
    source: string;
    confidence?: number;
    categoryId?: string | null;
    productId?: string | null;
    format?: string;
    keywords?: string | null;
};
export type KbEntryRow = {
    id: string;
    orgId: string;
    type: string;
    title: string | null;
    content: string;
    status: string;
    risk: string;
    source: string;
    confidence: number | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
};
export type KbSnippet = {
    id: string;
    title: string;
    content: string;
    type: string;
    /** Cosine similarity 0..1 for semantic hits; null for keyword-only matches. */
    score?: number | null;
};
export type KbListFilters = {
    status?: string;
    categoryId?: string;
    productId?: string;
    type?: string;
    format?: string;
};
export declare function listKbEntries(orgId: string, statusOrFilters?: string | KbListFilters): Promise<KbEntryRow[]>;
export declare function getKbEntry(orgId: string, id: string): Promise<KbEntryRow | null>;
export declare function getKbEntryVersions(orgId: string, entryId: string): Promise<{
    id: string;
    createdAt: Date;
    version: number;
    changedBy: string | null;
    changeNote: string | null;
}[] | null>;
export declare function createKbEntry(orgId: string, input: KbEntryInput, createdBy: string): Promise<KbEntryRow>;
export declare function updateKbEntry(orgId: string, id: string, patch: Partial<KbEntryInput> & {
    changeNote?: string;
}, updatedBy: string): Promise<KbEntryRow | null>;
export declare function deleteKbEntry(orgId: string, id: string): Promise<boolean>;
export declare function approveEntry(orgId: string, id: string, by: string): Promise<KbEntryRow | null>;
export declare function rejectEntry(orgId: string, id: string, by: string): Promise<KbEntryRow | null>;
export declare function revertEntry(orgId: string, id: string, targetVersion: number, revertedBy: string): Promise<KbEntryRow | null>;
/**
 * Keyword retrieval: ILIKE over title+content, active entries only.
 * Returns topK snippets sorted by title match first, then content match.
 */
export declare function retrieveKb(orgId: string, query: string, topK?: number, opts?: {
    categoryIds?: string[];
    format?: string;
}): Promise<KbSnippet[]>;
/**
 * Check if a similar active entry exists (normalized equality).
 * Returns matching entry id or null.
 */
export declare function findSimilarEntry(orgId: string, content: string): Promise<string | null>;
