/**
 * pending-action-service.ts — Human-in-loop ACTION tools (P7).
 *
 * The responder requests a mutating action (e.g. book an appointment) → we record
 * an AiPendingAction (status=pending). Staff must CONFIRM before it executes.
 * NEVER auto-executed (mirrors the AiLogicProposal safety model).
 */
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'

export type PendingActionType = 'request_appointment'
export type PendingActionStatus = 'pending' | 'confirmed' | 'rejected'

const SELECT = {
  id: true, orgId: true, conversationId: true, contactId: true,
  type: true, payload: true, summary: true, status: true,
  reviewedBy: true, executedRef: true, createdAt: true, updatedAt: true,
} as const

function apptSummary(p: Record<string, unknown>): string {
  const who = (p.customer_name as string) || ''
  const when = (p.desired_time as string) || ''
  const note = (p.note as string) || ''
  return `Đặt lịch${who ? ` cho ${who}` : ''}${when ? ` — ${when}` : ''}${note ? ` (${note})` : ''}`.slice(0, 240)
}

/** Record a pending action from a responder tool call. Resolves contactId from the conversation. */
export async function recordPendingAction(input: {
  orgId: string
  conversationId?: string | null
  type: PendingActionType
  payload: Record<string, unknown>
}): Promise<{ id: string; summary: string }> {
  let contactId: string | null = null
  if (input.conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: input.conversationId, orgId: input.orgId },
      select: { contactId: true },
    })
    contactId = conv?.contactId ?? null
  }
  const summary = input.type === 'request_appointment' ? apptSummary(input.payload) : input.type
  const row = await prisma.aiPendingAction.create({
    data: {
      orgId: input.orgId,
      conversationId: input.conversationId ?? null,
      contactId,
      type: input.type,
      payload: input.payload as object,
      summary,
      status: 'pending',
    },
    select: { id: true },
  })
  return { id: row.id, summary }
}

export async function listPendingActions(orgId: string, status?: PendingActionStatus, limit = 100) {
  return prisma.aiPendingAction.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: SELECT,
  })
}

export async function rejectAction(id: string, orgId: string, reviewedBy: string): Promise<boolean> {
  const res = await prisma.aiPendingAction.updateMany({
    where: { id, orgId, status: 'pending' },
    data: { status: 'rejected', reviewedBy },
  })
  return res.count > 0
}

/**
 * Confirm + execute a pending action. Only 'pending' actions can be confirmed.
 * Execution per type. Returns the created entity ref (or null).
 */
export async function confirmAction(
  id: string,
  orgId: string,
  reviewedBy: string,
): Promise<{ ok: boolean; executedRef: string | null; error?: string }> {
  const action = await prisma.aiPendingAction.findFirst({ where: { id, orgId } })
  if (!action) return { ok: false, executedRef: null, error: 'Không tìm thấy hành động' }
  if (action.status !== 'pending') return { ok: false, executedRef: null, error: `Hành động đã ${action.status}` }

  let executedRef: string | null = null
  if (action.type === 'request_appointment') {
    const p = (action.payload ?? {}) as Record<string, unknown>
    const rawTime = (p.desired_time as string) || ''
    const parsed = rawTime ? new Date(rawTime) : null
    // AI-parsed time is best-effort; staff can adjust in the Appointments UI.
    const appointmentDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() + 24 * 60 * 60 * 1000)
    const noteBits = [p.note as string, p.customer_name ? `KH: ${p.customer_name}` : '', p.phone ? `SĐT: ${p.phone}` : '']
      .filter(Boolean).join(' · ')
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
    })
    executedRef = appt.id
  } else {
    return { ok: false, executedRef: null, error: `Loại hành động chưa hỗ trợ: ${action.type}` }
  }

  await prisma.aiPendingAction.update({
    where: { id },
    data: { status: 'confirmed', reviewedBy, executedRef },
  })
  logger.info({ id, type: action.type, executedRef }, '[pending-action] confirmed + executed')
  return { ok: true, executedRef }
}
