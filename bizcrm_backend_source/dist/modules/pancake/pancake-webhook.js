/**
 * pancake-webhook.ts — Public webhook endpoint for Pancake events.
 *
 * Pancake pushes events (new message, comment, etc.) to this endpoint.
 * We return 200 immediately and process asynchronously to stay within
 * Pancake's <5s response window requirement.
 *
 * Security: No JWT — public endpoint. Validated by checking that the
 * page_id belongs to a known ChannelAccount.
 *
 * Route: POST /api/webhooks/pancake
 */
import { prisma } from '../../shared/prisma-client.js';
import { isPancakePlatform } from '../../shared/constants.js';
import { logger } from '../../shared/logger.js';
import { processPancakeEvent } from './pancake-message-handler.js';
export async function pancakeWebhookRoutes(app) {
    /**
     * POST /api/webhooks/pancake
     *
     * Pancake sends webhook events here. Payload structure varies by event type
     * but always includes page_id / page information.
     */
    app.post('/api/webhooks/pancake', {
        config: {
            // Skip JWT auth for this public webhook route
            rateLimit: { max: 100, timeWindow: '1 minute' },
        },
    }, async (request, reply) => {
        const body = request.body;
        // ── Quick validation: extract page_id from payload ──────────────
        // Pancake webhook payloads may include page_id at different levels
        const pageId = body.page_id
            || body.data?.page_id
            || body.entry?.[0]?.id;
        if (!pageId) {
            logger.warn('[pancake-webhook] No page_id in payload');
            return reply.status(200).send({ ok: true }); // Still return 200 to avoid Pancake retries
        }
        // ── Verify page belongs to us (multi-tenant safe) ───────────────
        // Multiple orgs can connect the same Pancake page. findMany ensures
        // ALL matching orgs receive the webhook event, not just the first.
        const accounts = await prisma.channelAccount.findMany({
            where: {
                externalPageId: String(pageId),
                deletedAt: null,
                isDisabled: false,
            },
            select: { id: true, orgId: true, platform: true },
        });
        const validAccounts = accounts.filter(a => isPancakePlatform(a.platform));
        if (validAccounts.length === 0) {
            logger.debug({ pageId }, '[pancake-webhook] Unknown page_id — ignoring');
            return reply.status(200).send({ ok: true });
        }
        // ── Return 200 immediately, process async ─────────────────────
        // We process synchronously in this handler but don't block the response.
        // For production at scale, this should be enqueued to BullMQ.
        reply.status(200).send({ ok: true });
        // Process the event for ALL matching orgs (fire-and-forget)
        for (const account of validAccounts) {
            processPancakeEvent(account.id, account.orgId, body).catch(err => {
                logger.error({ err: err.message, pageId, orgId: account.orgId }, '[pancake-webhook] Event processing failed');
            });
        }
    });
    /**
     * GET /api/webhooks/pancake — Health check / webhook verification
     * Some platforms send a GET to verify the endpoint exists.
     */
    app.get('/api/webhooks/pancake', async () => {
        return { status: 'ok', service: 'pancake-webhook' };
    });
}
//# sourceMappingURL=pancake-webhook.js.map