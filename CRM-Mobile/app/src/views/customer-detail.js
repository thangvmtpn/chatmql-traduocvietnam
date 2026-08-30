/**
 * customer-detail.js — Hồ sơ khách (Đợt 2): tab Thông tin + Ghi chú nhanh.
 *
 * Bản mẫu đã vẽ sẵn markup; ở đây chỉ đổ dữ liệu thật từ
 * GET /orders/customer-profile và GET /notes. Tab "Tạo đơn" do order-form.js
 * đảm nhiệm; tab "Tài liệu bán hàng" thuộc Đợt 3, tạm chạy demo.
 */
import { api } from '../lib/api.js'
import { initOrderForm } from './order-form.js'
import { initSalesDocs, resetSalesDocs } from './tools.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

let conv = null          // hội thoại đang xem
let loadedForConv = null // chống nạp lại khi mở đi mở lại cùng hội thoại

export function setDetailConversation(c) { conv = c }

function fmtDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtMoney(v) {
  return v == null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + 'đ'
}

/** Điền ô .crm-field / .crm-stat theo NHÃN — bền hơn bám thứ tự DOM. */
function setByLabel(rootSel, label, value, cls = '.crm-field') {
  const el = [...document.querySelectorAll(`${rootSel} ${cls}`)]
    .find(f => f.querySelector('span')?.textContent.trim() === label)
  if (el) el.querySelector('b').textContent = value ?? '—'
}

async function loadProfile() {
  if (!conv || loadedForConv === conv.id) return
  loadedForConv = conv.id

  // Header hồ sơ
  const name = conv.contact?.crmName || conv.contact?.fullName || conv.displayName || 'Không tên'
  const head = document.querySelector('#view-detail .appbar__title')
  if (head) head.textContent = name
  const sub = head?.nextElementSibling
  const av = document.querySelector('#view-detail .chat-peer__avatar')
  if (av) {
    const p = name.trim().split(/\s+/)
    av.textContent = (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase()
  }

  let profile = null
  try {
    profile = await api.get(`/api/v1/orders/customer-profile?conversationId=${encodeURIComponent(conv.id)}`)
  } catch (e) {
    // 400 = khách chưa có SĐT — hồ sơ CRM trống nhưng vẫn tạo đơn được
    // (form sẽ hỏi SĐT); các tab khác vẫn dùng bình thường.
    if (sub) sub.textContent = e.status === 400
      ? 'Chưa có SĐT — chưa nối được hồ sơ CRM'
      : 'Không tải được hồ sơ: ' + e.message
    // XOÁ SẠCH số liệu mẫu — không dọn thì màn hình hiện mã KH031245 và người
    // phụ trách của bản demo, nhân viên sẽ tưởng là dữ liệu thật của khách này.
    document.querySelectorAll('#panel-info .crm-stat b').forEach(b => { b.textContent = '—' })
    document.querySelectorAll('#panel-info .crm-field b').forEach(b => { b.textContent = '—' })
    document.querySelectorAll('#panel-info .info-row .val').forEach(v => { v.textContent = 'Chưa có' })
    initOrderForm(conv, null)
    initSalesDocs(conv.id)
    loadNotes()
    return
  }

  const crm = profile.crm || {}
  if (sub) sub.textContent =
    `${crm.customer_code ? crm.customer_code + ' · ' : ''}SĐT: ${profile.phone || '—'}`

  // 4 ô thống kê
  setByLabel('#panel-info', 'Lịch bán hàng', fmtDate(crm.next_sales_at), '.crm-stat')
  setByLabel('#panel-info', 'Lịch chăm sóc', fmtDate(crm.next_care_at), '.crm-stat')
  setByLabel('#panel-info', 'Số đơn', String(crm.order_count ?? profile.orders?.length ?? 0), '.crm-stat')
  const noteLines = (crm.profile_note || '').split('\n').filter(l => /ngày \d/.test(l)).length
  setByLabel('#panel-info', 'Ghi chú', String(noteLines), '.crm-stat')

  // Lưới thông tin CRM
  setByLabel('#panel-info', 'Mã khách hàng', crm.customer_code)
  setByLabel('#panel-info', 'Số điện thoại', profile.phone)
  setByLabel('#panel-info', 'SĐT liên hệ khác', crm.phone2)
  setByLabel('#panel-info', 'Người phụ trách', crm.staff_in_charge)
  setByLabel('#panel-info', 'Điểm', String(crm.diem ?? 0))
  setByLabel('#panel-info', 'Nghề nghiệp', crm.occupation)
  setByLabel('#panel-info', 'Nguồn khách hàng', crm.referral_source || conv.contact?.source)
  setByLabel('#panel-info', 'Địa chỉ', crm.address)
  setByLabel('#panel-info', 'Địa chỉ 2', crm.address2)

  // Thông tin tuỳ chỉnh
  const infoRows = [...document.querySelectorAll('#panel-info .info-row')]
  const setInfo = (label, value) => {
    const r = infoRows.find(x => x.querySelector('.lbl')?.textContent.trim() === label)
    if (r) r.querySelector('.val').textContent = value || 'Chưa có'
  }
  setInfo('Thích dùng hàng', crm.thich_dung_hang)
  setInfo('Ngày sinh nhật', crm.birthday ? fmtDate(crm.birthday) : '')
  setInfo('Bạn bè Zalo', '')   // API chưa trả trường này — để "Chưa có" thay vì số giả

  // GMV hiện thêm vào ô Điểm? Không — thêm dòng tổng chi tiêu nếu có chỗ:
  setByLabel('#panel-info', 'Điểm', `${crm.diem ?? 0} · GMV ${fmtMoney(crm.gmv_total)}`)

  initOrderForm(conv, profile)
  initSalesDocs(conv.id)
  loadNotes()
}

async function loadNotes() {
  const list = document.getElementById('notesList')
  const empty = document.getElementById('notesEmpty')
  if (!list) return
  try {
    const d = await api.get(`/api/v1/notes?conversationId=${encodeURIComponent(conv.id)}`)
    const notes = d.notes || []
    empty && (empty.hidden = notes.length > 0)
    list.innerHTML = notes.map(n => `
      <div class="pd-note" style="border:1px solid #f1f5f9; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
          <span class="pd-note-tag" style="background:#f0fdf4; color:#15803d; font-size:10.5px;
            font-weight:700; border-radius:4px; padding:1px 7px;">${esc(n.status || 'Ghi chú')}</span>
          <span style="font-size:10.5px; color:#94a3b8;">${esc(fmtDate(n.createdAt))}${n.authorName ? ' · ' + esc(n.authorName) : ''}</span>
        </div>
        <div style="font-size:12.5px; color:#334155; line-height:1.5; white-space:pre-wrap;">${esc(n.content || '')}</div>
      </div>`).join('')
  } catch (e) {
    list.innerHTML = `<div style="color:#b91c1c; font-size:12.5px;">${esc(e.message)}</div>`
  }
}

function wireNoteForm() {
  const panel = document.getElementById('panel-notes')
  if (!panel || panel.dataset.wired) return
  panel.dataset.wired = '1'

  const ta = panel.querySelector('textarea')
  const sel = panel.querySelector('select')
  const btn = panel.querySelector('.pd-note-submit, button')
  if (!ta || !btn) return

  // Nạp danh sách trạng thái tương tác thật cho select (nếu mẫu có)
  if (sel) {
    api.get('/api/v1/notes/statuses').then(d => {
      const sts = d.statuses || []
      if (sts.length) sel.innerHTML = sts.map(st =>
        `<option value="${esc(st.value ?? st)}">${esc(st.label ?? st)}</option>`).join('')
    }).catch(() => { /* giữ options mẫu */ })
  }

  const clean = btn.cloneNode(true)
  btn.replaceWith(clean)
  clean.addEventListener('click', async () => {
    const content = ta.value.trim()
    if (!content) { alert('Chưa nhập nội dung ghi chú.'); return }
    clean.disabled = true
    try {
      await api.post('/api/v1/notes', {
        conversationId: conv.id,
        contactId: conv.contact?.id || undefined,
        content,
        status: sel?.value || undefined,
      })
      ta.value = ''
      loadNotes()
    } catch (e) {
      alert('Không lưu được: ' + e.message)
    } finally {
      clean.disabled = false
    }
  })
}

export function mountCustomerDetail() {
  // Bản mẫu tự điều hướng (navOpen). Ta chỉ cần biết LÚC NÀO view-detail hiện
  // ra để đổ dữ liệu — nghe click ở các nút mở hồ sơ, không phá handler mẫu.
  const triggers = ['#btnOpenDetail', '#btnGoOrder', '#btnViewHistory']
  document.addEventListener('click', (e) => {
    if (triggers.some(sel => e.target.closest(sel)) ||
        e.target.closest('[data-open-detail]')) {
      // Chờ mẫu điều hướng xong rồi mới đổ dữ liệu.
      setTimeout(loadProfile, 80)
    }
    // Hàng nút nhanh trong chat ("Tạo đơn", "Thông tin", "Ghi chú"…) của mẫu
    // cũng mở view-detail — nhận diện theo hành vi: view-detail vừa mở.
  })

  // Lưới an toàn: view-detail hiện ra bằng bất kỳ đường nào cũng nạp dữ liệu.
  const view = document.getElementById('view-detail')
  if (view) {
    new MutationObserver(() => {
      if (view.classList.contains('view--open') || view.style.transform === '' ) loadProfile()
    }).observe(view, { attributes: true, attributeFilter: ['class', 'style'] })
  }

  wireNoteForm()
}

/** Cho phép đổi hội thoại: mở khách khác thì nạp lại. */
export function resetDetailCache() { loadedForConv = null; resetSalesDocs() }
