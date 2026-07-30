/**
 * automation-actions.ts — Action handler implementations for automation nodes.
 *
 * Extracted from automation-engine.ts (W3-FIX) to keep each file under 500 LOC.
 * Each case in the switch handles one automation action type.
 */
import { prisma } from '../../shared/prisma-client.js'
import { renderTemplate } from './template-renderer.js'
import { logger } from '../../shared/logger.js'
import { sendZnsViaOa } from '../zalo-oa/oa-pool.js'
import { tryNormalizePhone } from '../../shared/phone.js'
import { randomUUID } from 'node:crypto'
import type { AutomationContext } from './automation-types.js'
import { sendMessageCore } from '../chat/send-core.js'

/**
 * Execute a single action node by type.
 */
export async function executeNodeAction(actionType: string, config: Record<string, unknown>, ctx: AutomationContext): Promise<Record<string, any> | undefined> {
  const params = config as Record<string, any>

  switch (actionType) {
    case 'send_template': {
      const { templateId } = params
      if (!ctx.conversationId || !templateId) break
      const tmpl = await prisma.messageTemplate.findFirst({
        where: { id: templateId, orgId: ctx.orgId },
      })
      if (!tmpl) { logger.warn(`[automation] Template ${templateId} not found`); break }
      const [contact, org] = await Promise.all([
        ctx.contactId
          ? prisma.contact.findUnique({
              where: { id: ctx.contactId },
              select: { fullName: true, crmName: true, phone: true, email: true, lifecycleStage: true, source: true },
            })
          : Promise.resolve(null),
        prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
      ])
      const body = renderTemplate(tmpl.content, { contact, org })
      await trySendViaZalo(ctx, body)
      return { action: 'send_template', templateName: tmpl.name || tmpl.id, bodyLength: body.length }
    }

    case 'send_message': {
      const { text } = params
      if (!ctx.conversationId || !text) break
      await trySendViaZalo(ctx, text)
      return { action: 'send_message', text: (text as string).slice(0, 100) }
    }

    case 'assign_agent': {
      const { userId } = params
      if (!ctx.contactId || !userId) break
      await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { assignedUserId: userId },
      })
      return { action: 'assign_agent', userId }
    }

    case 'change_status': {
      // Backwards-compat name: writes lifecycleStage now that the dedicated
      // status column is gone. Accepts either `status` or `lifecycleStage`
      // in params; users migrating rules should prefer the latter.
      const { status, lifecycleStage } = params
      const targetStage = (lifecycleStage ?? status) as string | undefined
      if (!ctx.contactId || !targetStage) break
      await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { lifecycleStage: targetStage },
      })
      return { action: 'change_status', stage: targetStage }
    }

    case 'add_tag': {
      const { tag } = params
      if (!ctx.contactId || !tag) break
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "Contact" WHERE id = ${ctx.contactId} FOR UPDATE`
        const contact = await tx.contact.findUnique({ where: { id: ctx.contactId! }, select: { tags: true } })
        if (!contact) return
        const currentTags = contact.tags as string[] ?? []
        if (!currentTags.includes(tag)) {
          await tx.contact.update({
            where: { id: ctx.contactId! },
            data: { tags: [...currentTags, tag] },
          })
        }
      })
      return { action: 'add_tag', tag }
    }

    case 'remove_tag': {
      const { tag } = params
      if (!ctx.contactId || !tag) break
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "Contact" WHERE id = ${ctx.contactId} FOR UPDATE`
        const contact = await tx.contact.findUnique({ where: { id: ctx.contactId! }, select: { tags: true } })
        if (!contact) return
        const tags = (contact.tags as string[] ?? []).filter(t => t !== tag)
        await tx.contact.update({
          where: { id: ctx.contactId! },
          data: { tags },
        })
      })
      return { action: 'remove_tag', tag }
    }

    case 'create_appointment': {
      const { title, offsetHours = 24 } = params
      if (!ctx.contactId) break
      const scheduledAt = new Date(Date.now() + offsetHours * 3600_000)
      const contact = await prisma.contact.findUnique({
        where: { id: ctx.contactId },
        select: { orgId: true, assignedUserId: true },
      })
      // Fall back to org's first admin if contact has no assignee
      let assigneeId = contact?.assignedUserId
      if (!assigneeId) {
        const orgAdmin = await prisma.user.findFirst({
          where: { orgId: ctx.orgId, role: { in: ['admin', 'owner'] } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
        assigneeId = orgAdmin?.id
      }
      if (!assigneeId) {
        logger.warn(`[automation] create_appointment: no assignee or admin found for org ${ctx.orgId}`)
        break
      }
      await prisma.appointment.create({
        data: {
          orgId: ctx.orgId,
          contactId: ctx.contactId,
          assignedUserId: assigneeId,
          notes: title || 'Tu van khach hang',
          appointmentDate: scheduledAt,
          status: 'scheduled',
        },
      })
      return { action: 'create_appointment', scheduledAt: scheduledAt.toISOString(), assigneeId }
    }

    case 'update_property': {
      const { fieldKey, value } = params
      if (!ctx.contactId || !fieldKey) break
      const prop = await prisma.customProperty.findFirst({
        where: { orgId: ctx.orgId, fieldKey },
        select: { id: true },
      })
      if (!prop) { logger.warn(`[automation] Property ${fieldKey} not found`); break }
      const resolvedValue = value === '$now' ? new Date().toISOString().slice(0, 10) : String(value)
      await prisma.contactPropertyValue.upsert({
        where: { contactId_propertyId: { contactId: ctx.contactId, propertyId: prop.id } },
        update: { value: resolvedValue },
        create: { orgId: ctx.orgId, contactId: ctx.contactId, propertyId: prop.id, value: resolvedValue },
      })
      return { action: 'update_property', fieldKey, value: resolvedValue }
    }

    case 'increment_property': {
      const { fieldKey, amount = 1 } = params
      if (!ctx.contactId || !fieldKey) break
      const prop = await prisma.customProperty.findFirst({
        where: { orgId: ctx.orgId, fieldKey },
        select: { id: true },
      })
      if (!prop) { logger.warn(`[automation] Property ${fieldKey} not found`); break }
      // Atomic increment via transaction to prevent lost updates under concurrency
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "contacts" WHERE id = ${ctx.contactId} FOR UPDATE`
        const existing = await tx.contactPropertyValue.findUnique({
          where: { contactId_propertyId: { contactId: ctx.contactId!, propertyId: prop.id } },
          select: { value: true },
        })
        const current = Number(existing?.value || '0')
        const newVal = String(current + Number(amount))
        await tx.contactPropertyValue.upsert({
          where: { contactId_propertyId: { contactId: ctx.contactId!, propertyId: prop.id } },
          update: { value: newVal },
          create: { orgId: ctx.orgId, contactId: ctx.contactId!, propertyId: prop.id, value: newVal },
        })
      })
      break
    }

    case 'track_event': {
      const { eventName, eventValue } = params
      if (!ctx.contactId || !eventName) break
      // Create the CDP event — no hard dependency on dictionary entry existing
      await prisma.cdpEvent.create({
        data: {
          orgId: ctx.orgId,
          contactId: ctx.contactId,
          eventName,
          properties: eventValue ? { value: eventValue } : {},
          source: 'automation',
        },
      })
      // Fire event_tracked trigger so downstream automation rules can react
      const { runAutomationRules } = await import('./automation-engine.js')
      runAutomationRules('event_tracked', {
        orgId: ctx.orgId,
        contactId: ctx.contactId,
        triggerData: { eventName, ...(eventValue ? { value: eventValue } : {}) },
      }).catch(err => logger.error({ err }, `[automation] track_event → event_tracked dispatch error`))
      return { action: 'track_event', eventName, eventValue }
    }

    case 'send_notification': {
      const { title: notifTitle, message: notifMsg } = params
      logger.info(`[automation] Notification: ${notifTitle} - ${notifMsg}`)
      // TODO: integrate with real notification system (push/email/socket)
      break
    }

    case 'send_zalo_zns': {
      const { accountId, templateId, templateData, phone: phoneOverride } = params as {
        accountId?: string
        templateId?: string
        templateData?: Record<string, string>
        phone?: string
      }
      if (!accountId || !templateId || !templateData) {
        logger.warn('[automation] send_zalo_zns: missing accountId/templateId/templateData')
        break
      }

      // Resolve contact + phone + template variables.
      const contact = ctx.contactId
        ? await prisma.contact.findUnique({
            where: { id: ctx.contactId },
            select: { fullName: true, crmName: true, phone: true, email: true, lifecycleStage: true },
          })
        : null
      const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } })
      const renderCtx = { contact, org }

      const phone = tryNormalizePhone(phoneOverride || contact?.phone || '')
      if (!phone) {
        logger.warn(`[automation] send_zalo_zns: no valid phone for contact ${ctx.contactId}`)
        break
      }

      // Render each templateData value (supports {{contact.field}} placeholders).
      const renderedData: Record<string, string> = {}
      for (const [k, v] of Object.entries(templateData)) {
        renderedData[k] = renderTemplate(String(v ?? ''), renderCtx)
      }

      const trackingId = randomUUID()
      const log = await prisma.znsLog.create({
        data: {
          orgId: ctx.orgId,
          channelAccountId: accountId,
          contactId: ctx.contactId ?? null,
          conversationId: ctx.conversationId ?? null,
          templateId,
          phone,
          paramsJson: renderedData as any,
          trackingId,
          status: 'pending',
          // Automation has no user; reuse the ZaloAccount.ownerUserId as the sender.
          sentByUserId: (await prisma.channelAccount.findUnique({
            where: { id: accountId }, select: { ownerUserId: true },
          }))?.ownerUserId ?? '',
        },
      })

      const result = await sendZnsViaOa(accountId, {
        phone,
        templateId,
        templateData: renderedData,
        trackingId,
      })

      if (result.sent) {
        await prisma.znsLog.update({
          where: { id: log.id },
          data: { status: 'sent', externalMsgId: result.msgId ?? null },
        })
        logger.info(`[automation] send_zalo_zns sent (log=${log.id})`)
      } else {
        await prisma.znsLog.update({
          where: { id: log.id },
          data: { status: 'failed', errorCode: result.errorCode != null ? String(result.errorCode) : null, errorMessage: result.error ?? 'unknown' },
        })
        logger.warn(`[automation] send_zalo_zns failed: ${result.error}`)
      }
      break
    }

    case 'update_lifecycle': {
      const { lifecycleStage, status } = params
      const targetStage = (lifecycleStage ?? status) as string | undefined
      if (!ctx.contactId || !targetStage) break
      // Delegate to lifecycle service for proper side-effects (logs, events, automation triggers)
      const { changeLifecycleStage } = await import('../cdp/lifecycle-service.js')
      await changeLifecycleStage({ orgId: ctx.orgId, contactId: ctx.contactId, toStage: targetStage, changedBy: 'automation' })
      return { action: 'update_lifecycle', stage: targetStage }
    }

    case 'ai_cdp': {
      // AI-CDP: analyze recent conversation → multi-output update
      if (!ctx.contactId) throw new Error('Thiếu contactId — chọn khách hàng để chạy AI-CDP')
      if (!ctx.conversationId) throw new Error('Contact chưa có hội thoại — AI-CDP cần ít nhất 1 cuộc trò chuyện')

      const { getAiConfig, getProviderApiKey, getEffectiveConfigForTask } = await import('../ai/ai-config-service.js')
      const aiConfig = await getAiConfig(ctx.orgId)
      if (!aiConfig.enabled) {
        throw new Error('AI chưa được bật — vào Cài đặt > AI để kích hoạt')
      }
      // Resolve provider/model: per-task override > org default
      const effective = getEffectiveConfigForTask(aiConfig, 'ai_cdp')
      const apiKey = await getProviderApiKey(ctx.orgId, effective.provider)
      if (!apiKey) {
        throw new Error(`Chưa cấu hình API key cho ${effective.provider} — vào Cài đặt > AI`)
      }

      const { runAiCdp } = await import('../ai/ai-cdp.js')
      const aiResult = await runAiCdp({
        orgId: ctx.orgId,
        contactId: ctx.contactId,
        conversationId: ctx.conversationId,
        provider: effective.provider,
        apiKey,
        model: effective.model,
        config: params as any,
      })
      return {
        action: 'ai_cdp',
        applied: aiResult.applied,
        skipped: aiResult.skipped,
        confidence: aiResult.confidence,
        processData: aiResult.processData,
      }
    }

    default:
      logger.warn(`[automation] Unknown action type: ${actionType}`)
      return undefined
  }
}

// ─── Zalo delivery helper ─────────────────────────────────────────────────────

/**
 * Send a text message for the given automation context via sendMessageCore.
 * Creates the Message record + emits socket + triggers automation rules.
 * Silently logs on failure (automation should not fail because of delivery).
 */
export async function trySendViaZalo(ctx: AutomationContext, text: string): Promise<void> {
  if (!ctx.conversationId) return
  try {
    await sendMessageCore({
      orgId: ctx.orgId,
      conversationId: ctx.conversationId,
      text,
      sender: 'staff',
      repliedByUserId: null,
      // Automation-originated send: do NOT re-trigger 'message_sent' rules (loop guard)
      triggerAutomation: false,
    })
    logger.info(`[automation] ✓ Message sent via sendMessageCore for conv ${ctx.conversationId}`)
  } catch (err: any) {
    logger.warn(`[automation] trySendViaZalo error: ${err.message}`)
  }
}
