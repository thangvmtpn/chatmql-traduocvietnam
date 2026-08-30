/**
 * home.js — Đợt 4: Khách hàng · Tổng quan · Cá nhân.
 *
 *   1. home-customers — danh sách liên hệ thật (GET/POST /contacts), lọc giai
 *      đoạn, tìm kiếm, thêm khách bằng bottom-sheet của mẫu
 *   2. home-overview  — dashboard THEO VAI TRÒ (GET /dashboard/overview):
 *      nhân viên thấy số của mình, chủ thấy toàn công ty — dùng lại đúng
 *      endpoint đã tách quyền ở bản desktop
 *   3. home-settings  — hồ sơ tài khoản thật + đăng xuất + xem thay quyền
 *      (owner/admin), tái dùng dải băng impersonate của mẫu
 */
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'
import { logout } from './login.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (v) => new Intl.NumberFormat('vi-VN').format(v ?? 0)

const STAGE = {
  subscriber: { name: 'Đăng ký', color: '#2563eb' },
  lead: { name: 'Lead', color: '#f59e0b' },
  qualified: { name: 'Đủ điều kiện', color: '#9333ea' },
  opportunity: { name: 'Cơ hội', color: '#ea580c' },
  customer: { name: 'Khách hàng', color: '#16a34a' },
  evangelist: { name: 'VIP/Đại sứ', color: '#0891b2' },
  churned: { name: 'Rời bỏ', color: '#ef4444' },
}
const AV_COLORS = ['#16a34a', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#0d9488']
const colorOf = (id) => {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
const initials = (name) => {
  const p = String(name || '?').trim().split(/\s+/)
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0].slice(0, 2)).toUpperCase()
}

// ══════════════════ 1. KHÁCH HÀNG ══════════════════
const cust = { page: 1, total: 0, items: [], stage: '', search: '', loading: false }

function renderCustomers(listEl) {
  const html = cust.items.map(c => {
    const name = c.crmName || c.fullName || 'Không tên'
    const st = STAGE[c.lifecycleStage] || { name: c.lifecycleStage || '—', color: '#64748b' }
    return `
      <div class="crm-card">
        <div class="crm-card__top">
          <div class="crm-card__avatar" style="background:${colorOf(c.id)};">${esc(initials(name))}</div>
          <div class="crm-card__body">
            <div class="crm-card__name">${esc(name)}</div>
            <div class="crm-card__phone">${esc(c.phone || 'Chưa có SĐT')}</div>
          </div>
          <span class="crm-stage" style="background:${st.color}18; color:${st.color};">
            <span class="crm-stage__dot" style="background:${st.color};"></span>${esc(st.name)}</span>
        </div>
        <div class="crm-card__meta">
          <span class="crm-tag">🌐 ${esc(c.source || '—')}</span>
          <span class="crm-tag">⭐ ${c.leadScore ?? 0} điểm</span>
        </div>
      </div>`
  }).join('')
  const more = cust.items.length < cust.total
    ? `<button id="custMore" style="display:block; margin:10px auto 16px; border:1px solid #e2e8f0;
        background:#fff; color:#475569; font-size:13px; font-weight:600; padding:9px 22px;
        border-radius:20px;">Tải thêm (${num(cust.total - cust.items.length)})</button>` : ''
  listEl.innerHTML = html + more ||
    '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Không có liên hệ nào.</div>'
  const count = document.getElementById('custCount')
  if (count) count.textContent = `${num(cust.total)} liên hệ`
}

async function loadCustomers(listEl, { append = false } = {}) {
  if (cust.loading) return
  cust.loading = true
  if (!append) listEl.innerHTML =
    '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:30px 0;">Đang tải…</div>'
  try {
    const q = new URLSearchParams({ limit: '30', page: String(cust.page) })
    if (cust.stage) q.set('lifecycleStage', cust.stage)
    if (cust.search) q.set('search', cust.search)
    const d = await api.get(`/api/v1/contacts?${q}`)
    cust.total = d.total ?? 0
    cust.items = append ? [...cust.items, ...(d.contacts || [])] : (d.contacts || [])
    renderCustomers(listEl)
  } catch (e) {
    listEl.innerHTML = `<div style="color:#b91c1c; font-size:13px; padding:20px;">${esc(e.message)}</div>`
  } finally { cust.loading = false }
}

function mountCustomers() {
  const old = document.getElementById('custList')
  if (!old) return
  const listEl = old.cloneNode(false)
  old.replaceWith(listEl)
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('#custMore')) { cust.page++; loadCustomers(listEl, { append: true }) }
  })

  // Chip giai đoạn: Liên hệ = tất cả; Leads/Khách hàng lọc lifecycleStage.
  // "Công ty" và "Lịch hẹn" là màn khác chưa có ở mobile — làm mờ, nói thẳng.
  const SEG = { 'Liên hệ': '', 'Leads': 'lead', 'Khách hàng': 'customer' }
  document.querySelectorAll('#home-customers .crm-seg__chip').forEach(chip => {
    const label = chip.textContent.replace(/[^\wÀ-ỹ ]/g, '').trim()
    const clean = chip.cloneNode(true)
    chip.replaceWith(clean)
    if (!(label in SEG)) {
      clean.style.opacity = '.45'
      clean.addEventListener('click', () => alert('Mục này sẽ có ở bản sau.'))
      return
    }
    clean.addEventListener('click', () => {
      document.querySelectorAll('#home-customers .crm-seg__chip').forEach(x =>
        x.classList.toggle('crm-seg__chip--active', x === clean))
      cust.stage = SEG[label]
      cust.page = 1
      loadCustomers(listEl)
    })
  })

  // Tìm kiếm (nếu mẫu có ô search trong panel)
  const search = document.querySelector('#home-customers input[placeholder*="Tìm"]')
  if (search) {
    const clean = search.cloneNode(true)
    search.replaceWith(clean)
    let t
    clean.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => { cust.search = clean.value.trim(); cust.page = 1; loadCustomers(listEl) }, 400)
    })
  }

  // Bottom sheet thêm KH của mẫu: giữ nút mở/đóng demo, thay nút Lưu bằng POST thật.
  const submit = document.getElementById('addCustSubmit')
  if (submit) {
    const clean = submit.cloneNode(true)
    submit.replaceWith(clean)
    clean.addEventListener('click', async () => {
      const sheet = document.getElementById('addCustSheet')
      // Placeholder của mẫu: "Nhập tên liên hệ" / "0912 345 678" — bám theo đúng
      // chuỗi đó, không đoán "SĐT" (đã hụt khi kiểm chứng).
      const fullName = sheet.querySelector('input[placeholder*="tên liên hệ"]')?.value.trim()
      const phone = sheet.querySelector('input[placeholder*="0912"]')?.value.trim()
      if (!fullName) { alert('Chưa nhập tên khách.'); return }
      clean.disabled = true
      try {
        await api.post('/api/v1/contacts', { fullName, phone: phone || undefined, source: 'mobile' })
        alert('✓ Đã thêm khách hàng.')
        sheet.classList.remove('open')
        cust.page = 1
        loadCustomers(listEl)
      } catch (e) {
        alert('Không thêm được: ' + e.message)
      } finally { clean.disabled = false }
    })
  }

  loadCustomers(listEl)
}

// ══════════════════ 2. TỔNG QUAN ══════════════════
function setKpi(label, value, sub) {
  const el = [...document.querySelectorAll('#home-overview .kpi')]
    .find(k => k.querySelector('.kpi__label')?.textContent.trim() === label)
  if (!el) return
  el.querySelector('.kpi__value').textContent = value
  if (sub != null) el.querySelector('.kpi__sub').textContent = sub
  el.querySelector('.kpi__trend')?.remove()   // số trend demo — bỏ, không bịa
}

async function loadOverview() {
  // Lời chào theo người thật
  const u = session.user()
  const title = document.querySelector('#home-overview .lt-head__title')
  if (title && u?.fullName) title.textContent = `Chào ${u.fullName} 👋`
  const sub = document.querySelector('#home-overview .lt-head__sub')
  if (sub) sub.textContent = new Date().toLocaleDateString('vi-VN',
    { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · Trà Dược Việt Nam'

  let d
  try { d = await api.get('/api/v1/dashboard/overview') }
  catch (e) {
    const ov = document.querySelector('#home-overview .ov')
    ov?.insertAdjacentHTML('afterbegin',
      `<div style="color:#b91c1c; font-size:12.5px; margin-bottom:10px;">Không tải được số liệu: ${esc(e.message)}</div>`)
    return
  }

  const c = d.conversations || {}
  setKpi('Tin nhắn hôm nay', num(c.messagesToday), 'Cả gửi và nhận')
  setKpi('Chưa trả lời', num(c.unrepliedConversations), 'Hội thoại chờ trả lời')
  setKpi('Chưa đọc', num(c.unreadConversations), `${num(c.unreadMessages)} tin nhắn chưa xem`)
  setKpi('Lịch hẹn hôm nay', num(d.appointmentsToday), 'Hôm nay')
  setKpi('KH mới tuần này', num(d.contacts?.newThisWeek), 'Trong 7 ngày qua')
  setKpi('Tổng khách hàng', num(d.contacts?.total), 'Đang hoạt động')

  // Doanh thu theo vai trò — thêm dải thẻ mới phía trên KPI (mẫu không có).
  const isBoss = ['owner', 'admin', 'manager'].includes(d.role)
  // Nhân viên mà CHƯA map được tài khoản CRM (mine=null) thì KHÔNG rơi về số
  // toàn công ty — hiện số công ty dưới nhãn "của tôi" là nói dối người dùng.
  const s = d.sales ? (isBoss ? d.sales.org : d.sales.mine) : null
  const mineMissing = !isBoss && d.sales && !d.sales.mine
  const money = (v) => v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' tr' : num(v) + 'đ'
  const grid = document.querySelector('#home-overview .kpi-grid')
  document.getElementById('mSales')?.remove()
  if (s && grid) {
    grid.insertAdjacentHTML('beforebegin', `
      <div id="mSales" style="background:linear-gradient(135deg,#0D6838,#16a34a); border-radius:14px;
          padding:14px 16px; margin-bottom:12px; color:#fff;">
        <div style="font-size:11.5px; opacity:.85;">💰 Doanh thu ${isBoss ? 'toàn công ty' : 'của tôi'} · 7 ngày</div>
        <div style="font-size:24px; font-weight:800; margin:2px 0;">${money(s.week.gmv)}</div>
        <div style="font-size:11.5px; opacity:.85;">${num(s.week.orders)} đơn · hôm nay ${money(s.today.gmv)} (${num(s.today.orders)} đơn)</div>
      </div>`)
  } else if (mineMissing && grid) {
    grid.insertAdjacentHTML('beforebegin',
      `<div id="mSales" style="font-size:11.5px; color:#64748b; background:#f8fafc; border-radius:8px;
        padding:8px 10px; margin-bottom:10px;">💰 Doanh thu cá nhân: tài khoản chưa liên kết CRM — liên hệ quản trị.</div>`)
  } else if (d.salesError && grid) {
    grid.insertAdjacentHTML('beforebegin',
      `<div id="mSales" style="font-size:11.5px; color:#92400e; background:#fef3c7; border-radius:8px;
        padding:8px 10px; margin-bottom:10px;">⚠️ Chưa lấy được doanh thu từ CRM</div>`)
  }

  // Hoạt động gần đây của mẫu là dữ liệu giả toàn công ty → thay bằng ghi chú
  // trung thực (mobile v1 chưa nối nhật ký hoạt động).
  const feed = document.getElementById('activityFeed')
  if (feed) feed.innerHTML =
    '<div style="color:#94a3b8; font-size:12.5px; padding:8px 0;">Nhật ký hoạt động sẽ có ở bản sau.</div>'
  // Biểu đồ + pipeline demo: ẩn để không hiện số giả.
  document.querySelector('#home-overview .bar-chart')?.closest('.ov-card, .section, div[class*="card"]')
  ;['barChart', 'pipeline'].forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      const card = el.closest('.ov-card') || el.parentElement
      card.style.display = 'none'
    }
  })
  const donut = document.querySelector('#home-overview .donut')
  if (donut) (donut.closest('.ov-card') || donut.parentElement).style.display = 'none'
  // Chip điều hướng phụ (Hộp thư/Hoạt động/…) chưa có màn ở mobile → mờ.
  document.querySelectorAll('#home-overview .ov-nav__chip:not(.ov-nav__chip--active)').forEach(chFn => {
    chFn.style.opacity = '.45'
  })
  document.querySelectorAll('#home-overview .ov-btn').forEach(b => { b.style.display = 'none' })
}

// ══════════════════ 3. CÁ NHÂN ══════════════════
function mountSettings() {
  const u = session.user()
  const card = document.querySelector('#home-settings .me-card')
  if (!card || !u) return

  // Điền hồ sơ thật theo NHÃN
  const setField = (label, value, lock = true) => {
    const f = [...card.querySelectorAll('.me-field')]
      .find(x => x.querySelector('label')?.textContent.trim().startsWith(label))
    const inp = f?.querySelector('input')
    if (inp) { inp.value = value ?? ''; if (lock) inp.disabled = true }
  }
  const ROLE_VI = { owner: 'Chủ tài khoản', admin: 'Quản trị viên', manager: 'Quản lý', member: 'Nhân viên' }
  setField('Họ và tên', u.fullName)
  setField('Vai trò', ROLE_VI[u.role] || u.role)
  setField('Email', u.email)
  const av = card.querySelector('.me-avatar')
  if (av) av.textContent = initials(u.fullName)
  card.querySelector('.me-avatar-btn')?.remove()          // đổi ảnh: chưa có API
  card.querySelector('.me-save')?.remove()                // sửa hồ sơ: bản sau

  // Khối hành động thật: xem thay quyền (owner/admin) + đăng xuất
  const canImp = ['owner', 'admin'].includes(u.role) && !u.impersonatedBy
  card.insertAdjacentHTML('beforeend', `
    <div style="margin-top:14px; display:grid; gap:8px;">
      ${canImp ? `<button id="meImp" style="border:1px solid #fde68a; background:#fffbeb; color:#b45309;
        border-radius:10px; padding:11px; font-size:13px; font-weight:700;">👁️ Xem dưới quyền nhân viên khác</button>` : ''}
      <button id="meLogout" style="border:1px solid #fecaca; background:#fff; color:#ef4444;
        border-radius:10px; padding:11px; font-size:13px; font-weight:700;">Đăng xuất</button>
    </div>`)
  document.getElementById('meLogout').onclick = () => { if (confirm('Đăng xuất khỏi thiết bị này?')) logout() }

  const impBtn = document.getElementById('meImp')
  if (impBtn) impBtn.onclick = openImpersonatePicker

  // Đang xem thay quyền? Hiện dải băng thật của mẫu (đợt 0 đã ẩn dải demo).
  showImpersonationBanner()
}

const K_ORIG = 'chatmql_m_orig_session'

async function openImpersonatePicker() {
  let team
  try { team = (await api.get('/api/v1/settings/team')) } catch (e) { alert(e.message); return }
  const members = (team.members || team.users || []).filter(m =>
    ['manager', 'member'].includes(m.role) && m.isActive !== false)
  const sheet = document.createElement('div')
  sheet.id = 'impSheet'
  sheet.style.cssText = `position:fixed; left:0; right:0; bottom:0; z-index:400; background:#fff;
    border-radius:16px 16px 0 0; box-shadow:0 -10px 30px rgba(15,23,42,.2); padding:14px 16px 24px; max-height:65vh; overflow:auto;`
  sheet.innerHTML = `<div style="font-size:13.5px; font-weight:800; margin-bottom:4px;">👁️ Xem dưới quyền nhân viên
      <span style="float:right; color:#94a3b8; cursor:pointer;" id="impClose">✕</span></div>
    <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">Xem hệ thống đúng như nhân viên đó thấy. Mọi lượt xem đều được ghi nhật ký.</div>
    ${members.map(m => `<button data-uid="${esc(m.id)}" style="display:flex; gap:10px; align-items:center; width:100%;
        border:1px solid #f1f5f9; background:#fff; border-radius:10px; padding:9px 12px; margin-bottom:6px; text-align:left;">
        <span style="width:32px; height:32px; border-radius:50%; background:${colorOf(m.id)}; color:#fff;
          display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">${esc(initials(m.fullName))}</span>
        <span><b style="font-size:13px;">${esc(m.fullName)}</b><br><small style="color:#64748b;">${esc(m.email)} · ${esc(m.role)}</small></span>
      </button>`).join('') || '<div style="color:#94a3b8; font-size:12.5px;">Không có nhân viên nào.</div>'}`
  document.body.appendChild(sheet)
  sheet.querySelector('#impClose').onclick = () => sheet.remove()
  sheet.querySelectorAll('[data-uid]').forEach(b => {
    b.onclick = async () => {
      try {
        const d = await api.post(`/api/v1/auth/impersonate/${b.dataset.uid}`)
        // Cất phiên gốc để còn đường quay về — token thay quyền KHÔNG có refresh.
        localStorage.setItem(K_ORIG, JSON.stringify({
          token: session.token(), refreshToken: session.refreshToken(), user: session.user(),
        }))
        session.save({ token: d.token, user: d.user })
        localStorage.removeItem('chatmql_m_refresh')
        location.reload()
      } catch (e) { alert(e.message) }
    }
  })
}

function showImpersonationBanner() {
  const u = session.user()
  if (!u?.impersonatedBy) return
  const banner = document.querySelector('.impersonate')
  if (!banner) return
  banner.style.display = ''
  banner.innerHTML = `👁️ Đang xem dưới quyền <b>${esc(u.fullName)}</b> ·
    <a href="#" id="impStop" style="color:inherit; text-decoration:underline;">Quay lại tài khoản gốc</a>`
  banner.querySelector('#impStop').onclick = async (e) => {
    e.preventDefault()
    try {
      const d = await api.post('/api/v1/auth/stop-impersonation')
      const orig = JSON.parse(localStorage.getItem(K_ORIG) || 'null')
      session.save({ token: d.token || orig?.token, refreshToken: orig?.refreshToken, user: d.user || orig?.user })
      localStorage.removeItem(K_ORIG)
      location.reload()
    } catch {
      // API hỏng vẫn phải thoát được vai — khôi phục phiên gốc đã cất.
      const orig = JSON.parse(localStorage.getItem(K_ORIG) || 'null')
      if (orig) { session.save(orig); localStorage.removeItem(K_ORIG); location.reload() }
    }
  }
}

export function mountHome() {
  mountCustomers()
  loadOverview()
  mountSettings()
}
