/**
 * ai-eval-routes.ts — API cho bộ câu hỏi vàng (regression eval).
 *
 * Đọc (danh sách câu hỏi / lịch sử chạy) mở cho mọi user đã đăng nhập;
 * ghi (CRUD câu hỏi, chạy kiểm định) chỉ owner/admin — theo đúng pattern
 * ai-bot-routes.ts (TDVN chưa có RBAC động).
 */
import type { FastifyInstance } from 'fastify';
export declare function aiEvalRoutes(app: FastifyInstance): Promise<void>;
