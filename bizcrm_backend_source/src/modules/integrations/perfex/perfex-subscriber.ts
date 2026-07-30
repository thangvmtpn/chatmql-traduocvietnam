// The ONLY bridge between core domain events and Perfex. Core emits generic events; this
// subscriber decides (per-org, opt-in) whether to enqueue a Perfex sync. Removing Perfex =
// delete this folder + the registerPerfexIntegration() call in app.ts.

import { registerIntegration } from '../registry.js'
import { onDomainEvent, type DomainEvent } from '../../../shared/domain-events.js'
import { isPerfexEnabled, refreshPerfexEnabledCache } from './perfex-enabled-cache.js'
import { startPerfexWorker } from './perfex-queue.js'
import { enqueueSync } from './perfex-outbox.js'
import { startPerfexSafetyNet } from './perfex-safety-net.js'
import { PERFEX_ORIGIN } from './perfex-types.js'

function handleEvent(e: DomainEvent): void {
  if (e.origin === PERFEX_ORIGIN) return // loop guard: ignore our own (future) reverse-sync writes
  if (!isPerfexEnabled(e.orgId)) return // optional / per-org — no work when disabled
  const localType = e.type.startsWith('company') ? 'company' : 'contact'
  const op = e.type.endsWith('deleted') ? 'delete' : 'upsert'
  void enqueueSync({ orgId: e.orgId, localType, localId: e.id, op })
}

/** Register the Perfex integration. Call once in app.ts before initIntegrations(). */
export function registerPerfexIntegration(): void {
  registerIntegration({
    name: 'perfex',
    init: async () => {
      await refreshPerfexEnabledCache()
      startPerfexWorker()
      startPerfexSafetyNet()
      onDomainEvent(handleEvent)
    },
  })
}
