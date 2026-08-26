export declare function listKnowledgeCategories(orgId: string): Promise<{
    entryCount: number;
    _count: undefined;
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    sortOrder: number;
    parentId: string | null;
    slug: string;
    importConfig: import("@prisma/client/runtime/library").JsonValue;
    kind: string;
}[]>;
export type KnowledgeCategoryInput = {
    name: string;
    parentId?: string | null;
    description?: string | null;
    kind?: string;
    importConfig?: unknown;
    sortOrder?: number;
};
export declare function createKnowledgeCategory(orgId: string, data: KnowledgeCategoryInput): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    sortOrder: number;
    parentId: string | null;
    slug: string;
    importConfig: import("@prisma/client/runtime/library").JsonValue;
    kind: string;
}>;
export declare function updateKnowledgeCategory(orgId: string, id: string, data: Partial<KnowledgeCategoryInput>): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
    sortOrder: number;
    parentId: string | null;
    slug: string;
    importConfig: import("@prisma/client/runtime/library").JsonValue;
    kind: string;
} | null>;
export declare function deleteKnowledgeCategory(orgId: string, id: string): Promise<boolean>;
/** Idempotent seed of default sales/consulting taxonomy (only if org has none). */
export declare function seedDefaultKnowledgeCategories(orgId: string): Promise<number>;
