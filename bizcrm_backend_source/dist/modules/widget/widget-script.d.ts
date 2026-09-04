/**
 * widget-script.ts — Script nhúng phục vụ tại `GET /widget.js`.
 *
 * Viết bằng JS thuần, không phụ thuộc thư viện: nó chạy trên website của người
 * khác, không được giả định họ có React/jQuery hay bất cứ thứ gì.
 *
 * Mọi thứ nằm trong Shadow DOM để CSS của website chủ không phá giao diện nút
 * chat, và ngược lại CSS của nút không rò ra làm hỏng trang của họ.
 */
import type { FastifyInstance } from 'fastify';
export declare function widgetScriptRoutes(app: FastifyInstance): Promise<void>;
