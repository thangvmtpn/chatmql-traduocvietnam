/**
 * order-form.js — tab Tạo đơn nối API thật (Đợt 2).
 *
 * CHIẾN LƯỢC: bộ máy tính tiền của bản mẫu (ofRecalcProducts, ofRenderPayment,
 * qty ±, giảm giá %, đặt cọc, phí ship, tự vận chuyển, đơn đổi trả) đã đúng và
 * chạy ở global scope — TÁI DÙNG nguyên vẹn. File này chỉ làm ba việc:
 *   1. Đổ dữ liệu thật vào các ô chọn (trạng thái, tỉnh/xã, kho, sản phẩm)
 *   2. Thay nút Đặt hàng demo bằng POST /orders/create thật
 *   3. Vô hiệu những gì backend chưa hỗ trợ (tiêu điểm — tính năng đang tạm dừng)
 */
import { api } from '../lib/api.js'
import { session } from '../lib/session.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const parseNum = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

/** Bỏ dấu tiếng Việt để tìm "tra" khớp "Trà" — API q= phân biệt dấu nên lọc client. */
const deAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

let lookups = null       // { statuses, warehouses, provinces }
let catalog = []         // sản phẩm theo kho đang chọn
let els = null           // các control đã gán id
let initedForConv = null
let requestId = null     // khoá chống trùng đơn — giữ nguyên qua các lần bấm lại
let convRef = null
let profileRef = null

/** Các select của mẫu không có id — gán theo THỨ TỰ xuất hiện trong panel-order. */
function grabControls() {
  const panel = document.getElementById('panel-order')
  const sels = [...panel.querySelectorAll('select:not([id])')]
  const [status, staff, province, ward, source, type, kho] = sels
  const searchSp = panel.querySelector('input[placeholder="Tìm sản phẩm"]')
  const searchGift = panel.querySelector('input[placeholder="Tìm quà tặng"]')
  const addr = panel.querySelector('input[placeholder*="địa chỉ chi tiết"]')
  return { panel, status, staff, province, ward, source, type, kho, searchSp, searchGift, addr }
}

function fillSelect(sel, items, { value, label, placeholder }) {
  sel.innerHTML = (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
    items.map(it => `<option value="${esc(it[value])}">${esc(it[label])}</option>`).join('')
}

// ── Ô gợi ý sản phẩm dưới ô tìm ─────────────────────────────────────
function attachPicker(input, { isGift }) {
  const wrap = input.parentElement
  wrap.style.position = 'relative'
  const drop = document.createElement('div')
  drop.style.cssText = `position:absolute; left:0; right:0; top:100%; z-index:60; background:#fff;
    border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 10px 24px rgba(15,23,42,.12);
    max-height:250px; overflow:auto; display:none;`
  wrap.appendChild(drop)

  const hide = () => { drop.style.display = 'none' }
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) hide() })

  let t
  input.addEventListener('input', () => {
    clearTimeout(t)
    t = setTimeout(() => {
      const q = deAccent(input.value.trim())
      if (!q) { hide(); return }
      const hits = catalog.filter(p =>
        deAccent(p.name).includes(q) || deAccent(p.code).includes(q)).slice(0, 12)
      drop.innerHTML = hits.length ? hits.map(p => `
        <div data-pid="${p.id}" style="padding:9px 12px; border-bottom:1px solid #f8fafc; cursor:pointer;">
          <div style="font-size:12.5px; font-weight:600; color:#0f172a;">${esc(p.name)}</div>
          <div style="font-size:11px; color:#64748b;">${esc(p.code)} · ${new Intl.NumberFormat('vi-VN').format(p.price)}đ
            · Tồn ${p.inventory}${p.inventory <= 0 ? ' ⚠️ hết hàng' : ''}</div>
        </div>`).join('')
        : '<div style="padding:10px 12px; font-size:12px; color:#94a3b8;">Không tìm thấy sản phẩm.</div>'
      drop.style.display = 'block'
    }, 250)
  })

  drop.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pid]')
    if (!row) return
    const p = catalog.find(x => String(x.id) === row.dataset.pid)
    if (p) addItem(p, isGift)
    input.value = ''
    hide()
  })
}

function addItem(p, isGift) {
  const list = document.getElementById('ofProdList')
  if (list.querySelector(`.op-item[data-code="${CSS.escape(p.code)}"]${isGift ? '[data-gift]' : ':not([data-gift])'}`)) {
    alert('Sản phẩm này đã có trong đơn.')
    return
  }
  const el = document.createElement('div')
  el.className = 'op-item' + (isGift ? ' op-item--gift' : '')
  // Quà tặng: data-gia=0 để bộ tính tiền của mẫu không cộng tiền — đúng luật
  // backend (isGift không tính vào tiền hàng).
  el.dataset.gia = isGift ? '0' : String(p.price || 0)
  el.dataset.kl = String(p.weight || 0)
  el.dataset.ton = String(p.inventory || 0)
  el.dataset.code = p.code
  el.dataset.name = p.name
  el.dataset.price = String(p.price || 0)
  if (isGift) el.dataset.gift = '1'
  el.innerHTML = `
    <div class="op-item__top">
      <span class="op-item__code">${esc(p.code)}</span>
      ${isGift ? '<span class="op-gift-tag">🎁 Quà tặng</span>' : ''}
      <button type="button" class="op-item__del" title="Xoá sản phẩm">✕</button>
    </div>
    <div class="op-item__name">${esc(p.name)}</div>
    <div class="op-item__row">
      <span class="op-item__kl">${p.weight || 0}g</span>
      <div class="op-qty">
        <button type="button" data-d="-1">−</button>
        <input inputmode="numeric" value="1">
        <button type="button" data-d="1">+</button>
      </div>
      <b class="op-item__sum">${isGift ? '0đ' : new Intl.NumberFormat('vi-VN').format(p.price) + 'đ'}</b>
    </div>`
  list.appendChild(el)
  window.ofRecalcProducts?.()
}

// ── Gom payload từ DOM và gửi ───────────────────────────────────────
function collectItems() {
  return [...document.querySelectorAll('#ofProdList .op-item')].map(it => ({
    productCode: it.dataset.code,
    productName: it.dataset.name,
    quantity: Math.max(1, parseNum(it.querySelector('.op-qty input')?.value) || 1),
    unitPrice: Number(it.dataset.price) || 0,
    isGift: !!it.dataset.gift,
  }))
}

function shippingProviderOf(text) {
  const t = deAccent(text)
  if (t.includes('j&t') || t.includes('jt')) return 'jt_express'
  if (t.includes('viettel')) return 'viettel_post'
  if (t.includes('vnpost') || t.includes('buu dien')) return 'vnpost'
  return 'other'
}

async function submitOrder(btn) {
  const items = collectItems()
  if (!items.length) { alert('Chưa có sản phẩm nào trong đơn.'); return }
  if (!items.some(i => !i.isGift)) { alert('Đơn chỉ toàn quà tặng — cần ít nhất 1 sản phẩm bán.'); return }

  const phone = (document.getElementById('ofPhone')?.value || profileRef?.phone || '').trim()
  if (!phone) {
    alert('Khách chưa có số điện thoại — nhập SĐT ở ô trên nút Đặt hàng.')
    document.getElementById('ofPhone')?.focus()
    return
  }

  const provinceName = els.province.selectedOptions[0]?.text || ''
  const wardName = els.ward.selectedOptions[0]?.text || ''
  const addrDetail = els.addr?.value.trim() || ''
  const shippingAddress = [addrDetail, wardName !== 'Chọn phường/xã' ? wardName : '', provinceName !== '-- Chọn tỉnh/thành --' ? provinceName : '']
    .filter(Boolean).join(', ')
  if (!shippingAddress) { alert('Chưa có địa chỉ nhận hàng.'); return }

  const subtotal = items.reduce((s, i) => s + (i.isGift ? 0 : i.unitPrice * i.quantity), 0)
  const discPct = Math.min(100, parseNum(document.getElementById('ofDiscount').value))

  const name = convRef.contact?.crmName || convRef.contact?.fullName || convRef.displayName || 'Khách hàng'
  const body = {
    conversationId: convRef.id,
    contactId: convRef.contact?.id || undefined,
    customerName: name,
    customerPhone: phone,
    shippingAddress,
    city: provinceName || undefined,
    items,
    // Mẫu nhập giảm giá theo % — backend nhận SỐ TIỀN. Quy đổi tại đây.
    discountAmount: Math.round(subtotal * discPct / 100),
    shippingFee: parseNum(document.getElementById('ofShipCost').value),
    paymentMethod: 'cod',
    depositAmount: parseNum(document.getElementById('ofTransfer').value),
    orderStatusId: Number(els.status.value) || undefined,
    warehouseId: Number(els.kho.value) || undefined,
    provinceId: Number(els.province.value) || undefined,
    provinceName: provinceName || undefined,
    wardId: Number(els.ward.value) || undefined,
    wardName: wardName || undefined,
    addressDetail: addrDetail || undefined,
    orderType: els.type.value || undefined,
    orderSource: els.source.value || undefined,
    selfShipping: document.getElementById('ofSelfShip').checked,
    isExchange: document.getElementById('ofReturnCheck').checked,
    shippingProvider: shippingProviderOf(document.getElementById('ofShipUnit').selectedOptions[0]?.text || ''),
    notes: document.getElementById('ofOrderNote').value.trim() || undefined,
    requestId,
  }

  btn.disabled = true
  btn.textContent = 'Đang tạo đơn…'
  try {
    const d = await api.post('/api/v1/orders/create', body)
    const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(d.total_amount || 0)
    alert(d.replayed
      ? `ℹ️ Đơn này đã tạo trước đó [${d.order_code}] — không tạo trùng.`
      : `🎉 LÊN ĐƠN THÀNH CÔNG [${d.order_code}]\n\nTổng: ${money}\n${d.fm_saved ? '✓ Đã vào CRM & FM' : '⚠ Đã vào CRM, FM sẽ tự đồng bộ lại'}`)
    // Dọn đơn cho lượt sau + khoá chống trùng MỚI cho đơn kế tiếp
    document.querySelectorAll('#ofProdList .op-item').forEach(el => el.remove())
    window.ofRecalcProducts?.()
    requestId = crypto.randomUUID()
    window.navBack?.('view-detail')
  } catch (e) {
    // Đơn KHÔNG được tạo — nói rõ và cho bấm lại; requestId giữ nguyên nên
    // backend không bao giờ tạo trùng dù bấm nhiều lần.
    alert('❌ KHÔNG TẠO ĐƯỢC ĐƠN\n\n' + e.message + '\n\nBấm lại — hệ thống không tạo đơn trùng.')
  } finally {
    btn.disabled = false
    btn.textContent = '🛒 Đặt hàng'
  }
}

export async function initOrderForm(conv, profile) {
  convRef = conv
  profileRef = profile
  if (initedForConv === conv.id) return
  initedForConv = conv.id
  requestId = crypto.randomUUID()

  els = grabControls()

  if (!lookups) {
    try { lookups = await api.get('/api/v1/orders/form-lookups') }
    catch (e) { alert('Không tải được dữ liệu form đơn: ' + e.message); return }
  }

  // Trạng thái (mặc định Chờ xử lý), tỉnh, kho — dữ liệu thật
  fillSelect(els.status, lookups.statuses, { value: 'id', label: 'label' })
  els.status.value = String(lookups.statuses.find(s => s.label === 'Chờ xử lý')?.id ?? lookups.statuses[0]?.id)
  fillSelect(els.province, lookups.provinces, { value: 'id', label: 'name', placeholder: '-- Chọn tỉnh/thành --' })
  fillSelect(els.kho, lookups.warehouses, { value: 'id', label: 'name' })

  // Người bán do BACKEND ghi theo tài khoản đăng nhập — trình duyệt không được
  // tự khai. Khoá ô lại và nói thẳng, đỡ hiểu nhầm "chọn ai cũng được".
  const me = session.user()
  els.staff.innerHTML = `<option>${esc(me?.fullName || 'Theo tài khoản đăng nhập')}</option>`
  els.staff.disabled = true
  els.staff.title = 'Người lên đơn tự ghi theo tài khoản đang đăng nhập'

  // Tiêu điểm ("Lá") — tính năng đang TẠM DỪNG theo quyết định trước đây.
  const points = document.getElementById('ofPoints')
  if (points) {
    points.disabled = true
    points.value = ''
    points.placeholder = 'Tạm khoá'
    points.title = 'Tính năng tiêu điểm đang tạm dừng'
  }

  // Phường/xã theo tỉnh
  els.ward.innerHTML = '<option value="">Chọn tỉnh trước</option>'
  els.province.addEventListener('change', async () => {
    els.ward.innerHTML = '<option value="">Đang tải…</option>'
    try {
      const d = await api.get(`/api/v1/orders/wards?provinceId=${els.province.value}`)
      fillSelect(els.ward, d.wards || [], { value: 'id', label: 'name', placeholder: 'Chọn phường/xã' })
    } catch { els.ward.innerHTML = '<option value="">Không tải được</option>' }
  })

  // Catalog theo kho
  async function loadCatalog() {
    try {
      const d = await api.get(`/api/v1/orders/catalog?warehouseId=${els.kho.value}`)
      catalog = d.products || []
    } catch { catalog = [] }
  }
  els.kho.addEventListener('change', loadCatalog)
  els.kho.value = String(lookups.warehouses[0]?.id ?? '')
  await loadCatalog()

  attachPicker(els.searchSp, { isGift: false })
  attachPicker(els.searchGift, { isGift: true })

  // Xoá 2 sản phẩm DEMO của mẫu — không được để dữ liệu giả lọt vào đơn thật.
  document.querySelectorAll('#ofProdList .op-item').forEach(el => el.remove())
  window.ofRecalcProducts?.()

  // Khách chưa có SĐT → thêm ô nhập ngay trên nút Đặt hàng (backend sẽ tự lưu
  // số này vào hồ sơ khách sau khi lên đơn).
  if (!profile?.phone && !document.getElementById('ofPhone')) {
    const row = document.createElement('div')
    row.className = 'of__group'
    row.innerHTML = `
      <label class="of__label">📞 SĐT khách (bắt buộc — khách chưa có số)</label>
      <input class="of__input" id="ofPhone" inputmode="tel" placeholder="09xxxxxxxx">`
    document.getElementById('ofSubmit').closest('.of__footer, div').before(row)
  }

  // Điền sẵn địa chỉ từ CRM nếu có
  if (profile?.crm?.address && els.addr && !els.addr.value) els.addr.value = profile.crm.address

  // Nút Đặt hàng thật — thay node gỡ handler demo (alert "chưa nối API").
  const oldBtn = document.getElementById('ofSubmit')
  const btn = oldBtn.cloneNode(true)
  oldBtn.replaceWith(btn)
  btn.addEventListener('click', () => submitOrder(btn))
}

export function resetOrderFormCache() { initedForConv = null }
