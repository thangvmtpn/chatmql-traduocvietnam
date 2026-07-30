import { SenderType, Platform } from '../../shared/constants.js'
// Customer-service messaging window state. Free-form text can only be sent
// within a platform-specific window of the customer's last reply:
//   Zalo OA        → 7 days (past that: send a ZNS template)
//   Facebook Page  → 24 hours standard messaging (past that: a message tag / OTN)

import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';

const OA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FB_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Messaging window (ms) for a platform, or null if the window doesn't apply. */
function windowForPlatform(platform: number | undefined): number | null {
  if (platform === Platform.ZALO_OA) return OA_WINDOW_MS;
  if (platform === Platform.FACEBOOK_PAGE) return FB_WINDOW_MS;
  return null;
}

export interface CsWindowState {
  applicable: boolean;     // true for OA + Facebook Page conversations
  platform: number | null; // channel platform id, so the UI can tailor copy/CTA
  lastUserAt: string | null;
  daysSince: number | null;
  withinWindow: boolean;
  expiresAt: string | null;
}

export async function getCsWindow(conversationId: string): Promise<CsWindowState> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { channelAccount: { select: { platform: true } } },
  });
  const platform = conv?.channelAccount?.platform ?? null;
  const WINDOW_MS = windowForPlatform(platform ?? undefined);
  if (!conv || WINDOW_MS === null) {
    return { applicable: false, platform, lastUserAt: null, daysSince: null, withinWindow: true, expiresAt: null };
  }
  const lastMsg = await prisma.message.findFirst({
    where: { conversationId, senderType: SenderType.CONTACT },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  if (!lastMsg) {
    return { applicable: true, platform, lastUserAt: null, daysSince: null, withinWindow: false, expiresAt: null };
  }
  const last = lastMsg.sentAt;
  const elapsed = Date.now() - last.getTime();
  const daysSince = elapsed / (24 * 60 * 60 * 1000);
  return {
    applicable: true,
    platform,
    lastUserAt: last.toISOString(),
    daysSince: Math.round(daysSince * 10) / 10,
    withinWindow: elapsed <= WINDOW_MS,
    expiresAt: new Date(last.getTime() + WINDOW_MS).toISOString(),
  };
}

export async function csWindowRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/cs-window',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user as { orgId: string };
      const conv = await prisma.conversation.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        select: { id: true },
      });
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' });
      return getCsWindow(request.params.id);
    },
  );
}
