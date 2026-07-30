/**
 * pancake-routes.ts — Settings + admin routes for Pancake integration.
 *
 * Endpoints:
 *   GET    /api/v1/pancake/pages         - List pages (from Pancake API)
 *   POST   /api/v1/pancake/connect       - Connect a page → ChannelAccount
 *   DELETE /api/v1/pancake/disconnect/:id - Disconnect page (soft-delete)
 *   POST   /api/v1/pancake/sync/:id      - Manual sync (conversations + customers)
 *   GET    /api/v1/pancake/status/:id    - Connection status + stats
 *   GET    /api/v1/pancake/config        - Get stored Pancake config
 *   POST   /api/v1/pancake/config        - Save Pancake user access token
 *   GET    /api/v1/pancake/connected     - List connected Pancake accounts
 *
 * All routes require JWT auth.
 * Uses AppSetting model (key: 'pancake_user_token') for org-level config.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../../shared/prisma-client.js'
import { encryptToken, decryptToken } from '../../shared/crypto.js'
import { listPages, type PancakePage } from './pancake-client.js'
import { isPancakePlatform, pancakePlatformToId, PlatformLabel } from '../../shared/constants.js'
import { syncPancakePage } from './pancake-sync.js'
import { authMiddleware } from '../auth/auth-middleware.js'
import { logger } from '../../shared/logger.js'

const SETTING_KEY = 'pancake_user_token'

// ─── Auth helper (same as other routes) ──────────────────────────────────────

function getAuth(request: FastifyRequest): { orgId: string; userId: string } {
  const user = (request as any).user
  if (!user?.orgId || !user?.id) throw { statusCode: 401, message: 'Unauthorized' }
  return { orgId: user.orgId, userId: user.id }
}

export async function pancakeRoutes(app: FastifyInstance): Promise<void> {
  // All pancake settings routes require JWT authentication
  app.addHook('preHandler', authMiddleware)


  // ── Get stored Pancake config ─────────────────────────────────────
  app.get('/api/v1/pancake/config', async (request) => {
    const { orgId } = getAuth(request)

    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
      select: { valuePlain: true },
    })

    return {
      hasToken: !!setting?.valuePlain,
      // Never return the actual token — security
    }
  })

  // ── Save Pancake user access token ────────────────────────────────
  app.post<{ Body: { userAccessToken: string } }>(
    '/api/v1/pancake/config',
    async (request, reply) => {
      const { orgId } = getAuth(request)
      const { userAccessToken } = request.body

      if (!userAccessToken) {
        return reply.status(400).send({ error: 'userAccessToken required' })
      }

      // Verify token works by listing pages
      try {
        const result = await listPages(userAccessToken)
        if (!result.success) {
          return reply.status(400).send({ error: 'Invalid Pancake token' })
        }
      } catch (err: any) {
        return reply.status(400).send({ error: `Token verification failed: ${err.message}` })
      }

      // Encrypt and store
      const encrypted = encryptToken(userAccessToken)

      await prisma.appSetting.upsert({
        where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
        update: { valuePlain: encrypted },
        create: { orgId, settingKey: SETTING_KEY, valuePlain: encrypted },
      })

      return { ok: true }
    },
  )

  // ── List pages from Pancake API ───────────────────────────────────
  app.get('/api/v1/pancake/pages', async (request, reply) => {
    const { orgId } = getAuth(request)

    // Get stored user token
    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
      select: { valuePlain: true },
    })

    if (!setting?.valuePlain) {
      return reply.status(400).send({ error: 'Pancake token not configured' })
    }

    let userToken: string
    try {
      userToken = decryptToken(setting.valuePlain)
    } catch {
      return reply.status(500).send({ error: 'Failed to decrypt stored token' })
    }

    // Fetch pages from Pancake
    const result = await listPages(userToken)
    const activated = result.categorized?.activated || []
    const activatedIds = result.categorized?.activated_page_ids || []

    // Get already connected pages in our system
    const connectedAccounts = await prisma.channelAccount.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, externalPageId: true, platform: true },
    })

    const connectedPageIds = new Set(
      connectedAccounts
        .filter(a => isPancakePlatform(a.platform))
        .map(a => a.externalPageId),
    )

    // Map pages with connection status
    const pages = activated.map((p: PancakePage) => ({
      id: p.id,
      name: p.name,
      platform: p.platform,
      platformLabel: PlatformLabel[pancakePlatformToId(p.platform)] || p.platform,
      shopId: p.shop_id,
      isActive: activatedIds.includes(p.id),
      isConnected: connectedPageIds.has(p.id),
      hasToken: !!p.settings?.page_access_token,
      activeUsers: (p.users || []).filter(u => u.status === 'active').length,
    }))

    return { pages }
  })

  // ── Connect a page ────────────────────────────────────────────────
  // The page_access_token is fetched server-side from Pancake API using
  // the stored user access token. Frontend only sends pageId + pageName.
  app.post<{ Body: { pageId: string; pageName: string; platform: string } }>(
    '/api/v1/pancake/connect',
    async (request, reply) => {
      const { orgId, userId } = getAuth(request)
      const { pageId, pageName, platform } = request.body

      if (!pageId) {
        return reply.status(400).send({ error: 'pageId required' })
      }

      // Check if already connected
      const existing = await prisma.channelAccount.findFirst({
        where: { orgId, externalPageId: pageId, deletedAt: null },
      })
      if (existing) {
        // Same guard direction as facebook-page/oauth-routes: one page = one
        // ChannelAccount per org, so a page already connected (possibly via the
        // native Facebook channel) can't also be attached through Pancake.
        return reply.status(409).send({
          error: 'Trang này đã được kết nối (có thể qua kênh Facebook trực tiếp). Ngắt kết nối hiện có trước khi kết nối lại.',
          channelAccountId: existing.id,
        })
      }

      // Fetch page_access_token from Pancake API using stored user token
      const setting = await prisma.appSetting.findUnique({
        where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
        select: { valuePlain: true },
      })

      if (!setting?.valuePlain) {
        return reply.status(400).send({ error: 'Pancake user token not configured' })
      }

      let userToken: string
      try {
        userToken = decryptToken(setting.valuePlain)
      } catch {
        return reply.status(500).send({ error: 'Failed to decrypt user token' })
      }

      // Fetch all pages and find the one with matching pageId
      const pagesResult = await listPages(userToken)
      const allPages = pagesResult.categorized?.activated || []
      const targetPage = allPages.find((p: PancakePage) => p.id === pageId)

      if (!targetPage) {
        return reply.status(404).send({ error: 'Page not found in Pancake account' })
      }

      const pageAccessToken = targetPage.settings?.page_access_token
      if (!pageAccessToken) {
        return reply.status(400).send({ error: 'Page has no access token. Configure it in Pancake first.' })
      }

      const platformId = pancakePlatformToId(platform || targetPage.platform || 'facebook')
      const tokenEnc = encryptToken(pageAccessToken)

      const account = await prisma.channelAccount.create({
        data: {
          orgId,
          ownerUserId: userId,
          platform: platformId,
          externalPageId: pageId,
          displayName: pageName || targetPage.name || `Pancake Page ${pageId}`,
          accessTokenEnc: tokenEnc,
          status: 'connected',
          lastConnectedAt: new Date(),
        },
      })

      logger.info({ accountId: account.id, pageId, pageName }, '[pancake] Page connected')

      return { ok: true, channelAccountId: account.id }
    },
  )

  // ── Disconnect a page ─────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/pancake/disconnect/:id',
    async (request, reply) => {
      const { orgId } = getAuth(request)
      const { id } = request.params

      const account = await prisma.channelAccount.findFirst({
        where: { id, orgId, deletedAt: null },
        select: { id: true, platform: true },
      })

      if (!account || !isPancakePlatform(account.platform)) {
        return reply.status(404).send({ error: 'Pancake account not found' })
      }

      await prisma.channelAccount.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'disconnected', isDisabled: true },
      })

      logger.info({ accountId: id }, '[pancake] Page disconnected')
      return { ok: true }
    },
  )

  // ── Manual sync ───────────────────────────────────────────────────
  /**
   * Sync direction controls (CRITICAL for production safety):
   *   - 'pull': Pancake → BizCRM only (read-only, DEFAULT)
   *   - 'push': BizCRM → Pancake only (writes to Pancake)
   *   - 'both': Full bidirectional
   */
  app.post<{ Body: { direction?: 'pull' | 'push' | 'both' }; Params: { id: string } }>(
    '/api/v1/pancake/sync/:id',
    async (request, reply) => {
      const { orgId } = getAuth(request)
      const { id } = request.params
      const direction = request.body?.direction || 'pull' // Default: PULL ONLY (safe for production)

      const account = await prisma.channelAccount.findFirst({
        where: { id, orgId, deletedAt: null },
        select: { id: true, platform: true, externalPageId: true, accessTokenEnc: true },
      })

      if (!account || !isPancakePlatform(account.platform)) {
        return reply.status(404).send({ error: 'Pancake account not found' })
      }

      if (!account.accessTokenEnc || !account.externalPageId) {
        return reply.status(400).send({ error: 'Page not properly configured' })
      }

      // Fire sync in background
      reply.status(202).send({ ok: true, message: `Sync started (direction: ${direction})` })

      try {
        let pageToken: string
        try {
          pageToken = decryptToken(account.accessTokenEnc)
        } catch {
          logger.error({ accountId: id }, '[pancake] Failed to decrypt token for sync')
          return
        }

        await syncPancakePage(orgId, account.id, account.externalPageId, pageToken, direction)
        logger.info({ accountId: id, direction }, '[pancake] Sync completed')
      } catch (err: any) {
        logger.error({ err: err.message, accountId: id }, '[pancake] Sync failed')
      }
    },
  )

  // ── Connection status ─────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/pancake/status/:id',
    async (request, reply) => {
      const { orgId } = getAuth(request)
      const { id } = request.params

      const account = await prisma.channelAccount.findFirst({
        where: { id, orgId },
        select: {
          id: true,
          displayName: true,
          platform: true,
          externalPageId: true,
          status: true,
          isDisabled: true,
          lastConnectedAt: true,
          deletedAt: true,
          createdAt: true,
        },
      })

      if (!account || !isPancakePlatform(account.platform)) {
        return reply.status(404).send({ error: 'Pancake account not found' })
      }

      // Count conversations and contacts
      const [convCount, contactCount, lastMessage] = await Promise.all([
        prisma.conversation.count({ where: { channelAccountId: id } }),
        prisma.contact.count({ where: { orgId, pancakeUid: { not: null } } }),
        prisma.message.findFirst({
          where: { conversation: { channelAccountId: id } },
          orderBy: { sentAt: 'desc' },
          select: { sentAt: true },
        }),
      ])

      return {
        id: account.id,
        displayName: account.displayName,
        platform: account.platform,
        platformLabel: PlatformLabel[account.platform] || 'Pancake',
        externalPageId: account.externalPageId,
        status: account.deletedAt ? 'disconnected' : account.status,
        isDisabled: account.isDisabled,
        lastConnectedAt: account.lastConnectedAt,
        createdAt: account.createdAt,
        stats: {
          conversations: convCount,
          contacts: contactCount,
          lastMessageAt: lastMessage?.sentAt || null,
        },
      }
    },
  )

  // ── List connected Pancake accounts ───────────────────────────────
  app.get('/api/v1/pancake/connected', async (request) => {
    const { orgId } = getAuth(request)

    const accounts = await prisma.channelAccount.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        platform: true,
        externalPageId: true,
        status: true,
        lastConnectedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const pancakeAccounts = accounts
      .filter(a => isPancakePlatform(a.platform))
      .map(a => ({
        ...a,
        platformLabel: PlatformLabel[a.platform] || 'Pancake',
      }))

    return { accounts: pancakeAccounts }
  })
}
