/**
 * scenario-service.ts — Modular logic SCENARIOS (skills) for the harness.
 *
 * Unlike the 7 fixed AiLogicDoc types, scenarios are add/remove-able units:
 *   - loadMode='always' → injected into every reply (foundational logic)
 *   - loadMode='auto'   → injected only when semantically relevant to the turn
 *     (the description is embedded; selection reuses the RAG cosine threshold).
 * This scales to many scenarios: only short descriptions are embedded, and only
 * the relevant scenario's full content is loaded per turn.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma-client.js'
import { embedText, toVectorLiteral, DEFAULT_RAG_MIN_SCORE } from '../knowledge/embedding-service.js'
import { logger } from '../../shared/logger.js'
import type { ScenarioSnippet } from './harness/harness-types.js'

const LOAD_MODES = new Set(['always', 'auto'])
const MAX_CONTENT_CHARS = 2_000

export interface ScenarioInput {
  key?: string
  name: string
  description: string
  content: string
  loadMode?: string
  triggerHints?: string | null
  priority?: number
  enabled?: boolean
}

export interface ScenarioMeta {
  id: string
  key: string
  name: string
  description: string
  loadMode: string
  enabled: boolean
  priority: number
  version: number
  updatedAt: Date
}

export interface ScenarioRow extends ScenarioMeta {
  content: string
  triggerHints: string | null
  updatedBy: string | null
  createdAt: Date
}

const META_SELECT = {
  id: true, key: true, name: true, description: true, loadMode: true,
  enabled: true, priority: true, version: true, updatedAt: true,
} as const

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scenario'
}

function normMode(m?: string): 'always' | 'auto' {
  return m && LOAD_MODES.has(m) ? (m as 'always' | 'auto') : 'auto'
}

/** The text we embed for relevance selection: name + description + hints. */
function scenarioEmbedText(s: { name: string; description: string; triggerHints?: string | null }): string {
  return [s.name, s.description, s.triggerHints].filter(Boolean).join('\n')
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listScenarios(orgId: string, opts: { enabledOnly?: boolean } = {}): Promise<ScenarioMeta[]> {
  return prisma.aiScenario.findMany({
    where: { orgId, ...(opts.enabledOnly ? { enabled: true } : {}) },
    orderBy: [{ loadMode: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    select: META_SELECT,
  })
}

export async function getScenario(orgId: string, id: string): Promise<ScenarioRow | null> {
  return prisma.aiScenario.findFirst({
    where: { id, orgId },
    select: { ...META_SELECT, content: true, triggerHints: true, updatedBy: true, createdAt: true },
  })
}

export async function createScenario(orgId: string, input: ScenarioInput, by: string): Promise<ScenarioRow> {
  const key = (input.key?.trim() || slugify(input.name))
  const row = await prisma.aiScenario.create({
    data: {
      orgId,
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      content: input.content.trim().slice(0, MAX_CONTENT_CHARS),
      loadMode: normMode(input.loadMode),
      triggerHints: input.triggerHints?.trim() || null,
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
      updatedBy: by,
    },
    select: { ...META_SELECT, content: true, triggerHints: true, updatedBy: true, createdAt: true },
  })
  await embedAndStoreScenario(orgId, row.id).catch(() => { /* non-fatal */ })
  return row
}

export async function updateScenario(
  orgId: string,
  id: string,
  patch: Partial<ScenarioInput> & { changeNote?: string },
  by: string,
): Promise<ScenarioRow | null> {
  const cur = await prisma.aiScenario.findFirst({ where: { id, orgId } })
  if (!cur) return null

  const nextName = patch.name?.trim() ?? cur.name
  const nextDesc = patch.description?.trim() ?? cur.description
  const nextHints = patch.triggerHints !== undefined ? (patch.triggerHints?.trim() || null) : cur.triggerHints
  const nextMode = patch.loadMode !== undefined ? normMode(patch.loadMode) : cur.loadMode
  const nextContent = patch.content !== undefined ? patch.content.trim().slice(0, MAX_CONTENT_CHARS) : cur.content
  const versioned = nextName !== cur.name || nextDesc !== cur.description || nextContent !== cur.content || nextMode !== cur.loadMode

  if (versioned) {
    await prisma.aiScenarioVersion.create({
      data: {
        scenarioId: cur.id, version: cur.version, name: cur.name, description: cur.description,
        content: cur.content, loadMode: cur.loadMode, changedBy: by, changeNote: patch.changeNote ?? null,
      },
    })
  }

  const row = await prisma.aiScenario.update({
    where: { id },
    data: {
      name: nextName, description: nextDesc, content: nextContent, loadMode: nextMode,
      triggerHints: nextHints,
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      version: versioned ? cur.version + 1 : cur.version,
      updatedBy: by,
    },
    select: { ...META_SELECT, content: true, triggerHints: true, updatedBy: true, createdAt: true },
  })
  // Re-embed only when the selection text (name/description/hints) changed.
  if (nextName !== cur.name || nextDesc !== cur.description || nextHints !== cur.triggerHints) {
    await embedAndStoreScenario(orgId, id).catch(() => { /* non-fatal */ })
  }
  return row
}

export async function deleteScenario(orgId: string, id: string): Promise<boolean> {
  const res = await prisma.aiScenario.deleteMany({ where: { id, orgId } })
  return res.count > 0
}

export async function getScenarioVersions(orgId: string, id: string) {
  const sc = await prisma.aiScenario.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!sc) return null
  return prisma.aiScenarioVersion.findMany({
    where: { scenarioId: id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, name: true, loadMode: true, changedBy: true, changeNote: true, createdAt: true },
  })
}

// ── Embedding ───────────────────────────────────────────────────────────────

export async function embedAndStoreScenario(orgId: string, id: string): Promise<boolean> {
  const sc = await prisma.aiScenario.findFirst({
    where: { id, orgId }, select: { name: true, description: true, triggerHints: true },
  })
  if (!sc) return false
  const vec = await embedText(orgId, scenarioEmbedText(sc))
  if (!vec) return false
  const literal = toVectorLiteral(vec) // derived from float array — injection-safe
  await prisma.$executeRaw(
    Prisma.sql`UPDATE ai_scenarios SET embedding = ${literal}::vector WHERE id = ${id} AND org_id = ${orgId}`,
  )
  return true
}

/** Idempotent backfill of scenario embeddings (enabled, missing a vector). */
export async function backfillScenarioEmbeddings(orgId: string): Promise<{ embedded: number; failed: number }> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ai_scenarios WHERE org_id = ${orgId} AND enabled = true AND embedding IS NULL`,
  )
  let embedded = 0, failed = 0
  for (const r of rows) { (await embedAndStoreScenario(orgId, r.id)) ? embedded++ : failed++ }
  logger.info({ orgId, embedded, failed }, '[scenario] backfill complete')
  return { embedded, failed }
}

// ── Harness loading ───────────────────────────────────────────────────────────

/** All always-on scenarios (foundational logic injected every turn). */
export async function getAlwaysScenarios(orgId: string): Promise<ScenarioSnippet[]> {
  const rows = await prisma.aiScenario.findMany({
    where: { orgId, enabled: true, loadMode: 'always' },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, name: true, content: true },
  })
  return rows.map((r) => ({ id: r.id, name: r.name, content: r.content, loadMode: 'always' as const, score: null }))
}

type ScenarioSemanticRow = { id: string; name: string; content: string; score: number }

/**
 * Auto scenarios relevant to the turn — semantic selection over the description
 * embedding, gated by the same cosine threshold the KB/product tools use. This
 * is the "load on demand" path: only relevant scenarios' detail is injected.
 */
export async function retrieveRelevantScenarios(
  orgId: string,
  query: string,
  topK: number,
  minScore = DEFAULT_RAG_MIN_SCORE,
): Promise<ScenarioSnippet[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const vec = await embedText(orgId, trimmed)
    if (!vec) return []
    const literal = toVectorLiteral(vec)
    const rows = await prisma.$queryRaw<ScenarioSemanticRow[]>(
      Prisma.sql`
        SELECT id, name, content, (1 - (embedding <=> ${literal}::vector)) AS score
        FROM ai_scenarios
        WHERE org_id = ${orgId}
          AND enabled = true
          AND load_mode = 'auto'
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${topK}
      `,
    )
    return rows
      .filter((r) => Number(r.score) >= minScore)
      .map((r) => ({
        id: r.id, name: r.name, content: r.content, loadMode: 'auto' as const,
        score: Math.round(Number(r.score) * 1000) / 1000,
      }))
  } catch (err) {
    return []
  }
}
