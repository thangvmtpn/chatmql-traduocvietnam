/**
 * api.js — tầng gọi API dùng chung cho toàn app mobile.
 *
 * Mọi màn hình đều đi qua đây, không ai tự fetch: token gắn một chỗ, hết hạn
 * gia hạn một chỗ, lỗi mạng báo một kiểu. Đây là điều kiện để các đợt sau chỉ
 * việc gọi `api.get('/conversations')` là xong.
 */
import { session } from './session.js'

/** Chạy local gọi backend local; lên dev site thì cùng origin (nginx proxy /api). */
export const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:4520'
    : ''

let refreshing = null // Promise đang gia hạn — gộp các request 401 đồng thời

async function refreshToken() {
  // Nhiều request cùng dính 401 thì chỉ gia hạn MỘT lần, số còn lại chờ chung.
  if (!refreshing) {
    refreshing = (async () => {
      const rt = session.refreshToken()
      if (!rt) return false
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        })
        if (!res.ok) return false
        const d = await res.json()
        if (!d.token) return false
        session.update(d.token, d.refreshToken)
        return true
      } catch {
        return false
      } finally {
        // Cho phép lần gia hạn kế tiếp sau khi lần này xong
        setTimeout(() => { refreshing = null }, 0)
      }
    })()
  }
  return refreshing
}

async function call(method, path, body, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = session.token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    // Mạng di động chập chờn là chuyện thường — báo bằng tiếng Việt dễ hiểu,
    // không ném "TypeError: Failed to fetch" ra màn hình nhân viên.
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }

  // Token hết hạn: gia hạn rồi thử lại đúng MỘT lần. Gia hạn thất bại thì về
  // màn đăng nhập — không lặp vô hạn.
  if (res.status === 401 && !opts._retried && session.refreshToken()) {
    const ok = await refreshToken()
    if (ok) return call(method, path, body, { ...opts, _retried: true })
    session.clear()
    location.reload()
    throw new ApiError(401, 'Phiên làm việc đã hết hạn')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || data?.message || `Lỗi ${res.status}`, data)
  }
  return data
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export const api = {
  get: (path, opts) => call('GET', path, undefined, opts),
  post: (path, body, opts) => call('POST', path, body, opts),
  put: (path, body, opts) => call('PUT', path, body, opts),
  patch: (path, body, opts) => call('PATCH', path, body, opts),
  del: (path, opts) => call('DELETE', path, undefined, opts),
}
