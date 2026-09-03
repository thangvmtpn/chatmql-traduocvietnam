/**
 * debug-log.ts — in-memory ring buffer behind the admin event log.
 *
 * Holds capacity, truncation, per-org isolation and eviction policy with no
 * prisma / socket / zca-js imports, so it can be unit-tested directly. Callers
 * go through pushDebug() in zalo-pool.ts, which resolves the orgId for an
 * account and fans the stored entry out over Socket.IO.
 *
 * NOT persisted — everything here dies with the process.
 */
export interface DebugLogEntry {
    ts: string;
    accountId: string;
    event: string;
    summary: string;
    data?: any;
    orgId?: string | null;
    truncated?: boolean;
}
export declare const DEBUG_LOG_MAX: number;
export declare const MAX_DATA_CHARS = 2000;
export declare const MAX_SUMMARY_CHARS = 500;
export declare const MAX_LABEL_CHARS = 200;
export declare const MAX_ORG_BUFFERS: number;
/** Bucket for events that belong to no tenant (e.g. webhook from an unconnected OA). */
export declare const UNATTRIBUTED = "__unattributed__";
export declare const UNATTRIBUTED_MAX = 200;
/**
 * Cap an entry payload. Oversized payloads are replaced by a JSON prefix so a
 * single fat event can't blow the buffer's memory budget.
 */
export declare function truncateData(data: unknown): {
    data: unknown;
    truncated: boolean;
};
export interface DebugInput {
    accountId: string;
    event: string;
    summary: string;
    data?: unknown;
    /** null when the event cannot be attributed to a tenant. */
    orgId: string | null;
}
/** Build, truncate and store an entry. Returns what was stored. */
export declare function recordDebug(input: DebugInput, now?: number): DebugLogEntry;
/** Entries visible to `orgId`, oldest first. */
export declare function getDebugLog(orgId: string): DebugLogEntry[];
/** Test helper — drops every buffer. */
export declare function resetDebugLog(): void;
