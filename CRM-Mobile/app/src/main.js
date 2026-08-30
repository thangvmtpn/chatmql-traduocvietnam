/**
 * main.js — điểm vào của app.
 *
 * Trình tự: dựng cổng đăng nhập → có phiên rồi mới nạp khung giao diện bản mẫu
 * và hành vi demo. Đợt 1 trở đi sẽ thay dần từng view demo bằng dữ liệu thật;
 * cấu trúc nạp-sau-đăng-nhập này giữ nguyên suốt các đợt.
 */
import { mountLoginGate } from './views/login.js'
import { mountConversations } from './views/conversations.js'
import { mountCustomerDetail } from './views/customer-detail.js'
import { mountTools } from './views/tools.js'
import { mountHome } from './views/home.js'
import { session } from './lib/session.js'
import shellHtml from './shell.html?raw'
import mockupJs from './mockup.js?raw'

mountLoginGate(async () => {
  document.getElementById('app').innerHTML = shellHtml

  // Hành vi demo của bản mẫu (điều hướng, tab, tính tiền form đơn) viết kiểu
  // script cổ điển với hàm TOÀN CỤC — shell.html gọi chúng qua onclick inline.
  // Nạp bằng ES module thì hàm bị nhốt trong scope module và mọi onclick chết,
  // nên phải bơm như <script> thường để chạy ở global scope.
  const el = document.createElement('script')
  el.textContent = mockupJs
  document.body.appendChild(el)

  // ĐỢT 1: màn Hội thoại + chat chi tiết chạy dữ liệu THẬT — chiếm quyền
  // #convList, chip lọc, ô tìm kiếm và khung gửi tin từ bản mẫu.
  mountConversations()
  mountCustomerDetail()
  mountTools()
  mountHome()

  // Dọn phần GIẢ CỨNG của bản mẫu cho khớp phiên thật:
  // 1. Dải băng "Đang xem dưới quyền Lộc Thị Hạnh" — trong mẫu là trang trí,
  //    nhưng với người dùng thật nó là lời nói dối về trạng thái phiên. Ẩn đi;
  //    Đợt 4 nối impersonation thật mới hiện lại theo token.
  // …TRỪ khi đang xem thay quyền thật — lúc đó home.js sẽ điền nội dung thật
  // vào dải băng này. (Thứ tự chạy: mountHome hiện băng trước, khối này chạy
  // sau; không có điều kiện thì băng thật bị ẩn đè — lỗi đã gặp khi kiểm chứng.)
  if (!session.user()?.impersonatedBy) {
    document.querySelectorAll('.impersonate').forEach(el => { el.style.display = 'none' })
  }

  // 2. Avatar "LT" cứng → chữ cái đầu của người đăng nhập thật.
  const u = session.user()
  if (u?.fullName) {
    const parts = u.fullName.trim().split(/\s+/)
    const initials = (parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2)).toUpperCase()
    document.querySelectorAll('.avatar-lg, .me-avatar').forEach(el => {
      if (el.textContent.trim().length <= 2) el.textContent = initials
    })
  }
})

// ── PWA: đăng ký service worker ─────────────────────────────────────
// Chỉ ở bản build production. Bật trong dev thì cache đánh nhau với HMR của
// Vite — sửa code mà màn hình không đổi, mất thời gian đi tìm ma.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' }).catch(() => {
      /* SW hỏng thì app vẫn chạy như web thường — không chặn gì */
    })
  })
}
