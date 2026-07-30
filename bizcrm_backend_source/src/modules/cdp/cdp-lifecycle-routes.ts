import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { badRequest, notFound } from '../../shared/http-errors.js'
import { changeLifecycleStage, LIFECYCLE_STAGES, STAGE_LABELS } from './lifecycle-service.js'

// Re-exported for callers that imported these from this route file historically.
export { LIFECYCLE_STAGES, STAGE_LABELS }

export async function cdpLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // GET lifecycle history + current stage
  app.get<{
    Params: { contactId: string }
  }>('/api/v1/contacts/:contactId/lifecycle', async (request, reply) => {
    const user = request.user as { orgId: string }
    const { contactId } = request.params

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: { id: true, lifecycleStage: true },
    })
    if (!contact) return notFound(reply, 'Contact')

    const logs = await prisma.lifecycleLog.findMany({
      where: { contactId, orgId: user.orgId },
      orderBy: { createdAt: 'asc' },
    })

    return {
      currentStage: contact.lifecycleStage,
      stages: LIFECYCLE_STAGES,
      stageLabels: STAGE_LABELS,
      history: logs,
    }
  })

  // UPDATE lifecycle stage
  app.post<{
    Params: { contactId: string }
    Body: { toStage: string; reason?: string }
  }>('/api/v1/contacts/:contactId/lifecycle', async (request, reply) => {
    const user = request.user as { id: string; orgId: string }
    const { contactId } = request.params
    const { toStage, reason } = request.body

    if (!toStage?.trim()) return badRequest(reply, 'toStage is required')

    try {
      const { log } = await changeLifecycleStage({
        orgId: user.orgId,
        contactId,
        toStage,
        changedBy: user.id,
        reason: reason ?? null,
      })
      return { log }
    } catch (err: any) {
      if (err.message === 'Contact not found') return notFound(reply, 'Contact')
      throw err
    }
  })
}
