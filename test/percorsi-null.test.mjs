// percorsi-null.test.mjs — L'installazione VERGINE (zip amico, PC senza ACE
// o senza percorso ancora salvato) arriva in src/ con `paths` NULL. Il
// collaudo dal vivo 31/10 lo ha smascherato: la tab Risultati e la tab
// Piste rispondevano 500 «Cannot read properties of null (reading
// 'resultsDirs')», e /api/system-health (interrogata a ogni giro dal
// cruscotto) riempiva la console di 500 ogni 2 secondi. La regola è UNA:
// percorsi assenti = liste vuote e messaggi onesti, MAI un 500 nudo.
import { strict as assert } from 'node:assert';
import test from 'node:test';

test('listResultFiles con paths null: lista vuota, nessun lancio', async () => {
  const { listResultFiles } = await import('../src/results.mjs');
  assert.deepEqual(listResultFiles(null), [], 'senza percorsi la lista è vuota');
});

test('listResultFiles con oggetto senza resultsDirs: lista vuota, nessun lancio', async () => {
  const { listResultFiles } = await import('../src/results.mjs');
  assert.deepEqual(listResultFiles({}), []);
});

test('telemScanLocale con paths null: scansione onesta, nessun lancio', async () => {
  const { telemScanLocale } = await import('../src/webui-telem.mjs');
  const s = telemScanLocale(null);
  assert.equal(s.lastLd, null, 'nessun .ld senza percorsi');
  assert.deepEqual(s.dirsChecked, [], 'nessuna cartella MoTeC controllata');
});
