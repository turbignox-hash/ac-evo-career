// _layout-probe.mjs — LA SONDA DI LAYOUT CONDIVISA (3/11, richiesta Mauro:
// «estrai la sonda di layout in un modulo condiviso per riusarla su altre
// viste»).
//
// È il motore nato il 2/11 dentro layout-impostazioni.test.mjs e incartato:
// NESSUNA misura cambia, cambia solo dove vive. Tre pezzi:
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
//   3b) LA LEGGE «CONTENUTO IN CONTENUTO: SANO» — il filtro che tiene nel
//      conto SOLO i difetti veri. La pagina funziona a strati: i bottoni
//      contengono le loro icone, le label i loro campi, le righe i loro
//      pannelli. Se l'uno contiene l'altro, i due non si disegnano MAI
//      l'uno sopra l'altro — è il DOM che si racconta per costruzione,
//      non un colpo di layout male: e senza questa legge ogni figlio
//      dentro il padre verrebbe cacciato come sovrapposizione al primo
//      colpo (mai il verde delle 126 misure). Il scontro conta quindi
//      solo se NESSUNO dei due contiene l'altro — la guard in `scontro`
//      (`!dentro(A,B) && !dentro(B,A)`) e arriva un segnale SOLO per le
//      coppie che si sovrappongono SBORDANDO l'una dal rettangolo
//      dell'altra.
//      Non è una nota scritta a tavola: la PROVA A ROTTURA del 2/11 la
//      dimostra nelle DUE direzioni e la usa come seconda regola del
//      difetto finto — uno che SBORDA dal vicino viene beccato; uno del
//      tutto contenuto dentro la sua scatola NON deve scattare (a ragione:
//      è il sano). Per questo il blocco di prova del banco va messo a
//      cavallo del bordo del vicino, con l'area comune stretta su un lato
//      solo (6 px di altezza): regola 2 del replay del 3/11.
//
//   4) misuraPanelliFuoriViewport (2/11, richiesta Mauro: «terzo step
//      della guardia: fallisce se un pannello esce dalla viewport in
//      orizzontale») — i `.panel` di #main la cui scatola sborda oltre
//      i bordi della viewport (2 px di tolleranza come le
//      sovrapposizioni). Lo stesso spirito del RITAGLIO: se un antenato
//      del pannello ha overflow-x con clipping (auto/hidden/scroll),
//      la scatola visibile è LUI e la sbordatura non arriva alla
//      viewport — non si segnala. Panelli dentro details chiuse e
//      invisibili pure no.
// Il modulo non apre browser né server e non asserisce niente: chi chiama
// porta la pagina PRONTA (browser, server sulla sua porta, eventuale
// cartella dati copiata) e decide cosa fare dei risultati: la guardia di
// layout-impostazioni.test.mjs resta il primo cliente, i tab nuovi della
// GUI arrivano dopo col loro stesso flusso.

/* 1) CLICK + ARRIVO della vista: il marker è l'ID UNICO della vista
 * (Impostazioni #agg-status, Setup #setup-series-panel, Analisi #an-tetto, …) e
 * pannelli è il minimo che la vista aggiunge a terra (1 basta per la
 * maggior parte, Impostazioni vuole 3). */
export async function assettaVista(page, { id, marker, pannelli = 1, nascosto = false }) {
  // la fascia fissa (6/11) porta Impostazioni fuori da #nav: data-tab vale per entrambe
  if (nascosto) {
    // 3/11 — tab NASCOSTI (Calendario, Classifica Mondiale): nessun bottone
    // data-tab in nav (si aprono da annunci/tile dei vicini), quindi la sonda
    // usa la STESSA leva dei click vivi — `tab` è una variabile globale
    // condivisa degli script della GUI (viste-* fanno `tab = '…'; render()`)
    // e il render parte da lì. Il click nav tramite ?. resterebbe no-op e la
    // sonda misurerebbe la vista PRECEDENTE in silenzio: nascosto lo vieta.
    await page.evaluate((tabId) => { tab = tabId; render(); }, id);
  } else {
    await page.evaluate((tabId) => document.querySelector(`nav button[data-tab="${tabId}"]`)?.click(), id);
  }
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
    /* LEGGE «CONTENUTO IN CONTENUTO: SANO» (2/11, prova a rottura;
     * riprovata nel replay del 3/11 e nei morsi del banco a 1250/1920):
     * la coppia è difetto solo se si sovrappongono >2 px per lato SENZA
     * che l'uno contenga l'altro. Se l'uno sta TUTTO dentro l'altro la
     * pagina funziona — bottone con icona, label col campo, riga nel
     * pannello: sano, passa e la sonda resta muta. Il difetto finto del
     * banco conosce la regola: per DOVERE essere beccato va messo a
     * cavallo del bordo del vicino (un inject tutto dentro la sua scatola
     * non sborda e fa scattare a ragione il sano). Bordi che si toccano:
     * non è sopra l'uno nell'altro, non conta (i 2 px per lato). */
    const scontro = (A, B) => {
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      return (ox > 2 && oy > 2 && !dentro(A, B) && !dentro(B, A)) ? { ox, oy } : null;
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

/* 4) I PANNELLI CHE SBORDANO: i `.panel` di #main la cui scatola esce
 * dalla viewport (clientWidth = la larghezza VISIBILE, senza la barra
 * di scorrimento) a sinistra o a destra, oltre 2 px di tolleranza.
 * Ritorna le prime 10 con chi, dove e di quanto. */
export async function misuraPanelliFuoriViewport(page) {
  return page.evaluate(() => {
    const largh = document.documentElement.clientWidth;
    const catena = (el) => {
      const out = [];
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (a.id) out.push('#' + a.id);
        else if (typeof a.className === 'string' && a.className.trim()) out.push(a.tagName.toLowerCase() + '.' + a.className.trim().replace(/\s+/g, '.'));
        if (out.length >= 4) break;
      }
      return out.join(' < ') || '(senza antenati con id o classi)';
    };
    const fughe = [];
    for (const el of document.querySelectorAll('#main .panel')) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      const det = el.closest('details');
      if (det && !det.open && el !== det) continue;    // piegato: non è in vista
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // l'antenato col clipping orizzontale è LUI la scatola visibile:
      // che il pannello sbordi dentro la sua area scorrevole non tocca la viewport
      let taglio = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') { taglio = true; break; }
      }
      if (taglio) continue;
      if (r.left < -2 || r.right > largh + 2) {
        const id = el.id ? '#' + el.id : '';
        const h2 = el.querySelector('h2,h3')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '';
        fughe.push({ a: (id ? id + ' ' : '') + el.tagName.toLowerCase() + (h2 ? ` («${h2}»)` : ''),
          l: Math.round(r.left), r: Math.round(r.right), largh,
          pa: catena(el) });
      }
    }
    return fughe.slice(0, 10);
  });
}

/* La RIGA di report delle fughe: uno riga per pannello, col QUANTO
 * sborda (a destra o a sinistra) e la catena antenati come le sovrapposizioni. */
export function righeFughe(fughe) {
  return fughe.map((f) => {
    const verso = f.l < 0 ? `${-f.l} px a sinistra` : `${f.r - f.largh} px a destra`;
    return `  · ${f.a}  sborda ${verso} (viewport ${f.largh}px · scatola [${f.l} → ${f.r}])\n      ↳ ${f.pa}`;
  }).join('\n');
}
