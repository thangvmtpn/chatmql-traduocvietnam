/**
 * platform-audit.ts — Append-only audit trail for platform-admin actions.
 * Best-effort: auditing must never break the primary action.
 */
import { prisma } from '../../shared/prisma-client.js';
export async function logPlatformAction(adminId, action, opts = {}) {
    try {
        await prisma.platformAuditLog.create({
            data: {
                adminId,
                action,
                targetOrgId: opts.targetOrgId ?? null,
                targetUserId: opts.targetUserId ?? null,
                meta: (opts.meta ?? {}),
            },
        });
    }
    catch {
        // swallow — audit is non-critical
    }
}
//# sourceMappingURL=platform-audit.js.map