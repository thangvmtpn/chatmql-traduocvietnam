// ZNS campaign worker: processes single-recipient jobs from the zns-send queue.
// Also provides startCampaign() which materializes recipient rows and enqueues
// them. Worker handler reads a ZnsCampaignRecipient + its Campaign, renders
// per-recipient template data, sends, updates counters atomically.

import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { enqueueZnsSend, type ZnsSendJobData } from '../../shared/queue.js'
import { renderTemplate } from '../automation/template-renderer.js'
import { tryNormalizePhone } from '../../shared/phone.js'
import { sendZnsViaOa } from './oa-pool.js'
import { resolveOrCreateOaConversation, createZnsMessage } from './zns-message.js'

/** Worker handler — process one ZNS recipient. */
export async function processZnsSendJob(job: Job<ZnsSendJobData>): Promise<void> {
  const { campaignId, recipientId } = job.data
  const recipient = await prisma.znsCampaignRecipient.findUnique({
    where: { id: recipientId },
    include: { campaign: true },
  })
  if (!recipient || recipient.status !== 'pending') return

  const campaign = recipient.campaign
  if (campaign.status === 'cancelled') {
    await markRecipient(recipientId, 'skipped', { errorMessage: 'campaign cancelled' })
    await bumpCampaign(campaignId, { skipped: 1 })
    return
  }

  // Render per-recipient template values.
  let renderedData: Record<string, string> = {}
  try {
    const contact = recipient.contactId
      ? await prisma.contact.findUnique({
          where: { id: recipient.contactId },
          select: { fullName: true, crmName: true, phone: true, email: true, lifecycleStage: true },
        })
      : null
    const org = await prisma.organization.findUnique({
      where: { id: campaign.orgId }, select: { name: true },
    })
    const renderCtx = { contact, org }
    const data = (campaign.templateData ?? {}) as Record<string, string>
    for (const [k, v] of Object.entries(data)) {
      renderedData[k] = renderTemplate(String(v ?? ''), renderCtx)
    }
  } catch (err: any) {
    await markRecipient(recipientId, 'failed', { errorMessage: `render error: ${err.message}` })
    await bumpCampaign(campaignId, { failed: 1 })
    return
  }

  const trackingId = randomUUID()
  const log = await prisma.znsLog.create({
    data: {
      orgId: campaign.orgId,
      channelAccountId: campaign.channelAccountId,
      contactId: recipient.contactId,
      conversationId: null,
      templateId: campaign.templateId,
      phone: recipient.phone,
      paramsJson: renderedData as any,
      trackingId,
      status: 'pending',
      sentByUserId: campaign.createdByUserId,
    },
  })

  const result = await sendZnsViaOa(campaign.channelAccountId, {
    phone: recipient.phone,
    templateId: campaign.templateId,
    templateData: renderedData,
    trackingId,
  })

  if (result.sent) {
    await prisma.znsLog.update({
      where: { id: log.id },
      data: { status: 'sent', externalMsgId: result.msgId ?? null },
    })
    // Land the ZNS on the contact's OA timeline so it shows in chat history.
    // Failure here must not affect send accounting → swallow + log.
    if (recipient.contactId) {
      try {
        const contact = await prisma.contact.findUnique({
          where: { id: recipient.contactId },
          select: { id: true, fullName: true, zaloUid: true },
        })
        if (contact) {
          const convId = await resolveOrCreateOaConversation(campaign.channelAccountId, campaign.orgId, contact)
          const tmpl = await prisma.znsTemplate.findFirst({
            where: { channelAccountId: campaign.channelAccountId, templateId: campaign.templateId },
            select: { templateName: true },
          })
          await prisma.znsLog.update({ where: { id: log.id }, data: { conversationId: convId } })
          await createZnsMessage({
            conversationId: convId,
            orgId: campaign.orgId,
            znsLogId: log.id,
            externalMsgId: result.msgId ?? null,
            templateId: campaign.templateId,
            templateData: renderedData,
            trackingId,
            templateName: tmpl?.templateName ?? null,
            sentByUserId: campaign.createdByUserId,
          })
        }
      } catch (err: any) {
        logger.warn(`[zns-campaign] timeline append failed for recipient ${recipientId}: ${err.message}`)
      }
    }
    await markRecipient(recipientId, 'sent', { znsLogId: log.id })
    await bumpCampaign(campaignId, { sent: 1 })
  } else {
    await prisma.znsLog.update({
      where: { id: log.id },
      data: {
        status: 'failed',
        errorCode: result.errorCode != null ? String(result.errorCode) : null,
        errorMessage: result.error ?? 'unknown',
      },
    })
    await markRecipient(recipientId, 'failed', {
      znsLogId: log.id,
      errorMessage: result.error ?? 'unknown',
    })
    await bumpCampaign(campaignId, { failed: 1 })
  }

  await maybeFinishCampaign(campaignId)
}

async function markRecipient(
  recipientId: string,
  status: 'sent' | 'failed' | 'skipped',
  extra: { znsLogId?: string; errorMessage?: string } = {},
): Promise<void> {
  await prisma.znsCampaignRecipient.update({
    where: { id: recipientId },
    data: { status, processedAt: new Date(), ...extra },
  })
}

async function bumpCampaign(
  campaignId: string,
  delta: { sent?: number; failed?: number; skipped?: number },
): Promise<void> {
  await prisma.znsCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: delta.sent ?? 0 },
      failedCount: { increment: delta.failed ?? 0 },
      skippedCount: { increment: delta.skipped ?? 0 },
    },
  })
}

async function maybeFinishCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.znsCampaign.findUnique({
    where: { id: campaignId },
    select: { totalCount: true, sentCount: true, failedCount: true, skippedCount: true, status: true },
  })
  if (!campaign) return
  const done = campaign.sentCount + campaign.failedCount + campaign.skippedCount
  if (done >= campaign.totalCount && campaign.status === 'running') {
    await prisma.znsCampaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    })
    logger.info(`[zns-campaign] ${campaignId} completed (${campaign.sentCount}/${campaign.totalCount})`)
  }
}

/**
 * Materialize recipient rows from campaign.contactIds, normalize phones,
 * enqueue one job per valid recipient. Skip contacts without phone.
 */
export async function startCampaign(campaignId: string): Promise<{ enqueued: number; skipped: number }> {
  const campaign = await prisma.znsCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status !== 'draft' && campaign.status !== 'queued') {
    throw new Error(`Campaign cannot start from status=${campaign.status}`)
  }

  const ids = Array.isArray(campaign.contactIds) ? (campaign.contactIds as string[]) : []
  if (ids.length === 0) throw new Error('Campaign has no recipients')

  const contacts = await prisma.contact.findMany({
    where: { id: { in: ids }, orgId: campaign.orgId },
    select: { id: true, phone: true },
  })

  let enqueued = 0
  let skipped = 0
  for (const c of contacts) {
    const phone = tryNormalizePhone(c.phone)
    if (!phone) {
      skipped++
      continue
    }
    const recipient = await prisma.znsCampaignRecipient.create({
      data: { campaignId, contactId: c.id, phone, status: 'pending' },
    })
    await enqueueZnsSend({ campaignId, recipientId: recipient.id })
    enqueued++
  }

  // Some contacts may not exist or have no phone — count them as skipped too.
  const missingFromQuery = ids.length - contacts.length
  skipped += missingFromQuery

  await prisma.znsCampaign.update({
    where: { id: campaignId },
    data: {
      status: enqueued > 0 ? 'running' : 'completed',
      startedAt: new Date(),
      completedAt: enqueued > 0 ? null : new Date(),
      totalCount: ids.length,
      skippedCount: skipped,
    },
  })

  logger.info(`[zns-campaign] ${campaignId} started: enqueued=${enqueued}, skipped=${skipped}`)
  return { enqueued, skipped }
}

/** Cancel a running campaign. Pending jobs are skipped when the worker picks them up. */
export async function cancelCampaign(campaignId: string): Promise<void> {
  await prisma.znsCampaign.update({
    where: { id: campaignId },
    data: { status: 'cancelled', completedAt: new Date() },
  })
  logger.info(`[zns-campaign] ${campaignId} cancelled`)
}
