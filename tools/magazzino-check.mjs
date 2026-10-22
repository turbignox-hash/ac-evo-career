#!/usr/bin/env node
// magazzino-check.mjs — piccolo controllo anti-vecchiaia (doppio click su
// controlla-magazzino.cmd, oppure: npm run magazzino).
//
// 1. Il disco L: e' collegato? Cosa c'e' nel magazzino e di quanti giorni e' vecchio?
// 2. Da quando e' stato fatto l'ultimo backup, sono arrivati nuovi commit?
//    Se si' → il backup non copre lo stato attuale: aprire AggiornaMagazzino.cmd
//    dopo aver rifatto lo zip.
// 3. La copia off-site GitHub (remote `offsite`) e' allineata al disco?
//    Senza rete il check si tace, come per il disco L: staccato.
//
// È un controllo di avviso: non modifica nulla e non fallisce mai npm test.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const breve = args.includes('--breve'); // usato da avvia.cmd: parla SOLO se c'e' un problema
const MAX_GIORNI = Number(args.find((a) => /^\d+$/.test(a)) || 21);
const MAGAZZINO = process.env.MAGAZZINO_DIR || 'L:\\CarrieraEVO';

function giorniDa(ms) { return Math.floor((Date.now() - ms) / 86400000); }
let problemi = false;
function err(msg) { problemi = true; console.log('  [!] ' + msg); }
function ok(msg)  { console.log('  [x] ' + msg); }
function voce(msg) { console.log('  -  ' + msg); } // informazione, non un problema
// esegue un comando e dice solo se e' andato bene (per git merge-base --is-ancestor)
function gitOk(argsGit) {
  try { execFileSync('git', argsGit, { stdio: 'pipe', cwd: process.cwd() }); return true; } catch { return false; }
}

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

let piuRecente = 0;
for (const z of zips.sort((a, b) => b.m - a.m)) {
  const g = giorniDa(z.m);
  piuRecente = Math.max(piuRecente, z.m);
  const inSoglia = g <= MAX_GIORNI;
  if (!inSoglia) {
    err(breve ? 'backup nel magazzino vecchio di ' + g + ' giorni: rinnova!' : z.f + ' — ' + z.d.toLocaleDateString('it-IT') + ' (' + g + ' giorni fa) — VECCHIA: rinnovare');
    if (!breve) continue;
  }
  if (!breve) ok(z.f + ' — ' + z.d.toLocaleDateString('it-IT') + ' (' + g + ' giorni fa)');
}
const piuFresco = Math.min(...zips.map((z) => giorniDa(z.m)));

// HEAD una volta sola, serve ai check 2 e 3
let HEAD = '';
let gitPronto = true;
try { HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: process.cwd() }).trim(); }
catch { gitPronto = false; }

// --- 2. il backup copre la storia git? ---
if (!gitPronto) {
  if (!breve) voce('git non disponibile qui: salto il confronto con la storia.');
} else {
  const quando = execFileSync('git', ['show', '-s', '--format=%ct', HEAD], { encoding: 'utf8' }).trim();
  const commitDopo =
    piuRecente > 0 && Number(quando) * 1000 > piuRecente
      ? execFileSync('git', ['log', '--oneline', '--since=' + new Date(piuRecente).toISOString()], { encoding: 'utf8' })
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
}

// --- 3. copia off-site GitHub: allineata al disco? ---
let remoto = '';
try {
  // timeout corto e niente prompt interattivo: senza rete il check si tace
  remoto = execFileSync('git', ['ls-remote', 'offsite', 'refs/heads/main'], {
    encoding: 'utf8', cwd: process.cwd(), timeout: 10000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
} catch {
  if (!breve) voce('off-site GitHub: non controllabile adesso (rete?).');
}
const hashRemoto = (remoto.toString().split('\t')[0] ?? '').trim();
if (gitPronto && hashRemoto) {
  if (hashRemoto === HEAD) {
    if (!breve) ok('off-site GitHub: allineata al disco (' + hashRemoto.slice(0, 7) + ').');
  } else if (gitOk(['merge-base', '--is-ancestor', hashRemoto, HEAD])) {
    // GitHub e' antenato del disco: e' il disco ad avere piu' commit → manca il push
    let n = 0;
    try { n = Number(execFileSync('git', ['rev-list', '--count', hashRemoto + '..' + HEAD], { encoding: 'utf8' }).trim()); } catch {}
    err(breve
      ? 'off-site GitHub indietro: rinnova con sincronizza-git.cmd.'
      : 'off-site GitHub: il disco ha ' + (n || 'alcuni') + ' commit che GitHub non ha: lancia sincronizza-git.cmd.');
  } else if (gitOk(['merge-base', '--is-ancestor', HEAD, hashRemoto])) {
    // il disco e' antenato di GitHub: il PC locale sta indietro (casi rari: PC nuovo)
    let n = 0;
    try { n = Number(execFileSync('git', ['rev-list', '--count', HEAD + '..' + hashRemoto], { encoding: 'utf8' }).trim()); } catch {}
    err(breve
      ? 'il disco locale e' + "'" + ' indietro rispetto a GitHub.'
      : 'off-site GitHub ha ' + (n || 'alcuni') + ' commit che il disco non ha: recupera con `git fetch offsite && git merge ff-only offsite/main`.');
  } else {
    err(breve
      ? 'off-site GitHub diverge dal disco: allinea con push o pull.'
      : 'off-site GitHub (' + hashRemoto.slice(0, 7) + ') diverge dal disco (' + HEAD.slice(0, 7) + '): allinea a scelta con push o pull.');
  }
}

if (breve && !problemi) console.log('  (backup magazzino: tutto protetto, ultima copia ' + piuFresco + ' giorni fa)');
console.log('');
process.exit(0);
