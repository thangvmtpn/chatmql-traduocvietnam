/**
 * widget-admin-routes.ts — Quản lý các website được nhúng nút chat.
 *
 * Một tổ chức có thể khai nhiều website; mỗi website một `siteKey` riêng để
 * phân biệt nguồn khách ("Web: Landing khuyến mãi") và cấu hình giao diện khác nhau.
 *
 * Quyền: route GHI đọc từ hệ thống permission động (`integrations.*`) qua
 * `userHasPermission` — giống eCDP. Route ĐỌC vẫn mở cho mọi user đã đăng nhập
 * trong tổ chức (khác eCDP, giữ nguyên hành vi TDVN hiện tại).
 */
import type { FastifyInstance } from 'fastify';
export declare const WIDGET_LOGO_DIR: string;
export declare function widgetAdminRoutes(app: FastifyInstance): Promise<void>;
