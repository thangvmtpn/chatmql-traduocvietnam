/**
 * widget-public-routes.ts — API CÔNG KHAI cho nút chat nhúng trên website khách.
 *
 * Không có JWT: người truy cập website là khách vãng lai, chưa đăng nhập CRM.
 * Ba lớp phòng vệ thay cho xác thực:
 *   1. `siteKey` xác định widget (công khai — nằm trong mã nguồn trang)
 *   2. Danh sách tên miền: chặn người khác chép mã nhúng sang site của họ
 *   3. Rate-limit toàn cục của Fastify đã đăng ký ở app.ts
 *
 * `visitorId` do trình duyệt khách tự sinh và lưu localStorage. Cùng một
 * visitorId thì nối lại đúng hội thoại cũ — khách F5 không tạo hội thoại mới.
 *
 * Widget KHÔNG tự tạo tin nhắn: mọi tin đều đi qua `deliverWebVisitorMessage`
 * của kênh Web Chat sẵn có, nên hội thoại vào đúng inbox và bắn `chat:message`
 * như mọi kênh khác. Widget chỉ là lớp nhúng công khai đứng trước kênh đó.
 */
import type { FastifyInstance } from 'fastify';
export declare function widgetPublicRoutes(app: FastifyInstance): Promise<void>;
