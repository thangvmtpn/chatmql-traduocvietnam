import { prisma } from '../../shared/prisma-client.js';
export async function computeLeadScore(contactId) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const conversations = await prisma.conversation.findMany({
        where: { contactId },
        select: { id: true },
    });
    const convIds = conversations.map((c) => c.id);
    const [recentMessages, futureAppointment, contact, latestMsg] = await Promise.all([
        convIds.length
            ? prisma.message.count({
                where: { conversationId: { in: convIds }, sentAt: { gte: sevenDaysAgo } },
            })
            : Promise.resolve(0),
        prisma.appointment.findFirst({
            where: { contactId, status: 'scheduled', appointmentDate: { gte: now } },
            select: { appointmentDate: true },
        }),
        prisma.contact.findUnique({
            where: { id: contactId },
            select: { lifecycleStage: true, updatedAt: true },
        }),
        convIds.length
            ? prisma.message.findFirst({
                where: { conversationId: { in: convIds } },
                orderBy: { sentAt: 'desc' },
                select: { sentAt: true },
            })
            : Promise.resolve(null),
    ]);
    const candidates = [(contact?.updatedAt ?? now).getTime()];
    if (latestMsg)
        candidates.push(latestMsg.sentAt.getTime());
    if (futureAppointment)
        candidates.push(futureAppointment.appointmentDate.getTime());
    const lastActivity = new Date(Math.max(...candidates));
    let score = 0;
    score += Math.min(recentMessages * 10, 40);
    if (futureAppointment)
        score += 20;
    if (contact?.lifecycleStage === 'qualified')
        score += 30;
    const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity > 30)
        score -= 20;
    else if (daysSinceActivity > 14)
        score -= 10;
    return {
        score: Math.max(0, Math.min(100, score)),
        lastActivity,
    };
}
//# sourceMappingURL=lead-scoring.js.map