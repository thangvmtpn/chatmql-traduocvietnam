/**
 * crm-products-routes.ts — HTTP cho module "Sản phẩm (CRM)".
 * Chỉ đọc: không tạo/sửa/xoá, vì CRM mới là nơi quản lý sản phẩm.
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { searchCrmProducts, listCrmProducts, resolveSource } from './crm-products-client.js'

export async function crmProductRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  /**
   * Nguồn đang dùng + đã cấu hình chưa — để FE báo đúng nguyên nhân khi lỗi.
   *
   * `miniAppUrlTemplate` là mẫu link Mini App gửi khách, chứa chỗ thay `{code}`
   * (và `{id}` cho hệ thống đánh số thay vì mã). Chưa cấu hình thì trả rỗng để
   * giao diện khoá nút gửi — thà không gửi còn hơn gửi khách một link hỏng.
   */
  app.get('/api/v1/crm-products/source', async () => ({
    source: resolveSource(),
    dashboardConfigured: !!process.env.CRM_DASHBOARD_TOKEN,
    miniAppUrlTemplate: process.env.ZALO_MINIAPP_PRODUCT_URL || '',
  }))

  /** Danh sách để duyệt — không cần gõ từ khoá. */
  app.get<{
    Querystring: { q?: string; warehouseId?: string; category?: string; inStock?: string; page?: string; pageSize?: string }
  }>('/api/v1/crm-products', async (request, reply) => {
    const qy = request.query
    const int = (v?: string) => {
      const n = Number.parseInt(v ?? '', 10)
      return Number.isFinite(n) ? n : undefined
    }
    try {
      return await listCrmProducts({
        orgId: (request.user as { orgId: string }).orgId,
        q: qy.q,
        warehouseId: int(qy.warehouseId),
        category: qy.category || undefined,
        inStockOnly: qy.inStock === 'true',
        page: int(qy.page),
        pageSize: int(qy.pageSize),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không rõ lỗi'
      app.log.error({ err }, '[crm-products] lấy danh sách thất bại')
      const status = /hết hạn|không hợp lệ|401|403/.test(msg) ? 401 : /chưa cấu hình/.test(msg) ? 400 : 502
      return reply.status(status).send({ error: `Không lấy được sản phẩm từ CRM: ${msg}` })
    }
  })

  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/v1/crm-products/search',
    async (request, reply) => {
      const q = (request.query.q ?? '').trim()
      const limit = Number.parseInt(request.query.limit ?? '20', 10)
      try {
        return await searchCrmProducts(
          q,
          Number.isFinite(limit) ? limit : 20,
          (request.user as { orgId: string }).orgId,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Không rõ lỗi'
        app.log.error({ err }, '[crm-products] tìm sản phẩm thất bại')
        const status = /hết hạn|không hợp lệ|401|403/.test(msg) ? 401
          : /chưa cấu hình/.test(msg) ? 400
            : 502
        return reply.status(status).send({ error: `Không lấy được sản phẩm từ CRM: ${msg}` })
      }
    },
  )
}
