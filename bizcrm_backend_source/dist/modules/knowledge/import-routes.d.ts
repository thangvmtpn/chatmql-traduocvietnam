/**
 * import-routes.ts — Nạp nguồn tri thức từ TỆP và WEBSITE (Train AI · Đợt 2).
 *
 * Cả hai đường đều đi qua cùng một phễu an toàn:
 *   parse → cắt đoạn (~2.000 ký tự, ưu tiên ranh giới đoạn văn) → tạo
 *   KnowledgeEntry với risk='sensitive' → status='pending' (HÀNG CHỜ DUYỆT).
 *   AI chỉ tra cứu được sau khi admin bấm duyệt; embedding tự chạy nền khi tạo.
 *
 * ACL: owner/admin. Đăng ký: app.register(importRoutes) trong app.ts.
 */
import type { FastifyInstance } from 'fastify';
/** Cắt theo ranh giới đoạn văn (\n\n), gom tới ~CHUNK_TARGET; đoạn đơn quá dài
 *  thì cắt cứng ở CHUNK_MAX theo ranh giới câu gần nhất. */
export declare function chunkText(raw: string): string[];
export declare function htmlToText(html: string): {
    title: string;
    text: string;
};
export default function importRoutes(app: FastifyInstance): Promise<void>;
