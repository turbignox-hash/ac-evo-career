// set-instantrace.test.mjs — LA GARA CUSTOM "A TEMPO" (28/10: «5 minuti in fase test»).
// Fixture sintetica dell'INSTANT_RACE (stessi encoder/decoder del progetto,
// nessun file di gioco toccato): blocco Race con f2 giri, f3 modalità.
// Verifica:
//   1. currentInstantRace legge durata/mode/AI dal blocco Race
//   2. timedRace({minutes:5}) scrive f3=1 (a tempo) e f2=300
//   3. round-trip pulito e pratica/qualifica non toccate
//   4. idempotenza: seconda chiamata identica → written:false
//   5. torna a giri: laps:7 ripristina f3=2/f2=7
//   6. rifiuta valori ambigui/assenti senza toccare il file
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';
import { currentInstantRace, setInstantAi, timedRace } from '../tools/set-instantrace.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'evo-instant-'));
const mkFile = (giri = 7, mode = 2) => {
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(giri) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    { field: 4, wire: 2, bytes: Buffer.from('0123456789abcd', 'utf8') }, // 14 byte datetime osservati nel reale
    { field: 30, wire: 0, varint: BigInt(88) },
    { field: 31, wire: 0, varint: BigInt(93) },
    { field: 32, wire: 0, varint: BigInt(1) }, // partenza da fermo
  ]);
  const file = join(TMP, `instant-${giri}-${mode}-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, encodeMsg([{ field: 2, wire: 0, varint: BigInt(3) }, { field: 3, wire: 2, bytes: race }]));
  return file;
};

test('currentInstantRace legge durata, modalità e AI dal blocco Race', () => {
  const cur = currentInstantRace(mkFile());
  assert.equal(cur.durata, 7);
  assert.equal(cur.mode, 2);
  assert.equal(cur.modeTxt, 'a giri');
  assert.deepEqual([cur.aiMin, cur.aiMax, cur.partenza], [88, 93, 1]);
});

test('timedRace({minutes:5}) scrive modalità a tempo (f3=1) e 300 secondi (f2)', () => {
  const file = mkFile();
  const before = readFileSync(file);
  const r = timedRace({ minutes: 5, file, force: true });    // nel test il gioco può essere aperto: forzo in sandbox
  assert.equal(r.written, true);
  assert.equal(r.mode, 1);
  assert.equal(r.durata, 300);
  assert.ok(r.backup?.includes('bak-temprace-'), 'backup datato scritto');
  const cur = currentInstantRace(file);
  assert.equal(cur.mode, 1);
  assert.equal(cur.durata, 300);
  assert.equal(cur.modeTxt, 'a tempo');
  // niente byte fuori posto: la decodifica di tutto il file rimane pulita
  assert.equal(decodeMsg(readFileSync(file)).length, decodeMsg(before).length);
});

test('timedRace({minutes:5}) non tocca gli altri blocchi (AI e partenza restano)', () => {
  const file = mkFile();
  timedRace({ minutes: 10, file, force: true });
  const cur = currentInstantRace(file);
  assert.deepEqual([cur.aiMin, cur.aiMax, cur.partenza], [88, 93, 1]);
});

test('timedRace è idempotente: stessa cifra → written:false, nessun nuovo backup', () => {
  const file = mkFile();
  const first = timedRace({ minutes: 5, file, force: true });
  assert.equal(first.written, true);
  const second = timedRace({ minutes: 5, file, force: true });
  assert.equal(second.written, false);
  assert.deepEqual([second.mode, second.durata], [1, 300]);
});

test('timedRace({laps:7}) torna a giri: f3=2 e f2=7 come lo stato di default', () => {
  const file = mkFile();
  timedRace({ minutes: 5, file, force: true });
  const r = timedRace({ laps: 7, file, force: true });
  assert.equal(r.written, true);
  assert.equal(r.mode, 2);
  const cur = currentInstantRace(file);
  assert.deepEqual([cur.mode, cur.durata], [2, 7]);
  assert.equal(cur.modeTxt, 'a giri');
});

test('timedRace rifiuta valori ambigui o assenti senza toccare il file', () => {
  const file = mkFile();
  const before = readFileSync(file);
  assert.throws(() => timedRace({ file, force: true }), /serve --tempo/);
  assert.throws(() => timedRace({ minutes: 5, laps: 7, file, force: true }), /o a tempo o a giri/);
  assert.throws(() => timedRace({ minutes: 0, file, force: true }), /intero > 0/); // durata minima 60 s
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});

/* ---------- setInstantAi (1/11, la gara AL VOLO) ---------- */

test('setInstantAi scrive la banda AI (f30/f31) nel blocco Race e si rilegge uguale', () => {
  const file = mkFile();                                   // fixture: AI 88–93
  const r = setInstantAi(95, 96, { file, force: true });
  assert.equal(r.written, true);
  assert.deepEqual([r.aiMin, r.aiMax], [95, 96]);
  assert.ok(r.backup?.includes('bak-instantai-'), 'backup datato scritto');
  const cur = currentInstantRace(file);
  assert.deepEqual([cur.aiMin, cur.aiMax], [95, 96]);
  // gli altri campi non toccati: la gara resta a 7 giri, partenza 1
  assert.deepEqual([cur.durata, cur.mode, cur.partenza], [7, 2, 1]);
});

test('setInstantAi è idempotente: già uguale → written:false, nessun backup nuovo', () => {
  const file = mkFile();                                   // già 88–93
  const r = setInstantAi(88, 93, { file, force: true });
  assert.equal(r.written, false);
  assert.ok(r.nota?.includes('idempotente'));
});

test('setInstantAi consolida la banda invertita invece di rifiutarla', () => {
  const file = mkFile();
  const r = setInstantAi(96, 95, { file, force: true });   // lo-hi scrivuto
  assert.deepEqual([r.aiMin, r.aiMax], [95, 96]);
  const cur = currentInstantRace(file);
  assert.deepEqual([cur.aiMin, cur.aiMax], [95, 96]);
});

test('setInstantAi rifiuta banda fuori scala senza toccare il file', () => {
  const file = mkFile();
  const before = readFileSync(file);
  assert.throws(() => setInstantAi(95, 999, { file, force: true }), /0 e 100/);
  assert.throws(() => setInstantAi(undefined, 95, { file, force: true }), /0 e 100/);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});
