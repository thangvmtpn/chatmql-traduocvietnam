// Facebook Login (OAuth 2.0 authorization-code) flow for the official Page channel.
// Mirrors zalo-oa/oauth-routes.ts. Differences vs Zalo:
//   - No PKCE — Meta uses the app secret at token exchange.
//   - A user may admin several pages → we connect every page they granted
//     (Facebook's consent dialog already lets them pick which pages), upserting
//     one ChannelAccount per page and subscribing each to our webhook.
//
// /connect/start — authed, returns the Facebook dialog URL to redirect to.
// /callback      — public, validates state from Redis, exchanges code → user
//                  token → long-lived → page tokens, upserts accounts, redirects.

import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { Platform } from '../../shared/constants.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { redisConnection } from '../../shared/queue.js';
import { encryptToken } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getPages,
  subscribePageWebhook,
  FbApiError,
} from './fb-client.js';

const STATE_TTL_SEC = 600; // 10 min
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'public_profile',
];

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function appCreds(): { appId: string; appSecret: string; redirectUri: string } {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error('FACEBOOK_APP_ID/APP_SECRET/REDIRECT_URI not configured');
  }
  return { appId, appSecret, redirectUri };
}

function frontendBase(): string {
  return process.env.FRONTEND_URL || 'http://localhost:4521';
}

/** Subscribe a page to our app webhook, retrying once. Returns success. */
async function trySubscribeWebhook(pageId: string, pageToken: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await subscribePageWebhook(pageId, pageToken);
      return true;
    } catch (err: any) {
      logger.warn(`[fb-oauth] subscribe webhook failed (attempt ${attempt}) for page ${pageId}: ${err.message}`);
    }
  }
  return false;
}

export async function facebookPageOAuthRoutes(app: FastifyInstance): Promise<void> {
  // ─── authed: start ─────────────────────────────────────────────────────────
  app.get('/api/v1/facebook-page/connect/start', { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user as { orgId: string; id: string };
    let appId: string, redirectUri: string;
    try {
      ({ appId, redirectUri } = appCreds());
    } catch (err: any) {
      return reply.code(500).send({ error: 'fb_not_configured', message: err.message });
    }

    const state = base64url(randomBytes(24));
    await redisConnection.set(
      `fb:oauth:state:${state}`,
      JSON.stringify({ orgId: user.orgId, userId: user.id }),
      'EX',
      STATE_TTL_SEC,
    );

    const url = buildAuthorizeUrl({ appId, redirectUri, state, scopes: SCOPES });
    return { url };
  });

  // ─── public: callback ──────────────────────────────────────────────────────
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/v1/facebook-page/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      const front = frontendBase();
      if (error || !code || !state) {
        return reply.redirect(`${front}/integrations?fb_error=${encodeURIComponent(error ?? 'missing_code')}`);
      }

      const raw = await redisConnection.get(`fb:oauth:state:${state}`);
      if (!raw) {
        return reply.redirect(`${front}/integrations?fb_error=state_expired`);
      }
      await redisConnection.del(`fb:oauth:state:${state}`);

      let parsed: { orgId: string; userId: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return reply.redirect(`${front}/integrations?fb_error=state_invalid`);
      }

      let appId: string, appSecret: string, redirectUri: string;
      try {
        ({ appId, appSecret, redirectUri } = appCreds());
      } catch (err: any) {
        logger.error(`[fb-oauth] App creds missing: ${err.message}`);
        return reply.redirect(`${front}/integrations?fb_error=server_misconfig`);
      }

      try {
        // code → short-lived user token → long-lived user token → page tokens
        const shortLived = await exchangeCodeForToken({ code, redirectUri, appId, appSecret });
        const longLived = await exchangeForLongLivedToken({
          userToken: shortLived.accessToken,
          appId,
          appSecret,
        });
        const pages = await getPages(longLived.accessToken);

        if (pages.length === 0) {
          return reply.redirect(`${front}/integrations?fb_error=no_pages`);
        }

        let connected = 0;
        let conflicts = 0;
        for (const page of pages) {
          try {
            // ChannelAccount has @@unique([orgId, externalPageId]) → at most ONE
            // row per page per org, regardless of platform/deletedAt. Load it and
            // decide: revive/update an FB row, repurpose a soft-deleted slot, or
            // REFUSE to clobber an active different channel (e.g. Pancake=30).
            const existing = await prisma.channelAccount.findFirst({
              where: { orgId: parsed.orgId, externalPageId: page.id },
              select: { id: true, platform: true, deletedAt: true },
            });
            if (existing && existing.platform !== Platform.FACEBOOK_PAGE && !existing.deletedAt) {
              logger.warn(`[fb-oauth] page ${page.id} already connected via platform ${existing.platform} (e.g. Pancake) — skipping to avoid overwrite`);
              conflicts += 1;
              continue;
            }

            // Subscribe to our webhook (retry once). Status reflects the outcome so
            // the UI can flag a page that connected but isn't receiving events.
            const subscribed = await trySubscribeWebhook(page.id, page.accessToken);
            const data = {
              platform: Platform.FACEBOOK_PAGE,
              externalPageId: page.id,
              displayName: page.name,
              avatarUrl: page.avatarUrl ?? null,
              status: subscribed ? 'connected' : 'webhook_pending',
              accessTokenEnc: encryptToken(page.accessToken),
              refreshTokenEnc: null,
              // Page tokens from a long-lived user token don't expire; keep null.
              tokenExpiresAt: null,
              lastConnectedAt: new Date(),
              deletedAt: null,
            };
            if (existing) {
              await prisma.channelAccount.update({ where: { id: existing.id }, data });
              const { invalidateClient } = await import('./fb-pool.js');
              invalidateClient(existing.id);
            } else {
              await prisma.channelAccount.create({
                data: { orgId: parsed.orgId, ownerUserId: parsed.userId, ...data },
              });
            }
            connected += 1;
          } catch (err: any) {
            logger.error(`[fb-oauth] failed to connect page ${page.id}: ${err.message}`);
          }
        }

        const q = new URLSearchParams({ fb_connected: String(connected) });
        if (conflicts > 0) q.set('fb_conflict', String(conflicts));
        return reply.redirect(`${front}/integrations?${q.toString()}`);
      } catch (err: any) {
        const code = err instanceof FbApiError ? err.code : 'exchange_failed';
        logger.error(`[fb-oauth] callback error (${code}): ${err.message}`);
        return reply.redirect(`${front}/integrations?fb_error=${encodeURIComponent(String(code))}`);
      }
    },
  );
}
