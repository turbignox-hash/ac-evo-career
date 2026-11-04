// test/scorciatoia.test.mjs — collaudo delle scorciatoie automatiche (26/10,
// richiesta Mauro: «l'amico che installa deve trovare l'icona già fatta»;
// 4/11: anche nel menu Start, senza rubare i collegamenti altrui).
// Il tool va esercitato COME lo usa il launcher: con un Desktop-vacanze e un
// menu Start-vacanze in dir temporanee (--desktop/--startmenu), mai toccando
// quelli veri dell'utente.
// Su Windows crea i .lnk con l'icona Pitwall; altrove esce silenzioso e il
// test salta.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// nel .lnk (binario) i blocchi di testo sono UTF-16 ma NON allineati a parity
// fissa: la decodifica dell'intero file come utf16le sbacia a seconda della
// lunghezza del percorso (26/10: passava su "Desktop\\Mod ac evo" e moriva su
// "EVO-Pitwall"). Si cerca la SEQUENZA DI BYTE della parola, alignment-proof.
function contSiraw(lnk, par) {
  const raw = readFileSync(lnk);
  // prova la decodifica a offerta pari e a offerta dispari: una delle due
  // allinea i blocchi UTF-16 interni al .lnk, sempre
  const pari = raw.toString('utf16le');
  const dispari = Buffer.concat([Buffer.from([0]), raw]).toString('utf16le');
  return pari.includes(par) || dispari.includes(par);
}

/** Crea un .lnk "straniero" (altra installazione) nel menu Start di prova. */
function creaLnk(lnk, target) {
  const ps = [
    '$shell = New-Object -ComObject WScript.Shell',
    `$s = $shell.CreateShortcut('${lnk}')`,
    `$s.TargetPath = '${target}'`,
    '$s.Save()',
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'il test non riesce a costruire il finto .lnk: ' + (r.stderr ?? ''));
}

const TOOL = join(import.meta.dirname, '..', 'tools', 'crea-scorciatoia.mjs');
const WIN = process.platform === 'win32';

test('scorciatoie ASSENTI: create su Desktop e menu Start, icona Pitwall, target avvia.cmd', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia-'));
  const START = mkdtempSync(join(tmpdir(), 'scorciatoia-start-'));
  try {
    const r = spawnSync(process.execPath, [TOOL, '--desktop', DESK, '--startmenu', START], { encoding: 'utf8' });
    assert.equal(r.status, 0, `il tool deve uscire 0, stdout: ${r.stdout} stderr: ${r.stderr}`);
    for (const [cartella, nome] of [[DESK, 'desktop'], [START, 'menu Start']]) {
      const lnk = join(cartella, 'Carriera EVO.lnk');
      assert.equal(existsSync(lnk), true, `il .lnk deve esistere nel ${nome} di prova`);
      // dentro il .lnk (binario UTF-16) ci devono stare i percorsi del progetto
      assert.ok(contSiraw(lnk, 'avvia.cmd'), `target = avvia.cmd del progetto (${nome})`);
      assert.ok(contSiraw(lnk, 'pitwall.ico'), `icona = gui/pitwall.ico del repo, non il node.exe verde (${nome})`);
    }
  } finally {
    rmSync(DESK, { recursive: true, force: true });
    rmSync(START, { recursive: true, force: true });
  }
});

test('scorciatoie GIÀ A POSTO: secondo giro idempotente, esce 0 e non dice niente', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia2-'));
  const START = mkdtempSync(join(tmpdir(), 'scorciatoia2-start-'));
  try {
    const arg = ['--desktop', DESK, '--startmenu', START];
    spawnSync(process.execPath, [TOOL, ...arg], { encoding: 'utf8' }); // prima: le crea
    const r2 = spawnSync(process.execPath, [TOOL, ...arg], { encoding: 'utf8' });
    assert.equal(r2.status, 0);
    assert.equal((r2.stdout ?? '').trim(), '', 'con le scorciatoie già buone: silenzio (ogni avvio deve volare)');
  } finally {
    rmSync(DESK, { recursive: true, force: true });
    rmSync(START, { recursive: true, force: true });
  }
});

test('menu Start di UN\'ALTRA installazione: non viene toccato né rinominato', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia3-'));
  const START = mkdtempSync(join(tmpdir(), 'scorciatoia3-start-'));
  try {
    const lnk = join(START, 'Carriera EVO.lnk');
    creaLnk(lnk, 'C:\\altra-installazione\\avvia.cmd');
    const r = spawnSync(process.execPath, [TOOL, '--desktop', DESK, '--startmenu', START], { encoding: 'utf8' });
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(contSiraw(lnk, 'altra-installazione'), 'target della scorciatoia altrui cambiato');
    assert.ok(!contSiraw(lnk, 'pitwall.ico'), 'icona della scorciatoia altrui cambiata');
    assert.equal(existsSync(join(DESK, 'Carriera EVO.lnk')), true, 'la scorciatoia nostra sul Desktop deve nascere lo stesso');
  } finally {
    rmSync(DESK, { recursive: true, force: true });
    rmSync(START, { recursive: true, force: true });
  }
});

test('desktop INESISTENTE: esce 0 senza crash, niente scorciatoia', () => {
  const fanta = join(tmpdir(), 'fantasma-non-esiste-xyz');
  rmSync(fanta, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [TOOL, '--desktop', fanta], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'mai un errore spinoso: l\'app deve partire lo stesso');
});

test('menu Start INESISTENTE: esce 0 e crea solo il Desktop indicato', { skip: !WIN && 'solo Windows' }, () => {
  const DESK = mkdtempSync(join(tmpdir(), 'scorciatoia5-'));
  const fanta = join(tmpdir(), 'fantasma-start-non-esiste-xyz');
  rmSync(fanta, { recursive: true, force: true });
  try {
    const r = spawnSync(process.execPath, [TOOL, '--desktop', DESK, '--startmenu', fanta], { encoding: 'utf8' });
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.equal(existsSync(join(DESK, 'Carriera EVO.lnk')), true, 'il Desktop indicato deve avere la scorciatoia');
    assert.equal(existsSync(fanta), false, 'la cartella inesistente non deve nascere');
  } finally {
    rmSync(DESK, { recursive: true, force: true });
  }
});
