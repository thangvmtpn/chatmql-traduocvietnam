/**
 * platform-middleware.ts — Guard for platform-admin-only routes.
 *
 * Accepts ONLY tokens with claim `kind === 'platform'`. Company tokens are
 * rejected (403). Mirrors the structured TOKEN_* errors of authMiddleware so
 * the platform frontend can refresh/redirect consistently.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        platformAdmin?: {
            id: string;
            email: string;
            fullName: string;
        };
    }
}
export declare function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
