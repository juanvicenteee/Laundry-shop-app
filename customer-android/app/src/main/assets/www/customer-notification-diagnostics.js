(() => {
  // Customer HTML mirror: use the current live My Orders and delivery-status enhancement.
  document.getElementById('bf-notification-diagnostics-button')?.remove();
  document.getElementById('bf-notification-diagnostics-overlay')?.remove();
  if (window.__bubblyfiWebOrdersV1617 || document.querySelector('script[data-bf-customer-status-v1617]')) return;
  const script = document.createElement('script');
  script.src = 'https://bubblyfi.netlify.app/customer-notification-diagnostics.js?v=1.6.17';
  script.async = false;
  script.dataset.bfCustomerStatusV1617 = 'true';
  document.head.appendChild(script);
})();
