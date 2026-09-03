import { type GapType } from './harness/gap-detection.js';
export type GapStatus = 'open' | 'resolved' | 'dismissed';
export type { GapType };
/**
 * Record a knowledge gap from a responder tool call. Dedupes against an existing
 * OPEN gap with the same (case-insensitive) question + type → bumps `occurrences`
 * instead of flooding the queue. Notifies owner/admins on first occurrence only.
 */
export declare function recordKnowledgeGap(input: {
    orgId: string;
    conversationId?: string | null;
    aiReplyRunId?: string | null;
    messageId?: string | null;
    gapType?: string;
    question: string;
    suggestion?: string | null;
}): Promise<{
    id: string;
    deduped: boolean;
}>;
export declare function listKnowledgeGaps(orgId: string, status?: GapStatus, limit?: number, offset?: number): Promise<{
    items: {
        id: string;
        orgId: string;
        createdAt: Date;
        status: string;
        updatedAt: Date;
        notes: string | null;
        contactId: string | null;
        conversationId: string | null;
        aiReplyRunId: string | null;
        messageId: string | null;
        question: string;
        gapType: string;
        suggestion: string | null;
        occurrences: number;
        resolvedBy: string | null;
        resolvedRef: string | null;
        lastSeenAt: Date;
    }[];
    total: number;
}>;
export declare function dismissGap(id: string, orgId: string, reviewedBy: string): Promise<boolean>;
/**
 * Resolve a gap DIRECTLY into a KnowledgeEntry (auto-embedded so the AI can
 * retrieve it next time). FAQ entries use the customer's question as the title.
 */
export declare function resolveGap(id: string, orgId: string, userId: string, input: {
    content: string;
    title?: string | null;
    type?: string;
    format?: string;
    categoryId?: string | null;
    risk?: string;
    notes?: string;
}): Promise<{
    ok: boolean;
    entryId?: string;
    error?: string;
}>;
/**
 * Hand the gap to the AI MASTER: seed an AiFeedback(missing_info) so the existing
 * feedback → Master → proposal(knowledge_entry) pipeline can draft the answer.
 * Gap leaves the queue (status=resolved, resolvedRef = feedback id); staff finish
 * in the "Cải thiện AI" tab.
 */
export declare function resolveGapViaMaster(id: string, orgId: string, userId: string, note?: string): Promise<{
    ok: boolean;
    feedbackId?: string;
    error?: string;
}>;
