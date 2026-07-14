'use strict';

const SUPABASE_URL = 'https://amjhrejmcnthlrqddznw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5KkgIxPlTNAZjqgRX9Yh3A_tqLD2hNE';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const usernameEmail = { admin: 'admin@bubblyfi.app', operator: 'operator@bubblyfi.app' };
const weekdayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const defaultSettings = {
  // Base service prices exclude detergent and fabric conditioner.
  price_wash_cubao: 60, price_wash_mplace: 90, price_wash_outside: 60,
  price_wdo_cubao: 125, price_wdo_mplace: 155, price_wdo_outside: 125,
  price_wdf_cubao: 165, price_wdf_mplace: 195, price_wdf_outside: 165,
  price_wash_only_cubao: 60, price_wash_only_mplace: 90, price_wash_only_outside: 60,
  price_dry_only_cubao: 65, price_dry_only_mplace: 95, price_dry_only_outside: 65,
  price_fold_only_cubao: 40, price_fold_only_mplace: 70, price_fold_only_outside: 40,
  addon_extra_dry: 20, addon_extra_wash: 25, addon_warm_hot_wash: 25, addon_zonrox_colorsafe: 5, full_service_discount: 5,
  default_detergent_price: 10, default_conditioner_price: 15,
  delivery_standard: 60, delivery_mplace: 30,
  capacity_wash: 8, capacity_wdo: 8, capacity_wdf: 8,
  capacity_wash_only: 8, capacity_dry_only: 8, capacity_fold_only: 8,
  // Legacy fields remain as fallbacks for projects upgraded from earlier versions.
  included_detergent_value: 10, included_conditioner_value: 15,
  price_wash_only: 60, price_dry_only: 65,
  price_cubao: 190, price_mplace: 220, price_outside: 240,
  capacity_regular: 8, capacity_blanket: 2, capacity_comforter: 1, capacity_sheets: 5
};
const services = {
  wash: {
    label: 'Wash', icon: '🫧', unit: 'kg', capacityKey: 'capacity_wash',
    priceKeys: { cubao: 'price_wash_cubao', mplace: 'price_wash_mplace', outside: 'price_wash_outside' },
    description: 'Standard wash service'
  },
  wash_dry_only: {
    label: 'Wash + Dry', icon: '🧺', unit: 'kg', capacityKey: 'capacity_wdo',
    priceKeys: { cubao: 'price_wdo_cubao', mplace: 'price_wdo_mplace', outside: 'price_wdo_outside' },
    description: 'Wash and dry without folding'
  },
  wash_dry_fold: {
    label: 'Wash + Dry + Fold', icon: '✨', unit: 'kg', capacityKey: 'capacity_wdf',
    priceKeys: { cubao: 'price_wdf_cubao', mplace: 'price_wdf_mplace', outside: 'price_wdf_outside' },
    description: 'Complete wash, dry and fold service'
  },
  wash_only: {
    label: 'Wash Only', icon: '🧼', unit: 'kg', capacityKey: 'capacity_wash_only',
    priceKeys: { cubao: 'price_wash_only_cubao', mplace: 'price_wash_only_mplace', outside: 'price_wash_only_outside' },
    description: 'Wash-only service'
  },
  dry_only: {
    label: 'Dry Only', icon: '💨', unit: 'kg', capacityKey: 'capacity_dry_only',
    priceKeys: { cubao: 'price_dry_only_cubao', mplace: 'price_dry_only_mplace', outside: 'price_dry_only_outside' },
    description: 'Dryer-only service'
  },
  fold_only: {
    label: 'Fold Only', icon: '👕', unit: 'kg', capacityKey: 'capacity_fold_only',
    priceKeys: { cubao: 'price_fold_only_cubao', mplace: 'price_fold_only_mplace', outside: 'price_fold_only_outside' },
    description: 'Folding service only'
  },
  // Legacy types are kept only so existing orders continue to display correctly.
  regular: { label: 'Wash + Dry + Fold', icon: '🧺', unit: 'kg', capacityKey: 'capacity_regular', legacy: true },
  blanket: { label: 'Thick blanket (legacy)', icon: '🛏️', unit: 'kg', capacityKey: 'capacity_blanket', legacy: true },
  comforter: { label: 'Comforter (legacy)', icon: '🛌', unit: 'pc', capacityKey: 'capacity_comforter', legacy: true },
  sheets: { label: 'Sheets / towels (legacy)', icon: '🧻', unit: 'kg', capacityKey: 'capacity_sheets', legacy: true }
};
const places = {
  cubao: { label: 'Cubao', icon: '📍', priceKey: 'price_cubao' },
  mplace: { label: 'MPlace', icon: '🏢', priceKey: 'price_mplace' },
  outside: { label: 'Outside Cubao', icon: '🚗', priceKey: 'price_outside' }
};
const loadTypes = {
  assorted_clothes: { label: 'Assorted clothes', icon: '👕', unit: 'kg', capacityKey: 'capacity_regular', capacity: 8, note: 'Up to 8 kg per load' },
  thick_blankets: { label: 'Thick blankets', icon: '🛏️', unit: 'kg', capacityKey: 'capacity_blanket', capacity: 2, note: 'Up to 2 kg per load' },
  comforter: { label: 'Comforter', icon: '🛌', unit: 'pc', capacityKey: 'capacity_comforter', capacity: 1, note: '1 pc per load' },
  sheets_towels: { label: 'Bed sheets, towels', icon: '🧻', unit: 'kg', capacityKey: 'capacity_sheets', capacity: 5, note: 'Up to 5 kg per load' }
};
const payments = ['Cash','GCash','Maya','Bank Transfer','Unpaid'];

let state = {
  session: null, profile: null, settings: { ...defaultSettings },
  customers: [], orders: [], inventory: [], requests: [], page: 'dashboard',
  draft: { customerId: null, service: 'wash_dry_fold', itemType: 'assorted_clothes', fullService: false, place: 'cubao', delivery: false, quantity: 8, payment: 'Cash', detergentChoice: '', conditionerChoice: '', extraDry: false, extraWash: false, warmHotWash: false, zonroxColorsafe: false, extraDetergent: false, extraConditioner: false },
  channels: [], notifiedRequestIds: new Set(), latestRequestId: null, soundVoiceEnabled: false
};

const BOOKING_ALERT_PREF_KEY = 'bubblyfi-sound-voice-alerts';
let bookingAlertAudioContext = null;
let bookingAlertQueue = Promise.resolve();
try { state.soundVoiceEnabled = localStorage.getItem(BOOKING_ALERT_PREF_KEY) === 'enabled'; } catch (_) {}

function setSaveStatus(text, cls = '') {
  const el = $('#saveIndicator'); el.textContent = text; el.className = `save-indicator ${cls}`.trim();
}
function toast(message, duration = 2600) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), duration);
}
function pendingCustomerRequests() {
  return state.requests.filter(r => r.status === 'Pending' && !r.converted_order_id);
}
function getBookingAlertAudioContext() {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!bookingAlertAudioContext || bookingAlertAudioContext.state === 'closed') bookingAlertAudioContext = new AudioContextCtor();
    return bookingAlertAudioContext;
  } catch (error) {
    console.debug('Notification audio unavailable', error);
    return null;
  }
}
async function primeBookingAlertAudio() {
  const ctx = getBookingAlertAudioContext();
  if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
  return ctx;
}
function requestLocationLabel(request = {}) {
  const area = places[request.place]?.label;
  if (area) return area;
  const address = String(request.full_address || '').replace(/\s+/g, ' ').trim();
  return address || 'an unspecified location';
}
function cleanSpeechText(value, fallback) {
  const cleaned = String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 180);
}
async function playRequestAlarm() {
  try {
    const ctx = await primeBookingAlertAudio();
    if (!ctx || ctx.state !== 'running') return false;
    const now = ctx.currentTime + 0.02;
    const notes = [
      { t: 0.00, f: 784, d: 0.22 }, { t: 0.25, f: 1047, d: 0.22 }, { t: 0.50, f: 1319, d: 0.34 },
      { t: 0.94, f: 784, d: 0.22 }, { t: 1.19, f: 1047, d: 0.22 }, { t: 1.44, f: 1319, d: 0.42 }
    ];
    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(note.f, now + note.t);
      gain.gain.setValueAtTime(0.0001, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + note.t); osc.stop(now + note.t + note.d + 0.03);
    });
    await new Promise(resolve => setTimeout(resolve, 2050));
    return true;
  } catch (error) {
    console.debug('Notification alarm unavailable', error);
    return false;
  }
}
function getSpeechVoices(timeoutMs = 1600) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const current = window.speechSynthesis.getVoices();
    if (current.length) return resolve(current);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
}
function selectPhilippineVoice(voices = []) {
  const normalise = value => String(value || '').toLowerCase();
  const exactPhilippineEnglish = voices.find(v => /^en[-_]ph$/i.test(v.lang));
  if (exactPhilippineEnglish) return { voice: exactPhilippineEnglish, mode: 'english' };

  const namedPhilippineEnglish = voices.find(v => {
    const name = normalise(v.name);
    const lang = normalise(v.lang);
    return lang.startsWith('en') && (name.includes('philippine') || name.includes('filipino') || name.includes('philippines'));
  });
  if (namedPhilippineEnglish) return { voice: namedPhilippineEnglish, mode: 'english' };

  const filipinoVoice = voices.find(v => /^(fil|tl)([-_]|$)/i.test(v.lang)) || voices.find(v => {
    const name = normalise(v.name);
    return name.includes('filipino') || name.includes('tagalog');
  });
  if (filipinoVoice) return { voice: filipinoVoice, mode: 'filipino' };

  const fallbackEnglish = voices.find(v => /^en([-_]|$)/i.test(v.lang));
  return { voice: fallbackEnglish || voices[0] || null, mode: 'english' };
}
async function speakRequestAnnouncement(request) {
  try {
    const nameEnglish = cleanSpeechText(request.customer_name, 'a customer');
    const locationEnglish = cleanSpeechText(requestLocationLabel(request), 'an unspecified location');
    const nativeMessage = `A new Bubbly-fi customer order has been received. Customer: ${nameEnglish}. Pickup area: ${locationEnglish}. Please review the new request.`;
    if (window.AndroidBridge && typeof window.AndroidBridge.speak === 'function') {
      const spoken = window.AndroidBridge.speak(nativeMessage, 'en-PH');
      if (spoken) return true;
    }
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return false;
    const voices = await getSpeechVoices();
    const selected = selectPhilippineVoice(voices);
    const isFilipinoVoice = selected.mode === 'filipino';
    const message = isFilipinoVoice
      ? `May bagong order na natanggap ang Bubbly-fi mula kay ${nameEnglish}. Ang lugar ng pickup ay ${locationEnglish}. Pakisuri ang bagong customer request.`
      : nativeMessage;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = isFilipinoVoice ? 'fil-PH' : 'en-PH';
    utterance.rate = 0.88;
    utterance.pitch = 0.98;
    utterance.volume = 1;
    if (selected.voice) utterance.voice = selected.voice;
    window.speechSynthesis.cancel();
    return await new Promise(resolve => {
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      window.speechSynthesis.speak(utterance);
    });
  } catch (error) {
    console.debug('Voice announcement unavailable', error);
    return false;
  }
}
function queueRequestAlarmAndVoice(request) {
  if (!state.soundVoiceEnabled) return;
  bookingAlertQueue = bookingAlertQueue.then(async () => {
    await playRequestAlarm();
    await speakRequestAnnouncement(request);
  }).catch(error => console.debug('Booking alert failed', error));
}
function openRequestQueue(requestId = null) {
  state.page = 'requests';
  renderPage();
  const request = requestId ? state.requests.find(r => r.id === requestId) : null;
  $('#requestStatusFilter').value = request?.status || 'Pending';
  $('#requestSearch').value = request?.request_no || '';
  renderRequests();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderRequestNotifications() {
  const pending = pendingCustomerRequests().sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const count = pending.length;
  const navBadge = $('#requestNavBadge');
  const alertBadge = $('#requestAlertBadge');
  const navButton = $('#requestNavButton');
  const alertButton = $('#requestAlertBtn');
  if (navBadge) { navBadge.textContent = count > 99 ? '99+' : String(count); navBadge.classList.toggle('hidden', count === 0); }
  if (alertBadge) alertBadge.textContent = count > 99 ? '99+' : String(count);
  if (navButton) navButton.classList.toggle('has-alert', count > 0);
  if (alertButton) alertButton.classList.toggle('has-alert', count > 0);
  document.title = count ? `(${count}) Bubbly-fi POS` : 'Bubbly-fi POS v2.6.12';
  const list = $('#newRequestList');
  if (list) {
    list.innerHTML = pending.length ? pending.slice(0,6).map(r => `<div class="rank-row"><div><button type="button" data-dashboard-request="${r.id}">${escapeHtml(r.customer_name || 'Customer')} · ${escapeHtml(r.request_no || 'New request')}</button><small>${formatDateTime(r.created_at)} · ${escapeHtml(r.phone || '')}</small></div><strong>${peso.format(Number(r.total || 0))}</strong></div>`).join('') : '<div class="empty">No new customer requests.</div>';
  }
  const enableButton = $('#enableNotificationsBtn');
  if (enableButton) {
    const audioSupported = Boolean(window.AudioContext || window.webkitAudioContext);
    const voiceSupported = 'speechSynthesis' in window;
    enableButton.classList.toggle('hidden', !audioSupported && !voiceSupported && !('Notification' in window));
    enableButton.textContent = state.soundVoiceEnabled ? '🔊 Test Filipino voice alert' : '🔔 Enable Filipino voice alerts';
  }
}
function showRequestPopup(request) {
  state.latestRequestId = request.id;
  const popup = $('#newRequestPopup');
  const copy = $('#newRequestPopupText');
  if (!popup || !copy) return;
  copy.textContent = `${request.customer_name || 'Customer'} · ${requestLocationLabel(request)} · ${request.request_no || 'New booking'} · ${peso.format(Number(request.total || 0))}`;
  popup.classList.remove('hidden'); popup.classList.add('show');
  clearTimeout(showRequestPopup.t);
  showRequestPopup.t = setTimeout(() => { popup.classList.remove('show'); popup.classList.add('hidden'); }, 12000);
}
function notifyNewCustomerRequest(request) {
  if (!request?.id || state.notifiedRequestIds.has(request.id)) return;
  state.notifiedRequestIds.add(request.id);
  state.latestRequestId = request.id;
  renderRequestNotifications();
  const alertButton = $('#requestAlertBtn');
  if (alertButton) { alertButton.classList.remove('pulse'); void alertButton.offsetWidth; alertButton.classList.add('pulse'); }
  queueRequestAlarmAndVoice(request);
  showRequestPopup(request);
  toast(`New customer request from ${request.customer_name || 'customer'} · ${requestLocationLabel(request)}`, 7000);
  if ('Notification' in window && Notification.permission === 'granted') {
    const browserNotice = new Notification('New Bubbly-fi customer request', {
      body: `${request.customer_name || 'Customer'} · ${requestLocationLabel(request)} · ${request.request_no || ''} · ${peso.format(Number(request.total || 0))}`,
      icon: 'assets/logo.png', badge: 'assets/logo.png', tag: `bubblyfi-request-${request.id}`
    });
    browserNotice.onclick = () => { window.focus(); openRequestQueue(request.id); browserNotice.close(); };
  }
}
function registerStaffDeviceForPush() {
  if (!window.AndroidBridge?.getFcmToken) return;
  window.onFcmToken = async token => {
    if (!token) return;
    try { await sb.rpc('upsert_staff_push_token', { p_fcm_token: token }); }
    catch (error) { console.warn('Could not register this device for push notifications:', error); }
  };
  window.AndroidBridge.getFcmToken();
}
async function notifyRiderApproaching(orderId, buttonEl) {
  if (!navigator.geolocation) { toast('GPS is not available on this device.'); return; }
  if (buttonEl) buttonEl.disabled = true;
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { data, error } = await sb.rpc('notify_rider_approaching', {
        p_order_id: orderId,
        p_rider_lat: position.coords.latitude,
        p_rider_lng: position.coords.longitude
      });
      if (error) throw error;
      toast(data?.distance_m != null ? `Customer notified · ${Math.round(data.distance_m)} m away` : 'Customer notified.');
    } catch (error) {
      toast(error.message || 'Could not notify the customer.');
    } finally {
      if (buttonEl) buttonEl.disabled = false;
    }
  }, error => {
    toast(`Could not read GPS: ${error.message}`);
    if (buttonEl) buttonEl.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
async function enableBookingAlerts() {
  try {
    state.soundVoiceEnabled = true;
    try { localStorage.setItem(BOOKING_ALERT_PREF_KEY, 'enabled'); } catch (_) {}
    await primeBookingAlertAudio();
    let permissionMessage = '';
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      permissionMessage = permission === 'granted' ? ' Browser notifications are also enabled.' : ' Browser notifications were not enabled.';
    }
    renderRequestNotifications();
    await playRequestAlarm();
    await speakRequestAnnouncement({ customer_name: 'Test customer', place: 'cubao' });
    toast(`Alarm and Filipino-style voice booking alerts are enabled.${permissionMessage}`, 6500);
  } catch (error) {
    console.error(error);
    toast('Could not enable alarm and Filipino-style voice alerts on this browser.');
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value));
}
function localDateTimeInput(date = new Date()) {
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function isAdmin() { return state.profile?.role === 'admin'; }
function currentCustomer() { return state.customers.find(c => c.id === state.draft.customerId) || state.customers.find(c => c.name === 'Walk-in Customer') || state.customers[0]; }
function normalizedCategory(value = '') { return String(value).trim().toLowerCase().replace(/[_-]+/g,' '); }
function activeInventoryByCategory(category) {
  const target = normalizedCategory(category);
  return state.inventory.filter(item => item.is_active !== false && normalizedCategory(item.category) === target);
}
function normalizeProductName(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function findDefaultFullServiceProduct(kind) {
  const targetCategory = kind === 'detergent' ? 'detergent' : 'fabric conditioner';
  const acceptedNames = kind === 'detergent'
    ? ['champion']
    : ['downey antibac', 'downy antibac', 'downey anti bac', 'downy anti bac'];
  return state.inventory.find(item =>
    item.is_active !== false &&
    normalizedCategory(item.category) === targetCategory &&
    acceptedNames.includes(normalizeProductName(item.name))
  ) || null;
}
function isFullServiceDraft() {
  return state.draft.fullService === true && state.draft.service === 'wash_dry_fold';
}
function fullServicePresetPrice(placeKey = state.draft.place) {
  return Math.max(0,
    serviceRate('wash_dry_fold', placeKey)
    + defaultWashProductPrice('detergent')
    + defaultWashProductPrice('conditioner')
    + (Number(state.settings.addon_zonrox_colorsafe) || 0)
    - (Number(state.settings.full_service_discount) || 5)
  );
}
function applyFullServicePreset() {
  const defaultDetergent = findDefaultFullServiceProduct('detergent');
  const defaultConditioner = findDefaultFullServiceProduct('conditioner');
  state.draft.service = 'wash_dry_fold';
  state.draft.fullService = true;
  state.draft.quantity = loadTypeCapacity(state.draft.itemType);
  state.draft.extraDry = false;
  state.draft.extraWash = false;
  state.draft.warmHotWash = false;
  state.draft.zonroxColorsafe = true;
  state.draft.extraDetergent = false;
  state.draft.extraConditioner = false;
  state.draft.detergentChoice = defaultDetergent?.id || 'included';
  state.draft.conditionerChoice = defaultConditioner?.id || 'included';
  toast('Full Service selected: Champion detergent, Downey Antibac, and Zonrox Color Safe 30 ml, with ₱5 off.');
}
function defaultWashProductPrice(kind) {
  const modernKey = kind === 'detergent' ? 'default_detergent_price' : 'default_conditioner_price';
  const legacyKey = kind === 'detergent' ? 'included_detergent_value' : 'included_conditioner_value';
  return Number(state.settings[modernKey] ?? state.settings[legacyKey]) || 0;
}
function selectedWashProduct(kind) {
  if (isFullServiceDraft()) {
    const defaultItem = findDefaultFullServiceProduct(kind);
    return {
      id: defaultItem?.id || null,
      name: defaultItem?.name || (kind === 'detergent' ? 'Champion' : 'Downey Antibac'),
      source: defaultItem ? 'inventory' : 'included',
      pricePerLoad: defaultWashProductPrice(kind)
    };
  }
  const choice = kind === 'detergent' ? state.draft.detergentChoice : state.draft.conditionerChoice;
  if (!choice) return null;
  if (choice === 'none') return { id: null, name: 'None', source: 'none', pricePerLoad: 0 };
  if (choice === 'customer_provided' || choice === 'bring_own') return { id: null, name: 'Bring your own', source: 'bring_own', pricePerLoad: 0 };
  const item = state.inventory.find(row => row.id === choice && row.is_active !== false);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    source: 'inventory',
    pricePerLoad: Number(item.customer_price_per_load ?? defaultWashProductPrice(kind)) || 0
  };
}
function formatSignedPeso(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) < 0.005) return peso.format(0);
  return amount > 0 ? `+${peso.format(amount)}` : peso.format(amount);
}
function washProductPriceNote(item, kind) {
  const price = Number(item.customer_price_per_load ?? defaultWashProductPrice(kind)) || 0;
  return `${peso.format(price)}/load`;
}
function serviceRate(serviceKey, placeKey) {
  const service = services[serviceKey] || services.wash_dry_fold;
  if (service.priceKey && state.settings[service.priceKey] !== undefined && state.settings[service.priceKey] !== null) return Number(state.settings[service.priceKey]) || 0;
  // Outside Cubao uses the same service rates as Within Cubao. LalaMove is quoted separately.
  const effectivePlace = placeKey === 'outside' ? 'cubao' : placeKey;
  const modernKey = service.priceKeys?.[effectivePlace];
  if (modernKey && state.settings[modernKey] !== undefined && state.settings[modernKey] !== null) return Number(state.settings[modernKey]) || 0;
  const legacyKey = places[effectivePlace]?.priceKey;
  return Number(state.settings[legacyKey]) || 0;
}
function serviceLabel(serviceKey) {
  return services[serviceKey]?.label || String(serviceKey || 'Unknown service').replaceAll('_',' ');
}
function analyticsServiceLabel(serviceKey) {
  // Earlier “regular” orders represent the former full-service offering.
  return serviceKey === 'regular' ? 'Wash • Dry • Fold' : serviceLabel(serviceKey);
}
function serviceIncludesWash(serviceKey, extraWash = false) {
  return ['wash','wash_dry_fold','wash_dry_only','wash_only','regular'].includes(serviceKey) || Boolean(extraWash);
}
function currentLoadType() { return loadTypes[state.draft.itemType] || loadTypes.assorted_clothes; }
function loadTypeCapacity(itemType = state.draft.itemType) {
  const type = loadTypes[itemType] || loadTypes.assorted_clothes;
  return Math.max(type.unit === 'pc' ? 1 : 0.5, Number(state.settings[type.capacityKey] ?? type.capacity) || type.capacity);
}
function calculateDraft() {
  const service = services[state.draft.service] || services.wash_dry_fold;
  const place = places[state.draft.place];
  const itemType = currentLoadType();
  const capacity = loadTypeCapacity();
  const loads = Math.max(1, Math.ceil(Number(state.draft.quantity || 0) / capacity));
  const rate = serviceRate(state.draft.service, state.draft.place);
  const hasWash = serviceIncludesWash(state.draft.service, state.draft.extraWash);
  if (isFullServiceDraft()) state.draft.zonroxColorsafe = true;
  const extraDryRate = state.draft.extraDry ? Number(state.settings.addon_extra_dry) || 0 : 0;
  const extraWashRate = state.draft.extraWash ? Number(state.settings.addon_extra_wash) || 0 : 0;
  const warmHotRate = state.draft.warmHotWash && hasWash ? Number(state.settings.addon_warm_hot_wash) || 0 : 0;
  const zonroxRate = state.draft.zonroxColorsafe && hasWash ? Number(state.settings.addon_zonrox_colorsafe) || 0 : 0;
  const extraDetergentRate = state.draft.extraDetergent && hasWash ? defaultWashProductPrice('detergent') : 0;
  const extraConditionerRate = state.draft.extraConditioner && hasWash ? defaultWashProductPrice('conditioner') : 0;
  const addonPerLoad = extraDryRate + extraWashRate + warmHotRate + zonroxRate + extraDetergentRate + extraConditionerRate;
  const baseSubtotal = loads * rate;
  const addonTotal = loads * addonPerLoad;
  const detergent = hasWash ? selectedWashProduct('detergent') : null;
  const conditioner = hasWash ? selectedWashProduct('conditioner') : null;
  const detergentPricePerLoad = hasWash ? Number(detergent?.pricePerLoad || 0) : 0;
  const conditionerPricePerLoad = hasWash ? Number(conditioner?.pricePerLoad || 0) : 0;
  const detergentTotal = loads * detergentPricePerLoad;
  const conditionerTotal = loads * conditionerPricePerLoad;
  const washProductTotal = detergentTotal + conditionerTotal;
  const fullServiceDiscount = isFullServiceDraft() ? loads * (Number(state.settings.full_service_discount) || 5) : 0;
  const subtotal = Math.max(0, baseSubtotal + washProductTotal + addonTotal - fullServiceDiscount);
  const delivery = state.draft.delivery && state.draft.place !== 'outside'
    ? Number(state.draft.place === 'mplace' ? state.settings.delivery_mplace : state.settings.delivery_standard) || 0
    : 0;
  return {
    service, place, itemType, capacity, loads, rate, hasWash,
    extraDryRate, extraWashRate, warmHotRate, zonroxRate, extraDetergentRate, extraConditionerRate,
    addonPerLoad, addonTotal, baseSubtotal, detergent, conditioner, detergentPricePerLoad,
    conditionerPricePerLoad, detergentTotal, conditionerTotal, washProductTotal,
    fullServiceDiscount, subtotal, delivery, total: subtotal + delivery, unit: itemType.unit
  };
}
function orderAddonLabels(order) {
  const labels = [];
  if (order.full_service) labels.push('Full Service');
  if (order.extra_dry) labels.push('Extra dry');
  if (order.extra_wash) labels.push('Extra wash');
  if (order.warm_hot_wash) labels.push('Warm / hot wash');
  if (order.zonrox_colorsafe) labels.push('Zonrox Color Safe 30 ml');
  if (order.extra_detergent) labels.push('Additional detergent');
  if (order.extra_conditioner) labels.push('Additional fabric conditioner');
  return labels;
}
async function confirmAction(title, text) {
  $('#confirmTitle').textContent = title; $('#confirmText').textContent = text;
  const d = $('#confirmDialog'); d.showModal(); return await new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'confirm'), { once:true }));
}

function xhrJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url, true);
    xhr.timeout = options.timeout || 15000;
    Object.entries(options.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onload = () => {
      let body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { body = xhr.responseText; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error(`Network request blocked (XHR status ${xhr.status || 0}).`));
    xhr.ontimeout = () => reject(new Error('Supabase Auth request timed out after 15 seconds.'));
    xhr.send(options.body || null);
  });
}

async function directPasswordLogin(email, password) {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json'
  };
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ email, password }),
      mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || `Supabase Auth returned HTTP ${response.status}.`);
    return body;
  } catch (fetchError) {
    console.warn('Fetch login failed; trying XMLHttpRequest fallback.', fetchError);
    try {
      const xhr = await xhrJson(url, { method: 'POST', headers, body: JSON.stringify({ email, password }) });
      if (!xhr.ok) throw new Error(xhr.body?.msg || xhr.body?.message || xhr.body?.error_description || `Supabase Auth returned HTTP ${xhr.status}.`);
      return xhr.body;
    } catch (xhrError) {
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'none in page';
      throw new Error(
        `Browser could not send the login request to Supabase. Origin: ${location.origin}. ` +
        `Fetch: ${fetchError?.message || fetchError}. XHR: ${xhrError?.message || xhrError}. ` +
        `Page CSP: ${csp}. Open DevTools > Console; a “Refused to connect” message means the host is sending a connect-src policy that blocks supabase.co.`
      );
    }
  }
}

async function signIn(username, password) {
  const normalized = username.trim().toLowerCase();
  const email = usernameEmail[normalized] || (normalized.includes('@') ? normalized : '');
  if (!email) throw new Error('Use admin or operator as the username.');
  const token = await directPasswordLogin(email, password);
  if (!token?.access_token || !token?.refresh_token) throw new Error('Supabase returned an incomplete login response.');
  const { data, error } = await sb.auth.setSession({ access_token: token.access_token, refresh_token: token.refresh_token });
  if (error) throw error;
  return data;
}
async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('id,display_name,role').eq('id', userId).single();
  if (error) throw new Error('Profile is missing. Run the setup SQL and assign this user a role.');
  if (!['admin','operator'].includes(data.role)) throw new Error('This account has no permitted role.');
  state.profile = data;
}
async function initializeSession(session) {
  state.session = session;
  if (!session) { showLogin(); return; }
  try {
    await loadProfile(session.user.id);
    await loadCloudData();
    showApp();
    subscribeRealtime();
    registerStaffDeviceForPush();
  } catch (e) {
    console.error(e); $('#loginMessage').textContent = e.message; await sb.auth.signOut(); showLogin();
  }
}
function showLogin() { $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
function showApp() {
  $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  $('#currentUserName').textContent = state.profile.display_name || state.profile.role;
  $('#currentUserRole').textContent = state.profile.role;
  $$('[data-admin-only]').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  if (!isAdmin() && state.page === 'settings') state.page = 'dashboard';
  renderAll();
}
async function loadCloudData() {
  setSaveStatus('Loading cloud…','saving');
  const [settingsRes, customersRes, ordersRes, inventoryRes, requestsRes] = await Promise.all([
    sb.from('settings').select('*').eq('id',1).single(),
    sb.from('customers').select('*').order('name'),
    sb.from('orders').select('*,customers(name,phone)').order('created_at',{ascending:false}),
    sb.from('inventory').select('*').order('name'),
    sb.from('customer_order_requests').select('*').order('created_at',{ascending:false})
  ]);
  for (const r of [settingsRes, customersRes, ordersRes, inventoryRes, requestsRes]) if (r.error) throw r.error;
  state.settings = { ...defaultSettings, ...settingsRes.data };
  state.customers = customersRes.data || [];
  state.orders = ordersRes.data || [];
  state.inventory = inventoryRes.data || [];
  state.requests = requestsRes.data || [];
  const walkin = state.customers.find(c => c.name === 'Walk-in Customer');
  if (walkin) state.draft.customerId = walkin.id;
  setSaveStatus('Saved in cloud');
}
function subscribeRealtime() {
  state.channels.forEach(ch => sb.removeChannel(ch)); state.channels = [];
  ['customers','orders','inventory','settings'].forEach(table => {
    const ch = sb.channel(`bubblyfi-${table}`).on('postgres_changes',{event:'*',schema:'public',table}, async () => {
      try { await loadCloudData(); renderAll(); } catch(e) { console.error(e); }
    }).subscribe(); state.channels.push(ch);
  });
  const requestChannel = sb.channel('bubblyfi-customer-order-requests')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'customer_order_requests'}, async payload => {
      try {
        await loadCloudData(); renderAll();
        const request = state.requests.find(r => r.id === payload.new?.id) || payload.new;
        notifyNewCustomerRequest(request);
      } catch(e) { console.error(e); }
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'customer_order_requests'}, async () => {
      try { await loadCloudData(); renderAll(); } catch(e) { console.error(e); }
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'customer_order_requests'}, async () => {
      try { await loadCloudData(); renderAll(); } catch(e) { console.error(e); }
    })
    .subscribe();
  state.channels.push(requestChannel);
}

function renderPage() {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${state.page}`));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
  const meta = {
    dashboard:['Dashboard','Live business overview'], pos:['New Order','Fast touch-first order entry'], orders:['Orders','Search and update all cloud orders'],
    requests:['Customer Requests','Public pickup bookings and GCash submissions'], customers:['Customers','Customer records and history'], inventory:['Inventory','Supplies and stock levels'], settings:['Controls','Admin pricing and capacity settings']
  }[state.page];
  $('#pageTitle').textContent = meta[0]; $('#pageSubtitle').textContent = meta[1];
}
function renderDashboard() {
  const now = new Date(); const monthStart = new Date(now.getFullYear(),now.getMonth(),1);
  const activeOrders = state.orders.filter(o => !o.is_void);
  const monthOrders = activeOrders.filter(o => new Date(o.created_at) >= monthStart);
  const todayKey = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(now);
  const todayOrders = activeOrders.filter(o => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date(o.created_at)) === todayKey);
  const paid = rows => rows.filter(o => o.payment_status === 'Paid');
  const sum = rows => rows.reduce((a,o)=>a+Number(o.total||0),0);
  const unpaid = activeOrders.filter(o=>o.payment_status!=='Paid').reduce((a,o)=>a+Number(o.total||0),0);
  const pendingRequestCount = pendingCustomerRequests().length;
  $('#kpiGrid').innerHTML = [
    ['Today sales',peso.format(sum(paid(todayOrders)))],['Today orders',todayOrders.length],['This month',peso.format(sum(paid(monthOrders)))],['Outstanding',peso.format(unpaid)],['New requests',pendingRequestCount]
  ].map(([l,v],index)=>`<article class="kpi ${index===4&&pendingRequestCount?'request-kpi-alert':''}"><span>${l}</span><strong>${v}</strong></article>`).join('');

  const byCustomer = groupSum(monthOrders.filter(o=>o.payment_status==='Paid'), o=>o.customers?.name||'Unknown', o=>Number(o.total));
  renderRank('#salesByCustomer', byCustomer, peso.format.bind(peso));
  const byPlace = groupSum(monthOrders.filter(o=>o.payment_status==='Paid'), o=>places[o.place]?.label||o.place, o=>Number(o.total));
  renderRank('#salesByPlace', byPlace, peso.format.bind(peso));
  const byService = groupSum(monthOrders.filter(o=>o.payment_status==='Paid'), o=>analyticsServiceLabel(o.service_type), o=>Number(o.total));
  renderRank('#salesByService', byService, peso.format.bind(peso));
  const byDay = groupSum(monthOrders.filter(o=>o.payment_status==='Paid'), o=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'Asia/Manila'}).format(new Date(o.created_at)), o=>Number(o.total));
  renderBars('#salesByWeekday', weekdayOrder.map(d=>[d,byDay[d]||0]));
  const attention = activeOrders.filter(o=>o.status==='Ready'||o.payment_status!=='Paid').slice(0,8);
  $('#attentionList').innerHTML = attention.length ? attention.map(o=>`<div class="rank-row"><div><strong>${escapeHtml(o.customers?.name||'Walk-in')}</strong><small>${escapeHtml(o.status)} · ${escapeHtml(o.payment_status)}</small></div><strong>${peso.format(o.total)}</strong></div>`).join('') : '<div class="empty">No urgent orders.</div>';
  renderRequestNotifications();
}
function groupSum(rows,keyFn,valueFn){return rows.reduce((m,r)=>{const k=keyFn(r);m[k]=(m[k]||0)+valueFn(r);return m;},{});}
function renderRank(sel,obj,formatter){const rows=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,8);$(sel).innerHTML=rows.length?rows.map(([k,v],i)=>`<div class="rank-row"><div><strong>${i+1}. ${escapeHtml(k)}</strong></div><strong>${formatter(v)}</strong></div>`).join(''):'<div class="empty">No sales data yet.</div>';}
function renderBars(sel,rows){const max=Math.max(1,...rows.map(r=>r[1]));$(sel).innerHTML=rows.map(([k,v])=>`<div class="bar-row"><span>${k.slice(0,3)}</span><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div><strong>${peso.format(v)}</strong></div>`).join('');}

function renderPosChoices() {
  const customerFilter = $('#customerSearch').value.trim().toLowerCase();
  const filtered = state.customers.filter(c => !c.is_archived && (!customerFilter || `${c.name} ${c.phone||''}`.toLowerCase().includes(customerFilter))).slice(0,12);
  $('#customerChips').innerHTML = filtered.map(c=>`<button class="choice-card ${state.draft.customerId===c.id?'selected':''}" data-customer-id="${c.id}"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.phone||places[c.default_place]?.label||'')}</span></button>`).join('') || '<div class="empty">No customer found.</div>';
  const fullServiceCard = `<button class="choice-card service-card full-service-card ${isFullServiceDraft()?'selected':''}" data-full-service="true"><span class="icon">⭐</span><strong>Full Service (1 click)</strong><span>Detergent + fabric conditioner + Zonrox Color Safe 30 ml</span><em>${peso.format(fullServicePresetPrice())}/load · save ${peso.format(Number(state.settings.full_service_discount)||5)}</em></button>`;
  $('#serviceChoices').innerHTML = fullServiceCard + Object.entries(services).filter(([,s])=>!s.legacy).map(([key,s])=>{
    const rate=serviceRate(key,state.draft.place);
    return `<button class="choice-card service-card ${state.draft.service===key&&!isFullServiceDraft()?'selected':''}" data-service="${key}"><span class="icon">${s.icon}</span><strong>${s.label}</strong><span>${escapeHtml(s.description)}</span><em>${peso.format(rate)}/load</em></button>`;
  }).join('');
  $('#itemTypeChoices').innerHTML = Object.entries(loadTypes).map(([key,t])=>`<button class="choice-card ${state.draft.itemType===key?'selected':''}" data-item-type="${key}"><span class="icon">${t.icon}</span><strong>${t.label}</strong><span>${t.note}</span></button>`).join('');
  $('#placeChoices').innerHTML = Object.entries(places).map(([key,p])=>`<button class="choice-card ${state.draft.place===key?'selected':''}" data-place="${key}"><span class="icon">${p.icon}</span><strong>${p.label}</strong><span>${peso.format(isFullServiceDraft()?fullServicePresetPrice(key):serviceRate(state.draft.service,key))}/load</span></button>`).join('');
  const outsideDelivery = state.draft.place === 'outside';
  const delFee = outsideDelivery ? 0 : (state.draft.place==='mplace'?state.settings.delivery_mplace:state.settings.delivery_standard);
  $('#deliveryChoices').innerHTML = `<button class="choice-card ${!state.draft.delivery?'selected':''}" data-delivery="false"><span class="icon">🏪</span><strong>Self pickup</strong><span>No delivery fee</span></button><button class="choice-card ${state.draft.delivery?'selected':''}" data-delivery="true"><span class="icon">🛵</span><strong>${outsideDelivery?'LalaMove pickup / delivery':'Two-way pickup & delivery'}</strong><span>${outsideDelivery?'Rate not included':peso.format(delFee)}</span></button>`;
  const washAvailable = serviceIncludesWash(state.draft.service, state.draft.extraWash);
  if (!washAvailable) { state.draft.warmHotWash=false; state.draft.zonroxColorsafe=false; state.draft.extraDetergent=false; state.draft.extraConditioner=false; }
  if (isFullServiceDraft()) state.draft.zonroxColorsafe = true;
  const addOns = [
    { key:'extraDry', icon:'💨', label:'Extra dry', description:'Additional drying cycle', price:Number(state.settings.addon_extra_dry)||0, enabled:true },
    { key:'extraWash', icon:'🔁', label:'Extra wash', description:'Additional washing cycle', price:Number(state.settings.addon_extra_wash)||0, enabled:true },
    { key:'warmHotWash', icon:'♨️', label:'Warm / hot wash', description:washAvailable?'Use warm or hot water':'Select a wash service or Extra wash first', price:Number(state.settings.addon_warm_hot_wash)||0, enabled:washAvailable },
    { key:'extraDetergent', icon:'🧴', label:'Additional detergent', description:'Add another detergent dose', price:defaultWashProductPrice('detergent'), enabled:washAvailable },
    { key:'extraConditioner', icon:'🌸', label:'Additional fabric conditioner', description:'Add another conditioner dose', price:defaultWashProductPrice('conditioner'), enabled:washAvailable },
    { key:'zonroxColorsafe', icon:'🧽', label:'Zonrox Color Safe 30 ml', description:isFullServiceDraft()?'Included in Full Service':'Color-safe bleach treatment', price:Number(state.settings.addon_zonrox_colorsafe)||0, enabled:washAvailable && !isFullServiceDraft(), included:isFullServiceDraft() }
  ];
  $('#addonChoices').innerHTML = addOns.map(a=>`<button class="choice-card addon-card ${(state.draft[a.key]||a.included)?'selected':''} ${!a.enabled&&!a.included?'disabled-choice':''}" data-addon="${a.key}" ${(a.included||!a.enabled)?'disabled':''}><span class="icon">${a.icon}</span><strong>${a.label}</strong><span>${a.description}</span><em>${a.included?'Included':`+${peso.format(a.price)}/load`}</em></button>`).join('');
  $('#washProductsPanel').classList.toggle('hidden', !washAvailable || isFullServiceDraft());
  const detergents = activeInventoryByCategory('Detergent');
  const conditioners = activeInventoryByCategory('Fabric conditioner');
  $('#detergentChoices').innerHTML = [
    ...detergents.map(item => `<button class="choice-card product-card ${state.draft.detergentChoice===item.id?'selected':''} ${Number(item.stock)<=0?'out-of-stock':''}" data-detergent-choice="${item.id}" ${Number(item.stock)<=0?'disabled':''}><span class="icon">🧴</span><strong>${escapeHtml(item.name)}</strong><span class="product-stock">Stock: ${Number(item.stock).toLocaleString('en-PH')}</span><span class="price-note">+${washProductPriceNote(item,'detergent')}</span></button>`),
    `<button class="choice-card product-card ${state.draft.detergentChoice==='bring_own'?'selected':''}" data-detergent-choice="bring_own"><span class="icon">👜</span><strong>Bring your own</strong><span>Customer supplies detergent</span><span class="price-note saving-note">${peso.format(0)}/load</span></button>`
  ].join('');
  $('#conditionerChoices').innerHTML = [
    ...conditioners.map(item => `<button class="choice-card product-card ${state.draft.conditionerChoice===item.id?'selected':''} ${Number(item.stock)<=0?'out-of-stock':''}" data-conditioner-choice="${item.id}" ${Number(item.stock)<=0?'disabled':''}><span class="icon">🌸</span><strong>${escapeHtml(item.name)}</strong><span class="product-stock">Stock: ${Number(item.stock).toLocaleString('en-PH')}</span><span class="price-note">+${washProductPriceNote(item,'conditioner')}</span></button>`),
    `<button class="choice-card product-card ${state.draft.conditionerChoice==='bring_own'?'selected':''}" data-conditioner-choice="bring_own"><span class="icon">👜</span><strong>Bring your own</strong><span>Customer supplies conditioner</span><span class="price-note saving-note">${peso.format(0)}/load</span></button>`,
    `<button class="choice-card product-card ${state.draft.conditionerChoice==='none'?'selected':''}" data-conditioner-choice="none"><span class="icon">🚫</span><strong>None</strong><span>No fabric conditioner</span><span class="price-note saving-note">${peso.format(0)}/load</span></button>`
  ].join('');
  $('#paymentChoices').innerHTML = payments.map(p=>`<button class="choice-card ${state.draft.payment===p?'selected':''}" data-payment="${p}"><strong>${p==='Cash'?'💵 ':p==='GCash'?'📱 ':p==='Maya'?'💳 ':p==='Bank Transfer'?'🏦 ':'⏳ '}${p}</strong></button>`).join('');
  renderSummary();
}
function renderSummary() {
  const c = currentCustomer(); const calc = calculateDraft();
  $('#qtyValue').textContent = state.draft.quantity; $('#qtyUnit').textContent = calc.unit;
  $('#summaryCustomer').textContent = c?.name || 'Select customer';
  $('#summaryService').textContent = isFullServiceDraft() ? 'Full Service' : calc.service.label;
  $('#summaryQty').textContent = `${state.draft.quantity} ${calc.unit} · ${calc.itemType.label}`; $('#summaryLoads').textContent=calc.loads;
  const detergent = selectedWashProduct('detergent');
  const conditioner = selectedWashProduct('conditioner');
  const addonLabels = [state.draft.extraDry?'Extra dry':null,state.draft.extraWash?'Extra wash':null,state.draft.warmHotWash&&calc.hasWash?'Warm / hot wash':null,state.draft.zonroxColorsafe&&calc.hasWash?'Zonrox Color Safe 30 ml':null,state.draft.extraDetergent&&calc.hasWash?'Additional detergent':null,state.draft.extraConditioner&&calc.hasWash?'Additional fabric conditioner':null].filter(Boolean);
  $('#summaryPlace').textContent=calc.place.label; $('#summaryRate').textContent=peso.format(calc.rate);
  $('#summaryAddons').textContent=addonLabels.length?`${addonLabels.join(', ')} · ${peso.format(calc.addonTotal)}`:peso.format(0);
  $('#summaryDelivery').textContent=state.draft.delivery&&state.draft.place==='outside'?'LalaMove rate (not included)':peso.format(calc.delivery);
  const productTotalEl = $('#summaryProductAdjustment');
  productTotalEl.textContent = calc.hasWash ? peso.format(calc.washProductTotal) : peso.format(0);
  productTotalEl.classList.remove('adjustment-negative','adjustment-positive');
  $('#summaryDetergent').textContent=calc.hasWash?(detergent ? `${detergent.name} · ${peso.format(detergent.pricePerLoad)}/load` : 'Not selected'):'Not required';
  $('#summaryConditioner').textContent=calc.hasWash?(conditioner ? `${conditioner.name} · ${peso.format(conditioner.pricePerLoad)}/load` : 'Not selected'):'Not required';
  $('#summaryTotal').textContent=peso.format(calc.total);
}
function resetDraft() {
  const walkin=state.customers.find(c=>c.name==='Walk-in Customer'&&!c.is_archived); state.draft={customerId:walkin?.id||state.customers[0]?.id||null,service:'wash_dry_fold',itemType:'assorted_clothes',fullService:false,place:'cubao',delivery:false,quantity:loadTypeCapacity('assorted_clothes'),payment:'Cash',detergentChoice:'',conditionerChoice:'',extraDry:false,extraWash:false,warmHotWash:false,zonroxColorsafe:false,extraDetergent:false,extraConditioner:false};
  $('#orderStatus').value='Received'; $('#pickupAt').value=''; $('#orderNotes').value=''; renderPosChoices();
}
async function saveOrder() {
  const customer=currentCustomer(); if(!customer){toast('Add or select a customer first.');return;}
  const calc=calculateDraft();
  const detergent=calc.hasWash?selectedWashProduct('detergent'):null;
  const conditioner=calc.hasWash?selectedWashProduct('conditioner'):null;
  if(calc.hasWash&&!isFullServiceDraft()&&!detergent){toast('Select the detergent used for this wash order.');return;}
  if(calc.hasWash&&!isFullServiceDraft()&&!conditioner){toast('Select the fabric conditioner used, or choose No conditioner.');return;}
  setSaveStatus('Saving order…','saving'); $('#saveOrderBtn').disabled=true;
  const payload={customer_id:customer.id,service_type:state.draft.service,item_type:state.draft.itemType,full_service:isFullServiceDraft(),quantity:Number(state.draft.quantity),unit:calc.unit,loads:calc.loads,place:state.draft.place,rate_per_load:calc.rate,delivery_type:state.draft.delivery?'two_way':'self_pickup',delivery_fee:calc.delivery,detergent_item_id:detergent?.id||null,detergent_name:detergent?.name||null,detergent_source:detergent?.source||null,detergent_price_per_load:calc.hasWash?calc.detergentPricePerLoad:0,conditioner_item_id:conditioner?.id||null,conditioner_name:conditioner?.name||null,conditioner_source:conditioner?.source||null,conditioner_price_per_load:calc.hasWash?calc.conditionerPricePerLoad:0,wash_product_adjustment:calc.washProductTotal,wash_product_total:calc.washProductTotal,extra_dry:Boolean(state.draft.extraDry),extra_wash:Boolean(state.draft.extraWash),warm_hot_wash:Boolean(state.draft.warmHotWash&&calc.hasWash),zonrox_colorsafe:Boolean(state.draft.zonroxColorsafe&&calc.hasWash),extra_detergent:Boolean(state.draft.extraDetergent&&calc.hasWash),extra_conditioner:Boolean(state.draft.extraConditioner&&calc.hasWash),full_service_discount_total:calc.fullServiceDiscount,addon_total:calc.addonTotal,status:$('#orderStatus').value,payment_method:state.draft.payment==='Unpaid'?null:state.draft.payment,payment_status:state.draft.payment==='Unpaid'?'Unpaid':'Paid',pickup_at:$('#pickupAt').value?new Date($('#pickupAt').value).toISOString():null,notes:$('#orderNotes').value.trim(),subtotal:calc.subtotal,total:calc.total,created_by:state.profile.id};
  const {data,error}=await sb.from('orders').insert(payload).select('id,receipt_no').single();
  $('#saveOrderBtn').disabled=false;
  if(error){setSaveStatus('Save failed','error');toast(error.message);return;}
  await sb.from('activity_logs').insert({user_id:state.profile.id,action:'create',entity_type:'order',entity_id:data.id,details:{receipt_no:data.receipt_no,total:calc.total,detergent:detergent?.name||'Not required',detergent_price_per_load:calc.detergentPricePerLoad,conditioner:conditioner?.name||'Not required',conditioner_price_per_load:calc.conditionerPricePerLoad,wash_product_total:calc.washProductTotal,add_ons:[state.draft.extraDry?'Extra dry':null,state.draft.extraWash?'Extra wash':null,state.draft.warmHotWash&&calc.hasWash?'Warm / hot wash':null].filter(Boolean)}});
  const { data: savedInventory } = await sb.from('orders').select('inventory_deduction_details').eq('id', data.id).single();
  const inventoryDetails = Array.isArray(savedInventory?.inventory_deduction_details) ? savedInventory.inventory_deduction_details : [];
  const inventoryIssues = inventoryDetails.filter(item => ['not_configured','missing'].includes(String(item?.status || '').toLowerCase()));
  setSaveStatus('Saved in cloud');
  toast(inventoryIssues.length
    ? `Order ${data.receipt_no||''} saved, but ${inventoryIssues.length} inventory item(s) need Admin repair.`
    : `Order ${data.receipt_no||''} saved · inventory adjusted`);
  resetDraft();await loadCloudData();renderAll();
}

function inventoryDeductionNeedsRepair(order) {
  if (!order?.full_service || order?.is_void) return false;
  const details = Array.isArray(order.inventory_deduction_details) ? order.inventory_deduction_details : [];
  const successful = details.filter(item => ['deducted','shortage'].includes(String(item?.status || '').toLowerCase()));
  const failed = details.some(item => ['not_configured','missing'].includes(String(item?.status || '').toLowerCase()));
  return failed || successful.length < 3;
}

async function repairOrderInventory(orderId) {
  if (!isAdmin()) return toast('Only Admin can repair inventory deductions.');
  setSaveStatus('Repairing inventory…','saving');
  const { data, error } = await sb.rpc('repair_full_service_order_inventory', { p_order_id: orderId });
  if (error) { setSaveStatus('Repair failed','error'); toast(error.message); return; }
  const rows = Array.isArray(data) ? data : [];
  const deducted = rows.reduce((sum, item) => sum + (Number(item?.deducted) || 0), 0);
  setSaveStatus('Saved in cloud');
  toast(rows.length ? `Inventory repaired · ${deducted} unit(s) deducted` : 'Inventory was already adjusted for this order.');
  await loadCloudData();
  renderAll();
}

function renderOrders(){
  const term=$('#orderSearch').value.trim().toLowerCase();
  const selectedStatus=$('#orderStatusFilter').value;
  const filter=selectedStatus === 'all' ? '' : selectedStatus;
  let rows=state.orders.filter(o=>{
    const hay=`${o.receipt_no||''} ${o.customers?.name||''} ${o.service_type||''} ${o.place||''} ${o.status||''} ${o.payment_status||''} ${o.detergent_name||''} ${o.conditioner_name||''} ${orderAddonLabels(o).join(' ')} ${o.is_void?'void':''}`.toLowerCase();
    return (!term || hay.includes(term)) && (!filter || o.status === filter);
  });
  $('#ordersBody').innerHTML=rows.length?rows.map(o=>{
    const voided=Boolean(o.is_void);
    const statusCell=voided?`<span class="pill unpaid">VOID</span>`:`<select class="inline-status" data-order-status-id="${o.id}">${['Received','Washing','Drying','Ready','Claimed'].map(x=>`<option ${o.status===x?'selected':''}>${x}</option>`).join('')}</select>`;
    const actions=voided
      ? `<span class="small">${escapeHtml(o.void_reason||'Voided')}</span>`
      : `<button data-toggle-paid="${o.id}">${o.payment_status==='Paid'?'Unpay':'Pay'}</button>${o.status==='Ready'?`<button data-notify-rider="${o.id}">📍 On my way</button>`:''}${isAdmin()&&inventoryDeductionNeedsRepair(o)?`<button data-repair-inventory="${o.id}">Repair stock</button>`:''}${isAdmin()?`<button class="danger-action" data-void-order="${o.id}">Void</button>`:''}`;
    const includesWash=serviceIncludesWash(o.service_type,o.extra_wash);
    const recordedProductTotal=Number(o.wash_product_total ?? o.wash_product_adjustment) || 0;
    const washProducts=includesWash?`<div class="wash-products-cell"><strong>🧴 ${escapeHtml(o.detergent_name||'Not recorded')} · ${peso.format(Number(o.detergent_price_per_load)||0)}/load</strong><span>🌸 ${escapeHtml(o.conditioner_name||'Not recorded')} · ${peso.format(Number(o.conditioner_price_per_load)||0)}/load</span><span class="price-detail">Products: ${peso.format(recordedProductTotal)}</span></div>`:`<span class="small">Not required</span>`;
    const optionLabels=orderAddonLabels(o);
    const optionsCell=optionLabels.length?`<div class="order-options-cell">${optionLabels.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>`:`<span class="small">None</span>`;
    return `<tr class="${voided?'muted-row':''}"><td>${formatDateTime(o.created_at)}</td><td><strong>${escapeHtml(o.receipt_no||'—')}</strong></td><td>${escapeHtml(o.customers?.name||'—')}</td><td>${escapeHtml(o.full_service?'Full Service':serviceLabel(o.service_type))}<span class="cell-sub">${escapeHtml((loadTypes[o.item_type]||loadTypes.assorted_clothes).label)} · ${o.quantity} ${escapeHtml(o.unit||'kg')}</span></td><td>${escapeHtml(places[o.place]?.label||o.place)}</td><td>${optionsCell}</td><td>${washProducts}</td><td>${statusCell}</td><td><span class="pill ${o.payment_status?.toLowerCase()}">${escapeHtml(o.payment_status)}</span></td><td><strong>${peso.format(o.total)}</strong></td><td><div class="row-actions">${actions}</div></td></tr>`;
  }).join(''):'<tr><td colspan="11" class="empty">No orders found.</td></tr>';
}
async function logAction(action, entityType, entityId = null, details = {}) {
  try {
    const { error } = await sb.from('activity_logs').insert({
      user_id: state.profile.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details
    });
    if (error) console.warn('Activity log failed:', error.message);
  } catch (error) {
    console.warn('Activity log failed:', error);
  }
}

async function updateOrder(id, patch, action = 'update') {
  setSaveStatus('Saving…', 'saving');
  const { error } = await sb.from('orders').update({ ...patch, updated_by: state.profile.id }).eq('id', id);
  if (error) {
    setSaveStatus('Save failed', 'error');
    toast(error.message);
    await loadCloudData().catch(console.error);
    renderAll();
    return;
  }
  await logAction(action, 'order', id, patch);
  setSaveStatus('Saved in cloud');
  await loadCloudData();
  renderAll();
}

function requestAddonLabels(request) {
  return [request.full_service?'Full Service':null, request.extra_dry?'Extra dry':null, request.extra_wash?'Extra wash':null, request.warm_hot_wash?'Warm / hot wash':null, request.zonrox_colorsafe?'Zonrox Color Safe 30 ml':null, request.extra_detergent?'Additional detergent':null, request.extra_conditioner?'Additional fabric conditioner':null].filter(Boolean);
}
async function openPrivateUpload(path) {
  if (!path) return toast('No photo was uploaded.');
  const { data, error } = await sb.storage.from('customer-order-uploads').createSignedUrl(path, 120);
  if (error) return toast(error.message);
  window.open(data.signedUrl, '_blank', 'noopener');
}
async function convertCustomerRequest(id) {
  setSaveStatus('Creating order…','saving');
  const { data, error } = await sb.rpc('confirm_customer_request', { p_request_id: id });
  if (error) {
    setSaveStatus('Conversion failed','error');
    toast(`Order was not created: ${error.message}`);
    await loadCloudData().catch(console.error);
    renderAll();
    return;
  }
  const result = data || {};
  setSaveStatus('Saved in cloud');
  toast(`Request confirmed · order ${result.receipt_no || ''} created`);
  await loadCloudData();
  renderAll();
}

async function updateRequestStatus(id, status) {
  const request = state.requests.find(row => row.id === id);
  if (status === 'Confirmed' && !request?.converted_order_id) {
    await convertCustomerRequest(id);
    return;
  }
  setSaveStatus('Saving request…','saving');
  const patch={status,handled_by:state.profile.id,handled_at:new Date().toISOString()};
  const {error}=await sb.from('customer_order_requests').update(patch).eq('id',id);
  if(error){setSaveStatus('Save failed','error');toast(error.message);await loadCloudData().catch(console.error);renderAll();return;}
  await logAction('customer_request_status','customer_request',id,{status});
  setSaveStatus('Saved in cloud');toast(`Request marked ${status}`);await loadCloudData();renderAll();
}
function renderRequests(){
  const term=$('#requestSearch')?.value.trim().toLowerCase()||'';
  const selected=$('#requestStatusFilter')?.value||'all';
  const rows=state.requests.filter(r=>{
    const hay=`${r.request_no||''} ${r.customer_name||''} ${r.phone||''} ${r.full_address||''} ${r.service_type||''} ${r.status||''}`.toLowerCase();
    return (!term||hay.includes(term))&&(selected==='all'||r.status===selected);
  });
  $('#requestsBody').innerHTML=rows.length?rows.map(r=>{
    const options=requestAddonLabels(r);
    const itemButtons=[r.pickup_photo_path?`<button data-request-file="${escapeHtml(r.pickup_photo_path)}">Pickup photo</button>`:'',...(r.item_photo_paths||[]).map((p,i)=>`<button data-request-file="${escapeHtml(p)}">Item ${i+1}</button>`),r.payment_proof_path?`<button data-request-file="${escapeHtml(r.payment_proof_path)}">Payment proof</button>`:''].filter(Boolean).join('');
    const mapLink=r.maps_url?`<a class="table-link" href="${escapeHtml(r.maps_url)}" target="_blank" rel="noopener">Google Maps ↗</a>`:'No GPS link';
    const products=`🧴 ${escapeHtml(r.detergent_name||'—')} · 🌸 ${escapeHtml(r.conditioner_name||'—')}`; const loadLabel=(loadTypes[r.item_type]||loadTypes.assorted_clothes).label;
    const linkedOrder = r.converted_order_id ? state.orders.find(order => order.id === r.converted_order_id) : null;
    const orderCell = linkedOrder
      ? `<button class="table-link button-link" data-view-request-order="${linkedOrder.id}" data-order-receipt="${escapeHtml(linkedOrder.receipt_no||'')}">${escapeHtml(linkedOrder.receipt_no||'View order')}</button>`
      : (r.status !== 'Rejected'
          ? `<button class="btn secondary compact" data-convert-request="${r.id}">Create order</button>`
          : '<span class="cell-sub">Not created</span>');
    return `<tr><td>${formatDateTime(r.created_at)}</td><td><strong>${escapeHtml(r.request_no)}</strong></td><td><strong>${escapeHtml(r.customer_name)}</strong><span class="cell-sub">${escapeHtml(r.phone)}</span></td><td>${escapeHtml(r.full_service?'Full Service':serviceLabel(r.service_type))}<span class="cell-sub">${escapeHtml(loadLabel)} · ${r.quantity} ${escapeHtml(r.unit)} · ${r.loads} load(s)</span><span class="cell-sub">${products}</span>${options.length?`<span class="cell-sub">${escapeHtml(options.join(', '))}</span>`:''}</td><td><span>${escapeHtml(r.full_address)}</span><span class="cell-sub">${formatDateTime(r.pickup_at)}</span>${mapLink}</td><td><span>${escapeHtml(r.item_description)}</span><div class="row-actions request-files">${itemButtons||'<span class="cell-sub">No photos</span>'}</div></td><td><strong>${escapeHtml(r.payment_reference||'No reference')}</strong><span class="cell-sub">GCash</span></td><td><strong>${peso.format(r.total)}</strong></td><td>${orderCell}</td><td><select data-request-status="${r.id}">${['Pending','Confirmed','Scheduled','Collected','Rejected','Converted'].map(x=>`<option ${r.status===x?'selected':''}>${x}</option>`).join('')}</select></td></tr>`;
  }).join(''):'<tr><td colspan="10" class="empty">No customer requests found.</td></tr>';
}

function renderCustomers(){
  $('#customersBody').innerHTML=state.customers.length?state.customers.map(c=>{
    const os=state.orders.filter(o=>o.customer_id===c.id&&!o.is_void),spent=os.filter(o=>o.payment_status==='Paid').reduce((a,o)=>a+Number(o.total),0),archived=Boolean(c.is_archived);
    const adminAction=isAdmin()&&c.name!=='Walk-in Customer'?`<button data-archive-customer="${c.id}">${archived?'Restore':'Archive'}</button>`:'';
    return `<tr class="${archived?'muted-row':''}"><td><strong>${escapeHtml(c.name)}</strong>${archived?' <span class="pill neutral">Archived</span>':''}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(places[c.default_place]?.label||'—')}</td><td>${os.length}</td><td>${peso.format(spent)}</td><td><div class="row-actions"><button data-edit-customer="${c.id}">Edit</button>${adminAction}</div></td></tr>`;
  }).join(''):'<tr><td colspan="6" class="empty">No customers.</td></tr>';
}
function clearCustomerForm(){ $('#customerForm').reset();$('#customerId').value='';$('#customerFormTitle').textContent='Add customer';$('#customerPlace').value='cubao'; }
async function saveCustomer(e){e.preventDefault();const id=$('#customerId').value;const payload={name:$('#customerName').value.trim(),phone:$('#customerPhone').value.trim(),default_place:$('#customerPlace').value,notes:$('#customerNotes').value.trim(),updated_by:state.profile.id};setSaveStatus('Saving…','saving');const res=id?await sb.from('customers').update(payload).eq('id',id):await sb.from('customers').insert({...payload,created_by:state.profile.id});if(res.error){setSaveStatus('Save failed','error');toast(res.error.message);return;}setSaveStatus('Saved in cloud');toast('Customer saved');clearCustomerForm();await loadCloudData();renderAll();}

function isWashProductCategory(category) {
  const normalized = normalizedCategory(category);
  return normalized === 'detergent' || normalized === 'fabric conditioner';
}
function defaultInventoryCustomerPrice(category) {
  const normalized = normalizedCategory(category);
  if (normalized === 'detergent') return defaultWashProductPrice('detergent');
  if (normalized === 'fabric conditioner') return defaultWashProductPrice('conditioner');
  return 0;
}
function updateInventoryPriceField(setDefault = false) {
  const category = $('#inventoryCategory').value;
  const relevant = isWashProductCategory(category);
  const input = $('#inventoryCustomerPrice');
  const label = $('#inventoryCustomerPriceLabel');
  label.classList.toggle('hidden', !relevant);
  input.disabled = !isAdmin() || !relevant;
  $('#inventoryConsumption').disabled = !isAdmin();
  if (setDefault && !$('#inventoryId').value) input.value = defaultInventoryCustomerPrice(category);
}
function renderInventory(){
  $('#inventoryBody').innerHTML=state.inventory.length?state.inventory.map(i=>{const low=Number(i.stock)<=Number(i.reorder_level),inactive=i.is_active===false;const adminAction=isAdmin()?`<button data-toggle-inventory="${i.id}">${inactive?'Activate':'Inactivate'}</button>`:'';const customerPrice=isWashProductCategory(i.category)?peso.format(Number(i.customer_price_per_load)||0)+'/load':'<span class="inventory-price-na">—</span>';const usage=Number(i.consumption_per_load??1);return `<tr class="${inactive?'muted-row':''}"><td><strong>${escapeHtml(i.name)}</strong>${inactive?' <span class="pill neutral">Inactive</span>':''}</td><td>${escapeHtml(i.category)}</td><td>${Number(i.stock).toLocaleString('en-PH')}</td><td>${i.reorder_level}</td><td>${peso.format(i.unit_cost)}</td><td>${customerPrice}</td><td>${usage.toLocaleString('en-PH',{maximumFractionDigits:2})}</td><td><span class="pill ${inactive?'neutral':low?'unpaid':'paid'}">${inactive?'Inactive':low?'Reorder':'Stocked'}</span></td><td><div class="row-actions"><button data-edit-inventory="${i.id}">Edit</button>${adminAction}</div></td></tr>`}).join(''):'<tr><td colspan="9" class="empty">No inventory items.</td></tr>';
}
function clearInventoryForm(){ $('#inventoryForm').reset();$('#inventoryId').value='';$('#inventoryFormTitle').textContent='Add item';$('#inventoryCustomerPrice').value=defaultInventoryCustomerPrice($('#inventoryCategory').value);$('#inventoryConsumption').value=1;updateInventoryPriceField(true); }
async function saveInventory(e){e.preventDefault();const id=$('#inventoryId').value;const existing=id?state.inventory.find(i=>i.id===id):null;const category=$('#inventoryCategory').value;const customerPrice=isAdmin()?Number($('#inventoryCustomerPrice').value||0):Number(existing?.customer_price_per_load??defaultInventoryCustomerPrice(category));const payload={name:$('#inventoryName').value.trim(),category,stock:Number($('#inventoryStock').value),reorder_level:Number($('#inventoryReorder').value),unit_cost:Number($('#inventoryCost').value),customer_price_per_load:customerPrice,consumption_per_load:Number($('#inventoryConsumption').value||1),updated_by:state.profile.id};setSaveStatus('Saving…','saving');const res=id?await sb.from('inventory').update(payload).eq('id',id):await sb.from('inventory').insert({...payload,created_by:state.profile.id});if(res.error){setSaveStatus('Save failed','error');toast(res.error.message);return;}setSaveStatus('Saved in cloud');toast('Inventory saved');clearInventoryForm();await loadCloudData();renderAll();}

const outsidePriceFieldPairs = [
  ['priceWashCubao','priceWashOutside'],
  ['priceWdoCubao','priceWdoOutside'],
  ['priceWdfCubao','priceWdfOutside'],
  ['priceWashOnlyCubao','priceWashOnlyOutside'],
  ['priceDryOnlyCubao','priceDryOnlyOutside'],
  ['priceFoldOnlyCubao','priceFoldOnlyOutside']
];
function syncOutsidePriceFields(){
  outsidePriceFieldPairs.forEach(([cubaoId,outsideId])=>{
    const cubao=$('#'+cubaoId), outside=$('#'+outsideId);
    if(cubao&&outside) outside.value=cubao.value;
  });
}
function renderSettings(){const s=state.settings;[
  ['priceWashCubao','price_wash_cubao'],['priceWashMplace','price_wash_mplace'],['capacityWash','capacity_wash'],
  ['priceWdoCubao','price_wdo_cubao'],['priceWdoMplace','price_wdo_mplace'],['capacityWdo','capacity_wdo'],
  ['priceWdfCubao','price_wdf_cubao'],['priceWdfMplace','price_wdf_mplace'],['capacityWdf','capacity_wdf'],
  ['priceWashOnlyCubao','price_wash_only_cubao'],['priceWashOnlyMplace','price_wash_only_mplace'],['capacityWashOnly','capacity_wash_only'],
  ['priceDryOnlyCubao','price_dry_only_cubao'],['priceDryOnlyMplace','price_dry_only_mplace'],['capacityDryOnly','capacity_dry_only'],
  ['priceFoldOnlyCubao','price_fold_only_cubao'],['priceFoldOnlyMplace','price_fold_only_mplace'],['capacityFoldOnly','capacity_fold_only'],
  ['addonExtraDry','addon_extra_dry'],['addonExtraWash','addon_extra_wash'],['addonWarmHotWash','addon_warm_hot_wash'],['addonZonroxColorsafe','addon_zonrox_colorsafe'],
  ['defaultDetergentPrice','default_detergent_price'],['defaultConditionerPrice','default_conditioner_price'],['fullServiceDiscount','full_service_discount'],
  ['deliveryStandard','delivery_standard'],['deliveryMplace','delivery_mplace']
].forEach(([id,key])=>{const el=$('#'+id);if(el)el.value=s[key]??0;});syncOutsidePriceFields();}
let settingsTimer;
async function autosaveSettings(){if(!isAdmin())return;syncOutsidePriceFields();clearTimeout(settingsTimer);settingsTimer=setTimeout(async()=>{const washCubao=Number($('#priceWashCubao').value),wdoCubao=Number($('#priceWdoCubao').value),wdfCubao=Number($('#priceWdfCubao').value),washOnlyCubao=Number($('#priceWashOnlyCubao').value),dryOnlyCubao=Number($('#priceDryOnlyCubao').value),foldOnlyCubao=Number($('#priceFoldOnlyCubao').value);const payload={
  price_wash_cubao:washCubao,price_wash_mplace:Number($('#priceWashMplace').value),price_wash_outside:washCubao,capacity_wash:Number($('#capacityWash').value),
  price_wdo_cubao:wdoCubao,price_wdo_mplace:Number($('#priceWdoMplace').value),price_wdo_outside:wdoCubao,capacity_wdo:Number($('#capacityWdo').value),
  price_wdf_cubao:wdfCubao,price_wdf_mplace:Number($('#priceWdfMplace').value),price_wdf_outside:wdfCubao,capacity_wdf:Number($('#capacityWdf').value),
  price_wash_only_cubao:washOnlyCubao,price_wash_only_mplace:Number($('#priceWashOnlyMplace').value),price_wash_only_outside:washOnlyCubao,capacity_wash_only:Number($('#capacityWashOnly').value),
  price_dry_only_cubao:dryOnlyCubao,price_dry_only_mplace:Number($('#priceDryOnlyMplace').value),price_dry_only_outside:dryOnlyCubao,capacity_dry_only:Number($('#capacityDryOnly').value),
  price_fold_only_cubao:foldOnlyCubao,price_fold_only_mplace:Number($('#priceFoldOnlyMplace').value),price_fold_only_outside:foldOnlyCubao,capacity_fold_only:Number($('#capacityFoldOnly').value),
  addon_extra_dry:Number($('#addonExtraDry').value),addon_extra_wash:Number($('#addonExtraWash').value),addon_warm_hot_wash:Number($('#addonWarmHotWash').value),addon_zonrox_colorsafe:Number($('#addonZonroxColorsafe').value),
  default_detergent_price:Number($('#defaultDetergentPrice').value),default_conditioner_price:Number($('#defaultConditionerPrice').value),full_service_discount:Number($('#fullServiceDiscount').value),
  delivery_standard:Number($('#deliveryStandard').value),delivery_mplace:Number($('#deliveryMplace').value),updated_by:state.profile.id
};setSaveStatus('Saving controls…','saving');const{error}=await sb.from('settings').update(payload).eq('id',1);if(error){setSaveStatus('Save failed','error');toast(error.message);return;}state.settings={...state.settings,...payload};setSaveStatus('Saved in cloud');toast('Controls saved');renderPosChoices();},650);}
function renderAll(){const blankInventoryForm=!$('#inventoryId').value&&!$('#inventoryName').value.trim();renderPage();renderDashboard();renderPosChoices();renderOrders();renderRequests();renderCustomers();renderInventory();renderSettings();if(blankInventoryForm)$('#inventoryCustomerPrice').value=defaultInventoryCustomerPrice($('#inventoryCategory').value);updateInventoryPriceField(false);}

function bindEvents(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();if(state.soundVoiceEnabled)await primeBookingAlertAudio();$('#loginMessage').textContent='Signing in…';try{await signIn($('#loginUsername').value,$('#loginPassword').value);$('#loginMessage').textContent='';}catch(err){$('#loginMessage').textContent=err.message;}});
  $('#logoutBtn').addEventListener('click',()=>sb.auth.signOut());
  $('#requestAlertBtn').addEventListener('click',()=>openRequestQueue(state.latestRequestId));
  $('#openRequestsBtn').addEventListener('click',()=>openRequestQueue());
  $('#enableNotificationsBtn').addEventListener('click',enableBookingAlerts);
  $('#viewNewRequestBtn').addEventListener('click',()=>{ $('#newRequestPopup').classList.remove('show'); $('#newRequestPopup').classList.add('hidden'); openRequestQueue(state.latestRequestId); });
  $('#dismissNewRequestBtn').addEventListener('click',()=>{ $('#newRequestPopup').classList.remove('show'); $('#newRequestPopup').classList.add('hidden'); });
  $('#newRequestList').addEventListener('click',e=>{const b=e.target.closest('[data-dashboard-request]');if(b)openRequestQueue(b.dataset.dashboardRequest);});
  $$('#nav button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.page==='settings'&&!isAdmin())return;state.page=b.dataset.page;if(state.page==='requests'){state.latestRequestId=null;$('#requestSearch').value='';$('#requestStatusFilter').value='all';renderRequests();}renderPage();}));
  $('#customerSearch').addEventListener('input',renderPosChoices);
  $('#customerChips').addEventListener('click',e=>{const b=e.target.closest('[data-customer-id]');if(!b)return;state.draft.customerId=b.dataset.customerId;const c=currentCustomer();if(c?.default_place)state.draft.place=c.default_place;renderPosChoices();});
  $('#serviceChoices').addEventListener('click',e=>{const full=e.target.closest('[data-full-service]');if(full){applyFullServicePreset();renderPosChoices();return;}const b=e.target.closest('[data-service]');if(!b)return;state.draft.service=b.dataset.service;state.draft.fullService=false;state.draft.quantity=loadTypeCapacity();if(!serviceIncludesWash(state.draft.service,state.draft.extraWash)){state.draft.warmHotWash=false;state.draft.zonroxColorsafe=false;state.draft.detergentChoice='';state.draft.conditionerChoice='';}renderPosChoices();});
  $('#itemTypeChoices').addEventListener('click',e=>{const b=e.target.closest('[data-item-type]');if(!b)return;state.draft.itemType=b.dataset.itemType;state.draft.quantity=loadTypeCapacity();renderPosChoices();});
  $('#placeChoices').addEventListener('click',e=>{const b=e.target.closest('[data-place]');if(!b)return;state.draft.place=b.dataset.place;renderPosChoices();});
  $('#deliveryChoices').addEventListener('click',e=>{const b=e.target.closest('[data-delivery]');if(!b)return;state.draft.delivery=b.dataset.delivery==='true';renderPosChoices();});
  $('#addonChoices').addEventListener('click',e=>{const b=e.target.closest('[data-addon]');if(!b||b.disabled)return;const key=b.dataset.addon;state.draft[key]=!state.draft[key];if(key==='extraWash'&&!state.draft.extraWash&&!serviceIncludesWash(state.draft.service,false)){state.draft.warmHotWash=false;state.draft.zonroxColorsafe=false;state.draft.detergentChoice='';state.draft.conditionerChoice='';}renderPosChoices();});
  $('#detergentChoices').addEventListener('click',e=>{const b=e.target.closest('[data-detergent-choice]');if(!b||b.disabled)return;state.draft.detergentChoice=b.dataset.detergentChoice;renderPosChoices();});
  $('#conditionerChoices').addEventListener('click',e=>{const b=e.target.closest('[data-conditioner-choice]');if(!b||b.disabled)return;state.draft.conditionerChoice=b.dataset.conditionerChoice;renderPosChoices();});
  $('#paymentChoices').addEventListener('click',e=>{const b=e.target.closest('[data-payment]');if(!b)return;state.draft.payment=b.dataset.payment;renderPosChoices();});
  $$('.quantity-box button').forEach(b=>b.addEventListener('click',()=>{const unit=currentLoadType().unit;const min=unit==='pc'?1:.5;state.draft.quantity=Math.max(min,Number(state.draft.quantity)+Number(b.dataset.qty));renderSummary();}));
  $('#saveOrderBtn').addEventListener('click',saveOrder);$('#resetOrderBtn').addEventListener('click',resetDraft);
  $('#newCustomerQuick').addEventListener('click',()=>{state.page='customers';renderPage();$('#customerName').focus();});
  $('#orderSearch').addEventListener('input',renderOrders);$('#orderStatusFilter').addEventListener('change',renderOrders);
  $('#requestSearch').addEventListener('input',renderRequests);$('#requestStatusFilter').addEventListener('change',renderRequests);
  $('#requestsBody').addEventListener('change',e=>{if(e.target.matches('[data-request-status]'))updateRequestStatus(e.target.dataset.requestStatus,e.target.value);});
  $('#requestsBody').addEventListener('click',async e=>{
    const fileButton=e.target.closest('[data-request-file]');
    if(fileButton){openPrivateUpload(fileButton.dataset.requestFile);return;}
    const convertButton=e.target.closest('[data-convert-request]');
    if(convertButton){await convertCustomerRequest(convertButton.dataset.convertRequest);return;}
    const orderButton=e.target.closest('[data-view-request-order]');
    if(orderButton){
      state.page='orders';
      renderPage();
      $('#orderSearch').value=orderButton.dataset.orderReceipt||'';
      renderOrders();
    }
  });
  $('#ordersBody').addEventListener('change',e=>{if(e.target.matches('[data-order-status-id]')){const o=state.orders.find(x=>x.id===e.target.dataset.orderStatusId);if(!o?.is_void)updateOrder(e.target.dataset.orderStatusId,{status:e.target.value},'status_change');}});
  $('#ordersBody').addEventListener('click',async e=>{const pay=e.target.dataset.togglePaid,voidId=e.target.dataset.voidOrder,repairId=e.target.dataset.repairInventory,notifyId=e.target.dataset.notifyRider;if(notifyId){await notifyRiderApproaching(notifyId,e.target);return;}if(repairId){await repairOrderInventory(repairId);return;}if(pay){const o=state.orders.find(x=>x.id===pay);if(o?.is_void)return;await updateOrder(pay,{payment_status:o.payment_status==='Paid'?'Unpaid':'Paid'},'payment_change');}if(voidId){if(!isAdmin())return toast('Only Admin can void orders.');const reason=prompt('Reason for voiding this order:','Customer cancelled');if(!reason?.trim())return;const ok=await confirmAction('Void order','The order remains in history and cannot be used in sales totals.');if(!ok)return;const patch={is_void:true,void_reason:reason.trim(),voided_at:new Date().toISOString(),voided_by:state.profile.id,updated_by:state.profile.id};const{error}=await sb.from('orders').update(patch).eq('id',voidId);if(error)toast(error.message);else{await logAction('order_voided','order',voidId,{reason:reason.trim()});toast('Order voided');await loadCloudData();renderAll();}}});
  $('#customerForm').addEventListener('submit',saveCustomer);$('#clearCustomerBtn').addEventListener('click',clearCustomerForm);
  $('#customersBody').addEventListener('click',async e=>{const edit=e.target.dataset.editCustomer,archive=e.target.dataset.archiveCustomer;if(edit){const c=state.customers.find(x=>x.id===edit);$('#customerId').value=c.id;$('#customerName').value=c.name;$('#customerPhone').value=c.phone||'';$('#customerPlace').value=c.default_place||'cubao';$('#customerNotes').value=c.notes||'';$('#customerFormTitle').textContent='Edit customer';}if(archive){if(!isAdmin())return toast('Only Admin can archive customers.');const c=state.customers.find(x=>x.id===archive);const next=!c.is_archived;const{error}=await sb.from('customers').update({is_archived:next,updated_by:state.profile.id}).eq('id',archive);if(error)toast(error.message);else{await logAction(next?'customer_archived':'customer_restored','customer',archive,{});toast(next?'Customer archived':'Customer restored');await loadCloudData();renderAll();}}});
  $('#inventoryForm').addEventListener('submit',saveInventory);$('#clearInventoryBtn').addEventListener('click',clearInventoryForm);$('#inventoryCategory').addEventListener('change',()=>updateInventoryPriceField(true));
  $('#inventoryBody').addEventListener('click',async e=>{const edit=e.target.dataset.editInventory,toggle=e.target.dataset.toggleInventory;if(edit){const i=state.inventory.find(x=>x.id===edit);$('#inventoryId').value=i.id;$('#inventoryName').value=i.name;$('#inventoryCategory').value=i.category;$('#inventoryStock').value=i.stock;$('#inventoryReorder').value=i.reorder_level;$('#inventoryCost').value=i.unit_cost;$('#inventoryCustomerPrice').value=Number(i.customer_price_per_load)||0;$('#inventoryConsumption').value=Number(i.consumption_per_load??1);$('#inventoryFormTitle').textContent='Edit item';updateInventoryPriceField(false);}if(toggle){if(!isAdmin())return toast('Only Admin can activate or inactivate inventory items.');const i=state.inventory.find(x=>x.id===toggle),next=i.is_active===false;const{error}=await sb.from('inventory').update({is_active:next,updated_by:state.profile.id}).eq('id',toggle);if(error)toast(error.message);else{await logAction(next?'inventory_activated':'inventory_inactivated','inventory',toggle,{});toast(next?'Item activated':'Item marked inactive');await loadCloudData();renderAll();}}});
  $('#settingsForm').addEventListener('input',autosaveSettings);
  window.addEventListener('online',()=>{$('#connectionBadge').textContent='● Online';$('#connectionBadge').className='connection online';});
  window.addEventListener('offline',()=>{$('#connectionBadge').textContent='● Offline';$('#connectionBadge').className='connection offline';setSaveStatus('Offline — changes cannot save','error');});
}

bindEvents();
$('#pickupAt').value=localDateTimeInput(new Date(Date.now()+24*3600*1000));
sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){state.channels.forEach(ch=>sb.removeChannel(ch));state.channels=[];}initializeSession(session);});
sb.auth.getSession().then(({data})=>initializeSession(data.session));
