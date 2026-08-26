/**
 * library-routes.ts — Thư viện tài liệu gửi cho khách.
 *
 * Nguyên tắc an toàn: CHỈ trả về tài liệu đã duyệt (status='active'). Mục đang
 * chờ duyệt hoặc bị từ chối không bao giờ lọt ra đây, vì đầu ra của endpoint
 * này được nhân viên gửi thẳng cho khách hàng.
 *
 * Hai nguồn:
 *   • Ảnh sản phẩm  — products.images, nhóm theo danh mục sản phẩm
 *   • Kho tri thức  — knowledge_entries (bài viết, chính sách, ảnh/video đã duyệt)
 */
import type { FastifyInstance } from 'fastify';
export declare function libraryRoutes(app: FastifyInstance): Promise<void>;
