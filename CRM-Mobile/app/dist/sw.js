/**
 * sw.js — service worker của TDVN Chat mobile.
 *
 * Chiến lược đơn giản có chủ đích cho một app CHAT:
 *   - /api/ và /socket.io/  → KHÔNG BAO GIỜ cache. Tin nhắn, đơn hàng, số liệu
 *     phải luôn tươi; cache API chat là nguồn lỗi "khách nhắn mà không thấy".
 *   - asset build (/m/assets/…) → cache-first: tên file có mã băm, nội dung
 *     không bao giờ đổi dưới cùng một tên nên cache vĩnh viễn là an toàn.
 *   - điều hướng trang (index.html) → network-first, rớt mạng thì trả bản
 *     cache cuối — mở app trong thang máy vẫn thấy giao diện thay vì trang lỗi.
 *
 * Đổi CACHE_VERSION khi cần ép mọi máy bỏ cache cũ.
 */
const CACHE_VERSION = 'tdvn-m-v1'
const APP_SHELL = ['/m/', '/m/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return

  // Dữ liệu động: đi thẳng mạng, không đụng cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') ||
      url.pathname.startsWith('/uploads/')) return

  // Điều hướng trang: mạng trước, rớt thì trả shell đã cache.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then(c => c.put('/m/', copy))
          return res
        })
        .catch(() => caches.match('/m/'))
    )
    return
  }

  // Asset build có mã băm: cache-first.
  if (url.pathname.startsWith('/m/')) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copy))
        }
        return res
      }))
    )
  }
})
