import { type PerfexIntegrationConfig } from './perfex-types.js';
export declare const PERFEX_INTEGRATION_TYPE = "perfex";
export interface LoadedPerfexIntegration {
    integrationId: string;
    enabled: boolean;
    config: PerfexIntegrationConfig;
}
/** Parse a raw Integration.config JSON into a typed config with defaults applied. */
export declare function normalizeConfig(raw: unknown): PerfexIntegrationConfig;
/** Load the org's Perfex integration row (or null if none). */
export declare function loadPerfexIntegration(orgId: string): Promise<LoadedPerfexIntegration | null>;
/** Decrypt the stored Perfex auth token. Throws if missing/invalid. */
export declare function decryptAuthToken(config: PerfexIntegrationConfig): string;
