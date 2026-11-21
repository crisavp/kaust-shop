/* Second-hand shop: reads items and settings live from the published Google Sheet. */
'use strict';

const CONFIG = {
  sheetBase: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSSdSyKPK5Nak-gCQuej8cOwUhymrLVOZfVzgdesQAxK4NiNf0J2ABMjTiBS9hFI9BhEvjvHopEehx5/pub',
  itemsGid: '146090687',
  settingsGid: '1935765217',
  photoManifest: 'photos/manifest.json',
  cacheKey: 'shop-cache-v1',
};

const state = {
  items: [],
  settings: {},
  photos: {},
  photoVersion: '',
  category: 'All',
  search: '',
  sort: 'new',
  showSold: false,
  current: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const safeUrl = (u) => (/^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : '');

function toItems(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(norm);
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const ix = {
    id: col('id'), title: col('title'), category: col('category'),
    price: col('pricesar', 'price'), status: col('status'), condition: col('condition'),
    newPrice: col('newpricesar', 'newprice'), newLink: col('newpricelink'),
    description: col('description'), details: col('details'), date: col('dateadded', 'date'),
  };
  const get = (r, k) => (ix[k] >= 0 ? (r[ix[k]] ?? '').trim() : '');
  return rows.slice(1).map((r, n) => {
    const status = get(r, 'status').toLowerCase() || 'available';
    return {
      id: get(r, 'id'),
      title: get(r, 'title'),
      category: get(r, 'category') || 'Other',
      price: num(get(r, 'price')),
      status: ['available', 'reserved', 'sold'].includes(status) ? status : 'available',
      condition: get(r, 'condition'),
      newPrice: num(get(r, 'newPrice')),
      newLink: safeUrl(get(r, 'newLink')),
      description: get(r, 'description'),
      details: get(r, 'details'),
      date: get(r, 'date'),
      row: n,
    };
  }).filter((it) => it.id && it.title);
}

function toSettings(rows) {
  const s = {};
  rows.slice(1).forEach((r) => { if (r[0]) s[norm(r[0])] = (r[1] || '').trim(); });
  return s;
}

/* ---------- Data loading ---------- */
const csvUrl = (gid) => `${CONFIG.sheetBase}?gid=${gid}&single=true&output=csv`;

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function loadPhotos() {
  try {
    const res = await fetch(CONFIG.photoManifest, { cache: 'no-cache' });
    if (!res.ok) return;
    const m = await res.json();
    state.photos = m.items || {};
    state.photoVersion = m.version || '';
  } catch (_) { /* no photos yet */ }
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CONFIG.cacheKey) || 'null'); } catch (_) { return null; }
}
function writeCache(itemsCsv, settingsCsv) {
  try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ itemsCsv, settingsCsv })); } catch (_) { /* ignore */ }
}

function applyData(itemsCsv, settingsCsv) {
  state.items = toItems(parseCSV(itemsCsv));
  state.settings = toSettings(parseCSV(settingsCsv));
  renderHeader();
  renderChips();
  renderGrid();
  openFromHash();
}

async function load() {
  const photosP = loadPhotos();
  const cached = readCache();
  if (cached) { await photosP; applyData(cached.itemsCsv, cached.settingsCsv); }
  try {
    const [itemsCsv, settingsCsv] = await Promise.all([fetchText(csvUrl(CONFIG.itemsGid)), fetchText(csvUrl(CONFIG.settingsGid))]);
    await photosP;
    writeCache(itemsCsv, settingsCsv);
    applyData(itemsCsv, settingsCsv);
  } catch (err) {
    if (!cached) $('status-msg').textContent = 'Could not load the items. Check your connection and reload the page.';
  }
}

/* ---------- Helpers ---------- */
const currency = () => state.settings.currency || 'SAR';
const fmt = (n) => (n == null ? '' : `${n.toLocaleString('en-US')} ${currency()}`);
function saving(it) {
  if (it.price == null || it.newPrice == null || it.newPrice <= it.price) return null;
  const amount = it.newPrice - it.price;
  return { amount, pct: Math.round((amount / it.newPrice) * 100) };
}
function photosOf(it) {
  const list = state.photos[it.id] || [];
  const v = state.photoVersion ? `?v=${encodeURIComponent(state.photoVersion)}` : '';
  return list.map((n) => ({
    full: `photos/${encodeURIComponent(it.id)}/${encodeURIComponent(n)}.jpg${v}`,
    thumb: `photos/${encodeURIComponent(it.id)}/${encodeURIComponent(n)}_t.jpg${v}`,
  }));
}
function itemLink(it) {
  return `${location.origin}${location.pathname}#${encodeURIComponent(it.id)}`;
}
function waLink(it) {
  const digits = (state.settings.whatsappnumber || '').replace(/\D/g, '');
  const tpl = state.settings.reservemessage || 'Hi! I would like to reserve {id}: {title} ({price} SAR). Is it still available?';
  const msg = tpl
    .replace(/\{id\}/g, it.id)
    .replace(/\{title\}/g, it.title)
    .replace(/\{price\}/g, it.price == null ? '' : it.price.toLocaleString('en-US'));
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${msg}\n${itemLink(it)}`)}`;
}
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove(); return ok;
  }
}

/* ---------- Render ---------- */
function renderHeader() {
  const s = state.settings;
  if (s.shopname) { $('shop-name').textContent = s.shopname; document.title = s.shopname; }
  $('currency-foot').textContent = currency();
  const step3 = [s.pickup, s.payment].filter(Boolean).join(' ');
  if (step3) $('step3').textContent = step3;
  const n = state.items.filter((it) => it.status === 'available').length;
  $('count').textContent = `${n} item${n === 1 ? '' : 's'} available`;
}

function visibleBase() {
  return state.items.filter((it) => state.showSold || it.status !== 'sold');
}

function renderChips() {
  const base = visibleBase();
  const counts = {};
  base.forEach((it) => { counts[it.category] = (counts[it.category] || 0) + 1; });
  const cats = Object.keys(counts).sort((a, b) => a.localeCompare(b));
  if (state.category !== 'All' && !counts[state.category]) state.category = 'All';
  const chip = (name, n) => `<button class="chip" type="button" data-cat="${esc(name)}" aria-pressed="${state.category === name}">${esc(name)}<span class="n">${n}</span></button>`;
  $('chips').innerHTML = chip('All', base.length) + cats.map((c) => chip(c, counts[c])).join('');
}

function sorted(list) {
  const statusRank = { available: 0, reserved: 1, sold: 2 };
  const by = {
    'new': (a, b) => (b.date || '').localeCompare(a.date || '') || b.row - a.row,
    'price-asc': (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
    'saving': (a, b) => (saving(b)?.pct ?? -1) - (saving(a)?.pct ?? -1),
  }[state.sort];
  return list.slice().sort((a, b) => statusRank[a.status] - statusRank[b.status] || by(a, b));
}

function cardHTML(it) {
  const ph = photosOf(it)[0];
  const sv = saving(it);
  const badge = it.status === 'reserved' ? '<span class="badge b-reserved">Reserved</span>'
    : it.status === 'sold' ? '<span class="badge b-sold">Sold</span>' : '<span></span>';
  const save = sv && it.status !== 'sold' ? `<span class="badge b-save">Save ${sv.pct}%</span>` : '';
  const img = ph ? `<img src="${ph.thumb}" alt="" loading="lazy" decoding="async">` : '<div class="noimg">Photo coming soon</div>';
  return `<button class="card${it.status === 'sold' ? ' is-sold' : ''}" type="button" data-id="${esc(it.id)}">
    <div class="ph">${img}<div class="badges">${badge}${save}</div></div>
    <div class="body">
      <div class="cat">${esc(it.category)}</div>
      <div class="title">${esc(it.title)}</div>
      <div class="prices"><span class="price">${esc(fmt(it.price))}</span>${it.newPrice && sv ? `<span class="was">${esc(fmt(it.newPrice))}</span>` : ''}</div>
      ${it.condition ? `<div class="cond">${esc(it.condition)}</div>` : ''}
    </div>
  </button>`;
}

function renderGrid() {
  const q = state.search.trim().toLowerCase();
  let list = visibleBase();
  if (state.category !== 'All') list = list.filter((it) => it.category === state.category);
  if (q) list = list.filter((it) => [it.id, it.title, it.description, it.details, it.category].join(' ').toLowerCase().includes(q));
  list = sorted(list);
  $('grid').innerHTML = list.map(cardHTML).join('');
  $('status-msg').textContent = state.items.length === 0 ? 'No items yet. Check back soon.'
    : list.length === 0 ? 'Nothing matches that search or filter.' : '';
}

/* ---------- Item dialog ---------- */
function openItem(id, push = true) {
  const it = state.items.find((x) => x.id.toLowerCase() === String(id).toLowerCase());
  if (!it) return;
  state.current = it;
  const photos = photosOf(it);
  $('d-gallery').innerHTML = photos.length
    ? photos.map((p, i) => `<img src="${p.full}" alt="${esc(it.title)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>`).join('')
    : '<div class="noimg">Photo coming soon</div>';
  $('d-thumbs').innerHTML = photos.length > 1
    ? photos.map((p, i) => `<button type="button" data-i="${i}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"><img src="${p.thumb}" alt=""></button>`).join('')
    : '';
  $('d-gallery').scrollLeft = 0;
  $('d-id').textContent = it.id;
  $('d-badges').innerHTML = it.status === 'reserved' ? '<span class="badge b-reserved">Reserved</span>'
    : it.status === 'sold' ? '<span class="badge b-sold">Sold</span>' : '';
  $('d-title').textContent = it.title;
  const sv = saving(it);
  $('d-price').innerHTML = `<span class="price">${esc(fmt(it.price))}</span>${sv ? `<span class="was">New ${esc(fmt(it.newPrice))}</span>` : ''}`;
  $('d-saving').innerHTML = sv
    ? `You save <strong>${esc(fmt(sv.amount))} (${sv.pct}%)</strong> compared with buying it new.${it.newLink ? ` <a href="${esc(it.newLink)}" target="_blank" rel="noopener nofollow">See the new price</a>` : ''}`
    : '';
  const facts = [['Condition', it.condition], ['Category', it.category], ['Details', it.details]].filter(([, v]) => v);
  $('d-facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('d-desc').textContent = it.description;

  const btn = $('d-reserve');
  if (it.status === 'sold') {
    $('d-reserve-text').textContent = 'Sold'; btn.setAttribute('aria-disabled', 'true'); btn.removeAttribute('href');
  } else {
    $('d-reserve-text').textContent = it.status === 'reserved' ? 'Reserved. Ask on WhatsApp' : 'Reserve on WhatsApp';
    btn.removeAttribute('aria-disabled'); btn.href = waLink(it);
  }

  const dlg = $('item-dialog');
  if (!dlg.open) dlg.showModal();
  if (push && location.hash !== `#${encodeURIComponent(it.id)}`) {
    history.pushState(null, '', `#${encodeURIComponent(it.id)}`);
    state.pushed = true;
  }
}

function closeItem() {
  const dlg = $('item-dialog');
  if (dlg.open) dlg.close();
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) openItem(id, false); else closeItem();
}

/* ---------- Events ---------- */
$('grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) openItem(card.dataset.id);
});
$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.category = chip.dataset.cat;
  renderChips(); renderGrid();
});
$('search').addEventListener('input', (e) => { state.search = e.target.value; renderGrid(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
$('show-sold').addEventListener('change', (e) => { state.showSold = e.target.checked; renderChips(); renderGrid(); });

$('d-close').addEventListener('click', closeItem);
$('item-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeItem(); });
$('item-dialog').addEventListener('close', () => {
  state.current = null;
  if (!location.hash) { state.pushed = false; return; }
  if (state.pushed) history.back();
  else history.replaceState(null, '', location.pathname + location.search);
  state.pushed = false;
});
window.addEventListener('popstate', openFromHash);

$('d-thumbs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const g = $('d-gallery');
  g.scrollTo({ left: g.clientWidth * Number(b.dataset.i), behavior: 'smooth' });
});
$('d-gallery').addEventListener('scroll', () => {
  const g = $('d-gallery');
  const i = Math.round(g.scrollLeft / Math.max(1, g.clientWidth));
  $('d-thumbs').querySelectorAll('button').forEach((b, n) => b.setAttribute('aria-current', String(n === i)));
}, { passive: true });

$('d-copy').addEventListener('click', async () => {
  if (state.current && await copy(state.current.id)) toast(`Copied ${state.current.id}`);
});
$('d-share').addEventListener('click', async () => {
  const it = state.current;
  if (!it) return;
  const url = itemLink(it);
  const text = `${it.title}: ${fmt(it.price)}`;
  if (navigator.share) {
    try { await navigator.share({ title: it.title, text, url }); return; } catch (_) { /* cancelled */ }
  }
  if (await copy(`${text}\n${url}`)) toast('Link copied');
});

/* ---------- Theme (light by default, dark on request) ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('theme-btn').setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--topbar').trim() || '#ffffff';
  try { localStorage.setItem('shop-theme', t); } catch (_) { /* ignore */ }
}
$('theme-btn').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

load();
