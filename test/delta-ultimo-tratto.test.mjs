// test/delta-ultimo-tratto.test.mjs — IL DELTA DELL'ULTIMO TRATTO.
//
// Segnalazione di Mauro (6/11 notte): «il copilot dice dei delta errati, su
// schermo ce l'ho in tempo reale: a fine gara, ultimo tratto, avevo 1 secondo
// sul display e il copilot diceva 1.6».
//
// La causa: i campioni della traccia distano 25 m (>=0.4 s a velocità di gara),
// ma `liveDelta` confrontava il cronometro FRESCO del giro (curLapMs) col tempo
// del best nel punto dell'ULTIMO CAMPIONE — cioè una posizione vecchia contro
// un orologio nuovo. Il delta usciva gonfiato di tutto il tratto percorso dopo
// l'ultimo campione, e l'errore cresceva con la velocità (in rettilineo più
// che in curva): l'ultimo tratto è esattamente dove si vede di più.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPathProg, liveDelta } from '../src/lapdelta.mjs';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');

const VEL = 40;                       // m/s: giro di 4000 m = 100 s
const PASSO = 25;                     // la stessa distanza dei campioni veri (shmem)
const GIRO = 4000;
const pista = (t0, fino = GIRO) => {
  const out = [];
  for (let d = 0; d <= fino; d += PASSO) out.push({ x: d, z: 0, t: (d / VEL) * 1000 + t0 });
  return out;
};

const percorso = buildPathProg(pista(0));

test('ultimo tratto: stesso punto, stesso cronometro — delta = 1.0 s, non 4', () => {
  /* giro corrente costantemente 1 s più lento del best; l'ultimo campione cade
     25 m prima del traguardo, il cronometro fresco è già alla linea. */
  const giroOra = pista(1000, GIRO - PASSO);
  const fresco = (GIRO / VEL) * 1000 + 1000;   // 101 s: il giro è finito ADESSO
  const d = liveDelta(giroOra, percorso, fresco);
  assert.ok(d, 'il delta deve uscire');
  assert.equal(d.deltaMs, 1000, `atteso il delta vero del punto (1000 ms), uscito ${d.deltaMs}`);
});

test('in curva (campioni più radi) l\'errore non cambia col ritmo del campionamento', () => {
  /* stesso giro, ma la traccia del corrente è campionata più rada: con il
     cronometro fresco il delta cambierebbe (era il difetto), col tempo del
     campione resta 1.0 s. */
  const rada = [];
  for (let d = 0; d < GIRO; d += 100) rada.push({ x: d, z: 0, t: (d / VEL) * 1000 + 1000 });
  const d = liveDelta(rada, percorso, (GIRO / VEL) * 1000 + 1000);
  assert.equal(d.deltaMs, 1000);
});

test('delta negativo (più veloce) resta negativo col segno giusto', () => {
  const giroOra = pista(-700, GIRO - PASSO);   // 0.7 s più veloce
  const d = liveDelta(giroOra, percorso, (GIRO / VEL) * 1000 - 700);
  assert.equal(d.deltaMs, -700);
});

test('tracce senza tempo nei campioni: nessun delta inventato', () => {
  /* matchTrack allinea solo campioni CON un tempo: senza tempi non c'è
     allineamento, quindi niente delta — e non si ripiega sul cronometro del
     chiamante per fabbricarne uno. */
  const senzaT = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 }, { x: 3000, z: 0 }];
  assert.equal(liveDelta(senzaT, buildPathProg(senzaT), 4200), null);
});

test('lapdelta: il cronometro del campione viene PRIMA di quello fresco', () => {
  const src = readFileSync(join(QUI, 'src', 'lapdelta.mjs'), 'utf8');
  assert.match(src, /const curMs = Number\.isFinite\(last\.curMs\) \? last\.curMs : curLapMs;/,
    'la riga che sceglie il cronometro è la cura: se torna `curLapMs ? curLapMs : last.curMs` il difetto rientra');
});
