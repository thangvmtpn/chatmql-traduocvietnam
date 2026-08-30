import { describe, it, expect, beforeEach } from 'vitest'
import {
  truncateData, recordDebug, getDebugLog, resetDebugLog,
  DEBUG_LOG_MAX, MAX_DATA_CHARS, MAX_SUMMARY_CHARS, MAX_LABEL_CHARS,
  MAX_ORG_BUFFERS, UNATTRIBUTED_MAX,
} from './debug-log.js'

const ORG_A = 'org-aaaa'
const ORG_B = 'org-bbbb'

beforeEach(() => resetDebugLog())

describe('truncateData', () => {
  it('passes small payloads through untouched', () => {
    const data = { uidFrom: '123', content: 'xin chào' }
    const result = truncateData(data)
    expect(result.truncated).toBe(false)
    expect(result.data).toBe(data)
  })

  it('leaves null / undefined alone', () => {
    expect(truncateData(undefined)).toEqual({ data: undefined, truncated: false })
    expect(truncateData(null)).toEqual({ data: null, truncated: false })
  })

  it('replaces an oversized payload with a capped preview', () => {
    // Mirrors group_event embedding a huge raw member array.
    const fat = { updateMembers: Array.from({ length: 500 }, (_, i) => ({ id: `u${i}`, name: `Thành viên ${i}` })) }
    const result = truncateData(fat)
    expect(result.truncated).toBe(true)
    const stored = result.data as { truncated: boolean; preview: string }
    expect(stored.truncated).toBe(true)
    expect(stored.preview).toHaveLength(MAX_DATA_CHARS)
    expect(JSON.stringify(result.data).length).toBeLessThan(JSON.stringify(fat).length)
  })

  it('survives a circular payload instead of throwing', () => {
    const circular: any = { a: 1 }
    circular.self = circular
    const result = truncateData(circular)
    expect(result.truncated).toBe(true)
    expect((result.data as any).preview).toContain('không serialize')
  })
})

describe('recordDebug', () => {
  it('stores and returns the entry with its org stamped', () => {
    const entry = recordDebug({ accountId: 'acc-1', event: 'message', summary: 'from=1', orgId: ORG_A })
    expect(entry.orgId).toBe(ORG_A)
    expect(entry.event).toBe('message')
    expect(entry.truncated).toBeUndefined()
    expect(getDebugLog(ORG_A)).toHaveLength(1)
  })

  it('flags truncated entries', () => {
    const fat = { blob: 'x'.repeat(MAX_DATA_CHARS * 2) }
    const entry = recordDebug({ accountId: 'acc-1', event: 'group_event', summary: 's', data: fat, orgId: ORG_A })
    expect(entry.truncated).toBe(true)
  })

  // A webhook-controlled value (the OA id) is interpolated straight into
  // `summary`, so an oversized one must not reach the buffer verbatim.
  it('clamps summary, event and accountId built from webhook input', () => {
    const entry = recordDebug({
      accountId: 'oa:'.padEnd(5000, 'x'),
      event: `oa:${'e'.repeat(5000)}`,
      summary: `oa=${'9'.repeat(5000)} (UNKNOWN)`,
      orgId: null,
    })
    expect(entry.summary).toHaveLength(MAX_SUMMARY_CHARS + 1) // + the … marker
    expect(entry.summary.endsWith('…')).toBe(true)
    expect(entry.event).toHaveLength(MAX_LABEL_CHARS + 1)
    expect(entry.accountId).toHaveLength(MAX_LABEL_CHARS + 1)
  })

  it('leaves normal-length strings untouched', () => {
    const entry = recordDebug({ accountId: 'acc-1', event: 'message', summary: 'from=1 thread=2', orgId: ORG_A })
    expect(entry.summary).toBe('from=1 thread=2')
    expect(entry.accountId).toBe('acc-1')
    expect(entry.event).toBe('message')
  })

  it('derives ts from the injected clock', () => {
    const now = Date.parse('2026-07-24T10:00:00.000Z')
    const entry = recordDebug({ accountId: 'acc-1', event: 'e', summary: 's', orgId: ORG_A }, now)
    expect(entry.ts).toBe('2026-07-24T10:00:00.000Z')
  })
})

describe('per-org isolation', () => {
  it('never leaks one org\'s entries into another\'s log', () => {
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'bí mật của A', orgId: ORG_A })
    recordDebug({ accountId: 'acc-b', event: 'message', summary: 'bí mật của B', orgId: ORG_B })

    const a = getDebugLog(ORG_A)
    expect(a).toHaveLength(1)
    expect(a[0].summary).toBe('bí mật của A')
    expect(a.some(e => e.summary.includes('của B'))).toBe(false)
  })

  it('returns an empty log for an org that produced nothing', () => {
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 's', orgId: ORG_A })
    expect(getDebugLog('org-never-seen')).toEqual([])
  })

  it('does not expose the internal buffer for mutation', () => {
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 's', orgId: ORG_A })
    getDebugLog(ORG_A).push({ ts: 'x', accountId: 'y', event: 'z', summary: 'injected' })
    expect(getDebugLog(ORG_A)).toHaveLength(1)
  })
})

describe('unattributed entries', () => {
  it('are visible to every org, merged in timestamp order', () => {
    const t0 = Date.parse('2026-07-24T10:00:00.000Z')
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'của A', orgId: ORG_A }, t0)
    recordDebug({ accountId: 'oa:unknown', event: 'oa:follow', summary: 'OA lạ', orgId: null }, t0 + 1000)

    for (const org of [ORG_A, ORG_B]) {
      const log = getDebugLog(org)
      expect(log.some(e => e.accountId === 'oa:unknown')).toBe(true)
      expect(log.map(e => e.ts)).toEqual([...log.map(e => e.ts)].sort())
    }
    // ...but org B still only sees the unattributed one, not A's event.
    expect(getDebugLog(ORG_B)).toHaveLength(1)
  })
})

describe('ring buffer capacity', () => {
  it('caps at DEBUG_LOG_MAX and evicts oldest first', () => {
    for (let i = 0; i < DEBUG_LOG_MAX + 50; i++) {
      recordDebug({ accountId: 'acc-a', event: 'message', summary: `#${i}`, orgId: ORG_A })
    }
    const log = getDebugLog(ORG_A)
    expect(log).toHaveLength(DEBUG_LOG_MAX)
    expect(log[0].summary).toBe('#50')
    expect(log[log.length - 1].summary).toBe(`#${DEBUG_LOG_MAX + 49}`)
  })

  it('defaults to 2000 per org', () => {
    expect(DEBUG_LOG_MAX).toBe(2000)
  })

  it('caps each org independently', () => {
    for (let i = 0; i < DEBUG_LOG_MAX + 10; i++) {
      recordDebug({ accountId: 'acc-a', event: 'message', summary: `a${i}`, orgId: ORG_A })
    }
    recordDebug({ accountId: 'acc-b', event: 'message', summary: 'b0', orgId: ORG_B })
    expect(getDebugLog(ORG_B)).toHaveLength(1)
    expect(getDebugLog(ORG_A)).toHaveLength(DEBUG_LOG_MAX)
  })
})

describe('shared unattributed bucket', () => {
  // The OA webhook feeding this bucket is public and its signature check is
  // still advisory, so anyone can flood it. Keep the blast radius small.
  it('has a much smaller cap than a real org buffer', () => {
    expect(UNATTRIBUTED_MAX).toBeLessThan(DEBUG_LOG_MAX)
    for (let i = 0; i < UNATTRIBUTED_MAX + 100; i++) {
      recordDebug({ accountId: 'oa:unknown', event: 'oa:spam', summary: `#${i}`, orgId: null })
    }
    expect(getDebugLog(ORG_A)).toHaveLength(UNATTRIBUTED_MAX)
  })

  it('is not evicted by LRU pressure from busy orgs', () => {
    const t0 = Date.parse('2026-07-24T10:00:00.000Z')
    recordDebug({ accountId: 'oa:unknown', event: 'oa:x', summary: 'shared', orgId: null }, t0)
    for (let i = 0; i < MAX_ORG_BUFFERS + 5; i++) {
      recordDebug({ accountId: `acc-${i}`, event: 'message', summary: `o${i}`, orgId: `org-${i}` }, t0 + i)
    }
    expect(getDebugLog('org-never-pushed').some(e => e.summary === 'shared')).toBe(true)
  })
})

describe('org buffer ceiling', () => {
  it('evicts the least-recently-written org past MAX_ORG_BUFFERS', () => {
    const t0 = Date.parse('2026-07-24T10:00:00.000Z')
    // org-0 is written first and never touched again → the LRU victim.
    for (let i = 0; i < MAX_ORG_BUFFERS; i++) {
      recordDebug({ accountId: `acc-${i}`, event: 'message', summary: `o${i}`, orgId: `org-${i}` }, t0 + i)
    }
    expect(getDebugLog('org-0')).toHaveLength(1)

    recordDebug({ accountId: 'acc-new', event: 'message', summary: 'new', orgId: 'org-new' }, t0 + 10_000)
    expect(getDebugLog('org-0')).toEqual([])
    expect(getDebugLog('org-new')).toHaveLength(1)
    expect(getDebugLog(`org-${MAX_ORG_BUFFERS - 1}`)).toHaveLength(1)
  })
})

describe('stored entries are immutable', () => {
  it('rejects mutation of an entry handed out by getDebugLog', () => {
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'gốc', orgId: ORG_A })
    const entry = getDebugLog(ORG_A)[0]
    expect(() => { (entry as any).summary = 'bị sửa' }).toThrow()
    expect(getDebugLog(ORG_A)[0].summary).toBe('gốc')
  })
})

describe('idle buffer eviction', () => {
  const HOUR = 60 * 60 * 1000

  it('drops buffers untouched for over 24h', () => {
    const t0 = Date.parse('2026-07-24T10:00:00.000Z')
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'cũ', orgId: ORG_A }, t0)
    expect(getDebugLog(ORG_A)).toHaveLength(1)

    // A push 25h later triggers the hourly sweep, which reaps org A.
    recordDebug({ accountId: 'acc-b', event: 'message', summary: 'mới', orgId: ORG_B }, t0 + 25 * HOUR)
    expect(getDebugLog(ORG_A)).toEqual([])
    expect(getDebugLog(ORG_B)).toHaveLength(1)
  })

  it('keeps buffers that are still active', () => {
    const t0 = Date.parse('2026-07-24T10:00:00.000Z')
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'a', orgId: ORG_A }, t0)
    recordDebug({ accountId: 'acc-a', event: 'message', summary: 'a2', orgId: ORG_A }, t0 + 23 * HOUR)
    recordDebug({ accountId: 'acc-b', event: 'message', summary: 'b', orgId: ORG_B }, t0 + 25 * HOUR)
    expect(getDebugLog(ORG_A)).toHaveLength(2)
  })
})
