/**
 * quote-subscribers.ts — phản ứng với domain event của báo giá.
 *
 * Dùng bus có sẵn (`onDomainEvent`) — ĐỒNG BỘ, fire-and-forget. Handler ở đây
 * KHÔNG được làm hỏng luồng tạo/gửi báo giá: mọi thứ async đều `void … .catch()`.
 *
 * Ba việc bắt buộc (không có thì số liệu CRM sai lệch):
 *   1. Đồng bộ vòng đời khách  → sent = opportunity, accepted = customer
 *   2. CdpEvent                → nuôi segment + báo cáo
 *   3. ActivityLog             → hiện trong timeline khách hàng
 * Cộng thêm: thông báo cho sale khi khách mở / phản hồi.
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { onDomainEvent } from '../../shared/domain-events.js';
import { changeLifecycleStage } from '../cdp/lifecycle-service.js';
const QUOTE_EVENTS = new Set([
    'quote.created', 'quote.updated', 'quote.sent', 'quote.viewed',
    'quote.accepted', 'quote.rejected', 'quote.status_changed',
]);
/** Stage tối thiểu sau khi gửi báo giá — không hạ cấp khách đã là customer. */
const STAGE_RANK = {
    subscriber: 0, lead: 1, qualified: 2, opportunity: 3, customer: 4, evangelist: 5, churned: -1,
};
async function loadQuote(id, orgId) {
    return prisma.quote.findFirst({
        where: { id, orgId },
        select: {
            id: true, orgId: true, number: true, total: true, type: true, status: true,
            contactId: true, assignedUserId: true, createdById: true,
            contact: { select: { id: true, lifecycleStage: true, fullName: true, crmName: true } },
        },
    });
}
/** 1. Vòng đời khách hàng — chỉ tiến, không lùi. */
async function syncLifecycle(event, quote) {
    const target = event.type === 'quote.accepted' ? 'customer'
        : event.type === 'quote.sent' ? 'opportunity'
            : null;
    if (!target || !quote.contact)
        return;
    const currentRank = STAGE_RANK[quote.contact.lifecycleStage] ?? 0;
    const targetRank = STAGE_RANK[target] ?? 0;
    if (currentRank >= targetRank)
        return; // đã bằng hoặc cao hơn → bỏ qua
    await changeLifecycleStage({
        orgId: quote.orgId,
        contactId: quote.contactId,
        toStage: target,
        changedBy: 'system',
        reason: `Báo giá ${quote.number} ${event.type === 'quote.accepted' ? 'được chấp nhận' : 'đã gửi'}`,
    });
}
/** 2. CdpEvent — nuôi segment, lead scoring, báo cáo. */
async function trackCdp(event, quote) {
    const eventName = event.type.replace('.', '_'); // quote.sent → quote_sent
    await prisma.cdpEvent.create({
        data: {
            orgId: quote.orgId,
            contactId: quote.contactId,
            eventName,
            source: 'system',
            properties: {
                quoteId: quote.id,
                number: quote.number,
                type: quote.type,
                total: Number(quote.total),
                status: quote.status,
            },
        },
    });
}
/** 3. ActivityLog — timeline khách hàng. */
async function logActivity(event, quote) {
    await prisma.activityLog.create({
        data: {
            orgId: quote.orgId,
            userId: quote.assignedUserId ?? quote.createdById ?? null,
            action: event.type,
            entityType: 'quote',
            entityId: quote.id,
            details: {
                number: quote.number,
                total: Number(quote.total),
                contactId: quote.contactId,
                status: quote.status,
            },
        },
    });
}
/** 4. Báo cho sale khi khách mở / phản hồi — khoảnh khắc vàng để gọi điện. */
async function notifyOwner(event, quote) {
    const target = quote.assignedUserId ?? quote.createdById;
    if (!target)
        return;
    const name = quote.contact?.crmName || quote.contact?.fullName || 'Khách hàng';
    const map = {
        'quote.viewed': { title: 'Khách đã xem báo giá', body: `${name} vừa mở ${quote.number}` },
        'quote.accepted': { title: '🎉 Báo giá được chấp nhận', body: `${name} đã đồng ý ${quote.number}` },
        'quote.rejected': { title: 'Báo giá bị từ chối', body: `${name} đã từ chối ${quote.number}` },
    };
    const payload = map[event.type];
    if (!payload)
        return;
    // Người nhận phải cùng org — chặn thông báo lạc sang org khác
    const user = await prisma.user.findFirst({
        where: { id: target, orgId: quote.orgId, isActive: true },
        select: { id: true },
    });
    if (!user)
        return;
    await prisma.notification.create({
        data: {
            orgId: quote.orgId,
            userId: user.id,
            type: 'quote',
            title: payload.title,
            body: payload.body,
            link: `/quotes?id=${quote.id}`,
        },
    });
}
async function handleQuoteEvent(event) {
    const quote = await loadQuote(event.id, event.orgId);
    if (!quote)
        return;
    // Chạy độc lập — một cái lỗi không chặn các cái còn lại
    const tasks = [
        ['lifecycle', syncLifecycle(event, quote)],
        ['cdp', trackCdp(event, quote)],
        ['activity', logActivity(event, quote)],
        ['notify', notifyOwner(event, quote)],
    ];
    const results = await Promise.allSettled(tasks.map(([, p]) => p));
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            logger.error({ err: r.reason, event: event.type, quoteId: event.id }, `[quotes] subscriber ${tasks[i][0]} failed`);
        }
    });
}
let unsubscribe = null;
/** Đăng ký subscriber. Idempotent — gọi 2 lần không tạo listener trùng. */
export function registerQuoteSubscribers() {
    if (unsubscribe)
        return unsubscribe;
    unsubscribe = onDomainEvent((event) => {
        if (!QUOTE_EVENTS.has(event.type))
            return;
        // Bus là ĐỒNG BỘ → không await; nuốt lỗi để không phá luồng chính
        void handleQuoteEvent(event).catch((err) => {
            logger.error({ err, event: event.type }, '[quotes] subscriber failed');
        });
    });
    logger.info('[quotes] domain-event subscribers registered');
    return unsubscribe;
}
//# sourceMappingURL=quote-subscribers.js.map