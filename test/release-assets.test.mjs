// release-assets.test.mjs — il piano degli asset di crea-release, senza rete.
//
// La prova che conta: lo stesso EXE non sale due volte quando arriva sia da
// --asset sia dal preflight firma, e il .sha256 non viene servito come zip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { caricaAssetRelease, pianoAssetRelease, tipoAssetRelease } from '../src/release-assets.mjs';

const risposta = (status, body) => ({ status, json: async () => body });

test('release asset: zip, espliciti e firma in ordine, senza doppioni', () => {
  const exe = resolve('dist', 'EVO-Pitwall-Setup.exe');
  const piano = pianoAssetRelease({
    zip: 'pacchetti/amico.zip',
    espliciti: ['dist/EVO-Pitwall-Setup.exe', 'dist/note.txt'],
    firmati: [exe, `${exe}.sha256`],
  });

  assert.deepEqual(piano, [
    'pacchetti/amico.zip',
    'dist/EVO-Pitwall-Setup.exe',
    'dist/note.txt',
    `${exe}.sha256`,
  ]);
  assert.equal(new Set(piano.map((f) => resolve(f))).size, piano.length, 'nessun percorso duplicato');
  assert.deepEqual(pianoAssetRelease(), [], 'senza asset il piano è vuoto');
});

test('release asset: il content-type segue il file, non sempre application/zip', () => {
  assert.equal(tipoAssetRelease('EVO-Pitwall-Setup.exe'), 'application/vnd.microsoft.portable-executable');
  assert.equal(tipoAssetRelease('EVO-Pitwall-Setup.exe.sha256'), 'text/plain; charset=utf-8');
  assert.equal(tipoAssetRelease('pacchetto-amico.zip'), 'application/zip');
});

test('release asset: upload ok, content-type binario e URL di risposta', async (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'asset-upload-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));
  const file = join(blob, 'pacchetto-amico.zip');
  writeFileSync(file, Buffer.from('PK\u0003\u0004contenuto'));

  const chiamate = [];
  const fetchFinto = async (url, opt = {}) => {
    chiamate.push({ url, opt });
    return risposta(201, { browser_download_url: 'https://example.invalid/pacchetto-amico.zip' });
  };
  const esito = await caricaAssetRelease({
    file, repo: 'owner/repo', releaseId: 7,
    headers: { 'User-Agent': 'test', 'Content-Type': 'application/json' },
    fetchImpl: fetchFinto,
  });

  assert.equal(esito.ok, true);
  assert.equal(esito.status, 201);
  assert.equal(esito.nome, 'pacchetto-amico.zip');
  assert.equal(esito.bytes, Buffer.byteLength('PK\u0003\u0004contenuto'));
  assert.equal(esito.body.browser_download_url, 'https://example.invalid/pacchetto-amico.zip');
  assert.equal(chiamate.length, 1);
  assert.match(chiamate[0].url, /uploads\.github\.com\/repos\/owner\/repo\/releases\/7\/assets\?name=pacchetto-amico\.zip$/);
  assert.equal(chiamate[0].opt.method, 'POST');
  assert.equal(chiamate[0].opt.headers['Content-Type'], 'application/zip');
  assert.equal(chiamate[0].opt.body.toString(), 'PK\u0003\u0004contenuto');
});

test('release asset: 422 con nome esistente → cancella e riprova una volta', async (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'asset-422-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));
  const file = join(blob, 'gia-presente.zip');
  writeFileSync(file, Buffer.from('zip nuovo'));

  const chiamate = [];
  const risposte = [
    risposta(422, { message: 'already_exists' }),
    risposta(200, [{ id: 42, name: 'gia-presente.zip' }]),
    risposta(204, {}),
    risposta(201, { browser_download_url: 'https://example.invalid/nuovo.zip' }),
  ];
  const fetchFinto = async (url, opt = {}) => {
    chiamate.push({ url, opt });
    return risposte.shift();
  };
  const esito = await caricaAssetRelease({
    file, repo: 'owner/repo', releaseId: 7, headers: { 'User-Agent': 'test' }, fetchImpl: fetchFinto,
  });

  assert.equal(esito.ok, true);
  assert.equal(esito.sostituito, true);
  assert.equal(esito.cancellato, 204);
  assert.equal(chiamate.length, 4);
  assert.match(chiamate[0].url, /uploads\.github\.com/);
  assert.match(chiamate[1].url, /api\.github\.com\/repos\/owner\/repo\/releases\/7\/assets$/);
  assert.equal(chiamate[2].opt.method, 'DELETE');
  assert.match(chiamate[2].url, /releases\/assets\/42$/);
  assert.match(chiamate[3].url, /uploads\.github\.com/);
});

test('release asset: 500 → esito non ok, il chiamante può fallire la release', async (t) => {
  const blob = mkdtempSync(join(tmpdir(), 'asset-500-'));
  t.after(() => rmSync(blob, { recursive: true, force: true }));
  const file = join(blob, 'rotto.zip');
  writeFileSync(file, Buffer.from('zip'));

  const esito = await caricaAssetRelease({
    file, repo: 'owner/repo', releaseId: 7, headers: {},
    fetchImpl: async () => risposta(500, { message: 'boom' }),
  });

  assert.equal(esito.ok, false);
  assert.equal(esito.status, 500);
  assert.equal(esito.body.message, 'boom');
});
