/**
 * login.js — màn đăng nhập (bản mẫu KHÔNG có màn này, phải dựng mới).
 *
 * Hoạt động như một cổng chặn: chưa có phiên thì phủ toàn màn hình, đăng nhập
 * xong gỡ ra và app hiện như bản mẫu. Style bám theo ngôn ngữ thị giác của
 * bản mẫu (nền --bg, nút --primary, bo góc 12px).
 */
import { api, ApiError } from '../lib/api.js'
import { session } from '../lib/session.js'

export function mountLoginGate(onLoggedIn) {
  if (session.isLoggedIn()) { onLoggedIn(); return }

  const root = document.createElement('div')
  root.id = 'login-gate'
  root.innerHTML = `
    <style>
      #login-gate{position:fixed; inset:0; z-index:999; background:#f6f8fa;
        display:flex; align-items:center; justify-content:center; padding:24px;}
      .lg-card{width:100%; max-width:360px; background:#fff; border-radius:16px;
        padding:28px 22px; box-shadow:0 8px 30px rgba(15,23,42,.08);}
      .lg-logo{text-align:center; margin-bottom:6px; font-size:34px;}
      .lg-title{text-align:center; font-size:17px; font-weight:800; color:#0f172a;}
      .lg-sub{text-align:center; font-size:12.5px; color:#64748b; margin:4px 0 20px;}
      .lg-label{font-size:12.5px; font-weight:600; color:#334155; margin:12px 0 5px; display:block;}
      .lg-input{width:100%; box-sizing:border-box; border:1.5px solid #e2e8f0; border-radius:12px;
        padding:12px 14px; font-size:15px; outline:none; background:#f8fafc;}
      .lg-input:focus{border-color:var(--primary,#0D6838); background:#fff;}
      .lg-btn{width:100%; margin-top:18px; border:none; border-radius:12px; padding:13px;
        font-size:15px; font-weight:700; color:#fff; background:var(--primary,#0D6838); cursor:pointer;}
      .lg-btn:disabled{opacity:.6;}
      .lg-err{min-height:18px; font-size:12.5px; color:#b91c1c; margin-top:10px; text-align:center;}
    </style>
    <form class="lg-card" id="lg-form">
      <div class="lg-logo">🍃</div>
      <div class="lg-title">Trà Dược Việt Nam</div>
      <div class="lg-sub">ChatMQL bản điện thoại</div>
      <label class="lg-label" for="lg-email">Email</label>
      <input class="lg-input" id="lg-email" type="email" autocomplete="username"
             inputmode="email" placeholder="ten@traduoc.ai" required>
      <label class="lg-label" for="lg-pass">Mật khẩu</label>
      <input class="lg-input" id="lg-pass" type="password"
             autocomplete="current-password" placeholder="••••••••" required>
      <button class="lg-btn" id="lg-submit" type="submit">Đăng nhập</button>
      <div class="lg-err" id="lg-err"></div>
    </form>`
  document.body.appendChild(root)

  const form = root.querySelector('#lg-form')
  const err = root.querySelector('#lg-err')
  const btn = root.querySelector('#lg-submit')

  form.onsubmit = async (e) => {
    e.preventDefault()
    err.textContent = ''
    btn.disabled = true
    btn.textContent = 'Đang đăng nhập…'
    try {
      const d = await api.post('/api/v1/auth/login', {
        email: root.querySelector('#lg-email').value.trim(),
        password: root.querySelector('#lg-pass').value,
      })
      session.save(d)
      root.remove()
      onLoggedIn()
    } catch (ex) {
      // 401 từ backend là "sai tài khoản/mật khẩu" — nói thẳng như vậy,
      // đừng hiện "Unauthorized" tiếng Anh cho nhân viên bán trà.
      err.textContent = ex instanceof ApiError && ex.status === 401
        ? 'Email hoặc mật khẩu chưa đúng.'
        : (ex.message || 'Không đăng nhập được, thử lại giúp em.')
      btn.disabled = false
      btn.textContent = 'Đăng nhập'
    }
  }
}

/** Đăng xuất — gọi từ màn Cá nhân (nối ở Đợt 4, để sẵn từ giờ). */
export function logout() {
  session.clear()
  location.reload()
}
