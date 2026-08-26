import { verifyApiKey } from './api-key-service.js';
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
export async function authMiddleware(request, reply) {
    // API-key path (programmatic / MCP). Header `x-api-key: bzk_…`. Grants admin-level
    // access scoped to the key's org. Checked before JWT so machine clients skip login.
    const rawKey = request.headers['x-api-key'];
    if (typeof rawKey === 'string' && rawKey) {
        const ctx = await verifyApiKey(rawKey);
        if (!ctx) {
            reply.status(401).send({ error: 'Unauthorized', code: 'API_KEY_INVALID' });
            return;
        }
        ;
        request.user = {
            id: `apikey:${ctx.keyId}`,
            orgId: ctx.orgId,
            role: 'admin',
            via: 'api_key',
        };
        return;
    }
    try {
        await request.jwtVerify();
    }
    catch (err) {
        const message = err?.message || '';
        let code = 'TOKEN_INVALID';
        if (/expired/i.test(message) || err?.code === 'FAST_JWT_EXPIRED') {
            code = 'TOKEN_EXPIRED';
        }
        else if (/missing|no authorization/i.test(message) || err?.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
            code = 'TOKEN_MISSING';
        }
        reply.status(401).send({ error: 'Unauthorized', code });
        return;
    }
    // Cross-kind guard: platform-admin tokens must never satisfy a company route.
    if (request.user?.kind === 'platform') {
        reply.status(401).send({ error: 'Unauthorized', code: 'TOKEN_INVALID' });
    }
}
//# sourceMappingURL=auth-middleware.js.map