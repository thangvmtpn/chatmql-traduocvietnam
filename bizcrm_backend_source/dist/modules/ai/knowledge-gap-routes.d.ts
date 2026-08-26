/**
 * knowledge-gap-routes.ts — Fastify plugin for the AI "knowledge gap" queue
 * ("Phản hồi AI"). Staff list gaps the AI logged when it lacked info, then resolve
 * them into knowledge (directly or via the AI Master) or dismiss them.
 *
 * Routes (owner/admin):
 *   GET  /api/v1/ai/knowledge-gaps?status=
 *   POST /api/v1/ai/knowledge-gaps/:id/resolve         — staff writes the answer → KB entry
 *   POST /api/v1/ai/knowledge-gaps/:id/resolve-master  — hand to AI Master (seed feedback)
 *   POST /api/v1/ai/knowledge-gaps/:id/dismiss
 *
 * Plugin export: knowledgeGapRoutes (named + default). Registered in app.ts.
 */
import type { FastifyInstance } from 'fastify';
export declare function knowledgeGapRoutes(app: FastifyInstance): Promise<void>;
export default knowledgeGapRoutes;
