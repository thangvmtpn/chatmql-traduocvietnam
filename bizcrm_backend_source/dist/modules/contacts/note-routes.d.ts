/**
 * note-routes.ts — CRUD API for internal notes
 * Scoped to orgId via authMiddleware.
 */
import type { FastifyInstance } from 'fastify';
/**
 * Kết quả tương tác của một lần liên hệ. Lưu bằng mã tiếng Anh để nhãn hiển thị
 * đổi được mà không phải sửa dữ liệu cũ; nhãn tiếng Việt gửi kèm cho giao diện.
 */
export declare const NOTE_STATUSES: readonly [{
    readonly value: "no_contact";
    readonly label: "Không kết nối";
    readonly tone: "muted";
}, {
    readonly value: "consulting";
    readonly label: "Đang tư vấn";
    readonly tone: "info";
}, {
    readonly value: "callback";
    readonly label: "Hẹn gọi lại";
    readonly tone: "warning";
}, {
    readonly value: "opportunity";
    readonly label: "Cơ hội";
    readonly tone: "info";
}, {
    readonly value: "won";
    readonly label: "Chốt thành công";
    readonly tone: "success";
}, {
    readonly value: "at_risk";
    readonly label: "Nguy cơ rời bỏ";
    readonly tone: "danger";
}];
export declare function noteRoutes(app: FastifyInstance): Promise<void>;
