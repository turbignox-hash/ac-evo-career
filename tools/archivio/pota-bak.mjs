#!/usr/bin/env node
// Pota i backup .bak-* vecchi lasciando gli ultimi N per famiglia.
// Per «famiglia» si intende la coppia (cartella, file base): es. tutti i
// GameModeType_RACE_WEEKEND.gamemodesave.bak-* nella stessa cartella.
//
// Regole (30/10 — perché i zip full degli aggiornamenti restano il restore vero,
// questi bak per-scrittura non servono più di un pugno):
//   • data/backups NON si tocca: ha già la sua rotazione agli ultimi 10 (import.mjs).
//   • La sandbox data/test-installazione-pulita NON si tocca (test che la ricostruiscono).
//   • Per ogni altra famiglia: gli ultimi K bak restano (default 3).
//
// uso: node tools/pota-bak.mjs [--k 3] [--dry-run] [--verbose] [--root percorsi…]
//
// Di default bada DUE radici: ./data e la cartella «Saved Games/ACE» del gioco
// (le famiglie grossissime — 162 bak del weekend — vivono lì). --dry-run mostra
// il piano senza cancellare nulla.
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const dry = argv.includes('--dry-run');
const kArg = argv.indexOf('--k');
const K = kArg >= 0 ? Math.max(1, Number(argv[kArg + 1]) || 3) : 3;
const verbose = argv.includes('--verbose');

const roots = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root' && argv[i + 1]) roots.push(argv[++i]);
}
if (!roots.length) roots.push(join(QUI, 'data'), process.env.EVO_SAVED_GAMES ?? 'C:/Users/Mauro/Saved Games/ACE');

const GUARDIE = [/test-installazione-pulita/, /node_modules/, /(^|[\\/])\.git([\\/]|$)/, /(^|[\\/])backups([\\/]|$)/];
const RE_BAK = /^(.*?)\.bak-/;

function * camina(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { yield * camina(p); continue; }
    yield p;
  }
}

const famiglie = new Map();  // chiave «cartella + base» → [{ file, mtime, size }]
for (const root of roots) {
  if (!existsDir(root)) { console.error(`radice non trovata (salto): ${root}`); continue; }
  for (const file of camina(root)) {
    if (GUARDIE.some((g) => g.test(file)) ) continue;
    const m = RE_BAK.exec(basename(file));
    if (!m) continue;
    const key = join(dirname(file), m[1]).toLowerCase();
    const st = statSync(file);
    const row = famiglie.get(key) ?? [];
    row.push({ file, mtime: st.mtimeMs, size: st.size });
    famiglie.set(key, row);
  }
}
function existsDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function basename(p) { return p.replace(/.*[\\/]/, ''); }

let del = 0, ten = 0, tenute = 0;
for (const [key, arr] of [...famiglie].sort((a, b) => b[1].length - a[1].length)) {
  arr.sort((a, b) => b.mtime - a.mtime);
  const daAndare = arr.slice(K);
  if (!daAndare.length) { tenute++; continue; }
  if (verbose) console.log(`— ${key.replace(/\\/g, '/')}  (${arr.length} bak, tene ${arr.length - daAndare.length})`);
  for (const it of daAndare) {
    del++; ten += it.size;
    if (verbose || dry) console.log(`  ${dry ? '[dry] cancellerei' : 'cancello'}  ${it.file.replace(/\\/g, '/')}  (${(it.size / 1024).toFixed(0)} KB)`);
    if (!dry) try { unlinkSync(it.file); } catch (e) { console.error(`  ✖ ${it.file}: ${e.message}`); }
  }
}

const azione = dry ? '(prova) da cancellare' : 'cancellati';
console.log(`\nregola: ultimi ${K} per famiglia — ${famiglie.size} famiglie, ${tenute} già pulite`);
console.log(`${azione}: ${del} file, ${(ten / 1024 / 1024).toFixed(2)} MB`);
if (!dry) console.log(`ripristinare: i rimasti sono i più nuovi di ogni famiglia`);
