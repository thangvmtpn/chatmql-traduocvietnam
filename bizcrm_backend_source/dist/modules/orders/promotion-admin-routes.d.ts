/**
 * promotion-admin-routes.ts — Quản trị ưu đãi.
 *
 * Tách riêng khỏi order-routes.ts vì đây là màn hình quản trị, có luật quyền
 * khác hẳn: chỉ owner/admin/manager mới được vào. Nhân viên thường vẫn xem và
 * áp mã ưu đãi bình thường qua các endpoint ở order-routes.ts.
 */
import type { FastifyInstance } from 'fastify';
export declare function promotionAdminRoutes(app: FastifyInstance): Promise<void>;
