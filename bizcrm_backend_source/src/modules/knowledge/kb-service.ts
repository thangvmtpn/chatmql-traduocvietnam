/**
 * kb-service.ts — KnowledgeEntry CRUD + versioning + hybrid approval.
 * "Sensitive" risk (price/policy/commitment) → status=pending; else → active.
 * Retrieval: keyword ILIKE (primary) + semantic vector search (when embedding available).
 */
import { prisma } from '../../shared/prisma-client.js'
import { enqueueEmbed } from '../../shared/queue.js'

const SENSITIVE_TYPES = new Set(['price', 'policy', 'commitment'])

function deriveStatus(risk: string): string {
  return risk === 'sensitive' ? 'pending' : 'active'
}

const LABEL_MAX_CHARS = 80

/**
 * A display/search label for an entry. FAQ entries have a real title (the
 * question); articles have none, so fall back to the content's first line.
 */
export function deriveKbLabel(title: string | null | undefined, content: string): string {
  const t = title?.trim()
  if (t) return t
  const firstLine = content.trim().split('\n')[0]
  return firstLine.length > LABEL_MAX_CHARS ? firstLine.slice(0, LABEL_MAX_CHARS) + '…' : firstLine
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type KbEntryInput = {
  type: string
  title?: string | null // bài viết (article) không có tiêu đề
  content: string
  risk: string
  source: string
  confidence?: number
  categoryId?: string | null
  productId?: string | null
  format?: string // qa | article
  keywords?: string | null
}

export type KbEntryRow = {
  id: string
  orgId: string
  type: string
  title: string | null
  content: string
  status: string
  risk: string
  source: string
  confidence: number | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export type KbSnippet = {
  id: string
  title: string
  content: string
  type: string
  /** Cosine similarity 0..1 for semantic hits; null for keyword-only matches. */
  score?: number | null
}

// ── Queries ───────────────────────────────────────────────────────────────────

export type KbListFilters = { status?: string; categoryId?: string; productId?: string; type?: string; format?: string }

export async function listKbEntries(
  orgId: string,
  statusOrFilters?: string | KbListFilters,
): Promise<KbEntryRow[]> {
  const f: KbListFilters = typeof statusOrFilters === 'string' ? { status: statusOrFilters } : (statusOrFilters ?? {})
  return prisma.knowledgeEntry.findMany({
    where: {
      orgId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.format ? { format: f.format } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  }) as unknown as KbEntryRow[]
}

export async function getKbEntry(orgId: string, id: string): Promise<KbEntryRow | null> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, orgId } })
  return entry as unknown as KbEntryRow | null
}

export async function getKbEntryVersions(orgId: string, entryId: string) {
  // Verify ownership
  const entry = await prisma.knowledgeEntry.findFirst({
    where: { id: entryId, orgId },
    select: { id: true },
  })
  if (!entry) return null

  return prisma.knowledgeEntryVersion.findMany({
    where: { entryId },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, changedBy: true, changeNote: true, createdAt: true },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createKbEntry(
  orgId: string,
  input: KbEntryInput,
  createdBy: string,
): Promise<KbEntryRow> {
  const status = deriveStatus(input.risk)
  const entry = await prisma.knowledgeEntry.create({
    data: {
      orgId,
      type: input.type,
      title: input.title?.trim() || null,
      content: input.content.trim(),
      status,
      risk: input.risk,
      source: input.source,
      confidence: input.confidence ?? 0,
      version: 1,
      categoryId: input.categoryId ?? null,
      productId: input.productId ?? null,
      format: input.format ?? (input.type === 'faq' ? 'qa' : 'article'),
      keywords: input.keywords ?? null,
    },
  })
  // Enqueue embedding asynchronously — do not block the write
  enqueueEmbed(orgId, entry.id).catch(() => { /* non-fatal */ })
  return entry as unknown as KbEntryRow
}

export async function updateKbEntry(
  orgId: string,
  id: string,
  patch: Partial<KbEntryInput> & { changeNote?: string },
  updatedBy: string,
): Promise<KbEntryRow | null> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, orgId } })
  if (!entry) return null

  const contentChanged = patch.content !== undefined && patch.content.trim() !== entry.content

  // Snapshot current version if content changed
  if (contentChanged) {
    await prisma.knowledgeEntryVersion.create({
      data: {
        entryId: entry.id,
        version: entry.version,
        content: entry.content,
        changedBy: updatedBy,
        changeNote: patch.changeNote ?? null,
      },
    })
  }

  const newRisk = patch.risk ?? entry.risk
  const newStatus = contentChanged || patch.risk !== undefined ? deriveStatus(newRisk) : entry.status

  const updated = await prisma.knowledgeEntry.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title?.trim() || null } : {}),
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.risk !== undefined ? { risk: newRisk } : {}),
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
      ...(patch.format !== undefined ? { format: patch.format } : {}),
      ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {}),
      status: newStatus,
      version: contentChanged ? entry.version + 1 : entry.version,
    },
  })
  // Re-embed when title or content changes
  if (contentChanged || patch.title !== undefined) {
    enqueueEmbed(orgId, id).catch(() => { /* non-fatal */ })
  }
  return updated as unknown as KbEntryRow
}

export async function deleteKbEntry(orgId: string, id: string): Promise<boolean> {
  // Atomic + tenant-scoped (no check-then-act gap)
  const res = await prisma.knowledgeEntry.deleteMany({ where: { id, orgId } })
  return res.count > 0
}

// ── Approval actions ──────────────────────────────────────────────────────────

export async function approveEntry(orgId: string, id: string, by: string): Promise<KbEntryRow | null> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, orgId } })
  if (!entry) return null
  const updated = await prisma.knowledgeEntry.update({
    where: { id },
    data: { status: 'active' },
  })
  // Entry is now active — ensure embedding is up to date
  enqueueEmbed(orgId, id).catch(() => { /* non-fatal */ })
  return updated as unknown as KbEntryRow
}

export async function rejectEntry(orgId: string, id: string, by: string): Promise<KbEntryRow | null> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, orgId } })
  if (!entry) return null
  const updated = await prisma.knowledgeEntry.update({
    where: { id },
    data: { status: 'rejected' },
  })
  return updated as unknown as KbEntryRow
}

export async function revertEntry(
  orgId: string,
  id: string,
  targetVersion: number,
  revertedBy: string,
): Promise<KbEntryRow | null> {
  const entry = await prisma.knowledgeEntry.findFirst({ where: { id, orgId } })
  if (!entry) return null

  const versionRow = await prisma.knowledgeEntryVersion.findFirst({
    where: { entryId: id, version: targetVersion },
  })
  if (!versionRow) return null

  // Snapshot current before revert
  await prisma.knowledgeEntryVersion.create({
    data: {
      entryId: id,
      version: entry.version,
      content: entry.content,
      changedBy: revertedBy,
      changeNote: `Before revert to v${targetVersion}`,
    },
  })

  const updated = await prisma.knowledgeEntry.update({
    where: { id },
    data: {
      content: versionRow.content,
      version: entry.version + 1,
      status: deriveStatus(entry.risk), // respect approval workflow (sensitive → pending, not force-active)
    },
  })
  return updated as unknown as KbEntryRow
}

// ── RAG retrieval ─────────────────────────────────────────────────────────────

const MAX_CONTENT_CHARS = 600
const MAX_SNIPPET_CHARS = 400

/**
 * Keyword retrieval: ILIKE over title+content, active entries only.
 * Returns topK snippets sorted by title match first, then content match.
 */
export async function retrieveKb(
  orgId: string,
  query: string,
  topK = 5,
  opts?: { categoryIds?: string[]; format?: string },
): Promise<KbSnippet[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // Split into words for multi-term ILIKE search; cap at 6 tokens
  const tokens = trimmed
    .split(/\s+/)
    .slice(0, 6)
    .filter((t) => t.length >= 2)

  if (tokens.length === 0) return []

  // Build WHERE: any token must match title OR content
  const conditions = tokens.map((t) => ({
    OR: [
      { title: { contains: t, mode: 'insensitive' as const } },
      { content: { contains: t, mode: 'insensitive' as const } },
      { keywords: { contains: t, mode: 'insensitive' as const } },
    ],
  }))

  const rows = await prisma.knowledgeEntry.findMany({
    where: {
      orgId,
      status: 'active',
      // Guardrail: restrict to allowed knowledge categories (empty = no limit).
      ...(opts?.categoryIds?.length ? { categoryId: { in: opts.categoryIds } } : {}),
      // Optional format filter (qa|article). The merged search_knowledge tool omits
      // it → searches ALL formats. Kept for callers that still want a single format.
      ...(opts?.format ? { format: opts.format } : {}),
      AND: conditions,
    },
    orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    take: Math.min(topK * 3, 20), // over-fetch then rank
    select: { id: true, title: true, content: true, type: true, keywords: true },
  })

  // Simple rank: count token matches in title (weight 2) + content (weight 1)
  const lowerTokens = tokens.map((t) => t.toLowerCase())

  const ranked = rows
    .map((r) => {
      const titleLower = (r.title ?? '').toLowerCase()
      const contentLower = r.content.toLowerCase()
      const keywordsLower = (r.keywords ?? '').toLowerCase()
      const score = lowerTokens.reduce((acc, t) => {
        return acc + (titleLower.includes(t) ? 2 : 0) + (keywordsLower.includes(t) ? 2 : 0) + (contentLower.includes(t) ? 1 : 0)
      }, 0)
      return { ...r, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return ranked.map((r) => ({
    id: r.id,
    title: deriveKbLabel(r.title, r.content),
    content: r.content.length > MAX_SNIPPET_CHARS ? r.content.slice(0, MAX_SNIPPET_CHARS) + '…' : r.content,
    type: r.type,
    score: null, // keyword match — no cosine score
  }))
}

// ── Dedup helper (used by memory-service write-back) ─────────────────────────

const NORMALIZE_RE = /\s+/g

function normalizeText(s: string): string {
  return s.toLowerCase().replace(NORMALIZE_RE, ' ').trim()
}

/**
 * Check if a similar active entry exists (normalized equality).
 * Returns matching entry id or null.
 */
export async function findSimilarEntry(orgId: string, content: string): Promise<string | null> {
  const norm = normalizeText(content)
  const candidates = await prisma.knowledgeEntry.findMany({
    where: { orgId, status: 'active' },
    select: { id: true, content: true },
    take: 200,
  })
  for (const c of candidates) {
    if (normalizeText(c.content) === norm) return c.id
  }
  return null
}
