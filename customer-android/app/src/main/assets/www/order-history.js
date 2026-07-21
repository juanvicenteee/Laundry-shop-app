(() => {
  if (window.__bubblyfiPhoneOrdersV1619) return;
  window.__bubblyfiPhoneOrdersV1619 = true;

  const PHONE_KEY = 'bubblyfi_customer_phone_v1';
  const SUPABASE_URL = 'https://amjhrejmcnthlrqddznw.supabase.co';
  const SUPABASE_KEY = ['sb','publishable','5KkgIxPlTNAZjqgRX9Yh3A','tqLD2hNE'].join('_');
  const native = (name, fallback = '') => {
    try {
      const value = window.AndroidBridge?.[name]?.();
      return value == null ? fallback : String(value);
    } catch (_) {
      return fallback;
    }
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const parseJson = (value, fallback) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };
  const phoneValid = (value) => String(value || '').replace(/\D/g, '').length >= 10;
  const dateText = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(date);
  };
  const money = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0
      ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(number)
      : '—';
  };
  const statusClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (value.includes('cancel') || value.includes('reject')) return 'danger';
    if (value.includes('complete') || value.includes('claimed') || value.includes('delivered')) return 'done';
    if (value.includes('ready')) return 'ready';
    if (value.includes('rider') || value.includes('near') || value.includes('way') || value.includes('delivery')) return 'rider';
    return 'active';
  };

  const style = document.createElement('style');
  style.textContent = `
    #bf-phone-orders-button{position:fixed;left:12px;bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:2147483000;border:0;border-radius:999px;background:#087286;color:#fff;min-height:50px;padding:13px 18px;font:800 14px system-ui;box-shadow:0 8px 25px rgba(0,0,0,.34);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 96px)}
    #bf-phone-orders-overlay{position:fixed;inset:0;z-index:2147483200;background:rgba(1,28,35,.66);display:none;align-items:flex-end;padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
    #bf-phone-orders-overlay.open{display:flex}
    #bf-phone-orders-sheet{width:100%;height:min(84dvh,860px);background:#f3fafb;border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden}
    #bf-phone-orders-header{background:#fff;border-bottom:1px solid #d6e7ea;padding:16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
    #bf-phone-orders-header h2{margin:0;color:#075365;font:800 22px system-ui}#bf-phone-orders-header p{margin:3px 0 0;color:#64787d;font:13px system-ui}
    #bf-phone-orders-actions{display:flex;gap:7px}.bf-phone-orders-action{border:1px solid #c5dde2;background:#fff;color:#075f70;border-radius:11px;padding:9px 10px;font:800 12px system-ui}
    #bf-phone-orders-connection{padding:9px 15px;background:#e6f4f6;color:#285e68;font:700 12px system-ui;border-bottom:1px solid #d2e7ea}
    #bf-phone-orders-body{flex:1;overflow:auto;padding:14px 14px calc(28px + env(safe-area-inset-bottom,0px))}
    .bf-phone-panel,.bf-phone-empty,.bf-phone-error{background:#fff;border:1px solid #d3e6e9;border-radius:17px;padding:17px;margin-bottom:12px;color:#46636a;font:14px/1.5 system-ui}
    .bf-phone-error{background:#fff0e9;color:#793623;border-color:#f3c9bb}.bf-phone-panel strong{display:block;color:#124a56;font-size:17px;margin-bottom:5px}
    .bf-phone-field{width:100%;box-sizing:border-box;border:1px solid #b8d4da;border-radius:12px;padding:13px;margin:10px 0;font:600 16px system-ui;color:#173f48;background:#fff}
    .bf-phone-submit{width:100%;border:0;border-radius:12px;background:#087286;color:#fff;padding:13px;font:800 15px system-ui}
    .bf-order-card{background:#fff;border:1px solid #d2e5e8;border-radius:17px;margin-bottom:11px;overflow:hidden;box-shadow:0 3px 12px rgba(7,72,84,.06)}
    .bf-order-summary{padding:15px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;cursor:pointer;user-select:none}
    .bf-order-number{font:800 16px system-ui;color:#123f48;word-break:break-word}.bf-order-date{font:12px system-ui;color:#75878b;margin-top:3px}.bf-order-total{font:800 14px system-ui;color:#087286;text-align:right}
    .bf-order-status-row{grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bf-order-status{display:inline-flex;max-width:100%;white-space:normal;line-height:1.3;border-radius:999px;padding:6px 10px;font:800 12px/1.3 system-ui;background:#e0f0f3;color:#075d6d}.bf-order-status.ready{background:#fff0bd;color:#765700}.bf-order-status.done{background:#def4e4;color:#17622f}.bf-order-status.danger{background:#ffe1e1;color:#882929}.bf-order-status.rider{background:#e5e6ff;color:#373b88}.bf-order-message{font:12px system-ui;color:#64777b}
    .bf-order-chevron{font:800 18px system-ui;color:#729096;transition:transform .18s}.bf-order-card.open .bf-order-chevron{transform:rotate(180deg)}
    .bf-order-details{display:none;border-top:1px solid #e2edef;padding:14px}.bf-order-card.open .bf-order-details{display:block}
    .bf-order-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}.bf-order-field{background:#f4f9fa;border-radius:11px;padding:10px}.bf-order-field label{display:block;color:#74878c;font:800 10px system-ui;text-transform:uppercase;letter-spacing:.35px}.bf-order-field span{display:block;color:#24434a;font:600 13px/1.4 system-ui;margin-top:4px;word-break:break-word}
    .bf-order-timeline-title{font:800 14px system-ui;color:#174a55;margin:4px 0 12px}.bf-order-timeline{position:relative;padding-left:22px}.bf-order-timeline:before{content:'';position:absolute;left:6px;top:5px;bottom:7px;width:2px;background:#c8dde1}.bf-order-event{position:relative;padding:0 0 15px 9px}.bf-order-dot{position:absolute;left:-21px;top:3px;width:11px;height:11px;border-radius:50%;background:#087286;border:2px solid #fff;box-shadow:0 0 0 2px #a9d0d7}.bf-order-event b{display:block;color:#234a53;font:800 13px system-ui}.bf-order-event p{margin:3px 0;color:#5f7479;font:12px/1.4 system-ui}.bf-order-event small{color:#87979b;font:11px system-ui}
    @media(max-width:480px){#bf-phone-orders-header{grid-template-columns:1fr}#bf-phone-orders-actions{justify-content:flex-end}.bf-order-grid{grid-template-columns:1fr}#bf-phone-orders-button{left:10px;bottom:calc(116px + env(safe-area-inset-bottom,0px))}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'bf-phone-orders-button';
  button.type = 'button';
  button.innerHTML = '<span>🧺</span><span>My Orders</span>';

  const overlay = document.createElement('div');
  overlay.id = 'bf-phone-orders-overlay';
  overlay.innerHTML = `
    <section id="bf-phone-orders-sheet">
      <header id="bf-phone-orders-header">
        <div><h2>My Orders</h2><p>All order numbers, status, and details</p></div>
        <div id="bf-phone-orders-actions">
          <button class="bf-phone-orders-action" id="bf-phone-change" type="button">Change phone</button>
          <button class="bf-phone-orders-action" id="bf-phone-refresh" type="button">Refresh</button>
          <button class="bf-phone-orders-action" id="bf-phone-close" type="button">Close</button>
        </div>
      </header>
      <div id="bf-phone-orders-connection">Enter your phone number to load your orders.</div>
      <main id="bf-phone-orders-body"></main>
    </section>`;
  document.body.append(button, overlay);

  const body = overlay.querySelector('#bf-phone-orders-body');
  const connection = overlay.querySelector('#bf-phone-orders-connection');
  const changeButton = overlay.querySelector('#bf-phone-change');
  let refreshTimer = null;
  let loading = false;

  const storedPhone = () => { try { return localStorage.getItem(PHONE_KEY) || ''; } catch (_) { return ''; } };
  const savePhone = (phone) => { try { localStorage.setItem(PHONE_KEY, String(phone || '').trim()); } catch (_) {} };
  const clearPhone = () => { try { localStorage.removeItem(PHONE_KEY); } catch (_) {} };
  const rpc = async (name, payload) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify(payload || {})
    });
    const text = await response.text();
    let data = {}; try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
    return data;
  };
  const cachedOrders = () => {
    const value = parseJson(native('registeredBookings', '[]'), []);
    return Array.isArray(value) ? value : [];
  };

  const renderPhoneForm = (message = '') => {
    connection.textContent = 'Only your booking phone number is required.';
    changeButton.style.display = 'none';
    body.innerHTML = `${message ? `<div class="bf-phone-error">${escapeHtml(message)}</div>` : ''}
      <form class="bf-phone-panel" id="bf-phone-form">
        <strong>View all orders</strong>
        <div>Enter the same phone number used for your Bubbly-fi bookings.</div>
        <input class="bf-phone-field" id="bf-phone-input" inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX" value="${escapeHtml(storedPhone())}" required>
        <button class="bf-phone-submit" type="submit">View My Orders</button>
      </form>`;
    const form = body.querySelector('#bf-phone-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const phone = body.querySelector('#bf-phone-input').value.trim();
      if (!phoneValid(phone)) {
        renderPhoneForm('Enter a valid phone number with at least 10 digits.');
        return;
      }
      savePhone(phone);
      refresh(phone);
    });
  };

  const detailsFields = (order) => [
    ['Order number', order.request_no],
    ['Receipt number', order.receipt_no],
    ['Customer', order.customer_name],
    ['Service', order.service],
    ['Item type', order.item_type],
    ['Weight', order.weight ? `${order.weight} kg` : ''],
    ['Loads / Quantity', order.loads],
    ['Pickup schedule', order.pickup_at ? dateText(order.pickup_at) : ''],
    ['Assigned rider', order.assigned_rider_name],
    ['Rider phone', order.assigned_rider_phone],
    ['Delivery ETA', order.delivery_eta ? dateText(order.delivery_eta) : ''],
    ['Delivery proof', order.delivery_received_at ? `${order.delivery_proof_type || 'Recorded'} · received ${dateText(order.delivery_received_at)}` : ''],
    ['Area', order.place],
    ['Delivery', order.delivery_requested === true || order.delivery_requested === 'true' ? 'Requested' : 'Drop-off / pickup'],
    ['Payment', order.payment_method],
    ['Address', order.address],
    ['Notes', order.notes]
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');

  const renderOrders = (payload = {}) => {
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];
    changeButton.style.display = 'inline-block';
    connection.textContent = payload.notifications_registered
      ? `Notifications active • ${orders.length} order${orders.length === 1 ? '' : 's'} found${payload.phone_masked ? ` for ${payload.phone_masked}` : ''}`
      : `Order history loaded • Allow notifications for automatic status updates`;

    const errorHtml = errors.length
      ? `<div class="bf-phone-error">${errors.map(escapeHtml).join('<br>')}</div>`
      : '';
    if (!orders.length) {
      body.innerHTML = `${errorHtml}<div class="bf-phone-empty"><strong>No orders found.</strong><br>Use the exact phone number entered during booking, including the correct final 10 digits.</div>`;
      return;
    }

    body.innerHTML = errorHtml + orders.map((order, index) => {
      const number = order.request_no || order.receipt_no || `Order ${index + 1}`;
      const history = Array.isArray(order.history) ? order.history : [];
      const fields = detailsFields(order);
      return `
        <article class="bf-order-card" data-order="${index}">
          <div class="bf-order-summary" role="button" tabindex="0" aria-expanded="false">
            <div><div class="bf-order-number">${escapeHtml(number)}</div><div class="bf-order-date">${escapeHtml(dateText(order.created_at))}</div></div>
            <div><div class="bf-order-total">${escapeHtml(money(order.total))}</div><div class="bf-order-chevron">⌄</div></div>
            <div class="bf-order-status-row"><span class="bf-order-status ${statusClass(order.current_status)}">${escapeHtml(order.current_status || 'Pending')}</span><span class="bf-order-message">${escapeHtml(order.current_message || '')}</span></div>
          </div>
          <div class="bf-order-details">
            <div class="bf-order-grid">${fields.map(([label, value]) => `<div class="bf-order-field"><label>${escapeHtml(label)}</label><span>${escapeHtml(value)}</span></div>`).join('')}</div>
            <div class="bf-order-timeline-title">Status timeline</div>
            <div class="bf-order-timeline">${history.length ? history.map((event) => `<div class="bf-order-event"><span class="bf-order-dot"></span><b>${escapeHtml(event.status || 'Updated')}</b><p>${escapeHtml(event.message || '')}</p><small>${escapeHtml(dateText(event.created_at))}</small></div>`).join('') : `<div class="bf-order-event"><span class="bf-order-dot"></span><b>${escapeHtml(order.current_status || 'Pending')}</b><p>${escapeHtml(order.current_message || '')}</p><small>${escapeHtml(dateText(order.updated_at || order.created_at))}</small></div>`}</div>
          </div>
        </article>`;
    }).join('');

    body.querySelectorAll('.bf-order-summary').forEach((summary) => {
      const toggle = () => {
        const card = summary.closest('.bf-order-card');
        const open = card.classList.toggle('open');
        summary.setAttribute('aria-expanded', String(open));
      };
      summary.addEventListener('click', toggle);
      summary.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      });
    });
  };

  const refresh = async (phoneOverride = '') => {
    if (loading) return;
    const phone = String(phoneOverride || storedPhone()).trim();
    if (!phoneValid(phone)) {
      renderPhoneForm();
      return;
    }
    savePhone(phone);
    loading = true;
    changeButton.style.display = 'inline-block';
    connection.textContent = 'Loading all orders and linking notifications…';
    const cached = cachedOrders();
    if (cached.length) renderOrders({ orders: cached, notifications_registered: false });
    const errors = [];
    let notificationsRegistered = false;
    try {
      const token = native('firebaseToken', '');
      if (token.length >= 40) {
        await rpc('register_customer_phone_device', {
          p_phone: phone,
          p_fcm_token: token,
          p_app_version: native('versionName', '1.6.20'),
          p_area: native('customerArea', 'unknown')
        });
        notificationsRegistered = true;
      } else {
        errors.push('Allow notifications to receive automatic status updates.');
      }
      const result = await rpc('get_customer_orders_by_phone', { p_phone: phone });
      renderOrders({
        orders: Array.isArray(result.orders) ? result.orders : [],
        phone_masked: result.phone_masked || '',
        notifications_registered: notificationsRegistered,
        errors
      });
    } catch (error) {
      errors.push(error?.message || String(error));
      renderOrders({ orders: cached, notifications_registered: notificationsRegistered, errors });
    } finally {
      loading = false;
    }
  };

  window.addEventListener('bubblyfiNotification', () => setTimeout(() => refresh(), 450));
  window.addEventListener('bubblyfi:notification-open', () => setTimeout(() => refresh(), 450));
  window.addEventListener('bubblyfi:booking-captured', (event) => {
    const phone = event.detail?.phone || '';
    if (phoneValid(phone)) savePhone(phone);
    setTimeout(() => refresh(phone), 450);
  });
  window.addEventListener('bubblyfi:fcm-token', () => setTimeout(() => refresh(), 500));

  button.addEventListener('click', () => {
    overlay.classList.add('open');
    refresh();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(), 30000);
  });
  overlay.querySelector('#bf-phone-close').addEventListener('click', () => {
    overlay.classList.remove('open');
    clearInterval(refreshTimer);
  });
  overlay.querySelector('#bf-phone-refresh').addEventListener('click', () => refresh());
  changeButton.addEventListener('click', () => {
    clearPhone();
    renderPhoneForm();
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.classList.remove('open');
      clearInterval(refreshTimer);
    }
  });

  window.BubblyfiOrderHistory = { refresh, renderPhoneForm };
  if (phoneValid(storedPhone())) refresh(); else renderPhoneForm();
})();
