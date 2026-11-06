// test/delta-riferimento.test.mjs — A COSA SI RIFERISCE IL DELTA (7/11).
//
// Richiesta di Mauro: «il delta è sbagliato dal display a copilota, non capisco
// a cosa si riferisce il suo, se best riferito a chi o parziali».
//
// Due difetti veri misurati sui 697 campioni della gara di Donington del 6/11:
//  1) il best tracciato non si agganciava MAI, perché `_commitLap` leggeva
//     `isValidLap` nell'istante del cambio giro e lì EVO scrive `false` (giri 1,
//     2 e 3 tutti `false` all'ultimo frame, `true` tre secondi dopo). Risultato:
//     delta tracciato disponibile solo negli ultimi campioni, per il resto la
//     pagina mostrava il delta del gioco — due riferimenti diversi, numero
//     diverso fra display e copilota;
//  2) a gara chiusa il cronometro del giro resta congelato mentre l'auto
//     rientra: i campioni nuovi portavano tutti lo stesso tempo e il delta
//     tracciato usciva a +105 s (TUTTI i 17 campioni 'tracked' della gara).
//
// Qui si provano le due porte: la validità a maggioranza e il cronometro fermo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveReader } from '../src/shmem.mjs';

// giro plausibile: 90 campioni, un giro da 90 s
const pista = Array.from({ length: 90 }, (_, k) => ({ x: k * 40, z: 0, t: k * 1000 }));

function lettore() {
  const r = new LiveReader();
  r.lapTrack = pista.map((p) => ({ ...p }));
  r.last.graphics = { status: 2, isValidLap: false, lapMs: { last: 90000, current: 2000 } };
  return r;
}

test('best tracciato: il giro si committa anche se al traguardo isValidLap è false (lampeggio del gioco)', () => {
  const r = lettore();
  // il giro è stato valido per 86 campioni su 90: il lampeggio finale non conta
  r.lapValidi = 86;
  r.lapInvalidi = 4;
  r._commitLap(2);
  assert.equal(r.bestLapMs, 90000, 'il best deve agganciarsi: era questo il buco del 6/11');
  assert.equal(r.bestLapNo, 2);
  assert.equal(r.bestTrack.length, 90);
});

test('best tracciato: un giro TAGLIATO (invalido quasi sempre) non diventa riferimento', () => {
  const r = lettore();
  r.lapValidi = 6;
  r.lapInvalidi = 84;
  r._commitLap(2);
  assert.equal(r.bestLapMs, null, 'un giro quasi tutto invalido non deve dettare il delta');
});

test('best tracciato: con un best già committato vince solo il giro più veloce', () => {
  const r = lettore();
  r.bestLapMs = 88000;
  r.bestTrack = pista.map((p) => ({ ...p }));
  r.bestLapNo = 1;
  r.lapValidi = 86;
  r.lapInvalidi = 4;
  r._commitLap(2);
  assert.equal(r.bestLapMs, 88000, 'un giro più lento non sostituisce il best');
  assert.equal(r.bestLapNo, 1);

  // il giro dopo riempie di nuovo la sua traccia (in gara lo fa l'auto in pista)
  r.lapTrack = pista.map((p) => ({ ...p }));
  r.last.graphics.lapMs.last = 87000;
  r.lapValidi = 86;
  r.lapInvalidi = 4;
  r._commitLap(3);
  assert.equal(r.bestLapMs, 87000, 'il giro più veloce prende il posto');
  assert.equal(r.bestLapNo, 3);
});

test('cronometro fermo: l\'auto si muove ma il tempo del giro no → niente campione e niente delta tracciato', () => {
  const r = lettore();
  r.bestTrack = pista.map((p) => ({ ...p }));
  r.bestLapMs = 90000;
  r.bestLapNo = 1;
  r.lapTrack = [{ x: 0, z: 0, t: 90000 }];
  r.last.graphics.lapMs.current = 90000;

  // 300 m percorsi col cronometro fermo sull'ultimo giro: il caso dei +105 s
  for (let k = 1; k <= 10; k++) r._campionaGiro(k * 30, 0, 90000, { isValidLap: true });
  assert.equal(r.lapTimerFermo, true, 'il cronometro fermo va riconosciuto');
  assert.equal(r.lapTrack.length, 1, 'nessun campione con un tempo che non avanza');
  const d = r._deltaInfo();
  assert.equal(d.source, 'hud', 'senza cronometro non si pubblica un tracciato');
  assert.equal(d.lapTimerFermo, true);

  // il cronometro riparte: si campiona di nuovo e il tracciato torna
  r._campionaGiro(330, 0, 91000, { isValidLap: true });
  assert.equal(r.lapTimerFermo, false);
  assert.equal(r.lapTrack.length, 2);
  assert.equal(r._deltaInfo().source, 'tracked');
});

test('il riferimento nominato dal payload è il NOSTRO giro, non il best del gioco', () => {
  const r = lettore();
  r.bestTrack = pista.map((p) => ({ ...p }));
  r.bestLapMs = 90000;
  r.bestLapNo = 2;
  r.lapNoSeen = 3;
  r.lapTrack = pista.map((p) => ({ ...p, t: p.t + 500 }));
  // il gioco dice un best diverso (e più veloce): l'etichetta deve citare il nostro
  r.last.graphics = { status: 2, isValidLap: true, lapMs: { current: 89500, best: 87000 } };
  const d = r._deltaInfo();
  assert.equal(d.source, 'tracked');
  assert.equal(d.bestLapMs, 90000, 'bestLapMs del delta = giro tracciato, non il best del gioco');
  assert.equal(d.bestLapNo, 2);
});
