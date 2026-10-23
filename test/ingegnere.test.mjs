import "./_flows-sandbox.mjs"; // sandbox flussi
// Suite delle funzioni pure del pacchetto "canto dell'ingegnere":
//  - lapdelta.mjs: path del giro, matching in avanzamento, delta live, delta per fascia
//  - engineer.mjs (pitWindow): benzina vs usura, il giro di sosta e la finestra
//
// Tutto senza gioco: le tracce sono costruite a mano, come farebbe la shared
// memory su una pista a anello (un quadrato 100×100, 400 m; auto a 2 m/ms? no:
// auto ~55 m/s, tempi di giro ~7300 ms).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPathProg, matchTrack, liveDelta, deltaSegments, nearestOnPath } from '../src/lapdelta.mjs';
import { pitWindow, engineerLive } from '../src/engineer.mjs';

const TAU = Math.PI * 2;

/* una pista circolare nel piano XZ: raggio dato, npt campioni, lungheza nota */
function circle(r = 63.66, npt = 64) {
  return Array.from({ length: npt }, (_, i) => {
    const a = (i / npt) * TAU;
    return { x: r * Math.cos(a), z: r * Math.sin(a) };
  });
}
/* il percorso del best: il cerchio con i TEMPI (auto costante 55 m/s) */
const CIRC = 2 * Math.PI * 63.66;                 // ≈ 400 m
const BEST_LAP = Math.round(CIRC / 55 * 1000);    // ≈ 7274 ms
function bestTrack(npt = 64) {
  return circle().map((p, i) => ({ ...p, t: Math.round(i / npt * BEST_LAP) }));
}
/* il giro corrente: stesso anello, campionamento più rado, con un ritardo dato
   (in ms) costante su tutto il giro — il delta conosciuto della prova.
   IMPORTANTI le frazioni: il tempo è calcolato sull'indice ORIGINARIO del
   cerchio (posizione = frazione di giro), non sull'indice dopo il filtro:
   altrimenti le posizioni corrono il giro intero mentre i tempi si fermano
   a metà e il matching è senza senso. */
function curTrack(delayMs, npt = 40, skipFrom = 0) {
  const base = circle();
  const step = Math.max(1, Math.round(base.length / npt));
  // il tempo è calcolato sull'indice ORIGINARIO del cerchio (posizione =
  // frazione di giro), non sull'indice dopo il filtro: altrimenti le posizioni
  // corrono il giro intero mentre i tempi si fermano a metà. Niente cap sul
  // BEST_LAP: qui i tempi stanno tutti nel giro e il wrap del lapCurrent
  // della MMF lo gestisce il lettore, non il modello.
  return base
    .map((p, j) => ({ x: p.x, z: p.z, j }))
    .filter(({ j }) => j % step === 0 && j >= skipFrom)
    .map(({ x, z, j }) => ({ x, z, t: Math.round((j / base.length) * BEST_LAP + delayMs) }));
}

test('buildPathProg: frazione di distanza crescente e chiusura a 1', () => {
  const path = buildPathProg(bestTrack());
  assert.ok(path, 'il path del best non si costruisce');
  const ps = path.pts.map((p) => p.p);
  assert.ok(Math.abs(ps[0]) < 0.001, 'il primo punto parte da 0');
  assert.ok(Math.abs(ps[ps.length - 1] - 1) < 0.001, 'l\u2019ultimo punto arriva a 1');
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] >= ps[i - 1], 'non monotono');
});

test('matchTrack: il giro corrente si allinea in avanzamento e riconosce il terreno', () => {
  const path = buildPathProg(bestTrack());
  const cur = curTrack(400);               // 0.4 s di ritardo sul best
  const m = matchTrack(cur, path);
  assert.ok(m && m.length >= 3, 'il matching non rende abbastanza punti');
  for (let i = 1; i < m.length; i++) assert.ok(m[i].p >= m[i - 1].p - 0.001, 'progresso non crescente');
  // il delta rispecchia il ritardo noto (±50 ms: interpolazioni, abbondanze)
  const errs = m.slice(3).map((w) => Math.abs(w.dz - 400));
  assert.ok(Math.max(...errs) < 60, `delta fuori scala: max ${Math.max(...errs)} ms`);
});

test('liveDelta: il delta al punto attuale è circa il ritardo sperimentale', () => {
  const path = buildPathProg(bestTrack());
  const cur = curTrack(400);
  const d = liveDelta(cur, path, null);
  assert.ok(d, 'il liveDelta non esce');
  assert.ok(Math.abs(d.deltaMs - 400) < 60, `delta ${d.deltaMs} ms ≠ attesi ~400`);
  assert.ok(d.prog > 0 && d.prog <= 1);
});

test('liveDelta: ISLAND FALLITA con il giro più VELOCE del best (delta negativo)', () => {
  const path = buildPathProg(bestTrack());
  // il cur "precede" i tempi del best di 300 ms: buildPathProg del CUR non serve,
  // il match si fa sui punti: sposto indietro i TEMPI del cur
  const cur = curTrack(0).map((p) => ({ ...p, t: Math.max(0, p.t - 300) }));
  const d = liveDelta(cur, path, null);
  assert.ok(d, 'il liveDelta non esce');
  assert.ok(d.deltaMs < -250, `delta ${d.deltaMs} ms dovrebbe essere ≈ −300`);
});

test('deltaSegments: ogni fetta ha il delta medio vicino al ritardo noto', () => {
  const path = buildPathProg(bestTrack());
  const cur = curTrack(400);
  const segs = deltaSegments(cur, path, 24);
  assert.ok(Array.isArray(segs) && segs.length === 24, 'le fette non hanno la lunghezza giusta');
  const usable = segs.filter((s) => s.dv != null);
  assert.ok(usable.length >= 12, `solo ${usable.length} fette usabili`);
  for (const s of usable) assert.ok(Math.abs(s.dv - 0.4) < 0.08, `fetta a ${s.p}: ${s.dv}s ≠ 0.4s`);
  // il progresso del secondo cono con giro a METÀ: le fette non passate restano null
  const half = curTrack(400, 40).filter((p) => p.t < BEST_LAP / 2);
  const segsH = deltaSegments(half, path, 24);
  const nulls = segsH.filter((s) => s.dv == null).length;
  assert.ok(nulls >= 6, `con mezz'ora di giro solo ${nulls} fette vuote`);
});

test('nearestOnPath: senza fascia aggancia il punto più vicino, con fascia rispetta la zona', () => {
  const path = buildPathProg(bestTrack());
  const p1 = nearestOnPath(path, circle()[16].x, circle()[16].z);
  assert.ok(p1 && Math.abs(p1.p - 16 / 64) < 0.03, 'nearest senza fascia sbaglia quartiere');
  const p2 = nearestOnPath(path, circle()[16].x, circle()[16].z, 0.75, 0.1);
  assert.ok(p2 == null || Math.abs(p2.p - 0.75) < 0.1, 'la fascia non filtra');
});

/* ---------------- pitWindow ---------------- */

const GA = { lapsDone: 10, wear: [40, 55, 38, 42], lapsOnFuel: 4, lapsLeft: 10 };

test('pitWindow: benzina mancante → sosta obbligatoria, non oltre il serbatoio secco', () => {
  const p = pitWindow(GA, { inRace: true, lapsTotal: 20 });
  assert.ok(p && p.need === 'fuel', `need = ${p?.need}`);
  assert.ok(p.pitLap >= 11 && p.pitLap <= 13, `pitLap ${p.pitLap}: deve stare nell'orizzonte del serbatoio`);
  assert.ok(p.window[0] <= p.pitLap && p.window[1] >= p.pitLap, 'la finestra non contiene il pit lap');
  assert.ok(p.fuel.deficit > 0, 'il deficit manca');
});

test('pitWindow: usura alta → sosta per gomme solo DENTRO la gara', () => {
  const p = pitWindow({ ...GA, wear: [20, 30, 18, 22], lapsOnFuel: 15, lapsLeft: 10 }, { inRace: true, lapsTotal: 30 });
  assert.ok(p && p.need === 'wear', `need = ${p?.need}`);
  assert.ok(p.wear.criticalLap > 10 && p.wear.criticalLap < 30, `criticalLap ${p.wear?.criticalLap}`);
  // stessa usura lenta con gara più corta: NON si consiglia la sosta
  const q = pitWindow({ ...GA, wear: [20, 30, 18, 22], lapsOnFuel: 15, lapsLeft: 10 }, { inRace: true, lapsTotal: 12 });
  assert.ok(q && q.need === null, `need = ${q?.need} (non dovrebbe fermare)`);
});

test('pitWindow: gomma già al limite → "now", pit lap subito', () => {
  // benzina SANO deliberatamente (15 giri copribili su 8 restanti): qui si prova
  // SOLO l'usura — con la benzina corta il «need» giusto sarebbe fuel/both, non wear
  const p = pitWindow({ ...GA, lapsDone: 20, wear: [86, 84, 80, 81], lapsOnFuel: 15, lapsLeft: 8 }, { inRace: true, lapsTotal: 30 });
  assert.ok(p && p.need === 'wear' && p.wear.now, 'la gomma al limite non gridata');
  assert.equal(p.pitLap, 21, 'con la gomma a terra il pit è SUBITO');
});

test('pitWindow: tutto in salute → nessuna sosta; fuori gara → null', () => {
  const ok = pitWindow({ lapsDone: 5, wear: [10, 12, 9, 11], lapsOnFuel: 12, lapsLeft: 6 }, { inRace: true, lapsTotal: 12 });
  assert.ok(ok && ok.need === null, `need = ${ok?.need}`);
  const out = pitWindow(GA, { inRace: false, lapsTotal: 20 });
  assert.equal(out, null, 'fuori gara la finestra non esiste');
});

test('engineerLive: in gara restituisce live + pit; fuori resta silenzioso', () => {
  const snapIn = { live: true, session: { type: 'Race' }, player: { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 20, lapsDone: 10, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 3, drivers: 20 } };
  const live = engineerLive(snapIn, {});
  assert.ok(live.live && live.pit, 'manca pit nella risposta live');
  assert.ok(live.pit.need === 'fuel', `pit.need = ${live.pit?.need}`);
  assert.ok(live.tips.some((t) => t.icon === '🏁'), 'manca il tip di gap davanti');
  const snapOut = { live: true, session: { type: 'Practice' }, player: snapIn.player };
  const quiet = engineerLive(snapOut, {});
  assert.ok(!quiet.live && quiet.pit === null, 'fuori gara l\u2019ingegnere deve tacere');
});

test('engineerLive: nelle PROVE (TimeAttack di EVO) la radio vive ma la finestra pit no', () => {
  const snapTA = { live: true, session: { type: 'TimeAttack' }, player: { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 0, lapsDone: 0, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 1, drivers: 20 } };
  const ta = engineerLive(snapTA, {});
  assert.ok(ta.live && ta.pit === null, 'in prova la radio vive, la finestra pit tace');
  assert.ok(ta.tips.some((t) => t.icon === '🛞'), 'manca il tip gomme nelle prove');
  const snapOut = { live: true, session: { type: 'Practice' }, player: snapTA.player };
  const quiet = engineerLive(snapOut, {});
  assert.ok(!quiet.live && quiet.pit === null, 'type non riconosciuto → la radio tace');
});
