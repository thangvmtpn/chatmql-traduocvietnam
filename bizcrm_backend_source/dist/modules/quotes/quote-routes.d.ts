/**
 * quote-routes.ts — API báo giá & hợp đồng (đã đăng nhập).
 *
 * ⚠️ MULTI-TENANT: orgId LUÔN lấy từ `request.user`, KHÔNG BAO GIỜ từ body/query.
 * Mọi service call đều truyền orgId làm tham số đầu.
 */
import type { FastifyInstance } from 'fastify';
export declare function quoteRoutes(app: FastifyInstance): Promise<void>;
