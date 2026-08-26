import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../../shared/logger.js';
/* ── Singleton IO instance ─────────────────────────────────── */
let io = null;
export function getIO() {
    if (!io)
        throw new Error('Socket.IO not initialized');
    return io;
}
/* ── Auth middleware ──────────────────────────────────────── */
function authenticateSocket(socket, next) {
    const token = socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token)
        return next(new Error('Missing auth token'));
    try {
        const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
        const payload = jwt.verify(token, secret);
        socket.user = payload;
        next();
    }
    catch {
        next(new Error('Invalid token'));
    }
}
/* ── Initialize ──────────────────────────────────────────── */
export function initSocketGateway(httpServer) {
    // Match CORS origin config from Fastify (app.ts)
    const corsOrigin = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
        : '*';
    io = new Server(httpServer, {
        cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
        transports: ['websocket', 'polling'],
        path: '/socket.io',
    });
    io.use(authenticateSocket);
    io.on('connection', (socket) => {
        const user = socket.user;
        logger.info(`[Socket] connected: ${user.fullName} (${user.id}) org=${user.orgId}`);
        // Auto-join org room
        socket.join(`org:${user.orgId}`);
        // Join a conversation room
        socket.on('join:conv', (convId) => {
            socket.join(`conv:${convId}`);
        });
        // Leave a conversation room
        socket.on('leave:conv', (convId) => {
            socket.leave(`conv:${convId}`);
        });
        // Typing indicator (broadcast to conv room, exclude sender)
        socket.on('typing:start', (convId) => {
            socket.to(`conv:${convId}`).emit('typing:start', {
                convId,
                userId: user.id,
                fullName: user.fullName,
            });
            // Also surface to the external channel (Zalo personal) — throttled inside.
            // Dynamic import avoids a gateway↔pool import cycle; fire-and-forget.
            import('../chat/typing-forward.js')
                .then((m) => m.forwardStaffTypingToZalo(user.orgId, convId))
                .catch(() => { });
        });
        socket.on('typing:stop', (convId) => {
            socket.to(`conv:${convId}`).emit('typing:stop', { convId, userId: user.id });
        });
        socket.on('disconnect', (reason) => {
            logger.info(`[Socket] disconnected: ${user.id} (${reason})`);
        });
    });
    logger.info('[Socket] Gateway initialized');
    return io;
}
/* ── Event emitters (called from route handlers) ─────────── */
/** Emit new message to all members of a conversation */
export function emitNewMessage(orgId, convId, message) {
    getIO().to(`conv:${convId}`).emit('chat:message', message);
    // Also emit conversation list update to org room
    getIO().to(`org:${orgId}`).emit('chat:conv-updated', { convId });
}
/**
 * AI processing indicator for a conversation (test chat + inbox viewers).
 * Callers MUST pair start with a finally-guaranteed stop; clients additionally
 * auto-clear after a timeout so a lost stop can never strand the indicator.
 */
export function emitAiTyping(convId, isTyping) {
    getIO().to(`conv:${convId}`).emit('chat:ai-typing', { convId, isTyping });
}
/** Emit message edit */
export function emitMessageEdited(convId, messageId, content) {
    getIO().to(`conv:${convId}`).emit('chat:message-edited', { messageId, content });
}
/** Emit message delete */
export function emitMessageDeleted(convId, messageId) {
    getIO().to(`conv:${convId}`).emit('chat:deleted', { messageId });
}
/** Emit ZNS delivery-status change so the timeline bubble updates live (delivered/read) */
export function emitZnsStatus(convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:zns-status', { convId, ...payload });
}
/** Emit reaction change */
export function emitReaction(convId, messageId, emoji, action) {
    getIO().to(`conv:${convId}`).emit('chat:reactions', { messageId, emoji, action });
}
/** Emit pin/unpin */
export function emitPinToggle(orgId, convId, isPinned) {
    getIO().to(`org:${orgId}`).emit(isPinned ? 'chat:pinned' : 'chat:unpinned', { convId });
}
/** Emit conversation deletion so every open client drops it from the list */
export function emitConvDeleted(orgId, convId) {
    getIO().to(`org:${orgId}`).emit('chat:conv-deleted', { convId });
}
/** Emit group membership change so the open conversation can refetch its member list */
export function emitGroupMembersUpdated(convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:group-members-updated', { convId, ...payload });
}
/** Emit Zalo send error to conversation viewers */
export function emitSendError(orgId, convId, error) {
    getIO().to(`conv:${convId}`).emit('chat:send-error', { convId, ...error });
    // Also broadcast to org room for sidebar status updates
    getIO().to(`org:${orgId}`).emit('chat:send-error', { convId, ...error });
}
/** Emit Zalo seen/read receipt to conversation viewers */
export function emitSeenReceipt(orgId, convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:seen', payload);
    // Also mark on sidebar for unread indicator
    getIO().to(`org:${orgId}`).emit('chat:conv-updated', { convId });
}
/** Emit inbound Zalo reaction (someone reacted to a message via Zalo, not CRM) */
export function emitInboundReaction(convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:reaction-sync', payload);
}
/** Emit friend request lifecycle event to org */
export function emitFriendEvent(orgId, payload) {
    getIO().to(`org:${orgId}`).emit('zalo:friend-event', payload);
}
/** Emit notification to a specific user */
export function emitNotification(orgId, userId, notification) {
    // Use user-specific room if present, else org room
    getIO().to(`org:${orgId}`).emit('notification:new', notification);
}
/**
 * Emit AI auto-reply draft to all users viewing a conversation.
 * Event: 'chat:ai-draft' on room conv:{convId}
 * Payload: { convId, suggestionId, content, confidence }
 */
export function emitAiDraft(orgId, convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:ai-draft', { convId, ...payload });
}
/**
 * Emit AI mode change to both the conversation room and the org room.
 * Payload: { convId, aiMode, aiModeReason?, by }
 */
export function emitAiModeChanged(orgId, convId, payload) {
    getIO().to(`conv:${convId}`).emit('chat:ai-mode-changed', payload);
    getIO().to(`org:${orgId}`).emit('chat:ai-mode-changed', payload);
}
//# sourceMappingURL=socket-gateway.js.map