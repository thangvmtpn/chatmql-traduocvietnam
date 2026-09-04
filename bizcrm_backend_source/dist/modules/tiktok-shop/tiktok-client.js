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
import { createHmac } from 'node:crypto';
import { logger } from '../../shared/logger.js';
export const TIKTOK_API_BASE = process.env.TIKTOK_API_BASE || 'https://open-api.tiktokglobalshop.com';
export const TIKTOK_AUTH_BASE = process.env.TIKTOK_AUTH_BASE || 'https://auth.tiktok-shops.com';
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
export function generateTikTokSignature(path, params, bodyStr, appSecret) {
    // Sort query params alphabetically by key, exclude 'sign' and 'access_token'
    const keys = Object.keys(params)
        .filter(k => k !== 'sign' && k !== 'access_token')
        .sort();
    let paramString = '';
    for (const k of keys) {
        paramString += `${k}${params[k]}`;
    }
    const stringToSign = `${appSecret}${path}${paramString}${bodyStr || ''}${appSecret}`;
    return createHmac('sha256', appSecret).update(stringToSign).digest('hex');
}
/**
 * Exchange authorization code for access_token and refresh_token.
 */
export async function exchangeCodeForToken(authCode, appKey, appSecret) {
    const url = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/get`);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('app_secret', appSecret);
    url.searchParams.set('auth_code', authCode);
    url.searchParams.set('grant_type', 'authorized_code');
    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    const data = (await res.json());
    return data;
}
/**
 * Refresh an expired access_token using refresh_token.
 */
export async function refreshTikTokToken(refreshToken, appKey, appSecret) {
    const url = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('app_secret', appSecret);
    url.searchParams.set('refresh_token', refreshToken);
    url.searchParams.set('grant_type', 'refresh_token');
    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    const data = (await res.json());
    return data;
}
/**
 * Fetch authorized shops under this token.
 */
export async function getAuthorizedShops(accessToken, appKey, appSecret) {
    const path = '/authorization/202309/shops';
    const timestamp = Math.floor(Date.now() / 1000);
    const queryParams = {
        app_key: appKey,
        timestamp,
    };
    const sign = generateTikTokSignature(path, queryParams, '', appSecret);
    const url = new URL(`${TIKTOK_API_BASE}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
        url.searchParams.set(k, String(v));
    }
    url.searchParams.set('sign', sign);
    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'x-tts-access-token': accessToken,
            'Content-Type': 'application/json',
        },
    });
    const data = (await res.json());
    if (data.code !== 0) {
        logger.warn({ data }, '[tiktok-client] getAuthorizedShops returned non-zero code');
        return [];
    }
    return data.data?.shops || [];
}
/**
 * Send a text message to a customer conversation on TikTok Shop.
 */
export async function sendTikTokTextMessage(shopCipher, conversationId, text, accessToken, appKey, appSecret) {
    const path = `/customer_service/202309/conversations/${conversationId}/messages`;
    const timestamp = Math.floor(Date.now() / 1000);
    const queryParams = {
        app_key: appKey,
        shop_cipher: shopCipher,
        timestamp,
    };
    const bodyObj = {
        type: 'TEXT',
        content: JSON.stringify({ text }),
    };
    const bodyStr = JSON.stringify(bodyObj);
    const sign = generateTikTokSignature(path, queryParams, bodyStr, appSecret);
    const url = new URL(`${TIKTOK_API_BASE}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
        url.searchParams.set(k, String(v));
    }
    url.searchParams.set('sign', sign);
    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'x-tts-access-token': accessToken,
            'Content-Type': 'application/json',
        },
        body: bodyStr,
    });
    const data = (await res.json());
    if (data.code !== 0) {
        logger.error({ data, conversationId }, '[tiktok-client] sendTextMessage failed');
    }
    return data;
}
/**
 * Upload an image to TikTok Shop Customer Service for messaging.
 */
export async function uploadTikTokImage(shopCipher, imageBuffer, fileName, accessToken, appKey, appSecret) {
    const path = '/customer_service/202309/images/upload';
    const timestamp = Math.floor(Date.now() / 1000);
    const queryParams = {
        app_key: appKey,
        shop_cipher: shopCipher,
        timestamp,
    };
    // Multi-part form: bodyStr is empty in sign generation per TikTok multipart spec
    const sign = generateTikTokSignature(path, queryParams, '', appSecret);
    const url = new URL(`${TIKTOK_API_BASE}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
        url.searchParams.set(k, String(v));
    }
    url.searchParams.set('sign', sign);
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)]);
    formData.append('data', blob, fileName || 'image.jpg');
    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'x-tts-access-token': accessToken,
        },
        body: formData,
    });
    return (await res.json());
}
/**
 * Send an image message to a customer conversation on TikTok Shop.
 */
export async function sendTikTokImageMessage(shopCipher, conversationId, imageId, accessToken, appKey, appSecret) {
    const path = `/customer_service/202309/conversations/${conversationId}/messages`;
    const timestamp = Math.floor(Date.now() / 1000);
    const queryParams = {
        app_key: appKey,
        shop_cipher: shopCipher,
        timestamp,
    };
    const bodyObj = {
        type: 'IMAGE',
        content: JSON.stringify({ image_id: imageId }),
    };
    const bodyStr = JSON.stringify(bodyObj);
    const sign = generateTikTokSignature(path, queryParams, bodyStr, appSecret);
    const url = new URL(`${TIKTOK_API_BASE}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
        url.searchParams.set(k, String(v));
    }
    url.searchParams.set('sign', sign);
    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'x-tts-access-token': accessToken,
            'Content-Type': 'application/json',
        },
        body: bodyStr,
    });
    return (await res.json());
}
//# sourceMappingURL=tiktok-client.js.map