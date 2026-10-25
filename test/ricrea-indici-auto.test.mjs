// ricrea-indici-auto.test.mjs — LA GUARDIA DEL TOOL INDICI AUTO (25/10):
// su un PC vergine data/car-images.json è assente (data/ non è versionato) e
// la GUI resta muta sull'auto; il tool deve ricostruirlo dalle foto di
// gui/carmaps derivando il nome dal nome-fotografia (l'anno in coda va tra
// parentesi, come le voci originali) e il risultato deve combaciare con il
// normalizzatore di cars.mjs (normCar), così carImageOf continua ad
// abbinare. Nessuna rete, nessun disco reale: tutto su cartelle temporanee.
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nomeDaFoto, rebuildCarImages } from '../tools/ricrea-indici-auto.mjs';

test('nomeDaFoto: slug lungo con anno → nome presentabile con anno tra parentesi', () => {
  assert.equal(nomeDaFoto('abarth_695_biposto_2022.jpg'), 'Abarth 695 Biposto (2022)');
  assert.equal(nomeDaFoto('alfa_romeo_75_1_8_turbo_evoluzione_1987.jpeg'), 'Alfa Romeo 75 1 8 Turbo Evoluzione (1987)');
});

test('nomeDaFoto: senza anno e con targa compatta', () => {
  assert.equal(nomeDaFoto('toyota_ae86.jpeg'), 'Toyota Ae86');
});

test('rebuildCarImages: scandisce solo le foto reali (non txt/md, non vuote, non _prefissi) e ordina per nome file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'indici-'));
  try {
    const foto = join(tmp, 'carmaps');
    mkdirSync(foto);
    for (const f of ['abarth_695_biposto_2022.jpg', 'alpine_a110_s_2020.jpg', '_provola.txt', 'vuota.jpg', 'note.md', 'zebra.webp']) {
      writeFileSync(join(foto, f), f === 'vuota.jpg' ? '' : 'x');
    }
    const { list, photosScanned } = rebuildCarImages({ photosDir: foto });
    assert.equal(photosScanned, 3, 'vuota.jpg NON deve contare (size 0)');
    assert.deepEqual(list.map((v) => v.file), ['abarth_695_biposto_2022.jpg', 'alpine_a110_s_2020.jpg', 'zebra.webp']);
    assert.equal(list[0].name, 'Abarth 695 Biposto (2022)');
    assert.equal(list[0].category, 'road');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* Il punto vero della blindatura: cars.mjs abbina per normCar e toglie
   l'anno in coda DALLA VOCE normalizzata. Il nome ricostruito dalla foto
   deve normalizzare ESATTAMENTE come il nome ufficiale, altrimenti
   carImageOf() torna null anche con l'indice in piedi. */
test('round-trip con cars.mjs: il nome ricostruito normalizza come il nome ufficiale', () => {
  const normCar = (s) => String(s ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&#[0-9]+;/g, '').replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]/g, '');
  const stripAnno = (n) => normCar(n).replace(/(19|20)\d{2}$/, '');
  const ricostruito = nomeDaFoto('abarth_695_biposto_2022.jpg');
  assert.equal(stripAnno(ricostruito), stripAnno('Abarth 695 Biposto'));
  assert.equal(stripAnno(ricostruito), 'abarth695biposto');
  const alfa = nomeDaFoto('alpine_a110_s_2020.jpg');
  assert.equal(stripAnno(alfa), stripAnno('Alpine A110 S'));
});

test('il formato della lista è pronto per data/car-images.json (JSON.parse della serializzazione)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'indici-cli-'));
  try {
    const foto = join(tmp, 'carmaps');
    mkdirSync(foto);
    writeFileSync(join(foto, 'lancia_delta_hf_integrale_evo_ii_1992.jpg'), 'x');
    const { list } = rebuildCarImages({ photosDir: foto });
    const parsed = JSON.parse(JSON.stringify(list, null, 2) + '\n');
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].file, 'lancia_delta_hf_integrale_evo_ii_1992.jpg');
    assert.ok(parsed[0].name.includes('1992'));
    assert.deepEqual(Object.keys(parsed[0]).sort(), ['category', 'file', 'name']);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
