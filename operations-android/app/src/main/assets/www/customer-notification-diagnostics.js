(() => {
  if (window.__bubblyfiWebOrdersV1617) return;
  window.__bubblyfiWebOrdersV1617 = true;

  const PHONE_KEY = 'bubblyfi_customer_phone_v1';
  const STATUS_KEY = 'bubblyfi_customer_web_status_v1617';
  const URL = 'https://amjhrejmcnthlrqddznw.supabase.co';
  const KEY = ['sb','publishable','5KkgIxPlTNAZjqgRX9Yh3A','tqLD2hNE'].join('_');
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (v, d) => { try { return JSON.parse(String(v || '')); } catch (_) { return d; } };
  const validPhone = (v) => String(v || '').replace(/\D/g, '').length >= 10;
  const norm = (v) => String(v || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const handwash = /\bhand[\s-]?wash(?:ing)?\b/i;
  const dateText = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
  };

  function meta(status, message = '') {
    const v = norm(`${status || ''} ${message || ''}`);
    if (/cancel|reject|failed/.test(v)) return {key:'cancelled',label:'Cancelled',step:-1,cls:'danger',title:'Order cancelled',body:'This order was cancelled or rejected.'};
    if (/delivered|completed|complete|claimed|received by customer/.test(v)) return {key:'delivered',label:'Delivered',step:8,cls:'done',title:'Laundry delivered',body:'Your laundry has been delivered successfully.'};
    if (/arrived|at (the )?(address|location|lobby|door)|delivery staff.*here|rider.*here/.test(v)) return {key:'arrived',label:'Arrived',step:7,cls:'arrived',title:'Delivery has arrived',body:'The delivery staff has arrived. Please receive your laundry.'};
    if (/ongoing delivery|delivery ongoing|out for delivery|in transit|delivery started|on delivery|en route.*deliver/.test(v)) return {key:'ongoing',label:'Ongoing delivery',step:6,cls:'rider',title:'Your laundry is on the way',body:'Delivery is ongoing. Please keep your phone available.'};
    if (/ready for delivery|ready.*pickup|ready/.test(v)) return {key:'ready',label:'Ready',step:5,cls:'ready',title:'Laundry is ready',body:'Your laundry is ready for pickup or delivery.'};
    if (/processing|washing|wash|drying|folding/.test(v)) return {key:'processing',label:'Processing',step:4,cls:'active',title:'Laundry is being processed',body:'Your laundry is currently being processed.'};
    if (/received at shop|arrived at shop|shop received|laundry received/.test(v)) return {key:'shop',label:'Received at shop',step:3,cls:'active',title:'Laundry received',body:'Bubbly-fi has received your laundry at the shop.'};
    if (/picked up|collected|pickup complete/.test(v)) return {key:'picked',label:'Picked up',step:2,cls:'rider',title:'Laundry picked up',body:'Your laundry has been picked up.'};
    if (/approach|nearby|near |on the way|coming|rider assigned|staff assigned|pickup ongoing|for pickup/.test(v)) return {key:'rider',label:'Rider on the way',step:1,cls:'rider',title:'Delivery staff is on the way',body:'Please keep your phone available.'};
    return {key:'confirmed',label:String(status || 'Booking received'),step:0,cls:'active',title:'Booking received',body:String(message || 'Your booking is recorded.')};
  }

  function options(order) {
    const out = [];
    const add = (v) => {
      if (v == null || v === false || v === '') return;
      if (Array.isArray(v)) return v.forEach(add);
      if (typeof v === 'object') return Object.entries(v).forEach(([k, x]) => x === true ? out.push(k.replace(/[_-]/g,' ')) : add(x));
      String(v).split(/[,;|•\n]+/).map(x => x.trim()).filter(Boolean).forEach(x => out.push(x));
    };
    [order.options,order.selected_options,order.addons,order.add_ons,order.addon_names,order.extra_services,order.handwash,order.hand_wash,order.extra_handwash].forEach(add);
    const notes = [order.notes,order.customer_notes,order.addon_notes,order.extra_handwash_notes].filter(Boolean).join(' ');
    if (handwash.test(notes) && !out.some(x => handwash.test(x))) out.unshift('Handwash');
    return [...new Set(out)];
  }

  const style = document.createElement('style');
  style.textContent = `
  #bf-web-orders-btn{position:fixed;left:12px;bottom:calc(112px + env(safe-area-inset-bottom,0px));z-index:2147483000;border:0;border-radius:999px;background:#087286;color:#fff;padding:13px 18px;font:800 14px system-ui;box-shadow:0 8px 24px #0005}
  #bf-web-orders{position:fixed;inset:0;z-index:2147483200;background:#021c239f;display:none;align-items:flex-end;padding-bottom:calc(70px + env(safe-area-inset-bottom,0px))}#bf-web-orders.open{display:flex}
  #bf-web-sheet{width:100%;height:min(88dvh,900px);background:#f3fafb;border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;font-family:system-ui;color:#24434a}
  #bf-web-head{padding:15px;background:#fff;border-bottom:1px solid #d8e7ea;display:flex;justify-content:space-between;gap:10px;align-items:center}#bf-web-head h2{margin:0;color:#075365}#bf-web-head p{margin:3px 0 0;font-size:12px;color:#687c81}
  .bf-web-action{border:1px solid #c6dce1;background:#fff;color:#075f70;border-radius:10px;padding:9px;font-weight:800}.bf-web-body{overflow:auto;padding:13px;flex:1}.bf-web-card,.bf-web-form,.bf-web-error{background:#fff;border:1px solid #d3e5e8;border-radius:16px;padding:14px;margin-bottom:10px}
  .bf-web-form input{width:100%;box-sizing:border-box;border:1px solid #b9d3d9;border-radius:11px;padding:12px;margin:10px 0;font-size:16px}.bf-web-form button{width:100%;border:0;border-radius:11px;padding:12px;background:#087286;color:#fff;font-weight:800}
  .bf-web-summary{display:grid;grid-template-columns:1fr auto;gap:8px;cursor:pointer}.bf-web-number{font-weight:900}.bf-web-status{grid-column:1/-1}.bf-web-pill{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900;background:#dfeff2;color:#075b69}.bf-web-pill.rider{background:#e5e6ff;color:#373b88}.bf-web-pill.arrived{background:#ffe7c2;color:#844600;border:2px solid #f0ac4e}.bf-web-pill.done{background:#def4e4;color:#17622f}.bf-web-pill.ready{background:#fff0bd;color:#765700}.bf-web-pill.danger{background:#ffe1e1;color:#882929}
  .bf-web-banner{grid-column:1/-1;background:#edf2ff;border-radius:11px;padding:10px;color:#303b79;font-size:13px}.bf-web-banner.arrived{background:#fff2dd;color:#7b4300}.bf-web-banner.done{background:#eaf8ee;color:#236337}.bf-web-progress{grid-column:1/-1;display:grid;grid-template-columns:repeat(9,1fr);gap:3px}.bf-web-progress i{height:5px;border-radius:99px;background:#dce7ea}.bf-web-progress i.on{background:#168596}.bf-web-progress i.now{background:#f1a63a}
  .bf-web-details{display:none;border-top:1px solid #e1edef;margin-top:12px;padding-top:12px}.bf-web-card.open .bf-web-details{display:block}.bf-web-chip{display:inline-flex;border-radius:999px;padding:6px 9px;margin:2px;background:#dfecef;font-size:12px;font-weight:800}.bf-web-chip.handwash{background:#ffe59a;color:#684500;border:2px solid #e4a900;font-size:13px}.bf-web-field{padding:8px;background:#f4f9fa;border-radius:9px;margin-top:6px;font-size:12px}.bf-web-field b{display:block;text-transform:uppercase;font-size:10px;color:#778a8f}
  #bf-web-alert{position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:2147483500;display:none;background:#243a7c;color:#fff;border-radius:15px;padding:13px 42px 13px 14px;box-shadow:0 8px 28px #0005;font:13px/1.4 system-ui}#bf-web-alert.show{display:block}#bf-web-alert.arrived{background:#8a4b00}#bf-web-alert.done{background:#176337}#bf-web-alert strong{display:block;font-size:15px}#bf-web-alert button{position:absolute;right:8px;top:8px;border:0;background:#ffffff2b;color:#fff;border-radius:8px;padding:6px 9px}
  .bf-handwash-highlight{background:#ffe59a!important;color:#684500!important;border:2px solid #e4a900!important;font-weight:900!important}
  `;
  document.head.appendChild(style);

  const alertBox = document.createElement('div');
  alertBox.id = 'bf-web-alert';
  alertBox.innerHTML = '<strong></strong><span></span><button type="button">×</button>';
  alertBox.querySelector('button').onclick = () => alertBox.classList.remove('show');
  document.body.appendChild(alertBox);
  function notify(m, ref = '') {
    if (!['rider','picked','ongoing','arrived','delivered'].includes(m.key)) return;
    alertBox.className = `show ${m.cls}`;
    $('strong',alertBox).textContent = m.title;
    $('span',alertBox).textContent = `${ref ? ref + ': ' : ''}${m.body}`;
    clearTimeout(notify.t); notify.t = setTimeout(() => alertBox.classList.remove('show'), m.key === 'arrived' ? 15000 : 10000);
  }

  const btn = document.createElement('button');
  btn.id = 'bf-web-orders-btn'; btn.type = 'button'; btn.textContent = '🧺 My Orders';
  const overlay = document.createElement('div');
  overlay.id = 'bf-web-orders';
  overlay.innerHTML = `<section id="bf-web-sheet"><header id="bf-web-head"><div><h2>My Orders</h2><p>Options and live delivery progress</p></div><div><button class="bf-web-action" id="bf-web-refresh">Refresh</button> <button class="bf-web-action" id="bf-web-close">Close</button></div></header><main class="bf-web-body"></main></section>`;
  document.body.append(btn,overlay);
  const body = $('.bf-web-body',overlay);
  let loading = false, timer = null;

  const rpc = async (name,payload) => {
    const r = await fetch(`${URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`},body:JSON.stringify(payload)});
    const t = await r.text(); let d={}; try{d=t?JSON.parse(t):{}}catch(_){}
    if(!r.ok) throw new Error(d.message||d.error||`Request failed (${r.status})`);
    return d;
  };
  const phone = () => localStorage.getItem(PHONE_KEY)||'';
  const form = (error='') => {
    body.innerHTML = `${error?`<div class="bf-web-error">${esc(error)}</div>`:''}<form class="bf-web-form"><strong>View all orders</strong><div>Use the phone number entered during booking.</div><input inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX" value="${esc(phone())}" required><button>View My Orders</button></form>`;
    $('form',body).onsubmit = e => {e.preventDefault();const p=$('input',body).value.trim();if(!validPhone(p))return form('Enter a valid phone number.');localStorage.setItem(PHONE_KEY,p);load();};
  };
  const statusCache = () => parse(localStorage.getItem(STATUS_KEY),{});
  function render(orders) {
    const before=statusCache(), next={...before};
    orders.forEach(o=>{const n=o.request_no||o.receipt_no||o.id||'';const s=String(o.current_status||o.status||'');if(before[n]&&before[n]!==s)notify(meta(s,o.current_message),n);next[n]=s;});
    localStorage.setItem(STATUS_KEY,JSON.stringify(next));
    body.innerHTML = orders.length ? orders.map((o,i)=>{
      const n=o.request_no||o.receipt_no||`Order ${i+1}`, m=meta(o.current_status||o.status,o.current_message), opts=options(o);
      const fields=[['Service',o.service],['Weight',o.weight?`${o.weight} kg`:'' ],['Loads',o.loads],['Address',o.address],['Notes',o.notes||o.customer_notes],['Handwash notes',o.extra_handwash_notes||o.handwash_notes]].filter(x=>x[1]);
      const progress=m.step<0?'':`<div class="bf-web-progress">${Array.from({length:9},(_,x)=>`<i class="${x<m.step?'on':x===m.step?'now':''}"></i>`).join('')}</div>`;
      return `<article class="bf-web-card"><div class="bf-web-summary"><div><div class="bf-web-number">${esc(n)}</div><small>${esc(dateText(o.created_at))}</small></div><b>${o.total?`₱${Number(o.total).toLocaleString('en-PH')}`:''}</b><div class="bf-web-status"><span class="bf-web-pill ${m.cls}">${esc(m.label)}</span> <small>${esc(o.current_message||m.body)}</small></div>${['rider','picked','ongoing','arrived','delivered'].includes(m.key)?`<div class="bf-web-banner ${m.cls}"><b>${esc(m.title)}</b><br>${esc(m.body)}</div>${progress}`:''}</div><div class="bf-web-details"><b>Options</b><div>${opts.length?opts.map(x=>`<span class="bf-web-chip ${handwash.test(x)?'handwash':''}">${handwash.test(x)?'🖐️ ':''}${esc(x)}</span>`).join(''):'<small>None specified</small>'}</div>${fields.map(x=>`<div class="bf-web-field"><b>${esc(x[0])}</b>${esc(x[1])}</div>`).join('')}</div></article>`;
    }).join('') : '<div class="bf-web-card"><strong>No orders found.</strong><br>Check the phone number used during booking.</div>';
    body.querySelectorAll('.bf-web-summary').forEach(x=>x.onclick=()=>x.closest('.bf-web-card').classList.toggle('open'));
  }
  async function load() {
    if(loading)return;const p=phone();if(!validPhone(p))return form();loading=true;
    try{const d=await rpc('get_customer_orders_by_phone',{p_phone:p});render(Array.isArray(d.orders)?d.orders:[]);}catch(e){form(e.message||String(e));}finally{loading=false;}
  }

  function highlight() {
    document.querySelectorAll('button,.choice-card,.option-chip,.tag,.badge,[data-option],[data-addon],td,li').forEach(el=>{if(handwash.test(el.textContent||''))el.classList.add('bf-handwash-highlight');});
  }
  new MutationObserver(highlight).observe(document.documentElement,{subtree:true,childList:true}); highlight();

  btn.onclick=()=>{overlay.classList.add('open');load();clearInterval(timer);timer=setInterval(load,30000);};
  $('#bf-web-close',overlay).onclick=()=>{overlay.classList.remove('open');clearInterval(timer);};
  $('#bf-web-refresh',overlay).onclick=load;
  overlay.onclick=e=>{if(e.target===overlay){overlay.classList.remove('open');clearInterval(timer);}};
  window.addEventListener('bubblyfiNotification',e=>{const d=e.detail||{};notify(meta(d.status,d.body||d.message),d.request_no||'');setTimeout(load,400);});
  window.addEventListener('bubblyfi:notification-open',e=>{const d=e.detail||{};notify(meta(d.status,d.body||d.message),d.request_no||'');setTimeout(load,400);});
  if(validPhone(phone()))setInterval(load,60000); else form();
})();