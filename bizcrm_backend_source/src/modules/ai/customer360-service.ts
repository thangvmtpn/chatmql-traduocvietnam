/**
 * customer360-service.ts — Phân tích khách hàng 4 mục cho modal Customer 360.
 *
 * NGUYÊN TẮC: chia rõ việc nào cho dữ liệu, việc nào cho AI.
 *
 *   👤 Chân dung      — dựng từ DỮ LIỆU THẬT (CRM + ChatMQL). Không hỏi AI, vì
 *                        đây toàn là con số: GMV, số đơn, nhóm KH, sinh nhật.
 *                        Để AI đọc lại những con số này chỉ tạo cơ hội cho nó
 *                        đọc sai — mà sai số tiền của khách thì rất tệ.
 *   💬 Tóm tắt        — AI đọc hội thoại.
 *   🎯 Cơ hội         — AI suy luận.
 *   ✅ Đề xuất hành động — AI đề xuất.
 *
 * Ba mục AI gộp trong MỘT lời gọi LLM để không nhân đôi chi phí.
 */
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { getAiConfig, getProviderApiKey } from './ai-config-service.js'
import { buildContextBlock } from './ai-helpers.js'
import { dispatchProvider } from './ai-service.js'
import { fetchCustomer } from '../orders/crm-order-client.js'

export interface Customer360Result {
  portrait: string[]           // từng ý một dòng, giao diện tự xuống dòng
  summary: string
  opportunity: string
  actions: string[]
  generatedAt: string
  fromCache: boolean
  aiAvailable: boolean
  /** Lý do phần AI không chạy được — để giao diện nói thật thay vì im lặng. */
  aiError?: string
}

const CACHE_TTL_MS = 30 * 60 * 1000   // 30 phút — hội thoại ít đổi nhanh hơn thế

function money(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ'
}

/** Tháng sinh nhật, chấp nhận vài định dạng CRM đang lưu lẫn lộn. */
function birthdayMonthDay(raw?: string | null): { month: number; day: number } | null {
  const v = (raw || '').trim()
  if (!v) return null
  for (const re of [/^(\d{4})-(\d{2})-(\d{2})/, /^(\d{2})\/(\d{2})\/(\d{4})/, /^(\d{2})-(\d{2})-(\d{4})/]) {
    const m = v.match(re)
    if (!m) continue
    const [a, b, c] = [m[1], m[2], m[3]].map(Number)
    return re.source.startsWith('^(\\d{4})') ? { month: b, day: c } : { month: b, day: a }
  }
  return null
}

/**
 * Chân dung dựng từ dữ liệu thật — mỗi dòng là một sự thật kiểm chứng được.
 */
function buildPortrait(contact: any, crm: any, conv: any): string[] {
  const out: string[] = []
  const name = crm?.full_name || contact?.crmName || contact?.fullName || 'Khách hàng'
  const source = crm?.referral_source || contact?.source || null

  out.push(
    `${name}${crm?.customer_code ? ` (${crm.customer_code})` : ''}`
    + (source ? ` — đến từ ${source}` : '')
    + `, giai đoạn ${contact?.lifecycleStage || 'chưa phân loại'}, Lead ${contact?.leadScore ?? 0}/100.`,
  )

  if (crm) {
    const gmv = crm.gmv_total || 0
    const cnt = crm.order_count || 0
    out.push(
      cnt > 0
        ? `Đã mua ${cnt} đơn, tổng ${money(gmv)}${crm.aov ? `, trung bình ${money(crm.aov)}/đơn` : ''}.`
        : 'Chưa phát sinh đơn hàng nào.',
    )
    if (crm.priority_level) out.push(`Nhóm khách hàng: ${crm.priority_level}.`)
    if (crm.staff_in_charge) out.push(`Nhân sự phụ trách: ${crm.staff_in_charge}.`)
    if (crm.thich_dung_hang) out.push(`Gu dùng: ${crm.thich_dung_hang}.`)
    if (crm.nhu_cau_sd) out.push(`Nhu cầu: ${crm.nhu_cau_sd}.`)
  } else {
    out.push('Chưa có hồ sơ trong CRM — khách mới hoặc chưa khớp được số điện thoại.')
  }

  const bd = birthdayMonthDay(crm?.birthday)
  if (bd) {
    const now = new Date()
    const isToday = bd.month === now.getMonth() + 1 && bd.day === now.getDate()
    const isMonth = bd.month === now.getMonth() + 1
    const label = `${String(bd.day).padStart(2, '0')}/${String(bd.month).padStart(2, '0')}`
    if (isToday) out.push(`🎂 HÔM NAY là sinh nhật khách (${label}).`)
    else if (isMonth) out.push(`🎂 Sinh nhật khách trong tháng này (${label}).`)
  }

  if (crm?.next_sales_at || crm?.next_care_at) {
    const bits: string[] = []
    if (crm.next_sales_at) bits.push(`bán hàng ${new Date(crm.next_sales_at).toLocaleDateString('vi-VN')}`)
    if (crm.next_care_at) bits.push(`chăm sóc ${new Date(crm.next_care_at).toLocaleDateString('vi-VN')}`)
    out.push(`Lịch kế tiếp: ${bits.join(', ')}.`)
  }

  if (conv?.lastMessageAt) {
    const days = Math.floor((Date.now() - new Date(conv.lastMessageAt).getTime()) / 86400000)
    out.push(days <= 0 ? 'Có tương tác trong hôm nay.' : `Lần tương tác gần nhất: ${days} ngày trước.`)
  }

  return out
}

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích khách hàng cho một cửa hàng trà Việt Nam.
Đọc đoạn hội thoại và hồ sơ khách, rồi trả về JSON đúng cấu trúc sau, KHÔNG kèm giải thích:

{
  "summary": "2-3 câu tóm tắt cuộc trao đổi: khách đã nói gì, shop đã làm gì, khách đang ở đâu trong quá trình mua.",
  "opportunity": "2-3 câu về cơ hội bán hàng cụ thể lúc này và lý do.",
  "actions": ["Hành động 1", "Hành động 2", "Hành động 3"]
}

Quy tắc:
- Viết tiếng Việt tự nhiên, như nhân viên bán hàng nói với đồng nghiệp.
- Bám vào những gì THỰC SỰ có trong hội thoại và hồ sơ. Không bịa số liệu, không bịa sản phẩm.
- Nếu hội thoại quá ít thông tin, hãy nói thẳng là chưa đủ dữ kiện thay vì đoán.
- "actions" là 2-4 việc làm được ngay, mỗi việc một câu ngắn, cụ thể.`

/** Gọi LLM một lần, lấy 3 mục cần suy luận. */
async function askAi(orgId: string, conversationId: string, contextExtra: string) {
  const cfg = await getAiConfig(orgId)
  if (!cfg.enabled) throw new Error('AI đang tắt cho tổ chức này')

  const provider = cfg.provider
  const apiKey = await getProviderApiKey(orgId, provider)
  if (!apiKey) throw new Error(`Chưa cấu hình API key cho "${provider}"`)

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    select: {
      contact: { select: { fullName: true, crmName: true } },
      messages: {
        where: { isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 40,
        select: { senderType: true, senderName: true, content: true, contentType: true, sentAt: true },
      },
    },
  })
  if (!conv) throw new Error('Không tìm thấy hội thoại')

  const name = conv.contact?.crmName || conv.contact?.fullName || 'khách hàng'
  const ctx = buildContextBlock([...conv.messages].reverse() as any, name)
  const userPrompt = `${ctx}\n\n<customer_profile>\n${contextExtra}\n</customer_profile>`

  const raw = await dispatchProvider(
    provider, apiKey, cfg.model, SYSTEM_PROMPT, userPrompt,
    { jsonMode: true, maxTokens: 900 },
  )
  return raw.text
}

function parseAi(text: string): { summary: string; opportunity: string; actions: string[] } {
  try {
    // Model đôi khi bọc JSON trong ```json — cắt bỏ trước khi parse.
    const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const j = JSON.parse(clean)
    return {
      summary: String(j.summary || '').trim(),
      opportunity: String(j.opportunity || '').trim(),
      actions: Array.isArray(j.actions) ? j.actions.map((a: unknown) => String(a).trim()).filter(Boolean) : [],
    }
  } catch {
    // Model trả văn xuôi thay vì JSON — vẫn dùng được làm tóm tắt.
    return { summary: text.trim().slice(0, 600), opportunity: '', actions: [] }
  }
}

export async function analyzeCustomer360(input: {
  orgId: string
  conversationId: string
  forceFresh?: boolean
}): Promise<Customer360Result> {
  const conv = await prisma.conversation.findFirst({
    where: { id: input.conversationId, orgId: input.orgId },
    select: {
      id: true, lastMessageAt: true,
      contact: {
        select: {
          id: true, fullName: true, crmName: true, phone: true, source: true,
          leadScore: true, lifecycleStage: true, aiSummary: true, updatedAt: true,
        },
      },
    },
  })
  if (!conv) throw new Error('Không tìm thấy hội thoại')

  const contact = conv.contact
  let crm: any = null
  if (contact?.phone?.trim()) {
    try {
      const res = await fetchCustomer(contact.phone.trim())
      if (res?.found) crm = res.customer
    } catch (err) {
      logger.warn({ err }, '[customer360] Không lấy được hồ sơ CRM')
    }
  }

  const portrait = buildPortrait(contact, crm, conv)

  // Dùng lại kết quả cũ nếu còn mới — mỗi lần phân tích là một lần trả tiền API.
  const cachedAt = contact?.updatedAt ? new Date(contact.updatedAt).getTime() : 0
  const cacheFresh = !input.forceFresh && contact?.aiSummary && (Date.now() - cachedAt) < CACHE_TTL_MS

  if (cacheFresh) {
    const parsed = parseAi(contact!.aiSummary as string)
    if (parsed.summary) {
      return {
        portrait,
        summary: parsed.summary,
        opportunity: parsed.opportunity,
        actions: parsed.actions,
        generatedAt: new Date(cachedAt).toISOString(),
        fromCache: true,
        aiAvailable: true,
      }
    }
  }

  const profileText = crm
    ? [
        `Tên: ${crm.full_name || '—'}`,
        `Nhóm KH: ${crm.priority_level || '—'}`,
        `Tổng chi tiêu: ${money(crm.gmv_total || 0)} qua ${crm.order_count || 0} đơn`,
        crm.thich_dung_hang ? `Gu dùng: ${crm.thich_dung_hang}` : '',
        crm.nhu_cau_sd ? `Nhu cầu: ${crm.nhu_cau_sd}` : '',
      ].filter(Boolean).join('\n')
    : 'Khách chưa có hồ sơ trong CRM.'

  try {
    const raw = await askAi(input.orgId, conv.id, profileText)
    const parsed = parseAi(raw)

    // Lưu lại để lần sau khỏi gọi API. Hỏng ở đây không làm hỏng kết quả.
    if (contact?.id && parsed.summary) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { aiSummary: JSON.stringify(parsed) },
      }).catch(err => logger.warn({ err }, '[customer360] Không lưu được cache'))
    }

    return {
      portrait,
      summary: parsed.summary,
      opportunity: parsed.opportunity,
      actions: parsed.actions,
      generatedAt: new Date().toISOString(),
      fromCache: false,
      aiAvailable: true,
    }
  } catch (err: any) {
    // AI hỏng KHÔNG làm hỏng cả modal — phần chân dung dựng từ dữ liệu thật
    // vẫn dùng được, và nhân viên biết chính xác phần nào đang thiếu.
    logger.warn({ err: err?.message }, '[customer360] Phần AI không chạy được')
    return {
      portrait,
      summary: '',
      opportunity: '',
      actions: [],
      generatedAt: new Date().toISOString(),
      fromCache: false,
      aiAvailable: false,
      aiError: err?.message || 'Không rõ lỗi',
    }
  }
}
