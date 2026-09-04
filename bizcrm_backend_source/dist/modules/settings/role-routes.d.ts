/**
 * role-routes.ts — Đọc danh mục quyền và vai trò (RBAC giai đoạn 1).
 *
 * Các chốt trong route đã đọc quyền từ đây (giai đoạn 2), nên sửa ở màn này là
 * có hiệu lực ngay — chỉ chờ hết 30 giây cache, hoặc lập tức vì mọi endpoint ghi
 * đều gọi `invalidateRolePermissionCache()`.
 *
 * Ba chốt an toàn, cả ba đều nhằm chống tự khoá cửa:
 *   1. Không sửa/xoá được vai trò `owner`
 *   2. Không xoá vai trò còn người đang giữ
 *   3. Không tự gỡ quyền `roles.update` của chính vai trò mình đang mang
 */
import type { FastifyInstance } from 'fastify';
export declare function roleRoutes(app: FastifyInstance): Promise<void>;
