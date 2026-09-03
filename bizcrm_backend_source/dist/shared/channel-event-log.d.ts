/**
 * channel-event-log.ts — cross-channel admin event-log emit wrapper.
 *
 * The ring buffer itself (pure, unit-tested) lives in modules/zalo/debug-log.ts;
 * this thin layer adds the Socket.IO fan-out. Every inbound channel logs through
 * here so admins get ONE unified "Nhật ký sự kiện":
 *   - Zalo personal / OA  → via zalo-pool.pushDebug() (resolves orgId from the pool)
 *   - Pancake / Facebook  → webhook handlers call logChannelEvent() directly
 *
 * (debug-log.ts stays under modules/zalo/ for now to avoid churn; it is generic
 * and could move to shared/ later.)
 */
import { type DebugLogEntry } from '../modules/zalo/debug-log.js';
export interface ChannelEventInput {
    /** Channel-prefixed id, e.g. `pancake:<accountId>`, `fb:<accountId>`, `oa:<accountId>`. */
    accountId: string;
    event: string;
    summary: string;
    data?: unknown;
    /** null when the event can't be attributed to a tenant (unknown/unconnected page). */
    orgId: string | null;
}
/**
 * Record an inbound-channel event into the org's ring buffer and push it live to
 * that org's admins. Payload/summary are capped inside recordDebug(); the socket
 * event name stays `zalo:debug` for backward-compat with the already-deployed FE.
 */
export declare function logChannelEvent(input: ChannelEventInput): DebugLogEntry;
