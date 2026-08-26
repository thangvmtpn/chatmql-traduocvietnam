export type MemoryRow = {
    id: string;
    contactId: string;
    orgId: string;
    kind: string;
    content: string;
    source: string;
    confidence: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};
export type MemoryUpdate = {
    scope: 'thread' | 'global';
    kind: string;
    content: string;
    risk: 'low' | 'sensitive';
    confidence?: number;
    title?: string;
    type?: string;
};
export declare function listContactMemory(orgId: string, contactId: string, onlyActive?: boolean): Promise<MemoryRow[]>;
/**
 * Returns all active facts for L3 injection.
 */
export declare function getThreadMemory(orgId: string, contactId: string): Promise<MemoryRow[]>;
export declare function getMemoryFact(orgId: string, id: string): Promise<MemoryRow | null>;
export declare function updateMemoryFact(orgId: string, id: string, patch: {
    content?: string;
    kind?: string;
    isActive?: boolean;
}): Promise<MemoryRow | null>;
export declare function deleteMemoryFact(orgId: string, id: string): Promise<boolean>;
/**
 * Applies memory updates from AI envelope:
 * - scope=thread → ContactMemory (dedup by normalized content)
 * - scope=global → KnowledgeEntry (dedup via findSimilarEntry; risk→status)
 * Does NOT block the caller — call fire-and-forget or await per design.
 */
export declare function applyMemoryUpdates(orgId: string, convId: string, contactId: string, updates: MemoryUpdate[]): Promise<void>;
