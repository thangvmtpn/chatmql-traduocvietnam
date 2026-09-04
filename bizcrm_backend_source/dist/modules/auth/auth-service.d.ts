export interface JwtPayload {
    id: string;
    email: string;
    fullName: string;
    role: string;
    orgId: string;
    /**
     * Vai trò động. Token cũ (phát trước khi có RBAC) không có trường này —
     * lúc đó hệ thống lùi về cột `role`, nên không cần bắt đăng nhập lại.
     */
    roleId?: string | null;
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
    role: string;
    org: {
        id: string;
        name: string;
        status: string;
        expiresAt: Date | null;
    };
    email: string;
    fullName: string;
    avatarUrl: string | null;
    isActive: boolean;
}>;
