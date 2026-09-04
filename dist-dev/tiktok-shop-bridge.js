/**
 * tiktok-shop-bridge.js — TikTok Shop Configuration & OAuth Integration Bridge
 * Cho phép quản trị viên cấu hình App Key & App Secret và kết nối TikTok Shop trực tiếp từ giao diện "Tài khoản kết nối".
 */
(function () {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__ !== undefined)
    ? window.__API_BASE__
    : (isLocal ? 'https://chatmql.traduocvietnam.com' : '');

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

  // Toast helper
  function showToast(message, type = 'info') {
    let container = document.getElementById('tiktok-bridge-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tiktok-bridge-toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      pointer-events:auto;
      padding:12px 18px;
      border-radius:10px;
      font-size:14px;
      font-weight:600;
      color:#fff;
      box-shadow:0 8px 24px rgba(0,0,0,0.18);
      display:flex;
      align-items:center;
      gap:10px;
      animation:ttToastIn 0.25s ease-out forwards;
      background:${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb'};
    `;

    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease-in';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // Check URL parameters for OAuth redirect callbacks
  function checkUrlCallbacks() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tiktok_connected') === '1') {
      const shop = params.get('shop');
      showToast(`Kết nối TikTok Shop ${shop ? `"${decodeURIComponent(shop)}" ` : ''}thành công!`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
      // Trigger click or reload after short delay to refresh account list
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else if (params.get('tiktok_error')) {
      showToast(`Kết nối TikTok Shop thất bại: ${decodeURIComponent(params.get('tiktok_error'))}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // Modal State & Logic
  let modalBackdrop = null;

  async function openTikTokModal() {
    if (document.getElementById('tiktok-config-modal')) return;

    // Fetch existing config from backend
    let existingConfig = { appKey: '', hasAppSecret: false, appSecretMasked: '', redirectUri: '', webhookUrl: '' };
    try {
      const res = await fetch(`${API_BASE}/api/v1/tiktok-shop/config`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        existingConfig = await res.json();
      }
    } catch (e) {
      console.warn('[tiktok-bridge] Could not load existing TikTok config:', e);
    }

    // Default URLs (prefer backend config redirectUri/webhookUrl)
    const redirectUrl = existingConfig.redirectUri || `${window.location.origin}/api/v1/tiktok-shop/callback`;
    const webhookUrl = existingConfig.webhookUrl || `${window.location.origin}/api/v1/tiktok-shop/webhook`;

    modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'tiktok-config-modal';
    modalBackdrop.style.cssText = `
      position:fixed;inset:0;background:rgba(15,23,42,0.6);
      backdrop-filter:blur(4px);z-index:99999;
      display:flex;align-items:center;justify-content:center;
      padding:16px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;
    `;

    const modalBox = document.createElement('div');
    modalBox.style.cssText = `
      background:#ffffff;border-radius:16px;
      box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);
      width:100%;max-width:580px;overflow:hidden;
      display:flex;flex-direction:column;
      animation:ttModalIn 0.2s ease-out forwards;
      border:1px solid #e2e8f0;
    `;

    modalBox.innerHTML = `
      <!-- Header -->
      <div style="padding:20px 24px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:14px;background:#f8fafc;">
        <div style="width:44px;height:44px;border-radius:12px;background:#000000;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <h2 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">Kết nối TikTok Shop</h2>
            <span style="font-size:10.5px;font-weight:700;color:#000;background:#25F4EE;padding:2px 7px;border-radius:6px;letter-spacing:0.3px;">OFFICIAL</span>
          </div>
          <p style="margin:3px 0 0;font-size:13px;color:#64748b;line-height:1.4;">
            Nhập App Key & App Secret từ TikTok Shop Partner Platform để kết nối kênh chat và đơn hàng.
          </p>
        </div>
        <button id="tt-modal-close" style="width:30px;height:30px;border-radius:8px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:18px;font-weight:700;">✕</button>
      </div>

      <!-- Body -->
      <div style="padding:20px 24px;overflow-y:auto;max-height:75vh;display:flex;flex-direction:column;gap:18px;">
        
        <!-- Collapsible Guide -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <button id="tt-guide-toggle" type="button" style="width:100%;padding:12px 14px;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;text-align:left;">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1e293b;">
              <span>📖</span>
              <span>Hướng dẫn lấy App Key & App Secret</span>
            </div>
            <span id="tt-guide-arrow" style="font-size:12px;color:#64748b;transition:transform 0.2s;">▼</span>
          </button>
          
          <div id="tt-guide-content" style="display:none;padding:0 14px 14px;font-size:12.5px;color:#475569;line-height:1.6;border-top:1px dashed #e2e8f0;">
            <ol style="margin:10px 0 10px 18px;padding:0;">
              <li>Đăng nhập <a href="https://partner.tiktokshop.com" target="_blank" rel="noreferrer" style="color:#0284c7;font-weight:600;text-decoration:none;">TikTok Shop Partner Platform ↗</a></li>
              <li>Vào menu <b>App Management</b> → Chọn hoặc tạo App</li>
              <li>Sao chép <b>App Key</b> và <b>App Secret</b> dán vào 2 ô bên dưới</li>
              <li>Cài đặt <b>Redirect URL</b> và <b>Webhook URL</b> theo địa chỉ bên dưới</li>
            </ol>

            <!-- URLs to copy -->
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
              <div>
                <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:3px;">REDIRECT URL:</div>
                <div style="display:flex;align-items:center;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
                  <input type="text" readonly value="${redirectUrl}" style="flex:1;padding:6px 10px;font-size:12px;border:none;background:transparent;outline:none;font-family:monospace;" />
                  <button type="button" class="tt-copy-btn" data-copy="${redirectUrl}" style="padding:6px 12px;background:#f1f5f9;border:none;border-left:1px solid #cbd5e1;cursor:pointer;font-size:12px;font-weight:600;color:#0f172a;">Sao chép</button>
                </div>
              </div>

              <div>
                <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:3px;">WEBHOOK URL (Nhận tin nhắn):</div>
                <div style="display:flex;align-items:center;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
                  <input type="text" readonly value="${webhookUrl}" style="flex:1;padding:6px 10px;font-size:12px;border:none;background:transparent;outline:none;font-family:monospace;" />
                  <button type="button" class="tt-copy-btn" data-copy="${webhookUrl}" style="padding:6px 12px;background:#f1f5f9;border:none;border-left:1px solid #cbd5e1;cursor:pointer;font-size:12px;font-weight:600;color:#0f172a;">Sao chép</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Message Box -->
        <div id="tt-modal-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.4;"></div>

        <!-- Form Inputs -->
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;">
              App Key (Client Key) <span style="color:#ef4444;">*</span>
            </label>
            <input id="tt-input-key" type="text" placeholder="Nhập App Key (vd: 6i4hb1bjjehor)" value="${existingConfig.appKey || ''}" style="width:100%;box-sizing:border-box;padding:10px 14px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px;outline:none;font-family:monospace;transition:border-color 0.15s;" />
          </div>

          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;">
              App Secret <span style="color:#ef4444;">*</span>
            </label>
            <div style="position:relative;display:flex;align-items:center;">
              <input id="tt-input-secret" type="password" placeholder="${existingConfig.hasAppSecret ? '•••••••••••••••• (Đã lưu, nhập mới nếu muốn đổi)' : 'Nhập App Secret'}" style="width:100%;box-sizing:border-box;padding:10px 40px 10px 14px;border-radius:8px;border:1px solid #cbd5e1;font-size:14px;outline:none;font-family:monospace;transition:border-color 0.15s;" />
              <button id="tt-toggle-secret-visibility" type="button" style="position:absolute;right:10px;background:none;border:none;cursor:pointer;color:#64748b;font-size:16px;padding:4px;">👁️</button>
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">
              ${existingConfig.hasAppSecret ? 'Đã có App Secret lưu trong hệ thống. Nếu không thay đổi, bạn có thể để trống ô này.' : 'Khóa bí mật dùng để xác thực và ký webhook an toàn.'}
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;align-items:center;justify-content:flex-end;gap:10px;">
        <button id="tt-modal-cancel" type="button" style="padding:10px 18px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;font-size:13.5px;font-weight:600;color:#475569;cursor:pointer;">Hủy</button>
        <button id="tt-modal-submit" type="button" style="padding:10px 22px;border-radius:8px;border:none;background:#000000;color:#ffffff;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.15s;">
          <span>Lưu & Kết nối TikTok Shop</span>
          <span style="font-size:16px;">→</span>
        </button>
      </div>
    `;

    modalBackdrop.appendChild(modalBox);
    document.body.appendChild(modalBackdrop);

    // Event Handlers
    function closeModal() {
      if (modalBackdrop) {
        modalBackdrop.remove();
        modalBackdrop = null;
      }
    }

    document.getElementById('tt-modal-close').onclick = closeModal;
    document.getElementById('tt-modal-cancel').onclick = closeModal;
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) closeModal();
    };

    // Toggle guide
    const guideToggle = document.getElementById('tt-guide-toggle');
    const guideContent = document.getElementById('tt-guide-content');
    const guideArrow = document.getElementById('tt-guide-arrow');
    guideToggle.onclick = () => {
      const isHidden = guideContent.style.display === 'none';
      guideContent.style.display = isHidden ? 'block' : 'none';
      guideArrow.style.transform = isHidden ? 'rotate(180deg)' : 'none';
    };

    // Copy buttons
    modalBox.querySelectorAll('.tt-copy-btn').forEach((btn) => {
      btn.onclick = () => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Đã chép!';
          btn.style.color = '#16a34a';
          setTimeout(() => {
            btn.textContent = orig;
            btn.style.color = '#0f172a';
          }, 1500);
        });
      };
    });

    // Toggle secret visibility
    const secretInput = document.getElementById('tt-input-secret');
    const toggleSecretBtn = document.getElementById('tt-toggle-secret-visibility');
    toggleSecretBtn.onclick = () => {
      secretInput.type = secretInput.type === 'password' ? 'text' : 'password';
    };

    // Submit handler
    const submitBtn = document.getElementById('tt-modal-submit');
    const errorBox = document.getElementById('tt-modal-error');
    const keyInput = document.getElementById('tt-input-key');

    submitBtn.onclick = async () => {
      errorBox.style.display = 'none';
      const appKey = keyInput.value.trim();
      const appSecret = secretInput.value.trim();

      if (!appKey) {
        errorBox.textContent = 'Vui lòng nhập App Key của TikTok Shop.';
        errorBox.style.display = 'block';
        keyInput.focus();
        return;
      }

      if (!existingConfig.hasAppSecret && !appSecret) {
        errorBox.textContent = 'Vui lòng nhập App Secret của TikTok Shop.';
        errorBox.style.display = 'block';
        secretInput.focus();
        return;
      }

      // Start connection
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';
      submitBtn.innerHTML = `<span>Đang kết nối TikTok Shop...</span>`;

      try {
        const res = await fetch(`${API_BASE}/api/v1/tiktok-shop/connect/start`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            appKey,
            appSecret: appSecret || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.authUrl) {
          throw new Error(data.error || 'Không thể tạo liên kết xác thực TikTok Shop');
        }

        showToast('Đang chuyển hướng sang trang ủy quyền TikTok Shop...', 'info');
        // Redirect to TikTok Shop OAuth dialog
        setTimeout(() => {
          window.location.href = data.authUrl;
        }, 300);
      } catch (err) {
        errorBox.textContent = err.message || 'Lỗi kết nối TikTok Shop';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.innerHTML = `<span>Lưu & Kết nối TikTok Shop</span> <span style="font-size:16px;">→</span>`;
      }
    };
  }

  // Inject "+ TikTok Shop" into the dropdown menu
  function injectDropdownItem() {
    const dropdownMenu = document.querySelector('.add-account-dropdown__menu');
    if (!dropdownMenu) return;

    if (document.getElementById('tiktok-shop-add-item')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tiktok-shop-add-item';
    btn.className = 'add-account-dropdown__item';
    btn.style.cssText = 'transition: background 0.15s ease;';

    btn.innerHTML = `
      <div class="add-account-dropdown__item-icon" style="background:#000000;color:#ffffff;display:flex;align-items:center;justify-content:center;border-radius:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/>
        </svg>
      </div>
      <div class="add-account-dropdown__item-text">
        <span class="add-account-dropdown__item-label" style="display:flex;align-items:center;gap:6px;">
          TikTok Shop
          <span style="font-size:10px;font-weight:700;color:#000;background:#25F4EE;padding:1px 6px;border-radius:4px;letter-spacing:0.3px;">OFFICIAL</span>
        </span>
        <span class="add-account-dropdown__item-desc">Kết nối qua App Key & App Secret</span>
      </div>
    `;

    btn.onclick = (e) => {
      e.stopPropagation();
      // Close dropdown if possible by simulating click or setting state
      const dropdownWrap = document.querySelector('.add-account-dropdown');
      if (dropdownWrap) {
        const toggleBtn = dropdownWrap.querySelector('button');
        if (toggleBtn) toggleBtn.click();
      }
      openTikTokModal();
    };

    dropdownMenu.appendChild(btn);
  }

  // Monitor DOM mutations to automatically inject item when user clicks "+ Thêm tài khoản"
  const observer = new MutationObserver(() => {
    injectDropdownItem();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Expose global methods
  window.openTikTokShopModal = openTikTokModal;

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkUrlCallbacks();
      injectDropdownItem();
    });
  } else {
    checkUrlCallbacks();
    injectDropdownItem();
  }

  // Keyframes for animations
  if (!document.getElementById('tiktok-bridge-styles')) {
    const style = document.createElement('style');
    style.id = 'tiktok-bridge-styles';
    style.textContent = `
      @keyframes ttModalIn {
        from { opacity: 0; transform: scale(0.96) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes ttToastIn {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .add-account-dropdown__item:hover #tiktok-shop-add-item {
        background: #f1f5f9;
      }
    `;
    document.head.appendChild(style);
  }
})();
