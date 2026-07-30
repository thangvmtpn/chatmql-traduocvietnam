/**
 * typing-forward.ts — surface "đang nhập..." to the customer's external channel.
 *
 * Staff keystrokes fire typing:start on every change; Zalo must not be spammed,
 * so forwards are throttled per conversation. Zalo's own indicator auto-expires
 * after a few seconds, so repeated forwards while typing keep it alive and a
 * stopped flow simply lets it fade — no stop call exists or is needed.
 *
 * Only Zalo personal (ZALO_USER) supports typing; OA/webchat are skipped here
 * (webchat gets its indicator via Socket.IO directly).
 */
import { prisma } from '../../shared/prisma-client.js'
import { Platform } from '../../shared/constants.js'
import { sendTypingViaPool } from '../zalo/zalo-pool.js'

const THROTTLE_MS = 4_000
const MAX_TRACKED_CONVS = 2_000

const lastForwardAt = new Map<string, number>()

/** Throttled, best-effort forward of a staff typing signal to Zalo personal. */
export async function forwardStaffTypingToZalo(orgId: string, convId: string): Promise<void> {
  const now = Date.now()
  const last = lastForwardAt.get(convId) ?? 0
  if (now - last < THROTTLE_MS) return
  lastForwardAt.set(convId, now)
  if (lastForwardAt.size > MAX_TRACKED_CONVS) lastForwardAt.clear() // bounded memory

  const conv = await prisma.conversation.findFirst({
    where: { id: convId, orgId }, // org-scoped — convId comes from the client
    select: {
      channelAccountId: true,
      threadType: true,
      externalThreadId: true,
      contact: { select: { zaloUid: true } },
      channelAccount: { select: { platform: true } },
    },
  })
  if (conv?.channelAccount?.platform !== Platform.ZALO_USER) return

  const recipient = conv.threadType === 'group' ? conv.externalThreadId : conv.contact?.zaloUid
  if (!recipient) return
  await sendTypingViaPool(conv.channelAccountId, recipient, conv.threadType as 'user' | 'group')
}
