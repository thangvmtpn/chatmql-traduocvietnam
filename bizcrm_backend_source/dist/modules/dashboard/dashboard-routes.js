import { SenderType } from '../../shared/constants.js';
import { resolveAllowedAccountIds, resolveScopedAccountIds } from './report-routes.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import dayjs from 'dayjs';
import { logger } from '../../shared/logger.js';
import { fetchSalesStats } from '../orders/crm-order-client.js';
export async function dashboardRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/dashboard/kpi — 6 thẻ số liệu nhanh trên Dashboard
    // Phân quyền:
    // - Admin / Owner: hiển thị tổng của toàn bộ các tài khoản con (toàn tổ chức).
    // - Tài khoản con (nhân viên/quản lý): chỉ hiển thị số liệu của tài khoản/khách hàng mà tài khoản đó đang care.
    app.get('/api/v1/dashboard/kpi', async (request) => {
        const user = request.user;
        const today = dayjs().startOf('day').toDate();
        const endOfToday = dayjs().endOf('day').toDate();
        const weekAgo = dayjs().subtract(7, 'day').toDate();
        const liveAccount = { isDisabled: false, deletedAt: null };
        const allowedAccountIds = await resolveAllowedAccountIds(user);
        // Admin / Owner: Hiển thị tổng của toàn bộ các tài khoản con trong tổ chức
        if (!allowedAccountIds) {
            const [totalContacts, newContactsThisWeek, appointmentsToday, messagesUnreplied, messagesToday, unreadConversations,] = await Promise.all([
                prisma.contact.count({ where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null } }),
                prisma.contact.count({ where: { orgId: user.orgId, createdAt: { gte: weekAgo }, mergedInto: null, isGroup: false, deletedAt: null } }),
                prisma.appointment.count({ where: { orgId: user.orgId, appointmentDate: { gte: today, lte: endOfToday } } }),
                prisma.conversation.count({ where: { orgId: user.orgId, isReplied: false, channelAccount: liveAccount } }),
                prisma.message.count({ where: { conversation: { orgId: user.orgId, channelAccount: liveAccount }, sentAt: { gte: today } } }),
                prisma.conversation.count({ where: { orgId: user.orgId, unreadCount: { gt: 0 }, channelAccount: liveAccount } }),
            ]);
            return {
                messagesToday,
                messagesUnreplied,
                messagesUnread: unreadConversations,
                appointmentsToday,
                newContactsThisWeek,
                totalContacts,
            };
        }
        // Tài khoản con: Chỉ hiển thị số liệu của các tài khoản con mà mình đang care
        if (allowedAccountIds.length === 0) {
            const [totalContacts, newContactsThisWeek, appointmentsToday] = await Promise.all([
                prisma.contact.count({ where: { orgId: user.orgId, assignedUserId: user.id, mergedInto: null, isGroup: false, deletedAt: null } }),
                prisma.contact.count({ where: { orgId: user.orgId, assignedUserId: user.id, createdAt: { gte: weekAgo }, mergedInto: null, isGroup: false, deletedAt: null } }),
                prisma.appointment.count({ where: { orgId: user.orgId, assignedUserId: user.id, appointmentDate: { gte: today, lte: endOfToday } } }),
            ]);
            return {
                messagesToday: 0,
                messagesUnreplied: 0,
                messagesUnread: 0,
                appointmentsToday,
                newContactsThisWeek,
                totalContacts,
            };
        }
        const convScope = {
            orgId: user.orgId,
            channelAccountId: { in: allowedAccountIds },
            channelAccount: liveAccount,
        };
        const contactScope = {
            orgId: user.orgId,
            mergedInto: null,
            isGroup: false,
            deletedAt: null,
            OR: [
                { assignedUserId: user.id },
                { conversations: { some: { channelAccountId: { in: allowedAccountIds } } } },
            ],
        };
        const [totalContacts, newContactsThisWeek, appointmentsToday, messagesUnreplied, messagesToday, unreadConversations,] = await Promise.all([
            prisma.contact.count({ where: contactScope }),
            prisma.contact.count({ where: { ...contactScope, createdAt: { gte: weekAgo } } }),
            prisma.appointment.count({
                where: {
                    orgId: user.orgId,
                    appointmentDate: { gte: today, lte: endOfToday },
                    OR: [
                        { assignedUserId: user.id },
                        { contact: contactScope },
                    ],
                },
            }),
            prisma.conversation.count({ where: { ...convScope, isReplied: false } }),
            prisma.message.count({ where: { conversation: convScope, sentAt: { gte: today } } }),
            prisma.conversation.count({ where: { ...convScope, unreadCount: { gt: 0 } } }),
        ]);
        return {
            messagesToday,
            messagesUnreplied,
            messagesUnread: unreadConversations,
            appointmentsToday,
            newContactsThisWeek,
            totalContacts,
        };
    });
    // GET /api/v1/dashboard/overview — số liệu cho dashboard mới.
    app.get('/api/v1/dashboard/overview', async (request) => {
        const user = request.user;
        const today = dayjs().startOf('day').toDate();
        const endOfToday = dayjs().endOf('day').toDate();
        const weekAgo = dayjs().subtract(7, 'day').toDate();
        const liveAccount = { isDisabled: false, deletedAt: null };
        const isBoss = ['owner', 'admin'].includes(user.role);
        const allowedAccountIds = await resolveAllowedAccountIds(user);
        let convScope = { orgId: user.orgId, channelAccount: liveAccount };
        let contactScope = { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null };
        let apptScope = { orgId: user.orgId, appointmentDate: { gte: today, lte: endOfToday } };
        if (!isBoss) {
            if (!allowedAccountIds || allowedAccountIds.length === 0) {
                convScope = { orgId: user.orgId, channelAccountId: '__none__' };
                contactScope = { orgId: user.orgId, assignedUserId: user.id, mergedInto: null, isGroup: false, deletedAt: null };
                apptScope = { orgId: user.orgId, assignedUserId: user.id, appointmentDate: { gte: today, lte: endOfToday } };
            }
            else {
                convScope = { orgId: user.orgId, channelAccountId: { in: allowedAccountIds }, channelAccount: liveAccount };
                contactScope = {
                    orgId: user.orgId,
                    mergedInto: null,
                    isGroup: false,
                    deletedAt: null,
                    OR: [
                        { assignedUserId: user.id },
                        { conversations: { some: { channelAccountId: { in: allowedAccountIds } } } },
                    ],
                };
                apptScope = {
                    orgId: user.orgId,
                    appointmentDate: { gte: today, lte: endOfToday },
                    OR: [
                        { assignedUserId: user.id },
                        { contact: contactScope },
                    ],
                };
            }
        }
        const [totalContacts, newContactsThisWeek, appointmentsToday, convUnreplied, convUnread, unreadAgg, messagesToday, myReplies, myConvUnreplied,] = await Promise.all([
            prisma.contact.count({ where: contactScope }),
            prisma.contact.count({ where: { ...contactScope, createdAt: { gte: weekAgo } } }),
            prisma.appointment.count({ where: apptScope }),
            prisma.conversation.count({ where: { ...convScope, isReplied: false } }),
            prisma.conversation.count({ where: { ...convScope, unreadCount: { gt: 0 } } }),
            prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: convScope }),
            prisma.message.count({ where: { conversation: convScope, sentAt: { gte: today } } }),
            // Việc của riêng mình hôm nay.
            prisma.message.count({
                where: { repliedByUserId: user.id, sentAt: { gte: today } },
            }),
            prisma.conversation.count({ where: { ...convScope, isReplied: false, assignedUserId: user.id } }),
        ]);
        // CRM hỏng thì vẫn trả phần hội thoại
        let sales = null;
        let salesError = null;
        try {
            sales = await fetchSalesStats(user.email?.split('@')[0]);
        }
        catch (err) {
            salesError = err?.detail || err?.message || 'Không lấy được số liệu bán hàng từ CRM';
            logger.warn({ err }, '[dashboard] Không lấy được thống kê bán hàng');
        }
        return {
            conversations: {
                unrepliedConversations: convUnreplied,
                unreadConversations: convUnread,
                unreadMessages: unreadAgg._sum.unreadCount ?? 0,
                messagesToday,
            },
            me: {
                repliesToday: myReplies,
                unrepliedAssigned: myConvUnreplied,
            },
            contacts: { total: totalContacts, newThisWeek: newContactsThisWeek },
            appointmentsToday,
            sales,
            salesError,
            // Nhân viên mặc định xem số của mình; chủ và quản trị xem toàn công ty.
            defaultScope: isBoss ? 'org' : 'mine',
            role: user.role,
        };
    });
    // GET /api/v1/dashboard/pipeline — count contacts per lifecycle stage.
    // Returns { status, _count } shape for back-compat with frontend that
    // expects the old `status` key — `status` is now the lifecycle stage.
    app.get('/api/v1/dashboard/pipeline', async (request) => {
        const user = request.user;
        const grouped = await prisma.contact.groupBy({
            by: ['lifecycleStage'],
            where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null },
            _count: { _all: true },
        });
        return grouped.map(g => ({ status: g.lifecycleStage, lifecycleStage: g.lifecycleStage, _count: g._count }));
    });
    // GET /api/v1/dashboard/sources
    app.get('/api/v1/dashboard/sources', async (request) => {
        const user = request.user;
        const grouped = await prisma.contact.groupBy({
            by: ['source'],
            where: { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null },
            _count: { _all: true },
        });
        return grouped.map(g => ({ source: g.source ?? 'Không rõ', _count: g._count }));
    });
    // GET /api/v1/dashboard/message-volume — last 7 days
    app.get('/api/v1/dashboard/message-volume', async (request, reply) => {
        const user = request.user;
        // Cùng phạm vi với báo cáo Chat → Đơn: vai trò (nhân viên/quản lý chỉ thấy
        // tài khoản được cấp) ∩ bộ lọc kênh/tài khoản trên UI — hai khối trên cùng
        // màn Tổng quan không được lệch số như đợt kênh sandbox trước đây.
        const scoped = await resolveScopedAccountIds(user.orgId, user, request.query);
        if (scoped.error)
            return reply.status(scoped.status ?? 400).send({ error: scoped.error });
        // Chỉ kênh đang sống — đồng nhất với /kpi (kênh sandbox của máy mô phỏng
        // từng khiến thẻ "Tin nhắn hôm nay" và cột biểu đồ cùng ngày lệch số).
        const liveAcc = { isDisabled: false, deletedAt: null };
        const convScope = scoped.accountIds
            ? scoped.accountIds.length
                ? { channelAccountId: { in: scoped.accountIds }, channelAccount: liveAcc }
                : { channelAccountId: '__none__' }
            : { channelAccount: liveAcc };
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = dayjs().subtract(i, 'day');
            const start = d.startOf('day').toDate();
            const end = d.endOf('day').toDate();
            const [sent, received] = await Promise.all([
                prisma.message.count({
                    where: {
                        conversation: { orgId: user.orgId, ...convScope },
                        senderType: SenderType.SELF,
                        sentAt: { gte: start, lte: end },
                    },
                }),
                prisma.message.count({
                    where: {
                        conversation: { orgId: user.orgId, ...convScope },
                        senderType: SenderType.CONTACT,
                        sentAt: { gte: start, lte: end },
                    },
                }),
            ]);
            days.push({ date: d.format('YYYY-MM-DD'), sent, received });
        }
        return { data: days };
    });
}
//# sourceMappingURL=dashboard-routes.js.map