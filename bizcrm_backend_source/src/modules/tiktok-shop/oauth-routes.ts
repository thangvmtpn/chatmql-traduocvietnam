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

function getAppCreds() {
  const appKey = process.env.TIKTOK_APP_KEY
  const appSecret = process.env.TIKTOK_APP_SECRET
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || 'https://chatmql.traduocvietnam.com/api/v1/tiktok-shop/callback'
  if (!appKey || !appSecret) {
    throw new Error('TIKTOK_APP_KEY and TIKTOK_APP_SECRET must be configured')
  }
  return { appKey, appSecret, redirectUri }
}

function frontendBase(): string {
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

export async function tiktokOAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/tiktok-shop/connect/start
   * Protected route. Returns the TikTok Shop OAuth dialog URL.
   */
  app.get(
    '/api/v1/tiktok-shop/connect/start',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = (request as any).user
      const { appKey, redirectUri } = getAppCreds()

      const state = randomBytes(24).toString('hex')
      const statePayload = JSON.stringify({
        orgId: user.orgId,
        userId: user.id,
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
  )

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
      return reply.redirect(`${frontendBase()}/settings/integrations?error=${encodeURIComponent(error_description || error)}`)
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

    let stateData: { orgId: string; userId: string }
    try {
      stateData = JSON.parse(rawState)
    } catch {
      return reply.status(400).send({ error: 'Corrupted state' })
    }

    const { appKey, appSecret } = getAppCreds()

    try {
      // 1. Exchange auth_code for tokens
      const tokenRes = await exchangeCodeForToken(effectiveCode, appKey, appSecret)
      if (tokenRes.code !== 0 || !tokenRes.data) {
        logger.error({ tokenRes }, '[tiktok-oauth] Token exchange failed')
        return reply.redirect(`${frontendBase()}/settings/integrations?error=token_exchange_failed`)
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
      const shops = await getAuthorizedShops(access_token, appKey, appSecret)
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
      return reply.redirect(`${frontendBase()}/settings/integrations?status=tiktok_connected`)
    } catch (err: any) {
      logger.error({ err: err.message }, '[tiktok-oauth] Callback processing error')
      return reply.redirect(`${frontendBase()}/settings/integrations?error=connection_failed`)
    }
  })
}
