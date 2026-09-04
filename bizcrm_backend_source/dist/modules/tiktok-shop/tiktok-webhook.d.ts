/**
 * tiktok-webhook.ts — Inbound webhook handler for TikTok Shop Customer Service events.
 *
 * Route: POST /api/v1/tiktok-shop/webhook
 * Handshake/Ping: GET /api/v1/tiktok-shop/webhook
 */
import type { FastifyInstance } from 'fastify';
export declare function tiktokWebhookRoutes(app: FastifyInstance): Promise<void>;
/**
 * Process a normalized TikTok Shop Customer Service event.
 */
export declare function processTikTokEvent(payload: Record<string, any>): Promise<void>;
