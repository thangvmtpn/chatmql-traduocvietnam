/**
 * friend-routes.ts — REST API for Zalo friend management.
 * Ported from ZaloCRM reference: queries, friend requests, management, privacy.
 * All routes: /api/v1/zalo-accounts/:id/friends
 */
import type { FastifyInstance } from 'fastify';
export declare function friendRoutes(app: FastifyInstance): Promise<void>;
