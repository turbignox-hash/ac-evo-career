// test/classifiche-gioco.test.mjs — le classifiche REALI del gioco lette
// dai file .sessionresults.json: la più recente prima, 0-based convertito
// in P1, nomi piloti verbatim, auto senza brand doppio, file rotti saltati.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classificheRecenti, classificaDiFile } from '../src/classifiche-gioco.mjs';

const dir = mkdtempSync(join(tmpdir(), 'acl-gio-'));
const results = join(dir, 'Results');
mkdirSync(results, { recursive: true });
const paths = { resultsDirs: [results] };
after(() => rmSync(dir, { recursive: true, force: true }));

// GARA (più recente): 0-based, brand già dentro car_name
const gara = {
  session: 'race', track: 'brands_hatch',
  drivers: [
    { position: 0, driver_name: 'Mauro', driver_surname: 'Conti', car_brand: 'Mazda', car_name: 'Mazda MX-5 ND Cup' },
    { position: 1, driver_name: 'Adrian', driver_surname: 'Palmer', car_brand: 'Mazda', car_name: 'MX-5 ND Cup' },
    { position: 2, driver_name: 'Elena', driver_surname: 'Rossi', car_brand: 'Mini', car_name: 'Cooper S' },
    { position: null, driver_name: 'Ritiro', driver_surname: 'Senza posizione', car_brand: '', car_name: '' },
  ],
};
// QUALIFICA (più vecchia): 1-based, doppio con nome=cognome
const quali = {
  session: 'qualifying', track: 'imola',
  drivers: [
    { position: 1, driver_name: 'Turbigno', driver_surname: 'Turbigno', car_brand: '', car_name: 'Ferrari 296 GT3' },
    { position: 2, driver_name: 'Mauro', driver_surname: 'Conti', car_brand: 'Mazda', car_name: 'MX-5 ND Cup' },
  ],
};

const F_GARA = join(results, '20261105-103000_SP_Race.sessionresults.json');
const F_QUALI = join(results, '20261105-093000_SP_Qualifying.sessionresults.json');
writeFileSync(F_GARA, JSON.stringify(gara));
writeFileSync(F_QUALI, JSON.stringify(quali));
// la gara è la più recente
utimesSync(F_GARA, new Date(), new Date('2026-11-05T10:30:00Z'));
utimesSync(F_QUALI, new Date(), new Date('2026-11-05T09:30:00Z'));
// ripiego: un file che non è un risultato e uno ROTTO non contano
writeFileSync(join(results, 'spazzatura.txt'), 'no');
writeFileSync(join(results, '20261105-080000_SP_Match.sessionresults.json'), '{non un json');

test('classificheRecenti: la gara più recente è la prima, poi la qualifica', () => {
  const g = classificheRecenti(paths, { limite: 3 });
  assert.deepEqual(g.sessions.map((s) => s.tipo), ['race', 'qualifying']);
  assert.equal(g.sessions[0].pista, 'brands_hatch');
  assert.equal(g.sessions[0].pilotiTot, 4);
  const righe = g.sessions[0].righe;
  assert.deepEqual(righe.map((r) => r.pos), [1, 2, 3, null]);
  assert.equal(righe[0].nome, 'Mauro Conti');
  assert.equal(righe[0].auto, 'Mazda MX-5 ND Cup'); // brand già dentro il nome: niente doppio
  assert.equal(righe[1].auto, 'Mazda MX-5 ND Cup'); // brand Mancante ricostrito
});

test('classificheRecenti: nome=cognome profilo vecchio resta una volta sola', () => {
  const g = classificheRecenti(paths, { limite: 3 });
  const q = g.sessions[1];
  assert.equal(q.tipo, 'qualifying');
  assert.equal(q.righe[0].pos, 1); // 1-based già sum: +base con base=0
  assert.equal(q.righe[0].nome, 'Turbigno');
  assert.equal(q.righe[1].nome, 'Mauro Conti');
});

test('classificheRecenti: limite rispettato e file rotti/sbagliati saltano', () => {
  const uno = classificheRecenti(paths, { limite: 1 });
  assert.equal(uno.sessions.length, 1);
  assert.equal(uno.sessions[0].tipo, 'race');
  const zero = classificheRecenti({ resultsDirs: [join(dir, 'Vuoto')] });
  assert.deepEqual(zero, { sessions: [] });
  assert.deepEqual(classificheRecenti(null), { sessions: [] });
});

test('positionBase: posizione assente non viene confusa con posizione zero', async () => {
  const { positionBase } = await import('../src/results.mjs');
  assert.deepEqual(positionBase({ drivers: [{ position: null }, { position: 1 }] }), { zeroBased: false, base: 1 });
  assert.deepEqual(positionBase({ drivers: [{ position: '' }, { position: 1 }] }), { zeroBased: false, base: 1 });
  assert.deepEqual(positionBase({ drivers: [{ position: 0 }, { position: 1 }] }), { zeroBased: true, base: 0 });
});

test('classificaDiFile: file illeggibile = null, mai scoppio', () => {
  assert.equal(classificaDiFile(join(results, 'spazzatura.txt')), null);
  assert.equal(classificaDiFile(join(results, 'non-esiste.json')), null);
});
