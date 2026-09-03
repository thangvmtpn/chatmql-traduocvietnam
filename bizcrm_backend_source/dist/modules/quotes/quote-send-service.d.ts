/** Base URL của frontend — link khách bấm vào. */
export declare function publicQuoteUrl(token: string): string;
export interface SendResult {
    channel: string;
    delivered: boolean;
    url: string;
    error?: string;
}
/**
 * Gửi link qua hội thoại gần nhất của contact.
 * `channel='link'` = chỉ trả URL, không gửi gì (sale tự copy).
 */
export declare function sendQuoteToContact(orgId: string, quoteId: string, channel: string, userId: string): Promise<SendResult>;
