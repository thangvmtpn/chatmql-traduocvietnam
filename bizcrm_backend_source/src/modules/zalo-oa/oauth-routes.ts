import { Platform } from '../../shared/constants.js'
// Zalo OA OAuth 2.0 authorization-code flow with PKCE (S256).
// /connect/start  — authed, returns the authorize URL to redirect to.
// /callback       — public, validates state from Redis, exchanges code,
//                   upserts ZaloAccount with encrypted tokens, redirects UI.

import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { redisConnection } from '../../shared/queue.js';
import { encryptToken } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  OaClient,
  OaApiError,
} from './oa-client.js';

const STATE_TTL_SEC = 600; // 10 min

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function appCreds(): { appId: string; appSecret: string; redirectUri: string } {
  const appId = process.env.ZALO_OA_APP_ID;
  const appSecret = process.env.ZALO_OA_APP_SECRET;
  const redirectUri = process.env.ZALO_OA_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error('ZALO_OA_APP_ID/APP_SECRET/REDIRECT_URI not configured');
  }
  return { appId, appSecret, redirectUri };
}

function frontendBase(): string {
  return process.env.FRONTEND_URL || 'http://localhost:4521';
}

export async function zaloOaOAuthRoutes(app: FastifyInstance): Promise<void> {
  // ─── authed: start ─────────────────────────────────────────────────────────
  app.get('/api/v1/zalo-oa/connect/start', { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user as { orgId: string; id: string };
    let appId: string, redirectUri: string;
    try {
      ({ appId, redirectUri } = appCreds());
    } catch (err: any) {
      return reply.code(500).send({ error: 'oa_not_configured', message: err.message });
    }

    const { verifier, challenge } = pkcePair();
    const state = base64url(randomBytes(24));

    await redisConnection.set(
      `oa:oauth:state:${state}`,
      JSON.stringify({ orgId: user.orgId, userId: user.id, verifier }),
      'EX',
      STATE_TTL_SEC,
    );

    const url = buildAuthorizeUrl({ appId, redirectUri, state, codeChallenge: challenge });
    return { url };
  });

  // ─── public: callback ──────────────────────────────────────────────────────
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/v1/zalo-oa/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      const front = frontendBase();
      if (error || !code || !state) {
        return reply.redirect(`${front}/integrations?oa_error=${encodeURIComponent(error ?? 'missing_code')}`);
      }

      const raw = await redisConnection.get(`oa:oauth:state:${state}`);
      if (!raw) {
        return reply.redirect(`${front}/integrations?oa_error=state_expired`);
      }
      await redisConnection.del(`oa:oauth:state:${state}`);

      let parsed: { orgId: string; userId: string; verifier: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return reply.redirect(`${front}/integrations?oa_error=state_invalid`);
      }

      let appId: string, appSecret: string;
      try {
        ({ appId, appSecret } = appCreds());
      } catch (err: any) {
        logger.error(`[oa-oauth] App creds missing: ${err.message}`);
        return reply.redirect(`${front}/integrations?oa_error=server_misconfig`);
      }

      try {
        const tokens = await exchangeCodeForToken({
          code,
          codeVerifier: parsed.verifier,
          appId,
          appSecret,
        });

        const client = new OaClient(tokens.accessToken);
        const oa = await client.getOaInfo().catch((err) => {
          logger.warn(`[oa-oauth] getOaInfo failed: ${err.message}`);
          return { externalPageId: '', name: 'Zalo OA', avatar: undefined as string | undefined };
        });

        if (!oa.externalPageId) {
          return reply.redirect(`${front}/integrations?oa_error=missing_oa_id`);
        }

        const existing = await prisma.channelAccount.findFirst({
          where: { orgId: parsed.orgId, externalPageId: oa.externalPageId },
        });

        const data = {
          platform: Platform.ZALO_OA,
          externalPageId: oa.externalPageId,
          displayName: oa.name,
          avatarUrl: oa.avatar ?? null,
          status: 'connected',
          accessTokenEnc: encryptToken(tokens.accessToken),
          refreshTokenEnc: encryptToken(tokens.refreshToken),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          lastConnectedAt: new Date(),
          deletedAt: null,
        };

        if (existing) {
          await prisma.channelAccount.update({ where: { id: existing.id }, data });
          // Invalidate cached OaClient so the next getClient() picks up new tokens
          const { invalidateClient } = await import('./oa-pool.js');
          invalidateClient(existing.id);
        } else {
          await prisma.channelAccount.create({
            data: {
              orgId: parsed.orgId,
              ownerUserId: parsed.userId,
              ...data,
            },
          });
        }

        return reply.redirect(`${front}/integrations?oa_connected=1`);
      } catch (err: any) {
        const code = err instanceof OaApiError ? err.code : 'exchange_failed';
        logger.error(`[oa-oauth] callback error (${code}): ${err.message}`);
        return reply.redirect(`${front}/integrations?oa_error=${encodeURIComponent(String(code))}`);
      }
    },
  );
}
