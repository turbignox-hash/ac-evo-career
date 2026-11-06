// test/delta-box.test.mjs — AI BOX LA RADIO NON PARLA DI DELTA (6/11 sera).
//
// Richiesta di Mauro: «controlla perché quando sono ai box dice che sono più
// veloce del best». Il difetto era geometrico, non di frase: la pit lane corre
// parallela al rettifilo e la piazzola sta lì, quindi il punto più vicino della
// traccia del best cade vicino al traguardo (p≈0, t≈0) mentre il giro corrente
// è appena partito — il delta tracciato usciva a −0.5 s da fermo e passava
// tutte le guardie (finestra ±15 s, «non più negativo del tempo trascorso»).
//
// Due porte, provate qui:
//   1) il lettore (src/shmem.mjs _deltaInfo): con carLocation 1 non pubblica
//      un delta tracciato, nemmeno quando la geometria sarebbe perfetta;
//   2) il narratore (gui/js/narratore-unito.js): anche con un payload che
//      arrivasse 'tracked' da dentro i box, la frase delta non esce — e il
//      bucket si aggiorna in silenzio, così all'uscita non parla del valore
//      mosso dal box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveReader } from '../src/shmem.mjs';
import { narratore } from '../tools/_monitor-copilota.mjs';

/* --- 1) il lettore --- */

/* pista dritta di 4 km, un campione ogni 100 m; il best passa a 2000 ms per
   campione (78 s il giro). Il giro corrente corre SULLA linea con +200 ms
   costanti: è il caso in cui il delta tracciato è lecito. */
const PEDI = 40;
const pista = (dt) => Array.from({ length: PEDI }, (_, k) => ({ x: k * 100, z: 0, t: k * 2000 + dt }));

function lettore(carLocation, extra = {}) {
  const r = new LiveReader();
  r.bestTrack = pista(0);
  r.bestLapMs = 78000;
  r.bestLapNo = 4;
  r.lapNoSeen = 5;
  r.lapTrack = pista(200);
  r.last.graphics = {
    carLocation,
    session: 1,
    isValidLap: true,
    lapMs: { current: (PEDI - 1) * 2000 + 200, best: 78000 },
    ...extra,
  };
  return r;
}

test('lettore: a pista il delta tracciato si pubblica (la prova non è cieca)', () => {
  const d = lettore(0)._deltaInfo();
  assert.equal(d.source, 'tracked');
  assert.equal(d.dv, 200);
});

test('lettore: in pit nessun delta tracciato, nemmeno con geometria perfetta', () => {
  /* tutto il pit, non la sola pitlane: l'header scrive 1 pitlane, 2 ingresso,
     3 uscita, 4 pista — e la piazzola sta nella pitlane. */
  for (const dove of [1, 2, 3]) {
    const d = lettore(dove)._deltaInfo();
    assert.equal(d.source, 'hud', `carLocation ${dove}: la fonte non è più tracked`);
    assert.equal(d.dv, null, `carLocation ${dove}: niente numero da dire né da mostrare`);
    assert.equal(d.inPit, true, `carLocation ${dove}`);
    assert.equal(d.segments, null, `carLocation ${dove}: niente fette, il settore peggiore non si calcola in pit`);
  }
  // i due booleani espliciti del bridge bastano da soli (carLocation muto/0)
  assert.equal(lettore(0, { isInPitLane: true })._deltaInfo().inPit, true);
  assert.equal(lettore(0, { isInPitBox: true })._deltaInfo().inPit, true);
  // e lo 0 «non assegnato» NON è pit: campo non scritto, delta come prima
  assert.equal(lettore(0)._deltaInfo().source, 'tracked');
});

/* --- 2) il narratore --- */

const MMF = (t, { dv, inPit, deltaInPit = null }) => ({
  t,
  live: true,
  sessionId: 'sess-box',
  sessionType: 'Race',
  phase: 'Race',
  gauges: { lapsDone: 5, lapsTotal: 10, fuel: 30, lapsOnFuel: 10, lapsLeft: 5, inPit },
  delta: { lapNo: 5, dv, source: 'tracked', ...(deltaInPit == null ? {} : { inPit: deltaInPit }) },
});

function gara(frames) {
  const slot = { last: {}, at: 0, said: {}, firma: 'box-test' };
  return frames.flatMap(([t, m]) => narratore(m, slot, t).map((f) => ({ ...f, t })));
}

const delte = (dette) => dette.filter((f) => !f.detto && f.chi === 'delta');

test('narratore: in pit nessuna frase delta, e all\'uscita non ripete il valore del box', () => {
  const dette = gara([
    [0, MMF(0, { dv: 0, inPit: false })],            // semina del bucket
    [60000, MMF(60000, { dv: -500, inPit: true })],  // «più veloce di 0.5» da fermo: NON si dice
    [130000, MMF(130000, { dv: -500, inPit: false })], // uscito: stesso bucket → tace
    [200000, MMF(200000, { dv: -1600, inPit: false })], // ritmo vero cambiato: parla
  ]);
  const frasi = delte(dette).map((f) => f.it);
  assert.deepEqual(frasi, ['sei più veloce del best di 1.6'], `frasi delta: ${JSON.stringify(frasi)}`);
  assert.equal(delte(dette)[0].t, 200000, 'la prima frase delta arriva a pista, non dai box');
});

test('narratore: basta inPit del server nel delta, anche senza gauges', () => {
  const dette = gara([
    [0, MMF(0, { dv: 0, inPit: false })],
    [60000, MMF(60000, { dv: -900, inPit: false, deltaInPit: true })],  // payload vecchio: gauges muti, server dice pit
  ]);
  assert.equal(delte(dette).length, 0, 'in pit il server lo dichiara nel delta: niente frase');
});

test('narratore: senza il gate, lo stesso frame in pit avrebbe parlato', () => {
  /* la prova di non-cecità: il solo frame «in pit, −0.5, bucket nuovo» basta a
     far parlare il narratore quando il box non è dichiarato — quindi il verde
     qui sopra è merito della guardia, non del caso. */
  const dette = gara([
    [0, MMF(0, { dv: 0, inPit: false })],
    [60000, MMF(60000, { dv: -500, inPit: false })],
  ]);
  assert.equal(delte(dette).length, 1);
  assert.match(delte(dette)[0].it, /più veloce del best di 0\.5/);
});
