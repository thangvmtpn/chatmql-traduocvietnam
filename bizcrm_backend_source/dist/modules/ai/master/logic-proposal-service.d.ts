export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';
export type ProposalTargetType = 'logic_doc' | 'knowledge_entry' | 'thread_memory' | 'prompt_version' | 'product' | 'guardrail' | 'scenario' | 'retrieval_tuning';
export interface AiLogicProposalRow {
    id: string;
    orgId: string;
    feedbackId: string | null;
    masterSessionId: string | null;
    source: string;
    targetType: string;
    targetSubtype: string | null;
    targetId: string | null;
    currentValue: string | null;
    proposedValue: string;
    rationale: string;
    status: string;
    createdByAi: boolean;
    reviewedBy: string | null;
    appliedRef: string | null;
    createdAt: Date;
}
/**
 * List proposals for an org, optionally filtered by status.
 */
export declare function listProposals(orgId: string, status?: ProposalStatus, limit?: number, offset?: number): Promise<AiLogicProposalRow[]>;
/**
 * Create a new proposal (used internally by the Master agent).
 */
export declare function createProposal(input: {
    orgId: string;
    feedbackId?: string;
    masterSessionId?: string;
    source: string;
    targetType: ProposalTargetType;
    targetSubtype?: string;
    targetId?: string;
    currentValue?: string;
    proposedValue: string;
    rationale: string;
}): Promise<AiLogicProposalRow>;
/**
 * Reject a proposal. Sets status='rejected', records reviewedBy, fires ActivityLog.
 */
export declare function rejectProposal(proposalId: string, orgId: string, reviewedBy: string): Promise<{
    proposalId: string;
}>;
/**
 * Apply a proposal — GATED: must be called only after explicit human confirmation.
 *
 * Behaviour per targetType:
 *   logic_doc       → upsertLogicDoc with changedBy='ai_master' (versioned)
 *   knowledge_entry → stub (KB service not yet in scope for this phase)
 *   thread_memory   → stub (contact-memory service not yet in scope for this phase)
 *   prompt_version  → stub (AiPromptVersion management deferred)
 *
 * Always writes ActivityLog. Sets proposal status='applied', appliedRef.
 */
export declare function applyProposal(proposalId: string, orgId: string, reviewedBy: string): Promise<{
    proposalId: string;
    appliedRef: string | null;
}>;
