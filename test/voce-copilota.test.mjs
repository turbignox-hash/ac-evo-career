import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nuovoSlotVoce, giroVoce } from '../src/voce-copilota.mjs';

/** la voce finta: registra quello che la voce vera parlerebbe */
const voceFinta = () => { const items = []; return { parla: (t) => items.push(t), items }; };

const G = (over = {}) => ({ lapsDone: 0, lapsTotal: 0, inPit: false, flag: 'nessuna', wear: [10, 10, 10, 10], position: 5, fuel: 26, lapsOnFuel: 8, lapsLeft: 2, gapAhead: 0, gapBehind: 0, timeLeft: null, ...over });
const M = (live, over = {}) => ({
  live,
  sessionId: 'ev1:sess1:Race',
  sessionType: 'Race',
  gauges: G(),
  delta: { dv: null, lapNo: 0, source: 'hud', bestLapNo: null },
  pit: null,
  ...over,
});

test('la prima vista live si SEMINA in silenzio: niente frasi sui dati bruciati', () => {
  const v = voceFinta();
  const slot = nuovoSlotVoce();
  giroVoce(M(true, { gauges: G({ lapsDone: 2, lapsOnFuel: 7 }) }), slot, v, { graziaMs: 0, ora: 1000 });
  assert.deepEqual(v.items, [], 'il primo tick non parla MAI, qualunque valore porti');
  // la semina è avvenuta: il secondo tick con benzina in calo PARLA
  giroVoce(M(true, { gauges: G({ lapsDone: 2, lapsOnFuel: 6 }) }), slot, v, { graziaMs: 0, ora: 2000 });
  assert.ok(v.items.some((t) => t.includes('Benzina')), 'dopo la semina la benzina parla');
});

test('dentro la grazia la voce tace e NON semina; alla fine prima semina, poi parla', () => {
  const v = voceFinta();
  const slot = nuovoSlotVoce();
  const ora0 = 1000;
  giroVoce(M(true), slot, v, { graziaMs: 15000, ora: ora0 });   // la grazia nasce (15 s)
  giroVoce(M(true, { gauges: G({ lapsOnFuel: 7 }) }), slot, v, { graziaMs: 15000, ora: ora0 + 4000 });
  assert.deepEqual(v.items, [], 'dentro la grazia: silenzio');
  // fuori dalla grazia: il primo tick semina lo stato (benzina 7) senza voce,
  // il secondo col calo VERO (6) parla
  giroVoce(M(true, { gauges: G({ lapsOnFuel: 7 }) }), slot, v, { graziaMs: 15000, ora: ora0 + 20000 });
  assert.deepEqual(v.items, [], 'la semina post-grazia NON parla');
  giroVoce(M(true, { gauges: G({ lapsOnFuel: 6 }) }), slot, v, { graziaMs: 15000, ora: ora0 + 21000 });
  assert.ok(v.items.some((t) => t.includes('Benzina')), 'il calo VERO dopo la semina parla');
});

test('firma di sessione nuova: memoria a zero, grazia ripartita e contatore nuovo', () => {
  const v = voceFinta();
  const slot = nuovoSlotVoce();
  const ora0 = 5000;
  giroVoce(M(true), slot, v, { graziaMs: 0, ora: ora0 });
  giroVoce(M(true, { gauges: G({ lapsDone: 2 }), timing: { lastLap: '1:55.000' } }), slot, v, { graziaMs: 0, ora: ora0 + 1000 });
  assert.equal(slot.last.giro, 2, 'il contatore si è seminato coi giri');
  const m2 = M(true, { sessionId: 'ev1:sess2:Race', gauges: G({ lapsDone: 3, lapsOnFuel: 5 }) });
  giroVoce(m2, slot, v, { graziaMs: 15000, ora: ora0 + 2000 });
  assert.deepEqual(v.items, [], 'firma nuova: nella grazia niente voce sui dati trascinati');
  assert.equal(slot.firma, 'ev1:sess2:Race', 'la nuova firma è memorizzata');
});

test('live=false: la voce segue la sessione; il ritorno live risemina in silenzio', () => {
  const v = voceFinta();
  const slot = nuovoSlotVoce();
  const dove = { file: join(tmpdir(), `voce-test-${Date.now()}.jsonl`) };
  const ora0 = 7000;
  giroVoce(M(true), slot, v, { log: dove, graziaMs: 0, ora: ora0 });
  giroVoce(M(false), slot, v, { log: dove, graziaMs: 0, ora: ora0 + 1000 });
  assert.equal(slot.sawLive, false, 'la voce sa che la sessione è fuori');
  const testo = readFileSync(dove.file, 'utf8');
  assert.ok(testo.includes('SESSIONE FUORI'), "l'uscita è nel registro della voce");
  assert.ok(testo.includes('SESSIONE VIVA'), 'il ritorno della live è nel registro');
  giroVoce(M(true, { gauges: G({ lapsDone: 3 }) }), slot, v, { log: dove, graziaMs: 15000, ora: ora0 + 2000 });
  assert.deepEqual(v.items, [], 'il ritorno live si semina di nuovo in silenzio');
});

/* 31/10 pomeriggio, richiesta di Mauro dopo la gara delle 15:29: «i delta
   solo in full, via da normale e essenziale». La mappa FRASI_LIVELLO non ha
   MAI nominato 'delta' nelle liste, ma senza test il costo poteva rientrare
   con un refuso futuro: qui lo si sancisce a voce. */
test('IL DELTA DI RITMO parla SOLO col livello full: essenziale e normale tacciono', () => {
  const passo = (livello) => {
    const v = voceFinta();
    const slot = nuovoSlotVoce();
    giroVoce(M(true, { delta: { dv: -3000, lapNo: 1, source: 'hud' } }), slot, v, { graziaMs: 0, ora: 1000, livello });   // semina bucket -8
    giroVoce(M(true, { delta: { dv: -6400, lapNo: 1, source: 'hud' } }), slot, v, { graziaMs: 0, ora: 62000, livello });  // bucket -16, oltre i 45 s
    return v.items;
  };
  assert.deepEqual(passo('essenziale'), [], 'essenziale: niente delta');
  assert.deepEqual(passo('normale'), [], 'normale: niente delta');
  assert.ok(passo('full').some((t) => t.includes('più veloce del best di')), 'full: il delta parla');
});
