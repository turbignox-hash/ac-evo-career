// test/scorciatoia.test.mjs — collaudo della scorciatoia automatica (26/10,
// richiesta Mauro: «l'amico che installa deve trovare l'icona già fatta»).
// Il tool va esercitato COME lo usa il launcher: con un Desktop-vacanze in
// una dir temporanea (--desktop), mai toccando quello vero dell'utente.
// Su Windows crea il .lnk con l'icona Pitwall; altrove esce silenzioso e il
// test salta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOOL = join(import.meta.dirname, '..', 'tools', 'crea-scorciatoia.mjs');
const WIN = process.platform === 'win32';

test('scorciatoia ASSENTE: viene creata con icona Pitwall, puntata ad avvia.cmd', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia-'));
  try {
    const r = spawnSync(process.execPath, [TOOL, '--desktop', DESK], { encoding: 'utf8' });
    assert.equal(r.status, 0, `il tool deve uscire 0, stdout: ${r.stdout} stderr: ${r.stderr}`);
    const lnk = join(DESK, 'Carriera EVO.lnk');
    assert.equal(existsSync(lnk), true, 'il .lnk deve esistere nel desktop di prova');
    // dentro il .lnk (binario UTF-16) ci devono stare i percorsi del progetto
    const utf16 = readFileSync(lnk).toString('utf16le');
    assert.ok(utf16.includes('avvia.cmd'), 'target = avvia.cmd del progetto');
    assert.ok(utf16.includes('pitwall.ico'), 'icona = gui/pitwall.ico del repo (non il node.exe verde)');
  } finally { rmSync(DESK, { recursive: true, force: true }); }
});

test('scorciatoia GI\u00c0 A POSTO: secondo giro idempotente, esce 0 e non dice niente', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia2-'));
  try {
    const arg = ['--desktop', DESK];
    spawnSync(process.execPath, [TOOL, ...arg], { encoding: 'utf8' }); // prima: la crea
    const r2 = spawnSync(process.execPath, [TOOL, ...arg], { encoding: 'utf8' });
    assert.equal(r2.status, 0);
    assert.equal((r2.stdout ?? '').trim(), '', 'con la scorciatoia gi\u00e0 buona: silenzio (ogni avvio deve volare)');
  } finally { rmSync(DESK, { recursive: true, force: true }); }
});

test('desktop INESISTENTE: esce 0 senza crash, niente scorciatoia', () => {
  const fanta = join(tmpdir(), 'fantasma-non-esiste-xyz');
  rmSync(fanta, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [TOOL, '--desktop', fanta], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'mai un errore spinoso: l\'app deve partire lo stesso');
});
