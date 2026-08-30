// Shared logic to upsert Facebook pages into ChannelAccount + subscribe each to
// our webhook. Used by BOTH connect paths:
//   - oauth-routes.ts       (Facebook Login → page tokens)
//   - token-import-routes.ts (user pastes a user token → page tokens; dev only)
// Keeping this in one place means the Pancake-conflict guard, webhook-subscribe
// retry and status semantics stay identical across both flows.

import { Platform } from '../../shared/constants.js';
import { prisma } from '../../shared/prisma-client.js';
import { encryptToken } from '../../shared/crypto.js';
import { logger } from '../../shared/logger.js';
import { subscribePageWebhook, type FbPage } from './fb-client.js';
import { invalidateClient } from './fb-pool.js';

export interface ConnectPagesResult {
  connected: number;
  conflicts: number;
}

/** Subscribe a page to our app webhook, retrying once. Returns success. */
async function trySubscribeWebhook(pageId: string, pageToken: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await subscribePageWebhook(pageId, pageToken);
      return true;
    } catch (err: any) {
      logger.warn(`[fb-connect] subscribe webhook failed (attempt ${attempt}) for page ${pageId}: ${err.message}`);
    }
  }
  return false;
}

/**
 * Upsert each page as a FACEBOOK_PAGE ChannelAccount for the org and subscribe
 * it to our webhook. Skips pages already owned by a different active channel
 * (e.g. Pancake) to avoid clobbering them.
 */
export async function connectPagesForOrg(
  orgId: string,
  userId: string,
  pages: FbPage[],
): Promise<ConnectPagesResult> {
  let connected = 0;
  let conflicts = 0;

  for (const page of pages) {
    try {
      // ChannelAccount has @@unique([orgId, externalPageId]) → at most ONE row
      // per page per org, regardless of platform/deletedAt. Load it and decide:
      // revive/update an FB row, repurpose a soft-deleted slot, or REFUSE to
      // clobber an active different channel (e.g. Pancake=30).
      const existing = await prisma.channelAccount.findFirst({
        where: { orgId, externalPageId: page.id },
        select: { id: true, platform: true, deletedAt: true },
      });
      if (existing && existing.platform !== Platform.FACEBOOK_PAGE && !existing.deletedAt) {
        logger.warn(`[fb-connect] page ${page.id} already connected via platform ${existing.platform} (e.g. Pancake) — skipping to avoid overwrite`);
        conflicts += 1;
        continue;
      }

      // Subscribe to our webhook (retry once). Status reflects the outcome so the
      // UI can flag a page that connected but isn't receiving events.
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
        invalidateClient(existing.id);
      } else {
        await prisma.channelAccount.create({
          data: { orgId, ownerUserId: userId, ...data },
        });
      }
      connected += 1;
    } catch (err: any) {
      logger.error(`[fb-connect] failed to connect page ${page.id}: ${err.message}`);
    }
  }

  return { connected, conflicts };
}
