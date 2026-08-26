export declare const PLATFORM_ACCESS_TOKEN_EXPIRY = "30m";
export declare const PLATFORM_REFRESH_TOKEN_DAYS = 7;
export declare class PlatformTokenError extends Error {
    code: string;
    constructor(code: string, message: string);
}
/** Create a new refresh token for an admin, starting a new rotation family. */
export declare function createPlatformRefreshToken(adminId: string, family?: string): Promise<string>;
/** Rotate a refresh token: validate, revoke, issue new. Throws PlatformTokenError. */
export declare function rotatePlatformRefreshToken(oldToken: string): Promise<{
    newToken: string;
    adminId: string;
}>;
/** Revoke all refresh tokens for an admin (logout). */
export declare function revokeAllPlatformTokens(adminId: string): Promise<void>;
/** Clean up expired tokens. */
export declare function cleanupExpiredPlatformTokens(): Promise<number>;
