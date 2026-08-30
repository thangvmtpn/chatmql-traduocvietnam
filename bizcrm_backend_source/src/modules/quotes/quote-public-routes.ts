/**
 * quote-public-routes.ts — trang khách hàng xem báo giá. KHÔNG có JWT.
 *
 * Xác thực = publicToken (24 byte random). Bảo vệ:
 * - Rate limit riêng, chặt hơn route thường
 * - Chỉ trả field trong allowlist (`toPublicQuote`)
 * - Không tiết lộ org nào, không tiết lộ báo giá có tồn tại hay không (404 chung)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getPublicQuote, respondToPublicQuote } from './quote-public-service.js'

function clientIp(request: FastifyRequest): string {
  const fwd = request.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim().slice(0, 45)
  return (request.ip || '').slice(0, 45)
}

function notFound(reply: FastifyReply) {
  return reply.status(404).send({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy báo giá này' },
  })
}

export async function quotePublicRoutes(app: FastifyInstance): Promise<void> {
  // KHÔNG addHook authMiddleware — đây là route công khai có chủ đích.

  app.get('/api/public/quotes/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string }
    try {
      const result = await getPublicQuote(token, {
        ip: clientIp(request),
        userAgent: String(request.headers['user-agent'] ?? ''),
      })

      switch (result.kind) {
        case 'ok':
          return { success: true, data: result.quote, meta: { canRespond: result.canRespond } }
        case 'expired':
          return reply.status(410).send({
            success: false,
            error: { code: 'EXPIRED', message: 'Báo giá đã hết hiệu lực. Vui lòng liên hệ để nhận báo giá mới.' },
            data: { number: result.quote.number, validUntil: result.quote.validUntil },
          })
        case 'gone':
          return reply.status(410).send({
            success: false,
            error: { code: 'GONE', message: 'Báo giá này không còn khả dụng' },
          })
        default:
          return notFound(reply)
      }
    } catch (e) {
      app.log.error({ e }, '[quotes] public get')
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Lỗi hệ thống' } })
    }
  })

  app.post('/api/public/quotes/:token/respond', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const body = (request.body ?? {}) as { action?: string; reason?: string }
    if (body.action !== 'accept' && body.action !== 'reject') {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'action phải là accept hoặc reject' },
      })
    }

    try {
      const result = await respondToPublicQuote(token, body.action, {
        ip: clientIp(request),
        userAgent: String(request.headers['user-agent'] ?? ''),
        reason: body.reason,
      })

      switch (result.kind) {
        case 'ok':
          return { success: true, data: { status: result.status } }
        case 'conflict':
          return reply.status(409).send({ success: false, error: { code: 'CONFLICT', message: result.message } })
        default:
          return notFound(reply)
      }
    } catch (e) {
      app.log.error({ e }, '[quotes] public respond')
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Lỗi hệ thống' } })
    }
  })
}
