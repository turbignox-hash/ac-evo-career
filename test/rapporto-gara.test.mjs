// test/rapporto-gara.test.mjs — il rapporto di gara condivisibile, provato su
// una griglia finta in cartella temporanea (mai il data/ vero):
//   1. il MD si compone dal file risultato: titolo, podio, classifica nel
//      blocco monospazio, penalità, la tua riga, giro teorico dai settori;
//   2. il file .rapporto.md si salva SOLO nella cartella di test (env);
//   3. file assente → errore, niente tiri;
//   4. l'HTML porta la tabella e la tua riga in oro.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'rapporto-test-'));
const RESULTS = join(TMP, 'Results');
const GARE = join(TMP, 'rapporti');
process.env.EVO_REPORT_DIR = GARE;   // il .md di prova NON tocca report/gare/ vero
mkdirSync(RESULTS, { recursive: true });

const rg = await import('../src/rapporto-gara.mjs');

/** una riga come la scrive EVO (best in m:ss.d, splits in 00:xx.xxx) */
const ai = (over = {}) => ({
  driver_name: '• AI', driver_surname: 'X', position: 0, laps: 3,
  car_name: 'GT3 Evo', car_brand: 'Silver',
  best_lap: '2:34.900', has_best_lap: true, total_time: '7:58.900', splits: [],
  ...over,
});

const FILE = '260416-2108_Race.sessionresults.json';
const gara = {
  season: '2026', event: 'week-3', session: 'race',
  track: 'Misano World Circuit', layout: 'Full',
  hour: 15, min: 30, weather_type: 'GameModeSelectionWeatherType_Sun',
  drivers: [
    ai({ driver_name: '• AI', driver_surname: 'A1', position: 0, best_lap: '2:34.900', total_time: '7:58.900' }),
    ai({ driver_name: 'Pietro', driver_surname: 'Pitwall', position: 1, is_current_driver: true, has_best_lap: false, best_lap: '2:35.100', total_time: '7:59.300', splits: ['00:44.310', '00:47.328', '01:07.017'] }),
    ai({ driver_name: '• AI', driver_surname: 'B2', position: 2, best_lap: '2:36.400', total_time: '8:01.000', high_penalty: '+5.0s' }),
  ],
};
writeFileSync(join(RESULTS, FILE), JSON.stringify(gara), 'utf8');
const paths = { resultsDirs: [RESULTS] };

test('il MD si compone dal file risultato: podio, blocco classifica, penalità, TUA riga e settori', () => {
  const rip = rg.rapportoGara(paths, FILE, { driver: { first: 'Pietro', last: 'Pitwall', name: 'Pietro Pitwall' } });
  assert.ok(!rip.error, `niente errore: ${JSON.stringify(rip.error)}`);
  const md = rip.md;
  assert.match(md, /🏁 \*\*RAPPORTO GARA · Misano World Circuit — Full\*\*/, 'titolo con pista e layout');
  assert.match(md, /15:30/, 'l\'orario del file');
  assert.match(md, /🥇 \*\*P1\*\*/, 'il podio c\'è');
  assert.match(md, /```/, 'la classifica va nel blocco monospazio (Discord non disegna tabelle)');
  assert.match(md, /\+5\.0s/, 'la penalità di EVO entra nella classifica');
  assert.match(md, /▸ Pietro/, 'la tua riga marchiata ▸ nel blocco');
  assert.match(md, /⭐ TU: \*\*P2\*\*/, 'la tua gara in testa al dossier');
  assert.match(md, /Giro teorico/, 'il giro teorico dai tuoi settoriali (dai splits del file)');
  assert.match(md, /Settore 1 \+0\.000|Settore 1 /, 'i settori del tuo giro');
  assert.match(md, /⚡ Giro veloce: \*\*2:34\.900\*\*/, 'il giro veloce con il suo autore');
  assert.ok(!stripLit(md).includes('undefined'), 'nessun "undefined" nel testo');
  return rip;
});

function stripLit(s) { return String(s ?? ''); }

test('il file .rapporto.md si salva nella cartella di test e riporta lo stesso testo', () => {
  const rip = rg.rapportoGara(paths, FILE, { driver: { first: 'Pietro', last: 'Pitwall', name: 'Pietro Pitwall' } });
  assert.ok(rip.salvatoMd && existsSync(rip.salvatoMd), `il .md è salvato: ${rip.salvatoMd}`);
  assert.equal(readFileSync(rip.salvatoMd, 'utf8'), rip.md, 'il file salvato = il testo mostrato');
});

test('file assente: errore chiaro, nessun lancio', () => {
  const rip = rg.rapportoGara(paths, '000000-0000_Non_Esiste.sessionresults.json', { driver: null });
  assert.ok(rip.error, `errore dichiarato: ${JSON.stringify(rip)}`);
});

test('file senza giri: rapporto ma senza settori e senza numeri inventati', () => {
  const f2 = '260416-2110_Race.sessionresults.json';
  writeFileSync(join(RESULTS, f2), JSON.stringify({ ...gara, drivers: gara.drivers.map((d) => ({ ...d, laps: 0, splits: [] })) }), 'utf8');
  const rip = rg.rapportoGara(paths, f2, { driver: { first: 'Pietro', last: 'Pitwall', name: 'Pietro Pitwall' } });
  assert.ok(!rip.error, `niente errore: ${JSON.stringify(rip.error)}`);
  assert.ok(!rip.md.includes('Giro teorico'), 'senza splits niente giro teorico (nessun numero inventato)');
});

test('l\'HTML porta la tabella e la TUA riga in oro (classe me)', () => {
  const rip = rg.rapportoGara(paths, FILE, { driver: { first: 'Pietro', last: 'Pitwall', name: 'Pietro Pitwall' } });
  assert.match(rip.html, /<table class="tab">/, 'la tabella di classificazione');
  assert.match(rip.html, /<tr class="me">/, 'la tua riga evidenziata');
  assert.match(rip.html, /\+5\.0s/, 'la penalità anche nel HTML');
});
