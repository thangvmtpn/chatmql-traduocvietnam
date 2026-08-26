export type ToolName = 'search_products' | 'search_knowledge';
export declare const TOOL_NAMES: ToolName[];
export interface ToolGuardrail {
    /** Allowed category ids; empty = no limit (all categories of that kind). */
    categoryIds: string[];
}
export interface ToolConfig {
    enabled: boolean;
    guardrail: ToolGuardrail;
}
export type ToolsConfig = Record<ToolName, ToolConfig>;
export declare function defaultToolsConfig(): ToolsConfig;
/** Parse a tools-doc JSON string into a full config (missing tools → defaults). */
export declare function parseToolsDoc(content: string | null | undefined): ToolsConfig;
export declare function serializeToolsDoc(cfg: ToolsConfig): string;
/**
 * Resolve the effective tools config for an org.
 * Source of truth = AiLogicDoc('tools'). Back-compat: until a tools doc exists,
 * seed guardrails from the legacy AiConfig allow-lists so prior config still applies.
 */
export declare function getToolsConfig(orgId: string): Promise<ToolsConfig>;
/**
 * Merge a patch into the org's tools config and persist it (AiLogicDoc 'tools').
 * Patch shapes accepted:
 *   per-tool: { search_products: { enabled?, guardrail:{categoryIds} }, ... } (optionally under "tools")
 *   legacy:   { allowedProductCategoryIds:[...], allowedKnowledgeCategoryIds:[...] }
 * Validates category ids belong to the org (rejects unknown ids). Returns the new config.
 * Used by BOTH the Master proposal apply AND the settings UI.
 */
export declare function applyToolsPatch(orgId: string, patch: Record<string, unknown>, updatedBy: string): Promise<ToolsConfig>;
/**
 * Human/AI-readable scope note for the responder prompt — tells the model
 * EXACTLY which tools it has and which categories each may query (by NAME).
 * The guardrail itself is enforced in code at the query layer regardless;
 * this note exists so the model doesn't hallucinate around its limits
 * (e.g. claim "shop không bán X" when X is merely outside its allowed scope).
 */
export declare function buildToolScopeNote(orgId: string, tools: ToolsConfig): Promise<string>;
