#!/usr/bin/env node
// aggiornamenti.mjs — guarda il clone off-site GitHub (`offsite`) e dice se
// ci sono aggiornamenti di progetto da portare giu' sul disco (come fa
// Zero to Apex al suo lancio, ma con il consenso sempre richiesto).
//
//   statoAggiornamenti()     confronto HEAD vs remote (senza toccare nulla)
//   installaAggiornamenti()  fetch + merge --ff-only + npm test
//   lancio diretto:          node tools/aggiornamenti.mjs [--breve]
//
// Il save carriera NON si tocca: `data/` resta locale perche' e' fuori dal repo.
// Senza rete il check si tace in forma breve e il launcher prosegue uguale.

import { execFileSync, execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { viaGit, statoZipAsync, installaZip } from './aggiorna-zip.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

function gitRun(args, timeout = 15000) {
  return execFileSync('git', args, {
    encoding: 'utf8', cwd: RADICE, timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString().trim();
}
function gitOk(args) {
  try { execFileSync('git', args, { stdio: 'pipe', cwd: RADICE, timeout: 15000 }); return true; }
  catch { return false; }
}

// --- 1: solo lettura, nessuna modifica ---
// VARIANTE NON BLOCCANTE (audit freeze 23/10: la GUI riapriva '/api/boot' in
// attesa di ls-remote — il server intero si congelava finché GitHub rispondeva,
// fino a 8s). Stessa semantica della versione sincrona, ma con execFile in
// attesa NON bloccante: il processor di altri server continua a girare.
const execFileP = promisify(execFile);
async function gitRunAsync(args, timeout = 15000) {
  const { stdout } = await execFileP('git', args, {
    encoding: 'utf8', cwd: RADICE, timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return String(stdout ?? '').trim();
}
async function gitOkAsync(args) {
  try { await execFileP('git', args, { stdio: 'pipe', cwd: RADICE, timeout: 15000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); return true; }
  catch { return false; }
}
export async function statoAggiornamentiAsync() {
  // VIA ZIP (24/10): senza .git non c'è cosa mergeta — il confronto è
  // build-id.txt vs l'ultimo commit di GitHub via API, e l'installazione
  // scarica la zipball (tools/aggiorna-zip.mjs). STESSA forma di risultato:
  // GUI, launcher e CLI non sanno la differenza.
  if (!viaGit()) return statoZipAsync();
  let head = '';
  try { head = await gitRunAsync(['rev-parse', 'HEAD']); }
  catch { return { skip: true, motivo: 'git non disponibile qui.' }; }
  let remoto = '';
  try {
    const out = await gitRunAsync(['ls-remote', 'offsite', 'refs/heads/main'], 8000);
    remoto = (out.split('\t')[0] ?? '').trim();
  } catch { return { skip: true, motivo: 'GitHub non raggiungibile (offline?).' }; }
  if (!remoto) return { skip: true, motivo: 'il remote offsite non risponde con un commit.' };

  if (remoto === head) return { equal: true, discoAvanti: 0 };
  if (await gitOkAsync(['merge-base', '--is-ancestor', remoto, head])) return { discoAvanti: 1, remotoAvanti: 0, equal: false };
  if (await gitOkAsync(['merge-base', '--is-ancestor', head, remoto])) {
    let n = 0;
    try { n = Number(await gitRunAsync(['rev-list', '--count', head + '..' + remoto])); } catch { /* resta 0 */ }
    return { remotoAvanti: n || 1, discoAvanti: 0, equal: false };
  }
  return { diverged: true, equal: false };
}

export function statoAggiornamenti() {
  let head = '';
  try { head = gitRun(['rev-parse', 'HEAD']); }
  catch { return { skip: true, motivo: 'git non disponibile qui.' }; }
  let remoto = '';
  try {
    const out = gitRun(['ls-remote', 'offsite', 'refs/heads/main'], 8000);
    remoto = (out.split('\t')[0] ?? '').trim();
  } catch { return { skip: true, motivo: 'GitHub non raggiungibile (offline?).' }; }
  if (!remoto) return { skip: true, motivo: 'il remote offsite non risponde con un commit.' };

  if (remoto === head) return { equal: true, discoAvanti: 0 };
  if (gitOk(['merge-base', '--is-ancestor', remoto, head])) return { discoAvanti: 1, remotoAvanti: 0, equal: false };
  if (gitOk(['merge-base', '--is-ancestor', head, remoto])) {
    let n = 0;
    try { n = Number(gitRun(['rev-list', '--count', head + '..' + remoto])); } catch { /* resta 0 */ }
    return { remotoAvanti: n || 1, discoAvanti: 0, equal: false };
  }
  return { diverged: true, equal: false };
}

// --- 2: l'aggiornamento VERO, sempre richiesto a voce prima ---
export async function installaAggiornamenti() {
  // VIA ZIP (24/10): senza .git la «merge» è la copia della zipball con
  // data/ intatto (aggiorna-zip.mjs.installaZip), seguita dal suo npm test
  if (!viaGit()) return await installaZip();
  const s = statoAggiornamenti();
  if (s.skip) return { ok: false, messaggio: 'aggiornamento non controllabile adesso: ' + (s.motivo ?? '') };
  if (s.diverged) return { ok: false, messaggio: 'GitHub e il disco divergono: allinearli richiede una decisione tua (push o pull), non un aggiornamento automatico.' };
  if (!s.remotoAvanti) return { ok: true, nessuno: true, messaggio: 'Nessun aggiornamento: sei gia\u0300 al passo con GitHub.' };
  try { gitRun(['fetch', 'offsite', 'main']); }
  catch { return { ok: false, messaggio: 'fetch da GitHub non riuscito (rete o credenziali).' }; }
  try { gitRun(['merge', '--ff-only', 'offsite/main']); }
  catch { return { ok: false, messaggio: 'merge rifiutato: avresti file locali modificati in conflitto. Guarda `git status` e risolvi a mano.' }; }
  let testOk = null, testOut = '';
  try {
    execSync('npm test', { encoding: 'utf8', cwd: RADICE, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
    testOk = true;
  } catch (e) {
    testOk = false;
    const text = String(e.stdout ?? '') + '\n' + String(e.stderr ?? '');
    testOut = text.split('\n').filter(Boolean).slice(-8).join('\n');
  }
  let hash = '';
  try { hash = gitRun(['rev-parse', 'HEAD']).slice(0, 7); } catch { /* hash cosmetico */ }
  return { ok: true, hash, testOk, testOut, installati: s.remotoAvanti };
}

// --- CLI: lancio diretto (usato da avvia.cmd) ---
async function chiedi(domanda, ms) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const risp = await Promise.race([rl.question(domanda), sleep(ms).then(() => '')]);
    return risp.trim().toLowerCase().startsWith('s');
  } finally { rl.close(); }
}

async function main() {
  const breve = process.argv.includes('--breve');
  // la variante ASINCRONA decide da sola il canale: clone (git) o zip (API)
  const s = await statoAggiornamentiAsync();
  if (s.skip) {
    if (!breve) console.log('  -  aggiornamenti: ' + (s.motivo ?? 'non controllabili adesso.'));
    return;
  }
  if (!s.remotoAvanti) {
    if (!breve) console.log('  [x] aggiornamenti: sei al passo con GitHub.');
    return;
  }
  console.log('  [\u2191] Ci sono ' + s.remotoAvanti + ' aggiornamenti di progetto su GitHub. (il tuo save non si tocca)');
  const si = await chiedi('      Installare ora? [s/N] (attendi 15s, Invio = no): ', 15000);
  if (!si) { console.log('  -  aggiornamento saltato: si parte con la versione sul disco.'); return; }
  const r = await installaAggiornamenti();
  if (r.ok && r.nessuno) console.log('  -  ' + r.messaggio);
  else if (r.ok) {
    console.log('  [x] Installati ' + r.installati + ' aggiornamenti: ora sei a ' + (r.hash ?? '?') + '.');
    console.log(r.testOk === false
      ? '  [!] npm test FALLITO dopo l\u2019aggiornamento:\n' + r.testOut
      : '  [x] npm test: passati.');
    console.log('     Riavvia il launcher per usare il codice nuovo.');
  } else console.log('  [!] ' + r.messaggio);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
