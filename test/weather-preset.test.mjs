// 2/11 — SETTIMA FILA: IL METEO SENZA EVO. src/weather.mjs (202 righe) non
// aveva NESSUN test unit: è il modulo che legge e PATCHA IN-PLACE il preset
// meteo del gioco in gamemode.lastgamemode (protobuf senza schema, scoperta
// del 20/10). Qui non si tocca MAI il gioco: ACE_GAME_SAVEDIR viene ridirigto
// in tmpdir PRIMA dell'import, e in più ogni funzione accetta lgmFile
// esplicito. I file fixture sono scritti con lo STESSO encodeMsg del tool
// (decode ed encode condividono lo stesso codec: se il codec è giusto per
// l'encode è giusto per il decode del modulo in test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg, decodeMsg } from '../tools/evo-grid.mjs';

const GAME = mkdtempSync(join(tmpdir(), 'evo-wx-game-'));
process.env.ACE_GAME_SAVEDIR = GAME;          // prima dell'import: niente LGM reale
const { currentWeatherPreset, setWeatherPreset, setWeatherCustom, presetFor, presetForLabel, PRESETS } = await import('../src/weather.mjs');

const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return new Uint8Array(b); };
// uno STEP della timeline: field 3 (wire 2) → payload meteo con rain(8)/cloud(11)/fog(12) float
const step = (rain, cloud, fog) => encodeMsg([{ field: 3, wire: 2, bytes: encodeMsg([
  { field: 8, wire: 5, bytes: f32(rain) },
  { field: 11, wire: 5, bytes: f32(cloud) },
  { field: 12, wire: 5, bytes: f32(fog) },
]) }]);
const stepsOf = (n = 9, rx = 0.2, cl = 0.5, fg = 0.0) =>
  Array.from({ length: n }, () => ({ field: 3, wire: 2, bytes: step(rx, cl, fg) }));
// il file LGM: solo timeline → preset ASSENTE (proto3: sereno = omesso, visto
// realmente il 20/10); con preset → field 2 in cima
const lgmOf = (preset, mk = stepsOf) =>
  preset == null ? encodeMsg(mk())
    : encodeMsg([{ field: 2, wire: 0, varint: BigInt(preset) }, ...mk()]);
const writeLgm = (name, preset, mk) => {
  const f = join(GAME, name);
  writeFileSync(f, lgmOf(preset, mk), null);
  return f;
};
const vecEq = (a, b, eps = 1e-6) => {
  const v = Buffer.from(a).readFloatLE(0);
  return v > b - eps && v < b + eps;
};

test('PRESETS: gli 8 preset EVO in ordine (0 sereno … 7 custom)', () => {
  assert.equal(PRESETS.length, 8);
  assert.deepEqual(PRESETS.map((p) => p.key), ['sereno', 'sparse', 'nuvoloso', 'coperto', 'drizzle', 'rain', 'heavy', 'custom']);
  assert.deepEqual(PRESETS.map((p) => p.id), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('presetFor: per key, per label, per NUMERO 0-7, per nomi in gioco ("heavy", "light rain")', () => {
  for (const p of PRESETS) {
    assert.equal(presetFor(p.key), p.id, p.key);
    assert.equal(presetFor(p.label), p.id, p.label);
  }
  assert.equal(presetFor(3), 3);
  assert.equal(presetFor('6'), 6);
  assert.equal(presetFor('heavy rain'), 6);       // varianti del menu in EN/IT
  assert.equal(presetFor('pioggia intesa'), 5);   // typo: resta nella banda "pioggia"
  assert.equal(presetFor('light rain'), 4);       // BUG VERO (2/11): 'light rain'.includes('rain')
  // matchava la banda 5 PRIMA della banda 4 → al posto della drizzle si partiva bagnato pesante
  assert.equal(presetFor(null), null);
  assert.equal(presetFor('nebbiosa'), null);      // preset che EVO NON ha
  assert.equal(presetFor(3.2), null);             // non intero: non un preset
});

/* ------------------------------------------------ */
/*  la traduzione ladder → preset: per NOME, mai per numero */
/* ------------------------------------------------ */

test('presetForLabel: le etichette ladder vanno al preset GIUSTO (le due numerazioni NON coincidono)', () => {
  assert.equal(presetForLabel('Clear'), 0);
  assert.equal(presetForLabel('Scattered clouds'), 1);
  assert.equal(presetForLabel('Overcast'), 2);
  assert.equal(presetForLabel('Cloudy'), 2);
  assert.equal(presetForLabel('Light rain'), 4);   // NON 3: il 3 di EVO è "Coperto"
  assert.equal(presetForLabel('Rain'), 5);         // NON 4: la secca = 5
  assert.equal(presetForLabel('Heavy rain'), 6);
  assert.equal(presetForLabel('sereno'), 0);
  assert.equal(presetForLabel('Sole'), 0);
  assert.equal(presetForLabel(null), null);
  assert.equal(presetForLabel('   '), null);
  assert.equal(presetForLabel('vento cans'), null);
});

/* ------------------------------------------------ */
/*  legge: preset 0-7 o absent → sereno o null       */
/* ------------------------------------------------ */

test('currentWeatherPreset: assente = sereno (proto3), presente = numero, file missing/vuoto = null', () => {
  // file che NON esiste: null (nessun crash)
  assert.equal(currentWeatherPreset(join(GAME, 'no-such-file')), null);
  // vivo senza field 2: il gioco lo OMETTE in sereno → comportamento 0 = sereno
  const noField = writeLgm('lgm-sereno', null);
  assert.equal(currentWeatherPreset(noField), 0);
  // preset scelto: nuvoloso (2) letto indietro
  const withField = writeLgm('lgm-2', 2);
  assert.equal(currentWeatherPreset(withField), 2);
  // file VUOTO (niente timeline, niente preset): insolito → null
  const empty = join(GAME, 'lgm-empty');
  writeFileSync(empty, encodeMsg([]), null);
  assert.equal(currentWeatherPreset(empty), null);
});

/* ------------------------------------------------ */
/*  scrive: backup, insert proto3 e in-place         */
/* ------------------------------------------------ */

test('setWeatherPreset: dry NON tocca nulla, il write vero crea backup e rimette il nel LGM', () => {
  // DRY: sito tentang NOTHING
  const f = writeLgm('lgm-dry', 2);
  const r = setWeatherPreset('pioggia', { lgmFile: f, dry: true });
  assert.equal(r.written, false);
  assert.equal(r.from, 2);
  assert.equal(r.to, 5);
  assert.equal(r.preset.label, 'Pioggia');
  assert.equal(currentWeatherPreset(f), 2);        // resta com'era
  assert.ok(!existsSync(r.backup), 'in dry niente backup');
  // hot: si scrive davvero il preset + il backup datato
  const r2 = setWeatherPreset('pioggia', { lgmFile: f });
  assert.equal(r2.written, true);
  assert.ok(existsSync(r2.backup), 'backup datato accanto al file');
  assert.ok(readFileSync(r2.backup).equals(lgmOf(2)), 'il backup conserva il registro ORIGINALE');
  assert.equal(currentWeatherPreset(f), 5);        // adesso 5 (pioggia)
});

test('setWeatherPreset: campo 2 ASSENTE → INSERTS prima della timeline (come lo scrive il gioco)', () => {
  const f = writeLgm('lgm-insert', null);          // sereno, NIENTE field 2
  const r = setWeatherPreset('pioggia leggera', { lgmFile: f });
  assert.equal(r.from, 0);                         // assente = sereno
  assert.equal(r.to, 4);
  assert.equal(currentWeatherPreset(f), 4);
  // essa: la timeline resta intatta: 9 step riocano (il re-encode non deve seccarli)
  const fields = decodeMsg(readFileSync(f));
  assert.equal(fields.filter((x) => x.field === 3 && x.wire === 2).length, 9);
  assert.equal(fields.filter((x) => x.field === 2).length, 1);
});

test('setWeatherPreset: preset NON riconosciuto → errore BAD_WEATHER', () => {
  assert.throws(() => setWeatherPreset('nebbiosa'), (e) => e.code === 'BAD_WEATHER');
});

/* ------------------------------------------------ */
/*  custom: la SESTA patch in-place (float), clampo  */
/* ------------------------------------------------ */

test('setWeatherCustom: patcho la timeline, verifica float e clampá (rain 0.9 → 0.9; rain 1.5 → clamp 1)', () => {
  const f = writeLgm('lgm-custom', 2);
  const r = setWeatherCustom({ rain: 0.9, cloud: 0.5, fog: 0.0, lgmFile: f });
  assert.equal(r.to, 7);                           // preset custom
  assert.equal(r.written, true);
  assert.equal(r.patched, 27);                     // 9 step × 3 float = 27
  assert.equal(currentWeatherPreset(f), 7);
  // gli step letti indietro col codec condiviso: 27 float giusti
  const all = decodeMsg(readFileSync(f));
  let rains = 0;
  for (const st of all.filter((x) => x.field === 3 && x.wire === 2)) {
    const sub = decodeMsg(st.bytes).find((x) => x.field === 3 && x.wire === 2);
    const w = decodeMsg(sub.bytes);
    const rain = w.find((x) => x.field === 8 && x.wire === 5);
    const cloud = w.find((x) => x.field === 11 && x.wire === 5);
    assert.ok(vecEq(rain.bytes, 0.9), `rain ${Buffer.from(rain.bytes).readFloatLE(0)}`);
    assert.ok(vecEq(cloud.bytes, 0.5));
    rains++;
  }
  assert.equal(rains, 9);
  // CLAMP: i valori fuori 0-1 si bloccano ai bordi (1.8 → 1.0, -0.3 → 0.0)
  const fc = writeLgm('lgm-custom-clamp', 6, () => stepsOf(3));
  const rc = setWeatherCustom({ rain: 1.8, cloud: -0.3, fog: 0.5, lgmFile: fc });
  assert.equal(rc.patched, 9);
  for (const st of decodeMsg(readFileSync(fc)).filter((x) => x.field === 3 && x.wire === 2)) {
    const w = decodeMsg(decodeMsg(st.bytes).find((x) => x.field === 3 && x.wire === 2).bytes);
    assert.ok(vecEq(w.find((x) => x.field === 8 && x.wire === 5).bytes, 1.0), 'rain clampato a 1');
    assert.ok(vecEq(w.find((x) => x.field === 11 && x.wire === 5).bytes, 0.0), 'cloud clampata a 0');
  }
});

test('setWeatherCustom: SOLO UN parametro → SOLO i SUOI float patchati, gli altri restano', () => {
  const f = writeLgm('lgm-custom-fog', 3, () => stepsOf(4, 0.2, 0.5, 0.0));
  const r = setWeatherCustom({ fog: 0.3, lgmFile: f });
  assert.equal(r.patched, 4);                      // 4 step × 1 float (fog ONLY)
  assert.equal(currentWeatherPreset(f), 7);
  const all = decodeMsg(readFileSync(f));
  for (const st of all.filter((x) => x.field === 3 && x.wire === 2)) {
    const sub = decodeMsg(st.bytes).find((x) => x.field === 3 && x.wire === 2);
    const w = decodeMsg(sub.bytes);
    assert.ok(vecEq(w.find((x) => x.field === 12 && x.wire === 5).bytes, 0.3));
    assert.ok(vecEq(w.find((x) => x.field === 8 && x.wire === 5).bytes, 0.2));   // rain intatto
    assert.ok(vecEq(w.find((x) => x.field === 11 && x.wire === 5).bytes, 0.5));  // cloud intatto
  }
});

test('setWeatherCustom: senza valori → NO_VALUES, file missing → NO_FILE, dry non scrive', () => {
  assert.throws(() => setWeatherCustom({ lgmFile: join(GAME, 'x') }), (e) => e.code === 'NO_VALUES');
  assert.throws(() => setWeatherCustom({ rain: 0.1, lgmFile: join(GAME, 'no-such') }), (e) => e.code === 'NO_FILE');
  const f = writeLgm('lgm-custom-dry', 0);
  const r = setWeatherCustom({ rain: 0.5, lgmFile: f, dry: true });
  assert.equal(r.written, false);
  assert.equal(r.patched, 9);
  assert.equal(currentWeatherPreset(f), 0);        // dry: com'era
});
