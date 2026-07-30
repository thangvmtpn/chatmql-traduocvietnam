/**
 * memory-service.ts — ContactMemory CRUD + AI write-back (applyMemoryUpdates).
 * Thread memory = per-contact facts (L3). Global KB via kb-service.
 */
import { prisma } from '../../shared/prisma-client.js'
import { findSimilarEntry, createKbEntry } from './kb-service.js'

// ── Types ──────────────────────────────────────────────────────────────────────

export type MemoryRow = {
  id: string
  contactId: string
  orgId: string
  kind: string
  content: string
  source: string
  confidence: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type MemoryUpdate = {
  scope: 'thread' | 'global'
  kind: string
  content: string
  risk: 'low' | 'sensitive'
  confidence?: number
  title?: string   // required for global scope KB entry
  type?: string    // KB type for global scope
}

// Active facts limit per contact (prevent bloat)
const MAX_ACTIVE_FACTS = 30

// ── Normalization for dedup ───────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listContactMemory(
  orgId: string,
  contactId: string,
  onlyActive = false,
): Promise<MemoryRow[]> {
  return prisma.contactMemory.findMany({
    where: { orgId, contactId, ...(onlyActive ? { isActive: true } : {}) },
    orderBy: { createdAt: 'desc' },
  }) as unknown as MemoryRow[]
}

/**
 * Returns all active facts for L3 injection.
 */
export async function getThreadMemory(orgId: string, contactId: string): Promise<MemoryRow[]> {
  return prisma.contactMemory.findMany({
    where: { orgId, contactId, isActive: true },
    orderBy: { createdAt: 'asc' },
  }) as unknown as MemoryRow[]
}

export async function getMemoryFact(orgId: string, id: string): Promise<MemoryRow | null> {
  const row = await prisma.contactMemory.findFirst({ where: { id, orgId } })
  return row as unknown as MemoryRow | null
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function updateMemoryFact(
  orgId: string,
  id: string,
  patch: { content?: string; kind?: string; isActive?: boolean },
): Promise<MemoryRow | null> {
  const row = await prisma.contactMemory.findFirst({ where: { id, orgId } })
  if (!row) return null
  const updated = await prisma.contactMemory.update({
    where: { id },
    data: {
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  })
  return updated as unknown as MemoryRow
}

export async function deleteMemoryFact(orgId: string, id: string): Promise<boolean> {
  const row = await prisma.contactMemory.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!row) return false
  await prisma.contactMemory.delete({ where: { id } })
  return true
}

// ── Write-back ────────────────────────────────────────────────────────────────

/**
 * Applies memory updates from AI envelope:
 * - scope=thread → ContactMemory (dedup by normalized content)
 * - scope=global → KnowledgeEntry (dedup via findSimilarEntry; risk→status)
 * Does NOT block the caller — call fire-and-forget or await per design.
 */
export async function applyMemoryUpdates(
  orgId: string,
  convId: string,
  contactId: string,
  updates: MemoryUpdate[],
): Promise<void> {
  for (const u of updates) {
    try {
      if (u.scope === 'thread') {
        await applyThreadUpdate(orgId, contactId, u)
      } else {
        await applyGlobalUpdate(orgId, convId, u)
      }
    } catch (err) {
      // Non-critical — log but don't bubble up to caller
      console.error('[memory-service] applyMemoryUpdates error', { scope: u.scope, kind: u.kind, err })
    }
  }
}

async function applyThreadUpdate(orgId: string, contactId: string, u: MemoryUpdate): Promise<void> {
  const normContent = normalize(u.content)

  // Dedup: check active facts for normalized equality
  const existing = await prisma.contactMemory.findMany({
    where: { orgId, contactId, isActive: true },
    select: { id: true, content: true },
    take: MAX_ACTIVE_FACTS + 10,
  })

  const duplicate = existing.find((e) => normalize(e.content) === normContent)
  if (duplicate) return // already known

  // Enforce limit: soft cap — if over limit, skip (don't delete old facts)
  const activeCount = existing.length
  if (activeCount >= MAX_ACTIVE_FACTS) return

  await prisma.contactMemory.create({
    data: {
      orgId,
      contactId,
      kind: u.kind,
      content: u.content.trim(),
      source: 'ai_extracted',
      confidence: u.confidence ?? 0.7,
      isActive: true,
    },
  })
}

async function applyGlobalUpdate(orgId: string, convId: string, u: MemoryUpdate): Promise<void> {
  // Dedup: check if similar content already exists in KB
  const existingId = await findSimilarEntry(orgId, u.content)
  if (existingId) return // already in KB, skip

  const title = u.title ?? `[AI] ${u.kind}: ${u.content.slice(0, 60)}`
  const type = u.type ?? u.kind

  await createKbEntry(
    orgId,
    {
      type,
      title,
      content: u.content.trim(),
      risk: u.risk,
      source: 'ai_extracted',
      confidence: u.confidence ?? 0.5,
    },
    'ai',
  )
}
