// pd-main.test.mjs — IL JOURNAL DELLA GARA DI PADDOCK (4/11/2026).
//
// pd-main e' la vista «Race» dell'app: l'ultima gara preparata, con auto,
// formato, avversari e banda AI. E' la fonte che ci mancava per non mostrare
// il numero del ladder (14) quando il journal dice 15. Qui si custodisce:
//   • si prende SEMPRE il pd-main piu' recente (mtime), come gli altri journal;
//   • il numero avversari e la banda AI arrivano da li';
//   • journalRaceForNode lo accetta solo se la serie combacia col nodo ladder.
//
// Niente game ne server: un nido di journal finti in tmpdir.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appRaceInfo, journalRaceForNode, appCacheClear } from '../src/app-carriera.mjs';

const NIDO = mkdtempSync(join(tmpdir(), 'evo-pdmain-'));
const DATI = mkdtempSync(join(tmpdir(), 'evo-pdmain-data-'));
process.env.APP_JOURNAL_DIR = NIDO;
process.env.EVO_DATA_DIR = DATI;

function scrivi(hash, body, at) {
  const f = join(NIDO, `pd-main-${hash}.json`);
  writeFileSync(f, JSON.stringify(body), 'utf8');
  utimesSync(f, new Date(at), new Date(at));
  return f;
}

const GARA = {
  career: { series: 'Mazda MX-5 Cup' },
  race: {
    track: 'Donington Park',
    cars: ['Mazda MX-5 ND Cup'],
    format: 'single_make',
    opponents: 15,
    aiMin: 80,
    aiMax: 85,
  },
};

after(() => {
  try { rmSync(NIDO, { recursive: true, force: true }); } catch { /* pulizia */ }
  try { rmSync(DATI, { recursive: true, force: true }); } catch { /* pulizia */ }
});

test('appRaceInfo prende il pd-main PIU RECENTE e ne espone i campi veri', () => {
  scrivi('vecchio', { ...GARA, race: { ...GARA.race, opponents: 12, aiMin: 70, aiMax: 75 } }, Date.now() - 10000);
  scrivi('nuovo', GARA, Date.now());
  appCacheClear();

  const r = appRaceInfo();
  assert.ok(r, 'pd-main leggibile');
  assert.equal(r.opponents, 15, 'il piu recente dice 15: il vecchio 12 non deve vincere');
  assert.equal(r.format, 'single_make');
  assert.equal(r.singleMake, true);
  assert.equal(r.aiMin, 80);
  assert.equal(r.aiMax, 85);
  assert.deepEqual(r.cars, ['Mazda MX-5 ND Cup']);
  assert.equal(r.series, 'Mazda MX-5 Cup');
});

test('journalRaceForNode: la serie combacia per auto e il numero e quello del journal', () => {
  appCacheClear();
  const nodo = { nodeId: 'mx5_cup', display: 'Mazda MX-5 Cup', cars: ['ks_mazda_mx5_nd_cup'] };
  const r = journalRaceForNode(nodo);
  assert.ok(r, 'la MX-5 del journal deve appartenere alla serie MX-5 del ladder');
  assert.equal(r.opponents, 15);
  assert.equal(r.aiMin, 80);
  assert.equal(r.track, 'Donington Park');

  const altro = { nodeId: 'gt3', display: 'GT3 Series', cars: ['ks_ferrari_296_gt3'] };
  assert.equal(journalRaceForNode(altro), null,
    'il journal di un altra serie non deve passare: la card mostrerebbe numeri falsi.');
});
