/**
 * report-routes.ts — Báo cáo "Hiệu quả Chat → Đơn hàng" cho màn Tổng quan.
 *
 * GET /api/v1/reports/chat-to-order
 *   ?period=day|week|month|custom & from= & to= & compare=7d|month|quarter|year
 *   & channel= & accountId=
 *
 * Nguồn số liệu (mỗi chỉ số 1 truy vấn gộp, không lặp từng dòng tin nhắn):
 *  - friends    = TỔNG liên hệ trong danh bạ hiện có (channel_contacts), KHÔNG
 *    lọc theo kỳ — cùng giá trị ở current lẫn previous vì đây là ảnh chụp hiện
 *    tại, không phải phát sinh trong kỳ. Zalo (zca-js getAllFriends()) không
 *    trả thời điểm kết bạn thật cho từng liên hệ, nên KHÔNG thể tính "liên hệ
 *    mới trong kỳ" đáng tin — channel_contacts.createdAt chỉ là lúc hệ thống
 *    ĐỒNG BỘ danh bạ (một lần đồng bộ lại ghi cùng created_at cho toàn bộ danh
 *    bạ cũ, từng khiến báo cáo hiểu nhầm 154 người "kết bạn" trong một ngày).
 *    Dùng làm mẫu số cho tỉ trọng nhắn tin (06) và phễu — "bao nhiêu % danh bạ
 *    có nhắn tin trong kỳ" là số liệu đúng và hữu ích hơn "kết bạn mới".
 *  - msgIn      = messages senderType='contact' có sentAt trong kỳ (join
 *    conversation → orgId).
 *  - afterHours = phần msgIn có giờ (theo múi giờ của lịch AI) NGOÀI giờ hành
 *    chính. Giờ hành chính đọc từ cùng storage với GET /api/v1/ai/schedule
 *    (AppSetting 'ai_auto_reply_schedule' — getAiScheduleConfig). Theo đúng
 *    ngữ nghĩa isAfterHours(): dù start<end hay start>end, khung LÀM VIỆC luôn
 *    là [min(start,end), max(start,end)) — mặc định 08:00–18:00.
 *  - chatters   = số NGƯỜI có nhắn tin trong kỳ: DISTINCT contactId của các
 *    hội thoại có tin 'contact' trong kỳ (contactId null → đếm theo
 *    conversationId để không mất khách chưa gắn contact).
 *  - orders / revenue / aiOrders = đọc từ cdp_events eventName='order_created'
 *    (ghi tại order-service.ts sau khi CRM nhận đơn thành công — ChatMQL không
 *    có bảng đơn hàng local, đơn nằm ở CRM). revenue = SUM(properties.total),
 *    đơn vị VND NGUYÊN. aiOrders = số event có properties.source='ai'.
 *    Kỳ không có event nào VÀ CRM (fetchSalesStats) cũng không gọi được →
 *    trả null + meta.salesNote, không bịa số.
 *  - tags       = đếm hội thoại có lastMessageAt trong kỳ theo từng tag trên
 *    Contact.tags (Json string[]), màu lấy từ danh sách tag của org (cùng
 *    storage với GET /api/v1/tags — AppSetting 'org.tags'). Top 10 theo count.
 *
 * PHẠM VI THEO VAI TRÒ — cùng luật với danh sách hội thoại / /dashboard/overview:
 *  - owner/admin: toàn bộ tổ chức (trừ khi tự lọc theo kênh/tài khoản trên UI).
 *  - manager: tài khoản của mình + tài khoản cấp dưới (resolveManagerAccountIds).
 *  - member: CHỈ tài khoản được cấp qua ChannelAccountAccess.
 *  Bộ lọc kênh/tài khoản trên UI giao với phạm vi này — chọn ngoài phạm vi thì
 *  bị từ chối (accountId) hoặc tự rút gọn danh sách (kênh). Không có luật này
 *  thì nhân viên xem báo cáo sẽ thấy số liệu của TOÀN CÔNG TY thay vì phần
 *  việc của mình — sai lệch hoàn toàn với dữ liệu họ thực sự phụ trách.
 *
 * Các tỉ lệ (msgPerFriend, afterHoursPct, convRate, aiPct) và badge trend do
 * FE tính — API chỉ trả số đếm gốc.
 */
import type { FastifyInstance } from 'fastify';
/**
 * Nhóm kênh tương tác — KHỚP `src/lib/channel-groups.ts` phía frontend.
 * `other` hứng phần còn lại (webchat, telegram, kênh mới chưa phân nhóm).
 */
export declare const CHANNEL_GROUPS: Record<string, number[]>;
/**
 * Phạm vi cuối cùng của một truy vấn báo cáo: danh sách accountId cụ thể.
 * `undefined` = không giới hạn (owner/admin, chưa chọn kênh/tài khoản nào) —
 * nhánh nhanh, chỉ lọc org + kênh còn sống. Mảng RỖNG = có quyền nhưng 0 tài
 * khoản khớp bộ lọc → phải trả về 0 khắp nơi, không phải "không giới hạn".
 */
export interface ScopeFilter {
    accountIds?: string[];
}
/**
 * Danh sách accountId "được phép xem" theo VAI TRÒ — trước khi áp bộ lọc UI.
 * `undefined` = owner/admin, không giới hạn (xem tổng toàn bộ các tài khoản con).
 * Đối với tài khoản con (member, manager, nhân viên...): chỉ trả về các tài khoản mình đang care.
 */
export declare function resolveAllowedAccountIds(user: {
    id: string;
    role: string;
}): Promise<string[] | undefined>;
/**
 * Giao phạm vi VAI TRÒ với bộ lọc UI (kênh / tài khoản cụ thể) → danh sách
 * accountId cuối cùng dùng cho mọi truy vấn. Dùng chung cho báo cáo và biểu
 * đồ tin nhắn để hai nơi trên cùng màn hình không bao giờ lệch số.
 */
export declare function resolveScopedAccountIds(orgId: string, user: {
    id: string;
    role: string;
}, query: {
    channel?: string;
    accountId?: string;
}): Promise<{
    accountIds?: string[];
    error?: string;
    status?: number;
}>;
export declare function reportRoutes(app: FastifyInstance): Promise<void>;
