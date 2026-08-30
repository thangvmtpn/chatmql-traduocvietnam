/**
 * zalo-message-sync.ts — Synchronization & backfill for Zalo messages (Groups & 1-1 Users).
 * Supports:
 * - Periodic background sync for active conversations
 * - Full historical backfill for single conversation or entire account via custom API
 * - Rate-limited pagination to fetch up to N messages safely
 */
import { prisma } from '../../shared/prisma-client.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { logger } from '../../shared/logger.js';

// Dynamic import for emitBackfillProgress — may not exist in all image versions
let _emitBackfillProgress: ((orgId: string, data: any) => void) | null = null;
try {
  const sgModule = await import('../realtime/socket-gateway.js');
  if (typeof sgModule.emitBackfillProgress === 'function') {
    _emitBackfillProgress = sgModule.emitBackfillProgress;
  }
} catch {}
function emitBackfillProgress(orgId: string, data: any): void {
  if (_emitBackfillProgress) _emitBackfillProgress(orgId, data);
  else logger.info(`[backfill] Progress: ${JSON.stringify(data)}`);
}

function mapZcaContentType(zcaType: number | string | undefined): string {
  const typeMap: Record<string, string> = {
    '1': 'text', '2': 'image', '3': 'sticker', '4': 'video',
    '5': 'voice', '6': 'gif', '7': 'link', '8': 'file',
  };
  return typeMap[String(zcaType)] || 'text';
}

const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_CONVS_PER_SYNC = 20;
const MESSAGES_PER_PAGE = 50;
const DELAY_BETWEEN_PAGES_MS = 3000;
const DELAY_BETWEEN_CONVS_MS = 4000;

// Track active sync intervals per account
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Register custom APIs into zca-js instance (e.g. getUserChatHistory).
 */
export function registerCustomApis(api: any): void {
  try {
    if (typeof api.custom === 'function' && typeof api.getUserChatHistory !== 'function') {
      api.custom('getUserChatHistory', async ({ ctx, utils, props }: any) => {
        const { userId, count = MESSAGES_PER_PAGE, lastMsgId = 0 } = props || {};
        
        // Debug: log available service maps and API internals
        logger.info(`[getUserChatHistory] zpwServiceMap keys=${api.zpwServiceMap ? Object.keys(api.zpwServiceMap).join(',') : 'undefined'}`);
        logger.info(`[getUserChatHistory] zpwServiceMap.conversation=${JSON.stringify(api.zpwServiceMap?.conversation)}`);
        
        const serviceMap = api.zpwServiceMap?.conversation || ['https://chat3-wpa.chat.zalo.me'];
        const baseUrl = `${serviceMap[0]}/api/message/list`;
        logger.info(`[getUserChatHistory] baseUrl=${baseUrl}`);
        
        const serviceURL = utils.makeURL(baseUrl);
        logger.info(`[getUserChatHistory] serviceURL after makeURL=${serviceURL}`);
        
        const params = {
          convId: String(userId),
          count: count,
          globalMsgId: lastMsgId,
        };
        logger.info(`[getUserChatHistory] params=${JSON.stringify(params)}`);
        
        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        if (!encryptedParams) throw new Error('Failed to encrypt params for getUserChatHistory');
        
        const finalURL = utils.makeURL(serviceURL, { params: encryptedParams });
        logger.info(`[getUserChatHistory] finalURL=${String(finalURL).substring(0, 200)}`);
        
        const response = await utils.request(finalURL, {
          method: 'GET',
        });
        
        logger.info(`[getUserChatHistory] response type=${typeof response}, keys=${response ? Object.keys(response).join(',') : 'null'}`);
        
        return utils.resolve(response, (result: any) => {
          logger.info(`[getUserChatHistory] resolved result keys=${result ? Object.keys(result).join(',') : 'null'}`);
          let data = result.data;
          if (typeof data === 'string') data = JSON.parse(data);
          logger.info(`[getUserChatHistory] data type=${typeof data}, keys=${data && typeof data === 'object' ? Object.keys(data).join(',') : 'n/a'}, sample=${JSON.stringify(data).substring(0, 500)}`);
          return data;
        });
      });
      logger.info('[zalo-message-sync] ✅ Registered getUserChatHistory custom API');
    }
  } catch (err: any) {
    logger.warn('[zalo-message-sync] Failed to register custom API:', err.message);
  }
}

/**
 * Sync recent group messages for one account.
 */
export async function syncGroupMessages(api: any, accountId: string): Promise<number> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: accountId },
    select: { orgId: true },
  });
  if (!account) return 0;

  const groupConvs = await prisma.conversation.findMany({
    where: { channelAccountId: accountId, threadType: 'group' },
    select: { id: true, externalThreadId: true },
    take: MAX_CONVS_PER_SYNC,
    orderBy: { lastMessageAt: 'desc' },
  });

  let synced = 0;

  for (const conv of groupConvs) {
    try {
      if (!conv.externalThreadId) continue;
      const history = await api.getGroupChatHistory(conv.externalThreadId, MESSAGES_PER_PAGE);
      const messages = history?.groupMsgs || history?.data?.groupMsgs || [];

      const msgIdMap = new Map<string, any>();
      for (const msg of messages) {
        const externalMsgId = String(msg.data?.msgId || msg.data?.cliMsgId || '');
        if (externalMsgId) msgIdMap.set(externalMsgId, msg);
      }
      if (msgIdMap.size === 0) continue;

      const existing = await prisma.message.findMany({
        where: { conversationId: conv.id, externalMsgId: { in: [...msgIdMap.keys()] } },
        select: { externalMsgId: true },
      });
      const existingIds = new Set(existing.map((m: any) => m.externalMsgId));

      for (const [externalMsgId, msg] of msgIdMap) {
        if (existingIds.has(externalMsgId)) continue;

        let content = '';
        if (typeof msg.data?.content === 'string') {
          content = msg.data.content;
        } else if (msg.data?.content?.text) {
          content = msg.data.content.text;
        } else if (msg.data?.content) {
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

        if (result) synced++;
      }
    } catch (err: any) {
      logger.warn(`[sync:${accountId}] Group ${conv.externalThreadId} failed:`, err.message);
    }
  }

  return synced;
}

/**
 * Sync recent 1-1 user messages for one account.
 */
export async function syncUserMessages(api: any, accountId: string): Promise<number> {
  const account = await prisma.channelAccount.findUnique({
    where: { id: accountId },
    select: { orgId: true },
  });
  if (!account) return 0;

  if (typeof api.getUserChatHistory !== 'function') {
    registerCustomApis(api);
  }
  if (typeof api.getUserChatHistory !== 'function') return 0;

  const userConvs = await prisma.conversation.findMany({
    where: { channelAccountId: accountId, threadType: 'user' },
    select: { id: true, externalThreadId: true },
    take: MAX_CONVS_PER_SYNC,
    orderBy: { lastMessageAt: 'desc' },
  });

  let synced = 0;

  for (const conv of userConvs) {
    try {
      if (!conv.externalThreadId) continue;
      const history = await api.getUserChatHistory({
        userId: conv.externalThreadId,
        count: MESSAGES_PER_PAGE,
        lastMsgId: 0,
      });
      const messages = history?.msgs || history?.msgList || history?.data?.msgs || [];

      if (!Array.isArray(messages) || messages.length === 0) continue;

      const msgIdMap = new Map<string, any>();
      for (const msg of messages) {
        const externalMsgId = String(msg.msgId || msg.cliMsgId || msg.globalMsgId || '');
        if (externalMsgId) msgIdMap.set(externalMsgId, msg);
      }
      if (msgIdMap.size === 0) continue;

      const existing = await prisma.message.findMany({
        where: { conversationId: conv.id, externalMsgId: { in: [...msgIdMap.keys()] } },
        select: { externalMsgId: true },
      });
      const existingIds = new Set(existing.map((m: any) => m.externalMsgId));

      for (const [externalMsgId, msg] of msgIdMap) {
        if (existingIds.has(externalMsgId)) continue;

        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (msg.content?.text) {
          content = msg.content.text;
        } else if (msg.content) {
          content = JSON.stringify(msg.content);
        }
        const contentType = mapZcaContentType(msg.msgType || msg.type);

        const result = await handleIncomingMessage({
          accountId,
          senderUid: String(msg.uidFrom || msg.fromUid || conv.externalThreadId),
          senderName: msg.dName || msg.senderName || '',
          content,
          contentType,
          msgId: externalMsgId,
          timestamp: parseInt(msg.ts || String(Date.now())),
          isSelf: msg.isSelf === true || String(msg.uidFrom || msg.fromUid || '') === String(api.getOwnId?.() || ''),
          threadId: conv.externalThreadId,
          threadType: 'user',
          attachments: msg.attachments || [],
          quote: msg.quote,
          isBackfill: true,
        });

        if (result) synced++;
      }
    } catch (err: any) {
      logger.warn(`[sync:${accountId}] User ${conv.externalThreadId} failed:`, err.message);
    }
  }

  return synced;
}

/**
 * Deep backfill for a single conversation (Group or 1-1 User) with pagination.
 */
export async function backfillConversation(
  api: any,
  accountId: string,
  threadId: string,
  threadType: 'user' | 'group' = 'user',
  maxMessages = 200,
): Promise<{ inserted: number; skipped: number; total: number }> {
  registerCustomApis(api);

  let inserted = 0;
  let skipped = 0;
  let total = 0;
  let lastMsgId: string | number = 0;
  let hasMore = true;

  while (hasMore && total < maxMessages) {
    try {
      let rawMessages: any[] = [];

      if (threadType === 'group') {
        const history = await api.getGroupChatHistory(threadId, MESSAGES_PER_PAGE);
        rawMessages = history?.groupMsgs || history?.data?.groupMsgs || [];
      } else {
        if (typeof api.getUserChatHistory !== 'function') {
          throw new Error('getUserChatHistory API is not available');
        }
        logger.info(`[backfill:${accountId}] Calling getUserChatHistory for thread ${threadId}, lastMsgId=${lastMsgId}, count=${MESSAGES_PER_PAGE}`);
        const history = await api.getUserChatHistory({
          userId: threadId,
          count: MESSAGES_PER_PAGE,
          lastMsgId: lastMsgId,
        });
        // Debug: log raw response structure
        logger.info(`[backfill:${accountId}] Raw history type=${typeof history}, keys=${history ? Object.keys(history).join(',') : 'null'}`);
        if (history?.data) {
          logger.info(`[backfill:${accountId}] history.data keys=${Object.keys(history.data).join(',')}`);
        }
        if (history?.msgs) {
          logger.info(`[backfill:${accountId}] history.msgs length=${Array.isArray(history.msgs) ? history.msgs.length : typeof history.msgs}`);
        }
        if (history?.msgList) {
          logger.info(`[backfill:${accountId}] history.msgList length=${Array.isArray(history.msgList) ? history.msgList.length : typeof history.msgList}`);
        }
        rawMessages = history?.msgs || history?.msgList || history?.data?.msgs || history?.data?.msgList || [];
        // If still empty, log the full history (truncated) for debugging
        if (rawMessages.length === 0 && history) {
          logger.warn(`[backfill:${accountId}] Empty rawMessages! Full history sample: ${JSON.stringify(history).substring(0, 1000)}`);
        }
      }

      if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        logger.info(`[backfill:${accountId}] No messages returned for thread ${threadId}, stopping pagination.`);
        hasMore = false;
        break;
      }
      logger.info(`[backfill:${accountId}] Got ${rawMessages.length} messages for thread ${threadId}`);

      for (const item of rawMessages) {
        total++;
        if (total > maxMessages) break;

        const data = item.data || item;
        const externalMsgId = String(data.msgId || data.cliMsgId || data.globalMsgId || '');
        if (!externalMsgId) {
          skipped++;
          continue;
        }

        let content = '';
        if (typeof data.content === 'string') {
          content = data.content;
        } else if (data.content?.text) {
          content = data.content.text;
        } else if (data.content) {
          content = JSON.stringify(data.content);
        }
        const contentType = mapZcaContentType(data.msgType || item.type);

        const result = await handleIncomingMessage({
          accountId,
          senderUid: String(data.uidFrom || data.fromUid || (item.isSelf ? '' : threadId)),
          senderName: data.dName || data.senderName || '',
          content,
          contentType,
          msgId: externalMsgId,
          timestamp: parseInt(data.ts || String(Date.now())),
          isSelf: item.isSelf === true || data.isSelf === true || String(data.uidFrom || data.fromUid || '') === String(api.getOwnId?.() || ''),
          threadId,
          threadType,
          attachments: data.attachments || [],
          quote: data.quote,
          isBackfill: true,
        });

        if (result) {
          inserted++;
        } else {
          skipped++;
        }
      }

      // Pagination
      const lastItem = rawMessages[rawMessages.length - 1];
      const lastItemData = lastItem?.data || lastItem;
      const newLastMsgId = lastItemData?.globalMsgId || lastItemData?.msgId || 0;

      if (threadType === 'group' || !newLastMsgId || newLastMsgId === lastMsgId || rawMessages.length < MESSAGES_PER_PAGE) {
        hasMore = false;
      } else {
        lastMsgId = newLastMsgId;
      }

      if (hasMore && total < maxMessages) {
        await sleep(DELAY_BETWEEN_PAGES_MS);
      }
    } catch (err: any) {
      logger.error(`[backfill:${accountId}] Error backfilling thread ${threadId}: ${err.message || err}`, { stack: err.stack, error: String(err) });
      hasMore = false;
    }
  }

  return { inserted, skipped, total };
}

/**
 * Backfill all conversations for an account.
 */
export async function backfillAllAccountConversations(
  api: any,
  accountId: string,
  orgId: string,
  maxMessages = 200,
): Promise<{ totalConversations: number; totalInserted: number; totalSkipped: number; errors: any[] }> {
  registerCustomApis(api);

  const convs = await prisma.conversation.findMany({
    where: { channelAccountId: accountId },
    select: { id: true, externalThreadId: true, threadType: true, displayName: true },
    orderBy: { lastMessageAt: 'desc' },
  });

  const result = {
    totalConversations: convs.length,
    totalInserted: 0,
    totalSkipped: 0,
    errors: [] as any[],
  };

  logger.info(`[backfill:${accountId}] Starting full backfill for ${convs.length} conversations`);

  for (let i = 0; i < convs.length; i++) {
    const conv = convs[i];
    if (!conv.externalThreadId) continue;

    const threadType = conv.threadType === 'group' ? 'group' : 'user';

    try {
      emitBackfillProgress(orgId, {
        accountId,
        current: i + 1,
        total: convs.length,
        threadName: conv.displayName || conv.externalThreadId,
        status: 'processing',
      });

      const stats = await backfillConversation(
        api,
        accountId,
        conv.externalThreadId,
        threadType,
        maxMessages,
      );

      result.totalInserted += stats.inserted;
      result.totalSkipped += stats.skipped;
      logger.info(`[backfill:${accountId}] [${i + 1}/${convs.length}] ${conv.displayName || conv.externalThreadId}: +${stats.inserted} new, ~${stats.skipped} skipped`);
    } catch (err: any) {
      result.errors.push({ threadId: conv.externalThreadId, error: err.message });
      logger.error(`[backfill:${accountId}] Error at [${i + 1}/${convs.length}]:`, err.message);
    }

    if (i < convs.length - 1) {
      await sleep(DELAY_BETWEEN_CONVS_MS);
    }
  }

  emitBackfillProgress(orgId, {
    accountId,
    current: convs.length,
    total: convs.length,
    status: 'completed',
    result: {
      totalInserted: result.totalInserted,
      totalSkipped: result.totalSkipped,
      errors: result.errors.length,
    },
  });

  logger.info(`[backfill:${accountId}] Completed backfill: +${result.totalInserted} new, ~${result.totalSkipped} skipped, ${result.errors.length} errors`);
  return result;
}

/** Start periodic group & user sync for an account. */
export function startMessageSync(api: any, accountId: string): void {
  registerCustomApis(api);

  if (syncIntervals.has(accountId)) return;

  const interval = setInterval(async () => {
    try {
      const groupCount = await syncGroupMessages(api, accountId);
      const userCount = await syncUserMessages(api, accountId);
      const total = groupCount + userCount;
      if (total > 0) {
        logger.info(`[sync:${accountId}] Periodic sync backfilled ${total} messages (groups: ${groupCount}, users: ${userCount})`);
      }
    } catch (err: any) {
      logger.warn(`[sync:${accountId}] Sync error:`, err.message);
    }
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  logger.info(`[sync:${accountId}] Started message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

/** Stop periodic sync for an account. */
export function stopMessageSync(accountId: string): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    logger.info(`[sync:${accountId}] Stopped message sync`);
  }
}

