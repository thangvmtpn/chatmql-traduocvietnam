/**
 * fb-token-import-routes.ts — Manual token import flow for Facebook Pages.
 *
 * Supports a "paste your access token" workflow for environments where
 * the standard OAuth popup flow is blocked (e.g. missing Facebook App ID/Secret).
 *
 * Endpoints:
 *   GET  /facebook-page/token-import/status   — is this feature enabled?
 *   POST /facebook-page/token-import/pages    — given a user token, list pages
 *   POST /facebook-page/token-import/confirm  — connect selected pages
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { Platform } from '../../shared/constants.js';
import { encryptToken } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';
import { getPages, subscribePageWebhook } from './fb-client.js';

/** Feature flag: enable token import if env var is set, or default to enabled */
function isEnabled(): boolean {
  if (process.env.FACEBOOK_TOKEN_IMPORT_ENABLED === 'false' || process.env.FB_TOKEN_IMPORT === 'false') return false;
  if (process.env.FACEBOOK_TOKEN_IMPORT_ENABLED === 'true' || process.env.FB_TOKEN_IMPORT === 'true') return true;
  return true;
}

export async function fbTokenImportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Status — is the token import feature available? ──────────────────
  app.get('/api/v1/facebook-page/token-import/status', async (_request, reply) => {
    return { enabled: isEnabled() };
  });

  // ── List pages from a user access token ──────────────────────────────
  app.post<{ Body: { userToken: string } }>(
    '/api/v1/facebook-page/token-import/pages',
    async (request, reply) => {
      if (!isEnabled()) return reply.code(403).send({ error: 'Token import is disabled' });

      const { userToken } = request.body;
      if (!userToken?.trim()) return reply.code(400).send({ error: 'userToken is required' });

      try {
        const pages = await getPages(userToken);
        // Generate a temporary importId so the confirm step can re-use the token
        const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Store in memory (temporary — will be cleaned up after 10 min)
        pendingImports.set(importId, {
          userToken,
          pages,
          createdAt: Date.now(),
        });
        // Cleanup old imports
        for (const [k, v] of pendingImports.entries()) {
          if (Date.now() - v.createdAt > 10 * 60 * 1000) pendingImports.delete(k);
        }

        return {
          importId,
          pages: pages.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
        };
      } catch (err: any) {
        logger.warn({ err }, '[fb-token-import] Failed to fetch pages');
        return reply.code(400).send({ error: err.message || 'Failed to fetch pages from Facebook' });
      }
    },
  );

  // ── Confirm import — connect selected pages ──────────────────────────
  app.post<{ Body: { importId: string; pageIds: string[] } }>(
    '/api/v1/facebook-page/token-import/confirm',
    async (request, reply) => {
      if (!isEnabled()) return reply.code(403).send({ error: 'Token import is disabled' });

      const user = request.user as { orgId: string; id: string };
      const { importId, pageIds } = request.body;

      if (!importId || !pageIds?.length) {
        return reply.code(400).send({ error: 'importId and pageIds are required' });
      }

      const pending = pendingImports.get(importId);
      if (!pending) {
        return reply.code(400).send({ error: 'Import session expired or not found. Please re-enter your token.' });
      }
      pendingImports.delete(importId);

      const selectedPages = pending.pages.filter(p => pageIds.includes(p.id));
      if (selectedPages.length === 0) {
        return reply.code(400).send({ error: 'No matching pages found' });
      }

      let connected = 0;
      let errors: string[] = [];

      for (const page of selectedPages) {
        try {
          // Try to subscribe webhook (non-fatal if it fails)
          let subscribed = false;
          try {
            await subscribePageWebhook(page.id, page.accessToken);
            subscribed = true;
          } catch (err: any) {
            logger.warn(`[fb-token-import] webhook subscribe failed for page ${page.id}: ${err.message}`);
          }

          const existing = await prisma.channelAccount.findFirst({
            where: { orgId: user.orgId, externalPageId: page.id },
            select: { id: true, platform: true, deletedAt: true },
          });

          const data = {
            platform: Platform.FACEBOOK_PAGE,
            externalPageId: page.id,
            displayName: page.name,
            avatarUrl: page.avatarUrl ?? null,
            status: subscribed ? 'connected' : 'webhook_pending',
            accessTokenEnc: encryptToken(page.accessToken),
            refreshTokenEnc: null,
            tokenExpiresAt: null,
            lastConnectedAt: new Date(),
            deletedAt: null,
          };

          if (existing) {
            if (existing.platform !== Platform.FACEBOOK_PAGE && !existing.deletedAt) {
              errors.push(`Page ${page.name} already connected via another channel`);
              continue;
            }
            await prisma.channelAccount.update({ where: { id: existing.id }, data });
            const { invalidateClient } = await import('./fb-pool.js');
            invalidateClient(existing.id);
          } else {
            await prisma.channelAccount.create({
              data: { orgId: user.orgId, ownerUserId: user.id, ...data },
            });
          }
          connected += 1;
        } catch (err: any) {
          logger.error(`[fb-token-import] failed to connect page ${page.id}: ${err.message}`);
          errors.push(`Page ${page.name}: ${err.message}`);
        }
      }

      return { connected, errors: errors.length > 0 ? errors : undefined };
    },
  );
}

// ── In-memory store for pending imports (short-lived) ────────────────────
const pendingImports = new Map<string, {
  userToken: string;
  pages: Array<{ id: string; name: string; accessToken: string; avatarUrl?: string }>;
  createdAt: number;
}>();
