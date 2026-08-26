// Write a pending outbox row + schedule a debounced flush. Fire-and-forget:
// never throws into the (request-path) caller.
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
import { getDebounceSeconds } from './perfex-enabled-cache.js';
import { schedulePerfexFlush } from './perfex-queue.js';
export async function enqueueSync(input) {
    try {
        await prisma.syncOutbox.create({ data: { ...input, status: 'pending' } });
        await schedulePerfexFlush(input.orgId, getDebounceSeconds(input.orgId) * 1000);
    }
    catch (err) {
        // Outbox is best-effort; a periodic safety-net (Phase 05) reconciles missed rows.
        logger.error({ err, orgId: input.orgId, localType: input.localType }, '[perfex] enqueueSync failed');
    }
}
//# sourceMappingURL=perfex-outbox.js.map