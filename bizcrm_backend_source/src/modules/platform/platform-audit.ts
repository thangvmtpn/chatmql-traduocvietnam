/**
 * platform-audit.ts — Append-only audit trail for platform-admin actions.
 * Best-effort: auditing must never break the primary action.
 */
import { prisma } from '../../shared/prisma-client.js'

export type PlatformAction =
  | 'org.create'
  | 'org.update'
  | 'org.license'
  | 'account.create'
  | 'account.update'
  | 'account.reset_password'
  | 'enter_company'

export async function logPlatformAction(
  adminId: string,
  action: PlatformAction,
  opts: { targetOrgId?: string; targetUserId?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        adminId,
        action,
        targetOrgId: opts.targetOrgId ?? null,
        targetUserId: opts.targetUserId ?? null,
        meta: (opts.meta ?? {}) as object,
      },
    })
  } catch {
    // swallow — audit is non-critical
  }
}
