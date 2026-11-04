// semina-campionato.test.mjs — LA RICETTA DEL PADDOCK (2/11, richiesta Mauro:
// «implementa lo stesso sistema che utilizza paddock», i 4 protobuf dell'Avvia).
//
// Il difetto custodito: il Luo e la seasondefinition non avevano scrittori —
// e il seminatore non deve INVENTARE protobuf (l'identità di campionato porta
// team, auto e hash che solo una lanciata vera garantisce). La ricetta è stata
// beccata col monitor il 2/11 (18:23:02→18:23:06): quattro scritture del gioco
// in quest'ordine. La prova chiave del Luo era già in natura: il bak-wx del
// 2/11 17:56 (911 byte, preset DRIZZLE=4) è il campione con il campo 2
// aggiunto dopo il campo 1 — la forma proto3 del gioco (0 = sereno = campo
// OMISSO) è l'unica che EVO accetta.
//
// Qui si prova SU SANDBOX (ACE_GAME_SAVEDIR, i file di gioco veri non si
// toccano) partendo dai campioni veri in data/ricette/campionato/: senza
// campione la suite fallisce col messaggio del seminatore.
//
// Si imita la casa: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';

// LA SANDBOX PRIMA DELL'IMPORT: le costanti dei tool leggono ACE_GAME_SAVEDIR
// a import-time (lezione di test/_game-sandbox.mjs).
const SANDBOX = mkdtempSync(join(tmpdir(), 'semina-campionato-'));
process.env.ACE_GAME_SAVEDIR = SANDBOX;

const { RICETTA, seminaCampionato, caricaCampione, leggiPresetLgm, applicaPresetLgm } =
  await import('../tools/semina-campionato.mjs');

/** La sandbox esplicita non deve dipendere dal processo EVO vivo: il test
 *  inietta gameOpen false. La guardia vera resta il default del seminatore. */
const seminaSandbox = (opts = {}) => seminaCampionato({ root: SANDBOX, gameOpen: () => false, ...opts });

const campione = caricaCampione();
const destDi = (chiave) => join(SANDBOX, RICETTA.find((r) => r.chiave === chiave).dest);
const uguali = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

test('Il campione è in casa: i quattro protobuf della lanciata vera girano indietro identici', () => {
  for (const r of RICETTA) {
    const buf = campione[r.chiave];
    assert.ok(buf?.length > 200, r.chiave + ': campione assente o sospetto — si ricattura con --inventa.');
    assert.ok(uguali(buf, encodeMsg(decodeMsg(buf))),
      r.chiave + ': il round-trip del campione non è identico — protobuf mal riconosciuto, niente semina.');
  }
});

test('Seminata su PC vergine: i 4 protobuf finiscono ESATTAMENTE come il campione', () => {
  const esito = seminaSandbox();
  assert.equal(esito.scritti.length, 4, 'su un PC vergine si scrivono tutti e quattro');
  for (const r of RICETTA) {
    assert.ok(existsSync(destDi(r.chiave)), r.chiave + ': mancante sul PC vergine');
    assert.ok(uguali(readFileSync(destDi(r.chiave)), campione[r.chiave]),
      r.chiave + ': la semina ha toccato i byte — deve scrivere il campione tale quale.');
  }
});

test('Il Luo seminato è la forma del gioco: sereno = campo 2 OMISSO', () => {
  seminaSandbox({ preset: 'sereno', force: true });
  const buf = readFileSync(destDi('luo'));
  assert.equal(leggiPresetLgm(buf), 0);
  assert.ok(!decodeMsg(buf).some((f) => f.field === 2 && f.wire === 0),
    'col sereno il campo 2 non deve ESISTERE (proto3): il gioco accetta solo la sua forma.');
});

test('La patch del preset drizzle: campo 2 come secondo campo, UN solo campo in più', () => {
  const buf = applicaPresetLgm(campione.luo, 'drizzle');
  assert.equal(leggiPresetLgm(buf), 4, 'drizzle = preset 4 (come "Pioggia leggera" del menu EVO)');
  const fields = decodeMsg(buf);
  assert.equal(fields[1].field, 2, 'il campo 2 deve stare come secondo campo (ordine del bak-wx di 911 byte)');
  assert.equal(fields[0].field, 1, 'il campo 1 resta il primo');
  assert.equal(fields.length, decodeMsg(campione.luo).length + 1, 'solo UN campo in più, il resto del Luo resta identico');
});

test('Preset meteo con nome non riconosciuto: rifiuto senza scrivere', () => {
  assert.throws(() => applicaPresetLgm(campione.luo, 'temporale-di-grandine'), /BAD_WEATHER|non riconosciuto/i);
});

test("L'idempotenza della semina: al secondo giro si salta tutto", () => {
  seminaSandbox();
  const dopo = seminaSandbox();
  assert.deepEqual(dopo.scritti, [], 'file identici al campione: nessuna riscrittura');
  assert.equal(dopo.saltati.length, 4);
  assert.deepEqual(dopo.saltati.slice().sort(), RICETTA.map((r) => r.chiave).sort(),
    'al secondo giro TUTTI e quattro devono essere saltati (identici al campione).');
});

test('File esistenti DIVERSI dal campione: rifiuto senza --force (la tua gara vera non si tocca)', () => {
  const buf = readFileSync(destDi('weekend'));
  writeFileSync(destDi('weekend'), Buffer.concat([buf, Buffer.from([0x08, 0x01])])); // un campo in più
  assert.throws(() => seminaSandbox(), /FILE_DIFFERENTI|--force/s,
    'senza --force il seminatore non tocca una versione diversa: potrebbe essere la gara vera.');
  const esito = seminaSandbox({ force: true });
  assert.ok(esito.rimpiazzati.includes('weekend'));
  assert.ok(uguali(readFileSync(destDi('weekend')), campione.weekend), 'col --force il file torna il campione.');
});

test('Il Luo col meteo scelto arriva SEMPRE patchato (anche sulle riscritture col --force)', () => {
  seminaSandbox({ preset: 'pioggia', force: true });
  assert.equal(leggiPresetLgm(readFileSync(destDi('luo'))), 5, 'pioggia = preset 5');
});
