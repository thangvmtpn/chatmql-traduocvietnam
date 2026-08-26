/**
 * zalo-webhook.ts — D9.7: Inbound Zalo message webhook handler.
 *
 * This route is called by the zca-js listener (or an external webhook proxy)
 * when a new message arrives on a connected Zalo account.
 *
 * Flow:
 *   Zalo → zca-js event listener → POST /api/internal/zalo/webhook
 *   → upsert contact → upsert conversation → create message
 *   → trigger automation rules → emit Socket.IO event
 */
import type { FastifyInstance } from 'fastify';
export declare function zaloWebhookRoutes(app: FastifyInstance): Promise<void>;
