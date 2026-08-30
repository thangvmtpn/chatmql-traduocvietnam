/**
 * socket-gateway.ts — Socket.IO real-time gateway for BizCRM.
 *
 * Rooms strategy (from ZaloCRM):
 *   org:{orgId}         — all users in an organization
 *   conv:{convId}       — all users viewing a specific conversation
 *
 * Events emitted to clients:
 *   chat:message        — new message in a conversation
 *   chat:message-edited — message content edited
 *   chat:deleted        — message soft-deleted
 *   chat:reactions      — reaction added/removed
 *   chat:pinned         — conversation pinned
 *   chat:unpinned       — conversation unpinned
 *   notification:new    — new in-app notification
 */
import type { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { logger } from '../../shared/logger.js'

/* ── Singleton IO instance ─────────────────────────────────── */

let io: Server | null = null

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized')
  return io
}

/* ── JWT payload ─────────────────────────────────────────── */

interface JwtUser {
  id: string
  email: string
  fullName: string
  role: string
  orgId: string
}

/* ── Auth middleware ──────────────────────────────────────── */

function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '')

  if (!token) return next(new Error('Missing auth token'))

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
    const payload = jwt.verify(token, secret) as JwtUser
    ;(socket as any).user = payload
    next()
  } catch {
    next(new Error('Invalid token'))
  }
}

/* ── Initialize ──────────────────────────────────────────── */

export function initSocketGateway(httpServer: HttpServer): Server {
  // Match CORS origin config from Fastify (app.ts)
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : '*'

  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
    transports: ['websocket', 'polling'],
    path: '/socket.io',
  })

  io.use(authenticateSocket)

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as JwtUser
    logger.info(`[Socket] connected: ${user.fullName} (${user.id}) org=${user.orgId}`)

    // Auto-join org room
    socket.join(`org:${user.orgId}`)

    // Join a conversation room
    socket.on('join:conv', (convId: string) => {
      socket.join(`conv:${convId}`)
    })

    // Leave a conversation room
    socket.on('leave:conv', (convId: string) => {
      socket.leave(`conv:${convId}`)
    })

    // Typing indicator (broadcast to conv room, exclude sender)
    socket.on('typing:start', (convId: string) => {
      socket.to(`conv:${convId}`).emit('typing:start', {
        convId,
        userId: user.id,
        fullName: user.fullName,
      })
      // Also surface to the external channel (Zalo personal) — throttled inside.
      // Dynamic import avoids a gateway↔pool import cycle; fire-and-forget.
      import('../chat/typing-forward.js')
        .then((m) => m.forwardStaffTypingToZalo(user.orgId, convId))
        .catch(() => { /* cosmetic */ })
    })

    socket.on('typing:stop', (convId: string) => {
      socket.to(`conv:${convId}`).emit('typing:stop', { convId, userId: user.id })
    })

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] disconnected: ${user.id} (${reason})`)
    })
  })

  logger.info('[Socket] Gateway initialized')
  return io
}

/* ── Event emitters (called from route handlers) ─────────── */

/** Emit new message to all members of a conversation */
export function emitNewMessage(orgId: string, convId: string, message: unknown) {
  getIO().to(`conv:${convId}`).emit('chat:message', message)
  // Also emit conversation list update to org room
  getIO().to(`org:${orgId}`).emit('chat:conv-updated', { convId })
}

/**
 * AI processing indicator for a conversation (test chat + inbox viewers).
 * Callers MUST pair start with a finally-guaranteed stop; clients additionally
 * auto-clear after a timeout so a lost stop can never strand the indicator.
 */
export function emitAiTyping(convId: string, isTyping: boolean) {
  getIO().to(`conv:${convId}`).emit('chat:ai-typing', { convId, isTyping })
}

/** Emit message edit */
export function emitMessageEdited(convId: string, messageId: string, content: string) {
  getIO().to(`conv:${convId}`).emit('chat:message-edited', { messageId, content })
}

/** Emit message delete */
export function emitMessageDeleted(convId: string, messageId: string) {
  getIO().to(`conv:${convId}`).emit('chat:deleted', { messageId })
}

/** Emit ZNS delivery-status change so the timeline bubble updates live (delivered/read) */
export function emitZnsStatus(
  convId: string,
  payload: { messageId: string; status: string; deliveredAt?: string | null },
) {
  getIO().to(`conv:${convId}`).emit('chat:zns-status', { convId, ...payload })
}

/** Emit reaction change */
export function emitReaction(convId: string, messageId: string, emoji: string, action: 'added' | 'removed') {
  getIO().to(`conv:${convId}`).emit('chat:reactions', { messageId, emoji, action })
}

/** Emit pin/unpin */
export function emitPinToggle(orgId: string, convId: string, isPinned: boolean) {
  getIO().to(`org:${orgId}`).emit(isPinned ? 'chat:pinned' : 'chat:unpinned', { convId })
}

/** Emit conversation deletion so every open client drops it from the list */
export function emitConvDeleted(orgId: string, convId: string) {
  getIO().to(`org:${orgId}`).emit('chat:conv-deleted', { convId })
}

/** Emit group membership change so the open conversation can refetch its member list */
export function emitGroupMembersUpdated(convId: string, payload: { eventType: string; groupId: string }) {
  getIO().to(`conv:${convId}`).emit('chat:group-members-updated', { convId, ...payload })
}

/** Emit Zalo send error to conversation viewers */
export function emitSendError(orgId: string, convId: string, error: { messageId?: string; reason: string }) {
  getIO().to(`conv:${convId}`).emit('chat:send-error', { convId, ...error })
  // Also broadcast to org room for sidebar status updates
  getIO().to(`org:${orgId}`).emit('chat:send-error', { convId, ...error })
}

/** Emit Zalo seen/read receipt to conversation viewers */
export function emitSeenReceipt(orgId: string, convId: string, payload: {
  threadId: string; msgId: string; isGroup: boolean; seenUids: string[]
}) {
  getIO().to(`conv:${convId}`).emit('chat:seen', payload)
  // Also mark on sidebar for unread indicator
  getIO().to(`org:${orgId}`).emit('chat:conv-updated', { convId })
}

/** Emit inbound Zalo reaction (someone reacted to a message via Zalo, not CRM) */
export function emitInboundReaction(convId: string, payload: {
  messageId: string; externalMsgId: string; emoji: string; userId: string; action: 'added' | 'removed'
}) {
  getIO().to(`conv:${convId}`).emit('chat:reaction-sync', payload)
}

/** Emit friend request lifecycle event to org */
export function emitFriendEvent(orgId: string, payload: {
  type: 'request_received' | 'request_sent' | 'accepted' | 'removed' | 'request_cancelled' | 'request_rejected'
  accountId: string; userId: string; displayName?: string; avatar?: string; phone?: string; message?: string
}) {
  getIO().to(`org:${orgId}`).emit('zalo:friend-event', payload)
}

/** Emit notification to a specific user */
export function emitNotification(orgId: string, userId: string, notification: unknown) {
  // Use user-specific room if present, else org room
  getIO().to(`org:${orgId}`).emit('notification:new', notification)
}

/**
 * Emit AI auto-reply draft to all users viewing a conversation.
 * Event: 'chat:ai-draft' on room conv:{convId}
 * Payload: { convId, suggestionId, content, confidence }
 */
export function emitAiDraft(
  orgId: string,
  convId: string,
  payload: { suggestionId: string; content: string; confidence: number },
) {
  getIO().to(`conv:${convId}`).emit('chat:ai-draft', { convId, ...payload })
}

/**
 * Emit AI mode change to both the conversation room and the org room.
 * Payload: { convId, aiMode, aiModeReason?, by }
 */
export function emitAiModeChanged(
  orgId: string,
  convId: string,
  payload: { convId: string; aiMode: string; aiModeReason?: string | null; by: string },
) {
  getIO().to(`conv:${convId}`).emit('chat:ai-mode-changed', payload)
  getIO().to(`org:${orgId}`).emit('chat:ai-mode-changed', payload)
}

/**
 * Emit backfill progress to org room.
 * Event: 'zalo:backfill-progress'
 */
export function emitBackfillProgress(
  orgId: string,
  payload: {
    accountId: string
    current: number
    total: number
    threadName?: string
    status: 'processing' | 'completed' | 'error'
    result?: { totalInserted: number; totalSkipped: number; errors: number }
  },
) {
  getIO().to(`org:${orgId}`).emit('zalo:backfill-progress', payload)
}
