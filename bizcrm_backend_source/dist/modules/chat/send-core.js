/**
 * send-core.ts — Programmatic message send service.
 *
 * Single entry point for all text sends: HTTP staff route, automation engine,
 * and AI auto-reply harness. Supports splitting long AI replies on paragraph
 * boundaries (≤4 chunks) and marks AI-generated messages with `aiGenerated`.
 */
import { prisma } from '../../shared/prisma-client.js';
import { SenderType, Platform, isPancakePlatform, ResponseSource } from '../../shared/constants.js';
import { emitNewMessage, emitSendError } from '../realtime/socket-gateway.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { getPoolEntry, sendViaPool } from '../zalo/zalo-pool.js';
import { sendTextViaOa, isCsWindowError } from '../zalo-oa/oa-pool.js';
import { sendViaPancake } from '../pancake/pancake-send.js';
import { sendTextViaFb, isFbCsWindowError } from '../facebook-page/fb-pool.js';
import { checkLimits, recordAction } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { transformMessageForFrontend } from './chat-routes.js';
const MAX_AI_CHUNKS = 4;
async function resolveConversation(convId, orgId) {
    return prisma.conversation.findFirst({
        where: { id: convId, orgId },
        select: {
            id: true, contactId: true, orgId: true,
            channelAccountId: true, threadType: true, externalThreadId: true,
            contact: { select: { zaloUid: true } },
            channelAccount: { select: { externalUid: true, externalPageId: true, accessTokenEnc: true, platform: true } },
        },
    });
}
// ── Single-chunk send (low-level) ─────────────────────────────────────────────
async function sendChunk(conv, text, quote) {
    // Web chat: no external platform to call — the message is persisted by the
    // caller (sendMessageCore) and pushed to the visitor via Socket.IO (chat:message).
    // Just mark as sent so it isn't treated as a local-only/failed send.
    if (conv.channelAccount?.platform === Platform.WEBCHAT) {
        return { sent: true };
    }
    // ── Pancake platforms (FB, IG, TikTok via Pancake) ──────────────
    if (conv.channelAccount && isPancakePlatform(conv.channelAccount.platform)) {
        return sendViaPancake(conv, text);
    }
    // ── Facebook Page (official Meta Messenger Platform) ────────────
    // Recipient = the customer's PSID, stored as externalThreadId (like OA).
    if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE) {
        if (!conv.externalThreadId) {
            logger.debug('[send-core] No PSID (externalThreadId) — local message only');
            return { sent: false };
        }
        const result = await sendTextViaFb(conv.channelAccountId, conv.externalThreadId, text);
        return {
            sent: result.sent,
            error: result.error,
            errorCode: result.errorCode,
            externalMsgId: result.messageId,
            csWindowExpired: !result.sent && isFbCsWindowError(result.errorSubcode),
        };
    }
    const isOa = conv.channelAccount?.platform === Platform.ZALO_OA;
    const recipientUid = isOa ? conv.externalThreadId : (conv.externalThreadId || conv.contact?.zaloUid);
    if (!recipientUid) {
        logger.debug('[send-core] No recipient UID — local message only');
        return { sent: false };
    }
    if (isOa) {
        const result = await sendTextViaOa(conv.channelAccountId, recipientUid, text, quote ? { msgId: quote.msgId, text: quote.content } : undefined);
        const csWindowExpired = !result.sent && isCsWindowError(result.errorCode);
        return {
            sent: result.sent,
            error: result.error,
            errorCode: result.errorCode,
            externalMsgId: result.messageId,
            csWindowExpired,
        };
    }
    // Personal Zalo via pool
    const poolEntry = getPoolEntry(conv.channelAccountId);
    if (!poolEntry || poolEntry.status !== 'connected') {
        // Trước đây trả về im lặng ở mức debug → AI "trả lời" mà khách không nhận,
        // giao diện vẫn hiện như đã gửi. Phải nói rõ lý do để tầng trên xử lý.
        logger.warn(`[send-core] Zalo account ${conv.channelAccountId} not connected — message saved locally only`);
        return { sent: false, error: 'Tài khoản Zalo chưa kết nối — tin chỉ lưu trong hệ thống', errorCode: 'NOT_CONNECTED' };
    }
    const rateCheck = checkLimits(conv.channelAccountId, 'message');
    if (!rateCheck.allowed) {
        return { sent: false, error: rateCheck.reason || 'Rate limit exceeded' };
    }
    const targetUid = conv.externalThreadId || conv.contact?.zaloUid;
    if (!targetUid) {
        logger.warn(`[send-core] No target UID for conv ${conv.id} — local only`);
        return { sent: false, error: 'Không có địa chỉ người nhận trên kênh', errorCode: 'NO_RECIPIENT' };
    }
    const result = await sendViaPool(conv.channelAccountId, targetUid, text, conv.id, quote, conv.threadType);
    if (result.sent) {
        recordAction(conv.channelAccountId, 'message');
    }
    return { sent: result.sent, error: result.error };
}
// ── Core send function ────────────────────────────────────────────────────────
/**
 * Send one or more text messages programmatically.
 *
 * For `sender='ai'`: splits on paragraph boundaries (≤4 chunks), sets
 * `aiGenerated=true`, senderName='AI Assistant'.
 * For `sender='staff'`: single message, senderName='Staff'.
 */
export async function sendMessageCore(params) {
    const { orgId, conversationId, text, sender, repliedByUserId, aiReplyRunId, quote } = params;
    const conv = await resolveConversation(conversationId, orgId);
    if (!conv) {
        throw new Error(`Conversation ${conversationId} not found in org ${orgId}`);
    }
    // Derive the response source unless the caller set one explicitly.
    const responseSource = params.responseSource !== undefined
        ? params.responseSource
        : sender === 'ai'
            ? ResponseSource.AI_AUTO
            : repliedByUserId
                ? ResponseSource.MANUAL
                : null;
    // Split text for AI sends; staff sends are always single
    const chunks = sender === 'ai'
        ? text.split(/\n{2,}/).map(c => c.trim()).filter(Boolean).slice(0, MAX_AI_CHUNKS)
        : [text];
    const results = [];
    let overallSentViaZalo = false;
    let lastError;
    let lastErrorCode;
    let csWindowExpired = false;
    for (const chunk of chunks) {
        const zaloResult = await sendChunk(conv, chunk, sender === 'staff' ? quote : undefined);
        if (zaloResult.csWindowExpired) {
            csWindowExpired = true;
        }
        const message = await prisma.message.create({
            data: {
                conversationId,
                senderType: SenderType.SELF,
                senderUid: '',
                senderName: sender === 'ai' ? 'AI Assistant' : 'Staff',
                content: chunk,
                contentType: 'text',
                quote: sender === 'staff' ? (quote ?? undefined) : undefined,
                sentAt: new Date(),
                repliedByUserId: sender === 'ai' ? null : (repliedByUserId ?? null),
                aiGenerated: sender === 'ai',
                aiReplyRunId: sender === 'ai' ? (aiReplyRunId ?? null) : null,
                responseSource,
                externalMsgId: zaloResult.externalMsgId ?? null,
            },
            include: { repliedBy: { select: { fullName: true } } }, // surface staff name to the UI
        });
        if (zaloResult.sent) {
            overallSentViaZalo = true;
        }
        else if (zaloResult.error) {
            lastError = zaloResult.error;
            lastErrorCode = zaloResult.errorCode;
        }
        const fePayload = transformMessageForFrontend({
            ...message,
            senderType: SenderType.SELF,
            senderName: (sender === 'ai' ? 'AI Assistant' : 'Staff'),
        });
        results.push(fePayload);
        try {
            emitNewMessage(orgId, conversationId, fePayload);
        }
        catch { /* socket not connected */ }
    }
    // Tin AI không ra được kênh → báo cho người đang xem + sidebar, giống đường
    // gửi tay của nhân viên. Trước đây chỉ nhân viên gửi tay mới được báo lỗi.
    if (sender === 'ai' && !overallSentViaZalo && conv.channelAccount?.platform !== Platform.WEBCHAT) {
        try {
            emitSendError(orgId, conversationId, {
                messageId: results[0]?.id,
                reason: lastError ?? 'AI đã soạn trả lời nhưng không gửi được tới kênh',
            });
        }
        catch { /* socket not ready */ }
    }
    // Update conversation metadata once (after all chunks)
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
    });
    // Trigger automation (fire-and-forget, on the last chunk text).
    // Default: staff sends re-trigger 'message_sent' (preserves HTTP route);
    // ai sends do not. Automation passes triggerAutomation:false to avoid loops.
    const shouldTriggerAutomation = params.triggerAutomation ?? (sender === 'staff');
    if (shouldTriggerAutomation) {
        const lastChunk = chunks[chunks.length - 1] ?? text;
        runAutomationRules('message_sent', {
            orgId: conv.orgId,
            conversationId: conv.id,
            contactId: conv.contactId ?? undefined,
            messageText: lastChunk,
        }).catch(err => logger.error({ err }, '[automation] trigger error after sendMessageCore'));
    }
    return {
        messages: results,
        sentViaZalo: overallSentViaZalo,
        zaloError: lastError,
        zaloErrorCode: lastErrorCode,
        csWindowExpired,
    };
}
//# sourceMappingURL=send-core.js.map