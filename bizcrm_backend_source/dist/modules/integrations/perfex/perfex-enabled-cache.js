// In-memory cache of which orgs have Perfex enabled (+ their debounce window).
// Lets the domain-event subscriber skip work cheaply for orgs not using Perfex —
// no DB hit on the hot path, no outbox churn. Refreshed at boot and on config save (Phase 04).
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
import { PERFEX_INTEGRATION_TYPE, normalizeConfig } from './perfex-config.js';
const enabledOrgs = new Map();
/** Reload the enabled-org set from the DB. Call at boot and after any config save. */
export async function refreshPerfexEnabledCache() {
    const rows = await prisma.integration.findMany({
        where: { type: PERFEX_INTEGRATION_TYPE, enabled: true },
        select: { orgId: true, config: true },
    });
    enabledOrgs.clear();
    for (const row of rows) {
        const cfg = normalizeConfig(row.config);
        enabledOrgs.set(row.orgId, { debounceSeconds: cfg.debounceSeconds });
    }
    logger.info({ count: enabledOrgs.size }, '[perfex] enabled-org cache refreshed');
}
export function isPerfexEnabled(orgId) {
    return enabledOrgs.has(orgId);
}
export function getEnabledOrgIds() {
    return [...enabledOrgs.keys()];
}
export function getDebounceSeconds(orgId) {
    return enabledOrgs.get(orgId)?.debounceSeconds ?? 15;
}
//# sourceMappingURL=perfex-enabled-cache.js.map