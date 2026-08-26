export async function requirePlatformAdmin(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch (err) {
        const message = err?.message || '';
        let code = 'TOKEN_INVALID';
        if (/expired/i.test(message) || err?.code === 'FAST_JWT_EXPIRED')
            code = 'TOKEN_EXPIRED';
        else if (/missing|no authorization/i.test(message) || err?.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
            code = 'TOKEN_MISSING';
        }
        reply.status(401).send({ error: 'Unauthorized', code });
        return;
    }
    const u = request.user;
    if (u?.kind !== 'platform' || !u.sub) {
        reply.status(403).send({ error: 'Forbidden', code: 'NOT_PLATFORM_ADMIN' });
        return;
    }
    request.platformAdmin = { id: u.sub, email: u.email ?? '', fullName: u.fullName ?? '' };
}
//# sourceMappingURL=platform-middleware.js.map