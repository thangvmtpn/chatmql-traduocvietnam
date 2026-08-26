/**
 * zalo-reactions.ts — Forward biz-crm reactions to real Zalo via zca-js.
 *
 * Maps UI emoji (👍❤️😂😮😢😡) to the zca-js Reactions enum and calls
 * api.addReaction(). DB write is authoritative; Zalo sync is best-effort
 * (never throws — returns a result object the caller can log).
 */
import { Reactions, ThreadType } from 'zca-js';
import { getPoolEntry } from './zalo-pool.js';
import { checkLimits, recordAction } from './zalo-rate-limiter.js';
const EMOJI_TO_ZALO_REACTION = {
    '👍': Reactions.LIKE,
    '❤️': Reactions.HEART,
    '😂': Reactions.HAHA,
    '😮': Reactions.WOW,
    '😢': Reactions.CRY,
    '😡': Reactions.ANGRY,
};
/** Reverse lookup — used by inbound listener (Phase 3) to map enum back to emoji. */
export const ZALO_REACTION_TO_EMOJI = Object.fromEntries(Object.entries(EMOJI_TO_ZALO_REACTION).map(([emoji, enumVal]) => [enumVal, emoji]));
export function isSupportedEmoji(emoji) {
    return emoji in EMOJI_TO_ZALO_REACTION;
}
/**
 * Best-effort forward to Zalo. Never throws — returns a result for logging.
 */
export async function forwardReactionToZalo(input) {
    const { accountId, threadId, threadType, externalMsgId, emoji } = input;
    if (!externalMsgId)
        return { forwarded: false, reason: 'message has no externalMsgId (local-only)' };
    if (!threadId)
        return { forwarded: false, reason: 'conversation has no externalThreadId' };
    let icon;
    if (emoji === '') {
        icon = Reactions.NONE;
    }
    else {
        const mapped = EMOJI_TO_ZALO_REACTION[emoji];
        if (!mapped)
            return { forwarded: false, reason: `emoji ${emoji} not in supported map` };
        icon = mapped;
    }
    const entry = getPoolEntry(accountId);
    if (!entry || entry.status !== 'connected' || !entry.api) {
        return { forwarded: false, reason: `zalo account ${accountId} not connected` };
    }
    const rateCheck = checkLimits(accountId, 'reaction');
    if (!rateCheck.allowed) {
        return { forwarded: false, reason: rateCheck.reason || 'rate-limited' };
    }
    try {
        const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
        await entry.api.addReaction(icon, {
            data: { msgId: externalMsgId, cliMsgId: externalMsgId },
            threadId,
            type,
        });
        recordAction(accountId, 'reaction');
        return { forwarded: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { forwarded: false, error: msg };
    }
}
//# sourceMappingURL=zalo-reactions.js.map