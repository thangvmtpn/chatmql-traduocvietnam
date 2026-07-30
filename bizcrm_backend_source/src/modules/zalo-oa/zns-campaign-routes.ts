import { Platform } from '../../shared/constants.js'
// ZNS mass-send campaign CRUD routes.
// Create draft → review → start → progress tracking via list/detail polling.

import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { startCampaign, cancelCampaign } from './zns-campaign-worker.js'

interface CreateBody {
  name: string
  channelAccountId: string
  templateId: string
  templateData: Record<string, string>
  contactIds: string[]
}

export async function znsCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ─── POST /api/v1/zns/campaigns — create draft ─────────────────────────────
  app.post<{ Body: CreateBody }>('/api/v1/zns/campaigns', async (request, reply) => {
    const user = request.user as { orgId: string; id: string }
    const { name, channelAccountId, templateId, templateData, contactIds } = request.body || ({} as CreateBody)

    if (!name?.trim() || !channelAccountId || !templateId) {
      return reply.code(400).send({ error: 'name, channelAccountId, templateId required' })
    }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return reply.code(400).send({ error: 'contactIds must be a non-empty array' })
    }

    const account = await prisma.channelAccount.findFirst({
      where: { id: channelAccountId, orgId: user.orgId, platform: Platform.ZALO_OA, deletedAt: null },
      select: { id: true },
    })
    if (!account) return reply.code(404).send({ error: 'OA account not found' })

    const campaign = await prisma.znsCampaign.create({
      data: {
        orgId: user.orgId,
        channelAccountId,
        name: name.trim(),
        templateId,
        templateData: templateData as any,
        contactIds: contactIds as any,
        status: 'draft',
        totalCount: contactIds.length,
        createdByUserId: user.id,
      },
    })

    return campaign
  })

  // ─── POST /api/v1/zns/campaigns/:id/start ──────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/v1/zns/campaigns/:id/start', async (request, reply) => {
    const user = request.user as { orgId: string }
    const campaign = await prisma.znsCampaign.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true, status: true },
    })
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' })

    try {
      const out = await startCampaign(campaign.id)
      return { ok: true, ...out }
    } catch (err: any) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ─── POST /api/v1/zns/campaigns/:id/cancel ─────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/v1/zns/campaigns/:id/cancel', async (request, reply) => {
    const user = request.user as { orgId: string }
    const campaign = await prisma.znsCampaign.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true, status: true },
    })
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' })
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return reply.code(400).send({ error: `Campaign already ${campaign.status}` })
    }
    await cancelCampaign(campaign.id)
    return { ok: true }
  })

  // ─── GET /api/v1/zns/campaigns — list ──────────────────────────────────────
  app.get<{ Querystring: { status?: string; limit?: string } }>('/api/v1/zns/campaigns', async (request) => {
    const user = request.user as { orgId: string }
    const limit = Math.min(100, parseInt(request.query.limit || '50'))
    const where: any = { orgId: user.orgId }
    if (request.query.status) where.status = request.query.status
    const campaigns = await prisma.znsCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        channelAccount: { select: { id: true, displayName: true, externalPageId: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    })
    return campaigns
  })

  // ─── GET /api/v1/zns/campaigns/:id — detail with recent recipients ────────
  app.get<{ Params: { id: string }; Querystring: { recipientLimit?: string } }>(
    '/api/v1/zns/campaigns/:id',
    async (request, reply) => {
      const user = request.user as { orgId: string }
      const limit = Math.min(200, parseInt(request.query.recipientLimit || '50'))
      const campaign = await prisma.znsCampaign.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        include: {
          channelAccount: { select: { id: true, displayName: true, externalPageId: true } },
          createdBy: { select: { id: true, fullName: true } },
          recipients: {
            orderBy: { processedAt: 'desc' },
            take: limit,
            select: { id: true, contactId: true, phone: true, status: true, errorMessage: true, processedAt: true },
          },
        },
      })
      if (!campaign) return reply.code(404).send({ error: 'Campaign not found' })
      return campaign
    },
  )
}
