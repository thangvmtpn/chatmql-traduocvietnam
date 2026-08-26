export interface JwtPayload {
    id: string;
    email: string;
    fullName: string;
    role: string;
    orgId: string;
}
/** Check if first-run setup is needed */
export declare function checkSetupStatus(): Promise<{
    needsSetup: boolean;
}>;
/** Create initial org + owner user */
export declare function setup(orgName: string, fullName: string, email: string, password: string): Promise<JwtPayload>;
/** Verify credentials, return JWT payload */
export declare function login(email: string, password: string): Promise<JwtPayload>;
/** Throw a 403 ORG_EXPIRED / ORG_SUSPENDED error when the org is unusable. */
export declare function assertOrgUsable(org: {
    status: string;
    expiresAt: Date | null;
}): void;
/** Return safe user profile (no password hash) */
export declare function getProfile(userId: string): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    org: {
        id: string;
        name: string;
        status: string;
        expiresAt: Date | null;
    };
    email: string;
    fullName: string;
    role: string;
    avatarUrl: string | null;
    isActive: boolean;
}>;
