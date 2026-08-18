/**
 * tools-runtime.ts — Function-call tool registry for the responder agent loop.
 *
 * Each tool = OpenAI function schema (the model sees) + an executor that runs the
 * retrieval and ENFORCES that tool's guardrail (allowed categories) in code.
 * Disabled tools are never exposed. Used by reply-generator's agentic loop.
 */
import { retrieveProductSemantic } from '../../products/product-embedding.js'
import { formatProductPrice } from '../../products/product-price.js'
import { retrieveKb } from '../../knowledge/kb-service.js'
import { retrieveKbSemantic } from '../../knowledge/embedding-service.js'
import { aggregate } from '../../products/product-query-service.js'
import { TOOL_NAMES, type ToolName, type ToolsConfig } from '../tools-config-service.js'
import type { OpenaiToolDef } from '../providers/openai.js'

const QUERY_PARAM = {
  type: 'object',
  properties: { query: { type: 'string', description: 'Truy vấn tìm kiếm bằng tiếng Việt theo nhu cầu của khách' } },
  required: ['query'],
} as const

const TOOL_SCHEMAS: Record<ToolName, { description: string }> = {
  search_products: { description: 'Tra cứu SẢN PHẨM trong catalog (tên, mô tả, giá) để tư vấn/báo giá. Dùng khi khách hỏi về một sản phẩm cụ thể hoặc giá sản phẩm.' },
  search_knowledge: { description: 'Tra cứu KIẾN THỨC: câu hỏi thường gặp (FAQ/hỏi-đáp ngắn) LẪN bài viết dài (chính sách, hướng dẫn, thông tin/giới thiệu, bảng giá dịch vụ). Dùng cho MỌI câu hỏi thông tin/kiến thức (không phải giá một sản phẩm cụ thể).' },
}

// Action tool — always available; lets the AI escalate to a human itself.
export const HANDOFF_TOOL = 'request_handoff'
const HANDOFF_DEF: OpenaiToolDef = {
  type: 'function',
  function: {
    name: HANDOFF_TOOL,
    description: 'Chuyển hội thoại cho NHÂN VIÊN khi: khách yêu cầu gặp người, khiếu nại nặng, ngoài phạm vi, thông tin nhạy cảm (pháp lý/y tế/tài chính), hoặc không thể trả lời chính xác sau khi đã tra cứu.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Lý do ngắn gọn cần chuyển nhân viên' } },
      required: ['reason'],
    },
  },
}

// Action tool — records a pending appointment request for staff to confirm
// (NEVER books directly). The customer is told it's being processed.
export const APPOINTMENT_TOOL = 'request_appointment'
const APPOINTMENT_DEF: OpenaiToolDef = {
  type: 'function',
  function: {
    name: APPOINTMENT_TOOL,
    description: 'Ghi nhận yêu cầu ĐẶT LỊCH/HẸN của khách (KHÔNG đặt trực tiếp — nhân viên sẽ xác nhận). Dùng khi khách muốn đặt lịch hẹn/tư vấn/khám và đã nêu thời gian mong muốn.',
    parameters: {
      type: 'object',
      properties: {
        desired_time: { type: 'string', description: 'Thời gian khách mong muốn (nguyên văn, vd "3h chiều mai", "20/6 9 giờ sáng")' },
        customer_name: { type: 'string', description: 'Tên khách (nếu có)' },
        phone: { type: 'string', description: 'Số điện thoại (nếu khách cung cấp)' },
        note: { type: 'string', description: 'Nội dung/loại lịch hẹn (nếu có)' },
      },
      required: ['desired_time'],
    },
  },
}

// Action tool — logs a KNOWLEDGE GAP for staff to fill (fire-and-forget; does NOT
// interrupt the reply, unlike request_handoff). Use when retrieval is empty/
// insufficient to answer an info question. Executed in reply-generator's loop.
export const LOG_GAP_TOOL = 'log_knowledge_gap'
const LOG_GAP_DEF: OpenaiToolDef = {
  type: 'function',
  function: {
    name: LOG_GAP_TOOL,
    description: 'Ghi nhận LỖ HỔNG KIẾN THỨC khi bạn KHÔNG đủ dữ liệu để trả lời một câu hỏi thông tin (đã tra cứu mà rỗng/không khớp). Ghi nhận để nhân viên bổ sung kiến thức — KHÔNG gián đoạn, bạn vẫn tiếp tục trả lời lịch sự ("em kiểm tra lại rồi báo anh/chị"). KHÔNG dùng cho việc khẩn cần gặp người ngay (dùng request_handoff).',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Câu hỏi của khách / thông tin còn thiếu (nguyên văn, ngắn gọn)' },
        gap_type: { type: 'string', enum: ['missing_info', 'needs_knowledge', 'needs_staff'], description: 'missing_info = thiếu dữ liệu cụ thể (giá/chính sách/thông tin SP); needs_knowledge = thiếu kiến thức nghiệp vụ nền; needs_staff = cần chuyên môn nhân viên (không khẩn)' },
        suggested_answer: { type: 'string', description: 'Gợi ý hướng trả lời nếu có (tuỳ chọn) — giúp nhân viên xử lý nhanh' },
      },
      required: ['question', 'gap_type'],
    },
  },
}

// Overview tool — always available alongside the search tools. Answers "câu tổng
// quan" (what does the shop sell / what categories exist) which nearest-neighbor
// search cannot: it returns category counts, not a handful of nearest items.
export const CATALOG_OVERVIEW_TOOL = 'catalog_overview'
const CATALOG_OVERVIEW_DEF: OpenaiToolDef = {
  type: 'function',
  function: {
    name: CATALOG_OVERVIEW_TOOL,
    description: 'Xem TỔNG QUAN danh mục: shop có những NHÓM sản phẩm/kiến thức nào và bao nhiêu mục mỗi nhóm. Dùng cho câu hỏi chung như "shop bán những gì", "có những loại/dịch vụ nào", trước khi đi sâu bằng search_products.',
    parameters: { type: 'object', properties: {} },
  },
}

/** Build OpenAI tool defs: enabled search tools + overview + always-on action tools. */
export function buildOpenaiTools(tools: ToolsConfig): OpenaiToolDef[] {
  const search = TOOL_NAMES.filter((n) => tools[n].enabled).map((n) => ({
    type: 'function' as const,
    function: { name: n, description: TOOL_SCHEMAS[n].description, parameters: { ...QUERY_PARAM } },
  }))
  // Overview only makes sense if the model can see some catalog data at all.
  const anySearch = TOOL_NAMES.some((n) => tools[n].enabled)
  // log_knowledge_gap is only meaningful when the AI can actually search knowledge
  // (no search tools → the auto-log can't fire anyway, so don't offer the tool).
  return [...search, ...(anySearch ? [CATALOG_OVERVIEW_DEF, LOG_GAP_DEF] : []), HANDOFF_DEF, APPOINTMENT_DEF]
}

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as string[]).includes(name)
}

const MAX_SNIPPET = 800
const MAX_PRICE_DESC = 1000 // 'description' pricing lives in the text — give it room

function formatProducts(rows: Array<{ name: string; price: number | null; priceMax: number | null; priceType: string; currency: string; description: string | null }>): string {
  if (rows.length === 0) return 'Không tìm thấy sản phẩm phù hợp trong phạm vi cho phép.'
  return rows.map((p) => {
    const price = formatProductPrice(p)
    // 'description' products carry their price inside the text — don't clip it away.
    const cap = p.priceType === 'description' ? MAX_PRICE_DESC : MAX_SNIPPET
    return `- ${p.name} — ${price}${p.description ? `: ${p.description.slice(0, cap)}` : ''}`
  }).join('\n')
}

function formatKb(rows: Array<{ title: string; content: string }>): string {
  if (rows.length === 0) return 'Không tìm thấy thông tin phù hợp trong phạm vi cho phép.'
  return rows.map((s) => `### ${s.title}\n${s.content.slice(0, MAX_SNIPPET)}`).join('\n\n')
}

/** Filter aggregate rows by a guardrail allow-list (empty = all categories). */
function scopeRows(
  rows: Array<{ categoryId: string | null; category: string | null; count: number }>,
  allowed: string[],
): Array<{ category: string; count: number }> {
  return rows
    .filter((r) => allowed.length === 0 || (r.categoryId != null && allowed.includes(r.categoryId)))
    .filter((r) => r.count > 0)
    .map((r) => ({ category: r.category ?? 'Chưa phân loại', count: r.count }))
}

async function formatOverview(orgId: string, tools: ToolsConfig): Promise<string> {
  const agg = await aggregate(orgId)
  const lines: string[] = []
  if (tools.search_products.enabled) {
    const prod = scopeRows(agg.productsByCategory, tools.search_products.guardrail.categoryIds)
    const total = prod.reduce((a, b) => a + b.count, 0)
    if (total > 0) lines.push(`SẢN PHẨM (tổng ${total}):\n${prod.map((p) => `• ${p.category}: ${p.count}`).join('\n')}`)
  }
  const knowIds = tools.search_knowledge.guardrail.categoryIds
  if (tools.search_knowledge.enabled) {
    const kb = scopeRows(agg.knowledgeByCategory, knowIds)
    const total = kb.reduce((a, b) => a + b.count, 0)
    if (total > 0) lines.push(`KIẾN THỨC/FAQ (tổng ${total}):\n${kb.map((k) => `• ${k.category}: ${k.count}`).join('\n')}`)
  }
  if (lines.length === 0) return 'Chưa có dữ liệu danh mục trong phạm vi được cấp.'
  return `Tổng quan danh mục trong phạm vi được cấp:\n${lines.join('\n\n')}\n(Dùng search_products/search_knowledge để xem chi tiết từng nhóm.)`
}

/** One retrieved hit surfaced for observability (label + relevance score). */
export type ToolHit = { label: string; score: number | null }
/** Tool execution result: the text the model sees + per-hit scores for the trace. */
export type ToolResult = { text: string; hits: ToolHit[] }

/**
 * Execute a tool call. Always enforces the tool's guardrail (categoryIds) in code,
 * so the model cannot reach data outside its allowed scope. Returns the text the
 * model sees plus per-hit relevance scores (recorded in the trace so the Master
 * can diagnose retrieval quality). `minScore` overrides the default RAG threshold.
 */
export async function executeTool(
  orgId: string,
  name: string,
  args: unknown,
  tools: ToolsConfig,
  topK: number,
  minScore?: number,
): Promise<ToolResult> {
  if (name === CATALOG_OVERVIEW_TOOL) return { text: await formatOverview(orgId, tools), hits: [] }
  if (!isToolName(name)) return { text: `Công cụ không tồn tại: ${name}`, hits: [] }
  const tool = tools[name]
  if (!tool.enabled) return { text: 'Công cụ này hiện đang tắt.', hits: [] }
  const query = typeof (args as { query?: unknown })?.query === 'string' ? (args as { query: string }).query.trim() : ''
  if (!query) return { text: 'Thiếu tham số "query".', hits: [] }
  const ids = tool.guardrail.categoryIds

  if (name === 'search_products') {
    const rows = await retrieveProductSemantic(orgId, query, topK, { categoryIds: ids, minScore })
    const hits = rows.map((r) => ({ label: r.name, score: r.score ?? null }))
    return { text: rows.length === 0 ? notFoundMsg(ids, 'sản phẩm') : formatProducts(rows), hits }
  }
  // search_knowledge covers ALL KB formats (FAQ + articles) in ONE query — no format
  // split, so the model can never mis-route between two near-identical knowledge tools.
  const fb = (o: string, q: string, k: number) => retrieveKb(o, q, k, { categoryIds: ids })
  const rows = await retrieveKbSemantic(orgId, query, topK, fb, { categoryIds: ids, minScore })
  const hits = rows.map((r) => ({ label: r.title, score: r.score ?? null }))
  return { text: rows.length === 0 ? notFoundMsg(ids, 'thông tin') : formatKb(rows), hits }
}

/**
 * Scope-aware "no result" message. With an active guardrail (restricted
 * categories) "not found" might just mean OUT OF SCOPE — the model must NOT turn
 * that into a false denial. With full scope it can safely say the shop doesn't
 * carry it.
 */
function notFoundMsg(guardrailIds: string[], kind: string): string {
  return guardrailIds.length > 0
    ? `Không tra cứu được ${kind} phù hợp trong phạm vi được cấp. Phần này CÓ THỂ nằm ngoài phạm vi bạn được phép tra — KHÔNG kết luận shop không có; nói sẽ kiểm tra lại rồi báo khách.`
    : `Không tìm thấy ${kind} phù hợp trong danh mục hiện có của shop.`
}
