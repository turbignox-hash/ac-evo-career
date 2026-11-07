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
  const body = (call?.body && call.method) ? call.body : call;
  // una lingua per tutti: il BROWSER dichiara la lingua della pagina a ogni
  // richiesta (28/10) — discipline, box tips e ingegnere seguono la GUI
  // anche se evo.config.json è rimasto su un'altra lingua.
  body.lingua = window.LINGUA ?? 'it';
  return fetch(`/api/${action}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body ?? {})})
    .then(async r => {
      // filOK/filKO (5/11): la risposta con body, anche un 4xx, dice che il
      // server è VIVO (errore di tasto, non di server); solo il fallimento
      // di rete (connessione al vento) alimenta il filbar.
      let d = null;
      try { d = await r.json(); } catch { throw Object.assign(new Error('risposta illeggibile'), { serverGiu: true }); }
      if (!r.ok) throw Object.assign(new Error(d.error || 'errore'), { data: d, risposto: true });
      filOK();
      return d;
    })
    .catch(e => { if (!e?.risposto) filKO(); throw e; });
};

/* FILBAR DI SERVIZIO (5/11): il server è un NODE vivo, non ricarica da solo —
   quando smette di rispondere (o gira col codice vecchio) la pagina dice la
   verità invece di scaricarlo tutto nel toast. api() conta i fallimenti DI
   RETE (due di fila): il banner porta l'età in secondi e il bottone di rientro
   (endpoint riavvia, lo stesso gesto dell'«Aggiorna ora»); mentre il banner
   è visibile un poll su agg-info lo toglie da solo quando il server torna.
   Un errore del server CHE RISPONDE non conta: quello è fisiologia dei tasti. */
let filFail = 0, filDa = 0, filTimer = null;
function filKO() {
  filFail += 1;
  if (filFail < 2 || filDa) return;
  filDa = Date.now();
  const b = $('#filbar');
  if (!b) return;
  b.hidden = false;
  b.innerHTML = `<div class="banner warn" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <span>⚠ ${esc(tr({ it: 'Il server del Pitwall non risponde', en: 'The Pitwall server is not responding' }))} (<span id="fil-age">0</span> s) — ${esc(tr({ it: 'le viste restano ferme: riparte col codice nuovo.', en: 'views are frozen: restart with the new code.' }))}</span>
    <button id="fil-restart" style="margin-left:auto;border:1px solid #ec8b3c40;background:#ec8b3c12;color:#f4dcc6;border-radius:8px;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer">↻ ${esc(tr({ it: 'Riavvia il server', en: 'Restart the server' }))}</button>
  </div>`;
  $('#fil-restart').onclick = async () => {
    try {
      await api('riavvia', {});
      toast(tr({ it: 'Rientro avviato: la barra sparisce quando il server torna.', en: 'Restart started: the banner goes away when the server is back.' }), 'ok');
    } catch {
      toast(tr({ it: 'Server giù del tutto: da console parti da avvia.cmd (o node src/webui.mjs).', en: 'Server fully down: start avvia.cmd from a console (or node src/webui.mjs).' }), 'err');
    }
  };
  filTimer = setInterval(async () => {
    const v = $('#fil-age');
    if (v) v.textContent = String(Math.round((Date.now() - filDa) / 1000));
    try { const r = await fetch('/api/agg-info', { signal: AbortSignal.timeout(1500) }); if (r.ok) filOK(); }
    catch { /* ancora giù: la barra resta */ }
    if (!filDa && filTimer) { clearInterval(filTimer); filTimer = null; }
  }, 4000);
}
function filOK() {
  filFail = 0;
  if (!filDa) return;
  filDa = 0;
  if (filTimer) { clearInterval(filTimer); filTimer = null; }
  const b = $('#filbar');
  if (b) { b.hidden = true; b.innerHTML = ''; }
  toast(tr({ it: '🟢 Server tornato in pista.', en: '🟢 Server back up.' }), 'ok');
}

function toast(text, kind='', opts) {
  // Messaggio che CHIEDE UN'AZIONE all'utente (27/10, richiesta Mauro:
  // «rientra nel weekend dal menu di EVO» durava 4.2 s e non si leggeva):
  // con opts.rosso diventa rosso. 26/10 seconda richiesta Mauro: ERRORI e
  // WARN non si chiudono più da soli — restano aperti finché l'amico non
  // preme la ✕ (o un click sul toast); solo i toast neutri restano a tempo.
  const o = opts ?? {};
  const t = document.createElement('div');
  const persiste = kind === 'err' || kind === 'warn';
  t.className = 't ' + kind + (o.rosso ? ' rosso' : '');
  const msg = document.createElement('span');
  msg.textContent = text;
  t.appendChild(msg);
  if (persiste) {
    const x = document.createElement('button');
    x.className = 'tx';
    x.setAttribute('aria-label', tr({ it: 'chiudi avviso', en: 'close notice' }));
    x.textContent = '✕';
    x.onclick = (e) => { e.stopPropagation(); t.remove(); };
    t.appendChild(x);
  }
  t.onclick = () => t.remove();
  $('#toast').appendChild(t);
  if (!persiste) setTimeout(() => t.remove(), o.ms ?? 4200);
}

/* CONSOLE DELLA PREPARAZIONE (27/10, richiesta Mauro): «la schermata rossa
   quando premi prepara tutto sembra disastrosa» — al suo posto un log da
   terminale: VERDE su NERO, una riga alla volta in tempo reale (scrittura
   sequenziale), ⚠ esce in ambra, ✖ in rosso. Il pannello resta 15 s o finché
   non si chiude; il click chiude. */
function prepConsole(lines) {
  $('#preplog')?.remove();
  const box = document.createElement('div');
  box.id = 'preplog';
  const list = document.createElement('div');
  list.className = 'pl-body';
  const x = document.createElement('button');
  x.className = 'pl-x';
  x.setAttribute('aria-label', tr({ it: 'chiudi console di preparazione', en: 'close prep console' }));
  x.textContent = '✕';
  x.onclick = (e) => { e.stopPropagation(); box.remove(); };
  const head = document.createElement('div');
  head.className = 'pl-head';
  head.textContent = '› evo-pitwall · prepara tutto';
  box.append(head, x, list);
  document.body.appendChild(box);
  const killTimer = setTimeout(() => box.remove(), (lines.length + 3) * 220 + 9000);
  const stamp = () => new Date().toLocaleTimeString('it-IT', { hour12: false });
  let i = 0;
  const next = () => {
    if (i >= lines.length) { cursor.parentElement && cursor.remove(); return; }
    const raw = String(lines[i++] ?? '');
    const row = document.createElement('div');
    row.className = 'pl-row' + (raw.startsWith('⚠') ? ' warn' : raw.startsWith('✖') ? ' bad' : '');
    row.innerHTML = `<span class="pl-stamp">${stamp()}</span><span class="pl-text"></span>`;
    row.querySelector('.pl-text').textContent = raw;
    cursor.remove();
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
    row.appendChild(cursor);
    setTimeout(next, 220);
  };
  const cursor = document.createElement('span');
  cursor.className = 'pl-cursor';
  cursor.textContent = '▋';
  list.appendChild(cursor);
  box.onclick = () => { clearTimeout(killTimer); box.remove(); };
  next();
}

/* 27/10: AGGIUNGE una riga alla console di preparazione già aperta (se c'è),
   senza avre di costruzione: nell'errore di fine «Prepara tutto» il catch
   prima chiamava prepConsole(["✖ …"]) e il pannello si RICOstruiva con la
   sola riga d'errore, cancellando l'elenco di ciò che il server aveva fatto
   (pista scritta, auto da scegliere a mano…). Se la console non esiste, la
   apre con quela riga sola. */
function prepConsoleLine(line) {
  const list = $('#preplog .pl-body');
  if (!list) { prepConsole([String(line ?? '')]); return; }
  const raw = String(line ?? '');
  const row = document.createElement('div');
  row.className = 'pl-row' + (raw.startsWith('⚠') ? ' warn' : raw.startsWith('✖') ? ' bad' : '');
  row.innerHTML = `<span class="pl-stamp">${new Date().toLocaleTimeString('it-IT', { hour12: false })}</span><span class="pl-text"></span>`;
  row.querySelector('.pl-text').textContent = raw;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  const box = $('#preplog');
  if (box) { clearTimeout(Number(box.dataset.kill ?? 0)); const t = setTimeout(() => box.remove(), 14000); box.dataset.kill = String(Number(t)); }
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
    <span class="muted" style="font-size:12.5px">${tr({ it: 'si aggiorna solo il codice: il tuo save non si tocca.', en: 'only the code updates; your save is never touched.' })}</span>
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

let modalPrevFocus = null;
function modal(title, bodyHtml, buttons){
  const root = $('#modal-root');
  modalPrevFocus = document.activeElement;
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mh">${esc(title)}<button class="x" aria-label="chiudi">×</button></div>
    <div class="mb">${bodyHtml}</div><div class="mf"></div></div>`;
  const dlg = $('.modal', root);
  /* Chiudere riporta il focus dove era: senza questo, dopo un'azione nel
     modale la tastiera ripartiva dall'inizio della pagina. */
  const chiudi = () => {
    root.innerHTML = '';
    root.onkeydown = null;
    root.onclick = null;
    const p = modalPrevFocus;
    modalPrevFocus = null;
    if (p && typeof p.focus === 'function' && document.contains(p)) {
      try { p.focus(); } catch { /* elemento sparito: nessun ripristino */ }
    }
  };
  const foot = $('.mf', root);
  for (const [label, cls, fn] of buttons) {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label;
    b.onclick = () => { if (fn(root, b) !== false) chiudi(); };
    foot.appendChild(b);
  }
  $('.x', root).onclick = chiudi;
  root.onclick = (e) => { if (e.target === root) chiudi(); };
  /* TRAPPOLA DEL FOCUS: Tab gira solo dentro il dialogo, Esc chiude. */
  dlg.setAttribute('tabindex', '-1');
  root.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); chiudi(); return; }
    if (e.key !== 'Tab') return;
    const items = [...dlg.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { e.preventDefault(); dlg.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  (dlg.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? dlg).focus();
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
  gauge:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 12 10.8 7" stroke-linecap="round"/></svg>',
  /* 24/10: l'icona del quaderno giri liberi era scritta sulla chiave `hotlaps`
     ma la nav cerca ICONE[tab] per `gironi`: il tab nasceva SENZA icona (Mauro). */
  gironi:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="9" r="5"/><path d="M8 9V6.2M6.4 1.7h3.2M10.6 5.2l1.4 .4" stroke-linecap="round"/></svg>',
  /* 2/11: il tab ONLINE (ex pannello in fondo ad Archivio) porta un GLOBO con i
     meridiani: le sessioni multiplayer sono il mondo fuori dal tuo garage */
  online:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c-2.6 3.7-2.6 8.7 0 12.4M8 1.8c2.6 3.7 2.6 8.7 0 12.4"/></svg>',
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
  ['rivals',         tr({ it: 'Rivali',         en: 'Rivals' })],
  ['tracks',         tr({ it: 'Piste',          en: 'Tracks' })],
  ['cars',           tr({ it: 'Auto',           en: 'Cars' })],
  ['garage',         tr({ it: 'Garage',         en: 'Garage' })],
  ['archive',        tr({ it: 'Archivio',       en: 'Archive' })],
  ['online',         tr({ it: 'Online',         en: 'Online' })],
  ['gironi',         tr({ it: 'Giri liberi',    en: 'Free laps' })],
  ['stats',          tr({ it: 'Statistiche',    en: 'Stats' })],
  ['banca',          tr({ it: 'Finanze',        en: 'Finances' })],
  ['difficulty',     tr({ it: 'Difficoltà',     en: 'Difficulty' })],
  ['settings',       tr({ it: 'Impostazioni',   en: 'Settings' })],
]; /* la vista LIVE è stata RIMOSSA su richiesta Mauro (21/10 23:5x): «non la
   guarderebbe nessuno». Backup completo in sessione-21-10/.backup-live-21-10/. Il motore
   live sottostante (src/live.mjs, lettore PS, strip header «In pista»,
   caricamento automatico import) resta: lo usano telemetria e setup.
/* un colore per ogni sezione: le icone della nav restano riconoscibili a colpo d'occhio */
/* una sola regola: GARA è ciò che serve IN giornata, Studio è tutto il resto
   (30/10, a sezioni). La vista MONDIALE non
   è più scheda da barra: vive DENTRO Campionati come pannello a pieghevole
   (drawChampionships) — funzione intatta, un posto in meno in barra. */
const NAV_GROUPS = [
  { label: { it: 'Gara', en: 'Race' }, ids: ['dashboard', 'agenda', 'setup', 'analisi', 'messages'] },
  { label: { it: 'Campionato', en: 'Championship' }, ids: ['championships', 'griglia', 'rivals', 'tracks', 'cars', 'garage'] },
  { label: { it: 'Archivio', en: 'Archive' }, ids: ['archive', 'online', 'gironi', 'stats'] },
  { label: { it: 'Sistema', en: 'System' }, ids: ['banca', 'difficulty', 'settings'] },
];
const TAB_COLORS = {
  dashboard:'#5da9ff', agenda:'#ff7a45', calendar:'#b48cff', standings:'#ffd166',  rivals:'#ff6b6b',
  analisi:'#a3e433',
  tracks:'#e8c46b', cars:'#74c0fc', garage:'#ffd43b', griglia:'#82ccdd',
  setup:'#f78fb3', catalog:'#82ccdd',  archive:'#c9a0ff', online:'#5eead4', stats:'#69db7c',
  gironi:'#63e6be',
  difficulty:'#5f7cff', messages:'#ffa94d', settings:'#adb5bd', banca:'#ffd43b',
};
let tab = 'dashboard';
/* il mini-riassunto d'aiuto (27/10, domanda Mauro: «sezione con le spiegazioni
   di ogni menu — utile o tempo perso?»). Un solo riquadro, si apre da qualunque
   scheda: due righe per menu, la GUI si spiega da sola. Apostrofi SEMPRE con
   \' niente stringhetricité: lezione del 27/10 (il primo inserto era rotto).
   Le base strings in precedenza non respirano: la GUI si spiega da sola. */
const AIUTO = [
  ['dashboard', { it: 'La tua giornata: importazione della gara appena conclusa, riepilogo post-sessione, classifica di stagione, contratto, eredità ed eventi.', en: 'Your day: import the race just completed, review the post-session summary, standings, contract, legacy and events.' }],
  ['agenda', { it: 'Il calendario: i round da correre, nel weekend con ora, giri e meteo già scritti dal tool.', en: 'The calendar: rounds ahead, with hour, laps and weather written by the tool for each weekend.' }],
  ['setup', { it: 'La scheda del meccanico: assetti, pressioni e benzina consigliati per la gara (si portano a mano in EVO).', en: 'The mechanic sheet: recommended setup, pressures and fuel for the race (entered by hand in EVO).' }],
  ['analisi', { it: 'Telemetria dei tuoi giri: confronto best-lap, settori e curva di guida su sessioni nuove o ricaricate.', en: 'Your lap telemetry: best-lap comparison, sectors and driving curve on fresh or loaded sessions.' }],
  ['messages', { it: 'Il tavolo delle offerte: contratti, sponsor e mail del box da firmare o ignorare.', en: 'The offers table: contracts, sponsors and pit-lane mail to sign or ignore.' }],
  ['championships', { it: 'Serie e campionati: stagione in corso, classifiche, premi e contratti di ogni trofeo.', en: 'Series and championships: current season, standings, prizes and contracts of every trophy.' }],
  ['griglia', { it: 'Chi parte davanti: la griglia degli avversari della ronda, scritta nel gioco dal tool.', en: 'Who starts ahead: the race-weekend opponent grid, written into the game by the tool.' }],
  ['rivals', { it: 'I tuoi avversari abituali: storico dei duelli e chi devi battere.', en: 'Your regular rivals: duel history and who you still have to beat.' }],
  ['tracks', { it: 'Il libro delle piste: record personali, layout e storie di ogni tracciato.', en: 'The track book: personal records, layouts and stories for every circuit.' }],
  ['cars', { it: 'Le auto: schede tecniche e compatibilità, anche di quelle viste nel content di EVO.', en: 'The cars: spec sheets and compatibility, including cars found in the EVO content.' }],
  ['garage', { it: 'Il tuo box: auto possedute e setup registrati.', en: 'Your garage: owned cars and saved setups.' }],
  ['archive', { it: 'La memoria della carriera: piazzamenti importati e sessioni salvate da EVO.', en: 'Your career memory: imported finishes and sessions saved by EVO.' }],
  ['online', { it: 'Le gare multiplayer: ogni sessione online resta qui come memoria (zero punti, zero soldi), col libro di chi hai incrociato online.', en: 'Multiplayer races: every online session stays here as memory (no points, no money), with the book of who you met online.' }],
  ['gironi', { it: 'I giri liberi: scegli pista e auto, gira a piacere — ogni giro è registrato e analizzato (best lap, settori, progresso).', en: 'Free laps: pick track and car, drive freely — each lap is recorded and analysed (best lap, sectors, progress).' }],
  ['stats', { it: 'I numeri della carriera: vittorie, podi, punti e curve di andamento.', en: 'Career numbers: wins, podiums, points and form curves.' }],
  ['banca', { it: 'Le finanze: entrate, spese e bilancio della stagione.', en: 'The finances: income, costs and the seasonal balance.' }],
  ['difficulty', { it: 'La difficoltà adattiva: quanto la serie ti spinge, con il saldo della banda AI.', en: 'Adaptive difficulty: how hard the series pushes, with the AI band balance.' }],
  ['settings', { it: 'La cantina tecnica: wizard dell\'installazione, aggiornamenti, backup del save, lingua e sistema.', en: 'The tech pit: setup wizard, updates, save backup, language and system.' }],
];
function drawAiuto(){
  const riga = (id) => {
    const d = (AIUTO.find(([k]) => k === id) ?? [])[1] ?? { it: '', en: '' };
    return `<div style="padding:7px 0;border-bottom:1px solid var(--line,#283046)"><b style="font-size:13px">${esc((TABS.find(([k]) => k === id) ?? [undefined,''])[1])}</b><div class="muted" style="font-size:12.5px;margin-top:2px">${esc(tr(d))}</div></div>`;
  };
  modal(tr({ it: 'Che fa ogni menu', en: 'What each menu does' }),
    `<div class="muted" style="font-size:12.5px;margin-bottom:6px">${tr({ it: 'Due righe per menu, niente da configurare: un riepilogo che gira con te.', en: 'Two lines per menu, nothing to configure: a summary that travels with you.' })}</div>` +
    TABS.map(([id]) => riga(id)).join(''),
    [[tr({ it: 'Chiudi', en: 'Close' }), 'act', () => {}]]);
}
/* ===================== MENU A SCOMPARSA (6/11) =====================
   Richiesta Mauro: «a 390 px si vedono due voci su diciannove». Sotto i 920 px
   la nav è un cassetto che si apre dal pulsante «Menu»; sopra, resta la colonna
   di sempre. Il cassetto porta anche lo stato che l'header stretto non mostra
   più (data, reputazione, eredità, MoTeC, voce): i valori si leggono dal vivo
   dall'header al momento dell'apertura, così non esistono due copie da tenere
   allineate. */
function riempiMenuStato(){
  const host = $('#menu-stato');
  if (!host) return;
  // le emoji di testa dell'header (📜, 🔊, …) non servono nel riepilogo: qui
  // l'icona è il testo, non il simbolo
  const testo = (sel) => (document.querySelector(sel)?.textContent ?? '').replace(/^(?:\p{Extended_Pictographic}\uFE0F?|\s)+/u, '').trim();
  const riga = (k, v) => (v && v !== '–' && v !== '—' ? `<div class="ms-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '');
  const kofi = document.querySelector('#kofi-chip');
  const kofiHref = kofi?.getAttribute('href') && kofi.getAttribute('href') !== '#' ? kofi.getAttribute('href') : null;
  host.innerHTML = `<div class="ms-t">${tr({ it: 'Stato carriera', en: 'Career status' })}</div>`
    + riga(tr({ it: 'Data', en: 'Date' }), testo('#t-date'))
    + riga(tr({ it: 'Reputazione', en: 'Reputation' }), testo('#t-rep'))
    + riga(tr({ it: 'Eredità', en: 'Heritage' }), testo('#t-heritage'))
    + riga('MoTeC', testo('#motec-strip'))
    + riga(tr({ it: 'Voce', en: 'Voice' }), testo('#copilot-strip'))
    + (kofiHref ? `<div class="ms-foot"><a href="${esc(kofiHref)}" target="_blank" rel="noopener">☕ ${tr({ it: 'Offri un caffè', en: 'Buy me a coffee' })}</a></div>` : '');
}
function menuApri(apri){
  const b = $('#nav-toggle'), velo = $('#menu-backdrop');
  const on = document.body.classList.toggle('menu-open', apri);
  if (b) {
    b.setAttribute('aria-expanded', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? tr({ it: 'Chiudi il menu delle sezioni', en: 'Close the sections menu' }) : tr({ it: 'Apri il menu delle sezioni', en: 'Open the sections menu' }));
  }
  if (velo) velo.hidden = !on;
  if (on) {
    riempiMenuStato();
    const nav = $('#nav');
    if (nav) nav.scrollTop = 0;
    $('#nav button.on')?.focus({ preventScroll: true });
  }
}
function collegaMenu(){
  const b = $('#nav-toggle');
  if (!b || b.dataset.wired) return;
  b.dataset.wired = '1';
  b.onclick = () => menuApri(!document.body.classList.contains('menu-open'));
  $('#menu-backdrop')?.addEventListener('click', () => { menuApri(false); b.focus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { menuApri(false); b.focus(); }
  });
  // tornando larghi il cassetto non serve più: si chiude da solo
  matchMedia('(max-width:920px)').addEventListener?.('change', (e) => { if (!e.matches) menuApri(false); });
}

/* PASTIGLIA DEL RIEPILOGO (6/11, richiesta Mauro: «avvisami anche quando il
   monitor rileva una sessione nuova mentre sono su un altro tab, con una
   pastiglia sul Cruscotto»). La scheda del Cruscotto fa polling solo mentre è
   in pagina; da un altro tab nessuno guardava il monitor. Qui lo sguardo è
   GLOBALE (ogni 10 s, anche fuori dal Cruscotto) e la legge sta in una funzione
   pura, così la guardia la prova senza browser. */
let rlFirmaVista = null;   // `totale|fine` dell'ultimo riepilogo già visto (null = primo giro)
let rlNovita = 0;          // sessioni chiuse mentre eri altrove, non ancora lette

/** C'è una novità da annunciare? Solo una sessione CHIUSA e mai vista: al
 *  primo giro nessuna pastiglia (i riepiloghi già in archivio non sono nuovi),
 *  e una sessione ancora aperta non è una novità — il riepilogo si legge alla
 *  chiusura, ed è quella che la scheda del Cruscotto mostra. */
function novitaRiepilogo(r, visto) {
  const s = Array.isArray(r?.sessioni) && r.sessioni.length ? r.sessioni[r.sessioni.length - 1] : null;
  const firma = `${r?.totale ?? 0}|${s?.fine ?? ''}`;
  return { firma, nuova: !!r?.chiusa && visto != null && firma !== visto };
}

async function pollRiepilogoNav() {
  // NIENTE guardia su document.hidden: la finestra dietro o minimizzata è
  // esattamente il caso in cui l'avviso serve, e la risposta del server è uno
  // stat quando il log non è cambiato. Il ciclo gira sempre, anche di là.
  try {
    const r = await api('live-riepilogo', {});
    const { firma, nuova } = novitaRiepilogo(r, rlFirmaVista);
    if (rlFirmaVista == null) { rlFirmaVista = firma; return; }   // primo giro: solo base
    if (!nuova) return;
    rlFirmaVista = firma;
    if (tab === 'dashboard') return;   // sei già lì: se ne occupa la scheda
    rlNovita = Math.min(9, rlNovita + 1);
    drawNav();
  } catch { /* server occupato (o monitor spento): si riprova al giro dopo */ }
}
setInterval(pollRiepilogoNav, 10000);

function drawNav(){
  const offers = boot?.header?.offers?.length || 0;
  const urgent = boot?.mailUrgent || 0;
  const novita = rlNovita
    ? `<span class="badge" title="${tr({ it: rlNovita === 1 ? 'Riepilogo di fine sessione da leggere' : `${rlNovita} riepiloghi di fine sessione da leggere`, en: rlNovita === 1 ? 'End-of-session summary to read' : `${rlNovita} end-of-session summaries to read` })}">${rlNovita}</span>`
    : '';
  const bottone = ([id,label]) =>
    `<button data-tab="${id}" class="${tab===id?'on':''}"${tab===id?' aria-current="page"':''}>${ICONS[id]?`<span class="nico" style="color:${TAB_COLORS[id]||'var(--acc)'}">${ICONS[id]}</span>`:''}<span>${label}</span>${id==='dashboard'?novita:''}${id==='messages'&&offers?`<span class="badge">${offers}</span>`:''}${id==='messages'&&urgent?`<span class="badge urgent" title="${tr({ it: `${urgent} email urgenti: gare da disputare o conflitti`, en: `${urgent} ${urgent===1?'urgent email':'urgent emails'}: races to run or conflicts` })}">⚠️${urgent}</span>`:''}</button>`;
  $('#nav').innerHTML = `<div class="menu-head"><span>${tr({ it: 'Sezioni', en: 'Sections' })}</span><button id="menu-close" type="button" aria-label="${tr({ it: 'Chiudi il menu', en: 'Close the menu' })}">✕</button></div>`
    + NAV_GROUPS.map((g) =>
    `<div class="nav-grp">${tr(g.label)}</div>`
    + TABS.filter(([id]) => g.ids.includes(id)).map(bottone).join('')).join('') +
    `<div class="menu-stato" id="menu-stato"></div>` +
    `<button id="b-aiuto" title="${tr({ it: 'Che fa ogni menu', en: 'What each menu does' })}" style="margin-top:auto;border-top:1px solid var(--line,#283046)">❓ ${tr({ it: 'Aiuto', en: 'Help' })}</button>`;
  $('#b-aiuto')?.addEventListener('click', () => { menuApri(false); drawAiuto(); });
  $('#menu-close')?.addEventListener('click', () => { menuApri(false); $('#nav-toggle')?.focus(); });
  $$('#nav button[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; menuApri(false); drawNav(); render(); }; });
  collegaMenu();
}

/* Cambio pagina con PARAMETRI (28/10, stile Football Manager su richiesta Mauro:
   tutto cliccabile — un nome auto porta alla scheda, un pilota alla scheda,
   il righello al suo tab). `vai('cars', { search: 'BMW M3 E30' })` cambia tab
   e passa le opzioni alla vista; la vista consuma NAV_OPTS e si organizza. */
function vai(nuovoTab, opts = {}){
  window.NAV_OPTS = { tab: nuovoTab, ...opts };
  tab = nuovoTab; drawNav(); render();
}
window.vai = vai;
/* HTML di un nome auto CLICCABILE (29/10, stile FM): in qualunque vista basta
   `window.carLinkHtml(nome)` per far aprire la scheda tecnica nel libro auto.
   Nome vuoto → stringa vuota: il chiamante sostituisce con n/d. */
window.carLinkHtml = (nome) => nome
  ? `<span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda tecnica dell\'auto', en: 'open the car spec sheet' })}" onclick="vai('cars',{search:'${String(nome).replace(/'/g, "\\'")}'})">${esc(nome)}</span>`
  : '';
/* HTML di un nome SERIE cliccabile (29/10, stessa regola delle auto): apre Campionati.
   (31/10) Con { apri: nodeId } il click LANCIA anche l'apertura della scheda della
   serie (drawChampionships la scorda e la porta in vista), non solo il tab. */
window.serLinkHtml = (nome, opts = {}) => nome
  ? `<span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda della serie', en: 'open the series card' })}" onclick="${opts.node ? `vai('championships',{apri:'${String(opts.node).replace(/'/g, "\\'")}'})` : `vai('championships')`}">${esc(nome)}</span>`
  : '';
/* HTML di un nome PISTA cliccabile (29/10): apre la scheda nel libro piste. */
window.trackLinkHtml = (nome) => nome
  ? `<span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda della pista', en: 'open the track card' })}" onclick="vai('tracks',{search:'${String(nome).replace(/'/g, "\\'")}'})">${esc(nome)}</span>`
  : '';

/* ============================== viste ============================== */
async function render(){
  const m = $('#main');
  if (!boot) return;
  // aprire il Cruscotto È leggerlo (6/11): la pastiglia si spegne qui, così
  // non resta accesa su una novità che hai già davanti agli occhi
  if (tab === 'dashboard' && rlNovita) { rlNovita = 0; drawNav(); }
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
  // 3/11, LA VISTA STANTIA SI SPEGNE DA SOLA (la prova dal vivo con il test
  // di layout: un click su un altro tab mentre il primissimo Cruscotto aspetta
  // ancora le Sue tre api veniva TRAVOLTO dal dipingimento tardivo della
  // dashboard — chi cliccava si ritrovava addosso la vista che ha lasciato).
  // Ogni render porta un numero di generazione: la vista riceve un host
  // GUARDATO che rifiuta l'innerHTML se nel frattempo un render più nuovo è
  // partito. Letture e metodi passano dritti, solo la scrittura si filtra.
  const gen = (window.__renderGen = (window.__renderGen ?? 0) + 1);
  // La scrittura su un host stantio LANCIA (11/11, cura alla seconda prova del
  // vivo: col solo rifiuto silenzioso la vista continuava DOPO l'innerHTML
  // respinto e crashava sui nodi che credeva di avere dipinto — drawCardInto
  // su $('#card-panel') già sostituito dall'altra vista). Lanciando QUI, la
  // draw abbandona TUTTO all'istante: niente richiami su nodi altrui.
  const stantio = new Error('render più nuovo in corso: la vista stantia non dipinge');
  stantio.ritardoRender = true;
  const guardia = (host) => new Proxy(host, {
    get(t, k) { const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; },
    set(t, k, v) {
      if (k === 'innerHTML' && gen !== window.__renderGen) throw stantio;
      Reflect.set(t, k, v); return true;
    },
  });
  m.innerHTML = '<div class="panel"><span class="spin"></span></div>';
  try {
  const M = guardia(m);
  if (tab==='dashboard')  return await drawDashboard(M);
      if (tab==='agenda')     return await drawAgenda(M);
    if (tab==='rivals')     return await drawRivals(M);
    if (tab==='analisi')    return await drawAnalisi(M);
    if (tab==='championships') return await drawChampionships(M);
    if (tab==='calendar')   return await drawCalendar(M);
    if (tab==='standings')  return await drawWorldRanking(M);
    if (tab==='tracks')     return await drawTracks(M);
    if (tab==='cars')       return await drawCars(M);
    if (tab==='garage')     return await drawGarage(M);
    if (tab==='archive')    return await drawArchive(M);
    if (tab==='online')     return await drawOnline(M);
    if (tab==='gironi')     return await drawGironi(M);
    if (tab==='stats')      return await drawStats(M);
    if (tab==='banca')      return await drawBanca(M);
    if (tab==='griglia')    return await drawGridTab(M);
    if (tab==='setup')      return await drawSetup(M);
    if (tab==='difficulty') return await drawDifficulty(M);
    if (tab==='messages')   return await drawMessages(M);
    if (tab==='settings')   return await drawSettings(M);
  } catch(e){
    // Il ritardo di generazione NON è un guasto della vista (la corsa che lo
    // fa nascere ha già una vista più nuova inflight): butta la pagina che
    // NON deve proprio mostrare un posto in meno di println. Né con banner.
    if (e?.ritardoRender) return;
    window.__renderErr = e.stack ?? String(e); m.innerHTML = `<div class="panel"><div class="banner bad">${esc(e.message)}</div></div>`;
  } finally {
    /* 6/11 — IL CONTENIMENTO DELLE TABELLE (richiesta Mauro: «a 431 px Setup
       arriva a 955 px»): una tabella più larga della scheda non deve gonfiare
       la PAGINA — la si chiude in un .tscroll che scorre da solo. È lo stesso
       gesto già usato a mano in Statistiche e Analisi, ora applicato a ogni
       vista: su schermo largo nessuna tabella sborda, quindi nessun wrapper
       (misure identiche a prima). */
    if (gen === window.__renderGen) wrapTabelleLarghe();
  }
}

/* Avvolge in .tscroll SOLO le tabelle che sbordano davvero dal loro
   contenitore. Le tabelle già dentro a un .tscroll si saltano (nessun doppio
   strato) e così i pannelli che le costruivano a mano restano come sono. */
function wrapTabelleLarghe(){
  const m = document.getElementById('main');
  if (!m) return;
  for (const t of m.querySelectorAll('table')) {
    const p = t.parentElement;
    if (!p || p.classList?.contains('tscroll')) continue;
    if (p.closest?.('.tscroll')) continue;
    if (t.scrollWidth <= p.clientWidth + 2) continue;
    const w = document.createElement('div');
    w.className = 'tscroll';
    p.insertBefore(w, t);
    w.appendChild(t);
  }
}

/* Le tabelle dentro a un pieghevole CHIUSO non hanno misure (display:none): la
   prima misura utile arriva all'apertura. Un solo ascoltatore in cattura
   (l'evento toggle non risale) le contiene appena diventano visibili. */
document.addEventListener('toggle', (e) => {
  // il toggle arriva PRIMA che il contenuto appena aperto sia impaginato: se
  // si misurano le tabelle in quel momento risultano larghe zero e restano
  // scoperte. Un frame dopo hanno le loro misure vere (6/11, la diagnostica
  // del Setup: aperta su telefono allargava la pagina a 946 px).
  if (e.target?.tagName === 'DETAILS' && e.target.open) {
    requestAnimationFrame(() => { try { wrapTabelleLarghe(); } catch { /* un bordo non rompe la vista */ } });
  }
}, true);

/* Le viste riempiono alcuni riquadri DOPO il primo disegno (il verdetto del
   Cruscotto arriva da un'altra lettura): quelle tabelle nascevano dopo il
   passaggio di render() e restavano scoperte. Un osservatore sul contenuto
   chiude il cerchio una volta sola per frame (l'avvolgimento è idempotente:
   una tabella già in .tscroll viene saltata, quindi non si innesca un ciclo). */
(function osservaTabelle(){
  const m = document.getElementById('main');
  if (!m || typeof MutationObserver === 'undefined') return;
  let attesa = false;
  new MutationObserver(() => {
    if (attesa) return;
    attesa = true;
    requestAnimationFrame(() => { attesa = false; try { wrapTabelleLarghe(); } catch { /* mai rompere una vista per un bordo */ } });
  }).observe(m, { childList: true, subtree: true });
})();

function paintHeader(h){
  $('#idblock').classList.remove('hidden');
  $('#hstats').classList.remove('hidden');
  $('#t-ava').textContent = (h.driver.name || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  $('#t-name').textContent = h.driver.name;
  $('#t-sub').textContent = `${h.nation ?? ''} · ${h.sponsor ?? tr({ it: 'pilota privato', en: 'private driver' })} · ${h.node.display}`;
  $('#t-money').textContent = money(h.money) + ' €';
  $('#t-rep').textContent = String(h.rep);
  const lvlEl = $('#hstat-level');
  if (lvlEl) lvlEl.style.display = 'none';
  $('#t-date').textContent = h.todayLabel ? `${tr({ it: 'OGGI', en: 'TODAY' })} ${h.todayLabel}` : `${tr({ it: 'giorno', en: 'day' })} ${h.day ?? 1}`;
  $('#t-season').textContent = `S${h.season} · R${h.round}/${h.rounds}`;
  // 6/11 — le sigle si spiegano da sole: S/R sono stagione e ronda
  $('#t-season').title = tr({ it: `Stagione ${h.season} · ronda ${h.round} di ${h.rounds}`, en: `Season ${h.season} · round ${h.round} of ${h.rounds}` });
  // le statistiche chiave diventano scorciatoie: Data → Centro gare, Rep → Statistiche, Finanze → Finanze, Stagione → Campionati
  $('#t-date').style.cursor = 'pointer';
  $('#t-date').onclick = () => vai('agenda');
  $('#t-rep').style.cursor = 'pointer';
  $('#t-rep').onclick = () => vai('stats');
  $('#t-money').style.cursor = 'pointer';
  $('#t-money').onclick = () => vai('banca');
  const tsS = $('#t-season'); tsS.style.cursor = 'pointer';
  tsS.title = tr({ it: 'vai ai Campionati', en: 'open Championships' });
  tsS.onclick = () => vai('championships');
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
    nrEl.onclick = () => vai('agenda');
  } else { nrEl.style.display = 'none'; }
  if (h.heritage) {
    $('#hstat-heritage').style.display = '';
    $('#t-heritage').textContent = `📜 ${h.heritage.completed ?? 0}${h.heritage.activeDone ? ` · ${tr({ it: 'eredità pronta!', en: 'inheritance ready!' })}` : ''}`;
    $('#hstat-heritage').title = h.heritage.activeDone ? tr({ it: "Un'eredità di famiglia è pronta da incassare (pannello Eredità)", en: 'A family inheritance is ready to claim (Heritage panel)' }) : tr({ it: 'Capitoli della saga di famiglia completati', en: 'Chapters of the family saga completed' });
  }
}

/* IL BATTITO DEL SERVER (1/11, richiesta Mauro): il piede della GUI non dice più
   solo la build statica — in tempo reale dice se il server è VIVO, su QUALE porta
   ascolta e QUALE build gira. Un ping leggerissimo (/api/ping) ogni 4 s: se il
   server cade (o si riavvia per l'auto-aggiorna), la riga diventa rossa e torna
   verde da sola, senza ricaricare la pagina. Serve anche come totem durante l'
   auto-riavvio dell'aggiornatore: capisci a colpo d'occhio quando il server torna. */
let srvUltima = null;   // ultima risposta buona: se muore, resta il ricordo della porta
let srvPing = [];       // finestra scorrevole: i 5 tempi di ping più recenti (il vecchio esce a sinistra)
async function drawSrvLive(){
  const el = document.getElementById('srv-live');
  if (!el) return;                       // il piede si ricostruisce a ogni refreshBoot: pazienza, riprova
  let r = null;
  try {
    // tempo di risposta in ms (2/11, richiesta Mauro): a colpo d'occhio vicino al ·
    const t0 = performance.now();
    const res = await fetch('/api/ping', { signal: AbortSignal.timeout(2000) });
    const ms = Math.round(performance.now() - t0);
    r = res.ok ? await res.json() : null;
    if (r?.ok) srvPing = [...srvPing, ms].slice(-5);   // solo i ping ARRIVATI contano: un timeout non è un tempo
  } catch { /* non risponde: sotto si dipinge rosso */ }
  if (r?.ok) {
    srvUltima = r;
    /* termometro su media (2/11, richiesta Mauro): la riga mostra la MEDIA
       dei 5 ping più recenti, non la singola lettura — un ping fortunato
       (o un colpo di GC) non deve sembrare una diagnosi. La media prende il
       colore: verde sotto 150 ms (server in salute), arancio fino a 500 ms
       (fa fatica: un import o un salvataggio in corso?), rosso sopra — lo
       stesso tono del server caduto. Il pallino ● resta verde finché il
       server risponde: la media dice quanto fatica, il pallino dice se è
       vivo. Il tooltip del numero elenca i singoli ping (più recente per
       primo) e segna il più basso e il più alto. */
    const media = Math.round(srvPing.reduce((a, b) => a + b, 0) / srvPing.length);
    const coloreMs = (m) => m < 150 ? 'var(--good,#3fb26f)' : m <= 500 ? 'var(--warn,#ffb454)' : '#e08a9a';
    const leggiPing = [...srvPing].reverse().join(' · ') + ' ms'
      + ` — più basso ${Math.min(...srvPing)}, più alto ${Math.max(...srvPing)}`;
    el.innerHTML = `<span style="color:var(--good,#3fb26f)">●</span> server vivo · porta <b>${esc(r.port)}</b> · build ${esc(r.build?.semver ?? '?')}${r.build?.hash ? ` · ${esc(r.build.hash)}` : ''}${Number.isFinite(media) ? ` · <span style="color:${coloreMs(media)};font-weight:700" title="${esc(tr({ it: 'Ping (più recente per primo):', en: 'Pings (newest first):' }) + ' ' + leggiPing)}">${media} ms</span>` : ''}`;
    el.title = tr({ it: "Battito del server locale (ogni 4 s): porta d'ascolto, build che gira ora e media degli ultimi 5 ping.", en: 'Local server heartbeat (every 4 s): listening port, the build running now and the average of the last 5 pings.' });
  } else {
    el.innerHTML = `<span style="color:#e08a9a">●</span> server non risponde${srvUltima ? ` · porta ${esc(srvUltima.port)}` : ''} — riparte da avvia.cmd`;
    el.title = tr({ it: 'Il ping non torna: il server locale è giù (o si sta riavviando). La riga torna verde da sola appena risponde.', en: 'The ping is not coming back: the local server is down (or restarting). The line goes green by itself as soon as it answers.' });
  }
}
setInterval(() => { try { drawSrvLive(); } catch { /* mai bloccare la GUI per un battito */ } }, 4000);

async function refreshBoot(){
  boot = await api('boot');
  /* RICARICAMENTO AUTO SU BUILD NUOVA (26/10, il caso Mauro: la tab del
     browser resta aperta tra le sincronizzazioni git e `avvia.cmd` la riporta
     a fuoco SENZA ricaricarla — l'app gira sui JS vecchi e le schede nuove
     (es. il selettore lingua nell'onboarding) sembrano «mancanti». L'ETag
     del server non può aiutare: il browser nemmeno chiede i file. Qui la
     build vista si confronta con quella del server: se cambia, UNA sola
     ricarica (segno in sessionStorage, mai loop) e tutto torna attuale. */
  const buildVista = `${boot.versione?.semver ?? '?'}@${boot.versione?.hash ?? '?'}`;
  const segnoBuild = 'evo-build-vista';
  if (boot.versione?.semver && !boot.versione.semver.startsWith('?') && sessionStorage.getItem(segnoBuild) !== buildVista) {
    sessionStorage.setItem(segnoBuild, buildVista);
    if (sessionStorage.getItem(segnoBuild + '-reload') !== buildVista) {
      sessionStorage.setItem(segnoBuild + '-reload', buildVista);
      location.reload();
      return;
    }
    sessionStorage.removeItem(segnoBuild + '-reload');
  }
  $('#dot-evo').classList.toggle('on', !!boot.gameRunning);
  $('#t-evo').textContent = boot.gameRunning ? tr({ it: 'EVO aperto', en: 'EVO open' }) : tr({ it: 'chiuso', en: 'closed' });
  // versione della build: aggiornamento automatico a ogni sincronizzazione git
  // (tools/bump-versione.mjs) — package.json + hash breve del commit.
  if (boot.versione?.semver && boot.versione.semver !== '?') {
    const sf = $('.side-foot');
    if (sf) sf.innerHTML = `${tr({ it: 'Assetto Corsa EVO · tool locale', en: 'Assetto Corsa EVO · local tool' })}<br>${tr({ it: 'tutto resta sul tuo PC', en: 'everything stays on your PC' })}<br><span id="build-ver" title="versione della build (si aggiorna a ogni salvataggio del progetto su GitHub)">build ${esc(boot.versione.semver)}${boot.versione.hash ? ` · ${esc(boot.versione.hash)}` : ''}</span><br><span id="srv-live">…</span> <button class="mini" id="lang-foot" style="margin-left:6px;font-size:12.5px;padding:2px 7px" title="${esc(tr({ it: "cambia la lingua dell'interfaccia: vale per la GUI, il server in locale e il cruscotto in gioco", en: "switch the interface language: applies to the GUI, the local server and the in-game dashboard" }))}">${window.LINGUA === 'en' ? '🇬🇧 EN' : '🇮🇹 IT'}</button>`;
    // footer: contatto (issue GitHub precompilata). 10/11 (richiesta Mauro:
    // «leva la donazione dalla barra laterale così guadagniamo spazio» —
    // il caffè è salito nell'INTESTAZIONE, chip accanto a MoTeC.)
    const fl = boot.feedback || {};
    const footLinks = [];
    const hk = $('#hstat-kofi');
    if (hk) hk.style.display = fl.kofi ? '' : 'none';   // senza Ko-fi configurato il quadro resta a casa
    const kc = $('#kofi-chip');
    if (kc) {
      if (fl.kofi) {
        kc.href = fl.kofi;
        kc.title = tr({ it: 'Offri un caffè: sostieni lo sviluppo del tool — apre Ko-fi', en: "Buy me a coffee: support the tool's development — opens Ko-fi" });
        kc.textContent = '☕ ' + tr({ it: 'Offri un caffè', en: 'Buy me a coffee' });
      } else kc.textContent = '';
    }
    if (fl.issuesUrl) footLinks.push(`<a href="${esc(fl.issuesUrl)}" target="_blank" rel="noopener" title="${tr({ it: 'Apre GitHub con la segnalazione già compilata: leggi, completa il dettaglio e invia', en: 'Opens GitHub with the report already filled in: read, add details and submit' })}">🐞 ${esc(tr({ it: 'Segnala un problema', en: 'Report a problem' }))}</a>`);
    if (footLinks.length) sf.innerHTML += `<div class="foot-links">${footLinks.join('<span class="foot-sep">·</span>')}</div>`;
    const lf = $('#lang-foot', sf);
    if (lf) lf.onclick = () => window.impostaLingua(window.LINGUA === 'en' ? 'it' : 'en');
  }
  drawNav();
  drawSrvLive();   // primo battito: al boot non aspetta i 4 s dell'intervallo
  if (boot.hasCareer) paintHeader(boot.header);
}/* l'etichetta STATICHE dell'header (index.html): tradotte una volta sola */
(function paintStaticChrome() {
  const HEADER_L = {
    'Data': tr({ it: 'Data', en: 'Date' }),
    'Finanze': tr({ it: 'Finanze', en: 'Finances' }),
    'Reputazione': tr({ it: 'Reputazione', en: 'Reputation' }),
    'Livello': tr({ it: 'Livello', en: 'Level' }),
    'Stagione': tr({ it: 'Stagione', en: 'Season' }),
    'Eredità': tr({ it: 'Eredità', en: 'Heritage' }),
    'Prossima gara': tr({ it: 'Prossima gara', en: 'Next race' }),
    'Gioco': tr({ it: 'Gioco', en: 'Game' }),
    'MoTeC': 'MoTeC',
    'Caffè': tr({ it: 'Caffè', en: 'Coffee' }),
    'In pista': tr({ it: 'In pista', en: 'On track' }),
  };
  $$('#hstats .hstat .l').forEach((el) => { if (HEADER_L[el.textContent.trim()]) el.textContent = HEADER_L[el.textContent.trim()]; });
  /* lo skip-link è statico in index.html: la lingua ricarica la pagina, quindi
     va ritradotto qui a ogni boot (in EN resterebbe «Salta al contenuto»). */
  const sk = document.querySelector('#skip-link');
  if (sk) sk.textContent = tr({ it: 'Salta al contenuto', en: 'Skip to content' });
})();


/* ============================== faccine & icone dei pannelli ============================== */
/* Mauro 21/10: «controlla tutte le pagine, se ritieni stiano bene aggiungi faccine e
   icone». Invece di riscrivere i titoli in 17 file di viste, un DECORATORE centrale:
   ogni h2 di pannello senza emoji/icona prende una piccola faccina coerente col senso
   del pannello (mappa per PAROLA CHIAVE, con fallback per tab). Funziona anche per le
   viste future: niente da ricordarsi quando si aggiunge un pannello. */
/* 6/11 — UNA SOLA FAMIGLIA DI ICONE (richiesta Mauro): prima i titoli mescolavano
   SVG (Messaggi, Strumenti) ed emoji a colori, che cambiano disegno fra Windows 10
   e 11 e non prendono il colore d'accento. Ora la decorazione centrale converte in
   SVG anche le emoji già scritte nei titoli: una famiglia sola, stessa misura,
   stesso oro. Le emoji restano solo nel testo discorsivo e nei pulsanti. */
const ICON_SVG = {
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 5h12l-2 4 2 4H5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>',
  scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z"/></svg>',
  lens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/></svg>',
  stetho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a3 3 0 0 0 6 0V4"/><path d="M9 13v3a4 4 0 0 0 8 0v-2"/><circle cx="17" cy="11" r="2"/></svg>',
  peak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l6-9 4 5 3-4 5 8z"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6 8h12"/><path d="M6 8l-2 5h4zM18 8l-2 5h4z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="12" cy="12" r="1"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5L4 7v12l5-2 6 2 5-2V5l-5 2-6-2z"/><path d="M9 5v12M15 7v12"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7a3.5 3.5 0 1 0 4 4l-9 9-4-4 9-9z"/></svg>',
  tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19l7-7"/><path d="M14 5l5 5-3 3-5-5z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
  tyre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19a14 14 0 0 1 14-14"/><path d="M5 14a9 9 0 0 1 9-9"/><circle cx="6" cy="18" r="1.4"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4h6M9 10h6M9 14h4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 8l9 6 9-6"/></svg>',
  city: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M6 19V9h4v10M14 19V5h4v14"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16h16M5 16l2-5h10l2 5"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2-8h12l2 8v5H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10h14V9M10 13h4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 14v4M9 21h6"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l4-4 4 4-4 4z"/><path d="M12 12l4-4 4 4-4 4z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M15 9a3 3 0 0 0-3-2c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2a3 3 0 0 1-3-2M12 6v12"/></svg>',
  slider: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.5-7 9-7 9z"/></svg>',
  extinguisher: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="7" height="11" rx="2"/><path d="M11 8V5h4M9 5l4-1"/></svg>',
  tent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l9-14 9 14z"/><path d="M12 5v14"/></svg>',
};
/* emoji → icona: quelle già scritte nei titoli vengono sostituite, non ripetute */
const EMO_ICON = {
  '🏁':'flag', '📊':'chart', '📈':'chart', '📜':'scroll', '📖':'scroll', '💡':'bulb',
  '🔬':'lens', '🩺':'stetho', '🏔️':'peak', '⚖️':'scale', '🎲':'dice', '🌐':'globe',
  '🗺️':'map', '🗺':'map', '🔧':'wrench', '⚒️':'tools', '⚡':'bolt', '🛞':'tyre',
  '🧪':'flask', '🎯':'target', '📡':'signal', '📋':'clipboard', '📬':'mail', '📨':'mail',
  '🌆':'city', '🚗':'car', '🚘':'car', '🏠':'home', '📥':'inbox', '🗃️':'archive',
  '🗓️':'calendar', '🏆':'trophy', '🤝':'handshake', '💰':'money', '🎚️':'slider',
  '⚙️':'gear', '🫀':'heart', '🧯':'extinguisher', '🎪':'tent',
};
const H2_ICONS = [
  [/regola dei 4 psi/i, 'tyre'],
  [/auto della serie/i, 'car'],
  [/diagnostica telemetria/i, 'stetho'],
  [/salute sistema/i, 'heart'],
  [/registro errori/i, 'extinguisher'],
  [/prossima gara/i, 'flag'],
  [/eredità/i, 'scroll'],
  [/regole .*(weekend|week-end)/i, 'clipboard'],
  [/strumenti rapidi/i, 'tools'],
  [/eventi speciali/i, 'tent'],
  [/messaggi recenti/i, 'mail'],
  [/vita fuori pista/i, 'city'],
  [/consigli del box/i, 'wrench'],
  [/storia/i, 'scroll'],
  [/statistiche/i, 'chart'],
  [/finanz/i, 'money'],
  [/difficoltà/i, 'slider'],
  [/impostazion/i, 'gear'],
];
const TAB_FALL_ICON = {
  live:'signal', dashboard:'chart', agenda:'calendar', setup:'wrench', messages:'mail',
  championships:'trophy', griglia:'flag', standings:'globe', rivals:'handshake',
  tracks:'map', cars:'car', garage:'home', import:'inbox',
  archive:'archive', online:'globe', stats:'chart', banca:'money', difficulty:'slider', settings:'gear', analisi:'lens',
};
function decoratePanels(scope) {
  if (!scope) return;
  scope.querySelectorAll('h2, .setup-hero-title').forEach(h => {
    if (h.dataset.enriched) return;
    h.dataset.enriched = '1';
    // l'emoji di testa si TOGLIE sempre: se il titolo ha già un'icona SVG sua
    // (es. LI.flag) quella resta, altrimenti si aggiunge la stessa famiglia SVG
    let nome = null;
    const primo = [...h.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (primo) {
      const m = /^\s*(\p{Extended_Pictographic}(?:\uFE0F)?)\s*/u.exec(primo.textContent);
      if (m) { nome = EMO_ICON[m[1]] ?? 'flag'; primo.textContent = primo.textContent.slice(m[0].length); }
    }
    // il titolo ha già un'icona propria (LI.flag, icona statistica): emoji via, nessun doppione
    if (h.querySelector('svg') || h.querySelector('.st-ico')) return;
    if (!nome) { const key = H2_ICONS.find(([re]) => re.test(h.textContent)); nome = key ? key[1] : (TAB_FALL_ICON[tab] ?? 'flag'); }
    const span = document.createElement('span');
    span.className = 'h-ico';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = ICON_SVG[nome] ?? ICON_SVG.flag;
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
/* Rinomina i piloti (26/10): SITO di chiamata unico per rivali e classifica
   mondiale. Il soprannome vive nel save (state.alias) e vale SOLO sulle
   schermate (registro, schede, mondiale): la storia e i record di gara su
   rivals.json restano coi nomi veri, nulla si perde. Alias vuoto o uguale al
   nome vero = rimuove il soprannome. */
async function rinominaPilota(scope, key, attuale, vero){
  if (!key) return;
  const label = vero || attuale || '';
  const testo = window.tr({
    it: `Soprannome per «${label}» — vuoto o uguale = nome vero:`,
    en: `Nickname for "${label}" — empty or equal = real name:`,
  });
  const v = window.prompt(testo, attuale || '');
  if (v === null) return;
  const nv = String(v).trim();
  if (!nv || nv === label) { if (!attuale || attuale === label) return; }
  try {
    await api('alias-set', { scope, key, alias: (!nv || nv === label) ? '' : nv });
    toast(nv && nv !== label ? window.tr({ it: `Soprannome salvato: ${nv}`, en: `Nickname saved: ${nv}` }) : window.tr({ it: 'Nome vero ripristinato.', en: 'Real name restored.' }), 'ok');
  } catch (e) { toast(window.tr({ it: 'Non riesco a salvare il soprannome: ', en: 'Cannot save the nickname: ' }) + (e.message ?? e), 'err'); }
}
window.rinominaPilota = rinominaPilota;
