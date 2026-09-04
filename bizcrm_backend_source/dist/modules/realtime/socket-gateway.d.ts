/**
 * socket-gateway.ts — Socket.IO real-time gateway for BizCRM.
 *
 * Rooms strategy (from ZaloCRM):
 *   org:{orgId}         — all users in an organization
 *   conv:{convId}       — all users viewing a specific conversation
 *
 * Events emitted to clients:
 *   chat:message        — new message in a conversation
 *   chat:message-edited — message content edited
 *   chat:deleted        — message soft-deleted
 *   chat:reactions      — reaction added/removed
 *   chat:pinned         — conversation pinned
 *   chat:unpinned       — conversation unpinned
 *   notification:new    — new in-app notification
 */
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
export declare function getIO(): Server;
export declare function initSocketGateway(httpServer: HttpServer): Server;
export declare function emitNewMessage(orgId: string, convId: string, message: unknown): void;
/**
 * AI processing indicator for a conversation (test chat + inbox viewers).
 * Callers MUST pair start with a finally-guaranteed stop; clients additionally
 * auto-clear after a timeout so a lost stop can never strand the indicator.
 */
export declare function emitAiTyping(convId: string, isTyping: boolean): void;
/** Emit message edit */
export declare function emitMessageEdited(convId: string, messageId: string, content: string): void;
/** Emit message delete */
export declare function emitMessageDeleted(convId: string, messageId: string): void;
/** Emit ZNS delivery-status change so the timeline bubble updates live (delivered/read) */
export declare function emitZnsStatus(convId: string, payload: {
    messageId: string;
    status: string;
    deliveredAt?: string | null;
}): void;
/** Emit reaction change */
export declare function emitReaction(convId: string, messageId: string, emoji: string, action: 'added' | 'removed'): void;
/** Emit pin/unpin */
export declare function emitPinToggle(orgId: string, convId: string, isPinned: boolean): void;
/** Emit conversation deletion so every open client drops it from the list */
export declare function emitConvDeleted(orgId: string, convId: string): void;
/** Emit group membership change so the open conversation can refetch its member list */
export declare function emitGroupMembersUpdated(convId: string, payload: {
    eventType: string;
    groupId: string;
}): void;
/** Emit Zalo send error to conversation viewers */
export declare function emitSendError(orgId: string, convId: string, error: {
    messageId?: string;
    reason: string;
}): void;
/** Emit Zalo seen/read receipt to conversation viewers */
export declare function emitSeenReceipt(orgId: string, convId: string, payload: {
    threadId: string;
    msgId: string;
    isGroup: boolean;
    seenUids: string[];
}): void;
/** Emit inbound Zalo reaction (someone reacted to a message via Zalo, not CRM) */
export declare function emitInboundReaction(convId: string, payload: {
    messageId: string;
    externalMsgId: string;
    emoji: string;
    userId: string;
    action: 'added' | 'removed';
}): void;
/** Emit friend request lifecycle event to org */
export declare function emitFriendEvent(orgId: string, payload: {
    type: 'request_received' | 'request_sent' | 'accepted' | 'removed' | 'request_cancelled' | 'request_rejected';
    accountId: string;
    userId: string;
    displayName?: string;
    avatar?: string;
    phone?: string;
    message?: string;
}): void;
/** Emit notification to a specific user */
export declare function emitNotification(orgId: string, userId: string, notification: unknown): void;
/**
 * Emit AI auto-reply draft to all users viewing a conversation.
 * Event: 'chat:ai-draft' on room conv:{convId}
 * Payload: { convId, suggestionId, content, confidence }
 */
export declare function emitAiDraft(orgId: string, convId: string, payload: {
    suggestionId: string;
    content: string;
    confidence: number;
}): void;
/**
 * Emit AI mode change to both the conversation room and the org room.
 * Payload: { convId, aiMode, aiModeReason?, by }
 */
export declare function emitAiModeChanged(orgId: string, convId: string, payload: {
    convId: string;
    aiMode: string;
    aiModeReason?: string | null;
    by: string;
}): void;
/**
 * Emit backfill progress to org room.
 * Event: 'zalo:backfill-progress'
 */
export declare function emitBackfillProgress(orgId: string, payload: {
    accountId: string;
    current: number;
    total: number;
    threadName?: string;
    status: 'processing' | 'completed' | 'error';
    result?: {
        totalInserted: number;
        totalSkipped: number;
        errors: number;
    };
}): void;
