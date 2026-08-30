/**
 * session.js — phiên đăng nhập của nhân viên trên điện thoại.
 *
 * Lưu localStorage với khoá RIÊNG (chatmql_m_*) để không giẫm lên phiên của
 * bản desktop nếu nhân viên mở cả hai trên cùng trình duyệt.
 */
const K_TOKEN = 'chatmql_m_token'
const K_REFRESH = 'chatmql_m_refresh'
const K_USER = 'chatmql_m_user'

export const session = {
  token: () => localStorage.getItem(K_TOKEN) || '',
  refreshToken: () => localStorage.getItem(K_REFRESH) || '',

  user() {
    try { return JSON.parse(localStorage.getItem(K_USER) || 'null') } catch { return null }
  },

  /** Sau khi đăng nhập thành công. */
  save({ token, refreshToken, user }) {
    localStorage.setItem(K_TOKEN, token)
    if (refreshToken) localStorage.setItem(K_REFRESH, refreshToken)
    if (user) localStorage.setItem(K_USER, JSON.stringify(user))
  },

  /** Sau khi gia hạn token. */
  update(token, refreshToken) {
    localStorage.setItem(K_TOKEN, token)
    if (refreshToken) localStorage.setItem(K_REFRESH, refreshToken)
  },

  clear() {
    localStorage.removeItem(K_TOKEN)
    localStorage.removeItem(K_REFRESH)
    localStorage.removeItem(K_USER)
  },

  isLoggedIn() { return !!localStorage.getItem(K_TOKEN) },
}
