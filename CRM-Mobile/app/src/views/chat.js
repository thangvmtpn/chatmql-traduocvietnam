/**
 * chat.js — màn chat chi tiết nối dữ liệu THẬT (Đợt 1).
 *
 * Đọc tin qua GET /conversations/:id/messages, gửi văn bản qua POST .../messages,
 * tin mới đến qua socket (join:conv). Dùng lại toàn bộ class bong bóng của mẫu.
 */
import { api, API_BASE } from '../lib/api.js'
import { joinConversation } from '../lib/socket.js'
import { setDetailConversation, resetDetailCache } from './customer-detail.js'
import { resetOrderFormCache } from './order-form.js'
import { syncAiMenu, resetLibrary } from './tools.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

let current = null   // { convId, leave, onBack }
let currentConv = null

/** Hội thoại đang mở — dùng cho menu AI, thư viện, gợi ý (tools.js). */
export function getCurrentConversation() { return currentConv }
const seenIds = new Set()

function hhmm(iso) {
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
function dayLabel(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Ảnh lưu content dạng JSON {href,thumb,...}; đường dẫn tương đối thì ghép API_BASE. */
function imageUrlOf(m) {
  try {
    const d = JSON.parse(m.content)
    const u = d.thumb || d.href || d.hdUrl
    if (!u) return null
    return u.startsWith('http') ? u : API_BASE + u
  } catch { return null }
}

function bubbleHtml(m) {
  // self = phía shop (nhân viên hoặc AI); contact = khách
  const sent = m.senderType === 'self' || m.senderType === 'user'
  const side = sent ? 'msg--sent' : 'msg--received'

  let inner
  if (m.isDeleted) {
    inner = `<div class="msg__bubble" style="opacity:.6; font-style:italic;">Tin nhắn đã thu hồi</div>`
  } else if (m.contentType === 'image') {
    const url = imageUrlOf(m)
    inner = url
      ? `<a href="${esc(url)}" target="_blank" rel="noreferrer"><img src="${esc(url)}" alt=""
           style="max-width:220px; border-radius:12px; display:block;"
           onerror="this.outerHTML='<div class=&quot;msg__image&quot;><span>📷 Hình ảnh (không tải được)</span></div>'"></a>`
      : `<div class="msg__image"><span>📷 Hình ảnh</span></div>`
  } else if (m.contentType === 'sticker') {
    inner = `<div style="font-size:38px;">💟</div>`
  } else {
    const raw = String(m.content || '')
    const text = raw.startsWith('{') ? '📎 Nội dung đính kèm' : raw
    inner = `<div class="msg__bubble" style="white-space:pre-wrap; overflow-wrap:anywhere;">${esc(text)}</div>`
  }

  const who = sent && m.aiGenerated ? `<div style="font-size:10px; color:#7c3aed; margin-bottom:2px;">🤖 AI</div>` : ''
  return `
    <div class="msg ${side}" data-mid="${esc(m.id)}">
      <div>${who}${inner}<div class="msg__time">${hhmm(m.sentAt)}</div></div>
    </div>`
}

function appendMessages(box, msgs) {
  // Nhóm theo ngày, chống trùng theo id (socket + tải lại có thể đưa cùng một tin).
  let html = ''
  let lastDay = box.dataset.lastDay || ''
  for (const m of msgs) {
    if (m.id && seenIds.has(m.id)) continue
    if (m.id) seenIds.add(m.id)
    const day = new Date(m.sentAt).toDateString()
    if (day !== lastDay) {
      html += `<div class="chat-messages__date">${esc(dayLabel(m.sentAt))}</div>`
      lastDay = day
    }
    html += bubbleHtml(m)
  }
  box.dataset.lastDay = lastDay
  box.insertAdjacentHTML('beforeend', `<div class="msg-wrapper">${html}</div>`)
  box.scrollTop = box.scrollHeight
}

export function openChat(conv, onBack) {
  const box = document.getElementById('chatMessages')
  const input = document.getElementById('chatInput')
  const btnSend = document.getElementById('btnSend')

  // Dọn phiên chat trước (nếu có)
  current?.leave?.()
  seenIds.clear()
  box.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:26px 0;">Đang tải tin nhắn…</div>'
  delete box.dataset.lastDay

  // Header: tên + kênh thật
  const name = conv.contact?.crmName || conv.contact?.fullName || conv.displayName || 'Không tên'
  // .chat-peer__name của mẫu = text + <span class="pipeline-chip">. Tìm đúng
  // NODE VĂN BẢN đầu tiên có chữ mà thay — childNodes[0] có thể là khoảng trắng
  // hoặc element, gán bừa thì tên không đổi (lỗi đã gặp khi kiểm chứng).
  const peerName = document.querySelector('#view-chat .chat-peer__name')
  if (peerName) {
    const short = name.length > 22 ? name.slice(0, 22) + '…' : name
    // Gỡ MỌI node tên cũ (kể cả span lồng của mẫu), chỉ giữ chip pipeline —
    // lần sửa trước chỉ prepend nên tên mẫu và tên thật hiện chồng nhau.
    ;[...peerName.childNodes].forEach(n => {
      if (!(n.nodeType === 1 && n.classList?.contains('pipeline-chip'))) n.remove()
    })
    peerName.prepend(document.createTextNode(short))
  }
  const peerMeta = document.querySelector('#view-chat .chat-peer__meta')
  if (peerMeta) peerMeta.innerHTML =
    `qua <span class="zalo-ic">Z</span> ${esc(conv.channelAccount?.displayName || '')}`
  const peerAv = document.querySelector('#view-chat .chat-peer__avatar')
  if (peerAv) {
    const p = name.trim().split(/\s+/)
    peerAv.textContent = (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase()
  }

  window.navOpen?.('view-chat')

  const convId = conv.id
  currentConv = conv
  current = { convId, onBack, leave: null }

  // Hồ sơ khách + form đơn bám theo hội thoại đang mở; đổi khách thì nạp lại.
  setDetailConversation(conv)
  resetDetailCache()
  resetOrderFormCache()
  resetLibrary()
  syncAiMenu(conv.aiMode)

  // Tải lịch sử
  api.get(`/api/v1/conversations/${convId}/messages?limit=100`)
    .then(d => {
      box.innerHTML = ''
      delete box.dataset.lastDay
      appendMessages(box, d.messages || [])
      if (!(d.messages || []).length) {
        box.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:26px 0;">Chưa có tin nhắn nào.</div>'
      }
    })
    .catch(e => {
      box.innerHTML = `<div style="text-align:center; color:#b91c1c; font-size:13px; padding:26px 0;">${esc(e.message)}</div>`
    })

  // Tin mới thời gian thực + AI đang soạn
  let typingEl = null
  current.leave = joinConversation(convId,
    (m) => appendMessages(box, [m]),
    (isTyping) => {
      typingEl?.remove()
      typingEl = null
      if (isTyping) {
        typingEl = document.createElement('div')
        typingEl.style.cssText = 'color:#7c3aed; font-size:12px; padding:6px 12px;'
        typingEl.textContent = '🤖 AI đang soạn trả lời…'
        box.appendChild(typingEl)
        box.scrollTop = box.scrollHeight
      }
    })

  // Gửi văn bản — thay node để gỡ handler demo, chỉ gắn một lần mỗi phiên chat.
  const cleanBtn = btnSend.cloneNode(true)
  btnSend.replaceWith(cleanBtn)
  const cleanInput = input.cloneNode(true)
  input.replaceWith(cleanInput)

  async function send() {
    const text = cleanInput.value.trim()
    if (!text || cleanBtn.disabled) return
    cleanBtn.disabled = true
    try {
      const d = await api.post(`/api/v1/conversations/${convId}/messages`, { content: text })
      cleanInput.value = ''
      // Backend phát socket cho tin vừa gửi; nếu chưa join kịp thì tự vẽ.
      if (d?.message) appendMessages(box, [d.message])
      // Không nối Zalo thật (môi trường local) backend vẫn lưu tin — báo nhẹ.
      if (d && d.sentViaZalo === false) {
        const note = document.createElement('div')
        note.style.cssText = 'color:#b45309; font-size:11px; text-align:right; padding:0 12px 6px;'
        note.textContent = 'Đã lưu — chưa gửi được ra Zalo (tài khoản chưa kết nối)'
        box.appendChild(note)
        box.scrollTop = box.scrollHeight
      }
    } catch (e) {
      alert('Không gửi được: ' + e.message)
    } finally {
      cleanBtn.disabled = false
      cleanInput.focus()
    }
  }
  cleanBtn.addEventListener('click', send)
  cleanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })

  // Nút quay lại của mẫu dùng data-nav-back → navBack; ta chen dọn phòng socket
  // + báo danh sách làm mới, KHÔNG phá điều hướng sẵn có.
  const backBtn = document.querySelector('#view-chat .appbar__back')
  if (backBtn && !backBtn.dataset.wiredReal) {
    backBtn.dataset.wiredReal = '1'
    backBtn.addEventListener('click', () => {
      current?.leave?.()
      current?.onBack?.()
      current = null
    })
  }
}
