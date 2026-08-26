/**
 * profile-routes.ts — User profile API.
 * GET   /api/v1/profile        → return current user info
 * PATCH /api/v1/profile        → update fullName / avatarUrl
 * POST  /api/v1/profile/avatar → upload avatar image, returns URL
 */
import type { FastifyInstance } from 'fastify';
export declare const UPLOADS_DIR: string;
export declare function profileRoutes(app: FastifyInstance): Promise<void>;
