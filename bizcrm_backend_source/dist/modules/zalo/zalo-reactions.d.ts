/** Reverse lookup — used by inbound listener (Phase 3) to map enum back to emoji. */
export declare const ZALO_REACTION_TO_EMOJI: Record<string, string>;
export declare function isSupportedEmoji(emoji: string): boolean;
export interface ForwardReactionInput {
    accountId: string;
    threadId: string;
    threadType: 'user' | 'group';
    externalMsgId: string;
    emoji: string;
}
export interface ForwardReactionResult {
    forwarded: boolean;
    reason?: string;
    error?: string;
}
/**
 * Best-effort forward to Zalo. Never throws — returns a result for logging.
 */
export declare function forwardReactionToZalo(input: ForwardReactionInput): Promise<ForwardReactionResult>;
