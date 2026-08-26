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
import type { FastifyInstance } from 'fastify';
export declare function pancakeWebhookRoutes(app: FastifyInstance): Promise<void>;
