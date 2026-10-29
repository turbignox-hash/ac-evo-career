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
test('IL DELTA DI RITMO parla SOLO col livello full e SOLO dalla fonte tracked', () => {
  const passo = (livello, source = 'tracked') => {
    const v = voceFinta();
    const slot = nuovoSlotVoce();
    giroVoce(M(true, { delta: { dv: -3000, lapNo: 1, source } }), slot, v, { graziaMs: 0, ora: 1000, livello });   // semina bucket -8
    giroVoce(M(true, { delta: { dv: -6400, lapNo: 1, source } }), slot, v, { graziaMs: 0, ora: 62000, livello });  // bucket -16, oltre i 45 s
    return v.items;
  };
  assert.deepEqual(passo('essenziale'), [], 'essenziale: niente delta');
  assert.deepEqual(passo('normale'), [], 'normale: niente delta');
  assert.ok(passo('full').some((t) => t.includes('più veloce del best di')), 'full (tracked): il delta parla');
  /* 31/10 SERA (R5, i falsi 11-14 s): il delta HUD del gioco raffronta col
     best chi vuole lui (stasera il best della Time Attack) — non entra in
     voce nemmeno a full: la norma tracked-only vale al livello più alto. */
  assert.deepEqual(passo('full', 'hud'), [], "full con fonte 'hud': l'HUD non parla mai in radio");
});

/* 29/10, aggiunta del narratore 9-ter: la bandiera VERDE di via libera è
   l'ordine di partire — in pista si sente a QUALUNQUE livello (essenziale
   incluso), è il contrario del delta che resta di lusso del full. */
test('IL VIA LIBERA (verde) parla a tutti i livelli: essenziale, normale e full', () => {
  const passo = (livello) => {
    const v = voceFinta();
    const slot = nuovoSlotVoce();
    giroVoce(M(true, { gauges: G({ flagCode: 0 }) }), slot, v, { graziaMs: 0, ora: 1000, livello });        // semina
    giroVoce(M(true, { gauges: G({ flagCode: 2, flag: 'verde' }) }), slot, v, { graziaMs: 0, ora: 16000, livello });
    return v.items;
  };
  assert.ok(passo('essenziale').includes('Bandiera verde: via libera.'), 'essenziale: il via libera si sente');
  assert.ok(passo('normale').includes('Bandiera verde: via libera.'), 'normale: il via libera si sente');
  assert.ok(passo('full').includes('Bandiera verde: via libera.'), 'full: il via libera si sente');
});

/* 29/10 tardi: nelle gare a TEMPO il conto alla rovescia («Ultimo minuto!»,
   «Trenta secondi!») porta chi='minuto' che le liste NON ammettevano: alla
   copilota al minimo la gara a tempo chiudeva in silenzio. La fonte esiste
   SOLO quando lo static dice timedRace (timeLeft stringa dell'HUD) — nelle
   gare a giri nulla nasce e il livello è indifferente. Come il verde (ordine
   di partire), è roba da sentire a QUALUNQUE livello: chi guida deve sapere
   che la gara chiude. */
test('IL CONTO ALLA ROVESCIA (minuto) parla a tutti i livelli', () => {
  const passo = (livello) => {
    const v = voceFinta();
    const slot = nuovoSlotVoce();
    giroVoce(M(true, { gauges: G({ timeLeft: '1:10' }) }), slot, v, { graziaMs: 0, ora: 1000, livello });   // semina (70 s: tace)
    giroVoce(M(true, { gauges: G({ timeLeft: '0:55' }) }), slot, v, { graziaMs: 0, ora: 2000, livello });   // ≤60: «Ultimo minuto!»
    giroVoce(M(true, { gauges: G({ timeLeft: '0:25' }) }), slot, v, { graziaMs: 0, ora: 3000, livello });   // ≤30: «Trenta secondi!»
    return v.items;
  };
  for (const livello of ['essenziale', 'normale', 'full']) {
    const items = passo(livello);
    assert.ok(items.includes('Ultimo minuto!'), `${livello}: l'ultimo minuto si sente`);
    assert.ok(items.includes('Trenta secondi!'), `${livello}: trenta secondi si sentono`);
  }
  // e senza timeLeft (gara a giri) le frasi NON nascono, a qualunque livello:
  // se parlassero pure lì il test colpirebbe il narratore, non il filtro.
  const senza = (livello) => {
    const v = voceFinta();
    const slot = nuovoSlotVoce();
    giroVoce(M(true, { gauges: G({ timeLeft: null }) }), slot, v, { graziaMs: 0, ora: 1000, livello });
    giroVoce(M(true, { gauges: G({ timeLeft: null }) }), slot, v, { graziaMs: 0, ora: 2000, livello });
    return v.items;
  };
  assert.deepEqual(senza('essenziale'), [], 'gara a giri (senza timeLeft): niente conto alla rovescia');
  assert.deepEqual(senza('full'), [], 'gara a giri (senza timeLeft): niente conto alla rovescia nemmeno in full');
});
