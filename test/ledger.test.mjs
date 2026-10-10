// Il registro anti-doppioni: hash del file, ripartenza da vuoto solo con copia
// di recupero quando si corrompe, e NESSUN falso allarme quando semplicemente
// non esiste ancora (carriera nuova).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'evo-ledger-'));
process.env.EVO_DATA_DIR = DATA;
const { fileHash, alreadyImportedHash } = await import('../src/import.mjs');

const fakeResult = join(DATA, '261001-1900_Race.sessionresults.json');
writeFileSync(fakeResult, '{"session":"race","track":"Monza"}');

test('ledger assente (carriera nuova): null, nessun falso allarme nel log errori', () => {
  assert.equal(alreadyImportedHash(fakeResult), null);
  assert.equal(existsSync(join(DATA, 'errors.jsonl')), false);
});

test('un file già incassato viene riconosciuto dal suo hash', () => {
  const hash = fileHash(fakeResult);
  writeFileSync(join(DATA, 'imports-ledger.json'), JSON.stringify({
    imported: {
      [hash]: { file: '261001-1900_Race.sessionresults.json', at: '2026-10-01T10:00:00.000Z', season: 1, round: 0, nodeId: 'coppa_citta' },
    },
  }));
  const seen = alreadyImportedHash(fakeResult);
  assert.ok(seen);
  assert.equal(seen.nodeId, 'coppa_citta');
  assert.equal(seen.season, 1);
  assert.equal(alreadyImportedHash(join(DATA, 'altro-file.json')), null);
});

test('ledger corrotto: copia .corrupt + warning nel registro, e riparte da vuoto', () => {
  writeFileSync(join(DATA, 'imports-ledger.json'), '{ non-json');
  assert.equal(alreadyImportedHash(fakeResult), null);
  const corrupted = readdirSync(DATA).filter((f) => f.startsWith('imports-ledger.json.corrupt-'));
  assert.equal(corrupted.length, 1);
  const warns = readFileSync(join(DATA, 'errors.jsonl'), 'utf8').trim().split('\n');
  assert.ok(warns.some((l) => l.includes('import.ledger')));
});
