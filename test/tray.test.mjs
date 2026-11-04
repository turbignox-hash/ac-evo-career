// test/tray.test.mjs — L'ICONA VICINO ALL'OROLOGIO (4/11/2026).
//
// Il launcher non deve tornare una finestra di console ridotta: gui-run.cmd
// deve passare da evo-tray.ps1, e lo script deve essere PowerShell valido.
// Non avvia il server né mostra l'icona: il collaudo vero è nel launcher.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PS1 = join(ROOT, 'tools', 'evo-tray.ps1');
const CMD = join(ROOT, 'gui-run.cmd');
const AVVIA = join(ROOT, 'avvia.cmd');
const WIN = process.platform === 'win32';

test('tray: gui-run passa dallo script, che e\' PowerShell valido', { skip: !WIN && 'solo Windows' }, () => {
  assert.equal(existsSync(PS1), true, 'manca tools/evo-tray.ps1');
  const script = readFileSync(PS1, 'utf8');
  for (const atteso of ['NotifyIcon', 'ContextMenuStrip', 'EVOPitwallTray', 'Start-Process']) {
    assert.ok(script.includes(atteso), `lo script tray non contiene ${atteso}`);
  }

  const cmd = readFileSync(CMD, 'utf8');
  assert.match(cmd, /evo-tray\.ps1/);
  assert.match(cmd, /-WindowStyle Hidden/);
  assert.match(readFileSync(AVVIA, 'utf8'), /gui-run\.cmd/);

  const percorso = PS1.replaceAll("'", "''");
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `$null = [scriptblock]::Create((Get-Content -Raw -LiteralPath '${percorso}'))`], { encoding: 'utf8' });
  assert.equal(r.status, 0, `PowerShell non riesce a leggere lo script tray:\n${r.stdout}\n${r.stderr}`);
});
