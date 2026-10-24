'use strict';
/* ============================== infrastruttura ============================== */
window.addEventListener('error', e => { (window.__errs = window.__errs || []).push(String(e.message)); });
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (n) => Number(n ?? 0).toLocaleString(window.LOCALE ?? 'it-IT');
const api = (action, call={}) => {
  // compat con lo stile del monolite: {method:'POST', body:{...}} — dopo lo split
  // alcune viste mandano ancora l'incartatura; il server in realtà vuole il SOLO body
  // (l'azione sta già nell'URL). Lo smaltiamo qui, una volta per tutte le chiamate.
  const body = (call && call.body && call.method) ? call.body : call;
  return fetch(`/api/${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body ?? {})})
    .then(async r => { const d = await r.json(); if (!r.ok) throw Object.assign(new Error(d.error || 'errore'), {data:d}); return d; });
};

function toast(text, kind='') {
  const t = document.createElement('div');
  t.className = 't ' + kind; t.textContent = text;
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4200);
}

/* ===================== barra aggiornamenti da GitHub =====================
   aparece solo se il remote offsite e' IN AVANTI del disco: "Aggiorna ora"
   porta giu' il codice (fetch + merge --ff-only) e gira i test. Il save
   carriera non entra nel repo: non si tocca mai. */
async function drawAggBar(agg){
  const host = $('#aggbar');
  if (!host) return;
  const a = agg ?? await (async () => { try { return await api('agg-info'); } catch { return { skip: true }; } })();
  if (!a || a.skip || a.diverged || !(a.remotoAvanti > 0)) { host.innerHTML = ''; return; }
  const n = a.remotoAvanti;
  host.innerHTML = `<div class="banner warn" style="margin:10px 0 2px">
    ↑ <b>${tr({ it: `Aggiornamenti di progetto pronti su GitHub: ${n}`, en: `Project updates ready on GitHub: ${n}` })}</b>
    <span class="muted" style="font-size:12px">${tr({ it: 'si aggiorna solo il codice: il tuo save non si tocca.', en: 'only the code updates; your save is never touched.' })}</span>
    <button class="mini" id="agg-now" style="margin-left:10px">${tr({ it: 'Aggiorna ora', en: 'Update now' })}</button>
    <button class="link" id="agg-later" style="margin-left:6px">${tr({ it: 'più tardi', en: 'later' })}</button></div>`;
  $('#agg-now', host).onclick = async () => {
    const b = $('#agg-now', host);
    b.disabled = true; b.textContent = tr({ it: 'Aggiorno...', en: 'Updating...' });
    try {
      const r = await api('agg-install');
      if (r.ok && r.nessuno) toast(tr({ it: 'Nessun aggiornamento mancante.', en: 'No missing updates.' }), 'ok');
      else if (r.ok && r.testOk === false) toast(tr({ it: 'Aggiornato a ' + (r.hash ?? '?') + ', ma npm test è FALLITO: guarda la console.', en: 'Updated to ' + (r.hash ?? '?') + ', but npm test FAILED: check the console.' }), 'err');
      else if (r.ok) {
        if (r.riavvio) {
          // AUTO-RESTART (24/10): il server si riavvia da solo col codice nuovo.
          toast(tr({ it: 'Aggiornato a ' + (r.hash ?? '?') + ' — test passati. Il server si riavvia da solo: la pagina si ricarica tra poco.', en: 'Updated to ' + (r.hash ?? '?') + ' — tests passed. The server restarts on its own: the page reloads shortly.' }), 'ok');
          const t0 = Date.now(); let giu = false;
          const iv = setInterval(async () => {
            if (Date.now() - t0 > 45000) { clearInterval(iv); return; }
            try { const c = await fetch('/api/agg-info', { signal: AbortSignal.timeout(1500) }); if (c.ok && giu) { clearInterval(iv); setTimeout(() => location.reload(), 800); } }
            catch { giu = true; }
          }, 1000);
        } else toast(tr({ it: 'Aggiornato a ' + (r.hash ?? '?') + ' — test passati. Riavvia il launcher per il codice nuovo.', en: 'Updated to ' + (r.hash ?? '?') + ' — tests passed. Restart the launcher to load the new code.' }), 'ok');
      }
      else toast(r.messaggio ?? tr({ it: 'Aggiornamento non riuscito.', en: 'Update failed.' }), 'err');
      drawAggBar(); // fresh via agg-info: la barra scompare se tutto combacia
    } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = tr({ it: 'Aggiorna ora', en: 'Update now' }); }
  };
  $('#agg-later', host).onclick = () => { host.innerHTML = ''; };
}

/* Indicatore SEMPRE leggibile in Impostazioni (24/10): anche in stato di quiete
   («tutto combacia») si dice CHE COSA è aggiornato e QUANDO è stato verificato.
   La barra in alto resta il messaggio d'interesse: qui si parla quando l'utente va
   a cercarla */
async function drawAggStatus(host){
  if (!host) return;
  const a = await (async () => { try { return await api('agg-info'); } catch (e) { return { skip: true, motivo: e.message }; } })();
  const b = a?.build ? `<b>v${esc(a.build.semver)}</b>${a.build.hash ? ` · ${esc(a.build.hash)}` : ''}` : '';
  const qundo = a?.verificato ? ` · ${tr({ it: 'verificato alle', en: 'checked at' })} ${esc(String(a.verificato))}` : '';
  if (a?.skip) host.innerHTML = `${tr({ it: 'Controllo aggiornamenti non disponibile', en: 'Update check not available' })}${a.motivo ? `: ${esc(a.motivo)}` : ''}${b ? ` · build ${b}` : ''}`;
  else if (a?.diverged) host.innerHTML = `<span style="color:#e0c98a">${tr({ it: '⚠ disco e GitHub sono divergi (commit in conflitto): l\'aggiornamento automatico non parte, serve un intervento a mano.', en: '⚠ disk and GitHub have diverged (conflicting commits): the automatic update will not run — a manual sync is needed.' })}</span>`;
  else if (a?.discoAvanti > 0) host.innerHTML = `${tr({ it: 'Il disco è AVANTI di GitHub (commit locali non ancora spinti)', en: 'Disk is AHEAD of GitHub (local commits not pushed yet)' })}${qundo}${b ? ` · build ${b}` : ''}`;
  else if (a?.remotoAvanti > 0) host.innerHTML = `${tr({ it: 'Aggiornamenti in attesa su GitHub', en: 'Updates waiting on GitHub' })} <b>${a.remotoAvanti}</b>${tr({ it: ' — usa la barra in alto', en: ' — use the bar above' })}${qundo}`;
  else host.innerHTML = `${tr({ it: 'Aggiornato', en: 'Up to date' })}${tr({ it: ': nessun aggiornamento in attesa', en: ': no update waiting' })}${qundo}${b ? ` · build ${b}` : ''}`;
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
  griglia:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="4" width="13" height="9" rx="1.2"/><path d="M5.5 4v9M10.5 4v9M1.5 8.5h13"/></svg>',
  series:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z"/><path d="M8 8 14 5M8 8 2 5M8 8v6.5"/></svg>',
  stats:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.6 2" stroke-linecap="round"/></svg>',
  banca:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 3.8A5.4 5.4 0 0 0 4.4 8a5.4 5.4 0 0 0 8.1 4.4M3 6.8h6M3 9.2h6" stroke-linecap="round"/></svg>',
  import:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3" stroke-linecap="round"/><path d="M2 12v1.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
  difficulty:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.6" fill="var(--bg2)"/><circle cx="10.5" cy="8" r="1.6" fill="var(--bg2)"/><circle cx="5" cy="12" r="1.6" fill="var(--bg2)"/></svg>',
  messages:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="m2.5 4.5 5.5 4 5.5-4"/></svg>',
  settings:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.4"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6 5 5M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4"/></svg>',
  catalog:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 3.5h4.2v4.2H2.5zM9.3 3.5h4.2v4.2H9.3zM2.5 8.8h4.2V13H2.5zM9.3 8.8h4.2V13H9.3z"/></svg>',
  archive:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2.5" width="12" height="4" rx="1"/><path d="M3.5 6.5V13h9V6.5M6 9.5h4"/></svg>',
  rivals:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5.2" cy="5" r="2.2"/><circle cx="10.8" cy="5" r="2.2"/><path d="M1.8 13c.4-2.4 1.7-3.6 3.4-3.6S8.2 10.6 8.6 13M7.4 13c.4-2.4 1.7-3.6 3.4-3.6s3 1.2 3.4 3.6"/></svg>',
  analisi:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 13.5V4M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v9.5H4a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M5 6.5h3l1.5 3.5 1.5-2 1.5 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  testday:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h3l2-4 2 8 2-5 1.5 2H14" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  /* la voce Setup porta la FIGURA del meccanico (cappellino + tuta + chiave):
     è lui il protagonista di quella scheda, non una generica chiave inglese */
  setup:'<svg viewBox="0 0 16 16" fill="currentColor" stroke="none"><circle cx="7" cy="4.8" r="2"/><path d="M4 3.8h6l-.5-1.5a2.7 2.7 0 0 0-5 0z" opacity=".9"/><path d="M2.9 14.6c0-3.1 1.85-5.3 4.1-5.3s4.1 2.2 4.1 5.3z" opacity=".8"/><g transform="rotate(38 12.3 10.6)"><circle cx="12.3" cy="8.9" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11.7" y="10.6" width="1.2" height="3.8" rx="0.6"/></g></svg>',
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
  ['dashboard',      tr({ it: 'Cruscotto',      en: 'Dashboard' })],
  ['agenda',         tr({ it: 'Centro gare',    en: 'Race centre' })],
  ['setup',          tr({ it: 'Setup',          en: 'Setup' })],
  ['analisi',        tr({ it: 'Analisi',        en: 'Analysis' })],
  ['messages',       tr({ it: 'Messaggi',       en: 'Messages' })],
  ['championships',  tr({ it: 'Campionati',     en: 'Championships' })],
  ['griglia',        tr({ it: 'Griglia',        en: 'Grid' })],
  ['standings',      tr({ it: 'Mondiale',       en: 'World' })],
  ['rivals',         tr({ it: 'Rivali',         en: 'Rivals' })],
  ['tracks',         tr({ it: 'Piste',          en: 'Tracks' })],
  ['cars',           tr({ it: 'Auto',           en: 'Cars' })],
  ['garage',         tr({ it: 'Garage',         en: 'Garage' })],
  ['import',         tr({ it: 'Risultati',      en: 'Results' })],
  ['archive',        tr({ it: 'Archivio',       en: 'Archive' })],
  ['stats',          tr({ it: 'Statistiche',    en: 'Stats' })],
  ['banca',          tr({ it: 'Finanze',        en: 'Finances' })],
  ['difficulty',     tr({ it: 'Difficoltà',     en: 'Difficulty' })],
  ['settings',       tr({ it: 'Impostazioni',   en: 'Settings' })],
]; /* la vista LIVE è stata RIMOSSA su richiesta Mauro (21/10 23:5x): «non la
   guarderebbe nessuno». Backup completo in sessione-21-10/.backup-live-21-10/. Il motore
   live sottostante (src/live.mjs, lettore PS, strip header «In pista»,
   caricamento automatico import) resta: lo usano telemetria e setup.
/* un colore per ogni sezione: le icone della nav restano riconoscibili a colpo d'occhio */
const TAB_COLORS = {
  dashboard:'#5da9ff', agenda:'#ff7a45', calendar:'#b48cff', standings:'#ffd166',  rivals:'#ff6b6b',
  analisi:'#a3e433',
  tracks:'#e8c46b', cars:'#74c0fc', garage:'#ffd43b', import:'#63e6e2', griglia:'#82ccdd',
  setup:'#f78fb3', catalog:'#82ccdd', archive:'#c9a0ff', stats:'#69db7c',
  difficulty:'#5f7cff', messages:'#ffa94d', settings:'#adb5bd', banca:'#ffd43b',
};
let tab = 'dashboard';
function drawNav(){
  const offers = boot?.header?.offers?.length || 0;
  const urgent = boot?.mailUrgent || 0;
  $('#nav').innerHTML = TABS.map(([id,label]) =>
    `<button data-tab="${id}" class="${tab===id?'on':''}">${ICONS[id]?`<span class="nico" style="color:${TAB_COLORS[id]||'var(--acc)'}">${ICONS[id]}</span>`:''}<span>${label}</span>${id==='messages'&&offers?`<span class="badge">${offers}</span>`:''}${id==='messages'&&urgent?`<span class="badge urgent" title="${tr({ it: `${urgent} email urgenti: gare da disputare o conflitti`, en: `${urgent} ${urgent===1?'urgent email':'urgent emails'}: races to run or conflicts` })}">⚠️${urgent}</span>`:''}</button>`).join('');
  $$('#nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; drawNav(); render(); });
}

/* ============================== viste ============================== */
async function render(){
  const m = $('#main');
  if (!boot) return;
  // il timer LIVE resta attivo SOLO mentre la vista LIVE è in primo piano:
  // qui lo ammazziamo PRIMA di disegnare l'altro tab (altrimenti continihva
  // a sovrascrivere il pannello del tab aperto)
  if (window.__liveTimer) { clearInterval(window.__liveTimer); window.__liveTimer = null; }
  // il timer auto-refresh del tab SETUP muore al cambio vista (come il LIVE):
  if (window.__setupTimer) { clearInterval(window.__setupTimer); window.__setupTimer = null; }
  if (!boot.hasCareer) return drawOnboarding(m);
  paintHeader(boot.header);
  drawAggBar(boot.aggiornamenti ?? null);
  // check periodico mentre il tab resta aperto (24/10: prima si vedeva solo
  // al lancio): ogni 10 minuti la stessa /api/agg-info NON bloccante, così il
  // badge compare anche se GitHub va avanti nel frattempo. Nessun poll al
  // server di più: la cache Memo vale 60s e il contorno resta leggero.
  clearInterval(window.__aggTimer);
  window.__aggTimer = setInterval(() => drawAggBar(), 600000);
  m.innerHTML = '<div class="panel"><span class="spin"></span></div>';
  try {
  if (tab==='dashboard')  return await drawDashboard(m);
      if (tab==='agenda')     return await drawAgenda(m);
    if (tab==='rivals')     return await drawRivals(m);
    if (tab==='analisi')    return await drawAnalisi(m);
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
    if (tab==='import')     return await drawImport(m);
    if (tab==='griglia')    return await drawGridTab(m);
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
  $('#t-sub').textContent = `${h.nation ?? ''} · ${h.sponsor ?? tr({ it: 'pilota privato', en: 'private driver' })} · ${h.node.display}`;
  $('#t-money').textContent = money(h.money) + ' €';
  $('#t-rep').textContent = String(h.rep);
  $('#t-date').textContent = h.todayLabel ? `${tr({ it: 'OGGI', en: 'TODAY' })} ${h.todayLabel}` : `${tr({ it: 'giorno', en: 'day' })} ${h.day ?? 1}`;
  $('#t-season').textContent = `S${h.season} · R${h.round}/${h.rounds}`;
  // le tre statistiche chiave diventano scorciatoie: Data → Centro gare, Rep → Statistiche, Finanze → Finanze
  $('#t-date').style.cursor = 'pointer';
  $('#t-date').onclick = () => { tab = 'agenda'; drawNav(); render(); };
  $('#t-rep').style.cursor = 'pointer';
  $('#t-rep').onclick = () => { tab = 'stats'; drawNav(); render(); };
  $('#t-money').style.cursor = 'pointer';
  $('#t-money').onclick = () => { tab = 'banca'; drawNav(); render(); };
  // CONTEGGIO ALLA PROSSIMA GARA (badge header): rosso se in ritardo, giallo se ≤2 giorni.
  // Clic → Agenda. Serve a NON perdere gare "che non sapevi" (RX-7 R2 Sebring).
  const nr = h.nextRace;
  const nrEl = $('#hstat-nextrace');
  if (nr && (nr.in > 0 || nr.late)) {
    nrEl.style.display = '';
    const el = $('#t-nextrace');
    if (nr.late) {
      el.textContent = `⚠️ ${tr({ it: 'IN RITARDO', en: 'OVERDUE' })} · ${nr.node} R${nr.round}`;
      el.style.color = 'var(--bad,#e05d5d)';
      nrEl.title = tr({ it: 'La gara {N} R{R} a {T} era in programma il {D} e NON è stata corsa: i rivali incassano punti ogni giorno che passa. Vai nel Centro gare (o Cruscotto) e corri la R{R2} a {T2}!', en: 'The race {N} R{R} at {T} was scheduled for {D} and was NOT run: rivals collect points every day that passes. Go to the Race centre (or Dashboard) and run R{R2} at {T2}!' }).replace('{N}', nr.node).replace('{R}', nr.round).replace('{T}', nr.track).replace('{D}', nr.dateLabel).replace('{R2}', nr.round).replace('{T2}', nr.track);
    } else if (nr.in <= 2) {
      el.textContent = `${tr({ it: 'tra', en: 'in' })} ${nr.in} ${nr.in === 1 ? tr({ it: 'giorno', en: 'day' }) : tr({ it: 'giorni', en: 'days' })} · ${nr.node} R${nr.round}`;
      el.style.color = 'var(--warn,#ffb454)';
      nrEl.title = tr({ it: '{N} R{R} a {T} — {D}. STAI ATTO: la gara diventa "in ritardo" se non la corri entro quel giorno.', en: '{N} R{R} at {T} — {D}. PAY ATTENTION: the race becomes "overdue" if you don\'t run it that day.' }).replace('{N}', nr.node).replace('{R}', nr.round).replace('{T}', nr.track).replace('{D}', nr.dateLabel);
    } else {
      el.textContent = `${tr({ it: 'tra', en: 'in' })} ${nr.in} ${tr({ it: 'giorni', en: 'days' })} · ${nr.node} R${nr.round}`;
      el.style.color = '';
      nrEl.title = `${nr.node} R${nr.round} ${tr({ it: 'a', en: 'at' })} ${nr.track} — ${nr.dateLabel}`;
    }
    nrEl.onclick = () => { tab = 'agenda'; drawNav(); render(); };
  } else { nrEl.style.display = 'none'; }
  if (h.heritage) {
    $('#hstat-heritage').style.display = '';
    $('#t-heritage').textContent = `📜 ${h.heritage.completed ?? 0}${h.heritage.activeDone ? ` · ${tr({ it: 'eredità pronta!', en: 'inheritance ready!' })}` : ''}`;
    $('#hstat-heritage').title = h.heritage.activeDone ? tr({ it: "Un'eredità di famiglia è pronta da incassare (pannello Eredità)", en: 'A family inheritance is ready to claim (Heritage panel)' }) : tr({ it: 'Capitoli della saga di famiglia completati', en: 'Chapters of the family saga completed' });
  }
}

async function refreshBoot(){
  boot = await api('boot');
  $('#dot-evo').classList.toggle('on', !!boot.gameRunning);
  $('#t-evo').textContent = boot.gameRunning ? tr({ it: 'EVO aperto', en: 'EVO open' }) : tr({ it: 'chiuso', en: 'closed' });
  // versione della build: aggiornamento automatico a ogni sincronizzazione git
  // (tools/bump-versione.mjs) — package.json + hash breve del commit.
  if (boot.versione && boot.versione.semver && boot.versione.semver !== '?') {
    let sf = $('.side-foot');
    if (sf) sf.innerHTML = `${tr({ it: 'Assetto Corsa EVO · tool locale', en: 'Assetto Corsa EVO · local tool' })}<br>${tr({ it: 'tutto resta sul tuo PC', en: 'everything stays on your PC' })}<br><span id="build-ver" title="versione della build (si aggiorna a ogni salvataggio del progetto su GitHub)">build ${esc(boot.versione.semver)}${boot.versione.hash ? ` · ${esc(boot.versione.hash)}` : ''}</span>`;
    // footer: contatto e donazioni (scelta del 21/10: issue GitHub precompilata + Ko-fi).
    // Il SERVER precompila titolo e corpo della segnalazione (versione build, serie in
    // corso, ronda, pista, difficoltà, ultimi errori); l'utente completa e invia.
    // 24/10 (richiesta Mauro): il caffè non più solo come link nel footer ma un
    // BANNER proprio sopra i link — più visibile, resta comunque discreto.
    const fl = boot.feedback || {};
    const footLinks = [];
    if (fl.kofi) sf.innerHTML += `<a class="kofi-banner" href="${esc(fl.kofi)}" target="_blank" rel="noopener" title="${tr({ it: 'Offri un caffè: sostieni lo sviluppo del tool — apre Ko-fi', en: 'Buy me a coffee: support the tool\'s development — opens Ko-fi' })}"><span class="cup">☕</span> ${tr({ it: 'Offrimi un caffè', en: 'Buy me a coffee' })}<span class="muted">${tr({ it: ' · sostieni lo sviluppo', en: ' · support the dev' })}</span></a>`;
    if (fl.issuesUrl) footLinks.push(`<a href="${esc(fl.issuesUrl)}" target="_blank" rel="noopener" title="${tr({ it: 'Apre GitHub con la segnalazione già compilata: leggi, completa il dettaglio e invia', en: 'Opens GitHub with the report already filled in: read, add details and submit' })}">🐞 ${esc(tr({ it: 'Segnala un problema', en: 'Report a problem' }))}</a>`);
    if (footLinks.length) sf.innerHTML += `<div class="foot-links">${footLinks.join('<span class="foot-sep">·</span>')}</div>`;
  }
  drawNav();
  if (boot.hasCareer) paintHeader(boot.header);
}/* l'etichetta STATICHE dell'header (index.html): tradotte una volta sola */
(function paintStaticChrome() {
  const HEADER_L = {
    'Data': tr({ it: 'Data', en: 'Date' }),
    'Finanze': tr({ it: 'Finanze', en: 'Finances' }),
    'Reputazione': tr({ it: 'Reputazione', en: 'Reputation' }),
    'Stagione': tr({ it: 'Stagione', en: 'Season' }),
    'Eredità': tr({ it: 'Eredità', en: 'Heritage' }),
    'Prossima gara': tr({ it: 'Prossima gara', en: 'Next race' }),
    'Gioco': tr({ it: 'Gioco', en: 'Game' }),
    'MoTeC': 'MoTeC',
    'In pista': tr({ it: 'In pista', en: 'On track' }),
  };
  $$('#hstats .hstat .l').forEach((el) => { if (HEADER_L[el.textContent.trim()]) el.textContent = HEADER_L[el.textContent.trim()]; });
})();


/* ============================== faccine & icone dei pannelli ============================== */
/* Mauro 21/10: «controlla tutte le pagine, se ritieni stiano bene aggiungi faccine e
   icone». Invece di riscrivere i titoli in 17 file di viste, un DECORATORE centrale:
   ogni h2 di pannello senza emoji/icona prende una piccola faccina coerente col senso
   del pannello (mappa per PAROLA CHIAVE, con fallback per tab). Funziona anche per le
   viste future: niente da ricordarsi quando si aggiunge un pannello. */
const H2_ICONS = [
  [/regola dei 4 psi/i, '🛞'],
  [/auto della serie/i, '🚗'],
  [/diagnostica telemetria/i, '🩺'],
  [/salute sistema/i, '🫀'],
  [/registro errori/i, '🧯'],
  [/prossima gara/i, '🏁'],
  [/eredità/i, '📜'],
  [/regole .*(weekend|week-end)/i, '📋'],
  [/strumenti rapidi/i, '⚒️'],
  [/eventi speciali/i, '🎪'],
  [/messaggi recenti/i, '📬'],
  [/vita fuori pista/i, '🌆'],
  [/consigli del box/i, '🔧'],
  [/storia/i, '📜'],
  [/statistiche/i, '📈'],
  [/finanz/i, '💰'],
  [/difficoltà/i, '🎚️'],
  [/impostazion/i, '⚙️'],
];
const TAB_FALL_ICON = {
  live:'📡', dashboard:'📊', agenda:'🗓️', setup:'🔧', messages:'📨',
  championships:'🏆', griglia:'🏁', standings:'🌐', rivals:'🤝',
  tracks:'🗺️', cars:'🚘', garage:'🏠', import:'📥',
  archive:'🗃️', stats:'📈', banca:'💰', difficulty:'🎚️', settings:'⚙️', analisi:'🔬',
};
const HAS_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
function decoratePanels(scope) {
  if (!scope) return;
  scope.querySelectorAll('.panel h2').forEach(h => {
    if (h.dataset.enriched) return;
    h.dataset.enriched = '1';
    // se il titolo ha già un'emoji o un'icona SVG (es. LI.flag), non tocca
    if (HAS_EMOJI.test(h.textContent) || h.querySelector('svg') || h.querySelector('.st-ico')) return;
    const key = H2_ICONS.find(([re]) => re.test(h.textContent));
    const emo = key ? key[1] : (TAB_FALL_ICON[tab] ?? '🏁');
    const span = document.createElement('span');
    span.className = 'h-emoji';
    span.textContent = emo + ' ';
    h.insertBefore(span, h.firstChild);
  });
}
(function watchPanels() {
  let deb = 0;
  const run = () => { clearTimeout(deb); deb = setTimeout(() => decoratePanels(document.querySelector('#main')), 60); };
  const m = document.querySelector('#main');
  if (m) new MutationObserver(run).observe(m, { childList: true, subtree: true });
  const root = document.querySelector('#modal-root');
  if (root) new MutationObserver(() => decoratePanels(root)).observe(root, { childList: true, subtree: true });
  run();
})();
