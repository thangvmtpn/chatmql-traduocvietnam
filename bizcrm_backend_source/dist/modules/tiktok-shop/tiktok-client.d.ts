/**
 * tiktok-client.ts — HTTP client for TikTok Shop Open Platform (TTS Open API v2).
 *
 * Implements:
 * - HMAC-SHA256 request signing per TikTok Shop Developer specifications.
 * - OAuth 2.0 token exchange (code -> access_token & refresh_token) and token refresh.
 * - Authorized shop listing to resolve shop_cipher / shop_id.
 * - Customer Service (CS) Messaging API: get conversations, get messages, send text & images.
 *
 * API Base: https://open-api.tiktokglobalshop.com
 * Auth Base: https://auth.tiktok-shops.com
 */
export declare const TIKTOK_API_BASE: string;
export declare const TIKTOK_AUTH_BASE: string;
export interface TikTokTokenResponse {
    code: number;
    message: string;
    data?: {
        access_token: string;
        access_token_expire_in: number;
        refresh_token: string;
        refresh_token_expire_in: number;
        open_id: string;
        seller_name: string;
        seller_base_region?: string;
        user_type?: number;
    };
}
export interface TikTokShopInfo {
    cipher: string;
    id: string;
    name: string;
    region: string;
    type: string;
}
export interface TikTokShopsResponse {
    code: number;
    message: string;
    data?: {
        shops: TikTokShopInfo[];
    };
}
export interface TikTokSendMessageResult {
    code: number;
    message: string;
    data?: {
        message_id: string;
        create_time: number;
    };
}
export interface TikTokUploadImageResult {
    code: number;
    message: string;
    data?: {
        image_id: string;
        image_url: string;
    };
}
/**
 * Generates the HMAC-SHA256 signature for TikTok Shop Open API v2.
 *
 * Algorithm:
 * 1. Extract path (e.g. /customer_service/202309/conversations/xyz/messages)
 * 2. Collect all query params except 'sign' and 'access_token'
 * 3. Sort keys alphabetically
 * 4. Concatenate: key1value1key2value2...
 * 5. String to sign = app_secret + path + sorted_params + (bodyStr if non-empty) + app_secret
 * 6. HMAC-SHA256(string_to_sign, app_secret).toString('hex')
 */
export declare function generateTikTokSignature(path: string, params: Record<string, string | number>, bodyStr: string, appSecret: string): string;
/**
 * Exchange authorization code for access_token and refresh_token.
 */
export declare function exchangeCodeForToken(authCode: string, appKey: string, appSecret: string): Promise<TikTokTokenResponse>;
/**
 * Refresh an expired access_token using refresh_token.
 */
export declare function refreshTikTokToken(refreshToken: string, appKey: string, appSecret: string): Promise<TikTokTokenResponse>;
/**
 * Fetch authorized shops under this token.
 */
export declare function getAuthorizedShops(accessToken: string, appKey: string, appSecret: string): Promise<TikTokShopInfo[]>;
/**
 * Send a text message to a customer conversation on TikTok Shop.
 */
export declare function sendTikTokTextMessage(shopCipher: string, conversationId: string, text: string, accessToken: string, appKey: string, appSecret: string): Promise<TikTokSendMessageResult>;
/**
 * Upload an image to TikTok Shop Customer Service for messaging.
 */
export declare function uploadTikTokImage(shopCipher: string, imageBuffer: Buffer, fileName: string, accessToken: string, appKey: string, appSecret: string): Promise<TikTokUploadImageResult>;
/**
 * Send an image message to a customer conversation on TikTok Shop.
 */
export declare function sendTikTokImageMessage(shopCipher: string, conversationId: string, imageId: string, accessToken: string, appKey: string, appSecret: string): Promise<TikTokSendMessageResult>;
