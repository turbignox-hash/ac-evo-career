// _layout-probe.mjs — LA SONDA DI LAYOUT CONDIVISA (3/11, richiesta Mauro:
// «estrai la sonda di layout in un modulo condiviso per riusarla su altre
// viste»).
//
// È il motore nato il 2/11 dentro layout-impostazioni.test.mjs e incartato:
// NESSUNA misura cambia, cambia solo dove vive. Tre pezzi:
//
//   1) assettaVista — click via evaluate (lezione 3/11: il click di
//      Playwright su un nodo può atterrare sul bottone SBAGLIATO quando la
//      nav si ridisegna sotto il click) + attesa del MARCATORE della vista
//      (esiste SOLO in quella vista) + i due frame dopo l'assestamento dei
//      webfont;
//   2) gli arrivi asincroni: per le viste con riempimenti NOTI
//      (Impostazioni: agg-info, savebk, import-log) enumerati a mano; per
//      tutte le altre un'attesa GENERICA di stabilità della geometria
//      (due impressioni a 300 ms identiche, tetto 15 s);
//   3) misuraSovrapposizioni — il conto: due elementi misurabili che si
//      sovrappongono (+2 px per lato, senza che l'uno contenga l'altro),
//      con la lezione degli inline multiriga (360px/3/11: un <span> che va
//      a capo ha un rettangolo-UNIONE che ingoia la riga sopra — si
//      misurano le RIGHE vere con getClientRects).
//
// Il modulo non apre browser né server e non asserisce niente: chi chiama
// porta la pagina PRONTA (browser, server sulla sua porta, eventuale
// cartella dati copiata) e decide cosa fare dei risultati: la guardia di
// layout-impostazioni.test.mjs resta il primo cliente, i tab nuovi della
// GUI arrivano dopo col loro stesso flusso.

/* 1) CLICK + ARRIVO della vista: il marker è l'ID UNICO della vista
 * (Impostazioni #agg-status, Setup #psi-panel, Analisi #an-tetto, …) e
 * pannelli è il minimo che la vista aggiunge a terra (1 basta per la
 * maggior parte, Impostazioni vuole 3). */
export async function assettaVista(page, { id, marker, pannelli = 1 }) {
  await page.evaluate((tabId) => document.querySelector(`#nav button[data-tab="${tabId}"]`)?.click(), id);
  // niente skeleton E il marcatore: la vista SIA QUELLA
  await page.waitForFunction(({ marker, minimo }) => {
    const m = document.querySelector('#main');
    return m && !m.querySelector('.spin') && m.querySelectorAll('.panel').length >= minimo
      && m.querySelector(marker);
  }, { marker, minimo: pannelli }, { timeout: 15000 });
  // il LAYOUT si STABILIZZA prima della misura (lezione 3/11, la suite
  // rossa sotto carico): la vista disegnata non basta — i WEBFONT e il
  // reflow dell'attivazione del tab possono ancora muovere le righe.
  await page.evaluate(() =>
    (document.fonts?.ready ? document.fonts.ready : Promise.resolve())
      .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
}

/* 2a) RIEMPIMENTI NOTI (per ora solo Impostazioni): all'apertura il tab
 * si riempie ASINCRONO in tre punti che cambiano la geometria
 * (#agg-status «…» → testo, #savebk-out vuoto → banner, #import-log «…» →
 * voci); l'ordine degli arrivi è variabile, si aspettano TUTTI (o 10 s:
 * il server può restare corto — non indebolisce l'assert). */
export async function assettaRiempimentiImpostazioni(page) {
  await page.waitForFunction(() => {
    const agg = document.querySelector('#agg-status');
    const savebk = document.querySelector('#savebk-out');
    const plog = document.querySelector('#import-log');
    const atterrato = (el) => !!el && el.innerHTML.trim() !== '';
    return (!agg || (agg.textContent && !agg.textContent.includes('…')))
      && (!savebk || atterrato(savebk))
      && (!plog || (plog.innerHTML.trim() !== '' && !plog.textContent.includes('…')));
  }, null, { timeout: 10000 }).catch(() => { /* si misura comunque */ });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* 2b) STABILITÀ GENERICA: la vista si riempie pure in asincrono (linee del
 * banco A/B, tetto, autopsia, PSI…) con arrivi variabili — enumerarli
 * uno per uno è fragile, quindi vale la legge dei tetti dedicati letta
 * sulla GEOMETRIA: due impressioni a 300 ms identiche (rettangolo di ogni
 * nodo visibile di #main) = il layout ha smesso di muoversi. Tetto 15 s:
 * se continua a muoversi si misura comunque — rende la misura leggibile
 * al frame GIUSTO, non indebolisce l'assert. */
export async function assettaStabilitaGenerica(page) {
  await page.waitForFunction(() => new Promise((risolvi) => {
    const impressiona = () => [...document.querySelectorAll('#main *')].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + ',' + Math.round(r.height);
    }).join('|') + '#' + document.querySelectorAll('#main *').length;
    const prima = impressiona();
    setTimeout(() => risolvi(impressiona() === prima), 300);
  }), null, { timeout: 15000 }).catch(() => { /* si misura comunque */ });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/* 3) LA MISURA (nel browser, alla geometria reale) — gira DENTRO la pagina
 * via evaluate: deve restare autosufficiente, niente chiusure esterne.
 * Ritorna le prime 10 sovrapposizioni con chi-con-chi, coordinate e catena
 * antenati (lezione 3/11: l'errore deve dirsi già leggibile da solo). */
export async function misuraSovrapposizioni(page) {
  return page.evaluate(() => {
    const dentro = (o, i) => o.left <= i.left && o.right >= i.right && o.top <= i.top && o.bottom >= i.bottom;
    const visibile = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null;
      return r;
    };
    // LE FIGURE NON SI CONTENDONO LA PAGINA (3/11, primo morso della
    // Dashboard a 360px, prova sul vivo): i figli di un <svg> (path, circle,
    // rect…) sono TRATTI della stessa icona che si disegnano sovrapponendosi
    // per costruzione (kico/lico 13px dentro la scatola di 22px, flagart
    // decorativo dietro al testo con opacity .08) — i loro rettangoli non
    // sono box di layout e non hanno controparte da sovrapporre. Per lo
    // stesso spirito dei details chiusi e del ritaglio: non dato alla
    // lettura = non si misura (aria-hidden esclude dalla lettura).
    // il RITAGLIO (lezione 3/11, prova sul vivo a 1250px): i figli di un
    // contenitore con overflow (auto/hidden/scroll — per es. #import-log,
    // max-height 220px) sono disposti ANCHE oltre la sua box visibile (il
    // resto della lista sotto lo scorrimento) e getBoundingClientRect li
    // riporta FUORI dal contenitore: quei rect fittizi infiltravano le
    // sovrapposizioni con gli elementi sotto (bottone ⟂ voce nascosta).
    // Si salva il chi NON tocca la box del suo antenato scorrevole più
    // vicino — lo stesso spirito del salto per i details chiusi sopra:
    // non è in vista, non si misura.
    // (320px, 3/11, Campionati): c'è anche il caso PARZIALE: la riga nel
    // mezzo dello scorrimento TOCCA la box del suo contenitore ma la
    // sporge sotto (getBoundingClientRect è l'unione): la parte sotto
    // il bordo NON si disegna (il box la ritaglia) e l'elemento che sta
    // DOPO la scatola veniva contato come sovrapposizione fantasma. Il
    // rettangolo si MOZZA alla scatola del contenitore scorrevole più
    // vicino: si misura SOLO la parte disegnata davvero.
    const ritaglia = (a, c) => {
      if (!c) return a;
      const l = Math.max(a.left, c.left), t = Math.max(a.top, c.top);
      return { left: l, top: t, right: Math.min(a.right, c.right), bottom: Math.min(a.bottom, c.bottom),
        width: Math.min(a.right, c.right) - l, height: Math.min(a.bottom, c.bottom) - t };
    };
    // GLI INLINE MULTIRIGA NON SI MANGIANO (360px, 3/11): un <span> di
    // testo lungo VA A RIGA e il suo getBoundingClientRect è l'UNIONE delle
    // righe — a 360px ingoia la riga sopra (dove stanno il <b> con
    // l'etichetta e il tag di stato): sovrapposizione FANTASMA, senza
    // che si siano MAI disegnati insieme. Per gli inline si misurano le RIGHE vere
    // (getClientRects, tetto 64): il text flow non si sovrappone da solo;
    // gli elementi di blocco (flex/grid/absolute) restano col rect intero.
    const cand = [...document.querySelectorAll('#main *')].flatMap((el) => {
      const det = el.closest('details');
      if (det && !det.open) return [];                       // contenuti piegati: non sono in vista
      if (el.closest('svg') || el.closest('[aria-hidden="true"]')) return [];  // figure e cose escluse dalla lettura
      let r = visibile(el);
      if (!r) return [];
      // l'antenato con clipping (verticale o orizzontale): il contenuto che
      // sporge oltre la sua scatola NON si disegna, quindi si MOZZA — se
      // resta un rettangolo sotto i 2px qualcosa non era in vista affatto
      let contenitore = null;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const sa = getComputedStyle(a);
        if (sa.overflowY !== 'visible' || sa.overflowX !== 'visible') {
          contenitore = a.getBoundingClientRect();
          break;
        }
      }
      r = ritaglia(r, contenitore);
      if (r.width < 2 || r.height < 2) return [];

    // misurabili: foglie vere (testi, input) e interattivi chiari
    const scelto = !el.children.length || el.matches('button,select,input,label,summary,.kpi,.chip');
      if (!scelto) return [];
      // l'etichetta porta ANCHE tag+classi: le componenti senza id, con
      // placeholder/value vuoto (le <b> del registro, gli <h2>...), non si
      // segnalano più come «⟂ (vuoto)» — chi legge l'errore vede CHI è
      const taga = el.tagName.toLowerCase()
        + (typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().replace(/\s+/g, '.') : '');
      const eti = (el.id ? '#' + el.id + ' ' : '') + taga
        + (['button', 'summary', 'option'].includes(el.tagName.toLowerCase())
          ? (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
          : String(el.getAttribute('placeholder') ?? el.value ?? '').slice(0, 30));
      let rects = getComputedStyle(el).display === 'inline'
        ? [...el.getClientRects()].slice(0, 64).map((x) => ritaglia(x, contenitore))
        : [];
      rects = rects.filter((x) => x.width >= 2 && x.height >= 2);
      return [{ r, rects: rects.length ? rects : null, eti, el }];
    });
    // la catena antenati di ogni elemento della coppia (id e classi più
    // vicini): con solo tag+coordinate l'errore restava un enigma — ora
    // dice in QUALE pannello/cassetta nasce.
    const catena = (el) => {
      const out = [];
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (a.id) out.push('#' + a.id);
        else if (typeof a.className === 'string' && a.className.trim()) out.push(a.tagName.toLowerCase() + '.' + a.className.trim().replace(/\s+/g, '.'));
        if (out.length >= 4) break;
      }
      return out.join(' < ') || '(senza antenati con id o classi)';
    };
    const scontro = (A, B) => {
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      return (ox > 2 && oy > 2 && !dentro(A, B) && !dentro(B, A)) ? { ox, oy } : null;  // bordi che si toccano: non è sopra l'uno nell'altro; contenuto in contenuto: sano
    };
    const trovati = [];
    for (let i = 0; i < cand.length; i++) {
      for (let j = i + 1; j < cand.length; j++) {
        // (inline multiriga) si valutano le RIGHE vere; altrimenti l'unione allarga
        const righe = (c) => c.rects ?? [c.r];
        let tocco = null, ra = null, rb = null;
        for (const A of righe(cand[i])) {
          let fermato = false;
          for (const B of righe(cand[j])) {
            tocco = scontro(A, B);
            if (tocco) { ra = A; rb = B; fermato = true; break; }
          }
          if (fermato) break;
        }
        if (!tocco) continue;
        // l'errore porta ANCHE le coordinate: la zona si legge subito
        trovati.push({ a: cand[i].eti, b: cand[j].eti, w: Math.round(tocco.ox), h: Math.round(tocco.oy),
          ca: `[${Math.round(ra.left)},${Math.round(ra.top)} → ${Math.round(ra.right)},${Math.round(ra.bottom)}]`,
          cb: `[${Math.round(rb.left)},${Math.round(rb.top)} → ${Math.round(rb.right)},${Math.round(rb.bottom)}]`,
          pa: catena(cand[i].el), pb: catena(cand[j].el) });
      }
    }
    return trovati.slice(0, 10);
  });
}

/* La RIGA di report, identica a quella che la guardia stampava: da usare
 * nel messaggio dell'assert così i moduli nuovi non la reimprovvisa. */
export function righeReport(sovrapposizioni) {
  return sovrapposizioni.map((s) =>
    `  · ${s.a}  ⟂  ${s.b}   (aria in comune ${s.w}×${s.h} px)  ${s.ca} ⟂ ${s.cb}\n      ↳ ${s.pa}\n      ↳ ${s.pb}`).join('\n');
}
