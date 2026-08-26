/**
 * pancake-send.ts — Send messages via Pancake API.
 *
 * Plugs into send-core.ts as the Pancake branch of sendChunk().
 * Handles text messages and media uploads.
 */
interface ConvData {
    id: string;
    channelAccountId: string;
    externalThreadId: string | null;
    channelAccount: {
        externalPageId: string | null;
        accessTokenEnc: string | null;
    } | null;
}
/**
 * Send a text message via Pancake API.
 * Used by send-core.ts when platform is PANCAKE_*.
 */
export declare function sendViaPancake(conv: ConvData, text: string): Promise<{
    sent: boolean;
    error?: string;
    externalMsgId?: string;
}>;
/**
 * Send media (image/video/file) via Pancake API.
 * 1. Upload file URL to get content_id
 * 2. Send message with content_ids
 */
export declare function sendMediaViaPancake(conv: ConvData, fileUrl: string): Promise<{
    sent: boolean;
    error?: string;
    externalMsgId?: string;
}>;
export {};
