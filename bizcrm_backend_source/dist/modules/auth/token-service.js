/**
 * token-service.ts — Refresh token rotation with family-based revocation.
 *
 * W5-FIX: Access token = 30 min JWT. Refresh token = 7-day opaque UUID in DB.
 *
 * Flow:
 *   1. Login → issue accessToken (30 min) + refreshToken (7 days)
 *   2. Frontend receives 401 TOKEN_EXPIRED → calls POST /auth/refresh
 *   3. Backend validates refreshToken → rotates it → returns new pair
 *   4. If a revoked token is reused → wipe entire family (compromised chain)
 *   5. Logout → revoke all tokens for the user
 */
import { prisma } from '../../shared/prisma-client.js';
import crypto from 'node:crypto';
export const ACCESS_TOKEN_EXPIRY = '30m';
export const REFRESH_TOKEN_DAYS = 7;
/** Create a new refresh token for a user, starting a new rotation family. */
export async function createRefreshToken(userId, family) {
    const token = crypto.randomUUID();
    const familyId = family || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
        data: { userId, token, family: familyId, expiresAt },
    });
    return token;
}
/**
 * Rotate a refresh token: validate the old one, revoke it, issue a new one.
 * Returns { newToken, userId, family } on success, or throws.
 */
export async function rotateRefreshToken(oldToken) {
    const existing = await prisma.refreshToken.findUnique({
        where: { token: oldToken },
    });
    if (!existing) {
        throw new TokenError('INVALID_REFRESH_TOKEN', 'Refresh token not found');
    }
    // Reuse detection: if someone tries to use an already-revoked token,
    // the entire family is compromised → wipe all tokens in the chain.
    if (existing.revokedAt) {
        await prisma.refreshToken.deleteMany({
            where: { family: existing.family },
        });
        throw new TokenError('TOKEN_REUSE_DETECTED', 'Token family revoked due to reuse');
    }
    if (existing.expiresAt < new Date()) {
        // Clean up expired token
        await prisma.refreshToken.delete({ where: { id: existing.id } });
        throw new TokenError('REFRESH_TOKEN_EXPIRED', 'Refresh token expired');
    }
    // Revoke the old token and issue a new one in the same family
    await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
    });
    const newToken = await createRefreshToken(existing.userId, existing.family);
    return { newToken, userId: existing.userId };
}
/** Revoke all refresh tokens for a user (logout from all devices). */
export async function revokeAllUserTokens(userId) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
}
/** Clean up expired tokens (call periodically, e.g. daily cron). */
export async function cleanupExpiredTokens() {
    const result = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
}
/** Custom error class for token operations */
export class TokenError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'TokenError';
    }
}
//# sourceMappingURL=token-service.js.map