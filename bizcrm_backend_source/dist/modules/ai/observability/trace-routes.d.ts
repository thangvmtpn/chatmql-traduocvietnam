/**
 * trace-routes.ts — Debug API for AiTrace inspection.
 *
 * ACL: owner/admin only (payload may contain internal prompts).
 *
 * Endpoints:
 *   GET /api/v1/ai/trace?conversationId=<id>  — list trace steps for a conversation
 *   GET /api/v1/ai/trace?runId=<id>           — list trace steps for a specific run
 */
import type { FastifyInstance } from 'fastify';
export declare function traceRoutes(app: FastifyInstance): Promise<void>;
