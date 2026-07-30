// Write a pending outbox row + schedule a debounced flush. Fire-and-forget:
// never throws into the (request-path) caller.

import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import { getDebounceSeconds } from './perfex-enabled-cache.js'
import { schedulePerfexFlush } from './perfex-queue.js'
import type { LocalType } from './perfex-types.js'

export interface EnqueueInput {
  orgId: string
  localType: LocalType // 'company' | 'contact' (biz-crm entity; lead-vs-contact decided at flush)
  localId: string
  op: 'upsert' | 'delete'
}

export async function enqueueSync(input: EnqueueInput): Promise<void> {
  try {
    await prisma.syncOutbox.create({ data: { ...input, status: 'pending' } })
    await schedulePerfexFlush(input.orgId, getDebounceSeconds(input.orgId) * 1000)
  } catch (err) {
    // Outbox is best-effort; a periodic safety-net (Phase 05) reconciles missed rows.
    logger.error({ err, orgId: input.orgId, localType: input.localType }, '[perfex] enqueueSync failed')
  }
}
