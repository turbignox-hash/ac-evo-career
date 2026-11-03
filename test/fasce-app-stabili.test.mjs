// fasce-app-stabili.test.mjs — la cura del battito con le gare a 3 giri
// (2/11, «il problema è iniziato da quando hai portato i giri a 3»): l'engine
// rispama i journal pd-<vista>-<hash>.json con un hash NUOVO ma lo STESSO
// contenuto, e l'app Paddock ricarica la pagina a ogni nome nuovo. La cura:
// il puntatore cambia SOLO quando il contenuto cambia veramente (sha1).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = join(HERE, '_fasce-tmp');
const { fasceApp } = await import('../src/uiapp-pub.mjs');

const dato = (dir, slot) => {
  try { return JSON.parse(readFileSync(join(dir, `ui-${slot}.json`), 'utf8')); }
  catch { return null; }
};

test.after(() => { rmSync(TMP, { recursive: true, force: true }); });

test('stesso contenuto con hash nuovo: il puntatore NON cambia (pagina ferma)', () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const contenuto = JSON.stringify({ rounds: [1, 2, 3] });
  writeFileSync(join(TMP, 'pd-main-aaaaaaaaaaaa.json'), contenuto);
  const prima = fasceApp(TMP, 1000);
  assert.ok(prima.ok);
  const fascia1 = dato(TMP, 1000);
  const primoNome = fascia1?.sections?.main;
  assert.ok(primoNome, 'il puntatore main esce in fascia');

  // l'engine rispama: file NUOVO, contenuto IDENTICO
  writeFileSync(join(TMP, 'pd-main-bbbbbbbbbbbb.json'), contenuto);
  fasceApp(TMP, 1002);
  const fascia2 = dato(TMP, 1002);
  assert.equal(fascia2?.sections?.main, primoNome, 'stesso contenuto → stesso nome');
});

test('contenuto veramente nuovo: il puntatore cambia (ricaricana giusta)', () => {
  const hop = 'pd-main-cccccccccccc.json';
  writeFileSync(join(TMP, hop), JSON.stringify({ rounds: [1, 2, 3, 4] }));
  fasceApp(TMP, 1004);
  const fascia3 = dato(TMP, 1004);
  assert.equal(fascia3?.sections?.main, hop, 'contenuto diverso → nome nuovo onesto');
});
