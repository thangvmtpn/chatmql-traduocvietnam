/**
 * platform-auth-routes.ts — Super admin auth under /api/v1/platform.
 * Setup is a manual, one-time link (guard: platformAdmin.count()===0).
 */
import type { FastifyInstance } from 'fastify';
export declare function platformAuthRoutes(app: FastifyInstance): Promise<void>;
