import { transformMessageForFrontend } from './chat-routes.js';
export interface SendMessageCoreParams {
    orgId: string;
    conversationId: string;
    text: string;
    /** 'staff' = human-initiated; 'ai' = AI-generated reply */
    sender: 'staff' | 'ai';
    /** userId when sender==='staff'; null/undefined for AI sends */
    repliedByUserId?: string | null;
    /** Optional: pre-fetched conversation data to avoid re-querying */
    aiReplyRunId?: string | null;
    /**
     * Who produced this outbound reply (Message.responseSource). When omitted it is
     * derived: ai → ai_auto; staff with a user → manual; staff without a user
     * (automation/system) → none (null). Pass 'ai_suggest' when staff sends an AI draft.
     */
    responseSource?: string | null;
    /** Quote context for staff sends */
    quote?: Record<string, unknown> | null;
    /**
     * Re-trigger 'message_sent' automation rules after sending.
     * Default: true for staff (preserves HTTP route behavior), false for ai.
     * Automation-originated sends MUST pass false to avoid automation loops.
     */
    triggerAutomation?: boolean;
}
export interface SendMessageCoreResult {
    messages: Awaited<ReturnType<typeof transformMessageForFrontend>>[];
    sentViaZalo: boolean;
    zaloError?: string;
    zaloErrorCode?: string | number;
    /** Set for OA CS-window errors */
    csWindowExpired?: boolean;
}
/**
 * Send one or more text messages programmatically.
 *
 * For `sender='ai'`: splits on paragraph boundaries (≤4 chunks), sets
 * `aiGenerated=true`, senderName='AI Assistant'.
 * For `sender='staff'`: single message, senderName='Staff'.
 */
export declare function sendMessageCore(params: SendMessageCoreParams): Promise<SendMessageCoreResult>;
