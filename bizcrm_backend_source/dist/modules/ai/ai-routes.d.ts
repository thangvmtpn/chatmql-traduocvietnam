/**
 * ai-routes.ts — D5.6+: AI HTTP layer.
 * Thin wrapper over ai-service.ts. Auth + per-conversation access checks live here.
 */
import type { FastifyInstance } from 'fastify';
export declare function aiRoutes(app: FastifyInstance): Promise<void>;
