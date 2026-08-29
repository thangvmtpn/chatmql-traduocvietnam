/**
 * ChatMQL Order Dispatch & CRM Customer Care Bridge UI
 * Tích hợp Nút Lên Đơn, Lịch Sử Đơn Hàng & Nhận diện Khách hàng CRM
 */
(function () {
  const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__ !== undefined)
    ? window.__API_BASE__
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:4520'
        : '');

  // Trình duyệt KHÔNG gọi thẳng sang CRM nữa. Mọi thứ liên quan tới đơn hàng
  // đều đi qua ChatMQL backend, nơi giữ service key và kiểm tra quyền nhân viên.
  // Nhờ vậy: key không lộ trong JS, không phải mở CORS trên CRM cho từng domain,
  // và mọi thao tác lên đơn đều có dấu vết ai làm.
  const ORDER_API = `${API_BASE}/api/v1/orders`;

  /** Token nhân viên — app lưu ở localStorage key 'token'. */
  function authToken() {
    return localStorage.getItem('token') || '';
  }

  function getCurrentUser() {
    try {
      const token = authToken();
      if (!token) return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  function authHeaders(extra) {
    const t = authToken();
    return Object.assign(
      { 'Content-Type': 'application/json' },
      t ? { Authorization: `Bearer ${t}` } : {},
      extra || {}
    );
  }

  /**
   * Header cho POST KHÔNG có body. Không gửi Content-Type — Fastify trả 400
   * khi thấy Content-Type: application/json mà body rỗng.
   */
  function authHeadersNoBody() {
    const t = authToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  // Danh mục sản phẩm cứng đã được gỡ bỏ — giá và tồn kho giờ lấy thật từ FM
  // qua endpoint /orders/catalog, nên không còn nguy cơ báo giá sai cho khách.

  let currentCrmCustomer = null;
  let customerOrdersCache = [];
  let lastFetchedPhone = '';

  function formatDot(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Inject CSS Styles
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .chatmql-order-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      font-size: 13px;
      font-weight: 600;
      color: #ffffff;
      background: linear-gradient(135deg, #16a34a, #15803d);
      border: 1px solid #15803d;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);
      transition: all 0.2s ease;
      margin-left: 8px;
    }
    .chatmql-order-btn:hover {
      background: linear-gradient(135deg, #15803d, #166534);
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(22, 163, 74, 0.3);
    }
    .chatmql-crm-card {
      margin: 12px 0;
      padding: 12px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      font-size: 12.5px;
      color: #166534;
    }
    .chatmql-crm-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
      background: #22c55e;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .chatmql-order-history-box {
      margin-top: 14px;
      padding: 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .chatmql-order-item-card {
      padding: 8px 10px;
      margin-bottom: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 12px;
    }
    .chatmql-order-status-badge {
      padding: 1px 6px;
      font-size: 10.5px;
      font-weight: 600;
      border-radius: 4px;
    }
    .status-success { background: #dcfce7; color: #15803d; }
    .status-pending { background: #fef3c7; color: #b45309; }
    .chatmql-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    }
    .chatmql-modal {
      width: 640px;
      max-width: 95vw;
      max-height: 90vh;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: inherit;
    }
    .chatmql-modal-header {
      padding: 16px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .chatmql-modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }
    .chatmql-modal-footer {
      padding: 16px 20px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .chatmql-form-group {
      margin-bottom: 14px;
    }
    .chatmql-form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 5px;
    }
    .chatmql-form-input, .chatmql-form-select {
      width: 100%;
      padding: 8px 12px;
      font-size: 13.5px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      outline: none;
      box-sizing: border-box;
    }
    .chatmql-drawer {
      width: 560px;
      max-width: 100vw;
      height: 100vh;
      background: #ffffff;
      box-shadow: -8px 0 24px rgba(15, 23, 42, 0.18);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: inherit;
      animation: chatmqlSlideIn .18s ease-out;
    }
    @keyframes chatmqlSlideIn { from { transform: translateX(24px); opacity: .6; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .chatmql-drawer { animation: none; } }
    .chatmql-form-input:focus, .chatmql-form-select:focus {
      border-color: #16a34a;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
    }
  `;
  document.head.appendChild(styleEl);

  let activeContactData = { phone: '', name: '', id: '' };
  let currentConversationId = '';

  const CONV_ID_RE =
    /\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

  /**
   * ID hội thoại đang mở. Backend sẽ đối chiếu lại với org của nhân viên nên
   * giá trị suy ra ở đây chỉ là gợi ý, không phải thứ được tin tuyệt đối.
   */
  function getCurrentConversationId() {
    if (currentConversationId) return currentConversationId;
    const m = (window.location.pathname + window.location.search).match(CONV_ID_RE);
    return m ? m[1] : undefined;
  }

  // App React gọi API bằng axios (XMLHttpRequest), KHÔNG qua window.fetch — nên
  // chỉ chặn fetch là không bao giờ thấy hội thoại nào đang mở. Chặn thêm XHR.
  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        const m = String(url || '').match(CONV_ID_RE);
        if (m) currentConversationId = m[1];
      } catch (e) {}
      return originalOpen.apply(this, arguments);
    };
  } catch (e) {}

  // Network Interceptor: Auto-capture conversation contact details from API calls
  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

        // Bắt id hội thoại từ chính các lời gọi mà app đang thực hiện.
        const convMatch = url.match(CONV_ID_RE);
        if (convMatch) currentConversationId = convMatch[1];

        if (url.includes('/conversations') || url.includes('/contacts')) {
          const clone = response.clone();
          clone.json().then(data => {
            const contact = data?.contact || (Array.isArray(data) ? null : data);
            if (contact && (contact.phone || contact.fullName)) {
              if (contact.phone) activeContactData.phone = contact.phone.trim();
              if (contact.fullName) activeContactData.name = contact.fullName.trim();
              if (contact.id) activeContactData.id = contact.id;
              if (contact.phone && contact.phone !== lastFetchedPhone) {
                lastFetchedPhone = '';
                renderOrderHistorySidebar();
              }
            }
          }).catch(() => {});
        }
      } catch (e) {}
      return response;
    };
  } catch (e) {}

  // Đã bỏ getCustomerPhoneOnScreen() và getCustomerNameOnScreen().
  // Hai hàm đó suy ra khách hàng bằng cách quét chữ trên màn hình, nên vớ
  // phải số điện thoại của khách khác và rơi về tên mặc định — khiến mọi đơn
  // mang chung một thông tin. Thay bằng fetchConversationContext(): hỏi
  // backend theo conversationId, backend đối chiếu với org của nhân viên.

  // Helper: Fetch CRM Customer Details & Order History
  async function fetchCrmCustomerAndOrders(phone) {
    if (!phone) return { customer: null, orders: [] };
    if (phone === lastFetchedPhone && currentCrmCustomer) return { customer: currentCrmCustomer, orders: customerOrdersCache };
    lastFetchedPhone = phone;

    try {
      // 1. Hồ sơ khách trong CRM (qua proxy ChatMQL)
      const res = await fetch(`${ORDER_API}/customer?phone=${encodeURIComponent(phone)}`, {
        headers: authHeaders(),
      });
      const data = res.ok ? await res.json() : null;
      currentCrmCustomer = data && data.found ? data.customer : null;

      // 2. Lịch sử đơn hàng (qua proxy ChatMQL)
      const resOrders = await fetch(`${ORDER_API}/customer-orders?phone=${encodeURIComponent(phone)}`, {
        headers: authHeaders(),
      });
      const dataOrders = resOrders.ok ? await resOrders.json() : null;
      customerOrdersCache = (dataOrders && dataOrders.orders) || [];
    } catch (e) {
      console.warn('Không tra được dữ liệu CRM:', e);
    }

    return { customer: currentCrmCustomer, orders: customerOrdersCache };
  }

  // Render Order History widget in sidebar
  function renderOrderHistorySidebar() {
    // Thanh thông tin bên phải của ChatMQL dùng class .chat-detail. Ba selector
    // cũ (.conversation-info-sidebar, [class*=contact-details], [class*=customer-panel])
    // không khớp gì trong bản build này, nên toàn bộ khối gắn vào sidebar chưa
    // từng hiện ra. Giữ chúng lại làm phương án dự phòng, nhưng ưu tiên .chat-detail.
    const sidebar = document.querySelector('.chat-detail') ||
                    document.querySelector('.conversation-info-sidebar, [class*="contact-details"], [class*="customer-panel"]') ||
                    Array.from(document.querySelectorAll('h3, div')).find(el => el.textContent === 'THÔNG TIN' || el.textContent === 'CUSTOMER 360')?.parentElement;

    if (!sidebar) return;

    renderLibraryButton();
    renderResizer(sidebar);
    renderCustomerCard(sidebar);
    renderSalesDocsSidebar(sidebar);

    let historyBox = document.getElementById('chatmql-order-history-container');
    if (!historyBox) {
      historyBox = document.createElement('div');
      historyBox.id = 'chatmql-order-history-container';
      historyBox.className = 'chatmql-order-history-box';
      // Thuộc tab "Tạo đơn". Tab chưa dựng xong thì tạm treo vào cột, renderOrderPanel
      // sẽ chuyển vào đúng chỗ ở lượt sau.
      (document.getElementById('cc-order-history') || sidebar).appendChild(historyBox);
    }

    // Lấy khách theo hội thoại đang mở, không cào DOM. Nếu chưa xác định được
    // thì KHÔNG hiện lịch sử — thà trống còn hơn hiện đơn của khách khác.
    fetchConversationContext().then(ctx => {
      const phone = ctx?.contact?.phone;
      if (!phone) {
        historyBox.innerHTML =
          '<div style="font-size:12px; color:#94a3b8; text-align:center; padding:12px 0;">' +
          'Khách chưa có số điện thoại — chưa tra được lịch sử đơn</div>';
        return;
      }
      return fetchCrmCustomerAndOrders(phone);
    }).then(result => {
      if (!result) return;
      const { customer, orders } = result;
      const orderCount = orders ? orders.length : 0;
      const gmvTotal = orders ? orders.reduce((sum, o) => sum + (o.total_amount || 0), 0) : 0;
      const formattedGmv = `${formatDot(gmvTotal)} ₫`;

      historyBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px;">
            <span>📦</span> <span>LỊCH SỬ ĐƠN HÀNG (${orderCount})</span>
          </div>
          <span style="font-size:11.5px; font-weight:700; color:#16a34a;">${formattedGmv}</span>
        </div>

        <!-- "Chi tiết khách" và "Phân tích AI" đã nằm ở tab Thông tin, "Thư viện"
             có nút riêng trên header chat — bỏ ở đây để khỏi trùng ba chỗ. Hai nút
             quản trị bên dưới thì chưa có chỗ nào khác nên giữ lại. -->
        ${isPromoAdmin() ? `
          <button type="button" id="chatmql-open-promo-admin" style="
            width:100%; margin-bottom:8px; padding:7px; font-size:12px; font-weight:600;
            color:#6d28d9; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px;
            cursor:pointer;">🏷️ Quản trị ưu đãi</button>` : ''}
        ${['owner', 'admin'].includes(tokenClaims().role) && !tokenClaims().impersonatedBy ? `
          <button type="button" id="chatmql-open-imp" style="
            width:100%; margin-bottom:8px; padding:7px; font-size:12px; font-weight:600;
            color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:6px;
            cursor:pointer;">👁️ Xem dưới quyền nhân viên</button>` : ''}

        ${orderCount === 0 ? `
          <div style="font-size:12px; color:#94a3b8; text-align:center; padding:12px 0;">Chưa có đơn hàng nào</div>
        ` : `
          <div style="max-height:220px; overflow-y:auto; padding-right:2px;">
            ${orders.slice(0, 6).map(o => {
              const formattedTotal = `${formatDot(o.total_amount || 0)} ₫`;
              const isDone = o.status === 'Giao thành công';
              const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
              const itemsSummary = o.items && o.items.length > 0 ? o.items.map(i => `${i.name} (x${i.quantity})`).join(', ') : 'Đơn hàng trà';

              return `
                <div class="chatmql-order-item-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                    <span style="font-weight:700; color:#0f172a;">#${o.order_code}</span>
                    <span class="chatmql-order-status-badge ${isDone ? 'status-success' : 'status-pending'}">${o.status || 'Chờ xử lý'}</span>
                  </div>
                  <div style="font-size:11px; color:#475569; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${itemsSummary}">
                    🍵 ${itemsSummary}
                  </div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b;">
                    <span>📅 ${dateStr}</span>
                    <span style="font-weight:700; color:#15803d;">${formattedTotal}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      `;

      const openBtn = historyBox.querySelector('#chatmql-open-profile');
      if (openBtn) openBtn.onclick = () => window.openCustomerProfileDrawer();
      const libBtn = historyBox.querySelector('#chatmql-open-library');
      if (libBtn) libBtn.onclick = () => window.openLibraryPanel();
      const c360Btn = historyBox.querySelector('#chatmql-open-c360');
      if (c360Btn) c360Btn.onclick = () => window.openCustomer360();
      const paBtn = historyBox.querySelector('#chatmql-open-promo-admin');
      if (paBtn) paBtn.onclick = () => window.openPromotionAdmin();
      const impBtn = historyBox.querySelector('#chatmql-open-imp');
      if (impBtn) impBtn.onclick = () => window.openImpersonatePicker();
    });
  }

  /**
   * Khách hàng của hội thoại đang mở — hỏi backend theo conversationId.
   *
   * KHÔNG suy ra từ chữ trên màn hình: cách đó vớ phải số điện thoại của khách
   * khác đang hiện đâu đó trong DOM, và rơi về tên mặc định, khiến mọi đơn mang
   * chung một thông tin. Backend đối chiếu hội thoại với org của nhân viên nên
   * dữ liệu trả về là nguồn đáng tin duy nhất.
   */
  // Sidebar được vẽ lại mỗi 1,2 giây nên KHÔNG được gọi mạng mỗi lần. Nhớ theo
  // conversationId; đổi hội thoại thì tự lấy mới. forceRefresh=true dùng sau khi
  // lên đơn xong để cập nhật lại GMV và số đơn.
  let convContextCache = { id: null, data: null, promise: null };

  async function fetchConversationContext(forceRefresh) {
    const conversationId = getCurrentConversationId();
    if (!conversationId) return null;

    if (!forceRefresh && convContextCache.id === conversationId) {
      if (convContextCache.data) return convContextCache.data;
      if (convContextCache.promise) return convContextCache.promise;
    }

    const promise = (async () => {
      try {
        const res = await fetch(
          `${ORDER_API}/conversation-context?conversationId=${encodeURIComponent(conversationId)}`,
          { headers: authHeaders() }
        );
        if (!res.ok) return null;
        return await res.json();
      } catch (e) {
        console.warn('[order] không lấy được thông tin khách của hội thoại:', e);
        return null;
      }
    })();

    convContextCache = { id: conversationId, data: null, promise };
    const data = await promise;
    // Chỉ ghi vào cache nếu người dùng chưa chuyển sang hội thoại khác.
    if (convContextCache.id === conversationId) {
      convContextCache = { id: conversationId, data, promise: null };
    }
    return data;
  }

  // ── Đợt 1: dữ liệu tra cứu cho form tạo đơn ────────────────────────
  //
  // Trạng thái đơn, kho, tỉnh/thành lấy một lần rồi dùng lại cho mọi lần mở
  // modal — chúng gần như không đổi trong một phiên làm việc.
  let lookupsCache = null;
  const wardsCache = new Map();
  let catalogCache = new Map();   // key = warehouseId || 'all'

  async function loadLookups() {
    if (lookupsCache) return lookupsCache;
    try {
      const res = await fetch(`${ORDER_API}/form-lookups`, { headers: authHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      lookupsCache = await res.json();
    } catch (e) {
      console.warn('[order] không tải được dữ liệu tra cứu:', e);
      lookupsCache = { statuses: [], warehouses: [], provinces: [] };
    }
    return lookupsCache;
  }

  async function loadWards(provinceId) {
    if (!provinceId) return [];
    if (wardsCache.has(provinceId)) return wardsCache.get(provinceId);
    try {
      const res = await fetch(`${ORDER_API}/wards?provinceId=${provinceId}`, { headers: authHeaders() });
      const list = res.ok ? (await res.json()).wards || [] : [];
      wardsCache.set(provinceId, list);
      return list;
    } catch (e) {
      console.warn('[order] không tải được phường/xã:', e);
      return [];
    }
  }

  /** Danh mục sản phẩm thật từ FM — có tồn kho, SKU, đơn vị, khối lượng, VAT. */
  async function loadCatalog(warehouseId) {
    const key = warehouseId || 'all';
    if (catalogCache.has(key)) return catalogCache.get(key);
    try {
      const qs = warehouseId ? `?warehouseId=${warehouseId}` : '';
      const res = await fetch(`${ORDER_API}/catalog${qs}`, { headers: authHeaders() });
      const list = res.ok ? (await res.json()).products || [] : [];
      catalogCache.set(key, list);
      return list;
    } catch (e) {
      console.warn('[order] không tải được danh mục sản phẩm:', e);
      return [];
    }
  }

  const vnd = n => formatDot(Math.round(n || 0));

  /** Nhãn một dòng sản phẩm trong ô chọn: tên · giá · tồn kho. */
  function productLabel(p) {
    const unit = p.unit ? `/${p.unit}` : '';
    const stock = p.inventory > 0 ? `Tồn ${vnd(p.inventory)}` : 'HẾT HÀNG';
    return `${p.name} — ${vnd(p.price)}đ${unit} · ${stock}`;
  }

  // ══ Đợt 2: Drawer hồ sơ khách hàng ═══════════════════════════════════
  //
  // Gộp hai nguồn: contact bên ChatMQL (email, tên Zalo, nguồn) và hồ sơ bên
  // CRM (mã KH, nghề nghiệp, GMV, lịch hẹn). Backend đã ghép sẵn nên ở đây chỉ
  // gọi một lần.

  const fmtVnd = n => `${formatDot(n || 0)} ₫`;

  const fmtDate = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const fmtDateTime = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** ISO -> giá trị cho <input type="datetime-local"> theo giờ địa phương. */
  const toLocalInput = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Một dòng "nhãn — giá trị". Giá trị rỗng hiện "Chưa có" màu nhạt. */
  function infoRow(label, value) {
    const has = value !== null && value !== undefined && String(value).trim() !== '';
    return `
      <div style="display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-bottom:1px solid #f1f5f9; font-size:12.5px;">
        <span style="color:#64748b; flex:none;">${esc(label)}</span>
        <span style="color:${has ? '#0f172a' : '#cbd5e1'}; font-weight:${has ? '600' : '400'}; text-align:right; word-break:break-word;">
          ${has ? esc(value) : 'Chưa có'}
        </span>
      </div>`;
  }

  window.openCustomerProfileDrawer = async function () {
    const convId = getCurrentConversationId();
    if (!convId) {
      alert('Chưa xác định được hội thoại. Mở một cuộc trò chuyện rồi thử lại.');
      return;
    }

    document.querySelector('#chatmql-profile-drawer')?.remove();
    const root = document.createElement('div');
    root.id = 'chatmql-profile-drawer';
    // Design dựng hồ sơ thành ngăn kéo trượt từ phải (.pd-drawer) chứ không phải
    // hộp thoại giữa màn hình. Nền mờ và ngăn kéo là hai phần tử riêng, đúng như
    // .pd-backdrop + .pd-drawer, thêm class 'open' ở khung hình kế tiếp để có
    // hiệu ứng trượt thay vì hiện đột ngột.
    root.className = '';
    root.innerHTML = `
      <div class="pd-backdrop" id="pf-backdrop"></div>
      <div class="pd-drawer" id="pf-drawer">
        <div class="pd-header">
          <div class="pd-avatar" id="pf-avatar">?</div>
          <div style="min-width:0;">
            <div class="pd-title">Chi tiết khách hàng</div>
            <div class="pd-id" id="pf-sub">Đang tải hồ sơ…</div>
          </div>
          <button type="button" class="pd-close" id="pf-close" title="Đóng">×</button>
        </div>
        <div class="pd-body" id="pf-body">
          <div class="chat-detail__empty" style="padding:40px 0;">Đang tải…</div>
        </div>
      </div>`;
    document.body.appendChild(root);
    // Không dùng requestAnimationFrame: trình duyệt không chạy rAF khi tab đang
    // ẩn, ngăn kéo sẽ kẹt ngoài màn hình cho tới khi người dùng quay lại tab.
    // Ép trình duyệt tính lại bố cục một lần để trạng thái đóng được ghi nhận,
    // rồi thêm class ngay — hiệu ứng trượt vẫn chạy, và không phụ thuộc tab.
    // Tab đang ẩn thì trình duyệt đóng băng cả rAF lẫn hiệu ứng CSS — ngăn kéo sẽ
    // treo ngoài màn hình. Lúc đó mở thẳng ở trạng thái cuối, bỏ hiệu ứng trượt:
    // thà không có hoạt ảnh còn hơn không thấy ngăn kéo.
    const bd = root.querySelector('#pf-backdrop');
    const dw = root.querySelector('#pf-drawer');
    if (document.hidden) {
      dw.style.transition = 'none';
      bd.style.transition = 'none';
    } else {
      void dw.offsetWidth;   // ép ghi nhận trạng thái đóng để hiệu ứng có điểm bắt đầu
    }
    bd.classList.add('open');
    dw.classList.add('open');
    const closeDrawer = () => {
      root.querySelector('#pf-backdrop')?.classList.remove('open');
      root.querySelector('#pf-drawer')?.classList.remove('open');
      setTimeout(() => root.remove(), 280);   // đợi hết hiệu ứng trượt rồi mới gỡ
    };
    root.querySelector('#pf-close').onclick = closeDrawer;
    root.querySelector('#pf-backdrop').onclick = closeDrawer;

    let data;
    try {
      const res = await fetch(`${ORDER_API}/customer-profile?conversationId=${encodeURIComponent(convId)}`, {
        headers: authHeaders(),
      });
      data = await res.json();
      if (!res.ok) {
        root.querySelector('#pf-body').innerHTML = `
          <div style="padding:24px; text-align:center;">
            <div style="font-size:32px; margin-bottom:10px;">📇</div>
            <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">Chưa xem được hồ sơ</div>
            <div style="font-size:12.5px; color:#64748b; line-height:1.6;">${esc(data?.error || 'Lỗi ' + res.status)}</div>
          </div>`;
        root.querySelector('#pf-sub').textContent = '';
        return;
      }
    } catch (e) {
      root.querySelector('#pf-body').innerHTML =
        `<div style="padding:24px; color:#dc2626; font-size:13px;">Lỗi kết nối: ${esc(e.message)}</div>`;
      return;
    }

    const cm = data.chatmql || {};
    const crm = data.crm || {};
    const orders = data.orders || [];
    const name = crm.full_name || cm.crmName || cm.zaloName || 'Khách hàng';

    root.querySelector('#pf-sub').innerHTML =
      `${esc(name)} · ${esc(data.phone)}${crm.customer_code ? ` · <span style="font-family:ui-monospace,monospace;">${esc(crm.customer_code)}</span>` : ''}`;
    const avatarEl = root.querySelector('#pf-avatar');
    if (avatarEl) avatarEl.textContent = ccInitials(name);

    let activeTab = 'hoat-dong';
    let activity = null;        // { items, total, counts }
    let points = null;          // sổ cái tích điểm
    let promos = null;          // ưu đãi
    let notes = null;           // ghi chú
    let bought = null;          // sản phẩm đã mua
    let noteStatuses = null;    // danh sách trạng thái tương tác
    let actQuery = '';
    let actTypes = new Set();   // rỗng = xem tất cả

    const ACT_META = {
      message:     { icon: '💬', label: 'Tin nhắn',    color: '#0369a1' },
      note:        { icon: '📝', label: 'Ghi chú',     color: '#7c3aed' },
      order:       { icon: '🛍️', label: 'Đơn hàng',    color: '#15803d' },
      appointment: { icon: '📅', label: 'Lịch hẹn',    color: '#b45309' },
      event:       { icon: '⚡', label: 'Sự kiện',     color: '#0891b2' },
      lifecycle:   { icon: '🔄', label: 'Vòng đời',    color: '#be185d' },
    };

    async function loadPoints() {
      if (points || !data.phone) return;
      try {
        const res = await fetch(`${ORDER_API}/customer-points?phone=${encodeURIComponent(data.phone)}`, { headers: authHeaders() });
        points = res.ok ? await res.json() : { error: true };
      } catch (e) { points = { error: true }; }
    }

    async function loadPromos() {
      if (promos || !data.phone) return;
      try {
        const res = await fetch(`${ORDER_API}/promotions?phone=${encodeURIComponent(data.phone)}`, { headers: authHeaders() });
        promos = res.ok ? await res.json() : { error: true };
      } catch (e) { promos = { error: true }; }
    }

    async function loadBought() {
      if (bought || !data.phone) return;
      try {
        const res = await fetch(`${ORDER_API}/customer-products?phone=${encodeURIComponent(data.phone)}`, { headers: authHeaders() });
        bought = res.ok ? await res.json() : { error: true };
      } catch (e) { bought = { error: true }; }
    }

    async function loadNotes() {
      try {
        const [nRes, sRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/notes?conversationId=${encodeURIComponent(convId)}`, { headers: authHeaders() }),
          noteStatuses ? null : fetch(`${API_BASE}/api/v1/notes/statuses`, { headers: authHeaders() }),
        ]);
        notes = nRes.ok ? (await nRes.json()).notes || [] : [];
        if (sRes) noteStatuses = sRes.ok ? (await sRes.json()).statuses || [] : [];
      } catch (e) {
        notes = notes || [];
        noteStatuses = noteStatuses || [];
      }
    }

    /** Màu nhãn theo mức độ — đọc lướt là biết cuộc liên hệ đi tới đâu. */
    const NOTE_TONE = {
      muted:   ['#64748b', '#f1f5f9'],
      info:    ['#0369a1', '#e0f2fe'],
      warning: ['#b45309', '#fef3c7'],
      success: ['#15803d', '#dcfce7'],
      danger:  ['#b91c1c', '#fee2e2'],
    };

    async function loadActivity() {
      const qs = new URLSearchParams({ conversationId: convId });
      if (actQuery.trim()) qs.set('q', actQuery.trim());
      if (actTypes.size) qs.set('types', [...actTypes].join(','));
      try {
        const res = await fetch(`${ORDER_API}/customer-activity?${qs}`, { headers: authHeaders() });
        activity = res.ok ? await res.json() : { items: [], total: 0, counts: {} };
      } catch (e) {
        activity = { items: [], total: 0, counts: {} };
      }
    }

    function renderBody() {
      const body = root.querySelector('#pf-body');
      const tabs = [
        { id: 'hoat-dong', label: 'Hoạt động' },
        { id: 'ghi-chu', label: `Ghi chú${notes ? ` (${notes.length})` : ''}` },
        { id: 'mua-hang', label: `Lịch sử mua hàng (${orders.length})` },
        { id: 'san-pham', label: `Sản phẩm đã mua${bought ? ` (${bought.total})` : ''}` },
        { id: 'diem', label: 'Lịch sử tích điểm' },
        { id: 'uu-dai', label: 'Ưu đãi đang có' },
        { id: 'lich', label: 'Lịch & nhắc' },
        { id: 'ho-so', label: 'Đặc thù & nhu cầu' },
      ];

      body.innerHTML = `
        <!-- Thông tin cơ bản -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:14px;">
          <div style="font-size:11px; font-weight:700; color:#64748b; letter-spacing:.06em; margin-bottom:6px;">THÔNG TIN CƠ BẢN</div>
          ${infoRow('Mã khách hàng', crm.customer_code)}
          ${infoRow('Tên CRM (tên thật)', crm.full_name)}
          ${infoRow('Tên hiển thị Zalo', cm.zaloName)}
          ${infoRow('Số điện thoại', data.phone)}
          ${infoRow('SĐT liên hệ khác', crm.phone2)}
          ${infoRow('Email', cm.email)}
          ${infoRow('Nghề nghiệp', crm.occupation)}
          ${infoRow('Nguồn khách hàng', crm.referral_source || cm.source)}
          ${infoRow('Cấp Vip', crm.cap_vip || crm.priority_level || crm.nhom_kh)}
          ${infoRow('Người phụ trách', crm.staff_in_charge)}
          ${infoRow('Địa chỉ', crm.address || cm.address)}
          ${infoRow('Địa chỉ 2', crm.address2)}
        </div>

        <!-- Số liệu mua hàng -->
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px;">
          ${[
            ['Tổng chi tiêu', fmtVnd(crm.gmv_total), '#15803d'],
            ['Số đơn', String(crm.order_count ?? orders.length), '#0f172a'],
            ['Giá trị TB/đơn', fmtVnd(crm.aov), '#0f172a'],
          ].map(([l, v, c]) => `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:9px 10px;">
              <div style="font-size:10.5px; color:#64748b; margin-bottom:2px;">${l}</div>
              <div style="font-size:13.5px; font-weight:700; color:${c};">${v}</div>
            </div>`).join('')}
        </div>

        <!-- Tab -->
        <div style="display:flex; gap:4px; border-bottom:1px solid #e2e8f0; margin-bottom:12px;">
          ${tabs.map(t => `
            <button type="button" class="pf-tab" data-tab="${t.id}" style="
              border:none; background:none; cursor:pointer; padding:7px 10px; font-size:12.5px;
              font-weight:${t.id === activeTab ? '700' : '500'};
              color:${t.id === activeTab ? '#16a34a' : '#64748b'};
              border-bottom:2px solid ${t.id === activeTab ? '#16a34a' : 'transparent'};
              margin-bottom:-1px;">${t.label}</button>`).join('')}
        </div>
        <div id="pf-tab-body">${renderTab()}</div>`;

      body.querySelectorAll('.pf-tab').forEach(b => {
        b.onclick = async () => {
          activeTab = b.dataset.tab;
          renderBody();
          // Nạp lười: chỉ gọi mạng khi nhân viên thật sự mở tab đó.
          if (activeTab === 'diem' && !points) { await loadPoints(); renderBody(); }
          if (activeTab === 'uu-dai' && !promos) { await loadPromos(); renderBody(); }
          if (activeTab === 'ghi-chu' && !notes) { await loadNotes(); renderBody(); }
          if (activeTab === 'san-pham' && !bought) { await loadBought(); renderBody(); }
          if (activeTab === 'hoat-dong' && !activity) { await loadActivity(); renderBody(); }
        };
      });
      if (activeTab === 'lich') bindSchedule();
      if (activeTab === 'hoat-dong') bindActivity();
      if (activeTab === 'ghi-chu') bindNotes();
    }

    function renderTab() {
      if (activeTab === 'hoat-dong') {
        if (!activity) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Đang tải hoạt động…</div>`;

        const chips = Object.entries(ACT_META).map(([type, m]) => {
          const n = activity.counts[type] || 0;
          const on = actTypes.has(type);
          return `<button type="button" class="act-chip" data-type="${type}" ${n ? '' : 'disabled'} style="
            border:1px solid ${on ? m.color : '#e2e8f0'}; background:${on ? m.color + '15' : '#fff'};
            color:${n ? (on ? m.color : '#64748b') : '#cbd5e1'};
            padding:3px 9px; border-radius:999px; font-size:11.5px; font-weight:${on ? '700' : '500'};
            cursor:${n ? 'pointer' : 'default'};">${m.icon} ${m.label}${n ? ` ${n}` : ''}</button>`;
        }).join('');

        const list = activity.items.length ? activity.items.map(i => {
          const m = ACT_META[i.type] || { icon: '•', label: i.type, color: '#64748b' };
          const when = fmtDateTime(i.at) || '';
          return `
            <div style="display:flex; gap:9px; padding:9px 0; border-bottom:1px solid #f1f5f9;">
              <div style="flex:none; width:22px; text-align:center; font-size:14px;">${m.icon}</div>
              <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
                  <span style="font-size:12.5px; font-weight:600; color:${m.color};">${esc(i.title)}</span>
                  <span style="font-size:11px; color:#94a3b8; flex:none;">${when}</span>
                </div>
                ${i.detail ? `<div style="font-size:12px; color:#475569; margin-top:2px; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${esc(i.detail)}</div>` : ''}
                ${i.meta?.status ? `<span style="display:inline-block; margin-top:4px; font-size:10.5px; padding:1px 6px; border-radius:4px; background:#f1f5f9; color:#475569;">${esc(i.meta.status)}</span>` : ''}
              </div>
            </div>`;
        }).join('') : `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">
            ${actQuery || actTypes.size ? 'Không có hoạt động nào khớp bộ lọc.' : 'Chưa có hoạt động nào.'}
          </div>`;

        return `
          <input type="text" id="act-search" class="chatmql-form-input" placeholder="Tìm trong hoạt động…" value="${esc(actQuery)}" style="margin-bottom:8px;" />
          <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px;">${chips}</div>
          <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">${activity.total} hoạt động</div>
          ${list}`;
      }

      if (activeTab === 'ghi-chu') {
        if (!notes) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Đang tải ghi chú…</div>`;

        const statusOpts = (noteStatuses || []).map(st =>
          `<option value="${st.value}">${esc(st.label)}</option>`).join('');

        const badge = st => {
          const meta = (noteStatuses || []).find(x => x.value === st);
          if (!meta) return '';
          const [fg, bg] = NOTE_TONE[meta.tone] || NOTE_TONE.muted;
          return `<span style="font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px; color:${fg}; background:${bg};">${esc(meta.label)}</span>`;
        };

        return `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 13px; margin-bottom:14px;">
            <div style="font-size:12.5px; font-weight:700; color:#0f172a; margin-bottom:8px;">📝 Thêm ghi chú mới</div>
            <select id="note-status" class="chatmql-form-select" style="margin-bottom:8px;">
              <option value="">— Chọn trạng thái cuộc gọi/tương tác —</option>
              ${statusOpts}
            </select>
            <textarea id="note-content" class="chatmql-form-input" rows="3" placeholder="Nội dung trao đổi với khách…"></textarea>
            <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
              <button type="button" id="note-add" style="padding:7px 15px; font-size:12.5px; font-weight:700; color:#fff; background:linear-gradient(135deg,#16a34a,#15803d); border:none; border-radius:6px; cursor:pointer;">⊕ Thêm ghi chú</button>
              <span id="note-msg" style="font-size:12px;"></span>
            </div>
          </div>

          ${!notes.length ? `<div style="text-align:center; padding:22px 0; color:#94a3b8; font-size:12.5px;">Chưa có ghi chú nào.</div>` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${notes.map(n => `
                <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#fff;">
                  <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:5px;">
                    <div style="display:flex; gap:7px; align-items:center; min-width:0;">
                      ${n.status ? badge(n.status) : ''}
                      <span style="font-size:11.5px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(n.createdBy?.fullName || 'Nhân viên')}</span>
                    </div>
                    <span style="font-size:11px; color:#94a3b8; flex:none;">${fmtDateTime(n.createdAt) || ''}</span>
                  </div>
                  <div style="font-size:12.5px; color:#334155; line-height:1.55; white-space:pre-wrap; word-break:break-word;">${esc(n.content)}</div>
                </div>`).join('')}
            </div>`}`;
      }

      if (activeTab === 'san-pham') {
        if (!bought) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Đang tải…</div>`;
        if (bought.error) return `<div style="text-align:center; padding:26px 0; color:#dc2626; font-size:12.5px;">Không tải được danh sách sản phẩm.</div>`;
        if (!bought.total) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Khách chưa mua sản phẩm nào.</div>`;

        return `
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:9px;">Gộp từ ${bought.order_count} đơn trong lịch sử mua hàng.</div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead><tr style="background:#f8fafc;">
                ${['Sản phẩm','SL','Số đơn','Mua gần nhất'].map(h =>
                  `<th style="text-align:left; padding:7px 8px; color:#64748b; font-weight:600; font-size:11px; white-space:nowrap; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${bought.products.map(p => `
                  <tr>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9;">
                      <div style="color:#0f172a; font-weight:600;">${esc(p.name || p.code)}${p.is_gift ? ' <span style="font-size:10.5px; color:#b45309; font-weight:600;">🎁 quà tặng</span>' : ''}</div>
                      <div style="font-family:ui-monospace,monospace; font-size:10.5px; color:#94a3b8;">${esc(p.code)}${p.unit ? ` · ${esc(p.unit)}` : ''}</div>
                    </td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${p.quantity}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#64748b; font-variant-numeric:tabular-nums;">${p.order_count}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">${fmtDate(p.last_bought_at) || '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      }

      if (activeTab === 'diem') {
        if (!points) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Đang tải sổ cái điểm…</div>`;
        if (points.error) return `<div style="text-align:center; padding:26px 0; color:#dc2626; font-size:12.5px;">Không tải được sổ cái điểm.</div>`;
        if (!points.entry_count) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Khách chưa có giao dịch tích điểm nào.</div>`;

        const warn = points.balance_mismatch ? `
          <div style="margin-bottom:10px; padding:9px 11px; background:#fef3c7; border:1px solid #fcd34d; border-radius:6px; font-size:11.5px; color:#92400e; line-height:1.55;">
            <b>Số dư cần đối soát.</b> Sổ cái ghi <b>${points.balance}</b> điểm nhưng cộng dồn các giao dịch ra <b>${points.computed_balance}</b>.
            Chưa nên dùng điểm của khách này để trừ tiền cho tới khi kế toán xác nhận.
          </div>` : '';

        return `
          ${warn}
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px;">
            ${[
              ['Tổng đã tích', '+' + points.total_earned, '#15803d'],
              ['Tổng đã tiêu', '-' + points.total_spent, '#b45309'],
              ['Điểm còn lại', String(points.balance), points.balance_mismatch ? '#b45309' : '#0f172a'],
            ].map(([l, v, c]) => `
              <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:9px 10px;">
                <div style="font-size:10.5px; color:#64748b; margin-bottom:2px;">${l}</div>
                <div style="font-size:15px; font-weight:700; color:${c};">${v}</div>
              </div>`).join('')}
          </div>
          ${points.rank ? `<div style="font-size:12px; color:#64748b; margin-bottom:10px;">Hạng: <b style="color:#0f172a;">${esc(points.rank)}</b>${points.rank_reward ? ` · ${esc(points.rank_reward)}` : ''}</div>` : ''}
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead><tr style="background:#f8fafc;">
                ${['Thời gian','Diễn giải','Điểm','Còn lại'].map(h => `<th style="text-align:left; padding:7px 8px; color:#64748b; font-weight:600; font-size:11px; white-space:nowrap; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${points.entries.map(e => `
                  <tr>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; white-space:nowrap; color:#475569;">${fmtDate(e.at) || '—'}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:#334155;">
                      ${esc(e.category)}${e.ref ? `<span style="display:block; font-size:10.5px; color:#94a3b8; font-family:ui-monospace,monospace;">${esc(e.ref)}</span>` : ''}
                    </td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; white-space:nowrap; color:${e.delta >= 0 ? '#15803d' : '#b45309'};">${e.delta >= 0 ? '+' : ''}${e.delta}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#64748b; white-space:nowrap;">${e.balance_after ?? '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      }

      if (activeTab === 'uu-dai') {
        if (!promos) return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Đang tải ưu đãi…</div>`;
        if (promos.error) return `<div style="text-align:center; padding:26px 0; color:#dc2626; font-size:12.5px;">Không tải được ưu đãi.</div>`;

        const card = p => {
          const state = p.used ? ['Đã dùng', '#94a3b8', '#f1f5f9']
            : p.eligible ? ['Đủ điều kiện', '#15803d', '#dcfce7']
            : ['Chưa đủ điều kiện', '#b45309', '#fef3c7'];
          return `
            <div style="border:1px solid #e2e8f0; border-radius:8px; padding:11px 13px; margin-bottom:8px; background:#fff;">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:start; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:700; color:#0f172a;">${esc(p.name)}</span>
                <span style="flex:none; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px; color:${state[1]}; background:${state[2]};">${state[0]}</span>
              </div>
              ${p.description ? `<div style="font-size:12px; color:#64748b; margin-bottom:5px;">${esc(p.description)}</div>` : ''}
              <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:11.5px; color:#475569;">
                ${p.code ? `<span>🏷️ <b style="font-family:ui-monospace,monospace;">${esc(p.code)}</b></span>` : ''}
                ${p.conditions_text.length ? `<span>✅ ${esc(p.conditions_text.join(' · '))}</span>` : ''}
                <span>📅 ${p.to ? `Đến ${fmtDate(p.to)}` : 'Không giới hạn'}</span>
              </div>
            </div>`;
        };

        const rieng = promos.promotions.filter(p => p.source === 'customer');
        const chung = promos.promotions.filter(p => p.source === 'system');
        return `
          <div style="font-size:12px; font-weight:700; color:#0f172a; margin-bottom:3px;">Ưu đãi của khách hàng</div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">Gắn riêng với khách này — theo hạng, số điểm và lịch sử mua.</div>
          ${rieng.length ? rieng.map(card).join('') : '<div style="font-size:12px; color:#cbd5e1; padding:8px 0 14px;">Chưa có ưu đãi riêng nào.</div>'}
          <div style="font-size:12px; font-weight:700; color:#0f172a; margin:14px 0 3px;">Ưu đãi chung từ hệ thống</div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:8px;">Chương trình đang chạy cho toàn hệ thống, khách nào cũng dùng được.</div>
          ${chung.length ? chung.map(card).join('') : '<div style="font-size:12px; color:#cbd5e1; padding:8px 0;">Chưa có chương trình nào đang chạy.</div>'}`;
      }

      if (activeTab === 'mua-hang') {
        if (!orders.length) {
          return `<div style="text-align:center; padding:26px 0; color:#94a3b8; font-size:12.5px;">Khách chưa có đơn hàng nào trong CRM.</div>`;
        }
        return `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="background:#f8fafc;">
                  ${['Thời gian', 'Mã HĐ', 'Số tiền', 'Trạng thái', 'Nhân viên'].map(h =>
                    `<th style="text-align:left; padding:7px 8px; color:#64748b; font-weight:600; font-size:11px; white-space:nowrap; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${orders.map(o => {
                  const done = o.status === 'Giao thành công';
                  return `
                    <tr>
                      <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; white-space:nowrap; color:#475569;">${fmtDate(o.created_at) || '—'}</td>
                      <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; font-family:ui-monospace,monospace; font-weight:600; color:#0f172a;">${esc(o.order_code)}</td>
                      <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#15803d; white-space:nowrap;">${fmtVnd(o.total_amount)}</td>
                      <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9;">
                        <span class="chatmql-order-status-badge ${done ? 'status-success' : 'status-pending'}">${esc(o.status || '—')}</span>
                      </td>
                      <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap;">${esc(o.seller || '—')}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:8px; font-size:11px; color:#94a3b8;">Gộp từ ${orders.length} đơn trong CRM.</div>`;
      }

      if (activeTab === 'lich') {
        return `
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label class="chatmql-form-label">Thời gian tiếp cận bán hàng kế tiếp</label>
              <input type="datetime-local" id="pf-sales-at" class="chatmql-form-input" value="${toLocalInput(crm.next_sales_at)}" />
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
                ${crm.next_sales_at ? `Đang đặt: ${fmtDateTime(crm.next_sales_at)}` : 'Chưa đặt lịch bán hàng'}
              </div>
            </div>
            <div>
              <label class="chatmql-form-label">Thời gian chăm sóc kế tiếp</label>
              <input type="datetime-local" id="pf-care-at" class="chatmql-form-input" value="${toLocalInput(crm.next_care_at)}" />
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
                ${crm.next_care_at ? `Đang đặt: ${fmtDateTime(crm.next_care_at)}` : 'Chưa đặt lịch chăm sóc'}
              </div>
            </div>
            <div>
              <label class="chatmql-form-label">Loại hẹn</label>
              <input type="text" id="pf-appt-type" class="chatmql-form-input" value="${esc(crm.appointment_type || '')}" placeholder="VD: Chăm sóc, Bán hàng" />
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button type="button" id="pf-save-sched" style="padding:8px 16px; font-size:13px; font-weight:700; color:#fff; background:linear-gradient(135deg,#16a34a,#15803d); border:none; border-radius:6px; cursor:pointer;">🕐 Cập nhật lịch</button>
              <span id="pf-sched-msg" style="font-size:12px;"></span>
            </div>
            <div style="font-size:11.5px; color:#94a3b8; line-height:1.6; border-top:1px solid #f1f5f9; padding-top:10px;">
              Lịch được lưu vào hồ sơ khách bên CRM, dùng chung với đội chăm sóc.
              Xóa trống ô rồi bấm cập nhật để hủy lịch.
            </div>
          </div>`;
      }

      // Đặc thù & nhu cầu
      const block = (title, value) => `
        <div style="margin-bottom:14px;">
          <div style="font-size:12px; font-weight:700; color:#0f172a; margin-bottom:5px;">${title}</div>
          <div style="font-size:12.5px; color:${value ? '#334155' : '#cbd5e1'}; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:9px 11px; white-space:pre-wrap; line-height:1.6;">${value ? esc(value) : 'Chưa có thông tin'}</div>
        </div>`;
      return block('📦 Đặc thù sản phẩm', crm.thich_dung_hang)
        + block('🧠 Nhu cầu sử dụng', crm.nhu_cau_sd)
        + block('📄 Ghi chú hồ sơ', crm.profile_note);
    }

    function bindNotes() {
      const btn = root.querySelector('#note-add');
      if (!btn) return;
      btn.onclick = async () => {
        const content = root.querySelector('#note-content').value.trim();
        const status = root.querySelector('#note-status').value;
        const msg = root.querySelector('#note-msg');

        if (!content) {
          msg.textContent = 'Chưa nhập nội dung ghi chú.';
          msg.style.color = '#b45309';
          return;
        }

        btn.disabled = true;
        msg.textContent = 'Đang lưu…';
        msg.style.color = '#64748b';
        try {
          const res = await fetch(`${API_BASE}/api/v1/notes`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              conversationId: convId,
              contactId: cm.id || undefined,
              content,
              // Chuỗi rỗng = ghi chú thường, backend hiểu là null.
              status: status || undefined,
            }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
          await loadNotes();
          // Ghi chú mới cũng là một hoạt động — làm mới dòng thời gian.
          activity = null;
          renderBody();
        } catch (e) {
          msg.textContent = '✗ ' + e.message;
          msg.style.color = '#dc2626';
          btn.disabled = false;
        }
      };
    }

    function bindActivity() {
      const box = root.querySelector('#pf-tab-body');
      if (!box) return;

      const search = box.querySelector('#act-search');
      if (search) {
        let timer = null;
        search.oninput = e => {
          actQuery = e.target.value;
          clearTimeout(timer);
          // Chờ ngừng gõ mới gọi mạng, và giữ con trỏ trong ô sau khi vẽ lại.
          timer = setTimeout(async () => {
            await loadActivity();
            renderBody();
            const again = root.querySelector('#act-search');
            if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
          }, 450);
        };
      }

      box.querySelectorAll('.act-chip').forEach(b => {
        if (b.disabled) return;
        b.onclick = async () => {
          const t = b.dataset.type;
          actTypes.has(t) ? actTypes.delete(t) : actTypes.add(t);
          await loadActivity();
          renderBody();
        };
      });
    }

    function bindSchedule() {
      const btn = root.querySelector('#pf-save-sched');
      if (!btn) return;
      btn.onclick = async () => {
        const msg = root.querySelector('#pf-sched-msg');
        const salesVal = root.querySelector('#pf-sales-at').value;
        const careVal = root.querySelector('#pf-care-at').value;
        const typeVal = root.querySelector('#pf-appt-type').value;

        btn.disabled = true;
        msg.textContent = 'Đang lưu…';
        msg.style.color = '#64748b';
        try {
          const res = await fetch(`${ORDER_API}/customer-schedule`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              phone: data.phone,
              // Ô trống -> chuỗi rỗng = xóa lịch (backend phân biệt với "không gửi").
              nextSalesAt: salesVal ? new Date(salesVal).toISOString() : '',
              nextCareAt: careVal ? new Date(careVal).toISOString() : '',
              appointmentType: typeVal,
            }),
          });
          const r = await res.json();
          if (!res.ok) throw new Error(r.error || r.detail || 'Lỗi ' + res.status);
          crm.next_sales_at = r.next_sales_at;
          crm.next_care_at = r.next_care_at;
          crm.appointment_type = r.appointment_type;
          msg.textContent = '✓ Đã lưu';
          msg.style.color = '#15803d';
          setTimeout(() => renderBody(), 900);
        } catch (e) {
          msg.textContent = '✗ ' + e.message;
          msg.style.color = '#dc2626';
          btn.disabled = false;
        }
      };
    }

    renderBody();
    // Tab mặc định là Hoạt động — nạp xong thì vẽ lại để hiện dữ liệu thật.
    loadActivity().then(() => { if (activeTab === 'hoat-dong') renderBody(); });
  };

  // ══ Đợt 4: Thư viện tài liệu ═════════════════════════════════════════
  //
  // Chỉ hiện tài liệu ĐÃ DUYỆT — backend lọc status='active' và kiểm tra lại
  // một lần nữa lúc gửi, phòng trường hợp mục bị rút duyệt giữa chừng.

  window.openLibraryPanel = async function () {
    const convId = getCurrentConversationId();
    if (!convId) {
      alert('Chưa xác định được hội thoại. Mở một cuộc trò chuyện rồi thử lại.');
      return;
    }

    document.querySelector('#chatmql-library')?.remove();
    const root = document.createElement('div');
    root.id = 'chatmql-library';
    root.className = 'chatmql-modal-overlay';
    root.innerHTML = `
      <div class="chatmql-modal" style="width:720px; max-height:86vh;">
        <div class="chatmql-modal-header">
          <div>
            <div style="font-weight:700; font-size:15px; color:#0f172a;">📚 Thư viện tài liệu</div>
            <div style="font-size:11.5px; color:#15803d; margin-top:2px;">
              🔒 Chỉ hiển thị tài liệu <b>đã duyệt</b> — được phép gửi ra ngoài cho khách.
            </div>
          </div>
          <button type="button" id="lib-close" style="border:none; background:none; font-size:22px; cursor:pointer; color:#64748b; line-height:1;">×</button>
        </div>
        <div class="chatmql-modal-body" id="lib-body">
          <div style="text-align:center; padding:40px 0; color:#94a3b8; font-size:13px;">Đang tải…</div>
        </div>
        <div class="chatmql-modal-footer">
          <span id="lib-count" style="margin-right:auto; font-size:12.5px; color:#64748b; align-self:center;"></span>
          <button type="button" id="lib-cancel" style="padding:8px 16px; font-size:13px; font-weight:600; color:#475569; background:#fff; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;">Đóng</button>
          <button type="button" id="lib-send" disabled style="padding:8px 18px; font-size:13px; font-weight:700; color:#fff; background:#cbd5e1; border:none; border-radius:6px; cursor:not-allowed;">📤 Gửi vào chat (0)</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#lib-close').onclick = () => root.remove();
    root.querySelector('#lib-cancel').onclick = () => root.remove();
    root.onclick = e => { if (e.target === root) root.remove(); };

    let kind = 'image';
    let query = '';
    let data = null;
    const selected = new Set();

    const KINDS = [
      { id: 'image',   label: '🖼️ Hình ảnh' },
      { id: 'content', label: '📄 Nội dung' },
      { id: 'video',   label: '🎬 Video' },
      { id: 'convo',   label: '💬 Trong hội thoại' },
    ];
    // Tab "Trong hội thoại" xem lại thứ ĐÃ trao đổi, khác ba tab kia là kho
    // nội dung đã duyệt để GỬI cho khách.
    let convoKind = 'media';
    let convoData = null;

    async function loadConvo() {
      try {
        const res = await fetch(
          `${ORDER_API}/conversation-library?conversationId=${encodeURIComponent(convId)}&kind=${convoKind}`,
          { headers: authHeaders() });
        convoData = res.ok ? await res.json() : { groups: [], total: 0, counts: {} };
      } catch (e) { convoData = { groups: [], total: 0, counts: {} }; }
    }

    async function load() {
      if (kind === 'convo') { await loadConvo(); return; }
      const qs = new URLSearchParams({ kind });
      if (query.trim()) qs.set('q', query.trim());
      try {
        const res = await fetch(`${ORDER_API.replace('/orders', '')}/library?${qs}`, { headers: authHeaders() });
        data = res.ok ? await res.json() : { groups: [], total: 0 };
      } catch (e) {
        data = { groups: [], total: 0 };
      }
    }

    function updateSendBtn() {
      const btn = root.querySelector('#lib-send');
      const n = selected.size;
      btn.textContent = `📤 Gửi vào chat (${n})`;
      btn.disabled = n === 0;
      btn.style.background = n ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#cbd5e1';
      btn.style.cursor = n ? 'pointer' : 'not-allowed';
      root.querySelector('#lib-count').textContent = data ? `${data.total} tài liệu đã duyệt` : '';
    }

    function render() {
      const body = root.querySelector('#lib-body');
      const tabs = KINDS.map(k => `
        <button type="button" class="lib-kind" data-kind="${k.id}" style="
          border:none; background:none; cursor:pointer; padding:7px 12px; font-size:13px;
          font-weight:${k.id === kind ? '700' : '500'};
          color:${k.id === kind ? '#16a34a' : '#64748b'};
          border-bottom:2px solid ${k.id === kind ? '#16a34a' : 'transparent'}; margin-bottom:-1px;">${k.label}</button>`).join('');

      if (kind === 'convo') {
        const c = convoData?.counts || {};
        const sub = [
          ['media', `🖼️ Ảnh/Video${c.media ? ` (${c.media})` : ''}`],
          ['file',  `📎 Files${c.file ? ` (${c.file})` : ''}`],
          ['link',  `🔗 Links${c.link ? ` (${c.link})` : ''}`],
        ].map(([id, label]) => `
          <button type="button" class="lib-convo-kind" data-kind="${id}" style="
            border:1px solid ${id === convoKind ? '#0369a1' : '#e2e8f0'};
            background:${id === convoKind ? '#e0f2fe' : '#fff'};
            color:${id === convoKind ? '#0369a1' : '#64748b'};
            padding:4px 11px; border-radius:999px; font-size:12px;
            font-weight:${id === convoKind ? '700' : '500'}; cursor:pointer;">${label}</button>`).join('');

        const body2 = !convoData ? '<div style="padding:30px; text-align:center; color:#94a3b8;">Đang tải…</div>'
          : !convoData.groups.length ? `<div style="padding:30px; text-align:center; color:#94a3b8; font-size:12.5px;">Hội thoại này chưa có ${convoKind === 'link' ? 'liên kết' : convoKind === 'file' ? 'tệp' : 'ảnh/video'} nào.</div>`
          : convoData.groups.map(g => `
              <div style="margin-bottom:14px;">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; margin-bottom:7px;">${fmtDate(g.date) || g.date}</div>
                ${convoKind === 'media' ? `
                  <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:7px;">
                    ${g.items.map(i => `
                      <a href="${esc(i.url || '#')}" target="_blank" rel="noopener" style="display:block; border:1px solid #e2e8f0; border-radius:7px; overflow:hidden; background:#f1f5f9; text-decoration:none;">
                        ${i.url ? `<img src="${esc(i.url)}" loading="lazy" style="width:100%; height:80px; object-fit:cover; display:block;" onerror="this.style.display='none'; this.parentElement.style.padding='22px 6px'; this.parentElement.textContent='🖼️ không tải được';" />` : '<div style="padding:22px 6px; text-align:center; color:#94a3b8; font-size:11px;">Không có ảnh</div>'}
                        <span style="display:block; padding:4px 6px; font-size:10.5px; color:#64748b;">${esc(i.sender)}</span>
                      </a>`).join('')}
                  </div>` : `
                  <div style="display:flex; flex-direction:column; gap:5px;">
                    ${g.items.map(i => `
                      <a href="${esc(i.url || '#')}" target="_blank" rel="noopener" style="display:flex; gap:9px; align-items:center; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; background:#fff; text-decoration:none;">
                        <span style="flex:none; font-size:15px;">${convoKind === 'link' ? '🔗' : '📎'}</span>
                        <span style="flex:1; min-width:0;">
                          <span style="display:block; font-size:12px; color:#0f172a; word-break:break-all;">${esc(i.title || i.url || '')}</span>
                          <span style="display:block; font-size:10.5px; color:#94a3b8; margin-top:2px;">${esc(i.host || i.sender)}${i.size ? ` · ${esc(i.size)}` : ''}</span>
                        </span>
                      </a>`).join('')}
                  </div>`}
              </div>`).join('');

        body.innerHTML = `
          <div style="display:flex; gap:4px; border-bottom:1px solid #e2e8f0; margin-bottom:12px;">${tabs}</div>
          <div style="display:flex; gap:6px; margin-bottom:12px;">${sub}</div>
          ${body2}`;

        body.querySelectorAll('.lib-kind').forEach(b => {
          b.onclick = async () => { kind = b.dataset.kind; await load(); render(); };
        });
        body.querySelectorAll('.lib-convo-kind').forEach(b => {
          b.onclick = async () => { convoKind = b.dataset.kind; await loadConvo(); render(); };
        });
        root.querySelector('#lib-count').textContent = `${convoData?.total || 0} mục trong hội thoại`;
        const sendBtn = root.querySelector('#lib-send');
        sendBtn.disabled = true;
        sendBtn.style.background = '#cbd5e1';
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.textContent = '📤 Gửi vào chat (0)';
        return;
      }

      const groups = !data ? '<div style="padding:30px; text-align:center; color:#94a3b8;">Đang tải…</div>'
        : !data.groups.length ? `<div style="padding:34px; text-align:center; color:#94a3b8; font-size:12.5px;">
            ${kind === 'video' ? 'Chưa có video nào được duyệt. Thêm video vào kho tri thức rồi duyệt để dùng ở đây.'
              : query ? 'Không có tài liệu nào khớp từ khoá.' : 'Chưa có tài liệu nào đã duyệt.'}
          </div>`
        : data.groups.map(g => `
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; font-weight:700; color:#0f172a; margin-bottom:7px;">${esc(g.name)} <span style="color:#94a3b8; font-weight:500;">(${g.items.length})</span></div>
              ${g.kind === 'content' ? `
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${g.items.map(i => `
                    <label style="display:flex; gap:8px; align-items:flex-start; padding:9px 11px; border:1px solid ${selected.has(i.id) ? '#16a34a' : '#e2e8f0'}; background:${selected.has(i.id) ? '#f0fdf4' : '#fff'}; border-radius:6px; cursor:pointer;">
                      <input type="checkbox" class="lib-pick" data-id="${i.id}" ${selected.has(i.id) ? 'checked' : ''} style="margin-top:2px; cursor:pointer;" />
                      <span style="flex:1; min-width:0;">
                        <span style="display:block; font-size:12.5px; font-weight:600; color:#0f172a;">${esc(i.title)}</span>
                        <span style="display:block; font-size:11.5px; color:#64748b; margin-top:3px; line-height:1.5; max-height:44px; overflow:hidden;">${esc((i.text || '').slice(0, 160))}</span>
                      </span>
                      <button type="button" class="lib-copy" data-id="${i.id}" title="Sao chép nội dung" style="flex:none; border:1px solid #e2e8f0; background:#fff; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer; color:#475569;">📋</button>
                    </label>`).join('')}
                </div>
              ` : `
                <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:8px;">
                  ${g.items.map(i => `
                    <label style="cursor:pointer; border:2px solid ${selected.has(i.id) ? '#16a34a' : '#e2e8f0'}; border-radius:7px; overflow:hidden; background:#fff; display:block; position:relative;">
                      <input type="checkbox" class="lib-pick" data-id="${i.id}" ${selected.has(i.id) ? 'checked' : ''} style="position:absolute; top:5px; left:5px; z-index:2; cursor:pointer;" />
                      <span class="lib-thumb" style="display:block; width:100%; height:88px; background:#f1f5f9; position:relative;">
                        <img src="${esc(i.url)}" alt="${esc(i.title)}" loading="lazy"
                          style="width:100%; height:100%; object-fit:cover; display:block;"
                          onerror="this.style.display='none'; this.parentElement.querySelector('.lib-noimg').style.display='flex';" />
                        <span class="lib-noimg" style="display:none; position:absolute; inset:0; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:#94a3b8; font-size:10.5px; text-align:center; padding:4px;">
                          <span style="font-size:17px;">🖼️</span>
                          <span>Chưa có file ảnh</span>
                        </span>
                      </span>
                      <span style="display:block; padding:5px 6px; font-size:11px; color:#334155; line-height:1.35; height:32px; overflow:hidden;">${esc(i.title)}</span>
                    </label>`).join('')}
                </div>`}
            </div>`).join('');

      body.innerHTML = `
        <div style="display:flex; gap:4px; border-bottom:1px solid #e2e8f0; margin-bottom:12px;">${tabs}</div>
        <div id="lib-warn" style="display:none; margin-bottom:10px; padding:8px 11px; background:#fef3c7; border:1px solid #fcd34d; border-radius:6px; font-size:11.5px; color:#92400e;"></div>
        <input type="text" id="lib-search" class="chatmql-form-input" placeholder="Tìm tài liệu…" value="${esc(query)}" style="margin-bottom:12px;" />
        ${groups}`;

      body.querySelectorAll('.lib-kind').forEach(b => {
        b.onclick = async () => { kind = b.dataset.kind; await load(); render(); };
      });

      const search = body.querySelector('#lib-search');
      let timer = null;
      search.oninput = e => {
        query = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await load(); render();
          const again = root.querySelector('#lib-search');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }, 400);
      };

      body.querySelectorAll('.lib-pick').forEach(c => {
        c.onchange = e => {
          e.stopPropagation();
          const id = c.dataset.id;
          c.checked ? selected.add(id) : selected.delete(id);
          render();
        };
      });

      body.querySelectorAll('.lib-copy').forEach(b => {
        b.onclick = async e => {
          e.preventDefault(); e.stopPropagation();
          const item = data.groups.flatMap(g => g.items).find(i => i.id === b.dataset.id);
          if (!item?.text) return;
          try {
            await navigator.clipboard.writeText(item.text);
            b.textContent = '✓';
            setTimeout(() => { b.textContent = '📋'; }, 1200);
          } catch { alert('Trình duyệt chặn sao chép. Bôi đen và copy tay giúp em.'); }
        };
      });

      updateSendBtn();

      // Đếm ảnh không tải được sau khi trình duyệt thử xong, rồi báo một lần
      // thay vì để nhân viên nhìn một lưới ô xám không hiểu vì sao.
      setTimeout(() => {
        const imgs = [...body.querySelectorAll('.lib-thumb img')];
        const broken = imgs.filter(im => im.complete && im.naturalWidth === 0).length;
        const warn = body.querySelector('#lib-warn');
        if (warn && broken) {
          warn.style.display = 'block';
          warn.innerHTML = `<b>${broken}/${imgs.length} ảnh chưa tải được.</b> `
            + 'Dữ liệu sản phẩm có ghi đường dẫn ảnh nhưng file chưa có trên máy chủ này. '
            + 'Trên môi trường thật ảnh sẽ hiển thị bình thường.';
        }
      }, 1500);
    }

    root.querySelector('#lib-send').onclick = async () => {
      const btn = root.querySelector('#lib-send');
      btn.disabled = true;
      btn.textContent = '⏳ Đang gửi…';
      try {
        const res = await fetch(`${ORDER_API.replace('/orders', '')}/library/send`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ conversationId: convId, itemIds: [...selected] }),
        });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error || 'Lỗi ' + res.status);
        const bad = (r.skipped || []).length;
        alert(bad
          ? `Đã gửi ${r.sent} tài liệu.\n\n${bad} mục không gửi được:\n` +
            r.skipped.map(s => `  • ${s.reason}`).join('\n')
          : `✓ Đã gửi ${r.sent} tài liệu vào hội thoại.`);
        root.remove();
      } catch (e) {
        alert('Không gửi được: ' + e.message);
        btn.disabled = false;
        updateSendBtn();
      }
    };

    await load();
    render();
  };

  // ══ Màn hình quản trị ưu đãi ═════════════════════════════════════════
  //
  // Chỉ owner/admin/manager mở được — backend chặn 403, ở đây chặn thêm để
  // không hiện nút cho người không có quyền.

  const ADMIN_API = `${API_BASE}/api/v1/admin/promotions`;

  const PROMO_TYPES = [
    { id: 'percent',  label: 'Giảm theo %',       hint: 'Giảm N% tiền hàng' },
    { id: 'amount',   label: 'Giảm số tiền',      hint: 'Giảm cố định N đồng' },
    { id: 'freeship', label: 'Miễn phí vận chuyển', hint: 'Phí ship về 0' },
    { id: 'gift',     label: 'Tặng quà',          hint: 'Ghi nhận để nhân viên tự thêm quà vào đơn' },
  ];
  const PROMO_STATUS = [
    { id: 'active', label: 'Đang chạy', color: '#15803d', bg: '#dcfce7' },
    { id: 'paused', label: 'Tạm dừng',  color: '#b45309', bg: '#fef3c7' },
    { id: 'ended',  label: 'Kết thúc',  color: '#64748b', bg: '#f1f5f9' },
  ];
  const COND_FIELDS = [
    { key: 'min_purchase_count', label: 'Đã mua tối thiểu (lần)', type: 'number' },
    { key: 'min_gmv',            label: 'Tổng chi tiêu tối thiểu (đ)', type: 'number' },
    { key: 'min_points',         label: 'Điểm tối thiểu', type: 'number' },
    { key: 'customer_groups',    label: 'Nhóm KH (cách nhau dấu phẩy)', type: 'text' },
    { key: 'birthday_month',     label: 'Chỉ trong tháng sinh nhật', type: 'bool' },
  ];

  function isPromoAdmin() {
    return ['owner', 'admin', 'manager'].includes(tokenClaims().role);
  }

  window.openPromotionAdmin = async function () {
    if (!isPromoAdmin()) {
      alert('Chỉ chủ tài khoản, quản trị viên và quản lý mới quản lý được ưu đãi.');
      return;
    }

    document.querySelector('#chatmql-promo-admin')?.remove();
    const root = document.createElement('div');
    root.id = 'chatmql-promo-admin';
    root.className = 'chatmql-modal-overlay';
    root.innerHTML = `
      <div class="chatmql-modal" style="width:900px; max-height:90vh;">
        <div class="chatmql-modal-header">
          <div>
            <div style="font-weight:700; font-size:15px; color:#0f172a;">⚙️ Quản trị</div>
            <div id="pa-sub" style="font-size:11.5px; color:#64748b; margin-top:2px;">Đang tải…</div>
          </div>
          <button type="button" id="pa-close" style="border:none; background:none; font-size:22px; cursor:pointer; color:#64748b; line-height:1;">×</button>
        </div>
        <div class="chatmql-modal-body" id="pa-body"></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#pa-close').onclick = () => root.remove();
    root.onclick = e => { if (e.target === root) root.remove(); };

    let list = [];
    let section = 'promo';    // promo | points
    let recon = null;
    let view = 'list';        // list | form | customers
    let editing = null;       // ưu đãi đang sửa (null = tạo mới)
    let assignTarget = null;
    let assigned = [];
    let filterStatus = '';
    let searchQ = '';

    async function loadList() {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);
      if (searchQ.trim()) qs.set('q', searchQ.trim());
      try {
        const res = await fetch(`${ADMIN_API}${qs.toString() ? '?' + qs : ''}`, { headers: authHeaders() });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
        list = d.promotions || [];
      } catch (e) {
        list = [];
        console.warn('[promo-admin]', e);
      }
    }

    const statusMeta = id => PROMO_STATUS.find(s => s.id === id) || PROMO_STATUS[2];

    function valueText(p) {
      if (p.type === 'percent') return `${p.value}%` + (p.max_discount ? ` (tối đa ${vnd(p.max_discount)}đ)` : '');
      if (p.type === 'amount') return `${vnd(p.value)}đ`;
      if (p.type === 'freeship') return 'Miễn ship';
      return 'Tặng quà';
    }

    function sectionTabs() {
      const tab = (id, label) => `
        <button type="button" class="pa-section" data-section="${id}" style="
          border:none; background:none; cursor:pointer; padding:7px 12px; font-size:13px;
          font-weight:${id === section ? '700' : '500'};
          color:${id === section ? '#16a34a' : '#64748b'};
          border-bottom:2px solid ${id === section ? '#16a34a' : 'transparent'}; margin-bottom:-1px;">${label}</button>`;
      return `<div style="display:flex; gap:4px; border-bottom:1px solid #e2e8f0; margin-bottom:14px;">
        ${tab('promo', '🏷️ Ưu đãi')}${tab('points', '🧮 Đối soát điểm')}
      </div>`;
    }

    function bindSectionTabs() {
      root.querySelectorAll('.pa-section').forEach(b => {
        b.onclick = async () => {
          section = b.dataset.section;
          if (section === 'points') { if (!recon) await loadRecon(); renderRecon(); }
          else { view = 'list'; renderList(); }
        };
      });
    }

    async function loadRecon() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/admin/points-reconcile?limit=200`, { headers: authHeaders() });
        recon = res.ok ? await res.json() : { error: true };
      } catch (e) { recon = { error: true }; }
    }

    function renderRecon() {
      const b = root.querySelector('#pa-body');
      if (!recon || recon.error) {
        root.querySelector('#pa-sub').textContent = 'Đối soát điểm';
        b.innerHTML = sectionTabs() + '<div style="padding:30px; text-align:center; color:#94a3b8; font-size:12.5px;">Không tải được dữ liệu đối soát.</div>';
        bindSectionTabs();
        return;
      }

      const s2 = recon.summary;
      root.querySelector('#pa-sub').textContent = `${s2.mismatched} khách cần đối soát`;
      b.innerHTML = sectionTabs() + `
        <div style="padding:11px 13px; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; margin-bottom:14px; font-size:12px; color:#92400e; line-height:1.6;">
          Số dư điểm được tính bằng hai cách và chúng đang lệch nhau ở một số khách:
          <b>sổ cái</b> là cột số dư hệ CRM tự giữ sau mỗi giao dịch, <b>cộng dồn</b> là tổng tất cả
          giao dịch. Khách nào lệch nghĩa là sổ cái có lỗi — chưa nên dùng điểm của họ để trừ tiền
          cho tới khi kế toán xác nhận con số đúng.
        </div>

        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
          ${[
            ['Khách có điểm', s2.customers_with_points, '#0f172a'],
            ['Khớp', s2.matched, '#15803d'],
            ['Lệch', s2.mismatched, '#b45309'],
            ['Tổng chênh', formatDot(s2.total_gap) + ' điểm', '#b91c1c'],
          ].map(([l, v, c]) => `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:9px 10px;">
              <div style="font-size:10.5px; color:#64748b; margin-bottom:2px;">${l}</div>
              <div style="font-size:15px; font-weight:700; color:${c};">${v}</div>
            </div>`).join('')}
        </div>

        ${!recon.items.length ? '<div style="text-align:center; padding:26px 0; color:#15803d; font-size:12.5px;">✓ Toàn bộ sổ cái điểm đều khớp.</div>' : `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px; min-width:640px;">
              <thead><tr style="background:#f8fafc;">
                ${['Số điện thoại','Tên khách','Mã KH','Sổ cái','Cộng dồn','Lệch','Giao dịch'].map(h =>
                  `<th style="text-align:left; padding:7px 8px; color:#64748b; font-weight:600; font-size:11px; white-space:nowrap; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${recon.items.map(i => `
                  <tr>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; font-family:ui-monospace,monospace;">${esc(i.phone)}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:${i.name ? '#0f172a' : '#cbd5e1'};">${esc(i.name || 'Chưa có trong CRM')}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:#64748b;">${esc(i.customer_code || '—')}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-variant-numeric:tabular-nums;">${i.ledger_balance}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-variant-numeric:tabular-nums;">${i.computed_balance}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; color:${Math.abs(i.gap) >= 50 ? '#b91c1c' : '#b45309'};">${i.gap > 0 ? '+' : ''}${i.gap}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#94a3b8;">${i.entry_count}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:8px; font-size:11px; color:#94a3b8;">Hiện ${recon.returned}/${s2.mismatched} khách, sắp xếp theo mức lệch giảm dần.</div>`}`;

      bindSectionTabs();
    }

    function renderList() {
      root.querySelector('#pa-sub').textContent = `${list.length} ưu đãi`;
      root.querySelector('#pa-body').innerHTML = sectionTabs() + `
        <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center;">
          <input type="text" id="pa-search" class="chatmql-form-input" placeholder="Tìm theo tên hoặc mã…" value="${esc(searchQ)}" style="flex:1;" />
          <select id="pa-status" class="chatmql-form-select" style="width:150px;">
            <option value="">Tất cả trạng thái</option>
            ${PROMO_STATUS.map(s => `<option value="${s.id}" ${s.id === filterStatus ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          <button type="button" id="pa-new" style="flex:none; padding:8px 16px; font-size:13px; font-weight:700; color:#fff; background:linear-gradient(135deg,#16a34a,#15803d); border:none; border-radius:6px; cursor:pointer;">+ Tạo ưu đãi</button>
        </div>

        ${!list.length ? `<div style="text-align:center; padding:34px 0; color:#94a3b8; font-size:12.5px;">
            ${searchQ || filterStatus ? 'Không có ưu đãi nào khớp bộ lọc.' : 'Chưa có ưu đãi nào. Bấm "Tạo ưu đãi" để bắt đầu.'}
          </div>` : `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px; min-width:760px;">
              <thead><tr style="background:#f8fafc;">
                ${['Tên & mã','Loại / Giá trị','Phạm vi','Hiệu lực','Trạng thái','Đã dùng',''].map(h =>
                  `<th style="text-align:left; padding:8px; color:#64748b; font-weight:600; font-size:11px; white-space:nowrap; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${list.map(p => {
                  const st = statusMeta(p.status);
                  return `
                  <tr>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9;">
                      <div style="font-weight:600; color:#0f172a;">${esc(p.name)}</div>
                      ${p.code ? `<div style="font-family:ui-monospace,monospace; font-size:10.5px; color:#0369a1;">${esc(p.code)}</div>` : '<div style="font-size:10.5px; color:#cbd5e1;">tự động áp</div>'}
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; color:#334155; white-space:nowrap;">${valueText(p)}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">
                      ${p.scope === 'system'
                        ? '<span style="color:#0369a1;">Toàn hệ thống</span>'
                        : `<span style="color:#7c3aed;">Riêng khách</span> <span style="color:#94a3b8;">(${p.assigned_count})</span>`}
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; color:#64748b; white-space:nowrap; font-size:11px;">
                      ${p.valid_from ? fmtDate(p.valid_from) : '—'} → ${p.valid_to ? fmtDate(p.valid_to) : 'không hạn'}
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9;">
                      <span style="font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:4px; color:${st.color}; background:${st.bg};">${st.label}</span>
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; text-align:right; color:#475569; white-space:nowrap;">
                      ${p.used_count}${p.max_uses ? ` / ${p.max_uses}` : ''}
                    </td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; white-space:nowrap; text-align:right;">
                      <button type="button" class="pa-edit" data-id="${p.id}" style="border:1px solid #e2e8f0; background:#fff; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer; color:#334155;">Sửa</button>
                      ${p.scope === 'customer' ? `<button type="button" class="pa-assign" data-id="${p.id}" style="border:1px solid #ddd6fe; background:#f5f3ff; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer; color:#6d28d9; margin-left:3px;">Khách</button>` : ''}
                      <button type="button" class="pa-del" data-id="${p.id}" style="border:1px solid #fecaca; background:#fff; border-radius:4px; padding:3px 7px; font-size:11px; cursor:pointer; color:#dc2626; margin-left:3px;">🗑</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}`;

      bindSectionTabs();
      const search = root.querySelector('#pa-search');
      let timer = null;
      search.oninput = e => {
        searchQ = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await loadList(); renderList();
          const again = root.querySelector('#pa-search');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }, 400);
      };
      root.querySelector('#pa-status').onchange = async e => {
        filterStatus = e.target.value; await loadList(); renderList();
      };
      root.querySelector('#pa-new').onclick = () => { editing = null; view = 'form'; renderForm(); };
      root.querySelectorAll('.pa-edit').forEach(b => {
        b.onclick = () => { editing = list.find(p => p.id === +b.dataset.id); view = 'form'; renderForm(); };
      });
      root.querySelectorAll('.pa-assign').forEach(b => {
        b.onclick = async () => {
          assignTarget = list.find(p => p.id === +b.dataset.id);
          view = 'customers'; await loadAssigned(); renderCustomers();
        };
      });
      root.querySelectorAll('.pa-del').forEach(b => {
        b.onclick = async () => {
          const p = list.find(x => x.id === +b.dataset.id);
          if (!confirm(`Xóa ưu đãi "${p.name}"?\n\nThao tác này không hoàn tác được.`)) return;
          try {
            const res = await fetch(`${ADMIN_API}/${p.id}`, { method: 'DELETE', headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
            await loadList(); renderList();
          } catch (e) { alert('Không xóa được: ' + e.message); }
        };
      });
    }

    function renderForm() {
      const p = editing || {
        code: '', name: '', description: '', type: 'percent', value: 0,
        max_discount: null, min_order: 0, scope: 'system', conditions: {},
        valid_from: null, valid_to: null, status: 'active', max_uses: null,
      };
      root.querySelector('#pa-sub').textContent = editing ? `Sửa: ${editing.name}` : 'Tạo ưu đãi mới';
      const c = p.conditions || {};

      root.querySelector('#pa-body').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="chatmql-form-group" style="grid-column:1/-1;">
            <label class="chatmql-form-label">Tên ưu đãi *</label>
            <input type="text" id="f-name" class="chatmql-form-input" value="${esc(p.name)}" placeholder="VD: Giảm 10% cho khách VIP" />
          </div>
          <div class="chatmql-form-group" style="grid-column:1/-1;">
            <label class="chatmql-form-label">Mô tả</label>
            <input type="text" id="f-desc" class="chatmql-form-input" value="${esc(p.description || '')}" placeholder="Hiện cho nhân viên xem" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Mã ưu đãi</label>
            <input type="text" id="f-code" class="chatmql-form-input" value="${esc(p.code || '')}" placeholder="Bỏ trống = tự động áp" style="text-transform:uppercase;" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Phạm vi *</label>
            <select id="f-scope" class="chatmql-form-select">
              <option value="system" ${p.scope === 'system' ? 'selected' : ''}>Toàn hệ thống — khách nào cũng dùng</option>
              <option value="customer" ${p.scope === 'customer' ? 'selected' : ''}>Riêng khách — phải gán từng người</option>
            </select>
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Loại ưu đãi *</label>
            <select id="f-type" class="chatmql-form-select">
              ${PROMO_TYPES.map(t => `<option value="${t.id}" ${t.id === p.type ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            <div id="f-type-hint" style="font-size:11px; color:#94a3b8; margin-top:4px;">${PROMO_TYPES.find(t => t.id === p.type)?.hint || ''}</div>
          </div>
          <div class="chatmql-form-group" id="f-value-wrap">
            <label class="chatmql-form-label" id="f-value-label">Giá trị *</label>
            <input type="number" id="f-value" class="chatmql-form-input" value="${p.value || 0}" min="0" />
          </div>
          <div class="chatmql-form-group" id="f-max-wrap">
            <label class="chatmql-form-label">Giảm tối đa (đ)</label>
            <input type="number" id="f-max" class="chatmql-form-input" value="${p.max_discount ?? ''}" min="0" placeholder="Bỏ trống = không giới hạn" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Đơn tối thiểu (đ)</label>
            <input type="number" id="f-min" class="chatmql-form-input" value="${p.min_order || 0}" min="0" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Từ ngày</label>
            <input type="datetime-local" id="f-from" class="chatmql-form-input" value="${toLocalInput(p.valid_from)}" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Đến ngày</label>
            <input type="datetime-local" id="f-to" class="chatmql-form-input" value="${toLocalInput(p.valid_to)}" />
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Trạng thái *</label>
            <select id="f-status" class="chatmql-form-select">
              ${PROMO_STATUS.map(s => `<option value="${s.id}" ${s.id === p.status ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="chatmql-form-group">
            <label class="chatmql-form-label">Giới hạn lượt dùng</label>
            <input type="number" id="f-uses" class="chatmql-form-input" value="${p.max_uses ?? ''}" min="1" placeholder="Bỏ trống = không giới hạn" />
          </div>
        </div>

        <div style="border-top:1px solid #e2e8f0; margin-top:6px; padding-top:12px;">
          <div style="font-size:12.5px; font-weight:700; color:#0f172a; margin-bottom:3px;">Điều kiện áp dụng</div>
          <div style="font-size:11.5px; color:#94a3b8; margin-bottom:10px;">Bỏ trống nghĩa là không ràng buộc. Khách phải thỏa <b>tất cả</b> điều kiện đã điền.</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${COND_FIELDS.map(f => f.type === 'bool' ? `
              <label style="display:flex; align-items:center; gap:7px; font-size:12.5px; color:#334155; cursor:pointer;">
                <input type="checkbox" id="c-${f.key}" ${c[f.key] ? 'checked' : ''} style="cursor:pointer;" /> ${f.label}
              </label>` : `
              <div class="chatmql-form-group" style="margin-bottom:0;">
                <label class="chatmql-form-label">${f.label}</label>
                <input type="${f.type}" id="c-${f.key}" class="chatmql-form-input"
                  value="${esc(Array.isArray(c[f.key]) ? c[f.key].join(', ') : (c[f.key] ?? ''))}" />
              </div>`).join('')}
          </div>
        </div>

        <div id="f-msg" style="margin-top:12px; font-size:12.5px;"></div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px; border-top:1px solid #e2e8f0; padding-top:12px;">
          <button type="button" id="f-cancel" style="padding:8px 16px; font-size:13px; font-weight:600; color:#475569; background:#fff; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;">Quay lại</button>
          <button type="button" id="f-save" style="padding:8px 20px; font-size:13px; font-weight:700; color:#fff; background:linear-gradient(135deg,#16a34a,#15803d); border:none; border-radius:6px; cursor:pointer;">💾 ${editing ? 'Lưu thay đổi' : 'Tạo ưu đãi'}</button>
        </div>`;

      const typeSel = root.querySelector('#f-type');
      const syncType = () => {
        const t = typeSel.value;
        root.querySelector('#f-type-hint').textContent = PROMO_TYPES.find(x => x.id === t)?.hint || '';
        // freeship/gift không có giá trị số — ẩn đi cho đỡ rối.
        root.querySelector('#f-value-wrap').style.display = (t === 'percent' || t === 'amount') ? '' : 'none';
        root.querySelector('#f-max-wrap').style.display = t === 'percent' ? '' : 'none';
        root.querySelector('#f-value-label').textContent = t === 'percent' ? 'Phần trăm giảm (%) *' : 'Số tiền giảm (đ) *';
      };
      typeSel.onchange = syncType;
      syncType();

      root.querySelector('#f-cancel').onclick = () => { view = 'list'; renderList(); };
      root.querySelector('#f-save').onclick = async () => {
        const msg = root.querySelector('#f-msg');
        const g = id => root.querySelector('#' + id);
        const num = v => (v === '' || v === null ? null : Number(v));

        const conditions = {};
        for (const f of COND_FIELDS) {
          const el = g('c-' + f.key);
          if (!el) continue;
          if (f.type === 'bool') { if (el.checked) conditions[f.key] = true; }
          else if (f.type === 'number') { const n = num(el.value); if (n !== null && n > 0) conditions[f.key] = n; }
          else {
            const arr = el.value.split(',').map(x => x.trim()).filter(Boolean);
            if (arr.length) conditions[f.key] = arr;
          }
        }

        const body = {
          code: g('f-code').value.trim().toUpperCase() || null,
          name: g('f-name').value.trim(),
          description: g('f-desc').value.trim() || null,
          type: typeSel.value,
          value: num(g('f-value').value) || 0,
          max_discount: typeSel.value === 'percent' ? num(g('f-max').value) : null,
          min_order: num(g('f-min').value) || 0,
          scope: g('f-scope').value,
          conditions,
          valid_from: g('f-from').value ? new Date(g('f-from').value).toISOString() : null,
          valid_to: g('f-to').value ? new Date(g('f-to').value).toISOString() : null,
          status: g('f-status').value,
          max_uses: num(g('f-uses').value),
        };

        if (!body.name) { msg.textContent = '✗ Chưa nhập tên ưu đãi'; msg.style.color = '#dc2626'; return; }

        const btn = root.querySelector('#f-save');
        btn.disabled = true;
        msg.textContent = 'Đang lưu…'; msg.style.color = '#64748b';
        try {
          const res = await fetch(editing ? `${ADMIN_API}/${editing.id}` : ADMIN_API, {
            method: editing ? 'PUT' : 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
          await loadList();
          view = 'list'; renderList();
        } catch (e) {
          msg.textContent = '✗ ' + e.message; msg.style.color = '#dc2626';
          btn.disabled = false;
        }
      };
    }

    async function loadAssigned() {
      try {
        const res = await fetch(`${ADMIN_API}/${assignTarget.id}/customers`, { headers: authHeaders() });
        const d = await res.json();
        assigned = res.ok ? (d.customers || []) : [];
      } catch { assigned = []; }
    }

    function renderCustomers() {
      root.querySelector('#pa-sub').textContent = `Khách được gán: ${assignTarget.name}`;
      root.querySelector('#pa-body').innerHTML = `
        <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:11px 13px; margin-bottom:14px;">
          <div style="font-size:12.5px; font-weight:700; color:#5b21b6; margin-bottom:3px;">${esc(assignTarget.name)}</div>
          <div style="font-size:11.5px; color:#6d28d9;">Ưu đãi riêng — chỉ khách trong danh sách dưới đây dùng được.</div>
        </div>

        <div class="chatmql-form-group">
          <label class="chatmql-form-label">Thêm khách (mỗi số một dòng, hoặc cách nhau dấu phẩy)</label>
          <textarea id="ac-phones" class="chatmql-form-input" rows="3" placeholder="0912345678&#10;0987654321"></textarea>
          <div style="display:flex; gap:8px; align-items:center; margin-top:7px;">
            <button type="button" id="ac-add" style="padding:7px 15px; font-size:12.5px; font-weight:700; color:#fff; background:#6d28d9; border:none; border-radius:6px; cursor:pointer;">+ Gán ưu đãi</button>
            <span id="ac-msg" style="font-size:12px;"></span>
          </div>
        </div>

        <div style="font-size:12.5px; font-weight:700; color:#0f172a; margin:14px 0 7px;">Đã gán (${assigned.length})</div>
        ${!assigned.length ? '<div style="font-size:12.5px; color:#94a3b8; padding:12px 0;">Chưa gán cho khách nào.</div>' : `
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead><tr style="background:#f8fafc;">
                ${['Số điện thoại','Tên khách','Mã KH','Đã dùng',''].map(h => `<th style="text-align:left; padding:7px 8px; color:#64748b; font-weight:600; font-size:11px; border-bottom:1px solid #e2e8f0;">${h}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${assigned.map(c => `
                  <tr>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; font-family:ui-monospace,monospace;">${esc(c.phone)}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:${c.name ? '#0f172a' : '#cbd5e1'};">${esc(c.name || 'Chưa có trong CRM')}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; color:#64748b;">${esc(c.customer_code || '—')}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9;">${c.used ? '<span style="color:#94a3b8;">Đã dùng</span>' : '<span style="color:#15803d;">Chưa dùng</span>'}</td>
                    <td style="padding:7px 8px; border-bottom:1px solid #f1f5f9; text-align:right;">
                      <button type="button" class="ac-del" data-phone="${esc(c.phone)}" style="border:1px solid #fecaca; background:#fff; border-radius:4px; padding:2px 7px; font-size:11px; cursor:pointer; color:#dc2626;">Gỡ</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}

        <div style="display:flex; justify-content:flex-end; margin-top:14px; border-top:1px solid #e2e8f0; padding-top:12px;">
          <button type="button" id="ac-back" style="padding:8px 16px; font-size:13px; font-weight:600; color:#475569; background:#fff; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer;">Quay lại danh sách</button>
        </div>`;

      root.querySelector('#ac-back').onclick = async () => { view = 'list'; await loadList(); renderList(); };
      root.querySelector('#ac-add').onclick = async () => {
        const ta = root.querySelector('#ac-phones');
        const msg = root.querySelector('#ac-msg');
        const phones = ta.value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
        if (!phones.length) { msg.textContent = 'Chưa nhập số nào.'; msg.style.color = '#b45309'; return; }
        msg.textContent = 'Đang gán…'; msg.style.color = '#64748b';
        try {
          const res = await fetch(`${ADMIN_API}/${assignTarget.id}/customers`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ phones }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
          ta.value = '';
          await loadAssigned(); renderCustomers();
          const m2 = root.querySelector('#ac-msg');
          m2.textContent = '✓ ' + d.message;
          m2.style.color = d.not_in_crm?.length ? '#b45309' : '#15803d';
        } catch (e) { msg.textContent = '✗ ' + e.message; msg.style.color = '#dc2626'; }
      };
      root.querySelectorAll('.ac-del').forEach(b => {
        b.onclick = async () => {
          try {
            const res = await fetch(`${ADMIN_API}/${assignTarget.id}/customers/${encodeURIComponent(b.dataset.phone)}`,
              { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error((await res.json()).error || 'Lỗi');
            await loadAssigned(); renderCustomers();
          } catch (e) { alert('Không gỡ được: ' + e.message); }
        };
      });
    }

    await loadList();
    renderList();
  };

  // ══ Modal Customer 360 — phân tích khách hàng bằng AI ════════════════
  //
  // Chân dung do backend dựng từ dữ liệu thật, ba mục còn lại do AI. Nếu AI
  // hỏng thì modal vẫn hiện chân dung và nói rõ phần nào đang thiếu.

  window.openCustomer360 = async function () {
    const convId = getCurrentConversationId();
    if (!convId) {
      alert('Chưa xác định được hội thoại. Mở một cuộc trò chuyện rồi thử lại.');
      return;
    }

    document.querySelector('#chatmql-c360')?.remove();
    const root = document.createElement('div');
    root.id = 'chatmql-c360';
    // Khung theo design: .ai-modal-bg > .ai-modal (head / body / foot).
    root.className = 'ai-modal-bg';
    root.style.display = 'flex';
    root.innerHTML = `
      <div class="ai-modal">
        <div class="ai-modal__head">
          ✨ Customer 360 — Phân tích khách hàng
          <button type="button" class="ai-modal__close" id="c360-close" title="Đóng">×</button>
        </div>
        <div class="ai-modal__body" id="c360-body">
          <div class="ai-loading">
            <span class="ai-spinner"></span>
            <span id="c360-sub">Đang đọc hội thoại và hồ sơ khách…</span>
          </div>
        </div>
        <div class="ai-modal__foot">
          <span id="c360-meta" style="margin-right:auto; font-size:11.5px; color:#94a3b8; align-self:center;"></span>
          <button type="button" class="ai-btn-ghost" id="c360-refresh">↻ Phân tích lại</button>
          <button type="button" class="ai-btn-ghost" id="c360-cancel">Đóng</button>
          <button type="button" class="ai-btn-note" id="c360-note" disabled>📝 Ghi vào ghi chú</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const close = () => root.remove();
    root.querySelector('#c360-close').onclick = close;
    root.querySelector('#c360-cancel').onclick = close;
    root.onclick = e => { if (e.target === root) close(); };

    let data = null;

    async function analyze(forceFresh) {
      const body = root.querySelector('#c360-body');
      const btn = root.querySelector('#c360-refresh');
      btn.disabled = true;
      if (forceFresh) {
        body.innerHTML = '<div style="text-align:center; padding:44px 0; color:#94a3b8; font-size:13px;">Đang phân tích lại…</div>';
      }
      try {
        const res = await fetch(`${API_BASE}/api/v1/ai/customer-360`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ conversationId: convId, forceFresh: !!forceFresh }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
        data = d;
        render();
      } catch (e) {
        body.innerHTML = `
          <div style="padding:26px; text-align:center;">
            <div style="font-size:28px; margin-bottom:10px;">⚠️</div>
            <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">Không phân tích được</div>
            <div style="font-size:12.5px; color:#64748b; line-height:1.6;">${esc(e.message)}</div>
          </div>`;
        root.querySelector('#c360-sub').textContent = '';
      } finally {
        btn.disabled = false;
      }
    }

    // Design gọi mỗi mục là .ai-block với tiêu đề .ai-block__title.
    function section(icon, title, content) {
      return `
        <div class="ai-block">
          <div class="ai-block__title">${icon} ${title}</div>
          ${content}
        </div>`;
    }

    function render() {
      const body = root.querySelector('#c360-body');
      const sub = root.querySelector('#c360-sub');
      const meta = root.querySelector('#c360-meta');

      if (sub) sub.textContent = data.fromCache
        ? 'Dùng lại kết quả phân tích gần đây'
        : 'Phân tích từ hội thoại và hồ sơ khách';

      const warn = !data.aiAvailable ? `
        <div style="padding:10px 12px; background:#fef3c7; border:1px solid #fcd34d; border-radius:7px; margin-bottom:14px; font-size:12px; color:#92400e; line-height:1.6;">
          <b>Phần AI chưa chạy được.</b> Chân dung bên dưới vẫn chính xác vì được dựng
          từ dữ liệu thật trong CRM, nhưng tóm tắt, cơ hội và đề xuất hành động thì đang thiếu.<br>
          <span style="font-size:11.5px;">Lý do: ${esc(data.aiError || 'không rõ')}</span>
        </div>` : '';

      body.innerHTML = warn
        + section('👤', 'Chân dung khách hàng',
            `<ul style="margin:0; padding-left:17px;">${data.portrait.map(p => `<li style="margin-bottom:3px;">${esc(p)}</li>`).join('')}</ul>`,
            '#0369a1')
        + (data.summary ? section('💬', 'Tóm tắt hội thoại', esc(data.summary), '#7c3aed') : '')
        + (data.opportunity ? section('🎯', 'Cơ hội', esc(data.opportunity), '#b45309') : '')
        + (data.actions?.length ? section('✅', 'Đề xuất hành động',
            `<ol style="margin:0; padding-left:19px;">${data.actions.map(a => `<li style="margin-bottom:5px;">${esc(a)}</li>`).join('')}</ol>`,
            '#15803d') : '');

      meta.textContent = 'Lượt phân tích gần nhất: '
        + (fmtDateTime(data.generatedAt) || '—')
        + (data.fromCache ? ' (đã lưu)' : '');

      const noteBtn = root.querySelector('#c360-note');
      const canSave = data.aiAvailable && (data.summary || data.actions?.length);
      noteBtn.disabled = !canSave;
      noteBtn.style.background = canSave ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#cbd5e1';
      noteBtn.style.cursor = canSave ? 'pointer' : 'not-allowed';
    }

    root.querySelector('#c360-refresh').onclick = () => analyze(true);

    root.querySelector('#c360-note').onclick = async () => {
      const btn = root.querySelector('#c360-note');
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu…';

      // Ghi lại đúng những gì nhân viên vừa đọc, để sau này mở ghi chú vẫn
      // hiểu vì sao lúc đó lại quyết định như vậy.
      const parts = ['🧠 Phân tích AI — Customer 360', ''];
      parts.push('👤 Chân dung:', ...data.portrait.map(p => `  • ${p}`), '');
      if (data.summary) parts.push('💬 Tóm tắt hội thoại:', `  ${data.summary}`, '');
      if (data.opportunity) parts.push('🎯 Cơ hội:', `  ${data.opportunity}`, '');
      if (data.actions?.length) {
        parts.push('✅ Đề xuất hành động:');
        data.actions.forEach((a, i) => parts.push(`  ${i + 1}. ${a}`));
      }

      try {
        const res = await fetch(`${API_BASE}/api/v1/notes`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            conversationId: convId,
            content: parts.join('\n').trim(),
            // Ghi chú do AI sinh — không gắn trạng thái tương tác, vì không
            // có cuộc gọi hay trao đổi nào thực sự diễn ra.
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
        btn.textContent = '✓ Đã ghi vào ghi chú';
        btn.style.background = '#15803d';
        setTimeout(close, 1100);
      } catch (e) {
        alert('Không lưu được ghi chú: ' + e.message);
        btn.disabled = false;
        btn.textContent = '📝 Ghi vào ghi chú';
      }
    };

    await analyze(false);
  };

  // ══ Xem dưới quyền nhân viên khác ════════════════════════════════════
  //
  // Chỉ owner/admin dùng được — backend chặn 403, ở đây ẩn nút luôn.
  // Khi đang xem dưới quyền, một dải banner cam bám trên đầu màn hình để không
  // ai quên mất mình đang thao tác dưới danh tính người khác.

  /**
   * Đọc claim từ JWT. atob() trả chuỗi nhị phân nên tên tiếng Việt bị vỡ thành
   * "Lá»c Thá» Háº¡nh" — phải giải mã UTF-8 lại. Payload cũng là base64url
   * (dùng - và _) nên phải đổi về base64 chuẩn trước khi giải.
   */
  function tokenClaims() {
    try {
      const part = (localStorage.getItem('token') || '').split('.')[1];
      if (!part) return {};
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
        .padEnd(Math.ceil(part.length / 4) * 4, '=');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch { return {}; }
  }

  // App React đã tự dựng banner "Bạn đang xem dưới quyền" kèm nút quay lại,
  // nên ở đây KHÔNG dựng lại — hai banner chồng nhau chỉ tổ rối mắt.
  // Phần còn thiếu là chỗ để BẮT ĐẦU xem dưới quyền, đó là bộ chọn bên dưới.

  window.openImpersonatePicker = async function () {
    const claims = tokenClaims();
    if (!['owner', 'admin'].includes(claims.role)) {
      alert('Chỉ chủ tài khoản và quản trị viên mới xem được dưới quyền nhân viên khác.');
      return;
    }
    if (claims.impersonatedBy) {
      alert('Bạn đang xem dưới quyền người khác. Quay lại tài khoản gốc trước đã.');
      return;
    }

    document.querySelector('#chatmql-imp-picker')?.remove();
    const root = document.createElement('div');
    root.id = 'chatmql-imp-picker';
    root.className = 'chatmql-modal-overlay';
    root.innerHTML = `
      <div class="chatmql-modal" style="width:560px; max-height:82vh;">
        <div class="chatmql-modal-header">
          <div>
            <div style="font-weight:700; font-size:15px; color:#0f172a;">👁️ Xem dưới quyền nhân viên</div>
            <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Xem hệ thống đúng như nhân viên đó thấy.</div>
          </div>
          <button type="button" id="imp-close" style="border:none; background:none; font-size:22px; cursor:pointer; color:#64748b; line-height:1;">×</button>
        </div>
        <div class="chatmql-modal-body" id="imp-body">
          <div style="text-align:center; padding:34px 0; color:#94a3b8; font-size:13px;">Đang tải danh sách…</div>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#imp-close').onclick = () => root.remove();
    root.onclick = e => { if (e.target === root) root.remove(); };

    let team = [];
    try {
      const res = await fetch(`${API_BASE}/api/v1/settings/team`, { headers: authHeaders() });
      const d = await res.json();
      team = (Array.isArray(d) ? d : d.members || d.users || d.team || []).filter(Boolean);
    } catch (e) {
      root.querySelector('#imp-body').innerHTML =
        `<div style="padding:24px; text-align:center; color:#dc2626; font-size:12.5px;">Không tải được danh sách nhân viên: ${esc(e.message)}</div>`;
      return;
    }

    // Loại chính mình và tài khoản đã tắt. Admin không xem được owner/admin
    // khác — luật này backend cũng chặn, ở đây ẩn đi cho khỏi bấm rồi báo lỗi.
    const canView = u => {
      if (u.id === claims.id) return false;
      if (u.isActive === false) return false;
      if (claims.role === 'admin' && ['owner', 'admin'].includes(u.role)) return false;
      return true;
    };
    const list = team.filter(canView);

    const ROLE_LABEL = { owner: 'Chủ tài khoản', admin: 'Quản trị viên', manager: 'Quản lý', member: 'Nhân viên' };

    root.querySelector('#imp-body').innerHTML = `
      <div style="padding:10px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:7px; margin-bottom:14px; font-size:12px; color:#92400e; line-height:1.6;">
        Mọi thao tác trong lúc xem dưới quyền sẽ mang danh tính nhân viên đó, nhưng
        <b>đều được ghi nhật ký kèm tên bạn</b>. Phiên xem tự hết sau 4 giờ.
      </div>
      <input type="text" id="imp-search" class="chatmql-form-input" placeholder="Tìm theo tên hoặc email…" style="margin-bottom:12px;" />
      <div id="imp-list"></div>`;

    function renderList(q) {
      const kw = (q || '').trim().toLowerCase();
      const shown = kw
        ? list.filter(u => `${u.fullName || ''} ${u.email || ''}`.toLowerCase().includes(kw))
        : list;
      root.querySelector('#imp-list').innerHTML = !shown.length
        ? `<div style="text-align:center; padding:22px 0; color:#94a3b8; font-size:12.5px;">${
            list.length ? 'Không có nhân viên nào khớp.' : 'Không có nhân viên nào bạn xem được.'}</div>`
        : shown.map(u => `
            <div style="display:flex; gap:10px; align-items:center; padding:9px 11px; border:1px solid #e2e8f0; border-radius:7px; margin-bottom:7px; background:#fff;">
              <div style="flex:none; width:32px; height:32px; border-radius:50%; background:#e0e7ff; color:#4338ca; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">
                ${esc((u.fullName || u.email || '?').trim().charAt(0).toUpperCase())}
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:12.5px; font-weight:600; color:#0f172a;">${esc(u.fullName || '(chưa đặt tên)')}</div>
                <div style="font-size:11px; color:#64748b;">${esc(u.email || '')} · ${esc(ROLE_LABEL[u.role] || u.role || '')}</div>
              </div>
              <button type="button" class="imp-go" data-id="${esc(u.id)}" data-email="${esc(u.email || '')}" style="
                flex:none; padding:5px 13px; font-size:12px; font-weight:700; cursor:pointer;
                color:#fff; background:#b45309; border:none; border-radius:5px;">Xem</button>
            </div>`).join('');

      root.querySelectorAll('.imp-go').forEach(b => {
        b.onclick = async () => {
          if (!confirm(`Chuyển sang xem dưới quyền ${b.dataset.email}?\n\nBạn sẽ thấy hệ thống đúng như họ thấy. Thao tác đều được ghi nhật ký.`)) return;
          b.disabled = true;
          b.textContent = '…';
          try {
            const res = await fetch(`${API_BASE}/api/v1/auth/impersonate/${encodeURIComponent(b.dataset.id)}`, {
              method: 'POST', headers: authHeadersNoBody(),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
            localStorage.setItem('token', d.token);
            location.reload();
          } catch (e) {
            alert('Không chuyển được: ' + e.message);
            b.disabled = false;
            b.textContent = 'Xem';
          }
        };
      });
    }

    renderList('');
    const search = root.querySelector('#imp-search');
    search.oninput = e => renderList(e.target.value);
  };

  // Render & Open Order Modal
  /**
   * Mở form lên đơn.
   * @param mountEl Gắn form vào phần tử này (tab "Tạo đơn" ở cột phải). Bỏ trống
   *                thì mở dạng hộp thoại giữa màn hình như trước.
   * Toàn bộ nghiệp vụ dùng chung một bản — chỉ khác chỗ chứa và lớp CSS.
   */
  window.openChatMqlOrderModal = async function (mountEl) {
    let [ctx, lookups] = await Promise.all([
      fetchConversationContext().catch(() => null),
      loadLookups().catch(() => null),
    ]);

    if (!ctx) {
      ctx = {
        contact: {
          name: ccState.name || 'Khách hàng',
          phone: ccState.phone || '',
          address: '',
          city: 'Hà Nội'
        },
        crm: currentCrmCustomer || null
      };
    }

    if (!lookups || !lookups.warehouses || !lookups.warehouses.length) {
      lookups = {
        statuses: [
          { id: 1, label: 'Đang lấy hàng' },
          { id: 2, label: 'Chờ xác nhận' },
          { id: 3, label: 'Đang giao hàng' },
          { id: 4, label: 'Hoàn thành' },
          { id: 5, label: 'Hủy' }
        ],
        warehouses: [
          { id: 1, name: 'Kho Tổng' }
        ],
        provinces: []
      };
    }

    const phone = ccState.phone || ctx?.contact?.phone || '';
    const customerName = ccState.name || ctx?.contact?.name || '';
    const crmData = ccState.crmData || ctx?.crm || currentCrmCustomer || null;

    // Không bịa địa chỉ. Trống thì để nhân viên tự nhập
    const defaultAddress = crmData?.address || ctx?.contact?.address || '';
    const defaultCity = crmData?.city || ctx?.contact?.city || 'Hà Nội';
    const currentUser = getCurrentUser();
    const currentUserName = currentUser?.fullName || currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : '');
    const staffCare = currentUserName || crmData?.staff_in_charge || ccState.staff || 'Trà Dược CSKH';

    // Đồng bộ cache để sidebar lịch sử đơn cũng bám đúng khách này.
    if (phone) {
      currentCrmCustomer = crmData || null;
      lastFetchedPhone = '';
    }
    const gmvFormatted = crmData?.gmv_total != null ? `${formatDot(crmData.gmv_total)} ₫` : '0 ₫';
    const orderCount = crmData?.order_count ?? customerOrdersCache.length;

    // Đợt 1: kho mặc định là kho đầu tiên; danh mục lấy theo kho đó.
    let warehouseId = lookups.warehouses[0]?.id || null;
    let catalog = await loadCatalog(warehouseId);
    // Bỏ TEA_CATALOG viết cứng — giá và tồn kho giờ lấy thật từ FM.
    // Mặc định danh sách sản phẩm để trống để nhân viên tự chọn.
    let items = [];
    let orderStatusId = lookups.statuses[0]?.id || 1;
    let provinceId = null;
    let wardId = null;
    let wards = [];
    let discountType = 'pct'; // 'pct' | 'vnd'
    let discountPercent = 0;
    let discountAmount = 0;
    let usedPoints = 0;
    let sellerName = currentUserName || staffCare || 'Trà Dược CSKH';
    let pkgWeight = null;
    let pkgLength = '';
    let pkgWidth = '';
    let pkgHeight = '';
    let shippingFee = 25000;
    let shippingProvider = 'vnpost';
    let selfShipping = false;
    let promoCode = '';
    let promoApplied = null;
    let isExchange = false;
    let isFragile = false;
    let depositAmount = 0;
    let orderSource = 'Zalo OA';
    let orderType = 'Đơn sỉ';

    function vnd(num) {
      return formatDot(Math.round(num || 0));
    }
    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Giá trị các ô nhập tay được giữ trong state, KHÔNG đọc lại từ template.
    const form = {
      name: customerName || '',
      phone: phone || '',
      addr: defaultAddress || '',
      notes: '',
    };

    /** Hút giá trị đang hiển thị vào state trước khi vẽ lại. */
    function captureForm() {
      const get = sel => modalOverlay.querySelector(sel)?.value;
      const n = get('#order-cust-name');   if (n !== undefined) form.name = n;
      const p = get('#order-cust-phone');  if (p !== undefined) form.phone = p;
      const a = get('#order-cust-addr');   if (a !== undefined) form.addr = a;
      const t = get('#order-notes');       if (t !== undefined) form.notes = t;
    }

    /** Loại bỏ dấu tiếng Việt để tìm kiếm nhanh. */
    function removeVietnameseTones(str) {
      if (!str) return '';
      str = str.toLowerCase();
      str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
      str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
      str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
      str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
      str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
      str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
      str = str.replace(/đ/g, 'd');
      str = str.replace(/[\u0300-\u036f]/g, '');
      return str.trim();
    }

    /** Tìm sản phẩm trong danh mục theo mã. */
    const findProd = code => catalog.find(p => p.code === code);

    /** Tiền hàng — dòng quà tặng không tính. */
    function calcSubtotal() {
      return items.reduce((sum, i) => sum + (i.isGift ? 0 : i.price * i.quantity), 0);
    }
    function calcGift() {
      return items.reduce((sum, i) => sum + (i.isGift ? i.price * i.quantity : 0), 0);
    }
    function calcTotalWeight() {
      return items.reduce((sum, i) => {
        const p = findProd(i.code);
        const w = (p && p.weight) ? p.weight : 100;
        return sum + (w * i.quantity);
      }, 0);
    }
    function calcDiscountAmount() {
      const sub = calcSubtotal();
      if (discountType === 'pct') {
        return Math.round((sub * Math.max(0, Math.min(100, discountPercent || 0))) / 100);
      }
      return Math.max(0, discountAmount || 0);
    }
    function calculateTotal() {
      const subtotal = calcSubtotal();
      const promoOff = promoApplied?.discount_amount || 0;
      const discountAmt = calcDiscountAmount();
      const pointsOff = (usedPoints || 0) * 1000;
      const ship = (selfShipping || promoApplied?.free_shipping) ? 0 : shippingFee;
      return Math.max(0, subtotal - discountAmt - promoOff - pointsOff + ship);
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'chatmql-modal-overlay';
    modalOverlay.id = 'chatmql-order-modal-root';

    function getScrollContainer() {
      if (mountEl) return mountEl;
      const modalBody = modalOverlay.querySelector('.chatmql-modal-body');
      if (modalBody && modalBody.scrollHeight > modalBody.clientHeight) return modalBody;
      let p = modalOverlay.parentElement;
      while (p && p !== document.body) {
        if (p && p.scrollHeight > p.clientHeight) return p;
        p = p ? p.parentElement : null;
      }
      return document.scrollingElement || document.documentElement;
    }

    function renderModalContent() {
      captureForm();
      const scrollContainer = getScrollContainer();
      const savedScroll = scrollContainer ? scrollContainer.scrollTop : 0;

      const subtotal = calcSubtotal();
      const total = calculateTotal();
      const totalWeight = pkgWeight != null ? pkgWeight : calcTotalWeight();
      const totalQty = items.reduce((s, i) => s + i.quantity, 0);
      const formattedTotal = formatDot(total);
      const formattedSubtotal = formatDot(subtotal);

      modalOverlay.innerHTML = `
        <div class="chatmql-modal" onclick="event.stopPropagation()" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <div class="chatmql-modal-header">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">🛍️</span>
              <div>
                <div style="font-weight:700; font-size:16px; color:#0f172a;">Lên Đơn Hàng — Trà Dược Việt Nam</div>
                <div style="font-size:12px; color:#64748b;">Đồng bộ tự động 3 chiều (ChatMQL ⟷ CRM ⟷ FM)</div>
              </div>
            </div>
            <button id="chatmql-close-modal" style="border:none; background:none; font-size:20px; color:#94a3b8; cursor:pointer;">✕</button>
          </div>

          <div class="chatmql-modal-body" style="padding:14px 16px;">
            <!-- CRM Status Card -->
            <div class="chatmql-crm-card" style="margin-top:0; margin-bottom:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;" id="order-crm-card">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="chatmql-crm-badge" id="order-crm-badge" style="font-size:11px; padding:2px 8px; border-radius:4px; background:${crmData ? '#dcfce7' : '#f1f5f9'}; color:${crmData ? '#15803d' : '#64748b'}; font-weight:700;">${crmData ? 'ĐÃ CÓ TRÊN CRM' : 'CHƯA CÓ TRÊN CRM'}</span>
                  <span style="font-weight:700; font-size:12px; color:#15803d;">Cấp Vip: <span id="order-crm-group">${crmData?.cap_vip || crmData?.priority_level || '—'}</span></span>
                </div>
                <div style="font-size:12px; font-weight:600; color:#1e293b;">
                  👤 Care: <span style="color:#b91c1c; font-weight:700;" id="order-crm-staff">${staffCare}</span>
                </div>
              </div>
              <div style="display:flex; gap:12px; font-size:11.5px; color:#475569; flex-wrap:wrap;">
                <span>📊 GMV: <b id="order-crm-gmv">${gmvFormatted}</b></span>
                <span>📦 Đã mua: <b id="order-crm-count">${orderCount} đơn</b></span>
                <span>🍵 Gu trà: <b id="order-crm-taste">${crmData?.thich_dung_hang || '—'}</b></span>
              </div>
            </div>

            <!-- 1. THÔNG TIN ĐƠN HÀNG -->
            <div class="chatmql-form-section" style="margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <div style="width:3px; height:16px; background:#ef4444; border-radius:2px;"></div>
                <div style="font-size:14px; font-weight:700; color:#0f172a;">Thông tin đơn hàng</div>
              </div>

              <!-- Trạng thái & Chọn nhân viên -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                    <span style="font-size:10px;">○</span> Chọn trạng thái
                  </label>
                  <select id="order-status" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#2563eb; font-weight:600; padding:0 10px;">
                    <option value="1" ${orderStatusId === 1 ? 'selected' : ''}>Đang lấy hàng</option>
                    <option value="2" ${orderStatusId === 2 ? 'selected' : ''}>Chờ xác nhận</option>
                    <option value="3" ${orderStatusId === 3 ? 'selected' : ''}>Đang giao hàng</option>
                    <option value="4" ${orderStatusId === 4 ? 'selected' : ''}>Hoàn thành</option>
                    <option value="5" ${orderStatusId === 5 ? 'selected' : ''}>Hủy</option>
                    ${lookups.statuses.filter(st => ![1,2,3,4,5].includes(st.id)).map(st => `
                      <option value="${st.id}" ${st.id === orderStatusId ? 'selected' : ''}>${st.label}</option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                    <span>👤</span> Chọn nhân viên
                  </label>
                    <select id="order-seller" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;">
                    <option value="">Chọn nhân viên</option>
                    ${[sellerName, 'Lộc Thị Hạnh', 'Dương Hoài Chang', 'Dương Thu Trang', 'Đỗ Tuấn Anh', 'Hoàng Phương Anh', 'Ngọc Thị Thảo', 'Ngô Thị Ngân', 'Ngô Văn Tuấn', 'Nguyễn Nam Khánh', 'Nguyễn Thị Vân Anh', 'Trà Dược CSKH'].filter((v, i, a) => v && a.indexOf(v) === i).map(st => `
                      <option value="${esc(st)}" ${st === sellerName ? 'selected' : ''}>${esc(st)}</option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <!-- Tên & Số điện thoại (ẩn dưới form nếu có sẵn, hoặc hiện rõ ràng) -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Tên khách hàng</label>
                  <input type="text" id="order-cust-name" class="chatmql-form-input" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#0f172a; padding:0 12px; box-sizing:border-box;" value="${form.name}" placeholder="Tên khách hàng" />
                </div>
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Số điện thoại</label>
                  <input type="text" id="order-cust-phone" class="chatmql-form-input" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#0f172a; padding:0 12px; box-sizing:border-box;" value="${form.phone}" placeholder="Số điện thoại..." />
                </div>
              </div>

              <!-- Tỉnh/Thành phố -->
              <div style="margin-bottom:10px;">
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                  <span>📍</span> Tỉnh/Thành phố
                </label>
                <select id="order-province" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;">
                  <option value="">Chọn tỉnh/thành phố</option>
                  ${lookups.provinces.map(pv => `
                    <option value="${pv.id}" ${pv.id === provinceId ? 'selected' : ''}>${pv.name}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Phường/Xã -->
              <div style="margin-bottom:10px;">
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                  <span>🏢</span> Phường/Xã
                </label>
                <select id="order-ward" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;" ${wards.length ? '' : 'disabled'}>
                  <option value="">${provinceId ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}</option>
                  ${wards.map(wd => `
                    <option value="${wd.id}" ${wd.id === wardId ? 'selected' : ''}>${wd.name}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Địa chỉ chi tiết -->
              <div style="margin-bottom:10px;">
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                  <span>📍</span> Địa chỉ chi tiết
                </label>
                <input type="text" id="order-cust-addr" class="chatmql-form-input" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#0f172a; padding:0 12px; box-sizing:border-box;" value="${form.addr}" placeholder="Điền địa chỉ chi tiết..." />
              </div>
            </div>

            <!-- 2. THÔNG TIN KHÁC -->
            <div class="chatmql-form-section" style="margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <div style="width:3px; height:16px; background:#ef4444; border-radius:2px;"></div>
                <div style="font-size:14px; font-weight:700; color:#0f172a;">Thông tin khác</div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn nguồn đơn hàng</label>
                  <select id="order-source" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;">
                    <option value="">Chọn nguồn đơn hàng</option>
                    ${['Zalo', 'Facebook', 'Website', 'Hotline', 'Khác'].map(t =>
                      `<option value="${t}" ${t === orderSource ? 'selected' : ''}>${t}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn loại đơn hàng</label>
                  <select id="order-type" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;">
                    <option value="">Chọn loại đơn hàng</option>
                    ${['Bán lẻ', 'Bán buôn', 'Đơn mẫu'].map(t =>
                      `<option value="${t}" ${t === orderType ? 'selected' : ''}>${t}</option>`).join('')}
                  </select>
                </div>
              </div>

              <div>
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Ghi chú</label>
                <textarea id="order-notes" class="chatmql-form-input" rows="2" style="width:100%; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#0f172a; padding:8px 12px; box-sizing:border-box; resize:vertical;" placeholder="Nhập ghi chú đơn hàng...">${form.notes}</textarea>
              </div>
            </div>

            <!-- 3. SẢN PHẨM -->
            <div class="chatmql-form-section" style="margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <div style="width:3px; height:16px; background:#ef4444; border-radius:2px;"></div>
                <div style="font-size:14px; font-weight:700; color:#0f172a;">Sản phẩm</div>
              </div>

              <!-- 3-Column Search/Filter Bar: [ Kho ▼ ] [ Tìm sản phẩm ] [ Tìm quà tặng ] -->
              <div style="display:grid; grid-template-columns: 95px 1fr 1fr; gap:8px; margin-bottom:12px;">
                <!-- Dropdown Kho -->
                <div style="position:relative;">
                  <select id="order-warehouse" class="chatmql-form-select" style="width:100%; height:38px; font-size:12.5px; padding:0 24px 0 10px; border-radius:8px; border:1px solid #e2e8f0; background:#f1f5f9; font-weight:600; color:#334155; cursor:pointer; appearance:none;">
                    ${lookups.warehouses.map(w => `
                      <option value="${w.id}" ${w.id === warehouseId ? 'selected' : ''}>${w.name}</option>
                    `).join('')}
                  </select>
                  <span style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:10px; color:#64748b; pointer-events:none;">▼</span>
                </div>

                <!-- Input Tìm sản phẩm -->
                <div style="position:relative;">
                  <div id="prod-search-wrap" style="display:flex; align-items:center; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:0 10px; height:38px;">
                    <input type="text" id="input-search-product" placeholder="Tìm sản phẩm" style="width:100%; border:none; outline:none; font-size:12.5px; color:#0f172a; background:transparent;" autocomplete="off" />
                  </div>
                  <div id="prod-search-results" style="display:none; position:absolute; top:calc(100% + 4px); left:0; width:330px; max-width:calc(100vw - 32px); max-height:280px; overflow-y:auto; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.18); z-index:999; padding:4px;"></div>
                </div>

                <!-- Input Tìm quà tặng -->
                <div style="position:relative;">
                  <div id="gift-search-wrap" style="display:flex; align-items:center; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:0 10px; height:38px;">
                    <input type="text" id="input-search-gift" placeholder="Tìm quà tặng" style="width:100%; border:none; outline:none; font-size:12.5px; color:#0f172a; background:transparent;" autocomplete="off" />
                  </div>
                  <div id="gift-search-results" style="display:none; position:absolute; top:calc(100% + 4px); right:0; left:auto; width:330px; max-width:calc(100vw - 32px); max-height:280px; overflow-y:auto; background:#fff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.18); z-index:999; padding:4px;"></div>
                </div>
              </div>

              <!-- Column Header: Sản phẩm | Giá tiền -->
              <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; color:#334155; padding:4px 2px 8px;">
                <span>Sản phẩm</span>
                <span>Giá tiền</span>
              </div>

              <!-- Item Cards Container -->
              <div id="order-items-container">
                ${!catalog.length ? `
                  <div style="padding:14px; background:#fef3c7; border:1px solid #fcd34d; border-radius:6px; font-size:12.5px; color:#92400e;">
                    <b>Kho này chưa có sản phẩm nào.</b><br>
                    Chọn kho khác ở ô "Kho" phía trên để tiếp tục lên đơn.
                  </div>
                ` : !items.length ? `
                  <div style="padding:14px; background:#f1f5f9; border:1px dashed #cbd5e1; border-radius:8px; font-size:12.5px; color:#64748b; text-align:center;">
                    Chưa có sản phẩm nào — gõ vào ô "Tìm sản phẩm" hoặc "Tìm quà tặng" ở trên để thêm vào đơn.
                  </div>
                ` : ''}

                ${items.map((item, idx) => {
                  const p = findProd(item.code) || item;
                  const isGift = !!item.isGift;
                  const lineTotal = isGift ? 0 : item.price * item.quantity;
                  const formattedLineTotal = isGift ? '0' : formatDot(lineTotal);
                  const unitStr = p.unit || 'Túi';
                  const unitPriceStr = isGift ? `0 đ/Gói` : `${formatDot(item.price)} đ/${unitStr}`;
                  const weightStr = p.weight ? `${p.weight}g` : '';
                  const vatStr = p.vat_note ? ` · ${p.vat_note}` : (isGift ? '' : ' · Đã có VAT 8%');
                  const subtitleText = isGift
                    ? `${p.name}${weightStr ? ' - ' + weightStr : ''} · Quà tặng — không tính tiền`
                    : `${p.name} - ${unitStr} ${weightStr ? weightStr + ' ' : ''}${vatStr}`;
                  const inventoryCount = p.inventory != null ? p.inventory : (item.inventory || 0);

                  return `
                    <div class="chatmql-item-card" data-idx="${idx}" style="
                      background:${isGift ? '#fffdf5' : '#fff'};
                      border:1px solid ${isGift ? '#fef08a' : '#f1f5f9'};
                      border-radius:10px;
                      padding:12px 14px;
                      margin-bottom:10px;
                      box-shadow:0 1px 3px rgba(0,0,0,0.03);
                    ">
                      <!-- Top Line: SKU Code & Trash button -->
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="font-family:ui-monospace,monospace; font-weight:700; font-size:13.5px; color:#0f172a;">${p.code}</span>
                          ${isGift ? `<span style="background:#fef3c7; color:#b45309; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; border:1px solid #fde68a;">🎁 Quà tặng</span>` : ''}
                        </div>
                        <button type="button" class="btn-remove-item" data-idx="${idx}" style="
                          width:28px; height:28px; display:flex; align-items:center; justify-content:center;
                          border:1px solid #fecaca; background:#fff5f5; color:#ef4444; border-radius:6px; cursor:pointer; font-size:13px;
                        " title="Xóa dòng này">🗑️</button>
                      </div>

                      <!-- Subtitle -->
                      <div style="font-size:12px; color:#475569; margin-bottom:6px; line-height:1.4;">
                        ${subtitleText}
                      </div>

                      <!-- Bottom Row: Price, Stock vs Stepper, Line Total -->
                      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:4px;">
                        <div>
                          <div style="font-size:12px; color:#64748b;">${unitPriceStr}${weightStr ? ' · ' + weightStr : ''}</div>
                          <div style="font-size:12px; color:#64748b; margin-top:2px;">Tồn: <span style="font-weight:600; color:${inventoryCount <= 0 ? '#dc2626' : '#1e293b'};">${inventoryCount}</span></div>
                        </div>

                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                          <div style="display:inline-flex; align-items:center; border:1px solid #e2e8f0; border-radius:6px; background:#fff; overflow:hidden;">
                            <button type="button" class="btn-qty-minus" data-idx="${idx}" style="width:28px; height:26px; border:none; background:#fff; color:#475569; cursor:pointer; font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center;">−</button>
                            <input type="number" class="item-qty" data-idx="${idx}" value="${item.quantity}" min="1" style="width:34px; height:26px; border:none; text-align:center; font-weight:700; font-size:13px; color:#0f172a; padding:0; outline:none; background:transparent;" />
                            <button type="button" class="btn-qty-plus" data-idx="${idx}" style="width:28px; height:26px; border:none; background:#fff; color:#475569; cursor:pointer; font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center;">+</button>
                          </div>
                          <div style="font-weight:700; font-size:15px; color:#0f172a; font-variant-numeric:tabular-nums; margin-top:2px;">
                            ${formattedLineTotal}
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Product Total Summary Line -->
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 2px 4px; border-top:1px solid #f1f5f9; margin-top:6px;">
                <span style="font-size:13px; font-weight:600; color:#334155;">Tổng: ${totalQty} SP · ${totalWeight}g</span>
                <span style="font-size:15px; font-weight:800; color:#0f172a; font-variant-numeric:tabular-nums;">${formattedSubtotal}đ</span>
              </div>
            </div>

            <!-- 4. VẬN CHUYỂN -->
            <div class="chatmql-form-section" style="margin-bottom:16px;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:3px; height:16px; background:#ef4444; border-radius:2px;"></div>
                  <div style="font-size:14px; font-weight:700; color:#0f172a;">Vận chuyển</div>
                </div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:#334155; cursor:pointer;">
                  <input type="checkbox" id="order-self-ship" ${selfShipping ? 'checked' : ''} style="cursor:pointer;" /> Tự vận chuyển
                </label>
              </div>

              <div style="margin-bottom:10px;">
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
                  <span>🚚</span> Chọn đơn vị vận chuyển
                </label>
                <select id="order-carrier" class="chatmql-form-select" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#334155; padding:0 10px;">
                  <option value="vnpost" ${shippingProvider === 'vnpost' ? 'selected' : ''}>VN Post - 25.000đ</option>
                  <option value="jt_express" ${shippingProvider === 'jt_express' ? 'selected' : ''}>J&T Express - 30.000đ</option>
                  <option value="viettel_post" ${shippingProvider === 'viettel_post' ? 'selected' : ''}>Viettel Post - 28.000đ</option>
                </select>
              </div>

              <div style="margin-bottom:6px;">
                <label class="chatmql-form-label" style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chi phí vận chuyển</label>
                <input type="number" id="order-shipping-fee" class="chatmql-form-input" style="width:100%; height:38px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12.5px; color:#0f172a; padding:0 12px; box-sizing:border-box;" value="${shippingFee}" />
              </div>

              <div style="font-size:11.5px; color:#64748b; margin-bottom:10px; display:flex; align-items:center; gap:4px;">
                <span>ⓘ</span> <span>Thông tin: ${shippingProvider === 'vnpost' ? 'VN Post - Mạng lưới bưu cục phủ khắp toàn quốc' : shippingProvider === 'viettel_post' ? 'Viettel Post - Giao nhanh, mạng lưới rộng khắp' : 'J&T Express - Chuyển phát nhanh chuyên nghiệp'}</span>
              </div>

              <div style="margin-bottom:10px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:#334155; cursor:pointer;">
                  <input type="checkbox" id="order-fragile" ${isFragile ? 'checked' : ''} style="cursor:pointer;" /> Hàng dễ vỡ <span style="color:#94a3b8; font-size:11px;">ⓘ</span>
                </label>
              </div>

              <!-- Dimensions & Weight 4-Grid -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
                <input type="number" id="order-pkg-weight" class="chatmql-form-input" style="height:36px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12px; color:#0f172a; padding:0 10px;" value="${totalWeight}" placeholder="Khối lượng (g)" />
                <input type="number" id="order-pkg-length" class="chatmql-form-input" style="height:36px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12px; color:#0f172a; padding:0 10px;" value="${pkgLength}" placeholder="Dài (cm)" />
                <input type="number" id="order-pkg-width" class="chatmql-form-input" style="height:36px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12px; color:#0f172a; padding:0 10px;" value="${pkgWidth}" placeholder="Rộng (cm)" />
                <input type="number" id="order-pkg-height" class="chatmql-form-input" style="height:36px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:12px; color:#0f172a; padding:0 10px;" value="${pkgHeight}" placeholder="Cao (cm)" />
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                <span style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase;">${shippingProvider === 'vnpost' ? 'VN POST' : shippingProvider === 'viettel_post' ? 'VIETTEL POST' : 'J&T EXPRESS'}</span>
                <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:#334155; cursor:pointer;">
                  <input type="checkbox" id="order-exchange" ${isExchange ? 'checked' : ''} style="cursor:pointer;" /> Đơn đổi trả
                </label>
              </div>
            </div>

            <!-- 5. THANH TOÁN -->
            <div class="chatmql-form-section" style="margin-bottom:16px;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:3px; height:16px; background:#ef4444; border-radius:2px;"></div>
                  <div style="font-size:14px; font-weight:700; color:#0f172a;">Thanh toán</div>
                </div>
                <span style="font-size:15px; color:#64748b; cursor:pointer;" title="Cài đặt">⚙</span>
              </div>

              <!-- Chiết khấu -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:12.5px; font-weight:600; color:#334155;">Chiết khấu</span>
                  <div style="display:inline-flex; background:#e2e8f0; border-radius:6px; padding:2px; gap:2px;">
                    <button type="button" id="btn-discount-pct" style="padding:2px 8px; font-size:11px; font-weight:700; border-radius:4px; border:none; cursor:pointer; background:${discountType === 'pct' ? '#2563eb' : 'transparent'}; color:${discountType === 'pct' ? '#fff' : '#64748b'};">%</button>
                    <button type="button" id="btn-discount-vnd" style="padding:2px 8px; font-size:11px; font-weight:700; border-radius:4px; border:none; cursor:pointer; background:${discountType === 'vnd' ? '#2563eb' : 'transparent'}; color:${discountType === 'vnd' ? '#fff' : '#64748b'};">VNĐ</button>
                  </div>
                </div>
                <div style="display:flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0 8px; height:34px; width:140px;">
                  <input type="number" id="order-discount-val" value="${discountType === 'pct' ? (discountPercent || '') : (discountAmount || '')}" min="0" ${discountType === 'pct' ? 'max="100"' : ''} placeholder="0" style="width:100%; border:none; background:transparent; font-size:12.5px; font-weight:700; color:#0f172a; text-align:right; outline:none;" />
                  <span id="order-discount-unit" style="font-size:12px; color:#64748b; margin-left:4px;">${discountType === 'pct' ? '%' : 'đ'}</span>
                </div>
              </div>

              <!-- Tiền chiết khấu (khi dùng %) -->
              ${discountType === 'pct' && discountPercent > 0 ? `
              <div style="display:flex; justify-content:space-between; font-size:12px; color:#64748b; margin:-4px 0 10px;">
                <span>Tiền giảm (${discountPercent}%)</span>
                <span id="summary-discount" style="font-weight:700; color:#dc2626;">-${vnd(calcDiscountAmount())}đ</span>
              </div>` : ''}

              <!-- Mã ưu đãi -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:12.5px; font-weight:600; color:#334155;">Mã ưu đãi</span>
                <div style="display:flex; gap:6px; max-width:210px; width:100%;">
                  <input type="text" id="order-promo" value="${esc(promoCode)}" placeholder="Nhập mã" style="flex:1; height:34px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:12px; padding:0 8px; text-transform:uppercase; outline:none;" ${promoApplied ? 'disabled' : ''} />
                  <button type="button" id="order-promo-btn" style="padding:0 12px; height:34px; border:none; border-radius:8px; background:${promoApplied ? '#dc2626' : '#2563eb'}; color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
                    ${promoApplied ? 'Bỏ' : 'Áp dụng'}
                  </button>
                </div>
              </div>
              <div id="order-promo-msg" style="font-size:11.5px; text-align:right; margin:-4px 0 8px;">${promoApplied ? `<span style="color:#15803d;">✓ ${esc(promoApplied.message || 'Đã áp dụng mã')}</span>` : ''}</div>

              <!-- Tiêu Lá -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div>
                  <span style="font-size:12.5px; font-weight:600; color:#334155;">Tiêu "Lá"</span>
                  <span style="font-size:11px; color:#94a3b8; margin-left:4px;">1 Lá = 1.000đ</span>
                </div>
                <div style="display:flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0 8px; height:34px; width:120px;">
                  <input type="number" id="order-points" value="${usedPoints || ''}" min="0" placeholder="0" style="width:100%; border:none; background:transparent; font-size:12.5px; font-weight:700; color:#0f172a; text-align:right; outline:none;" />
                  <span style="font-size:12px; color:#64748b; margin-left:4px;">Lá</span>
                </div>
              </div>

              <!-- Quy đổi Lá -->
              <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#334155; margin-bottom:8px;">
                <span>Quy đổi Lá</span>
                <span id="summary-points" style="font-weight:700; color:#0f172a;">-${vnd(usedPoints * 1000)}đ</span>
              </div>

              <!-- Phí vận chuyển -->
              <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#334155; margin-bottom:12px;">
                <span>Phí vận chuyển</span>
                <span id="summary-shipping" style="font-weight:700; color:#0f172a;">${vnd(selfShipping || promoApplied?.free_shipping ? 0 : shippingFee)}đ</span>
              </div>

              <!-- Highlight Box: Tổng thanh toán -->
              <div style="background:#f0f7ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-size:13.5px; font-weight:700; color:#1e3a8a;">Tổng thanh toán</span>
                <span id="summary-total" style="font-size:18px; font-weight:800; color:#2563eb; font-variant-numeric:tabular-nums;">${formattedTotal}đ</span>
              </div>

              <!-- Chuyển khoản đặt cọc -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:12.5px; font-weight:600; color:#334155;">Chuyển khoản (đặt cọc)</span>
                <div style="display:flex; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0 8px; height:34px; width:140px;">
                  <input type="number" id="order-deposit" value="${depositAmount || ''}" min="0" placeholder="0" style="width:100%; border:none; background:transparent; font-size:12.5px; font-weight:700; color:#0f172a; text-align:right; outline:none;" />
                  <span style="font-size:12px; color:#64748b; margin-left:4px;">đ</span>
                </div>
              </div>

              <!-- Đã đặt cọc -->
              <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#334155; margin-bottom:8px;">
                <span>Đã đặt cọc</span>
                <span id="summary-deposit" style="font-weight:700; color:#16a34a;">${vnd(depositAmount)}đ</span>
              </div>

              <!-- Còn phải thu (COD) -->
              <div style="display:flex; justify-content:space-between; font-size:13px; color:#334155; margin-bottom:10px;">
                <span>Còn phải thu (COD)</span>
                <span id="summary-cod" style="font-weight:700; color:#ea580c; font-size:14px;">${vnd(Math.max(0, total - depositAmount))}đ</span>
              </div>

              <!-- Trạng thái thanh toán -->
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; color:#334155; padding-top:8px; border-top:1px dashed #e2e8f0;">
                <span>Trạng thái thanh toán</span>
                <span id="summary-pay-status" style="background:#f1f5f9; color:#475569; padding:3px 10px; border-radius:6px; font-size:11.5px; font-weight:600;">
                  ${depositAmount >= total && total > 0 ? 'Đã thanh toán' : depositAmount > 0 ? 'Đã cọc một phần' : 'Chưa thanh toán'}
                </span>
              </div>
            </div>
          </div>

          <!-- 6. STICKY FOOTER -->
          <div class="chatmql-modal-footer" style="position:sticky; bottom:0; background:#fff; z-index:30; border-top:1px solid #e2e8f0; box-shadow:0 -4px 12px rgba(0,0,0,0.06); padding:10px 14px; display:flex; align-items:center; gap:10px;">
            <button type="button" id="btn-reset-order" style="padding:10px 16px; font-size:13px; font-weight:700; color:#ef4444; background:#fff; border:1px solid #fca5a5; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <span>🔄</span> <span>Tạo lại</span>
            </button>
            <button type="button" id="btn-submit-order" style="flex:1; padding:10px 20px; font-size:14px; font-weight:700; color:#fff; background:#1b4332; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 2px 8px rgba(27,67,50,0.3);">
              <span>🛒</span> <span>Đặt hàng</span>
            </button>
          </div>
        </div>
      `;

      // Attach Event Handlers
      modalOverlay.querySelector('#chatmql-close-modal').onclick = () => modalOverlay.remove();
      const resetBtnEl = modalOverlay.querySelector('#btn-reset-order');
      if (resetBtnEl) {
        resetBtnEl.onclick = () => {
          items = [];
          discountPercent = 0;
          usedPoints = 0;
          depositAmount = 0;
          promoApplied = null;
          promoCode = '';
          renderModalContent();
        };
      }

      // Search Product
      const prodSearchInput = modalOverlay.querySelector('#input-search-product');
      const prodSearchResults = modalOverlay.querySelector('#prod-search-results');
      if (prodSearchInput && prodSearchResults) {
        const renderProdSearch = (query) => {
          const qNorm = removeVietnameseTones(query);
          if (!qNorm) { prodSearchResults.style.display = 'none'; return; }
          const matched = catalog.filter(p => {
            const nameNorm = removeVietnameseTones(p.name || '');
            const codeNorm = removeVietnameseTones(p.code || '');
            return nameNorm.includes(qNorm) || codeNorm.includes(qNorm);
          });
          if (!matched.length) {
            prodSearchResults.innerHTML = '<div style="padding:10px; font-size:12px; color:#64748b; text-align:center;">Không tìm thấy sản phẩm</div>';
            prodSearchResults.style.display = 'block';
            return;
          }
          prodSearchResults.innerHTML = matched.map(p => `
            <div class="quick-prod-item" data-code="${p.code}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:6px; cursor:pointer; transition:background 0.12s; border-bottom:1px solid #f1f5f9;">
              <div style="flex:1; min-width:0; margin-right:10px;">
                <div style="font-weight:600; font-size:12.5px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px; display:flex; gap:8px; align-items:center;">
                  <span style="font-family:ui-monospace,monospace; background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px;">${p.code}</span>
                  ${p.weight ? `<span>${p.weight}g</span>` : ''}
                  ${p.inventory > 0 ? `<span style="color:#15803d; font-weight:600;">Tồn ${p.inventory}</span>` : `<span style="color:#dc2626; font-weight:700;">Hết hàng</span>`}
                </div>
              </div>
              <div style="text-align:right; white-space:nowrap;">
                <div style="font-weight:700; font-size:12.5px; color:#0D6838;">${vnd(p.price)}đ</div>
                <span style="font-size:11px; color:#2563eb; font-weight:600;">+ Thêm vào đơn</span>
              </div>
            </div>
          `).join('');

          prodSearchResults.querySelectorAll('.quick-prod-item').forEach(itemEl => {
            itemEl.onmouseenter = () => { itemEl.style.background = '#f0fdf4'; };
            itemEl.onmouseleave = () => { itemEl.style.background = 'transparent'; };
            itemEl.onmousedown = (e) => {
              e.preventDefault();
              const code = itemEl.dataset.code;
              const prod = findProd(code);
              if (prod) {
                const existing = items.find(i => i.code === code && !i.isGift);
                if (existing) {
                  existing.quantity++;
                } else {
                  items.push({ code: prod.code, name: prod.name, price: prod.price, quantity: 1, isGift: false });
                }
                renderModalContent();
              }
            };
          });
          prodSearchResults.style.display = 'block';
        };

        prodSearchInput.oninput = e => renderProdSearch(e.target.value);
        prodSearchInput.onfocus = e => { if (e.target.value.trim()) renderProdSearch(e.target.value); };
        prodSearchInput.onblur = () => setTimeout(() => { prodSearchResults.style.display = 'none'; }, 200);
      }

      // Search Gift
      const giftSearchInput = modalOverlay.querySelector('#input-search-gift');
      const giftSearchResults = modalOverlay.querySelector('#gift-search-results');
      if (giftSearchInput && giftSearchResults) {
        const renderGiftSearch = (query) => {
          const qNorm = removeVietnameseTones(query);
          if (!qNorm) { giftSearchResults.style.display = 'none'; return; }
          const matched = catalog.filter(p => {
            const nameNorm = removeVietnameseTones(p.name || '');
            const codeNorm = removeVietnameseTones(p.code || '');
            return nameNorm.includes(qNorm) || codeNorm.includes(qNorm);
          });
          if (!matched.length) {
            giftSearchResults.innerHTML = '<div style="padding:10px; font-size:12px; color:#64748b; text-align:center;">Không tìm thấy quà tặng</div>';
            giftSearchResults.style.display = 'block';
            return;
          }
          giftSearchResults.innerHTML = matched.map(p => `
            <div class="quick-gift-item" data-code="${p.code}" style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:6px; cursor:pointer; transition:background 0.12s; border-bottom:1px solid #fef3c7;">
              <div style="flex:1; min-width:0; margin-right:10px;">
                <div style="font-weight:600; font-size:12.5px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px; display:flex; gap:8px; align-items:center;">
                  <span style="font-family:ui-monospace,monospace; background:#fef3c7; color:#b45309; padding:1px 4px; border-radius:3px; font-size:10.5px;">${p.code}</span>
                  ${p.weight ? `<span>${p.weight}g</span>` : ''}
                  ${p.inventory > 0 ? `<span style="color:#15803d; font-weight:600;">Tồn ${p.inventory}</span>` : `<span style="color:#dc2626; font-weight:700;">Hết hàng</span>`}
                </div>
              </div>
              <div style="text-align:right; white-space:nowrap;">
                <div style="font-weight:700; font-size:12.5px; color:#b45309;">0đ (Quà tặng)</div>
                <span style="font-size:11px; color:#b45309; font-weight:600;">+ Thêm quà 🎁</span>
              </div>
            </div>
          `).join('');

          giftSearchResults.querySelectorAll('.quick-gift-item').forEach(itemEl => {
            itemEl.onmouseenter = () => { itemEl.style.background = '#fffbeb'; };
            itemEl.onmouseleave = () => { itemEl.style.background = 'transparent'; };
            itemEl.onmousedown = (e) => {
              e.preventDefault();
              const code = itemEl.dataset.code;
              const prod = findProd(code);
              if (prod) {
                const existing = items.find(i => i.code === code && i.isGift);
                if (existing) {
                  existing.quantity++;
                } else {
                  items.push({ code: prod.code, name: prod.name, price: prod.price, quantity: 1, isGift: true });
                }
                renderModalContent();
              }
            };
          });
          giftSearchResults.style.display = 'block';
        };

        giftSearchInput.oninput = e => renderGiftSearch(e.target.value);
        giftSearchInput.onfocus = e => { if (e.target.value.trim()) renderGiftSearch(e.target.value); };
        giftSearchInput.onblur = () => setTimeout(() => { giftSearchResults.style.display = 'none'; }, 200);
      }

      // Tra CRM ngay khi nhân viên gõ số điện thoại.
      //
      // Hơn 7.000 contact đến từ Zalo không có số điện thoại ở bất cứ đâu, nên
      // không thể nối sẵn với CRM. Nhưng khi nhân viên gõ số vào, ta tra được
      // ngay và tự điền địa chỉ + hiện GMV, nhóm KH, gu trà. Đây là đường phủ
      // nốt phần mà việc đồng bộ sẵn không với tới được.
      const phoneInput = modalOverlay.querySelector('#order-cust-phone');
      const addrInput = modalOverlay.querySelector('#order-cust-addr');
      if (phoneInput) {
        let traCuuTimer = null;
        let sdtVuaTra = (phoneInput.value || '').trim();

        const capNhatBanner = (crm, dangTra) => {
          const set = (id, val) => {
            const el = modalOverlay.querySelector('#' + id);
            if (el) el.textContent = val;
          };
          if (dangTra) { set('order-crm-badge', 'ĐANG TRA CRM…'); return; }
          set('order-crm-badge', crm ? 'ĐÃ CÓ TRÊN CRM' : 'CHƯA CÓ TRÊN CRM');
          set('order-crm-group', crm?.cap_vip || crm?.priority_level || '—');
          set('order-crm-staff', currentUserName || crm?.staff_in_charge || 'Trà Dược CSKH');
          set('order-crm-gmv', `${formatDot(crm?.gmv_total || 0)} ₫`);
          set('order-crm-count', `${crm?.order_count || 0} đơn`);
          set('order-crm-taste', crm?.thich_dung_hang || '—');
        };

        phoneInput.addEventListener('input', () => {
          clearTimeout(traCuuTimer);
          const sdt = (phoneInput.value || '').replace(/[\s.\-]/g, '').trim();
          if (sdt === sdtVuaTra) return;
          if (!/^(0|84)[35789]\d{8}$/.test(sdt)) return; // chờ gõ đủ số hợp lệ

          traCuuTimer = setTimeout(async () => {
            sdtVuaTra = sdt;
            capNhatBanner(null, true);
            try {
              const res = await fetch(`${ORDER_API}/customer?phone=${encodeURIComponent(sdt)}`, {
                headers: authHeaders(),
              });
              const data = res.ok ? await res.json() : null;
              const crm = data && data.found ? data.customer : null;
              capNhatBanner(crm, false);

              // Chỉ điền khi ô đang trống — không đè lên thứ nhân viên tự gõ.
              if (crm && addrInput && !addrInput.value.trim() && crm.address) {
                addrInput.value = crm.address;
                addrInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
              const nameInput = modalOverlay.querySelector('#order-cust-name');
              if (crm && nameInput && !nameInput.value.trim() && crm.full_name) {
                nameInput.value = crm.full_name;
              }
            } catch (e) {
              capNhatBanner(null, false);
              console.warn('[order] không tra được CRM theo số điện thoại:', e);
            }
          }, 600);
        });
      }

      // ── Đợt 5: mã ưu đãi ───────────────────────────────────────────
      const promoInput = modalOverlay.querySelector('#order-promo');
      const promoBtn = modalOverlay.querySelector('#order-promo-btn');
      if (promoInput) promoInput.oninput = e => { promoCode = e.target.value.toUpperCase(); };
      if (promoBtn) promoBtn.onclick = async () => {
        const msg = modalOverlay.querySelector('#order-promo-msg');

        if (promoApplied) {   // đang có mã -> bỏ mã
          promoApplied = null;
          promoCode = '';
          renderModalContent();
          return;
        }

        const code = (promoCode || '').trim();
        if (!code) { msg.textContent = 'Nhập mã trước khi bấm áp dụng.'; msg.style.color = '#b45309'; return; }

        promoBtn.disabled = true;
        msg.textContent = 'Đang kiểm tra mã…';
        msg.style.color = '#64748b';
        try {
          const res = await fetch(`${ORDER_API}/promotions/apply`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              code,
              phone: (form.phone || '').trim(),
              // Mã xét trên tiền hàng trước giảm, không gồm quà tặng.
              orderSubtotal: calcSubtotal(),
            }),
          });
          const r = await res.json();
          if (!res.ok) throw new Error(r.error || r.detail || 'Mã không dùng được');
          promoApplied = r;
          renderModalContent();
        } catch (e) {
          msg.textContent = '✗ ' + e.message;
          msg.style.color = '#dc2626';
          promoBtn.disabled = false;
        }
      };

      // ── Đợt 3: quà tặng, loại/nguồn đơn, cờ vận chuyển, đặt cọc ────
      modalOverlay.querySelectorAll('.item-gift').forEach(el => {
        el.onchange = e => {
          const idx = parseInt(e.target.dataset.idx, 10);
          items[idx].isGift = e.target.checked;
          renderModalContent();
        };
      });

      const typeSel = modalOverlay.querySelector('#order-type');
      if (typeSel) typeSel.onchange = e => { orderType = e.target.value; };
      const srcSel = modalOverlay.querySelector('#order-source');
      if (srcSel) srcSel.onchange = e => { orderSource = e.target.value; };
      const sellerSel = modalOverlay.querySelector('#order-seller');
      if (sellerSel) sellerSel.onchange = e => { sellerName = e.target.value; };

      const selfEl = modalOverlay.querySelector('#order-self-ship');
      if (selfEl) selfEl.onchange = e => {
        selfShipping = e.target.checked;
        renderModalContent();
      };
      const fragEl = modalOverlay.querySelector('#order-fragile');
      if (fragEl) fragEl.onchange = e => { isFragile = e.target.checked; };
      const exEl = modalOverlay.querySelector('#order-exchange');
      if (exEl) exEl.onchange = e => { isExchange = e.target.checked; };

      // Đơn vị vận chuyển
      const carrierSel = modalOverlay.querySelector('#order-carrier');
      if (carrierSel) {
        carrierSel.onchange = e => {
          shippingProvider = e.target.value;
          if (shippingProvider === 'vnpost') shippingFee = 25000;
          else if (shippingProvider === 'jt_express') shippingFee = 30000;
          else if (shippingProvider === 'viettel_post') shippingFee = 28000;
          renderModalContent();
        };
      }

      // Kích thước & Cân nặng
      const wEl = modalOverlay.querySelector('#order-pkg-weight');
      if (wEl) wEl.oninput = e => { pkgWeight = Number(e.target.value) || 0; };
      const lEl = modalOverlay.querySelector('#order-pkg-length');
      if (lEl) lEl.oninput = e => { pkgLength = e.target.value; };
      const wiEl = modalOverlay.querySelector('#order-pkg-width');
      if (wiEl) wiEl.oninput = e => { pkgWidth = e.target.value; };
      const hEl = modalOverlay.querySelector('#order-pkg-height');
      if (hEl) hEl.oninput = e => { pkgHeight = e.target.value; };

      function updateSummary() {
        const sub = calcSubtotal();
        const disc = calcDiscountAmount();
        const promoOff = promoApplied?.discount_amount || 0;
        const pointsOff = (usedPoints || 0) * 1000;
        const ship = (selfShipping || promoApplied?.free_shipping) ? 0 : shippingFee;
        const tot = Math.max(0, sub - disc - promoOff - pointsOff + ship);
        const cod = Math.max(0, tot - (depositAmount || 0));

        const totEl = modalOverlay.querySelector('#summary-total');
        if (totEl) totEl.textContent = `${vnd(tot)}đ`;

        const discEl = modalOverlay.querySelector('#summary-discount');
        if (discEl) discEl.textContent = `-${vnd(disc)}đ`;

        const ptsEl = modalOverlay.querySelector('#summary-points');
        if (ptsEl) ptsEl.textContent = `-${vnd(pointsOff)}đ`;

        const shipEl = modalOverlay.querySelector('#summary-shipping');
        if (shipEl) shipEl.textContent = `${vnd(ship)}đ`;

        const depEl = modalOverlay.querySelector('#summary-deposit');
        if (depEl) depEl.textContent = `${vnd(depositAmount)}đ`;

        const codEl = modalOverlay.querySelector('#summary-cod');
        if (codEl) codEl.textContent = `${vnd(cod)}đ`;

        const payStatusEl = modalOverlay.querySelector('#summary-pay-status');
        if (payStatusEl) {
          payStatusEl.textContent = depositAmount >= tot && tot > 0 ? 'Đã thanh toán' : depositAmount > 0 ? 'Đã cọc một phần' : 'Chưa thanh toán';
        }
      }

      // Chiết khấu (Giá trị & Toggle Loại)
      const discValInput = modalOverlay.querySelector('#order-discount-val');
      if (discValInput) {
        discValInput.oninput = e => {
          const val = Math.max(0, Number(e.target.value) || 0);
          if (discountType === 'pct') {
            discountPercent = Math.min(100, val);
          } else {
            discountAmount = val;
          }
          updateSummary();
        };
      }
      const btnPct = modalOverlay.querySelector('#btn-discount-pct');
      if (btnPct) {
        btnPct.onclick = () => {
          if (discountType !== 'pct') {
            discountType = 'pct';
            renderModalContent();
          }
        };
      }
      const btnVnd = modalOverlay.querySelector('#btn-discount-vnd');
      if (btnVnd) {
        btnVnd.onclick = () => {
          if (discountType !== 'vnd') {
            discountType = 'vnd';
            renderModalContent();
          }
        };
      }

      // Tiêu Lá (Points)
      const pointsInput = modalOverlay.querySelector('#order-points');
      if (pointsInput) {
        pointsInput.oninput = e => {
          usedPoints = Math.max(0, Number(e.target.value) || 0);
          updateSummary();
        };
      }

      // Đặt cọc
      const depEl = modalOverlay.querySelector('#order-deposit');
      if (depEl) {
        depEl.oninput = e => {
          depositAmount = Math.max(0, Number(e.target.value) || 0);
          updateSummary();
        };
      }

      // Phí vận chuyển
      const feeInput = modalOverlay.querySelector('#order-shipping-fee');
      if (feeInput) {
        feeInput.oninput = e => {
          shippingFee = Number(e.target.value) || 0;
          updateSummary();
        };
      }

      // ── Đợt 1: trạng thái, kho, địa chỉ 3 cấp ──────────────────────
      const statusSel = modalOverlay.querySelector('#order-status');
      if (statusSel) statusSel.onchange = e => { orderStatusId = parseInt(e.target.value, 10); };

      // Đổi kho thì phải nạp lại danh mục — tồn kho khác nhau theo từng kho.
      const whSel = modalOverlay.querySelector('#order-warehouse');
      if (whSel) whSel.onchange = async (e) => {
        warehouseId = parseInt(e.target.value, 10) || null;
        whSel.disabled = true;
        catalog = await loadCatalog(warehouseId);
        if (catalog.length) {
          items = items.filter(it => catalog.some(p => p.code === it.code));
          if (!items.length) {
            const f = catalog.find(p => p.inventory > 0) || catalog[0];
            if (f) items = [{ code: f.code, name: f.name, price: f.price, quantity: 1 }];
          }
        } else {
          items = [];
        }
        renderModalContent();
      };

      const provSel = modalOverlay.querySelector('#order-province');
      if (provSel) provSel.onchange = async (e) => {
        provinceId = parseInt(e.target.value, 10) || null;
        wardId = null;
        provSel.disabled = true;
        wards = await loadWards(provinceId);
        renderModalContent();
      };

      const wardSel = modalOverlay.querySelector('#order-ward');
      if (wardSel) wardSel.onchange = e => { wardId = parseInt(e.target.value, 10) || null; };

      // Quantity changes
      modalOverlay.querySelectorAll('.btn-qty-minus').forEach(el => {
        el.onclick = (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          if (items[idx].quantity > 1) {
            items[idx].quantity--;
            renderModalContent();
          }
        };
      });
      modalOverlay.querySelectorAll('.btn-qty-plus').forEach(el => {
        el.onclick = (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          items[idx].quantity++;
          renderModalContent();
        };
      });

      modalOverlay.querySelectorAll('.item-qty').forEach(el => {
        el.onchange = (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
          items[idx].quantity = val;
          renderModalContent();
        };
      });

      modalOverlay.querySelectorAll('.btn-remove-item').forEach(el => {
        el.onclick = (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          items.splice(idx, 1);
          renderModalContent();
        };
      });

      // Submit Order — MỘT đường duy nhất: ChatMQL backend -> CRM.
      const orderRequestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const submitBtn = modalOverlay.querySelector('#btn-submit-order');
      const resetBtn = () => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🛒</span> <span>Đặt hàng</span>';
      };

      submitBtn.onclick = async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span> <span>Đang đồng bộ CRM & FM...</span>';

        captureForm();
        const custName = (form.name || '').trim();
        const custPhone = (form.phone || '').trim();
        const custAddr = (form.addr || '').trim();
        const payMethod = depositAmount > 0 ? 'vietqr' : 'cod';
        const carrier = shippingProvider || 'vnpost';
        const notes = (form.notes || '').trim();

        const thieu = [];
        if (!custName)  thieu.push({ o: '#order-cust-name',  ten: 'Tên khách hàng' });
        if (!custPhone) thieu.push({ o: '#order-cust-phone', ten: 'Số điện thoại' });
        if (!custAddr)  thieu.push({ o: '#order-cust-addr',  ten: 'Địa chỉ nhận hàng' });

        modalOverlay.querySelectorAll('.chatmql-form-input').forEach(el => {
          el.style.borderColor = '';
          el.style.boxShadow = '';
        });

        if (thieu.length) {
          thieu.forEach(t => {
            const el = modalOverlay.querySelector(t.o);
            if (el) {
              el.style.borderColor = '#dc2626';
              el.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.15)';
            }
          });
          const dau = modalOverlay.querySelector(thieu[0].o);
          if (dau) { dau.focus(); dau.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          alert(
            'Chưa thể lên đơn — còn thiếu:\n\n' +
            thieu.map(t => '  • ' + t.ten).join('\n') +
            '\n\nKhách này chưa có sẵn thông tin trên hệ thống, mời anh/chị nhập tay. ' +
            'Nhập số điện thoại xong, nếu khách đã có trên CRM thì địa chỉ sẽ tự điền.'
          );
          resetBtn();
          return;
        }
        if (!items.length) {
          alert(catalog.length
            ? 'Đơn hàng chưa có sản phẩm nào. Bấm "+ Thêm sản phẩm" để chọn.'
            : 'Kho đang chọn không có sản phẩm nào. Vui lòng chọn kho khác.');
          resetBtn();
          return;
        }
        if (!authToken()) {
          alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi lên đơn.');
          resetBtn();
          return;
        }

        const provName = lookups.provinces.find(pv => pv.id === provinceId)?.name || '';
        const wardName = wards.find(wd => wd.id === wardId)?.name || '';
        const fullAddress = [custAddr, wardName, provName].filter(Boolean).join(', ');

        const finalDiscountAmount = calcDiscountAmount() + (promoApplied?.discount_amount || 0) + (usedPoints * 1000);
        const finalShipFee = (selfShipping || promoApplied?.free_shipping) ? 0 : shippingFee;

        const payload = {
          requestId: orderRequestId,
          conversationId: getCurrentConversationId(),
          customerName: custName,
          customerPhone: custPhone,
          shippingAddress: fullAddress,
          city: provName || defaultCity,
          // ── Đợt 1 ──
          orderStatusId: orderStatusId,
          warehouseId: warehouseId,
          provinceId: provinceId,
          provinceName: provName,
          wardId: wardId,
          wardName: wardName,
          addressDetail: custAddr,
          // ── Đợt 3 ──
          depositAmount: depositAmount,
          orderType: orderType,
          orderSource: orderSource,
          selfShipping: selfShipping,
          isFragile: isFragile,
          isExchange: isExchange,
          sellerName: sellerName,
          // ── Đợt 5 ──
          promoCode: promoApplied?.promotion?.code || null,
          promoDiscount: promoApplied?.discount_amount || 0,
          usedPoints: usedPoints,
          pointDiscount: usedPoints * 1000,
          pkgWeight: pkgWeight != null ? pkgWeight : calcTotalWeight(),
          pkgDimensions: { length: pkgLength, width: pkgWidth, height: pkgHeight },
          items: items.map(i => ({
            productCode: i.code,
            productName: i.name,
            quantity: i.quantity,
            unitPrice: i.price,
            isGift: !!i.isGift,
          })),
          discountAmount: finalDiscountAmount,
          shippingFee: finalShipFee,
          paymentMethod: payMethod,
          shippingProvider: carrier,
          notes: notes,
        };

        try {
          const res = await fetch(`${ORDER_API}/create`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          let result = null;
          try { result = await res.json(); } catch (e) { /* body rỗng */ }

          if (!res.ok) {
            // 401/403 = vấn đề phiên đăng nhập; 502/504 = CRM không với tới được.
            const msg =
              res.status === 401 || res.status === 403
                ? 'Phiên đăng nhập hết hạn hoặc bạn không có quyền lên đơn.'
                : (result && (result.error || result.detail)) ||
                  `Máy chủ trả lỗi ${res.status}`;
            alert('❌ KHÔNG TẠO ĐƯỢC ĐƠN\n\n' + msg + '\n\nĐơn CHƯA được ghi nhận. Bạn có thể bấm lại — hệ thống sẽ không tạo đơn trùng.');
            resetBtn();
            return;
          }

          // Tới đây đơn đã nằm trong CRM. Chỉ còn câu hỏi FM đã nhận chưa.
          const total = result.total_amount || calculateTotal();
          const fmOk = result.fm_saved !== false;

          // Hộp thoại thì đóng hẳn. Nằm trong cột thì không được xoá — cột sẽ
          // trống trơn. Dựng lại form sạch cho đơn kế tiếp.
          const inlineHost = modalOverlay.classList.contains('chatmql-order-inline')
            ? modalOverlay.parentElement : null;
          modalOverlay.remove();
          if (inlineHost) window.openChatMqlOrderModal(inlineHost);

          const money = `${formatDot(total)} ₫`;
          if (result.replayed) {
            alert(`ℹ️ ĐƠN NÀY ĐÃ ĐƯỢC TẠO TRƯỚC ĐÓ [${result.order_code}]\n\n• Tổng tiền: ${money}\n\nHệ thống không tạo đơn trùng.`);
          } else if (fmOk) {
            alert(`🎉 LÊN ĐƠN THÀNH CÔNG [${result.order_code}]!\n\n• Tổng tiền: ${money}\n• Đã ghi vào CRM (hoa_don)\n• Đã ghi vào Hệ thống FM (invoice)`);
          } else {
            // KHÔNG báo thành công trọn vẹn khi mới ghi được một nửa.
            alert(`⚠️ ĐƠN ĐÃ TẠO NHƯNG CHƯA ĐỦ [${result.order_code}]\n\n• Tổng tiền: ${money}\n• Đã ghi vào CRM (hoa_don) ✅\n• CHƯA ghi được vào Hệ thống FM ❌\n\nHệ thống sẽ tự đẩy lại sang FM. Báo bộ phận kỹ thuật nếu sau ít phút vẫn chưa thấy đơn bên FM.\n\nChi tiết: ${result.fm_error || 'không rõ'}`);
          }

          // Làm mới lịch sử đơn ở sidebar — GMV và số đơn vừa thay đổi nên phải
          // bỏ cả cache ngữ cảnh hội thoại, không chỉ cache lịch sử.
          lastFetchedPhone = '';
          fetchConversationContext(true).then(() => renderOrderHistorySidebar());

          // Soạn sẵn tin xác nhận cho nhân viên (KHÔNG tự gửi cho khách)
          const chatTextarea = document.querySelector('textarea, [contenteditable="true"]');
          if (chatTextarea && !result.replayed) {
            const lines = [
              `Dạ em gửi anh/chị xác nhận đơn hàng #${result.order_code}:`,
              `- Sản phẩm: ${items.map(i => `${i.name} (x${i.quantity})`).join(', ')}`,
              `- Tổng thanh toán: ${money}`,
              `- Địa chỉ: ${custAddr}`,
            ];
            if (result.vietqr_url) {
              lines.push('', `Quét mã QR thanh toán nhanh: ${result.vietqr_url}`);
            }
            chatTextarea.value = lines.join('\n');
            chatTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (err) {
          console.error('[order] lỗi mạng khi lên đơn:', err);
          alert('Lỗi kết nối máy chủ khi lên đơn: ' + err.message + '\n\nBấm lại sẽ không tạo đơn trùng.');
          resetBtn();
        }
      };

      if (scrollContainer && scrollContainer.scrollTop !== undefined) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = savedScroll;
        });
      }
    }

    try {
      renderModalContent();
      if (mountEl) {
        modalOverlay.classList.add('chatmql-order-inline');
        mountEl.innerHTML = '';
        mountEl.appendChild(modalOverlay);
      } else {
        document.body.appendChild(modalOverlay);
      }
    } catch (e) {
      console.error('[order] Lỗi render form lên đơn:', e);
      if (mountEl) {
        mountEl.innerHTML = `<div style="padding:14px; color:#dc2626; font-size:12.5px;">Lỗi tải form tạo đơn: ${e.message}</div>`;
      }
    }
  };

  // ── Chuyển trực tiếp sang tab "Tạo đơn" ở cột thao tác khách hàng bên phải ──
  window.openCustomerOrderTab = function () {
    const sidebar = document.querySelector('.chat-detail') ||
                    document.querySelector('.conversation-info-sidebar, [class*="contact-details"], [class*="customer-panel"]') ||
                    Array.from(document.querySelectorAll('h3, div')).find(el => el.textContent === 'THÔNG TIN' || el.textContent === 'CUSTOMER 360')?.parentElement;

    const toggleBtn = document.querySelector('[class*="toggle-sidebar"], [title*="chi tiết"], [title*="thông tin"], [class*="sidebar-toggle"]');
    if (toggleBtn && (!sidebar || sidebar.offsetWidth === 0)) {
      try { toggleBtn.click(); } catch (_) {}
    }

    const card = document.getElementById('chatmql-cust-card');
    if (card && sidebar) {
      if (typeof ccSelectTab === 'function') {
        ccSelectTab(card, sidebar, 'order');
      }
      const orderTabBtn = card.querySelector('.chat-detail__tab[data-tab="order"]');
      if (orderTabBtn) {
        orderTabBtn.click();
      }
      const orderForm = card.querySelector('#cc-order-form') || card.querySelector('#cc-panel-order');
      if (orderForm) {
        orderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      const tabBtn = document.querySelector('.chat-detail__tab[data-tab="order"]');
      if (tabBtn) {
        tabBtn.click();
      } else {
        window.openChatMqlOrderModal();
      }
    }
  };

  // Observe and Inject "LÊN ĐƠN" button in chat toolbar & Customer 360 sidebar
  function injectOrderButtons() {
    // 1. Inject in Chat Toolbar (next to AI Gợi ý / Tin nhanh) -> Trỏ thẳng sang tab Tạo đơn ở cột bên phải
    const toolbar = document.querySelector('.chat-input-toolbar, [class*="input-toolbar"], [class*="quick-reply"], [class*="suggestion"]')?.parentElement ||
                    document.querySelector('textarea')?.parentElement?.parentElement;

    const existingBtn = document.getElementById('chatmql-order-btn-toolbar');
    if (!existingBtn) {
      const btnGroup = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI Gợi ý') || b.textContent.includes('Tin nhanh'))?.parentElement;
      if (btnGroup) {
        const orderBtn = document.createElement('button');
        orderBtn.id = 'chatmql-order-btn-toolbar';
        orderBtn.type = 'button';
        orderBtn.className = 'chatmql-order-btn';
        orderBtn.innerHTML = '<span>🛍️</span> <span>Lên đơn</span>';
        orderBtn.onclick = () => window.openCustomerOrderTab();
        btnGroup.appendChild(orderBtn);
      }
    }

    // 2. Inject in Customer 360 Profile Sidebar -> Trỏ thẳng sang tab Tạo đơn
    const profileSidebar = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Xem hồ sơ khách hàng'))?.parentElement;
    const existingSidebarBtn = document.getElementById('chatmql-order-btn-sidebar');
    if (profileSidebar && !existingSidebarBtn) {
      const orderBtnSidebar = document.createElement('button');
      orderBtnSidebar.id = 'chatmql-order-btn-sidebar';
      orderBtnSidebar.type = 'button';
      orderBtnSidebar.className = 'chatmql-order-btn';
      orderBtnSidebar.style.width = '100%';
      orderBtnSidebar.style.marginTop = '10px';
      orderBtnSidebar.style.padding = '8px 14px';
      orderBtnSidebar.style.fontSize = '13.5px';
      orderBtnSidebar.style.justifyContent = 'center';
      orderBtnSidebar.innerHTML = '<span>🛍️</span> <span>TẠO ĐƠN HÀNG MỚI</span>';
      orderBtnSidebar.onclick = () => window.openCustomerOrderTab();
      profileSidebar.appendChild(orderBtnSidebar);
    }

    // 3. Render Order History in Sidebar
    renderOrderHistorySidebar();

    // 4. Heal Chat Images
    healChatImages();
  }

  // ── 4. Chat Image Auto-Healer & Zalo CDN Hotlink Protection ───────────
  function healChatImages() {
    document.querySelectorAll('.msg__image img, .chat-timeline img, img[alt="Ảnh"]').forEach((img) => {
      if (!img.getAttribute('referrerpolicy')) {
        img.setAttribute('referrerpolicy', 'no-referrer');
      }
      const currentSrc = img.src || '';
      // Fix local vs live uploads origin mismatch
      if (window.location.protocol === 'https:' && currentSrc.includes('http://localhost:4520/uploads/')) {
        img.src = currentSrc.replace('http://localhost:4520/uploads/', `${API_BASE}/uploads/`);
      } else if (window.location.hostname === 'localhost' && currentSrc.includes('https://tracrm-api.bizino.ai/uploads/')) {
        img.src = currentSrc.replace('https://tracrm-api.bizino.ai/uploads/', 'http://localhost:4520/uploads/');
      }

      // If image failed and span error exists, attempt proxy recovery
      if (img.style.display === 'none' && !img.dataset.proxyRetried) {
        img.dataset.proxyRetried = 'true';
        if (currentSrc && !currentSrc.includes('/api/v1/media/proxy')) {
          const proxySrc = `${API_BASE}/api/v1/media/proxy?url=${encodeURIComponent(currentSrc)}`;
          const testImg = new Image();
          testImg.referrerPolicy = 'no-referrer';
          testImg.onload = () => {
            img.src = proxySrc;
            img.style.display = 'block';
            const errSpan = img.parentElement?.querySelector('span');
            if (errSpan && errSpan.textContent.includes('không tải được')) {
              errSpan.remove();
            }
          };
          testImg.src = proxySrc;
        }
      }
    });
  }


  // ══════════════════════════════════════════════════════════════════
  // TÀI LIỆU BÁN HÀNG — panel gắn thẳng vào thanh bên phải.
  //
  // Dựng theo design/chat-mql-v2.html: cùng thanh tab với các mục khác
  // nhưng có vạch ranh giới và màu hổ phách riêng, vì đây là kho nội dung
  // GỬI RA NGOÀI cho khách, khác hẳn các tab chỉ để xem.
  //
  // Khác bản mockup ở một chỗ: mockup vẽ ô vuông bằng emoji + màu gradient
  // vì chưa có dữ liệu thật. Ở đây ô vuông hiện ảnh thật của sản phẩm, chỉ
  // rơi về emoji khi ảnh không tải được.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // GIAO DIỆN THEO design/chat-mql-v2.html
  //
  // File thiết kế được viết bám sát markup thật của ChatMQL — 100 trong 165
  // class app đang dùng có mặt nguyên tên trong design. Nhờ vậy áp được bằng
  // một lớp CSS đè, không cần mã nguồn React.
  //
  // Chỉ giữ những rule chạm tới class app THẬT SỰ đang dùng (119/455 rule).
  // Bỏ hết rule cho selector thuần element (body, button, *) vì chúng quá rộng,
  // sẽ đè lên những màn hình khác ngoài Hội thoại.
  //
  // Tắt tạm bằng console:  window.chatmqlDesign(false)
  // ══════════════════════════════════════════════════════════════════
  const DESIGN_STYLE_ID = 'chatmql-design-override';
  const DESIGN_CSS = `/* Bảng màu gốc từ design */
:root{--primary:var(--primary-color,#0D6838);--primary-500:#2563eb;--gray-50:#f8fafc;--gray-100:#f1f5f9;--gray-200:#e2e8f0;--gray-300:#cbd5e1;--gray-400:#94a3b8;--gray-500:#64748b;--gray-600:#475569;--gray-700:#334155;--gray-800:#1e293b;--gray-900:#0f172a;}
.topnav{display:flex; align-items:center; gap:20px; padding:0 20px; height:56px; border-bottom:1px solid var(--gray-200); background:#fff; flex-shrink:0;}
.topnav__logo{display:flex; align-items:center;}
.topnav__logo-img{height:42px; max-height:44px; width:auto; object-fit:contain; display:block;}
.topnav__tabs{display:flex; gap:4px;}
.topnav__tab{display:flex; align-items:center; gap:6px; padding:8px 14px; border:none; background:none; border-radius:8px; font-size:13.5px; font-weight:500; color:var(--gray-600); cursor:pointer;}
.topnav__tab:hover{background:var(--gray-100);}
.topnav__tab--active{background:color-mix(in srgb, var(--primary) 10%, white); color:var(--primary); font-weight:600;}
.topnav__right{margin-left:auto; display:flex; align-items:center; gap:8px;}
.topnav__search{display:flex; align-items:center; gap:8px; background:var(--gray-100); border-radius:8px; padding:7px 12px; font-size:12.5px; color:var(--gray-400); min-width:230px;}
.topnav__search kbd{margin-left:auto; background:#fff; border:1px solid var(--gray-200); border-radius:4px; padding:1px 5px; font-size:10.5px; color:var(--gray-500); font-family:inherit;}
.topnav__icon-btn{background:none; border:none; cursor:pointer; color:var(--gray-500); width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; position:relative;}
.topnav__icon-btn:hover{background:var(--gray-100);}
.topnav__badge{position:absolute; top:2px; right:0; background:#ef4444; color:#fff; font-size:9px; font-weight:700; border-radius:8px; padding:1px 4px; line-height:1.2;}
.topnav__user{display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 6px; border-radius:8px;}
.topnav__user:hover{background:var(--gray-100);}
.topnav__user-avatar{width:32px; height:32px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600;}
.topnav__user-info{display:flex; flex-direction:column; line-height:1.25;}
.topnav__user-name{font-size:12.5px; font-weight:600; color:var(--gray-800);}
.topnav__user-role{font-size:11px; color:var(--gray-500);}
.layout{flex:1; display:flex; overflow:hidden;}
.chat-layout{flex:1; display:flex; overflow:hidden;}
.chat-icon-bar{width:52px; border-right:1px solid var(--gray-200); background:var(--gray-50); display:flex; flex-direction:column; align-items:center; padding:10px 0; gap:6px; flex-shrink:0;}
.chat-icon-bar__item{width:38px; height:38px; border:none; background:none; border-radius:10px; cursor:pointer; color:var(--gray-500); display:flex; align-items:center; justify-content:center; position:relative;}
.chat-icon-bar__item:hover{background:var(--gray-200);}
.chat-icon-bar__item--active{background:color-mix(in srgb, var(--primary) 12%, white); color:var(--primary);}
.chat-icon-bar__badge{position:absolute; top:-2px; right:-4px; background:#ef4444; color:#fff; font-size:9px; font-weight:700; border-radius:8px; padding:1px 4px; line-height:1.3;}
.chat-icon-bar__divider{width:26px; height:1px; background:var(--gray-200); margin:4px 0;}
.chat-icon-bar__spacer{flex:1;}
.chat-list{width:308px; border-right:1px solid var(--gray-200); display:flex; flex-direction:column; flex-shrink:0; background:#fff;}
.chat-list__header{padding:14px 16px 0;}
.chat-list__title-row{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;}
.chat-list__title{font-size:16px; font-weight:700;}
.chat-list__actions{display:flex; gap:4px;}
.chat-list__action-btn{background:none; border:none; cursor:pointer; color:var(--gray-500); width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center;}
.chat-list__action-btn:hover{background:var(--gray-100);}
.search-input{display:flex; align-items:center; gap:8px; background:var(--gray-100); border-radius:8px; padding:0 10px;}
.search-input__field{border:none; background:none; outline:none; font-size:13px; padding:8px 0; width:100%; font-family:inherit;}
.filter-bar{display:flex; gap:5px; margin:10px 0; overflow-x:auto; flex-wrap:wrap;}
.filter-bar__btn{border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); font-size:12px; padding:4px 10px; border-radius:14px; cursor:pointer; white-space:nowrap; transition:all .15s ease;}
.filter-bar__btn--active{background:var(--primary); border-color:var(--primary); color:#fff; font-weight:600;}
.chat-list__account-filter{display:flex; align-items:center; gap:8px; padding:7px 10px; border:1px solid var(--gray-200); border-radius:8px; cursor:pointer; margin-bottom:10px; font-size:12.5px;}
.chat-list__account-avatar{width:20px; height:20px; border-radius:6px; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;}
.chat-list__account-name{font-weight:500; color:var(--gray-700);}
.chat-list__account-count{margin-left:auto; background:var(--gray-100); border-radius:10px; padding:1px 7px; font-size:11px; color:var(--gray-500); font-weight:600;}
.tab-bar{display:flex; border-bottom:1px solid var(--gray-200); padding:0 16px; gap:18px;}
.tab-bar__btn{border:none; background:none; cursor:pointer; font-size:13px; color:var(--gray-500); padding:8px 0; border-bottom:2px solid transparent;}
.tab-bar__btn--active{color:var(--primary); font-weight:600; border-bottom-color:var(--primary);}
.chat-list__items{flex:1; overflow-y:auto;}
.conv-item{display:flex; gap:10px; padding:10px 16px; cursor:pointer; position:relative; align-items:flex-start;}
.conv-item:hover{background:var(--gray-50);}
.conv-item--active{background:color-mix(in srgb, var(--primary) 7%, white);}
.conv-item__avatar{position:relative; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:600; flex-shrink:0; overflow:hidden;}
.conv-item__body{flex:1; min-width:0;}
.conv-item__top{display:flex; align-items:baseline; gap:8px;}
.conv-item__name{font-size:13px; font-weight:600; color:var(--gray-800); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.conv-item__time{font-size:11px; color:var(--gray-400); flex-shrink:0;}
.conv-item__preview{font-size:12px; color:var(--gray-500); margin-top:2px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;}
.conv-item__source{display:flex; align-items:center; gap:4px; margin-top:4px; font-size:11px; color:var(--gray-500);}
.conv-item__source span{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.conv-item__unread-badge{position:absolute; right:14px; bottom:12px; background:#ef4444; color:#fff; font-size:10px; font-weight:700; border-radius:9px; min-width:18px; height:18px; display:flex; align-items:center; justify-content:center; padding:0 5px;}
.chat-messages__load-more-btn{border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); font-size:12.5px; padding:7px 14px; border-radius:8px; cursor:pointer;}
.chat-messages__load-more-btn:hover{background:var(--gray-50);}
.chat-main{flex:1; display:flex; flex-direction:column; min-width:0; background:#fff;}
.chat-main__header{display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid var(--gray-100);}
.chat-back-btn{display:none; background:none; border:none; cursor:pointer; color:var(--gray-500);}
.chat-main__info{min-width:0;}
.chat-main__name{display:flex; align-items:center; font-size:14.5px; font-weight:700;}
.pipeline-dropdown__trigger{background:rgba(37,99,235,.094); color:#2563eb; border:1px solid rgba(37,99,235,.25); border-radius:12px; padding:2px 10px 2px 7px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left:8px; vertical-align:middle;}
.chat-main__meta{font-size:12px; color:var(--gray-500); margin-top:2px; display:flex; align-items:center; flex-wrap:wrap;}
.chat-main__header-actions{margin-left:auto; display:flex; align-items:center; gap:6px;}
.ai-mode-dd__trigger{display:inline-flex; align-items:center; gap:6px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); font-size:12px; font-weight:600; padding:5px 10px; border-radius:8px; cursor:pointer;}
.chat-main__header-btn{background:none; border:none; cursor:pointer; color:var(--gray-500); width:30px; height:30px; border-radius:7px; display:flex; align-items:center; justify-content:center;}
.chat-main__header-btn:hover{background:var(--gray-100);}
.chat-main__subheader{display:flex; align-items:center; gap:8px; padding:7px 16px; font-size:12px; color:var(--gray-500); border-bottom:1px solid var(--gray-100);}
.chat-messages{flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:4px; background:var(--gray-50);}
.msg-wrapper{display:flex; flex-direction:column;}
.chat-messages__date{align-self:center; font-size:11px; font-weight:600; color:var(--gray-400); text-align:center; margin:10px 0; text-transform:uppercase; letter-spacing:.4px;}
.msg{display:flex; gap:8px; max-width:78%;}
.msg--received{align-self:flex-start;}
.msg--sent{align-self:flex-end; flex-direction:row-reverse;}
.msg__image{max-width:280px; background:#fff; border:1px solid var(--gray-200); border-radius:8px; padding:22px 16px; text-align:center;}
.msg__image span{color:var(--gray-400); font-size:12px;}
.msg__time{font-size:10.5px; color:var(--gray-400); margin-top:3px; display:flex; align-items:center; gap:3px;}
.msg--sent .msg__time{justify-content:flex-end;}
.msg__actions{display:none;}
.chat-tag-bar{display:flex; align-items:center; gap:8px; padding:7px 16px; border-top:1px solid var(--gray-100); font-size:12px; color:var(--gray-500);}
.chat-tag-bar__label{display:inline-flex; align-items:center; gap:4px; font-weight:500;}
.chat-tag-bar__add{border:1px dashed var(--gray-300); background:none; color:var(--gray-500); font-size:11.5px; padding:2px 10px; border-radius:12px; cursor:pointer;}
.chat-input{border-top:1px solid var(--gray-100); padding:8px 16px 12px;}
.chat-input__toolbar{display:flex; gap:6px; margin-bottom:8px;}
.chat-input__tool-btn{display:inline-flex; align-items:center; gap:5px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); font-size:12px; padding:4px 10px; border-radius:14px; cursor:pointer;}
.chat-input__tool-btn--active{background:color-mix(in srgb, var(--primary) 10%, white); border-color:var(--primary); color:var(--primary); font-weight:600;}
.chat-input__textarea{width:100%; border:none; outline:none; resize:none; font-family:inherit; font-size:13.5px; padding:6px 0; min-height:34px;}
.chat-input__footer{display:flex; align-items:center; justify-content:space-between; gap:10px;}
.chat-input__sender{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--gray-500); cursor:pointer;}
.chat-input__sender-avatar{width:22px; height:22px; border-radius:50%; background:var(--primary); color:#fff; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center;}
.chat-input__send-row{display:flex; align-items:center; gap:4px;}
.chat-input__attach-btn,.chat-input__sticker-btn{background:none; border:none; cursor:pointer; padding:4px 8px; color:var(--gray-500); display:flex; align-items:center; gap:4px; font-size:12px; border-radius:6px;}
.chat-input__shortcut{font-size:11px; color:var(--gray-400); margin:0 6px;}
.chat-input__send-btn{display:inline-flex; align-items:center; gap:5px; background:var(--primary); color:#fff; border:none; font-size:12.5px; font-weight:600; padding:7px 16px; border-radius:8px; cursor:pointer;}
.chat-detail{width:365px; border-left:1px solid var(--gray-200); overflow-y:auto; flex-shrink:0; background:#fff; position:relative; min-width:320px;}
.chat-detail__tabs{display:flex; border-bottom:1px solid var(--gray-200); padding:0 10px; gap:8px; position:sticky; top:0; background:#fff; z-index:10; overflow-x:auto;}
.chat-detail__tab{border:none; background:none; cursor:pointer; font-size:12px; color:var(--gray-500); padding:11px 0; border-bottom:2px solid transparent; white-space:nowrap;}
.chat-detail__tab--active{color:var(--primary); font-weight:600; border-bottom-color:var(--primary);}
.chat-detail__section{padding:14px 16px; border-bottom:1px solid var(--gray-100);}
.chat-detail__section-header{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;}
.chat-detail__section-title{font-size:11.5px; font-weight:700; color:var(--gray-500); letter-spacing:.4px; display:inline-flex; align-items:center; gap:5px;}
.chat-detail__section-action{font-size:11.5px; color:var(--primary); font-weight:600; display:inline-flex; align-items:center; gap:3px; cursor:pointer;}
.contact-ai{background:linear-gradient(135deg,#faf5ff 0%, #eff6ff 100%);}
.contact-ai__title{color:#7c3aed;}
.contact-ai__idle-hint{font-size:12px; color:var(--gray-500); margin:8px 0 10px;}
.contact-ai__idle-btn{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:6px; background:linear-gradient(90deg,#8b5cf6,#6366f1); color:#fff; border:none; font-size:12.5px; font-weight:600; padding:8px 12px; border-radius:8px; cursor:pointer;}
.chat-detail__profile-btn{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-700); font-size:12.5px; font-weight:500; padding:8px 12px; border-radius:8px; cursor:pointer;}
.chat-detail__profile-btn:hover{background:var(--gray-50);}
.chat-detail__info-row{display:flex; align-items:center; gap:8px; padding:5px 0; min-height:32px;}
.chat-detail__label{font-size:12.5px; color:var(--gray-600);}
.chat-detail__quick-btn{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:5px; border:1px dashed var(--gray-300); background:none; color:var(--gray-600); font-size:12px; padding:7px 12px; border-radius:8px; cursor:pointer;}
.chat-detail__tab--sales.chat-detail__tab--active{color:#b45309; border-bottom-color:#b45309;}
.ai-fab-wrap .contact-ai__idle-btn{box-shadow:0 6px 18px rgba(99,102,241,.35);}
.chat-header-more{position:relative;}`;

  // CSS cho các component design chưa có trong app (of-*, pd-*, lib-*, ai-*,
  // bday-card, chat-more-menu, chat-resizer, crm-*…). Nạp sẵn để khi dựng markup
  // bằng đúng tên class của design là có kiểu dáng ngay, không phải viết lại.
  const DESIGN_COMPONENT_CSS = `.impersonate-banner{background:linear-gradient(90deg,#f59e0b 0%,#ef4444 100%); color:#fff; padding:8px 20px; font-size:13px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:12px; position:sticky; top:0; z-index:100; flex-shrink:0;}
.impersonate-banner button{background:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.4); color:#fff; padding:4px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;}
.icon-tip{position:fixed; z-index:300; background:#0f172a; color:#fff; border-radius:10px; padding:9px 13px; max-width:230px; pointer-events:none; opacity:0; transform:translateX(-4px); transition:opacity .12s, transform .12s; box-shadow:0 8px 24px rgba(0,0,0,.25);}
.icon-tip.show{opacity:1; transform:none;}
.icon-tip__title{font-size:13px; font-weight:700; line-height:1.35;}
.icon-tip__desc{font-size:12px; opacity:.75; line-height:1.4; margin-top:1px;}
.icon-tip::before{content:''; position:absolute; left:-5px; top:50%; margin-top:-5px; border-top:5px solid transparent; border-bottom:5px solid transparent; border-right:5px solid #0f172a;}
.search-input__icon{color:var(--gray-400);}
.zalo-ic{width:12px; height:12px; border-radius:3px; background:#0068ff; color:#fff; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; font-size:8px; font-weight:800; letter-spacing:-.3px;}
.pipeline-dropdown__dot{width:6px; height:6px; border-radius:50%; background:#2563eb;}
.chat-scope-bar{display:flex; gap:6px; padding:6px 16px; flex-wrap:wrap; border-bottom:1px solid var(--gray-100); background:var(--gray-50);}
.chat-scope-bar button{font-size:12px; padding:3px 10px; border-radius:14px; cursor:pointer; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600);}
.chat-scope-bar button.is-active{border-color:var(--primary-500); background:var(--primary-500); color:#fff; font-weight:600;}
.msg__avatar{width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600; flex-shrink:0;}
.bday-card{width:280px; border-radius:14px; overflow:hidden; box-shadow:0 2px 16px rgba(251,146,60,.18); background:#fff;}
.bday-card__head{background:linear-gradient(135deg,#fb923c 0%,#f472b6 50%,#a78bfa 100%); padding:16px 18px 12px; text-align:center;}
.bday-card__avatar{width:56px; height:56px; border-radius:50%; border:3px solid rgba(255,255,255,.7); margin:0 auto 8px; background:#9333ea; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700;}
.bday-card__name{color:#fff; font-size:14px; font-weight:700; text-shadow:0 1px 4px rgba(0,0,0,.15); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.bday-card__body{padding:12px 16px; background:#fffbeb; display:flex; flex-direction:column; align-items:center; gap:4px;}
.bday-card__date{font-size:12px; font-weight:600; color:#f59e0b; letter-spacing:.5px;}
.bday-card__hint{font-size:13px; color:#78350f; font-weight:500;}
.bday-card__art{font-size:34px; margin-top:4px;}
.chat-resizer{width:6px; flex-shrink:0; cursor:col-resize; background:transparent; transition:background .12s; position:relative; z-index:30;}
.chat-resizer:hover, .chat-resizer.dragging{background:color-mix(in srgb, var(--primary) 40%, transparent);}
.chat-resizer__grip{position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:20px; height:38px; border-radius:10px; background:#fff; border:1px solid var(--gray-300); box-shadow:0 2px 8px rgba(15,23,42,.14); display:flex; align-items:center; justify-content:center; color:var(--gray-500); cursor:col-resize;}
.chat-resizer:hover .chat-resizer__grip, .chat-resizer.dragging .chat-resizer__grip{border-color:var(--primary); color:var(--primary);}
body.resizing-detail{cursor:col-resize; user-select:none;}
.chat-detail__order-btn{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:6px; background:var(--primary); color:#fff; border:none; font-size:12.5px; font-weight:700; padding:9px 12px; border-radius:8px; cursor:pointer; margin-top:8px; box-shadow:0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);}
.chat-detail__order-btn:hover{filter:brightness(1.08);}
.chat-detail__info-icon{color:var(--gray-400);}
.chat-detail__value{margin-left:auto; font-size:12px; padding:2px 6px; border-radius:4px; cursor:pointer;}
.chat-detail__value--set{color:#2563eb;}
.chat-detail__value--dark{color:var(--gray-700);}
.chat-detail__value--empty{color:var(--gray-400);}
.cf-group{margin-bottom:12px;}
.cf-group__title{display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--gray-500); text-transform:uppercase; padding:4px 0 6px; letter-spacing:.3px; border-bottom:1px solid var(--gray-100); margin-bottom:4px;}
.chat-detail__empty{font-size:12px; color:var(--gray-400); margin-bottom:8px;}
.chat-detail__panel{display:none;}
.chat-detail__panel--active{display:block;}
.of{padding:14px 14px 0; display:flex; flex-direction:column;}
.of__section-title{font-size:13px; font-weight:700; color:var(--gray-800); border-left:3px solid #ef4444; padding-left:8px; margin:14px 0 10px;}
.of__section-title:first-child{margin-top:0;}
.of__row{display:flex; gap:8px;}
.of__row > *{flex:1; min-width:0;}
.of__group{margin-bottom:10px;}
.of__label{display:flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:var(--gray-700); margin-bottom:5px;}
.of__label svg{color:var(--gray-400);}
.of__select-wrap{position:relative;}
.of__select-wrap::after{content:''; position:absolute; right:10px; top:50%; margin-top:-2px; border-left:4px solid transparent; border-right:4px solid transparent; border-top:5px solid var(--gray-400); pointer-events:none;}
.of__select, .of__input, .of__textarea{width:100%; border:none; background:#eef1f6; border-radius:8px; font-family:inherit; font-size:12.5px; color:var(--gray-700); padding:8px 10px; outline:none; appearance:none;}
.of__select{padding-right:26px; cursor:pointer;}
.of__select:disabled{color:var(--gray-400); cursor:not-allowed; opacity:.7;}
.of__input::placeholder, .of__textarea::placeholder{color:var(--gray-400);}
.of__textarea{resize:vertical; min-height:52px;}
.of__input--num{text-align:right;}
.of__select--accent{color:var(--primary-500); font-weight:600;}
.of-toggle{display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:10px; user-select:none;}
.of-toggle__track{width:32px; height:18px; border-radius:9px; background:var(--gray-300); position:relative; transition:background .15s; flex-shrink:0;}
.of-toggle__track::after{content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:left .15s;}
.of-toggle--on .of-toggle__track{background:var(--primary);}
.of-toggle--on .of-toggle__track::after{left:16px;}
.of-toggle__label{font-size:12px; font-weight:600; color:var(--gray-700);}
.of__prod-head{display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:var(--gray-700); padding:6px 0; border-bottom:1px solid var(--gray-100);}
.of__prod-empty{text-align:center; padding:22px 0 10px; color:var(--gray-400);}
.of__prod-empty-icon{font-size:30px; margin-bottom:6px; opacity:.8;}
.of__prod-empty-text{font-size:13px; font-weight:500;}
.of__summary{border-top:1px solid var(--gray-100); margin-top:12px; padding-top:4px;}
.of__sum-row{display:flex; align-items:center; gap:8px; padding:6px 0; font-size:12.5px;}
.of__sum-label{font-weight:600; color:var(--gray-700); flex-shrink:0;}
.of__sum-value{margin-left:auto; font-weight:700; color:var(--gray-800);}
.of__sum-value--danger{color:#ef4444;}
.of-check{display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--gray-700); cursor:pointer;}
.of-check input{accent-color:var(--primary); width:14px; height:14px; cursor:pointer;}
.of__head-row{display:flex; align-items:center; justify-content:space-between;}
.of__info{font-size:12px; color:var(--gray-500); margin:2px 0 6px; line-height:1.5;}
.of__dim-grid{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
.of__unit-input{margin-left:auto; display:flex; width:110px;}
.of__unit-input input{width:100%; min-width:0; border:none; background:#eef1f6; border-radius:8px 0 0 8px; padding:7px 8px; font-family:inherit; font-size:12.5px; text-align:right; outline:none; color:var(--gray-700);}
.of__unit-input i{font-style:normal; background:#e2e8f0; border-radius:0 8px 8px 0; padding:7px 9px; font-size:12px; color:var(--gray-600); font-weight:600; white-space:nowrap;}
.of__code-input{margin-left:auto; display:flex; width:156px;}
.of__code-input input{width:100%; min-width:0; border:none; background:#eef1f6; border-radius:8px 0 0 8px; padding:7px 9px; font-family:inherit; font-size:12.5px; outline:none; color:var(--gray-700);}
.of__code-input button{background:var(--primary-500); color:#fff; border:none; border-radius:0 8px 8px 0; font-size:12px; font-weight:600; padding:0 10px; cursor:pointer; white-space:nowrap;}
.of__sum-label em{font-style:normal; font-weight:400; font-size:11px; color:var(--gray-400); margin-left:3px;}
.of__total-row{display:flex; align-items:center; justify-content:space-between; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:9px 12px; margin:8px 0; font-size:13px; font-weight:700;}
.of__total-row b{color:var(--primary-500); font-size:16px;}
.of__pay-badge{margin-left:auto; background:var(--gray-100); border:1px solid var(--gray-200); color:var(--gray-600); font-size:11.5px; font-weight:600; border-radius:14px; padding:3px 10px;}
.of__gear{color:var(--primary-500); cursor:pointer; display:flex;}
.of__return-note{display:none; background:#fff7ed; border:1px solid #fed7aa; color:#c2410c; font-size:12.5px; font-weight:700; border-radius:8px; padding:9px 12px; margin-top:10px;}
.of__return-note--show{display:block;}
.op-item{border:1px solid var(--gray-100); border-radius:10px; padding:10px; margin-top:8px;}
.op-item--gift{background:#fffbeb; border-color:#fde68a;}
.op-item__top{display:flex; align-items:center; gap:6px;}
.op-item__code{font-size:12.5px; font-weight:700; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.op-gift-tag{background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; border-radius:4px; padding:0 5px; font-size:10.5px; font-weight:700; white-space:nowrap; flex-shrink:0;}
.op-item__del{width:26px; height:26px; border:1px solid #f3c6c6; background:#fff5f5; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#dc2626; flex-shrink:0;}
.op-item__del:hover{background:#fee2e2;}
.op-item__name{font-size:12px; color:var(--gray-500); margin:2px 0 6px;}
.op-item__row{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 0; font-size:12px; color:var(--gray-600);}
.op-item__kl{font-style:normal; color:var(--gray-400);}
.op-qty{display:flex; align-items:center; height:26px; border:1px solid var(--gray-200); border-radius:6px; overflow:hidden; background:#fff;}
.op-qty button{width:24px; height:100%; border:0; background:var(--gray-50); cursor:pointer; font-size:14px; color:var(--gray-700); line-height:1;}
.op-qty button:hover{background:var(--gray-100);}
.op-qty input{width:34px; height:100%; border:0; outline:0; text-align:center; font-weight:700; font-size:12px;}
.op-item--over .op-qty{border-color:#dc2626; box-shadow:0 0 0 2px rgba(220,38,38,.12);}
.op-item--over .op-item__stock{color:#dc2626; font-weight:700;}
.op-item__sum{font-size:12.5px; color:var(--gray-800);}
.op-total{display:flex; justify-content:space-between; align-items:center; font-size:12.5px; font-weight:600; color:var(--gray-700); padding:9px 2px; border-top:1px solid var(--gray-100); margin-top:8px;}
.op-total b{font-size:13.5px;}
.of__pay-badge--orange{background:#fff7ed; border-color:#fed7aa; color:#c2410c;}
.of__pay-badge--green{background:#ecfdf3; border-color:#bbf7d0; color:#15803d;}
.of__pay-badge--red{background:#fef2f2; border-color:#fecaca; color:#b91c1c;}
.cust-card{background:#fff;}
.chat-detail__tabs-divider{width:1px; align-self:stretch; margin:8px 2px; background:var(--gray-300); flex-shrink:0;}
.chat-detail__tab--sales{color:#b45309; font-weight:600;}
.ai-fab-wrap{position:sticky; bottom:0; z-index:9; padding:10px 16px 14px; background:linear-gradient(to top, #fff 72%, rgba(255,255,255,0));}
.ai-modal-bg{position:fixed; inset:0; background:rgba(15,23,42,.45); display:none; align-items:center; justify-content:center; z-index:400;}
.ai-modal-bg.open{display:flex;}
.ai-modal{width:540px; max-width:92%; max-height:86vh; background:#fff; border-radius:14px; box-shadow:0 24px 80px rgba(0,0,0,.3); display:flex; flex-direction:column; overflow:hidden;}
.ai-modal__head{display:flex; align-items:center; gap:8px; padding:14px 18px; border-bottom:1px solid var(--gray-100); font-weight:700; font-size:14px; color:#7c3aed; background:linear-gradient(135deg,#faf5ff,#eff6ff);}
.ai-modal__close{margin-left:auto; background:none; border:none; cursor:pointer; color:var(--gray-500); width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center;}
.ai-modal__close:hover{background:rgba(124,58,237,.1);}
.ai-modal__body{padding:16px 18px; overflow-y:auto; font-size:13px; color:var(--gray-700); line-height:1.6;}
.ai-modal__foot{display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid var(--gray-100);}
.ai-loading{display:flex; align-items:center; gap:10px; color:var(--gray-500); font-size:13px; padding:14px 0;}
.ai-spinner{width:18px; height:18px; border:3px solid #e9d5ff; border-top-color:#8b5cf6; border-radius:50%; animation:aispin .8s linear infinite; flex-shrink:0;}
.ai-block{margin-bottom:12px;}
.ai-block__title{font-weight:700; font-size:12.5px; color:var(--gray-800); margin-bottom:3px;}
.ai-modal__time{font-size:11.5px; color:var(--gray-400); margin-top:6px;}
.ai-btn-note{display:inline-flex; align-items:center; gap:6px; background:linear-gradient(90deg,#8b5cf6,#6366f1); color:#fff; border:none; font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:8px; cursor:pointer;}
.ai-btn-note:disabled{opacity:.55; cursor:default;}
.ai-btn-ghost{border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); font-size:12.5px; font-weight:500; padding:8px 14px; border-radius:8px; cursor:pointer;}
.note-item{border:1px solid var(--gray-100); border-radius:10px; padding:10px; margin-bottom:8px; background:#fff;}
.note-item--ai{background:#faf5ff; border-color:#e9d5ff;}
.note-item__head{display:flex; align-items:center; gap:6px; margin-bottom:5px;}
.note-item__tag{background:#f3e8ff; color:#7c3aed; font-size:10.5px; font-weight:700; border-radius:4px; padding:1px 6px;}
.note-item__time{font-size:11px; color:var(--gray-400); margin-left:auto;}
.note-item__body{font-size:12px; color:var(--gray-700); line-height:1.55; white-space:pre-line;}
.chat-library{width:300px; border-left:1px solid var(--gray-200); background:#fff; display:flex; flex-direction:column; overflow-y:auto; flex-shrink:0;}
.chat-library[hidden]{display:none;}
.chat-library__header{display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--gray-200); position:sticky; top:0; background:#fff; z-index:5;}
.chat-library__title{font-size:14px; font-weight:700; display:flex; align-items:center; gap:7px;}
.chat-library__close{background:none; border:none; cursor:pointer; color:var(--gray-500); width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center;}
.chat-library__close:hover{background:var(--gray-100);}
.chat-main__header-btn--active{background:color-mix(in srgb, var(--primary) 12%, white); color:var(--primary);}
.chat-more-menu{position:absolute; top:calc(100% + 6px); right:0; background:#fff; border:1px solid var(--gray-200); border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.15); padding:6px; min-width:170px; z-index:150;}
.chat-more-menu[hidden]{display:none;}
.chat-more-menu__item{display:flex; align-items:center; gap:8px; width:100%; padding:8px 12px; border:none; background:none; border-radius:7px; font-size:13px; color:var(--gray-700); cursor:pointer; text-align:left;}
.chat-more-menu__item:hover{background:var(--gray-50);}
.chat-more-menu__item--danger{color:#ef4444;}
.chat-more-menu__item--danger:hover{background:#fef2f2;}
.chat-detail__customer{display:flex; align-items:center; gap:10px; padding:12px 16px; height:62px; border-bottom:1px solid var(--gray-100); background:#fff; position:sticky; top:0; z-index:11;}
.chat-detail__customer-avatar{width:38px; height:38px; border-radius:50%; background:#ec4899; color:#fff; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; flex-shrink:0;}
.chat-detail__customer-name{font-size:13.5px; font-weight:700; color:var(--gray-800); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.chat-detail__customer-meta{font-size:11.5px; color:var(--gray-500); margin-top:2px;}
.crm-stats{display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--gray-200); border:1px solid var(--gray-200); border-radius:10px; overflow:hidden; margin-bottom:12px;}
.crm-stat{background:#fff; padding:9px 12px;}
.crm-stat span{font-size:11px; color:var(--gray-500); font-weight:600; display:block;}
.crm-stat b{font-size:13.5px; color:var(--gray-800); display:block; margin-top:2px;}
.crm-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px 12px;}
.crm-field span{font-size:11px; color:var(--gray-500); font-weight:600; display:block;}
.crm-field b{font-size:12.5px; font-weight:600; color:var(--gray-800); display:block; margin-top:1px; word-break:break-word;}
.crm-field--full{grid-column:1/-1;}
.lib{padding:12px 16px;}
.lib__tabs{display:flex; gap:16px; border-bottom:1px solid var(--gray-200); margin-bottom:10px;}
.lib__tab{border:none; background:none; cursor:pointer; font-size:12.5px; font-weight:500; color:var(--gray-600); padding:8px 0; border-bottom:2px solid transparent;}
.lib__tab--active{color:var(--primary); font-weight:700; border-bottom-color:var(--primary);}
.lib__panel{display:none;}
.lib__panel--active{display:block;}
.lib__search{margin-bottom:8px;}
.lib__filters{display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;}
.lib__chip{display:inline-flex; align-items:center; gap:5px; background:var(--gray-100); border:none; border-radius:14px; padding:5px 12px; font-size:12px; color:var(--gray-700); cursor:pointer; font-weight:500;}
.lib__chip svg{color:var(--gray-500);}
.lib__date{font-size:12px; font-weight:700; color:var(--gray-800); margin:12px 0 6px;}
.lib__date:first-of-type{margin-top:4px;}
.lib__grid{display:grid; grid-template-columns:repeat(3,1fr); gap:4px;}
.lib__tile{aspect-ratio:1; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:22px; position:relative; cursor:pointer;}
.lib__tile-dur{position:absolute; right:4px; bottom:4px; background:rgba(0,0,0,.65); color:#fff; font-size:10px; border-radius:4px; padding:1px 4px; font-weight:600;}
.lib__file,.lib__link{display:flex; align-items:center; gap:9px; padding:7px 0; cursor:pointer;}
.lib__file:hover .lib__file-name,.lib__link:hover .lib__link-title{color:var(--primary);}
.lib__file-ic{width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:9.5px; font-weight:800; color:#fff; flex-shrink:0; letter-spacing:.3px;}
.lib__file-body,.lib__link-body{min-width:0; flex:1;}
.lib__file-name,.lib__link-title{font-size:12.5px; font-weight:600; color:var(--gray-800); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.lib__file-meta{font-size:11px; color:var(--gray-400); margin-top:1px;}
.lib__link-ic{width:34px; height:34px; border-radius:8px; background:var(--gray-100); display:flex; align-items:center; justify-content:center; color:var(--gray-500); flex-shrink:0;}
.lib__link-domain{font-size:11.5px; color:#2563eb; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.of__footer{position:sticky; bottom:0; background:#fff; display:flex; gap:8px; padding:12px 0 14px; margin-top:8px; border-top:1px solid var(--gray-100);}
.of__btn-reset{flex:0 0 32%; display:inline-flex; align-items:center; justify-content:center; gap:5px; border:1px solid #fecaca; background:#fff; color:#ef4444; font-size:12.5px; font-weight:600; padding:9px 10px; border-radius:8px; cursor:pointer;}
.of__btn-submit{flex:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:none; background:var(--primary); color:#fff; font-size:12.5px; font-weight:700; padding:9px 10px; border-radius:8px; cursor:pointer;}
.of__btn-submit:hover{filter:brightness(1.08);}
.pd-backdrop{position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:200; opacity:0; pointer-events:none; transition:opacity .25s;}
.pd-backdrop.open{opacity:1; pointer-events:auto;}
.pd-drawer{position:fixed; top:0; right:0; bottom:0; width:min(940px,94vw); background:#fff; z-index:201; transform:translateX(105%); transition:transform .3s ease; display:flex; flex-direction:column; box-shadow:-10px 0 34px rgba(0,0,0,.18);}
.pd-drawer.open{transform:none;}
.pd-header{display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--gray-200);}
.pd-avatar{width:44px; height:44px; border-radius:50%; background:#ec4899; color:#fff; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; flex-shrink:0;}
.pd-title{font-size:16px; font-weight:700;}
.pd-id{font-size:12px; color:var(--gray-400); margin-top:2px;}
.pd-close{margin-left:auto; background:none; border:none; cursor:pointer; color:var(--gray-500); width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;}
.pd-close:hover{background:var(--gray-100);}
.pd-body{flex:1; overflow-y:auto; padding:0 20px 24px;}
.pd-body > .pd-section:first-child{padding-top:16px;}
.pd-footer{display:flex; gap:8px; padding:12px 20px; border-top:1px solid var(--gray-200); background:#fff;}
.pd-btn{display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; padding:9px 18px; border-radius:8px; cursor:pointer; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600);}
.pd-btn--danger{border-color:#fecaca; color:#ef4444; margin-right:auto;}
.pd-btn--primary{background:var(--primary-500); border-color:var(--primary-500); color:#fff;}
.pd-section{margin-bottom:18px;}
.pd-section-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;}
.pd-section-title{font-size:11.5px; font-weight:700; color:var(--gray-500); letter-spacing:.5px;}
.pd-basic{display:grid; grid-template-columns:1fr 1fr; gap:10px 14px;}
.pd-basic .of__group{margin-bottom:0;}
.pd-basic--full{grid-column:1 / -1;}
.pd-zns-btn{display:inline-flex; align-items:center; gap:5px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-500); font-size:12px; font-weight:500; padding:6px 12px; border-radius:8px; cursor:pointer;}
.pd-tabs{display:flex; gap:2px; border-bottom:1px solid var(--gray-200); overflow-x:auto; position:sticky; top:0; background:#fff; z-index:5; margin:0 -20px; padding:0 20px;}
.pd-tab{border:none; background:none; cursor:pointer; font-size:13px; font-weight:500; color:var(--gray-500); padding:10px 13px; border-bottom:2px solid transparent; white-space:nowrap; display:inline-flex; align-items:center; gap:6px;}
.pd-tab.active{color:var(--primary-500); font-weight:700; border-bottom-color:var(--primary-500);}
.pd-tab-count{background:var(--gray-100); color:var(--gray-500); font-size:11px; font-weight:600; border-radius:9px; padding:1px 7px;}
.pd-tab.active .pd-tab-count{background:rgba(37,99,235,.1); color:var(--primary-500);}
.pd-panel{display:none; padding-top:14px;}
.pd-panel.active{display:block;}
.pd-note{border:1px solid var(--gray-200); border-radius:12px; padding:14px; margin-bottom:14px;}
.pd-note-title{display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; margin-bottom:10px;}
.pd-note select, .pd-note textarea{width:100%; border:1px solid var(--gray-200); border-radius:8px; font-family:inherit; font-size:12.5px; color:var(--gray-700); padding:8px 10px; outline:none; margin-bottom:8px; background:#fff;}
.pd-note textarea{resize:vertical;}
.pd-note-submit{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:6px; background:var(--gray-500); color:#fff; border:none; font-size:12.5px; font-weight:600; padding:9px 12px; border-radius:8px; cursor:not-allowed; opacity:.85;}
.pd-act-bar{display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;}
.pd-act-search{flex:1; min-width:200px;}
.pd-filters{display:flex; gap:6px; flex-wrap:wrap;}
.pd-filter{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; padding:5px 12px; border-radius:16px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); cursor:pointer;}
.pd-filter span{background:var(--gray-100); border-radius:8px; padding:0 6px; font-size:11px; font-weight:700;}
.pd-filter.active{background:var(--primary-500); border-color:var(--primary-500); color:#fff; font-weight:600;}
.pd-filter.active span{background:rgba(255,255,255,.25); color:#fff;}
.pd-tl{list-style:none;}
.pd-act{display:flex; gap:10px; padding:12px 0; border-bottom:1px solid var(--gray-100);}
.pd-act-avatar{width:32px; height:32px; border-radius:50%; background:#1d4ed8; color:#fff; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;}
.pd-act-body{flex:1; min-width:0;}
.pd-act-head{display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12.5px;}
.pd-act-actor{font-weight:700;}
.pd-act-verb{color:var(--gray-500);}
.pd-act-time{margin-left:auto; font-size:11.5px; color:var(--gray-400);}
.pd-act-chip{display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:2px 9px; border-radius:12px; color:#fff;}
.pd-chip-ghi-chu{background:#64748b;}
.pd-chip-don-hang{background:#2563eb;}
.pd-chip-lich-hen{background:#15803d;}
.pd-act-card{background:var(--gray-50); border:1px solid var(--gray-100); border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12.5px;}
.pd-kv{display:flex; gap:10px; padding:2px 0;}
.pd-kv span{color:var(--gray-500); min-width:80px;}
.pd-money{color:#16a34a;}
.pd-note-text{color:var(--gray-700); line-height:1.5;}
.pd-note-tag{display:inline-block; margin-top:6px; font-size:11px; font-weight:600; background:#dcfce7; color:#15803d; border-radius:10px; padding:2px 9px;}
.pd-time-pill{display:inline-flex; align-items:center; gap:4px; background:var(--primary-500); color:#fff; font-size:11.5px; font-weight:600; border-radius:12px; padding:2px 10px;}
.pd-no-act{font-size:12.5px; color:var(--gray-400); padding:14px 0;}
.pd-table-wrap{overflow-x:auto; border:1px solid var(--gray-100); border-radius:10px;}
.pd-table{width:100%; border-collapse:collapse; font-size:12.5px;}
.pd-table th{text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.3px; color:var(--gray-500); background:var(--gray-50); padding:9px 12px; border-bottom:1px solid var(--gray-200); white-space:nowrap;}
.pd-table td{padding:9px 12px; border-bottom:1px solid var(--gray-100); vertical-align:top;}
.pd-table tr:last-child td{border-bottom:none;}
.pd-td-code{font-weight:600; color:var(--gray-700); white-space:nowrap;}
.pd-td-date{white-space:nowrap; color:var(--gray-500);}
.pd-td-money{white-space:nowrap; font-weight:700;}
.pd-badge{display:inline-block; font-size:11px; font-weight:600; border-radius:10px; padding:2px 9px; white-space:nowrap;}
.pd-badge--done{background:#dcfce7; color:#15803d;}
.pd-badge--return{background:#ffedd5; color:#c2410c;}
.pd-badge--cancel{background:#fee2e2; color:#b91c1c;}
.pd-panel-note{font-size:12px; color:var(--gray-500); margin-bottom:10px;}
.pd-pt-summary{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;}
.pd-pt-sum{border:1px solid var(--gray-100); border-radius:10px; padding:12px; text-align:center;}
.pd-pt-sum span{display:block; font-size:11.5px; color:var(--gray-500); margin-bottom:4px;}
.pd-pt-sum strong{font-size:17px;}
.pd-pt-in strong{color:#16a34a;}
.pd-pt-out strong{color:#ef4444;}
.pd-pt-bal{background:var(--gray-50);}
.pd-pt-point{font-weight:700; white-space:nowrap;}
.pd-pt-point.in{color:#16a34a;}
.pd-pt-point.out{color:#ef4444;}
.pd-subtabs{display:flex; gap:6px; margin-bottom:12px;}
.pd-subtab{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; padding:5px 13px; border-radius:16px; border:1px solid var(--gray-200); background:#fff; color:var(--gray-600); cursor:pointer;}
.pd-subtab span{background:var(--gray-100); border-radius:8px; padding:0 6px; font-size:11px; font-weight:700;}
.pd-subtab.active{background:var(--primary-500); border-color:var(--primary-500); color:#fff; font-weight:600;}
.pd-subtab.active span{background:rgba(255,255,255,.25); color:#fff;}
.pd-subpanel{display:none;}
.pd-subpanel.active{display:block;}
.pd-offers{display:grid; grid-template-columns:1fr 1fr; gap:10px;}
.pd-offer{border:1px solid var(--gray-200); border-radius:10px; padding:12px;}
.pd-offer--ok{border-left:3px solid #16a34a;}
.pd-offer--soon{border-left:3px solid #f59e0b;}
.pd-offer-head{display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px;}
.pd-offer-head h4{font-size:13px; font-weight:700;}
.pd-offer-state{font-size:10.5px; font-weight:700; border-radius:10px; padding:2px 8px; white-space:nowrap;}
.pd-offer-state--ok{background:#dcfce7; color:#15803d;}
.pd-offer-state--soon{background:#fef3c7; color:#b45309;}
.pd-offer p{font-size:12px; color:var(--gray-500); display:flex; align-items:center; gap:5px; padding:2px 0;}
.pd-sched-grid{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
.pd-sched{border:1px solid var(--gray-200); border-radius:12px; padding:14px;}
.pd-sched h4{font-size:13px; font-weight:700; margin-bottom:10px;}
.pd-sched input[type="datetime-local"]{width:100%; border:1px solid var(--gray-200); border-radius:8px; font-family:inherit; font-size:12.5px; color:var(--gray-700); padding:8px 10px; outline:none; margin-bottom:8px;}
.pd-sched-btn{width:100%; display:inline-flex; align-items:center; justify-content:center; gap:6px; background:var(--gray-500); color:#fff; border:none; font-size:12.5px; font-weight:600; padding:8px 12px; border-radius:8px; cursor:not-allowed; opacity:.85; margin-bottom:10px;}
.pd-sched-current{font-size:12px; background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; border-radius:8px; padding:8px 10px; margin-bottom:8px;}
.pd-sched .pd-hint{font-size:11.5px; color:var(--gray-400);}
.pd-doc{border:1px solid var(--gray-200); border-radius:12px; padding:14px; margin-bottom:12px;}
.pd-doc h4{font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:8px;}
.pd-doc-text{font-size:12.5px; color:var(--gray-600); line-height:1.6;}`;

  // Form lên đơn và các modal cũ được dựng bằng class chatmql-* + style inline.
  // Đây là màn hình tạo đơn thật, viết lại markup là rủi ro không đáng — nên
  // chỉ ánh xạ sang ngôn ngữ thị giác của design (.of__*) bằng CSS phạm vi hẹp:
  // ô nhập nền xám phẳng, tiêu đề mục có vạch đỏ, nút chân form theo design.
  const DESIGN_MODAL_CSS = `
    #chatmql-order-modal-root .chatmql-modal-header,
    #chatmql-order-modal-root .chatmql-modal-footer{background:#fff;}
    #chatmql-order-modal-root .chatmql-form-label{display:flex; align-items:center; gap:5px;
      font-size:12px; font-weight:600; color:var(--gray-700); margin-bottom:5px;}
    #chatmql-order-modal-root input[type=text],
    #chatmql-order-modal-root input[type=tel],
    #chatmql-order-modal-root input[type=number],
    #chatmql-order-modal-root select,
    #chatmql-order-modal-root textarea{
      border:none !important; background:#eef1f6 !important; border-radius:8px !important;
      font-family:inherit; font-size:12.5px; color:var(--gray-700); padding:8px 10px; outline:none;}
    #chatmql-order-modal-root input:focus,
    #chatmql-order-modal-root select:focus,
    #chatmql-order-modal-root textarea:focus{box-shadow:0 0 0 2px rgba(13,104,56,.18);}
    #chatmql-order-modal-root textarea{resize:vertical; min-height:52px;}
    /* Tiêu đề mục — vạch đỏ bên trái đúng như .of__section-title */
    #chatmql-order-modal-root .chatmql-section-title{font-size:13px; font-weight:700;
      color:var(--gray-800); border-left:3px solid #ef4444; padding-left:8px; margin:14px 0 10px;}
    /* Dòng sản phẩm = .op-item */
    #chatmql-order-modal-root .chatmql-product-row{border:1px solid var(--gray-100);
      border-radius:10px; padding:10px; margin-top:8px;}
    #chatmql-order-modal-root #btn-cancel-order{flex:0 0 32%; display:inline-flex; align-items:center;
      justify-content:center; gap:5px; border:1px solid #fecaca !important; background:#fff !important;
      color:#ef4444 !important; font-size:12.5px !important; font-weight:600 !important;
      padding:9px 10px !important; border-radius:8px !important; cursor:pointer;}
    #chatmql-order-modal-root #btn-submit-order{flex:1; display:inline-flex; align-items:center;
      justify-content:center; gap:6px; border:none; background:var(--primary) !important;
      font-size:12.5px !important; font-weight:700 !important; padding:9px 10px !important;
      border-radius:8px !important;}
    /* Khung tin nhắn để white-space:normal nên MỌI dấu xuống dòng bị nuốt —
       thẻ đơn hàng, địa chỉ nhiều dòng, tin nhắn khách gõ nhiều đoạn đều dồn
       thành một khối chữ. pre-wrap giữ xuống dòng nhưng vẫn tự ngắt khi hết
       bề ngang, và break-word để link dài không đẩy rộng bong bóng. */
    .msg__bubble{white-space:pre-wrap; overflow-wrap:anywhere;}

    /* ── Form lên đơn nằm hẳn trong cột phải (design: .of) ────────────── */
    .chatmql-order-inline{position:static !important; inset:auto !important; background:none !important;
      display:block !important; padding:0 !important; z-index:auto !important;}
    .chatmql-order-inline .chatmql-modal{width:100% !important; max-width:none !important;
      max-height:none !important; box-shadow:none !important; border-radius:0 !important; background:transparent !important;}
    /* Tiêu đề và nút đóng thuộc về hộp thoại — trong cột đã có tab rồi, bỏ đi. */
    .chatmql-order-inline .chatmql-modal-header{display:none !important;}
    .chatmql-order-inline #btn-cancel-order{display:none !important;}
    .chatmql-order-inline .chatmql-modal-body{padding:10px 14px !important; overflow:visible !important;}
    /* Chân form dính đáy cột */
    .chatmql-order-inline .chatmql-modal-footer{position:sticky; bottom:0; background:#fff; z-index:20;
      border-top:1px solid var(--gray-200); padding:10px 14px !important; margin-top:8px;}
    .chatmql-order-inline input:not([type=checkbox]):not([type=radio]):not(.item-qty):not(#order-discount-pct):not(#order-points):not(#order-deposit):not(#order-pkg-weight):not(#order-pkg-length):not(#order-pkg-width):not(#order-pkg-height),
    .chatmql-order-inline select, .chatmql-order-inline textarea{
      width:100% !important; box-sizing:border-box;}
    .chatmql-order-inline input[type=checkbox],
    .chatmql-order-inline input[type=radio]{
      width:15px !important; height:15px; flex-shrink:0; margin:0;}
    /* Mỗi lựa chọn chiếm nửa hàng cho thẳng cột, chữ không bị ngắt giữa chừng. */
    .chatmql-order-inline label:has(> input[type=checkbox]){
      flex:0 0 calc(50% - 8px); min-width:0;}
    /* Dòng sản phẩm: tên chiếm trọn một hàng, hàng dưới là số lượng · quà · giá.
       Phải dùng !important vì các phần tử này mang style inline (flex:1; min-width:0)
       — style inline luôn thắng rule thường, không có !important thì ô chọn sản phẩm
       bị bóp còn 20px. */
    .chatmql-order-inline .op-item{flex-wrap:wrap !important; gap:6px !important;}
    .chatmql-order-inline .op-item > div:first-child{flex:1 0 100% !important;}
    .chatmql-order-inline .op-item > div:nth-child(2){flex:0 0 auto !important;}
    .chatmql-order-inline .op-item > div:nth-child(2) input{width:44px !important;}
    .chatmql-order-inline .op-item > div:last-child{margin-left:auto; min-width:0 !important;}

    /* Khung thư viện / ưu đãi / xem thay quyền dùng chung khung modal — bo tròn
       và bỏ nền xám cho đồng bộ với design. */
    .chatmql-modal{border-radius:14px;}
    #chatmql-library .chatmql-modal-header, #chatmql-promo-admin .chatmql-modal-header,
    #chatmql-imp-picker .chatmql-modal-header, #chatmql-profile-drawer .chatmql-modal-header{background:#fff;}
  `;

  function applyDesignSkin(on = true) {
    const existing = document.getElementById(DESIGN_STYLE_ID);
    if (!on) { existing?.remove(); return false; }
    if (existing) return true;
    const st = document.createElement('style');
    st.id = DESIGN_STYLE_ID;
    st.textContent = DESIGN_CSS + '\n' + DESIGN_COMPONENT_CSS + '\n' + DESIGN_MODAL_CSS;
    // Cuối <head> để thắng CSS của app theo thứ tự nguồn, không cần !important.
    document.head.appendChild(st);
    return true;
  }
  window.chatmqlDesign = applyDesignSkin;
  applyDesignSkin(true);

  // ══════════════════════════════════════════════════════════════════
  // THẺ KHÁCH HÀNG + THÔNG TIN TỪ CRM (design: .cust-card, .crm-stats, .crm-grid)
  //
  // Design đặt khối này trên cùng cột phải, phía trên thanh tab. App thật dựng
  // thanh tab bằng React nên không giành quyền kiểm soát; ở đây chèn khối vào
  // ĐẦU cột, giữ nguyên tab của app phía dưới.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // THANH KÉO GIÃN PANEL PHẢI (design: .chat-resizer)
  // Kéo để đổi độ rộng cột thông tin, nhấp đúp về mặc định. Ghi nhớ trong
  // localStorage để lần sau mở vẫn giữ độ rộng nhân viên đã chọn.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // CỘT THƯ VIỆN HỘI THOẠI (design: .chat-library, .lib)
  //
  // Đây là những gì ĐÃ trao đổi trong hội thoại (ảnh/video, file, link), khác
  // hẳn tab "Tài liệu bán hàng" là kho đã duyệt để GỬI ra. Design vẽ nó thành
  // cột thứ 4 mở từ icon trên header chat — dựng đúng như vậy.
  // ══════════════════════════════════════════════════════════════════
  const LIB_TABS = [
    { id: 'media', label: 'Ảnh/Video' },
    { id: 'file',  label: 'Files' },
    { id: 'link',  label: 'Links' },
  ];
  const LIB_TILE_BG = [
    'linear-gradient(135deg,#fef3c7,#fde68a)', 'linear-gradient(135deg,#dcfce7,#bbf7d0)',
    'linear-gradient(135deg,#e0f2fe,#bae6fd)', 'linear-gradient(135deg,#fce7f3,#fbcfe8)',
    'linear-gradient(135deg,#f3e8ff,#e9d5ff)',
  ];
  const libState = { tab: 'media', convId: null, cache: {} };

  function libFmtDay(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return 'Không rõ ngày';
    return `Ngày ${d.getDate()} Tháng ${d.getMonth() + 1}`;
  }

  function libRenderBody(col) {
    const body = col.querySelector('#chatmql-lib-body');
    const groups = libState.cache[libState.tab];
    if (!groups) { body.innerHTML = '<div class="chat-detail__empty">Đang tải…</div>'; return; }
    if (!groups.length) { body.innerHTML = '<div class="chat-detail__empty">Chưa có gì trong mục này.</div>'; return; }

    let bg = 0, html = '';
    groups.forEach(g => {
      html += `<div class="lib__date">${sdEsc(libFmtDay(g.date))}</div>`;
      if (libState.tab === 'link') {
        html += g.items.map(it => `
          <a class="lib__link" href="${sdEsc(it.url)}" target="_blank" rel="noreferrer noopener">
            <div class="lib__file-name">${sdEsc(it.title || it.url)}</div>
            <div class="lib__file-meta">${sdEsc(it.sender || '')}</div>
          </a>`).join('');
      } else if (libState.tab === 'file') {
        html += g.items.map(it => `
          <a class="lib__file" href="${sdEsc(it.url)}" target="_blank" rel="noreferrer noopener">
            <span class="lib__file-ic">📄</span>
            <span class="lib__file-body">
              <span class="lib__file-name">${sdEsc(it.title || 'Tệp')}</span>
              <span class="lib__file-meta">${sdEsc(it.sender || '')}</span>
            </span>
          </a>`).join('');
      } else {
        html += '<div class="lib__grid">' + g.items.map(it => `
          <a class="lib__tile" href="${sdEsc(it.url)}" target="_blank" rel="noreferrer noopener"
             title="${sdEsc(it.sender || '')}" style="background:${LIB_TILE_BG[bg++ % LIB_TILE_BG.length]};">
            <img src="${sdEsc(it.url)}" alt="" referrerpolicy="no-referrer"
                 style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                 onerror="this.remove();">
            <span style="position:relative;">🖼️</span>
          </a>`).join('') + '</div>';
      }
    });
    body.innerHTML = html;
  }

  async function libLoad(col) {
    const kind = libState.tab;
    if (libState.cache[kind]) { libRenderBody(col); return; }
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/orders/conversation-library?conversationId=${encodeURIComponent(libState.convId)}&kind=${kind}`,
        { headers: authHeaders() });
      if (!res.ok) throw new Error('Lỗi ' + res.status);
      const d = await res.json();
      libState.cache[kind] = d.groups || [];
      libRenderBody(col);
    } catch (e) {
      col.querySelector('#chatmql-lib-body').innerHTML =
        `<div class="chat-detail__empty">Không tải được: ${sdEsc(e.message)}</div>`;
    }
  }

  window.toggleChatLibrary = function () {
    const convId = getCurrentConversationId();
    if (!convId) { alert('Mở một cuộc trò chuyện rồi thử lại.'); return; }

    const detail = document.querySelector('.chat-detail');
    if (!detail) return;

    let col = document.getElementById('chatmql-lib-col');
    if (col) {
      col.remove();
      if (detail.dataset.chatmqlHidden) { delete detail.dataset.chatmqlHidden; detail.style.display = ''; }
      return;
    }

    // Đổi hội thoại thì bỏ cache cũ, tránh hiện ảnh của khách trước.
    if (libState.convId !== convId) { libState.convId = convId; libState.cache = {}; }

    // Design vẽ thư viện thành cột thứ 4 (308 + 365 + 300 = 973px chỉ riêng hai
    // cột biên). Màn hẹp mà mở thêm cột nữa thì cột chat bị bóp còn vài chục
    // pixel, chữ xuống dòng từng từ. Dưới 1280px thì tạm ẩn cột thông tin,
    // trả lại khi đóng thư viện — vẫn đủ 3 cột, không vỡ bố cục.
    const narrow = window.innerWidth < 1280;
    if (narrow) detail.dataset.chatmqlHidden = '1', detail.style.display = 'none';

    col = document.createElement('div');
    col.id = 'chatmql-lib-col';
    col.className = 'chat-library';
    col.innerHTML = `
      <div class="chat-library__header">
        <span class="chat-library__title">🖼️ Thư viện</span>
        <button class="chat-library__close" id="chatmql-lib-close" title="Đóng thư viện">×</button>
      </div>
      <div class="lib">
        <div class="lib__tabs">
          ${LIB_TABS.map(t => `<button type="button" class="lib__tab${t.id === libState.tab ? ' lib__tab--active' : ''}" data-lib="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="lib__panel lib__panel--active" id="chatmql-lib-body">
          <div class="chat-detail__empty">Đang tải…</div>
        </div>
      </div>`;
    detail.parentNode.insertBefore(col, detail.nextSibling);

    const closeLib = () => {
      col.remove();
      if (detail.dataset.chatmqlHidden) { delete detail.dataset.chatmqlHidden; detail.style.display = ''; }
    };
    col.querySelector('#chatmql-lib-close').onclick = closeLib;
    col.querySelectorAll('.lib__tab').forEach(b => {
      b.onclick = () => {
        col.querySelectorAll('.lib__tab').forEach(x => x.classList.toggle('lib__tab--active', x === b));
        libState.tab = b.dataset.lib;
        col.querySelector('#chatmql-lib-body').innerHTML = '<div class="chat-detail__empty">Đang tải…</div>';
        libLoad(col);
      };
    });
    libLoad(col);
  };

  // Nút mở thư viện trên header chat.
  function renderLibraryButton() {
    const actions = document.querySelector('.chat-main__header-actions');
    if (!actions || document.getElementById('chatmql-lib-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'chatmql-lib-btn';
    btn.className = 'chat-main__header-btn';
    btn.type = 'button';
    btn.title = 'Thư viện hội thoại (ảnh, file, link đã trao đổi)';
    btn.textContent = '🖼️';
    btn.onclick = () => window.toggleChatLibrary();
    actions.insertBefore(btn, actions.firstChild);
  }

  const CD_WIDTH_KEY = 'chatmql:detailWidth';
  const CD_DEFAULT = 365, CD_MIN = 300, CD_MAX = 620;

  function applyDetailWidth(px) {
    const detail = document.querySelector('.chat-detail');
    if (detail) detail.style.width = px + 'px';
  }

  function renderResizer(sidebar) {
    if (document.getElementById('chatmql-resizer')) return;
    const bar = document.createElement('div');
    bar.id = 'chatmql-resizer';
    bar.className = 'chat-resizer';
    bar.title = 'Kéo để giãn/thu panel (nhấp đúp để về mặc định)';
    bar.innerHTML = '<span class="chat-resizer__grip">⋮</span>';
    sidebar.parentNode.insertBefore(bar, sidebar);

    const saved = parseInt(localStorage.getItem(CD_WIDTH_KEY) || '', 10);
    if (saved >= CD_MIN && saved <= CD_MAX) applyDetailWidth(saved);

    let dragging = false;
    bar.addEventListener('mousedown', e => {
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      // Cột nằm bên phải màn hình nên độ rộng = khoảng cách từ chuột tới mép phải.
      const w = Math.min(CD_MAX, Math.max(CD_MIN, window.innerWidth - e.clientX));
      applyDetailWidth(w);
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const detail = document.querySelector('.chat-detail');
      if (detail) localStorage.setItem(CD_WIDTH_KEY, parseInt(detail.style.width, 10) || CD_DEFAULT);
    });
    bar.addEventListener('dblclick', () => {
      applyDetailWidth(CD_DEFAULT);
      localStorage.setItem(CD_WIDTH_KEY, CD_DEFAULT);
    });
  }

  const ccState = { phone: null, loading: false };

  function ccFmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function ccFmtMoney(v) {
    if (v == null) return '—';
    return formatDot(v) + 'đ';
  }
  function ccInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Thanh tab của design: Thông tin · Ghi chú nhanh · Tạo đơn ‖ Tài liệu bán hàng.
  // Vạch ngăn trước tab cuối vì đó là kho nội dung gửi ra ngoài, khác ba tab kia.
  const CC_TABS = [
    { id: 'info',  label: 'Thông tin' },
    { id: 'notes', label: 'Ghi chú nhanh' },
    { id: 'order', label: 'Tạo đơn' },
    { id: 'sales', label: 'Tài liệu bán hàng', sales: true },
  ];
  let ccActiveTab = 'info';

  /**
   * Ẩn phần cột phải do React dựng (THÔNG TIN, THÔNG TIN TÙY CHỈNH, TRÀ INFO,
   * ZALO, và thanh tab Thông tin/Ghi chú/File của app).
   *
   * Toàn bộ nội dung đó đã có chỗ trong bốn tab mới: thông tin khách lấy thẳng
   * từ CRM ở tab Thông tin, ghi chú ở tab Ghi chú nhanh, file và ảnh ở cột Thư
   * viện. Để cả hai cùng hiện là bắt nhân viên đọc hai bản cùng một dữ liệu.
   *
   * Chỉ ẩn bằng CSS, không gỡ node — React vẫn tự vẽ lại bình thường.
   * Muốn xem lại giao diện cũ: window.chatmqlLegacyPanel(true)
   */
  let ccShowLegacy = false;
  function ccSyncAppSections(sidebar) {
    Array.from(sidebar.children).forEach(el => {
      if (el.id === 'chatmql-cust-card') return;
      el.style.display = ccShowLegacy ? '' : 'none';
    });
  }
  window.chatmqlLegacyPanel = function (on) {
    ccShowLegacy = !!on;
    const sidebar = document.querySelector('.chat-detail');
    if (sidebar) ccSyncAppSections(sidebar);
    return ccShowLegacy;
  };

  function ccSelectTab(card, sidebar, id) {
    ccActiveTab = id;
    card.querySelectorAll('.chat-detail__tab').forEach(b =>
      b.classList.toggle('chat-detail__tab--active', b.dataset.tab === id));
    card.querySelectorAll('.chat-detail__panel').forEach(pn =>
      pn.classList.toggle('chat-detail__panel--active', pn.dataset.panel === id));
    ccSyncAppSections(sidebar);
    if (id === 'notes') renderNotesPanel(card);
    if (id === 'order') renderOrderPanel(card);
  }

  function renderCustomerCard(sidebar) {
    const convId = getCurrentConversationId();
    if (!convId) return;

    let card = document.getElementById('chatmql-cust-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'chatmql-cust-card';
      card.className = 'cust-card';
      card.innerHTML = `
        <div class="chat-detail__sticky-header" style="position:sticky; top:0; background:#fff; z-index:25; border-bottom:1px solid var(--gray-200); box-shadow:0 1px 4px rgba(0,0,0,0.03);">
          <div id="cc-head"></div>
          <div class="chat-detail__tabs" style="border-bottom:none; position:static;">
            ${CC_TABS.map(t => (t.sales ? '<span class="chat-detail__tabs-divider"></span>' : '') +
              `<button type="button" class="chat-detail__tab${t.sales ? ' chat-detail__tab--sales' : ''}${t.id === 'info' ? ' chat-detail__tab--active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
          </div>
        </div>
        ${CC_TABS.map(t => `<div class="chat-detail__panel${t.id === 'info' ? ' chat-detail__panel--active' : ''}" data-panel="${t.id}" id="cc-panel-${t.id}"></div>`).join('')}`;
      sidebar.insertBefore(card, sidebar.firstChild);
      card.querySelectorAll('.chat-detail__tab').forEach(b => {
        b.onclick = () => ccSelectTab(card, sidebar, b.dataset.tab);
      });
    }
    ccSyncAppSections(sidebar);

    if (ccState.convId === convId || ccState.loading) return;
    ccState.convId = convId;
    ccState.loading = true;
    ccState.notesLoaded = false;
    ccState.crmData = null;
    ccState.name = '';
    ccState.phone = '';
    ccState.staff = '';
    convContextCache = { id: null, data: null, promise: null };
    currentCrmCustomer = null;
    lastFetchedPhone = '';
    const orderPanel = card.querySelector('#cc-panel-order');
    if (orderPanel) orderPanel.innerHTML = '';

    card.querySelector('#cc-panel-info').innerHTML =
      '<div class="chat-detail__empty" style="padding:14px;">Đang tải thông tin khách…</div>';

    fetch(`${API_BASE}/api/v1/orders/customer-profile?conversationId=${encodeURIComponent(convId)}`, { headers: authHeaders() })
      .then(async r => {
        const body = await r.json().catch(() => null);
        if (r.ok) return body;
        // 400 = khách chưa có số điện thoại nên chưa tra được hồ sơ CRM. Đây là
        // tình trạng bình thường với hơn 8.000 contact đến từ Zalo, không phải
        // sự cố hệ thống — hiện "Lỗi 400" trần trụi làm nhân viên tưởng hỏng.
        const err = new Error(body?.error || `Lỗi ${r.status}`);
        err.status = r.status;
        err.contact = body?.contact || null;
        throw err;
      })
      .then(async d => {
        const crm = d.crm || {};
        const chat = d.chatmql || {};
        const name = crm.full_name || chat.name || d.name || 'Khách chưa định danh';
        const phone = d.phone || crm.phone || chat.phone || '';
        ccState.name = name;
        ccState.phone = phone;
        ccState.crmData = crm;
        ccState.staff = crm.staff_in_charge || '';
        currentCrmCustomer = crm;

        let points = '—';
        if (phone) {
          try {
            const pr = await fetch(`${API_BASE}/api/v1/orders/customer-points?phone=${encodeURIComponent(phone)}`, { headers: authHeaders() });
            if (pr.ok) { const pd = await pr.json(); points = pd.balance ?? 0; }
          } catch { /* để trống */ }
        }

        const notesCount = (crm.profile_note || '').split('\n').filter(l => /ngày \d/.test(l)).length;
        const row = (label, value, style) =>
          `<div class="crm-field"><span>${sdEsc(label)}</span><b${style ? ` style="${style}"` : ''}>${sdEsc(value ?? '—') || '—'}</b></div>`;
        const rowFull = (label, value) =>
          `<div class="crm-field crm-field--full"><span>${sdEsc(label)}</span><b>${sdEsc(value ?? '—') || '—'}</b></div>`;

        card.querySelector('#cc-head').innerHTML = `
          <div class="chat-detail__customer">
            <div class="chat-detail__customer-avatar">${sdEsc(ccInitials(name))}</div>
            <div style="min-width:0;">
              <div class="chat-detail__customer-name">${sdEsc(name)}</div>
              <div class="chat-detail__customer-meta">${crm.customer_code ? sdEsc(crm.customer_code) + ' · ' : ''}SĐT: ${sdEsc(phone || '—')}</div>
            </div>
          </div>`;

        card.querySelector('#cc-panel-info').innerHTML = `
          <div class="chat-detail__section" style="padding-bottom:16px;">
            <div class="chat-detail__section-header">
              <span class="chat-detail__section-title">THÔNG TIN TỪ CRM</span>
              <button class="chat-list__action-btn" id="cc-refresh" title="Đồng bộ lại từ CRM">⟳</button>
            </div>
            <div class="crm-stats">
              <div class="crm-stat"><span>Lịch bán hàng</span><b>${ccFmtDate(crm.next_sales_at)}</b></div>
              <div class="crm-stat"><span>Lịch chăm sóc</span><b>${ccFmtDate(crm.next_care_at)}</b></div>
              <div class="crm-stat"><span>Số đơn</span><b>${crm.order_count ?? 0}</b></div>
              <div class="crm-stat"><span>Ghi chú</span><b>${notesCount}</b></div>
            </div>
            <div class="crm-grid">
              ${row('Mã khách hàng', crm.customer_code)}
              ${row('Số điện thoại', phone)}
              ${row('SĐT liên hệ khác', crm.phone2)}
              ${row('Người phụ trách', crm.staff_in_charge, 'color:#2563eb;')}
              ${row('Điểm', points, 'color:#16a34a;')}
              ${row('Tổng chi tiêu', ccFmtMoney(crm.gmv_total))}
              ${row('Nghề nghiệp', crm.occupation)}
              ${row('Cấp Vip', crm.cap_vip || crm.priority_level || crm.nhom_kh)}
              ${row('Giới tính', crm.gender)}
              ${row('Ngày sinh', crm.birthday ? ccFmtDate(crm.birthday) : null)}
              ${row('Email', chat.email)}
              ${row('Lead score', chat.leadScore != null ? `${chat.leadScore}/100` : null)}
              ${rowFull('Nguồn khách hàng', crm.referral_source || chat.source)}
              ${rowFull('Gu trà / thích dùng hàng', crm.thich_dung_hang)}
              ${rowFull('Nhu cầu sử dụng', crm.nhu_cau_sd)}
              ${rowFull('Tần suất mua', crm.purchase_frequency)}
              ${rowFull('Địa chỉ', crm.address)}
              ${rowFull('Địa chỉ 2', crm.address2)}
            </div>
          </div>
          <!-- Sticky Bottom Actions -->
          <div class="chat-detail__sticky-actions" style="position:sticky; bottom:0; z-index:20; background:#fff; padding:10px 14px; border-top:1px solid var(--gray-200); box-shadow:0 -4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; gap:8px;">
            <button class="chat-detail__profile-btn" id="cc-profile" style="margin:0; height:38px; border:1px solid #e2e8f0; border-radius:8px; font-weight:600; font-size:13px; color:#1e293b; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">🕘 Xem hồ sơ lịch sử mua hàng</button>
            <button class="chat-detail__order-btn" id="cc-c360" style="margin:0; height:40px; border:none; border-radius:8px; font-weight:700; font-size:13px; color:#fff; background:#15803d; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 8px rgba(21,128,61,0.25);">✨ Phân tích khách hàng (AI)</button>
          </div>`;

        card.querySelector('#cc-profile').onclick = () => window.openCustomerProfileDrawer?.();
        card.querySelector('#cc-c360').onclick = () => window.openCustomer360?.();
        card.querySelector('#cc-refresh').onclick = () => { ccState.convId = null; renderCustomerCard(sidebar); };
        renderBirthdayCard(card.querySelector('#cc-panel-info'), crm, name);
        renderOrderPanel(card);
      })
      .catch(e => {
        const name = e.contact?.name || 'Khách chưa định danh';
        card.querySelector('#cc-head').innerHTML = `
          <div class="chat-detail__customer">
            <div class="chat-detail__customer-avatar">${sdEsc(ccInitials(name))}</div>
            <div style="min-width:0;">
              <div class="chat-detail__customer-name">${sdEsc(name)}</div>
              <div class="chat-detail__customer-meta">Chưa liên kết hồ sơ CRM</div>
            </div>
          </div>`;

        if (e.status === 400) {
          ccState.name = name;
          ccState.phone = '';
          card.querySelector('#cc-panel-info').innerHTML = `
            <div style="padding:16px;">
              <div class="sd__note" style="margin-bottom:12px;">
                ☎️ <b>Khách này chưa có số điện thoại.</b><br>
                Hồ sơ CRM tra theo số điện thoại, nên chưa có số thì chưa hiện được
                lịch sử mua hàng, điểm tích luỹ và ưu đãi.
              </div>
              <div style="font-size:12px; color:#64748b; line-height:1.6; margin-bottom:12px;">
                Nhập số ở tab <b>Tạo đơn</b> rồi lên đơn — hệ thống sẽ tự lưu số vào
                hồ sơ khách, lần sau mở lại là có đủ thông tin.
              </div>
              <button class="chat-detail__order-btn" id="cc-goto-order">🛒 Sang tab Tạo đơn</button>
            </div>`;
          const goto = card.querySelector('#cc-goto-order');
          if (goto) goto.onclick = () => ccSelectTab(card, sidebar, 'order');
          renderOrderPanel(card);
          return;
        }

        card.querySelector('#cc-panel-info').innerHTML =
          `<div class="chat-detail__empty" style="padding:14px;">Không tải được thông tin khách: ${sdEsc(e.message)}</div>`;
      })
      .finally(() => { ccState.loading = false; });
  }

  // ── Tab "Tạo đơn" ─────────────────────────────────────────────────
  // Form lên đơn đầy đủ vẫn là hộp thoại riêng — nó dài và có nhiều bước, nhét
  // vào cột rộng 365px sẽ khó thao tác hơn chứ không dễ hơn. Tab này là chỗ mở
  // form và xem nhanh lịch sử đơn của đúng khách đang chat.
  function renderOrderPanel(card) {
    const panel = card.querySelector('#cc-panel-order');
    if (!panel) return;
    const currentConv = getCurrentConversationId();
    if (ccState.orderFormConvId === currentConv && panel.querySelector('#cc-order-form')?.children.length > 0) {
      return;
    }
    ccState.orderFormConvId = currentConv;
    panel.innerHTML = `
      <div id="cc-order-form">
        <div style="padding:16px; text-align:center; font-size:12.5px; color:#64748b;">Đang tải form tạo đơn hàng...</div>
      </div>
      <div style="padding:14px 16px 16px; border-top:1px solid var(--gray-200); margin-top:14px;">
        <div class="chat-detail__section-header" style="padding:0; margin-bottom:10px;">
          <span class="chat-detail__section-title">ĐƠN GẦN ĐÂY</span>
        </div>
        <div id="cc-order-history"></div>
      </div>`;
    const hist = document.getElementById('chatmql-order-history-container');
    if (hist) panel.querySelector('#cc-order-history').appendChild(hist);
    const formWrap = panel.querySelector('#cc-order-form');
    window.openChatMqlOrderModal?.(formWrap);
  }

  // ── Tab "Ghi chú nhanh" ───────────────────────────────────────────
  async function renderNotesPanel(card) {
    const panel = card.querySelector('#cc-panel-notes');
    if (!panel || ccState.notesLoaded) return;
    ccState.notesLoaded = true;
    const convId = ccState.convId;
    panel.innerHTML = '<div class="chat-detail__empty" style="padding:20px 0;">Đang tải ghi chú…</div>';

    let notes = [], statuses = [];
    try {
      const [nRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/notes?conversationId=${encodeURIComponent(convId)}`, { headers: authHeaders() }),
        fetch(`${API_BASE}/api/v1/notes/statuses`, { headers: authHeaders() }),
      ]);
      if (nRes.ok) notes = (await nRes.json()).notes || [];
      if (sRes.ok) statuses = (await sRes.json()).statuses || [];
    } catch (e) {
      panel.innerHTML = `<div class="chat-detail__empty" style="padding:20px 0;">Không tải được ghi chú: ${sdEsc(e.message)}</div>`;
      return;
    }

    const list = notes.length
      ? notes.map(n => `
          <div class="note-item">
            <div class="note-item__head">
              <span class="note-item__tag">${sdEsc(n.status || 'Ghi chú')}</span>
              <span class="note-item__time">${sdEsc(ccFmtDate(n.createdAt))}${n.authorName ? ' · ' + sdEsc(n.authorName) : ''}</span>
            </div>
            <div class="note-item__body">${sdEsc(n.content || '')}</div>
          </div>`).join('')
      : '<div class="chat-detail__empty" style="padding:16px 0;">Chưa có ghi chú nào cho khách này.</div>';

    panel.innerHTML = `
      <div style="padding:14px 16px;">
        <div class="of__group">
          <label class="of__label">Nội dung ghi chú</label>
          <textarea class="of__textarea" id="cc-note-content" placeholder="Khách quan tâm gì, hẹn gọi lại lúc nào…"></textarea>
        </div>
        <div class="of__group" style="margin-top:8px;">
          <label class="of__label">Trạng thái tương tác</label>
          <select class="of__textarea of__select" id="cc-note-status">
            ${statuses.map(st => `<option value="${sdEsc(st.value ?? st)}">${sdEsc(st.label ?? st)}</option>`).join('')}
          </select>
        </div>
        <button class="chat-detail__order-btn" id="cc-note-add" style="margin-top:10px;">💾 Lưu ghi chú</button>
        <div id="cc-note-msg" style="font-size:11.5px; margin-top:6px; min-height:14px;"></div>
        <div style="margin-top:12px;">${list}</div>
      </div>`;

    panel.querySelector('#cc-note-add').onclick = async () => {
      const btn = panel.querySelector('#cc-note-add');
      const msg = panel.querySelector('#cc-note-msg');
      const content = panel.querySelector('#cc-note-content').value.trim();
      if (!content) { msg.textContent = 'Chưa nhập nội dung ghi chú.'; msg.style.color = '#b45309'; return; }
      btn.disabled = true;
      msg.textContent = 'Đang lưu…'; msg.style.color = '#64748b';
      try {
        const res = await fetch(`${API_BASE}/api/v1/notes`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ conversationId: convId, content, status: panel.querySelector('#cc-note-status').value }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
        msg.textContent = '✓ Đã lưu'; msg.style.color = '#15803d';
        ccState.notesLoaded = false;
        renderNotesPanel(card);
      } catch (e) {
        msg.textContent = 'Không lưu được: ' + e.message; msg.style.color = '#b91c1c';
      } finally { btn.disabled = false; }
    };
  }

  // ── Thẻ sinh nhật (design: .bday-card) ────────────────────────────
  // Chỉ hiện khi sinh nhật rơi vào 30 ngày tới. Ngày 01/01 bị bỏ qua vì đó là
  // giá trị mặc định CRM điền khi không biết sinh nhật thật — hiện lên sẽ báo
  // nhầm hàng loạt vào đầu năm.
  function renderBirthdayCard(card, crm, name) {
    if (!crm.birthday) return;
    const b = new Date(crm.birthday);
    if (isNaN(b)) return;
    const mm = b.getMonth(), dd = b.getDate();
    if (mm === 0 && dd === 1) return;

    const now = new Date();
    let next = new Date(now.getFullYear(), mm, dd);
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
    const days = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    if (days > 30) return;

    const el = document.createElement('div');
    el.className = 'bday-card';
    el.innerHTML = `
      <div class="bday-card__head">
        <div class="bday-card__avatar">🎂</div>
        <div class="bday-card__body">
          <div class="bday-card__name">${sdEsc(name)}</div>
          <div class="bday-card__date">${String(dd).padStart(2, '0')}/${String(mm + 1).padStart(2, '0')} · ${days === 0 ? 'hôm nay' : 'còn ' + days + ' ngày'}</div>
        </div>
      </div>
      <div class="bday-card__hint">Gợi ý: gửi lời chúc kèm ưu đãi sinh nhật cho khách.</div>`;
    const actions = card.querySelector('.chat-detail__sticky-actions');
    if (actions) card.insertBefore(el, actions);
    else card.appendChild(el);
  }

  // ══════════════════════════════════════════════════════════════════
  // ĐỔI NHÃN MENU "Báo giá" -> "Ưu đãi & Khuyến mại"
  //
  // ChatMQL chỉ còn bản build, không có mã nguồn React nên không sửa được ở
  // gốc — đổi chữ ngay trên DOM. React vẽ lại menu thì lượt inject kế tiếp
  // (1,2 giây) đổi lại, nên nhãn không nhấp nháy về tên cũ.
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // CỘT LỌC BÊN TRÁI (design: .chat-icon-bar)
  //
  // Sáu nút này trước đây chỉ đổi màu, danh sách hội thoại không hề thay đổi.
  //
  // Hai nút đầu dùng lại chính bộ lọc của app (đã chạy đúng và bám theo tài
  // khoản Zalo đang chọn). Bốn nút còn lại app không có sẵn nên gọi API rồi ẩn
  // những dòng không khớp — trường aiMode/assignedUserId/tab đã có trong bảng,
  // chỉ thiếu tham số lọc, tôi đã bổ sung ở backend.
  // ══════════════════════════════════════════════════════════════════
  const ICON_FILTERS = {
    'Chat':             { kind: 'app', btn: 'Tất cả' },
    'Chưa đọc':         { kind: 'app', btn: 'Chưa đọc' },
    'Của tôi':          { kind: 'app', btn: 'Của tôi' },
    'Cá nhân':          { kind: 'app', btn: 'Cá nhân' },
    'Zalo OA':          { kind: 'app', btn: 'Zalo OA' },
    'Được gán cho tôi': { kind: 'api', param: 'assignedTo=me',  label: 'được gán cho tôi' },
    'Auto':             { kind: 'api', param: 'aiMode=auto',    label: 'AI đang tự trả lời' },
    'Chờ':              { kind: 'api', param: 'unreplied=true', label: 'chờ nhân viên trả lời' },
    'Khác':             { kind: 'api', param: 'tab=other',      label: 'hộp thư Khác' },
  };
  let iconFilter = null;        // { title, ids:Set, label, total }

  /** ID hội thoại nằm ở key của React fiber — app không gắn id vào DOM. */
  function convIdOf(el) {
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber$'));
    return k ? el[k]?.key || null : null;
  }

  // App có hai chế độ xem: danh sách (.conv-item) và lưới (.conv-grid__card).
  // Nút "Chờ" của app chuyển sang lưới, nên bộ lọc phải chạy cho cả hai.
  const CONV_ROW_SEL = '.conv-item, .conv-grid__card';

  function clearIconFilter() {
    iconFilter = null;
    document.getElementById('chatmql-filter-banner')?.remove();
    document.querySelectorAll(CONV_ROW_SEL).forEach(el => { el.style.display = ''; });
  }

  /** Ẩn dòng không khớp. Chạy lại sau mỗi lần app vẽ lại danh sách. */
  function applyIconFilter() {
    if (!iconFilter) return;
    const rows = [...document.querySelectorAll(CONV_ROW_SEL)];
    let hien = 0;
    rows.forEach(el => {
      const id = convIdOf(el);
      const ok = id && iconFilter.ids.has(id);
      el.style.display = ok ? '' : 'none';
      if (ok) hien++;
    });

    const list = document.querySelector('.chat-list__items') ||
                 document.querySelector('.conv-grid__cards');
    if (!list) return;
    let banner = document.getElementById('chatmql-filter-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'chatmql-filter-banner';
      banner.style.cssText =
        'padding:8px 12px; margin:6px 10px; background:#f0fdf4; border:1px solid #bbf7d0;' +
        'border-radius:8px; font-size:11.5px; color:#15803d; line-height:1.5;';
      list.parentNode.insertBefore(banner, list);
    }
    // Nói rõ đang lọc trên phần ĐÃ TẢI, không phải toàn bộ — nếu không nhân
    // viên sẽ tưởng công ty chỉ có ngần ấy hội thoại thuộc nhóm này.
    banner.innerHTML =
      `<b>Đang lọc: ${sdEsc(iconFilter.label)}</b> — ${hien}/${rows.length} hội thoại đã tải khớp` +
      (iconFilter.total > rows.length
        ? `<br>Toàn hệ thống có ${iconFilter.total}. Cuộn xuống để tải thêm.`
        : '') +
      ` <button type="button" id="chatmql-filter-clear" style="margin-left:4px; border:none; background:none;
         color:#15803d; font-weight:700; cursor:pointer; text-decoration:underline;">Bỏ lọc</button>`;
    banner.querySelector('#chatmql-filter-clear').onclick = () => {
      clearIconFilter();
      document.querySelectorAll('.chat-icon-bar__item').forEach(i =>
        i.classList.toggle('chat-icon-bar__item--active', i.getAttribute('title') === 'Chat'));
    };
  }

  async function runIconFilter(title) {
    const cfg = ICON_FILTERS[title];
    if (!cfg) return;

    if (cfg.kind === 'app') {
      clearIconFilter();
      const btn = [...document.querySelectorAll('.filter-bar__btn')]
        .find(b => b.textContent.trim() === cfg.btn);
      if (btn) btn.click();
      return;
    }

    clearIconFilter();
    // Trả bộ lọc của app về "Tất cả" trước. Nếu không, bấm "Chưa đọc" rồi bấm
    // "Auto" sẽ lọc chồng lên nhau — danh sách đã bị thu hẹp còn 2 dòng, nhân
    // viên tưởng cả công ty chỉ có 2 hội thoại thuộc nhóm đó.
    const allBtn = [...document.querySelectorAll('.filter-bar__btn')]
      .find(b => b.textContent.trim() === 'Tất cả');
    if (allBtn && !allBtn.classList.contains('filter-bar__btn--active')) {
      allBtn.click();
      await new Promise(r => setTimeout(r, 900));
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/conversations?limit=200&${cfg.param}`,
        { headers: authHeaders() });
      if (!res.ok) throw new Error('Lỗi ' + res.status);
      const d = await res.json();
      const items = d.conversations || [];
      iconFilter = {
        title,
        label: cfg.label,
        total: d.total ?? items.length,
        ids: new Set(items.map(c => c.id)),
      };
      applyIconFilter();
      if (!items.length) {
        const b = document.getElementById('chatmql-filter-banner');
        if (b) b.innerHTML =
          `<b>Đang lọc: ${sdEsc(cfg.label)}</b> — hiện chưa có hội thoại nào thuộc nhóm này.` +
          ` <button type="button" id="chatmql-filter-clear" style="margin-left:4px; border:none;
             background:none; color:#15803d; font-weight:700; cursor:pointer; text-decoration:underline;">Bỏ lọc</button>`;
        b?.querySelector('#chatmql-filter-clear')?.addEventListener('click', clearIconFilter);
      }
    } catch (e) {
      alert('Không lọc được: ' + e.message);
      clearIconFilter();
    }
  }

  // Công tắc để so sánh với hành vi gốc của app khi cần gỡ lỗi.
  let iconBarEnabled = true;
  window.chatmqlIconBar = function (on) {
    iconBarEnabled = !!on;
    if (!on) clearIconFilter();
    return iconBarEnabled;
  };

  function wireIconBar() {
    if (!iconBarEnabled) return;
    document.querySelectorAll('.chat-icon-bar__item').forEach(el => {
      if (el.dataset.chatmqlWired) return;
      const title = el.getAttribute('title');
      if (!ICON_FILTERS[title]) return;      // nút "Tôi" là hồ sơ, không đụng vào
      el.dataset.chatmqlWired = '1';
      el.addEventListener('click', () => {
        if (!iconBarEnabled) return;
        document.querySelectorAll('.chat-icon-bar__item').forEach(i =>
          i.classList.toggle('chat-icon-bar__item--active', i === el));
        runIconFilter(title);
      });
    });
    applyIconFilter();   // app vẽ lại danh sách thì ẩn lại cho đúng
  }

  // ══════════════════════════════════════════════════════════════════
  // DASHBOARD MỚI
  //
  // Dashboard cũ có 6 ô nhưng không ô nào nói về tiền, và hai ô ghi sai đơn vị:
  // "Chưa trả lời 888" / "Tin nhắn chưa xem 408" thực ra là số HỘI THOẠI, không
  // phải số tin nhắn (tin nhắn chưa đọc thật là 727). Nó cũng chào "hoạt động
  // hôm nay của bạn" rồi hiện số của cả công ty.
  //
  // Bảng mới: doanh thu trước, việc cần xử lý sau, rồi mới đến khách hàng.
  // ══════════════════════════════════════════════════════════════════
  const DASH_ID = 'chatmql-dashboard';
  let dashShowOldKpi = false;
  window.chatmqlOldKpi = function (on) {
    dashShowOldKpi = !!on;
    const k = document.querySelector('.kpi-grid');
    if (k) k.style.display = dashShowOldKpi ? '' : 'none';
    return dashShowOldKpi;
  };

  function dmoney(v) {
    if (v == null) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' tỷ';
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' tr';
    return formatDot(v) + 'đ';
  }
  function dnum(v) { return formatDot(v ?? 0); }

  function dashCard(label, value, sub, tone) {
    const c = tone || '#0f172a';
    return `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px;">
        <div style="font-size:11.5px; color:#64748b; font-weight:600; margin-bottom:6px;">${sdEsc(label)}</div>
        <div style="font-size:24px; font-weight:800; color:${c}; line-height:1.15;">${value}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${sub || ''}</div>
      </div>`;
  }

  function dashBars(daily) {
    const max = Math.max(1, ...daily.map(d => d.gmv));
    return daily.map(d => {
      const h = Math.round((d.gmv / max) * 68);
      const day = d.date.slice(8) + '/' + d.date.slice(5, 7);
      return `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0;"
             title="${day}: ${dnum(d.orders)} đơn · ${dmoney(d.gmv)}">
          <div style="width:100%; height:70px; display:flex; align-items:flex-end;">
            <div style="width:100%; height:${Math.max(h, d.gmv > 0 ? 3 : 1)}px;
                 background:${d.gmv > 0 ? 'var(--primary,#0D6838)' : '#e2e8f0'}; border-radius:3px 3px 0 0;"></div>
          </div>
          <div style="font-size:9px; color:#94a3b8; white-space:nowrap;">${day}</div>
        </div>`;
    }).join('');
  }

  async function renderDashboard() {
    if (!location.pathname.startsWith('/dashboard')) {
      document.getElementById(DASH_ID)?.remove();
      return;
    }
    if (document.getElementById(DASH_ID)) return;

    // Chèn ngay TRƯỚC bảng KPI cũ, bên trong .layout__content — đây là cột nội
    // dung thật. Chọn nhầm container cha thì khối bị đè lên thanh bên trái.
    const kpi = document.querySelector('.kpi-grid');
    const host = kpi?.parentElement || document.querySelector('.layout__content');
    if (!host) return;

    const box = document.createElement('div');
    box.id = DASH_ID;
    box.style.cssText = 'margin-bottom:18px; font-family:inherit;';
    box.innerHTML = '<div style="color:#94a3b8; font-size:13px;">Đang tải số liệu…</div>';
    host.insertBefore(box, kpi && kpi.parentElement === host ? kpi : host.firstChild);

    let d;
    try {
      const res = await fetch(`${API_BASE}/api/v1/dashboard/overview`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Lỗi ' + res.status);
      d = await res.json();
    } catch (e) {
      box.innerHTML = `<div style="color:#b91c1c; font-size:13px;">Không tải được số liệu: ${sdEsc(e.message)}</div>`;
      return;
    }

    // Nhân sự chỉ xem phần của mình. Chủ/quản trị mới xem toàn công ty.
    // Số toàn công ty (39.327 khách, bảng xếp hạng nhân sự, nguồn khách,
    // hoạt động gần đây) không phải việc của nhân viên chăm sóc — hiện ra chỉ
    // gây nhiễu và lộ dữ liệu không cần thiết.
    const isBoss = ['owner', 'admin', 'manager'].includes(d.role);
    const s = d.sales ? (isBoss ? d.sales.org : (d.sales.mine || d.sales.org)) : null;
    const scopeLabel = isBoss ? 'toàn công ty' : 'của tôi';
    const c = d.conversations;
    const gap = s ? s.today.gmv - s.yesterday.gmv : 0;
    const trend = !s ? '' : gap === 0 ? 'bằng hôm qua'
      : gap > 0 ? `▲ ${dmoney(gap)} so với hôm qua` : `▼ ${dmoney(-gap)} so với hôm qua`;

    box.innerHTML = `
      <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:800; color:#0f172a;">📊 Kinh doanh</div>
        <div style="font-size:11.5px; color:#94a3b8;">Số liệu ${sdEsc(scopeLabel)} · lấy trực tiếp từ CRM</div>
        <button type="button" id="dash-refresh" style="margin-left:auto; border:1px solid #cbd5e1;
          background:#fff; color:#475569; font-size:11.5px; font-weight:600; padding:4px 10px;
          border-radius:6px; cursor:pointer;">↻ Làm mới</button>
      </div>

      ${s ? `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:14px;">
        ${dashCard('Doanh thu hôm nay', dmoney(s.today.gmv), `${dnum(s.today.orders)} đơn · ${trend}`, '#0D6838')}
        ${dashCard('Doanh thu 7 ngày', dmoney(s.week.gmv), `${dnum(s.week.orders)} đơn · TB ${dmoney(s.week.aov)}/đơn`, '#0D6838')}
        ${dashCard('Doanh thu tháng này', dmoney(s.month.gmv), `${dnum(s.month.orders)} đơn`, '#0D6838')}
        ${dashCard(isBoss ? 'Khách hàng CRM' : 'Khách tôi phụ trách', dnum(s.customers),
            isBoss ? `${dnum(d.contacts.newThisWeek)} liên hệ mới trong 7 ngày` : 'đang được giao cho tôi')}
      </div>` : `
      <div class="sd__note" style="margin-bottom:14px;">
        ⚠️ Chưa lấy được số liệu bán hàng từ CRM: ${sdEsc(d.salesError || 'không rõ')}
      </div>`}

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:14px;">
        ${dashCard('Hội thoại chờ trả lời', dnum(c.unrepliedConversations), 'khách nhắn nhưng chưa ai trả lời', '#b45309')}
        ${dashCard('Hội thoại chưa đọc', dnum(c.unreadConversations), `${dnum(c.unreadMessages)} tin nhắn chưa xem`, '#b45309')}
        ${dashCard('Tin nhắn hôm nay', dnum(c.messagesToday), 'cả gửi và nhận')}
        ${dashCard('Việc của tôi hôm nay', dnum(d.me.repliesToday), `${dnum(d.me.unrepliedAssigned)} hội thoại được gán còn chờ`, '#2563eb')}
      </div>

      ${s ? `
      <div style="display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:10px;">
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px;">
          <div style="font-size:12.5px; font-weight:700; color:#1e293b; margin-bottom:10px;">Doanh thu 14 ngày</div>
          <div style="display:flex; gap:3px; align-items:flex-end;">${dashBars(s.daily)}</div>
        </div>
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px;">
          ${isBoss ? `
          <div style="font-size:12.5px; font-weight:700; color:#1e293b; margin-bottom:10px;">Nhân sự bán hàng · 7 ngày</div>
          ${(s.by_staff || []).length ? s.by_staff.slice(0, 6).map(st => `
            <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #f1f5f9;">
              <span style="flex:1; min-width:0; font-size:12px; color:#334155; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap;">${sdEsc(st.name)}</span>
              <span style="font-size:11px; color:#94a3b8; white-space:nowrap;">${dnum(st.orders)} đơn</span>
              <span style="font-size:12px; font-weight:700; color:#0D6838; white-space:nowrap;">${dmoney(st.gmv)}</span>
            </div>`).join('')
            : '<div style="font-size:12px; color:#94a3b8;">Chưa có đơn nào trong 7 ngày.</div>'}` : ''}
          <div style="font-size:12.5px; font-weight:700; color:#1e293b; margin:${isBoss ? '12px' : '0'} 0 6px;">Trạng thái đơn ${sdEsc(scopeLabel)} · 30 ngày</div>
          ${s.by_status.length ? s.by_status.map(st => `
            <div style="display:flex; justify-content:space-between; font-size:11.5px; color:#475569; padding:3px 0;">
              <span>${sdEsc(st.status)}</span><b>${dnum(st.orders)}</b>
            </div>`).join('') : '<div style="font-size:12px; color:#94a3b8;">Chưa có đơn nào trong 30 ngày.</div>'}
        </div>
      </div>` : ''}
    `;

    // Ẩn bảng KPI cũ: nó lặp lại đúng những con số này nhưng ghi sai đơn vị
    // ("Tin nhắn chưa xem: 408" trong khi 408 là số hội thoại). Để cả hai cạnh
    // nhau thì nhân viên không biết tin cái nào.
    // Hiện lại để đối chiếu: window.chatmqlOldKpi(true)
    if (kpi && !dashShowOldKpi) kpi.style.display = 'none';

    // Với tài khoản nhân sự, ẩn nốt các khối toàn công ty do app dựng sẵn:
    // "Nguồn khách hàng" (13.141 khách Zalo), "Pipeline khách hàng",
    // "Hoạt động gần đây" (nhật ký của mọi người), "Tin nhắn theo ngày".
    // Nhân viên chăm sóc không cần và không nên nhìn dữ liệu toàn tổ chức.
    if (!isBoss) {
      const ORG_PANELS = ['Nguồn khách hàng', 'Pipeline khách hàng',
                          'Hoạt động gần đây', 'Tin nhắn theo ngày'];
      document.querySelectorAll('.layout__content div').forEach(el => {
        const t = (el.firstElementChild?.textContent || '').trim();
        if (!ORG_PANELS.includes(t)) return;
        // Lùi lên tới thẻ card ngoài cùng để ẩn cả khung, không để lại ô rỗng.
        let card = el;
        for (let i = 0; i < 3; i++) {
          const p = card.parentElement;
          if (!p || p.classList.contains('layout__content')) break;
          card = p;
        }
        card.style.display = 'none';
      });
    }

    const rf = box.querySelector('#dash-refresh');
    if (rf) rf.onclick = () => { box.remove(); renderDashboard(); };
  }

  // ══════════════════════════════════════════════════════════════════
  // HIỆN ẢNH THAY VÌ IN JSON
  //
  // Tin nhắn ảnh lưu content dạng JSON {"href":...,"thumb":...}. Khung chat
  // chính biết đọc, nhưng màn hình "Chat thử AI" in thẳng chuỗi JSON ra bong
  // bóng — người test thấy một đống chữ thay vì tấm ảnh.
  //
  // Vá ở lớp hiển thị vì ChatMQL không còn mã nguồn React. Chỉ đụng vào phần
  // tử mà TOÀN BỘ nội dung là JSON ảnh, nên không thể phá nhầm tin nhắn thường.
  // ══════════════════════════════════════════════════════════════════
  // Màn hình "Chat thử AI" bỏ qua hẳn tin nhắn loại ảnh — không vẽ gì, hoặc
  // (tuỳ đường dữ liệu) in nguyên chuỗi JSON. Không sửa được ở gốc vì ChatMQL
  // chỉ còn bản build, nên tự chèn ảnh vào cuối luồng.
  //
  // Bám theo chính request của app để biết đang mở hội thoại nào — đoán "hội
  // thoại mới nhất" sẽ chèn nhầm khi người dùng bấm xem một hội thoại cũ.
  let testChatConvId = null;
  const CONV_MSG_RE = /\/api\/v1\/conversations\/([0-9a-f-]{36})\/messages/;
  function noteConvUrl(url) {
    try {
      const m = url && String(url).match(CONV_MSG_RE);
      if (m) testChatConvId = m[1];
    } catch { /* không cản trở request */ }
  }
  (function hookNetwork() {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      noteConvUrl(typeof args[0] === 'string' ? args[0] : args[0]?.url);
      return origFetch.apply(this, args);
    };
    // App dùng axios (chạy trên XMLHttpRequest) nên chỉ bọc fetch là hụt.
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      noteConvUrl(url);
      return origOpen.call(this, method, url, ...rest);
    };
  })();

  const shownImageIds = new Set();

  async function injectTestChatImages() {
    if (!location.pathname.startsWith('/ai/test-chat') || !testChatConvId) return;
    // Khung tin nhắn của màn hình này là .tc__messages (tc = test chat).
    // Selector cũ dò theo "msg"/"bubble" nên không khớp gì, hàm thoát sớm và
    // chẳng bao giờ chèn được ảnh.
    const list = document.querySelector('.tc__messages');
    if (!list) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/conversations/${testChatConvId}/messages?limit=100`,
        { headers: authHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      const msgs = d.messages || d.data || [];
      for (const m of msgs) {
        if (m.contentType !== 'image' || shownImageIds.has(m.id)) continue;
        if (document.querySelector(`[data-chatmql-msg="${m.id}"]`)) continue;
        let data;
        try { data = JSON.parse(m.content) } catch { continue }
        const url = data.thumb || data.href;
        if (!url) continue;

        // App CÓ tự vẽ được ảnh (qua đường tải lại hội thoại). Chỉ chèn khi nó
        // chưa vẽ — không kiểm thì mỗi ảnh hiện hai lần.
        const daCoAnh = [...document.querySelectorAll('.tc__messages img')]
          .some(i => i.src === url || i.src === data.href || i.src === data.hdUrl);
        if (daCoAnh) { shownImageIds.add(m.id); continue }

        shownImageIds.add(m.id);
        const wrap = document.createElement('div');
        wrap.dataset.chatmqlMsg = m.id;
        // Mượn luôn class của app để bong bóng ảnh nằm đúng hàng, đúng lề với
        // các bong bóng chữ do app vẽ.
        wrap.className = 'tc__row tc__row--out';
        wrap.style.cssText = 'display:flex; justify-content:flex-end; margin:8px 0;';
        wrap.innerHTML = `
          <div style="max-width:280px; background:#2563eb; padding:8px; border-radius:12px;">
            <div style="font-size:11px; color:#dbeafe; margin-bottom:5px;">🤖 AI gửi ảnh</div>
            <a href="${sdEsc(data.href || url)}" target="_blank" rel="noreferrer noopener">
              <img src="${sdEsc(url)}" alt="" referrerpolicy="no-referrer"
                   style="width:100%; border-radius:8px; display:block;">
            </a>
            ${data.caption ? `<div style="color:#fff; font-size:12.5px; margin-top:6px;">${sdEsc(data.caption)}</div>` : ''}
          </div>`;
        list.appendChild(wrap);
      }
    } catch { /* im lặng, thử lại lượt sau */ }
  }

  function renderImageJsonBubbles() {
    document.querySelectorAll('*').forEach(el => {
      if (el.childElementCount || el.dataset.chatmqlImg) return;
      const t = el.textContent?.trim();
      if (!t || t.length > 2000 || t[0] !== '{' || !t.includes('"href"')) return;

      let data;
      try { data = JSON.parse(t) } catch { return }
      const url = data.thumb || data.href || data.hdUrl;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;

      el.dataset.chatmqlImg = '1';
      el.textContent = '';
      const a = document.createElement('a');
      a.href = data.hdUrl || data.href || url;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.style.cssText = 'display:block; max-width:260px;';
      const img = document.createElement('img');
      img.src = url;
      img.alt = data.title || 'Ảnh sản phẩm';
      img.referrerPolicy = 'no-referrer';
      img.style.cssText = 'width:100%; border-radius:10px; display:block;';
      // Ảnh hỏng thì hiện chữ, không để bong bóng trống trơn.
      img.onerror = () => { a.textContent = '🖼️ Ảnh không tải được'; a.style.color = '#fff'; };
      a.appendChild(img);
      el.appendChild(a);

      if (data.caption) {
        const cap = document.createElement('div');
        cap.textContent = data.caption;
        cap.style.cssText = 'margin-top:6px; font-size:12.5px; line-height:1.45;';
        el.appendChild(cap);
      }
    });
  }

  const NAV_RENAMES = [
    { from: 'Báo giá', to: 'Ưu đãi & Khuyến mại' },
  ];

  function renameNavTabs() {
    document.querySelectorAll('.topnav__tab span').forEach(el => {
      const hit = NAV_RENAMES.find(r => el.textContent.trim() === r.from);
      if (hit) el.textContent = hit.to;
    });
  }

  function updateAppLogo() {
    const LOGO_SRC = '/assets/logo-traduocvietnam.png';
    document.querySelectorAll('.topnav__logo img, .topnav__logo-img, img[alt*="Trà Dược"], img[src*="logo-tdvn"], img[src*="logo-traduocvietnam"], .app-header img').forEach(img => {
      if (!img.src.includes('logo-traduocvietnam.png') && !img.closest('.sd-tile') && !img.closest('.chat-item__avatar')) {
        img.src = LOGO_SRC;
      }
      img.style.maxHeight = '44px';
      img.style.height = '42px';
      img.style.width = 'auto';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
    });
    const fav = document.querySelector('link[rel="icon"]');
    if (fav && !fav.href.includes('favicon.png')) {
      fav.href = '/favicon.png';
    }
  }

  const SD_STYLE_ID = 'chatmql-sd-style';
  function ensureSalesDocsStyle() {
    if (document.getElementById(SD_STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = SD_STYLE_ID;
    st.textContent = `
      #chatmql-sd{--sdp:#0ea5a4; padding:12px 14px 16px; border-top:1px solid #e2e8f0; margin-top:10px; position:relative;}
      #chatmql-sd #sd-body{padding-bottom:60px;}
      #chatmql-sd .sd__head{display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700;
        color:#b45309; padding-bottom:9px; border-bottom:2px solid #b45309; width:fit-content; margin-bottom:10px;}
      #chatmql-sd .sd__tabs{display:flex; gap:16px; border-bottom:1px solid #e2e8f0; margin-bottom:10px;}
      #chatmql-sd .sd__tab{border:none; background:none; cursor:pointer; font-size:12.5px; font-weight:500;
        color:#475569; padding:8px 0; border-bottom:2px solid transparent;}
      #chatmql-sd .sd__tab--active{color:var(--sdp); font-weight:700; border-bottom-color:var(--sdp);}
      #chatmql-sd .sd__note{font-size:11px; color:#64748b; background:#f8fafc; border-radius:8px;
        padding:6px 10px; margin-bottom:10px; line-height:1.45;}
      #chatmql-sd .sd__search{position:relative; margin-bottom:10px;}
      #chatmql-sd .sd__search input{width:100%; box-sizing:border-box; border:1px solid #e2e8f0; border-radius:8px;
        padding:7px 10px 7px 28px; font-size:12px; color:#0f172a; outline:none;}
      #chatmql-sd .sd__search input:focus{border-color:var(--sdp);}
      #chatmql-sd .sd__search svg{position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#94a3b8;}
      #chatmql-sd .sd__group{font-size:12px; font-weight:700; color:#1e293b; margin:12px 0 6px;
        display:flex; align-items:center; gap:6px;}
      #chatmql-sd .sd__group:first-of-type{margin-top:2px;}
      #chatmql-sd .sd__grid{display:grid; grid-template-columns:repeat(3,1fr); gap:6px;}
      #chatmql-sd .sd-tile{position:relative; aspect-ratio:1; border-radius:8px; cursor:pointer; overflow:hidden;
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
        border:2px solid transparent; transition:border-color .12s, box-shadow .12s;
        background:linear-gradient(135deg,#dcfce7,#bbf7d0);}
      #chatmql-sd .sd-tile:has(input:checked){border-color:var(--sdp);
        box-shadow:0 0 0 2px rgba(14,165,164,.25);}
      #chatmql-sd .sd-tile input{position:absolute; top:5px; left:5px; width:15px; height:15px;
        accent-color:var(--sdp); cursor:pointer; margin:0; z-index:2;}
      #chatmql-sd .sd-tile__img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover;}
      #chatmql-sd .sd-tile__emoji{font-size:22px; line-height:1;}
      #chatmql-sd .sd-tile__name{position:relative; z-index:1; font-size:9.5px; font-weight:600; color:#334155;
        text-align:center; padding:0 4px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      #chatmql-sd .sd-tile--has-img .sd-tile__name{color:#fff; background:rgba(0,0,0,.55); border-radius:4px;
        padding:1px 4px; position:absolute; left:4px; right:4px; bottom:4px;}
      #chatmql-sd .sd-tile--has-img .sd-tile__emoji{display:none;}
      #chatmql-sd .sd__send-wrap{position:sticky; bottom:0; left:0; right:0; padding:10px 14px; margin:12px -14px -16px;
        background:#fff; border-top:1px solid #e2e8f0; box-shadow:0 -4px 12px rgba(0,0,0,0.08); z-index:30;}
      #chatmql-sd .sd__send-btn{width:100%; display:inline-flex; align-items:center; justify-content:center;
        gap:6px; background:var(--sdp); color:#fff; border:none; font-size:13px; font-weight:700;
        padding:10px 14px; border-radius:8px; cursor:pointer; box-shadow:0 2px 6px rgba(14,165,164,0.3);}
      #chatmql-sd .sd__send-btn:disabled{background:#e2e8f0; color:#94a3b8; cursor:default; box-shadow:none;}
      #chatmql-sd .sd-content{border:1px solid #f1f5f9; border-radius:10px; padding:10px 12px; margin-bottom:8px;}
      #chatmql-sd .sd-content__head{display:flex; align-items:center; gap:8px; margin-bottom:5px;}
      #chatmql-sd .sd-content__title{font-size:12.5px; font-weight:700; color:#1e293b; flex:1; min-width:0;}
      #chatmql-sd .sd-content__copy{display:inline-flex; align-items:center; gap:4px; border:1px solid #e2e8f0;
        background:#fff; color:#475569; font-size:11px; font-weight:600; padding:4px 9px; border-radius:6px;
        cursor:pointer; flex-shrink:0; white-space:nowrap;}
      #chatmql-sd .sd-content__copy:hover{background:#f8fafc;}
      #chatmql-sd .sd-content__copy--done{border-color:#bbf7d0; background:#ecfdf3; color:#15803d;}
      #chatmql-sd .sd-content__text{font-size:12px; color:#475569; line-height:1.55; white-space:pre-line;}
      #chatmql-sd .sd__empty{font-size:12px; color:#94a3b8; text-align:center; padding:18px 0;}
    `;
    document.head.appendChild(st);
  }

  const SD_TABS = [
    { id: 'image',   label: 'Hình ảnh',  sendable: true  },
    { id: 'content', label: 'Content',   sendable: false },
    { id: 'video',   label: 'Video',     sendable: true  },
  ];
  const SD_TILE_BG = [
    'linear-gradient(135deg,#dcfce7,#bbf7d0)', 'linear-gradient(135deg,#e0f2fe,#bae6fd)',
    'linear-gradient(135deg,#fef3c7,#fde68a)', 'linear-gradient(135deg,#f3e8ff,#e9d5ff)',
    'linear-gradient(135deg,#fce7f3,#fbcfe8)', 'linear-gradient(135deg,#ffedd5,#fed7aa)',
  ];
  const sdState = { tab: 'image', q: '', cache: {}, selected: new Set(), convId: null };

  function sdEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function sdLoad(kind) {
    if (sdState.cache[kind]) return sdState.cache[kind];
    try {
      const res = await fetch(`${API_BASE}/api/v1/library/items?kind=${kind}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Lỗi ' + res.status);
      const d = await res.json();
      sdState.cache[kind] = d.groups || [];
      return sdState.cache[kind];
    } catch (e) {
      console.warn('[library] Lỗi nạp tài liệu:', e);
      sdState.cache[kind] = [];
      return [];
    }
  }

  function sdRenderBody(box) {
    const body = box.querySelector('#sd-body');
    const tab = SD_TABS.find(t => t.id === sdState.tab);
    const groups = sdState.cache[sdState.tab];
    if (!groups) { body.innerHTML = '<div class="sd__empty">Đang tải…</div>'; return; }

    const q = sdState.q.trim().toLowerCase();
    const match = it => !q || `${it.title || ''} ${it.code || ''} ${it.text || ''} ${it.content || ''}`.toLowerCase().includes(q);

    let html = '';
    if (sdState.tab === 'content') {
      const items = groups.flatMap(g => g.items || []).filter(match);
      html = items.length
        ? items.map(it => `
            <div class="sd-content">
              <div class="sd-content__head">
                <div class="sd-content__title">${sdEsc(it.title)}</div>
                <button type="button" class="sd-content__copy" data-copy="${sdEsc(it.id)}">📋 Copy</button>
              </div>
              <div class="sd-content__text">${sdEsc(it.text || it.content || '')}</div>
            </div>`).join('')
        : '<div class="sd__empty" style="padding:28px 14px; text-align:center; color:#64748b; font-size:12.5px;">Chưa có tài liệu content nào.</div>';
    } else {
      let bg = 0, any = false;
      groups.forEach(g => {
        const items = (g.items || []).filter(match);
        if (!items.length) return;
        any = true;
        html += `<div class="sd__group">📁 ${sdEsc(g.name)}</div><div class="sd__grid">`;
        items.forEach(it => {
          const checked = sdState.selected.has(it.id) ? ' checked' : '';
          const imgSrc = it.thumbUrl || it.fullUrl || it.url || '';
          const hasImg = !!imgSrc;
          html += `
            <label class="sd-tile${hasImg ? ' sd-tile--has-img' : ''}" style="background:${SD_TILE_BG[bg++ % SD_TILE_BG.length]};"
                   title="${sdEsc(it.title)}${it.code ? ' — Mã: ' + sdEsc(it.code) : ''}">
              <input type="checkbox" data-id="${sdEsc(it.id)}"${checked}>
              ${hasImg ? `<img class="sd-tile__img" src="${sdEsc(imgSrc)}" alt=""
                    onerror="var t=this.closest('.sd-tile'); this.remove(); if(t) t.classList.remove('sd-tile--has-img');">` : ''}
              <span class="sd-tile__emoji">${sdState.tab === 'video' ? '🎬' : '🍵'}</span>
              <span class="sd-tile__name">${sdEsc(it.title)}</span>
            </label>`;
        });
        html += '</div>';
      });
      if (!any) html = `<div class="sd__empty" style="padding:28px 14px; text-align:center; color:#64748b; font-size:12.5px;">Chưa có ${sdState.tab === 'video' ? 'video' : 'hình ảnh'} nào được duyệt.</div>`;
    }
    body.innerHTML = html;

    const wrap = box.querySelector('#sd-send-wrap');
    wrap.hidden = !tab.sendable;
    sdSyncSendBtn(box);

    body.querySelectorAll('input[type=checkbox]').forEach(inp => {
      inp.onchange = () => {
        inp.checked ? sdState.selected.add(inp.dataset.id) : sdState.selected.delete(inp.dataset.id);
        sdSyncSendBtn(box);
      };
    });
    body.querySelectorAll('.sd-content__copy').forEach(btn => {
      btn.onclick = async () => {
        const text = btn.closest('.sd-content').querySelector('.sd-content__text').textContent;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = '✓ Đã copy';
          btn.classList.add('sd-content__copy--done');
          setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('sd-content__copy--done'); }, 1600);
        } catch { alert('Trình duyệt chặn copy. Bôi đen rồi Ctrl+C giúp em ạ.'); }
      };
    });
  }

  function sdSyncSendBtn(box) {
    const btn = box.querySelector('#sd-send');
    const n = sdState.selected.size;
    btn.disabled = n === 0;
    btn.textContent = `📤 Gửi vào chat (${n})`;
  }

  async function sdSend(box) {
    const btn = box.querySelector('#sd-send');
    const ids = Array.from(sdState.selected);
    if (!ids.length) return;
    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    try {
      const res = await fetch(`${API_BASE}/api/v1/library/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ conversationId: sdState.convId, itemIds: ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi ' + res.status);
      sdState.selected.clear();
      box.querySelectorAll('#sd-body input[type=checkbox]').forEach(i => { i.checked = false; });
      const skipped = (d.skipped || []).length;
      btn.textContent = skipped
        ? `✓ Gửi ${(d.created || []).length}, bỏ qua ${skipped}`
        : `✓ Đã gửi ${(d.created || []).length}`;
      setTimeout(() => sdSyncSendBtn(box), 2200);
    } catch (e) {
      alert('Không gửi được: ' + e.message);
      sdSyncSendBtn(box);
    }
  }

  function renderSalesDocsSidebar(sidebar) {
    const convId = getCurrentConversationId();
    if (!convId) return;
    ensureSalesDocsStyle();

    let box = document.getElementById('chatmql-sd');
    if (!box) {
      box = document.createElement('div');
      box.id = 'chatmql-sd';
      box.innerHTML = `
        <div class="sd__tabs">
          ${SD_TABS.map(t => `<button type="button" class="sd__tab${t.id === 'image' ? ' sd__tab--active' : ''}" data-sd="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="sd__note">🔒 Chỉ hiển thị tài liệu <b>đã duyệt</b> — được phép gửi ra ngoài cho khách.</div>
        <div class="sd__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
          <input id="sd-q" placeholder="Tìm theo tên, mã…">
        </div>
        <div id="sd-body"><div class="sd__empty">Đang tải…</div></div>
        <div class="sd__send-wrap" id="sd-send-wrap">
          <button type="button" class="sd__send-btn" id="sd-send" disabled>📤 Gửi vào chat (0)</button>
        </div>`;
      // Nằm trong tab "Tài liệu bán hàng"; chưa dựng xong thẻ khách thì chờ lượt sau.
      const host = document.getElementById('cc-panel-sales');
      if (!host) return;
      host.appendChild(box);

      box.querySelectorAll('.sd__tab').forEach(btn => {
        btn.onclick = async () => {
          box.querySelectorAll('.sd__tab').forEach(b => b.classList.toggle('sd__tab--active', b === btn));
          sdState.tab = btn.dataset.sd;
          box.querySelector('#sd-body').innerHTML = '<div class="sd__empty">Đang tải…</div>';
          try { await sdLoad(sdState.tab); } catch (e) {
            box.querySelector('#sd-body').innerHTML = `<div class="sd__empty">Không tải được: ${sdEsc(e.message)}</div>`;
            return;
          }
          sdRenderBody(box);
        };
      });
      box.querySelector('#sd-q').oninput = e => { sdState.q = e.target.value; sdRenderBody(box); };
      box.querySelector('#sd-send').onclick = () => sdSend(box);
    }

    // Đổi hội thoại thì bỏ hết lựa chọn cũ — tránh gửi nhầm tài liệu đang
    // chọn dở của khách trước sang khách mới.
    if (sdState.convId !== convId) {
      sdState.convId = convId;
      sdState.selected.clear();
      sdSyncSendBtn(box);
    }

    if (!sdState.cache[sdState.tab]) {
      sdLoad(sdState.tab)
        .then(() => sdRenderBody(box))
        .catch(e => {
          box.querySelector('#sd-body').innerHTML =
            `<div class="sd__empty">Không tải được: ${sdEsc(e.message)}</div>`;
        });
    }
  }

  // Polling / MutationObserver to keep button, history, and image healer active across conversation switches
  setInterval(injectOrderButtons, 1200);
  // Nhãn menu phải đúng ở MỌI trang, kể cả khi chưa mở hội thoại nào.
  renameNavTabs();
  setInterval(renameNavTabs, 1200);
  updateAppLogo();
  setInterval(updateAppLogo, 1000);
  wireIconBar();
  setInterval(wireIconBar, 1200);
  renderImageJsonBubbles();
  setInterval(renderImageJsonBubbles, 1000);
  setInterval(injectTestChatImages, 2000);
  renderDashboard();
  setInterval(renderDashboard, 1500);

})();
