/**
 * tiktok-pool.ts — Manages TikTok Shop credentials, token decryption & message dispatch.
 */

import { prisma } from '../../shared/prisma-client.js'
import { decryptToken, encryptToken } from '../../shared/crypto.js'
import { logger } from '../../shared/logger.js'
import {
  sendTikTokTextMessage,
  sendTikTokImageMessage,
  uploadTikTokImage,
  refreshTikTokToken,
} from './tiktok-client.js'

function getAppCreds() {
  const appKey = process.env.TIKTOK_APP_KEY
  const appSecret = process.env.TIKTOK_APP_SECRET
  if (!appKey || !appSecret) {
    throw new Error('TIKTOK_APP_KEY and TIKTOK_APP_SECRET must be configured')
  }
  return { appKey, appSecret }
}

/**
 * Get a valid access token for the channel account, refreshing if expired.
 */
export async function getValidTikTokToken(channelAccountId: string): Promise<{
  accessToken: string
  shopCipher: string
} | null> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: {
      id: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      tokenExpiresAt: true,
      externalPageId: true, // stores shop_cipher or shop_id
      deletedAt: true,
      isDisabled: true,
    },
  })

  if (!account || account.deletedAt || account.isDisabled || !account.accessTokenEnc) {
    return null
  }

  const { appKey, appSecret } = getAppCreds()
  let accessToken: string
  try {
    accessToken = decryptToken(account.accessTokenEnc)
  } catch (err: any) {
    logger.error({ err: err.message, channelAccountId }, '[tiktok-pool] Failed to decrypt access token')
    return null
  }

  // If token is about to expire in less than 5 minutes and we have a refresh token
  const now = new Date()
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null
  const isExpiredOrNear = expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000

  if (isExpiredOrNear && account.refreshTokenEnc) {
    try {
      const refreshToken = decryptToken(account.refreshTokenEnc)
      const refreshRes = await refreshTikTokToken(refreshToken, appKey, appSecret)

      if (refreshRes.code === 0 && refreshRes.data?.access_token) {
        accessToken = refreshRes.data.access_token
        const newExpiresAt = new Date(Date.now() + refreshRes.data.access_token_expire_in * 1000)

        await prisma.channelAccount.update({
          where: { id: channelAccountId },
          data: {
            accessTokenEnc: encryptToken(accessToken),
            refreshTokenEnc: refreshRes.data.refresh_token
              ? encryptToken(refreshRes.data.refresh_token)
              : undefined,
            tokenExpiresAt: newExpiresAt,
          },
        })
        logger.info({ channelAccountId }, '[tiktok-pool] Refreshed TikTok Shop access token')
      }
    } catch (err: any) {
      logger.warn({ err: err.message, channelAccountId }, '[tiktok-pool] Token refresh failed, using existing')
    }
  }

  return {
    accessToken,
    shopCipher: account.externalPageId || '',
  }
}

/**
 * Send text message to customer via TikTok Shop API.
 */
export async function sendTextViaTikTok(
  channelAccountId: string,
  externalThreadId: string | null,
  text: string,
): Promise<{
  sent: boolean
  error?: string
  messageId?: string
  csWindowExpired?: boolean
}> {
  if (!externalThreadId) {
    return { sent: false, error: 'No TikTok conversation ID linked' }
  }

  const session = await getValidTikTokToken(channelAccountId)
  if (!session) {
    return { sent: false, error: 'Tài khoản TikTok Shop chưa kết nối hoặc token không hợp lệ' }
  }

  const { appKey, appSecret } = getAppCreds()

  try {
    const result = await sendTikTokTextMessage(
      session.shopCipher,
      externalThreadId,
      text,
      session.accessToken,
      appKey,
      appSecret,
    )

    if (result.code === 0) {
      return {
        sent: true,
        messageId: result.data?.message_id,
      }
    }

    // Check if error is related to CS Window (e.g. 48h / 24h passed without customer reply)
    const isWindowExpired = result.code === 36000001 || result.message?.toLowerCase().includes('window')

    return {
      sent: false,
      error: result.message || 'TikTok API returned error',
      csWindowExpired: isWindowExpired,
    }
  } catch (err: any) {
    logger.error({ err: err.message, channelAccountId }, '[tiktok-pool] sendTextViaTikTok failed')
    return { sent: false, error: err.message }
  }
}

/**
 * Upload and send image message to customer via TikTok Shop API.
 */
export async function sendImageViaTikTok(
  channelAccountId: string,
  externalThreadId: string | null,
  imageBuffer: Buffer,
  fileName: string,
): Promise<{
  sent: boolean
  error?: string
  messageId?: string
}> {
  if (!externalThreadId) {
    return { sent: false, error: 'No TikTok conversation ID linked' }
  }

  const session = await getValidTikTokToken(channelAccountId)
  if (!session) {
    return { sent: false, error: 'Tài khoản TikTok Shop chưa kết nối hoặc token không hợp lệ' }
  }

  const { appKey, appSecret } = getAppCreds()

  try {
    // 1. Upload image to TikTok Customer Service
    const uploadRes = await uploadTikTokImage(
      session.shopCipher,
      imageBuffer,
      fileName,
      session.accessToken,
      appKey,
      appSecret,
    )

    if (uploadRes.code !== 0 || !uploadRes.data?.image_id) {
      return { sent: false, error: uploadRes.message || 'Image upload to TikTok failed' }
    }

    // 2. Send image message
    const sendRes = await sendTikTokImageMessage(
      session.shopCipher,
      externalThreadId,
      uploadRes.data.image_id,
      session.accessToken,
      appKey,
      appSecret,
    )

    if (sendRes.code === 0) {
      return {
        sent: true,
        messageId: sendRes.data?.message_id,
      }
    }

    return { sent: false, error: sendRes.message || 'Send image to TikTok failed' }
  } catch (err: any) {
    logger.error({ err: err.message, channelAccountId }, '[tiktok-pool] sendImageViaTikTok failed')
    return { sent: false, error: err.message }
  }
}
