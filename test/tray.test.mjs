// test/tray.test.mjs — L'ICONA VICINO ALL'OROLOGIO (4/11/2026, rifinita il 6/11).
//
// Il launcher non deve tornare una finestra di console ridotta: gui-run.cmd
// deve passare da evo-tray.ps1, e lo script deve essere PowerShell valido.
// Non avvia il server né mostra l'icona: il collaudo vero è nel launcher.
//
// 6/11, il difetto visto dall'utente: con Windows Terminal come terminale
// predefinito, `powershell -WindowStyle Hidden` apre LO STESSO una scheda nera
// "Windows PowerShell" (Hidden arriva quando la console è già nata). Ora il
// lancio passa da tools/evo-tray.vbs (WScript.Shell.Run con stile 0: nessuna
// finestra), e la vecchia via PowerShell resta solo come riserva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PS1 = join(ROOT, 'tools', 'evo-tray.ps1');
const VBS = join(ROOT, 'tools', 'evo-tray.vbs');
const CMD = join(ROOT, 'gui-run.cmd');
const AVVIA = join(ROOT, 'avvia.cmd');
const WIN = process.platform === 'win32';

test("tray: gui-run passa dallo script, che e' PowerShell valido", { skip: !WIN && 'solo Windows' }, () => {
  assert.equal(existsSync(PS1), true, 'manca tools/evo-tray.ps1');
  const script = readFileSync(PS1, 'utf8');
  for (const atteso of ['NotifyIcon', 'ContextMenuStrip', 'EVOPitwallTray', 'Start-Process']) {
    assert.ok(script.includes(atteso), `lo script tray non contiene ${atteso}`);
  }

  const cmd = readFileSync(CMD, 'utf8');
  assert.ok(cmd.includes('evo-tray'), 'gui-run.cmd non chiama il tray');
  assert.ok(readFileSync(AVVIA, 'utf8').includes('gui-run.cmd'), 'avvia.cmd non passa da gui-run.cmd');

  const percorso = PS1.replaceAll("'", "''");
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$null = [scriptblock]::Create((Get-Content -Raw -LiteralPath '${percorso}'))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, `PowerShell non riesce a leggere lo script tray:\n${r.stdout}\n${r.stderr}`);
});

test('tray: nessuna console all\'avvio (WScript stile 0), con la via PowerShell come riserva', { skip: !WIN && 'solo Windows' }, () => {
  assert.equal(existsSync(VBS), true, 'manca tools/evo-tray.vbs');
  const vbs = readFileSync(VBS, 'utf8');
  assert.ok(vbs.includes('WScript.Shell'), 'il VBS non usa WScript.Shell');
  assert.ok(vbs.includes('evo-tray.ps1'), 'il VBS non avvia il tray');
  assert.ok(vbs.includes('0, False'), 'il VBS non chiede la finestra nascosta (stile 0)');

  const cmd = readFileSync(CMD, 'utf8');
  assert.ok(cmd.includes('evo-tray.vbs'), 'gui-run.cmd non passa da tools/evo-tray.vbs');
  assert.ok(cmd.includes('wscript'), 'gui-run.cmd non lancia wscript');
  assert.ok(cmd.includes('evo-tray.ps1'), 'gui-run.cmd non ha più la via PowerShell di riserva');
});
