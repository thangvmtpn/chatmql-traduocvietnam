/**
 * notification-generator.ts — Scheduled job for automatic notification creation.
 *
 * Runs every 5 minutes to detect:
 *   1. Unreplied conversations > 30 minutes
 *   2. Disconnected Zalo accounts (connectivity alerts)
 *
 * Creates Notification records and emits Socket.IO events.
 *
 * Inspired by ZaloCRM notification-routes.ts computed notifications,
 * but Biz-CRM persists them for historical tracking.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/prisma-client.js';
import { Prisma } from '@prisma/client';
import { getIO } from '../realtime/socket-gateway.js';
import { logger } from '../../shared/logger.js';
const UNREPLIED_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
/**
 * Initialize the notification generator cron job.
 * Should be called once on server startup after Socket.IO is ready.
 */
export function initNotificationGenerator() {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            await generateUnrepliedAlerts();
        }
        catch (err) {
            logger.error('[notification-generator] Error:', err.message);
        }
    });
    // Run connectivity check every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            await generateConnectivityAlerts();
        }
        catch (err) {
            logger.error('[notification-generator] Connectivity check error:', err.message);
        }
    });
    logger.info('[notification-generator] 🔔 Notification crons registered (unreplied: 5m, connectivity: 15m)');
}
/**
 * Detect conversations unreplied for > 30 minutes and create alerts.
 * Only creates one notification per conversation per day to avoid spam.
 */
async function generateUnrepliedAlerts() {
    const threshold = new Date(Date.now() - UNREPLIED_THRESHOLD_MS);
    // Find conversations that:
    // - Are not replied (isReplied = false)
    // - Last message was more than 30 minutes ago
    // - Have at least one message from contact
    const unreplied = await prisma.conversation.findMany({
        where: {
            isReplied: false,
            lastMessageAt: {
                lte: threshold, // Last message older than 30 min
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within last 24h (ignore old dead convs)
            },
        },
        include: {
            contact: { select: { id: true, fullName: true } },
            channelAccount: { select: { id: true, displayName: true, ownerUserId: true } },
        },
        take: 100, // Limit batch size
    });
    if (unreplied.length === 0)
        return;
    const io = getIO();
    let created = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const conv of unreplied) {
        const contactName = conv.contact?.fullName || 'Khách hàng';
        const accountName = conv.channelAccount?.displayName || 'Zalo';
        // Find users who should be notified (owner of account + assigned user)
        const targetUserIds = [];
        if (conv.channelAccount?.ownerUserId) {
            targetUserIds.push(conv.channelAccount.ownerUserId);
        }
        // Also get users with access to this Zalo account
        const accessUsers = await prisma.channelAccountAccess.findMany({
            where: { channelAccountId: conv.channelAccountId, permission: { in: ['chat', 'admin'] } },
            select: { userId: true },
        });
        for (const a of accessUsers) {
            if (!targetUserIds.includes(a.userId)) {
                targetUserIds.push(a.userId);
            }
        }
        for (const userId of targetUserIds) {
            // Check if we already sent a notification for this conv today
            const existing = await prisma.notification.findFirst({
                where: {
                    userId,
                    type: 'message',
                    link: { contains: conv.id },
                    createdAt: { gte: today },
                },
            });
            if (existing)
                continue; // Already notified today
            await prisma.notification.create({
                data: {
                    orgId: conv.orgId,
                    userId,
                    type: 'message',
                    title: `⚠️ Tin nhắn chưa trả lời: ${contactName}`,
                    body: `Cuộc hội thoại với ${contactName} (${accountName}) chưa được phản hồi quá 30 phút.`,
                    link: `/conversations?id=${conv.id}`,
                },
            });
            created++;
        }
        // Emit real-time alert to org
        io.to(`org:${conv.orgId}`).emit('notification:new', {
            type: 'unreplied',
            conversationId: conv.id,
            contactName,
        });
    }
    if (created > 0) {
        logger.info(`[notification-generator] Created ${created} unreplied alerts for ${unreplied.length} conversations`);
    }
}
/**
 * Detect disconnected Zalo accounts and alert org admins.
 * Only alerts once per disconnection event (checks lastConnectedAt).
 */
async function generateConnectivityAlerts() {
    // Find accounts that should be connected but aren't
    const disconnected = await prisma.channelAccount.findMany({
        where: {
            status: 'disconnected',
            sessionData: { not: Prisma.JsonNull }, // Had a saved session → should be connected
            lastConnectedAt: { not: null },
        },
        select: {
            id: true,
            orgId: true,
            displayName: true,
            lastConnectedAt: true,
        },
    });
    if (disconnected.length === 0)
        return;
    const io = getIO();
    let created = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const account of disconnected) {
        // Get org admins
        const admins = await prisma.user.findMany({
            where: { orgId: account.orgId, role: { in: ['owner', 'admin'] }, isActive: true },
            select: { id: true },
        });
        for (const admin of admins) {
            // Check if already notified today
            const existing = await prisma.notification.findFirst({
                where: {
                    userId: admin.id,
                    type: 'automation',
                    link: { contains: account.id },
                    createdAt: { gte: today },
                },
            });
            if (existing)
                continue;
            await prisma.notification.create({
                data: {
                    orgId: account.orgId,
                    userId: admin.id,
                    type: 'automation',
                    title: `🔌 Mất kết nối: ${account.displayName || 'Tài khoản Zalo'}`,
                    body: `Tài khoản Zalo "${account.displayName}" đã mất kết nối. Vui lòng kết nối lại.`,
                    link: `/integrations`,
                },
            });
            created++;
        }
        if (admins.length > 0) {
            io.to(`org:${account.orgId}`).emit('notification:new', {
                type: 'connectivity',
                accountId: account.id,
                accountName: account.displayName,
            });
        }
    }
    if (created > 0) {
        logger.info(`[notification-generator] Created ${created} connectivity alerts for ${disconnected.length} accounts`);
    }
}
//# sourceMappingURL=notification-generator.js.map