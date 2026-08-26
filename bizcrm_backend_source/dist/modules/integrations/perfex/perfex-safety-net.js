// Periodic safety-net for the Perfex outbox. Covers gaps the realtime path can miss:
//   1. retention — prune old done/skipped rows so the table doesn't grow unbounded
//   2. retry — re-queue failed rows (attempts < MAX) so a transient Perfex outage self-heals
//   3. stragglers — re-schedule a flush for any org with stale pending rows (missed debounce /
//      Redis restart between enqueue and schedule)
// Idempotent with the main flush (coalesce + payloadHash skip make re-runs safe).
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
import { isPerfexEnabled, getEnabledOrgIds } from './perfex-enabled-cache.js';
import { schedulePerfexFlush } from './perfex-queue.js';
const SWEEP_INTERVAL_MS = 5 * 60_000; // every 5 minutes
const RETENTION_DAYS = parseInt(process.env.PERFEX_OUTBOX_RETENTION_DAYS || '7');
const MAX_ATTEMPTS = parseInt(process.env.PERFEX_MAX_ATTEMPTS || '5');
const STALE_PENDING_MS = 2 * 60_000; // pending older than 2 min ⇒ its scheduled flush likely lost
let timer = null;
export async function runPerfexSafetyNet(now = new Date()) {
    // 1. retention — prune terminal rows older than cutoff: done/skipped, AND failed rows that
    //    exhausted retries (incl. orphans from orgs that disabled Perfex) so the table stays bounded.
    const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const pruned = await prisma.syncOutbox.deleteMany({
        where: {
            createdAt: { lt: retentionCutoff },
            OR: [
                { status: { in: ['done', 'skipped'] } },
                { status: 'failed', attempts: { gte: MAX_ATTEMPTS } },
            ],
        },
    });
    // 2. retry failed (attempts under cap) → back to pending — ONLY for orgs with Perfex enabled.
    //    (Disabled orgs would never get a flush scheduled in step 3, so their rows would pile up.)
    const enabledOrgIds = getEnabledOrgIds();
    const retried = enabledOrgIds.length === 0
        ? { count: 0 }
        : await prisma.syncOutbox.updateMany({
            where: { status: 'failed', attempts: { lt: MAX_ATTEMPTS }, orgId: { in: enabledOrgIds } },
            data: { status: 'pending' },
        });
    // 3. re-schedule flush for orgs with stale pending rows
    const staleCutoff = new Date(now.getTime() - STALE_PENDING_MS);
    const staleOrgs = await prisma.syncOutbox.findMany({
        where: { status: 'pending', createdAt: { lt: staleCutoff } },
        distinct: ['orgId'],
        select: { orgId: true },
    });
    let rescheduled = 0;
    for (const { orgId } of staleOrgs) {
        if (!isPerfexEnabled(orgId))
            continue;
        await schedulePerfexFlush(orgId, 0);
        rescheduled++;
    }
    if (pruned.count || retried.count || rescheduled) {
        logger.info({ pruned: pruned.count, retried: retried.count, rescheduled }, '[perfex] safety-net sweep');
    }
}
/** Start the periodic safety-net. Called once from the Perfex integration init. */
export function startPerfexSafetyNet() {
    if (timer)
        return;
    timer = setInterval(() => {
        runPerfexSafetyNet().catch((err) => logger.error({ err }, '[perfex] safety-net failed'));
    }, SWEEP_INTERVAL_MS);
    timer.unref?.(); // don't keep the process alive just for this
}
//# sourceMappingURL=perfex-safety-net.js.map