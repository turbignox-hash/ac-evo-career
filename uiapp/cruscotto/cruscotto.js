// cruscotto.js — l'app «Cruscotto» in gioco (27/10/2026).
//
// PATTERN PADDOCK (27/10 18:40): niente pagina del loader. L'app dichiara
// `pages` solo per dirti SU QUALI pagine gira, ma NON spediamo un menu.html:
// quel file finiva nel cassetto del loader che misura il pannello dal
// contenuto — con ~30 gare in lista il pannello cresceva oltre lo schermo e
// spostava il menu di EVO (27/10 18:17), e metà tentativi di fix via CSS/JS
// fuori scope hanno stretto la PAGINA DEL GIOCO (27/10 18:30: menu sparito).
// Lo script quindi SI COSTRUISCE il pannello: position:fixed a dimensioni
// sue, appeso a document.body (esattamente come fa paddock.js), con scorrere
// via loader.scroll se il loader lo offre.
//
// I dati arrivano come prima: un ui-<fascia>.json ogni 2.5s scritto dal
// publisher src/uiapp-pub.mjs nella cartella dell'app; il nome file variabile
// bypassa la cache del gioco. NIENTE query-string nell'XHR (su coui:// le
// risorse con ?t= falliscono — 27/10 18:11).
(function () {
  'use strict';
  const PERIODO_MS = 2500;        // lo stesso del publisher: se lo cambi, cambia là
  const S = { slot: -1, dati: null };

  const LOADER = window.ACEUIAppLoader;
  const ME = LOADER ? LOADER.app('cruscotto') : null;
  const BASE = (ME?.base) || '/ACEUIAppLoader/cruscotto/';
  const loga = (t) => { try { console.log('[Cruscotto] ' + t); } catch (_e) {} };

  // regola viva: NON toccare document o body styles — la pagina che gira qui
  // è quella del menu di EVO; le misure restano sugli elementi nostri
  // ------------------------------------------------------------------ CSS
  const CSS = `
.crd-panel { position:fixed; left:12px; top:120px; bottom:100px; width:430px;
  z-index:100000; box-sizing:border-box; background:rgba(13,17,23,0.96);
  color:#e6edf3; font-family:'Segoe UI',system-ui,sans-serif; font-size:14px;
  border:1px solid #2a3341; border-top:3px solid #7fb4ff; border-radius:10px;
  display:flex; flex-direction:column; overflow:hidden; }
.crd-top { display:flex; align-items:center; height:40px; padding:0 12px;
  border-bottom:1px solid #2a3341; flex:none; }
.crd-top b { color:#7fb4ff; font-size:16px; letter-spacing:.5px; flex:1; }
.crd-conn { flex:none; font-size:12px; margin-right:8px; cursor:default;
  user-select:none; opacity:.92; }
.crd-close { color:#8b98a9; cursor:pointer; font-size:18px; padding:2px 8px; }
.crd-close:hover { color:#fff; }
.crd-body { position:relative; flex:1; min-height:0; overflow:hidden; }
.crd-inner { padding:12px 14px; }
.crd-track { position:absolute; top:6px; bottom:6px; right:3px; width:5px;
  background:#161b26; }
.crd-thumb { position:absolute; left:0; width:100%; background:#4a5468; }
/* il pannello PARTE INVISIBILE (lezione 27/10 18:52): si apre solo con la
   voce CRUSCOTTO nella barra del menu di EVO, come la voce PADDOCK di
   paddock.js; niente tab fisso che resta sempre in vista */
.crd-nascosto { display:none; }
/* pannellino interno, stile vecchio cruscotto: sempre prefissato .crd-panel */
.crd-panel .gruppo { margin-bottom:14px; }
.crd-panel .gruppo h2 { font-size:12px; margin:0 0 8px 2px; color:#8b98a9;
  letter-spacing:1.5px; text-transform:uppercase; }
.crd-panel .card { background:#161d2b; border:1px solid #2a3341; border-radius:10px;
  padding:10px 12px; margin-bottom:8px; overflow:hidden; }
.crd-panel .card .titolo { font-weight:600; color:#ffd47f; margin-bottom:4px;
  overflow:hidden; }
.crd-panel .card .riga { font-size:12px; color:#c3ccd9; line-height:1.55;
  word-wrap:break-word; overflow-wrap:break-word; overflow:hidden; }
.crd-panel .stato { display:inline-block; padding:2px 9px; border-radius:20px;
  font-size:11px; margin-left:8px; }
.crd-panel .iscritto { background:#1c3a24; color:#7bdc8b; }
.crd-panel .disponibile { background:#37301a; color:#ffd47f; }
.crd-panel .bloccata { background:#3a1c1c; color:#f28b82; }
.crd-panel .vuoto { color:#9aa7b8; font-style:italic; padding:6px 2px; }
.crd-panel table.tab { width:100%; border-collapse:collapse; font-size:12px;
  color:#c3ccd9; table-layout:fixed; }
.crd-panel table.tab td { padding:3px 4px; border-top:1px solid #232b39;
  word-wrap:break-word; overflow:hidden; }
.crd-panel table.tab td.pos { width:26px; color:#8b98a9; text-align:right; }
.crd-panel table.tab td.punti { width:46px; text-align:right; color:#7fb4ff; }
.crd-panel table.tab tr.tu td { color:#ffd47f; font-weight:600; }
.crd-panel .tu-tag { background:#1c3a24; color:#7bdc8b; border-radius:9px;
  padding:0 6px; font-size:9px; font-weight:700; }
.crd-panel .punti-skill { color:#8b98a9; font-size:11px; font-weight:400; margin-left:6px; }
.crd-panel .apri-gui { background:#1d2c42; color:#7fb4ff; border:1px solid #2a3d5c;
  border-radius:8px; padding:4px 10px; font-size:12px; cursor:pointer;
  display:inline-block; }
.crd-panel .apri-gui:hover { background:#274060; }
.crd-panel .crd-btn { background:#1d2c42; color:#7fb4ff; border:1px solid #2a3d5c;
  border-radius:8px; padding:7px 12px; font-size:13px; font-weight:600; cursor:pointer;
  display:block; letter-spacing:.2px; }
.crd-panel .crd-btn:hover { background:#274060; color:#cfe3ff; }
.crd-panel .crd-btn:disabled { opacity:.45; cursor:default; }
.crd-panel .nota { color:#9aa7b8; font-size:10px; margin-left:6px;
  word-wrap:break-word; }
.crd-panel .mio { color:#ffd47f; font-size:15px; }
`;
  const stile = document.createElement('style');
  stile.textContent = CSS;
  try { (document.head || document.body).appendChild(stile); } catch (_e) { }

  // ------------------------------------------------------------------ il pannello
  const panel = document.createElement('div');
  panel.className = 'crd-panel';
  const top = document.createElement('div');
  top.className = 'crd-top';
  const t1 = document.createElement('b');
  t1.textContent = 'Cruscotto';
  panel.appendChild(top);
  // IL PALLINO DELLA CONNESSIONE: aggiornato da aggiornaConn() più sotto
  const conn = document.createElement('span');
  conn.className = 'crd-conn';
  conn.textContent = '⚪';
  const chiusura = document.createElement('span');
  chiusura.className = 'crd-close';
  chiusura.textContent = '×';
  chiusura.addEventListener('click', function () { apri(false); });
  top.appendChild(t1);
  top.appendChild(conn);
  top.appendChild(chiusura);
  const body = document.createElement('div');
  body.className = 'crd-body';
  const inner = document.createElement('div');
  inner.className = 'crd-inner';
  inner.innerHTML = '<div class="vuoto">In attesa del cruscotto del server…</div>';
  body.appendChild(inner);
  const track = document.createElement('div');
  track.className = 'crd-track';
  const thumb = document.createElement('div');
  thumb.className = 'crd-thumb';
  track.appendChild(thumb);
  body.appendChild(track);
  panel.appendChild(body);
  document.body.appendChild(panel);
  let scorri = null;
  try {
    if (LOADER?.scroll?.attach) {
      scorri = LOADER.scroll.attach({ body: body, track: track, thumb: thumb, nofitClass: 'crd-nascosto' });
    } else { track.style.display = 'none'; }
  } catch (_e) { track.style.display = 'none'; }

  function apri(on) {
    try { panel.style.display = on ? 'flex' : 'none'; } catch (_e) { }
  }
  apri(false);   // invisibile finché non lo chiede l'utente

  // ------------------------------------- apertura dal DRAWER del loader
  // (richiesta 27/10 19:05: niente voce nella barra del menu di EVO — solo
  // il drawer APPS del loader a destra). La riga «Cruscotto» del drawer è un
  // elemento della pagina: le attacchiamo il click (in cattura, così il
  // loader non la intercetta prima) e ogni 2s ricontrolliamo, perché il
  // drawer si ridisegna (la voce è un elemento nuovo ad ogni giro).
  const same = (t) => String(t || '').replace(/\s+/g, '').toUpperCase() === 'CRUSCOTTO';
  function agganciaDrawer() {
    try {
      const all = document.getElementsByTagName('*');
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (panel.contains(e) || e.__cruscottoB) continue;
        if (!same(e.textContent)) continue;
        // solo le foglie del drawer (la riga col nome, non contenitori larghi)
        if (e.children.length > 1) continue;
        e.__cruscottoB = true;
        e.style.cursor = 'pointer';
        e.addEventListener('click', function (ev) { ev.stopPropagation(); ev.preventDefault(); apri(true); }, true);
        loga('voce del drawer agganciata: il pannello si apre da lì');
      }
    } catch (_err) { }
  }
  setInterval(agganciaDrawer, 2000);
  agganciaDrawer();

  // ------------------------------------------------------------------ lettura fasce
  function leggiJson(nome, cb) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', BASE + nome, true); // NIENTE ?t=: su coui:// la query fa fallire la risorsa; nome-file nuovo = cache bypassata
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status !== 200 && xhr.status !== 0) return cb(null);
        try { return cb(JSON.parse(xhr.responseText)); } catch (_e) { return cb(null); }
      };
      xhr.send(null);
    } catch (_e) { cb(null); }
  }
  function prendiSlot(now) {
    const slot = Math.floor(now / PERIODO_MS);
    if (slot === S.slot) return;
    leggiJson('ui-' + slot + '.json', function (main) {
      if (!main && slot > 0) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', BASE + 'ui-' + (slot - 1) + '.json', true);
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            let d = null;
            try { if (xhr.status === 200) d = JSON.parse(xhr.responseText); } catch (_e) { }
            adotta(d, slot);
          };
          xhr.send(null);
          return;
        } catch (_e) { }
      }
      adotta(main, slot);
    });
  }
  function adotta(dati, slot) {
    if (dati) { S.slot = slot; try { applicaComando(dati.comando); } catch (_e) { } S.dati = dati; fasciaTs = Date.now(); disegna(); }
  }

  // ------------------------------------------------------------------ COMANDI IN DIRETTA
  const MODO_SINGLE = 'ClientCommandsMode_SINGLEPLAYER';
  const MODO_RACE_WEEKEND = 'GameModeType_RACE_WEEKEND';
  const OK_RISPOSTA = 'ClientCommandsResponse_OK';
  let ultimoComando = null;
  // SOBRIETÀ: UNA sequenza per volta + riprova senza cap (le lezioni 27/10
  // restano: le risposte si scambiano le mani se due sequenze corrono insieme)
  const RETRY_MS = 5000;
  let inCorso = false;
  let ultimoTentativoAt = 0;
  const falliti = new Map();          // id -> tentativi fatti (solo per la banda)
  function okTesto(r) { return r && r.response === OK_RISPOSTA ? 'ok' : ((r && (r.response || r.error)) || '?'); }

  // STORICO ack (28/10 pomeriggio, la F40 rientrata): ogni writeStore
  // rimpiazzava il valore con UNA riga sola — l'ack della ronda cancellava
  // quello dell'evento (e viceversa), e al primo riavvio del server il
  // comando già confermato ripartiva e l'evento toglieva l'auto alla ronda.
  // Il limp: creo la lista in sessione (eterna finché il menu vive) e la
  // sposto interamente sul persist a ogni ack. La lista in sessione parte
  // VUOTA, ma il server ripubblicando un comando già fatto lo vede e lo
  // spegne prima ancora che noi lo ritocchiamo.
  let ackSessione = [];
  function ackComando(c, ok, msg) {
    // L'ACK INVERSO (come Paddock e il suo paddock.py): il persist del loader
    // finisce in ui_storage.uistorage, che il server sa leggere — così il
    // publisher smette di ripubblicare un comando eseguito.
    const voce = { id: c.id, ok: ok ? 1 : 0, msg: String(msg || ''), at: Date.now() };
    ackSessione = [voce, ...ackSessione.filter(function (a) { return a && a.id !== c.id; })].slice(0, 10);
    try {
      const l = window.ACEUIAppLoader;
      if (!l || !l.persist || typeof l.persist.writeStore !== 'function') return;
      l.persist.writeStore('cruscotto.acks', { commands: ackSessione });
    } catch (e) { loga('ack: ' + e); }
  }

  function giocoComando(tipo, corpo, tempo) {
    return new Promise(function (risolvi) {
      const eng = window.engine;
      if (!eng || typeof eng.trigger !== 'function') { return risolvi({ error: 'engine non disponibile' }); }
      const respName = String(tipo).replace('Request', 'Response');
      let chiuso = false;
      const ricevo = function (r) {
        if (chiuso) return; chiuso = true;
        setTimeout(function () { try { eng.off?.(respName, ricevo); } catch (_e) { } risolvi(r); }, 0);
      };
      try { eng.on?.(respName, ricevo); } catch (e) { return risolvi({ error: String(e) }); }
      const corpo2 = Object.assign({}, corpo || {}, { __Type: tipo });
      setTimeout(function () {
        try { eng.trigger('OnUICommand', tipo, corpo2); } catch (e) { chiuso = true; risolvi({ error: String(e) }); }
      }, 250);
      setTimeout(function () {
        if (chiuso) return; chiuso = true;
        try { eng.off?.(respName, ricevo); } catch (_e) { }
        risolvi({ error: 'nessuna risposta a ' + tipo });
      }, tempo || 6000);
    });
  }

  // nome confrontabile: minuscolo, senza accenti, solo lettere e numeri (come in paddock.js)
  const ACCENTI = { 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
                    'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c' };
  function chiave(t) { return String(t || '').toLowerCase().replace(/[àáâäèéêëìíîïòóôöùúûüñç]/g, function (c) { return ACCENTI[c] || c; }).replace(/[^a-z0-9]/g, ''); }

  function trovaAuto(cars, nome, carId) {
    const k = chiave(nome); if (!k) return null;
    for (let i = 0; i < cars.length; i++) { if (chiave(cars[i].display_name) === k) return cars[i]; }
    for (let i = 0; i < cars.length; i++) {
      const dn = chiave(cars[i].display_name);
      if (dn && (dn.indexOf(k) >= 0 || k.indexOf(dn) >= 0)) return cars[i];
    }
    const parole = String(nome).toLowerCase().split(/\\s+/).map(chiave).filter(Boolean);
    let best = null;
    for (let i = 0; i < cars.length; i++) {
      const dn = chiave(cars[i].display_name);
      if (dn && parole.every(function (w) { return dn.indexOf(w) >= 0; }) && (!best || dn.length < chiave(best.display_name).length)) best = cars[i];
    }
    if (best) return best;
    // RISERVA DELL'ID (1/11, come fa Paddock le auto sconosciute la prima
    // volta): ogni car_model del menu porta anche il campo interno name
    // (l'id ks_...), e la ladder può chiamare l'auto col SUO nome ("Mini
    // JCS 1990") mentre il menu la chiama diversamente ("Mini John Cooper
    // S"): niente token combacia. L'ID della scheda invece è UNIVOCO:
    // chiave(c.name) === chiave(carId) risolve al volo, senza dizionario.
    if (carId) {
      const kId = chiave(carId);
      if (kId) {
        for (let i = 0; i < cars.length; i++) { if (chiave(cars[i].name) === kId) return cars[i]; }
      }
    }
    return null;
  }

  // IL CIELO nella lista meteo del gioco (weather_data dei GameModeParameters):
  // il tipo finisce col codice («…_RAIN»), come nella battuta del Paddock.
  // Per la pioggia GENERICA le voci specifiche (_LIGHT_RAIN, _HEAVY_RAIN) non
  // devono catturarla: se solo quelle ci sono, valgono comunque loro (meglio
  // bagnato che niente).
  function scegliCielo(list, cod) {
    const want = String(cod || '').toUpperCase();
    if (!want) return null;
    const scarti = [];
    const cieli = list || [];
    for (let i = 0; i < cieli.length; i++) {
      const t = String(cieli[i]?.type || '').toUpperCase();
      if (!t || !(t === want || t.endsWith('_' + want))) continue;
      if (want === 'RAIN' && (t.endsWith('_LIGHT_RAIN') || t.endsWith('_HEAVY_RAIN'))) { scarti.push(cieli[i]); continue; }
      return cieli[i];
    }
    return scarti[0] || null;
  }

  // la pista nell'elenco del gioco: nome uguale, poi uno contenuto nell'altro;
  // il layout del libro (TRACK_INFO) conta solo se il comando lo porta
  function trovaPista(tracks, nome, layout) {
    const k = chiave(nome); if (!k) return null;
    const kl = chiave(layout);
    let scorta = null;
    for (let i = 0; i < tracks.length; i++) {
      const tn = chiave(tracks[i].name), tl = chiave(tracks[i].layout);
      if (!tn) continue;
      if (!(tn === k || tn.indexOf(k) >= 0 || k.indexOf(tn) >= 0)) continue;
      if (!kl || !tl || tl === kl || tl.indexOf(kl) >= 0 || kl.indexOf(tl) >= 0) return tracks[i];
      scorta = scorta || tracks[i];
    }
    return scorta;
  }

  // SEQUENZA COMPLETA (gara di carriera): SetGameType → pista → Models → SetCurrentCar
  async function corriSetcar(c) {
    const eng = window.engine;
    if (!eng || typeof eng.trigger !== 'function') { notaComando('engine non disponibile (pagina aperta fuori dal gioco?)'); return false; }
    const r1 = await giocoComando('GameModeSelectionClientRequestSetGameType', { mode: MODO_SINGLE, type: MODO_RACE_WEEKEND }, 8000);
    if (!r1 || r1.response !== OK_RISPOSTA) { notaComando('Race Weekend: ' + okTesto(r1)); loga('SetGameType: ' + okTesto(r1)); return false; }
    if (c.pista) {
      const tl = await giocoComando('GameModeSelectionClientRequestTrackList', { mode: MODO_SINGLE }, 10000);
      const items = (tl?.track_item) || [];
      const pista = trovaPista(items, c.pista, c.layout);
      if (pista) {
        const r2 = await giocoComando('GameModeSelectionClientRequestSetTrack', { mode: MODO_SINGLE, track_item: pista }, 8000);
        if (!r2 || r2.response !== OK_RISPOSTA) { notaComando('Pista ' + (pista.name || c.pista) + ': ' + okTesto(r2)); loga('SetTrack: ' + okTesto(r2)); return false; }
      }
    }
    const cl = await giocoComando('CarSelectionClientRequestModels', { mode: MODO_SINGLE, brand: '' }, 10000);
    if (!cl) { notaComando('Models: nessuna risposta dal menu di EVO'); loga('Models: nessuna risposta'); return false; }
    const cars = (cl.car_model) || [];
    const car = trovaAuto(cars, c.nome, c.carId);
    if (!car) { notaComando('Auto non trovata nel menu del gioco: ' + c.nome + ' (' + cars.length + ' in lista)'); loga('Auto non trovata: ' + c.nome); return false; }
    loga('auto trovata: ' + car.display_name);
    const r3 = await giocoComando('CarSelectionClientRequestSetCurrentCar', { mode: MODO_SINGLE, model: car }, 8000);
    if (!r3 || r3.response !== OK_RISPOSTA) { notaComando(c.nome + ': ' + okTesto(r3)); loga('SetCurrentCar: ' + okTesto(r3)); return false; }
    loga('✓ SetCurrentCar ok: ' + car.display_name);
    // METEO + ORA AL VOLO (1/11, la STESSA scuola delle auto per id: chiedi al
    // gioco le sue liste e scegli, niente dizionari). BEST EFFORT: ora e meteo
    // della ronda restano comunque sul disco (stesso piano del Prepara) —
    // se il menu non risponde, la vetrina dell'auto resta e l'ack esce uguale.
    // NIENTE GIRI: la durata resta quella scritta su disco.
    const fatti = [];
    try {
      const gp = await giocoComando('GameModeSelectionClientRequestGameModeParameters', { mode: MODO_SINGLE }, 8000);
      if (gp) {
        const sess = gp.sessions || [];
        // ORA: lo stesso piano orario del Prepara su disco (P −6h, Q −3h, W −1h, gara all'ora esatta)
        if (c.ora != null) {
          const off = (sn) => { const s = String(sn || '').toLowerCase(); return /practice/.test(s) ? 6 : /qualif/.test(s) ? 3 : /warm/.test(s) ? 1 : 0; };
          let toc = 0;
          sess.forEach((s) => { if (s && s.time_of_day && typeof s.time_of_day === 'object') { s.time_of_day.hour = Math.max(0, Math.min(23, Number(c.ora) - off(s.name))); toc++; } });
          if (toc) {
            const rp = await giocoComando('GameModeSelectionClientRequestSetGameModeParameters', { mode: MODO_SINGLE, sessions: sess }, 8000);
            if (rp && rp.response === OK_RISPOSTA) fatti.push('ore ' + c.ora + ':00');
            loga('ora ' + c.ora + ':00 per ' + toc + ' sessioni: ' + okTesto(rp));
          }
        }
        // METEO: il cielo si sceglie nella lista del gioco per SUFFISSO del tipo
        if (c.meteo) {
          const ciel = scegliCielo(gp.weather_data, c.meteo);
          if (ciel) {
            const rw = await giocoComando('GameModeSelectionClientRequestSetWeather', { weather_data: ciel }, 8000);
            if (rw && rw.response === OK_RISPOSTA) fatti.push('meteo ' + c.meteo);
            loga('meteo ' + c.meteo + ': ' + okTesto(rw));
          } else { loga('meteo ' + c.meteo + ': il gioco non lo ha nella lista'); }
        }
      }
    } catch (e) { loga('meteo/ora al volo: ' + e); }
    notaComando('✓ ' + car.display_name + ' nel menu di EVO' + (fatti.length ? ' · ' + fatti.join(' · ') : ', senza riavvio') + '.');
    loga('✓ SetCurrentCar ok: ' + car.display_name);
    return true;
  }

  // EVENTO SPECIALE (F40 ecc.): SOLO l'auto — la gara personalizzata
  // dell'evento non si tocca (niente SetGameType, niente SetTrack: sono
  // campi della ronda di carriera e l'evento vive fuori, lezione 23/10)
  async function corriEvento(c) {
    const eng = window.engine;
    if (!eng || typeof eng.trigger !== 'function') { notaComando('engine non disponibile (pagina aperta fuori dal gioco?)'); return false; }
    const cl = await giocoComando('CarSelectionClientRequestModels', { mode: MODO_SINGLE, brand: '' }, 10000);
    if (!cl) { notaComando('Models: nessuna risposta dal menu di EVO'); loga('Models: nessuna risposta'); return false; }
    const cars = (cl.car_model) || [];
    const car = trovaAuto(cars, c.nome, c.carId);
    if (!car) { notaComando('Auto non trovata nel menu del gioco: ' + c.nome + ' (' + cars.length + ' in lista)'); loga('Auto non trovata: ' + c.nome); return false; }
    loga('auto evento trovata: ' + car.display_name);
    const r = await giocoComando('CarSelectionClientRequestSetCurrentCar', { mode: MODO_SINGLE, model: car }, 8000);
    if (!r || r.response !== OK_RISPOSTA) { notaComando(c.nome + ': ' + okTesto(r)); loga('SetCurrentCar: ' + okTesto(r)); return false; }
    notaComando('✓ ' + car.display_name + ' pronta per l\'evento (solo auto: pista e gara si impostano dalla scheda).');
    loga('✓ evento SetCurrentCar ok: ' + car.display_name);
    return true;
  }

  // LANCIO AUTOMATICO (28/10 sera, richiesta Mauro): quando la ronda è già
  // state impostata nel menu (setcar confermato), il Cruscotto preme «Avvia
  // sessione» DA SOLO — lo stesso comando che Paddock usa per le sue gare
  // (GameModeSelectionClientRequestStart, 15s di attesa: la risposta del
  // caricamento arriva lenta). SOLO la ronda di carriera: per l'EVENTO NO —
  // lì pista/AI/ora/giri si impostano a mano dalla scheda (lezione 23/10) e
  // un avvio automatico partirebbe con le impostazioni sbagliate. Pausa di
  // 1200ms prima della richiesta: il menu si deve ancora sistemare dopo la
  // scelta dell'auto (lo stesso respiro dei 300ms del Paddock, più largo).
  async function corriAvvia() {
    const eng = window.engine;
    if (!eng || typeof eng.trigger !== 'function') { notaComando('engine non disponibile (pagina aperta fuori dal gioco?)'); return false; }
    await new Promise(function (dai) { window.setTimeout(dai, 1200); });
    const r = await giocoComando('GameModeSelectionClientRequestStart', { mode: MODO_SINGLE }, 15000);
    if (!r || r.response !== OK_RISPOSTA) {
      notaComando('Avvia sessione: ' + okTesto(r)); loga('RequestStart: ' + okTesto(r)); return false;
    }
    notaComando('✓ Gara avviata dal Cruscotto («Avvia sessione» premuto).');
    loga('✓ RequestStart ok: sessione avviata');
    return true;
  }

  // ---------------------------------------------------- BOTTONI «Prepara e divertiti»
  // (3/11, «implementalo sul cruscotto per i bottoni prepara e divertiti di
  // entrambi, anche eventi speciali»): il publisher spedisce le azioni in
  // azioni {} NELLO stesso fascio delle facce (src/uiapp-pub.mjs). Ciascun
  // bottone riESCE la STESSA sequenza del canale automatico — ronda: SetGameType
  // → pista → auto → «Avvia sessione» (la STESSA di Paddock installato sul
  // PC); evento/demo: SOLO auto in gara personalizzata, perché la scheda la
  // scrive «Prepara tutto» dalla GUI (pista/griglia/AI/ora/giri, lezione 23/10).
  // Gli ID sono gli STESSI (azioniPulsanti li deriva dagli stessi imprint),
  // così l'ack del bottone sincronizza le ASSETS di lato: il canale
  // automatico tace per lo stesso gesto, nessun ping-pong con il garage.
  const azioni = () => (S.dati?.azioni) || {};
  const bottoneTs = {};          // az -> ultimo tentativo (finestra anti doppio-clic = RETRY_MS)
  let fasciaTs = 0;              // quando è arrivata l'ultima fascia: per un conteggio vivo tra le fasce

  async function bottoneCorri(_k, cmd) {
    if (cmd.tipo !== 'setcar') return corriEvento(cmd);
    const ok = await corriSetcar(cmd);
    if (!ok) return false;
    ackComando(cmd, true, 'ronda pronta dal bottone (tipo gara/pista/auto)');
    const okVia = await corriAvvia();
    if (okVia) ackComando(Object.assign({}, cmd, { id: cmd.id + ':avvia', tipo: 'avvia', pista: null, layout: null }), true, 'avvia dal bottone: sessione lanciata');
    // «Avvia» non riuscita: NESSUN ack del :avvia — il canale automatico
    // ripropone il comando la fascia dopo (l'applicazione self-service che
    // ha già garantito la rip roar). L'auto impartita dal bottone resta.
    return true;
  }

  document.addEventListener('click', function (e) {
    // il TOGGLE del verdetto (29/10): apre/chiude la tabella della giornata
    // — nessun canale verso il server, il dato è già nella fascia
    const v = e.target?.closest ? e.target.closest('button.crd-btn[data-verdetto]') : null;
    if (v && panel.contains(v)) {
      e.preventDefault();
      verdettoAperto = !verdettoAperto;
      disegna();
      return;
    }
    const b = e.target?.closest ? e.target.closest('button.crd-btn[data-az]') : null;
    if (!b || !panel.contains(b)) return;
    e.preventDefault();
    const k = b.getAttribute('data-az');
    const a = azioni()[k];
    if (!a || !a.id || !a.nome) { notaComando('La preparazione ' + k + ' non è più fresca: attenda la prossima fascia.'); return; }
    if (inCorso) { notaComando('Sequenza già in corso: si riparte quando finisce.'); return; }
    if (Date.now() - (bottoneTs[k] ?? 0) < RETRY_MS) return;   // la stessa finestra del canale automatico
    bottoneTs[k] = Date.now();
    inCorso = true;
    ultimoTentativoAt = Date.now();   // anche il canale automatico si aspetta durante il bottone
    try { b.disabled = true; } catch (_e) { }
    loga('bottone ' + k + ': sequenza del ponte (' + a.id + ')');
    const cmd = { id: a.id, tipo: a.tipo, nome: a.nome, pista: a.pista ?? null, layout: a.layout ?? null };
    Promise.resolve(bottoneCorri(k, cmd)).then(function (ok) {
      inCorso = false;
      if (ok) falliti.delete(cmd.id);   // riuscito: le risposte del canale automatico ripubblicano da sole
      disegna();
    }).catch(function (err) {
      inCorso = false;
      notaComando('Bottone «' + k + '»: ' + String(err?.message ?? err));
      disegna();
    });
  });

  function bloccoBottoni() {
    const az = azioni();
    // DETTAGLIO delle card (4/11): il publisher spedisce i FATTI del sistema
    // (4/11 in uiapp-pub): la finestra di freschezza (scadeIn), per l'evento
    // pista/giri/ora/banda, per la gara al volo lo stato REALE dell'istan-
    // tanea (durata · pista · banda AI) letto a ogni fascia. Niente promesse.
    const fmtRimasto = (ms) => {
      const s = Math.round(Number(ms) / 1000);
      if (!Number.isFinite(s) || s <= 0) return 'scaduta';
      if (s < 60) return 'meno di 1 m';
      const m = Math.floor(s / 60);
      if (m < 60) return m + ' m';
      return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' m' : '');
    };
    // CONTEGGIO VIVO (4/11): la finestra scorre ANCHE tra le fasce — scadeIn
    // arriva con la fascia e qui si sottrae il tempo passato da allora.
    const resto = (a) => Math.max(0, Number(a.scadeIn) - (Date.now() - (fasciaTs || Date.now())));
    const pezzi = (a) => {
      const p = [];
      const i = a.istantanea;
      if (i?.durata) p.push(i.durata.giri != null ? i.durata.giri + ' giri' : (i.durata.min != null ? i.durata.min + ' min a tempo' : null));
      if (i?.pista) p.push('pista ' + i.pista);
      if (i?.banda) p.push('AI ' + i.banda);
      if (a.pista) p.push('pista ' + a.pista);
      if (a.giri != null) p.push(a.giri + ' giri');
      if (a.ora != null) p.push('ore ' + String(a.ora).padStart(2, '0') + ':00');
      if (a.banda && !i) p.push('AI ' + a.banda);
      // CARD ARRICHITE (4/11 in uiapp-pub): la demo porta anche l'ULTIMA
      // scrittura del registro della durata («5 giri · AI 88–93 · 14:32»),
      // l'evento porta il PREMIO in palio (auto + soldi). Null = nessuna riga:
      // la card resta come prima, senza righe vuote.
      if (a.registro) p.push('scritto ' + a.registro);
      if (a.premio) p.push('premio ' + a.premio);
      if (a.scadeIn != null) p.push('finestra ' + fmtRimasto(resto(a)));
      return p.filter(Boolean).join(' · ');
    };
    const scheda = (k) => {
      const a = az[k];
      if (!a || !a.id || !a.nome) return '';
      const se = a.tipo === 'setcar'
        ? (a.pista ? 'tipo gara, pista ' + a.pista + ' e auto nel menu di EVO, poi avvia' : 'tipo gara e auto nel menu di EVO, poi avvia')
        : 'SOLO auto nel menu di EVO: pista/griglia/AI/ora/giri restano sulla scheda da GUI';
      const etico = k === 'ronda'
        ? '🏁 Prepara e divertiti'
        : (k === 'demo'
          ? '🏁 Prepara e divertiti (gara al volo)'
          : '⭐ Prepara e divertiti (evento)');
      const titolo = k === 'ronda'
        ? 'Ronda preparata' + (a.serie ? ' · ' + a.serie : '')
        : (k === 'demo' ? 'Gara al volo armata' : 'Evento speciale' + (a.tema ? ' · ' + a.tema : ''));
      const dett = pezzi(a);
      // A SPREVIO (4/11): finestra sotto le 2 ore = dett in arancione, non
      // più nel grigio che non dice niente. Sopra, resta sobrio.
      const urgente = a.scadeIn != null && resto(a) < 2 * 60 * 60 * 1000;
      return '<div class="card"><div class="titolo">' + esc(titolo) + '</div><div class="riga">' + esc(a.nome) +
        (a.tipo === 'setcar' && a.pista ? ' @ ' + esc(a.pista) : '') + ' — ' + esc(se) + '</div>' +
        (dett ? '<div class="nota"' + (urgente ? ' style="color:#ffb347"' : '') + '>' + esc(dett) + '</div>' : '') +
        '<button class="crd-btn" data-az="' + k + '" style="margin-top:8px;width:100%">' + etico + '</button></div>';
    };
    const h2 = scheda('ronda') + scheda('evento') + scheda('demo');
    if (!h2) return '';
    return '<div class="gruppo"><h2>Prepara e diverti</h2>' + h2 + '</div>';
  }

  // AVVISI DI SERVIZIO (4/11 sera): se le fasce smettono di arrivare il
  // pannello resta FERMO e i conteggi vivi degli scadeIn diventano un inganno.
  // Fascia ferma da oltre 15 s = avviso visibile: età in secondi e la via
  // di sblocco (riavvia-webui). Fasce in salita: nessuna riga, come prima.
  function bloccoAvvisi() {
    if (!fasciaTs) return '';   // mai niente ricevuto: la striscia di attesa già parla
    const eta = Date.now() - fasciaTs;
    if (eta < 15 * 1000) return '';
    return '<div class="nota" style="color:#ffb347;margin-top:4px">⏸ Fasce ferme da ' + Math.round(eta / 1000) + " s: il server del Cruscotto è fermo (da GUI: riavvia il server, o 'node tools/riavvia-webui.mjs').</div>";
  }

  // VERDETTO DI GIORNATA (29/10, «bottone verdetto sul cruscotto»): il
  // publisher spedisce a ogni fascia il riepilogo di oggi (S.dati.verdetto,
  // stesso aggregato del tool CLI e dell'endpoint della GUI). Qui un sola
  // card: i quattro numeri sempre, la tabella SOLO quando aperta (toggle
  // che sopravvive ai ridisegni — la variabile vive fuori da disegna()).
  let verdettoAperto = false;
  function bloccoVerdetto() {
    const v = S.dati?.verdetto;
    if (!v || !v.gare) return '';
    const fmtGap = (ms) => (ms == null ? '—' : (ms < 0 ? '-' : '+') + Math.abs(Number(ms) / 1000).toFixed(1) + 's');
    const fmtGiro = (g) => {
      if (!g) return '—';
      const min = Math.floor(g.ms / 60000), resto = (g.ms % 60000) / 1000;
      return min + ':' + resto.toFixed(3).padStart(6, '0') + (g.pista ? ' @ ' + g.pista : '');
    };
    const sommario = 'Gare ' + esc(v.gare) + ' · ' + esc(v.vittorie ?? 0) + ' vittorie · ' + esc(v.podi ?? 0) + ' podi' +
      (v.mediaPos != null ? ' · media P' + esc(Number(v.mediaPos).toFixed(1)) : '') +
      (v.giroTop ? ' · giro ' + esc(fmtGiro(v.giroTop)) : '');
    let h = '<div class="gruppo"><h2>Verdetto di giornata</h2><div class="card">';
    h += '<div class="riga">' + sommario + '</div>';
    h += '<button class="crd-btn" data-verdetto="1" style="margin-top:8px;width:100%">' +
      (verdettoAperto ? '▲ Nascondi le gare di oggi' : '▼ Tutte le gare di oggi (' + esc(v.gare) + ')') + '</button>';
    if (verdettoAperto) {
      h += '<table class="tab" style="margin-top:6px">';
      h += '<tr><td class="pos">Ora</td><td>Posto</td><td>Gap</td><td>Tuo giro</td></tr>';
      h += (v.righe ?? []).map(function (r) {
        const posto = r.dsq ? 'DSQ' : (r.posto != null ? r.posto + '/' + r.partecipanti : '—');
        const giro = r.giro ? r.giro + (r.penalita ? ' (' + r.penalita + ')' : '') : '—';
        return '<tr><td class="pos">' + esc(r.ora || '—') + '</td><td>' + esc(posto) + '</td><td>' + esc(fmtGap(r.gap)) + '</td><td>' + esc(giro) + '</td></tr>';
      }).join('');
      h += '</table><div class="nota" style="margin-top:4px">Penalità nelle celle del giro. Il riepilogo torna vuoto a cambio giorno.</div>';
    }
    h += '</div></div>';
    return h;
  }

  // I CONSIGLI IN GIOCO (30/10, «consiglio anche in gioco»): la radio
  // dell'ingegnere arriva nel payload della vetrina (d.consigli,
  // STESSA del pannello GUI e del copilota — un solo costruttore lato
  // server, engineerLive). Il gruppo SUOLI ESISTERE con tips veri:
  // gioco chiuso o fuori sessione = niente card, non una vacca vana.
  function bloccoConsigli() {
    const c = S.dati?.consigli;
    const tips = Array.isArray(c?.tips) ? c.tips : [];
    if (!tips.length) return '';
    let h = '<div class="gruppo"><h2>Consigli dal BOX' + (c.live ? '' : ' · in attesa') + '</h2>';
    h += tips.map((t) => '<div class="card" style="border-color:' + (t.prio === 1 ? '#5d4a2f' : '#2a3341') + '">' +
      '<div class="titolo">' + esc(t.icon ?? '🔧') + ' ' + esc(t.title ?? '') + '</div>' +
      '<div class="riga">' + esc(t.text ?? '') + '</div></div>').join('');
    h += '</div>';
    return h;
  }

  function applicaComando(c) {
    if (!c || !c.id || !c.nome) return;
    if (inCorso) return;
    const tent = falliti.get(c.id) ?? 0;
    if (c.id === ultimoComando && tent === 0) return;
    if (Date.now() - ultimoTentativoAt < RETRY_MS) return;
    ultimoTentativoAt = Date.now();
    inCorso = true;
    ultimoComando = c.id;
    loga('comando ' + c.id + ' (' + c.nome + (c.pista ? ' @ ' + c.pista : '') + '), tentativo ' + (tent + 1));
    const lavoro = c.tipo === 'evento' ? corriEvento(c) : (c.tipo === 'avvia' ? corriAvvia() : corriSetcar(c));
    Promise.resolve(lavoro).then(function (ok) {
      inCorso = false;
      if (ok) { falliti.delete(c.id); ackComando(c, true, c.tipo === 'avvia' ? 'avvia sessione premuto' : 'auto impostata nel menu di EVO'); }
      else { falliti.set(c.id, tent + 1); /* riprova senza cap: il mock del contatore era mancante e un comando fallito non riprovava mai — RETRY_MS ammorbidisce il giro */ }
    });
  }

  // il risultato del comando si VEDI nel pannello: banda in testa
  function notaComando(t) { try { window.__cruscottoNota = String(t); } catch (_e) { } }
  function strisciaNota() {
    const n = window.__cruscottoNota;
    if (!n) return '';
    const ok = n.indexOf('✓') === 0;
    return '<div class="card" style="border-color:' + (ok ? '#2f5d3a' : '#5d4a2f') + '"><div class="riga" style="color:' + (ok ? '#7bdc8b' : '#ffd47f') + '">🤖 ' + esc(n) + '</div></div>';
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function bloccoClassifica(c) {
    if (!c || !c.righe || !c.righe.length) return '';
    let h = '<div class="gruppo"><h2>Classifica · ' + esc(c.nome) + '</h2>';
    h += '<div class="card"><table class="tab">';
    for (const r of c.righe.slice(0, 6)) {
      h += '<tr class="' + (r.tu ? 'tu' : '') + '"><td class="pos">' + esc(r.pos) + '</td><td>' + esc(r.nome) +
        (r.tu ? ' <span class="tu-tag">tu</span>' : '') + '</td><td class="punti">' + esc(r.punti) + '</td></tr>';
    }
    h += '</table></div></div>';
    return h;
  }

  function bloccoMondo(m, guiUrl) {
    if (!m) return '';
    let h = '<div class="gruppo"><h2>Mondiale</h2><div class="card">';
    h += '<div class="titolo">Posizione <b class="mio">' + esc(m.tuaPosizione) + '</b> di ' + esc(m.totale) +
      ' <span class="punti-skill">skill ' + esc(m.tuaSkill) + '</span></div>';
    h += '<table class="tab">';
    for (const r of m.top.slice(0, 5)) {
      h += '<tr class="' + (r.tu ? 'tu' : '') + '"><td class="pos">' + esc(r.pos) + '</td><td>' + esc(r.nome) +
        (r.tu ? ' <span class="tu-tag">tu</span>' : '') + '</td><td class="punti">' + esc(r.skill) + '</td></tr>';
    }
    h += '</table>';
    if (guiUrl) {
      h += '<div class="riga" style="margin-top:8px"><a class="apri-gui" href="javascript:void(0)" data-url="' + esc(String(guiUrl)) + '">Mondiale completo ↗</a></div>';
    }
    return h + '</div></div>';
  }

  document.addEventListener('click', function (e) {
    const a = e.target?.closest ? e.target.closest('a.apri-gui') : null;
    if (!a) return;
    e.preventDefault();
    const url = a.getAttribute('data-url') || (S.dati?.guiUrl) || null;
    if (!url) return;
    try { window.open(url, '_blank'); } catch (_err) { }
    try { if (window.external && typeof window.external.openURL === 'function') window.external.openURL(url); } catch (_err) { }
  });

  const STATI = {
    iscritto: ['iscritto', 'Iscritto'],
    disponibile: ['disponibile', 'Disponibile'],
    bloccata: ['bloccata', 'Bloccata'],
  };

  // LA STORIA VISIBILE (31/10, «storia visibile in gioco»): il tooltip già la
  // racconta, ma solo a chi si ferma col mouse sul pallino. In una GARA il mouse
  // non si guarda: le mosse del cambio auto — comando uscito in fascia e la sua
  // conferma — si scandiscono ANCHE in una piccola lista del pannello (ultime
  // 4, la più recente prima). Memoria vuota = niente blocco: mai buchi fantasma.
  function bloccoStoria() {
    const storia = Array.isArray(S.dati?.storia) ? S.dati.storia : [];
    if (!storia.length) return '';
    const hhmm = (t) => { const d = new Date(Number(t || 0)); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    let h = '<div class="gruppo"><h2>Cambio auto: il registro</h2><div class="card">';
    for (const ev of storia.slice(0, 4)) {
      h += '<div class="riga">' + (ev.stato === 'confermato' ? '✓ ' : '⏳ ')
        + esc(hhmm(ev.t)) + ' · ' + esc(String(ev.tipo || 'setcar').toUpperCase())
        + ' ' + esc(ev.nome || '?')
        + (ev.stato === 'confermato' ? ' — ' + esc(ev.msg || 'confermata') : ' — inviata, caccia alla conferma')
        + '</div>';
    }
    return h + '</div></div>';
  }

  function cardGara(g) {
    const st = STATI[g.stato] || STATI.bloccata;
    const meta = [
      g.track ? 'Pista: ' + esc(g.track) : null,
      g.auto ? 'Auto: ' + esc(g.auto) : null,
      g.ronda ? 'Ronda ' + esc(g.ronda) + '/' + esc(g.totalRonde) : null,
      g.griglia === 'multimarca' ? 'Multiclasse' : 'Monomarca',
    ].filter(Boolean).join(' · ');
    return '<div class="card"><div class="titolo">' + esc(g.nome) +
      ' <span class="stato ' + st[0] + '">' + st[1] + '</span></div>' +
      '<div class="riga">' + meta + '</div></div>';
  }

  function cardIscritta(i) {
    return '<div class="card"><div class="titolo">' + esc(i.nome) + '</div>' +
      '<div class="riga">' + [
        i.track ? 'Prossima pista: ' + esc(i.track) : null,
        i.prossimoGiorno != null ? 'Dal giorno ' + esc(i.prossimoGiorno) : null,
      ].filter(Boolean).join(' · ') + '</div></div>';
  }

  // LE NUOVE FONTI DEL SERVER (31/10, «integra maggiormente il cruscotto»):
  // la PROSSIMA ronda (prossimoApp, stesso campo delle card «gare di oggi»)
  // e la BACHECA del team (messaggi, tradotti dal server come la GUI).
  // Niente dati = niente gruppo: il pannello resta quello, mai un buco.
  function gruppoProssimo(p) {
    if (!p) return '';
    let h = '<div class="gruppo"><h2>Prossimo appuntamento</h2><div class="card">' +
      '<div class="titolo">Giorno ' + esc(p.giorno) + (p.quando ? ' — ' + esc(p.quando) : '') + '</div>';
    const piccole = (p.gare ?? []).map(function (g) {
      const meta = [
        g.track ? 'Pista: ' + esc(g.track) : null,
        g.auto ? 'Auto: ' + esc(g.auto) : null,
        g.giri ? esc(g.giri) + ' giri' : null,
        g.ora ? 'ore ' + esc(g.ora) : null,
        g.meteo ? esc(g.meteo) : null,
      ].filter(Boolean).join(' · ');
      return '<div class="riga">' + esc(g.nome) + (g.ronda ? ' — ronda ' + esc(g.ronda) : '') + (meta ? '<br>' + meta : '') + '</div>';
    }).join('');
    h += piccole || '<div class="riga">Nessuna gara in agenda.</div>';
    return h + '</div></div>';
  }
  function bloccoMessaggi(msg) {
    if (!msg || !msg.length) return '';
    const data = (at) => { const d = new Date(String(at || '')); return Number.isNaN(d.getTime()) ? '' : ' — ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
    return '<div class="gruppo"><h2>Dal team</h2>' +
      '<div class="card">' + msg.map(function (m) {
        return '<div class="riga">✉️ ' + esc(String(m.testo ?? '').slice(0, 140)) + esc(data(m.at)) + '</div>';
      }).join('') + '</div></div>';
  }

  function disegna() {
    const d = S.dati;
    let h = '<div class="sub" style="color:#9aa7b8;font-size:12px;margin-bottom:10px">';
    if (d.pilota?.nome) {
      h += esc(d.pilota.nome) + ' · ' + Math.round(d.pilota.saldo ?? 0).toLocaleString('it-IT') + ' cr · ' +
        Math.round(d.pilota.rep ?? 0) + ' rep';
    }
    if (d.giornoLabel) h += '<br>Giorno ' + esc(d.giornoLabel);
    h += '</div>';
    h += strisciaNota();
    // LA STORIA DEI COMANDI (31/10 «storia visibile in gioco»): sotto la
    // striscia nota — comandi e conferme del cambio auto, che il tooltip
    // diceva solo al pallino. Prima dei consigli: le alte sono i fatti
    // appena passati, i consigli il lavoro in corso.
    h += bloccoStoria();
    // I CONSIGLI (30/10): subito sotto la striscia nota — la cosa che in
    // gara serve ADESSO, prima delle card di carriera e dei bottoni.
    h += bloccoConsigli();
    h += bloccoAvvisi();

    // BOTTONI «Prepara e divertiti» (3/11): sopra tutto, la PRIMA cosa che
    // l'amico vede sul panello — ronda preparata, evento accettato (o la
    // gara al volo armata) quando lo sono. Ogni card è la STESSA sequenza
    // che il canale automatico fa da solo: il bottone è la via manuale,
    // per ripeterla o tirarla quando automatico non ha totale esito.
    h += bloccoBottoni();

    h += bloccoVerdetto();

    h += '<div class="gruppo"><h2>Gare di oggi</h2>';
    // la prima gara ISCRITTA viene prima di tutto (se c'è): è quella del comando
    const gare = (d.gare ?? []).slice();
    gare.sort(function (a, b) { return (b.isCorrente ? 1 : 0) - (a.isCorrente ? 1 : 0); });
    const vis = gare.slice(0, 5);
    if (gare.length) {
      h += vis.map(cardGara).join('');
      if (gare.length > 5) h += '<div class="vuoto">… e altre ' + (gare.length - 5) + ' gare oggi (nella GUI del browser)</div>';
    } else h += '<div class="vuoto">Nessuna gara in programma oggi.</div>';
    h += '</div>' + gruppoProssimo(d.prossimoApp) + '<div class="gruppo"><h2>Serie iscritta</h2>';
    const iscr = (d.iscritte ?? []).slice(0, 6);
    if (iscr.length) {
      h += iscr.map(cardIscritta).join('');
      if ((d.iscritte ?? []).length > 6) h += '<div class="vuoto">… e altre ' + ((d.iscritte ?? []).length - 6) + ' serie</div>';
    } else h += '<div class="vuoto">Nessuna serie iscritta.</div>';
    h += '</div>';
    h += bloccoMessaggi(d.messaggi);
    h += bloccoClassifica(d.classifica);
    h += bloccoMondo(d.mondo, d.guiUrl);
    inner.innerHTML = h;
    if (scorri) { try { scorri.fit?.(); } catch (_e) { } }
    aggiornaConn();
  }

  // ICONA CONNESSIONE (29/10 sera): il pallino in testa al pannello dice se
  // la corda server → loader → gioco è viva. Verde: tutto agganciato
  // (applet nel loader, persist del gioco raggiungibile per gli ack, motore
  // comandi presente, fascia fresca). Arancione: applet viva ma un anello
  // molle (il più comune: fasce ferme, il server webui non risponde). Rosso:
  // l'applet gira FUORI dal menu di EVO — non è nel loader. Il dettaglio si
  // legge nel tooltip fermandoci sopra (le righe, l'una per anello).
  function statoConnessione() {
    if (!LOADER) {
      return { emoji: '🔴', righe: ["L'applet gira FUORI dal menu di EVO: non è nel loader.", 'Le fasce e i comandi al gioco non partono da qui. Ricarica l\'app dal menu di EVO (drawer APPS → Cruscotto).'] };
    }
    const righe = ['Applet nel loader ✓'];
    let molli = 0;
    let storeOk = false;
    try { storeOk = !!(LOADER.persist && typeof LOADER.persist.storeLoaded === 'function' && LOADER.persist.storeLoaded()); } catch (_e) { }
    righe.push(storeOk ? 'persist del gioco ✓ (gli ack viaggiano)' : 'persist del gioco ✗ (gli ack non tornano: i comandi rischiano di ripartire)');
    if (!storeOk) molli++;
    const engineOk = !!(window.engine && typeof window.engine.trigger === 'function');
    righe.push(engineOk ? 'comandi al gioco ✓' : 'motore comandi ✗ (in pista: i comandi funzionano nel menu di EVO)');
    if (!engineOk) molli++;
    const eta = fasciaTs ? Date.now() - fasciaTs : -1;
    if (eta < 0) { righe.push('server: nessuna fascia ricevuta ancora'); molli++; }
    else if (eta >= 15 * 1000) {
      righe.push('server ✗ fasce ferme da ' + Math.round(eta / 1000) + " s — da GUI riavvia il server, o 'node tools/riavvia-webui.mjs'");
      molli++;
    } else righe.push('server ✓ (fascia di ' + Math.round(eta / 1000) + ' s fa)');
    // LA SINCRONIZZAZIONE (29/10 «arricchisci il semaforo»): la fascia porta
    // anche il dato «Prepara e Divertiti» visto dal server (cui campo
    // `prepara`, uiapp-pub) — ronda armata con la finestra del via o gara
    // al volo — insieme alla riga «nessuna» quando il campo è vuoto. La
    // sincro è una RIGA del tooltip, non un colore: la connessione resta
    // quella, la sincro dice se il server e la ronda viaggiano insieme.
    const pr = S.dati?.prepara;
    const hhmm = (ms) => { const d = new Date(Number(ms || 0)); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const resti = (ms) => Math.max(0, Math.round(Number(ms || 0) / 60000)) + ' min';
    if (pr) {
      righe.push(pr.tipo === 'ronda'
        ? ('sincro «Prepara e Divertiti» ✓ — ronda armata alle ' + hhmm(pr.armataAlle) +
          (Number(pr.viaFino) > Date.now() ? ', via automatico fino alle ' + hhmm(pr.viaFino) : ' (via automatico finito: resta il bottone del pannello)') +
          ' · ronda ancora valida ' + resti(pr.scadeIn))
        : ('sincro «Prepara e Divertiti» ✓ — gara al volo armata alle ' + hhmm(pr.armataAlle) + ' · ancora valida ' + resti(pr.scadeIn)));
    } else if (fasciaTs) righe.push('sincro «Prepara e Divertiti»: nessuna preparazione ora');
    // LA STORIA DEL COMANDO (31/10 «storia del comando nel tooltip»): ciò
    // che è passato per il menu dell'auto — comando uscito in fascia e/o
    // conferma tornata dal gioco — UNA riga a voce, più recente prima.
    // Memoria vuota = niente righe: il tooltip resta sereno.
    const storia = Array.isArray(S.dati?.storia) ? S.dati.storia : [];
    for (const ev of storia.slice(0, 4)) {
      righe.push('comando ' + hhmm(ev.t) + ' · ' + String(ev.tipo || 'setcar').toUpperCase() + ' ' + (ev.nome || '?') +
        (ev.stato === 'confermato' ? ' — ✓ ' + (ev.msg || 'confermata') : ' — inviata, caccia alla conferma'));
    }
    return { emoji: molli ? '🟠' : '🟢', righe: righe };
  }
  function aggiornaConn() {
    try {
      const s = statoConnessione();
      conn.textContent = s.emoji;
      conn.setAttribute('title', s.righe.join('\n'));
    } catch (_e) { }
  }

  // CONTO VIVO (4/11): tra le fasce la finestra continua a scorrere — un
  // ridisegno leggero ogni 30 s SOLO se esiste una preparazione viva (ronda
  // o gara al volo con finestra fresca): piste ferme non girano il ciclo.
  setInterval(function () {
    const az = azioni();
    const viva = (Number(az.ronda?.scadeIn) > 0) || (Number(az.demo?.scadeIn) > 0);
    if (viva) disegna();
    // AVVISO fascia ferma (4/11): anche a schede quiete il ridisegno va
    // avanti FINCHÉ l'avviso è in cruscotto — così l'età delle fasce scala
    // a secondi invece di piantarsi al primo superamento.
    if (!viva && fasciaTs && Date.now() - fasciaTs >= 15 * 1000) disegna();
  }, 30 * 1000);

  // IL PALLINO ETÀ VIVA: 1 s = l'età della fascia scala a secondi anche a
  // stagger quieti, e se appena qualcosa si spegne il colore cambia in fretta.
  setInterval(aggiornaConn, 1000);
  setInterval(function () { prendiSlot(Date.now()); }, PERIODO_MS / 2);
  prendiSlot(Date.now());
  loga('pannello inizializzato (pattern Paddock, niente pagina del loader)');
})();
