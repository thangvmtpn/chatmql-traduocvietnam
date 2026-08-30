/**
 * socket.js — kết nối thời gian thực với backend.
 *
 * Backend phát các sự kiện (đọc từ socket-gateway.ts):
 *   chat:message      — tin mới trong hội thoại đang join (join:conv/leave:conv)
 *   chat:conv-updated — hội thoại nào đó trong org có biến động (phòng org tự join)
 *   chat:ai-typing    — AI đang soạn trả lời
 *
 * Xác thực bằng chính JWT của phiên (handshake.auth.token).
 */
import { io } from 'socket.io-client'
import { API_BASE } from './api.js'
import { session } from './session.js'

let sock = null

export function getSocket() {
  if (sock) return sock
  sock = io(API_BASE || '/', {
    auth: { token: session.token() },
    // Mạng di động rớt liên tục là bình thường — cứ tự nối lại mãi.
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10_000,
  })
  return sock
}

/** Vào phòng một hội thoại để nhận tin mới của nó. Trả về hàm rời phòng. */
export function joinConversation(convId, onMessage, onAiTyping) {
  const s = getSocket()
  s.emit('join:conv', convId)

  const handleMsg = (m) => { if (m?.conversationId === convId || !m?.conversationId) onMessage(m) }
  const handleTyping = (p) => { if (p?.convId === convId && onAiTyping) onAiTyping(p.isTyping) }
  s.on('chat:message', handleMsg)
  s.on('chat:ai-typing', handleTyping)

  return () => {
    s.emit('leave:conv', convId)
    s.off('chat:message', handleMsg)
    s.off('chat:ai-typing', handleTyping)
  }
}

/** Nghe biến động danh sách hội thoại (tin mới ở BẤT KỲ hội thoại nào). */
export function onConversationsChanged(handler) {
  const s = getSocket()
  s.on('chat:conv-updated', handler)
  return () => s.off('chat:conv-updated', handler)
}
