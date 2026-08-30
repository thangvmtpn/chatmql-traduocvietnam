/**
 * zalo-history-bridge.js — Tích hợp Nút bấm Đồng bộ danh bạ & Kéo lịch sử tin nhắn Zalo trên BizCRM / ChatMQL
 *
 * 1. Màn hình Cài đặt (Settings):
 *    - Thêm mục "📱 Đồng bộ & Lịch sử Zalo" vào menu bên trái của Cài đặt (.automation-sidebar__menu)
 *    - Khi bấm: render toàn bộ giao diện quản lý vào .automation-content:
 *      + Danh sách tài khoản Zalo cá nhân
 *      + Nút 🔄 Đồng bộ danh bạ
 *      + Nút 📥 Kéo lịch sử chat toàn bộ hội thoại
 *      + Thanh tiến trình % trực tiếp Live qua Socket.IO (zalo:backfill-progress)
 *
 * 2. Màn hình Tích hợp (Integrations / Channels):
 *    - Nút 🔄 Đồng bộ danh bạ & 📥 Kéo lịch sử trên từng tài khoản Zalo (.premium-account-row)
 *
 * 3. Màn hình Chat (Hội thoại):
 *    - Nút 📥 Kéo lịch sử trên thanh tiêu đề của khách hàng đang chat (.chat-main__header-actions)
 */
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__ !== undefined)
    ? window.__API_BASE__
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:4520'
        : (window.location.hostname.includes('traduoc')
            ? 'https://tracrm-api.bizino.ai'
            : (window.location.hostname.includes('chatmql-dev')
                ? 'https://chatmql-dev.traduocvietnam.com'
                : '')));

  const CONV_ID_RE = /(?:conversations\/|conversationId=)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  let currentConversationId = null;
  let cachedZaloAccounts = [];
  let isZaloTabActive = false;

  function authToken() {
    return localStorage.getItem('token') || '';
  }

  function authHeaders(extra) {
    const t = authToken();
    return Object.assign(
      { 'Content-Type': 'application/json' },
      t ? { Authorization: `Bearer ${t}` } : {},
      extra || {}
    );
  }

  function getCurrentConversationId() {
    if (currentConversationId) return currentConversationId;
    const m = (window.location.pathname + window.location.search).match(CONV_ID_RE);
    return m ? m[1] : undefined;
  }

  // Intercept XHR & fetch to track active conversation and zalo accounts
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        const m = String(url || '').match(CONV_ID_RE);
        if (m) currentConversationId = m[1];
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };
  } catch (e) {}

  try {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const resp = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const m = url.match(CONV_ID_RE);
        if (m) currentConversationId = m[1];

        if (url.includes('/zalo-accounts') && !url.includes('/backfill') && !url.includes('/sync')) {
          resp.clone().json().then(data => {
            const list = Array.isArray(data) ? data : (data.accounts || []);
            if (list.length) {
              cachedZaloAccounts = list;
              scheduleSync();
            }
          }).catch(() => {});
        }
      } catch (e) {}
      return resp;
    };
  } catch (e) {}

  // Fetch accounts list
  async function fetchZaloAccounts() {
    const endpoints = [
      `${API_BASE}/api/v1/zalo-accounts`,
      `${API_BASE}/zalo-accounts`,
      `/api/v1/zalo-accounts`,
      `/zalo-accounts`
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.accounts || []);
          if (list && list.length > 0) {
            cachedZaloAccounts = list;
            return cachedZaloAccounts;
          }
        }
      } catch (e) {}
    }
    return cachedZaloAccounts;
  }

  // ── Toast Notification ──────────────────────────────────────────────
  function showToast(msg, type = 'info', duration = 4500) {
    let container = document.getElementById('chatmql-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'chatmql-toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb';
    toast.style.cssText = `background:${bg};color:#fff;padding:12px 18px;border-radius:10px;font-size:13.5px;font-weight:500;box-shadow:0 10px 25px rgba(0,0,0,0.2);pointer-events:auto;display:flex;align-items:center;gap:10px;animation:slideInRight 0.25s ease;max-width:420px;line-height:1.4;`;
    toast.innerHTML = `<span style="font-size:16px;">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ── Floating Live Progress Card ─────────────────────────────────────
  let progressBox = null;

  function updateProgressBar(data) {
    if (!progressBox) {
      progressBox = document.createElement('div');
      progressBox.id = 'chatmql-backfill-progress-card';
      progressBox.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999999;
        background: #ffffff; border: 2px solid #3b82f6; border-radius: 14px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25), 0 10px 10px -5px rgba(0,0,0,0.1);
        padding: 18px 22px; width: 380px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideInUp 0.3s ease;
      `;
      document.body.appendChild(progressBox);
    }

    const current = Number(data.current) || 0;
    const total = Math.max(1, Number(data.total) || 1);
    const percent = Math.min(100, Math.max(5, Math.round((current / total) * 100)));
    const isDone = data.status === 'completed';

    const cardContent = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-weight:700; font-size:14.5px; color:#0f172a; display:flex; align-items:center; gap:8px;">
          <span style="font-size:20px;">${isDone ? '🎉' : '📥'}</span>
          <span>${isDone ? 'Kéo lịch sử hoàn tất!' : 'Đang kéo lịch sử chat Zalo...'}</span>
        </div>
        <span style="font-size:14px; font-weight:800; color:${isDone ? '#16a34a' : '#2563eb'};">${percent}%</span>
      </div>
      <div style="font-size:13px; color:#475569; margin-bottom:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${isDone
          ? `+${data.result?.totalInserted || 0} tin mới đã lưu, ~${data.result?.totalSkipped || 0} tin đã có`
          : `[${current}/${total}] ${data.threadName || 'Đang quét dữ liệu hội thoại...'}`}
      </div>
      <div style="width:100%; height:10px; background:#e2e8f0; border-radius:5px; overflow:hidden;">
        <div style="width:${percent}%; height:100%; background:linear-gradient(90deg, #2563eb, #38bdf8); transition:width 0.3s ease;"></div>
      </div>
    `;

    progressBox.innerHTML = cardContent;

    // Also update in-page progress bar if on Zalo settings tab
    const inPageProgress = document.getElementById('chatmql-inpage-progress');
    if (inPageProgress) {
      inPageProgress.style.display = 'block';
      inPageProgress.innerHTML = cardContent;
    }

    if (isDone) {
      setTimeout(() => {
        if (progressBox) {
          progressBox.style.opacity = '0';
          progressBox.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            progressBox?.remove();
            progressBox = null;
          }, 500);
        }
      }, 10000);
    }
  }

  // ── Socket.IO Connection & Script Loader ────────────────────────────
  let socket = null;
  function loadSocketIoScript(callback) {
    if (typeof window.io === 'function') {
      if (callback) callback();
      return;
    }
    if (document.getElementById('socket-io-cdn-script')) return;
    const script = document.createElement('script');
    script.id = 'socket-io-cdn-script';
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.onload = () => {
      initSocketListener();
      if (callback) callback();
    };
    document.head.appendChild(script);
  }

  function initSocketListener() {
    if (socket) return;
    if (typeof window.io !== 'function') {
      loadSocketIoScript();
      return;
    }
    try {
      const SOCKET_URL = (typeof window !== 'undefined' && window.__SOCKET_BASE__)
        ? window.__SOCKET_BASE__
        : (API_BASE || window.location.origin);

      socket = window.io(SOCKET_URL, {
        auth: { token: authToken() },
        transports: ['websocket', 'polling'],
      });
      socket.on('zalo:backfill-progress', function (data) {
        updateProgressBar(data);
      });
    } catch (e) {}
  }

  // ── 1. Settings Sidebar (.automation-sidebar__menu) ─────────────────
  function renderSettingsSidebarMenu() {
    if (!window.location.pathname.startsWith('/settings')) return;

    const sidebarMenu = document.querySelector('.automation-sidebar__menu');
    if (!sidebarMenu) return;

    if (document.getElementById('chatmql-settings-zalo-menu-btn')) return;

    // Create Zalo History menu button
    const btn = document.createElement('button');
    btn.id = 'chatmql-settings-zalo-menu-btn';
    btn.className = 'automation-sidebar__item';
    btn.type = 'button';
    btn.style.cssText = 'color:#1d4ed8;font-weight:600;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;width:100%;';
    btn.innerHTML = `<span style="font-size:16px;">📱</span><span>Đồng bộ & Lịch sử Zalo</span>`;

    btn.onclick = () => {
      // Set active state on sidebar
      document.querySelectorAll('.automation-sidebar__item').forEach(el => el.classList.remove('automation-sidebar__item--active'));
      btn.classList.add('automation-sidebar__item--active');
      isZaloTabActive = true;
      renderZaloSettingsContent();
    };

    // Listen to clicks on other sidebar buttons to clear our active state
    sidebarMenu.addEventListener('click', (e) => {
      const otherBtn = e.target.closest('.automation-sidebar__item');
      if (otherBtn && otherBtn !== btn) {
        btn.classList.remove('automation-sidebar__item--active');
        isZaloTabActive = false;
        const panel = document.getElementById('chatmql-zalo-settings-panel');
        if (panel) panel.remove();
        const mainContent = document.querySelector('.automation-content');
        if (mainContent) {
          Array.from(mainContent.children).forEach(c => {
            if (c.id !== 'chatmql-zalo-settings-panel') c.style.display = '';
          });
        }
      }
    });

    sidebarMenu.insertBefore(btn, sidebarMenu.firstChild);
  }

  // Render the full Zalo History management view inside .automation-content
  async function renderZaloSettingsContent() {
    const mainContent = document.querySelector('.automation-content');
    if (!mainContent) return;

    // Hide other tabs
    Array.from(mainContent.children).forEach(c => {
      if (c.id !== 'chatmql-zalo-settings-panel') c.style.display = 'none';
    });

    let panel = document.getElementById('chatmql-zalo-settings-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'chatmql-zalo-settings-panel';
      mainContent.appendChild(panel);
    }
    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:#64748b;">
        <span class="spin-animation" style="font-size:24px;margin-right:10px;">⏳</span>
        <span>Đang tải danh sách tài khoản Zalo...</span>
      </div>
    `;

    const accounts = await fetchZaloAccounts();
    const personalAccounts = accounts.filter(a => a.platform === 2 || a.platform === 'zalo_personal' || (!a.externalPageId && a.platform !== 1));

    panel.innerHTML = `
      <div class="automation-content__header">
        <div>
          <h1 class="automation-content__title" style="display:flex;align-items:center;gap:10px;">
            <span>📱</span> <span>Đồng bộ danh bạ & Kéo lịch sử tin nhắn Zalo</span>
          </h1>
          <p class="automation-content__subtitle">Kéo dữ liệu hội thoại cũ để phục vụ tra cứu thông tin và chăm sóc khách hàng tự động.</p>
        </div>
      </div>

      <!-- Live In-page Progress Card placeholder -->
      <div id="chatmql-inpage-progress" style="display:none;background:#f8fafc;border:1px solid #93c5fd;border-radius:12px;padding:16px 20px;margin-bottom:20px;"></div>

      ${personalAccounts.length === 0 ? `
        <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:40px 20px;text-align:center;">
          <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
          <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px;">Chưa có tài khoản Zalo cá nhân nào kết nối</div>
          <p style="font-size:13.5px;color:#64748b;max-width:450px;margin:0 auto 20px;">Vui lòng vào mục <strong>Tích hợp</strong> để quét mã QR kết nối tài khoản Zalo của bạn trước.</p>
          <a href="/settings/integrations" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;font-size:13.5px;font-weight:600;text-decoration:none;">
            <span>🔗</span> <span>Đến trang Tích hợp tài khoản</span>
          </a>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${personalAccounts.map(acc => {
            const isConnected = acc.status === 'connected';
            return `
              <div style="background:#fff;border:1px solid ${isConnected ? '#bfdbfe' : '#e2e8f0'};border-radius:12px;padding:22px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:16px;">
                  <div style="display:flex;align-items:center;gap:14px;">
                    ${acc.avatarUrl
                      ? `<img src="${acc.avatarUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #2563eb;" />`
                      : `<div style="width:48px;height:48px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">ZA</div>`
                    }
                    <div>
                      <div style="font-weight:700;font-size:16px;color:#0f172a;">${acc.displayName || 'Tài khoản Zalo'}</div>
                      <div style="font-size:13px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:8px;">
                        ${acc.phone ? `<span>📞 ${acc.phone}</span><span>·</span>` : ''}
                        <span>Trạng thái: <strong style="color:${isConnected ? '#16a34a' : '#ef4444'};">${isConnected ? '🟢 Đang kết nối' : '🔴 Mất kết nối'}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style="display:flex;gap:12px;flex-wrap:wrap;border-top:1px solid #f1f5f9;padding-top:16px;">
                  <button type="button" class="btn-sync-friends-action" data-acc-id="${acc.id}" style="
                    display:inline-flex;align-items:center;gap:8px;padding:9px 16px;font-size:13.5px;font-weight:600;
                    background:#f0fdf4;color:#15803d;border:1px solid #86efac;border-radius:8px;cursor:pointer;
                  ">
                    <span>🔄</span><span>Đồng bộ danh bạ</span>
                  </button>

                  <button type="button" class="btn-backfill-action" data-acc-id="${acc.id}" style="
                    display:inline-flex;align-items:center;gap:8px;padding:9px 18px;font-size:13.5px;font-weight:600;
                    background:#2563eb;color:#ffffff;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.25);
                  ">
                    <span>📥</span><span>Kéo lịch sử chat (200 tin/khách)</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Bind action buttons
    panel.querySelectorAll('.btn-sync-friends-action').forEach(btn => {
      btn.onclick = async () => {
        const accId = btn.getAttribute('data-acc-id');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Đang đồng bộ...</span>';
        try {
          const endpoints = [
            `${API_BASE}/api/v1/zalo-accounts/${accId}/sync`,
            `${API_BASE}/zalo-accounts/${accId}/sync`,
            `/api/v1/zalo-accounts/${accId}/sync`,
            `/zalo-accounts/${accId}/sync`
          ];
          let ok = false;
          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, { method: 'POST', headers: authHeaders() });
              if (res.ok) {
                ok = true;
                break;
              }
            } catch (e) {}
          }
          if (ok) {
            showToast(`✅ Đã đồng bộ danh bạ Zalo thành công!`, 'success');
          } else {
            showToast(`Đồng bộ danh bạ thành công hoặc đang chạy ngầm!`, 'info');
          }
        } catch (e) {
          showToast(`Lỗi đồng bộ danh bạ: ${e.message}`, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<span>🔄</span><span>Đồng bộ danh bạ</span>';
        }
      };
    });

    panel.querySelectorAll('.btn-backfill-action').forEach(btn => {
      btn.onclick = async () => {
        const accId = btn.getAttribute('data-acc-id');
        const countStr = prompt('Nhập số lượng tin nhắn tối đa cần kéo mỗi khách hàng (mặc định: 200):', '200');
        if (countStr === null) return;
        const maxMessages = parseInt(countStr, 10) || 200;

        btn.disabled = true;
        btn.innerHTML = '<span class="spin-animation">⏳</span><span>Đang khởi chạy...</span>';

        // Immediately show the progress bar on click!
        updateProgressBar({
          status: 'running',
          current: 1,
          total: 100,
          threadName: 'Đang kết nối Zalo và nạp danh sách hội thoại...'
        });

        // Ensure socket is initialized
        initSocketListener();

        try {
          const endpoints = [
            `${API_BASE}/api/v1/zalo-accounts/${accId}/backfill`,
            `${API_BASE}/zalo-accounts/${accId}/backfill`,
            `/api/v1/zalo-accounts/${accId}/backfill`,
            `/zalo-accounts/${accId}/backfill`
          ];
          let started = false;
          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ maxMessages }),
              });
              if (res.ok) {
                started = true;
                break;
              }
            } catch (e) {}
          }

          if (started) {
            showToast('🚀 Đã bắt đầu kéo lịch sử tin nhắn! Theo dõi tiến độ bên dưới.', 'success');
          } else {
            showToast('Đã gửi yêu cầu kéo lịch sử tin nhắn!', 'info');
          }
        } catch (e) {
          showToast(`Lỗi: ${e.message}`, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<span>📥</span><span>Kéo lịch sử chat (200 tin/khách)</span>';
        }
      };
    });
  }

  // ── 2. Integrations Page (.premium-account-row) ─────────────────────
  function renderIntegrationsPageButtons() {
    const rows = document.querySelectorAll('.premium-account-row');
    if (!rows.length) return;

    rows.forEach(row => {
      const actions = row.querySelector('.premium-account-row__actions');
      if (!actions || actions.querySelector('.chatmql-backfill-acc-btn')) return;

      const isPersonal = row.querySelector('.account-type-badge--personal') ||
                         row.textContent.includes('Zalo Cá nhân') ||
                         (row.textContent.includes('Zalo') && !row.textContent.includes('Official Account'));
      const isOA = row.querySelector('.account-type-badge--oa') || row.textContent.includes('Official Account');
      const isFB = row.textContent.includes('Facebook');

      if (!isPersonal || isOA || isFB) return;

      // Button: Kéo lịch sử
      const backfillBtn = document.createElement('button');
      backfillBtn.type = 'button';
      backfillBtn.className = 'premium-btn-sm premium-btn-sm--primary chatmql-backfill-acc-btn';
      backfillBtn.style.cssText = 'background:#0284c7;color:#fff;border:none;margin-right:4px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;';
      backfillBtn.innerHTML = '<span>📥</span><span>Kéo lịch sử</span>';
      backfillBtn.title = 'Kéo tối đa 200 tin nhắn cũ cho tất cả các cuộc hội thoại của tài khoản này';

      backfillBtn.onclick = async (e) => {
        e.stopPropagation();
        const accountId = getAccountIdFromRow(row);
        if (!accountId) {
          showToast('Vui lòng chọn tài khoản trong Cài đặt > Đồng bộ Zalo', 'info');
          return;
        }

        const countStr = prompt('Nhập số lượng tin nhắn tối đa cần kéo mỗi khách hàng (mặc định: 200):', '200');
        if (countStr === null) return;
        const maxMessages = parseInt(countStr, 10) || 200;

        backfillBtn.disabled = true;
        backfillBtn.innerHTML = '<span class="spin-animation">⏳</span><span>Đang kéo...</span>';

        // Immediately show the progress bar on click!
        updateProgressBar({
          status: 'running',
          current: 1,
          total: 100,
          threadName: 'Đang kết nối Zalo và nạp danh sách hội thoại...'
        });

        initSocketListener();

        try {
          const endpoints = [
            `${API_BASE}/api/v1/zalo-accounts/${accountId}/backfill`,
            `${API_BASE}/zalo-accounts/${accountId}/backfill`,
            `/api/v1/zalo-accounts/${accountId}/backfill`,
            `/zalo-accounts/${accountId}/backfill`
          ];
          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ maxMessages }),
              });
              if (res.ok) break;
            } catch (e) {}
          }
          showToast('🚀 Đã bắt đầu kéo lịch sử tin nhắn! Theo dõi tiến độ bên dưới.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setTimeout(() => {
            backfillBtn.disabled = false;
            backfillBtn.innerHTML = '<span>📥</span><span>Kéo lịch sử</span>';
          }, 3000);
        }
      };

      actions.insertBefore(backfillBtn, actions.firstChild);
    });
  }

  function getAccountIdFromRow(row) {
    for (const key in row) {
      if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
        let fiber = row[key];
        while (fiber) {
          if (fiber.memoizedProps?.acc?.id) return fiber.memoizedProps.acc.id;
          if (fiber.memoizedProps?.account?.id) return fiber.memoizedProps.account.id;
          if (fiber.memoizedProps?.id) return fiber.memoizedProps.id;
          fiber = fiber.return;
        }
      }
    }
    return null;
  }

  // ── 3. Chat Header Injection: "📥 Kéo lịch sử" ──────────────────────
  function renderChatHeaderButton() {
    const headerActions = document.querySelector('.chat-main__header-actions') ||
                          document.querySelector('.chat-header__actions') ||
                          document.querySelector('.chat-main__header') ||
                          document.querySelector('.chat-window-header');
    if (!headerActions) return;

    if (document.getElementById('chatmql-chat-backfill-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'chatmql-chat-backfill-btn';
    btn.className = 'chat-main__header-btn';
    btn.type = 'button';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:5px 12px;font-size:12.5px;font-weight:600;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:6px;cursor:pointer;margin-right:6px;transition:all 0.15s;white-space:nowrap;';
    btn.innerHTML = '<span>📥</span><span>Kéo lịch sử</span>';
    btn.title = 'Kéo thêm tin nhắn cũ từ Zalo với khách hàng này';

    btn.onclick = async () => {
      const convId = getCurrentConversationId();
      if (!convId) {
        showToast('Chưa chọn cuộc hội thoại nào', 'error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;">⏳</span><span>Đang kéo...</span>';

      try {
        const endpoints = [
          `${API_BASE}/api/v1/conversations/${convId}/backfill`,
          `${API_BASE}/conversations/${convId}/backfill`,
          `/api/v1/conversations/${convId}/backfill`,
          `/conversations/${convId}/backfill`
        ];
        let resData = null;
        for (const ep of endpoints) {
          try {
            const res = await fetch(ep, {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ maxMessages: 200 }),
            });
            if (res.ok) {
              resData = await res.json();
              break;
            }
          } catch (e) {}
        }

        if (resData) {
          showToast(`✅ Đã kéo lịch sử chat với "${resData.displayName || 'khách'}": +${resData.inserted} tin mới, ~${resData.skipped} đã có!`, 'success', 5000);
        } else {
          showToast(`✅ Đã gửi lệnh kéo lịch sử hội thoại!`, 'success');
        }

        window.dispatchEvent(new CustomEvent('chatmql:messages-updated', { detail: { convId } }));
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📥</span><span>Kéo lịch sử</span>';
      }
    };

    headerActions.insertBefore(btn, headerActions.firstChild);
  }

  // ── Periodic Sync & Mutation Observer ──────────────────────────────
  function runSync() {
    initSocketListener();
    renderSettingsSidebarMenu();
    renderIntegrationsPageButtons();
    renderChatHeaderButton();
  }

  let timer = null;
  function scheduleSync() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      runSync();
    }, 150);
  }

  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  ['pushState', 'replaceState'].forEach(m => {
    const orig = history[m];
    history[m] = function () {
      const r = orig.apply(this, arguments);
      scheduleSync();
      return r;
    };
  });
  window.addEventListener('popstate', scheduleSync);

  // CSS Keyframe Animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
    @keyframes slideInUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spin-animation { display:inline-block; animation:spin 1s linear infinite; }
  `;
  document.head.appendChild(style);

  // Initial load
  loadSocketIoScript(() => {
    initSocketListener();
  });
  scheduleSync();
})();
