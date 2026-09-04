/**
 * tiktok-pool.ts — Manages TikTok Shop credentials, token decryption & message dispatch.
 */
/**
 * Get a valid access token for the channel account, refreshing if expired.
 */
export declare function getValidTikTokToken(channelAccountId: string): Promise<{
    accessToken: string;
    shopCipher: string;
    orgId: string;
} | null>;
/**
 * Dispatch an outbound text message to TikTok Shop chat.
 */
export declare function sendTikTokText(channelAccountId: string, externalThreadId: string, text: string): Promise<{
    sent: boolean;
    error?: string;
    messageId?: string;
    csWindowExpired?: boolean;
}>;
/**
 * Dispatch an outbound image message to TikTok Shop chat.
 */
export declare function sendTikTokImage(channelAccountId: string, externalThreadId: string, imageBuffer: Buffer, fileName?: string): Promise<{
    sent: boolean;
    error?: string;
    messageId?: string;
}>;
export declare const sendTextViaTikTok: typeof sendTikTokText;
export declare const sendImageViaTikTok: typeof sendTikTokImage;
