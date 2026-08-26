export interface PlatformJwtPayload {
    kind: 'platform';
    sub: string;
    email: string;
    fullName: string;
}
/**
 * One-time setup: create the FIRST platform admin. Guarded by count===0.
 * Accessed via a manual link (/platform/setup) — no env token, no auto-detect.
 */
export declare function platformSetup(fullName: string, email: string, password: string): Promise<PlatformJwtPayload>;
/** Verify platform-admin credentials. */
export declare function platformLogin(email: string, password: string): Promise<PlatformJwtPayload>;
/** Safe profile for /platform/auth/me. */
export declare function getPlatformProfile(adminId: string): Promise<{
    id: string;
    createdAt: Date;
    email: string;
    fullName: string;
    isActive: boolean;
    lastLoginAt: Date | null;
}>;
