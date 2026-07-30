import { describe, it, expect, vi } from 'vitest'
import { emitDomainEvent, onDomainEvent, type DomainEvent } from './domain-events.js'

describe('domain-events bus', () => {
  it('delivers events to subscribers', () => {
    const got: DomainEvent[] = []
    const off = onDomainEvent((e) => got.push(e))
    emitDomainEvent({ type: 'contact.created', orgId: 'o1', id: 'c1' })
    emitDomainEvent({ type: 'company.deleted', orgId: 'o2', id: 'co9', origin: 'perfex-pull' })
    off()
    expect(got).toHaveLength(2)
    expect(got[0]).toEqual({ type: 'contact.created', orgId: 'o1', id: 'c1' })
    expect(got[1].origin).toBe('perfex-pull')
  })

  it('isolates subscriber errors — a throwing handler never breaks emit or other handlers', () => {
    const got: string[] = []
    const offThrow = onDomainEvent(() => { throw new Error('boom') })
    const offOk = onDomainEvent((e) => got.push(e.type))
    expect(() => emitDomainEvent({ type: 'contact.updated', orgId: 'o', id: 'c' })).not.toThrow()
    expect(got).toEqual(['contact.updated']) // the good subscriber still ran
    offThrow(); offOk()
  })

  it('unsubscribe stops delivery', () => {
    const fn = vi.fn()
    const off = onDomainEvent(fn)
    off()
    emitDomainEvent({ type: 'contact.deleted', orgId: 'o', id: 'c' })
    expect(fn).not.toHaveBeenCalled()
  })
})
