import rateLimit from '@fastify/rate-limit';
import { requirePlatformAdmin } from './platform-middleware.js';
import { platformSetup, platformLogin, getPlatformProfile } from './platform-auth-service.js';
import { PLATFORM_ACCESS_TOKEN_EXPIRY, createPlatformRefreshToken, rotatePlatformRefreshToken, revokeAllPlatformTokens, cleanupExpiredPlatformTokens, PlatformTokenError, } from './platform-token-service.js';
import { prisma } from '../../shared/prisma-client.js';
export async function platformAuthRoutes(app) {
    // Brute-force protection for setup + login (10/min/IP). /me excluded.
    await app.register(rateLimit, {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        allowList: (req) => req.url?.startsWith('/api/v1/platform/auth/me') ?? false,
    });
    async function issueTokenPair(payload) {
        // Platform tokens carry `sub` instead of company id/role/orgId — sign via cast.
        const accessToken = app.jwt.sign(payload, { expiresIn: PLATFORM_ACCESS_TOKEN_EXPIRY });
        const refreshToken = await createPlatformRefreshToken(payload.sub);
        return { accessToken, refreshToken };
    }
    // POST /api/v1/platform/setup — create the FIRST super admin (one-time)
    app.post('/api/v1/platform/setup', async (request, reply) => {
        const { fullName, email, password } = request.body ?? {};
        if (!fullName || !email || !password) {
            return reply.status(400).send({ error: 'Thiếu thông tin bắt buộc' });
        }
        const payload = await platformSetup(fullName, email, password);
        const { accessToken, refreshToken } = await issueTokenPair(payload);
        return { token: accessToken, refreshToken, admin: payload };
    });
    // POST /api/v1/platform/auth/login
    app.post('/api/v1/platform/auth/login', async (request, reply) => {
        const { email, password } = request.body ?? {};
        if (!email || !password)
            return reply.status(400).send({ error: 'Thiếu email hoặc mật khẩu' });
        const payload = await platformLogin(email, password);
        const { accessToken, refreshToken } = await issueTokenPair(payload);
        return { token: accessToken, refreshToken, admin: payload };
    });
    // POST /api/v1/platform/auth/refresh
    app.post('/api/v1/platform/auth/refresh', async (request, reply) => {
        const { refreshToken } = request.body ?? {};
        if (!refreshToken)
            return reply.status(400).send({ error: 'refreshToken is required' });
        try {
            const { newToken, adminId } = await rotatePlatformRefreshToken(refreshToken);
            const admin = await prisma.platformAdmin.findUnique({
                where: { id: adminId },
                select: { id: true, email: true, fullName: true, isActive: true },
            });
            if (!admin || !admin.isActive) {
                await revokeAllPlatformTokens(adminId);
                return reply.status(401).send({ error: 'Admin no longer active', code: 'TOKEN_INVALID' });
            }
            const payload = { kind: 'platform', sub: admin.id, email: admin.email, fullName: admin.fullName };
            const accessToken = app.jwt.sign(payload, { expiresIn: PLATFORM_ACCESS_TOKEN_EXPIRY });
            return { token: accessToken, refreshToken: newToken, admin: payload };
        }
        catch (err) {
            if (err instanceof PlatformTokenError) {
                return reply.status(401).send({ error: err.message, code: err.code });
            }
            throw err;
        }
    });
    // POST /api/v1/platform/auth/logout
    app.post('/api/v1/platform/auth/logout', { preHandler: requirePlatformAdmin }, async (request) => {
        await revokeAllPlatformTokens(request.platformAdmin.id);
        return { success: true };
    });
    // GET /api/v1/platform/auth/me
    app.get('/api/v1/platform/auth/me', { preHandler: requirePlatformAdmin }, async (request) => {
        return getPlatformProfile(request.platformAdmin.id);
    });
    // Daily cleanup of expired platform refresh tokens
    setInterval(async () => {
        try {
            const count = await cleanupExpiredPlatformTokens();
            if (count > 0)
                app.log.info(`[platform-auth] Cleaned up ${count} expired refresh tokens`);
        }
        catch (err) {
            app.log.error(`[platform-auth] Token cleanup error: ${err}`);
        }
    }, 24 * 60 * 60 * 1000);
}
//# sourceMappingURL=platform-auth-routes.js.map