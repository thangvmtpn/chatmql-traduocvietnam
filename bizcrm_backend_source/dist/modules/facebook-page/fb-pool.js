// In-memory pool of FbClient instances keyed by ChannelAccount.id.
// Mirrors zalo-oa/oa-pool.ts, but Facebook page tokens are long-lived and have
// NO refresh grant — so instead of refreshing on expiry we mark the account
// `token_expired` and surface a reconnect prompt in the UI.
import { Platform } from '../../shared/constants.js';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { decryptToken } from '../../shared/crypto.js';
import { FbClient, FbApiError } from './fb-client.js';
const clientCache = new Map();
export async function getClient(accountId) {
    const cached = clientCache.get(accountId);
    if (cached)
        return cached;
    const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!account || account.platform !== Platform.FACEBOOK_PAGE || !account.accessTokenEnc) {
        throw new Error(`Facebook page account ${accountId} not configured`);
    }
    const token = decryptToken(account.accessTokenEnc);
    const client = new FbClient(token);
    clientCache.set(accountId, client);
    return client;
}
export function invalidateClient(accountId) {
    clientCache.delete(accountId);
}
/** Mark an account's token as expired so the UI can prompt a reconnect. */
export async function markTokenExpired(accountId) {
    clientCache.delete(accountId);
    await prisma.channelAccount
        .update({ where: { id: accountId }, data: { status: 'token_expired' } })
        .catch((err) => logger.error({ err }, `[fb-pool] failed to persist token_expired for ${accountId}`));
    logger.warn(`[fb-pool] Page account ${accountId} token expired — reconnect required`);
}
/** Graph error code 190 = OAuthException (token invalid/expired/revoked). */
export function isTokenExpiredError(err) {
    return err instanceof FbApiError && String(err.code) === '190';
}
// Facebook "message sent outside the 24-hour standard messaging window".
const CS_WINDOW_SUBCODE = 2018278;
export function isFbCsWindowError(errorSubcode) {
    return errorSubcode === CS_WINDOW_SUBCODE;
}
export async function sendTextViaFb(accountId, psid, text) {
    try {
        const client = await getClient(accountId);
        const { messageId } = await client.sendText(psid, text);
        return { sent: true, messageId };
    }
    catch (err) {
        if (isTokenExpiredError(err)) {
            await markTokenExpired(accountId);
        }
        const code = err instanceof FbApiError ? err.code : undefined;
        const subcode = err instanceof FbApiError ? err.subcode : undefined;
        logger.warn(`[fb-pool] sendText failed for ${accountId} -> ${psid}: ${err.message}`);
        return { sent: false, error: err.message, errorCode: code, errorSubcode: subcode };
    }
}
export async function sendAttachmentViaFb(accountId, psid, buffer, filename, mimeType, type) {
    try {
        const client = await getClient(accountId);
        const { messageId } = await client.sendAttachment(psid, buffer, filename, mimeType, type);
        return { sent: true, messageId };
    }
    catch (err) {
        if (isTokenExpiredError(err)) {
            await markTokenExpired(accountId);
        }
        const code = err instanceof FbApiError ? err.code : undefined;
        const subcode = err instanceof FbApiError ? err.subcode : undefined;
        logger.warn(`[fb-pool] sendAttachment failed for ${accountId} -> ${psid}: ${err.message}`);
        return { sent: false, error: err.message, errorCode: code, errorSubcode: subcode };
    }
}
//# sourceMappingURL=fb-pool.js.map