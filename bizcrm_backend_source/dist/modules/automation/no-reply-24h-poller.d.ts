/**
 * Scan conversations where:
 * - Contact sent the last message (isReplied = false)
 * - Last message was 24+ hours ago
 * - Not already triggered for this lastMessageAt
 *
 * Returns total number of triggers dispatched this cycle.
 */
export declare function pollNoReply24h(): Promise<number>;
