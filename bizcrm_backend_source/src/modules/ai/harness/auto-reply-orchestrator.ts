/**
 * auto-reply-orchestrator.ts — BullMQ worker processor for ai-reply queue.
 *
 * One job per conversation (jobId = convId). Debounce is enforced by the queue:
 * each new inbound message reschedules the job (removing the previous delay).
 *
 * Flow per job:
 *   1. Load conversation + org AI config
 *   2. Guard: skip if master off / paused / effective mode === 'manual'
 *   3. Aggregate unprocessed inbound messages → turnText
 *   4. runHarness(orgId, convId, turnText)
 *   5. Branch: handoff → applyHandoff | suggest → generateSuggestDraft | auto → sendMessageCore
 *   6. Update lastAiProcessedMessageId
 */
import type { Job } from 'bullmq'
import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import { initAiReplyWorker, type AiReplyJobData } from '../../../shared/queue.js'
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

async function processAiReplyJob(job: Job<AiReplyJobData>): Promise<void> {
  const { convId } = job.data

  try {
    // ── 1. Load conversation ────────────────────────────────────────────────
    const conv = await prisma.conversation.findUnique({
      where: { id: convId },
      select: {
        id: true,
        orgId: true,
        aiMode: true,
        aiPausedUntil: true,
        lastAiProcessedMessageId: true,
        // For the customer-facing typing indicator (Zalo personal only)
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

    // ── 2. Guards ───────────────────────────────────────────────────────────
    const aiCfg = await getAiReplyConfig(orgId)

    if (!aiCfg.autoReplyEnabled) {
      logger.debug({ convId }, '[orchestrator] master autoReplyEnabled=false — skipping')
      return
    }

    const isPaused = !!(conv.aiPausedUntil && new Date(conv.aiPausedUntil) > new Date())
    if (isPaused) {
      logger.debug({ convId, until: conv.aiPausedUntil }, '[orchestrator] conversation paused — skipping')
      return
    }

    const effectiveMode = resolveConversationMode({
      orgId,
      autoReplyEnabled: aiCfg.autoReplyEnabled,
      defaultAiMode: aiCfg.defaultAiMode,
      convAiMode: conv.aiMode,
      schedule: aiCfg.schedule,
    })

    if (effectiveMode === 'manual') {
      logger.debug({ convId, effectiveMode }, '[orchestrator] manual mode — skipping')
      return
    }

    // ── 3. Aggregate unprocessed inbound messages ────────────────────────────
    // Cursor by sentAt — Message.id is a random UUID (NOT insertion-ordered),
    // so `id > cursor` would skip/reprocess messages. Resolve the cursor's sentAt.
    let cursorSentAt: Date | null = null
    if (conv.lastAiProcessedMessageId) {
      const cursorMsg = await prisma.message.findUnique({
        where: { id: conv.lastAiProcessedMessageId },
        select: { sentAt: true },
      })
      cursorSentAt = cursorMsg?.sentAt ?? null
    }

    const unprocessedMessages = await prisma.message.findMany({
      where: {
        conversationId: convId,
        senderType: 'contact',
        ...(cursorSentAt ? { sentAt: { gt: cursorSentAt } } : {}),
      },
      orderBy: { sentAt: 'asc' },
      select: { id: true, content: true, sentAt: true },
    })

    if (unprocessedMessages.length === 0) {
      logger.debug({ convId }, '[orchestrator] no unprocessed messages — skipping')
      return
    }

    const lastMessageId = unprocessedMessages.at(-1)!.id

    // ── Advance the processed pointer EARLY (before harness/send) ─────────────
    // Guarantees these messages can never be reprocessed → no duplicate auto-send,
    // even if the harness/send below fails (attempts:1 means no retry anyway).
    await prisma.conversation.update({
      where: { id: convId },
      data: { lastAiProcessedMessageId: lastMessageId },
    })

    const turnText = unprocessedMessages
      .map(m => m.content?.trim())
      .filter(Boolean)
      .join('\n')

    if (!turnText) {
      logger.debug({ convId }, '[orchestrator] empty turn text (media only?) — skipping')
      return
    }

    // ── Typing indicator: ON only now (all guards passed → harness WILL run).
    // Socket: test chat + inbox viewers. Zalo personal: only in auto mode —
    // in suggest mode the customer gets no message, typing would mislead them.
    try { emitAiTyping(convId, true) } catch { /* socket not ready */ }
    if (effectiveMode === 'auto' && conv.channelAccount?.platform === Platform.ZALO_USER) {
      const recipient = conv.threadType === 'group' ? conv.externalThreadId : (conv.externalThreadId || conv.contact?.zaloUid)
      if (recipient) {
        sendTypingViaPool(conv.channelAccountId, recipient, conv.threadType as 'user' | 'group')
          .catch(() => { /* cosmetic */ })
      }
    }

    try {
      // ── 4. Run harness ─────────────────────────────────────────────────────
      const result = await runHarness(orgId, convId, turnText, effectiveMode)

      // ── 5. Branch on result ────────────────────────────────────────────────
      if (result.handoff?.should) {
        await applyHandoff(orgId, convId, result.handoff.reason)
      } else if (effectiveMode === 'suggest') {
        // Reuse the harness result already computed above (no second LLM run)
        if (result.reply) {
          await deliverSuggestDraft(orgId, convId, result)
        }
      } else if (effectiveMode === 'auto' && result.reply) {
        // Auto mode: send directly to customer
        const sendResult = await sendMessageCore({
          orgId,
          conversationId: convId,
          text: result.reply,
          sender: 'ai',
          aiReplyRunId: result.runId,
          triggerAutomation: false,
        })
        // If the reply couldn't actually be delivered due to expired window,
        // hand off to a human to alert the team.
        if (!sendResult.sentViaZalo) {
          logger.warn(
            { convId, csWindowExpired: sendResult.csWindowExpired, err: sendResult.zaloError },
            '[orchestrator] AI reply not delivered to channel',
          )
          if (sendResult.csWindowExpired) {
            await applyHandoff(
              orgId,
              convId,
              'Ngoài khung nhắn tin — cần nhân viên trả lời',
            )
          }
        } else if (result.images?.length) {
          // Ảnh gửi SAU khi phần chữ đã thực sự ra kênh. Gửi trước thì khách
          // nhận được ảnh trơ không lời dẫn khi phần chữ hỏng.
          //
          // Ảnh hỏng KHÔNG chuyển nhân viên: khách đã có câu trả lời bằng chữ,
          // thiếu ảnh là bất tiện chứ không phải hội thoại bị bỏ rơi. Chỉ ghi log.
          for (const img of result.images) {
            try {
              const r = await sendImageCore({
                orgId,
                conversationId: convId,
                imageUrl: img.imageUrl,
                caption: img.caption,
                sender: 'ai',
                aiReplyRunId: result.runId,
              })
              if (!r.sent) {
                logger.warn({ convId, product: img.productName, err: r.error },
                  '[orchestrator] không gửi được ảnh sản phẩm')
              } else {
                logger.info({ convId, product: img.productName },
                  '[orchestrator] AI đã gửi ảnh sản phẩm')
              }
            } catch (err) {
              logger.error({ err, convId, product: img.productName },
                '[orchestrator] lỗi khi gửi ảnh sản phẩm')
            }
          }
        }
      }
    } finally {
      // ALWAYS clear — success, handoff, skip or throw. Combined with the
      // client-side auto-timeout this makes a stuck indicator impossible.
      try { emitAiTyping(convId, false) } catch { /* socket not ready */ }
    }

    logger.info(
      { convId, orgId, effectiveMode, messages: unprocessedMessages.length },
      '[orchestrator] job completed',
    )
  } catch (err) {
    // Log but never throw — BullMQ will retry on throw; we prefer to skip on error
    logger.error({ err, convId }, '[orchestrator] job error — not retrying')
    // Fire-and-forget error trace (best-effort — orgId may be unknown here)
    // We attempt to load orgId for the trace if not already in scope
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: convId },
        select: { orgId: true },
      })
      if (conv) {
        recordStep({
          orgId: conv.orgId,
          conversationId: convId,
          step: 'error',
          level: 'error',
          payload: { phase: 'orchestrator', error: String(err) },
        })
      }
    } catch {
      // ignore — tracing must never affect the main flow
    }
  }
}

/**
 * Initialize the AI reply worker. Call once from app.ts on startup.
 */
export function initAiReplyOrchestrator(): void {
  initAiReplyWorker(processAiReplyJob)
  logger.info('[orchestrator] AI reply orchestrator started')
}
