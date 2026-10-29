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
  const snapIn = { live: true, session: { type: 'Race' }, player: { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 20, lapsDone: 10, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 3, drivers: 20, inPit: true } };
  const live = engineerLive(snapIn, {});
  assert.ok(live.live && live.pit, 'manca pit nella risposta live');
  assert.ok(live.pit.need === 'fuel', `pit.need = ${live.pit?.need}`);
  assert.ok(live.tips.some((t) => t.icon === '🏁'), 'manca il tip di gap davanti');
  assert.equal(live.gauges.inPit, true, 'il sensore pitlane viene fuori nei gauges (narratore dei box)');
  const snapOut = { live: true, session: { type: 'Practice' }, player: snapIn.player };
  const quiet = engineerLive(snapOut, {});
  assert.ok(!quiet.live && quiet.pit === null, 'fuori gara l\u2019ingegnere deve tacere');
});

test('engineerLive: il contratto inPit è null/falso, MAI undefined (narratori dei box)', () => {
  // 28/10 tardissimo, gara muto del copilota: nel registro MONITOR il campo
  // inPit leggeva undefined — ma a sorgente shmem.mjs lo scrive SEMPRE
  // (player.inPit = carLocation===1) e engineer lo passa con ?? null: il
  // narratore 6c splende solo col valore null (g.inPit != null). Il test
  // bluxa il contratto BOTH directions: senza foto del gioco, gauges.inPit
  // DEVE uscire null, e con il campo false DEVE uscire false.
  const base = { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 20, lapsDone: 10, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 3, drivers: 20 };
  const senza = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base } }, {});
  assert.equal(senza.gauges.inPit, null, 'senza il campo: null, non undefined (i narratori devono poter distinguere)');
  const falso = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base, inPit: false } }, {});
  assert.equal(falso.gauges.inPit, false, 'inPit false resta false: fuori dal pitlane, e il narratore 6c lo semina');
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

test('engineerLive: BANDIERA BLU (28/10 notte, endurance) — tip in cima e flag nei gauges, contratto null', () => {
  // richiesta Mauro: «le bandiere blu non segnano corrette sulle endurance —
  // copilota muto + cruscotto senza bandiera». La sorgente (player.flag,
  // shmem FLAG[4]='blu') c'era da sempre; qui si bissa il contratto:
  // flag 'blu' → tip 🔵 CON prio 0 (in cima alla radio) e gauges.flag='blu';
  // flag assente → gauges.flag NULL, mai undefined (stesso patto di inPit).
  const base = { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 20, lapsDone: 10, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 3, drivers: 20 };
  const doppio = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base, flag: 'blu' } }, {});
  const tip = doppio.tips.find((t) => t.icon === '🔵');
  assert.ok(tip, 'manca il tip della bandiera blu');
  assert.equal(tip.prio, 0, 'la bandiera blu comanda la radio (prio 0)');
  assert.equal(doppio.gauges.flag, 'blu', 'il flag non arriva ai gauges (i narratori lo consumano)');
  const libero = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base, flag: 'nessuna' } }, {});
  assert.ok(!libero.tips.some((t) => t.icon === '🔵'), 'flag non blu: nessun tip');
  assert.equal(libero.gauges.flag, 'nessuna', 'flag libero passa nei gauges');
  const senza = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base } }, {});
  assert.equal(senza.gauges.flag, null, 'senza il campo: null, non undefined (contratto narratori)');
  assert.ok(!senza.tips.some((t) => t.icon === '🔵'), 'senza il campo nessun falso tip blu');
});

test('engineerLive: CODICE GREZZO del flag (28/10 notte, endurance) — passa ai gauges, contratto null', () => {
  // richiesta continua: «le bandiere blu non segnano giusto nelle
  // endurance». Ma con la parola SOLO non si distingue «campo assente» da
  // «valore fuori mappa» (es. una endurance che scrive un codice nuovo di
  // EVO: FLAG[?] è null e nessuno saprebbe perché). shmem ora porta anche
  // la cifra (flagCode/globalFlagCode) e l'ingegnere la passa: il monitor
  // copilota la mette nel registro, la prossima endurance chiude ogni
  // dubbio di mappatura da sola.
  const base = { fuel: 40, lapsTotal: 20, lapsDone: 10, position: 3, drivers: 20 };
  const blu = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base, flag: 'blu', flagCode: 4, globalFlag: 'verde', globalFlagCode: 2 } }, {});
  assert.equal(blu.gauges.flagCode, 4, 'il codice grezzo del flag per auto non passa ai gauges');
  assert.equal(blu.gauges.globalFlagCode, 2, 'il codice grezzo del flag globale non passa ai gauges');
  // fuori mappa: parola null MA codice visibile — la coppia è la diagnosi
  const fuori = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base, flag: null, flagCode: 11 } }, {});
  assert.equal(fuori.gauges.flag, null, 'valore fuori mappa: parola null');
  assert.equal(fuori.gauges.flagCode, 11, 'valore fuori mappa: il codice resta leggibile (11 esiste da un lato? eccolo)');
  const senza = engineerLive({ live: true, session: { type: 'Race' }, player: { ...base } }, {});
  assert.equal(senza.gauges.flagCode, null, 'senza codice: null, mai undefined (contratto monitor)');
  assert.equal(senza.gauges.globalFlagCode, null, 'senza codice globale: null, mai undefined');
});

test('engineerLive: LA FASE dice Race pur col tipo sbagliato «TimeAttack» — gare SP (29/10)', () => {
  // Patologia riparata: nelle gare single-player il blocco STATIC scrive
  // sessionType 0 («TimeAttack») per tutta la gara (178/178 in due gare
  // reali) e la finestra sosta zittisce. La fase VERA del GRAPHICS
  // (SMEvoSessionState.phase_name, nel player del reader da sempre)
  // dichiara 'Race': col gate inRace su fase==Race la finestra parla pure
  // lì. E la fase arriva nei gauges (contratto null), quindi nel registro
  // del monitor il valore reale si legge da solo nella prossima gara.
  const base = { fuel: 40, tyreWear: [0.4, 0.55, 0.38, 0.42], lapsTotal: 20, lapsDone: 10, lapsPossible: 4, gapAhead: 1.2, gapBehind: 3, position: 3, drivers: 20 };
  const sp = engineerLive({ live: true, session: { type: 'TimeAttack' }, player: { ...base, sessionPhase: 'Race' } }, {});
  assert.ok(sp.live && sp.pit != null, 'fase Race: la finestra sosta parla anche col tipo «TimeAttack» (gara SP)');
  assert.equal(sp.gauges.sessionPhase, 'Race', 'la fase del gioco non arriva ai gauges: senza di lei il registro non dice perch\u00e8');
  // fase che dice altro (prova libera): col tipo TimeAttack la finestra resta muta —
  // nessun falso «Sosta tra N giri» durante le hotlap (i falsi positivi qui
  // costano il doppio: voci sbagliate pure quando giri per piacere)
  const prova = engineerLive({ live: true, session: { type: 'TimeAttack' }, player: { ...base, lapsTotal: 0, lapsDone: 0, sessionPhase: 'Hotlap' } }, {});
  assert.ok(prova.live && prova.pit === null, 'fase diversa da Race: la finestra resta muta anche se il tipo è TimeAttack');
  const muto = engineerLive({ live: true, session: { type: 'TimeAttack' }, player: { ...base, lapsTotal: 0, lapsDone: 0 } }, {});
  assert.ok(muto.live && muto.pit === null, 'fase assente: contratto null nei gauges E la finestra resta chiusa');
  assert.equal(muto.gauges.sessionPhase, null, 'senza fase: null, non undefined (contratto monitor)');
});
