// test/live-monitor-riepilogo.test.mjs — righe del monitor e riepilogo di fine
// sessione su righe SINTETICHE con valori noti: i giri chiusi si riconoscono
// dall'incremento di lapsDone, il tempo è il lastLapMs di quel tick, e i dati
// di contatto sono medie/massimi sulle sole righe live della sessione.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rigaMonitor, rigaDaRegistrazione, unisciSessioni, riassumiMonitor, formattaRiassunto, fmtGiro, riepiloghiMonitor } from '../src/live-monitor-riepilogo.mjs';

/** Snapshot finto di /api/live con contatto noto. */
function snap({ live = true, done = 0, last = null, best = null, cur = null, load = null, susp = null, slip = null } = {}) {
  return {
    game: true, live,
    session: { type: 'Race', track: 'Laguna Seca' },
    player: {
      position: 3, lapsDone: done, lapsTotal: 5, currentLapMs: cur, lastLapMs: last, bestLapMs: best,
      speedKmh: 120, gear: 4, fuel: 20, tcActive: true, absActive: false,
      brakeTempC: [300, 310, 200, 210],
      contact: {
        ffb: 0.4,
        vibration: { road: 0.02, kerb: 0.01, slip: 0.03, abs: 0 },
        wheelLoadN: load ?? [4000, 4000, 3000, 3000],
        suspensionM: susp ?? [0.04, 0.04, 0.05, 0.05],
        slipAngleRad: slip ?? [0.1, -0.1, 0.05, -0.05],
        slipRatio: [0.2, -0.2, 0.1, -0.1],
      },
    },
  };
}

const riga = (at, o) => ({ ...rigaMonitor(snap(o), at) });

test('la riga porta giri, tempi e contatto per ruota', () => {
  const l = riga('2026-11-06T10:00:00.000Z', { done: 2, last: 91_000, best: 89_500, cur: 40_000 });
  assert.equal(l.lap, 2);
  assert.equal(l.lapsDone, 2);
  assert.equal(l.lastLapMs, 91_000);
  assert.equal(l.lapMs, 40_000);
  assert.deepEqual(l.load, [4000, 4000, 3000, 3000]);
  assert.equal(l.susp[0], 0.04);
  assert.deepEqual(l.slipDeg, [5.73, -5.73, 2.86, -2.86]);
  assert.deepEqual(l.brakeC, [300, 310, 200, 210]);
});

test('un solo giro per incremento di lapsDone, con il suo tempo', () => {
  const s = riassumiMonitor([
    riga('2026-11-06T10:00:00.000Z', { done: 0, cur: 1000 }),
    riga('2026-11-06T10:00:05.000Z', { done: 0, cur: 6000 }),
    riga('2026-11-06T10:00:10.000Z', { done: 1, last: 95_000, best: 95_000, cur: 500 }),
    // stesso giro chiuso ancora visibile al tick dopo: non va contato due volte
    riga('2026-11-06T10:00:15.000Z', { done: 1, last: 95_000, best: 95_000, cur: 5500 }),
    riga('2026-11-06T10:00:20.000Z', { done: 2, last: 90_000, best: 90_000, cur: 500 }),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].giri.length, 2);
  assert.deepEqual(s[0].giri, [{ giro: 1, ms: 95_000 }, { giro: 2, ms: 90_000 }]);
  assert.equal(s[0].miglioreMs, 90_000);
  assert.equal(s[0].mediaMs, 92_500);
  assert.equal(s[0].track, 'Laguna Seca');
});

test('sessione chiusa dal primo tick non-live; la successiva è separata', () => {
  const a = riga('2026-11-06T10:00:00.000Z', { done: 1, last: 100_000 });
  const finita = riga('2026-11-06T10:00:05.000Z', {}); finita.live = false;
  const b = riga('2026-11-06T11:00:00.000Z', { done: 2, last: 88_000 });
  const s = riassumiMonitor([a, finita, b]);
  assert.equal(s.length, 2);
  assert.equal(s[0].giri.length, 1);
  assert.equal(s[1].giri.length, 1);
  assert.equal(s[1].giri[0].giro, 2);
});

test('contatto: massimi e medie per ruota sui soli campioni live', () => {
  const s = riassumiMonitor([
    riga('2026-11-06T10:00:00.000Z', { done: 0, load: [4000, 4000, 3000, 3000], susp: [0.04, 0.04, 0.05, 0.05], slip: [0.1, -0.1, 0.05, -0.05] }),
    riga('2026-11-06T10:00:05.000Z', { done: 0, load: [6000, 2000, 1000, 5000], susp: [0.02, 0.06, 0.07, 0.03], slip: [-0.2, 0.2, 0.01, -0.01] }),
  ]);
  const lf = s[0].contatto.ruote[0];
  assert.equal(lf.caricoMaxN, 6000);
  assert.equal(lf.caricoMedioN, 5000);
  assert.equal(lf.suspMinMm, 20);
  assert.equal(lf.suspMediaMm, 30);
  assert.equal(lf.derivaMaxDeg, 11.5);
  assert.equal(lf.slipMaxAbs, 0.2);
  assert.equal(lf.frenoMaxC, 300);
  assert.equal(s[0].contatto.campioni, 2);
  assert.equal(s[0].contatto.vibrazioni.road.medio, 0.02);
  assert.equal(s[0].contatto.ffb.massimo, 0.4);
});

test('log vecchio senza tempi né contatto: lo dice, non inventa zeri', () => {
  const vecchio = [
    { at: '2026-11-06T17:02:13.510Z', game: true, live: true, session: 'Race', track: 'Laguna Seca', pos: 5, lap: 3, laps: 3 },
    { at: '2026-11-06T17:02:18.557Z', game: true, live: true, session: 'Race', track: 'Laguna Seca', pos: 5, lap: 3, laps: 3 },
  ];
  const s = riassumiMonitor(vecchio);
  assert.equal(s[0].giriConTempo, 0);
  assert.equal(s[0].miglioreMs, null);
  assert.equal(s[0].contatto.ruote[0].caricoMedioN, null);
  const t = formattaRiassunto(s);
  assert.match(t, /non contiene tempi di giro/);
  assert.match(t, /Contatto: nessun dato nel log/);
});

test('formattaRiassunto elenca i giri e il tempo leggibile', () => {
  assert.equal(fmtGiro(95_000), '1:35.000');
  assert.equal(fmtGiro(null), '—');
  const s = riassumiMonitor([
    riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000, best: 95_000 }),
  ]);
  const t = formattaRiassunto(s);
  assert.match(t, /Laguna Seca/);
  assert.match(t, /#1 1:35\.000/);
  assert.match(t, /LF: carico max 4000 N/);
});

test('chiusa: vera se il log torna non-live, falsa se il file finisce con la sessione aperta', () => {
  const finita = riga('2026-11-06T10:00:05.000Z', {});
  finita.live = false;
  const chiusa = riassumiMonitor([
    riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000 }),
    finita,
  ]);
  assert.equal(chiusa[0].chiusa, true, 'due tick dopo la fine: sessione chiusa');
  const aperta = riassumiMonitor([riga('2026-11-06T11:00:00.000Z', { done: 1, last: 95_000 })]);
  assert.equal(aperta[0].chiusa, false, 'il file termina mentre la sessione è ancora live');
  // il flag viaggia fino alla scheda, insieme al testo
  const r = riepiloghiMonitor([
    riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000 }),
    finita,
  ]);
  assert.equal(r.sessioni.at(-1).chiusa, true);
});

test('riepiloghiMonitor: ultime N sessioni in ordine, con il testo pronto per la scheda', () => {
  const finita = riga('2026-11-06T10:00:05.000Z', {});
  finita.live = false;
  const righe = [
    riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000, best: 95_000 }),
    finita,
    riga('2026-11-06T11:00:00.000Z', { done: 2, last: 88_000, best: 88_000 }),
  ];
  const sola = riepiloghiMonitor(righe, { ultime: 1 });
  assert.equal(sola.totale, 2, 'il log contiene due sessioni');
  assert.equal(sola.sessioni.length, 1, 'se ne mostra una');
  assert.equal(sola.sessioni[0].giriFatti, 1);
  assert.match(sola.sessioni[0].testo, /Laguna Seca/, 'il testo è già composto dalla stessa funzione del monitor');
  const tutte = riepiloghiMonitor(righe);
  assert.equal(tutte.sessioni.length, 2);
  assert.match(tutte.sessioni[0].testo, /#1 1:35\.000/, 'la prima sessione resta la prima');
  assert.match(tutte.testo, /#2 1:28\.000/);
  const vuoto = riepiloghiMonitor('');
  assert.equal(vuoto.totale, 0);
  assert.equal(vuoto.testo, null, 'senza sessioni niente testo da copiare');
});

test('righe rotte saltate, nessuna eccezione', () => {
  const s = riassumiMonitor('{"live":true,"at":"2026-11-06T10:00:00.000Z","lapsDone":1,"lastLapMs":90000}\nnon json\n');
  assert.equal(s.length, 1);
  assert.equal(s[0].giri[0].ms, 90_000);
  assert.equal(formattaRiassunto([]), 'Nessuna sessione con dati live nel log: niente da riepilogare.');
});

test('sessione lunghissima: 200.000 campioni senza sfondare lo stack', () => {
  // PRIMA del 6/11 il riepilogo faceva `Math.max(...contatto.load[i])`: su una
  // sessione lunga l'array diventava un numero di ARGOMENTI e lo stack saltava
  // («Maximum call stack size exceeded»), cioè la scheda restava vuota.
  const carico = [4000, 4000, 3000, 3000];
  const sosp = [0.04, 0.04, 0.05, 0.05];
  const at = '2026-11-06T10:00:00.000Z';
  const righe = [];
  for (let i = 0; i < 200_000; i++) {
    righe.push({
      at, live: true, session: 'Race', track: 'Monza', pos: 3, speed: 200, lapsDone: 0,
      load: carico, susp: sosp, slipDeg: [5.73, -5.73, 2.86, -2.86],
      slipRatio: [0.2, -0.2, 0.1, -0.1], brakeC: [300, 310, 200, 210],
      vibRoad: 0.02, ffb: 0.4,
    });
  }
  const s = riassumiMonitor(righe);
  assert.equal(s.length, 1);
  assert.equal(s[0].righe, 200_000);
  assert.equal(s[0].contatto.campioni, 200_000);
  assert.equal(s[0].contatto.ruote[0].caricoMaxN, 4000);
  assert.equal(s[0].contatto.ruote[0].caricoMedioN, 4000);
  assert.equal(s[0].contatto.ffb.massimo, 0.4);
});

/* ---------------------------------------------------------------------------
 * L'ORACOLO: il riepilogo com'era PRIMA del 6/11 (array grezzi, medie a fine
 * sessione), tenuto qui solo per confronto. Se l'accumulatore a statistiche
 * correnti cambia un numero — un massimo, una media, un arrotondamento, un
 * campo mancante — il confronto lo dice. Non è codice di produzione.
 * ------------------------------------------------------------------------- */
function riepilogoVecchio(righe) {
  const RUOTE = ['LF', 'RF', 'LR', 'RR'];
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const arr4 = (v) => (Array.isArray(v) ? Array.from({ length: 4 }, (_, i) => num(v[i])) : null);
  const media = (vals) => {
    const v = vals.filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const r = (v, k = 10) => (v == null ? null : Math.round(v * k) / k);
  const max = (a) => a.reduce((m, v) => Math.max(m, v), -Infinity);
  const min = (a) => a.reduce((m, v) => Math.min(m, v), Infinity);

  const vuoto = () => ({
    righe: 0,
    load: RUOTE.map(() => []), susp: RUOTE.map(() => []), slipDeg: RUOTE.map(() => []), slipRatio: RUOTE.map(() => []),
    vib: { road: [], kerb: [], slip: [], abs: [] }, ffb: [], frenoC: RUOTE.map(() => []),
  });
  const aggiungiContatto = (acc, l) => {
    const campi = [['load', 'load'], ['susp', 'susp'], ['slipDeg', 'slipDeg'], ['slipRatio', 'slipRatio'], ['brakeC', 'frenoC']];
    let toccato = false;
    for (const [src, dst] of campi) {
      const a = arr4(l[src]);
      if (!a) continue;
      for (let i = 0; i < 4; i++) if (a[i] != null) { acc[dst][i].push(a[i]); toccato = true; }
    }
    for (const k of ['road', 'kerb', 'slip', 'abs']) {
      const v = num(l[k === 'road' ? 'vibRoad' : k === 'kerb' ? 'vibKerb' : k === 'slip' ? 'vibSlip' : 'vibAbs']);
      if (v != null) { acc.vib[k].push(v); toccato = true; }
    }
    if (num(l.ffb) != null) { acc.ffb.push(num(l.ffb)); toccato = true; }
    if (toccato) acc.righe += 1;
  };
  const fine = (s) => {
    const giri = [...s.giri.values()].sort((a, b) => a.giro - b.giro);
    const tempi = giri.map((g) => g.ms).filter((v) => v != null && v > 0);
    const c = s.contatto;
    const perRuota = RUOTE.map((w, i) => ({
      ruota: w,
      caricoMaxN: c.load[i].length ? max(c.load[i]) : null,
      caricoMedioN: r(media(c.load[i]), 1),
      suspMinMm: c.susp[i].length ? r(min(c.susp[i]) * 1000, 1) : null,
      suspMediaMm: c.susp[i].length ? r(media(c.susp[i]) * 1000, 1) : null,
      derivaMaxDeg: c.slipDeg[i].length ? r(max(c.slipDeg[i].map(Math.abs)), 10) : null,
      slipMaxAbs: c.slipRatio[i].length ? r(max(c.slipRatio[i].map(Math.abs)), 1000) : null,
      frenoMaxC: c.frenoC[i].length ? Math.round(max(c.frenoC[i])) : null,
      campioni: c.slipDeg[i].length || c.load[i].length || 0,
    }));
    const vib = {};
    for (const k of ['road', 'kerb', 'slip', 'abs']) {
      vib[k] = c.vib[k].length
        ? { medio: r(media(c.vib[k]), 1000), massimo: r(max(c.vib[k].map(Math.abs)), 1000) }
        : null;
    }
    return {
      track: s.track, tipo: s.tipo, inizio: s.inizio, fine: s.fine,
      durataMin: (s.inizio && s.fine) ? Math.round((Date.parse(s.fine) - Date.parse(s.inizio)) / 6000) / 10 : null,
      righe: s.righe,
      giriFatti: giri.length,
      giri: giri.map((g) => ({ giro: g.giro, ms: g.ms })),
      giriConTempo: tempi.length,
      miglioreMs: tempi.length ? min(tempi) : s.bestMs,
      mediaMs: tempi.length ? Math.round(media(tempi)) : null,
      posizione: s.pos.length ? { migliore: min(s.pos), peggiore: max(s.pos) } : null,
      velocitaMax: s.vel.length ? Math.round(max(s.vel)) : null,
      contatto: {
        campioni: c.righe,
        ruote: perRuota,
        vibrazioni: vib,
        ffb: c.ffb.length ? { minimo: r(min(c.ffb), 1000), massimo: r(max(c.ffb), 1000) } : null,
      },
    };
  };

  const sessioni = [];
  let cur = null;
  const chiudi = (chiusa) => {
    if (!cur) return;
    if (cur.righe > 0) {
      const s = fine(cur);
      s.chiusa = !!chiusa;
      sessioni.push(s);
    }
    cur = null;
  };
  for (const l of righe) {
    if (l?.live) {
      if (!cur) {
        cur = {
          inizio: l.at ?? null, fine: l.at ?? null, track: l.track ?? null, tipo: l.session ?? null,
          righe: 0, pos: [], vel: [], giri: new Map(), bestMs: null, contatto: vuoto(),
        };
      }
      cur.fine = l.at ?? cur.fine;
      cur.track = l.track ?? cur.track;
      cur.tipo = l.session ?? cur.tipo;
      cur.righe += 1;
      if (num(l.pos) != null) cur.pos.push(num(l.pos));
      if (num(l.speed) != null) cur.vel.push(num(l.speed));
      if (num(l.bestLapMs) > 0) cur.bestMs = cur.bestMs == null ? num(l.bestLapMs) : Math.min(cur.bestMs, num(l.bestLapMs));
      aggiungiContatto(cur.contatto, l);
      // ORACOLO allineato al 7/11: per il giro N vince l'ULTIMO `lastLapMs`
      // dello stato lapsDone = N (il gioco lo scrive con qualche tick di
      // ritardo sul cambio giro: il primo valore è quello del giro prima).
      const done = num(l.lapsDone);
      if (done != null && done >= 1 && num(l.lastLapMs) > 0) {
        cur.giri.set(done, { giro: done, ms: num(l.lastLapMs) });
      } else if (done != null && done >= 1 && !cur.giri.has(done)) {
        cur.giri.set(done, { giro: done, ms: null });
      }
    } else if (cur) {
      chiudi(true);
    }
  }
  chiudi(false);
  return sessioni;
}

test("l'accumulatore dà GLI STESSI numeri del riepilogo vecchio (oracolo, sessioni a caso)", () => {
  // generatore deterministico: niente test che passa o fallisce a caso
  let seme = 20261106;
  const rnd = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
  const caso = (n) => Math.floor(rnd() * n);
  const righe = [];
  const t0 = Date.parse('2026-11-06T09:00:00.000Z');
  let done = 0;
  let giro = 0;
  for (let i = 0; i < 400; i++) {
    const vivo = rnd() > 0.08;                     // ogni tanto il log torna non-live
    const conContatto = rnd() > 0.15;
    if (vivo && rnd() > 0.6) done += 1;            // un giro chiuso ogni tanto
    if (vivo && rnd() > 0.85) giro += 1;           // ...e ogni tanto un giro senza tempo
    const snap = {
      game: true, live: vivo,
      session: { type: ['Race', 'Practice', 'TimeAttack'][caso(3)], track: ['Monza', 'Imola', 'Suzuka'][caso(3)] },
      player: {
        position: 1 + caso(12), lapsDone: done, speedKmh: 80 + caso(160),
        bestLapMs: rnd() > 0.4 ? 88_000 + caso(3000) : null,
        lastLapMs: vivo && rnd() > 0.35 ? 87_000 + caso(5000) : null,
        brakeTempC: conContatto ? [200 + caso(400), 200 + caso(400), 150 + caso(400), 150 + caso(400)] : null,
        contact: conContatto ? {
          ffb: rnd(), vibration: { road: rnd() / 50, kerb: rnd() / 50, slip: rnd() / 50, abs: rnd() / 100 },
          wheelLoadN: [1000 + caso(6000), 1000 + caso(6000), 1000 + caso(6000), 1000 + caso(6000)],
          suspensionM: [0.01 + rnd() / 20, 0.01 + rnd() / 20, 0.01 + rnd() / 20, 0.01 + rnd() / 20],
          slipAngleRad: [-0.3 + rnd() * 0.6, -0.3 + rnd() * 0.6, -0.3 + rnd() * 0.6, -0.3 + rnd() * 0.6],
          slipRatio: [-0.5 + rnd(), -0.5 + rnd(), -0.5 + rnd(), -0.5 + rnd()],
        } : null,
      },
    };
    const l = rigaMonitor(snap, new Date(t0 + i * 5000).toISOString());
    if (vivo && giro > done) l.lapsDone = giro;     // giro chiuso ma senza tempo nel log
    righe.push(l);
  }
  const nuovo = riassumiMonitor(righe);
  const vecchio = riepilogoVecchio(righe);
  assert.ok(nuovo.length >= 2, `il corpus deve avere più sessioni (ne ha ${nuovo.length})`);
  assert.deepEqual(nuovo, vecchio, 'accumulatore e vecchio algoritmo devono dare lo stesso riepilogo');
  assert.deepEqual(JSON.stringify(nuovo), JSON.stringify(vecchio), "anche l'ordine dei campi resta quello");
});
/* IL TESTO COMPOSTO UNA VOLTA SOLA (6/11). Il riepilogo della scheda si ricalcola
   a ogni poll: prima riformattava anche le sessioni chiuse, che non possono più
   cambiare. Questi test difendono le due cose che rendono sicura la scorciatoia —
   il testo unico resta IDENTICO a quello di sempre, e a ricalcolarsi è solo la
   sessione ancora aperta. */
import { creaAccumulatoreRiepiloghi, riepiloghiDa } from '../src/live-monitor-riepilogo.mjs';

test('riepiloghiDa: il testo unico è la stessa giunzione dei testi per sessione', () => {
  const finita = riga('2026-11-06T10:00:05.000Z', {});
  finita.live = false;
  const righe = [
    riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000, best: 95_000 }),
    finita,
    riga('2026-11-06T11:00:00.000Z', { done: 2, last: 88_000, best: 88_000 }),
    finita,
  ];
  const r = riepiloghiDa(riassumiMonitor(righe));
  assert.equal(r.sessioni.length, 2);
  assert.equal(r.testo, r.sessioni.map((s) => s.testo).join('\n'), 'la scheda deve ricevere gli stessi caratteri di prima');
  assert.equal(r.testo, formattaRiassunto(riassumiMonitor(righe)), 'e identici al formattatore completo');
});

test('riepiloghiDa: la sessione CHIUSA non si ricompone al poll dopo', () => {
  const acc = creaAccumulatoreRiepiloghi();
  acc.aggiungi(riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000 }));
  acc.aggiungi({ at: '2026-11-06T10:00:05.000Z', live: false }); // chiusura
  const chiuse = acc.risultato();
  const prima = riepiloghiDa(chiuse).sessioni[0].testo;
  // le sessioni chiuse sono trattate come immutabili: se il testo venisse
  // rifatto, questa modifica comparirebbe. Non deve comparire.
  chiuse[0].contatto.campioni = 99_999;
  chiuse[0].track = 'Pista Inventata';
  const dopo = riepiloghiDa(chiuse).sessioni[0].testo;
  assert.equal(dopo, prima, 'il testo di una sessione chiusa si compone una volta sola');
  assert.match(dopo, /Laguna Seca/);
});

test('riepiloghiDa: la sessione APERTA si ricompone a ogni riga nuova', () => {
  const acc = creaAccumulatoreRiepiloghi();
  acc.aggiungi(riga('2026-11-06T10:00:00.000Z', { done: 1, last: 95_000 }));
  const prima = riepiloghiDa(acc.risultato()).sessioni[0].testo;
  acc.aggiungi(riga('2026-11-06T10:00:05.000Z', { done: 2, last: 90_000 }));
  const dopo = riepiloghiDa(acc.risultato()).sessioni[0].testo;
  assert.notEqual(dopo, prima, 'una sessione aperta cresce: il suo testo deve seguirla');
  assert.match(prima, /1 giri chiusi/);
  assert.match(dopo, /2 giri chiusi/);
  assert.equal(acc.risultato()[0].chiusa, false, 'e resta dichiarata aperta');
});

/* 7/11 — LE DUE FONTI. La scheda «Riepilogo di fine sessione» leggeva solo
   `.live-monitor.log` e chiamava «ultima sessione» l'ultima DEL MONITOR: la
   gara di Donington delle 22:52 del 6/11 stava solo nella registrazione del
   registratore (`data/live-*.ndjson`) e la scheda mostrava Suzuka delle 18:07.
   Qui si pesano le due regole nuove: il record di registrazione diventa la
   stessa riga del monitor, e l'unione delle fonti non inventa doppioni. */
test('un record di registrazione diventa la riga del monitor (stessa porta, un solo modo di leggere)', () => {
  const rec = { t: '2026-11-06T22:52:11.989Z', ts: 1, snapshot: snap({ done: 3, last: 91_500, best: 90_000 }) };
  const l = rigaDaRegistrazione(rec);
  assert.equal(l.at, '2026-11-06T22:52:11.989Z');
  assert.equal(l.live, true);
  assert.equal(l.session, 'Race');
  assert.equal(l.track, 'Laguna Seca');
  assert.equal(l.lapsDone, 3);
  assert.equal(l.lastLapMs, 91_500);
  // fetch fallita a monte: niente snapshot, niente riga — chi legge la salta
  assert.equal(rigaDaRegistrazione({ t: '2026-11-06T22:52:12.000Z', error: 'fetch failed' }), null);
  assert.equal(rigaDaRegistrazione(null), null);
});

test('unisciSessioni: doppioni fusi (resta la più ricca) e ordine per fine', () => {
  const s = (tipo, track, inizio, fine, righe) => ({ tipo, track, inizio, fine, righe });
  const monitor = [
    s('TimeAttack', 'Suzuka', '2026-11-06T17:07:33.902Z', '2026-11-06T17:07:50.529Z', 4),
    s('TimeAttack', 'Donington Park', '2026-11-06T22:52:11.989Z', '2026-11-06T22:58:21.937Z', 300),
  ];
  // stessa gara vista dal registratore: inizio a 8 s di distanza, più campioni
  const registrazione = [
    s('TimeAttack', 'Donington Park', '2026-11-06T22:52:20.000Z', '2026-11-06T22:58:21.937Z', 420),
  ];
  const unite = unisciSessioni(monitor, registrazione);
  assert.equal(unite.length, 2, 'la stessa pista+tipo a 8 s di distanza è UNA sessione');
  assert.equal(unite[1].righe, 420, 'del doppione resta la sessione con più campioni');
  assert.equal(unite[1].fine, '2026-11-06T22:58:21.937Z');
  assert.equal(unite[0].track, 'Suzuka', 'ordine cronologico: l’ultima in fondo');
  // una gara vera di tre ore dopo NON è un doppione
  const tarda = [s('TimeAttack', 'Suzuka', '2026-11-07T09:00:00.000Z', '2026-11-07T09:10:00.000Z', 9)];
  assert.equal(unisciSessioni(monitor, tarda).length, 3);
  // liste vuote/rotte non fanno rumore
  assert.deepEqual(unisciSessioni([], null, undefined), []);
});

/* 7/11 — IL GIRO SI PRENDE QUANDO IL GIOCO L'HA SCRITTO. Misurato sugli
   stessi dati della gara di Donington (6/11): `lastLapMs` è ancora quello del
   giro prima nel tick di passaggio, e si aggiorna uno o due tick dopo. Con il
   primo valore il riepilogo dava #1 e #2 a 1:58.794; ora vince l'ultimo valore
   dello stato lapsDone = N. */
test('il tempo del giro è l’ultimo dello stato, non il valore stantio del passaggio', () => {
  const s = riassumiMonitor([
    // giro 1 chiuso: qui il gioco non ha ancora scritto il tempo (null)…
    riga('2026-11-06T22:54:24.174Z', { done: 1, last: null }),
    // …poi lo scrive, mentre si percorre il giro 2 (lapsDone resta 1)
    riga('2026-11-06T22:54:30.000Z', { done: 1, last: 118_794 }),
    riga('2026-11-06T22:55:00.000Z', { done: 1, last: 118_794 }),
    // giro 2 chiuso: il primo valore è ANCORA quello del giro 1 (ritardo del gioco)
    riga('2026-11-06T22:56:15.201Z', { done: 2, last: 118_794 }),
    riga('2026-11-06T22:56:20.000Z', { done: 2, last: 109_371 }),
    // giro 3 chiuso e già aggiornato
    riga('2026-11-06T22:58:05.502Z', { done: 3, last: 108_693 }),
  ]);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].giri.map((g) => g.ms), [118_794, 109_371, 108_693], 'tre tempi distinti');
  assert.equal(s[0].giriConTempo, 3);
  assert.equal(s[0].miglioreMs, 108_693);
});

/* 7/11 — LA SCHEDA DICE «GARA» QUANDO LA SESSIONE È STATA DICHIARATA GARA.
   Il tipo del blocco STATIC scrive «TimeAttack» anche in gara: la carta prende
   la dichiarazione vista nei campioni (`session.race`, che la carriera rende
   vera al server quando è lei ad aver preparato la gara). Un campione basta —
   nella gara di Donington erano 2 su 697 — e nelle prove non ce n'è nessuno. */
test('la sessione si chiama «Race» se almeno un campione la dichiara gara', () => {
  const gara = { ...snap(), session: { type: 'TimeAttack', track: 'Donington Park', race: true } };
  const s = riassumiMonitor([
    rigaMonitor(gara, '2026-11-06T22:52:11.989Z'),
    rigaMonitor({ ...gara, session: { ...gara.session, race: false } }, '2026-11-06T22:53:00.000Z'),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'Race', 'il tipo dichiarato mente, la dichiarazione di gara no');

  const prova = { ...snap(), session: { type: 'TimeAttack', track: 'Suzuka', race: false } };
  const p = riassumiMonitor([
    rigaMonitor(prova, '2026-11-06T17:07:33.902Z'),
    rigaMonitor(prova, '2026-11-06T17:07:50.529Z'),
  ]);
  assert.equal(p[0].tipo, 'TimeAttack', 'senza dichiarazione resta quello che il gioco dice');
});
