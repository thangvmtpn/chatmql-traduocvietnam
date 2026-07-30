/**
 * tools-config-service.ts — Function-call registry + per-function guardrail.
 *
 * Stored as an AiLogicDoc type='tools' (JSON content), versioned + editable by the
 * AI Master (proposal logic_doc/tools). Each tool:
 *   { enabled: boolean, guardrail: { categoryIds: string[] } }   ([] = no limit)
 *
 * The responder reads this to know which tools to expose + how to scope each
 * tool's data access (guardrail enforced in code, not prompt).
 */
import { prisma } from '../../shared/prisma-client.js'
import { upsertLogicDoc } from './logic-doc-service.js'

// One knowledge tool (search_knowledge) covers BOTH FAQ (qa) and articles — the
// model no longer has to pick between two near-identical tools (a frequent mis-route).
// Legacy 'search_faq' keys in stored tools-docs are ignored by parseToolsDoc.
export type ToolName = 'search_products' | 'search_knowledge'
export const TOOL_NAMES: ToolName[] = ['search_products', 'search_knowledge']

export interface ToolGuardrail {
  /** Allowed category ids; empty = no limit (all categories of that kind). */
  categoryIds: string[]
}
export interface ToolConfig {
  enabled: boolean
  guardrail: ToolGuardrail
}
export type ToolsConfig = Record<ToolName, ToolConfig>

export function defaultToolsConfig(): ToolsConfig {
  return {
    search_products: { enabled: true, guardrail: { categoryIds: [] } },
    search_knowledge: { enabled: true, guardrail: { categoryIds: [] } },
  }
}

function coerceTool(raw: unknown): ToolConfig {
  const r = (raw ?? {}) as { enabled?: unknown; guardrail?: { categoryIds?: unknown } }
  const enabled = typeof r.enabled === 'boolean' ? r.enabled : true
  const ids = Array.isArray(r.guardrail?.categoryIds)
    ? (r.guardrail!.categoryIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  return { enabled, guardrail: { categoryIds: ids } }
}

/** Parse a tools-doc JSON string into a full config (missing tools → defaults). */
export function parseToolsDoc(content: string | null | undefined): ToolsConfig {
  const out = defaultToolsConfig()
  if (!content) return out
  try {
    const parsed = JSON.parse(content) as { tools?: Record<string, unknown> } & Record<string, unknown>
    const tools = (parsed.tools ?? parsed) as Record<string, unknown>
    for (const name of TOOL_NAMES) {
      if (tools && tools[name] !== undefined) out[name] = coerceTool(tools[name])
    }
  } catch {
    /* malformed JSON → defaults */
  }
  return out
}

export function serializeToolsDoc(cfg: ToolsConfig): string {
  return JSON.stringify({ version: 1, tools: cfg }, null, 2)
}

/**
 * Resolve the effective tools config for an org.
 * Source of truth = AiLogicDoc('tools'). Back-compat: until a tools doc exists,
 * seed guardrails from the legacy AiConfig allow-lists so prior config still applies.
 */
export async function getToolsConfig(orgId: string): Promise<ToolsConfig> {
  const doc = await prisma.aiLogicDoc.findFirst({
    where: { orgId, type: 'tools', isActive: true },
    select: { content: true },
  })
  if (doc?.content) return parseToolsDoc(doc.content)

  const cfg = await prisma.aiConfig.findUnique({
    where: { orgId },
    select: { allowedProductCategoryIds: true, allowedKnowledgeCategoryIds: true },
  })
  const prod = cfg?.allowedProductCategoryIds ?? []
  const know = cfg?.allowedKnowledgeCategoryIds ?? []
  return {
    search_products: { enabled: true, guardrail: { categoryIds: prod } },
    search_knowledge: { enabled: true, guardrail: { categoryIds: know } },
  }
}

/**
 * Merge a patch into the org's tools config and persist it (AiLogicDoc 'tools').
 * Patch shapes accepted:
 *   per-tool: { search_products: { enabled?, guardrail:{categoryIds} }, ... } (optionally under "tools")
 *   legacy:   { allowedProductCategoryIds:[...], allowedKnowledgeCategoryIds:[...] }
 * Validates category ids belong to the org (rejects unknown ids). Returns the new config.
 * Used by BOTH the Master proposal apply AND the settings UI.
 */
export async function applyToolsPatch(
  orgId: string,
  patch: Record<string, unknown>,
  updatedBy: string,
): Promise<ToolsConfig> {
  const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const next = await getToolsConfig(orgId)
  let touched = false

  // Legacy shape → map onto the search tools.
  if (Array.isArray(patch.allowedProductCategoryIds)) {
    next.search_products = { ...next.search_products, guardrail: { categoryIds: ids(patch.allowedProductCategoryIds) } }
    touched = true
  }
  if (Array.isArray(patch.allowedKnowledgeCategoryIds)) {
    const k = ids(patch.allowedKnowledgeCategoryIds)
    next.search_knowledge = { ...next.search_knowledge, guardrail: { categoryIds: k } }
    touched = true
  }

  // Per-tool shape (optionally nested under "tools").
  const toolsPatch = (patch.tools ?? patch) as Record<string, { enabled?: unknown; guardrail?: { categoryIds?: unknown } }>
  for (const name of TOOL_NAMES) {
    const t = toolsPatch[name]
    if (!t || typeof t !== 'object') continue
    next[name] = {
      enabled: typeof t.enabled === 'boolean' ? t.enabled : next[name].enabled,
      guardrail: { categoryIds: t.guardrail?.categoryIds !== undefined ? ids(t.guardrail.categoryIds) : next[name].guardrail.categoryIds },
    }
    touched = true
  }
  if (!touched) throw new Error('Không có trường tool/guardrail hợp lệ để cập nhật')

  // Validate ids exist for the org (reject hallucinated/typo ids).
  const prodIds = next.search_products.guardrail.categoryIds
  const knowIds = next.search_knowledge.guardrail.categoryIds
  if (prodIds.length) {
    const found = await prisma.productCategory.findMany({ where: { id: { in: prodIds }, orgId }, select: { id: true } })
    const missing = prodIds.filter((id) => !found.some((f) => f.id === id))
    if (missing.length) throw new Error(`Danh mục sản phẩm không hợp lệ: ${missing.join(', ')}`)
  }
  if (knowIds.length) {
    const found = await prisma.knowledgeCategory.findMany({ where: { id: { in: knowIds }, orgId }, select: { id: true } })
    const missing = knowIds.filter((id) => !found.some((f) => f.id === id))
    if (missing.length) throw new Error(`Nhóm kiến thức không hợp lệ: ${missing.join(', ')}`)
  }

  await upsertLogicDoc(orgId, 'tools', serializeToolsDoc(next), updatedBy, 'Cập nhật cấu hình function/tool')
  return next
}

/**
 * Human/AI-readable scope note for the responder prompt — tells the model
 * EXACTLY which tools it has and which categories each may query (by NAME).
 * The guardrail itself is enforced in code at the query layer regardless;
 * this note exists so the model doesn't hallucinate around its limits
 * (e.g. claim "shop không bán X" when X is merely outside its allowed scope).
 */
export async function buildToolScopeNote(orgId: string, tools: ToolsConfig): Promise<string> {
  const prodIds = tools.search_products.guardrail.categoryIds
  const knowIds = tools.search_knowledge.guardrail.categoryIds
  const [prodCats, knowCats] = await Promise.all([
    prodIds.length
      ? prisma.productCategory.findMany({ where: { orgId, id: { in: prodIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    knowIds.length
      ? prisma.knowledgeCategory.findMany({ where: { orgId, id: { in: knowIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ])

  const renderScope = (cfg: ToolConfig, label: string, cats: Array<{ id: string; name: string }>): string => {
    if (!cfg.enabled) return `- ${label}: ĐÃ TẮT — bạn KHÔNG có khả năng tra cứu phần này.`
    const names = cfg.guardrail.categoryIds
      .map((id) => cats.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[]
    if (names.length) return `- ${label}: CHỈ được tra trong danh mục: ${names.join(', ')}.`
    return `- ${label}: tất cả danh mục.`
  }

  return [
    renderScope(tools.search_products, 'Tra cứu SẢN PHẨM (search_products)', prodCats),
    renderScope(tools.search_knowledge, 'Tra cứu KIẾN THỨC & FAQ (search_knowledge)', knowCats),
  ].join('\n')
}
