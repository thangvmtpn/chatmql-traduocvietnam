/**
 * master-routes.ts — Fastify plugin for M3 AI Master + Feedback endpoints.
 *
 * Routes registered (not in app.ts — caller registers this plugin):
 *   POST /api/v1/ai/feedback              — any member
 *   GET  /api/v1/ai/feedback              — any member
 *   POST /api/v1/ai/master/sessions       — owner/admin
 *   GET  /api/v1/ai/master/sessions/:id   — owner/admin
 *   POST /api/v1/ai/master/sessions/:id/messages — owner/admin
 *   GET  /api/v1/ai/master/proposals      — owner/admin
 *   POST /api/v1/ai/master/proposals/:id/apply   — owner/admin
 *
 * Plugin export: masterRoutes (named export + default export).
 */
import type { FastifyInstance } from 'fastify';
export declare function masterRoutes(app: FastifyInstance): Promise<void>;
export default masterRoutes;
