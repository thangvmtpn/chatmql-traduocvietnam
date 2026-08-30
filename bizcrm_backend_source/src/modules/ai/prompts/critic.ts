/**
 * critic.ts — Verify-before-send reviewer (P6).
 *
 * A cheap second-opinion pass: given the customer message, the drafted reply,
 * the quality criteria, and the grounding the reply should rest on, decide
 * whether the reply is safe to send or should be handed off to a human.
 * Fail-OPEN on parse errors (don't block legit replies on critic infra issues).
 */

import type { ScenarioSnippet } from '../harness/harness-types.js'

export type CriticVerdict = { ok: boolean; action: 'send' | 'handoff'; reason: string }

export function buildCriticPrompt(input: {
  customerMessage: string
  reply: string
  criteria: string | null
  persona?: string | null
  playbook?: string | null
  scenarios?: ScenarioSnippet[]
  grounding: string
}): string {
  const parts: string[] = []
  parts.push(`Bạn là người KIỂM DUYỆT chất lượng câu trả lời của AI chăm sóc khách hàng (Trà Dược Việt Nam).
Mục tiêu của bạn là ngăn chặn các trường hợp BỊA ĐẶT THÔNG TIN SAI LỆCH VỀ GIÁ / CAM KẾT VẬN HÀNH / TRANH CHẤP / Y TẾ NGUY HIỂM.

Xuất DUY NHẤT một JSON:
{ "ok": boolean, "action": "send" | "handoff", "reason": string }

NGUYÊN TẮC ĐÁNH GIÁ (Ưu tiên hỗ trợ khách mượt mà):
1. "action": "send", "ok": true khi:
   - Câu trả lời là lời chào hỏi, mở đầu, xin lỗi, cảm ơn, hỏi thăm nhu cầu của khách (uống hàng ngày, mua quà biếu, nhu cầu sức khỏe).
   - Câu trả lời gợi ý hoặc tư vấn dựa trên danh mục sản phẩm, tri thức hoặc kịch bản bán hàng phân tầng.
   - Câu trả lời lịch sự xin phép kiểm tra lại và báo sau khi chưa có đủ thông tin.
   - Câu trả lời không bịa đặt giá bán sai lệch hoặc cam kết sai chính sách.

2. CHỈ chọn "action": "handoff", "ok": false khi THỰC SỰ CẦN THIẾT:
   - Khách yêu cầu gặp người thật / nhân viên tư vấn trực tiếp / gọi hotline.
   - Khách bức xúc, khiếu nại gay gắt, đe dọa hoặc tranh chấp.
   - AI khẳng định chữa khỏi 100% bệnh nan y nguy hiểm hoặc tự bịa ra giá bán / chương trình giảm giá hoàn toàn sai lệch.
   - TUYỆT ĐỐI KHÔNG handoff chỉ vì câu chào hỏi, hỏi nhu cầu, hay tư vấn bán hàng thông thường.`)

  if (input.criteria) parts.push(`\n## Tiêu chí chất lượng\n${input.criteria}`)
  if (input.persona) parts.push(`\n## Tính cách & phong cách\n${input.persona}`)
  if (input.playbook) parts.push(`\n## Kịch bản nền\n${input.playbook}`)
  if (input.scenarios && input.scenarios.length > 0) {
    parts.push(`\n## Kịch bản bán hàng áp dụng\n${input.scenarios.map(s => `### ${s.name}\n${s.content}`).join('\n\n')}`)
  }
  parts.push(`\n## Dữ liệu sản phẩm & tri thức tra cứu được\n${input.grounding || '(Chưa gọi công cụ tra cứu / hội thoại thông thường)'}`)
  parts.push(`\n## Tin nhắn của khách\n${input.customerMessage}`)
  parts.push(`\n## Câu trả lời của AI (cần kiểm duyệt)\n${input.reply}`)
  parts.push(`\nChỉ xuất JSON, không giải thích thêm.`)
  return parts.join('\n')
}

export function parseCriticVerdict(raw: string): CriticVerdict {
  const FALLBACK: CriticVerdict = { ok: true, action: 'send', reason: 'critic parse fallback (fail-open)' }
  try {
    let obj: unknown
    try { obj = JSON.parse(raw.trim()) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) return FALLBACK
      obj = JSON.parse(m[0])
    }
    const o = obj as Record<string, unknown>
    const ok = typeof o.ok === 'boolean' ? o.ok : true
    const action = o.action === 'handoff' ? 'handoff' : 'send'
    const reason = typeof o.reason === 'string' ? o.reason : ''
    // Reconcile: not ok ⇒ handoff.
    return { ok: ok && action === 'send', action: ok && action === 'send' ? 'send' : 'handoff', reason }
  } catch {
    return FALLBACK
  }
}
