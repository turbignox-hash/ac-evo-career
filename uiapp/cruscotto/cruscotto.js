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
    if (dati) { S.dati = dati; S.slot = slot; disegna(); }
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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

    h += '<div class="gruppo"><h2>Gare di oggi</h2>';
    h += (d.gare ?? []).length ? (d.gare ?? []).map(cardGara).join('') : '<div class="vuoto">Nessuna gara in programma oggi.</div>';
    h += '</div><div class="gruppo"><h2>Serie iscritta</h2>';
    h += (d.iscritte ?? []).length ? (d.iscritte ?? []).map(cardIscritta).join('') : '<div class="vuoto">Nessuna serie iscritta.</div>';
    h += '</div>';
    host.innerHTML = h;
  }

  setInterval(function () { prendiSlot(Date.now()); }, PERIODO_MS / 2);
  prendiSlot(Date.now());
})();
