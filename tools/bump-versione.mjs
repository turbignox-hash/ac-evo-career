#!/usr/bin/env node
// bump-versione.mjs — alza di 1 la versione (patch) del package.json.
//
// Chiamato da sincronizza-git.cmd PRIMA di `git add -A`: cosi' il numero nuovo
// entra nello stesso commit e la versione visibile in GUI (side-foot della
// pagina, `build <semver> · <hash>`) cambia a ogni salvataggio del progetto
// su GitHub. Silenzioso in successo; se qualcosa fallisce NON blocca la
// sincronizzazione (il launcher prosegue con la versione precedente).
//
//   node tools/bump-versione.mjs [--check]     (--check stampa solo il valore attuale)
//   lancio diretto:                            npm run bump

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(RADICE, 'package.json');

function leggi() {
  const raw = readFileSync(FILE, 'utf8');
  const pkg = JSON.parse(raw);
  if (!/^(\d+)\.(\d+)\.(\d+)$/.test(pkg.version ?? '')) {
    console.error(`  [!] package.json: versione non valida (${pkg.version}): non la tocco.`);
    process.exit(0); // exit 0: il sync continua, non e' un errore bloccante
  }
  return { raw, pkg };
}

function scrivi(pkg, nuovo) {
  pkg.version = nuovo;
  // 2 spazi, come il file attuale; il newline finale lo preserviamo
  writeFileSync(FILE, JSON.stringify(pkg, null, 2) + '\n');
}

const [, , flag] = process.argv;
const { pkg } = leggi();

if (flag === '--check') {
  console.log(pkg.version);
  process.exit(0);
}

const vecchia = pkg.version;
const [, maje, mine, patch] = /^(\d+)\.(\d+)\.(\d+)$/.exec(vecchia);
const nuova = `${maje}.${mine}.${Number(patch) + 1}`;
scrivi(pkg, nuova);
console.log(`  [x] versione build: ${vecchia} -> ${nuova} (visibile in GUI dopo il riavvio del launcher)`);
