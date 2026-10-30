// preset-gara-veloce.test.mjs — I PRESET with NOME della gara al volo e la
// DURATA CONSIGLIATA per pista (30/10, Mauro: «preset con la mia auto» +
// «durata consigliata per pista»). Garanzie provate qui:
//   1. salvaPreset/leggiPreset: round-trip completo, SEDILE AUTO incluso;
//   2. una ricetta salvata è GIUSTA come una eseguita: la STESSA
//      validazione di garaVeloce (giri o tempo esclusivi, durata > 0,
//      banda 0–100, nome non vuoto) rifiuta PRIMA di toccare il file;
//   3. ri-salvare sovrascrive (un preset, la sua ultima versione) e
//      cancellaPreset è idempotente (true se c'era, false se no);
//   4. elencoPreset: riepilogo leggibile (la riga del registro) e ordine
//      dal più recente;
//   5. hotlapsPistaGiro: PB di pista dal quaderno, col sedile noto il PB
//      della SUA auto, pista fuori dal libro / quaderno vuoto → null
//      (silenzio, niente suggeriti inventati).
import './_game-sandbox.mjs';
import './_flows-sandbox.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Il quaderno live nel nido della SUA cartella (prima di importare hotlaps.mjs:
// HOTLAPS_FILE si calcola al caricamento del modulo).
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-preset-gv-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const { salvaPreset, leggiPreset, elencoPreset, cancellaPreset, ricettaNetta, PRESET_FILE } = await import('../tools/_gara-veloce.mjs');
const { hotlapsPistaGiro, HOTLAPS_FILE } = await import('../src/hotlaps.mjs');

test('preset: round-trip con la mia auto dentro', () => {
  assert.ok(!existsSync(PRESET_FILE), 'primo avvio: nessun file preset');
  const r = salvaPreset('endurance Monza', { giri: 12, aiMin: 90, aiMax: 94, auto: 'ks_ferrari_296_gt3', pista: 'Monza', pool: ['ks_ferrari_296_gt3', ' ks_audi_r8_lms_gt4_evo '] });
  assert.equal(r.giri, 12);
  assert.equal(r.auto, 'ks_ferrari_296_gt3');
  assert.deepEqual(r.pool, ['ks_ferrari_296_gt3', 'ks_audi_r8_lms_gt4_evo'], 'il pool attorno alle virgole, spazi capiti');
  const p = leggiPreset('endurance Monza');
  assert.ok(p);
  assert.equal(p.tempo, null, 'giri e tempo si escludono anche nel salvato');
  assert.equal(p.auto, 'ks_ferrari_296_gt3');
  assert.equal(p.pista, 'Monza');
  assert.ok(p.at, 'la data del salvataggio c\'è');
  assert.equal(leggiPreset('mai-salvato'), null, 'un nome assente: null, mai un\'eccezione');
});

test('preset: la STESSA validazione di garaVeloce, prima del file', () => {
  assert.throws(() => salvaPreset('', { giri: 5 }), (e) => e.code === 'NO_NOME');
  assert.throws(() => salvaPreset('doppia', { giri: 5, tempo: 30 }), (e) => e.code === 'NO_ENTRAMBI');
  assert.throws(() => salvaPreset('zeri', { tempo: 0 }), (e) => e.code === 'BAD_DURATA');
  assert.throws(() => salvaPreset('banda', { giri: 5, aiMin: 88, aiMax: 300 }), (e) => e.code === 'BAD_BANDA');
  assert.equal(ricettaNetta({ giri: 2.7, aiMin: 88, aiMax: 93 }).giri, 3, 'giri frazionari: si arrotonda, non si rifiutano');
  assert.ok(!leggiPreset('doppia') && !leggiPreset('zeri') && !leggiPreset('banda'), 'nessun errore ha salvato un preset');
});

test('preset: ri-salva sovrascrive, elenco ordina dal recente, cancella idempotente', async () => {
  cancellaPreset('endurance Monza');                 // il round-trip di prima: svuoto il quaderno

  await new Promise((r) => setTimeout(r, 5));       // il save al secondo
  salvaPreset('gara B', { tempo: 30 });
  await new Promise((r) => setTimeout(r, 5));
  const bSeconda = salvaPreset('gara A', { giri: 8, auto: 'auto_1' });   // sovrascrive in silenzio
  assert.equal(bSeconda.giri, 8);
  const tutti = elencoPreset();
  assert.equal(tutti.length, 2, 'due nomi, non tre: il ri-salvataggio è cura, non accumulo');
  assert.deepEqual(tutti.map((x) => x.nome), ['gara A', 'gara B'], 'il più recente primo (gara A è stata SOVRASCRITTA ora)');
  assert.ok(tutti[0].riga, 'la riga di riepilogo (formattaRigaRegistro) è nell\'elenco');
  assert.equal(cancellaPreset('gara B'), true);
  assert.equal(cancellaPreset('gara B'), false, 'cancellare due volte: la seconda è già assente, non un errore');
  assert.equal(leggiPreset('gara B'), null);
});

test('preset: senza giri e senza tempo NON è una gara', () => {
  assert.throws(() => salvaPreset('vuota', { aiMin: 88, aiMax: 93, auto: 'auto_x' }), (e) => e.code === 'NO_RECIPE');
});

test('hotlapsPistaGiro: PB di pista dal quaderno', () => {
  writeFileSync(HOTLAPS_FILE, JSON.stringify({
    sessions: [
      { car: 'ks_ferrari_296_gt3', carPretty: 'Ferrari 296 GT3', track: 'imola', bestLapMs: 105000, lapsCount: 5, at: '2026-10-20T10:00:00.000Z' },
      { car: 'ks_porsche_718_cayman_gt4_rs', carPretty: 'Porsche 718 Cayman GT4 RS', track: 'imola', bestLapMs: 104000, lapsCount: 5, at: '2026-10-21T10:00:00.000Z' },
      { car: 'ks_ferrari_296_gt3', carPretty: 'Ferrari 296 GT3', track: 'monza', bestLapMs: 93306, lapsCount: 3, at: '2026-10-21T15:48:02.991Z' },
    ],
    records: [{ car: 'ks_ferrari_296_gt3', carPretty: 'Ferrari 296 GT3', track: 'imola', lapMs: 105000, at: '2026-10-20T10:00:00.000Z' }],
  }));
  const imola = hotlapsPistaGiro('Imola');
  assert.ok(imola);
  assert.equal(imola.lapMs, 104000, 'il PB di pista: LA più veloce, auto qualsiasi');
  assert.equal(imola.lapText, '1:44.000');
  assert.equal(imola.perCar, false);
  const own = hotlapsPistaGiro('imola', 'Ferrari 296 GT3');
  assert.equal(own.lapMs, 105000, 'col sedile noto: il SUO PB');
  assert.equal(own.perCar, true);
  assert.equal(hotlapsPistaGiro('Pista Che Non C\'è'), null, 'pista fuori dal libro: null, niente inventati');
});
