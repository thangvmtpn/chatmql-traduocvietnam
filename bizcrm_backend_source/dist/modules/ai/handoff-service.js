/**
 * handoff-service.ts — Apply an AI→human handoff for a conversation.
 *
 * Responsibilities:
 * 1. Switch aiMode to 'manual' with a reason string
 * 2. Assign conversation to the channel account's owner user (best-effort)
 * 3. Write an ActivityLog entry
 * 4. Emit chat:ai-mode-changed + a notification to the assignee
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { emitAiModeChanged, emitNotification } from '../realtime/socket-gateway.js';
export async function applyHandoff(orgId, convId, reason) {
    const handoffReason = reason || 'ai_handoff';
    // Load conversation + channel account owner to resolve assignee
    const conv = await prisma.conversation.findFirst({
        where: { id: convId, orgId },
        select: {
            id: true,
            assignedUserId: true,
            channelAccount: { select: { ownerUserId: true } },
        },
    });
    if (!conv) {
        logger.warn({ convId, orgId }, '[handoff] conversation not found — skipping');
        return;
    }
    // Resolve assignee: use current assignee if set, else channel account owner
    const assigneeId = conv.assignedUserId || conv.channelAccount?.ownerUserId || null;
    // Update conversation — switch to manual, optionally set assignee
    await prisma.conversation.update({
        where: { id: convId },
        data: {
            aiMode: 'manual',
            aiModeReason: handoffReason,
            ...(assigneeId && !conv.assignedUserId ? { assignedUserId: assigneeId } : {}),
        },
    });
    // Write activity log — fire-and-forget
    prisma.activityLog.create({
        data: {
            orgId,
            action: 'conversation.ai_mode_changed',
            entityType: 'Conversation',
            entityId: convId,
            details: { to: 'manual', reason: handoffReason, by: 'ai_handoff' },
        },
    }).catch(err => logger.error({ err }, '[handoff] activityLog failed'));
    // Emit mode change to conversation viewers + org sidebar
    try {
        emitAiModeChanged(orgId, convId, {
            convId,
            aiMode: 'manual',
            aiModeReason: handoffReason,
            by: 'ai_handoff',
        });
    }
    catch { /* socket not ready */ }
    // Notify the assignee (best-effort)
    if (assigneeId) {
        try {
            const notification = await prisma.notification.create({
                data: {
                    orgId,
                    userId: assigneeId,
                    type: 'handoff',
                    title: 'AI đã chuyển hội thoại cho bạn',
                    body: `Lý do: ${handoffReason}`,
                    link: `/conversations?id=${convId}`,
                },
            });
            emitNotification(orgId, assigneeId, notification);
        }
        catch (err) {
            logger.warn({ err, convId, assigneeId }, '[handoff] notification create failed');
        }
    }
    logger.info({ convId, orgId, assigneeId, reason: handoffReason }, '[handoff] applied');
}
//# sourceMappingURL=handoff-service.js.map