/**
 * feedback-service.ts — Staff feedback box for AI replies.
 * Staff write free-text feedback on specific AI messages or conversations.
 * No thumbs/likes — structured text + optional category only.
 */
import { prisma } from '../../shared/prisma-client.js';
const VALID_CATEGORIES = [
    'tone', 'accuracy', 'policy', 'missing_info', 'other',
    'retrieval_miss', 'wrong_rank', 'scope_too_tight',
];
const VALID_STATUSES = ['new', 'reviewed', 'applied', 'dismissed'];
export function isValidCategory(c) {
    return VALID_CATEGORIES.includes(c);
}
/**
 * Record a new staff feedback entry for an AI reply.
 * Soft-refs: conversationId / messageId / aiReplyRunId may all be null
 * (feedback can be given without pinning to a specific message).
 */
export async function recordFeedback(input) {
    const text = input.text.trim();
    if (!text)
        throw new Error('Feedback text cannot be empty');
    if (text.length > 4000)
        throw new Error('Feedback text exceeds 4000 characters');
    if (input.category && !isValidCategory(input.category)) {
        throw new Error(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    return prisma.aiFeedback.create({
        data: {
            orgId: input.orgId,
            conversationId: input.conversationId ?? null,
            messageId: input.messageId ?? null,
            aiReplyRunId: input.aiReplyRunId ?? null,
            authorUserId: input.authorUserId,
            text,
            category: input.category ?? null,
            status: 'new',
        },
        select: {
            id: true,
            orgId: true,
            conversationId: true,
            messageId: true,
            aiReplyRunId: true,
            authorUserId: true,
            text: true,
            category: true,
            isExemplar: true,
            status: true,
            createdAt: true,
        },
    });
}
/**
 * List feedback for an org, optionally filtered by status.
 * Returns newest-first, max 100 rows per call (callers paginate if needed).
 */
export async function listFeedback(orgId, status, limit = 100, offset = 0) {
    if (status && !VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    return prisma.aiFeedback.findMany({
        where: {
            orgId,
            ...(status ? { status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        skip: offset,
        select: {
            id: true,
            orgId: true,
            conversationId: true,
            messageId: true,
            aiReplyRunId: true,
            authorUserId: true,
            text: true,
            category: true,
            isExemplar: true,
            status: true,
            createdAt: true,
        },
    });
}
/**
 * Update feedback status (reviewed / applied / dismissed).
 * Used by the proposal-apply flow or manual staff review.
 */
export async function updateFeedbackStatus(feedbackId, orgId, status) {
    await prisma.aiFeedback.updateMany({
        where: { id: feedbackId, orgId },
        data: { status },
    });
}
//# sourceMappingURL=feedback-service.js.map