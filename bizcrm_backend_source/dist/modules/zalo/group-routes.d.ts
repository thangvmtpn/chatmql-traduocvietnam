/**
 * group-routes.ts — REST API for Zalo group management.
 * Ported from ZaloCRM reference: group info, CRUD, membership management.
 * All routes: /api/v1/zalo-accounts/:id/groups
 */
import type { FastifyInstance } from 'fastify';
export declare function groupRoutes(app: FastifyInstance): Promise<void>;
