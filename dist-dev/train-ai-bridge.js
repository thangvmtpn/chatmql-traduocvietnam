/**
 * train-ai-bridge.js — Đưa trang "Train AI — Bộ não của trợ lý" (bản thiết kế
 * mới) vào đúng chỗ trang AI Logic Docs của ChatMQL desktop.
 *
 * VÌ SAO PHẢI LÀM KIỂU NÀY: ChatMQL desktop chỉ còn bản build, KHÔNG có mã
 * nguồn React trên máy, nên không sửa được component gốc. Cách chắc chắn và
 * gỡ được là chèn trang mới (train-ai.html) vào khung nội dung của trang cũ:
 * thanh trên + menu "Trợ lý AI" của app giữ nguyên, chỉ phần thân được thay.
 * Trang nhúng chạy cùng origin nên dùng chung phiên đăng nhập, không phải
 * đăng nhập lại.
 *
 * TẮT/BẬT (gõ trong Console của trình duyệt):
 *   window.trainAiV2(false)  → trả lại giao diện AI Logic Docs cũ
 *   window.trainAiV2(true)   → dùng lại giao diện mới
 * Lựa chọn được nhớ trong localStorage, mỗi máy tự chọn.
 */
(function () {
  'use strict'

  var ROUTE = '/ai/logic-docs'
  var SRC = '/train-ai.html?embed=1'
  var KEY = 'chatmql_train_ai_v2'
  var HOST_ID = 'trainAiV2Host'

  function enabled() { return localStorage.getItem(KEY) !== 'off' }

  function onRoute() { return location.pathname.replace(/\/+$/, '') === ROUTE }

  /** Khung nội dung của trang AI (bên phải menu "Trợ lý AI"). */
  function contentEl() {
    return document.querySelector('.ai-workspace__content')
  }

  function mount() {
    var host = contentEl()
    if (!host) return
    if (host.querySelector('#' + HOST_ID)) return

    // Ẩn phần thân cũ thay vì xoá — tắt cầu nối là hiện lại nguyên vẹn.
    Array.prototype.forEach.call(host.children, function (c) {
      if (c.id !== HOST_ID) {
        if (c.dataset.trainAiHidden === undefined) c.dataset.trainAiHidden = c.style.display || ''
        c.style.display = 'none'
      }
    })

    var frame = document.createElement('iframe')
    frame.id = HOST_ID
    frame.src = SRC
    frame.title = 'Train AI — Bộ não của trợ lý'
    // Cao theo cửa sổ (trừ thanh trên của app) thay vì cố định, để màn hình lớn
    // dùng hết chiều cao và màn hình nhỏ vẫn còn chỗ cuộn.
    frame.style.cssText = 'width:100%;height:calc(100vh - 62px);min-height:560px;border:0;display:block;background:transparent'
    host.appendChild(frame)
    host.style.minHeight = '560px'
    host.style.padding = '0'
  }

  function unmount() {
    var frame = document.getElementById(HOST_ID)
    if (frame) frame.remove()
    var host = contentEl()
    if (!host) return
    Array.prototype.forEach.call(host.children, function (c) {
      if (c.dataset.trainAiHidden !== undefined) {
        c.style.display = c.dataset.trainAiHidden
        delete c.dataset.trainAiHidden
      }
    })
  }

  function sync() {
    if (onRoute() && enabled()) mount()
    else unmount()
  }

  // React vẽ lại là mất phần chèn — theo dõi DOM và gắn lại.
  var pending = null
  function scheduleSync() {
    if (pending) return
    pending = setTimeout(function () { pending = null; sync() }, 120)
  }

  new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true })

  // Điều hướng trong SPA không bắn sự kiện — vá pushState/replaceState.
  ;['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m]
    history[m] = function () { var r = orig.apply(this, arguments); scheduleSync(); return r }
  })
  window.addEventListener('popstate', scheduleSync)

  window.trainAiV2 = function (on) {
    localStorage.setItem(KEY, on === false ? 'off' : 'on')
    sync()
    return on === false ? 'Đã trả lại giao diện AI Logic Docs cũ' : 'Đang dùng giao diện Train AI mới'
  }

  scheduleSync()
})()
