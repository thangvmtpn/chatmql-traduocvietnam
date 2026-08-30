// Hành vi DEMO tách nguyên trạng từ bản mẫu: điều hướng, tab, tính tiền form đơn.
// Các đợt sau sẽ thay dần từng phần bằng dữ liệu API thật; phần chưa thay vẫn
// chạy như mẫu để app luôn bấm được đủ màn hình.
// ================== ĐIỀU HƯỚNG MÀN ==================
  var navStack = [];
  function navOpen(id){
    document.getElementById(id).classList.add('view--open');
    navStack.push(id);
  }
  function navBack(){
    var id = navStack.pop();
    if (id) document.getElementById(id).classList.remove('view--open');
  }
  document.querySelectorAll('[data-nav-back]').forEach(function(b){ b.addEventListener('click', navBack); });

  // ================== ĐIỀU HƯỚNG CẤP 1: bottom tab bar (Tổng quan / Hội thoại / Cài đặt) ==================
  function homeSwitch(key){
    document.querySelectorAll('.home-panel').forEach(function(p){
      p.classList.toggle('home-panel--active', p.id === 'home-' + key);
    });
    document.querySelectorAll('.bottomnav__item').forEach(function(t){
      t.classList.toggle('bottomnav__item--active', t.dataset.home === key);
    });
  }
  document.querySelectorAll('.bottomnav__item').forEach(function(btn){
    btn.addEventListener('click', function(){ if (btn.dataset.home) homeSwitch(btn.dataset.home); });
  });
  // ---- Dashboard Tổng quan: biểu đồ tin nhắn, pipeline, hoạt động ----
  // Bar chart tin nhắn theo ngày (7 ngày) — cặp Đã gửi / Đã nhận
  var BAR_DAYS = [
    {d:'T2', sent:520, recv:470}, {d:'T3', sent:610, recv:560}, {d:'T4', sent:480, recv:430},
    {d:'T5', sent:700, recv:640}, {d:'T6', sent:590, recv:520}, {d:'T7', sent:430, recv:390},
    {d:'CN', sent:303, recv:280}
  ];
  var barMax = 0;
  BAR_DAYS.forEach(function(x){ barMax = Math.max(barMax, x.sent, x.recv); });
  document.getElementById('barChart').innerHTML = BAR_DAYS.map(function(x){
    return '<div class="bar-col"><div class="bar-col__bars">' +
      '<div class="bar-col__bar" style="height:' + Math.round(x.sent / barMax * 100) + '%; background:#3b82f6;"></div>' +
      '<div class="bar-col__bar" style="height:' + Math.round(x.recv / barMax * 100) + '%; background:#93c5fd;"></div>' +
      '</div><div class="bar-col__label">' + x.d + '</div></div>';
  }).join('');

  // Pipeline khách hàng
  var PIPELINE = [
    {name:'Khách hàng', color:'#16a34a', value:4},
    {name:'mql', color:'#94a3b8', value:1},
    {name:'Cơ hội', color:'#ea580c', value:2},
    {name:'Lead', color:'#f59e0b', value:7},
    {name:'Đủ điều kiện', color:'#9333ea', value:2},
    {name:'Đăng ký', color:'#2563eb', value:13335}
  ];
  var plMax = Math.max.apply(null, PIPELINE.map(function(p){ return p.value; }));
  document.getElementById('pipeline').innerHTML = PIPELINE.map(function(p){
    return '<div class="pl-bar">' +
      '<span class="pl-bar__label"><span class="pl-bar__dot" style="background:' + p.color + ';"></span>' + p.name + '</span>' +
      '<span class="pl-bar__track"><span class="pl-bar__fill" style="width:' + (p.value / plMax * 100) + '%; background:' + p.color + ';"></span></span>' +
      '<span class="pl-bar__value">' + p.value.toLocaleString('vi-VN') + '</span></div>';
  }).join('');

  // Hoạt động gần đây
  var ACTIVITY = ['Aaa','Chu Đức Tuấn','Lân Ngãi','Nguyen Van Toj','Đào Văn Hưng','Thành Thu','Trần Sang','Do Quang','Le Quoc Viet','Nguyễn Văn Phòng'];
  function initials(name){
    var p = name.trim().split(/\s+/);
    return (p.length > 1 ? p[0].charAt(0) + p[p.length - 1].charAt(0) : p[0].charAt(0)).toUpperCase();
  }
  document.getElementById('activityFeed').innerHTML = ACTIVITY.map(function(n){
    return '<div class="act-item"><div class="act-item__avatar">' + esc(initials(n)) + '</div>' +
      '<div class="act-item__text"><b>' + esc(n) + '</b> chuyển sang "subscriber"</div>' +
      '<span class="act-item__time">1 phút trước</span></div>';
  }).join('');

  // ================== DANH SÁCH HỘI THOẠI ==================
  var SRC_VD = 'Vận Đơn Trà Dược Việt Nam - 0325173345';
  var SRC_LH = 'Lộc Hạnh Trà Dược Việt Nam';
  var CONVS = [
    {init:'KV', color:'#ec4899', name:'Kd Vanhoa 0348302234', time:'5h', cake:'Ks Văn Hóa', src:SRC_VD},
    {init:'T-', color:'#ec4899', name:'TDVN - JT CARE ĐƠN HÀNG', time:'1d', text:'@Thủy Anna check hành trình đơn này giúp chị với. 802802916652 Đã đến bưu cục phát chưa?', src:SRC_VD},
    {init:'NT', color:'#9333ea', name:'Ngọc Thảo Trà Dược Việt Nam', time:'1d', cake:'Ngọc Thảo Trà Dược Việt Nam', src:SRC_VD, unread:2},
    {init:'T-', color:'#16a34a', name:'TDVN - VIETTEL POST CARE ĐƠN HÀNG', time:'3d', img:true, src:SRC_VD, unread:4},
    {init:'H',  color:'#ef4444', name:'Hb', time:'5d', text:'mùng 1 đầu tháng chúc CH buôn may bán đắt /-rose', src:SRC_LH},
    {init:'PK', color:'#ec4899', name:'Phòng KDPTTT tháng 72026', time:'5d', text:'@Tuấn Anh Đỗ Ok em. chị nhận thông tin liên hệ trao đổi lại với khách.', src:SRC_LH},
    {init:'LH', color:'#0ea5e9', name:'Lộc Hạnh Trà Dược Việt Nam', time:'5d', img:true, src:SRC_LH},
    {init:'MS', color:'#9333ea', name:'Mộc Sơn', time:'5d', img:true, src:SRC_LH, unread:1},
    {init:'NP', color:'#8b5cf6', name:'Nam Phong 0983281986', time:'5d', img:true, src:SRC_LH},
    {init:'NN', color:'#16a34a', name:'Nam Nguyen', time:'5d', img:true, src:SRC_LH},
    {init:'NH', color:'#f59e0b', name:'Nam Hoai', time:'5d', img:true, src:SRC_LH},
    {init:'NC', color:'#16a34a', name:'Nam Cuong 0911127166', time:'5d', img:true, src:SRC_LH},
    {init:'AT', color:'#3b82f6', name:'Anh Trường Hưng Yên 0786363363', time:'5d', img:true, src:SRC_LH},
    {init:'ML', color:'#0ea5e9', name:'Mỹ Linh 0933305238', time:'5d', img:true, src:SRC_LH}
  ];
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function preview(c){
    if (c.cake) return '<span style="color:#f97316;">🎂 Sinh nhật: ' + esc(c.cake) + '</span>';
    if (c.img)  return '<span style="color:#3b82f6;">📷 Hình ảnh</span>';
    return esc(c.text || '');
  }
  document.getElementById('convList').innerHTML = CONVS.map(function(c, i){
    return '<div class="conv-item" data-i="' + i + '">' +
      '<div class="conv-item__avatar" style="background:' + c.color + ';">' + esc(c.init) + '</div>' +
      '<div class="conv-item__body">' +
        '<div class="conv-item__top"><span class="conv-item__name">' + esc(c.name) + '</span><span class="conv-item__time">' + c.time + '</span></div>' +
        '<div class="conv-item__preview">' + preview(c) + '</div>' +
        '<div class="conv-item__source"><span class="zalo-ic">Z</span><span>' + esc(c.src) + '</span></div>' +
      '</div>' +
      (c.unread ? '<span class="conv-item__unread">' + c.unread + '</span>' : '') +
    '</div>';
  }).join('');
  // Chạm hội thoại → mở màn chat (mock: nội dung chat theo Kd Vanhoa)
  document.getElementById('convList').addEventListener('click', function(e){
    if (e.target.closest('.conv-item')) navOpen('view-chat');
  });

  // ================== KHÁCH HÀNG — màn CRM Liên hệ ==================
  var STAGE = {
    subscriber:{name:'Đăng ký', color:'#2563eb'}, lead:{name:'Lead', color:'#f59e0b'},
    qualified:{name:'Đủ điều kiện', color:'#9333ea'}, opportunity:{name:'Cơ hội', color:'#ea580c'},
    customer:{name:'Khách hàng', color:'#16a34a'}, evangelist:{name:'VIP/Đại sứ', color:'#0891b2'},
    churned:{name:'Rời bỏ', color:'#ef4444'}
  };
  var CUSTOMERS = [
    {init:'AT', color:'#3b82f6', name:'Anh Trường Hưng Yên', phone:'0786363363', stage:'lead', source:'Zalo', sale:'Lộc Thị Hạnh', score:35},
    {init:'H',  color:'#ef4444', name:'Hb', phone:'0912456789', stage:'subscriber', source:'Zalo', sale:'Ngọc Thảo', score:0},
    {init:'KV', color:'#ec4899', name:'Kd Vanhoa', phone:'0348302234', stage:'subscriber', source:'Zalo', sale:'Lộc Thị Hạnh', score:0},
    {init:'LH', color:'#0ea5e9', name:'Lộc Hạnh TDVN', phone:'0325173345', stage:'customer', source:'Zalo OA', sale:'Lộc Thị Hạnh', score:120},
    {init:'ML', color:'#0ea5e9', name:'Mỹ Linh', phone:'0933305238', stage:'opportunity', source:'Facebook', sale:'Tuấn Anh Đỗ', score:68},
    {init:'MS', color:'#9333ea', name:'Mộc Sơn', phone:'0977123456', stage:'qualified', source:'Website', sale:'Ngọc Thảo', score:52},
    {init:'NC', color:'#16a34a', name:'Nam Cuong', phone:'0911127166', stage:'customer', source:'Zalo', sale:'Lộc Thị Hạnh', score:210},
    {init:'NP', color:'#8b5cf6', name:'Nam Phong', phone:'0983281986', stage:'lead', source:'Zalo', sale:'Tuấn Anh Đỗ', score:40},
    {init:'NT', color:'#9333ea', name:'Ngọc Thảo TDVN', phone:'0325173345', stage:'evangelist', source:'Zalo OA', sale:'Lộc Thị Hạnh', score:520}
  ];
  document.getElementById('custCount').textContent = CUSTOMERS.length + ' liên hệ';
  var callSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>';
  var chatSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>';
  document.getElementById('custList').innerHTML = CUSTOMERS.map(function(c){
    var s = STAGE[c.stage];
    return '<div class="crm-card">' +
      '<div class="crm-card__top" data-open-chat>' +
        '<div class="crm-card__avatar" style="background:' + c.color + ';">' + esc(c.init) + '</div>' +
        '<div class="crm-card__body"><div class="crm-card__name">' + esc(c.name) + '</div>' +
        '<div class="crm-card__phone">' + c.phone + '</div></div>' +
        '<span class="crm-stage" style="background:' + s.color + '18; color:' + s.color + ';">' +
          '<span class="crm-stage__dot" style="background:' + s.color + ';"></span>' + s.name + '</span>' +
      '</div>' +
      '<div class="crm-card__meta">' +
        '<span class="crm-tag">🌐 ' + esc(c.source) + '</span>' +
        '<span class="crm-tag">👤 ' + esc(c.sale) + '</span>' +
        '<span class="crm-tag">⭐ ' + c.score + ' điểm</span>' +
      '</div>' +
      '<div class="crm-card__actions">' +
        '<button class="crm-card__btn" data-call onclick="event.stopPropagation()">' + callSvg + ' Gọi</button>' +
        '<button class="crm-card__btn crm-card__btn--primary" data-open-chat>' + chatSvg + ' Nhắn tin</button>' +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('custList').addEventListener('click', function(e){
    if (e.target.closest('[data-call]')) return;
    if (e.target.closest('[data-open-chat]')) navOpen('view-chat');
  });
  // Thêm KH → bottom sheet
  var addCustSheet = document.getElementById('addCustSheet');
  document.getElementById('btnAddCust').addEventListener('click', function(){ addCustSheet.classList.add('open'); });
  function closeAddCust(){ addCustSheet.classList.remove('open'); }
  document.getElementById('addCustClose').addEventListener('click', closeAddCust);
  document.getElementById('addCustCancel').addEventListener('click', closeAddCust);
  addCustSheet.addEventListener('click', function(e){ if (e.target === addCustSheet) closeAddCust(); });
  document.getElementById('addCustSubmit').addEventListener('click', function(){
    closeAddCust();
    alert('Giao diện mẫu — chưa nối API, liên hệ chưa được lưu thật.');
  });

  // ================== CHAT ==================
  function nowTime(){
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  var TICKS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>';
  function chatScrollBottom(){
    var m = document.getElementById('chatMessages');
    m.scrollTop = m.scrollHeight;
  }
  // Gửi tin nhắn văn bản
  function sendText(){
    var inp = document.getElementById('chatInput');
    var t = inp.value.trim();
    if (!t) return;
    var w = document.createElement('div');
    w.className = 'msg-wrapper';
    w.innerHTML = '<div class="msg msg--sent"><div class="msg__avatar" style="background:#16a34a;">VĐ</div>' +
      '<div><div class="msg__bubble"></div><div class="msg__time">' + nowTime() + TICKS + '</div></div></div>';
    w.querySelector('.msg__bubble').textContent = t;
    document.getElementById('chatMessages').appendChild(w);
    inp.value = ''; inp.style.height = '';
    chatScrollBottom();
  }
  document.getElementById('btnSend').addEventListener('click', sendText);
  document.getElementById('chatInput').addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendText(); }
  });
  document.getElementById('chatInput').addEventListener('input', function(){
    this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 96) + 'px';
  });

  // Mở hồ sơ khách / thư viện / menu xóa
  function openDetailTab(tab){
    if (!document.getElementById('view-detail').classList.contains('view--open')) navOpen('view-detail');
    document.querySelector('.detail-tab[data-tab="' + tab + '"]').click();
  }
  document.getElementById('btnOpenDetail').addEventListener('click', function(){ navOpen('view-detail'); });
  document.getElementById('btnChatLibrary').addEventListener('click', function(){ navOpen('view-library'); });
  // Nút thao tác nhanh trên ô nhập — menu hồ sơ đưa ra ngoài cho tiện thao tác
  document.getElementById('btnQuickOrder').addEventListener('click', function(){ openDetailTab('order'); });
  document.getElementById('btnQuickSales').addEventListener('click', function(){ openDetailTab('sales'); });
  document.getElementById('btnQuickInfo').addEventListener('click', function(){ openDetailTab('info'); });
  document.getElementById('btnQuickNotes').addEventListener('click', function(){ openDetailTab('notes'); });
  document.getElementById('btnChatMore').addEventListener('click', function(e){
    e.stopPropagation();
    var m = document.getElementById('chatMoreMenu');
    m.hidden = !m.hidden;
  });
  document.addEventListener('click', function(e){
    var m = document.getElementById('chatMoreMenu');
    if (!m.hidden && !e.target.closest('#btnChatMore') && !e.target.closest('#chatMoreMenu')) m.hidden = true;
  });
  // Chọn chế độ AI trả lời (trong menu ⋯)
  document.querySelectorAll('.cmm-ai').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.cmm-ai').forEach(function(b){ b.classList.remove('cmm-ai--active'); });
      btn.classList.add('cmm-ai--active');
      document.getElementById('chatMoreMenu').hidden = true;
    });
  });
  document.getElementById('btnDeleteConv').addEventListener('click', function(){
    document.getElementById('chatMoreMenu').hidden = true;
    if (confirm('Xóa toàn bộ hội thoại với "Kd Vanhoa 0348302234"?\nHành động này không thể hoàn tác.')){
      alert('Giao diện mẫu — chưa nối API, hội thoại chưa bị xóa thật.');
    }
  });

  // ================== HỒ SƠ KHÁCH: 4 TAB ==================
  document.querySelectorAll('.detail-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.detail-tab').forEach(function(t){ t.classList.remove('detail-tab--active'); });
      document.querySelectorAll('.detail-panel').forEach(function(p){ p.classList.remove('detail-panel--active'); });
      tab.classList.add('detail-tab--active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('detail-panel--active');
      document.getElementById('detailBody').scrollTop = 0;
    });
  });
  document.getElementById('btnGoOrder').addEventListener('click', function(){
    document.querySelector('.detail-tab[data-tab="order"]').click();
  });
  document.getElementById('btnViewHistory').addEventListener('click', function(){ navOpen('view-history'); });

  // ================== KHO LƯU TRỮ ==================
  document.querySelectorAll('.lib__tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.lib__tab').forEach(function(t){ t.classList.remove('lib__tab--active'); });
      document.querySelectorAll('.lib__panel').forEach(function(p){ p.classList.remove('lib__panel--active'); });
      tab.classList.add('lib__tab--active');
      document.getElementById('lib-' + tab.dataset.lib).classList.add('lib__panel--active');
    });
  });

  // ================== TÀI LIỆU BÁN HÀNG ==================
  document.querySelectorAll('.sd__tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.sd__tab').forEach(function(t){ t.classList.remove('sd__tab--active'); });
      document.querySelectorAll('.sd__panel').forEach(function(p){ p.classList.remove('sd__panel--active'); });
      tab.classList.add('sd__tab--active');
      document.getElementById('sd-' + tab.dataset.sd).classList.add('sd__panel--active');
    });
  });
  function sdFilter(panelId, q){
    q = q.trim().toLowerCase();
    var panel = document.getElementById(panelId);
    var found = false;
    if (panelId === 'sd-content'){
      panel.querySelectorAll('.sd-content').forEach(function(card){
        var show = !q || card.textContent.toLowerCase().indexOf(q) > -1;
        card.style.display = show ? '' : 'none'; found = found || show;
      });
    } else {
      panel.querySelectorAll('.sd__group').forEach(function(g){
        var grid = g.nextElementSibling, any = false;
        grid.querySelectorAll('.sd-tile').forEach(function(t){
          var inp = t.querySelector('input');
          var hay = ((inp.dataset.name || '') + ' ' + (inp.dataset.code || '')).toLowerCase();
          var show = !q || hay.indexOf(q) > -1;
          t.style.display = show ? '' : 'none'; any = any || show;
        });
        g.style.display = any ? '' : 'none'; grid.style.display = any ? '' : 'none';
        found = found || any;
      });
    }
    var empty = panel.querySelector('.sd__empty');
    if (empty) empty.hidden = found;
  }
  document.querySelectorAll('.sd__search input').forEach(function(inp){
    inp.addEventListener('input', function(){ sdFilter(inp.closest('.sd__panel').id, inp.value); });
  });
  function sdUpdateCount(pid){
    var n = document.querySelectorAll('#' + pid + ' .sd-tile input:checked').length;
    var btn = document.querySelector('.sd__send-btn[data-send="' + pid + '"]');
    btn.disabled = n === 0;
    btn.textContent = '📤 Gửi vào chat (' + n + ')';
  }
  ['sd-images', 'sd-video'].forEach(function(pid){
    document.getElementById(pid).addEventListener('change', function(e){
      if (e.target.matches('.sd-tile input')) sdUpdateCount(pid);
    });
  });
  document.querySelectorAll('.sd__send-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var pid = btn.dataset.send, isVideo = pid === 'sd-video';
      var checked = document.querySelectorAll('#' + pid + ' .sd-tile input:checked');
      if (!checked.length) return;
      checked.forEach(function(chk){
        var w = document.createElement('div');
        w.className = 'msg-wrapper';
        w.innerHTML = '<div class="msg msg--sent"><div class="msg__avatar" style="background:#16a34a;">VĐ</div>' +
          '<div><div class="msg__image" style="max-width:190px; padding:14px 10px;">' +
          '<div style="font-size:32px;">' + chk.dataset.emoji_ + '</div>' +
          '<div style="font-size:12px; font-weight:600; color:var(--gray-700); margin-top:4px;"></div></div>' +
          '<div class="msg__time">' + nowTime() + TICKS + '</div></div></div>';
        var emoji = chk.closest('.sd-tile').querySelector('.sd-tile__emoji').textContent;
        w.querySelector('.msg__image div:first-child').textContent = emoji + (isVideo ? ' ▶' : '');
        w.querySelector('.msg__image div:last-child').textContent = (isVideo ? 'Video: ' : '') + chk.dataset.name;
        document.getElementById('chatMessages').appendChild(w);
        chk.checked = false;
      });
      sdUpdateCount(pid);
      // Quay về màn chat để thấy tài liệu vừa gửi
      while (navStack.length) navBack();
      navOpen('view-chat');
      chatScrollBottom();
    });
  });
  document.querySelectorAll('.sd-content__copy').forEach(function(btn){
    btn.addEventListener('click', function(){
      var text = btn.closest('.sd-content').querySelector('.sd-content__text').textContent;
      var done = function(){
        btn.classList.add('sd-content__copy--done'); btn.textContent = '✓ Đã copy';
        setTimeout(function(){ btn.classList.remove('sd-content__copy--done'); btn.textContent = '📋 Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    });
  });

  // ================== AI PHÂN TÍCH ==================
  var AI_LAST_TIME = null;
  var AI_NOTE_TEXT =
    '👤 Chân dung: Khách mới từ Zalo cá nhân (kênh Vận Đơn TDVN), pipeline Đăng ký, Lead 0/100. Hôm nay là sinh nhật khách (18/08).\n' +
    '💬 Hội thoại: Shop gửi 1 ảnh (13/06), hệ thống gửi thiệp sinh nhật hôm nay — khách chưa phản hồi.\n' +
    '🎯 Cơ hội: Dùng dịp sinh nhật mở lại hội thoại, tiềm năng chuyển Đăng ký → Lead.\n' +
    '✅ Đề xuất: 1) Chúc sinh nhật cá nhân hoá; 2) Tặng mã ưu đãi sinh nhật hạn 7 ngày; 3) Giới thiệu Trà Đinh Ngọc 100g khi khách phản hồi.';
  document.getElementById('btnAiAnalyze').addEventListener('click', function(){
    document.getElementById('aiModalBg').classList.add('open');
    document.getElementById('aiLoading').hidden = false;
    document.getElementById('aiResult').hidden = true;
    document.getElementById('btnAiToNote').disabled = true;
    setTimeout(function(){
      var d = new Date();
      AI_LAST_TIME = ('0'+d.getDate()).slice(-2) + '/' + ('0'+(d.getMonth()+1)).slice(-2) + '/' + d.getFullYear() + ' · ' + nowTime();
      document.getElementById('aiTime').textContent = 'Lượt phân tích gần nhất: ' + AI_LAST_TIME;
      document.getElementById('aiLoading').hidden = true;
      document.getElementById('aiResult').hidden = false;
      document.getElementById('btnAiToNote').disabled = false;
    }, 900);
  });
  function aiClose(){ document.getElementById('aiModalBg').classList.remove('open'); }
  document.getElementById('aiModalClose').addEventListener('click', aiClose);
  document.getElementById('aiModalClose2').addEventListener('click', aiClose);
  document.getElementById('aiModalBg').addEventListener('click', function(e){ if (e.target === this) aiClose(); });
  document.getElementById('btnAiToNote').addEventListener('click', function(){
    var item = document.createElement('div');
    item.className = 'note-item note-item--ai';
    item.innerHTML = '<div class="note-item__head"><span class="note-item__tag">🤖 AI phân tích</span>' +
      '<span class="note-item__time">' + AI_LAST_TIME + '</span></div><div class="note-item__body"></div>';
    item.querySelector('.note-item__body').textContent = AI_NOTE_TEXT;
    var list = document.getElementById('notesList');
    list.insertBefore(item, list.firstChild);
    document.getElementById('notesEmpty').hidden = true;
    aiClose();
    document.querySelector('.detail-tab[data-tab="notes"]').click();
  });

  // ================== TẠO ĐƠN — logic theo CRM/tao-don.html ==================
  var opParseNum = function(v){ return Number(String(v || '').replace(/[^\d]/g, '')) || 0; };
  var opFmt = function(n){ return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(n))); };
  var opMoney = function(n){ return opFmt(n) + 'đ'; };
  var OP_LA_RATE = 1000;
  var opTransfer = 0, opPoints = 0, opSubtotal = 587000;
  var OF_SELF_MODES = [
    {name:'CHỜ VẬN ĐƠN', fee:20000},
    {name:'Nhân viên công ty đi giao', fee:20000},
    {name:'Gửi xe khách', fee:30000},
    {name:'Gửi xe buýt', fee:30000}
  ];
  var OF_CARRIERS_HTML = document.getElementById('ofShipUnit').innerHTML;
  function ofShipFee(){ return opParseNum(document.getElementById('ofShipCost').value); }
  function ofOrderTotal(){
    var disc = Math.min(100, opParseNum(document.getElementById('ofDiscount').value));
    return Math.max(opSubtotal - Math.round(opSubtotal * disc / 100) - opPoints * OP_LA_RATE, 0) + ofShipFee();
  }
  function ofRenderPayment(){
    var total = ofOrderTotal();
    var due = Math.max(total - opTransfer, 0);
    document.getElementById('ofPayShip').textContent = opMoney(ofShipFee());
    document.getElementById('ofPayTotal').textContent = opFmt(total);
    document.getElementById('ofLaMoney').textContent = opPoints > 0 ? '−' + opMoney(opPoints * OP_LA_RATE) : '0đ';
    document.getElementById('ofDeposit').textContent = opMoney(Math.min(opTransfer, total));
    document.getElementById('ofPayCod').textContent = opMoney(due);
    var s = document.getElementById('ofPayStatus');
    s.className = 'of__pay-badge';
    if (opTransfer <= 0){ s.textContent = 'Chưa thanh toán'; }
    else if (opTransfer < total){ s.textContent = 'Đặt cọc một phần'; s.classList.add('of__pay-badge--orange'); }
    else if (opTransfer === total){ s.textContent = '✓ Đã thanh toán đủ'; s.classList.add('of__pay-badge--green'); }
    else { s.textContent = '⚠ Đặt cọc vượt tổng đơn'; s.classList.add('of__pay-badge--red'); }
  }
  function ofRecalcProducts(){
    var subtotal = 0, qtySum = 0, klSum = 0;
    var items = document.querySelectorAll('#ofProdList .op-item');
    items.forEach(function(it){
      var q = Math.max(1, opParseNum(it.querySelector('.op-qty input').value) || 1);
      var gia = Number(it.dataset.gia) || 0, kl = Number(it.dataset.kl) || 0, ton = Number(it.dataset.ton) || 0;
      it.querySelector('.op-item__sum').textContent = opFmt(gia * q);
      it.querySelector('.op-item__kl').textContent = (kl * q) + 'g';
      it.classList.toggle('op-item--over', ton > 0 && q > ton);
      subtotal += gia * q; qtySum += q; klSum += kl * q;
    });
    document.getElementById('ofProdEmpty').hidden = items.length > 0;
    var totalRow = document.getElementById('ofProdTotal');
    totalRow.hidden = items.length === 0;
    totalRow.innerHTML = '<span>Tổng: ' + qtySum + ' SP · ' + klSum + 'g</span><b>' + opMoney(subtotal) + '</b>';
    var w = document.getElementById('ofShipWeight');
    if (w && !w.dataset.manual) w.value = klSum;
    opSubtotal = Math.round(subtotal);
    ofRenderPayment();
  }
  document.getElementById('ofShipWeight').addEventListener('input', function(){ this.dataset.manual = 1; });
  document.getElementById('ofProdList').addEventListener('click', function(e){
    var btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('op-item__del')){ btn.closest('.op-item').remove(); ofRecalcProducts(); }
    else if (btn.dataset.d){
      var input = btn.parentElement.querySelector('input');
      input.value = Math.max(1, (parseInt(input.value || '1', 10) || 1) + Number(btn.dataset.d));
      ofRecalcProducts();
    }
  });
  document.getElementById('ofProdList').addEventListener('input', function(e){
    if (e.target.matches('.op-qty input')) ofRecalcProducts();
  });
  document.getElementById('ofProdList').addEventListener('change', function(e){
    if (e.target.matches('.op-qty input')){
      e.target.value = Math.max(1, parseInt(e.target.value || '1', 10) || 1);
      ofRecalcProducts();
    }
  });
  document.getElementById('ofDiscount').addEventListener('input', function(){
    var v = this.value.replace(/[^\d]/g, '');
    if (Number(v) > 100) v = '100';
    this.value = v; ofRenderPayment();
  });
  document.getElementById('ofPoints').addEventListener('input', function(){
    opPoints = opParseNum(this.value); this.value = opFmt(opPoints); ofRenderPayment();
  });
  document.getElementById('ofTransfer').addEventListener('input', function(){
    opTransfer = opParseNum(this.value); this.value = opFmt(opTransfer); ofRenderPayment();
  });
  function ofSyncShipSelection(){
    var sel = document.getElementById('ofShipUnit');
    var o = sel.options[sel.selectedIndex];
    document.getElementById('ofShipCost').value = opFmt(Number(o.dataset.fee) || 0);
    document.getElementById('ofShipBrand').textContent = o.text.split(' - ')[0].toUpperCase();
    if (o.dataset.info) document.getElementById('ofShipInfo').innerHTML = 'ⓘ <b>Thông tin:</b> ' + o.dataset.info;
    ofRenderPayment();
  }
  document.getElementById('ofShipUnit').addEventListener('change', ofSyncShipSelection);
  document.getElementById('ofSelfShip').addEventListener('change', function(){
    var sel = document.getElementById('ofShipUnit');
    var cost = document.getElementById('ofShipCost');
    if (this.checked){
      sel.innerHTML = OF_SELF_MODES.map(function(m, i){
        return '<option data-fee="' + m.fee + '"' + (i === 0 ? ' selected' : '') + '>' + m.name + '</option>';
      }).join('');
      document.getElementById('ofShipCostLabel').textContent = 'Chi phí Tự giao';
      cost.disabled = false;
      document.getElementById('ofShipInfo').style.display = 'none';
    } else {
      sel.innerHTML = OF_CARRIERS_HTML;
      document.getElementById('ofShipCostLabel').textContent = 'Chi phí vận chuyển';
      cost.disabled = true;
      document.getElementById('ofShipInfo').style.display = '';
    }
    ofSyncShipSelection();
  });
  document.getElementById('ofShipCost').addEventListener('input', function(){
    this.value = opFmt(opParseNum(this.value)); ofRenderPayment();
  });
  // Đơn đổi trả: hiện ghi chú + tự thêm vào ô Ghi chú đơn hàng
  var RETURN_NOTE_TEXT = 'Đơn đổi trả: Thu hàng cũ đổi đơn mới & thu COD chênh lệch';
  document.getElementById('ofReturnCheck').addEventListener('change', function(){
    var banner = document.getElementById('ofReturnNote');
    var note = document.getElementById('ofOrderNote');
    if (this.checked){
      banner.classList.add('of__return-note--show');
      if (note.value.indexOf(RETURN_NOTE_TEXT) === -1){
        note.value = note.value ? note.value.replace(/\s+$/, '') + '\n' + RETURN_NOTE_TEXT : RETURN_NOTE_TEXT;
      }
    } else {
      banner.classList.remove('of__return-note--show');
      note.value = note.value.split('\n').filter(function(l){ return l.trim() !== RETURN_NOTE_TEXT; }).join('\n').replace(/^\n+|\n+$/g, '');
    }
  });
  document.getElementById('ofSubmit').addEventListener('click', function(){
    if (!document.querySelector('#ofProdList .op-item:not([data-gia="0"])')){
      alert('Chưa có sản phẩm nào trong đơn — thêm sản phẩm trước khi tạo đơn.');
      return;
    }
    var total = ofOrderTotal();
    var due = Math.max(total - opTransfer, 0);
    alert('Giao diện mẫu — chưa nối API, đơn CHƯA được lưu.\nDữ liệu sẽ gửi đi khi nối API:\n\n' +
      'Tổng đơn: ' + opMoney(total) + '\n' +
      'Tiêu Lá: ' + opPoints + ' Lá (−' + opMoney(opPoints * OP_LA_RATE) + ')\n' +
      'Đặt cọc CK: ' + opMoney(opTransfer) + '\n' +
      'COD còn thu: ' + opMoney(due));
  });
  ofRecalcProducts();