/**
 * learn-history-routes.ts — HỌC TỪ LỊCH SỬ TIN NHẮN (Train AI · Đợt 3).
 *
 * Cho AI học giọng điệu & mẫu câu của nhân viên thật từ hội thoại tư vấn cũ:
 *   1. Gom hội thoại theo bộ lọc (tài khoản Zalo nhân viên, khoảng thời gian,
 *      ưu tiên hội thoại đã ra đơn — đối chiếu SĐT với hoa_don bên CRM nếu có
 *      CRM_DATABASE_URL, không có thì dùng heuristic từ khóa chốt đơn).
 *   2. ẨN DANH trước khi phân tích: che SĐT, email, dãy số dài — thông tin
 *      cá nhân của khách KHÔNG rời khỏi máy chủ dưới dạng thô.
 *   3. Gọi model (cấu hình task ai_master) phân tích → đề xuất bản Persona mới
 *      (xưng hô, câu chào, cách báo giá, xử lý chê đắt, nhịp chốt, emoji,
 *      kèm mục "Bộ mẫu câu chuẩn").
 *   4. KHÔNG tự áp dụng — tạo AiLogicProposal (pending) qua đúng flow của
 *      AI Master; admin duyệt ở giao diện mới áp vào tài liệu Persona.
 *
 * Cách 2: tải tệp export chat (.txt/.csv/.json) → cùng phễu ẩn danh + phân tích.
 * ACL: owner/admin.
 */
import type { FastifyInstance } from 'fastify';
export declare function anonymize(text: string): string;
export default function learnHistoryRoutes(app: FastifyInstance): Promise<void>;
