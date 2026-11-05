// test/verifica-release.test.mjs — le parti pure del controllo post-release:
// il piano degli asset e il parser dei sidecar, senza rete.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pianoAtteso, leggiSidecar, sha256, verificaRelease } from '../tools/verifica-release.mjs';

test('piano release: due EXE e pacchetto amico (dal 0.1.59 niente bundle unico)', () => {
  const piano = pianoAtteso('0.1.59');
  assert.equal(piano.length, 3);
  assert.deepEqual(piano.map((v) => v.nome ?? v.prefisso), [
    'EVO-Pitwall-Setup.exe',
    'EVO-Pitwall-Setup-Offline.exe',
    'ac-evo-career-amico-v0.1.59-',
  ]);
  assert.equal(piano[2].suffisso, '.zip');
  assert.ok(!piano.some((v) => String(v.nome ?? '').includes('Windows.zip')));
});

test('sidecar: accetta SHA-256 e nome giusti, rifiuta nome o formato sbagliati', () => {
  const hash = 'a'.repeat(64);
  assert.equal(leggiSidecar(`${hash}  EVO-Pitwall-Setup.exe\n`, 'EVO-Pitwall-Setup.exe'), hash);
  assert.throws(() => leggiSidecar(`${hash}  altro.exe\n`, 'EVO-Pitwall-Setup.exe'), /sidecar/);
  assert.throws(() => leggiSidecar('non-un-sidecar', 'EVO-Pitwall-Setup.exe'), /sidecar/);
});

test('verificaRelease: aspetta gli asset che finiscono di caricarsi dopo la pubblicazione', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const tag = `v${version}`;
  const online = Buffer.from('EXE-ONLINE-FINTO');
  const offline = Buffer.from('EXE-OFFLINE-FINTO');
  const amico = Buffer.from('PK\x03\x04-amico-zip-finto-\x1a');
  const ospite = (nome, buffer) => ({
    name: nome,
    size: buffer.length,
    state: 'uploaded',
    browser_download_url: `https://esempio/${encodeURIComponent(nome)}`,
  });
  const assetOnline = ospite('EVO-Pitwall-Setup.exe', online);
  const assetOffline = ospite('EVO-Pitwall-Setup-Offline.exe', offline);
  const assetAmico = ospite(`ac-evo-career-amico-v${version}-abc.zip`, amico);
  const assetSideOnline = ospite('EVO-Pitwall-Setup.exe.sha256', Buffer.from(`${sha256(online)}  EVO-Pitwall-Setup.exe\n`));
  const assetSideOffline = ospite('EVO-Pitwall-Setup-Offline.exe.sha256', Buffer.from(`${sha256(offline)}  EVO-Pitwall-Setup-Offline.exe\n`));
  // la prima sonda vede solo l'amico (l'EXE grosso è ancora in salita),
  // la seconda vede tutto.
  const risposteRelease = [
    { tag_name: tag, draft: false, prerelease: true, assets: [assetAmico] },
    { tag_name: tag, draft: false, prerelease: true, assets: [assetAmico, assetOnline, assetSideOnline, assetOffline, assetSideOffline] },
  ];
  const messaggi = [];
  const fetchImpl = (url) => {
    if (String(url).includes('/releases/tags/')) return Promise.resolve({ ok: true, json: async () => risposteRelease.shift() ?? risposteRelease.at(-1) });
    const buffer = String(url).endsWith('EVO-Pitwall-Setup.exe') ? online
      : String(url).endsWith('EVO-Pitwall-Setup-Offline.exe') ? offline
      : String(url).endsWith('Setup.exe.sha256') ? Buffer.from(`${sha256(online)}  EVO-Pitwall-Setup.exe\n`)
      : String(url).endsWith('Offline.exe.sha256') ? Buffer.from(`${sha256(offline)}  EVO-Pitwall-Setup-Offline.exe\n`)
      : amico;
    return Promise.resolve({ ok: true, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length) });
  };
  await verificaRelease({ tag, fetchImpl, log: (m) => messaggi.push(m), attesaMassimaMs: 500, intervalloMs: 25 });
  assert.ok(messaggi.some((m) => m.includes('⏳')), 'attesa loggata');
  assert.ok(messaggi.some((m) => m.includes('✓ verifica completa')));
});

test('verificaRelease: non aspetta all\'infinito, dice cosa manca', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const tag = `v${version}`;
  const amico = { name: `ac-evo-career-amico-v${version}-abc.zip`, size: 7, state: 'uploaded', browser_download_url: 'https://esempio/amico' };
  const fetchImpl = () => Promise.resolve({ ok: true, json: async () => ({ tag_name: tag, draft: false, prerelease: true, assets: [amico] }) });
  const messaggi = [];
  await assert.rejects(
    verificaRelease({ tag, fetchImpl, log: (m) => messaggi.push(m), attesaMassimaMs: 40, intervalloMs: 10 }),
    /asset mancanti dopo l'attesa/,
  );
  assert.ok(messaggi.some((m) => m.includes('⏳')), 'prima dell\'abbandono ha sondato');
});
