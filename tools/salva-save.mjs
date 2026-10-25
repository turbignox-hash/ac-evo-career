#!/usr/bin/env node
// salva-save.wjs — backup AUTOMATICO del save di Assetto Corsa EVO (26/10).
//
// Punto di forza: - CLIENT a hook (come magazzino-check e aggiornamenti):
//   risiede in avvia.cmd :aprigui, gira ogni doppio click del launcher;
//   -0 se il backup è fresco, non fa niente MAI (le scorciatorie possono
//   attaccarsi a gola ogni avvio correndo in loop; non tocca il GUI);
//   -0 zip dello save con tar.exe (portabile, già installato su Windows 10+);
//   -0 cubic che ruota sui 2 SLOT, NON SOLO COPIE: ogni save è su uno slot
//   diverso, così il SAVE ATTIVO esce sempre fuori con lo zip più recente
//   (rotazione uguale per slot tanto l'UPDATE non cancella niente);
//   -0 taglio automatico ai 4 zip PIÙ RECENTI: l'utente non deve mai fare
//   cose a mano;
//   -0 CREAZIONE protetta: EVO il launcher non tocca data/ (che contiene
//   tutti i default dell'utente), quindi lo zip NON PUÒ MAI sovrascrivere
//   i registri del save: generiamo backup-save\\slot-N alla rovescia.
//
// LANCIO DIRETTO (i client questi:
//   node tools/salva-save.mjs            backup se stantio (? > 36h)
//   node tools/salva-save.mjs --check    exit 0: fresco   exit 1: stantio/assen
//                                        [usato da run-primavera dopo]
//   node tools/salva-save.mjs --force    backup SEMPRE (client con importo)
//   node tools/salva-save.mjs --stale-hours N   tenere più fresco o più lento
//   node tools/salva-save.mjs --data <cartella> override del save 2-to-1 per test

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dataDirCandidates } from '../src/paths.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null;
};
const hasFlag = (nome) => args.includes(`--${nome}`) || flag(nome) != null;

const STALE_ORE_DEFAULT = 36;   // un backup al giorno e mezzo circa, fino a 3 avvii GRATIS
const MAX_ZIP = 4;              // su TUTTI gli slot poi: vecchi zip si cancellano SOLI
const NOMI_SLOT = ['slot-1', 'slot-2'];

function leggiDirectory() {
  const override = flag('data') || process.env.ACE_DATA || null;
  const candidatas = override ? [override] : dataDirCandidates();
  for (const c of candidatas) if (existsSync(c)) return c;
  return null;
}

function ultimoZip(dir) {
  // glob lento: i zip vivono SOLO in slot-*/ dire in esses...
  const out = [];
  for (const slot of NOMI_SLOT) {
    const d = join(dir, slot);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      out.push(p);
    }
  }
  if (!out.length) return null;
  return out
    .map((p) => ({ p, m: statSync(p).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    [0];
}

function elastico(ms) {
  const d = new Date(ms);
  const due = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}-${due(d.getMinutes())}-${due(d.getSeconds())}`;
}

function principale() {
  const dir = leggiDirectory();
  if (!dir) {
    // il gioco non è mai partito su questo PC: niente da salvare, non è un errore
    if (hasFlag('check')) process.exit(1);
    process.exit(0);
  }

  const dest = join(RADICE, 'data', 'salva-save');
  const zippi = ultimoZip(dest);

  if (!hasFlag('force') && zippi) {
    const ore = (Date.now() - zippi.m) / 36e5;
    // Number('0') e' falsy: il `|| default` lo rimangiava (36h anche con
    // --stale-hours 0). Ma anche Number(null) = 0: la soglia sarebbe stata
    // ZERO ore per chi NON passava --stale-hours, tutto sempre «stantio».
    // null = «opzione assente», non 0. 26/10.
    const rawst = flag('stale-hours');
    const n = rawst == null ? NaN : Number(rawst);
    const soglia = Number.isFinite(n) && n >= 0 ? n : STALE_ORE_DEFAULT;
    if (ore < soglia) {
      // fresco: CLIENT: esce 0 / --check: exit 0 con il cannone
      if (hasFlag('check')) process.exit(0);
      process.exit(0);
    }
    if (hasFlag('check')) process.exit(1);
  }
  if (hasFlag('check')) process.exit(zippi ? 0 : 1);

  // ---------- decide lo slot NON attivo ----------
  let prox = 1;
  try {
    const info = JSON.parse(readFileSyncEx(join(dest, 'salva-save.json'), 'utf8'));
    if (Number.isInteger(info.next) && info.next >= 1 && info.next <= NOMI_SLOT.length) prox = info.next;
  } catch { /* primo giro: slot 1 */ }
  const slot = NOMI_SLOT[(prox - 1) % NOMI_SLOT.length];

  // ---------- zip ----------
  const quando = elastico(Date.now());
  const file = join(dest, slot, `save-${quando}.zip`);
  mkdirSync(join(dest, slot), { recursive: true });

  // tar.exe è l'unico zip tool presente su ogni Windows 10+ (niente 7zip, niente PS)
  const tar = process.env.WINDIR ? join(process.env.WINDIR, 'System32', 'tar.exe') : 'tar.exe';
  const esito = spawnSync(tar,
    ['-caf', file, '-C', dir, '.'],
    { windowsHide: true, timeout: 10 * 60_000 });
  if (esito.error || esito.status !== 0) {
    console.error(`[!] backup non riuscito: ${esito.error?.message ?? (esito.stderr ?? '').slice(-400)}`);
    rmSync(file, { force: true });
    process.exit(0); // il launcher NON deve bloccarsi: fallimento silenzioso
  }

  // ---------- rotazione:巷 MAX_ZIP più recenti fra TUTTI gli slot ----------
  const tutti = [];
  for (const s of NOMI_SLOT) {
    const d = join(dest, s);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      tutti.push({ p, m: statSync(p).mtimeMs });
    }
  }
  tutti.sort((a, b) => b.m - a.m);
  for (const vecchio of tutti.slice(MAX_ZIP)) rmSync(vecchio.p, { force: true });

  const prossimo = (prox % NOMI_SLOT.length) + 1;
  const taglio = tutti.slice(0, MAX_ZIP).length; // quelli GIUSTI che restano
  writeFileSync(join(dest, 'salva-save.json'), JSON.stringify({
    active: prox,
    slot,
    zip: file.replace(RADICE + '\\', '').replace(/\\/g, '/'),
    quando,
    size: statSync(file).size,
    zip_vivi: taglio,
    next: prossimo,
  }, null, 2) + '\n');

  // il client attivo si ha finito in avvia: niente a schermo in :aprigui
  console.log(`[x] backup del save: ${file.replace(RADICE + '\\', '')}`);
  process.exit(0);
}

// piccolo helper: readFileSync ma torna null se il file manca
function readFileSyncEx(p, enc) {
  try {
    return readFileSync(p, enc);
  } catch { return null; }
}

principale();
