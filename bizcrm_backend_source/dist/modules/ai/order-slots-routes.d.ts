/**
 * order-slots-routes.ts — Thanh tiến trình chốt đơn cho Chat thử (Train AI · Đợt 4).
 *
 * Quy tắc trong tài liệu "Quy tắc trả lời": AI phải có đủ SẢN PHẨM + QUY CÁCH +
 * SỐ LƯỢNG + TỔNG TIỀN rồi MỚI được xin địa chỉ. Màn Chat thử cần soi được điều
 * đó ngay khi đang huấn luyện.
 *
 * QUAN TRỌNG — đây là DÒ THEO VĂN BẢN, không phải trạng thái nội bộ của AI:
 * harness không lưu "slot" nào cả. Ta đọc lại các tin trong hội thoại sandbox và
 * đối chiếu với danh mục sản phẩm thật + mẫu số/tiền/địa chỉ. Cách này không tốn
 * phí AI và giải thích được từng ô bật nhờ câu nào, nhưng có thể sai ở câu chữ lạ
 * — giao diện phải nói thẳng "dò theo văn bản" để người dùng không hiểu nhầm.
 */
import type { FastifyInstance } from 'fastify';
export declare const SLOT_KEYS: readonly ["product", "variant", "quantity", "total", "upsell", "address"];
export type SlotKey = typeof SLOT_KEYS[number];
export type SlotState = {
    key: SlotKey;
    filled: boolean;
    /** Câu đầu tiên làm ô này bật — để người huấn luyện soi lại được. */
    evidence: string | null;
    /** Thứ tự tin nhắn làm ô bật (dùng để bắt lỗi xin địa chỉ sớm). */
    at: number | null;
};
/** Chấm trạng thái 6 ô từ danh sách tin nhắn theo thứ tự thời gian. */
export declare function detectSlots(messages: Array<{
    content: string;
    senderType: string;
}>, productNames: string[]): {
    slots: SlotState[];
    earlyAddress: boolean;
};
export default function orderSlotsRoutes(app: FastifyInstance): Promise<void>;
