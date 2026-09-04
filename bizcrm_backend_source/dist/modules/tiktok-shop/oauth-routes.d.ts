/**
 * oauth-routes.ts — OAuth 2.0 authorization flow for TikTok Shop Open Platform.
 *
 * Routes:
 * - GET /api/v1/tiktok-shop/connect/start : Authed, returns TikTok authorization URL.
 * - GET /api/v1/tiktok-shop/callback      : Public callback, validates state, exchanges code,
 *                                          upserts ChannelAccount(s), redirects to CRM.
 */
import type { FastifyInstance } from 'fastify';
export declare function tiktokOAuthRoutes(app: FastifyInstance): Promise<void>;
