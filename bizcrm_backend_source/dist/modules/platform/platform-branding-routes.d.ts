/**
 * platform-branding-routes.ts — White-label branding under /api/v1/platform.
 *
 * Public GETs (brand meta + logo/favicon bytes) are reachable before login so
 * the login page + document title + favicon reflect the brand. Mutations are
 * guarded by requirePlatformAdmin (super admin only).
 */
import type { FastifyInstance } from 'fastify';
export declare function platformBrandingRoutes(app: FastifyInstance): Promise<void>;
