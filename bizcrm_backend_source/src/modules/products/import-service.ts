/**
 * import-service.ts — Import products / knowledge from Google Sheet or raw CSV.
 * Column mapping: { field: 'Header name' }. orgId is always passed → company-scoped.
 * (Learns from FlowBot's CSV/Sheet import.)
 * Dedup: products by `code` (SKU); knowledge/FAQ by `title` (index field) scoped to the
 * group. If the index field is empty/unmapped → no dup check, just create.
 */
import { prisma } from '../../shared/prisma-client.js'
import { createProduct, updateProduct } from './product-service.js'
import { embedAndStoreProductsBatch } from './product-embedding.js'
import { createKbEntry, updateKbEntry } from '../knowledge/kb-service.js'

// ── CSV parsing (RFC-4180-ish: quotes, escaped quotes, newlines in quotes) ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Convert a Google Sheet share/edit URL into a CSV export URL. */
export function googleSheetCsvUrl(url: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return url // assume it's already a direct CSV url
  const id = idMatch[1]
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}

export async function fetchSheetRows(url: string): Promise<string[][]> {
  const csvUrl = googleSheetCsvUrl(url)
  const res = await fetch(csvUrl, { redirect: 'follow' })
  if (!res.ok) {
    const e = new Error('Không tải được Google Sheet (kiểm tra quyền chia sẻ công khai)') as Error & { statusCode: number }
    e.statusCode = 400
    throw e
  }
  return parseCsv(await res.text())
}

/** Build header→index lookup, then read a mapped field from a row. */
function rowReader(headers: string[]) {
  const idx = new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]))
  return (row: string[], header?: string): string | undefined => {
    if (!header) return undefined
    const i = idx.get(header.trim().toLowerCase())
    const v = i != null ? row[i] : undefined
    return v?.trim() || undefined
  }
}

export type ImportResult = { created: number; updated: number; skipped: number; errors: string[] }

type SpecFieldDef = { key: string; type?: string }

export async function importProducts(
  orgId: string,
  rows: string[][],
  mapping: Record<string, string>,
  opts: { categoryId?: string; specMapping?: Record<string, string> } = {},
): Promise<ImportResult> {
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
  if (rows.length < 2) return res
  const get = rowReader(rows[0])

  // Resolve the category's spec schema so mapped columns land in product.specs.
  let specFields: SpecFieldDef[] = []
  if (opts.categoryId && opts.specMapping && Object.keys(opts.specMapping).length > 0) {
    const cat = await prisma.productCategory.findFirst({
      where: { id: opts.categoryId, orgId },
      select: { specSchema: true },
    })
    const fields = (cat?.specSchema as { fields?: SpecFieldDef[] } | null)?.fields
    if (Array.isArray(fields)) specFields = fields
  }

  const touchedIds: string[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = get(row, mapping.name)
    if (!name) { res.skipped++; continue }
    const code = get(row, mapping.code)
    const priceStr = get(row, mapping.price)
    const specs = buildSpecs(row, get, specFields, opts.specMapping)
    const input = {
      name,
      code: code ?? null,
      categoryId: opts.categoryId ?? null,
      description: get(row, mapping.description) ?? null,
      notes: get(row, mapping.notes) ?? null,
      keywords: get(row, mapping.keywords) ?? null,
      price: priceStr ? Number(priceStr.replace(/[^\d.]/g, '')) || null : null,
      priceType: priceStr ? 'fixed' : 'contact',
      specs: Object.keys(specs).length > 0 ? specs : undefined,
      source: 'import',
    }
    try {
      const existing = code
        ? await prisma.product.findFirst({ where: { orgId, code }, select: { id: true } })
        : null
      if (existing) { await updateProduct(orgId, existing.id, input, { skipEmbed: true }); touchedIds.push(existing.id); res.updated++ }
      else { const created = await createProduct(orgId, input, undefined, { skipEmbed: true }); touchedIds.push(created.id); res.created++ }
    } catch (e: any) { res.errors.push(`Dòng ${r + 1}: ${e.message}`) }
  }

  // Embed every imported product in batched API calls (one request per ~96 rows),
  // NOT one call per row. Non-fatal: any row that fails here is recovered by the
  // manual "tạo embedding" backfill (also batched).
  if (touchedIds.length > 0) {
    await embedAndStoreProductsBatch(orgId, touchedIds).catch(() => { /* non-fatal */ })
  }
  return res
}

const BOOL_TRUE_RE = /^(true|1|có|yes|x)$/i

/** Map a row's columns into a typed specs object per the category schema. */
function buildSpecs(
  row: string[],
  get: (row: string[], header?: string) => string | undefined,
  specFields: SpecFieldDef[],
  specMapping?: Record<string, string>,
): Record<string, string | number | boolean> {
  const specs: Record<string, string | number | boolean> = {}
  if (!specMapping) return specs
  for (const f of specFields) {
    const col = specMapping[f.key]
    const raw = get(row, col)
    if (raw == null || raw === '') continue
    specs[f.key] =
      f.type === 'number' ? (Number(raw.replace(/[^\d.-]/g, '')) || 0)
        : f.type === 'boolean' ? BOOL_TRUE_RE.test(raw)
          : raw
  }
  return specs
}

export async function importKnowledge(
  orgId: string,
  rows: string[][],
  mapping: Record<string, string>,
  opts: { categoryId?: string; productId?: string; format?: string } = {},
): Promise<ImportResult> {
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }
  if (rows.length < 2) return res
  // Format follows the target group's kind (faq → qa, knowledge → article).
  // An explicit opts.format wins; with no group we default to article.
  const format = opts.format ?? (opts.categoryId ? await categoryFormat(orgId, opts.categoryId) : 'article')
  const get = rowReader(rows[0])
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const title = get(row, mapping.title) // câu hỏi / tiêu đề
    const content = get(row, mapping.content) // câu trả lời / nội dung
    // Articles need only content; FAQ rows need a question (title) too.
    if (!content || (format === 'qa' && !title)) { res.skipped++; continue }
    const keywords = get(row, mapping.keywords) ?? null
    try {
      // Dedup by the index field = title (FAQ question / article heading), scoped to
      // the target group. No title → skip the dup check and just create (per spec).
      const existing = title
        ? await prisma.knowledgeEntry.findFirst({
            where: { orgId, categoryId: opts.categoryId ?? null, title },
            select: { id: true },
          })
        : null
      if (existing) {
        await updateKbEntry(orgId, existing.id, { content, keywords, changeNote: 'import (dedup theo title)' }, 'import')
        res.updated++
      } else {
        await createKbEntry(orgId, {
          type: format === 'qa' ? 'faq' : 'description',
          title: title || null, content,
          risk: 'low',
          source: 'staff_manual',
          categoryId: opts.categoryId ?? null,
          productId: opts.productId ?? null,
          format,
          keywords,
        }, 'import')
        res.created++
      }
    } catch (e: any) { res.errors.push(`Dòng ${r + 1}: ${e.message}`) }
  }
  return res
}

/** Resolve a knowledge group's entry format from its kind. */
async function categoryFormat(orgId: string, categoryId: string): Promise<'qa' | 'article'> {
  const cat = await prisma.knowledgeCategory.findFirst({
    where: { id: categoryId, orgId }, select: { kind: true },
  })
  return cat?.kind === 'faq' ? 'qa' : 'article'
}
