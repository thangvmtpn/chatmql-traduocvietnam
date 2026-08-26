/**
 * product-service.ts — Product catalog CRUD (org-scoped).
 * orgId is always the first arg → forces the company filter.
 * Embedding (pgvector) is auto-enqueued on create + on update of EMBED_FIELDS
 * (see enqueueProductEmbed); storage + semantic search live in product-embedding.ts.
 */
import { Prisma } from '@prisma/client';
export type ProductListQuery = {
    search?: string;
    categoryId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
};
export declare function listProducts(orgId: string, q?: ProductListQuery): Promise<{
    items: ({
        id: string;
        name: string;
        createdAt: Date;
        status: string;
        updatedAt: Date;
        notes: string | null;
        source: string;
        tags: string[];
        code: string | null;
        description: string | null;
        sortOrder: number;
        category: {
            id: string;
            name: string;
        } | null;
        slug: string;
        price: Prisma.Decimal | null;
        categoryId: string | null;
        keywords: string | null;
        priceType: string;
        priceMax: Prisma.Decimal | null;
        currency: string;
        specs: Prisma.JsonValue;
        images: string[];
    } & {
        price: number | null;
        priceMax: number | null;
    })[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}>;
export declare function getProduct(orgId: string, id: string): Promise<({
    id: string;
    name: string;
    createdAt: Date;
    status: string;
    updatedAt: Date;
    notes: string | null;
    source: string;
    tags: string[];
    code: string | null;
    description: string | null;
    sortOrder: number;
    category: {
        id: string;
        name: string;
    } | null;
    slug: string;
    price: Prisma.Decimal | null;
    categoryId: string | null;
    keywords: string | null;
    priceType: string;
    priceMax: Prisma.Decimal | null;
    currency: string;
    specs: Prisma.JsonValue;
    images: string[];
} & {
    price: number | null;
    priceMax: number | null;
}) | null>;
export type ProductInput = {
    name: string;
    categoryId?: string | null;
    code?: string | null;
    description?: string | null;
    notes?: string | null;
    keywords?: string | null;
    tags?: string[];
    priceType?: string;
    price?: number | null;
    priceMax?: number | null;
    currency?: string;
    specs?: unknown;
    images?: string[];
    status?: string;
    sortOrder?: number;
    source?: string;
};
export declare function createProduct(orgId: string, data: ProductInput, createdById?: string, opts?: {
    skipEmbed?: boolean;
}): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    status: string;
    updatedAt: Date;
    notes: string | null;
    source: string;
    tags: string[];
    code: string | null;
    description: string | null;
    sortOrder: number;
    category: {
        id: string;
        name: string;
    } | null;
    slug: string;
    price: Prisma.Decimal | null;
    categoryId: string | null;
    keywords: string | null;
    priceType: string;
    priceMax: Prisma.Decimal | null;
    currency: string;
    specs: Prisma.JsonValue;
    images: string[];
} & {
    price: number | null;
    priceMax: number | null;
}>;
export declare function updateProduct(orgId: string, id: string, data: Partial<ProductInput>, opts?: {
    skipEmbed?: boolean;
}): Promise<({
    id: string;
    name: string;
    createdAt: Date;
    status: string;
    updatedAt: Date;
    notes: string | null;
    source: string;
    tags: string[];
    code: string | null;
    description: string | null;
    sortOrder: number;
    category: {
        id: string;
        name: string;
    } | null;
    slug: string;
    price: Prisma.Decimal | null;
    categoryId: string | null;
    keywords: string | null;
    priceType: string;
    priceMax: Prisma.Decimal | null;
    currency: string;
    specs: Prisma.JsonValue;
    images: string[];
} & {
    price: number | null;
    priceMax: number | null;
}) | null>;
export declare function deleteProduct(orgId: string, id: string): Promise<boolean>;
