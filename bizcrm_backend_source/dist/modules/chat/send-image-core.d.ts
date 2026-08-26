export interface SendImageCoreParams {
    orgId: string;
    conversationId: string;
    /** URL ảnh do máy chủ phân giải — tuyệt đối hoặc /uploads/... */
    imageUrl: string;
    caption?: string;
    sender: 'ai' | 'staff';
    repliedByUserId?: string | null;
    aiReplyRunId?: string | null;
}
export interface SendImageCoreResult {
    sent: boolean;
    messageId?: string;
    error?: string;
}
/**
 * Ảnh này có thật sự gửi được không?
 *
 * Phải hỏi TRƯỚC khi để AI nói với khách là "em gửi ảnh ngay". Database còn ghi
 * đường dẫn nhưng file đã mất là chuyện có thật trên hệ thống này — không kiểm
 * thì AI hứa rồi khách chờ mãi không thấy ảnh, tệ hơn là không hứa.
 */
export declare function isImageAvailable(imageUrl: string): Promise<boolean>;
export declare function sendImageCore(params: SendImageCoreParams): Promise<SendImageCoreResult>;
