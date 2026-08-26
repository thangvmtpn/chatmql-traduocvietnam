/**
 * zalo-event-handlers.ts — Event listener setup for Zalo WebSocket.
 * Handles: message, undo, old_messages, group_event, reaction,
 *          seen, friend_event, connected/closed/error.
 * Extracted from zalo-pool.ts for modularization.
 */
import type { API as ZaloAPI } from 'zca-js';
/**
 * Parse birthday date (DD/MM) and contact name from Zalo birthday notification title.
 * Example title: "17/05 Sinh nhật của Anh Hưng Bắc Giang 0354113129"
 * Returns { day, month, contactName } or null.
 */
export declare function parseBirthdayFromContent(rawContent: string): {
    day: number;
    month: number;
    contactName: string;
} | null;
/**
 * Set up message listener for an authenticated Zalo account.
 * Directly calls handleIncomingMessage() — no HTTP round-trip.
 */
export declare function setupMessageListener(accountId: string, orgId: string, api: ZaloAPI): void;
