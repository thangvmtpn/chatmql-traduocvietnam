import type { API as ZaloAPI } from 'zca-js';
interface PoolEntry {
    accountId: string;
    orgId: string;
    status: 'connected' | 'connecting' | 'qr_pending' | 'disconnected';
    api?: ZaloAPI;
    connectedAt?: Date;
    abortLogin?: () => void;
}
export interface DebugLogEntry {
    ts: string;
    accountId: string;
    event: string;
    summary: string;
    data?: any;
}
export declare function pushDebug(accountId: string, event: string, summary: string, data?: any): void;
export declare function getDebugLog(): DebugLogEntry[];
export declare function getPoolStatus(orgId: string): Promise<PoolEntry[]>;
export declare function getPoolEntry(accountId: string): PoolEntry | undefined;
/**
 * Initiate QR login for a Zalo account.
 * Emits Socket.IO events to the org room:
 *   zalo:qr       → { accountId, image } (base64 QR image)
 *   zalo:scanned  → { accountId, avatar, displayName }
 *   zalo:connected → { accountId }
 *   zalo:error     → { accountId, message }
 */
export declare function loginWithQR(accountId: string, orgId: string): Promise<void>;
export declare function disconnectAccount(accountId: string): Promise<void>;
export declare function updateStatus(accountId: string, status: 'connected' | 'disconnected'): Promise<void>;
/**
 * Reconnect a Zalo account using saved session credentials (cookie/imei/userAgent).
 * This allows restoring connections after server restart without QR re-scan.
 */
export declare function reconnectWithSession(accountId: string, orgId: string, session: {
    cookie: any;
    imei: string;
    userAgent: string;
}): Promise<void>;
/**
 * Auto-reconnect all Zalo accounts that have saved session data.
 * Called once on server startup after Socket.IO is initialized.
 */
export declare function autoReconnectSavedAccounts(): Promise<void>;
export declare function startConnectionWatchdog(): void;
/**
 * Send a message via connected Zalo account.
 * Returns true if sent via Zalo, false if stored locally only.
 * Note: Does NOT create a local message record — the caller (chat-routes)
 * is responsible for that to avoid duplicates.
 */
/**
 * Best-effort "đang nhập..." indicator to the Zalo customer.
 * Zalo auto-expires the indicator after a few seconds (there is no stop API),
 * so a crashed flow can never leave the customer with an infinite typing state.
 * Cosmetic only — never throws, never blocks the caller.
 */
export declare function sendTypingViaPool(accountId: string, targetUid: string, threadType?: 'user' | 'group'): Promise<void>;
export declare function sendViaPool(accountId: string, targetUid: string, text: string, _conversationId: string, quote?: any, threadType?: 'user' | 'group'): Promise<{
    sent: boolean;
    error?: string;
}>;
export declare function undoViaPool(accountId: string, targetUid: string, msgId: string, cliMsgId: string, threadType?: 'user' | 'group'): Promise<boolean>;
/**
 * Send an image via connected Zalo account.
 * @param accountId - ChannelAccount.id
 * @param targetUid - Zalo UID of recipient
 * @param imageBuffer - Image file buffer
 * @param filename - Original filename (e.g. "photo.jpg")
 * @param text - Optional caption text
 * @returns true if sent via Zalo
 */
export declare function sendImageViaPool(accountId: string, targetUid: string, imageBuffer: Buffer, filename: string, text?: string, threadType?: 0 | 1): Promise<{
    sent: boolean;
    content?: string;
}>;
/**
 * Send a file via connected Zalo account.
 * @param accountId - ChannelAccount.id
 * @param targetUid - Zalo UID of recipient
 * @param fileBuffer - File buffer
 * @param filename - Original filename (e.g. "document.pdf")
 * @param text - Optional caption text
 * @returns true if sent via Zalo
 */
export declare function sendFileViaPool(accountId: string, targetUid: string, fileBuffer: Buffer, filename: string, text?: string): Promise<boolean>;
import { checkRateLimitCompat } from './zalo-rate-limiter.js';
export { checkRateLimitCompat as checkRateLimit };
/**
 * Sync friend list and recent conversations after a successful Zalo login.
 * Runs as fire-and-forget — errors are logged but don't break the connection.
 */
export declare function syncOnConnect(accountId: string, orgId: string, api: ZaloAPI): Promise<void>;
