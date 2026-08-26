export type FeedbackCategory = 'tone' | 'accuracy' | 'policy' | 'missing_info' | 'other' | 'retrieval_miss' | 'wrong_rank' | 'scope_too_tight';
export type FeedbackStatus = 'new' | 'reviewed' | 'applied' | 'dismissed';
export declare function isValidCategory(c: string): c is FeedbackCategory;
export interface RecordFeedbackInput {
    orgId: string;
    conversationId?: string;
    messageId?: string;
    aiReplyRunId?: string;
    authorUserId: string;
    text: string;
    category?: FeedbackCategory;
}
export interface AiFeedbackRow {
    id: string;
    orgId: string;
    conversationId: string | null;
    messageId: string | null;
    aiReplyRunId: string | null;
    authorUserId: string;
    text: string;
    category: string | null;
    isExemplar: boolean;
    status: string;
    createdAt: Date;
}
/**
 * Record a new staff feedback entry for an AI reply.
 * Soft-refs: conversationId / messageId / aiReplyRunId may all be null
 * (feedback can be given without pinning to a specific message).
 */
export declare function recordFeedback(input: RecordFeedbackInput): Promise<AiFeedbackRow>;
/**
 * List feedback for an org, optionally filtered by status.
 * Returns newest-first, max 100 rows per call (callers paginate if needed).
 */
export declare function listFeedback(orgId: string, status?: FeedbackStatus, limit?: number, offset?: number): Promise<AiFeedbackRow[]>;
/**
 * Update feedback status (reviewed / applied / dismissed).
 * Used by the proposal-apply flow or manual staff review.
 */
export declare function updateFeedbackStatus(feedbackId: string, orgId: string, status: FeedbackStatus): Promise<void>;
