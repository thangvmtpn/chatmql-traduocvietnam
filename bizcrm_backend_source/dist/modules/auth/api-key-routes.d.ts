/**
 * api-key-routes.ts — manage long-lived API keys (owner/admin only).
 *   POST   /api/v1/api-keys        → create (returns the raw key ONCE)
 *   GET    /api/v1/api-keys        → list (metadata only, no raw key)
 *   DELETE /api/v1/api-keys/:id    → revoke
 *
 * Key management itself requires a real user session — an API key cannot mint or
 * revoke keys (guarded via `via === 'api_key'`).
 */
import type { FastifyInstance } from 'fastify';
export declare function apiKeyRoutes(app: FastifyInstance): Promise<void>;
export default apiKeyRoutes;
