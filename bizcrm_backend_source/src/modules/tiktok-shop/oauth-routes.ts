/**
 * oauth-routes.ts — OAuth 2.0 authorization flow for TikTok Shop Open Platform.
 *
 * Routes:
 * - GET /api/v1/tiktok-shop/connect/start : Authed, returns TikTok authorization URL.
 * - GET /api/v1/tiktok-shop/callback      : Public callback, validates state, exchanges code,
 *                                          upserts ChannelAccount(s), redirects to CRM.
 */

import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { Platform } from '../../shared/constants.js'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { redisConnection } from '../../shared/queue.js'
import { encryptToken } from '../../shared/crypto.js'
import { logger } from '../../shared/logger.js'
import {
  exchangeCodeForToken,
  getAuthorizedShops,
  TIKTOK_AUTH_BASE,
} from './tiktok-client.js'

const STATE_TTL_SEC = 600 // 10 minutes

async function getEffectiveAppCreds(orgId?: string, explicitCreds?: { appKey?: string; appSecret?: string }) {
  let appKey = explicitCreds?.appKey?.trim() || ''
  let appSecret = explicitCreds?.appSecret?.trim() || ''

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
    } catch (e: any) {
      logger.warn({ err: e.message }, '[tiktok-oauth] Could not query app_settings')
    }
  }

  if (!appKey) appKey = process.env.TIKTOK_APP_KEY || ''
  if (!appSecret) appSecret = process.env.TIKTOK_APP_SECRET || ''

  const redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://chatmql.traduocvietnam.com/api/v1/tiktok-shop/callback'
  return { appKey, appSecret, redirectUri }
}

function frontendBase(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

export async function tiktokOAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/tiktok-shop/config
   * Returns current TikTok Shop configuration (masked secret).
   */
  app.get(
    '/api/v1/tiktok-shop/config',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user
      const creds = await getEffectiveAppCreds(user?.orgId)

      const redirectUri = creds.redirectUri
      const webhookUrl = redirectUri.replace(/\/callback$/, '/webhook')

      let maskedSecret = ''
      if (creds.appSecret) {
        const s = creds.appSecret
        maskedSecret = s.length > 8 ? `${s.slice(0, 4)}••••••••${s.slice(-4)}` : '••••••••'
      }

      return reply.send({
        appKey: creds.appKey || '',
        appSecretMasked: maskedSecret,
        hasAppSecret: Boolean(creds.appSecret),
        redirectUri,
        webhookUrl,
        isConfigured: Boolean(creds.appKey && creds.appSecret),
      })
    },
  )

  /**
   * POST /api/v1/tiktok-shop/config
   * Saves TikTok Shop credentials per-org.
   */
  app.post<{
    Body: { appKey?: string; appSecret?: string }
  }>(
    '/api/v1/tiktok-shop/config',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user
      const body = request.body || {}
      const appKey = body.appKey?.trim()
      const appSecret = body.appSecret?.trim()

      if (!appKey) {
        return reply.status(400).send({ error: 'App Key là bắt buộc' })
      }

      await prisma.appSetting.upsert({
        where: {
          orgId_settingKey: {
            orgId: user.orgId,
            settingKey: 'tiktok.app_key',
          },
        },
        create: {
          orgId: user.orgId,
          settingKey: 'tiktok.app_key',
          valuePlain: appKey,
        },
        update: {
          valuePlain: appKey,
        },
      })
      process.env.TIKTOK_APP_KEY = appKey

      if (appSecret && !appSecret.includes('••••')) {
        await prisma.appSetting.upsert({
          where: {
            orgId_settingKey: {
              orgId: user.orgId,
              settingKey: 'tiktok.app_secret',
            },
          },
          create: {
            orgId: user.orgId,
            settingKey: 'tiktok.app_secret',
            valuePlain: appSecret,
          },
          update: {
            valuePlain: appSecret,
          },
        })
        process.env.TIKTOK_APP_SECRET = appSecret
      }

      return reply.send({ success: true, message: 'Đã lưu cấu hình TikTok Shop thành công' })
    },
  )

  /**
   * GET / POST /api/v1/tiktok-shop/connect/start
   * Returns the TikTok Shop OAuth dialog URL.
   * If appKey and appSecret are provided in POST body, saves them first.
   */
  app.route({
    method: ['GET', 'POST'],
    url: '/api/v1/tiktok-shop/connect/start',
    preHandler: authMiddleware,
    handler: async (request, reply) => {
      const user = (request as any).user
      const body = (request.body as any) || {}

      if (body.appKey && body.appKey.trim()) {
        const k = body.appKey.trim()
        await prisma.appSetting.upsert({
          where: {
            orgId_settingKey: {
              orgId: user.orgId,
              settingKey: 'tiktok.app_key',
            },
          },
          create: {
            orgId: user.orgId,
            settingKey: 'tiktok.app_key',
            valuePlain: k,
          },
          update: {
            valuePlain: k,
          },
        })
        process.env.TIKTOK_APP_KEY = k
      }

      if (body.appSecret && body.appSecret.trim() && !body.appSecret.includes('••••')) {
        const s = body.appSecret.trim()
        await prisma.appSetting.upsert({
          where: {
            orgId_settingKey: {
              orgId: user.orgId,
              settingKey: 'tiktok.app_secret',
            },
          },
          create: {
            orgId: user.orgId,
            settingKey: 'tiktok.app_secret',
            valuePlain: s,
          },
          update: {
            valuePlain: s,
          },
        })
        process.env.TIKTOK_APP_SECRET = s
      }

      const { appKey, appSecret, redirectUri } = await getEffectiveAppCreds(user.orgId)

      if (!appKey || !appSecret) {
        return reply.status(400).send({
          error: 'Vui lòng nhập App Key và App Secret của TikTok Shop trước khi kết nối',
          missingConfig: true,
        })
      }

      const state = randomBytes(24).toString('hex')
      const statePayload = JSON.stringify({
        orgId: user.orgId,
        userId: user.id,
        appKey,
        appSecret,
        timestamp: Date.now(),
      })

      await redisConnection.set(`tiktok_oauth_state:${state}`, statePayload, 'EX', STATE_TTL_SEC)

      const authUrl = new URL(`${TIKTOK_AUTH_BASE}/oauth/authorize`)
      authUrl.searchParams.set('app_key', appKey)
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('redirect_uri', redirectUri)

      return reply.send({
        authUrl: authUrl.toString(),
        state,
      })
    },
  })

  /**
   * GET /api/v1/tiktok-shop/callback
   * Public callback. Handles code exchange and connects shop.
   */
  app.get<{
    Querystring: {
      code?: string
      auth_code?: string
      state?: string
      error?: string
      error_description?: string
    }
  }>('/api/v1/tiktok-shop/callback', async (request, reply) => {
    const { code, auth_code, state, error, error_description } = request.query
    const effectiveCode = auth_code || code

    if (error) {
      logger.warn({ error, error_description }, '[tiktok-oauth] User denied or TikTok returned error')
      return reply.redirect(`${frontendBase()}/settings/integrations/accounts?tiktok_error=${encodeURIComponent(error_description || error)}`)
    }

    if (!effectiveCode || !state) {
      return reply.status(400).send({ error: 'Missing code or state' })
    }

    const stateKey = `tiktok_oauth_state:${state}`
    const rawState = await redisConnection.get(stateKey)
    if (!rawState) {
      return reply.status(400).send({ error: 'Invalid or expired state' })
    }
    await redisConnection.del(stateKey)

    let stateData: { orgId: string; userId: string; appKey?: string; appSecret?: string }
    try {
      stateData = JSON.parse(rawState)
    } catch {
      return reply.status(400).send({ error: 'Corrupted state' })
    }

    let effectiveAppKey = stateData.appKey
    let effectiveAppSecret = stateData.appSecret
    if (!effectiveAppKey || !effectiveAppSecret) {
      const creds = await getEffectiveAppCreds(stateData.orgId)
      effectiveAppKey = creds.appKey
      effectiveAppSecret = creds.appSecret
    }

    try {
      // 1. Exchange auth_code for tokens
      const tokenRes = await exchangeCodeForToken(effectiveCode, effectiveAppKey, effectiveAppSecret)
      if (tokenRes.code !== 0 || !tokenRes.data) {
        logger.error({ tokenRes }, '[tiktok-oauth] Token exchange failed')
        return reply.redirect(`${frontendBase()}/settings/integrations/accounts?tiktok_error=token_exchange_failed`)
      }

      const {
        access_token,
        refresh_token,
        access_token_expire_in,
        open_id,
        seller_name,
      } = tokenRes.data

      const tokenExpiresAt = new Date(Date.now() + (access_token_expire_in || 604800) * 1000)

      // 2. Fetch authorized shops
      const shops = await getAuthorizedShops(access_token, effectiveAppKey, effectiveAppSecret)
      logger.info({ shopCount: shops.length, seller_name }, '[tiktok-oauth] Retrieved authorized shops')

      const encAccessToken = encryptToken(access_token)
      const encRefreshToken = encryptToken(refresh_token)

      if (shops.length === 0) {
        // Fallback: connect seller account directly if no sub-shops listed
        await prisma.channelAccount.upsert({
          where: {
            orgId_externalPageId: {
              orgId: stateData.orgId,
              externalPageId: open_id,
            },
          },
          create: {
            orgId: stateData.orgId,
            ownerUserId: stateData.userId,
            platform: Platform.TIKTOK_SHOP,
            externalUid: open_id,
            externalPageId: open_id,
            displayName: seller_name || 'TikTok Shop',
            status: 'connected',
            accessTokenEnc: encAccessToken,
            refreshTokenEnc: encRefreshToken,
            tokenExpiresAt,
            lastConnectedAt: new Date(),
          },
          update: {
            status: 'connected',
            accessTokenEnc: encAccessToken,
            refreshTokenEnc: encRefreshToken,
            tokenExpiresAt,
            lastConnectedAt: new Date(),
            isDisabled: false,
            deletedAt: null,
          },
        })
      } else {
        // Connect each authorized shop
        for (const shop of shops) {
          const shopIdentifier = shop.cipher || shop.id
          await prisma.channelAccount.upsert({
            where: {
              orgId_externalPageId: {
                orgId: stateData.orgId,
                externalPageId: shopIdentifier,
              },
            },
            create: {
              orgId: stateData.orgId,
              ownerUserId: stateData.userId,
              platform: Platform.TIKTOK_SHOP,
              externalUid: shop.id || open_id,
              externalPageId: shopIdentifier,
              displayName: shop.name || seller_name || `TikTok Shop ${shop.id}`,
              status: 'connected',
              accessTokenEnc: encAccessToken,
              refreshTokenEnc: encRefreshToken,
              tokenExpiresAt,
              lastConnectedAt: new Date(),
            },
            update: {
              status: 'connected',
              accessTokenEnc: encAccessToken,
              refreshTokenEnc: encRefreshToken,
              tokenExpiresAt,
              lastConnectedAt: new Date(),
              isDisabled: false,
              deletedAt: null,
            },
          })
        }
      }

      logger.info({ orgId: stateData.orgId, seller: seller_name }, '[tiktok-oauth] TikTok Shop connected successfully')
      const targetShop = encodeURIComponent(seller_name || 'TikTok Shop')
      return reply.redirect(`${frontendBase()}/settings/integrations/accounts?tiktok_connected=1&shop=${targetShop}`)
    } catch (err: any) {
      logger.error({ err: err.message }, '[tiktok-oauth] Callback processing error')
      return reply.redirect(`${frontendBase()}/settings/integrations/accounts?tiktok_error=${encodeURIComponent(err.message || 'connection_failed')}`)
    }
  })
}
