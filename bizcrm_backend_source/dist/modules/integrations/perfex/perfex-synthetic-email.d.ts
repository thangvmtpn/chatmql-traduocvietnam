/** Maps raw biz-crm `source` strings to a canonical provider key. */
export declare function normalizeSource(src?: string | null): string;
export interface SyntheticEmailInput {
    id: string;
    source?: string | null;
    phone?: string | null;
    zaloUid?: string | null;
}
/**
 * Deterministic, unique, non-deliverable email.
 * token = zaloUid → phone digits → contact uuid (uuid guarantees uniqueness).
 * Provider sources use their profile domain ('{token}@zalo.me'); sources with no
 * safe provider use '{source}.{token}@{fallbackDomain}'.
 */
export declare function synthesizeEmail(input: SyntheticEmailInput, fallbackDomain: string): string;
/**
 * Heuristic: was `email` produced by synthesizeEmail? Domain-only check, so it is a FALLBACK
 * signal. Phase 03 self-healing MUST prefer the authoritative `Contact.metadata.syntheticEmail`
 * flag (set when a synthetic email is generated); use this only for contacts created before the
 * flag existed. Intentionally conservative to avoid misclassifying real corporate emails.
 */
export declare function isSyntheticEmail(email: string | null | undefined, fallbackDomain: string): boolean;
