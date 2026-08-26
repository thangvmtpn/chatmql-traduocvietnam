// Facebook Messenger Platform inbound webhook (official Page channel).
// Public endpoint. Unlike the Zalo OA webhook (grace mode), this ENFORCES both:
//   GET  — hub.challenge verification against FACEBOOK_WEBHOOK_VERIFY_TOKEN.
//   POST — X-Hub-Signature-256 HMAC-SHA256 of the RAW body with the app secret.
// The raw body is captured by a content-type parser scoped to this plugin only.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Platform } from '../../shared/constants.js';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { getClient, isTokenExpiredError, markTokenExpired } from './fb-pool.js';
import { mapContentType } from './fb-message-normalize.js';
function verifySignature(rawBody, sigHeader, appSecret) {
    if (!sigHeader?.startsWith('sha256='))
        return false;
    const expected = Buffer.from(sigHeader.slice('sha256='.length), 'utf8');
    const actual = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'), 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function facebookPageWebhookRoutes(app) {
    // Scoped raw-body parser — only affects routes in this encapsulated plugin.
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
        req.rawBody = body;
        try {
            const json = body.length ? JSON.parse(body.toString('utf8')) : {};
            done(null, json);
        }
        catch (err) {
            done(err, undefined);
        }
    });
    // ─── GET: webhook verification handshake ───────────────────────────────────
    app.get('/api/v1/facebook-page/webhook', async (request, reply) => {
        const q = request.query;
        const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
        if (q['hub.mode'] === 'subscribe' && verifyToken && q['hub.verify_token'] === verifyToken) {
            return reply.type('text/plain').send(q['hub.challenge'] ?? '');
        }
        return reply.code(403).send('Forbidden');
    });
    // ─── POST: message events ──────────────────────────────────────────────────
    app.post('/api/v1/facebook-page/webhook', async (request, reply) => {
        const appSecret = process.env.FACEBOOK_APP_SECRET;
        const rawBody = request.rawBody;
        const sig = request.headers['x-hub-signature-256'];
        if (!appSecret) {
            logger.error('[fb-webhook] FACEBOOK_APP_SECRET not set — rejecting');
            return reply.code(500).send({ error: 'not_configured' });
        }
        if (!rawBody || !verifySignature(rawBody, sig, appSecret)) {
            logger.warn('[fb-webhook] invalid or missing X-Hub-Signature-256 — rejecting');
            return reply.code(401).send({ error: 'bad_signature' });
        }
        const body = request.body;
        // Ack immediately (200) then process — Meta retries on non-200/slow responses.
        reply.send({ ok: true });
        if (body?.object !== 'page' || !Array.isArray(body.entry))
            return;
        for (const entry of body.entry) {
            const pageId = entry.id;
            if (!pageId || !Array.isArray(entry.messaging))
                continue;
            // Same page may be connected by multiple orgs — fan out to each.
            const accounts = await prisma.channelAccount.findMany({
                where: { externalPageId: pageId, platform: Platform.FACEBOOK_PAGE, deletedAt: null },
                select: { id: true, orgId: true },
            });
            if (accounts.length === 0) {
                logger.warn(`[fb-webhook] unknown page ${pageId}`);
                continue;
            }
            for (const event of entry.messaging) {
                await Promise.all(accounts.map((acc) => routeEvent(event, acc.id, acc.orgId).catch((err) => logger.error({ err }, '[fb-webhook] event handler error'))));
            }
        }
    });
}
async function routeEvent(event, accountId, orgId) {
    const psid = event.sender?.id;
    if (!psid)
        return;
    // Postback (Get Started / button template / persistent menu) → record as a
    // message so the contact + conversation get created and automation fires.
    if (event.postback) {
        const label = event.postback.title || event.postback.payload || 'Bắt đầu';
        await ingestFbMessage(accountId, orgId, psid, {
            content: label,
            contentType: 'text',
            msgId: `fb-pb-${event.timestamp ?? Date.now()}-${psid}`,
            timestamp: event.timestamp,
            attachments: [],
        });
        return;
    }
    // Skip echoes (page-sent) and non-message events (delivery/reads).
    if (!event.message || event.message.is_echo)
        return;
    const { contentType, content, attachments } = mapContentType(event.message);
    // Ignore genuinely empty events (no text and no attachment) — avoids empty
    // bubbles + spurious automation triggers.
    if (!content && attachments.length === 0)
        return;
    await ingestFbMessage(accountId, orgId, psid, {
        content,
        contentType,
        msgId: event.message.mid ?? `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: event.timestamp,
        attachments,
    });
}
async function ingestFbMessage(accountId, orgId, psid, m) {
    const msg = {
        accountId,
        senderUid: psid,
        senderName: '',
        content: m.content,
        contentType: m.contentType,
        msgId: m.msgId,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        isSelf: false,
        threadId: psid,
        threadType: 'user',
        attachments: m.attachments,
        identityField: 'fbPsid',
        source: 'FB',
        isBackfill: false,
    };
    await handleIncomingMessage(msg);
    // Fire-and-forget: enrich the contact's name + avatar from the Graph profile API.
    enrichFbContact(accountId, psid, orgId).catch(() => { });
}
async function enrichFbContact(accountId, psid, orgId) {
    // Look up the contact FIRST — skip the Graph API call entirely if the contact
    // is already enriched (avoids a Graph call on every inbound message).
    const contact = await prisma.contact.findFirst({
        where: { orgId, fbPsid: psid },
        select: { id: true, fullName: true, avatarUrl: true },
    });
    if (!contact)
        return;
    const needsName = !contact.fullName || contact.fullName === 'Unknown';
    const needsAvatar = !contact.avatarUrl;
    if (!needsName && !needsAvatar)
        return;
    try {
        const client = await getClient(accountId);
        const profile = await client.getUserProfile(psid);
        const data = {};
        if (needsName && profile.name)
            data.fullName = profile.name;
        if (needsAvatar && profile.avatar)
            data.avatarUrl = profile.avatar;
        if (Object.keys(data).length > 0) {
            await prisma.contact.update({ where: { id: contact.id }, data });
        }
    }
    catch (err) {
        // A page that only receives (never replies) would otherwise never detect an
        // expired token — surface it here too so the UI can prompt a reconnect.
        if (isTokenExpiredError(err))
            await markTokenExpired(accountId);
    }
}
//# sourceMappingURL=fb-webhook.js.map