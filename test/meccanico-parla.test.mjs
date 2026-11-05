// test/meccanico-parla.test.mjs — la voce del meccanico: il testo libero
// diventa un'intenzione chiara, il nome del file è VERO («Qualifica»,
// «Gara 8 giri», «Bagnato» — mai «consigliato»), il piano tocca benzina e
// pressioni SOLO con un dato reale in mano. Invenzione zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiIntenzione, nomeSetup, pianoSetup } from '../src/meccanico-parla.mjs';

test('leggiIntenzione: parole chiare, giri presi dal testo, preset esplicito', () => {
  assert.deepEqual(leggiIntenzione('preparami il setup da qualifica'), { tipo: 'qualifica', raceLaps: null });
  assert.deepEqual(leggiIntenzione('gara con benzina giusta'), { tipo: 'gara', raceLaps: null });
  assert.deepEqual(leggiIntenzione('gara di 12 giri'), { tipo: 'gara', raceLaps: 12 });
  assert.deepEqual(leggiIntenzione('setup bagnato con gomme giuste'), { tipo: 'bagnato', raceLaps: null });
  // la pioggia vinava prima dell'idea di pista: «bagnato gara» → BAGNATO
  assert.deepEqual(leggiIntenzione('bagnato gara'), { tipo: 'bagnato', raceLaps: null });
  // la chip schiacciata nella GUI vince quando non c'è testo
  assert.deepEqual(leggiIntenzione('', 'qualifica'), { tipo: 'qualifica', raceLaps: null });
  // niente parole chiare: il meccanico chiede di ripetere, non indovina
  assert.deepEqual(leggiIntenzione('ciao come va?'), { tipo: null, raceLaps: null });
});

test('nomeSetup: nomi VERO senza il vocale «consigliato»', () => {
  assert.equal(nomeSetup('qualifica'), 'Qualifica');
  assert.equal(nomeSetup('gara'), 'Gara');
  assert.equal(nomeSetup('gara', 8), 'Gara 8 giri');
  assert.equal(nomeSetup('bagnato'), 'Bagnato');
  assert.equal(nomeSetup(null), null);
});

const curBase = {
  tires: [ { pressure: 27.0 }, { pressure: 27.0 }, { pressure: 26.5 }, { pressure: 26.5 } ],
  fuel: { liters: 34 },
};

test('pianoSetup qualifica: benzina minima e pressioni dal vivo', () => {
  const p = pianoSetup({
    tipo: 'qualifica', cur: curBase,
    sessione: { fuelPerLap: 2.1 },
    live: { psi: [27.0, 27.0, 26.5, 26.5] },
    tyreTarget: 27.9,
  });
  assert.ok(p);
  // benzina: ceil(2.1 × (2+1)) + 3 = ceil(6.3)=7 +3 = 10 L
  assert.equal(p.edits.fuel.liters, 10);
  const benz = p.righe.find((r) => r.campo === 'benzina');
  assert.equal(benz.a, 10);
  // pressioni: il FILE parte da 27.0/26.5 SELLO STESSO del vivo → nessuna patch
  assert.equal(p.edits.tires, undefined);
  assert.ok(p.note.join(' ').includes('qualifica'));
});

test('pianoSetup gara: cola da 8 giri + pressioni per ruota diverse', () => {
  const p = pianoSetup({
    tipo: 'gara', raceLaps: 8, cur: curBase,
    sessione: { fuelPerLap: 2.1 },
    live: { psi: [27.2, 27.4, 26.6, 26.8] },
  });
  const benz = p.righe.find((r) => r.campo === 'benzina');
  // ceil(2.1×8×1.05)=ceil(17.64)=18 +3 = 21 L
  assert.equal(benz.a, 21);
  // per ruota: il vivo chiede 27.2/27.4/26.6/26.8, il file parte da 27.0/27.0/26.5/26.5:
  // tutte e quattro le gomme vanno scritte (scarto ≥ 0,05 psi).
  const righePsi = p.righe.filter((r) => r.campo?.startsWith('gomma '));
  assert.deepEqual(righePsi.map((r) => [r.campo, r.a]), [
    ['gomma LF', 27.2],
    ['gomma RF', 27.4],
    ['gomma LR', 26.6],
    ['gomma RR', 26.8],
  ]);
  assert.match(p.risposta, /Gara 8 giri/);
});

test('pianoSetup bagnato: psi scaricate di 1,5 e nota sul composto in gioco', () => {
  const p = pianoSetup({
    tipo: 'bagnato', cur: curBase,
    sessione: { fuelPerLap: 2.3 },
    live: { psi: [27.0, 27.0, 26.5, 26.5] },
  });
  const gomma = p.righe.find((r) => r.campo === 'gomma LF');
  assert.equal(gomma.a, 25.5); // 27.0 − 1.5
  assert.ok(p.note.join(' ').includes('gomma pioggia'));
  assert.match(p.risposta, /Bagnato/);
});

test('pianoSetup: SENZA dato reale, nessuna cifra inventata (benzina e psi toccati male)', () => {
  const p = pianoSetup({ tipo: 'gara', raceLaps: 10, cur: curBase, sessione: null, live: null });
  assert.equal(p.edits.fuel, undefined);
  assert.equal(p.edits.tires, undefined);
  assert.ok(p.note.length >= 2);
  // ci sono le due spiegazioni sui dati mancanti
  assert.ok(p.note.some((n) => n.includes('Pressioni invariate')));
  assert.ok(p.note.some((n) => n.includes('Benzina invariata')));
});

test('pianoSetup: senza cur o tipo → null (mai scoppio)', () => {
  assert.equal(pianoSetup({ tipo: 'gara' }), null);
  assert.equal(pianoSetup({ cur: curBase }), null);
});
