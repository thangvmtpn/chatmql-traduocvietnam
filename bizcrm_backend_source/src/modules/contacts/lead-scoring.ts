import { prisma } from '../../shared/prisma-client.js'

/**
 * Rule-based lead score (0–100). Deterministic, no LLM.
 * Complements the AI scorer at POST /api/v1/ai/score-lead — use this for
 * contacts that haven't been AI-analyzed yet, or to cross-check the AI score.
 *
 * Ported from references/zalocrm/backend/src/modules/contacts/lead-scoring.ts.
 *
 * Score components:
 *   +10 per message in last 7d (cap +40)
 *   +20 if a future appointment with status='scheduled' exists
 *   +30 if Contact.lifecycleStage === 'qualified'
 *   −10 if lastActivity > 14 days ago
 *   −20 if lastActivity > 30 days ago
 *
 * Clamped to [0, 100].
 */
export interface LeadScoreResult {
  score: number
  /** Max of contact.updatedAt, latest message.sentAt, and the next scheduled appointment date. */
  lastActivity: Date
}

export async function computeLeadScore(contactId: string): Promise<LeadScoreResult> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const conversations = await prisma.conversation.findMany({
    where: { contactId },
    select: { id: true },
  })
  const convIds = conversations.map((c) => c.id)

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
  ])

  const candidates: number[] = [(contact?.updatedAt ?? now).getTime()]
  if (latestMsg) candidates.push(latestMsg.sentAt.getTime())
  if (futureAppointment) candidates.push(futureAppointment.appointmentDate.getTime())
  const lastActivity = new Date(Math.max(...candidates))

  let score = 0
  score += Math.min(recentMessages * 10, 40)
  if (futureAppointment) score += 20
  if (contact?.lifecycleStage === 'qualified') score += 30

  const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceActivity > 30) score -= 20
  else if (daysSinceActivity > 14) score -= 10

  return {
    score: Math.max(0, Math.min(100, score)),
    lastActivity,
  }
}
