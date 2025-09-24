/* ========= Router & Theme ========= */
function getPages(){ return Array.from(document.querySelectorAll('.page')); }
const footer = document.getElementById('footer');
const themeToggle = document.getElementById('themeToggle');

const sunSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`;
const moonSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

function setThemeIcon(mode){ if (themeToggle) themeToggle.innerHTML = (mode === 'dark') ? sunSVG : moonSVG; }
function applyTheme(mode){
  if(mode==='dark') document.body.classList.add('dark'); else document.body.classList.remove('dark');
  localStorage.setItem('theme',mode); setThemeIcon(mode);
}
themeToggle?.addEventListener('click', ()=> applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

function setActive(view){
  const v = view || 'home';

  // toggle active page
  getPages().forEach(p => p.classList.toggle('active', p.getAttribute('data-page') === v));

  const hash = v === 'home' ? '#home' : '#' + v;
  if (location.hash !== hash) history.pushState({view:v}, '', hash);
  try { window.scrollTo({top:0, behavior:'smooth'}); } catch(_) {}

  // footer + body padding
  const slim = v !== 'home';
  footer?.classList.toggle('slim', slim);
  try{
    document.documentElement.style.setProperty('--footer-h', slim ? '24px' : '36px');
    const fh = getComputedStyle(document.documentElement).getPropertyValue('--footer-h').trim();
    document.body.style.paddingBottom = fh;
  }catch(_){}

  // Page-specific loaders
  try{
    if (v === 'supplier-contacts') setTimeout(loadSupplierContacts, 0);
    if (v === 'top-performers')   setTimeout(() => loadTopPerformers(false), 0);

    // Link sections (Apps Script tabs)
    if (v === 'po-spreadsheets')   loadLinksGridFromTab('grid-po-spreadsheets',   'PO Spreadsheets');
    if (v === 'po-tools')          loadLinksGridFromTab('grid-po-tools',          'PO Tools');
    if (v === 'marketplaces')      loadLinksGridFromTab('grid-marketplaces',      'Marketplaces');
    if (v === 'mailboxes')         loadLinksGridFromTab('grid-mailboxes',         'Mailboxes');
    if (v === 'supplier-websites') loadLinksGridFromTab('grid-supplier-websites', 'Supplier Websites');
    if (v === 'tracker')           loadLinksGridFromTab('grid-tracker',           'Trackers');

    if (v === 'sops') ensureLinkGrid('grid-sops', SOP_LINKS); // manual unless you add a sheet
  }catch(err){
    console.error('[setActive] loader error:', err);
  }
}

/* ========= Apps Script Endpoint ========= */
const SUPPLIER_API = "https://script.google.com/macros/s/AKfycbzV_FMsyjQhtzgTZdb0y0jf9vgq8_ySPY2LEQXN6j9KSLy_z7oTnfDcmOPEQZCyGTm6dw/exec";

/* ========= Small utils ========= */
async function getJSON(res){
  const text = await res.text();
  try { return JSON.parse(text); } catch(e){ throw new Error('Invalid JSON from API'); }
}
function normalizeToHeadersRows(payload){
  if (payload && Array.isArray(payload.headers) && Array.isArray(payload.rows)) {
    const headers = payload.headers;
    const rows = payload.rows.map(r => Array.isArray(r) ? r : headers.map(h => valueFromObj(r, h)));
    return { headers, rows };
  }
  if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object') {
    const headers = Array.from(new Set(payload.flatMap(o => Object.keys(o))));
    const rows = payload.map(o => headers.map(h => valueFromObj(o, h)));
    return { headers, rows };
  }
  if (Array.isArray(payload) && payload.length && Array.isArray(payload[0])) {
    return { headers: payload[0], rows: payload.slice(1) };
  }
  throw new Error('Unexpected API shape');
}
function valueFromObj(obj, header){
  if (!obj) return '';
  if (header in obj) return obj[header] ?? '';
  const lower = header.toLowerCase();
  const candidates = [lower, lower.replace(/\s+/g,'_'), lower.replace(/\s+/g,''), header.replace(/\s+/g,'_')];
  for (const k of Object.keys(obj)) {
    const kl = k.toLowerCase();
    if (kl === lower || candidates.includes(kl)) return obj[k] ?? '';
  }
  return '';
}
function openExternal(href){
  try { window.open(href, '_blank', 'noopener'); }
  catch(_) { location.href = href; }
}

/* ========= Supplier Contacts ========= */
function buildContactsTable(headers, rows){
  const wrap = document.getElementById('contactsTableWrap');
  const sel  = document.getElementById('contactsSupplierFilter');
  const searchEl = document.getElementById('contactsSearch');

  const idx = {};
  headers.forEach((h,i)=> idx[(h||'').toString().trim().toLowerCase()] = i);

  const col = {
    supplier: idx['supplier'] ?? idx['vendor'] ?? idx['company'],
    contact : idx['contact'] ?? idx['name'] ?? idx['contact name'] ?? idx['full name'],
    email   : idx['email'] ?? idx['email address'],
    phone   : idx['phone'] ?? idx['phone number'] ?? idx['contact number'] ?? idx['mobile'],
    notes   : idx['notes'] ?? idx['remarks'] ?? idx['comment'] ?? idx['comments'] ?? -1
  };

  function mount(filtered){
    const table = document.createElement('table');
    table.className = 'contacts-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th>Supplier</th><th>Contact</th><th>Email</th><th>Phone</th><th>Notes</th>
    </tr>`;
    const tbody = document.createElement('tbody');

    filtered.forEach(r=>{
      const row = Array.isArray(r) ? r : headers.map(h => valueFromObj(r, h));
      if(!row || row.every(c => c===''||c==null)) return;

      const supplier = col.supplier!=null ? (row[col.supplier]||'') : '';
      const contact  = col.contact !=null ? (row[col.contact ]||'') : '';
      const email    = col.email   !=null ? (row[col.email   ]||'') : '';
      const phone    = col.phone   !=null ? (row[col.phone   ]||'') : '';
      const notes    = col.notes   !=-1   ? (row[col.notes   ]||'') : '';

      const tr = document.createElement('tr');

      const tdSupplier=document.createElement('td'); tdSupplier.textContent=supplier;
      const tdContact =document.createElement('td'); tdContact.textContent =contact;
      const tdEmail   =document.createElement('td');
      if(email && /@/.test(email)){ const a=document.createElement('a'); a.href=`mailto:${email}`; a.textContent=email; tdEmail.appendChild(a); }
      else tdEmail.textContent=email;
      const tdPhone   =document.createElement('td'); tdPhone.textContent  =phone;
      const tdNotes   =document.createElement('td'); tdNotes.textContent  =notes;

      tr.append(tdSupplier,tdContact,tdEmail,tdPhone,tdNotes);
      tbody.appendChild(tr);
    });

    table.append(thead,tbody);
    if (wrap){ wrap.innerHTML=""; wrap.appendChild(table); }
  }

  const supplierIdx = col.supplier ?? -1;
  const suppliers = supplierIdx===-1 ? [] : Array.from(new Set(rows.map(r => {
    const row = Array.isArray(r) ? r : headers.map(h => valueFromObj(r,h));
    return (row[supplierIdx]||'').toString().trim();
  }).filter(Boolean))).sort();
  if (sel) sel.innerHTML = '<option value="">All</option>' + suppliers.map(s=>`<option value="${s}">${s}</option>`).join('');

  mount(rows);

  function applyFilters(){
    const supplierVal = (sel?.value || '').trim().toLowerCase();
    const q = (searchEl?.value || '').trim().toLowerCase();
    const filtered = rows.filter(r=>{
      const row = Array.isArray(r) ? r : headers.map(h => valueFromObj(r,h));
      const sup = supplierIdx!==-1 ? (row[supplierIdx]||'').toString().toLowerCase() : '';
      const matchesSupplier = !supplierVal || sup === supplierVal;
      if(!q) return matchesSupplier;
      const matchesText = row.some(c => (c??'').toString().toLowerCase().includes(q));
      return matchesSupplier && matchesText;
    });
    mount(filtered);
  }
  if (sel) sel.onchange = applyFilters;
  if (searchEl) searchEl.oninput = applyFilters;
}

async function loadSupplierContacts(){
  const statusEl = document.getElementById('contactsStatus');
  const errEl = document.getElementById('contactsError');
  try{
    if (statusEl) statusEl.textContent = 'Loading…';
    if (errEl) errEl.style.display = 'none';

    const url = SUPPLIER_API + '?sheet=' + encodeURIComponent('Supplier Contacts');
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await getJSON(res);
    if (raw && raw.error) throw new Error(raw.error);

    const { headers, rows } = normalizeToHeadersRows(raw);
    buildContactsTable(headers, rows);
    if (statusEl) statusEl.textContent = `${rows.length} contacts loaded`;
  }catch(err){
    console.error(err);
    if (statusEl) statusEl.textContent = 'Failed to load contacts';
    if (errEl){
      errEl.textContent = 'Error: ' + err.message + ' — confirm the Web App is deployed (Anyone with the link) and the tab is exactly “Supplier Contacts”.';
      errEl.style.display = 'block';
    }
  }
}

/* ========= Top Performers ========= */
const PHOTO_BASES = [
  "https://cdn.jsdelivr.net/gh/KP360-PO/KPP@a0d4bb8d6909b10d25c517c65568568e4d37580b/path/to/photos/",
  "https://raw.githubusercontent.com/KP360-PO/KPP/a0d4bb8d6909b10d25c517c65568568e4d37580b/path/to/photos/",
  "https://raw.githubusercontent.com/purchase-order-team/Processors/main/path/to/photos/"
];
function buildPhotoUrl(filename, baseIdx=0){
  const clean = encodeURIComponent(String(filename||'').trim());
  return PHOTO_BASES[baseIdx] + clean;
}
function tinyPlaceholder(text=''){
  const t = (text||'').slice(0,2).toUpperCase();
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110'>
       <defs>
         <linearGradient id='g' x1='0' x2='1'>
           <stop offset='0' stop-color='#e5e7eb'/><stop offset='1' stop-color='#f3f4f6'/>
         </linearGradient>
       </defs>
       <rect rx='55' ry='55' width='110' height='110' fill='url(#g)'/>
       <text x='50%' y='55%' font-family='Inter,Arial' font-size='28' font-weight='700'
             text-anchor='middle' fill='#9ca3af'>${t}</text>
     </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
let _io;
function ensureImageObserver(){
  if (_io) return _io;
  _io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if (!entry.isIntersecting) return;
      const img = entry.target;
      _io.unobserve(img);
      let baseIdx = Number(img.dataset.baseIdx||"0");
      function setSrc(idx){
        img.dataset.baseIdx = String(idx);
        img.src = buildPhotoUrl(img.dataset.file, idx);
      }
      img.onload = ()=> img.classList.remove('img-loading');
      img.onerror = ()=>{
        const next = baseIdx + 1;
        if (next < PHOTO_BASES.length){ baseIdx = next; setSrc(next); }
        else { img.onerror = null; img.src = tinyPlaceholder(''); img.classList.remove('img-loading'); }
      };
      setSrc(baseIdx);
    });
  }, { rootMargin: "200px 0px", threshold: 0.01 });
  return _io;
}
function renderTPCard(p, idx=0){
  const div = document.createElement('div');
  div.className = 'tp-card';
  const img = document.createElement('img');
  img.alt = p.name || 'Photo';
  img.width = 110; img.height = 110;
  img.loading = 'lazy'; img.decoding = 'async';
  img.className = 'img-loading';
  img.src = tinyPlaceholder(p.name);
  img.dataset.file = p.photoFile || '';
  img.dataset.baseIdx = "0";
  if (idx < 4) img.fetchPriority = 'high';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = p.name;
  div.append(img, name);
  ensureImageObserver().observe(img);
  return div;
}
function buildTPGrid(list, note=''){
  const grid = document.getElementById('tp-page-grid'); if(!grid) return;
  grid.innerHTML = "";
  if (note){
    const n = document.createElement('div');
    n.style.cssText="margin:.25rem 0 1rem;color:var(--ink-2);font-size:.9rem";
    n.textContent = note;
    grid.appendChild(n);
  }
  if (!list.length) return;
  list.forEach((p,i) => grid.appendChild(renderTPCard(p,i)));
}
function openTPModalSkeleton(){
  if (document.querySelector('.tp-overlay')) return;
  const overlay = document.createElement('div'); overlay.className='tp-overlay';
  const modal = document.createElement('div'); modal.className='tp-modal';
  const head = document.createElement('div'); head.className='tp-head';
  head.innerHTML = `<strong>🎉 Top Performers — Loading…</strong>`;
  const close = document.createElement('button'); close.className='tp-close'; close.textContent='Close';
  close.onclick = () => overlay.remove(); head.appendChild(close);
  const body = document.createElement('div'); body.className='tp-body';
  const skeleton = document.createElement('div'); skeleton.className='tp-skeleton';
  for (let i=0;i<8;i++){ const c=document.createElement('div'); c.className='cell'; skeleton.appendChild(c); }
  body.appendChild(skeleton);
  const grid = document.createElement('div'); grid.className='tp-grid'; grid.style.display='none'; body.appendChild(grid);
  modal.append(head,body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
function fillTPModal(list, monthLabel){
  const overlay = document.querySelector('.tp-overlay'); if (!overlay) return;
  const body = overlay.querySelector('.tp-body');
  body.querySelector('.tp-skeleton')?.remove();
  const grid = body.querySelector('.tp-grid'); grid.style.display='grid'; grid.innerHTML='';
  overlay.querySelector('.tp-head strong').textContent = `🎉 Top Performers — ${monthLabel || 'Top Performers'}`;
  if (!list || !list.length){ const empty=document.createElement('div'); empty.textContent='No rows in Top Performer sheet.'; empty.style.cssText='color:var(--ink-2)'; grid.appendChild(empty); return; }
  list.forEach((p,i) => grid.appendChild(renderTPCard(p,i)));
}
async function loadTopPerformers(showModal=false){
  const grid = document.getElementById('tp-page-grid');
  if (showModal) openTPModalSkeleton();
  try{
    const url = SUPPLIER_API + '?sheet=' + encodeURIComponent('Top Performer');
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await getJSON(res);
    const { headers, rows } = normalizeToHeadersRows(raw);

    const idx = {}; headers.forEach((h,i)=> idx[String(h||'').trim().toLowerCase()] = i);
    const iName  = idx['name'] ?? idx['employee'] ?? idx['full name'] ?? idx['contact'];
    const iPhoto = idx['photo'] ?? idx['photo file'] ?? idx['photo filename'] ?? idx['filename'];

    if (iName == null || iPhoto == null) {
      buildTPGrid([], `No “Name”/“Photo” columns found in Top Performer. Headers: ${headers.join(', ')}`);
      if (showModal) fillTPModal([], null);
      return;
    }

    const list = rows
      .map(r => Array.isArray(r) ? r : headers.map(h => valueFromObj(r,h)))
      .map(r => ({ name: (r[iName]??'').toString().trim(), photoFile: (r[iPhoto]??'').toString().trim() }))
      .filter(p => p.name && p.photoFile);

    if (!list.length){
      buildTPGrid([], 'No rows in Top Performer sheet.');
      if (showModal) fillTPModal([], null);
    } else {
      buildTPGrid(list);
      if (showModal){
        const monthLabel = new Date(Date.now()-86400000*30).toLocaleString(undefined,{month:'long',year:'numeric'});
        fillTPModal(list, monthLabel);
      }
    }
  }catch(err){
    console.error('Top Performers load error:', err);
    if (grid) grid.innerHTML = `<div class="error">Top Performers error: ${err.message}. Test JSON: <a href="${SUPPLIER_API + '?sheet=' + encodeURIComponent('Top Performer')}" target="_blank" rel="noopener">open</a></div>`;
    if (showModal) fillTPModal([], null);
  }
}

/* ========= Link Grids (auto from Apps Script) ========= */
const PO_SPREADSHEETS   = [];
const PO_TOOLS          = [];
const MARKETPLACES      = [];
const MAILBOXES         = [];
const SUPPLIER_WEBSITES = [];
const SOP_LINKS         = [];
const TRACKERS          = [];

const TAB_REGISTRY = {
  'PO Spreadsheets'  : PO_SPREADSHEETS,
  'PO Tools'         : PO_TOOLS,
  'Marketplaces'     : MARKETPLACES,
  'Mailboxes'        : MAILBOXES,
  'Supplier Websites': SUPPLIER_WEBSITES,
  'Trackers'         : TRACKERS,
};

function linkCard({name, url, note}){
  const a = document.createElement('a');
  a.className = 'link-card';
  a.href = url || '#';
  if (url && /^https?:\/\//i.test(url)) { a.target = '_blank'; a.rel = 'noopener'; }
  a.setAttribute('aria-label', name || 'Link');
  a.innerHTML = `
    <div class="lc-ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 1 0 7.07 7.07l1.5-1.5" />
      </svg>
    </div>
    <div class="lc-title">${name || 'Untitled'}</div>
    ${note ? `<div class="lc-note">${note}</div>` : `<div class="lc-note"></div>`}
    <div class="lc-open" aria-hidden="true" title="Open">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 3h7v7" />
        <path d="M10 14L21 3" />
        <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
      </svg>
    </div>
  `;
  return a;
}

/* === Section renderer with built-in search that aligns with H2 === */
function renderLinksSection(container, items) {
  const section = container.closest('.page, .content') || document;
  const h2 = section ? section.querySelector(':scope > h2') : null;

  const header = document.createElement('div');
  header.className = 'section-header';

  if (h2 && h2.parentElement !== header) header.appendChild(h2);

  const tools = document.createElement('div');
  tools.className = 'links-tools';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'links-filter';
  input.placeholder = 'Search links or hint words…';

  const count = document.createElement('span');
  count.className = 'links-count';

  tools.append(input, count);
  header.appendChild(tools);

  const grid = document.createElement('div');
  grid.className = 'links-grid';

  container.innerHTML = '';
  container.append(header, grid);

  function paint(list){
    grid.innerHTML = '';
    if (!list || !list.length){
      const empty = document.createElement('div');
      empty.className = 'error';
      empty.textContent = 'No links found.';
      grid.appendChild(empty);
    } else {
      list.forEach(it => grid.appendChild(linkCard(it)));
    }
    count.textContent = `${(list||[]).length} link${(list||[]).length===1?'':'s'}`;
  }

  paint(items || []);

  input.addEventListener('input', ()=>{
    const q = (input.value || '').trim().toLowerCase();
    if (!q) return paint(items);
    const filtered = (items || []).filter(it => (it.haystack || '').includes(q));
    paint(filtered);
  });
}

function ensureLinkGrid(containerId, items){
  const el = document.getElementById(containerId);
  if (!el || el.dataset.rendered) return;
  renderLinksSection(el, items||[]);
  el.dataset.rendered = '1';
}

async function loadLinksGridFromTab(containerId, tabName){
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="res-sub" style="padding:.5rem">Loading…</div>';
  try{
    const { headers, rows } = await fetchSheetRows(tabName);
    const items = rowsToLinkItems(headers, rows);
    const bucket = TAB_REGISTRY[tabName];
    if (bucket) bucket.splice(0, bucket.length, ...items); // keep search data fresh
    renderLinksSection(container, items);
  }catch(err){
    console.error('Links grid load error:', err);
    container.innerHTML = `<div class="error">Failed to load “${tabName}”: ${err.message}</div>`;
  }
}

/* ========= Global SEARCH (Home) ========= */
const CATALOG = [
  { page:'po-projects',   title:'PO Projects',   keywords:['projects','po','portal','docs','kpp'], items: ()=>[] },
  { page:'supplier-contacts', title:'Supplier Contacts', keywords:['contacts','vendors','phone','email','supplier'], items: ()=>[] },
  { page:'email-templates', title:'Email Templates', keywords:['templates','email','reply','canned responses'], items: ()=>[] },
  { page:'schedule',       title:'Schedule',     keywords:['calendar','roster','shift'], items: ()=>[] },
  { page:'task-monitoring',title:'Task Monitoring', keywords:['tasks','tracker','kanban','status'], items: ()=>[] },
  { page:'marketplace-performance', title:'Marketplace Performance', keywords:['kpi','revenue','conversion','marketplace','performance'], items: ()=>[] },
  { page:'top-performers', title:'Top Performers', keywords:['awards','recognition','employees'], items: ()=>[] },
  { page:'tracker',        title:'Tracker', keywords:['status','metrics','tracking'], items: ()=> TRACKERS },

  // live from Apps Script
  { page:'po-spreadsheets',   title:'PO Spreadsheets',   keywords:['sheets','spreadsheets','gdrive','excel'], items: ()=> PO_SPREADSHEETS },
  { page:'po-tools',          title:'PO Tools',          keywords:['tools','utility','automation','dashboard'], items: ()=> PO_TOOLS },
  { page:'marketplaces',      title:'Marketplaces',      keywords:['amazon','ebay','walmart','marketplace','seller'], items: ()=> MARKETPLACES },
  { page:'mailboxes',         title:'Mailboxes',         keywords:['inbox','gmail','outlook','email','support'], items: ()=> MAILBOXES },
  { page:'supplier-websites', title:'Supplier Websites', keywords:['supplier','portal','ordering','tickets'], items: ()=> SUPPLIER_WEBSITES },
  { page:'sops',              title:'SOPs',              keywords:['standard operating procedures','guidelines','policy','process','how-to'], items: ()=> SOP_LINKS },
];

function harvestFromHomeIcons(){
  const entries = [];
  document.querySelectorAll('.categories .category').forEach(cat=>{
    const page = cat.getAttribute('data-view') || '';
    const title = (cat.querySelector('.title')?.textContent || '').trim();
    if (!page || !title) return;
    entries.push({
      kind:'category',
      page,
      title,
      subtitle:'Section',
      url:'',
      haystack:(title + ' ' + page.replace(/-/g,' ')).toLowerCase()
    });
  });
  return entries;
}

function buildIndex(){
  const entries = [];
  CATALOG.forEach(cat => {
    entries.push({
      kind:'category',
      page:cat.page,
      title:cat.title,
      subtitle:'Section',
      url:'',
      haystack:(cat.title + ' ' + (cat.keywords||[]).join(' ')).toLowerCase()
    });
    try{
      (cat.items()||[]).forEach(it => {
        const hs = [(it.name||''), (it.note||''), (it.url||''), cat.title, ...(cat.keywords||[])].join(' ').toLowerCase();
        entries.push({ kind:'item', page:cat.page, title:it.name||'Untitled', subtitle:(it.note||cat.title), url:it.url||'', haystack:hs });
      });
    }catch(_e){}
  });
  if (!entries.some(e => e.kind === 'category')) entries.push(...harvestFromHomeIcons());
  return entries;
}

const searchInput  = document.getElementById('globalSearch');
const searchBtn    = document.getElementById('searchBtn');
const resultsEl    = document.getElementById('searchResults');

function domReadyForSearch(){
  if (!searchInput || !resultsEl) {
    console.error('[Portal] Missing #globalSearch or #searchResults in index.html');
    return false;
  }
  return true;
}

function doSearch(){
  if (!domReadyForSearch()) return;
  const q = (searchInput.value||'').trim().toLowerCase();
  if (!q) { resultsEl.classList.remove('visible'); resultsEl.innerHTML=''; return; }
  const idx = buildIndex();
  const res = idx.filter(e => e.haystack.includes(q));
  res.sort((a,b)=>{
    if (a.kind!==b.kind) return a.kind==='item' ? -1 : 1;
    const ad = a.title.toLowerCase().indexOf(q);
    const bd = b.title.toLowerCase().indexOf(q);
    return (ad<0?999:ad) - (bd<0?999:bd);
  });
  renderResults(res.slice(0, 30), q);
}

function renderResults(list, q){
  resultsEl.innerHTML = '';
  if (!list.length){ resultsEl.classList.remove('visible'); return; }

  const header = document.createElement('div');
  header.className = 'res-header';
  header.textContent = `Results for “${q}” (${list.length})`;
  resultsEl.appendChild(header);

  list.forEach((e,i)=>{
    const row = document.createElement('div');
    row.className = 'res-item';
    row.setAttribute('role','option');
    row.dataset.index = String(i);

    const left = document.createElement('button');
    left.type = 'button';
    left.className = 'res-title-btn';
    left.innerHTML = `
      <div class="res-ico">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          ${e.kind==='item'
            ? '<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>'
            : '<circle cx="12" cy="12" r="9"/>'}
        </svg>
      </div>
      <div class="res-main">
        <div class="res-title-text">${e.title}</div>
        <div class="res-sub">${e.subtitle || (e.kind==='item' ? 'Link' : 'Section')} · <em>${e.page}</em>${e.url ? ` · <span class="res-url">${e.url}</span>`:''}</div>
      </div>
    `;
    left.addEventListener('click', ()=>{
      searchInput.value = e.title;
      doSearch();
    });

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'res-open-btn';
    open.title = 'Open';
    open.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>
      </svg>`;
    open.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      setActive(e.page);
      if (e.kind==='item' && e.url){
        try{ window.open(e.url, '_blank', 'noopener'); }catch(_){ location.href = e.url; }
      }
    });

    row.append(left, open);
    resultsEl.appendChild(row);
  });

  resultsEl.classList.add('visible');
}

function wireGlobalSearch(){
  if (!domReadyForSearch()) return;
  searchBtn?.addEventListener('click', doSearch);
  searchInput?.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') doSearch(); });
}

/* ===== Initial triggers ===== */
document.addEventListener('DOMContentLoaded', () => {
  const initial = (location.hash || '#home').replace('#','') || 'home';

  if (initial === 'home') { openTPModalSkeleton(); loadTopPerformers(true); }
  else { loadTopPerformers(false); }

  setActive(initial);

  wireGlobalSearch();

  // Prefetch tabs so search is ready quickly
  const TABS_TO_PREFETCH = Object.keys(TAB_REGISTRY);
  Promise.all(
    TABS_TO_PREFETCH.map(tab =>
      fetchSheetRows(tab)
        .then(({ headers, rows }) => {
          const items = rowsToLinkItems(headers, rows);
          TAB_REGISTRY[tab].splice(0, TAB_REGISTRY[tab].length, ...items);
        })
        .catch(()=>{})
    )
  );

  if (initial === 'supplier-contacts') setTimeout(loadSupplierContacts, 0);
  console.log('[Portal] init OK — search ready:', !!document.getElementById('globalSearch'));
});

/* ========= SPA nav ========= */
document.addEventListener('click', (e)=>{
  const link = e.target.closest('[data-view]');
  if (!link) return;
  e.preventDefault();
  setActive(link.getAttribute('data-view'));
});
window.addEventListener('popstate', e=>{
  const v = (e.state && e.state.view) || (location.hash || '#home').replace('#','');
  setActive(v);
});
document.querySelector('.brand')?.addEventListener('click', ()=> setActive('home'));

/* ========= Data helpers ========= */
async function fetchSheetRows(tabName){
  const url = SUPPLIER_API + "?sheet=" + encodeURIComponent(tabName);
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("HTTP " + res.status);
  const raw = await getJSON(res);
  if (raw && raw.error) throw new Error(raw.error);
  return normalizeToHeadersRows(raw);
}

// Map rows -> [{ name, url, note, tags, haystack }]
function rowsToLinkItems(headers, rows){
  const idx = {};
  headers.forEach((h,i)=>{ idx[(h||'').toString().trim().toLowerCase()] = i; });
  const iName = idx['name'] ?? idx['title'] ?? 0;
  const iUrl  = idx['url']  ?? idx['link']  ?? 1;
  const iNote = idx['note'] ?? idx['desc']  ?? idx['description'] ?? -1;
  const iTags = idx['tags'] ?? idx['keywords'] ?? -1;

  return rows
    .map(r => Array.isArray(r) ? r : headers.map(h => valueFromObj(r,h)))
    .map(r => {
      const name = (r[iName]??'').toString().trim();
      const url  = (r[iUrl ]??'').toString().trim();
      const note = (iNote>-1 ? (r[iNote]??'') : '').toString().trim();
      const tags = (iTags>-1 ? (r[iTags]??'') : '').toString().trim();
      const hay  = [name, note, tags, url].join(' ').toLowerCase();
      return { name, url, note, tags, haystack: hay };
    })
    .filter(it => it.name && it.url);
}

/* ========= Passcode Gate (per-tab session) ========= */
const CORRECT_PASSCODE = "po360"; // change to your passcode

function checkPasscode() {
  const inputEl = document.getElementById("passInput");
  const lock = document.getElementById("lockScreen");
  const error = document.getElementById("errorMsg");
  if (!inputEl || !lock) return;

  const input = inputEl.value.trim();
  if (input === CORRECT_PASSCODE) {
    lock.style.opacity = "0";
    setTimeout(() => { lock.style.display = "none"; }, 300);
    sessionStorage.setItem("siteUnlocked", "true"); // only for this tab
  } else {
    if (error) error.style.display = "block";
  }
}

(function initPasscode(){
  const lock = document.getElementById("lockScreen");
  const input = document.getElementById("passInput");
  if (!lock) return;

  if (sessionStorage.getItem("siteUnlocked") === "true") {
    lock.style.display = "none";
  }
  input?.addEventListener("keyup", (e)=>{ if (e.key === "Enter") checkPasscode(); });
})();
