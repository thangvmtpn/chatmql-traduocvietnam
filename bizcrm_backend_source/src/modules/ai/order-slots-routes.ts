/**
 * order-slots-routes.ts — Thanh tiến trình chốt đơn cho Chat thử (Train AI · Đợt 4).
 *
 * Quy tắc trong tài liệu "Quy tắc trả lời": AI phải có đủ SẢN PHẨM + QUY CÁCH +
 * SỐ LƯỢNG + TỔNG TIỀN rồi MỚI được xin địa chỉ. Màn Chat thử cần soi được điều
 * đó ngay khi đang huấn luyện.
 *
 * QUAN TRỌNG — đây là DÒ THEO VĂN BẢN, không phải trạng thái nội bộ của AI:
 * harness không lưu "slot" nào cả. Ta đọc lại các tin trong hội thoại sandbox và
 * đối chiếu với danh mục sản phẩm thật + mẫu số/tiền/địa chỉ. Cách này không tốn
 * phí AI và giải thích được từng ô bật nhờ câu nào, nhưng có thể sai ở câu chữ lạ
 * — giao diện phải nói thẳng "dò theo văn bản" để người dùng không hiểu nhầm.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'

function isAdmin(role: string): boolean { return ['owner', 'admin'].includes(role) }
function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ success: false, error: { code: 'ERROR', message } })
}

export const SLOT_KEYS = ['product', 'variant', 'quantity', 'total', 'upsell', 'address'] as const
export type SlotKey = typeof SLOT_KEYS[number]

const RX = {
  // 100g, 0.5kg, set 500g, hộp quà, bộ ấm chén
  variant: /(\d+(?:[.,]\d+)?\s?(?:g|gr|gram|kg|lạng)\b)|\b(?:set|hộp|bộ|gói|túi|lọ|hũ)\s?\d*/i,
  // "2 gói", "lấy 3 hộp", "số lượng 5"
  quantity: /\b(\d+)\s*(gói|hộp|set|bộ|cái|chiếc|túi|lọ|hũ|kg|phần)\b|số lượng\s*[:=]?\s*\d+/i,
  // 430.000đ, 1.500.000 vnd, 90k, tổng tiền
  total: /\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnđ|vnd|₫)|\b\d{2,4}\s?k\b|tổng\s*(?:tiền|cộng|đơn)/i,
  upsell: /(combo|kèm thêm|thêm hũ|hũ gốm|freeship|miễn phí (?:vận chuyển|ship)|tặng kèm|quà tặng|bánh kẹo|traba|mua kèm|gợi ý thêm)/i,
  // AI xin địa chỉ / khách đưa địa chỉ
  address: /(địa chỉ|gửi về|ship về|giao về|số nhà|nhận hàng ở|thôn |xã |phường |quận |huyện )/i,
}

/** Bỏ dấu để so tên sản phẩm cho chắc (khách gõ không dấu rất nhiều). */
function deAccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}

/**
 * Tên sản phẩm coi là "đã nêu" khi CỤM TỪ đặc trưng của nó xuất hiện liền mạch.
 *
 * Không dùng "mọi từ đều có mặt": tên "Vạn Hỷ Trà" rút gọn còn mỗi từ "van" thì
 * câu "tư vấn trà…" cũng khớp — đã dính đúng lỗi đó khi kiểm thử. Khớp theo cụm
 * liền nhau vừa đúng cách khách gõ ("vạn khang", "đinh ngọc"), vừa không ăn nhầm
 * từ thông dụng.
 */
const GENERIC_WORDS = new Set(['tra', 'bo', 'set', 'hop', 'goi', 'tui', 'va', 'cua', 'loai', 'san', 'pham', 'am', 'chen', 'hu', 'dung'])

function corePhrases(name: string): string[] {
  const words = deAccent(name).split(/[^a-z0-9]+/).filter(Boolean)
  const core = words.filter((w) => !GENERIC_WORDS.has(w))
  if (!core.length) return []
  const out: string[] = [core.join(' ')]
  // tên dài ("bo am chen quy toc son thuy") — cụm 2 từ cuối cũng đủ nhận diện
  if (core.length >= 3) out.push(core.slice(-2).join(' '))
  return out.filter((p) => p.replace(/\s/g, '').length >= 5)
}

function productMentioned(textNoAccent: string, productNames: string[]): string | null {
  for (const name of productNames) {
    for (const phrase of corePhrases(name)) {
      // cụm liền nhau, cho phép nhiều khoảng trắng, chặn hai đầu bằng ranh giới từ
      const rx = new RegExp(`(^|[^a-z0-9])${phrase.split(' ').join('\\s+')}([^a-z0-9]|$)`)
      if (rx.test(textNoAccent)) return name
    }
  }
  return null
}

export type SlotState = {
  key: SlotKey
  filled: boolean
  /** Câu đầu tiên làm ô này bật — để người huấn luyện soi lại được. */
  evidence: string | null
  /** Thứ tự tin nhắn làm ô bật (dùng để bắt lỗi xin địa chỉ sớm). */
  at: number | null
}

/** Chấm trạng thái 6 ô từ danh sách tin nhắn theo thứ tự thời gian. */
export function detectSlots(
  messages: Array<{ content: string; senderType: string }>,
  productNames: string[],
): { slots: SlotState[]; earlyAddress: boolean } {
  const state: Record<SlotKey, SlotState> = Object.fromEntries(
    SLOT_KEYS.map((k) => [k, { key: k, filled: false, evidence: null, at: null }]),
  ) as Record<SlotKey, SlotState>

  const mark = (k: SlotKey, i: number, text: string) => {
    if (state[k].filled) return
    state[k] = { key: k, filled: true, evidence: text.slice(0, 160), at: i }
  }

  messages.forEach((m, i) => {
    const text = (m.content || '').trim()
    if (!text) return
    const flat = deAccent(text)

    const hit = productMentioned(flat, productNames)
    if (hit) mark('product', i, `${hit} — "${text.slice(0, 80)}"`)
    if (RX.variant.test(text)) mark('variant', i, text)
    if (RX.quantity.test(text)) mark('quantity', i, text)
    if (RX.total.test(text)) mark('total', i, text)
    if (RX.upsell.test(text)) mark('upsell', i, text)
    if (RX.address.test(text)) mark('address', i, text)
  })

  // Vi phạm: xin/nhận địa chỉ trước khi đủ 4 ô đầu
  const core: SlotKey[] = ['product', 'variant', 'quantity', 'total']
  const addrAt = state.address.at
  const earlyAddress = addrAt !== null &&
    core.some((k) => state[k].at === null || (state[k].at as number) > addrAt)

  return { slots: SLOT_KEYS.map((k) => state[k]), earlyAddress }
}

export default async function orderSlotsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  /** GET /api/v1/ai/simulate/order-slots?conversationId= */
  app.get<{ Querystring: { conversationId?: string } }>(
    '/api/v1/ai/simulate/order-slots', async (request, reply) => {
      const user = request.user as { role: string; orgId: string }
      if (!isAdmin(user.role)) return sendError(reply, 403, 'Chỉ admin/owner')
      const { conversationId } = request.query ?? {}
      if (!conversationId) return sendError(reply, 400, 'Thiếu conversationId')

      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, orgId: user.orgId },
        select: { id: true },
      })
      if (!conv) return sendError(reply, 404, 'Hội thoại không thuộc tổ chức')

      const [messages, products] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId, isDeleted: false, contentType: 'text' },
          orderBy: { sentAt: 'asc' },
          take: 200,
          select: { content: true, senderType: true },
        }),
        prisma.product.findMany({
          where: { orgId: user.orgId, status: 'active' },
          select: { name: true },
          take: 300,
        }),
      ])

      const cleanMessages = messages
        .filter((m) => m.content)
        .map((m) => ({ content: m.content as string, senderType: m.senderType }))
      const { slots, earlyAddress } = detectSlots(cleanMessages, products.map((p) => p.name))
      return {
        slots,
        earlyAddress,
        messageCount: messages.length,
        method: 'text-detect',
        note: 'Dò theo văn bản hội thoại + danh mục sản phẩm thật (không tốn phí AI, có thể sai với câu chữ lạ).',
      }
    })
}
