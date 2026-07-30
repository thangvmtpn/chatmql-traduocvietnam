/**
 * gap-detection.ts — PURE logic for the AI "knowledge gap" feature (no I/O).
 *
 * Imported by reply-generator (the auto-log decision) and knowledge-gap-service
 * (normalization / dedup keys). Kept dependency-free so the core rules are
 * unit-tested in gap-detection.test.ts without touching the DB or providers.
 */

export type GapType = 'missing_info' | 'needs_knowledge' | 'needs_staff'
const GAP_TYPES: GapType[] = ['missing_info', 'needs_knowledge', 'needs_staff']

/** Coerce an arbitrary tool-supplied type to a valid GapType (default missing_info). */
export function normalizeGapType(t: string | undefined): GapType {
  return (GAP_TYPES as string[]).includes(t ?? '') ? (t as GapType) : 'missing_info'
}

/** Normalize a question for storage + dedup: trim, collapse whitespace, cap length. */
export function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, ' ').slice(0, 1000)
}

// A search "answered" the question only if a hit clears this — HIGHER than the
// retrieval minScore (~0.35). Hits at 0.4–0.58 are low-relevance noise the AI
// defers on (still a gap). Real answers score ~0.7+.
export const GAP_HIT_THRESHOLD = 0.6

/** A search hit counts as a confident answer. null score = unknown = NOT confident. */
export function isConfidentHit(score: number | null | undefined): boolean {
  return (score ?? 0) >= GAP_HIT_THRESHOLD
}

// Phrases the AI uses when it CANNOT answer (the prompt standardises these). Used
// to gate auto-logging: a search-empty turn is a gap only if the AI deferred — info
// answered from the prompt/scenario/instructions (no defer) is NOT a gap.
export const DEFER_MARKERS = [
  'kiểm tra lại', 'chưa thấy', 'chưa có thông tin', 'chưa có dữ liệu',
  'chưa cập nhật', 'chuyển nhân viên', 'nhân viên hỗ trợ', 'liên hệ lại',
  'chưa nắm', 'xác minh lại', 'sẽ phản hồi lại', 'báo lại sau', 'kiểm tra thêm',
]

/** Whether the AI's reply signals it could NOT answer (deferred). */
export function looksLikeDefer(text: string): boolean {
  const t = text.toLowerCase()
  return DEFER_MARKERS.some((m) => t.includes(m))
}

/**
 * Should the harness auto-log a knowledge gap for this turn? True ONLY when the AI
 * searched, found no confident hit, hasn't already logged via the tool, AND deferred.
 * (Server-side fallback: the model's own log_knowledge_gap tool call is unreliable.)
 */
export function shouldAutoLogGap(s: {
  searchAttempted: boolean
  searchHit: boolean
  gapLogged: boolean
  replyText: string
}): boolean {
  return s.searchAttempted && !s.searchHit && !s.gapLogged && looksLikeDefer(s.replyText)
}
