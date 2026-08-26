export interface CachedAliasMap {
    updateTime: string;
    aliasMap: Record<string, string>;
}
/**
 * Resolves a contact's custom alias (biệt danh) using Zalo's getAliasList.
 * Utilizes `updateTime` as an index cache key to avoid paginating through thousands
 * of friends unnecessarily.
 */
export declare function resolveZaloAlias(accountId: string, externalUid: string): Promise<string | undefined>;
