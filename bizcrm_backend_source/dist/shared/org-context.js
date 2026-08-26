/**
 * org-context.ts — Per-request tenant context via AsyncLocalStorage.
 *
 * Set once in authMiddleware after JWT verify; read by the Prisma client
 * extension (prisma-client.ts) to auto-inject `orgId` on tenant models —
 * a backstop against cross-company queries. Service functions still pass
 * orgId explicitly (primary enforcement); this catches accidental misses.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
export const orgContext = new AsyncLocalStorage();
/** Current request's orgId, if any (undefined for workers / platform routes). */
export function getCurrentOrgId() {
    return orgContext.getStore()?.orgId;
}
/** Bind orgId to the current async execution (call from authMiddleware). */
export function setOrgContext(orgId) {
    orgContext.enterWith({ orgId });
}
//# sourceMappingURL=org-context.js.map