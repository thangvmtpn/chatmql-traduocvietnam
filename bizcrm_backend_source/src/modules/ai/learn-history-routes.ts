/**
 * learn-history-routes.ts — HỌC TỪ LỊCH SỬ TIN NHẮN (Train AI · Đợt 3).
 *
 * Cho AI học giọng điệu & mẫu câu của nhân viên thật từ hội thoại tư vấn cũ:
 *   1. Gom hội thoại theo bộ lọc (tài khoản Zalo nhân viên, khoảng thời gian,
 *      ưu tiên hội thoại đã ra đơn — đối chiếu SĐT với hoa_don bên CRM nếu có
 *      CRM_DATABASE_URL, không có thì dùng heuristic từ khóa chốt đơn).
 *   2. ẨN DANH trước khi phân tích: che SĐT, email, dãy số dài — thông tin
 *      cá nhân của khách KHÔNG rời khỏi máy chủ dưới dạng thô.
 *   3. Gọi model (cấu hình task ai_master) phân tích → đề xuất bản Persona mới
 *      (xưng hô, câu chào, cách báo giá, xử lý chê đắt, nhịp chốt, emoji,
 *      kèm mục "Bộ mẫu câu chuẩn").
 *   4. KHÔNG tự áp dụng — tạo AiLogicProposal (pending) qua đúng flow của
 *      AI Master; admin duyệt ở giao diện mới áp vào tài liệu Persona.
 *
 * Cách 2: tải tệp export chat (.txt/.csv/.json) → cùng phễu ẩn danh + phân tích.
 * ACL: owner/admin.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import multipart from '@fastify/multipart'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { getProviderConfig } from './provider-registry.js'
import { generateWithAnthropic } from './providers/anthropic.js'
import { generateWithGemini } from './providers/gemini.js'
import { generateWithOpenai } from './providers/openai.js'
import { getAiConfig, getEffectiveConfigForTask, getProviderApiKey } from './ai-config-service.js'
import { getLogicDoc } from './logic-doc-service.js'
import { createProposal } from './master/logic-proposal-service.js'
import { logUsage } from './ai-service.js'
import type { GenerateRaw } from './ai-pricing.js'

const MAX_CONVERSATIONS = 25
const MAX_MSG_PER_CONV = 30
const MAX_TRANSCRIPT_CHARS = 45_000
const MAX_FILE_BYTES = 10 * 1024 * 1024
const CLOSE_KEYWORDS = /(chốt đơn|lên đơn|địa chỉ nhận|cho.*địa chỉ|ship về|thanh toán|COD|đặt hàng|em lên đơn|xác nhận đơn)/i

function isAdmin(role: string): boolean { return ['owner', 'admin'].includes(role) }
function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ success: false, error: { code: 'ERROR', message } })
}

// ── Ẩn danh ─────────────────────────────────────────────────────────────────
export function anonymize(text: string): string {
  return text
    // SĐT Việt Nam: 0xxxxxxxxx / +84 / có chấm, cách, gạch giữa các cụm số
    .replace(/(\+?84|0)[\s.\-]?\d{2,3}([\s.\-]?\d{2,4}){2,3}\b/g, '[SĐT]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    // dãy số dài (số tài khoản, mã vận đơn…)
    .replace(/\b\d{8,}\b/g, '[số]')
}

// ── Ưu tiên hội thoại ra đơn: SĐT có trong hoa_don bên CRM ─────────────────
async function phonesWithInvoices(phones: string[]): Promise<Set<string>> {
  const url = process.env.CRM_DATABASE_URL
  if (!url || !phones.length) return new Set()
  try {
    const { default: pg } = await import('pg')
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      const norm = phones.map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 9)
      const res = await client.query(
        `SELECT DISTINCT regexp_replace(sdt, '\\D', '', 'g') AS p FROM hoa_don
         WHERE regexp_replace(sdt, '\\D', '', 'g') = ANY($1)`, [norm])
      return new Set(res.rows.map((r: { p: string }) => r.p))
    } finally { await client.end() }
  } catch { return new Set() } // CRM không với tới được → rơi về heuristic
}

// ── Gom & dựng transcript từ hội thoại trong hệ thống ───────────────────────
async function buildTranscriptFromSystem(
  orgId: string,
  opts: { channelId?: string; days: number; preferOrders: boolean },
): Promise<{ transcript: string; sampled: number; considered: number }> {
  const since = opts.days > 0 ? new Date(Date.now() - opts.days * 86_400_000) : undefined

  // Hội thoại ứng viên: có hoạt động trong khoảng lọc, đúng kênh nếu chọn
  const convs = await prisma.conversation.findMany({
    where: {
      orgId,
      ...(opts.channelId ? { channelAccountId: opts.channelId } : {}),
      ...(since ? { lastMessageAt: { gte: since } } : {}),
      threadType: 'user',
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 400,
    select: {
      id: true,
      contact: { select: { phone: true } },
      channelAccount: { select: { displayName: true } },
    },
  })

  // Chấm điểm từng hội thoại: đủ lượt trao đổi của người thật mới dùng được
  const scored: Array<{ id: string; score: number; lines: string[] }> = []
  const phoneByConv = new Map<string, string>()
  for (const c of convs) {
    if (scored.length >= 120) break
    const msgs = await prisma.message.findMany({
      where: {
        conversationId: c.id,
        contentType: 'text',
        isDeleted: false,
        ...(since ? { sentAt: { gte: since } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: MAX_MSG_PER_CONV,
      select: { senderType: true, content: true, aiGenerated: true },
    })
    const staffTurns = msgs.filter((m) => m.senderType === 'self' && !m.aiGenerated)
    const custTurns = msgs.filter((m) => m.senderType === 'contact')
    if (staffTurns.length < 3 || custTurns.length < 2) continue

    const lines = msgs.reverse()
      .filter((m) => m.content?.trim())
      .map((m) => (m.senderType === 'contact' ? 'KH: ' : m.aiGenerated ? 'AI: ' : 'NV: ') + (m.content || '').trim().slice(0, 400))
    // bỏ hội thoại toàn AI trả lời
    if (!lines.some((l) => l.startsWith('NV: '))) continue

    let score = staffTurns.length
    if (opts.preferOrders && lines.some((l) => CLOSE_KEYWORDS.test(l))) score += 50
    if (c.contact?.phone) phoneByConv.set(c.id, c.contact.phone)
    scored.push({ id: c.id, score, lines })
  }

  // Ưu tiên ra đơn thật (đối chiếu CRM) nếu bật và với tới được CRM
  if (opts.preferOrders && phoneByConv.size) {
    const invoiced = await phonesWithInvoices([...phoneByConv.values()])
    if (invoiced.size) {
      for (const s of scored) {
        const p = phoneByConv.get(s.id)?.replace(/\D/g, '')
        if (p && invoiced.has(p)) s.score += 200
      }
    }
  }

  scored.sort((a, b) => b.score - a.score)
  const picked = scored.slice(0, MAX_CONVERSATIONS)

  let transcript = ''
  let used = 0
  for (const [i, s] of picked.entries()) {
    const block = `\n===== HỘI THOẠI ${i + 1} =====\n` + s.lines.join('\n') + '\n'
    if (transcript.length + block.length > MAX_TRANSCRIPT_CHARS) break
    transcript += block
    used++
  }
  return { transcript: anonymize(transcript), sampled: used, considered: scored.length }
}

// ── Gọi model ───────────────────────────────────────────────────────────────
async function dispatchProvider(
  provider: string, apiKey: string, model: string,
  system: string, userPrompt: string, maxTokens = 3000,
): Promise<GenerateRaw> {
  const def = getProviderConfig(provider)
  if (!def?.baseUrl) throw new Error(`Unknown provider: ${provider}`)
  if (provider === 'openai' || provider === 'minimax')
    return generateWithOpenai(def.baseUrl, apiKey, model, system, userPrompt, { maxTokens })
  if (provider === 'anthropic')
    return generateWithAnthropic(def.baseUrl, apiKey, model, system, userPrompt, { enableCaching: true, maxTokens })
  if (provider === 'gemini')
    return generateWithGemini(def.baseUrl, apiKey, model, system, userPrompt, { maxTokens })
  throw new Error(`Unsupported provider: ${provider}`)
}

const ANALYZE_SYSTEM = `Bạn là chuyên gia huấn luyện AI bán hàng cho Trà Dược Việt Nam.
Nhiệm vụ: đọc các hội thoại tư vấn THẬT (NV = nhân viên thật, KH = khách, AI = máy trả lời — chỉ học theo NV, KHÔNG học theo AI) và viết lại tài liệu Persona cho trợ lý AI sao cho bắt đúng giọng nhân viên giỏi nhất.

Phân tích và đưa vào Persona mới:
- Cách xưng hô thật (em/chị/anh/quý khách…), câu chào mở đầu đặc trưng
- Cách báo giá (nêu thẳng? kèm quy cách? kèm ưu đãi?)
- Cách xử lý khi khách chê đắt / phân vân
- Nhịp chốt đơn (mấy bước, hỏi gì trước khi xin địa chỉ)
- Emoji và dấu câu hay dùng, độ dài câu điển hình
- Cuối tài liệu thêm mục "## Bộ mẫu câu chuẩn" gồm 8-12 mẫu câu NGUYÊN VĂN học từ nhân viên (đã ẩn danh), nhóm theo tình huống: chào, báo giá, chê đắt, chốt đơn, cảm ơn.

Ràng buộc:
- GIỮ cấu trúc và các quy tắc đúng đắn của Persona hiện tại, chỉ làm giàu/chỉnh bằng bằng chứng từ hội thoại.
- KHÔNG bịa thông tin sản phẩm/giá. KHÔNG chép thông tin cá nhân của khách ([SĐT], [email], [số] là dữ liệu đã che — không được đoán lại).
- Viết tiếng Việt, định dạng Markdown.

Trả về DUY NHẤT một khối JSON:
{"proposedPersona": "<toàn văn Persona mới>", "rationale": "<3-5 gạch đầu dòng: đã học được gì, từ bao nhiêu hội thoại>"}`

function parseAnalysis(text: string): { proposedPersona: string; rationale: string } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0])
    if (typeof o.proposedPersona === 'string' && o.proposedPersona.trim().length > 200)
      return { proposedPersona: o.proposedPersona.trim(), rationale: String(o.rationale || '').trim() || 'Học từ lịch sử hội thoại.' }
  } catch { /* rơi xuống null */ }
  return null
}

async function analyzeAndPropose(
  orgId: string, transcript: string, sampled: number, sourceLabel: string,
  minChars = 500,
  tooShortMsg = 'Không đủ hội thoại đạt chuẩn để học (cần các cuộc có ≥3 lượt nhân viên trả lời). Nới khoảng thời gian hoặc chọn kênh khác.',
): Promise<{ proposalId: string; rationale: string }> {
  if (transcript.trim().length < minChars)
    throw new Error(tooShortMsg)

  const currentPersona = (await getLogicDoc(orgId, 'persona'))?.content ?? '(chưa có Persona)'
  const userPrompt =
    `PERSONA HIỆN TẠI:\n-----\n${currentPersona}\n-----\n\n` +
    `HỘI THOẠI THẬT (${sampled} cuộc, đã ẩn danh):\n${transcript}`

  const cfg = await getAiConfig(orgId)
  const { provider, model } = getEffectiveConfigForTask(cfg, 'ai_master')
  const apiKey = await getProviderApiKey(orgId, provider)
  if (!apiKey) throw new Error(`Chưa cấu hình API key cho provider ${provider}`)

  const raw = await dispatchProvider(provider, apiKey, model, ANALYZE_SYSTEM, userPrompt)
  logUsage({ orgId, provider, model, type: 'ai_master', raw, feature: 'learn_history' }).catch(() => {})

  const parsed = parseAnalysis(raw.text ?? '')
  if (!parsed) throw new Error('Model không trả về đề xuất hợp lệ — thử lại giúp em')

  const proposal = await createProposal({
    orgId,
    source: sourceLabel,
    targetType: 'logic_doc',
    targetSubtype: 'persona',
    currentValue: currentPersona,
    proposedValue: parsed.proposedPersona,
    rationale: parsed.rationale + `\n(Nguồn: ${sampled} hội thoại, đã ẩn danh SĐT/email trước khi phân tích)`,
  })
  return { proposalId: proposal.id, rationale: parsed.rationale }
}

export default async function learnHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } })

  /** GET /api/v1/ai/learn-history/channels — kênh Zalo để chọn "học theo ai" */
  app.get('/api/v1/ai/learn-history/channels', async (request, reply) => {
    const user = request.user as { role: string; orgId: string }
    if (!isAdmin(user.role)) return sendError(reply, 403, 'Chỉ admin/owner')
    const rows = await prisma.channelAccount.findMany({
      where: { orgId: user.orgId, deletedAt: null, platform: { not: 20 } },
      select: { id: true, displayName: true, _count: { select: { conversations: true } } },
      orderBy: { displayName: 'asc' },
    })
    return {
      channels: rows
        .filter((r) => r._count.conversations > 0)
        .map((r) => ({ id: r.id, name: r.displayName, conversations: r._count.conversations })),
    }
  })

  /** POST /api/v1/ai/learn-history/analyze — cách 1: từ hội thoại hệ thống */
  app.post<{ Body: { channelId?: string; days?: number; preferOrders?: boolean } }>(
    '/api/v1/ai/learn-history/analyze', async (request, reply) => {
      const user = request.user as { id: string; role: string; orgId: string }
      if (!isAdmin(user.role)) return sendError(reply, 403, 'Chỉ admin/owner được chạy học lịch sử')
      const { channelId, days = 90, preferOrders = true } = request.body ?? {}
      try {
        const { transcript, sampled, considered } = await buildTranscriptFromSystem(user.orgId, {
          channelId, days: Number(days) || 0, preferOrders: !!preferOrders,
        })
        const out = await analyzeAndPropose(user.orgId, transcript, sampled, 'learn_history')
        return { success: true, ...out, sampled, considered, status: 'pending' }
      } catch (err: any) {
        app.log.error({ err }, '[learn-history] analyze failed')
        return sendError(reply, 400, err.message || 'Phân tích thất bại')
      }
    })

  /** POST /api/v1/ai/learn-history/analyze-file — cách 2: tệp export chat */
  app.post('/api/v1/ai/learn-history/analyze-file', async (request, reply) => {
    const user = request.user as { id: string; role: string; orgId: string }
    if (!isAdmin(user.role)) return sendError(reply, 403, 'Chỉ admin/owner được chạy học lịch sử')
    try {
      const file = await request.file()
      if (!file) return sendError(reply, 400, 'Chưa đính kèm tệp')
      const buf = await file.toBuffer()
      let text = buf.toString('utf8')
      // JSON export → ép về text phẳng để phân tích
      if (file.filename.endsWith('.json')) {
        try { text = JSON.stringify(JSON.parse(text), null, 1).replace(/[{}\[\]",]/g, ' ') } catch { /* giữ nguyên */ }
      }
      const transcript = anonymize(text).slice(0, MAX_TRANSCRIPT_CHARS)
      const out = await analyzeAndPropose(user.orgId, transcript, 1, 'learn_history_file',
        200, 'Tệp quá ngắn để học được gì — cần ít nhất vài lượt hội thoại của nhân viên.')
      return { success: true, ...out, sampled: 1, status: 'pending' }
    } catch (err: any) {
      app.log.error({ err }, '[learn-history] analyze-file failed')
      return sendError(reply, 400, err.message || 'Phân tích tệp thất bại')
    }
  })
}
