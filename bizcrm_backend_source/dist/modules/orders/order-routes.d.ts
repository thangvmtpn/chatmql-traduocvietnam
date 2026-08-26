/**
 * order-routes.ts — API lên đơn cho giao diện chat.
 *
 * Đây là lớp proxy: trình duyệt chỉ nói chuyện với ChatMQL backend bằng JWT
 * nhân viên; backend mới cầm service key gọi sang CRM. Trình duyệt không bao
 * giờ chạm trực tiếp vào CRM nữa — nhờ vậy service key không lộ, không phải
 * mở CORS cho từng domain, và ChatMQL kiểm soát được ai có quyền lên đơn.
 */
import type { FastifyInstance } from 'fastify';
export declare function orderRoutes(app: FastifyInstance): Promise<void>;
