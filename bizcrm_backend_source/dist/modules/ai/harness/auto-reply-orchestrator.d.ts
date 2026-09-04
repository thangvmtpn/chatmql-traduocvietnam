/**
 * Chạy lượt AI cho một hội thoại, có khoá tuần tự và ngân sách thời gian.
 */
export declare function processAiReply(convId: string): Promise<void>;
/**
 * Khởi động lại là mất hết timer debounce trong bộ nhớ → tin khách đến trong
 * vài giây trước khi restart không bao giờ được trả lời. Quét lại các hội thoại
 * có tin khách mới hơn con trỏ trong 30 phút gần nhất và xếp lịch lại. Mọi
 * chặn (manual/tạm dừng/tắt) vẫn áp dụng bên trong pipeline nên quét dư không hại.
 */
export declare function recoverPendingAiReplies(): Promise<number>;
