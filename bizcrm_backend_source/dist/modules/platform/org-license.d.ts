/**
 * org-license.ts — License/usability rules for an organization (tenant).
 *
 * Single source of truth for "can this company be used right now?".
 * - expiresAt null  → unlimited (single-company default, fully backward compatible)
 * - expiresAt < now → expired
 * - status 'suspended' → manually blocked by super admin
 *
 * Used by company login/refresh (block) and the platform console (display).
 */
export type OrgLicenseInput = {
    status: string;
    expiresAt: Date | null;
};
export type OrgUsability = {
    ok: true;
} | {
    ok: false;
    reason: 'EXPIRED' | 'SUSPENDED';
};
/** Decide whether an org may be used (login / refresh). */
export declare function isOrgUsable(org: OrgLicenseInput, now?: Date): OrgUsability;
/** Derived display status for the console: active | suspended | expired | unlimited. */
export declare function orgDisplayStatus(org: OrgLicenseInput, now?: Date): string;
/** Whether the org expires within the next `days` days (for "expiring soon" lists). */
export declare function isExpiringWithin(org: OrgLicenseInput, days: number, now?: Date): boolean;
