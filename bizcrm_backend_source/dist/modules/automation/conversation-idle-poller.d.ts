export declare const IDLE_THRESHOLDS: readonly [{
    readonly key: "30m";
    readonly ms: number;
    readonly label: "30 phút";
}, {
    readonly key: "1h";
    readonly ms: number;
    readonly label: "1 giờ";
}, {
    readonly key: "24h";
    readonly ms: number;
    readonly label: "24 giờ";
}];
export type IdleThresholdKey = typeof IDLE_THRESHOLDS[number]['key'];
/**
 * Scan conversations that have been idle past each threshold.
 * For each match, dispatch `conversation_idle` trigger with context.
 *
 * Returns total number of triggers dispatched this cycle.
 */
export declare function pollConversationIdle(): Promise<number>;
/**
 * Reset all idle checkpoints for a conversation.
 * Call this when a new message arrives so the idle timer restarts.
 */
export declare function resetIdleCheckpoints(conversationId: string): Promise<void>;
/**
 * Pre-seed idle checkpoints so the poller treats a conversation as ALREADY
 * processed up to `lastMessageAt` (skip condition: lastCheckedAt >= lastMessageAt).
 *
 * Used by bulk importers (e.g. Pancake sync) so a batch of historical
 * conversations doesn't get swept as "newly idle" → firing `conversation_idle`
 * automation (incl. ai_cdp Customer 360, an AI call per conversation). Future
 * REAL activity advances lastMessageAt past the checkpoint and re-arms idle
 * naturally — so this only suppresses the one-time historical sweep.
 */
export declare function seedIdleCheckpoints(conversationId: string, lastMessageAt: Date): Promise<void>;
