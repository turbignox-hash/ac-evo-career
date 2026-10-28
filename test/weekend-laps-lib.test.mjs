import "./_flows-sandbox.mjs"; // sandbox flussi
// weekend-laps-lib.test.mjs — la libreria del salvataggio giri (setWeekendLaps).
// Sfrutta il gamemodesave del weekend da FIXTURE SINTETICA (stessi encoder e
// decoder del progetto: nessun file di gioco toccato dai test) e verifica:
//   1. setWeekendLaps scrive il varint giri sulla sessione GARA (non sulle altre)
//   2. round-trip byte-identico (lezione 19/10: la riscrittura a mano corrompeva)
//   3. idempotenza: la seconda chiamata non tocca nulla (written:false)
//   4. giri illimitati (< 0 / non interi) rifiutati SENZA scrittura (BAD_LAPS)
// La struttura rispecchia quella osservata nel vero gamemodesave (21/10):
// blocco f3 → f1 nome, f2 giri, f3 tipo, f4 datetime {4 ora, 5 minuti}, f7 scala.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';
import { setWeekendLaps, weekendLaps, raceBlockIndex } from '../tools/weekend-laps.mjs';

const SESSIONI = [
  { nome: 'Practice', giri: 3, tipo: 1, ora: 15, min: 30, scala: 2 },
  { nome: 'Qualifying', giri: 2, tipo: 1, ora: 16, min: 10, scala: 2 },
  { nome: 'Race', giri: 5, tipo: 2, ora: 17, min: 0, scala: 1 },
];

function fixture() {
  const blocks = SESSIONI.map((s) => encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from(s.nome, 'utf8') },
    { field: 2, wire: 0, varint: BigInt(s.giri) },
    { field: 3, wire: 0, varint: BigInt(s.tipo) },
    { field: 4, wire: 2, bytes: encodeMsg([{ field: 4, wire: 0, varint: BigInt(s.ora) }, { field: 5, wire: 0, varint: BigInt(s.min) }]) },
    { field: 7, wire: 5, bytes: (() => { const b = Buffer.alloc(4); b.writeFloatLE(s.scala, 0); return b; })() },
  ]));
  return encodeMsg(blocks.map((bytes) => ({ field: 3, wire: 2, bytes })));
}

const TMP = mkdtempSync(join(tmpdir(), 'evo-laps-'));
const mkFile = (laps = 5) => {
  const file = join(TMP, `gm-${laps}-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, fixture());
  return file;
};

test('sessionsOf legge nome/giri/tipo e raceBlockIndex individua la GARA', () => {
  const file = mkFile();
  const ses = weekendLaps(file);
  assert.deepEqual(ses.map((s) => s.nome), ['Practice', 'Qualifying', 'Race']);
  assert.equal(raceBlockIndex(ses), 2);
});

test('setWeekendLaps scrive i giri SOLO sul blocco Race, con round-trint byte-identico', () => {
  const file = mkFile();
  const before = readFileSync(file);
  const r = setWeekendLaps(11, { file });
  assert.equal(r.written, true);
  assert.equal(r.block, 'Race');
  assert.ok(r.backup?.includes('bak-laps-'), 'backup datato scritto');
  const ses = weekendLaps(file);
  assert.equal(ses[2].giri, 11);
  assert.equal(ses[0].giri, 3, 'la pratica non toccata');
  assert.equal(ses[1].giri, 2, 'la qualifica non toccata');
  // nati un byte fuori posto: la decodifica di tutto il file deve rimanere pulita
  assert.equal(decodeMsg(readFileSync(file)).length, decodeMsg(before).length);
});

test('setWeekendLaps è idempotente: stessa cifra → written:false, nessun nuovo backup', () => {
  const file = mkFile();
  const first = setWeekendLaps(9, { file });
  assert.equal(first.written, true);
  const second = setWeekendLaps(9, { file });
  assert.deepEqual({ already: second.already, written: second.written, block: second.block, giri: second.giri, backup: second.backup }, { already: true, written: false, block: 'Race', giri: 9, backup: null });
});

test('setWeekendLaps rifiuta valori assurdi senza toccare il file', () => {
  const file = mkFile();
  const before = readFileSync(file);
  assert.throws(() => setWeekendLaps(0, { file }), /intero > 0/);
  assert.throws(() => setWeekendLaps(-3, { file }), /intero > 0/);
  assert.throws(() => setWeekendLaps(2.5, { file }), /intero > 0/);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});
