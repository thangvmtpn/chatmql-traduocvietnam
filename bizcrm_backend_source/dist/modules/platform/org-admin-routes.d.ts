/**
 * org-admin-routes.ts — Super admin org management (read + license).
 * All routes guarded by requirePlatformAdmin (plugin-level preHandler).
 */
import type { FastifyInstance } from 'fastify';
export declare function platformOrgRoutes(app: FastifyInstance): Promise<void>;
