import type { ScenarioSnippet } from './harness/harness-types.js';
export interface ScenarioInput {
    key?: string;
    name: string;
    description: string;
    content: string;
    loadMode?: string;
    triggerHints?: string | null;
    priority?: number;
    enabled?: boolean;
}
export interface ScenarioMeta {
    id: string;
    key: string;
    name: string;
    description: string;
    loadMode: string;
    enabled: boolean;
    priority: number;
    version: number;
    updatedAt: Date;
}
export interface ScenarioRow extends ScenarioMeta {
    content: string;
    triggerHints: string | null;
    updatedBy: string | null;
    createdAt: Date;
}
export declare function listScenarios(orgId: string, opts?: {
    enabledOnly?: boolean;
}): Promise<ScenarioMeta[]>;
export declare function getScenario(orgId: string, id: string): Promise<ScenarioRow | null>;
export declare function createScenario(orgId: string, input: ScenarioInput, by: string): Promise<ScenarioRow>;
export declare function updateScenario(orgId: string, id: string, patch: Partial<ScenarioInput> & {
    changeNote?: string;
}, by: string): Promise<ScenarioRow | null>;
export declare function deleteScenario(orgId: string, id: string): Promise<boolean>;
export declare function getScenarioVersions(orgId: string, id: string): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    version: number;
    changedBy: string | null;
    changeNote: string | null;
    loadMode: string;
}[] | null>;
export declare function embedAndStoreScenario(orgId: string, id: string): Promise<boolean>;
/** Idempotent backfill of scenario embeddings (enabled, missing a vector). */
export declare function backfillScenarioEmbeddings(orgId: string): Promise<{
    embedded: number;
    failed: number;
}>;
/** All always-on scenarios (foundational logic injected every turn). */
export declare function getAlwaysScenarios(orgId: string): Promise<ScenarioSnippet[]>;
/**
 * Auto scenarios relevant to the turn — semantic selection over the description
 * embedding, gated by the same cosine threshold the KB/product tools use. This
 * is the "load on demand" path: only relevant scenarios' detail is injected.
 */
export declare function retrieveRelevantScenarios(orgId: string, query: string, topK: number, minScore?: number): Promise<ScenarioSnippet[]>;
