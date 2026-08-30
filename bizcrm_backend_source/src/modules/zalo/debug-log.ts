/**
 * debug-log.ts — in-memory ring buffer behind the admin event log.
 *
 * Holds capacity, truncation, per-org isolation and eviction policy with no
 * prisma / socket / zca-js imports, so it can be unit-tested directly. Callers
 * go through pushDebug() in zalo-pool.ts, which resolves the orgId for an
 * account and fans the stored entry out over Socket.IO.
 *
 * NOT persisted — everything here dies with the process.
 */

export interface DebugLogEntry {
  ts: string
  accountId: string
  event: string
  summary: string
  data?: any
  orgId?: string | null
  truncated?: boolean
}

// Capacity is PER ORG, not global — a noisy tenant must not evict everyone
// else's events. Overridable via env so prod can tune without a rebuild.
export const DEBUG_LOG_MAX = Math.max(100, Number(process.env.DEBUG_LOG_MAX) || 2000)
// Payload cap. `group_event` embeds the raw member array, which is unbounded:
// one "add 50 members" event could otherwise hold tens of KB in a single entry.
export const MAX_DATA_CHARS = 2000
// The string fields are built from webhook-controlled values too (an OA id goes
// straight into `summary`), so they need their own ceiling — capping only
// `data` would leave the buffer's memory budget wide open.
export const MAX_SUMMARY_CHARS = 500
export const MAX_LABEL_CHARS = 200
// Buffers for orgs that fall silent are dropped so the Map can't grow forever.
const ORG_BUFFER_TTL_MS = 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
// Per-org buffers multiply: without a ceiling the worst case is
// (# orgs active in 24h) × DEBUG_LOG_MAX entries, which is unbounded in a way
// the old single global buffer was not. Least-recently-used org gets dropped.
export const MAX_ORG_BUFFERS = Math.max(1, Number(process.env.DEBUG_LOG_MAX_ORGS) || 50)
/** Bucket for events that belong to no tenant (e.g. webhook from an unconnected OA). */
export const UNATTRIBUTED = '__unattributed__'
// This bucket is shown to EVERY org, and the OA webhook that feeds it is public
// with signature verification still in grace mode — so anyone can push into it.
// Keep it small: a flood then costs little memory and can't crowd out much.
export const UNATTRIBUTED_MAX = 200

interface OrgBuffer {
  entries: DebugLogEntry[]
  lastPushAt: number
}

const buffers = new Map<string, OrgBuffer>()
let lastSweepAt = 0

/**
 * Cap an entry payload. Oversized payloads are replaced by a JSON prefix so a
 * single fat event can't blow the buffer's memory budget.
 */
export function truncateData(data: unknown): { data: unknown; truncated: boolean } {
  if (data === undefined || data === null) return { data, truncated: false }
  let json: string | undefined
  try {
    json = JSON.stringify(data)
  } catch {
    // Circular refs, BigInt, etc. — keep the entry, drop the payload.
    return { data: { truncated: true, preview: '[payload không serialize được]' }, truncated: true }
  }
  // JSON.stringify returns undefined for functions/symbols.
  if (json === undefined) return { data: undefined, truncated: false }
  if (json.length <= MAX_DATA_CHARS) return { data, truncated: false }
  return { data: { truncated: true, preview: json.slice(0, MAX_DATA_CHARS) }, truncated: true }
}

/** Cap a display string, marking it so a reader knows it was cut. */
function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

function sweepIdleBuffers(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now
  for (const [key, buf] of buffers) {
    if (now - buf.lastPushAt > ORG_BUFFER_TTL_MS) buffers.delete(key)
  }
}

/** Drop the least-recently-written org buffer to stay under MAX_ORG_BUFFERS. */
function evictLeastRecentBuffer() {
  let oldestKey: string | null = null
  let oldestAt = Infinity
  for (const [key, buf] of buffers) {
    // The shared bucket is every org's only view of unattributed events —
    // it ages out via the idle sweep, not via LRU pressure from busy tenants.
    if (key === UNATTRIBUTED) continue
    if (buf.lastPushAt < oldestAt) {
      oldestAt = buf.lastPushAt
      oldestKey = key
    }
  }
  if (oldestKey) buffers.delete(oldestKey)
}

export interface DebugInput {
  accountId: string
  event: string
  summary: string
  data?: unknown
  /** null when the event cannot be attributed to a tenant. */
  orgId: string | null
}

/** Build, truncate and store an entry. Returns what was stored. */
export function recordDebug(input: DebugInput, now: number = Date.now()): DebugLogEntry {
  const { data: safeData, truncated } = truncateData(input.data)
  const entry: DebugLogEntry = {
    ts: new Date(now).toISOString(),
    accountId: clamp(input.accountId, MAX_LABEL_CHARS),
    event: clamp(input.event, MAX_LABEL_CHARS),
    summary: clamp(input.summary, MAX_SUMMARY_CHARS),
    data: safeData,
    orgId: input.orgId,
    ...(truncated ? { truncated: true } : {}),
  }

  // Frozen so a caller holding a reference (getDebugLog hands out the stored
  // objects) can't mutate what the buffer — or another org's view of a shared
  // unattributed entry — reports.
  Object.freeze(entry)

  const key = input.orgId ?? UNATTRIBUTED
  let buf = buffers.get(key)
  if (!buf) {
    if (key !== UNATTRIBUTED && buffers.size >= MAX_ORG_BUFFERS) evictLeastRecentBuffer()
    buf = { entries: [], lastPushAt: now }
    buffers.set(key, buf)
  }
  buf.entries.push(entry)
  buf.lastPushAt = now

  const cap = key === UNATTRIBUTED ? UNATTRIBUTED_MAX : DEBUG_LOG_MAX
  if (buf.entries.length > cap) buf.entries.shift()

  sweepIdleBuffers(now)
  return entry
}

/** Entries visible to `orgId`, oldest first. */
export function getDebugLog(orgId: string): DebugLogEntry[] {
  const own = buffers.get(orgId)?.entries ?? []
  // Unattributed entries carry an envelope-only payload by construction, so
  // they're safe to show to every admin — and they're exactly what you need to
  // debug an OA that was never hooked up to a tenant.
  const unattributed = buffers.get(UNATTRIBUTED)?.entries ?? []
  if (!unattributed.length) return [...own]
  return [...own, ...unattributed].sort((a, b) => a.ts.localeCompare(b.ts))
}

/** Test helper — drops every buffer. */
export function resetDebugLog(): void {
  buffers.clear()
  lastSweepAt = 0
}
