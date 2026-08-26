import { ThreadType } from 'zca-js';
import { prisma } from '../../shared/prisma-client.js';
import { getIO, emitGroupMembersUpdated, emitSeenReceipt, emitInboundReaction, emitFriendEvent, } from '../realtime/socket-gateway.js';
import { handleIncomingMessage, handleMessageUndo, enrichContactFromZalo } from '../chat/message-handler.js';
import { startMessageSync } from './zalo-message-sync.js';
import { logger } from '../../shared/logger.js';
import { pushDebug, updateStatus, getPoolEntry } from './zalo-pool.js';
/**
 * Comprehensive content type detection — ported from ZaloCRM's zalo-message-helpers.ts.
 * Uses both the msgType string AND content object shape inspection to correctly
 * categorize 19+ Zalo message types. Falls back to 'text' for truly unknown types.
 */
// Well-known msgType keyword patterns — used to suppress noise logging
const KNOWN_MSG_TYPE_PATTERNS = [
    'photo', 'image', 'sticker', 'video', 'voice',
    'gif', 'link', 'location', 'file', 'doc',
    'recommended', 'card', 'bank', 'transfer',
    'call', 'voip', 'qr', 'remind', 'todo',
    'poll', 'vote', 'note', 'forward',
];
function detectContentType(msgType, content) {
    // Numeric type map (zca-js listener uses these)
    if (typeof msgType === 'number' || (typeof msgType === 'string' && /^\d+$/.test(msgType))) {
        const numericMap = {
            '1': 'text', '2': 'image', '3': 'sticker', '4': 'video',
            '5': 'voice', '6': 'gif', '7': 'link', '8': 'file',
        };
        const mapped = numericMap[String(msgType)];
        if (mapped)
            return mapped;
    }
    // String-based msgType detection (covers chat.photo, share.file, chat.sticker, etc.)
    const mt = String(msgType || '').toLowerCase();
    if (!mt || mt === 'webchat' || mt === 'undefined')
        return 'text';
    if (mt.includes('photo') || mt.includes('image'))
        return 'image';
    if (mt.includes('sticker'))
        return 'sticker';
    if (mt.includes('video'))
        return 'video';
    if (mt.includes('voice'))
        return 'voice';
    if (mt.includes('gif'))
        return 'gif';
    if (mt.includes('link'))
        return 'link';
    if (mt.includes('location'))
        return 'location';
    if (mt.includes('file') || mt.includes('doc'))
        return 'file';
    if (mt.includes('recommended') || mt.includes('card')) {
        // Check if this is a call record (sendBubbleMessage with action "recommened.calltime" or "recommened.misscall")
        const callContent = typeof content === 'string' ? (() => { try {
            return JSON.parse(content);
        }
        catch {
            return null;
        } })() : content;
        if (callContent?.action === 'recommened.calltime' || callContent?.action === 'recommened.misscall')
            return 'call';
        // Check if this is a birthday notification before falling back to contact_card
        if (typeof content === 'string') {
            try {
                const cardData = JSON.parse(content);
                if (isBirthdayNotification(cardData))
                    return 'birthday_notification';
            }
            catch { /* not JSON — fall through */ }
        }
        else if (typeof content === 'object' && content !== null) {
            if (isBirthdayNotification(content))
                return 'birthday_notification';
        }
        return 'contact_card';
    }
    // Special message types
    if (mt.includes('bank') || mt.includes('transfer'))
        return 'bank_transfer';
    if (mt.includes('call') || mt.includes('voip'))
        return 'call';
    if (mt.includes('qr'))
        return 'qr_code';
    if (mt.includes('remind') || mt.includes('todo'))
        return 'reminder';
    if (mt.includes('poll') || mt.includes('vote'))
        return 'poll';
    if (mt.includes('note'))
        return 'note';
    if (mt.includes('forward'))
        return 'forwarded';
    // Check content object shape for action-based messages
    if (typeof content === 'object' && content !== null) {
        if (content.action === 'recommened.calltime' || content.action === 'recommened.misscall')
            return 'call';
        if (content.action === 'msginfo.actionlist')
            return 'reminder';
        if (content.action === 'zinstant.bankcard')
            return 'bank_card';
        if (content.bankCode || content.bankName)
            return 'bank_transfer';
        if (content.callDuration !== undefined || content.callType)
            return 'call';
        // Log unknown object types for analysis before returning 'rich'
        if (!KNOWN_MSG_TYPE_PATTERNS.some(p => mt.includes(p))) {
            logger.info(`[zalo:msgType] Unknown object type: "${msgType}" action=${content.action || '-'} keys=${Object.keys(content).join(',')}`);
        }
        return 'rich';
    }
    // Log unknown string-content types for discovery
    if (!KNOWN_MSG_TYPE_PATTERNS.some(p => mt.includes(p))) {
        logger.info(`[zalo:msgType] Unknown string type: "${msgType}" preview=${typeof content === 'string' ? content.slice(0, 80) : ''}`);
    }
    return 'text';
}
/**
 * Detect Zalo birthday system notification.
 * These arrive as contact_card type messages with action "show.profile"
 * and a title like "17/05 Sinh nhật của Anh Hưng Bắc Giang".
 */
function isBirthdayNotification(cardData) {
    if (!cardData)
        return false;
    const title = cardData.title || '';
    // Nested params may contain the real action
    let params = null;
    try {
        params = typeof cardData.params === 'string' ? JSON.parse(cardData.params) : cardData.params;
    }
    catch { /* ignore */ }
    const actions = params?.actions || [];
    const hasBirthdaySticker = actions.some((a) => a.actionId === 'action.open.sendsticker');
    return ((cardData.action === 'show.profile' || hasBirthdaySticker) &&
        /\d{2}\/\d{2}\s+Sinh nhật/i.test(title));
}
/**
 * Parse birthday date (DD/MM) and contact name from Zalo birthday notification title.
 * Example title: "17/05 Sinh nhật của Anh Hưng Bắc Giang 0354113129"
 * Returns { day, month, contactName } or null.
 */
export function parseBirthdayFromContent(rawContent) {
    try {
        const d = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
        const title = d?.title || '';
        const match = title.match(/(\d{2})\/(\d{2})\s+Sinh nhật\s+của\s+(.+)/i);
        if (!match)
            return null;
        return {
            day: parseInt(match[1], 10),
            month: parseInt(match[2], 10),
            contactName: match[3].trim(),
        };
    }
    catch {
        return null;
    }
}
/** Extract delete-for-me event from Zalo message content (string or object).
 *  Returns { clientDelMsgId, globalDelMsgId } if found, null otherwise. */
function extractDeleteEvent(content) {
    const check = (ev) => {
        if (ev?.clientDelMsgId && ev.clientDelMsgId !== 0) {
            return {
                clientDelMsgId: ev.clientDelMsgId,
                globalDelMsgId: ev.globalDelMsgId ? String(ev.globalDelMsgId) : undefined,
            };
        }
        return null;
    };
    if (typeof content === 'string') {
        try {
            const parsed = JSON.parse(content);
            return check(Array.isArray(parsed) ? parsed[0] : parsed);
        }
        catch {
            return null;
        }
    }
    if (typeof content === 'object' && content !== null) {
        return check(Array.isArray(content) ? content[0] : content);
    }
    return null;
}
/**
 * Set up message listener for an authenticated Zalo account.
 * Directly calls handleIncomingMessage() — no HTTP round-trip.
 */
export function setupMessageListener(accountId, orgId, api) {
    // Once an account is removed, disconnectAccount() deletes its pool entry (and
    // detaches these listeners). zca-js's retryOnClose can still re-open the socket
    // mid-teardown, so the inbound handler also bails whenever the pool entry is
    // gone — a removed account must never keep recording messages.
    const isActive = () => getPoolEntry(accountId) !== undefined;
    api.listener.on('message', async (message) => {
        if (!isActive())
            return;
        try {
            const data = message.data || message;
            const threadId = message.threadId || data.uidFrom || '';
            const isSelf = message.isSelf ?? false;
            // ── Skip client-side delete events (xóa phía tôi) ──────────────
            // Zalo sends a "message" with content like: { type: 4, actionType: 0, clientDelMsgId: N, globalDelMsgId: N }
            // This is "delete for me" — NOT recall. The message should still be visible to other CRM users.
            // True recall (thu hồi) is handled by the separate `undo` listener below.
            const deleteEvent = extractDeleteEvent(data.content);
            if (deleteEvent) {
                logger.info(`[zalo-pool] ${accountId} ← skip delete-for-me (clientDelMsgId=${deleteEvent.clientDelMsgId} globalDelMsgId=${deleteEvent.globalDelMsgId || '-'})`);
                pushDebug(accountId, 'skip_delete_for_me', `clientDelMsgId=${deleteEvent.clientDelMsgId}`, deleteEvent);
                return;
            }
            const contentPreview = typeof data.content === 'string' ? data.content.slice(0, 100) : data.content?.text?.slice(0, 100) || '';
            logger.info(`[zalo-pool] ${accountId} ← msg from=${data.uidFrom || 'self'} thread=${threadId} type=${message.type}`);
            pushDebug(accountId, 'message', `from=${data.uidFrom || 'self'} thread=${threadId} type=${message.type}${contentPreview ? ` | ${contentPreview}` : ''}`, {
                uidFrom: data.uidFrom, threadId, msgType: data.msgType, type: message.type, isSelf,
                content: typeof data.content === 'string' ? data.content.slice(0, 200) : data.content,
            });
            let content = '';
            if (typeof data.content === 'string') {
                content = data.content;
            }
            else if (data.content?.text) {
                content = data.content.text;
            }
            else if (data.content) {
                content = JSON.stringify(data.content);
            }
            let groupName = data.groupName;
            if (message.type === 1 && !groupName && threadId) {
                try {
                    const groupInfo = await api.getGroupInfo(threadId);
                    groupName = groupInfo?.gridInfoMap?.[threadId]?.name || 'Nhóm';
                }
                catch (err) {
                    logger.warn(`[zalo-pool] Failed to fetch group info for ${threadId}`);
                    groupName = 'Nhóm';
                }
            }
            const result = await handleIncomingMessage({
                accountId,
                senderUid: data.uidFrom || threadId,
                senderName: data.dName || data.senderName || '',
                content,
                contentType: detectContentType(data.msgType || message.type, data.content),
                msgId: String(data.msgId || data.cliMsgId || Date.now()),
                timestamp: data.ts ? Number(data.ts) : Date.now(),
                isSelf,
                threadId,
                threadType: message.type === 1 ? 'group' : 'user',
                groupName,
                attachments: data.attachments,
                quote: data.quote,
            });
            if (result) {
                logger.info(`[zalo-pool] ✓ Message saved: conv=${result.conversationId}`);
            }
        }
        catch (err) {
            logger.error(`[zalo-pool] Message handler error:`, err.message);
        }
    });
    api.listener.on('undo', async (undoData) => {
        if (!isActive())
            return;
        try {
            // zca-js wraps the undo payload in `.data` (the Undo class), the same
            // shape as the `message` event above. Read defensively so the handler
            // works whether the payload is wrapped or flat.
            const d = undoData?.data ?? undoData;
            // A revoke can identify the target message under several keys: the
            // top-level msgId/cliMsgId, or — most reliably — content.globalMsgId /
            // content.cliMsgId. Collect every candidate and match against any.
            const content = d?.content ?? {};
            const candidates = [
                d?.msgId, d?.cliMsgId,
                content?.globalMsgId, content?.cliMsgId, content?.msgId,
            ]
                .filter(v => v != null && v !== '' && String(v) !== '0')
                .map(v => String(v));
            const ids = [...new Set(candidates)];
            logger.info(`[zalo-pool] ${accountId} ← Undo isSelf=${undoData?.isSelf} ids=${ids.join(',') || '-'}`);
            pushDebug(accountId, 'undo', `isSelf=${undoData?.isSelf} ids=${ids.join(',') || '-'}`, {
                isSelf: undoData?.isSelf, threadId: undoData?.threadId, data: d,
            });
            if (ids.length === 0)
                return;
            const msg = await prisma.message.findFirst({
                where: { externalMsgId: { in: ids } },
                select: { id: true, conversationId: true, externalMsgId: true },
            });
            if (!msg || !msg.externalMsgId) {
                logger.warn(`[zalo-pool] ${accountId} ← Undo: no message matched ids=${ids.join(',')}`);
                return;
            }
            // Preserve original content; only flip isDeleted + deletedAt.
            await handleMessageUndo(accountId, msg.externalMsgId);
            // Emit the same event shape as the outbound undo endpoint so the
            // existing frontend listener (`chat:deleted`) picks it up.
            const io = getIO();
            io.to(`org:${orgId}`).emit('chat:deleted', {
                conversationId: msg.conversationId,
                messageId: msg.id,
                externalMsgId: msg.externalMsgId,
            });
            logger.info(`[zalo-pool] ${accountId} ✓ Undo applied to message ${msg.id}`);
        }
        catch (err) {
            logger.error(`[zalo-pool] Undo handler error:`, err.message);
        }
    });
    // Backfill messages delivered on reconnect
    api.listener.on('old_messages', async (messages, type) => {
        if (!isActive())
            return;
        const threadType = type === 1 ? 'group' : 'user';
        logger.info(`[zalo-pool] ${accountId} ← Received ${messages.length} old ${threadType} messages for sync`);
        for (const message of messages) {
            try {
                const data = message.data || message;
                const threadId = message.threadId || data.uidFrom || '';
                const isSelf = message.isSelf ?? false;
                let content = '';
                if (typeof data.content === 'string') {
                    content = data.content;
                }
                else if (data.content?.text) {
                    content = data.content.text;
                }
                else if (data.content) {
                    content = JSON.stringify(data.content);
                }
                await handleIncomingMessage({
                    accountId,
                    senderUid: data.uidFrom || threadId,
                    senderName: data.dName || data.senderName || '',
                    content,
                    contentType: detectContentType(data.msgType || message.type, data.content),
                    msgId: String(data.msgId || data.cliMsgId || Date.now()),
                    timestamp: data.ts ? Number(data.ts) : Date.now(),
                    isSelf,
                    threadId,
                    threadType,
                    groupName: data.groupName,
                    attachments: data.attachments,
                    quote: data.quote,
                    isBackfill: true,
                });
            }
            catch (err) {
                logger.warn(`[zalo-pool] old_messages processing error:`, err.message);
            }
        }
    });
    // ── Group events (member add/remove/leave, admin changes, etc.) ──────
    api.listener.on('group_event', async (event) => {
        if (!isActive())
            return;
        try {
            const eventType = event.type || event.act || 'unknown';
            const data = event.data || {};
            const groupId = event.threadId || data.groupId || '';
            const groupName = data.groupName || '';
            const updateMembers = data.updateMembers || [];
            const memberNames = updateMembers.map((m) => m.dName || m.id).join(', ');
            const actorId = data.sourceId || data.creatorId || '';
            const isSelfActor = event.isSelf === true;
            const isSelfJoin = !isSelfActor
                && updateMembers.length === 1
                && actorId === updateMembers[0].id;
            let label;
            let displayText;
            switch (eventType) {
                case 'join':
                    label = isSelfActor ? 'được bạn thêm vào nhóm'
                        : isSelfJoin ? 'đã tham gia nhóm'
                            : 'đã được thêm vào nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'leave':
                    label = 'đã rời nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'remove_member':
                    label = isSelfActor ? 'được bạn xóa khỏi nhóm' : 'đã bị xóa khỏi nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'block_member':
                    label = 'đã bị chặn trong nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'add_admin':
                    label = 'đã được thêm làm phó nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'remove_admin':
                    label = 'đã bị gỡ quyền phó nhóm';
                    displayText = memberNames ? `${memberNames} ${label}` : label;
                    break;
                case 'update':
                    label = displayText = 'Nhóm đã được cập nhật';
                    break;
                case 'update_setting':
                    label = displayText = 'Cài đặt nhóm đã thay đổi';
                    break;
                case 'update_avatar':
                    label = displayText = 'Ảnh nhóm đã được thay đổi';
                    break;
                case 'new_link':
                    label = displayText = 'Link nhóm mới được tạo';
                    break;
                case 'join_request':
                    label = displayText = 'Có yêu cầu tham gia nhóm';
                    break;
                default: label = displayText = `Sự kiện: ${eventType}`;
            }
            const eventContent = JSON.stringify({
                eventType, memberNames: memberNames || '', displayText,
                members: updateMembers.map((m) => ({ id: m.id, name: m.dName, avatar: m.avatar })),
                actorId, label, isSelf: event.isSelf ?? false,
            });
            logger.info(`[zalo-pool] ${accountId} ← group_event type=${eventType} group=${groupId} members=${memberNames || '(none)'}`);
            pushDebug(accountId, 'group_event', `type=${eventType} group=${groupId} members=${memberNames || '(none)'}`, {
                eventType, groupId, groupName, memberNames, actorId, displayText,
                updateMembers, isSelf: event.isSelf, act: event.act,
                rawDataKeys: Object.keys(data),
            });
            const result = await handleIncomingMessage({
                accountId,
                senderUid: actorId || '',
                senderName: '',
                content: eventContent,
                contentType: 'group_event',
                msgId: `ge_${eventType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                timestamp: data.time ? Number(data.time) : Date.now(),
                isSelf: event.isSelf ?? false,
                threadId: groupId,
                threadType: 'group',
                groupName,
            });
            // Incremental membership cache update
            const MEMBERSHIP_EVENTS = new Set(['join', 'leave', 'remove_member', 'block_member']);
            const ADMIN_EVENTS = new Set(['add_admin', 'remove_admin']);
            if (result?.orgId && groupId && updateMembers.length > 0) {
                const memberUids = updateMembers.map(m => m.id).filter(Boolean);
                try {
                    const cacheCount = await prisma.channelGroupMember.count({
                        where: { channelAccountId: accountId, groupId },
                    });
                    if (cacheCount === 0) {
                        // No baseline — defer to /group-info
                    }
                    else if (eventType === 'join') {
                        for (const m of updateMembers) {
                            if (!m.id)
                                continue;
                            await prisma.channelGroupMember.upsert({
                                where: { channelAccountId_groupId_memberUid: { channelAccountId: accountId, groupId, memberUid: m.id } },
                                create: { orgId: result.orgId, channelAccountId: accountId, groupId, memberUid: m.id, displayName: m.dName || null, avatarUrl: m.avatar || null, isAdmin: false },
                                update: { displayName: m.dName || undefined, avatarUrl: m.avatar || undefined },
                            });
                        }
                    }
                    else if (eventType === 'leave' || eventType === 'remove_member' || eventType === 'block_member') {
                        await prisma.channelGroupMember.deleteMany({
                            where: { channelAccountId: accountId, groupId, memberUid: { in: memberUids } },
                        });
                    }
                    else if (ADMIN_EVENTS.has(eventType)) {
                        await prisma.channelGroupMember.updateMany({
                            where: { channelAccountId: accountId, groupId, memberUid: { in: memberUids } },
                            data: { isAdmin: eventType === 'add_admin' },
                        });
                    }
                }
                catch (err) {
                    logger.warn(`[zalo-pool] group_event member-cache update failed:`, err.message);
                }
            }
            // Push membership-change signal
            if (result?.conversationId && MEMBERSHIP_EVENTS.has(eventType)) {
                try {
                    emitGroupMembersUpdated(result.conversationId, { eventType, groupId });
                }
                catch { /* socket not connected */ }
            }
        }
        catch (err) {
            logger.error(`[zalo-pool] group_event handler error:`, err.message);
            pushDebug(accountId, 'group_event_error', err.message);
        }
    });
    api.listener.on('connected', () => {
        if (!isActive())
            return;
        logger.info(`[zalo-pool] ${accountId} WebSocket connected`);
        pushDebug(accountId, 'ws_connected', 'WebSocket connected');
        // Keep DB/UI status truthful (don't leave a stale 'connected' or 'connecting').
        updateStatus(accountId, 'connected').catch(() => { });
    });
    // Offline catch-up: request buffered "old messages" on every (re)connect.
    // We trigger on 'cipher_key' (not 'connected') because that event fires AFTER the
    // server completes its key handshake — i.e. the socket is actually ready to accept
    // commands. zca-js never calls requestOldMessages itself, so without this the
    // 'old_messages' handler above would never fire and 1:1 user threads would have no
    // backfill after a disconnect. The server replies with cmd 510/511 → 'old_messages',
    // which persists with isBackfill:true (deduped in message-handler, automations skipped).
    api.listener.on('cipher_key', () => {
        if (!isActive())
            return;
        try {
            api.listener.requestOldMessages(ThreadType.User, null);
            api.listener.requestOldMessages(ThreadType.Group, null);
            pushDebug(accountId, 'old_messages_requested', 'Requested offline catch-up (user + group)');
        }
        catch (err) {
            logger.warn(`[zalo-pool] ${accountId} requestOldMessages failed:`, err?.message || err);
        }
    });
    api.listener.on('closed', (code, reason) => {
        logger.warn(`[zalo-pool] ${accountId} Listener closed: code=${code} reason=${reason}`);
        pushDebug(accountId, 'ws_closed', `code=${code} reason=${reason}`);
        // Reflect the real state so the UI stops showing a stale "Đang kết nối";
        // the connection watchdog (zalo-pool) then auto-reconnects from the saved session.
        updateStatus(accountId, 'disconnected').catch(() => { });
    });
    api.listener.on('error', (err) => {
        logger.error(`[zalo-pool] ${accountId} Listener error:`, err?.message || err);
        pushDebug(accountId, 'ws_error', err?.message || String(err));
    });
    // ── Reaction event (inbound from Zalo contacts) ───────────────────────
    // Reference: Deplao ZaloLoginHelper.ts:697-763
    // Structure: { data: { uidFrom, content: { rMsg: [{ gMsgID, cMsgID, rType, rIcon }] } }, threadId, isGroup }
    api.listener.on('reaction', async (reaction) => {
        if (!isActive())
            return;
        try {
            const rData = reaction.data || {};
            const uidFrom = String(rData.uidFrom || reaction.uidFrom || '');
            const threadId = String(reaction.threadId || rData.idTo || rData.threadId || '');
            // Extract reaction details from rMsg array
            const rMsgArr = rData.content?.rMsg || reaction.content?.rMsg || [];
            if (rMsgArr.length === 0)
                return;
            const rMsg = rMsgArr[0];
            const targetMsgId = String(rMsg.gMsgID || rMsg.cMsgID || '');
            const emoji = String(rMsg.rIcon || rData.rIcon || rData.content?.rIcon || '');
            // rType: 1 = add, 0 = remove (undoing reaction)
            const action = rMsg.rType === 0 ? 'removed' : 'added';
            logger.info(`[zalo-pool] ${accountId} ← reaction from=${uidFrom} thread=${threadId} msgId=${targetMsgId} emoji=${emoji} action=${action}`);
            pushDebug(accountId, 'reaction', `from=${uidFrom} thread=${threadId} emoji=${emoji} action=${action}`, {
                uidFrom, threadId, targetMsgId, emoji, action, isGroup: reaction.isGroup,
            });
            if (!targetMsgId)
                return;
            // Find the message in our DB
            const msg = await prisma.message.findFirst({
                where: { externalMsgId: targetMsgId },
                select: { id: true, conversationId: true },
            });
            if (!msg) {
                logger.info(`[zalo-pool] ${accountId} ← reaction: no message found for msgId=${targetMsgId}`);
                return;
            }
            // Emit to frontend for real-time reaction sync
            emitInboundReaction(msg.conversationId, {
                messageId: msg.id,
                externalMsgId: targetMsgId,
                emoji,
                userId: uidFrom,
                action,
            });
        }
        catch (err) {
            logger.error(`[zalo-pool] ${accountId} reaction handler error:`, err.message);
        }
    });
    api.listener.on('seen', async (data) => {
        if (!isActive())
            return;
        try {
            const isGroup = data?.type === 1 || !!data?.data?.groupId;
            let threadId;
            let msgId;
            let seenUids;
            if (isGroup) {
                threadId = String(data?.threadId || data?.data?.groupId || '');
                msgId = String(data?.data?.msgId || data?.msgId || '');
                seenUids = data?.data?.seenUids || [];
            }
            else {
                threadId = String(data?.threadId || data?.data?.idTo || data?.data?.uidFrom || '');
                msgId = String(data?.data?.msgId || data?.data?.realMsgId || data?.msgId || '');
                const userId = String(data?.data?.uidFrom || data?.uidFrom || threadId);
                seenUids = [userId];
            }
            if (!threadId)
                return;
            logger.info(`[zalo-pool] ${accountId} ← seen thread=${threadId} msgId=${msgId} isGroup=${isGroup} uids=${seenUids.join(',')}`);
            // Find conversation by threadId
            const conv = await prisma.conversation.findFirst({
                where: { channelAccountId: accountId, externalThreadId: threadId },
                select: { id: true, orgId: true },
            });
            if (!conv)
                return;
            emitSeenReceipt(conv.orgId, conv.id, { threadId, msgId, isGroup, seenUids });
        }
        catch (err) {
            logger.error(`[zalo-pool] ${accountId} seen handler error:`, err.message);
        }
    });
    // ── Friend event (full lifecycle) ─────────────────────────────────────
    // Reference: Deplao ZaloLoginHelper.ts:831-957
    // FriendEventType: 0=ADD, 1=REMOVE, 2=REQUEST, 3=UNDO_REQUEST, 4=REJECT_REQUEST
    //                  5=SEEN, 6=BLOCK, 7=UNBLOCK
    api.listener.on('friend_event', async (event) => {
        if (!isActive())
            return;
        try {
            const eventType = event?.type ?? -1;
            const isSelf = event?.isSelf === true;
            const d = event?.data;
            // Resolve the peer userId depending on direction
            const resolveUserId = (prefer = 'auto') => {
                if (!d || typeof d !== 'object')
                    return typeof d === 'string' ? d : '';
                if (prefer === 'from')
                    return String(d.fromUid || d.uid || d.userId || d.actorId || d.toUid || '');
                if (prefer === 'to')
                    return String(d.toUid || d.uid || d.userId || d.fromUid || d.actorId || '');
                return String(d.fromUid || d.uid || d.userId || d.toUid || d.actorId || '');
            };
            const resolveMessage = () => {
                if (!d || typeof d !== 'object')
                    return '';
                return String(d.message || d.msg || d?.recommInfo?.message || d?.recommInfo?.customText || '');
            };
            // Fetch the org for this account
            const account = await prisma.channelAccount.findUnique({
                where: { id: accountId },
                select: { orgId: true },
            });
            if (!account)
                return;
            // Fetch Zalo profile for the friend
            const fetchProfile = async (userId) => {
                let displayName = '', avatar = '', phone = '';
                try {
                    const userInfoRes = await api.getUserInfo(userId);
                    const rawProfile = userInfoRes?.changed_profiles?.[userId]
                        || userInfoRes?.data?.[userId];
                    if (rawProfile) {
                        displayName = rawProfile.displayName || rawProfile.zaloName || '';
                        avatar = rawProfile.avatar || '';
                        phone = rawProfile.phoneNumber || '';
                    }
                }
                catch (err) {
                    logger.warn(`[zalo-pool] friend_event getUserInfo(${userId}) failed: ${err.message}`);
                }
                return { displayName, avatar, phone };
            };
            // REQUEST (2) — friend request sent or received
            if (eventType === 2 && d && typeof d === 'object') {
                const friendId = isSelf ? resolveUserId('to') : resolveUserId('from');
                const msg = resolveMessage();
                if (!friendId)
                    return;
                const profile = await fetchProfile(friendId);
                const type = isSelf ? 'request_sent' : 'request_received';
                logger.info(`[zalo-pool] ${accountId} ← friend_event ${type}: ${friendId} (${profile.displayName})`);
                pushDebug(accountId, 'friend_event', `type=${type} userId=${friendId} name=${profile.displayName}`);
                emitFriendEvent(account.orgId, {
                    type,
                    accountId,
                    userId: friendId,
                    displayName: profile.displayName,
                    avatar: profile.avatar,
                    phone: profile.phone,
                    message: msg,
                });
                // If we received a friend request, auto-create contact so CRM has it
                if (!isSelf) {
                    try {
                        const existing = await prisma.contact.findFirst({
                            where: { zaloUid: friendId, orgId: account.orgId },
                            select: { id: true },
                        });
                        if (!existing) {
                            await prisma.contact.create({
                                data: {
                                    orgId: account.orgId,
                                    zaloUid: friendId,
                                    fullName: profile.displayName || 'Unknown',
                                    avatarUrl: profile.avatar || null,
                                    phone: profile.phone || null,
                                    source: 'Zalo',
                                },
                            });
                            logger.info(`[zalo-pool] ${accountId} ← friend_event: auto-created contact for ${friendId}`);
                        }
                    }
                    catch { /* ignore duplicate */ }
                }
                return;
            }
            // ADD (0) — became friends
            if (eventType === 0 && d) {
                const friendId = resolveUserId();
                if (!friendId)
                    return;
                const profile = await fetchProfile(friendId);
                logger.info(`[zalo-pool] ${accountId} ← friend_event accepted: ${friendId} (${profile.displayName})`);
                pushDebug(accountId, 'friend_event', `type=accepted userId=${friendId}`);
                emitFriendEvent(account.orgId, {
                    type: 'accepted',
                    accountId,
                    userId: friendId,
                    displayName: profile.displayName,
                    avatar: profile.avatar,
                    phone: profile.phone,
                });
                // Enrich existing contact or create new one
                try {
                    const existing = await prisma.contact.findFirst({
                        where: { zaloUid: friendId, orgId: account.orgId },
                        select: { id: true },
                    });
                    if (existing) {
                        enrichContactFromZalo(accountId, friendId, existing.id).catch(() => { });
                    }
                    else {
                        await prisma.contact.create({
                            data: {
                                orgId: account.orgId,
                                zaloUid: friendId,
                                fullName: profile.displayName || 'Unknown',
                                avatarUrl: profile.avatar || null,
                                phone: profile.phone || null,
                                source: 'Zalo',
                            },
                        });
                    }
                }
                catch { /* ignore */ }
                return;
            }
            // REMOVE (1) — friend removed
            if (eventType === 1 && d) {
                const friendId = typeof d === 'string' ? d : (d.fromUid || d.uid || '');
                if (!friendId)
                    return;
                logger.info(`[zalo-pool] ${accountId} ← friend_event removed: ${friendId}`);
                pushDebug(accountId, 'friend_event', `type=removed userId=${friendId}`);
                emitFriendEvent(account.orgId, {
                    type: 'removed',
                    accountId,
                    userId: friendId,
                });
                return;
            }
            // UNDO_REQUEST (3) / REJECT_REQUEST (4)
            if ((eventType === 3 || eventType === 4) && d && typeof d === 'object') {
                const friendId = isSelf ? resolveUserId('to') : resolveUserId('from');
                if (!friendId)
                    return;
                const type = eventType === 4 ? 'request_rejected' : 'request_cancelled';
                logger.info(`[zalo-pool] ${accountId} ← friend_event ${type}: ${friendId} isSelf=${isSelf}`);
                pushDebug(accountId, 'friend_event', `type=${type} userId=${friendId} isSelf=${isSelf}`);
                emitFriendEvent(account.orgId, {
                    type,
                    accountId,
                    userId: friendId,
                });
                return;
            }
            // Other types (SEEN=5, BLOCK=6, UNBLOCK=7): log only
            logger.info(`[zalo-pool] ${accountId} ← friend_event type=${eventType} (no action needed)`);
            pushDebug(accountId, 'friend_event', `type=${eventType} (no action)`);
        }
        catch (err) {
            logger.error(`[zalo-pool] ${accountId} friend_event handler error:`, err.message);
        }
    });
    api.listener.start({ retryOnClose: true });
    logger.info(`[zalo-pool] Message listener started for ${accountId} (retryOnClose=true)`);
    // Start periodic group message sync backup
    startMessageSync(api, accountId);
}
//# sourceMappingURL=zalo-event-handlers.js.map