(() => {
  if (window.__bubblyfiDeliveryStatusFixV1) return;
  window.__bubblyfiDeliveryStatusFixV1 = true;

  const STATUSES = [
    'Received',
    'Rider assigned',
    'Picked up',
    'Received at shop',
    'Washing',
    'Drying',
    'Ready for delivery',
    'Ongoing delivery',
    'Rider nearby',
    'Arrived',
    'Delivered',
    'Claimed',
    'Cancelled'
  ];

  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function fillSelect(select, includeAll = false) {
    if (!select) return;
    const current = select.value;
    const values = includeAll ? ['all', ...STATUSES] : STATUSES;
    select.innerHTML = values.map((status) => {
      const label = status === 'all' ? 'All statuses' : status;
      return `<option value="${escape(status)}">${escape(label)}</option>`;
    }).join('');
    if (values.includes(current)) select.value = current;
    else if (current && !includeAll) {
      select.insertAdjacentHTML('afterbegin', `<option value="${escape(current)}">${escape(current)}</option>`);
      select.value = current;
    }
  }

  function enhance() {
    fillSelect(document.querySelector('#orderStatus'));
    fillSelect(document.querySelector('#orderStatusFilter'), true);
    document.querySelectorAll('[data-order-status-id]').forEach((select) => fillSelect(select));
  }

  async function saveStatus(select) {
    const orderId = select.dataset.orderStatusId;
    const status = select.value;
    const order = state?.orders?.find((item) => item.id === orderId);
    if (!orderId || order?.is_void) return;

    select.disabled = true;
    setSaveStatus('Saving delivery status…', 'saving');
    const { error } = await sb.from('orders').update({
      status,
      updated_by: state.profile.id
    }).eq('id', orderId);

    if (error) {
      select.disabled = false;
      setSaveStatus('Save failed', 'error');
      toast(error.message, 7000);
      await loadCloudData().catch(console.error);
      renderAll();
      return;
    }

    try {
      const { error: pushError } = await sb.functions.invoke('push-order-status', {
        body: { order_id: orderId, status }
      });
      if (pushError) console.warn('Status saved but notification failed:', pushError.message);
    } catch (pushError) {
      console.warn('Status saved but notification failed:', pushError);
    }

    await logAction('status_change', 'order', orderId, { status });
    setSaveStatus('Saved in cloud');
    toast(`${status} saved and customer notification processed.`, 5000);
    await loadCloudData();
    renderAll();
  }

  document.addEventListener('change', (event) => {
    const select = event.target.closest?.('[data-order-status-id]');
    if (!select) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveStatus(select);
  }, true);

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhance();
})();
