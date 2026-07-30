/**
 * domain-events.ts — generic in-process domain-event bus.
 *
 * Core mutation code emits GENERIC events here (contact/company created/updated/deleted).
 * It has NO knowledge of any integration. Integrations (PerfexCRM, future HubSpot, …) attach
 * as subscribers via `onDomainEvent`. This keeps integrations decoupled + optional: adding or
 * removing one never touches core code.
 *
 * `emitDomainEvent` is synchronous and NEVER throws into the caller — a broken subscriber must
 * not break a core DB mutation. Subscribers should be fast + fire-and-forget.
 */
import { EventEmitter } from 'node:events'
import { logger } from './logger.js'

export type DomainEntityType = 'contact' | 'company'
export type DomainEventType =
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'company.created'
  | 'company.updated'
  | 'company.deleted'

export interface DomainEvent {
  type: DomainEventType
  orgId: string
  id: string
  /** Provenance — e.g. 'perfex-pull'. Lets integrations ignore their own writes (loop guard). */
  origin?: string
}

const EVENT = 'domain-event'
const emitter = new EventEmitter()
emitter.setMaxListeners(50) // many integrations may subscribe

/** Emit a domain event. Sync, fire-and-forget; swallows subscriber errors. */
export function emitDomainEvent(event: DomainEvent): void {
  try {
    emitter.emit(EVENT, event)
  } catch (err) {
    // Should never happen (handlers are wrapped) but guard the core path regardless.
    logger.error({ err, type: event.type }, '[domain-events] emit failed')
  }
}

/** Subscribe to all domain events. Returns an unsubscribe fn. */
export function onDomainEvent(handler: (event: DomainEvent) => void): () => void {
  const wrapped = (event: DomainEvent) => {
    try {
      handler(event)
    } catch (err) {
      logger.error({ err, type: event.type }, '[domain-events] subscriber threw')
    }
  }
  emitter.on(EVENT, wrapped)
  return () => emitter.off(EVENT, wrapped)
}
