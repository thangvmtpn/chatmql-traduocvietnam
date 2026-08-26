export declare const LIFECYCLE_STAGES: readonly ["subscriber", "lead", "qualified", "opportunity", "customer", "evangelist", "churned"];
export type LifecycleStage = typeof LIFECYCLE_STAGES[number];
export declare const STAGE_LABELS: Record<string, string>;
export declare function isValidStage(stage: string): stage is LifecycleStage;
export interface ChangeStageInput {
    orgId: string;
    contactId: string;
    toStage: string;
    changedBy: string;
    reason?: string | null;
}
export interface ChangeStageResult {
    log: {
        id: string;
        fromStage: string | null;
        toStage: string;
        createdAt: Date;
    };
    fromStage: string | null;
    toStage: string;
}
/**
 * Change a contact's lifecycleStage. Skips work if already at target stage.
 * Throws if the contact doesn't exist in the org. Caller is responsible for
 * auth + org scoping.
 */
export declare function changeLifecycleStage(input: ChangeStageInput): Promise<ChangeStageResult>;
