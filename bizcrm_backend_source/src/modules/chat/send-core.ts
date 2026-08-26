/**
 * send-core.ts — Programmatic message send service.
 *
 * Single entry point for all text sends: HTTP staff route, automation engine,
 * and AI auto-reply harness. Supports splitting long AI replies on paragraph
 * boundaries (≤4 chunks) and marks AI-generated messages with `aiGenerated`.
 */
import { prisma } from '../../shared/prisma-client.js'
import { SenderType, Platform, isPancakePlatform, ResponseSource } from '../../shared/constants.js'
import { emitNewMessage } from '../realtime/socket-gateway.js'
import { runAutomationRules } from '../automation/automation-engine.js'
import { getPoolEntry, sendViaPool } from '../zalo/zalo-pool.js'
import { sendTextViaOa, isCsWindowError } from '../zalo-oa/oa-pool.js'
import { sendViaPancake } from '../pancake/pancake-send.js'
import { sendTextViaFb, isFbCsWindowError } from '../facebook-page/fb-pool.js'
import { checkLimits, recordAction } from '../zalo/zalo-rate-limiter.js'
import { logger } from '../../shared/logger.js'
import { transformMessageForFrontend } from './chat-routes.js'

const MAX_AI_CHUNKS = 4

export interface SendMessageCoreParams {
  orgId: string
  conversationId: string
  text: string
  /** 'staff' = human-initiated; 'ai' = AI-generated reply */
  sender: 'staff' | 'ai'
  /** userId when sender==='staff'; null/undefined for AI sends */
  repliedByUserId?: string | null
  /** Optional: pre-fetched conversation data to avoid re-querying */
  aiReplyRunId?: string | null
  /**
   * Who produced this outbound reply (Message.responseSource). When omitted it is
   * derived: ai → ai_auto; staff with a user → manual; staff without a user
   * (automation/system) → none (null). Pass 'ai_suggest' when staff sends an AI draft.
   */
  responseSource?: string | null
  /** Quote context for staff sends */
  quote?: Record<string, unknown> | null
  /**
   * Re-trigger 'message_sent' automation rules after sending.
   * Default: true for staff (preserves HTTP route behavior), false for ai.
   * Automation-originated sends MUST pass false to avoid automation loops.
   */
  triggerAutomation?: boolean
}

export interface SendMessageCoreResult {
  messages: Awaited<ReturnType<typeof transformMessageForFrontend>>[]
  sentViaZalo: boolean
  zaloError?: string
  zaloErrorCode?: string | number
  /** Set for OA CS-window errors */
  csWindowExpired?: boolean
}

// ── Conversation lookup type ─────────────────────────────────────────────────

type ConvData = {
  id: string
  orgId: string
  contactId: string | null
  channelAccountId: string
  threadType: string
  externalThreadId: string | null
  contact: { zaloUid: string | null } | null
  channelAccount: {
    externalUid: string | null
    externalPageId: string | null
    accessTokenEnc: string | null
    platform: number
  } | null
}

async function resolveConversation(convId: string, orgId: string): Promise<ConvData | null> {
  return prisma.conversation.findFirst({
    where: { id: convId, orgId },
    select: {
      id: true, contactId: true, orgId: true,
      channelAccountId: true, threadType: true, externalThreadId: true,
      contact: { select: { zaloUid: true } },
      channelAccount: { select: { externalUid: true, externalPageId: true, accessTokenEnc: true, platform: true } },
    },
  })
}

// ── Single-chunk send (low-level) ─────────────────────────────────────────────

async function sendChunk(conv: ConvData, text: string, quote?: Record<string, unknown> | null): Promise<{
  sent: boolean
  error?: string
  errorCode?: string | number
  externalMsgId?: string
  csWindowExpired?: boolean
}> {
  // Web chat: no external platform to call — the message is persisted by the
  // caller (sendMessageCore) and pushed to the visitor via Socket.IO (chat:message).
  // Just mark as sent so it isn't treated as a local-only/failed send.
  if (conv.channelAccount?.platform === Platform.WEBCHAT) {
    return { sent: true }
  }

  // ── Pancake platforms (FB, IG, TikTok via Pancake) ──────────────
  if (conv.channelAccount && isPancakePlatform(conv.channelAccount.platform)) {
    return sendViaPancake(conv, text)
  }

  // ── Facebook Page (official Meta Messenger Platform) ────────────
  // Recipient = the customer's PSID, stored as externalThreadId (like OA).
  if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE) {
    if (!conv.externalThreadId) {
      logger.debug('[send-core] No PSID (externalThreadId) — local message only')
      return { sent: false }
    }
    const result = await sendTextViaFb(conv.channelAccountId, conv.externalThreadId, text)
    return {
      sent: result.sent,
      error: result.error,
      errorCode: result.errorCode,
      externalMsgId: result.messageId,
      csWindowExpired: !result.sent && isFbCsWindowError(result.errorSubcode),
    }
  }

  const isOa = conv.channelAccount?.platform === Platform.ZALO_OA
  const recipientUid = isOa ? conv.externalThreadId : (conv.externalThreadId || conv.contact?.zaloUid)

  if (!recipientUid) {
    logger.debug('[send-core] No recipient UID — local message only')
    return { sent: false }
  }

  if (isOa) {
    const result = await sendTextViaOa(
      conv.channelAccountId,
      recipientUid,
      text,
      quote ? { msgId: quote.msgId as string, text: quote.content as string } : undefined,
    )
    const csWindowExpired = !result.sent && isCsWindowError(result.errorCode)
    return {
      sent: result.sent,
      error: result.error,
      errorCode: result.errorCode,
      externalMsgId: result.messageId,
      csWindowExpired,
    }
  }

  // Personal Zalo via pool
  const poolEntry = getPoolEntry(conv.channelAccountId)
  if (!poolEntry || poolEntry.status !== 'connected') {
    logger.debug(`[send-core] Zalo account ${conv.channelAccountId} not connected — local only`)
    return { sent: false }
  }

  const rateCheck = checkLimits(conv.channelAccountId, 'message')
  if (!rateCheck.allowed) {
    return { sent: false, error: rateCheck.reason || 'Rate limit exceeded' }
  }

  const targetUid = conv.externalThreadId || conv.contact?.zaloUid
  if (!targetUid) {
    logger.debug(`[send-core] No target UID for conv ${conv.id} — local only`)
    return { sent: false }
  }

  const result = await sendViaPool(
    conv.channelAccountId,
    targetUid,
    text,
    conv.id,
    quote,
    conv.threadType as 'user' | 'group' | undefined,
  )
  if (result.sent) {
    recordAction(conv.channelAccountId, 'message')
  }
  return { sent: result.sent, error: result.error }
}

// ── Core send function ────────────────────────────────────────────────────────

/**
 * Send one or more text messages programmatically.
 *
 * For `sender='ai'`: splits on paragraph boundaries (≤4 chunks), sets
 * `aiGenerated=true`, senderName='AI Assistant'.
 * For `sender='staff'`: single message, senderName='Staff'.
 */
export async function sendMessageCore(params: SendMessageCoreParams): Promise<SendMessageCoreResult> {
  const { orgId, conversationId, text, sender, repliedByUserId, aiReplyRunId, quote } = params

  const conv = await resolveConversation(conversationId, orgId)
  if (!conv) {
    throw new Error(`Conversation ${conversationId} not found in org ${orgId}`)
  }

  // Derive the response source unless the caller set one explicitly.
  const responseSource = params.responseSource !== undefined
    ? params.responseSource
    : sender === 'ai'
      ? ResponseSource.AI_AUTO
      : repliedByUserId
        ? ResponseSource.MANUAL
        : null

  // Split text for AI sends; staff sends are always single
  const chunks: string[] = sender === 'ai'
    ? text.split(/\n{2,}/).map(c => c.trim()).filter(Boolean).slice(0, MAX_AI_CHUNKS)
    : [text]

  const results: Awaited<ReturnType<typeof transformMessageForFrontend>>[] = []
  let overallSentViaZalo = false
  let lastError: string | undefined
  let lastErrorCode: string | number | undefined
  let csWindowExpired = false

  for (const chunk of chunks) {
    const zaloResult = await sendChunk(conv, chunk, sender === 'staff' ? quote : undefined)

    if (zaloResult.csWindowExpired) {
      csWindowExpired = true
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.SELF,
        senderUid: '',
        senderName: sender === 'ai' ? 'AI Assistant' : 'Staff',
        content: chunk,
        contentType: 'text',
        quote: sender === 'staff' ? ((quote ?? undefined) as any) : undefined,
        sentAt: new Date(),
        repliedByUserId: sender === 'ai' ? null : (repliedByUserId ?? null),
        aiGenerated: sender === 'ai',
        aiReplyRunId: sender === 'ai' ? (aiReplyRunId ?? null) : null,
        responseSource,
        externalMsgId: zaloResult.externalMsgId ?? null,
      },
      include: { repliedBy: { select: { fullName: true } } }, // surface staff name to the UI
    })

    if (zaloResult.sent) {
      overallSentViaZalo = true
    } else if (zaloResult.error) {
      lastError = zaloResult.error
      lastErrorCode = zaloResult.errorCode
    }

    const fePayload = transformMessageForFrontend({
      ...message,
      senderType: SenderType.SELF,
      senderName: (sender === 'ai' ? 'AI Assistant' : 'Staff') as string,
    })
    results.push(fePayload)

    try {
      emitNewMessage(orgId, conversationId, fePayload)
    } catch { /* socket not connected */ }
  }

  // Update conversation metadata once (after all chunks)
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
  })

  // Trigger automation (fire-and-forget, on the last chunk text).
  // Default: staff sends re-trigger 'message_sent' (preserves HTTP route);
  // ai sends do not. Automation passes triggerAutomation:false to avoid loops.
  const shouldTriggerAutomation = params.triggerAutomation ?? (sender === 'staff')
  if (shouldTriggerAutomation) {
    const lastChunk = chunks[chunks.length - 1] ?? text
    runAutomationRules('message_sent', {
      orgId: conv.orgId,
      conversationId: conv.id,
      contactId: conv.contactId ?? undefined,
      messageText: lastChunk,
    }).catch(err => logger.error({ err }, '[automation] trigger error after sendMessageCore'))
  }

  return {
    messages: results,
    sentViaZalo: overallSentViaZalo,
    zaloError: lastError,
    zaloErrorCode: lastErrorCode,
    csWindowExpired,
  }
}
