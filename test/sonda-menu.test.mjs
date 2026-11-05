// sonda-menu.test.mjs — la sonda non deve mai accettare comandi di scrittura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-sonda-'));
const { avviaSonda, statoSonda, sondaFascia, assorbiSonda, sondaReset } = await import('../src/uiapp-pub.mjs');

test('sonda: parte con i quattro read-only e scarta i comandi di scrittura', () => {
  sondaReset();
  const es = avviaSonda([
    'CurrentCar',                                // alias corto della CLI
    'CarSelectionClientRequestSetCurrentCar',   // scrittura: MAI
    'GameModeSelectionClientRequestCurrentTrack',
  ]);
  assert.equal(es.ok, true);
  assert.equal(es.pending.comandi.length, 2);
  assert.deepEqual(es.pending.comandi.map((c) => c.cmd), [
    'CarSelectionClientRequestCurrentCar',
    'GameModeSelectionClientRequestCurrentTrack',
  ]);
  assert.ok(sondaFascia());
});

test('sonda: una in corso non si accavalla', () => {
  sondaReset();
  assert.equal(avviaSonda().ok, true);
  const seconda = avviaSonda();
  assert.equal(seconda.ok, false);
  assert.match(seconda.motivo, /già in corso/);
});

test('sonda: l esito con l id giusto chiude la coda e resta leggibile', () => {
  sondaReset();
  const avvio = avviaSonda(['GameModeSelectionClientRequestWeatherData']);
  const id = avvio.pending.id;
  const esito = assorbiSonda({ id, risposte: [{ cmd: 'GameModeSelectionClientRequestWeatherData', ok: true, ms: 12, dati: { weather: 'CLEAR' } }] });
  assert.equal(esito.id, id);
  assert.equal(esito.risposte.length, 1);
  assert.equal(statoSonda().pending, null);
  assert.equal(statoSonda().ultima.id, id);
});

test('sonda: un esito di un altro id non chiude la coda', () => {
  sondaReset();
  avviaSonda();
  assert.equal(assorbiSonda({ id: 'altro', risposte: [] }), null);
  assert.ok(statoSonda().pending);
});
