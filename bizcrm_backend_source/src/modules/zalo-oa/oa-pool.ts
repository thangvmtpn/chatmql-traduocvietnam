import { Platform } from '../../shared/constants.js'
// In-memory pool of OaClient instances keyed by ZaloAccount.id.
// Handles token refresh with a per-account mutex so concurrent ZNS sends or
// inbound webhook handlers cannot trigger duplicate refresh roundtrips.

import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { encryptToken, decryptToken } from '../../shared/crypto.js';
import {
  OaClient,
  OaApiError,
  refreshAccessToken,
  type ZnsSendPayload,
  type OaTextQuote,
} from './oa-client.js';

const REFRESH_MARGIN_MS = 5 * 60_000; // refresh if expiring in <5 min

const clientCache = new Map<string, OaClient>();
const refreshLocks = new Map<string, Promise<void>>();

function appCreds(): { appId: string; appSecret: string } {
  const appId = process.env.ZALO_OA_APP_ID;
  const appSecret = process.env.ZALO_OA_APP_SECRET;
  if (!appId || !appSecret) throw new Error('ZALO_OA_APP_ID/APP_SECRET not set');
  return { appId, appSecret };
}

export async function getClient(accountId: string): Promise<OaClient> {
  await refreshIfNeeded(accountId);
  const cached = clientCache.get(accountId);
  if (cached) return cached;
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.platform !== Platform.ZALO_OA || !account.accessTokenEnc) {
    throw new Error(`OA account ${accountId} not configured`);
  }
  const access = decryptToken(account.accessTokenEnc);
  const client = new OaClient(access);
  clientCache.set(accountId, client);
  return client;
}

export async function refreshIfNeeded(accountId: string): Promise<void> {
  const existing = refreshLocks.get(accountId);
  if (existing) return existing;
  const promise = doRefreshCheck(accountId).finally(() => {
    refreshLocks.delete(accountId);
  });
  refreshLocks.set(accountId, promise);
  return promise;
}

async function doRefreshCheck(accountId: string): Promise<void> {
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.platform !== Platform.ZALO_OA) return;
  if (!account.tokenExpiresAt || !account.refreshTokenEnc) return;
  const msRemaining = account.tokenExpiresAt.getTime() - Date.now();
  if (msRemaining > REFRESH_MARGIN_MS) return;
  logger.info(`[oa-pool] Refreshing token for OA account ${accountId} (${Math.round(msRemaining / 1000)}s left)`);
  const refreshToken = decryptToken(account.refreshTokenEnc);
  const { appId, appSecret } = appCreds();
  const pair = await refreshAccessToken({ refreshToken, appId, appSecret });
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEnc: encryptToken(pair.accessToken),
      refreshTokenEnc: encryptToken(pair.refreshToken),
      tokenExpiresAt: new Date(Date.now() + pair.expiresIn * 1000),
    },
  });
  clientCache.delete(accountId);
}

export function invalidateClient(accountId: string): void {
  clientCache.delete(accountId);
}

/** Force token refresh regardless of tokenExpiresAt, then clear the cached client. */
export async function forceRefresh(accountId: string): Promise<void> {
  const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.platform !== Platform.ZALO_OA) return;
  if (!account.refreshTokenEnc) {
    logger.warn(`[oa-pool] Cannot force-refresh ${accountId}: no refresh token`);
    return;
  }
  logger.info(`[oa-pool] Force-refreshing token for OA account ${accountId}`);
  const refreshToken = decryptToken(account.refreshTokenEnc);
  const { appId, appSecret } = appCreds();
  const pair = await refreshAccessToken({ refreshToken, appId, appSecret });
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEnc: encryptToken(pair.accessToken),
      refreshTokenEnc: encryptToken(pair.refreshToken),
      tokenExpiresAt: new Date(Date.now() + pair.expiresIn * 1000),
    },
  });
  clientCache.delete(accountId);
}

/** Zalo error codes that indicate expired/invalid access token. */
const TOKEN_EXPIRED_CODES = new Set<string>(['-216', '-230', '-32']);

function isTokenExpiredError(err: unknown): boolean {
  if (err instanceof OaApiError) {
    return TOKEN_EXPIRED_CODES.has(String(err.code));
  }
  return false;
}

/**
 * Run fn, and if it fails with a token-expired error, force-refresh
 * the token and retry exactly once.
 */
async function withAutoRetry<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isTokenExpiredError(err)) {
      logger.info(`[oa-pool] Token expired for ${accountId}, force-refreshing and retrying...`);
      await forceRefresh(accountId);
      return await fn();
    }
    throw err;
  }
}

// ─── Send dispatchers (mirror personal zalo-pool signatures) ───

export async function sendTextViaOa(
  accountId: string,
  uid: string,
  text: string,
  quote?: OaTextQuote,
): Promise<{ sent: boolean; messageId?: string; error?: string; errorCode?: string | number }> {
  try {
    return await withAutoRetry(accountId, async () => {
      const client = await getClient(accountId);
      const { messageId } = await client.sendText(uid, text, quote);
      return { sent: true, messageId };
    });
  } catch (err: any) {
    const code = err instanceof OaApiError ? err.code : undefined;
    logger.warn(`[oa-pool] sendText failed for ${accountId} -> ${uid}: ${err.message}`);
    return { sent: false, error: err.message, errorCode: code };
  }
}

export async function sendImageViaOa(
  accountId: string,
  uid: string,
  attachmentId: string,
  text?: string,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  try {
    return await withAutoRetry(accountId, async () => {
      const client = await getClient(accountId);
      const { messageId } = await client.sendImage(uid, attachmentId, text);
      return { sent: true, messageId };
    });
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendFileViaOa(
  accountId: string,
  uid: string,
  fileToken: string,
): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  try {
    return await withAutoRetry(accountId, async () => {
      const client = await getClient(accountId);
      const { messageId } = await client.sendFile(uid, fileToken);
      return { sent: true, messageId };
    });
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendZnsViaOa(
  accountId: string,
  payload: ZnsSendPayload,
): Promise<{ sent: boolean; msgId?: string; sentTime?: number; error?: string; errorCode?: string | number }> {
  try {
    return await withAutoRetry(accountId, async () => {
      const client = await getClient(accountId);
      const out = await client.sendZns(payload);
      return { sent: true, msgId: out.msgId, sentTime: out.sentTime };
    });
  } catch (err: any) {
    const code = err instanceof OaApiError ? err.code : undefined;
    logger.warn(`[oa-pool] sendZns failed for ${accountId}: ${err.message}`);
    return { sent: false, error: err.message, errorCode: code };
  }
}

// CS-window error codes from Zalo OA API. When we see one of these on a
// free-form send, surface a typed error so chat-message-routes can map to
// HTTP 422 with code=CS_WINDOW_EXPIRED for the UI.
const CS_WINDOW_ERROR_CODES = new Set<string>(['-32', '124', '216']);

export function isCsWindowError(errorCode: string | number | undefined): boolean {
  if (errorCode === undefined) return false;
  return CS_WINDOW_ERROR_CODES.has(String(errorCode));
}
