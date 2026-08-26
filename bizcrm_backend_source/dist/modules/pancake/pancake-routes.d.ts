/**
 * pancake-routes.ts — Settings + admin routes for Pancake integration.
 *
 * Endpoints:
 *   GET    /api/v1/pancake/pages         - List pages (from Pancake API)
 *   POST   /api/v1/pancake/connect       - Connect a page → ChannelAccount
 *   DELETE /api/v1/pancake/disconnect/:id - Disconnect page (soft-delete)
 *   POST   /api/v1/pancake/sync/:id      - Manual sync (conversations + customers)
 *   GET    /api/v1/pancake/status/:id    - Connection status + stats
 *   GET    /api/v1/pancake/config        - Get stored Pancake config
 *   POST   /api/v1/pancake/config        - Save Pancake user access token
 *   GET    /api/v1/pancake/connected     - List connected Pancake accounts
 *
 * All routes require JWT auth.
 * Uses AppSetting model (key: 'pancake_user_token') for org-level config.
 */
import type { FastifyInstance } from 'fastify';
export declare function pancakeRoutes(app: FastifyInstance): Promise<void>;
