/**
 * pending-action-service.ts — Human-in-loop ACTION tools (P7).
 *
 * The responder requests a mutating action (e.g. book an appointment) → we record
 * an AiPendingAction (status=pending). Staff must CONFIRM before it executes.
 * NEVER auto-executed (mirrors the AiLogicProposal safety model).
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
const SELECT = {
    id: true, orgId: true, conversationId: true, contactId: true,
    type: true, payload: true, summary: true, status: true,
    reviewedBy: true, executedRef: true, createdAt: true, updatedAt: true,
};
function apptSummary(p) {
    const who = p.customer_name || '';
    const when = p.desired_time || '';
    const note = p.note || '';
    return `Đặt lịch${who ? ` cho ${who}` : ''}${when ? ` — ${when}` : ''}${note ? ` (${note})` : ''}`.slice(0, 240);
}
function orderSummary(p) {
    const who = p.customer_name || 'Khách hàng';
    const phone = p.phone || '';
    const addr = p.address || '';
    const items = Array.isArray(p.items)
        ? p.items.map((it) => `${it.quantity || 1}x ${it.product_name || 'SP'}`).join(', ')
        : 'Sản phẩm';
    const total = p.total_amount ? `${Number(p.total_amount).toLocaleString('vi-VN')}đ` : '';
    return `Đơn hàng: ${who}${phone ? ` (${phone})` : ''} — ${items}${total ? ` — Tổng: ${total}` : ''}${addr ? ` — Đ/c: ${addr}` : ''}`.slice(0, 240);
}
/** Record a pending action from a responder tool call. Resolves contactId from the conversation. */
export async function recordPendingAction(input) {
    let contactId = null;
    if (input.conversationId) {
        const conv = await prisma.conversation.findFirst({
            where: { id: input.conversationId, orgId: input.orgId },
            select: { contactId: true },
        });
        contactId = conv?.contactId ?? null;
    }
    const summary = input.type === 'request_appointment'
        ? apptSummary(input.payload)
        : input.type === 'create_order'
            ? orderSummary(input.payload)
            : input.type;
    const row = await prisma.aiPendingAction.create({
        data: {
            orgId: input.orgId,
            conversationId: input.conversationId ?? null,
            contactId,
            type: input.type,
            payload: input.payload,
            summary,
            status: 'pending',
        },
        select: { id: true },
    });
    // Auto-enrich contact info (name, phone, address) when order is created
    if (input.type === 'create_order' && contactId) {
        const p = input.payload;
        const name = typeof p.customer_name === 'string' ? p.customer_name.trim() : '';
        const phone = typeof p.phone === 'string' ? p.phone.trim() : '';
        const address = typeof p.address === 'string' ? p.address.trim() : '';
        try {
            const contact = await prisma.contact.findUnique({ where: { id: contactId } });
            if (contact) {
                const metadata = (contact.metadata && typeof contact.metadata === 'object' ? contact.metadata : {});
                if (address)
                    metadata.address = address;
                await prisma.contact.update({
                    where: { id: contactId },
                    data: {
                        fullName: contact.fullName || name || undefined,
                        phone: contact.phone || phone || undefined,
                        metadata: metadata,
                    },
                });
            }
        }
        catch (err) {
            logger.warn({ err: err?.message, contactId }, '[pending-action] failed to enrich contact on order');
        }
    }
    return { id: row.id, summary };
}
export async function listPendingActions(orgId, status, limit = 100) {
    return prisma.aiPendingAction.findMany({
        where: { orgId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        select: SELECT,
    });
}
export async function rejectAction(id, orgId, reviewedBy) {
    const res = await prisma.aiPendingAction.updateMany({
        where: { id, orgId, status: 'pending' },
        data: { status: 'rejected', reviewedBy },
    });
    return res.count > 0;
}
/**
 * Confirm + execute a pending action. Only 'pending' actions can be confirmed.
 * Execution per type. Returns the created entity ref (or null).
 */
export async function confirmAction(id, orgId, reviewedBy) {
    const action = await prisma.aiPendingAction.findFirst({ where: { id, orgId } });
    if (!action)
        return { ok: false, executedRef: null, error: 'Không tìm thấy hành động' };
    if (action.status !== 'pending')
        return { ok: false, executedRef: null, error: `Hành động đã ${action.status}` };
    let executedRef = null;
    if (action.type === 'request_appointment') {
        const p = (action.payload ?? {});
        const rawTime = p.desired_time || '';
        const parsed = rawTime ? new Date(rawTime) : null;
        // AI-parsed time is best-effort; staff can adjust in the Appointments UI.
        const appointmentDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 24 * 60 * 60 * 1000);
        const noteBits = [p.note, p.customer_name ? `KH: ${p.customer_name}` : '', p.phone ? `SĐT: ${p.phone}` : '']
            .filter(Boolean).join(' · ');
        const appt = await prisma.appointment.create({
            data: {
                orgId,
                contactId: action.contactId,
                appointmentDate,
                appointmentTime: rawTime || null,
                type: 'ai',
                status: 'scheduled',
                notes: `[AI] ${noteBits}`.slice(0, 500),
            },
            select: { id: true },
        });
    }
    else if (action.type === 'create_order') {
        executedRef = action.id;
    }
    else {
        return { ok: false, executedRef: null, error: `Loại hành động chưa hỗ trợ: ${action.type}` };
    }
    await prisma.aiPendingAction.update({
        where: { id },
        data: { status: 'confirmed', reviewedBy, executedRef },
    });
    logger.info({ id, type: action.type, executedRef }, '[pending-action] confirmed + executed');
    return { ok: true, executedRef };
}
//# sourceMappingURL=pending-action-service.js.map