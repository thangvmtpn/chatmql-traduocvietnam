/**
 * appointment-reminder.ts — Daily cron job to send appointment reminders.
 *
 * Runs at 08:00 AM Vietnam time (UTC+7 → 01:00 UTC).
 * Scans appointments scheduled for tomorrow.
 * Creates Notification records, emits Socket.IO events,
 * and dispatches `appointment_upcoming` automation triggers.
 *
 * Ported from ZaloCRM reference: appointment-reminder.ts
 */
import cron from 'node-cron';
import { prisma } from '../../shared/prisma-client.js';
import { getIO } from '../realtime/socket-gateway.js';
import dayjs from 'dayjs';
import { logger } from '../../shared/logger.js';
import { runAutomationRules } from '../automation/automation-engine.js';
/**
 * Initialize the daily appointment reminder cron job.
 * Should be called once on server startup after Socket.IO is ready.
 */
export function initAppointmentReminder() {
    // Run daily at 08:00 AM Vietnam time (01:00 UTC)
    cron.schedule('0 1 * * *', async () => {
        logger.info('[appointment-reminder] Running daily reminder check...');
        try {
            const tomorrowStart = dayjs().add(1, 'day').startOf('day').toDate();
            const tomorrowEnd = dayjs().add(1, 'day').endOf('day').toDate();
            // Find scheduled appointments for tomorrow that haven't been reminded
            const appointments = await prisma.appointment.findMany({
                where: {
                    appointmentDate: { gte: tomorrowStart, lte: tomorrowEnd },
                    status: 'scheduled',
                    reminderSent: false,
                },
                include: {
                    contact: { select: { id: true, fullName: true, phone: true } },
                    assignedUser: { select: { id: true, fullName: true } },
                    org: { select: { id: true, name: true } },
                },
            });
            if (appointments.length === 0) {
                logger.info('[appointment-reminder] No pending reminders for tomorrow');
                return;
            }
            logger.info(`[appointment-reminder] Found ${appointments.length} appointments to remind`);
            const io = getIO();
            let created = 0;
            for (const apt of appointments) {
                const contactName = apt.contact?.fullName || 'Khách hàng';
                const time = apt.appointmentTime || 'cả ngày';
                const dateStr = dayjs(apt.appointmentDate).format('DD/MM/YYYY');
                // Determine target users for notification
                const targetUserIds = [];
                if (apt.assignedUserId) {
                    targetUserIds.push(apt.assignedUserId);
                }
                // Also notify org admins/owners if no specific assignee
                if (targetUserIds.length === 0) {
                    const admins = await prisma.user.findMany({
                        where: { orgId: apt.orgId, role: { in: ['owner', 'admin'] }, isActive: true },
                        select: { id: true },
                    });
                    targetUserIds.push(...admins.map(a => a.id));
                }
                // Create notifications for each target user
                for (const userId of targetUserIds) {
                    await prisma.notification.create({
                        data: {
                            orgId: apt.orgId,
                            userId,
                            type: 'appointment',
                            title: `📅 Lịch hẹn ngày mai: ${contactName}`,
                            body: `Cuộc hẹn "${apt.type || 'Khác'}" với ${contactName} vào ${time}, ${dateStr}. ${apt.notes || ''}`.trim(),
                            link: `/customers?appointmentId=${apt.id}`,
                        },
                    });
                    created++;
                }
                // Mark reminder as sent
                await prisma.appointment.update({
                    where: { id: apt.id },
                    data: { reminderSent: true },
                });
                // Emit real-time event to org room
                io.to(`org:${apt.orgId}`).emit('notification:new', {
                    type: 'appointment',
                    title: `📅 Lịch hẹn ngày mai: ${contactName}`,
                    appointmentId: apt.id,
                });
                // Dispatch appointment_upcoming automation trigger (via BullMQ queue)
                if (apt.contact?.id) {
                    // Look up the most recent conversation for send_message support
                    const recentConv = await prisma.conversation.findFirst({
                        where: { contactId: apt.contact.id, orgId: apt.orgId },
                        orderBy: { lastMessageAt: 'desc' },
                        select: { id: true },
                    });
                    runAutomationRules('appointment_upcoming', {
                        orgId: apt.orgId,
                        contactId: apt.contact.id,
                        conversationId: recentConv?.id,
                        triggerData: {
                            appointmentId: apt.id,
                            appointmentDate: dayjs(apt.appointmentDate).toISOString(),
                            appointmentTime: apt.appointmentTime || null,
                            appointmentTitle: apt.type || 'Khác',
                            appointmentNotes: apt.notes || null,
                            assignedUserId: apt.assignedUserId || null,
                        },
                    }).catch(err => logger.error({ err, aptId: apt.id }, '[appointment-reminder] automation dispatch failed'));
                }
            }
            logger.info(`[appointment-reminder] Created ${created} reminder notifications for ${appointments.length} appointments`);
        }
        catch (err) {
            logger.error('[appointment-reminder] Error:', err.message);
        }
    }, {
        timezone: 'Asia/Ho_Chi_Minh',
    });
    logger.info('[appointment-reminder] ⏰ Daily reminder cron registered (08:00 AM VN)');
}
//# sourceMappingURL=appointment-reminder.js.map