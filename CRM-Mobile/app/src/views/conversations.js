/**
 * conversations.js — màn Hội thoại nối dữ liệu THẬT (Đợt 1).
 *
 * Chiếm quyền #convList, ô tìm kiếm và 4 chip lọc từ bản mẫu; giữ nguyên
 * markup/class của mẫu để CSS không phải sửa. Bản mẫu render dữ liệu giả vào
 * đúng các nút này lúc nạp — ta thay node bằng bản sao để gỡ sạch listener demo
 * rồi render đè.
 */
import { api } from '../lib/api.js'
import { onConversationsChanged } from '../lib/socket.js'
import { openChat } from './chat.js'

const PAGE_SIZE = 30

// 4 chip của bản mẫu theo đúng thứ tự → tham số API tương ứng.
// "Của tôi" dùng assignedTo=me (tham số đã bổ sung ở backend đợt trước).
const CHIP_FILTERS = [
  {},                     // Tất cả
  { unread: 'true' },     // Chưa đọc
  { assignedTo: 'me' },   // Của tôi
  { unreplied: 'true' },  // Chưa trả lời
]

const state = {
  items: [],
  page: 1,
  total: 0,
  chip: 0,
  search: '',
  loading: false,
}

const AV_COLORS = ['#16a34a', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#0d9488']
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function initials(name) {
  const p = String(name || '?').trim().split(/\s+/)
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase()
}

/** Màu avatar ổn định theo id — cùng người luôn cùng màu, khác reload vẫn vậy. */
function colorOf(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso), diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m}p`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function previewOf(c) {
  const m = c.messages?.[0]
  if (!m) return ''
  if (m.isDeleted) return 'Tin nhắn đã thu hồi'
  if (m.contentType === 'image') return '📷 Hình ảnh'
  if (m.contentType === 'file') return '📄 Tệp đính kèm'
  if (m.contentType === 'sticker') return '💟 Sticker'
  if (m.contentType === 'birthday_notification') return '🎂 Thông báo sinh nhật'
  // content ảnh/hệ thống đôi khi là JSON — không phơi chuỗi thô ra danh sách
  const t = String(m.content || '')
  if (t.startsWith('{')) return '📎 Nội dung đính kèm'
  return t
}

function nameOf(c) {
  return c.contact?.crmName || c.contact?.fullName || c.displayName || 'Không tên'
}

function render(listEl, { append = false } = {}) {
  const html = state.items.map(c => `
    <div class="conv-item" data-id="${esc(c.id)}">
      <div class="conv-item__avatar" style="background:${colorOf(c.id)};">${esc(initials(nameOf(c)))}</div>
      <div class="conv-item__body">
        <div class="conv-item__top">
          <span class="conv-item__name">${esc(nameOf(c))}</span>
          <span class="conv-item__time">${esc(timeAgo(c.lastMessageAt))}</span>
        </div>
        <div class="conv-item__preview">${esc(previewOf(c))}</div>
        <div class="conv-item__source"><span class="zalo-ic">Z</span><span>${esc(c.channelAccount?.displayName || '')}</span></div>
      </div>
      ${c.unreadCount ? `<span class="conv-item__unread">${c.unreadCount > 9 ? '9+' : c.unreadCount}</span>` : ''}
    </div>`).join('')

  const more = state.items.length < state.total
    ? `<button id="convMore" style="display:block; margin:10px auto 16px; border:1px solid #e2e8f0;
         background:#fff; color:#475569; font-size:13px; font-weight:600; padding:9px 22px;
         border-radius:20px;">Tải thêm (${state.total - state.items.length})</button>`
    : ''

  const empty = !state.items.length && !state.loading
    ? `<div style="text-align:center; color:#94a3b8; font-size:13px; padding:34px 0;">
         Không có hội thoại nào${state.chip === 2 ? ' được gán cho bạn' : ''}.</div>`
    : ''

  listEl.innerHTML = html + more + empty
  void append
}

async function load(listEl, { append = false } = {}) {
  if (state.loading) return
  state.loading = true
  if (!append) listEl.innerHTML =
    '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Đang tải…</div>'
  try {
    const q = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(state.page), ...CHIP_FILTERS[state.chip] })
    if (state.search) q.set('search', state.search)
    const d = await api.get(`/api/v1/conversations?${q}`)
    state.total = d.total ?? 0
    state.items = append ? [...state.items, ...(d.conversations || [])] : (d.conversations || [])
    render(listEl, { append })
  } catch (e) {
    listEl.innerHTML = `<div style="text-align:center; color:#b91c1c; font-size:13px; padding:30px 0;">${esc(e.message)}</div>`
  } finally {
    state.loading = false
  }
}

export function mountConversations() {
  // Thay node để gỡ mọi listener demo của bản mẫu.
  const old = document.getElementById('convList')
  const listEl = old.cloneNode(false)
  old.replaceWith(listEl)

  listEl.addEventListener('click', (e) => {
    const more = e.target.closest('#convMore')
    if (more) { state.page++; load(listEl, { append: true }); return }
    const item = e.target.closest('.conv-item')
    if (!item) return
    const c = state.items.find(x => x.id === item.dataset.id)
    if (c) openChat(c, () => load(listEl)) // quay lại thì làm mới danh sách (đã đọc → mất badge)
  })

  // 4 chip lọc — dùng lại đúng các nút của mẫu trong màn Hội thoại.
  const chips = [...document.querySelectorAll('#home-chats .chip')]
  chips.forEach((chip, i) => {
    const clean = chip.cloneNode(true)
    chip.replaceWith(clean)
    // Backend hiện chỉ có 4 bộ lọc đầu. "Cuộc gọi nhỡ" và "Lịch hẹn" chưa có
    // API — làm mờ và báo thẳng, không để bấm vào mà danh sách chẳng đổi gì.
    if (i >= CHIP_FILTERS.length) {
      clean.style.opacity = '.45'
      clean.addEventListener('click', () => alert('Bộ lọc này sẽ có ở bản sau.'))
      return
    }
    clean.addEventListener('click', () => {
      document.querySelectorAll('#home-chats .chip').forEach(x =>
        x.classList.toggle('chip--active', x === clean))
      state.chip = i
      state.page = 1
      load(listEl)
    })
  })

  // Tìm kiếm — chờ 400ms sau khi ngừng gõ mới gọi API.
  const searchInput = document.querySelector('#home-chats input[placeholder*="Tìm"]')
  if (searchInput) {
    const clean = searchInput.cloneNode(true)
    searchInput.replaceWith(clean)
    let t
    clean.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => { state.search = clean.value.trim(); state.page = 1; load(listEl) }, 400)
    })
  }

  // Tin mới ở bất kỳ hội thoại nào → làm mới danh sách (gộp dồn 1,5s cho đỡ dội API).
  let refreshT
  onConversationsChanged(() => {
    clearTimeout(refreshT)
    refreshT = setTimeout(() => { state.page = 1; load(listEl) }, 1500)
  })

  load(listEl)
}
