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
  status: string
  expiresAt: Date | null
}

export type OrgUsability =
  | { ok: true }
  | { ok: false; reason: 'EXPIRED' | 'SUSPENDED' }

/** Decide whether an org may be used (login / refresh). */
export function isOrgUsable(org: OrgLicenseInput, now: Date = new Date()): OrgUsability {
  if (org.status === 'suspended') return { ok: false, reason: 'SUSPENDED' }
  if (org.expiresAt && org.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: 'EXPIRED' }
  }
  return { ok: true }
}

/** Derived display status for the console: active | suspended | expired | unlimited. */
export function orgDisplayStatus(org: OrgLicenseInput, now: Date = new Date()): string {
  if (org.status === 'suspended') return 'suspended'
  if (org.expiresAt && org.expiresAt.getTime() < now.getTime()) return 'expired'
  if (!org.expiresAt) return 'unlimited'
  return 'active'
}

/** Whether the org expires within the next `days` days (for "expiring soon" lists). */
export function isExpiringWithin(org: OrgLicenseInput, days: number, now: Date = new Date()): boolean {
  if (!org.expiresAt) return false
  const ms = org.expiresAt.getTime() - now.getTime()
  return ms > 0 && ms <= days * 24 * 60 * 60 * 1000
}
