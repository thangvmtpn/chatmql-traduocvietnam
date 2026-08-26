/**
 * gap-detection.ts — PURE logic for the AI "knowledge gap" feature (no I/O).
 *
 * Imported by reply-generator (the auto-log decision) and knowledge-gap-service
 * (normalization / dedup keys). Kept dependency-free so the core rules are
 * unit-tested in gap-detection.test.ts without touching the DB or providers.
 */
export type GapType = 'missing_info' | 'needs_knowledge' | 'needs_staff';
/** Coerce an arbitrary tool-supplied type to a valid GapType (default missing_info). */
export declare function normalizeGapType(t: string | undefined): GapType;
/** Normalize a question for storage + dedup: trim, collapse whitespace, cap length. */
export declare function normalizeQuestion(q: string): string;
export declare const GAP_HIT_THRESHOLD = 0.6;
/** A search hit counts as a confident answer. null score = unknown = NOT confident. */
export declare function isConfidentHit(score: number | null | undefined): boolean;
export declare const DEFER_MARKERS: string[];
/** Whether the AI's reply signals it could NOT answer (deferred). */
export declare function looksLikeDefer(text: string): boolean;
/**
 * Should the harness auto-log a knowledge gap for this turn? True ONLY when the AI
 * searched, found no confident hit, hasn't already logged via the tool, AND deferred.
 * (Server-side fallback: the model's own log_knowledge_gap tool call is unreliable.)
 */
export declare function shouldAutoLogGap(s: {
    searchAttempted: boolean;
    searchHit: boolean;
    gapLogged: boolean;
    replyText: string;
}): boolean;
