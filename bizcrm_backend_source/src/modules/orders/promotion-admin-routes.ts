/**
 * promotion-admin-routes.ts — Quản trị ưu đãi.
 *
 * Tách riêng khỏi order-routes.ts vì đây là màn hình quản trị, có luật quyền
 * khác hẳn: chỉ owner/admin/manager mới được vào. Nhân viên thường vẫn xem và
 * áp mã ưu đãi bình thường qua các endpoint ở order-routes.ts.
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { logger } from '../../shared/logger.js'
import {
  CrmApiError,
  adminListPromotions,
  adminCreatePromotion,
  adminUpdatePromotion,
  adminDeletePromotion,
  adminListAssigned,
  adminAssignCustomers,
  adminUnassignCustomer,
  adminPointsReconcile,
  type PromotionInput,
} from './crm-order-client.js'

type AuthUser = { orgId: string; id: string; fullName?: string; role?: string }

/** Ai được sửa ưu đãi. Ưu đãi ảnh hưởng trực tiếp tới doanh thu nên siết chặt. */
const ADMIN_ROLES = new Set(['owner', 'admin', 'manager'])

function replyErr(reply: any, err: unknown, context: string) {
  if (err instanceof CrmApiError) {
    // 4xx từ CRM là lỗi nghiệp vụ (mã trùng, ngày sai…) — chuyển nguyên si để
    // người quản trị đọc được lý do, thay vì nuốt thành "lỗi hệ thống".
    const status = err.status >= 400 && err.status < 500 && err.status !== 401 ? err.status : 502
    logger.warn({ err, status: err.status }, `[promo-admin] ${context}`)
    return reply.status(status).send({ success: false, error: err.detail || err.message })
  }
  logger.error({ err }, `[promo-admin] ${context}`)
  return reply.status(500).send({ success: false, error: 'Lỗi hệ thống' })
}

export async function promotionAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // Chặn quyền một lần cho toàn bộ nhóm route, thay vì lặp lại ở từng endpoint.
  app.addHook('preHandler', async (request, reply) => {
    const user = request.user as AuthUser
    if (!ADMIN_ROLES.has(user.role || '')) {
      logger.warn({ userId: user.id, role: user.role }, '[promo-admin] Từ chối truy cập')
      return reply.status(403).send({
        error: 'Chỉ chủ tài khoản, quản trị viên và quản lý mới được quản lý ưu đãi',
      })
    }
  })

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body: string, done) => {
    if (!body) return done(null, {})
    try { done(null, JSON.parse(body)) } catch (err: any) { err.statusCode = 400; done(err, undefined) }
  })

  // ── Đối soát điểm ─────────────────────────────────────────────────
  // Đặt cùng nhóm quyền với quản trị ưu đãi: đây là dữ liệu tài chính.
  app.get<{ Querystring: { limit?: string; minGap?: string } }>(
    '/api/v1/admin/points-reconcile',
    async (request, reply) => {
      try {
        return await adminPointsReconcile({
          limit: parseInt(request.query.limit || '', 10) || undefined,
          minGap: request.query.minGap !== undefined ? Number(request.query.minGap) : undefined,
        })
      } catch (err) { return replyErr(reply, err, 'đối soát điểm') }
    },
  )

  app.get<{ Querystring: { status?: string; q?: string } }>(
    '/api/v1/admin/promotions',
    async (request, reply) => {
      try {
        return await adminListPromotions({ status: request.query.status, q: request.query.q })
      } catch (err) { return replyErr(reply, err, 'lấy danh sách ưu đãi') }
    },
  )

  app.post<{ Body: PromotionInput }>('/api/v1/admin/promotions', async (request, reply) => {
    const user = request.user as AuthUser
    try {
      const r = await adminCreatePromotion(request.body)
      logger.info({ userId: user.id, promoId: r.id, name: request.body?.name }, '[promo-admin] Tạo ưu đãi')
      return r
    } catch (err) { return replyErr(reply, err, 'tạo ưu đãi') }
  })

  app.put<{ Params: { id: string }; Body: PromotionInput }>(
    '/api/v1/admin/promotions/:id',
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID không hợp lệ' })
      const user = request.user as AuthUser
      try {
        const r = await adminUpdatePromotion(id, request.body)
        logger.info({ userId: user.id, promoId: id }, '[promo-admin] Sửa ưu đãi')
        return r
      } catch (err) { return replyErr(reply, err, 'cập nhật ưu đãi') }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/v1/admin/promotions/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID không hợp lệ' })
    const user = request.user as AuthUser
    try {
      const r = await adminDeletePromotion(id)
      logger.info({ userId: user.id, promoId: id }, '[promo-admin] Xóa ưu đãi')
      return r
    } catch (err) { return replyErr(reply, err, 'xóa ưu đãi') }
  })

  app.get<{ Params: { id: string } }>(
    '/api/v1/admin/promotions/:id/customers',
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID không hợp lệ' })
      try { return await adminListAssigned(id) }
      catch (err) { return replyErr(reply, err, 'lấy danh sách khách được gán') }
    },
  )

  app.post<{ Params: { id: string }; Body: { phones?: string[] } }>(
    '/api/v1/admin/promotions/:id/customers',
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID không hợp lệ' })
      const phones = (request.body?.phones || []).map(p => String(p).trim()).filter(Boolean)
      if (!phones.length) return reply.status(400).send({ error: 'Chưa nhập số điện thoại nào' })
      const user = request.user as AuthUser
      try {
        const r = await adminAssignCustomers(id, phones)
        logger.info({ userId: user.id, promoId: id, count: phones.length }, '[promo-admin] Gán ưu đãi cho khách')
        return r
      } catch (err) { return replyErr(reply, err, 'gán ưu đãi cho khách') }
    },
  )

  app.delete<{ Params: { id: string; phone: string } }>(
    '/api/v1/admin/promotions/:id/customers/:phone',
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (!Number.isFinite(id)) return reply.status(400).send({ error: 'ID không hợp lệ' })
      try { return await adminUnassignCustomer(id, request.params.phone) }
      catch (err) { return replyErr(reply, err, 'gỡ ưu đãi khỏi khách') }
    },
  )
}
