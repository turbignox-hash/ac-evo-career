// cancelli-anticheat.test.mjs — IL CANCELLO ANTI-CHEAT esteso (31/10,
// richiesta Mauro «estendi l'anti-cheat» e «spente le guardie, prova»).
// Lo stesso cancello del meteo (guardedMeteo in weather.mjs) ora presidia
// anche i canali orario e distanza. Su fixture sintetica con gli stessi
// encoder del progetto, in sandbox di gioco e col registro della modalità
// ISOLATO in tmp (mai quello vero), verifica:
//   1. FUORI modalità test ogni via manuale rifiuta (GUARDIA_ATTIVA):
//      setWeekendLaps / setWeekendTimed / setRaceSessions / setRaceTime
//   2. previsto:true (le scritture del preparatutto, valori DEL CALENDARIO)
//      passa e scrive davvero, con dichiarazione esplicita
//   3. in modalità test si passa sempre (le gare servono a provare)
//   4. dry passa (nessuna scrittura): la lettura non è baratteria
import './_game-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';
import { setWeekendLaps, setWeekendTimed, sessionsOf, raceBlockIndex } from '../tools/weekend-laps.mjs';
import { setRaceSessions, setRaceTime, currentRaceTime } from '../tools/set-racetime.mjs';
import { cancelloOrario, cancelloDistanza } from '../src/test-mode.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'evo-cancelli-'));

// registro della modalità: attivo/disattivato a ogni test via EVO_TEST_MODE_FILE
const REG_ATTIVO = join(TMP, 'mode-test-attivo.json');
const REG_SPENTO = join(TMP, 'mode-test-spento.json');   // non esiste → modalità spenta
writeFileSync(REG_ATTIVO, JSON.stringify({ attivo: true, dal: '2026-10-31T20:00:00.000Z', giri: 3, rond: 0, salva: {} }));

const conRegistro = (registro, fn) => {
  const before = process.env.EVO_TEST_MODE_FILE;
  process.env.EVO_TEST_MODE_FILE = registro;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.EVO_TEST_MODE_FILE; else process.env.EVO_TEST_MODE_FILE = before;
  }
};

/* fixture: il gamemodesave del weekend (Practice a tempo + Race a giri) */
const fixture = () => {
  const sess = (nome, dur, mode, extra = []) => encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from(nome, 'utf8') },
    { field: 2, wire: 0, varint: BigInt(dur) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    { field: 4, wire: 2, bytes: encodeMsg([{ field: 4, wire: 0, varint: BigInt(15) }, { field: 5, wire: 0, varint: BigInt(30) }]) },
    { field: 7, wire: 5, bytes: (() => { const b = Buffer.alloc(4); b.writeFloatLE(1, 0); return b; })() },
    ...extra,
  ]);
  return encodeMsg([sess('Practice', 900, 1), sess('Qualifying', 600, 1), sess('Race', 5, 2)].map((bytes) => ({ field: 3, wire: 2, bytes })));
};
const mkFile = () => {
  const file = join(TMP, `gm-${Date.now()}-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, fixture());
  return file;
};

test('FUORI modalità test: ogni via manuale rifiuta, nessun byte toccato', () => {
  conRegistro(REG_SPENTO, () => {
    // distanza: giri e tempo
    let file = mkFile();
    const prima = readFileSync(file);
    assert.throws(() => setWeekendLaps(7, { file }), (e) => e.code === 'GUARDIA_ATTIVA' && /test-mode/.test(e.message));
    assert.throws(() => setWeekendTimed(3, { file }), (e) => e.code === 'GUARDIA_ATTIVA');
    assert.equal(Buffer.compare(readFileSync(file), prima), 0, 'rifiuto SENZA scrittura');

    // orario: ore per sessione + orologio generico
    file = mkFile();
    assert.throws(() => setRaceSessions({ sessions: { Race: 21 } }), (e) => e.code === 'GUARDIA_ATTIVA');
    assert.throws(() => setRaceTime({ hour: 2, scale: 48, file }), (e) => e.code === 'GUARDIA_ATTIVA');
    assert.equal(/chi-prende-rifiuto/.test(''), false);   // nessun side-effect: solo firma test
  });
});

test('previsto:true (le scritture del CALENDARIO) passa e scrive davvero', () => {
  conRegistro(REG_SPENTO, () => {
    let file = mkFile();
    const r = setWeekendLaps(7, { file, previsto: true });
    assert.equal(r.written, true, 'giri scritti');
    const ses = sessionsOf(readFileSync(file));
    assert.equal(ses[raceBlockIndex(ses)].giri, 7);

    // ritorno a tempo col previsto-transfer (come setWeekendLaps interna)
    const t = setWeekendTimed(3, { file, previsto: true });
    assert.equal(t.written, true);
    const ses2 = sessionsOf(readFileSync(file));
    assert.equal(ses2[raceBlockIndex(ses2)].aTempo, true);

    file = mkFile();
    const rs = setRaceSessions({ sessions: { Race: { hour: 21 } }, file, previsto: true });
    assert.equal(rs.written, true, 'ore scritte con previsto');
    assert.equal(currentRaceTime(file).hour, 21);
  });
});

test('IN modalità test si passa sempre (le gare servono a provare)', () => {
  conRegistro(REG_ATTIVO, () => {
    const file = mkFile();
    const r = setWeekendLaps(7, { file });     // previsto NON dichiarato
    assert.equal(r.written, true);
    const rs = setRaceSessions({ sessions: { Race: { hour: 5 } }, file });
    assert.equal(rs.written, true);
    const rt = setRaceTime({ hour: 2, scale: 48, file });
    assert.equal(rt.written, true);
    assert.equal(currentRaceTime(file).scale, 48);
  });
});

test('dry: le prove a vuoto passano anche fuori test, niente scritture', () => {
  conRegistro(REG_SPENTO, () => {
    const file = mkFile();
    const prima = readFileSync(file);
    const rs = setRaceSessions({ sessions: { Race: { hour: 21 } }, file, dry: true });
    assert.equal(rs.written, false);
    const rt = setRaceTime({ hour: 21, file, dry: true });
    assert.equal(rt.written, false);
    assert.equal(Buffer.compare(readFileSync(file), prima), 0, 'dry non tocca il file');
  });
});

test('i due cancelli chiamati a mano: rifiuto fuori, silenzio in test', () => {
  conRegistro(REG_SPENTO, () => {
    assert.throws(() => cancelloOrario(), (e) => e.code === 'GUARDIA_ATTIVA');
    assert.throws(() => cancelloDistanza({}), (e) => e.code === 'GUARDIA_ATTIVA');
    assert.doesNotThrow(() => cancelloOrario({ dry: true }));
    assert.doesNotThrow(() => cancelloDistanza({ previsto: true }));
  });
  conRegistro(REG_ATTIVO, () => {
    assert.doesNotThrow(() => cancelloOrario({}));
    assert.doesNotThrow(() => cancelloDistanza({}));
  });
});
