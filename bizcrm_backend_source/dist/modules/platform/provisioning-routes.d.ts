/**
 * provisioning-routes.ts — Super admin account provisioning.
 * Creates companies + initial owner, and manages a company's users.
 * Company self-service (Staff) is unchanged; this is additive.
 */
import type { FastifyInstance } from 'fastify';
export declare function platformProvisioningRoutes(app: FastifyInstance): Promise<void>;
