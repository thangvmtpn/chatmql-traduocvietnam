/**
 * quote-public-routes.ts — trang khách hàng xem báo giá. KHÔNG có JWT.
 *
 * Xác thực = publicToken (24 byte random). Bảo vệ:
 * - Rate limit riêng, chặt hơn route thường
 * - Chỉ trả field trong allowlist (`toPublicQuote`)
 * - Không tiết lộ org nào, không tiết lộ báo giá có tồn tại hay không (404 chung)
 */
import type { FastifyInstance } from 'fastify';
export declare function quotePublicRoutes(app: FastifyInstance): Promise<void>;
