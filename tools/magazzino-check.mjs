#!/usr/bin/env node
// magazzino-check.mjs — piccolo controllo anti-vecchiaia (doppio click su
// controlla-magazzino.cmd, oppure: npm run magazzino).
//
// 1. Il disco L: e' collegato? Cosa c'e' nel magazzino e di quanti giorni e' vecchio?
// 2. Da quando e' stato fatto l'ultimo backup, sono arrivati nuovi commit?
//    Se si' → il backup non copre lo stato attuale: aprire AggiornaMagazzino.cmd
//    dopo aver rifatto lo zip.
//
// È un controllo di avviso: non modifica nulla e non fallisce mai npm test.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const breve = args.includes('--breve'); // usato da avvia.cmd: parla SOLO se c'e' un problema
const MAX_GIORNI = Number(args.find((a) => /^\d+$/.test(a)) || 21);
const MAGAZZINO = process.env.MAGAZZINO_DIR || 'L:\\CarrieraEVO';

function giorniDa(ms) { return Math.floor((Date.now() - ms) / 86400000); }
let problemi = false;
function err(msg) { problemi = true; console.log('  [!] ' + msg); }
function ok(msg)  { console.log('  [x] ' + msg); }

// --- 1. magazzino raggiungibile? ---
if (!breve) console.log('== Magazzino backup (max ' + MAX_GIORNI + ' giorni di vecchiaia accettabile) ==\n');
const drive = MAGAZZINO.slice(0, 3);
if (!existsSync(drive)) {
  // in avvio carriera (breve) il disco staccato non e' un problema da urlare: taccia
  if (breve) process.exit(0);
  err('disco ' + drive + ' non collegato: magazzino non controllabile da qui.');
  err('collega il disco e rilancia, oppure aggiorna il magazzino con AggiornaMagazzino.cmd');
  process.exit(0);
}
if (!existsSync(MAGAZZINO)) {
  err('cartella ' + MAGAZZINO + ' assente: magazzino mai inizializzato.');
  process.exit(0);
}

const zips = readdirSync(MAGAZZINO)
  .filter((f) => f.toLowerCase().endsWith('.zip'))
  .map((f) => ({ f, m: statSync(join(MAGAZZINO, f)).mtimeMs, d: new Date(statSync(join(MAGAZZINO, f)).mtime) }));

if (!zips.length) { err('nessuno zip nel magazzino.'); process.exit(0); }

let piuRecently = 0;
for (const z of zips.sort((a, b) => b.m - a.m)) {
  const g = giorniDa(z.m);
  piuRecently = Math.max(piuRecently, z.m);
  const oggi = g <= MAX_GIORNI;
  if (!oggi) {
    err(breve ? 'backup nel magazzino vecchio di ' + g + ' giorni: rinnova!' : z.f + ' — ' + z.d.toLocaleDateString('it-IT') + ' (' + g + ' giorni fa) — VECCHIA: rinnovare');
    if (!breve) continue;
  }
  if (!breve) ok(z.f + ' — ' + z.d.toLocaleDateString('it-IT') + ' (' + g + ' giorni fa)');
}
const piuFresco = Math.min(...zips.map((z) => giorniDa(z.m)));

// --- 2. il backup copre la storia git? ---
try {
  const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: process.cwd() }).trim();
  const quando = execFileSync('git', ['show', '-s', '--format=%ct', HEAD], { encoding: 'utf8' }).trim();
  const commitDopo =
    piuRecently > 0 && Number(quando) * 1000 > piuRecently
      ? execFileSync('git', ['log', '--oneline', '--since=' + new Date(piuRecently).toISOString()], { encoding: 'utf8' })
          .toString().trim().split('\n').filter(Boolean).length
      : 0;
  if (commitDopo > 0) {
    err(breve
      ? 'attenzione: ' + commitDopo + ' commit non ancora coperti dal backup.'
      : 'il backup e' + "'" + ' fatto PRIMA di ' + commitDopo + ' commit recenti: non proteggono lo stato attuale.');
    err('rigenera il backup completo (zip con .git) e poi lancia AggiornaMagazzino.cmd');
  } else if (!breve) {
    ok('storia git: l' + "'" + 'ultimo backup copre l' + "'" + 'ultimo commit a oggi.');
  }
} catch {
  if (!breve) err('git non disponibile qui: salto il confronto con la storia.');
}

if (breve && !problemi) console.log('  (backup magazzino: tutto protetto, ultima copia ' + piuFresco + ' giorni fa)');
console.log('');
process.exit(0);
