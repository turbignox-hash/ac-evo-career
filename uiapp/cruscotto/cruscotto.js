// cruscotto.js — l'app «Cruscotto» in gioco (27/10/2026).
//
// Stesso schema di paddock.js: un colpo di lettura SOLO se il file è nuovo (slot
// nuovo, un ui-<slot>.json ogni 2.5s il publisher src/uiapp-pub.mjs lo scrive in
// questa cartella). Un XHR a un file statico, niente server da richiamare.
// Il gioco tiene in cache un'URL per nome: name nuovo = colpo rimasto pulito.
(function () {
  'use strict';
  const PERIODO_MS = 2500;   // lo stesso del publisher: se lo cambi, cambia là
  const S = { slot: -1, dati: null };

  function leggiJson(nome, cb) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', nome + '?t=' + Date.now(), true); // la coda cache col nome variabile
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status !== 200 && xhr.status !== 0) return cb(null); // 404: il publisher non ha ancora scritto l'ora?
        try { return cb(JSON.parse(xhr.responseText)); } catch (e) { return cb(null); }
      };
      xhr.send(null);
    } catch (e) { cb(null); }
  }

  /** Il file di QUESTA slot; se manca ancora, il publisher scrive il tick
   *  successivo: prova indietro di una fascia prima di mollare. */
  function prendiSlot(now) {
    const slot = Math.floor(now / PERIODO_MS);
    if (slot === S.slot) return;              // già letto in questa fascia
    leggiJson('ui-' + slot + '.json', function (main) {
      if (!main && slot > 0) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', 'ui-' + (slot - 1) + '.json?t=' + Date.now(), true);
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            let d = null;
            try { if (xhr.status === 200) d = JSON.parse(xhr.responseText); } catch (e) {}
            adotta(d, slot);
          };
          xhr.send(null);
          return;
        } catch (e) {}
      }
      adotta(main, slot);
    });
  }

  function adotta(dati, slot) {
    if (dati) { S.slot = slot; try { applicaComando(dati.comando); } catch (e) {} S.dati = dati; disegna(); }
  }

  // ------------------------------------------------------------------
  // COMANDI IN DIRETTA (28/10): la vetrina può portare un comando, la
  // prima voce è `setcar` — l'auto della gara del giorno, applicata in
  // DIRECT dentro il menu di EVO, senza riavvio. Di nuovo il punto è lo
  // stesso di paddock.js: `window.engine` con gli stessi comandi del menu
  // Single Player (OnUICommand); se engine non c'è, non si rompe niente:
  // l'auto resta alla via consueta (scritta a file, buona al prossimo avvio).
  const MODO_SINGLE = 'ClientCommandsMode_SINGLEPLAYER';
  const MODO_RACE_WEEKEND = 'GameModeType_RACE_WEEKEND';
  const OK_RISPOSTA = 'ClientCommandsResponse_OK';
  let ultimoComando = null;
  // RIPROVA (31/10): un comando FALLITO non muore al primo colpo — il menu
  // di EVO può stare in riscrittura (caricamento, modello non ancora in
  // lista). Il prossimo slot (2.5 s) riprova lo stesso id, fino a 8 volte;
  // riuscito o stancato, si smette. Riuscito: dimenticato (nuova preparazione
  // = id nuovo = eseguita di nuovo).
  const falliti = new Map();          // id -> tentativi fatti

  function okTesto(r) { return r && r.response === OK_RISPOSTA ? 'ok' : ((r && (r.response || r.error)) || '?'); }

  function giocoComando(tipo, corpo, tempo) {
    return new Promise(function (risolvi) {
      const eng = window.engine;
      if (!eng || typeof eng.trigger !== 'function') { return risolvi({ error: 'engine non disponibile' }); }
      const respName = String(tipo).replace('Request', 'Response');
      let chiuso = false;
      const ricevo = function (r) {
        if (chiuso) return; chiuso = true;
        setTimeout(function () { try { eng.off && eng.off(respName, ricevo); } catch (e) {} risolvi(r); }, 0);
      };
      try { eng.on && eng.on(respName, ricevo); } catch (e) { return risolvi({ error: String(e) }); }
      const corpo2 = Object.assign({}, corpo || {}, { __Type: tipo });
      setTimeout(function () {
        try { eng.trigger('OnUICommand', tipo, corpo2); } catch (e) { chiuso = true; risolvi({ error: String(e) }); }
      }, 250);
      setTimeout(function () {
        if (chiuso) return; chiuso = true;
        try { eng.off && eng.off(respName, ricevo); } catch (e) {}
        risolvi({ error: 'nessuna risposta a ' + tipo });
      }, tempo || 6000);
    });
  }

  // nome confrontabile: minuscolo, senza accenti, solo lettere e numeri (come in paddock.js)
  const ACCENTI = { 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
                    'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c' };
  function chiave(t) { return String(t || '').toLowerCase().replace(/[àáâäèéêëìíîïòóôöùúûüñç]/g, function (c) { return ACCENTI[c] || c; }).replace(/[^a-z0-9]/g, ''); }

  function trovaAuto(cars, nome) {
    const k = chiave(nome); if (!k) return null;
    for (let i = 0; i < cars.length; i++) { if (chiave(cars[i].display_name) === k) return cars[i]; }
    for (let i = 0; i < cars.length; i++) {
      const dn = chiave(cars[i].display_name);
      if (dn && (dn.indexOf(k) >= 0 || k.indexOf(dn) >= 0)) return cars[i];
    }
    const parole = String(nome).toLowerCase().split(/\s+/).map(chiave).filter(Boolean);
    let best = null;
    for (let i = 0; i < cars.length; i++) {
      const dn = chiave(cars[i].display_name);
      if (dn && parole.every(function (w) { return dn.indexOf(w) >= 0; }) && (!best || dn.length < chiave(best.display_name).length)) best = cars[i];
    }
    return best;
  }

  // la pista nell'elenco del gioco: nome uguale, poi uno contenuto nell'altro;
  // il layout del libro (TRACK_INFO) conta solo se il comando lo porta e gli
  // elementi della pista lo dicono («GP» contenuto in «GP Race» = match).
  function trovaPista(tracks, nome, layout) {
    const k = chiave(nome); if (!k) return null;
    const kl = chiave(layout);
    let scorta = null;
    for (let i = 0; i < tracks.length; i++) {
      const tn = chiave(tracks[i].name), tl = chiave(tracks[i].layout);
      if (!tn) continue;
      if (!(tn === k || tn.indexOf(k) >= 0 || k.indexOf(tn) >= 0)) continue; // altra pista
      if (!kl || !tl || tl === kl || tl.indexOf(kl) >= 0 || kl.indexOf(tl) >= 0) return tracks[i];
      scorta = scorta || tracks[i];   // stessa pista, altro layout: tenuta di riserva
    }
    return scorta;
  }

  // La SEQUENZA COMPLETA di Paddock (29/10, «resta la 75» in Coppa Golf):
  // nel menu di EVO l'auto appartiene al game type CARICATO — prima
  // SetGameType (RACE_WEEKEND), poi la pista della ronda nell'elenco del
  // gioco, e SOLO ALLA FINE Models + SetCurrentCar. L'ordine non era una
  // facoltà: senza il tipo di gara i due comandi auto parlavano col
  // contesto sbagliato e al weekend restava l'auto vecchia. La pista è
  // best effort (se il comando la porta): se non matcha si va pure
  // avanti con l'auto, che nel weekend su disco è quella di «Prepara tutto».
  async function corriSetcar(c) {
    const eng = window.engine;
    if (!eng || typeof eng.trigger !== 'function') { notaComando('engine non disponibile (pagina aperta fuori dal gioco?)'); return false; }
    const r1 = await giocoComando('GameModeSelectionClientRequestSetGameType', { mode: MODO_SINGLE, type: MODO_RACE_WEEKEND }, 8000);
    if (!r1 || r1.response !== OK_RISPOSTA) { notaComando('Race Weekend: ' + okTesto(r1)); return false; }
    if (c.pista) {
      const tl = await giocoComando('GameModeSelectionClientRequestTrackList', { mode: MODO_SINGLE }, 10000);
      const items = (tl && tl.track_item) || [];
      const pista = trovaPista(items, c.pista, c.layout);
      if (pista) {
        const r2 = await giocoComando('GameModeSelectionClientRequestSetTrack', { mode: MODO_SINGLE, track_item: pista }, 8000);
        if (!r2 || r2.response !== OK_RISPOSTA) { notaComando('Pista ' + (pista.name || c.pista) + ': ' + okTesto(r2)); return false; }
      }
    }
    const cl = await giocoComando('CarSelectionClientRequestModels', { mode: MODO_SINGLE, brand: '' }, 10000);
    if (!cl) { notaComando('Models: nessuna risposta dal menu di EVO'); return false; }
    const cars = (cl.car_model) || [];
    const car = trovaAuto(cars, c.nome);
    if (!car) { notaComando('Auto non trovata nel menu del gioco: ' + c.nome + ' (' + cars.length + ' in lista)'); return false; }
    const r3 = await giocoComando('CarSelectionClientRequestSetCurrentCar', { mode: MODO_SINGLE, model: car }, 8000);
    if (!r3 || r3.response !== OK_RISPOSTA) { notaComando(c.nome + ': ' + okTesto(r3)); return false; }
    notaComando('✓ ' + car.display_name + ' impostata nel menu di EVO, senza riavvio.');
    return true;
  }

  function applicaComando(c) {
    if (!c || !c.id || !c.nome) return;
    const tent = falliti.get(c.id) ?? 0;
    if (c.id === ultimoComando && tent === 0) return;  // già eseguito con successo
    if (tent >= 8) return;                             // stancato: il Prepara lo riprova con un id nuovo
    ultimoComando = c.id;
    Promise.resolve(corriSetcar(c)).then(function (ok) {
      if (ok) falliti.delete(c.id); else falliti.set(c.id, tent + 1);
    });
  }

  // il risultato del comando lo VEDI nel menu del gioco: banda in testa alla pagina (31/10)
  function notaComando(t) {
    try { window.__cruscottoNota = String(t); } catch (e) {}
  }
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
    for (const r of c.righe) {
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
    for (const r of m.top) {
      h += '<tr class="' + (r.tu ? 'tu' : '') + '"><td class="pos">' + esc(r.pos) + '</td><td>' + esc(r.nome) +
        (r.tu ? ' <span class="tu-tag">tu</span>' : '') + '</td><td class="punti">' + esc(r.skill) + '</td></tr>';
    }
    h += '</table>';
    if (guiUrl) {
      const u = String(guiUrl);
      h += '<div class="riga" style="margin-top:8px"><a class="apri-gui" href="javascript:void(0)" data-url="' + esc(u) + '">Mondiale completo ↗</a>' +
        '<span class="nota"> ' + esc(u) + '</span></div>';
    }
    return h + '</div></div>';
  }

  // Il pulsante «Mondiale completo»: in gioco cohtml può bloccare window.open,
  // perciò si prova anche external.openURL e comunque l'URL resta leggibile.
  document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest ? e.target.closest('a.apri-gui') : null;
    if (!a) return;
    e.preventDefault();
    const url = a.getAttribute('data-url') || (S.dati && S.dati.guiUrl) || null;
    if (!url) return;
    try { window.open(url, '_blank'); } catch (err) {}
    try { if (window.external && typeof window.external.openURL === 'function') window.external.openURL(url); } catch (err) {}
  });

  const STATI = {
    iscritto: ['iscritto', 'Iscritto'],
    disponibile: ['disponibile', 'Disponibile'],
    bloccata: ['bloccata', 'Bloccata'],
  };

  function cardGara(g) {
    const st = STATI[g.stato] || STATI.bloccata;
    const meta = [
      g.track ? 'Pista: ' + esc(g.track) : null,
      g.giri != null ? 'Giri: ' + esc(g.giri) : null,
      g.ora != null ? 'Ore: ' + String(g.ora).padStart(2, '0') + ':00' : null,
      g.meteo ? 'Meteo: ' + esc(g.meteo) : null,
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

  function disegna() {
    const d = S.dati;
    const host = document.getElementById('cruscotto');
    if (!d) { host.innerHTML = '<div class="vuoto">In attesa del cruscotto del server…</div>'; return; }
    let h = '<div class="testa"><h1>Cruscotto</h1><div class="sub">';
    if (d.pilota && d.pilota.nome) {
      h += esc(d.pilota.nome) + ' · ' + Math.round(d.pilota.saldo ?? 0).toLocaleString('it-IT') + ' cr · ' +
        Math.round(d.pilota.rep ?? 0) + ' rep';
    }
    if (d.giornoLabel) h += '<br>Giorno ' + esc(d.giornoLabel);
    h += '</div></div>';
    h += strisciaNota();

    h += '<div class="gruppo"><h2>Gare di oggi</h2>';
    h += (d.gare ?? []).length ? (d.gare ?? []).map(cardGara).join('') : '<div class="vuoto">Nessuna gara in programma oggi.</div>';
    h += '</div><div class="gruppo"><h2>Serie iscritta</h2>';
    h += (d.iscritte ?? []).length ? (d.iscritte ?? []).map(cardIscritta).join('') : '<div class="vuoto">Nessuna serie iscritta.</div>';
    h += '</div>';
    // niente blocco se la statistica non c'è (schema: nascondi, non mostrare vuoto)
    h += bloccoClassifica(d.classifica);
    h += bloccoMondo(d.mondo, d.guiUrl);
    host.innerHTML = h;
  }

  setInterval(function () { prendiSlot(Date.now()); }, PERIODO_MS / 2);
  prendiSlot(Date.now());
})();
