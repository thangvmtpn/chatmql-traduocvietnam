/**
 * logic-doc-service.ts — CRUD + versioning for AiLogicDoc (index/persona/playbook/handoff_rules/mechanism).
 * "Logic prose" layer: markdown docs that define how the AI behaves.
 * AI Master can write these via changedBy='ai_master'.
 */
import { prisma } from '../../shared/prisma-client.js'

// 'tools' = JSON config doc (function-call registry + per-function guardrail).
// It is versioned/editable like other logic docs but is NOT injected as prose
// into the responder prompt — it's parsed by tools-config-service instead.
export type AiLogicDocType = 'index' | 'persona' | 'playbook' | 'handoff_rules' | 'mechanism' | 'criteria' | 'tools'

const VALID_DOC_TYPES: AiLogicDocType[] = ['index', 'persona', 'playbook', 'handoff_rules', 'mechanism', 'criteria', 'tools']

export function isValidDocType(t: string): t is AiLogicDocType {
  return (VALID_DOC_TYPES as string[]).includes(t)
}

export type LogicDocSummary = {
  id: string
  orgId: string
  type: string
  version: number
  isActive: boolean
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
  contentLength: number
}

export type LogicDocFull = LogicDocSummary & { content: string }

export type ActiveLogicContext = {
  index: string | null
  persona: string | null
  playbook: string | null
  handoff_rules: string | null
  mechanism: string | null
  criteria: string | null
}

// ── Queries ────────────────────────────────────────────────────────

/**
 * List all logic docs for an org (meta only, no content — for list view).
 */
export async function getLogicDocs(orgId: string): Promise<LogicDocSummary[]> {
  const docs = await prisma.aiLogicDoc.findMany({
    where: { orgId },
    orderBy: { type: 'asc' },
    select: {
      id: true,
      orgId: true,
      type: true,
      version: true,
      isActive: true,
      updatedBy: true,
      createdAt: true,
      updatedAt: true,
      content: true,
    },
  })
  return docs.map((d) => ({ ...d, content: undefined as never, contentLength: d.content.length }))
}

/**
 * Get a single logic doc by type (including full content).
 */
export async function getLogicDoc(orgId: string, type: AiLogicDocType): Promise<LogicDocFull | null> {
  const doc = await prisma.aiLogicDoc.findFirst({ where: { orgId, type } })
  if (!doc) return null
  return { ...doc, contentLength: doc.content.length }
}

/**
 * Get the structured context object the harness L0 needs.
 * Returns null content for doc types not yet created.
 */
export async function getActiveLogicContext(orgId: string): Promise<ActiveLogicContext> {
  const docs = await prisma.aiLogicDoc.findMany({
    where: { orgId, isActive: true },
    select: { type: true, content: true },
  })
  const byType = new Map(docs.map((d) => [d.type, d.content]))
  return {
    index: byType.get('index') ?? null,
    persona: byType.get('persona') ?? null,
    playbook: byType.get('playbook') ?? null,
    handoff_rules: byType.get('handoff_rules') ?? null,
    mechanism: byType.get('mechanism') ?? null,
    criteria: byType.get('criteria') ?? null,
  }
}

// ── Mutations ──────────────────────────────────────────────────────

/**
 * Create or update a logic doc.
 * On update: snapshots previous content as a new AiLogicDocVersion, bumps version.
 */
export async function upsertLogicDoc(
  orgId: string,
  type: AiLogicDocType,
  content: string,
  updatedBy: string,
  changeNote?: string,
): Promise<LogicDocFull> {
  const trimmedContent = content.trim()
  if (!trimmedContent) throw new Error('Content cannot be empty')

  const existing = await prisma.aiLogicDoc.findFirst({ where: { orgId, type } })

  if (!existing) {
    const doc = await prisma.aiLogicDoc.create({
      data: { orgId, type, content: trimmedContent, version: 1, isActive: true, updatedBy },
    })
    return { ...doc, contentLength: doc.content.length }
  }

  // Snapshot previous version before overwriting
  await prisma.aiLogicDocVersion.create({
    data: {
      docId: existing.id,
      version: existing.version,
      content: existing.content,
      changedBy: existing.updatedBy,
      changeNote: changeNote ?? null,
    },
  })

  const updated = await prisma.aiLogicDoc.update({
    where: { id: existing.id },
    data: { content: trimmedContent, version: existing.version + 1, updatedBy },
  })
  return { ...updated, contentLength: updated.content.length }
}

/**
 * Revert a logic doc to a previously saved version.
 * Restores old content as a new version (highest version + 1).
 */
export async function revertLogicDoc(
  orgId: string,
  type: AiLogicDocType,
  targetVersion: number,
  revertedBy: string,
): Promise<LogicDocFull> {
  const doc = await prisma.aiLogicDoc.findFirst({ where: { orgId, type } })
  if (!doc) throw new Error(`Logic doc type "${type}" not found for this org`)

  // Find the target version snapshot
  const versionRow = await prisma.aiLogicDocVersion.findFirst({
    where: { docId: doc.id, version: targetVersion },
  })
  if (!versionRow) throw new Error(`Version ${targetVersion} not found for doc type "${type}"`)

  // Snapshot current content before reverting
  await prisma.aiLogicDocVersion.create({
    data: {
      docId: doc.id,
      version: doc.version,
      content: doc.content,
      changedBy: doc.updatedBy,
      changeNote: `Before revert to v${targetVersion}`,
    },
  })

  const updated = await prisma.aiLogicDoc.update({
    where: { id: doc.id },
    data: {
      content: versionRow.content,
      version: doc.version + 1,
      updatedBy: revertedBy,
    },
  })
  return { ...updated, contentLength: updated.content.length }
}

/**
 * List version history for a logic doc type.
 */
export async function getLogicDocVersions(orgId: string, type: AiLogicDocType) {
  const doc = await prisma.aiLogicDoc.findFirst({
    where: { orgId, type },
    select: { id: true },
  })
  if (!doc) return []
  return prisma.aiLogicDocVersion.findMany({
    where: { docId: doc.id },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, changedBy: true, changeNote: true, createdAt: true },
  })
}

// ── Default seed ───────────────────────────────────────────────────

// 'tools' is a JSON config doc (seeded lazily by tools-config-service), not prose.
const DEFAULT_DOCS: Record<Exclude<AiLogicDocType, 'tools'>, string> = {
  index: `# Tổng quan AI Assistant

Bạn là trợ lý tư vấn bán hàng thân thiện, chuyên nghiệp.
Hỗ trợ khách hàng qua Zalo — ngắn gọn, tự nhiên, tập trung giải quyết nhu cầu.

**Tài nguyên chi tiết:** persona.md | playbook.md | handoff_rules.md`,

  persona: `# Persona — Phong cách trả lời

- Xưng hô: "mình/bạn" hoặc "em/anh/chị" tùy khách
- Giọng điệu: thân thiện, tư vấn chân thành, không chào hỏi công thức
- Độ dài: ngắn gọn (2–4 câu), tránh trả lời quá dài
- Ngôn ngữ: tiếng Việt tự nhiên; theo ngôn ngữ khách nếu khách dùng tiếng Anh
- Tránh: spam emoji, lời khen sáo rỗng, lặp thông tin đã nói`,

  playbook: `# Playbook — Hướng dẫn xử lý tình huống

## Hỏi giá
Cung cấp thông tin giá rõ ràng. Nếu không có giá cố định, hỏi thêm để tư vấn phù hợp.

## Khách phàn nàn
Lắng nghe, xác nhận cảm xúc, xin lỗi chân thành, đề xuất hướng giải quyết cụ thể.

## Hỏi thông tin sản phẩm
Trả lời súc tích, hỏi thêm nhu cầu cụ thể để tư vấn đúng.

## Chốt đơn
Tóm tắt những gì đã thoả thuận, hướng dẫn bước tiếp theo rõ ràng.`,

  handoff_rules: `# Handoff Rules — Khi nào chuyển cho nhân viên

Chuyển sang nhân viên (handoff) khi:
- Khách yêu cầu gặp trực tiếp hoặc nói chuyện với người thật
- Câu hỏi về giá đặc biệt, hợp đồng lớn, điều khoản ngoại lệ
- Khiếu nại nghiêm trọng, khách tức giận
- Yêu cầu kỹ thuật phức tạp ngoài phạm vi AI
- Phát hiện thông tin nhạy cảm (pháp lý, y tế, tài chính)`,

  mechanism: `# Mechanism — Cơ chế hoạt động (dành cho AI Master)

AI hoạt động theo hai lượt (two-pass):
1. **Router (Pass 1):** Phân tích ngữ cảnh, quyết định hành động (reply/handoff/skip)
2. **Generator (Pass 2):** Tạo nội dung trả lời dựa theo quyết định router

Context layers: L0 (logic docs) → L1 (KB RAG) → L3 (thread memory) → L5 (lịch sử) → L6 (tin mới)
Guardrail v1: debounce + pre-filter keyword (không gọi LLM cho case hiển nhiên).

## Nguồn dữ liệu trả lời (2 nguồn — quản lý ở trang "Sản phẩm & Tri thức")
- **Sản phẩm** (catalog + giá): AI tra qua công cụ search_products.
- **Kiến thức & FAQ** (bài viết: chính sách, hướng dẫn, thông tin shop + câu hỏi thường gặp): công cụ search_knowledge (tra cả hai trong một lần).
AI Master được đề xuất THÊM/SỬA/XÓA dữ liệu ở cả hai nguồn (người duyệt trước khi áp dụng).

## Guardrail công cụ (giới hạn phạm vi tra cứu của AI trả lời)
- Mỗi công cụ bật/tắt được và giới hạn theo DANH MỤC cho phép (để trống = không giới hạn). Cấu hình ở "Cấu hình AI → Công cụ AI + Guardrail"; AI Master cũng đề xuất được (proposal 'guardrail').
- 3 lớp bảo vệ: (1) tool tắt thì KHÔNG xuất hiện trong danh sách function của AI trả lời; (2) prompt khai báo RÕ phạm vi được cấp (tên danh mục) để AI biết phần nào mình không tra được — tránh phủ nhận/bịa; (3) CHẶN CỨNG ở tầng truy vấn (code lọc category_id) — kể cả khi prompt bị vượt, dữ liệu ngoài phạm vi không bao giờ trả về.
- Ngoài phạm vi ≠ shop không có: AI phải nói "em kiểm tra lại/chuyển nhân viên", không được phủ nhận.`,

  criteria: `# Tiêu chí chất lượng (Guardrails — BẮT BUỘC tuân thủ)

## 1. Độ chính xác (ưu tiên cao nhất)
- CHỈ nói thông tin có trong KB / playbook / dữ liệu khách. TUYỆT ĐỐI không bịa giá, chính sách, tồn kho, thông số kỹ thuật.
- Câu hỏi về giá / sản phẩm / chính sách mà KHÔNG có dữ liệu → hỏi lại để làm rõ HOẶC chuyển nhân viên. KHÔNG tự bịa hay liệt kê sản phẩm chung chung.
- Dữ liệu chỉ trả lời MỘT PHẦN câu hỏi → chỉ khẳng định đúng phần đó; phần thiếu (vd: có thời gian giao hàng nhưng không nói khu vực khách hỏi) nói rõ "em kiểm tra lại rồi báo", KHÔNG suy diễn từ thông tin cùng chủ đề.
- Không chắc chắn → nói "em kiểm tra lại rồi báo anh/chị" hoặc chuyển người, thay vì đoán.

## 2. Phong cách
- Ngắn gọn, tự nhiên, đúng trọng tâm câu hỏi. Khách hỏi 1 ý → trả lời 1 ý, tránh liệt kê dài.

## 3. An toàn / chuyển người
- Không hứa điều ngoài thẩm quyền (giảm giá đặc biệt, hoàn tiền ngoại lệ) → chuyển nhân viên.
- Khách khiếu nại / bức xúc / yêu cầu gặp người → chuyển nhân viên ngay.

> Đây là bộ tiêu chí AI Master tinh chỉnh dần qua feedback của nhân viên (improve-by-feedback).`,
}

/**
 * Create default logic docs for a new org. Idempotent — skips existing types.
 */
export async function seedDefaultLogicDocs(orgId: string, createdBy = 'system'): Promise<{ seeded: string[]; skipped: string[] }> {
  const existing = await prisma.aiLogicDoc.findMany({
    where: { orgId },
    select: { type: true },
  })
  const existingTypes = new Set(existing.map((d) => d.type))
  const seeded: string[] = []
  const skipped: string[] = []

  for (const type of VALID_DOC_TYPES) {
    if (type === 'tools') continue // config doc, not seeded as prose
    if (existingTypes.has(type)) {
      skipped.push(type)
      continue
    }
    await prisma.aiLogicDoc.create({
      data: {
        orgId,
        type,
        content: DEFAULT_DOCS[type],
        version: 1,
        isActive: true,
        updatedBy: createdBy,
      },
    })
    seeded.push(type)
  }
  return { seeded, skipped }
}
