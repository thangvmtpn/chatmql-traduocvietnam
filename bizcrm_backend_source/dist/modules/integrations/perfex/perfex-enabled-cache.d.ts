/** Reload the enabled-org set from the DB. Call at boot and after any config save. */
export declare function refreshPerfexEnabledCache(): Promise<void>;
export declare function isPerfexEnabled(orgId: string): boolean;
export declare function getEnabledOrgIds(): string[];
export declare function getDebounceSeconds(orgId: string): number;
