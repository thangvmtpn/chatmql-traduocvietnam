export type AiLogicDocType = 'index' | 'persona' | 'playbook' | 'handoff_rules' | 'mechanism' | 'criteria' | 'tools';
export declare function isValidDocType(t: string): t is AiLogicDocType;
export type LogicDocSummary = {
    id: string;
    orgId: string;
    type: string;
    version: number;
    isActive: boolean;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    contentLength: number;
};
export type LogicDocFull = LogicDocSummary & {
    content: string;
};
export type ActiveLogicContext = {
    index: string | null;
    persona: string | null;
    playbook: string | null;
    handoff_rules: string | null;
    mechanism: string | null;
    criteria: string | null;
};
/**
 * List all logic docs for an org (meta only, no content — for list view).
 */
export declare function getLogicDocs(orgId: string): Promise<LogicDocSummary[]>;
/**
 * Get a single logic doc by type (including full content).
 */
export declare function getLogicDoc(orgId: string, type: AiLogicDocType): Promise<LogicDocFull | null>;
/**
 * Get the structured context object the harness L0 needs.
 * Returns null content for doc types not yet created.
 */
export declare function getActiveLogicContext(orgId: string): Promise<ActiveLogicContext>;
/**
 * Create or update a logic doc.
 * On update: snapshots previous content as a new AiLogicDocVersion, bumps version.
 */
export declare function upsertLogicDoc(orgId: string, type: AiLogicDocType, content: string, updatedBy: string, changeNote?: string): Promise<LogicDocFull>;
/**
 * Revert a logic doc to a previously saved version.
 * Restores old content as a new version (highest version + 1).
 */
export declare function revertLogicDoc(orgId: string, type: AiLogicDocType, targetVersion: number, revertedBy: string): Promise<LogicDocFull>;
/**
 * List version history for a logic doc type.
 */
export declare function getLogicDocVersions(orgId: string, type: AiLogicDocType): Promise<{
    id: string;
    createdAt: Date;
    version: number;
    changedBy: string | null;
    changeNote: string | null;
}[]>;
/**
 * Create default logic docs for a new org. Idempotent — skips existing types.
 */
export declare function seedDefaultLogicDocs(orgId: string, createdBy?: string): Promise<{
    seeded: string[];
    skipped: string[];
}>;
