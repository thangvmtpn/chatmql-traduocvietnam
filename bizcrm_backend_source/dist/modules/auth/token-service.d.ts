export declare const ACCESS_TOKEN_EXPIRY = "30m";
export declare const REFRESH_TOKEN_DAYS = 7;
/** Create a new refresh token for a user, starting a new rotation family. */
export declare function createRefreshToken(userId: string, family?: string): Promise<string>;
/**
 * Rotate a refresh token: validate the old one, revoke it, issue a new one.
 * Returns { newToken, userId, family } on success, or throws.
 */
export declare function rotateRefreshToken(oldToken: string): Promise<{
    newToken: string;
    userId: string;
}>;
/** Revoke all refresh tokens for a user (logout from all devices). */
export declare function revokeAllUserTokens(userId: string): Promise<void>;
/** Clean up expired tokens (call periodically, e.g. daily cron). */
export declare function cleanupExpiredTokens(): Promise<number>;
/** Custom error class for token operations */
export declare class TokenError extends Error {
    code: string;
    constructor(code: string, message: string);
}
