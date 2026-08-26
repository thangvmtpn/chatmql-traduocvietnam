import { SenderType } from '../../shared/constants.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
export async function activityRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/activity — Recent activity feed
    app.get('/api/v1/activity', async (request) => {
        const user = request.user;
        const limit = Math.min(parseInt(request.query.limit || '10'), 50);
        // Aggregate recent activities from multiple tables
        const [recentContacts, recentMessages, recentAppointments] = await Promise.all([
            // Recently created/updated contacts
            prisma.contact.findMany({
                where: { orgId: user.orgId, isGroup: false, deletedAt: null },
                orderBy: { updatedAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    fullName: true,
                    lifecycleStage: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            // Recent messages (sent by org users)
            prisma.message.findMany({
                where: {
                    conversation: { orgId: user.orgId },
                    senderType: SenderType.SELF,
                },
                orderBy: { sentAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    content: true,
                    contentType: true,
                    sentAt: true,
                    conversation: {
                        select: {
                            contact: { select: { id: true, fullName: true } },
                        },
                    },
                },
            }),
            // Recent appointments
            prisma.appointment.findMany({
                where: { orgId: user.orgId },
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    type: true,
                    status: true,
                    createdAt: true,
                    contact: { select: { id: true, fullName: true } },
                },
            }),
        ]);
        const activities = [];
        for (const c of recentContacts) {
            const isNew = c.createdAt.getTime() === c.updatedAt.getTime();
            activities.push({
                type: isNew ? 'contact_created' : 'contact_updated',
                name: c.fullName || 'Khách hàng',
                action: isNew ? 'vừa được thêm mới' : `chuyển sang "${c.lifecycleStage || 'cập nhật'}"`,
                time: c.updatedAt.toISOString(),
                contactId: c.id,
            });
        }
        for (const m of recentMessages) {
            const name = m.conversation?.contact?.fullName || 'Khách hàng';
            const cId = m.conversation?.contact?.id;
            const preview = m.contentType === 'text'
                ? `gửi tin nhắn: "${(m.content || '').slice(0, 30)}..."`
                : `gửi ${m.contentType}`;
            activities.push({
                type: 'message_sent',
                name,
                action: preview,
                time: m.sentAt.toISOString(),
                contactId: cId,
            });
        }
        for (const a of recentAppointments) {
            const name = a.contact?.fullName || 'Khách hàng';
            const cId = a.contact?.id;
            activities.push({
                type: 'appointment',
                name,
                action: `tạo lịch hẹn ${a.type || ''}`.trim(),
                time: a.createdAt.toISOString(),
                contactId: cId,
            });
        }
        // Sort descending by time, take limit
        activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        return { activities: activities.slice(0, limit) };
    });
}
//# sourceMappingURL=activity-routes.js.map