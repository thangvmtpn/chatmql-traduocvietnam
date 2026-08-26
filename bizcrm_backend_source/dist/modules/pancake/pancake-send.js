/**
 * pancake-send.ts — Send messages via Pancake API.
 *
 * Plugs into send-core.ts as the Pancake branch of sendChunk().
 * Handles text messages and media uploads.
 */
import { decryptToken } from '../../shared/crypto.js';
import { sendMessage as pancakeSendMessage, uploadContent } from './pancake-client.js';
import { logger } from '../../shared/logger.js';
/**
 * Send a text message via Pancake API.
 * Used by send-core.ts when platform is PANCAKE_*.
 */
export async function sendViaPancake(conv, text) {
    const { channelAccount } = conv;
    if (!channelAccount?.externalPageId || !channelAccount?.accessTokenEnc) {
        logger.debug('[pancake-send] No page ID or token — local message only');
        return { sent: false, error: 'Pancake page not configured' };
    }
    if (!conv.externalThreadId) {
        logger.debug('[pancake-send] No external thread ID — local message only');
        return { sent: false, error: 'No Pancake conversation linked' };
    }
    let pageToken;
    try {
        pageToken = decryptToken(channelAccount.accessTokenEnc);
    }
    catch (err) {
        logger.error({ err: err.message }, '[pancake-send] Failed to decrypt page token');
        return { sent: false, error: 'Token decryption failed' };
    }
    try {
        const result = await pancakeSendMessage(channelAccount.externalPageId, conv.externalThreadId, pageToken, { action: 'reply_inbox', message: text });
        if (result.success) {
            return {
                sent: true,
                externalMsgId: result.message?.id,
            };
        }
        return { sent: false, error: 'Pancake API returned unsuccessful' };
    }
    catch (err) {
        logger.error({ err: err.message }, '[pancake-send] Send failed');
        return { sent: false, error: err.message };
    }
}
/**
 * Send media (image/video/file) via Pancake API.
 * 1. Upload file URL to get content_id
 * 2. Send message with content_ids
 */
export async function sendMediaViaPancake(conv, fileUrl) {
    const { channelAccount } = conv;
    if (!channelAccount?.externalPageId || !channelAccount?.accessTokenEnc || !conv.externalThreadId) {
        return { sent: false, error: 'Pancake page not configured' };
    }
    let pageToken;
    try {
        pageToken = decryptToken(channelAccount.accessTokenEnc);
    }
    catch (err) {
        return { sent: false, error: 'Token decryption failed' };
    }
    try {
        // Step 1: Upload
        const uploadResult = await uploadContent(channelAccount.externalPageId, pageToken, fileUrl);
        // Step 2: Send with content_id
        const result = await pancakeSendMessage(channelAccount.externalPageId, conv.externalThreadId, pageToken, { action: 'reply_inbox', content_ids: [uploadResult.content_id] });
        if (result.success) {
            return { sent: true, externalMsgId: result.message?.id };
        }
        return { sent: false, error: 'Pancake API returned unsuccessful' };
    }
    catch (err) {
        logger.error({ err: err.message }, '[pancake-send] Media send failed');
        return { sent: false, error: err.message };
    }
}
//# sourceMappingURL=pancake-send.js.map