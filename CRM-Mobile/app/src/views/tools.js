/**
 * tools.js — Đợt 3: Tài liệu bán hàng · Kho lưu trữ · AI.
 *
 * Bốn khối, đều đổ dữ liệu thật vào markup có sẵn của bản mẫu:
 *   1. panel-sales  — kho nội dung ĐÃ DUYỆT để gửi cho khách (GET/POST /library)
 *   2. view-library — những gì ĐÃ trao đổi trong hội thoại (conversation-library)
 *   3. aiModal      — Customer 360 (POST /ai/customer-360) + lưu vào ghi chú
 *   4. menu ⋯       — chế độ AI trả lời thật + xoá hội thoại thật
 *   5. chip AI Gợi ý — POST /ai/suggest, nhân viên chọn nháp rồi mới gửi
 */
import { api, API_BASE } from '../lib/api.js'
import { getCurrentConversation } from './chat.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const absUrl = (u) => !u ? '' : (u.startsWith('http') ? u : API_BASE + u)

// ══════════════════ 1. TÀI LIỆU BÁN HÀNG ══════════════════
const SD_KIND = { 'sd-images': 'image', 'sd-content': 'content', 'sd-video': 'video' }
let sdLoadedFor = null

const SD_BG = ['linear-gradient(135deg,#dcfce7,#bbf7d0)', 'linear-gradient(135deg,#e0f2fe,#bae6fd)',
  'linear-gradient(135deg,#fef3c7,#fde68a)', 'linear-gradient(135deg,#f3e8ff,#e9d5ff)']

export async function initSalesDocs(convId) {
  if (sdLoadedFor === convId) return
  sdLoadedFor = convId

  for (const [pid, kind] of Object.entries(SD_KIND)) {
    const panel = document.getElementById(pid)
    if (!panel) continue

    let groups = []
    try {
      const d = await api.get(`/api/v1/library?kind=${kind}`)
      groups = d.groups || []
    } catch { /* render rỗng */ }

    // Giữ ô tìm kiếm + nút gửi của mẫu; thay phần thân giữa hai thứ đó.
    panel.querySelectorAll('.sd__group, .sd__grid, .sd-content, .sd__empty-real').forEach(el => el.remove())
    const sendWrap = panel.querySelector('.sd__send-wrap')
    let bg = 0
    let html = ''

    if (kind === 'content') {
      const items = groups.flatMap(g => g.items)
      html = items.map(it => `
        <div class="sd-content" style="border:1px solid #f1f5f9; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:5px;">
            <div style="flex:1; min-width:0; font-size:12.5px; font-weight:700; color:#1e293b;">${esc(it.title)}</div>
            <button type="button" class="sd-copy" style="border:1px solid #e2e8f0; background:#fff; color:#475569;
              font-size:11px; font-weight:600; padding:4px 9px; border-radius:6px;">📋 Copy</button>
          </div>
          <div class="sd-copy-text" style="font-size:12px; color:#475569; line-height:1.55; white-space:pre-line;
            max-height:110px; overflow:hidden;">${esc(it.text || '')}</div>
        </div>`).join('')
        || '<div class="sd__empty-real" style="text-align:center; color:#94a3b8; font-size:12.5px; padding:20px 0;">Chưa có bài nào được duyệt.</div>'
    } else {
      for (const g of groups) {
        html += `<div class="sd__group">📁 ${esc(g.name)}</div><div class="sd__grid">`
        for (const it of g.items) {
          const url = absUrl(it.url)
          // data-name/data-code giữ nguyên để hàm tìm kiếm sdFilter CỦA MẪU
          // tiếp tục hoạt động trên tile thật.
          html += `
            <label class="sd-tile${url ? ' sd-tile--img' : ''}" style="background:${SD_BG[bg++ % SD_BG.length]}; overflow:hidden; position:relative;">
              <input type="checkbox" data-id="${esc(it.id)}" data-name="${esc(it.title)}" data-code="${esc(it.code || '')}">
              ${url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer"
                 style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                 onerror="this.remove()">` : ''}
              <span class="sd-tile__emoji" ${url ? 'style="display:none"' : ''}>${kind === 'video' ? '🎬' : '🍵'}</span>
              <span class="sd-tile__name" style="${url ? 'position:absolute; left:4px; right:4px; bottom:4px; background:rgba(0,0,0,.55); color:#fff; border-radius:4px; padding:1px 4px; z-index:1;' : ''}">${esc(it.title)}</span>
            </label>`
        }
        html += '</div>'
      }
      if (!html) html = '<div class="sd__empty-real" style="text-align:center; color:#94a3b8; font-size:12.5px; padding:20px 0;">Chưa có tài liệu nào.</div>'
    }

    if (sendWrap) sendWrap.insertAdjacentHTML('beforebegin', html)
    else panel.insertAdjacentHTML('beforeend', html)

    // Nút copy (tab content)
    panel.querySelectorAll('.sd-copy').forEach(btn => {
      btn.onclick = async () => {
        const text = btn.closest('.sd-content').querySelector('.sd-copy-text').textContent
        try { await navigator.clipboard.writeText(text); btn.textContent = '✓ Đã copy' }
        catch { alert('Trình duyệt chặn copy — bôi đen thủ công giúp em.') }
        setTimeout(() => { btn.textContent = '📋 Copy' }, 1500)
      }
    })

    // Nút gửi thật — thay node gỡ demo. Máy chủ tự nạp lại nội dung từ nguồn,
    // client chỉ được nói "gửi mục nào".
    const oldBtn = panel.querySelector('.sd__send-btn')
    if (oldBtn) {
      const btn = oldBtn.cloneNode(true)
      oldBtn.replaceWith(btn)
      btn.onclick = async () => {
        const conv = getCurrentConversation()
        if (!conv) { alert('Mở một hội thoại trước đã.'); return }
        const ids = [...panel.querySelectorAll('.sd-tile input:checked')].map(i => i.dataset.id)
        if (!ids.length) return
        btn.disabled = true
        btn.textContent = 'Đang gửi…'
        try {
          const d = await api.post('/api/v1/library/send', { conversationId: conv.id, itemIds: ids })
          const skipped = (d.skipped || []).length
          btn.textContent = skipped ? `✓ Gửi ${(d.created || []).length}, bỏ qua ${skipped}` : `✓ Đã gửi ${(d.created || []).length}`
          panel.querySelectorAll('.sd-tile input:checked').forEach(i => { i.checked = false })
        } catch (e) {
          alert('Không gửi được: ' + e.message)
          btn.textContent = '📤 Gửi vào chat (0)'
        } finally {
          btn.disabled = false
          setTimeout(() => { btn.textContent = '📤 Gửi vào chat (0)'; btn.disabled = true }, 1800)
        }
      }
    }
  }
}
export function resetSalesDocs() { sdLoadedFor = null }

// ══════════════════ 2. KHO LƯU TRỮ ══════════════════
const LIB_KIND = { 'lib-media': 'media', 'lib-files': 'file', 'lib-links': 'link' }
let libLoadedFor = null

function libDay(iso) {
  const d = new Date(iso)
  return isNaN(d) ? 'Không rõ ngày' : `Ngày ${d.getDate()} Tháng ${d.getMonth() + 1}`
}

async function loadLibrary() {
  const conv = getCurrentConversation()
  if (!conv || libLoadedFor === conv.id) return
  libLoadedFor = conv.id

  for (const [pid, kind] of Object.entries(LIB_KIND)) {
    const panel = document.getElementById(pid)
    if (!panel) continue
    panel.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12.5px; padding:22px 0;">Đang tải…</div>'
    try {
      const d = await api.get(`/api/v1/orders/conversation-library?conversationId=${encodeURIComponent(conv.id)}&kind=${kind}`)
      const groups = d.groups || []
      if (!groups.length) {
        panel.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12.5px; padding:22px 0;">Chưa có gì trong mục này.</div>'
        continue
      }
      panel.innerHTML = groups.map(g => {
        const head = `<div class="lib__date" style="font-size:12px; font-weight:700; color:#334155; margin:12px 0 6px;">${esc(libDay(g.date))}</div>`
        if (kind === 'media') {
          return head + `<div class="lib__grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">` +
            g.items.map(it => `
              <a class="lib__tile" href="${esc(absUrl(it.url))}" target="_blank" rel="noreferrer"
                 style="aspect-ratio:1; border-radius:8px; overflow:hidden; position:relative; background:#f1f5f9; display:flex; align-items:center; justify-content:center;">
                <img src="${esc(absUrl(it.url))}" alt="" referrerpolicy="no-referrer"
                     style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" onerror="this.remove()">
                <span>🖼️</span>
              </a>`).join('') + '</div>'
        }
        return head + g.items.map(it => `
          <a href="${esc(absUrl(it.url))}" target="_blank" rel="noreferrer"
             style="display:flex; gap:9px; align-items:center; padding:9px 10px; border:1px solid #f1f5f9;
             border-radius:10px; margin-bottom:6px; text-decoration:none;">
            <span>${kind === 'file' ? '📄' : '🔗'}</span>
            <span style="min-width:0;">
              <span style="display:block; font-size:12.5px; font-weight:600; color:#0f172a; overflow:hidden;
                text-overflow:ellipsis; white-space:nowrap;">${esc(it.title || it.url)}</span>
              <span style="display:block; font-size:11px; color:#94a3b8;">${esc(it.sender || '')}</span>
            </span>
          </a>`).join('')
      }).join('')
    } catch (e) {
      panel.innerHTML = `<div style="color:#b91c1c; font-size:12.5px; padding:14px;">${esc(e.message)}</div>`
    }
  }
}
export function resetLibrary() { libLoadedFor = null }

// ══════════════════ 3. CUSTOMER 360 ══════════════════
function wireCustomer360() {
  const oldBtn = document.getElementById('btnAiAnalyze')
  if (!oldBtn) return
  const btn = oldBtn.cloneNode(true)
  oldBtn.replaceWith(btn)

  btn.addEventListener('click', async () => {
    const conv = getCurrentConversation()
    if (!conv) { alert('Mở một hội thoại trước đã.'); return }
    const bg = document.getElementById('aiModalBg')
    const loading = document.getElementById('aiLoading')
    const result = document.getElementById('aiResult')
    const noteBtn = document.getElementById('btnAiToNote')
    bg.classList.add('open')
    loading.hidden = false
    result.hidden = true
    noteBtn.disabled = true

    try {
      const d = await api.post('/api/v1/ai/customer-360', { conversationId: conv.id })
      const block = (icon, title, body) => `
        <div class="ai-block"><div class="ai-block__title">${icon} ${title}</div>${body}</div>`
      result.innerHTML =
        (!d.aiAvailable ? `<div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:8px;
            padding:8px 10px; font-size:11.5px; color:#92400e; margin-bottom:10px;">
            Phần AI chưa chạy được — chân dung bên dưới vẫn đúng vì lấy từ dữ liệu CRM thật.</div>` : '') +
        block('👤', 'Chân dung khách hàng',
          `<ul style="margin:0; padding-left:17px;">${(d.portrait || []).map(p => `<li style="margin-bottom:3px;">${esc(p)}</li>`).join('')}</ul>`) +
        (d.summary ? block('💬', 'Tóm tắt hội thoại', esc(d.summary)) : '') +
        (d.opportunity ? block('🎯', 'Cơ hội', esc(d.opportunity)) : '') +
        ((d.actions || []).length ? block('✅', 'Đề xuất hành động',
          `<ol style="margin:0; padding-left:19px;">${d.actions.map(a => `<li style="margin-bottom:4px;">${esc(a)}</li>`).join('')}</ol>`) : '') +
        `<div class="ai-modal__time" id="aiTime">Phân tích lúc: ${new Date(d.generatedAt || Date.now()).toLocaleString('vi-VN')}${d.fromCache ? ' (dùng lại kết quả gần đây)' : ''}</div>`
      loading.hidden = true
      result.hidden = false

      // Lưu vào ghi chú — chỉ bật khi AI thật sự có nội dung.
      if (d.aiAvailable && (d.summary || (d.actions || []).length)) {
        noteBtn.disabled = false
        noteBtn.onclick = async () => {
          noteBtn.disabled = true
          try {
            await api.post('/api/v1/notes', {
              conversationId: conv.id,
              contactId: conv.contact?.id || undefined,
              content: `[Customer 360]\n${d.summary || ''}\n\nCơ hội: ${d.opportunity || '—'}\n\nHành động:\n${(d.actions || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
            })
            noteBtn.textContent = '✓ Đã lưu vào ghi chú'
          } catch (e) {
            alert('Không lưu được: ' + e.message)
            noteBtn.disabled = false
          }
        }
      }
    } catch (e) {
      loading.hidden = true
      result.hidden = false
      result.innerHTML = `<div style="color:#b91c1c; font-size:13px;">${esc(e.message)}</div>`
    }
  })
}

// ══════════════════ 4. CHẾ ĐỘ AI + XOÁ HỘI THOẠI ══════════════════
/** Đồng bộ dấu ✓ trong menu theo hội thoại đang mở — gọi từ chat.js. */
export function syncAiMenu(aiMode) {
  document.querySelectorAll('.cmm-ai').forEach(b =>
    b.classList.toggle('cmm-ai--active', b.dataset.ai === (aiMode || 'manual')))
}

function wireAiModeMenu() {
  document.querySelectorAll('.cmm-ai').forEach(btn => {
    // Mẫu đã đổi class active + đóng menu; ta chỉ thêm phần gọi API thật.
    btn.addEventListener('click', async () => {
      const conv = getCurrentConversation()
      if (!conv) return
      try {
        await api.patch(`/api/v1/conversations/${conv.id}/ai-mode`, { aiMode: btn.dataset.ai })
        conv.aiMode = btn.dataset.ai
      } catch (e) {
        alert('Không đổi được chế độ AI: ' + e.message)
        syncAiMenu(conv.aiMode) // trả dấu ✓ về đúng hiện trạng
      }
    })
  })

  const oldDel = document.getElementById('btnDeleteConv')
  if (oldDel) {
    const del = oldDel.cloneNode(true)
    oldDel.replaceWith(del)
    del.addEventListener('click', async () => {
      document.getElementById('chatMoreMenu').hidden = true
      const conv = getCurrentConversation()
      if (!conv) return
      const name = conv.contact?.fullName || conv.displayName || 'hội thoại này'
      if (!confirm(`Xóa toàn bộ hội thoại với "${name}"?\nHành động này không thể hoàn tác.`)) return
      try {
        await api.del(`/api/v1/conversations/${conv.id}`)
        alert('Đã xóa hội thoại.')
        window.navBack?.('view-chat')
      } catch (e) {
        // member sẽ bị backend chặn 403 — hiện đúng thông điệp của máy chủ.
        alert(e.message)
      }
    })
  }
}

// ══════════════════ 5. AI GỢI Ý ══════════════════
function wireSuggestChip() {
  const chip = [...document.querySelectorAll('#view-chat .tool-chip')]
    .find(b => b.textContent.trim() === 'AI Gợi ý')
  if (!chip) return
  const clean = chip.cloneNode(true)
  chip.replaceWith(clean)

  clean.addEventListener('click', async () => {
    const conv = getCurrentConversation()
    if (!conv) return
    document.getElementById('suggestSheet')?.remove()
    const sheet = document.createElement('div')
    sheet.id = 'suggestSheet'
    sheet.style.cssText = `position:fixed; left:0; right:0; bottom:0; z-index:400; background:#fff;
      border-radius:16px 16px 0 0; box-shadow:0 -10px 30px rgba(15,23,42,.18); padding:14px 16px 22px;
      max-height:60vh; overflow:auto;`
    sheet.innerHTML = `<div style="font-size:13.5px; font-weight:800; color:#0f172a; margin-bottom:10px;">
        💡 AI gợi ý trả lời <span style="float:right; cursor:pointer; color:#94a3b8;" id="sgClose">✕</span></div>
      <div id="sgBody" style="color:#94a3b8; font-size:12.5px;">Đang soạn gợi ý…</div>`
    document.body.appendChild(sheet)
    sheet.querySelector('#sgClose').onclick = () => sheet.remove()

    try {
      const d = await api.post('/api/v1/ai/suggest', { conversationId: conv.id })
      const TONE = { concise: 'Ngắn gọn', friendly: 'Thân thiện', persuasive: 'Thuyết phục', detailed: 'Chi tiết', professional: 'Chuyên nghiệp' }
      sheet.querySelector('#sgBody').innerHTML = (d.suggestions || []).map(s => `
        <button type="button" data-text="${esc(s.text)}" style="display:block; width:100%; text-align:left;
          border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; padding:10px 12px;
          margin-bottom:8px; font-size:12.5px; color:#334155; line-height:1.5;">
          <b style="color:#0D6838;">${esc(TONE[s.tone] || s.tone || 'Gợi ý')}</b><br>${esc(s.text)}
        </button>`).join('')
        || '<div>AI chưa soạn được gợi ý cho hội thoại này.</div>'
      // Chọn nháp → điền vào ô nhập để nhân viên ĐỌC LẠI rồi tự gửi.
      // Không bao giờ tự gửi thay người.
      sheet.querySelectorAll('[data-text]').forEach(b => {
        b.onclick = () => {
          const input = document.getElementById('chatInput')
          if (input) { input.value = b.dataset.text; input.focus() }
          sheet.remove()
        }
      })
    } catch (e) {
      sheet.querySelector('#sgBody').innerHTML = `<div style="color:#b91c1c;">${esc(e.message)}</div>`
    }
  })
}

export function mountTools() {
  wireCustomer360()
  wireAiModeMenu()
  wireSuggestChip()
  document.getElementById('btnChatLibrary')?.addEventListener('click', loadLibrary)
}
