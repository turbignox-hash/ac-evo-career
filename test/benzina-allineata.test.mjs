// 6/11 — LA BENZINA DEL MECCANICO È UNA SOLA (richiesta di Mauro: «allinea la
// formula fra meccanico e applicazione del setup, così danno lo stesso numero»).
// Prima: la carta (pianoSetup) calcolava ceil(consumo × giri × 1,05) + 3 L e
// l'applicazione (mechanicExtraEdits) ceil(consumo × giri × 1,05) — tre litri
// in meno, e la qualifica esisteva solo sulla carta. Ora la formula sta in
// src/benzina.mjs e i due percorsi la chiamano: qui si verifica che il NUMERO
// che il meccanico dice sia quello che il setup scrive, caso per caso, e che
// nessuno dei due possa tornare a farsi la sua.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { benzinaDelMeccanico, QUALI_GIRI, RISERVA_L, BENZINA_CAP_L } from '../src/benzina.mjs';
import { pianoSetup } from '../src/meccanico-parla.mjs';
import { mechanicExtraEdits } from '../src/setup.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

const curBase = {
  tires: [{ pressure: 27.0 }, { pressure: 27.0 }, { pressure: 26.5 }, { pressure: 26.5 }],
  fuel: { liters: 34 },
};

/** La carta: litri che il piano scrive nel file. */
function carta(tipo, raceLaps, fuelPerLap) {
  const p = pianoSetup({ tipo, raceLaps, cur: curBase, sessione: { fuelPerLap } });
  return { litri: p.edits.fuel?.liters ?? null, nota: p.note.join(' ') };
}

/** L'applicazione: litri che la patch del setup scrive nel file. */
function applicato(tipo, raceLaps, fuelPerLap) {
  const mech = mechanicExtraEdits({
    cur: curBase,
    latest: { trackOk: false, fuelPerLap, raceLaps },
    tipo,
  });
  return mech.patches.fuel?.liters ?? null;
}

test('gara 8 giri, 2.1 L/giro: carta e setup scrivono lo stesso numero (21 L)', () => {
  assert.equal(benzinaDelMeccanico({ tipo: 'gara', fuelPerLap: 2.1, raceLaps: 8 }).litri, 21); // ceil(17.64)+3
  assert.equal(carta('gara', 8, 2.1).litri, 21);
  assert.equal(applicato('gara', 8, 2.1), 21);
});

test('gara 20 giri, 2.5 L/giro: 56 L per entrambi (i 3 L che prima mancavano)', () => {
  assert.equal(benzinaDelMeccanico({ tipo: 'gara', fuelPerLap: 2.5, raceLaps: 20 }).litri, 56); // ceil(52.5)+3
  assert.equal(carta('gara', 20, 2.5).litri, 56);
  assert.equal(applicato('gara', 20, 2.5), 56);
});

test('qualifica: 2 giri di verifica + 1 + riserva, uguale per entrambi (10 L)', () => {
  assert.equal(benzinaDelMeccanico({ tipo: 'qualifica', fuelPerLap: 2.1 }).litri, 10); // ceil(6.3)+3
  assert.equal(carta('qualifica', null, 2.1).litri, 10);
  assert.equal(applicato('qualifica', null, 2.1), 10);
});

test('bagnato e gara usano lo stesso piano; senza giri di gara si va su 10', () => {
  assert.equal(carta('bagnato', 8, 2.1).litri, 21);
  assert.equal(applicato('bagnato', 8, 2.1), 21);
  const senzaGiri = benzinaDelMeccanico({ tipo: 'gara', fuelPerLap: 2.1, raceLaps: null });
  assert.equal(senzaGiri.giri, 10);
  assert.equal(senzaGiri.litri, 26); // ceil(22.05)+3
  assert.equal(carta('gara', null, 2.1).litri, 26);
  assert.equal(applicato('gara', null, 2.1), 26);
});

test('la nota che il meccanico detta contiene lo stesso numero del file', () => {
  const { litri, nota } = carta('gara', 20, 2.5);
  assert.equal(litri, 56);
  assert.match(nota, /Benzina da gara: 56 L/);
  assert.match(nota, /20 giri/);
  assert.match(nota, /\+3 L di riserva/);
});

test('cap del serbatoio: 120 L, mai oltre, per entrambi', () => {
  assert.equal(benzinaDelMeccanico({ tipo: 'gara', fuelPerLap: 10, raceLaps: 20 }).litri, BENZINA_CAP_L);
  assert.equal(carta('gara', 20, 10).litri, BENZINA_CAP_L);
  assert.equal(applicato('gara', 20, 10), BENZINA_CAP_L);
});

test('senza consumo reale nessuno tocca la benzina (dato sporco sotto 0.3 L/giro)', () => {
  assert.equal(benzinaDelMeccanico({ tipo: 'gara', fuelPerLap: 0.2, raceLaps: 10 }), null);
  const p = pianoSetup({ tipo: 'gara', raceLaps: 10, cur: curBase, sessione: { fuelPerLap: 0.2 } });
  assert.equal(p.edits.fuel, undefined);
  assert.match(p.note.join(' '), /Benzina invariata/);
  assert.equal(applicato('gara', 10, 0.2), null);
});

test('guardia: la formula vive solo in src/benzina.mjs, i due moduli la importano', () => {
  const f = join(SRC, 'benzina.mjs');
  assert.ok(existsSync(f));
  for (const mod of ['meccanico-parla.mjs', 'setup.mjs']) {
    const src = readFileSync(join(SRC, mod), 'utf8');
    assert.match(src, /from '\.\/benzina\.mjs'/, `${mod}: deve importare la formula condivisa`);
    assert.doesNotMatch(src, /\*\s*1\.05/, `${mod}: nessuna seconda copia del +5% (usare benzinaDelMeccanico)`);
  }
  assert.equal(QUALI_GIRI, 2);
  assert.equal(RISERVA_L, 3);
});
