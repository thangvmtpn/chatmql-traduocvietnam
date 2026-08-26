/**
 * platform-token-service.ts — Refresh token rotation for PlatformAdmin.
 * Mirrors modules/auth/token-service.ts but on the platform_refresh_tokens table.
 */
import { prisma } from '../../shared/prisma-client.js';
import crypto from 'node:crypto';
export const PLATFORM_ACCESS_TOKEN_EXPIRY = '30m';
export const PLATFORM_REFRESH_TOKEN_DAYS = 7;
export class PlatformTokenError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'PlatformTokenError';
    }
}
/** Create a new refresh token for an admin, starting a new rotation family. */
export async function createPlatformRefreshToken(adminId, family) {
    const token = crypto.randomUUID();
    const familyId = family || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + PLATFORM_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await prisma.platformRefreshToken.create({ data: { adminId, token, family: familyId, expiresAt } });
    return token;
}
/** Rotate a refresh token: validate, revoke, issue new. Throws PlatformTokenError. */
export async function rotatePlatformRefreshToken(oldToken) {
    const existing = await prisma.platformRefreshToken.findUnique({ where: { token: oldToken } });
    if (!existing)
        throw new PlatformTokenError('TOKEN_INVALID', 'Refresh token not found');
    // Reuse detection → wipe the whole family.
    if (existing.revokedAt) {
        await prisma.platformRefreshToken.deleteMany({ where: { family: existing.family } });
        throw new PlatformTokenError('TOKEN_REUSE_DETECTED', 'Token family revoked due to reuse');
    }
    if (existing.expiresAt < new Date()) {
        await prisma.platformRefreshToken.delete({ where: { id: existing.id } });
        throw new PlatformTokenError('TOKEN_EXPIRED', 'Refresh token expired');
    }
    await prisma.platformRefreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    const newToken = await createPlatformRefreshToken(existing.adminId, existing.family);
    return { newToken, adminId: existing.adminId };
}
/** Revoke all refresh tokens for an admin (logout). */
export async function revokeAllPlatformTokens(adminId) {
    await prisma.platformRefreshToken.deleteMany({ where: { adminId } });
}
/** Clean up expired tokens. */
export async function cleanupExpiredPlatformTokens() {
    const result = await prisma.platformRefreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
}
//# sourceMappingURL=platform-token-service.js.map