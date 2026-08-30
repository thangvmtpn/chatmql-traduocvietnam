// Manual "paste a user access token" flow for connecting Facebook pages — a
// DEV / testing convenience that skips the Facebook Login product setup. The
// user pastes a Facebook USER access token (from Graph API Explorer / Business
// Suite); we read the pages they administer, they pick which to connect, and we
// upsert + subscribe each via the shared fb-connect-service.
//
// ⚠️ This does NOT bypass Meta App Review: to receive messages from real (non
// admin/tester) customers the underlying `pages_messaging` permission still
// needs Advanced Access. Intended for connecting your OWN pages while testing.
//
// Gated by env FACEBOOK_TOKEN_IMPORT_ENABLED — OFF by default. When off, the
// endpoints return 403 and the UI hides the entry point.
//
// Page tokens are NEVER returned to the browser: /pages stashes the fetched
// pages (with tokens) in Redis keyed by a short-lived importId; /confirm reads
// them back server-side.

import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { redisConnection } from '../../shared/queue.js';
import { logger } from '../../shared/logger.js';
import { getPages, FbApiError, type FbPage } from './fb-client.js';
import { connectPagesForOrg } from './fb-connect-service.js';

const IMPORT_TTL_SEC = 600; // 10 min

export function isTokenImportEnabled(): boolean {
  return process.env.FACEBOOK_TOKEN_IMPORT_ENABLED === 'true';
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface ImportSession {
  orgId: string;
  userId: string;
  pages: FbPage[]; // includes per-page access tokens — server-side only
}

export async function facebookPageTokenImportRoutes(app: FastifyInstance): Promise<void> {
  // ─── status: is the dev token-import feature enabled? ──────────────────────
  app.get('/api/v1/facebook-page/token-import/status', { preHandler: authMiddleware }, async () => {
    return { enabled: isTokenImportEnabled() };
  });

  // ─── step 1: paste user token → list pages ─────────────────────────────────
  app.post<{ Body: { userToken?: string } }>(
    '/api/v1/facebook-page/token-import/pages',
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!isTokenImportEnabled()) {
        return reply.code(403).send({ error: 'fb_token_import_disabled', message: 'Tính năng nhập token đang tắt' });
      }
      const user = request.user as { orgId: string; id: string };
      const userToken = (request.body?.userToken ?? '').trim();
      if (!userToken) {
        return reply.code(400).send({ error: 'missing_token', message: 'Thiếu user access token' });
      }

      let pages: FbPage[];
      try {
        pages = await getPages(userToken);
      } catch (err: any) {
        const code = err instanceof FbApiError ? err.code : 'fetch_failed';
        logger.warn(`[fb-token-import] getPages failed (${code}): ${err.message}`);
        return reply.code(400).send({ error: String(code), message: 'Token không hợp lệ hoặc thiếu quyền pages_show_list' });
      }
      if (pages.length === 0) {
        return reply.code(400).send({ error: 'no_pages', message: 'Token không quản lý fanpage nào' });
      }

      const importId = base64url(randomBytes(24));
      const session: ImportSession = { orgId: user.orgId, userId: user.id, pages };
      await redisConnection.set(`fb:import:${importId}`, JSON.stringify(session), 'EX', IMPORT_TTL_SEC);

      // Never leak page tokens to the client — only id/name/avatar.
      return {
        importId,
        pages: pages.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null })),
      };
    },
  );

  // ─── step 2: pick pages → connect ──────────────────────────────────────────
  app.post<{ Body: { importId?: string; pageIds?: string[] } }>(
    '/api/v1/facebook-page/token-import/confirm',
    { preHandler: authMiddleware },
    async (request, reply) => {
      if (!isTokenImportEnabled()) {
        return reply.code(403).send({ error: 'fb_token_import_disabled', message: 'Tính năng nhập token đang tắt' });
      }
      const user = request.user as { orgId: string; id: string };
      const importId = (request.body?.importId ?? '').trim();
      const pageIds = Array.isArray(request.body?.pageIds) ? request.body!.pageIds! : [];
      if (!importId || pageIds.length === 0) {
        return reply.code(400).send({ error: 'invalid_request', message: 'Thiếu importId hoặc chưa chọn trang' });
      }

      const raw = await redisConnection.get(`fb:import:${importId}`);
      if (!raw) {
        return reply.code(410).send({ error: 'import_expired', message: 'Phiên nhập đã hết hạn, vui lòng dán lại token' });
      }

      let session: ImportSession;
      try {
        session = JSON.parse(raw);
      } catch {
        return reply.code(400).send({ error: 'import_invalid', message: 'Phiên nhập không hợp lệ' });
      }
      // Bind the session to the requesting org — a stolen importId can't cross orgs.
      if (session.orgId !== user.orgId) {
        return reply.code(403).send({ error: 'forbidden', message: 'Phiên nhập không thuộc tổ chức của bạn' });
      }

      const selected = session.pages.filter((p) => pageIds.includes(p.id));
      if (selected.length === 0) {
        return reply.code(400).send({ error: 'no_selection', message: 'Trang đã chọn không có trong phiên nhập' });
      }

      const result = await connectPagesForOrg(session.orgId, session.userId, selected);
      await redisConnection.del(`fb:import:${importId}`);
      return result; // { connected, conflicts }
    },
  );
}
