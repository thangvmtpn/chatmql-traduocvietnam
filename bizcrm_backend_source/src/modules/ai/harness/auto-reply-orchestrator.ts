/**
 * auto-reply-orchestrator.ts — Chạy một lượt AI trả lời cho một hội thoại.
 *
 * Được kích hoạt từ enqueueAiReply (debounce trong tiến trình) — KHÔNG còn đi
 * qua hàng đợi BullMQ. Mỗi hội thoại chạy tuần tự nhờ khoá trong bộ nhớ.
 *
 * Luồng một lượt:
 *   1. Nạp hội thoại + cấu hình AI của org
 *   2. Chặn: tắt tổng / đang tạm dừng / chế độ hiệu lực = manual
 *   3. Gom các tin khách CHƯA xử lý → turnText
 *   4. runHarness(...) trong ngân sách thời gian (huỷ thật qua AbortSignal)
 *   5. Rẽ nhánh: handoff → applyHandoff | suggest → nháp cho nhân viên | auto → gửi
 *   6. CHỈ KHI XONG mới tiến lastAiProcessedMessageId
 *
 * Nguyên tắc thất bại — không bao giờ bỏ rơi khách trong im lặng:
 *   - Lỗi hạ tầng (model, quota, hết ngân sách thời gian): KHÔNG tiến con trỏ,
 *     thử lại một lần sau RETRY_DELAY_MS; vẫn hỏng → chế độ auto thì chuyển
 *     nhân viên, chế độ suggest thì tiến con trỏ (nhân viên tự trả lời).
 *   - Gửi ra kênh thất bại (Zalo rớt…): tin đã được soạn và lưu, không thử lại
 *     (thử lại là tạo bản sao) — chuyển ngay cho nhân viên gửi tay.
 */
import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import { enqueueAiReply } from '../../../shared/queue.js'
import { getAiReplyConfig, resolveConversationMode } from '../ai-config-service.js'
import { runHarness } from './reply-generator.js'
import { deliverSuggestDraft } from './suggest-delivery.js'
import { sendMessageCore } from '../../chat/send-core.js'
import { sendImageCore } from '../../chat/send-image-core.js'
import { applyHandoff } from '../handoff-service.js'
import { recordStep } from '../observability/trace-recorder.js'
import { emitAiTyping } from '../../realtime/socket-gateway.js'
import { sendTypingViaPool } from '../../zalo/zalo-pool.js'
import { Platform } from '../../../shared/constants.js'
import type { HarnessResult } from './harness-types.js'

const activeAiConversations = new Set<string>()

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : fallback
}
/** Ngân sách thời gian cho CẢ lượt (router + tool + critic + gửi). Hết là huỷ thật. */
const TURN_BUDGET_MS = envInt('AI_TURN_BUDGET_MS', 60_000)
/** Chờ bao lâu trước khi thử lại một lượt lỗi hạ tầng. */
const RETRY_DELAY_MS = envInt('AI_RETRY_DELAY_MS', 30_000)
const MAX_RETRIES = 1
/** Số lần đã thử lại theo hội thoại (xoá khi thành công). */
const retryCounts = new Map<string, number>()

/**
 * Chạy lượt AI cho một hội thoại, có khoá tuần tự và ngân sách thời gian.
 */
export async function processAiReply(convId: string): Promise<void> {
  if (activeAiConversations.has(convId)) {
    // Đang chạy dở: hẹn lại. Khi lượt hiện tại xong, lượt sau chỉ lấy tin mới.
    logger.info({ convId }, '[orchestrator] conversation already processing — scheduling follow-up')
    setTimeout(() => { enqueueAiReply(convId, 0).catch(() => {}) }, 1500)
    return
  }
  activeAiConversations.add(convId)

  // Huỷ THẬT: signal đi xuống từng lệnh gọi model. Promise.race trước đây chỉ
  // bỏ khoá còn pipeline vẫn chạy ngầm và vẫn gửi → trả lời đôi/muộn.
  const ac = new AbortController()
  const timer = setTimeout(
    () => ac.abort(new Error(`AI turn exceeded ${TURN_BUDGET_MS}ms budget`)),
    TURN_BUDGET_MS,
  )
  try {
    await executeAiReplyPipeline(convId, ac.signal)
  } catch (err: any) {
    logger.error({ err: err?.message ?? String(err), convId }, '[orchestrator] execution failed')
  } finally {
    clearTimeout(timer)
    activeAiConversations.delete(convId)
  }
}

async function advanceCursor(convId: string, messageId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: convId },
    data: { lastAiProcessedMessageId: messageId },
  })
}

async function executeAiReplyPipeline(convId: string, signal: AbortSignal): Promise<void> {
  // ── 1. Nạp hội thoại ─────────────────────────────────────────────────────
  const conv = await prisma.conversation.findUnique({
    where: { id: convId },
    select: {
      id: true,
      orgId: true,
      aiMode: true,
      aiModeReason: true,
      aiPausedUntil: true,
      lastAiProcessedMessageId: true,
      channelAccountId: true,
      threadType: true,
      externalThreadId: true,
      contact: { select: { zaloUid: true } },
      channelAccount: { select: { platform: true } },
    },
  })
  if (!conv) {
    logger.warn({ convId }, '[orchestrator] conversation not found — skipping')
    return
  }
  const { orgId } = conv
  logger.info({ convId }, '[orchestrator] processing')

  // ── 2. Chặn ──────────────────────────────────────────────────────────────
  const aiCfg = await getAiReplyConfig(orgId)
  if (!aiCfg.autoReplyEnabled) {
    logger.info({ convId }, '[orchestrator] master autoReplyEnabled=false — skipping')
    return
  }
  const isPaused = !!(conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date())
  if (isPaused) {
    logger.info({ convId, until: conv.aiPausedUntil }, '[orchestrator] conversation paused — skipping')
    return
  }
  const effectiveMode = resolveConversationMode({
    orgId,
    autoReplyEnabled: aiCfg.autoReplyEnabled,
    defaultAiMode: aiCfg.defaultAiMode,
    convAiMode: conv.aiMode,
    convAiModeReason: conv.aiModeReason,
    schedule: aiCfg.schedule,
  })
  if (effectiveMode === 'manual') {
    logger.info({ convId, effectiveMode, convAiMode: conv.aiMode }, '[orchestrator] manual mode — skipping')
    return
  }

  // ── 3. Gom tin khách chưa xử lý ──────────────────────────────────────────
  // Con trỏ theo sentAt — Message.id là UUID ngẫu nhiên, không sắp theo thời gian.
  let cursorSentAt: Date | null = null
  if (conv.lastAiProcessedMessageId) {
    const cursorMsg = await prisma.message.findUnique({
      where: { id: conv.lastAiProcessedMessageId },
      select: { sentAt: true },
    })
    cursorSentAt = cursorMsg?.sentAt ?? null
  }
  const unprocessed = await prisma.message.findMany({
    where: {
      conversationId: convId,
      senderType: 'contact',
      ...(cursorSentAt ? { sentAt: { gt: cursorSentAt } } : {}),
    },
    orderBy: { sentAt: 'asc' },
    select: { id: true, content: true, contentType: true, sentAt: true },
  })
  if (unprocessed.length === 0) {
    logger.info({ convId, cursorSentAt }, '[orchestrator] no unprocessed messages — skipping')
    return
  }
  const lastMessageId = unprocessed.at(-1)!.id
  const firstUnprocessedAt = unprocessed[0].sentAt

  const turnText = unprocessed
    .map(m => {
      if (m.contentType === 'sticker' || (m.content?.startsWith('{') && m.content?.includes('"catId"'))) {
        return '[Khách gửi nhãn dán biểu cảm]'
      }
      if (m.contentType === 'image' || (m.content?.startsWith('{') && m.content?.includes('"href"'))) {
        return '[Khách gửi hình ảnh]'
      }
      return m.content?.trim()
    })
    .filter(Boolean)
    .join('\n')

  if (!turnText) {
    // Chỉ media, không có gì để trả lời — coi như đã xử lý.
    await advanceCursor(convId, lastMessageId)
    logger.debug({ convId }, '[orchestrator] empty turn text (media only) — cursor advanced')
    return
  }

  // ── Đang soạn: chỉ bật khi chắc chắn sẽ chạy harness ────────────────────
  try { emitAiTyping(convId, true) } catch { /* socket not ready */ }
  if (effectiveMode === 'auto' && conv.channelAccount?.platform === Platform.ZALO_USER) {
    const recipient = conv.threadType === 'group' ? conv.externalThreadId : (conv.externalThreadId || conv.contact?.zaloUid)
    if (recipient) {
      sendTypingViaPool(conv.channelAccountId, recipient, conv.threadType as 'user' | 'group').catch(() => {})
    }
  }

  let failure: { kind: 'infra' | 'delivery'; reason: string } | null = null
  let result: HarnessResult | null = null

  try {
    // ── 4. Harness ─────────────────────────────────────────────────────────
    try {
      result = await runHarness(orgId, convId, turnText, effectiveMode, {
        signal,
        historyBefore: firstUnprocessedAt,
      })
    } catch (err: any) {
      // Quota, huỷ do hết ngân sách, lỗi bất ngờ trong harness
      failure = { kind: 'infra', reason: err?.message ?? String(err) }
    }

    if (result && result.error) {
      failure = { kind: 'infra', reason: result.error }
    }

    // ── 5. Rẽ nhánh (chỉ khi harness không lỗi) ───────────────────────────
    if (result && !failure) {
      if (result.handoff?.should) {
        if (effectiveMode === 'auto') {
          await sendMessageCore({
            orgId,
            conversationId: convId,
            text: 'Dạ em đã ghi nhận thông tin và chuyển cho chuyên viên tư vấn của Trà Dược Việt Nam liên hệ hỗ trợ mình ngay nhé ạ.',
            sender: 'ai',
            aiReplyRunId: result.runId,
            triggerAutomation: false,
          }).catch(() => {})
        }
        await applyHandoff(orgId, convId, result.handoff.reason)
      } else if (effectiveMode === 'suggest') {
        if (result.reply) await deliverSuggestDraft(orgId, convId, result)
      } else if (effectiveMode === 'auto' && result.reply) {
        const sendResult = await sendMessageCore({
          orgId,
          conversationId: convId,
          text: result.reply,
          sender: 'ai',
          aiReplyRunId: result.runId,
          triggerAutomation: false,
        })
        if (!sendResult.sentViaZalo) {
          failure = {
            kind: 'delivery',
            reason: sendResult.csWindowExpired
              ? 'Ngoài khung nhắn tin — cần nhân viên trả lời'
              : `AI đã soạn trả lời nhưng không gửi được tới kênh (${sendResult.zaloError ?? 'không rõ lý do'}) — nhân viên gửi lại giúp`,
          }
        } else if (result.images?.length) {
          // Ảnh gửi SAU khi chữ đã ra kênh. Ảnh hỏng không chuyển người — khách
          // đã có câu trả lời bằng chữ; chỉ ghi log.
          for (const img of result.images) {
            try {
              const r = await sendImageCore({
                orgId, conversationId: convId,
                imageUrl: img.imageUrl, caption: img.caption,
                sender: 'ai', aiReplyRunId: result.runId,
              })
              if (!r.sent) logger.warn({ convId, product: img.productName, err: r.error }, '[orchestrator] không gửi được ảnh sản phẩm')
              else logger.info({ convId, product: img.productName }, '[orchestrator] AI đã gửi ảnh sản phẩm')
            } catch (err) {
              logger.error({ err, convId, product: img.productName }, '[orchestrator] lỗi khi gửi ảnh sản phẩm')
            }
          }
        }
      }
    }
  } finally {
    // LUÔN tắt — kể cả lỗi, để chỉ báo "đang soạn" không bao giờ kẹt.
    try { emitAiTyping(convId, false) } catch { /* socket not ready */ }
  }

  // ── 6. Kết thúc: thành công → tiến con trỏ ───────────────────────────────
  if (!failure) {
    await advanceCursor(convId, lastMessageId)
    retryCounts.delete(convId)
    logger.info({ convId, orgId, effectiveMode, messages: unprocessed.length }, '[orchestrator] turn completed')
    return
  }

  // ── Thất bại ─────────────────────────────────────────────────────────────
  recordStep({
    orgId, conversationId: convId, aiReplyRunId: result?.runId,
    step: 'error', level: 'error',
    payload: { phase: 'orchestrator', kind: failure.kind, error: failure.reason, mode: effectiveMode },
  })

  if (failure.kind === 'delivery') {
    // Tin đã soạn & lưu — thử lại chỉ tạo bản sao. Người phải gửi tay.
    await advanceCursor(convId, lastMessageId)
    retryCounts.delete(convId)
    logger.warn({ convId, reason: failure.reason }, '[orchestrator] delivery failed — handing off to staff')
    await applyHandoff(orgId, convId, failure.reason)
    return
  }

  // Lỗi hạ tầng: thử lại một lần, KHÔNG tiến con trỏ (tin khách vẫn còn nguyên).
  const tries = retryCounts.get(convId) ?? 0
  if (tries < MAX_RETRIES) {
    retryCounts.set(convId, tries + 1)
    logger.warn({ convId, tries: tries + 1, retryInMs: RETRY_DELAY_MS, reason: failure.reason }, '[orchestrator] infra failure — will retry')
    setTimeout(() => { enqueueAiReply(convId, 0).catch(() => {}) }, RETRY_DELAY_MS)
    return
  }

  // Thử lại vẫn hỏng.
  retryCounts.delete(convId)
  await advanceCursor(convId, lastMessageId)
  if (effectiveMode === 'auto') {
    logger.error({ convId, reason: failure.reason }, '[orchestrator] infra failure after retry — handing off to staff')
    await applyHandoff(orgId, convId, `AI lỗi liên tiếp (${failure.reason}) — cần nhân viên trả lời`)
  } else {
    // Chế độ gợi ý: khách không bị ảnh hưởng, nhân viên vẫn tự trả lời.
    logger.error({ convId, reason: failure.reason }, '[orchestrator] infra failure after retry (suggest mode) — no draft for this turn')
  }
}

/**
 * Khởi động lại là mất hết timer debounce trong bộ nhớ → tin khách đến trong
 * vài giây trước khi restart không bao giờ được trả lời. Quét lại các hội thoại
 * có tin khách mới hơn con trỏ trong 30 phút gần nhất và xếp lịch lại. Mọi
 * chặn (manual/tạm dừng/tắt) vẫn áp dụng bên trong pipeline nên quét dư không hại.
 */
export async function recoverPendingAiReplies(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id
    FROM conversations c
    JOIN messages m
      ON m.conversation_id = c.id
     AND m.sender_type = 'contact'
     AND m.sent_at > now() - interval '30 minutes'
    LEFT JOIN messages cur ON cur.id = c.last_ai_processed_message_id
    WHERE cur.id IS NULL OR m.sent_at > cur.sent_at
    GROUP BY c.id
    LIMIT 200
  `
  let n = 0
  for (const r of rows) {
    // rải đều để không dội cả loạt vào model cùng lúc
    setTimeout(() => { enqueueAiReply(r.id, 2500).catch(() => {}) }, n * 500)
    n++
  }
  if (n) logger.info({ count: n }, '[orchestrator] re-scheduled AI replies pending from before restart')
  return n
}
