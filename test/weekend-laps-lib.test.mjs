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
import { setWeekendLaps, setWeekendTimed, weekendLaps, raceBlockIndex } from '../tools/weekend-laps.mjs';

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

function fixtureTimedRace() {
  // Race a TEMPO (f3=1, f2=300 s): la mappa del 28/10 — giri NON si scrivono
  const race = [
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(300) },
    { field: 3, wire: 0, varint: BigInt(1) },
    { field: 7, wire: 5, bytes: (() => { const b = Buffer.alloc(4); b.writeFloatLE(1, 0); return b; })() },
  ];
  const practice = [
    { field: 1, wire: 2, bytes: Buffer.from('Practice', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(900) },
    { field: 3, wire: 0, varint: BigInt(1) },
  ];
  return encodeMsg([encodeMsg(practice), encodeMsg(race)].map((bytes) => ({ field: 3, wire: 2, bytes })));
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

test('sessionsOf espone la modalità del f3 (aTempo/durataSec, mappa 28/10)', () => {
  const file = join(TMP, `timed-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, fixtureTimedRace());
  const ses = weekendLaps(file);
  assert.deepEqual(ses.map((s) => s.nome), ['Practice', 'Race']);
  // a tempo: f2 sono SECONDI (900" pratica e 5 min gara), non giri
  for (const s of ses) { assert.equal(s.aTempo, true); assert.equal(s.mode, 1); }
  assert.deepEqual(ses.map((s) => s.durataSec), [900, 300]);
  // la vecchia lettura «giri» resta per compat, ma NON va usata con aTempo
  assert.deepEqual(ses.map((s) => s.giri), [900, 300]);
});

test('setWeekendLaps CONVERTE una gara a TEMPO (f3=1) torna a giri, non solo rifiuta', () => {
  // comportamento 28/10 tardi (Mauro ha fatto a mano «--tempo» sul weekend e
  // applicato): se la prova resta a tempo, il Prepara tutto DEVE poter tornare
  // a giri — niente più scampo dell'errore RACE_IS_TIMED.
  const file = join(TMP, `timed3-${Math.random().toString(36).slice(2)}.gamemodesave`);
  writeFileSync(file, fixtureTimedRace());
  const before = readFileSync(file);
  const r = setWeekendLaps(5, { file });
  assert.equal(r.written, true);
  assert.ok(r.backup?.includes('bak-laps-'), 'backup datato');
  const ses = weekendLaps(file);
  assert.equal(ses[1].aTempo, false);
  assert.deepEqual([ses[1].giri, ses[1].mode], [5, 2]);
  assert.equal(decodeMsg(readFileSync(file)).length, decodeMsg(before).length);
  // la conversione è idempotente: seconda chiamata → written:false
  const second = setWeekendLaps(5, { file });
  assert.deepEqual({ already: second.already, written: second.written }, { already: true, written: false });
});

test('setWeekendTimed mette la GARA a tempo (f3=1, f2=secondi) con round-trip e backup', () => {
  const file = mkFile();                       // parte a giri (f3=2)
  const r = setWeekendTimed(5, { file });
  assert.equal(r.written, true);
  assert.ok(r.backup?.includes('bak-tempo-'), 'backup datato scritto');
  const ses = weekendLaps(file);
  assert.deepEqual([ses[2].aTempo, ses[2].durataSec], [true, 300]);
  assert.deepEqual([ses[0].giri, ses[0].mode], [3, 1], 'la pratica a tempo NON toccata');
});

test('setWeekendTimed è idempotente e torna a giri con { laps }', () => {
  const file = mkFile();
  const first = setWeekendTimed(7, { file });
  assert.equal(first.written, true);
  const second = setWeekendTimed(7, { file });
  assert.deepEqual({ already: second.already, written: second.written, durata: second.durata }, { already: true, written: false, durata: 420 });
  const back = setWeekendTimed(null, { file, laps: 7 });
  assert.equal(back.written, true);
  const ses = weekendLaps(file);
  assert.deepEqual([ses[2].aTempo, ses[2].giri], [false, 7]);
});

test('setWeekendTimed rifiuta valori assurdi senza toccare il file', () => {
  const file = mkFile();
  const before = readFileSync(file);
  assert.throws(() => setWeekendTimed(0, { file }), /minuti > 0/);
  assert.throws(() => setWeekendTimed(-2, { file }), /minuti > 0/);
  assert.throws(() => setWeekendTimed(NaN, { file }), /minuti > 0/);
  assert.throws(() => setWeekendTimed(5, { file, laps: 3 }), /minuti > 0/);
  assert.throws(() => setWeekendTimed(null, { file }), /--tempo/);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});

test('setWeekendLaps rifiuta valori assurdi senza toccare il file', () => {
  const file = mkFile();
  const before = readFileSync(file);
  assert.throws(() => setWeekendLaps(0, { file }), /intero > 0/);
  assert.throws(() => setWeekendLaps(-3, { file }), /intero > 0/);
  assert.throws(() => setWeekendLaps(2.5, { file }), /intero > 0/);
  assert.deepEqual(readFileSync(file), before, 'file intatto');
});
