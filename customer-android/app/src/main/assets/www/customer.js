'use strict';

const SUPABASE_URL = 'https://amjhrejmcnthlrqddznw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5KkgIxPlTNAZjqgRX9Yh3A_tqLD2hNE';
const SHOP_ADDRESS = '92 14th Ave, Cubao, Quezon City, Philippines, 1109';
const LALAMOVE_WEB_URL = 'https://web.lalamove.com/';
// Business service geofences. Tightest radius wins. Defaults here are a
// fallback only — loadOptions() replaces this with the admin-configured
// public.service_areas rows once the booking options RPC responds.
let SERVICE_GEOFENCES = {
  mplace: { lat: 14.6389788, lng: 121.0334650, radiusM: 500 },
  cubao: { lat: 14.6175619, lng: 121.0598714, radiusM: 3500 }
};
function applyServiceAreasFromServer(areas) {
  if (!Array.isArray(areas) || !areas.length) return;
  const next = {};
  areas.forEach(a => { next[a.code] = { lat: Number(a.center_lat), lng: Number(a.center_lng), radiusM: Number(a.radius_m) }; });
  SERVICE_GEOFENCES = next;
}
function manilaNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekdayIndex = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 }[map.weekday] ?? 0;
  return { hour: Number(map.hour), minute: Number(map.minute), weekdayIndex };
}
function timeStringToMinutes(t) { const [h,m] = String(t||'00:00').split(':').map(Number); return h*60+(m||0); }
function isWithinBookingHours() {
  const s = state.settings;
  const mask = Number(s.booking_days_mask ?? 127);
  const { hour, minute, weekdayIndex } = manilaNow();
  if (((mask >> weekdayIndex) & 1) === 0) return false;
  const nowMinutes = hour * 60 + minute;
  const open = timeStringToMinutes(s.booking_open_time || '07:30');
  const close = timeStringToMinutes(s.booking_close_time || '19:30');
  return nowMinutes >= open && nowMinutes <= close;
}
function formatHm(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM'; const h12 = ((h % 12) || 12);
  return `${h12}:${String(m || 0).padStart(2,'0')} ${period}`;
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  // Accounts are optional (guest booking by phone still works unchanged),
  // but signed-in sessions need to persist and refresh like any other app.
  // detectSessionInUrl stays false: the OAuth redirect lands on a custom
  // Android intent scheme, not a browser URL, and is handled manually by
  // window.onAuthCallback (see MainActivity.kt's flushPendingAuthCallback).
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

const defaults = {
  price_wash_cubao: 60, price_wash_mplace: 90, price_wash_outside: 60,
  price_wdo_cubao: 125, price_wdo_mplace: 155, price_wdo_outside: 125,
  price_wdf_cubao: 165, price_wdf_mplace: 195, price_wdf_outside: 165,
  price_wash_only_cubao: 60, price_wash_only_mplace: 90, price_wash_only_outside: 60,
  price_dry_only_cubao: 65, price_dry_only_mplace: 95, price_dry_only_outside: 65,
  price_fold_only_cubao: 40, price_fold_only_mplace: 70, price_fold_only_outside: 40,
  capacity_wash: 8, capacity_wdo: 8, capacity_wdf: 8,
  capacity_wash_only: 8, capacity_dry_only: 8, capacity_fold_only: 8,
  addon_extra_dry: 20, addon_extra_wash: 25, addon_warm_hot_wash: 25, addon_zonrox_colorsafe: 5, full_service_discount: 5, default_detergent_price: 10, default_conditioner_price: 15, capacity_regular: 8, capacity_blanket: 2, capacity_comforter: 1, capacity_sheets: 5,
  delivery_standard: 60, delivery_mplace: 30
};

const services = {
  wash: { label: 'Wash', icon: '🫧', capacityKey: 'capacity_wash', pricePrefix: 'price_wash', wash: true },
  wash_dry_only: { label: 'Wash + Dry', icon: '🧺', capacityKey: 'capacity_wdo', pricePrefix: 'price_wdo', wash: true },
  wash_dry_fold: { label: 'Wash + Dry + Fold', icon: '✨', capacityKey: 'capacity_wdf', pricePrefix: 'price_wdf', wash: true },
  wash_only: { label: 'Wash Only', icon: '🧼', capacityKey: 'capacity_wash_only', pricePrefix: 'price_wash_only', wash: true },
  dry_only: { label: 'Dry Only', icon: '💨', capacityKey: 'capacity_dry_only', pricePrefix: 'price_dry_only', wash: false },
  fold_only: { label: 'Fold Only', icon: '👕', capacityKey: 'capacity_fold_only', pricePrefix: 'price_fold_only', wash: false }
};
const places = { cubao: 'Within Cubao', mplace: 'MPlace', outside: 'Outside Cubao' };
function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}
function detectServiceArea(lat, lng) {
  if (distanceMeters(lat, lng, SERVICE_GEOFENCES.mplace.lat, SERVICE_GEOFENCES.mplace.lng) <= SERVICE_GEOFENCES.mplace.radiusM) return 'mplace';
  if (distanceMeters(lat, lng, SERVICE_GEOFENCES.cubao.lat, SERVICE_GEOFENCES.cubao.lng) <= SERVICE_GEOFENCES.cubao.radiusM) return 'cubao';
  return 'outside';
}
let pinMap = null;
let pinMarker = null;
function showPinMap(lat, lng) {
  if (typeof L === 'undefined') return; // Offline: Leaflet CDN didn't load. GPS capture without the map still works.
  $('#pinMapWrap').classList.remove('hidden');
  const latNum = Number(lat), lngNum = Number(lng);
  if (!pinMap) {
    pinMap = L.map('pinMap').setView([latNum, lngNum], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(pinMap);
    pinMarker = L.marker([latNum, lngNum], { draggable: true }).addTo(pinMap);
    pinMarker.on('dragend', () => {
      const pos = pinMarker.getLatLng();
      updatePinPosition(pos.lat, pos.lng);
    });
    pinMap.on('click', event => {
      pinMarker.setLatLng(event.latlng);
      updatePinPosition(event.latlng.lat, event.latlng.lng);
    });
    setTimeout(() => pinMap.invalidateSize(), 200);
  } else {
    pinMap.setView([latNum, lngNum], 17);
    pinMarker.setLatLng([latNum, lngNum]);
  }
}
function updatePinPosition(lat, lng) {
  state.gpsLat = lat.toFixed(7); state.gpsLng = lng.toFixed(7);
  state.mapsUrl = `https://www.google.com/maps?q=${state.gpsLat},${state.gpsLng}`;
  $('#gpsLat').value = state.gpsLat; $('#gpsLng').value = state.gpsLng; $('#mapsUrl').value = state.mapsUrl;
  const detected = applyDetectedArea(state.gpsLat, state.gpsLng);
  $('#gpsStatus').textContent = `Pin adjusted · ${places[detected]}`;
  $('#mapsLink').href = state.mapsUrl; $('#mapsLink').classList.remove('hidden');
  toast(`Service area set to ${places[detected]}.`);
}
function applyDetectedArea(lat, lng, accuracy = 0) {
  const detected = detectServiceArea(Number(lat), Number(lng));
  state.place = detected;
  $('#place').value = detected;
  $('#areaMode').textContent = `Detected by GPS: ${places[detected]}`;
  renderAll();
  const accuracyText = accuracy ? ` · accuracy about ${Math.round(accuracy)} m` : '';
  $('#gpsDetails').textContent = `${lat}, ${lng}${accuracyText} · Area: ${places[detected]}`;
  return detected;
}
const loadTypes = { assorted_clothes:{label:'Assorted clothes',icon:'👕',unit:'kg',capacityKey:'capacity_regular',capacity:8,note:'Up to 8 kg per load'}, thick_blankets:{label:'Thick blankets',icon:'🛏️',unit:'kg',capacityKey:'capacity_blanket',capacity:2,note:'Up to 2 kg per load'}, comforter:{label:'Comforter',icon:'🛌',unit:'pc',capacityKey:'capacity_comforter',capacity:1,note:'1 pc per load'}, sheets_towels:{label:'Bed sheets, towels',icon:'🧻',unit:'kg',capacityKey:'capacity_sheets',capacity:5,note:'Up to 5 kg per load'} };

const state = {
  settings: { ...defaults }, products: [], service: 'wash_dry_fold', itemType: 'assorted_clothes', fullService: false, place: 'cubao', quantity: 8,
  detergentSource: '', detergentItemId: '', conditionerSource: '', conditionerItemId: '',
  extraDry: false, extraWash: false, warmHotWash: false, zonroxColorsafe: false, extraDetergent: false, extraConditioner: false, deliveryRequested: true,
  gpsLat: '', gpsLng: '', mapsUrl: '', submitting: false
};

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}


function normalizePhilippineMobile(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return '';
}

function supabaseErrorText(error) {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' | ');
}
function explainSupabaseError(error, stage = 'booking') {
  const raw = supabaseErrorText(error);
  if (/row-level security|new row violates|42501/i.test(raw)) {
    if (stage === 'upload') {
      return 'Photo upload was blocked by Supabase Storage Row Level Security. The private bucket is working, but the anonymous INSERT policy for customer-order-uploads is missing or was removed. Run Bubblyfi-v2.6.1-RLS-Repair.sql once in Supabase SQL Editor, then retry.';
    }
    return 'Booking save was blocked by Supabase Row Level Security. The submit_customer_order function must be SECURITY DEFINER and executable by the anon role. Run Bubblyfi-v2.6.1-RLS-Repair.sql once in Supabase SQL Editor, then retry.';
  }
  if (/customer_request_phone_format|invalid philippine mobile|22023/i.test(raw)) {
    return 'Invalid Philippine mobile number. Enter 09XXXXXXXXX or +639XXXXXXXXX.';
  }
  if (/bucket.*not found|not found.*bucket/i.test(raw)) {
    return 'The private customer-order-uploads bucket does not exist. Run Bubblyfi-v2.6.1-RLS-Repair.sql in Supabase SQL Editor.';
  }
  if (/mime|content.?type|invalid.*file/i.test(raw)) {
    return 'The selected photo type is not allowed. Use JPEG, PNG, or WebP only.';
  }
  return raw || 'Booking could not be submitted.';
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function setDefaultPickup() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  $('#pickupAt').value = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const now = new Date();
  $('#pickupAt').min = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function serviceHasWash() { return services[state.service].wash || state.extraWash; }
function settingNumber(key) { return Number(state.settings[key] ?? defaults[key]) || 0; }
function currentRate() { const effectivePlace=state.place==='outside'?'cubao':state.place; return settingNumber(`${services[state.service].pricePrefix}_${effectivePlace}`); }
function currentLoadType(){return loadTypes[state.itemType]||loadTypes.assorted_clothes;}
function loadTypeCapacity(itemType=state.itemType){const t=loadTypes[itemType]||loadTypes.assorted_clothes;return Math.max(t.unit==='pc'?1:.5,settingNumber(t.capacityKey)||t.capacity);}
function currentCapacity() { return loadTypeCapacity(); }
function getProduct(id) { return state.products.find(p => p.id === id); }
function normalizeProductName(value = '') { return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function isFullServiceSelection() { return state.fullService === true && state.service === 'wash_dry_fold'; }
function fullServicePresetPrice(place = state.place) {
  return Math.max(0, rateFor('wash_dry_fold', place) + settingNumber('default_detergent_price') + settingNumber('default_conditioner_price') + settingNumber('addon_zonrox_colorsafe') - settingNumber('full_service_discount'));
}
function applyFullServicePreset() {
  state.service = 'wash_dry_fold'; state.fullService = true; state.quantity = loadTypeCapacity();
  state.extraDry=false; state.extraWash=false; state.warmHotWash=false; state.zonroxColorsafe=true; state.extraDetergent=false; state.extraConditioner=false;
  state.detergentSource='included'; state.detergentItemId=''; state.conditionerSource='included'; state.conditionerItemId='';
  toast('Full Service selected: detergent + fabric conditioner + Zonrox Color Safe 30 ml, with ₱5 off.');
}
function selectedDetergent() {
  if (!serviceHasWash()) return { name:'Not applicable', price:0 };
  if (isFullServiceSelection()) return { name:'Detergent (included)', price:settingNumber('default_detergent_price') };
  if (state.detergentSource === 'bring_own') return { name:'Bring your own', price:0 };
  const item = getProduct(state.detergentItemId);
  return item ? { name:item.name, price:Number(item.price)||0 } : { name:'Not selected', price:0 };
}
function selectedConditioner() {
  if (!serviceHasWash()) return { name:'Not applicable', price:0 };
  if (isFullServiceSelection()) return { name:'Fabric conditioner (included)', price:settingNumber('default_conditioner_price') };
  if (state.conditionerSource === 'bring_own') return { name:'Bring your own', price:0 };
  if (state.conditionerSource === 'none') return { name:'None', price:0 };
  const item = getProduct(state.conditionerItemId);
  return item ? { name:item.name, price:Number(item.price)||0 } : { name:'Not selected', price:0 };
}
function calculate() {
  const loads = Math.max(1, Math.ceil(Number(state.quantity) / currentCapacity()));
  const rate = currentRate();
  const detergent = selectedDetergent(); const conditioner = selectedConditioner();
  if (isFullServiceSelection()) state.zonroxColorsafe = true;
  const extraDryRate = state.extraDry ? settingNumber('addon_extra_dry') : 0;
  const extraWashRate = state.extraWash ? settingNumber('addon_extra_wash') : 0;
  const warmRate = state.warmHotWash && serviceHasWash() ? settingNumber('addon_warm_hot_wash') : 0;
  const zonroxRate = state.zonroxColorsafe && serviceHasWash() ? settingNumber('addon_zonrox_colorsafe') : 0;
  const extraDetergentRate = state.extraDetergent && serviceHasWash() ? settingNumber('default_detergent_price') : 0;
  const extraConditionerRate = state.extraConditioner && serviceHasWash() ? settingNumber('default_conditioner_price') : 0;
  const base = loads * rate; const detergentTotal = loads * detergent.price; const conditionerTotal = loads * conditioner.price;
  const addons = loads * (extraDryRate + extraWashRate + warmRate + zonroxRate + extraDetergentRate + extraConditionerRate);
  const discount = isFullServiceSelection() ? loads * settingNumber('full_service_discount') : 0;
  const delivery = state.deliveryRequested && state.place !== 'outside' ? settingNumber(state.place === 'mplace' ? 'delivery_mplace' : 'delivery_standard') : 0;
  return { loads, rate, base, detergent, conditioner, detergentTotal, conditionerTotal, addons, discount, delivery, total:Math.max(0,base+detergentTotal+conditionerTotal+addons-discount)+delivery, unit:currentLoadType().unit };
}

async function loadOptions() {
  const { data, error } = await sb.rpc('get_public_booking_options');
  if (error) throw new Error(`${error.message}. Run sql/migrate-v2.0-customer-booking.sql in Supabase first.`);
  state.settings = { ...defaults, ...(data?.settings || {}) };
  state.products = Array.isArray(data?.products) ? data.products : [];
  applyServiceAreasFromServer(data?.service_areas);
  $('#loadingCard').classList.add('hidden');
  if (!isWithinBookingHours()) {
    $('#hoursNotice').textContent = `Bubbly-fi is currently closed for new bookings. We accept pickups from ${formatHm(state.settings.booking_open_time)} to ${formatHm(state.settings.booking_close_time)}. Please come back during business hours.`;
    $('#hoursNotice').classList.remove('hidden');
    return;
  }
  $('#bookingForm').classList.remove('hidden');
  renderAll();
}

function renderServices() {
  const fullServiceCard = `<button type="button" class="choice-card full-service-card ${isFullServiceSelection()?'selected':''}" data-full-service="true"><span class="icon">⭐</span><strong>Full Service (1 click)</strong><span>Detergent + fabric conditioner + Zonrox Color Safe 30 ml</span><em>${peso.format(fullServicePresetPrice())}/load · save ${peso.format(settingNumber('full_service_discount'))}</em></button>`;
  $('#serviceChoices').innerHTML = fullServiceCard + Object.entries(services).map(([key, service]) => `<button type="button" class="choice-card ${state.service===key&&!isFullServiceSelection()?'selected':''}" data-service="${key}"><span class="icon">${service.icon}</span><strong>${service.label}</strong><span>Base service price</span><em>${peso.format(rateFor(key,state.place))}/load</em></button>`).join('');
  $('#itemTypeChoices').innerHTML = Object.entries(loadTypes).map(([key,t])=>`<button type="button" class="choice-card ${state.itemType===key?'selected':''}" data-item-type="${key}"><span class="icon">${t.icon}</span><strong>${t.label}</strong><span>${t.note}</span></button>`).join('');
}
function currentCapacityFor(serviceKey) { return Math.max(.5, settingNumber(services[serviceKey].capacityKey) || 8); }
function rateFor(serviceKey, place) { const effectivePlace=place==='outside'?'cubao':place; return settingNumber(`${services[serviceKey].pricePrefix}_${effectivePlace}`); }
function renderProducts() {
  const hasWash = serviceHasWash();
  $('#washProductsCard').classList.toggle('hidden', !hasWash || isFullServiceSelection());
  if (!hasWash) { state.detergentSource='not_applicable';state.detergentItemId='';state.conditionerSource='not_applicable';state.conditionerItemId='';state.warmHotWash=false;return; }
  if (isFullServiceSelection()) { state.detergentSource='included';state.detergentItemId='';state.conditionerSource='included';state.conditionerItemId='';return; }
  if (state.detergentSource === 'not_applicable' || state.detergentSource === 'included') state.detergentSource='';
  if (state.conditionerSource === 'not_applicable' || state.conditionerSource === 'included') state.conditionerSource='';
  const detergents=state.products.filter(p=>String(p.category).toLowerCase()==='detergent');
  const conditioners=state.products.filter(p=>String(p.category).toLowerCase()==='fabric conditioner');
  $('#detergentChoices').innerHTML=[...detergents.map(p=>`<button type="button" class="choice-card ${state.detergentSource==='inventory'&&state.detergentItemId===p.id?'selected':''}" data-detergent="${p.id}"><span class="icon">🧴</span><strong>${escapeHtml(p.name)}</strong><em>+${peso.format(p.price)}/load</em></button>`),`<button type="button" class="choice-card ${state.detergentSource==='bring_own'?'selected':''}" data-detergent="bring_own"><span class="icon">🎒</span><strong>Bring your own</strong><em>+₱0</em></button>`].join('')||'<p>No detergent products are available.</p>';
  $('#conditionerChoices').innerHTML=[...conditioners.map(p=>`<button type="button" class="choice-card ${state.conditionerSource==='inventory'&&state.conditionerItemId===p.id?'selected':''}" data-conditioner="${p.id}"><span class="icon">🌸</span><strong>${escapeHtml(p.name)}</strong><em>+${peso.format(p.price)}/load</em></button>`),`<button type="button" class="choice-card ${state.conditionerSource==='bring_own'?'selected':''}" data-conditioner="bring_own"><span class="icon">🎒</span><strong>Bring your own</strong><em>+₱0</em></button>`,`<button type="button" class="choice-card ${state.conditionerSource==='none'?'selected':''}" data-conditioner="none"><span class="icon">🚫</span><strong>None</strong><em>+₱0</em></button>`].join('');
}
function renderAddons() {
  const washEnabled=serviceHasWash(); if(!washEnabled){state.warmHotWash=false;state.extraDetergent=false;state.extraConditioner=false;} if(isFullServiceSelection())state.zonroxColorsafe=true;
  const addOns=[['extraDry','💨','Extra dry',settingNumber('addon_extra_dry'),true],['extraWash','🔁','Extra wash',settingNumber('addon_extra_wash'),true],['warmHotWash','♨️','Warm / hot wash',settingNumber('addon_warm_hot_wash'),washEnabled],['extraDetergent','🧴','Additional detergent',settingNumber('default_detergent_price'),washEnabled],['extraConditioner','🌸','Additional fabric conditioner',settingNumber('default_conditioner_price'),washEnabled],['zonroxColorsafe','🧽','Zonrox Color Safe 30 ml',settingNumber('addon_zonrox_colorsafe'),washEnabled&&!isFullServiceSelection()]];
  $('#addonChoices').innerHTML=addOns.map(([key,icon,label,price,enabled])=>{const included=key==='zonroxColorsafe'&&isFullServiceSelection();return `<button type="button" class="choice-card ${(state[key]||included)?'selected':''}" data-addon="${key}" ${(included||!enabled)?'disabled':''}><span class="icon">${icon}</span><strong>${label}</strong><em>${included?'Included':`+${peso.format(price)}/load`}</em></button>`}).join('');
  const outside=state.place==='outside';const fee=outside?0:settingNumber(state.place==='mplace'?'delivery_mplace':'delivery_standard');
  $('#deliveryChoices').innerHTML=`<button type="button" class="choice-card ${state.deliveryRequested?'selected':''}" data-delivery="true"><span class="icon">🛵</span><strong>${outside?'LalaMove pickup / delivery':'Pickup & delivery'}</strong><em>${outside?'LalaMove rate — not included':`+${peso.format(fee)}`}</em></button><button type="button" class="choice-card ${!state.deliveryRequested?'selected':''}" data-delivery="false"><span class="icon">🏪</span><strong>Self drop-off / pickup</strong><em>+₱0</em></button>`;
  $('#lalamoveReference')?.classList.toggle('hidden',!(outside&&state.deliveryRequested));
}
function renderSummary() {
  const calc=calculate(); $('#quantityValue').textContent=Number(state.quantity).toLocaleString('en-PH');$('#quantityUnit').textContent=calc.unit;
  $('#summaryService').textContent=isFullServiceSelection()?'Full Service':services[state.service].label;
  $('#summaryQuantity').textContent=`${state.quantity} ${calc.unit} · ${currentLoadType().label}`;$('#summaryLoads').textContent=calc.loads;$('#summaryPlace').textContent=places[state.place];$('#summaryBase').textContent=peso.format(calc.base);
  $('#summaryDetergent').textContent=`${calc.detergent.name} · ${peso.format(calc.detergentTotal)}`;$('#summaryConditioner').textContent=`${calc.conditioner.name} · ${peso.format(calc.conditionerTotal)}`;$('#summaryAddons').textContent=peso.format(calc.addons);
  $('#summaryDelivery').textContent=state.deliveryRequested&&state.place==='outside'?'LalaMove rate (not included)':peso.format(calc.delivery);$('#summaryTotal').textContent=peso.format(calc.total);$('#paymentTotal').textContent=peso.format(calc.total);
}
function renderAll() { renderServices(); renderProducts(); renderAddons(); renderSummary(); }

function previewFile(input, target) {
  const file = input.files?.[0];
  if (!file) { target.classList.add('hidden'); target.removeAttribute('src'); return; }
  const url = URL.createObjectURL(file); target.src = url; target.classList.remove('hidden');
}
function previewItems() {
  const files = [...($('#itemPhotos').files || [])].slice(0,5);
  $('#itemPreviews').innerHTML = files.map(file => `<img src="${URL.createObjectURL(file)}" alt="Laundry item preview">`).join('');
  if (($('#itemPhotos').files || []).length > 5) toast('Only the first 5 item photos will be uploaded.');
}
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} is too large. Maximum original size is 12 MB.`);
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const max = 1800;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2 * 1024 * 1024) { bitmap.close(); return file; }
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.82));
  return blob || file;
}
async function uploadImage(file, category, index = 0) {
  const prepared = await compressImage(file);
  if (prepared.size > 8 * 1024 * 1024) throw new Error(`${file.name} remains larger than the 8 MB upload limit.`);
  const requestFolder = `${Date.now()}-${crypto.randomUUID()}`;
  const path = `requests/${requestFolder}/${category}-${index}.jpg`;
  const { error } = await sb.storage.from('customer-order-uploads').upload(path, prepared, { contentType: prepared.type || 'image/jpeg', upsert:false });
  if (error) throw new Error(explainSupabaseError(error, 'upload'));
  return path;
}
function fullAddress() {
  return [$('#buildingUnit').value, $('#addressLine').value, $('#barangay').value, $('#city').value, $('#landmark').value].map(v=>v.trim()).filter(Boolean).join(', ');
}
function validateBooking() {
  const form = $('#bookingForm');
  if (!form.reportValidity()) return false;
  const normalizedPhone = normalizePhilippineMobile($('#phone').value);
  if (!normalizedPhone) { toast('Enter a valid Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.'); $('#phone').focus(); return false; }
  $('#phone').value = normalizedPhone;
  if (serviceHasWash() && !isFullServiceSelection() && !['inventory','bring_own'].includes(state.detergentSource)) { toast('Select detergent or Bring your own.'); return false; }
  if (serviceHasWash() && !isFullServiceSelection() && !['inventory','bring_own','none'].includes(state.conditionerSource)) { toast('Select fabric conditioner, Bring your own, or None.'); return false; }
  if (!$('#paymentProof').files?.[0]) { toast('Upload the GCash payment screenshot.'); return false; }
  return true;
}

async function signInWithProvider(provider) {
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: 'ph.bubblyfi.customer://auth-callback', skipBrowserRedirect: true }
    });
    if (error) throw error;
    if (data?.url) {
      if (window.AndroidBridge?.openExternalUrl) window.AndroidBridge.openExternalUrl(data.url);
      else window.open(data.url, '_blank', 'noopener');
    }
  } catch (error) {
    toast(error.message || 'Could not start sign-in.');
  }
}
window.onAuthCallback = async url => {
  try {
    const hash = (url.split('#')[1] || '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) {
      const errorDesc = params.get('error_description');
      if (errorDesc) toast(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
      return;
    }
    const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    await refreshAuthUi();
    toast('Signed in!');
  } catch (error) {
    toast(error.message || 'Sign-in did not complete.');
  }
};
async function refreshAuthUi() {
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  $('#authSignedOut')?.classList.toggle('hidden', Boolean(session));
  $('#authSignedIn')?.classList.toggle('hidden', !session);
  if (session) {
    const { data: profile } = await sb.from('customer_profiles').select('display_name,phone').eq('id', session.user.id).maybeSingle();
    if ($('#authName')) $('#authName').textContent = profile?.display_name || session.user.email || 'Bubbly-fi customer';
    state.accountPhone = profile?.phone || '';
    if (state.accountPhone && $('#phone')) $('#phone').value = state.accountPhone;
    await loadAccountExtras();
  } else {
    state.accountPhone = '';
    $('#addressesPanel')?.classList.add('hidden');
    $('#preferencesPanel')?.classList.add('hidden');
  }
}
async function loadAccountExtras() {
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) { state.savedAddresses = []; state.washPrefs = null; return; }
  const [addressesRes, prefsRes] = await Promise.all([
    sb.from('saved_addresses').select('*').eq('customer_profile_id', session.user.id).order('is_default', { ascending: false }),
    sb.from('wash_preferences').select('*').eq('customer_profile_id', session.user.id).maybeSingle()
  ]);
  state.savedAddresses = addressesRes.data || [];
  state.washPrefs = prefsRes.data || null;
  renderSavedAddresses();
  renderWashPreferences();
}
function renderSavedAddresses() {
  const box = $('#savedAddressesList');
  if (!box) return;
  box.innerHTML = state.savedAddresses.length
    ? state.savedAddresses.map(a => `<div class="saved-address-row"><div><strong>${escapeHtml(a.label)}${a.is_default ? ' · Default' : ''}</strong><small>${escapeHtml([a.building_unit, a.address_line, a.barangay, a.city].filter(Boolean).join(', '))}</small></div><div class="row-actions"><button type="button" data-use-address="${a.id}">Use</button><button type="button" data-delete-address="${a.id}">Delete</button></div></div>`).join('')
    : '<p class="small">No saved addresses yet.</p>';
}
async function saveNewAddress() {
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) return toast('Sign in to save addresses.');
  const label = $('#newAddressLabel').value.trim();
  if (!label) return toast('Enter a label for this address, e.g. Home or Office.');
  const payload = {
    customer_profile_id: session.user.id,
    label,
    address_line: $('#addressLine').value.trim(),
    building_unit: $('#buildingUnit').value.trim(),
    barangay: $('#barangay').value.trim(),
    city: $('#city').value.trim(),
    landmark: $('#landmark').value.trim(),
    gps_lat: state.gpsLat || null,
    gps_lng: state.gpsLng || null
  };
  const { error } = await sb.from('saved_addresses').insert(payload);
  if (error) return toast(error.message);
  $('#newAddressLabel').value = '';
  toast('Address saved.');
  await loadAccountExtras();
}
function useSavedAddress(id) {
  const a = state.savedAddresses.find(x => x.id === id);
  if (!a) return;
  $('#addressLine').value = a.address_line || '';
  $('#buildingUnit').value = a.building_unit || '';
  $('#barangay').value = a.barangay || '';
  $('#city').value = a.city || '';
  $('#landmark').value = a.landmark || '';
  if (a.gps_lat && a.gps_lng) {
    state.gpsLat = String(a.gps_lat); state.gpsLng = String(a.gps_lng);
    state.mapsUrl = `https://www.google.com/maps?q=${state.gpsLat},${state.gpsLng}`;
    $('#gpsLat').value = state.gpsLat; $('#gpsLng').value = state.gpsLng; $('#mapsUrl').value = state.mapsUrl;
    applyDetectedArea(state.gpsLat, state.gpsLng);
    showPinMap(state.gpsLat, state.gpsLng);
  }
  toast(`Using "${a.label}" address.`);
}
async function deleteSavedAddress(id) {
  const { error } = await sb.from('saved_addresses').delete().eq('id', id);
  if (error) return toast(error.message);
  toast('Address removed.');
  await loadAccountExtras();
}
function renderWashPreferences() {
  const p = state.washPrefs;
  if (!$('#prefWaterTempSelect')) return;
  $('#prefWaterTempSelect').value = p?.water_temp || 'cold';
  $('#prefDetergentType').value = p?.detergent_type || '';
  $('#prefFabricSoftener').checked = Boolean(p?.fabric_softener);
  $('#prefFabricSoftenerType').value = p?.fabric_softener_type || '';
  $('#prefZonrox').checked = Boolean(p?.zonrox);
}
async function saveWashPreferences() {
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) return toast('Sign in to save wash preferences.');
  const payload = {
    customer_profile_id: session.user.id,
    water_temp: $('#prefWaterTempSelect').value || 'cold',
    detergent_type: $('#prefDetergentType').value.trim(),
    fabric_softener: $('#prefFabricSoftener').checked,
    fabric_softener_type: $('#prefFabricSoftenerType').value.trim(),
    zonrox: $('#prefZonrox').checked,
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('wash_preferences').upsert(payload, { onConflict: 'customer_profile_id' });
  if (error) return toast(error.message);
  toast('Wash preferences saved.');
  state.washPrefs = payload;
}
async function linkAccountPhone(phone) {
  try {
    const { data } = await sb.auth.getSession();
    if (!data?.session) return;
    await sb.rpc('update_my_customer_phone', { p_phone: phone });
  } catch (error) {
    console.warn('Could not link this phone to the signed-in account:', error);
  }
}

const NOTIF_PREF_KEY = 'bubblyfi-notif-prefs';
function loadNotifPrefs() {
  try { return { sound: true, vibrate: true, ...JSON.parse(localStorage.getItem(NOTIF_PREF_KEY) || '{}') }; }
  catch { return { sound: true, vibrate: true }; }
}
function saveNotifPrefs(prefs) {
  try { localStorage.setItem(NOTIF_PREF_KEY, JSON.stringify(prefs)); } catch {}
  window.AndroidBridge?.setNotificationPrefs?.(prefs.sound, prefs.vibrate);
}
async function upsertDevice(phone, fcmToken) {
  if (!fcmToken) return;
  const prefs = loadNotifPrefs();
  try {
    await sb.rpc('upsert_customer_device', { p_phone: phone, p_fcm_token: fcmToken, p_sound: prefs.sound, p_vibration: prefs.vibrate });
  } catch (error) {
    console.warn('Could not register this device for push notifications:', error);
  }
}
function registerDeviceForPush(phone) {
  if (!window.AndroidBridge?.getFcmToken) return;
  window.onFcmToken = token => { if (token) { state.lastFcmToken = token; upsertDevice(phone, token); } };
  window.AndroidBridge.getFcmToken();
}
function renderNotifSettings(phone) {
  const box = $('#notifSettings');
  if (!box) return;
  const prefs = loadNotifPrefs();
  box.classList.remove('hidden');
  $('#notifSound').checked = prefs.sound;
  $('#notifVibrate').checked = prefs.vibrate;
  const update = () => {
    const next = { sound: $('#notifSound').checked, vibrate: $('#notifVibrate').checked };
    saveNotifPrefs(next);
    upsertDevice(phone, state.lastFcmToken);
  };
  $('#notifSound').onchange = update;
  $('#notifVibrate').onchange = update;
}

async function sendBookingNotifications(requestNo) {
  const status = $('#smsConfirmationStatus');
  try {
    const { data, error } = await sb.functions.invoke('send-booking-sms', { body: { request_no: requestNo } });
    if (error) throw error;
    status.textContent = data?.message || 'Booking notifications processed.';
    status.className = 'sms-confirmation-status success';
  } catch (error) {
    console.warn('Booking notifications were not sent:', error);
    status.textContent = 'Booking saved. SMS/email notifications are not fully configured; Bubbly-fi will still see the request in the dashboard.';
    status.className = 'sms-confirmation-status warn';
  }
}

async function submitBooking(event) {
  event.preventDefault();
  if (state.submitting || !validateBooking()) return;
  state.submitting = true;
  const button = $('#submitBooking'); button.disabled = true;
  let submitStage = 'upload';
  try {
    const pickupFile = $('#pickupPhoto').files?.[0] || null;
    const itemFiles = [...($('#itemPhotos').files || [])].slice(0,5);
    let pickupPhotoPath = '';
    const itemPhotoPaths = [];
    if (pickupFile) {
      $('#submitStatus').textContent = 'Uploading optional pickup-point photo…';
      pickupPhotoPath = await uploadImage(pickupFile, 'pickup');
    }
    for (let i=0;i<itemFiles.length;i++) {
      $('#submitStatus').textContent = `Uploading optional item photo ${i+1} of ${itemFiles.length}…`;
      itemPhotoPaths.push(await uploadImage(itemFiles[i], 'item', i+1));
    }
    $('#submitStatus').textContent = 'Uploading GCash payment proof…';
    const paymentProofPath = await uploadImage($('#paymentProof').files[0], 'payment');

    const calc = calculate();
    const payload = {
      customer_name: $('#customerName').value.trim(), phone: normalizePhilippineMobile($('#phone').value), email: $('#email').value.trim(),
      service_type: state.service, item_type: state.itemType, full_service: isFullServiceSelection(), quantity: String(state.quantity), unit:currentLoadType().unit, place: state.place,
      detergent_source: serviceHasWash() ? state.detergentSource : 'not_applicable',
      detergent_item_id: state.detergentSource === 'inventory' ? state.detergentItemId : '',
      conditioner_source: serviceHasWash() ? state.conditionerSource : 'not_applicable',
      conditioner_item_id: state.conditionerSource === 'inventory' ? state.conditionerItemId : '',
      extra_dry: state.extraDry, extra_wash: state.extraWash, warm_hot_wash: state.warmHotWash, zonrox_colorsafe: state.zonroxColorsafe, extra_detergent: state.extraDetergent, extra_conditioner: state.extraConditioner,
      delivery_requested: state.deliveryRequested,
      address_line: $('#addressLine').value.trim(), building_unit: $('#buildingUnit').value.trim(), barangay: $('#barangay').value.trim(), city: $('#city').value.trim(), landmark: $('#landmark').value.trim(), full_address: fullAddress(),
      gps_lat: state.gpsLat, gps_lng: state.gpsLng, maps_url: state.mapsUrl, pickup_at: new Date($('#pickupAt').value).toISOString(),
      item_description: $('#itemDescription').value.trim(), item_count: $('#itemCount').value, bags_count: $('#bagsCount').value,
      pickup_photo_path: pickupPhotoPath, item_photo_paths: itemPhotoPaths,
      payment_reference: $('#paymentReference').value.trim(), payment_proof_path: paymentProofPath,
      customer_notes: $('#customerNotes').value.trim(), quoted_total: calc.total
    };

    submitStage = 'booking';
    $('#submitStatus').textContent = 'Saving your booking securely…';
    const { data, error } = await sb.rpc('submit_customer_order', { p_payload: payload });
    if (error) throw new Error(explainSupabaseError(error, 'booking'));
    $('#bookingForm').classList.add('hidden');
    $('#successRequestNo').textContent = data.request_no;
    $('#successTotal').textContent = peso.format(data.total);
    $('#successCard').classList.remove('hidden');
    window.scrollTo({ top:0, behavior:'smooth' });
    sendBookingNotifications(data.request_no);
    renderNotifSettings(payload.phone);
    registerDeviceForPush(payload.phone);
    linkAccountPhone(payload.phone);
  } catch (error) {
    console.error(error);
    const message = error?.message || explainSupabaseError(error, submitStage);
    toast(message);
    $('#submitStatus').textContent = message;
  } finally {
    state.submitting = false; button.disabled = false;
  }
}

function bindEvents() {
  $('#place').addEventListener('change', () => { state.place = $('#place').value; $('#areaMode').textContent = 'Selected manually'; renderAll(); });
  $('#serviceChoices').addEventListener('click', event => {
    const fullService = event.target.closest('[data-full-service]');
    if (fullService) { applyFullServicePreset(); renderAll(); return; }
    const button = event.target.closest('[data-service]'); if (!button) return;
    state.service = button.dataset.service; state.fullService=false; state.quantity = currentCapacity();
    if (!serviceHasWash()) { state.detergentSource='not_applicable'; state.conditionerSource='not_applicable'; state.warmHotWash=false; state.zonroxColorsafe=false; }
    renderAll();
  });
  $('#itemTypeChoices').addEventListener('click',event=>{const button=event.target.closest('[data-item-type]');if(!button)return;state.itemType=button.dataset.itemType;state.quantity=loadTypeCapacity();renderAll();});
  $$('.quantity-box button').forEach(button => button.addEventListener('click', () => {
    state.quantity = Math.max(currentLoadType().unit==='pc'?1:.5, Number(state.quantity) + Number(button.dataset.qty)); renderSummary();
  }));
  $('#detergentChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-detergent]'); if (!button) return;
    if (button.dataset.detergent === 'bring_own') { state.detergentSource='bring_own'; state.detergentItemId=''; }
    else { state.detergentSource='inventory'; state.detergentItemId=button.dataset.detergent; }
    renderProducts(); renderSummary();
  });
  $('#conditionerChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-conditioner]'); if (!button) return;
    if (button.dataset.conditioner === 'bring_own') { state.conditionerSource='bring_own'; state.conditionerItemId=''; }
    else if (button.dataset.conditioner === 'none') { state.conditionerSource='none'; state.conditionerItemId=''; }
    else { state.conditionerSource='inventory'; state.conditionerItemId=button.dataset.conditioner; }
    renderProducts(); renderSummary();
  });
  $('#addonChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-addon]'); if (!button || button.disabled) return;
    state[button.dataset.addon] = !state[button.dataset.addon]; renderAll();
  });
  $('#deliveryChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-delivery]'); if (!button) return;
    state.deliveryRequested = button.dataset.delivery === 'true'; renderAll();
  });
  $('#captureGps').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('GPS is not supported by this browser.');
    $('#gpsStatus').textContent = 'Capturing GPS…'; $('#captureGps').disabled = true;
    navigator.geolocation.getCurrentPosition(position => {
      state.gpsLat = position.coords.latitude.toFixed(7); state.gpsLng = position.coords.longitude.toFixed(7);
      state.mapsUrl = `https://www.google.com/maps?q=${state.gpsLat},${state.gpsLng}`;
      $('#gpsLat').value=state.gpsLat; $('#gpsLng').value=state.gpsLng; $('#mapsUrl').value=state.mapsUrl;
      const detected = applyDetectedArea(state.gpsLat, state.gpsLng, position.coords.accuracy);
      $('#gpsStatus').textContent=`GPS captured · ${places[detected]}`;
      $('#mapsLink').href=state.mapsUrl; $('#mapsLink').classList.remove('hidden'); $('#captureGps').disabled=false;
      showPinMap(state.gpsLat, state.gpsLng);
      toast(`Service area set to ${places[detected]}.`);
    }, error => {
      $('#gpsStatus').textContent='GPS not added'; $('#gpsDetails').textContent=`${error.message}. GPS is optional; select the service area manually.`; $('#areaMode').textContent='Selected manually'; $('#captureGps').disabled=false;
      toast('GPS was not added. Select the service area manually and continue.');
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
  });
  $('#pickupPhoto').addEventListener('change', () => previewFile($('#pickupPhoto'), $('#pickupPreview')));
  $('#itemPhotos').addEventListener('change', previewItems);
  $('#paymentProof').addEventListener('change', () => previewFile($('#paymentProof'), $('#paymentPreview')));
  $('#openLalamove')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(SHOP_ADDRESS); toast('Shop address copied. Paste it into LalaMove.'); }
    catch { toast(`Copy this shop address: ${SHOP_ADDRESS}`); }
    setTimeout(() => window.open(LALAMOVE_WEB_URL, '_blank', 'noopener'), 250);
  });
  $('#bookingForm').addEventListener('submit', submitBooking);
  $('#newBooking').addEventListener('click', () => location.reload());
  $('#authGoogle')?.addEventListener('click', () => signInWithProvider('google'));
  $('#authFacebook')?.addEventListener('click', () => signInWithProvider('facebook'));
  $('#authSignOut')?.addEventListener('click', async () => { await sb.auth.signOut(); await refreshAuthUi(); toast('Signed out.'); });
  $('#toggleAddresses')?.addEventListener('click', () => { $('#preferencesPanel').classList.add('hidden'); $('#addressesPanel').classList.toggle('hidden'); });
  $('#togglePreferences')?.addEventListener('click', () => { $('#addressesPanel').classList.add('hidden'); $('#preferencesPanel').classList.toggle('hidden'); });
  $('#saveNewAddressBtn')?.addEventListener('click', saveNewAddress);
  $('#savePreferencesBtn')?.addEventListener('click', saveWashPreferences);
  $('#savedAddressesList')?.addEventListener('click', event => {
    const useBtn = event.target.closest('[data-use-address]');
    const deleteBtn = event.target.closest('[data-delete-address]');
    if (useBtn) useSavedAddress(useBtn.dataset.useAddress);
    if (deleteBtn) deleteSavedAddress(deleteBtn.dataset.deleteAddress);
  });
}

setDefaultPickup(); bindEvents(); refreshAuthUi();
loadOptions().catch(error => {
  console.error(error); $('#loadingCard').classList.add('hidden'); $('#errorCard').textContent=error.message; $('#errorCard').classList.remove('hidden');
});
