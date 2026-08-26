/**
 * knowledge-gap-service.ts — AI "knowledge gap" queue ("Phản hồi AI").
 *
 * When the AI lacks data/knowledge to answer during a live chat, the
 * `log_knowledge_gap` tool records a gap here (fire-and-forget — it does NOT
 * interrupt the reply). Staff resolve a gap into a KnowledgeEntry (close-the-loop,
 * the bit bizino's reviewRecord never built): either DIRECTLY (staff writes the
 * answer → KB entry, auto-embedded) or via the AI MASTER (seed a feedback so the
 * existing improve loop drafts it).
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { emitNotification } from '../realtime/socket-gateway.js';
import { createKbEntry } from '../knowledge/kb-service.js';
import { recordFeedback } from './feedback-service.js';
import { normalizeGapType, normalizeQuestion } from './harness/gap-detection.js';
const SELECT = {
    id: true, orgId: true, conversationId: true, contactId: true,
    aiReplyRunId: true, messageId: true, gapType: true, question: true,
    suggestion: true, status: true, occurrences: true,
    resolvedBy: true, resolvedRef: true, notes: true,
    lastSeenAt: true, createdAt: true, updatedAt: true,
};
/**
 * Record a knowledge gap from a responder tool call. Dedupes against an existing
 * OPEN gap with the same (case-insensitive) question + type → bumps `occurrences`
 * instead of flooding the queue. Notifies owner/admins on first occurrence only.
 */
export async function recordKnowledgeGap(input) {
    const question = normalizeQuestion(input.question);
    if (!question)
        throw new Error('question is required');
    const gapType = normalizeGapType(input.gapType);
    // Cap AI-supplied suggestion (unbounded-text / prompt-injection-into-DB guard).
    const suggestion = input.suggestion ? input.suggestion.slice(0, 2000) : null;
    // Dedupe vs an existing OPEN gap (same question+type). Fast path = this findFirst;
    // concurrent identical turns are caught atomically by the partial unique index
    // (ai_knowledge_gaps_open_dedup) + the P2002 handler on the create below.
    const existing = await prisma.aiKnowledgeGap.findFirst({
        where: { orgId: input.orgId, status: 'open', gapType, question: { equals: question, mode: 'insensitive' } },
        select: { id: true },
    });
    if (existing) {
        await prisma.aiKnowledgeGap.update({
            where: { id: existing.id },
            data: {
                occurrences: { increment: 1 },
                lastSeenAt: new Date(),
                ...(suggestion ? { suggestion } : {}),
            },
        });
        return { id: existing.id, deduped: true };
    }
    // Resolve contactId from the conversation (mirrors recordPendingAction).
    let contactId = null;
    if (input.conversationId) {
        const conv = await prisma.conversation.findFirst({
            where: { id: input.conversationId, orgId: input.orgId },
            select: { contactId: true },
        });
        contactId = conv?.contactId ?? null;
    }
    let row;
    try {
        row = await prisma.aiKnowledgeGap.create({
            data: {
                orgId: input.orgId,
                conversationId: input.conversationId ?? null,
                contactId,
                aiReplyRunId: input.aiReplyRunId ?? null,
                messageId: input.messageId ?? null,
                gapType,
                question,
                suggestion,
                status: 'open',
            },
            select: { id: true },
        });
    }
    catch (err) {
        // Lost the concurrent dedup race (partial unique index) → increment the winner.
        if (err?.code === 'P2002') {
            const winner = await prisma.aiKnowledgeGap.findFirst({
                where: { orgId: input.orgId, status: 'open', gapType, question: { equals: question, mode: 'insensitive' } },
                select: { id: true },
            });
            if (winner) {
                await prisma.aiKnowledgeGap.update({
                    where: { id: winner.id },
                    data: { occurrences: { increment: 1 }, lastSeenAt: new Date(), ...(suggestion ? { suggestion } : {}) },
                });
                return { id: winner.id, deduped: true };
            }
        }
        throw err;
    }
    notifyAdmins(input.orgId, question).catch(err => logger.warn({ err }, '[knowledge-gap] notify failed'));
    return { id: row.id, deduped: false };
}
async function notifyAdmins(orgId, question) {
    const admins = await prisma.user.findMany({
        where: { orgId, role: { in: ['owner', 'admin'] } },
        select: { id: true },
    });
    await Promise.all(admins.map(async (a) => {
        const n = await prisma.notification.create({
            data: {
                orgId, userId: a.id,
                type: 'automation', // reuse existing notif type (no schema change)
                title: 'AI gặp lỗ hổng kiến thức',
                body: question.slice(0, 200),
                link: '/ai/gaps',
            },
        });
        try {
            emitNotification(orgId, a.id, n);
        }
        catch { /* socket not ready */ }
    }));
}
export async function listKnowledgeGaps(orgId, status, limit = 50, offset = 0) {
    const where = { orgId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
        prisma.aiKnowledgeGap.findMany({
            where,
            orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
            take: Math.min(Math.max(limit, 1), 100),
            skip: Math.max(offset, 0),
            select: SELECT,
        }),
        prisma.aiKnowledgeGap.count({ where }),
    ]);
    return { items, total };
}
export async function dismissGap(id, orgId, reviewedBy) {
    const res = await prisma.aiKnowledgeGap.updateMany({
        where: { id, orgId, status: 'open' },
        data: { status: 'dismissed', resolvedBy: reviewedBy },
    });
    return res.count > 0;
}
/**
 * Resolve a gap DIRECTLY into a KnowledgeEntry (auto-embedded so the AI can
 * retrieve it next time). FAQ entries use the customer's question as the title.
 */
export async function resolveGap(id, orgId, userId, input) {
    const content = input.content?.trim();
    if (!content)
        return { ok: false, error: 'Nội dung tri thức không được rỗng' };
    const gap = await prisma.aiKnowledgeGap.findFirst({ where: { id, orgId }, select: { question: true, status: true } });
    if (!gap)
        return { ok: false, error: 'Không tìm thấy phản hồi' };
    if (gap.status !== 'open')
        return { ok: false, error: `Phản hồi đã ${gap.status}` };
    // Atomically CLAIM the gap (status guard) BEFORE the side-effectful KB create —
    // two concurrent resolves can't then both create a KnowledgeEntry for one gap.
    const claimed = await prisma.aiKnowledgeGap.updateMany({ where: { id, orgId, status: 'open' }, data: { status: 'resolved' } });
    if (claimed.count === 0)
        return { ok: false, error: 'Phản hồi đã được xử lý' };
    const type = input.type || 'faq';
    let entryId;
    try {
        const entry = await createKbEntry(orgId, {
            type,
            title: input.title ?? gap.question, // FAQ: câu hỏi khách làm title
            content,
            risk: input.risk || 'low',
            source: 'gap_resolved',
            categoryId: input.categoryId ?? null,
            format: input.format ?? (type === 'faq' ? 'qa' : 'article'),
        }, userId);
        entryId = entry.id;
    }
    catch (err) {
        // Roll back our un-finalized claim so staff can retry.
        await prisma.aiKnowledgeGap.updateMany({ where: { id, orgId, status: 'resolved', resolvedRef: null }, data: { status: 'open' } }).catch(() => { });
        return { ok: false, error: 'Không tạo được tri thức: ' + err.message };
    }
    await prisma.aiKnowledgeGap.update({
        where: { id },
        data: { resolvedBy: userId, resolvedRef: entryId, notes: input.notes ?? null },
    });
    logger.info({ id, entryId }, '[knowledge-gap] resolved → KB entry');
    return { ok: true, entryId };
}
/**
 * Hand the gap to the AI MASTER: seed an AiFeedback(missing_info) so the existing
 * feedback → Master → proposal(knowledge_entry) pipeline can draft the answer.
 * Gap leaves the queue (status=resolved, resolvedRef = feedback id); staff finish
 * in the "Cải thiện AI" tab.
 */
export async function resolveGapViaMaster(id, orgId, userId, note) {
    const gap = await prisma.aiKnowledgeGap.findFirst({
        where: { id, orgId },
        select: { question: true, suggestion: true, status: true, conversationId: true, messageId: true, aiReplyRunId: true },
    });
    if (!gap)
        return { ok: false, error: 'Không tìm thấy phản hồi' };
    if (gap.status !== 'open')
        return { ok: false, error: `Phản hồi đã ${gap.status}` };
    // Claim atomically before creating the feedback (same TOCTOU guard as resolveGap).
    const claimed = await prisma.aiKnowledgeGap.updateMany({ where: { id, orgId, status: 'open' }, data: { status: 'resolved' } });
    if (claimed.count === 0)
        return { ok: false, error: 'Phản hồi đã được xử lý' };
    // The staff's own directive (e.g. "we only offer A, B — update the scenario") is
    // carried into the feedback so the Master proposes what the HUMAN wants, not just
    // a naive FAQ for the missing term.
    const cleanNote = note?.trim().slice(0, 2000);
    const text = `Khách hỏi (AI thiếu thông tin): ${gap.question}`
        + (cleanNote ? `\nHướng xử lý của nhân viên: ${cleanNote}` : '')
        + (gap.suggestion ? `\nGợi ý của AI: ${gap.suggestion.slice(0, 500)}` : '');
    let feedbackId;
    try {
        const fb = await recordFeedback({
            orgId,
            conversationId: gap.conversationId ?? undefined,
            messageId: gap.messageId ?? undefined,
            aiReplyRunId: gap.aiReplyRunId ?? undefined,
            authorUserId: userId,
            text,
            category: 'missing_info',
        });
        feedbackId = fb.id;
    }
    catch (err) {
        await prisma.aiKnowledgeGap.updateMany({ where: { id, orgId, status: 'resolved', resolvedRef: null }, data: { status: 'open' } }).catch(() => { });
        return { ok: false, error: 'Không chuyển được cho Master: ' + err.message };
    }
    await prisma.aiKnowledgeGap.update({
        where: { id },
        data: {
            resolvedBy: userId, resolvedRef: feedbackId,
            notes: cleanNote ? `Đã chuyển Master (kèm hướng dẫn): ${cleanNote.slice(0, 200)}` : 'Đã chuyển AI Master soạn',
        },
    });
    logger.info({ id, feedbackId }, '[knowledge-gap] routed to Master');
    return { ok: true, feedbackId };
}
//# sourceMappingURL=knowledge-gap-service.js.map