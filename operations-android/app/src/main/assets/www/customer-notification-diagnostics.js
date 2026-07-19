(() => {
  if (window.__bubblyfiNotificationDiagnosticsV1614) return;

  const android = window.AndroidBridge;
  const nativeReady = android &&
    typeof android.notificationDiagnostics === 'function' &&
    typeof android.sendLocalNotificationTest === 'function' &&
    typeof android.sendServerNotificationTest === 'function';

  // The public browser page cannot inspect Android notification channels or an
  // FCM token. Only mount this panel inside Bubbly-fi Customer v1.6.14+.
  if (!nativeReady) return;
  window.__bubblyfiNotificationDiagnosticsV1614 = true;

  const parse = (value, fallback = {}) => {
    try { return JSON.parse(String(value || '')); } catch (_) { return fallback; }
  };
  const bridge = (name, fallback = '') => {
    try {
      const fn = window.AndroidBridge?.[name];
      if (typeof fn !== 'function') return fallback;
      const value = fn.call(window.AndroidBridge);
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const importanceText = (value) => ({
    0: 'Blocked', 1: 'Minimum', 2: 'Low', 3: 'Default', 4: 'High', 5: 'Maximum'
  }[Number(value)] || `Unknown (${value})`);
  const dateText = (value) => {
    const time = Number(value || 0);
    if (!time) return 'Never';
    try { return new Date(time).toLocaleString(); } catch (_) { return String(time); }
  };

  const style = document.createElement('style');
  style.id = 'bf-notification-diagnostics-style';
  style.textContent = `
    #bf-notification-diagnostics-button{position:fixed;right:12px;bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:2147483000;border:0;border-radius:999px;background:#193f68;color:#fff;min-height:50px;padding:13px 16px;font:800 13px system-ui;box-shadow:0 8px 25px rgba(0,0,0,.34)}
    #bf-notification-diagnostics-overlay{position:fixed;inset:0;z-index:2147483400;background:rgba(1,20,35,.7);display:none;align-items:flex-end;padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
    #bf-notification-diagnostics-overlay.open{display:flex}
    #bf-notification-diagnostics-sheet{width:100%;max-height:86dvh;background:#f4f8fb;border-radius:24px 24px 0 0;overflow:auto;padding:18px;box-sizing:border-box;color:#203743;font:14px/1.45 system-ui}
    #bf-notification-diagnostics-sheet h2{margin:0;color:#143d61;font:800 22px system-ui}#bf-notification-diagnostics-sheet p{margin:5px 0 14px;color:#5e707c}
    .bf-nd-card{background:#fff;border:1px solid #d3e0e7;border-radius:16px;padding:14px;margin:10px 0}.bf-nd-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:8px 0;border-bottom:1px solid #edf2f5}.bf-nd-row:last-child{border-bottom:0}.bf-nd-row b{color:#314c59}.bf-nd-good{color:#19703c;font-weight:800}.bf-nd-bad{color:#9a2d26;font-weight:800}.bf-nd-warn{color:#875c00;font-weight:800}
    .bf-nd-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.bf-nd-button{border:0;border-radius:12px;padding:12px;font:800 13px system-ui;background:#126f82;color:#fff}.bf-nd-button.secondary{background:#fff;color:#174e5d;border:1px solid #bfd5dc}.bf-nd-button:disabled{opacity:.55}.bf-nd-close{float:right;border:0;background:#e5edf1;color:#294955;border-radius:10px;padding:8px 11px;font-weight:800}#bf-nd-result{white-space:pre-wrap;word-break:break-word}
    @media(max-width:480px){#bf-notification-diagnostics-button{right:10px;bottom:calc(116px + env(safe-area-inset-bottom,0px));max-width:44vw}.bf-nd-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'bf-notification-diagnostics-button';
  button.type = 'button';
  button.textContent = '🔔 Test alerts';
  button.setAttribute('aria-label', 'Test Bubbly-fi notifications on this phone');

  const overlay = document.createElement('div');
  overlay.id = 'bf-notification-diagnostics-overlay';
  overlay.innerHTML = `
    <section id="bf-notification-diagnostics-sheet" role="dialog" aria-modal="true" aria-labelledby="bf-nd-title">
      <button class="bf-nd-close" type="button">Close</button>
      <h2 id="bf-nd-title">Notification diagnostics</h2>
      <p>Tests Android display settings and sends a Firebase message to this exact phone.</p>
      <div id="bf-nd-status" class="bf-nd-card">Loading…</div>
      <div class="bf-nd-actions">
        <button id="bf-nd-full-test" class="bf-nd-button" type="button">Run full test</button>
        <button id="bf-nd-local-test" class="bf-nd-button secondary" type="button">Local test only</button>
        <button id="bf-nd-permission" class="bf-nd-button secondary" type="button">Allow notifications</button>
        <button id="bf-nd-settings" class="bf-nd-button secondary" type="button">Open Android settings</button>
        <button id="bf-nd-refresh" class="bf-nd-button secondary" type="button">Refresh diagnostics</button>
      </div>
      <div id="bf-nd-result" class="bf-nd-card" aria-live="polite">No test run yet.</div>
    </section>`;
  document.body.append(button, overlay);

  const statusBox = overlay.querySelector('#bf-nd-status');
  const resultBox = overlay.querySelector('#bf-nd-result');
  const fullButton = overlay.querySelector('#bf-nd-full-test');
  const localButton = overlay.querySelector('#bf-nd-local-test');
  let lastStatus = {};
  let testStartedAt = 0;

  const readStatus = () => parse(bridge('notificationDiagnostics', '{}'), {});
  const stateClass = (ok, warning = false) => ok ? 'bf-nd-good' : warning ? 'bf-nd-warn' : 'bf-nd-bad';
  const stateText = (ok, good = 'Yes', bad = 'No') => `<span class="${stateClass(ok)}">${ok ? good : bad}</span>`;

  const renderStatus = () => {
    lastStatus = readStatus();
    const channelOk = lastStatus.marketing_channel_enabled && Number(lastStatus.marketing_channel_importance) >= 3;
    statusBox.innerHTML = `
      <div class="bf-nd-row"><b>App version</b><span>${escapeHtml(lastStatus.app_version || 'Unknown')}</span></div>
      <div class="bf-nd-row"><b>Android notification permission</b>${stateText(lastStatus.permission_granted)}</div>
      <div class="bf-nd-row"><b>App notifications enabled</b>${stateText(lastStatus.notifications_enabled)}</div>
      <div class="bf-nd-row"><b>Broadcast channel</b><span class="${stateClass(channelOk, lastStatus.marketing_channel_enabled)}">${escapeHtml(importanceText(lastStatus.marketing_channel_importance))}</span></div>
      <div class="bf-nd-row"><b>Firebase token</b><span class="${stateClass(lastStatus.token_present)}">${escapeHtml(lastStatus.token_masked || 'Missing')}</span></div>
      <div class="bf-nd-row"><b>Backend registration</b>${stateText(lastStatus.installation_registered)}</div>
      <div class="bf-nd-row"><b>Background restricted</b><span class="${stateClass(!lastStatus.background_restricted, true)}">${lastStatus.background_restricted ? 'Restricted' : 'No'}</span></div>
      <div class="bf-nd-row"><b>Battery optimization</b><span class="${stateClass(!lastStatus.battery_optimized, true)}">${lastStatus.battery_optimized ? 'Enabled' : 'Excluded / not applicable'}</span></div>
      <div class="bf-nd-row"><b>Last Firebase receipt</b><span>${escapeHtml(dateText(lastStatus.last_fcm_received_at))}${lastStatus.last_fcm_kind ? ` • ${escapeHtml(lastStatus.last_fcm_kind)}` : ''}</span></div>`;
    return lastStatus;
  };

  const runLocal = () => {
    const result = parse(bridge('sendLocalNotificationTest', '{}'), {});
    resultBox.innerHTML = result.ok
      ? '<span class="bf-nd-good">Local notification posted.</span><br>Android permission and the broadcast channel are working.'
      : `<span class="bf-nd-bad">Local test failed.</span><br>${escapeHtml(result.error || 'Android blocked the notification.')}`;
    renderStatus();
    return result;
  };

  const waitForReceipt = (before) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const current = renderStatus();
      if (Number(current.last_fcm_received_at || 0) > Number(before || 0)) {
        clearInterval(timer);
        resultBox.innerHTML += '<br><span class="bf-nd-good">Firebase message received by this exact phone.</span>';
      } else if (attempts >= 15) {
        clearInterval(timer);
        resultBox.innerHTML += '<br><span class="bf-nd-bad">Firebase accepted the send, but this phone did not report receipt within 15 seconds.</span><br>Check battery restrictions or reinstall the current app build.';
      }
    }, 1000);
  };

  const runServer = () => {
    const before = Number(readStatus().last_fcm_received_at || 0);
    testStartedAt = Date.now();
    resultBox.textContent = 'Sending a Firebase test to this phone’s exact token…';
    fullButton.disabled = true;

    const handler = (event) => {
      window.removeEventListener('bubblyfi:notification-test-result', handler);
      fullButton.disabled = false;
      const detail = event.detail || {};
      resultBox.innerHTML = detail.ok
        ? `<span class="bf-nd-good">Firebase accepted the exact-device test.</span><br>FCM status: ${escapeHtml(detail.fcm_status || detail.http_status || 200)} • token ${escapeHtml(detail.token || lastStatus.token_masked || '')}`
        : `<span class="bf-nd-bad">Server test failed.</span><br>${escapeHtml(detail.error || 'Unknown error')}${detail.error_code ? ` (${escapeHtml(detail.error_code)})` : ''}`;
      if (detail.ok) waitForReceipt(before);
      renderStatus();
    };
    window.addEventListener('bubblyfi:notification-test-result', handler);

    try { window.AndroidBridge.sendServerNotificationTest(); }
    catch (error) {
      window.removeEventListener('bubblyfi:notification-test-result', handler);
      fullButton.disabled = false;
      resultBox.innerHTML = `<span class="bf-nd-bad">Unable to start server test.</span><br>${escapeHtml(error?.message || error)}`;
      return;
    }

    setTimeout(() => {
      if (Date.now() - testStartedAt < 20000 || !fullButton.disabled) return;
      window.removeEventListener('bubblyfi:notification-test-result', handler);
      fullButton.disabled = false;
      resultBox.innerHTML = '<span class="bf-nd-bad">The server test timed out.</span>';
    }, 21000);
  };

  fullButton.addEventListener('click', () => {
    const status = renderStatus();
    if (!status.permission_granted || !status.notifications_enabled || !status.marketing_channel_enabled) {
      resultBox.innerHTML = '<span class="bf-nd-bad">Android notification settings are blocking alerts.</span><br>Tap Allow notifications or Open Android settings, then run the test again.';
      try { window.AndroidBridge.requestNotificationPermission?.(); } catch (_) {}
      return;
    }
    const local = runLocal();
    if (local.ok) setTimeout(runServer, 700);
  });
  localButton.addEventListener('click', runLocal);
  overlay.querySelector('#bf-nd-permission').addEventListener('click', () => {
    try { window.AndroidBridge.requestNotificationPermission?.(); } catch (_) {}
    setTimeout(renderStatus, 900);
  });
  overlay.querySelector('#bf-nd-settings').addEventListener('click', () => {
    try { window.AndroidBridge.openNotificationSettings?.(); } catch (_) {}
  });
  overlay.querySelector('#bf-nd-refresh').addEventListener('click', renderStatus);
  overlay.querySelector('.bf-nd-close').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.classList.remove('open'); });
  button.addEventListener('click', () => { overlay.classList.add('open'); renderStatus(); });
  window.addEventListener('bubblyfi:notification-diagnostics', renderStatus);
})();
