/**
 * registry.ts — integration registry.
 *
 * Each integration self-registers `{ name, init }`. Boot calls `initIntegrations()` once.
 * Adding an integration = call registerIntegration(...) from its module + one register call
 * in app.ts. Removing one = delete its module + that call. Core code is never touched.
 */
import { logger } from '../../shared/logger.js'

export interface Integration {
  name: string
  /** Called once at boot. Wire subscribers, start workers, warm caches here. */
  init: () => Promise<void> | void
}

const registered: Integration[] = []

export function registerIntegration(integration: Integration): void {
  if (registered.some((i) => i.name === integration.name)) {
    logger.warn({ name: integration.name }, '[integrations] already registered, skipping')
    return
  }
  registered.push(integration)
}

/** Initialize all registered integrations. One failing init must not block the others. */
export async function initIntegrations(): Promise<void> {
  for (const integration of registered) {
    try {
      await integration.init()
      logger.info({ name: integration.name }, '[integrations] initialized')
    } catch (err) {
      logger.error({ err, name: integration.name }, '[integrations] init failed')
    }
  }
}
