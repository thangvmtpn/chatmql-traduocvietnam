export interface ApiKeyContext {
    keyId: string;
    orgId: string;
}
export interface ApiKeyRow {
    id: string;
    name: string;
    prefix: string;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
}
/** Create a key. Returns the RAW key (shown once) + its stored metadata. */
export declare function createApiKey(orgId: string, createdById: string | null, name: string): Promise<{
    rawKey: string;
    key: ApiKeyRow;
}>;
/** Verify a presented raw key. Returns its org context, or null if invalid/revoked. */
export declare function verifyApiKey(rawKey: string): Promise<ApiKeyContext | null>;
export declare function listApiKeys(orgId: string): Promise<ApiKeyRow[]>;
/** Revoke a key (org-scoped). Idempotent. */
export declare function revokeApiKey(orgId: string, id: string): Promise<boolean>;
