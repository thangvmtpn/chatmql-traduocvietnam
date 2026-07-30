import { SenderType, Platform } from '../../shared/constants.js'
/**
 * chat-message-routes.ts — Send text/image/file messages + shared media endpoint.
 * Extracted from chat-routes.ts for modularization.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/prisma-client.js'
import { emitNewMessage, emitSendError } from '../realtime/socket-gateway.js'
import { getPoolEntry, sendImageViaPool, sendFileViaPool } from '../zalo/zalo-pool.js'
import { sendAttachmentViaFb } from '../facebook-page/fb-pool.js'
import { saveChatMedia } from './chat-media-store.js'
import type { FbAttachmentType } from '../facebook-page/fb-client.js'
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js'
import { checkLimits, recordAction } from '../zalo/zalo-rate-limiter.js'
import { logger } from '../../shared/logger.js'
import { transformMessageForFrontend, buildReplyQuote } from './chat-routes.js'
import { sendMessageCore } from './send-core.js'

type QueryParams = Record<string, string>

function fbTypeFromMime(mime: string): FbAttachmentType {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

export async function chatMessageRoutes(app: FastifyInstance): Promise<void> {
  // ── Send message ────────────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { content: string; replyMessageId?: string; source?: string } }>(
    '/api/v1/conversations/:id/messages',
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const user = request.user as { orgId: string; id: string }
      const { content, replyMessageId, source } = request.body

      if (!content?.trim()) return reply.status(400).send({ error: 'Content required' })

      // Verify conversation exists and belongs to org before proceeding
      const convCheck = await prisma.conversation.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        select: {
          id: true,
          channelAccount: { select: { externalUid: true } },
        },
      })
      if (!convCheck) return reply.status(404).send({ error: 'Conversation not found' })

      // Build quote reference if replying
      let quote: ReturnType<typeof buildReplyQuote> | undefined = undefined
      if (replyMessageId) {
        const replyMsg = await prisma.message.findFirst({
          where: { id: replyMessageId, conversationId: request.params.id },
          select: { externalMsgId: true, senderUid: true, content: true, contentType: true, sentAt: true },
        })
        if (replyMsg) {
          const effectiveSenderUid = replyMsg.senderUid || convCheck.channelAccount?.externalUid || ''
          const built = buildReplyQuote({ ...replyMsg, senderUid: effectiveSenderUid })
          if (built) quote = built
        }
      }

      let result: Awaited<ReturnType<typeof sendMessageCore>>
      try {
        result = await sendMessageCore({
          orgId: user.orgId,
          conversationId: request.params.id,
          text: content,
          sender: 'staff',
          repliedByUserId: user.id,
          quote: quote ?? null,
          // Staff sent an AI suggestion as-is → ai_suggest; plain compose → manual (default).
          responseSource: source === 'ai_suggest' ? 'ai_suggest' : undefined,
        })
      } catch (err: any) {
        logger.error({ err }, '[chat] sendMessageCore failed')
        return reply.status(500).send({ error: 'Failed to send message' })
      }

      // CS window error — inform client to show warning
      if (result.csWindowExpired) {
        return reply.status(422).send({
          error: result.zaloError,
          code: 'CS_WINDOW_EXPIRED',
          zaloErrorCode: result.zaloErrorCode,
        })
      }

      // Rate-limit reached — surfaced from send-core
      if (!result.sentViaZalo && result.zaloError?.includes('Rate limit')) {
        return reply.status(429).send({ error: result.zaloError })
      }

      // Notify client if Zalo delivery failed (non-blocking)
      if (result.zaloError) {
        const firstMsg = result.messages[0] as any
        try {
          emitSendError(user.orgId, request.params.id, {
            messageId: firstMsg?.id,
            reason: result.zaloError,
          })
        } catch { /* socket not ready */ }
      }

      // Return first (and only) message for staff sends — same shape as before
      return result.messages[0]
    },
  )

  // ── Send image ─────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/messages/image',
    async (request, reply) => {
      let orgId = 'org-1'; // fallback test
      let userId = 'user-1';
      if (request.user) {
        orgId = (request.user as any).orgId;
        userId = (request.user as any).id;
      }

      const conv = await prisma.conversation.findFirst({
        where: { id: request.params.id },
        select: {
          id: true, contactId: true, orgId: true,
          channelAccountId: true, threadType: true, externalThreadId: true,
          contact: { select: { zaloUid: true } },
          channelAccount: { select: { platform: true } },
        },
      })
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' })

      // Parse multipart
      const data = await request.file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buffer = await data.toBuffer()
      const filename = data.filename || 'image.jpg'
      const caption = (data.fields?.caption as any)?.value || ''

      // Validate image MIME type
      const mime = data.mimetype || ''
      if (!mime.startsWith('image/')) {
        return reply.status(400).send({ error: 'File must be an image (jpg, png, gif, webp)' })
      }

      // Rate limit check
      let sentViaZalo = false
      let uploadedContent: string | undefined
      if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE && conv.externalThreadId) {
        // Facebook Page: upload bytes to Messenger + keep a local copy so the
        // sent image renders in the CRM timeline (Send API returns no display URL).
        const url = await saveChatMedia(buffer, filename)
        const sendResult = await sendAttachmentViaFb(
          conv.channelAccountId, conv.externalThreadId, buffer, filename, mime, 'image',
        )
        sentViaZalo = sendResult.sent
        uploadedContent = JSON.stringify({ href: url, thumb: url, hdUrl: url })
      } else {
        const poolEntry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined
        if (poolEntry?.status === 'connected' && conv.contact?.zaloUid) {
          const rateCheck = checkLimits(conv.channelAccountId, 'message')
          if (!rateCheck.allowed) {
            return reply.status(429).send({
              error: rateCheck.reason || 'Rate limit exceeded',
              remaining: rateCheck.remaining,
            })
          }
          const sendResult = await sendImageViaPool(
            conv.channelAccountId, conv.contact.zaloUid,
            buffer, filename, caption,
            conv.threadType === 'group' ? 1 : 0
          )
          sentViaZalo = sendResult.sent
          uploadedContent = sendResult.content
          if (sentViaZalo) recordAction(conv.channelAccountId, 'message')
        }
      }

      // Create local message record
      const message = await prisma.message.create({
        data: {
          conversationId: request.params.id,
          senderType: SenderType.SELF,
          senderUid: '',
          senderName: 'Staff',
          content: uploadedContent || caption || `[📷 ${filename}]`,
          contentType: 'image',
          sentAt: new Date(),
          repliedByUserId: userId,
        },
      })

      await prisma.conversation.update({
        where: { id: request.params.id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
      })

      const fePayload = transformMessageForFrontend({
        ...message, senderType: SenderType.SELF, senderName: 'Staff' as const,
      })
      try {
        emitNewMessage(orgId, request.params.id, fePayload)
      } catch { /* socket */ }

      return { ...fePayload, sentViaZalo }
    },
  )

  // ── Send file ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/messages/file',
    { preHandler: requireZaloAccess() },
    async (request, reply) => {
      const user = request.user as { orgId: string; id: string }

      const conv = await prisma.conversation.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        select: {
          id: true, contactId: true, orgId: true,
          channelAccountId: true, externalThreadId: true,
          contact: { select: { zaloUid: true } },
          channelAccount: { select: { platform: true } },
        },
      })
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' })

      // Parse multipart
      const data = await request.file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const buffer = await data.toBuffer()
      const filename = data.filename || 'document'
      const caption = (data.fields?.caption as any)?.value || ''

      // Validate file type — block dangerous extensions
      const ALLOWED_EXTENSIONS = new Set([
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.csv', '.zip', '.rar', '.7z',
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
        '.mp4', '.mp3', '.wav', '.ogg', '.webm',
      ])
      const ext = (filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.')) : '').toLowerCase()
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        return reply.status(400).send({ error: `File type "${ext}" is not allowed` })
      }

      // Rate limit check
      let sentViaZalo = false
      let uploadedContent: string | undefined
      if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE && conv.externalThreadId) {
        // Facebook Page: upload bytes to Messenger + keep a local copy so the file
        // link renders (parseFileInfo needs title/href/fileExt).
        const url = await saveChatMedia(buffer, filename)
        const mime = data.mimetype || ''
        const sendResult = await sendAttachmentViaFb(
          conv.channelAccountId, conv.externalThreadId, buffer, filename, mime, fbTypeFromMime(mime),
        )
        sentViaZalo = sendResult.sent
        uploadedContent = JSON.stringify({
          title: filename,
          href: url,
          fileExt: (ext || '').replace(/^\./, '') || 'file',
          fileSize: String(buffer.length),
        })
      } else {
        const poolEntry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined
        if (poolEntry?.status === 'connected' && conv.contact?.zaloUid) {
          const rateCheck = checkLimits(conv.channelAccountId, 'message')
          if (!rateCheck.allowed) {
            return reply.status(429).send({
              error: rateCheck.reason || 'Rate limit exceeded',
              remaining: rateCheck.remaining,
            })
          }
          sentViaZalo = await sendFileViaPool(
            conv.channelAccountId, conv.contact.zaloUid,
            buffer, filename, caption,
          )
          if (sentViaZalo) recordAction(conv.channelAccountId, 'message')
        }
      }

      // Create local message record
      const message = await prisma.message.create({
        data: {
          conversationId: request.params.id,
          senderType: SenderType.SELF,
          senderUid: '',
          senderName: 'Staff',
          content: uploadedContent || caption || `[📎 ${filename}]`,
          contentType: 'file',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      })

      await prisma.conversation.update({
        where: { id: request.params.id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
      })

      const fePayload = transformMessageForFrontend({
        ...message, senderType: SenderType.SELF, senderName: 'Staff' as const,
      })
      try {
        emitNewMessage(user.orgId, request.params.id, fePayload)
      } catch { /* socket */ }

      return { ...fePayload, sentViaZalo }
    },
  )

  // ── Conversation shared media (images, files, links) ────────────────
  app.get<{ Params: { id: string } }>('/api/v1/conversations/:id/shared-media', { preHandler: requireZaloAccess() }, async (request, reply) => {
    const user = request.user as { orgId: string }
    const { type = 'all' } = request.query as QueryParams

    const conv = await prisma.conversation.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
      select: { id: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Not found' })

    // Build content type filter
    let contentTypeFilter: any = {}
    if (type === 'image') contentTypeFilter = { in: ['image', 'video'] }
    else if (type === 'file') contentTypeFilter = 'file'
    else if (type === 'link') contentTypeFilter = 'link'
    else contentTypeFilter = { in: ['image', 'video', 'file', 'link'] }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: request.params.id,
        contentType: contentTypeFilter,
        isDeleted: false,
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
      select: {
        id: true, content: true, contentType: true,
        senderName: true, sentAt: true,
      },
    })

    // Count by type
    const convId = request.params.id
    const [imageCountExplicit, fileCount, linkCount] = await Promise.all([
      prisma.message.count({
        where: { conversationId: convId, contentType: { in: ['image', 'video'] }, isDeleted: false },
      }),
      prisma.message.count({
        where: { conversationId: convId, contentType: 'file', isDeleted: false },
      }),
      prisma.message.count({
        where: { conversationId: convId, contentType: 'link', isDeleted: false },
      }),
    ])

    // Also count images stored as text with JSON content
    let imageCountFromText = 0
    try {
      const textImagesResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ${convId}
        AND content_type = 'text' AND is_deleted = false
        AND content LIKE '%"href":"https://%' AND content LIKE '%.jpg%'
      `
      imageCountFromText = Number(textImagesResult[0]?.count || 0)
    } catch { /* ignore SQL errors */ }

    // Also count links embedded in text messages (URLs sent as plain text)
    let linkCountFromText = 0
    try {
      const textLinksResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ${convId}
        AND content_type = 'text' AND is_deleted = false
        AND content ~ 'https?://[^\s]+'
      `
      linkCountFromText = Number(textLinksResult[0]?.count || 0)
    } catch { /* ignore SQL errors */ }

    return { messages, counts: { image: imageCountExplicit + imageCountFromText, file: fileCount, link: linkCount + linkCountFromText } }
  })
}
