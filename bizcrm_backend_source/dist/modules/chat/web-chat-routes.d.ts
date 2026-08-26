/**
 * web-chat-routes.ts — REST for the in-CRM web "test chat" (owner/admin).
 *
 * POST /api/v1/web-chat/messages       → deliver a visitor message into the real
 *                                         AI pipeline (creates conv on first send)
 * GET  /api/v1/web-chat/conversations  → list web/test conversations for the org
 *
 * Message history + AI-mode changes reuse the existing conversation routes
 * (GET /conversations/:id/messages, PATCH /conversations/:id/ai-mode).
 */
import type { FastifyInstance } from 'fastify';
export declare function webChatRoutes(app: FastifyInstance): Promise<void>;
