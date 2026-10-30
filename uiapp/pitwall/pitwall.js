// pitwall.js — l'app «Pitwall» in gioco — RICOSTRUZIONE (31/10/2026).
//
// La sorgente precedente era stata tolta di proposito il 30/10 pomeriggio
// (diario: «Pitwall SPENTO DI PROPOSITO, marcatore rinominato .disattivato»).
// Ricostruzione richiesta il 31/10 («Ricostruire l'app Pitwall») con un
// PERIMETRE RIDOTTO e chiaro: PITWALL = PANNELLO SOLO-INFORMAZIONI.
//
//   • Nessun comando al menu di EVO (niente window.engine, niente setcar /
//     avvia: quelle mani restano al Cruscotto, un solo braccio per gesto).
//   • Un solo costruttore di dati: il publisher del Cruscotto
//     (src/uiapp-pub.mjs) scrive nella STESSA fascia anche la mini-payload
//     della Pitwall ui-<slot>.json in QUESTA cartella; qui sola lettura.
//
// PATTERN PADDOCK + CRUSCOTTO (lezioni 27/10 18:40 e 18:52, valide qui):
// niente pagina del loader, lo script SI COSTRUISCE il pannello (position:
// fixed, appeso a document.body), niente query-string nell'XHR su coui://,
// il pannello nasce invisibile e si apre dalla voce del drawer APPS.
(function () {
  'use strict';
  const PERIODO_MS = 2500;   // lo stesso ritmo del publisher — se lo cambi, cambia là
  const S = { slot: -1, dati: null };

  const LOADER = window.ACEUIAppLoader;
  const ME = LOADER ? LOADER.app('pitwall') : null;
  const BASE = (ME?.base) || '/ACEUIAppLoader/pitwall/';
  const loga = (t) => { try { console.log('[Pitwall] ' + t); } catch (_e) {} };

  const CSS = `
.pwv-panel { position:fixed; right:12px; top:120px; bottom:100px; width:390px;
  z-index:100000; box-sizing:border-box; background:rgba(13,17,23,0.96);
  color:#e6edf3; font-family:'Segoe UI',system-ui,sans-serif; font-size:14px;
  border:1px solid #2a3341; border-top:3px solid #ffd47f; border-radius:10px;
  display:flex; flex-direction:column; overflow:hidden; }
.pwv-top { display:flex; align-items:center; height:38px; padding:0 12px;
  border-bottom:1px solid #2a3341; flex:none; }
.pwv-top b { color:#ffd47f; font-size:15px; letter-spacing:.5px; flex:1; }
.pwv-conn { flex:none; font-size:12px; margin-right:8px; cursor:default;
  user-select:none; opacity:.92; }
.pwv-close { color:#8b98a9; cursor:pointer; font-size:18px; padding:2px 8px; }
.pwv-close:hover { color:#fff; }
.pwv-body { position:relative; flex:1; min-height:0; overflow:hidden; }
.pwv-inner { padding:10px 12px; }
.pwv-track { position:absolute; top:6px; bottom:6px; right:3px; width:5px;
  background:#161b26; }
.pwv-thumb { position:absolute; left:0; width:100%; background:#4a5468; }
.pwv-nascosto { display:none; }
.pwv-panel .gruppo { margin-bottom:12px; }
.pwv-panel .gruppo h2 { font-size:12px; margin:0 0 8px 2px; color:#8b98a9;
  letter-spacing:1.5px; text-transform:uppercase; }
.pwv-panel .card { background:#161d2b; border:1px solid #2a3341;
  border-radius:10px; padding:9px 11px; margin-bottom:7px; overflow:hidden; }
.pwv-panel .card .titolo { font-weight:600; color:#ffd47f; margin-bottom:3px;
  overflow:hidden; }
.pwv-panel .card .riga { font-size:12px; color:#c3ccd9; line-height:1.55;
  word-wrap:break-word; overflow-wrap:break-word; overflow:hidden; }
.pwv-panel .uwoto { color:#9aa7b8; font-style:italic; padding:4px 2px; }
.pwv-panel .nota { color:#9aa7b8; font-size:10px; margin-left:6px;
  word-wrap:break-word; }
.pwv-panel .pwv-btn { background:#1d2c42; color:#7fb4ff; border:1px solid #2a3d5c;
  border-radius:8px; padding:5px 10px; font-size:12px; cursor:pointer;
  display:block; width:100%; text-align:left; }
.pwv-panel .pwv-btn:hover { background:#274060; }
.pwv-panel table.pwv-tab { width:100%; border-collapse:collapse; font-size:12px;
  color:#c3ccd9; table-layout:fixed; }
.pwv-panel table.pwv-tab td { padding:3px 4px; border-top:1px solid #232b39;
  word-wrap:break-word; overflow:hidden; }
.pwv-panel table.pwv-tab td.pos { width:26px; color:#8b98a9; text-align:right; }
.pwv-panel .sincro { font-size:12px; color:#c3ccd9; line-height:1.5;
  word-wrap:break-word; overflow:hidden; }
`;
  const stile = document.createElement('style');
  stile.textContent = CSS;
  try { (document.head || document.body).appendChild(stile); } catch (_e) { }

  // --------------------------------------------------------------- pannello
  const panel = document.createElement('div');
  panel.className = 'pwv-panel';
  const top = document.createElement('div');
  top.className = 'pwv-top';
  const t1 = document.createElement('b');
  t1.textContent = 'Pitwall';
  panel.appendChild(top);
  const conn = document.createElement('span');
  conn.className = 'pwv-conn';
  conn.textContent = '⚪';
  const chiusura = document.createElement('span');
  chiusura.className = 'pwv-close';
  chiusura.textContent = '×';
  chiusura.addEventListener('click', function () { apri(false); });
  top.appendChild(t1);
  top.appendChild(conn);
  top.appendChild(chiusura);
  const body = document.createElement('div');
  body.className = 'pwv-body';
  const inner = document.createElement('div');
  inner.className = 'pwv-inner';
  inner.innerHTML = '<div class="uwoto">In attesa del muro box…</div>';
  body.appendChild(inner);
  const track = document.createElement('div');
  track.className = 'pwv-track';
  const thumb = document.createElement('div');
  thumb.className = 'pwv-thumb';
  track.appendChild(thumb);
  body.appendChild(track);
  panel.appendChild(body);
  document.body.appendChild(panel);
  let scorri = null;
  try {
    if (LOADER?.scroll?.attach) {
      scorri = LOADER.scroll.attach({ body: body, track: track, thumb: thumb, nofitClass: 'pwv-nascosto' });
    } else { track.style.display = 'none'; }
  } catch (_e) { track.style.display = 'none'; }
  function apri(on) {
    try { panel.style.display = on ? 'flex' : 'none'; } catch (_e) { }
  }
  apri(false);   // nascosto finché il drawer non lo chiama

  // apertura dal DRAWER APPS (stessa tecnica del Cruscotto: click in cattura
  // sulla foglia col nostro nome, riagganciata ogni 2s perché il drawer si
  // ridisegna con elementi nuovi ad ogni giro).
  const same = (t) => String(t || '').replace(/\s+/g, '').toUpperCase() === 'PITWALL';
  function agganciaDrawer() {
    try {
      const all = document.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (panel.contains(e) || e.__pitwallB) continue;
        if (!same(e.textContent)) continue;
        if (e.children.length > 1) continue;
        e.__pitwallB = true;
        e.style.cursor = 'pointer';
        e.addEventListener('click', function (ev) { ev.stopPropagation(); ev.preventDefault(); apri(true); }, true);
        loga('voce del drawer agganciata');
      }
    } catch (_err) { }
  }
  setInterval(agganciaDrawer, 2000);
  agganciaDrawer();

  // -------------------------------------------------------------- fasce
  function leggiJson(nome, cb) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', BASE + nome, true);   // niente ?t= su coui:// (27/10 18:11)
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status !== 200 && xhr.status !== 0) return cb(null);
        try { return cb(JSON.parse(xhr.responseText)); } catch (_e) { return cb(null); }
      };
      xhr.send(null);
    } catch (_e) { cb(null); }
  }
  let fasciaTs = 0;
  function prendiSlot(now) {
    const slot = Math.floor(now / PERIODO_MS);
    if (slot === S.slot) return;
    leggiJson('ui-' + slot + '.json', function (fascia) {
      if (!fascia) {
        // una fascia in ritardo vale di più del silenzio (il gioco arriva
        // indietro di un tempo di media): prova la fascia prima
        if (slot > 0) {
          leggiJson('ui-' + (slot - 1) + '.json', function (d) { adotta(d, slot - 1); });
          return;
        }
        return adotta(null, slot);
      }
      adotta(fascia, slot);
    });
  }
  function adotta(dati, slot) {
    if (dati) {
      S.slot = slot;
      S.dati = dati;
      fasciaTs = Date.now();
      disegna();
    }
  }

  // -------------------------------------------------------------- blocchi
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // CONSIGLI DAL BOX: il gruppo che in pista serve ADESSO (30/10, «consiglio
  // anche in gioco») — STESSA radio dell'ingegnere del pannello GUI e del
  // copilota, un solo costruttore. Tips vuoto = gruppo nascosto: mai un
  // mucchio vuoto a schermo.
  function bloccoConsigli() {
    const c = S.dati?.consigli;
    const tips = Array.isArray(c?.tips) ? c.tips : [];
    if (!tips.length) return '';
    let h = '<div class="gruppo"><h2>Consigli dal BOX' + (c.live ? '' : ' · in attesa') + '</h2>';
    h += tips.map((t) => '<div class="card" style="border-color:' + (t.prio === 1 ? '#5d4a2f' : '#2a3341') + '">' +
      '<div class="titolo">' + esc(t.icon ?? '🔧') + ' ' + esc(t.title ?? '') + '</div>' +
      '<div class="riga">' + esc(t.text ?? '') + '</div></div>').join('');
    return h + '</div>';
  }

  // LA SINCRO «Prepara e Divertiti» (stesso campo della vetrina del Cruscotto):
  // UNA riga che dice se il server e la preparazione viaggiano insieme. null
  // = riga «nessuna», pannello sereno.
  function bloccoSincro() {
    const pr = S.dati?.prepara;
    if (!pr) return '';
    const hhmm = (ms) => { const d = new Date(Number(ms || 0)); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const resti = (ms) => Math.max(0, Math.round(Number(ms || 0) / 60000)) + ' min';
    const testo = pr.tipo === 'ronda'
      ? 'Ronda armata alle ' + hhmm(pr.armataAlle) +
        (Number(pr.viaFino) > Date.now() ? ' · via automatico fino alle ' + hhmm(pr.viaFino) : ' · via dal Cruscotto') +
        ' · valida ancora ' + resti(pr.scadeIn)
      : 'Gara al volo armata alle ' + hhmm(pr.armataAlle) + ' · valida ancora ' + resti(pr.scadeIn);
    return '<div class="gruppo"><h2>Prepara e Divertiti</h2><div class="card"><div class="sincro">🎯 ' + esc(testo) + '</div></div></div>';
  }

  // VERDETTO DI GIORNATA (29/10): i quattro numeri sempre, la tabella solo
  // aperta (toggle che sopravvive ai ridisegni, come nel Cruscotto).
  let verdettoAperto = false;
  function bloccoVerdetto() {
    const v = S.dati?.verdetto;
    if (!v || !v.gare) return '';
    const fmtGap = (ms) => (ms == null ? '—' : (ms < 0 ? '-' : '+') + Math.abs(Number(ms) / 1000).toFixed(1) + 's');
    const sommario = 'Gare ' + esc(v.gare) + ' · ' + esc(v.vittorie ?? 0) + ' vittorie · ' + esc(v.podi ?? 0) + ' podi' +
      (v.mediaPos != null ? ' · media P' + esc(Number(v.mediaPos).toFixed(1)) : '');
    let h = '<div class="gruppo"><h2>Verdetto di giornata</h2><div class="card">';
    h += '<div class="riga">' + sommario + '</div>';
    h += '<button class="pwv-btn" data-verdetto="1" style="margin-top:7px">' +
      (verdettoAperto ? '▲ Nascondi le gare di oggi' : '▼ Tutte le gare di oggi (' + esc(v.gare) + ')') + '</button>';
    if (verdettoAperto) {
      h += '<table class="pwv-tab" style="margin-top:6px">';
      h += '<tr><td class="pos">Ora</td><td>Pista</td><td>Posto</td><td>Gap</td></tr>';
      h += (v.righe ?? []).map(function (r) {
        const posto = r.dsq ? 'DSQ' : (r.posto != null ? r.posto + '/' + r.partecipanti : '—');
        return '<tr><td class="pos">' + esc(r.ora || '—') + '</td><td>' + esc(r.pista || '—') + '</td><td>' + esc(posto) + '</td><td>' + esc(fmtGap(r.gap)) + '</td></tr>';
      }).join('');
      h += '</table>';
    }
    return h + '</div></div>';
  }

  // LA RADIO DEL COPILOTA (31/10, «Pitwall con la radio»): le ultime frasi
  // del narratore portate dal payload (campo radio, già sul disco nel file
  // della voce). Stessa candela del pannello GUI: la radio in gara è
  // ADESSO, le frasi sono già state pronunciate e restano qui per context.
  // Nessuna frase = gruppo zitto: mai un mucchio vuoto a schermo.
  function bloccoRadio() {
    const frasi = Array.isArray(S.dati?.radio) ? S.dati.radio : [];
    if (!frasi.length) return '';
    const hhmm = (ms) => { const d = new Date(Number(ms || Date.now())); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    let h = '<div class="gruppo"><h2>📻 Radio del copilota</h2>';
    h += frasi.map((f) => '<div class="riga">' + esc(hhmm(f.t)) + ' · ' + esc(f.it) + '</div>').join('');
    return h + '</div>';
  }

  // AVVISO di fasce ferme (4/11, stesso criterio del Cruscotto): oltre 15s
  // senza fasce il pannello resta fermo e lo dice, con la via di sblocco.
  function bloccoAvvisi() {
    if (!fasciaTs) return '';
    const eta = Date.now() - fasciaTs;
    if (eta < 15 * 1000) return '';
    return '<div class="nota" style="color:#ffb347;margin-top:4px">⏸ Fasce ferme da ' + Math.round(eta / 1000) + " s: il server del Cruscotto è fermo (da GUI: riavvia il server, o 'node tools/riavvia-webui.mjs').</div>";
  }

  function disegna() {
    const d = S.dati ?? {};
    inner.innerHTML = bloccoConsigli() + bloccoRadio() + bloccoSincro() + bloccoVerdetto() + bloccoAvvisi() +
      ((d.consigli?.tips ?? []).length || (d.radio ?? []).length || d.verdetto || d.prepara || !fasciaTs
        ? ''
        : '<div class="uwoto">Il muro è zitto: nessun consiglio e nessuna gara di oggi.</div>');
    if (scorri) { try { scorri.fit?.(); } catch (_e) { } }
    aggiornaConn();
  }

  // pallino connessione: applet nel loader + fascia fresca (gli MRQ del
  // Cruscotto qui non esistono: pannello di sola lettura, due anelli soli).
  function aggiornaConn() {
    try {
      if (!LOADER) { conn.textContent = '🔴'; conn.setAttribute('title', "L'applet gira FUORI dal menu di EVO: non è nel loader."); return; }
      const eta = fasciaTs ? Date.now() - fasciaTs : -1;
      if (eta < 0) { conn.textContent = '⚪'; conn.setAttribute('title', 'Nessuna fascia ricevuta ancora dal publisher.'); return; }
      if (eta >= 15 * 1000) { conn.textContent = '🟠'; conn.setAttribute('title', 'Fasce ferme da ' + Math.round(eta / 1000) + " s — riavvia il server (node tools/riavvia-webui.mjs)."); return; }
      conn.textContent = '🟢';
      conn.setAttribute('title', 'Publisher allineato (fascia di ' + Math.round(eta / 1000) + ' s fa).');
    } catch (_e) { }
  }

  document.addEventListener('click', function (e) {
    const v = e.target?.closest ? e.target.closest('button.pwv-btn[data-verdetto]') : null;
    if (!v || !panel.contains(v)) return;
    e.preventDefault();
    verdettoAperto = !verdettoAperto;
    disegna();
  });

  setInterval(aggiornaConn, 1000);
  setInterval(function () { prendiSlot(Date.now()); }, PERIODO_MS / 2);
  prendiSlot(Date.now());
  loga('pannello Pitwall inizializzato (solo informazioni, niente comandi al menu)');
})();
