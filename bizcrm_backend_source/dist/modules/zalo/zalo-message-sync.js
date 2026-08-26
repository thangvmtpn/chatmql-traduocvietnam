/**
 * zalo-message-sync.ts — polling backup for group message history.
 * Runs periodically per connected account, calls getGroupChatHistory()
 * for active groups, and inserts any messages missing from the database.
 *
 * This is a safety net — the primary sync path is selfListen + old_messages.
 */
import { prisma } from '../../shared/prisma-client.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { logger } from '../../shared/logger.js';
function mapZcaContentType(zcaType) {
    const typeMap = {
        '1': 'text', '2': 'image', '3': 'sticker', '4': 'video',
        '5': 'voice', '6': 'gif', '7': 'link', '8': 'file',
    };
    return typeMap[String(zcaType)] || 'text';
}
const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_GROUPS_PER_SYNC = 20;
const MESSAGES_PER_GROUP = 50;
// Track active sync intervals per account
const syncIntervals = new Map();
/**
 * Sync recent group messages for one account.
 * Returns the number of newly inserted messages.
 */
export async function syncGroupMessages(api, accountId) {
    const account = await prisma.channelAccount.findUnique({
        where: { id: accountId },
        select: { orgId: true },
    });
    if (!account)
        return 0;
    // Get most recently active group conversations
    const groupConvs = await prisma.conversation.findMany({
        where: { channelAccountId: accountId, threadType: 'group' },
        select: { id: true, externalThreadId: true },
        take: MAX_GROUPS_PER_SYNC,
        orderBy: { lastMessageAt: 'desc' },
    });
    let synced = 0;
    for (const conv of groupConvs) {
        try {
            const history = await api.getGroupChatHistory(conv.externalThreadId, MESSAGES_PER_GROUP);
            const messages = history?.groupMsgs || history?.data?.groupMsgs || [];
            // Collect all msgIds for batch dedup check
            const msgIdMap = new Map();
            for (const msg of messages) {
                const externalMsgId = String(msg.data?.msgId || msg.data?.cliMsgId || '');
                if (externalMsgId)
                    msgIdMap.set(externalMsgId, msg);
            }
            if (msgIdMap.size === 0)
                continue;
            // Batch existence check — single query per group
            const existing = await prisma.message.findMany({
                where: { conversationId: conv.id, externalMsgId: { in: [...msgIdMap.keys()] } },
                select: { externalMsgId: true },
            });
            const existingIds = new Set(existing.map((m) => m.externalMsgId));
            for (const [externalMsgId, msg] of msgIdMap) {
                if (existingIds.has(externalMsgId))
                    continue;
                let content = '';
                if (typeof msg.data?.content === 'string') {
                    content = msg.data.content;
                }
                else if (msg.data?.content?.text) {
                    content = msg.data.content.text;
                }
                else if (msg.data?.content) {
                    content = JSON.stringify(msg.data.content);
                }
                const contentType = mapZcaContentType(msg.data?.msgType);
                const result = await handleIncomingMessage({
                    accountId,
                    senderUid: String(msg.data?.uidFrom || ''),
                    senderName: msg.data?.dName || '',
                    content,
                    contentType,
                    msgId: externalMsgId,
                    timestamp: parseInt(msg.data?.ts || String(Date.now())),
                    isSelf: msg.isSelf || false,
                    threadId: conv.externalThreadId,
                    threadType: 'group',
                    attachments: [],
                    quote: msg.data?.quote,
                    isBackfill: true,
                });
                if (result)
                    synced++;
            }
        }
        catch (err) {
            logger.warn(`[sync:${accountId}] Group ${conv.externalThreadId} failed:`, err.message);
        }
    }
    return synced;
}
/** Start periodic group sync for an account. */
export function startMessageSync(api, accountId) {
    // Don't start duplicate sync
    if (syncIntervals.has(accountId))
        return;
    const interval = setInterval(async () => {
        try {
            const count = await syncGroupMessages(api, accountId);
            if (count > 0) {
                logger.info(`[sync:${accountId}] Backfilled ${count} group messages`);
            }
        }
        catch (err) {
            logger.warn(`[sync:${accountId}] Sync error:`, err.message);
        }
    }, SYNC_INTERVAL_MS);
    syncIntervals.set(accountId, interval);
    logger.info(`[sync:${accountId}] Started group message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}
/** Stop periodic sync for an account. */
export function stopMessageSync(accountId) {
    const interval = syncIntervals.get(accountId);
    if (interval) {
        clearInterval(interval);
        syncIntervals.delete(accountId);
        logger.info(`[sync:${accountId}] Stopped group message sync`);
    }
}
//# sourceMappingURL=zalo-message-sync.js.map