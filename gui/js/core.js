'use strict';
/* ============================== infrastruttura ============================== */
window.addEventListener('error', e => { (window.__errs = window.__errs || []).push(String(e.message)); });
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (n) => Number(n ?? 0).toLocaleString('it-IT');
const api = (action, body={}) => fetch(`/api/${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)})
  .then(async r => { const d = await r.json(); if (!r.ok) throw Object.assign(new Error(d.error || 'errore'), {data:d}); return d; });

function toast(text, kind='') {
  const t = document.createElement('div');
  t.className = 't ' + kind; t.textContent = text;
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4200);
}

function modal(title, bodyHtml, buttons){
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal"><div class="mh">${esc(title)}<button class="x" aria-label="chiudi">×</button></div>
    <div class="mb">${bodyHtml}</div><div class="mf"></div></div>`;
  const foot = $('.mf', root);
  for (const [label, cls, fn] of buttons) {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label;
    b.onclick = () => { if (fn(root, b) !== false) root.innerHTML = ''; };
    foot.appendChild(b);
  }
  $('.x', root).onclick = () => root.innerHTML = '';
  root.onclick = (e) => { if (e.target === root) root.innerHTML = ''; };
  return root;
}

let boot = null;

/* ============================== navigazione ============================== */
const ICONS = {
  dashboard:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12a6 6 0 0 1 12 0"/><path d="M8 12 11 7" stroke-linecap="round"/></svg>',
  agenda:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/><path d="m6.2 10 1.3 1.3 2.5-2.6"/></svg>',
  championships:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v3a5 5 0 0 0 10 0V2z"/><path d="M3 4.5H1.5a2.5 2.5 0 0 0 2.6 3.2M13 4.5h1.5a2.5 2.5 0 0 1-2.6 3.2"/><path d="M8 10v3M5.5 14h5" stroke-linecap="round"/></svg>',
  calendar:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>',
  standings:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M5.8 6.2h4.4M5.8 9.8h4.4" stroke-linecap="round"/></svg>',
  grid:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="5" height="5"/><rect x="8.5" y="2.5" width="5" height="5"/><rect x="2.5" y="8.5" width="5" height="5"/><rect x="8.5" y="8.5" width="5" height="5"/></svg>',
  series:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z"/><path d="M8 8 14 5M8 8 2 5M8 8v6.5"/></svg>',
  stats:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.6 2" stroke-linecap="round"/></svg>',
  banca:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6.5 8 3l6 3.5"/><path d="M3.5 6.5V12M6.5 6.5V12M9.5 6.5V12M12.5 6.5V12"/><path d="M2 13.5h12"/></svg>',
  import:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3" stroke-linecap="round"/><path d="M2 12v1.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
  difficulty:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.6" fill="var(--bg2)"/><circle cx="10.5" cy="8" r="1.6" fill="var(--bg2)"/><circle cx="5" cy="12" r="1.6" fill="var(--bg2)"/></svg>',
  messages:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="m2.5 4.5 5.5 4 5.5-4"/></svg>',
  settings:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6 5 5M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4"/></svg>',
  catalog:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h4.2v4.2H2.5zM9.3 3.5h4.2v4.2H9.3zM2.5 8.8h4.2V13H2.5zM9.3 8.8h4.2V13H9.3z"/></svg>',
  archive:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2.5" width="12" height="4" rx="1"/><path d="M3.5 6.5V13h9V6.5M6 9.5h4"/></svg>',
  rivals:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5.2" cy="5" r="2.2"/><circle cx="10.8" cy="5" r="2.2"/><path d="M1.8 13c.4-2.4 1.7-3.6 3.4-3.6S8.2 10.6 8.6 13M7.4 13c.4-2.4 1.7-3.6 3.4-3.6s3 1.2 3.4 3.6"/></svg>',
  gazzetta:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3h9.5a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12.5z"/><path d="M5.5 6.5h5M5.5 9h5M5.5 11.5h3"/></svg>',
  testday:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h3l2-4 2 8 2-5 1.5 2H14" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  setup:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.8 4.2a3.6 3.6 0 0 1-4.8 4.4L5 12.6a1.4 1.4 0 0 1-2-2l4-4a3.6 3.6 0 0 1 4.4-4.8L9.6 3.6l2.8 2.8z" stroke-linejoin="round"/></svg>',
  tracks:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 1.5 3.6 14.5M11.5 1.5l.9 13" stroke-linecap="round"/><path d="M8 3.5v1.6M8 7.2v1.6M8 10.9v1.6" stroke-linecap="round"/></svg>',
  cars:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 9.5 4 5.8A1.8 1.8 0 0 1 5.7 4.5h4.6A1.8 1.8 0 0 1 12 5.8l1.5 3.7M2.5 9.5h11M2.5 9.5v2.6a.9.9 0 0 0 .9.9h1.2a.9.9 0 0 0 .9-.9v-.4h5.8v.4a.9.9 0 0 0 .9.9h1.2a.9.9 0 0 0 .9-.9V9.5"/></svg>',
  garage:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 7 8 2.5 14.5 7M3 6.3V13.5h10V6.3M5 13.5V10h6v3.5M5 11.5h6"/></svg>',
};
/* icone dei pannelli del cruscotto (16x16, stile coerente con la nav) */
const LI = {
  flag:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 14.5v-12" stroke-linecap="round"/><path d="M3.5 3h9l-2 3 2 3h-9z" fill="currentColor" stroke="none" opacity=".85"/></svg>',
  trophy:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2.5h6v4a3 3 0 0 1-6 0z"/><path d="M5 3.5H3a2.5 2.5 0 0 0 2.4 3M11 3.5h2a2.5 2.5 0 0 1-2.4 3M8 9.5v2M5.5 13.5h5M6.5 11.5h3"/></svg>',
  medal:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="10" r="3.4"/><path d="m6 7-3-5h3.4L8 5.2 9.6 2H13l-3 5"/></svg>',
  bolt:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.8 1.8 4 9h3.2L7 14.2 12 7H8.6z" stroke-linejoin="round"/></svg>',
  euro:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 3.8A5 5 0 0 0 4.6 8a5 5 0 0 0 7.9 4.2M3 6.8h5.5M3 9.2h5.5"/></svg>',
  stopwatch:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="9" r="5"/><path d="M8 9V6.4M6.5 1.5h3M8 1.5V4" stroke-linecap="round"/></svg>',
  testday:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h3l2-4 2 8 2-5 1.5 2H14" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  setup:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.8v2.2M8 12v2.2M1.8 8H4M12 8h2.2M3.6 3.6 5.2 5.2M10.8 10.8l1.6 1.6M12.4 3.6 10.8 5.2M5.2 10.8l-1.6 1.6"/></svg>',
  scroll:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 2.5h7A1.5 1.5 0 0 1 13 4v8"/><path d="M4.5 2.5A1.5 1.5 0 0 0 3 4v8.5A1.5 1.5 0 0 0 4.5 14H12a1.5 1.5 0 0 1-1.5-1.5V4a1.5 1.5 0 0 0-1.5-1.5"/><path d="M5.5 5.5h4M5.5 8h4"/></svg>',
  swords:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m2.5 13.5 7-7M11 2.5h2.5V5L8 10.5M13.5 13.5l-7-7M5 2.5H2.5V5L8 10.5"/><path d="m3.5 11.5 1 1M11.5 11.5l-1 1"/></svg>',
  handshake:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m1.5 5.5 3-1.5 3 2 3-2 3 1.5"/><path d="m4.5 4 3.5 5.5L9.5 8l3 4-1.5 1.5-2-1.5-1.5 1.5L6 12l-1.5 1L3 11.5 4.5 8z" stroke-linejoin="round"/></svg>',
  chat:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke-linejoin="round"/></svg>',
  target:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.6"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>',
  book:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2.5h8.5A1.5 1.5 0 0 1 13 4v9.5H4.5A1.5 1.5 0 0 1 3 12z"/><path d="M3 12a1.5 1.5 0 0 1 1.5-1.5H13M5.5 5.5h5"/></svg>',
  news:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M4.5 6h7M4.5 8.5h7M4.5 11h4"/></svg>',
  compass:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="m10.5 5.5-1.4 3.6-3.6 1.4 1.4-3.6z" stroke-linejoin="round"/></svg>',
  shield:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.8 13.5 4v4c0 3.2-2.3 5.4-5.5 6.2C4.8 13.4 2.5 11.2 2.5 8V4z"/><path d="m5.8 8 1.6 1.6 2.8-3"/></svg>',
  gauge:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 12 10.8 7" stroke-linecap="round"/></svg>',
};
const COUNTRY_FLAG = { 'Italia':'🇮🇹','Giappone':'🇯🇵','Austria':'🇦🇹','Australia':'🇦🇺','Germania':'🇩🇪','Stati Uniti':'🇺🇸','Regno Unito':'🇬🇧','Francia':'🇫🇷','Belgio':'🇧🇪','Spagna':'🇪🇸','Portogallo':'🇵🇹','Brasile':'🇧🇷' };
const flagOf = (c) => COUNTRY_FLAG[c] ?? '🏁';
/* bandiera a scacchi inline per i titoli di gara */
const CFLAG = '<svg viewBox="0 0 16 16" style="width:14px;height:14px;vertical-align:-2px" fill="none" aria-hidden="true"><path d="M2.5 1.5h11v13h-11z"/><path d="M2.5 1.5h3.67v3.6H2.5zM9.83 5.1h3.67v3.6H9.83zM6.17 8.7h3.66v3.6H6.17z" fill="currentColor" stroke="none"/></svg>';
const TABS = [
  ['dashboard','Cruscotto'], ['agenda','Agenda'], ['messages','Messaggi'], ['championships','Campionati'], ['standings','Mondiale'],
  ['rivals','Rivali'], ['tracks','Piste'], ['cars','Auto'], ['garage','Garage'], ['import','Risultati'],
  ['setup','Setup'],
  ['archive','Archivio'], ['stats','Statistiche'],
  ['banca','Banca'],
  ['gazzetta','Gazzetta'], ['difficulty','Difficoltà'], ['settings','Impostazioni'],
];
/* un colore per ogni sezione: le icone della nav restano riconoscibili a colpo d'occhio */
const TAB_COLORS = {
  dashboard:'#5da9ff', agenda:'#ff7a45', calendar:'#b48cff', standings:'#ffd166', rivals:'#ff6b6b',
  tracks:'#e8c46b', cars:'#74c0fc', garage:'#ffd43b', import:'#63e6e2',
  setup:'#f78fb3', catalog:'#82ccdd', archive:'#c9a0ff', stats:'#69db7c',
  gazzetta:'#dfe4ea', difficulty:'#5f7cff', messages:'#ffa94d', settings:'#adb5bd', banca:'#ffd43b',
};
let tab = 'dashboard';
function drawNav(){
  const offers = boot?.header?.offers?.length || 0;
  const urgent = boot?.mailUrgent || 0;
  $('#nav').innerHTML = TABS.map(([id,label]) =>
    `<button data-tab="${id}" class="${tab===id?'on':''}">${ICONS[id]?`<span class="nico" style="color:${TAB_COLORS[id]||'var(--acc)'}">${ICONS[id]}</span>`:''}<span>${label}</span>${id==='messages'&&offers?`<span class="badge">${offers}</span>`:''}${id==='messages'&&urgent?`<span class="badge urgent" title="${urgent} email urgenti: gare da disputare o conflitti">⚠️${urgent}</span>`:''}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; drawNav(); render(); });
}

/* ============================== viste ============================== */
async function render(){
  const m = $('#main');
  if (!boot) return;
  if (!boot.hasCareer) return drawOnboarding(m);
  paintHeader(boot.header);
  m.innerHTML = '<div class="panel"><span class="spin"></span></div>';
  try {
    if (tab==='dashboard')  return await drawDashboard(m);
    if (tab==='agenda')     return await drawAgenda(m);
    if (tab==='rivals')     return await drawRivals(m);
    if (tab==='championships') return await drawChampionships(m);
    if (tab==='calendar')   return await drawCalendar(m);
    if (tab==='standings')  return await drawWorldRanking(m);
    if (tab==='tracks')     return await drawTracks(m);
    if (tab==='cars')       return await drawCars(m);
    if (tab==='garage')     return await drawGarage(m);
    if (tab==='catalog')    return await drawArchive(m);
    if (tab==='archive')    return await drawArchive(m);
    if (tab==='stats')      return await drawStats(m);
    if (tab==='banca')      return await drawBanca(m);
    if (tab==='gazzetta')   return await drawGazzetta(m);
    if (tab==='import')     return await drawImport(m);
    if (tab==='setup')      return await drawSetup(m);
    if (tab==='difficulty') return await drawDifficulty(m);
    if (tab==='messages')   return await drawMessages(m);
    if (tab==='settings')   return drawSettings(m);
  } catch(e){ window.__renderErr = e.stack ?? String(e); m.innerHTML = `<div class="panel"><div class="banner bad">${esc(e.message)}</div></div>`; }
}

function paintHeader(h){
  $('#idblock').classList.remove('hidden');
  $('#hstats').classList.remove('hidden');
  $('#t-ava').textContent = (h.driver.name || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  $('#t-name').textContent = h.driver.name;
  $('#t-sub').textContent = `${h.nation ?? ''} · ${h.sponsor ?? 'pilota privato'} · ${h.node.display}`;
  $('#t-money').textContent = money(h.money) + ' €';
  $('#t-rep').textContent = String(h.rep);
  $('#t-date').textContent = h.todayLabel ? `OGGI ${h.todayLabel}` : ('giorno ' + (h.day ?? 1));
  $('#t-season').textContent = `S${h.season} · R${h.round}/${h.rounds}`;
  // le tre statistiche chiave diventano scorciatoie: Data → Agenda, Rep → Statistiche, Banca → Banca
  $('#t-date').style.cursor = 'pointer';
  $('#t-date').onclick = () => { tab = 'agenda'; drawNav(); render(); };
  $('#t-rep').style.cursor = 'pointer';
  $('#t-rep').onclick = () => { tab = 'stats'; drawNav(); render(); };
  $('#t-money').style.cursor = 'pointer';
  $('#t-money').onclick = () => { tab = 'banca'; drawNav(); render(); };
  if (h.heritage) {
    $('#hstat-heritage').style.display = '';
    $('#t-heritage').textContent = `📜 ${h.heritage.completed ?? 0}${h.heritage.activeDone ? ' · eredità pronta!' : ''}`;
    $('#hstat-heritage').title = h.heritage.activeDone ? "Un'eredità di famiglia è pronta da incassare (pannello Eredità)" : 'Capitoli della saga di famiglia completati';
  }
}

async function refreshBoot(){
  boot = await api('boot');
  $('#dot-evo').classList.toggle('on', !!boot.gameRunning);
  $('#t-evo').textContent = boot.gameRunning ? 'EVO aperto' : 'chiuso';
  drawNav();
  if (boot.hasCareer) paintHeader(boot.header);
}

