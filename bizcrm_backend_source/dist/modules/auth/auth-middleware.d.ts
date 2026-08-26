import type { FastifyRequest, FastifyReply } from 'fastify';
/**
 * JWT auth middleware. Returns a structured error so the frontend can
 * distinguish "token expired/invalid → must re-login" from "401 from some
 * other code path that shouldn't blow away the session".
 *
 * Response body shape:
 *   { error: 'Unauthorized', code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_MISSING' }
 *
 * The frontend (api/client.ts) only redirects to /login when `code` starts
 * with `TOKEN_`. Other 401s (e.g. wrong current password) keep the user on
 * the page and surface the error inline.
 */
export declare function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
