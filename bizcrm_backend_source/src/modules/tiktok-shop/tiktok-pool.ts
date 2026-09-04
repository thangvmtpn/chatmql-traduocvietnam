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

async function getAppCreds(orgId?: string) {
  let appKey = process.env.TIKTOK_APP_KEY || ''
  let appSecret = process.env.TIKTOK_APP_SECRET || ''

  if (orgId && (!appKey || !appSecret)) {
    try {
      const settings = await prisma.appSetting.findMany({
        where: {
          orgId,
          settingKey: { in: ['tiktok.app_key', 'tiktok.app_secret'] },
        },
      })
      for (const s of settings) {
        if (s.settingKey === 'tiktok.app_key' && !appKey && s.valuePlain) {
          appKey = s.valuePlain.trim()
        }
        if (s.settingKey === 'tiktok.app_secret' && !appSecret && s.valuePlain) {
          appSecret = s.valuePlain.trim()
        }
      }
    } catch (e) {
      // ignore
    }
  }

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
  orgId: string
} | null> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: channelAccountId },
    select: {
      id: true,
      orgId: true,
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

  const { appKey, appSecret } = await getAppCreds(account.orgId)
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

  let shopCipher = account.externalPageId || ''
  if (!shopCipher.startsWith('ROW_')) {
    shopCipher = 'ROW_7HVMRAAAAADotvtz3BkVjsy4ySrop4UN'
  }
  return {
    accessToken,
    shopCipher,
    orgId: account.orgId,
  }
}

/**
 * Dispatch an outbound text message to TikTok Shop chat.
 */
export async function sendTikTokText(
  channelAccountId: string,
  externalThreadId: string,
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

  const { appKey, appSecret } = await getAppCreds(session.orgId)

  try {
    const result = await sendTikTokTextMessage(
      session.shopCipher,
      externalThreadId,
      text,
      session.accessToken,
      appKey,
      appSecret,
    )

    if (result.code !== 0) {
      logger.error({ result, externalThreadId }, '[tiktok-pool] Send text message failed')
      return { sent: false, error: result.message || 'TikTok API error' }
    }

    return {
      sent: true,
      messageId: result.data?.message_id,
    }
  } catch (err: any) {
    logger.error({ err: err.message, externalThreadId }, '[tiktok-pool] Send text exception')
    return { sent: false, error: err.message }
  }
}

/**
 * Dispatch an outbound image message to TikTok Shop chat.
 */
export async function sendTikTokImage(
  channelAccountId: string,
  externalThreadId: string,
  imageBuffer: Buffer,
  fileName: string = 'image.jpg',
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

  const { appKey, appSecret } = await getAppCreds(session.orgId)

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

export const sendTextViaTikTok = sendTikTokText
export const sendImageViaTikTok = sendTikTokImage

