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
import { recordDebug } from '../modules/zalo/debug-log.js';
import { getIO } from '../modules/realtime/socket-gateway.js';
/**
 * Record an inbound-channel event into the org's ring buffer and push it live to
 * that org's admins. Payload/summary are capped inside recordDebug(); the socket
 * event name stays `zalo:debug` for backward-compat with the already-deployed FE.
 */
export function logChannelEvent(input) {
    const entry = recordDebug({
        accountId: input.accountId,
        event: input.event,
        summary: input.summary,
        data: input.data,
        orgId: input.orgId,
    });
    try {
        if (input.orgId)
            getIO().to(`org:${input.orgId}:admins`).emit('zalo:debug', entry);
    }
    catch {
        // getIO() throws before Socket.IO is initialised (e.g. during boot) — the
        // entry is already buffered, so dropping the live push is harmless.
    }
    return entry;
}
//# sourceMappingURL=channel-event-log.js.map