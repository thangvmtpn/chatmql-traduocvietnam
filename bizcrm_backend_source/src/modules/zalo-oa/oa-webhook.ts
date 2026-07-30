import { SenderType, Platform } from '../../shared/constants.js'
// Zalo OA inbound webhook — receives user_send_*, user_follow_oa, ZNS delivery
// callbacks. Public endpoint (no auth middleware). Signature verification runs
// in grace mode by default (OA_WEBHOOK_STRICT=false → log but accept) so we can
// observe Zalo's exact algorithm/header before enforcing.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
import { handleIncomingMessage, type IncomingMessage } from '../chat/message-handler.js';
import { pushDebug } from '../zalo/zalo-pool.js';
import { getClient } from './oa-pool.js';
import { randomUUID } from 'node:crypto';
import { emitNewMessage, emitZnsStatus } from '../realtime/socket-gateway.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { extractAvatarHash } from '../contacts/avatar-hash.js';

interface OaEvent {
  app_id?: string;
  oa_id?: string;
  event_name?: string;
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    msg_id?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: any }>;
    sticker?: { sticker_id?: string };
    link?: string;
  };
  follower?: { id?: string };
  timestamp?: string | number;
  // ZNS delivery events
  tracking_id?: string;
  message_id?: string;
  msg_id?: string;
  status?: string;
}

function detectContentType(message: OaEvent['message']): { contentType: string; content: string; attachments: any[] } {
  if (!message) return { contentType: 'text', content: '', attachments: [] };
  if (message.attachments && message.attachments.length > 0) {
    const t = message.attachments[0].type;
    if (t === 'image' || t === 'photo') return { contentType: 'image', content: message.text ?? '', attachments: message.attachments };
    if (t === 'file' || t === 'audio' || t === 'video') return { contentType: t, content: message.text ?? '', attachments: message.attachments };
    if (t === 'gif') return { contentType: 'gif', content: '', attachments: message.attachments };
    if (t === 'sticker') return { contentType: 'sticker', content: '', attachments: message.attachments };
    if (t === 'location') return { contentType: 'location', content: message.text ?? '📍 Vị trí', attachments: message.attachments };
  }
  if (message.sticker?.sticker_id) return { contentType: 'sticker', content: '', attachments: [message.sticker] };
  if (message.link) return { contentType: 'link', content: message.link, attachments: [] };
  return { contentType: 'text', content: message.text ?? '', attachments: [] };
}

export async function zaloOaWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/zalo-oa/webhook', async (request: FastifyRequest, reply) => {
    const body = request.body as OaEvent;
    const strict = process.env.OA_WEBHOOK_STRICT === 'true';
    const sigHeader = (request.headers['x-zevent-signature'] ?? request.headers['x-zalo-signature']) as string | undefined;

    // Phase-1 grace mode: log signature presence but accept. Strict-mode HMAC
    // verification requires raw-body plumbing (Fastify content-type parser
    // override) — defer until we observe Zalo's exact algorithm/header.
    if (strict) {
      logger.warn({ sigHeader }, '[oa-webhook] strict mode requested but raw-body verification not yet implemented');
    } else if (sigHeader) {
      logger.debug({ sigHeader }, '[oa-webhook] signature header present (grace mode)');
    }

    // Zalo's webhook setup/verification ping carries no event_name — ack with 200
    // so the webhook registers ("only established when it returns 200 OK"). Real
    // events always carry event_name and continue processing below.
    if (!body?.event_name) {
      return reply.send({ ok: true, ignored: 'no_event_name' });
    }

    // Locate the OA account in our DB. Zalo puts the OA's identity in different
    // fields depending on the event type:
    //   user_send_*           → recipient.id = OA
    //   user_received_message → sender.id    = OA
    //   follow/unfollow       → oa_id (root)
    // We try all candidates and match the first one found in our DB.
    const oaCandidates = [body.oa_id, body.recipient?.id, body.sender?.id].filter(Boolean) as string[];
    if (oaCandidates.length === 0) return reply.send({ ok: true, ignored: 'no_oa_id' });

    let account: { id: string; orgId: string } | null = null;
    let externalPageId = oaCandidates[0];
    for (const candidate of oaCandidates) {
      account = await prisma.channelAccount.findFirst({
        where: { externalPageId: candidate, platform: Platform.ZALO_OA, deletedAt: null },
        select: { id: true, orgId: true },
      });
      if (account) { externalPageId = candidate; break; }
    }

    // Always log to unified event log (visible in admin panel) even if account is unknown
    const topic = account ? `oa:${account.id}` : 'oa:unknown';
    const oaTag = account ? externalPageId : `${externalPageId} (UNKNOWN)`;
    
    pushDebug(topic, `oa:${body.event_name}`, `from=${body.sender?.id || body.follower?.id || '-'} oa=${oaTag}`, {
      event_name: body.event_name,
      sender: body.sender,
      recipient: body.recipient,
      follower: body.follower,
      message: body.message,
      timestamp: body.timestamp,
      error: !account ? "OA ID not found in database" : undefined
    });

    if (!account) {
      logger.warn({ externalPageId: externalPageId, event: body.event_name }, '[oa-webhook] unknown OA');
      return reply.send({ ok: true, ignored: 'unknown_oa' });
    }

    try {
      await routeEvent(body, account.id, account.orgId, externalPageId);
    } catch (err: any) {
      logger.error({ err, event: body.event_name }, '[oa-webhook] handler error');
      pushDebug(`oa:${account.id}`, 'oa:error', `${body.event_name}: ${err.message}`);
      // Always 200 to prevent Zalo retry-storm.
    }
    return reply.send({ ok: true });
  });
}

async function routeEvent(body: OaEvent, accountId: string, orgId: string, externalPageId: string): Promise<void> {
  const eventName = body.event_name!;

  // ── User message events → normalize and delegate to message-handler ──
  if (eventName.startsWith('user_send_')) {
    const senderUid = body.sender?.id;
    if (!senderUid) return;
    const { contentType, content, attachments } = detectContentType(body.message);
    const msg: IncomingMessage = {
      accountId,
      senderUid,
      senderName: '',  // OA webhooks don't include name; fetched below via OA API
      content,
      contentType,
      msgId: body.message?.msg_id ?? `oa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Number(body.timestamp ?? Date.now()),
      isSelf: false,
      threadId: senderUid,
      threadType: 'user',
      attachments,
      isBackfill: false,
    };
    await handleIncomingMessage(msg);

    // Fire-and-forget: fetch follower profile via OA API to fix "Unknown" name
    enrichOaContact(accountId, senderUid, orgId).catch(() => {});
    return;
  }

  // ── user_received_message: delivery confirmation for CRM-sent messages ──
  // When CRM sends via OA API, the response already contains message_id which
  // we save immediately to the DB record. This webhook event is just a delivery
  // confirmation — we only need to verify it's already tracked and skip.
  if (eventName === 'user_received_message') {
    const externalMsgId = body.message?.msg_id;
    if (!externalMsgId) return;
    // Already saved at send time → nothing to do
    logger.debug({ externalMsgId }, '[oa-webhook] user_received_message: delivery confirmation (no-op)');
    return;
  }

  // ── oa_send_* : OA sends from Zalo platform (not CRM) ──
  // These are messages sent by the OA operator directly via Zalo's own UI.
  // They should appear as 'self' messages in the CRM conversation.
  if (eventName.startsWith('oa_send_')) {
    const userUid = body.recipient?.id;
    if (!userUid) return;
    const externalMsgId = body.message?.msg_id;

    // Check for duplicate first
    if (externalMsgId) {
      const conv = await prisma.conversation.findFirst({
        where: {
          channelAccountId: accountId,
          OR: [
            { externalThreadId: userUid },
            { contact: { zaloUid: userUid } },
          ],
        },
        select: { id: true },
      });
      if (conv) {
        const existing = await prisma.message.findFirst({
          where: { conversationId: conv.id, externalMsgId },
          select: { id: true },
        });
        if (existing) return; // Already tracked (sent from CRM)
      }
    }

    const { contentType, content, attachments } = detectContentType(body.message);
    // Only create if there's actual content (not just a delivery receipt)
    if (!content && (!attachments || attachments.length === 0)) {
      logger.debug({ eventName, externalMsgId }, '[oa-webhook] oa_send_* with no content, skipping');
      return;
    }

    const msg: IncomingMessage = {
      accountId,
      senderUid: externalPageId,
      senderName: 'OA',
      content,
      contentType,
      msgId: externalMsgId ?? `oa-send-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Number(body.timestamp ?? Date.now()),
      isSelf: true,
      threadId: userUid,
      threadType: 'user',
      attachments,
      isBackfill: false,
    };
    await handleIncomingMessage(msg);
    return;
  }

  // ── Follow / unfollow → upsert Contact + create system message ──
  if (eventName === 'user_follow_oa' || eventName === 'follow') {
    const followerUid = body.follower?.id ?? body.sender?.id;
    if (!followerUid) return;
    let contact = await prisma.contact.findFirst({
      where: { orgId, zaloUid: followerUid },
      select: { id: true },
    });
    if (contact) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastActivity: new Date() },
      });
    } else {
      contact = await prisma.contact.create({
        data: {
          orgId,
          fullName: `Zalo OA Follower ${followerUid.slice(-4)}`,
          zaloUid: followerUid,
          source: 'zalo_oa',
        },
      });
    }
    // Insert system message into conversation
    const conv = await insertSystemMessage(accountId, orgId, followerUid, contact.id, 'Đã quan tâm OA', body.timestamp);
    enrichOaContact(accountId, followerUid, orgId).catch(() => {});

    // Fire automation triggers for follow event
    const autoCtx = { orgId, contactId: contact.id, conversationId: conv };
    runAutomationRules('contact_created', autoCtx)
      .catch(err => logger.error({ err }, '[automation] contact_created from OA follow failed'));
    emitDomainEvent({ type: 'contact.created', orgId, id: contact.id });
    runAutomationRules('user_follow_oa', autoCtx)
      .catch(err => logger.error({ err }, '[automation] user_follow_oa trigger failed'));
    return;
  }
  if (eventName === 'user_unfollow_oa' || eventName === 'unfollow') {
    const followerUid = body.follower?.id ?? body.sender?.id;
    if (!followerUid) return;
    const contact = await prisma.contact.findFirst({
      where: { orgId, zaloUid: followerUid },
      select: { id: true },
    });
    if (contact) {
      const conv = await insertSystemMessage(accountId, orgId, followerUid, contact.id, 'Đã bỏ quan tâm OA', body.timestamp);
      runAutomationRules('user_unfollow_oa', { orgId, contactId: contact.id, conversationId: conv })
        .catch(err => logger.error({ err }, '[automation] user_unfollow_oa trigger failed'));
    }
    return;
  }

  // ── ZNS delivery callbacks → update ZnsLog + push status to the timeline ──
  if (eventName === 'message_delivery' || eventName === 'zns_delivery') {
    await applyZnsStatus(body.tracking_id, 'delivered');
    return;
  }
  if (eventName === 'message_read' || eventName === 'zns_read') {
    await applyZnsStatus(body.tracking_id, 'read');
    return;
  }

  // ── Unknown events → log only, never write to chat records ──
  logger.info({ event: eventName, body: { sender: body.sender, recipient: body.recipient, message: body.message } }, '[oa-webhook] unhandled event (logged only)');
}

// ── OA-specific contact enrichment via Official Account API ─────────────
// Uses getFollowerProfile (Zalo OA REST API) instead of getUserInfo (zca-js)
// because OA contacts are OA followers, not personal friends.
async function enrichOaContact(accountId: string, senderUid: string, orgId: string): Promise<void> {
  try {
    const client = await getClient(accountId);
    const profile = await client.getFollowerProfile(senderUid);
    if (!profile.displayName && !profile.avatar && !profile.phone) return;

    const contact = await prisma.contact.findFirst({
      where: { orgId, zaloUid: senderUid },
      select: { id: true, fullName: true, avatarUrl: true, phone: true },
    });
    if (!contact) return;

    const updates: Record<string, unknown> = {};

    // Update name if currently auto-generated (Unknown / placeholder)
    if (profile.displayName) {
      const current = contact.fullName ?? '';
      const isAutoName = !current
        || current === 'Unknown'
        || /^Zalo( OA Follower)? \S{2,8}$/.test(current);
      if (isAutoName && profile.displayName !== current) {
        updates.fullName = profile.displayName;

        // Also fix conversation displayName
        prisma.conversation.updateMany({
          where: {
            contactId: contact.id,
            OR: [
              { displayName: null },
              { displayName: 'Unknown' },
              ...(current ? [{ displayName: current }] : []),
            ],
          },
          data: { displayName: profile.displayName },
        }).catch((err: any) => logger.warn(`[oa-webhook] displayName sync failed: ${err.message}`));
      }
    }

    if (profile.avatar && !contact.avatarUrl) {
      updates.avatarUrl = profile.avatar;
    }

    // Capture phone from shared_info if user has consented
    if (profile.phone && !contact.phone) {
      updates.phone = profile.phone;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: updates,
      });
      logger.info({ senderUid, updates: Object.keys(updates) }, '[oa-webhook] enriched OA contact');

      // Auto-merge by avatar hash: if a personal Zalo contact has the same avatar, link them
      if (updates.avatarUrl) {
        tryAutoMergeOaByAvatar(contact.id, updates.avatarUrl as string, orgId)
          .catch(err => logger.warn({ err }, '[oa-webhook] auto-merge by avatar failed'));
      }
    }
  } catch (err: any) {
    logger.warn(`[oa-webhook] enrichOaContact failed for ${senderUid}: ${err.message}`);
  }
}

// Auto-merge OA contact into existing personal contact by avatar hash
async function tryAutoMergeOaByAvatar(
  oaContactId: string,
  avatarUrl: string,
  orgId: string,
): Promise<void> {
  const hash = extractAvatarHash(avatarUrl);
  if (!hash) return;

  const oaContact = await prisma.contact.findUnique({
    where: { id: oaContactId },
    select: { id: true, createdAt: true, mergedInto: true, deletedAt: true },
  });
  if (!oaContact || oaContact.mergedInto || oaContact.deletedAt) return;

  // Find other contacts with same avatar hash
  const candidates = await prisma.contact.findMany({
    where: {
      orgId,
      id: { not: oaContactId },
      deletedAt: null,
      mergedInto: null,
      isGroup: false,
      avatarUrl: { contains: hash },
    },
    select: { id: true, avatarUrl: true, createdAt: true },
  });

  const matches = candidates.filter(c => extractAvatarHash(c.avatarUrl) === hash);
  if (matches.length === 0) return;

  // Merge newer into older
  const allContacts = [oaContact, ...matches].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const primaryId = allContacts[0].id;
  const mergeId = primaryId === oaContactId ? null : oaContactId;

  if (!mergeId) {
    logger.info(`[oa-auto-merge] OA contact ${oaContactId} is oldest; skipping, will suggest in UI`);
    return;
  }

  logger.info(`[oa-auto-merge] Merging OA ${mergeId} into ${primaryId} (avatar hash: ${hash})`);

  await prisma.$transaction(async (tx) => {
    const mc = await tx.contact.findUnique({
      where: { id: mergeId },
      select: { fullName: true },
    });
    if (mc?.fullName) {
      await tx.conversation.updateMany({
        where: { contactId: mergeId, displayName: null },
        data: { displayName: mc.fullName },
      });
    }
    await tx.conversation.updateMany({
      where: { contactId: mergeId },
      data: { contactId: primaryId },
    });
    await tx.appointment.updateMany({
      where: { contactId: mergeId },
      data: { contactId: primaryId },
    });
    await tx.cdpEvent.updateMany({
      where: { contactId: mergeId },
      data: { contactId: primaryId },
    });
    await tx.lifecycleLog.updateMany({
      where: { contactId: mergeId },
      data: { contactId: primaryId },
    });
    await tx.contactPropertyValue.deleteMany({
      where: { contactId: mergeId },
    });
    await tx.contact.update({
      where: { id: mergeId },
      data: { mergedInto: primaryId, deletedAt: new Date() },
    });
    // Resolve any DuplicateGroup that references the merged contact
    await tx.duplicateGroup.updateMany({
      where: {
        orgId,
        resolved: false,
        contactIds: { hasSome: [mergeId] },
      },
      data: { resolved: true },
    });
  });
}

// ── Insert a system event message into the conversation thread ───────────
// Used for follow/unfollow and other non-chat events that should appear
// centered in the conversation UI (senderType = 'system').
// Update a ZnsLog's delivery status (from a Zalo delivery/read webhook) and push
// the change to its linked timeline message so the chip updates live.
async function applyZnsStatus(
  trackingId: string | undefined,
  status: 'delivered' | 'read',
): Promise<void> {
  if (!trackingId) return;
  try {
    const log = await prisma.znsLog.findUnique({
      where: { trackingId },
      select: { id: true, conversationId: true },
    });
    if (!log) return;
    const deliveredAt = status === 'delivered' ? new Date() : undefined;
    await prisma.znsLog.update({
      where: { id: log.id },
      data: { status, ...(deliveredAt ? { deliveredAt } : {}) },
    });
    if (!log.conversationId) return;
    const msg = await prisma.message.findFirst({
      where: { znsLogId: log.id },
      select: { id: true },
    });
    if (msg) {
      emitZnsStatus(log.conversationId, {
        messageId: msg.id,
        status,
        deliveredAt: deliveredAt ? deliveredAt.toISOString() : null,
      });
    }
  } catch (err: any) {
    logger.warn(`[oa-webhook] applyZnsStatus failed for ${trackingId}: ${err.message}`);
  }
}

async function insertSystemMessage(
  accountId: string,
  orgId: string,
  userUid: string,
  contactId: string,
  text: string,
  timestamp?: string | number,
): Promise<string | undefined> {
  try {
    // Find or create conversation for this user+OA pair
    let conv = await prisma.conversation.findFirst({
      where: {
        channelAccountId: accountId,
        OR: [
          { externalThreadId: userUid },
          { contactId, threadType: 'user' },
        ],
      },
      select: { id: true, orgId: true },
    });

    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          orgId,
          channelAccountId: accountId,
          contactId,
          externalThreadId: userUid,
          threadType: 'user',
          displayName: text,
        },
        select: { id: true, orgId: true },
      });
    }

    const sentAt = timestamp
      ? new Date(typeof timestamp === 'number' ? timestamp : Number(timestamp))
      : new Date();

    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: conv.id,
        senderType: SenderType.SYSTEM,
        senderUid: '',
        senderName: null,
        content: text,
        contentType: 'system_event',
        sentAt,
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: sentAt },
    });

    // Emit realtime event
    emitNewMessage(orgId, conv.id, message);

    logger.info({ text, convId: conv.id }, '[oa-webhook] system message inserted');
    return conv.id;
  } catch (err: any) {
    logger.warn(`[oa-webhook] insertSystemMessage failed: ${err.message}`);
  }
}
