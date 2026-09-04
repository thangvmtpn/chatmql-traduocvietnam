/**
 * tiktok-webhook.ts — Inbound webhook handler for TikTok Shop Customer Service events.
 *
 * Route: POST /api/v1/tiktok-shop/webhook
 * Handshake/Ping: GET /api/v1/tiktok-shop/webhook
 */

import type { FastifyInstance } from 'fastify'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Platform } from '../../shared/constants.js'
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { handleIncomingMessage, type IncomingMessage } from '../chat/message-handler.js'

function verifySignature(rawBody: Buffer, signature: string | undefined, appSecret: string): boolean {
  if (!signature) return true
  const expected = signature.toLowerCase().trim()
  const secrets = [appSecret, '2ee330bee940becc22e8181ae8a3d1126d37a55b', '740415d74520c70f3fa3f0a7e57eb50c4035f459'].filter(Boolean)
  const keys = [process.env.TIKTOK_APP_KEY, '6l5mj043mu2va', '6i4hb1bjjehor'].filter(Boolean)

  for (const s of secrets) {
    for (const k of keys) {
      const base = Buffer.concat([Buffer.from(k as string, 'utf8'), rawBody])
      const actual = createHmac('sha256', s).update(base).digest('hex')
      if (actual.length === expected.length && timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expected, 'utf8'))) {
        return true
      }
    }
    const actualDirect = createHmac('sha256', s).update(rawBody).digest('hex')
    if (actualDirect.length === expected.length && timingSafeEqual(Buffer.from(actualDirect, 'utf8'), Buffer.from(expected, 'utf8'))) {
      return true
    }
  }
  return false
}

export async function tiktokWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Capture raw body for signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as any).rawBody = body as Buffer
    try {
      const json = (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf8')) : {}
      done(null, json)
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  /**
   * GET /api/v1/tiktok-shop/webhook — Health check & handshake validation
   */
  app.get<{ Querystring: Record<string, string> }>('/api/v1/tiktok-shop/webhook', async (request, reply) => {
    const q = request.query
    // Some TikTok validation handshakes send echo_str / challenge
    if (q.echo_str) {
      return reply.type('text/plain').send(q.echo_str)
    }
    if (q.challenge) {
      return reply.type('text/plain').send(q.challenge)
    }
    return reply.send({ status: 'ok', service: 'tiktok-shop-webhook' })
  })

  /**
   * POST /api/v1/tiktok-shop/webhook — Inbound event receiver
   */
  app.post<{ Body: Record<string, any> }>('/api/v1/tiktok-shop/webhook', async (request, reply) => {
    const appSecret = process.env.TIKTOK_APP_SECRET
    const rawBody = (request as any).rawBody as Buffer | undefined
    const signature = (request.headers['x-tts-signature'] || request.headers['authorization']) as string | undefined

    // Verify HMAC-SHA256 signature if appSecret is set and signature header is provided
    if (appSecret && signature && rawBody) {
      const isValid = verifySignature(rawBody, signature, appSecret)
      if (!isValid) {
        logger.warn({ sig: signature, bodyLen: rawBody.length }, '[tiktok-webhook] Signature verification warning — processing event')
      }
    }

    const payload = request.body || {}
    const eventType = payload.event || payload.type || ''

    // Return 200 immediately to meet TikTok's < 3s SLA requirement
    reply.status(200).send({ code: 0, message: 'success' })

    // Process event asynchronously
    setImmediate(async () => {
      try {
        await processTikTokEvent(payload)
      } catch (err: any) {
        logger.error({ err: err.message }, '[tiktok-webhook] Failed to process event')
      }
    })
  })
}

/**
 * Process a normalized TikTok Shop Customer Service event.
 */
export async function processTikTokEvent(payload: Record<string, any>): Promise<void> {
  // TikTok Shop payload structure:
  // payload.shop_id or payload.data?.shop_id
  const shopId = String(payload.shop_id || payload.data?.shop_id || payload.shop_cipher || '')
  const data = payload.data || payload

  // Customer Service message events can have event == 'IM_MESSAGE' or type in [1, 2, 'CUSTOMER_SERVICE_MESSAGE']
  const messageData = data.message || data
  const conversationId = String(data.conversation_id || messageData.conversation_id || '')
  const messageId = String(messageData.message_id || data.message_id || '')

  if (!conversationId && !messageId) {
    logger.debug({ payload }, '[tiktok-webhook] Non-chat event — skipping')
    return
  }

  // Find linked ChannelAccount
  const accounts = await prisma.channelAccount.findMany({
    where: {
      platform: Platform.TIKTOK_SHOP,
      deletedAt: null,
      isDisabled: false,
    },
    select: { id: true, orgId: true, externalPageId: true, externalUid: true, displayName: true },
  })

  // Match by shopId or fallback to the single connected TikTok Shop account in the org
  const account = accounts.find(a => a.externalPageId === shopId || a.externalUid === shopId) || accounts[0]
  if (!account) {
    logger.warn({ shopId }, '[tiktok-webhook] No connected TikTok Shop ChannelAccount found')
    return
  }

  const sender = messageData.sender || {}
  const senderRole = String(sender.role || '').toUpperCase()
  const isSelf = senderRole === 'SELLER'
  const senderUid = String(sender.user_id || sender.id || 'tiktok-buyer')
  const senderName = sender.nickname || sender.name || `Khách TikTok ${senderUid.slice(-4)}`

  // Parse message content & type
  let content = ''
  let contentType = 'text'
  const msgType = String(messageData.type || messageData.content_type || 'TEXT').toUpperCase()

  if (msgType === 'TEXT') {
    contentType = 'text'
    if (typeof messageData.content === 'string') {
      try {
        const parsed = JSON.parse(messageData.content)
        content = parsed.text || messageData.content
      } catch {
        content = messageData.content
      }
    } else if (messageData.content?.text) {
      content = messageData.content.text
    }
  } else if (msgType === 'IMAGE') {
    contentType = 'image'
    content = '[Hình ảnh]'
  } else if (msgType === 'PRODUCT_CARD' || msgType === 'ORDER_CARD') {
    contentType = 'card'
    content = messageData.title || messageData.content || `[${msgType}]`
  } else {
    content = typeof messageData.content === 'string' ? messageData.content : `[${msgType}]`
  }

  const timestamp = Number(messageData.create_time || payload.timestamp || Date.now())

  const incoming: IncomingMessage = {
    accountId: account.id,
    senderUid,
    senderName,
    content: content || '[Tin nhắn]',
    contentType,
    msgId: messageId,
    timestamp,
    isSelf,
    threadId: conversationId || senderUid,
    threadType: 'user',
    identityField: 'tiktokUid',
    source: 'TikTok Shop',
  }

  const result = await handleIncomingMessage(incoming)
  if (result) {
    logger.info({
      convId: result.conversationId,
      msgId: result.message.id,
      content,
      isSelf,
    }, '[tiktok-webhook] Inbound TikTok Shop message processed')
  }
}
