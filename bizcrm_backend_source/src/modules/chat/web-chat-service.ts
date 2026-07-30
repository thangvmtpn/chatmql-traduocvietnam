/**
 * web-chat-service.ts — the "web" chat channel (platform=WEBCHAT).
 *
 * A visitor message is delivered through the SAME pipeline Zalo uses
 * (handleIncomingMessage → enqueueAiReply → orchestrator → sendMessageCore),
 * so testing the AI here exercises the real auto-reply flow. The only web-specific
 * piece is the outbound adapter in send-core.ts (persist + Socket.IO, no external API).
 *
 * MVP: drives the in-CRM "test chat" window. The public website widget (anonymous
 * visitors) reuses deliverWebVisitorMessage() behind a public, token-scoped route later.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '../../shared/prisma-client.js'
import { Platform } from '../../shared/constants.js'
import { handleIncomingMessage } from './message-handler.js'

const WEB_CHANNEL_DISPLAY = 'Web Chat'
const webUid = (orgId: string) => `web-${orgId}`
const VALID_MODES = new Set(['manual', 'suggest', 'auto'])
const DEFAULT_VISITOR_NAME = 'Khách test web'

/** Find or create the per-org WEBCHAT channel that hosts all web conversations. */
export async function getOrCreateWebChannel(orgId: string, ownerUserId: string): Promise<string> {
  const uid = webUid(orgId)
  const existing = await prisma.channelAccount.findFirst({
    where: { orgId, externalUid: uid },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.channelAccount.create({
    data: {
      orgId,
      ownerUserId,
      externalUid: uid,
      displayName: WEB_CHANNEL_DISPLAY,
      platform: Platform.WEBCHAT,
      status: 'connected', // web has no external session to maintain — always "connected"
    },
    select: { id: true },
  })
  return created.id
}

export type WebChatInbound = {
  orgId: string
  ownerUserId: string
  conversationId?: string
  text: string
  visitorName?: string
  aiMode?: string // only applied when creating a brand-new conversation
}

/**
 * Deliver a visitor (customer) message into the real conversation pipeline.
 * Returns the conversation id (new or existing).
 */
export async function deliverWebVisitorMessage(
  input: WebChatInbound,
): Promise<{ conversationId: string; threadId: string }> {
  const { orgId, ownerUserId, text } = input
  const channelId = await getOrCreateWebChannel(orgId, ownerUserId)
  const visitorName = input.visitorName?.trim() || DEFAULT_VISITOR_NAME

  let threadId: string
  if (input.conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: input.conversationId, orgId, channelAccountId: channelId },
      select: { externalThreadId: true },
    })
    if (!conv?.externalThreadId) {
      throw Object.assign(new Error('Không tìm thấy hội thoại web'), { statusCode: 404 })
    }
    threadId = conv.externalThreadId
  } else {
    // New visitor session. Pre-create contact + conversation so aiMode is set
    // BEFORE handleIncomingMessage evaluates the auto-reply trigger (it reads the
    // conversation's aiMode; the default 'manual' would otherwise skip the AI).
    threadId = `web:${randomUUID()}`
    const mode = VALID_MODES.has(input.aiMode ?? '') ? input.aiMode! : 'auto'
    const contact = await prisma.contact.create({
      data: { orgId, zaloUid: threadId, fullName: visitorName, source: 'Web' },
      select: { id: true },
    })
    await prisma.conversation.create({
      data: {
        orgId,
        channelAccountId: channelId,
        contactId: contact.id,
        threadType: 'user',
        externalThreadId: threadId,
        displayName: visitorName,
        aiMode: mode,
        lastMessageAt: new Date(),
        isReplied: false,
      },
    })
  }

  const result = await handleIncomingMessage({
    accountId: channelId,
    senderUid: threadId,
    senderName: visitorName,
    content: text,
    contentType: 'text',
    msgId: `web-${randomUUID()}`,
    timestamp: Date.now(),
    isSelf: false,
    threadId,
    threadType: 'user',
    isBackfill: false,
  })
  if (!result) throw new Error('Không xử lý được tin nhắn web')
  return { conversationId: result.conversationId, threadId }
}
