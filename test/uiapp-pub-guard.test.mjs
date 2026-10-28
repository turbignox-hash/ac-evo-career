// test/uiapp-pub-guard.test.mjs — la GUARDIA ANTI-DOPPIO-PUBLISHER (28/10).
//
// Il fatto che la scrive: due server webui vivi insieme (8642 vero + un
// doppione sulla 8645 della mattina) riscrivevano gli stessi ui-<fascia>.json
// del canale Cruscotto ogni 2,5s, e l'app in gioco riceveva a metà strada la
// fascia del doppione — che cancellava il comando (R5) con un null. La cura
// è il lock a PID (file `.publisher.pid` nella cartella dell'app): chi lo
// tiene vivo tace, chi lo trova morto lo riprende. Qui si prova la meccanica:
//   1. senza lock → si prende il canale;
//   2. con il lock di un PID VIVO estraneo → tace (false), e NON riscrive
//      il lock altrui;
//   3. con il lock di un PID MORTO → lo riprende e lo riscrive con il suo
//      PID (un crash non sequestra il canale per sempre);
//   4. con il lock proprio → continua, senza ostacoli.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prendiLock } from '../src/uiapp-pub.mjs';

// la cartella dell'app ESISTE per forza (la scrive il loader), e مل'archio
// del test la crea davvero: rmSync in fondo la si usa solo per ripulire.
const APP_DIR = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'evo-pub-guard-')), 'app');
  mkdirSync(dir, { recursive: true });
  return dir;
};
const PID_FILE = '.publisher.pid';

test('cartella libera: prendiLock prende il canale e scrive il PID', () => {
  const dir = APP_DIR();
  assert.equal(prendiLock(dir), true, 'senza lock l\'accesso è nostro');
  const pid = String(readFileSync(join(dir, PID_FILE), 'utf8')).trim();
  assert.equal(pid, String(process.pid), 'il lock deve portare il nostro PID');
  rmSync(dir, { recursive: true, force: true });
});

test('doppione vivo: tace e non tocca il lock altrui', async () => {
  const dir = APP_DIR();
  const doppione = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    writeFileSync(join(dir, PID_FILE), String(doppione.pid), 'utf8');
    const pidFile = readFileSync(join(dir, PID_FILE), 'utf8');
    assert.equal(prendiLock(dir), false, 'con un detentore vivo deve tacere');
    assert.equal(readFileSync(join(dir, PID_FILE), 'utf8'), pidFile, 'il lock del vivo resta intatto');
  } finally {
    doppione.kill();
  }
  rmSync(dir, { recursive: true, force: true });
});

test('lock di un PID morto: viene ripreso e riscritto', async () => {
  const dir = APP_DIR();
  // un PID che NON esiste più: lo spawn di un processo che esce subito e
  // aspettarne l'exit è il modo affidabile per averne uno, senza sparare ad
  // un numero fisso (i PID si riutilizzano).
  const morto = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((res) => morto.on('exit', res));
  writeFileSync(join(dir, PID_FILE), String(morto.pid), 'utf8');
  assert.equal(prendiLock(dir), true, 'lo scranno morto va recuperato');
  assert.equal(String(readFileSync(join(dir, PID_FILE), 'utf8')).trim(), String(process.pid),
    'il lock ripreso deve portare il nostro PID');
  rmSync(dir, { recursive: true, force: true });
});

test('lock nostro: continuiamo senza ostacoli', () => {
  const dir = APP_DIR();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, PID_FILE), String(process.pid), 'utf8');
  assert.equal(prendiLock(dir), true, 'tenere il lock proprio non è un\'ostacolo');
  rmSync(dir, { recursive: true, force: true });
});
