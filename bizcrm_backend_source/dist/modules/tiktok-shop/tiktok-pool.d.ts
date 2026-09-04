/**
 * tiktok-pool.ts — Manages TikTok Shop credentials, token decryption & message dispatch.
 */
/**
 * Get a valid access token for the channel account, refreshing if expired.
 */
export declare function getValidTikTokToken(channelAccountId: string): Promise<{
    accessToken: string;
    shopCipher: string;
} | null>;
/**
 * Send text message to customer via TikTok Shop API.
 */
export declare function sendTextViaTikTok(channelAccountId: string, externalThreadId: string | null, text: string): Promise<{
    sent: boolean;
    error?: string;
    messageId?: string;
    csWindowExpired?: boolean;
}>;
/**
 * Upload and send image message to customer via TikTok Shop API.
 */
export declare function sendImageViaTikTok(channelAccountId: string, externalThreadId: string | null, imageBuffer: Buffer, fileName: string): Promise<{
    sent: boolean;
    error?: string;
    messageId?: string;
}>;
