/**
 * lifecycle-service.ts — shared helper for changing a Contact's lifecycle stage.
 *
 * Centralizes the side-effects of a stage transition: update Contact, write
 * LifecycleLog audit row, emit CdpEvent, fire `lifecycle_changed` automation.
 *
 * Consumers:
 *   - cdp-lifecycle-routes.ts (POST /contacts/:id/lifecycle)
 *   - contact-routes.ts        (POST /contacts/:id/convert)
 *   - contact-routes.ts        (PUT  /contacts/:id when lifecycleStage in body)
 */
import { prisma } from '../../shared/prisma-client.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
export const LIFECYCLE_STAGES = [
    'subscriber', 'lead', 'qualified', 'opportunity', 'customer', 'evangelist', 'churned',
];
export const STAGE_LABELS = {
    subscriber: 'Đăng ký',
    lead: 'Lead',
    qualified: 'Đủ điều kiện',
    opportunity: 'Cơ hội',
    customer: 'Khách hàng',
    evangelist: 'VIP/Đại sứ',
    churned: 'Rời bỏ',
};
export function isValidStage(stage) {
    return LIFECYCLE_STAGES.includes(stage);
}
/**
 * Change a contact's lifecycleStage. Skips work if already at target stage.
 * Throws if the contact doesn't exist in the org. Caller is responsible for
 * auth + org scoping.
 */
export async function changeLifecycleStage(input) {
    const { orgId, contactId, changedBy, reason } = input;
    const toStage = input.toStage.trim();
    const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId },
        select: { id: true, lifecycleStage: true },
    });
    if (!contact)
        throw new Error('Contact not found');
    const fromStage = contact.lifecycleStage || null;
    // No-op when already at the target stage. We still return a synthetic log
    // shape so callers don't need to branch.
    if (fromStage === toStage) {
        return {
            log: { id: '', fromStage, toStage, createdAt: new Date() },
            fromStage,
            toStage,
        };
    }
    const log = await prisma.lifecycleLog.create({
        data: {
            orgId,
            contactId,
            fromStage,
            toStage,
            changedBy,
            reason: reason?.trim() || null,
        },
    });
    await prisma.contact.update({
        where: { id: contactId },
        data: { lifecycleStage: toStage, lastActivity: new Date() },
    });
    await prisma.cdpEvent.create({
        data: {
            orgId,
            contactId,
            eventName: 'lifecycle_change',
            properties: { fromStage, toStage, reason: reason ?? null },
            source: 'system',
        },
    });
    runAutomationRules('lifecycle_changed', {
        orgId,
        contactId,
        triggerData: {
            fromStage: fromStage || '',
            toStage,
            reason: reason?.trim() || '',
        },
    }).catch(() => { });
    emitDomainEvent({ type: 'contact.updated', orgId, id: contactId });
    return { log, fromStage, toStage };
}
//# sourceMappingURL=lifecycle-service.js.map