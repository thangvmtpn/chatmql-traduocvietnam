export type PlatformAction = 'org.create' | 'org.update' | 'org.license' | 'account.create' | 'account.update' | 'account.reset_password' | 'enter_company';
export declare function logPlatformAction(adminId: string, action: PlatformAction, opts?: {
    targetOrgId?: string;
    targetUserId?: string;
    meta?: Record<string, unknown>;
}): Promise<void>;
