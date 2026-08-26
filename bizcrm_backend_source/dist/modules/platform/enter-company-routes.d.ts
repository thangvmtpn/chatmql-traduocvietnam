/**
 * enter-company-routes.ts — "Vào company" via login-as-user (cross-org impersonation).
 *
 * Mints a COMPANY token (kind:'company') for a chosen user of the target org,
 * tagged with `platformActorId` for audit + the FE return-to-console banner.
 * Allowed even for expired/suspended orgs so the super admin can remediate.
 */
import type { FastifyInstance } from 'fastify';
export declare function platformEnterCompanyRoutes(app: FastifyInstance): Promise<void>;
