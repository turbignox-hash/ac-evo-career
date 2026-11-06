#!/usr/bin/env node
// salva-save.mjs — backup AUTOMATICO del save di Assetto Corsa EVO (26/10).
//
// Che fa:
//   - zip del save(Saved Games\ACE, o Documents\ACE per versioni vecchie, o
//     ACE_DATA se l'override e' impostato) con tar.exe di Windows: niente
//     7-zip, niente PowerShell, niente dipendenze;
//   - slot-1 / slot-2 in ROTAZIONE (ogni backup va zo slot alternata, la
//     conta vive in data/salva-save/salva-save.json → campo next);
//   - taglio automatico ai MAX_ZIP=2 zip PIÙ RECENTI su TUTTI gli slot
//     (30/10: da 4 a 2 — gli zip FULL pesano ~750 MB l'uno e con 4 slot la
//      pila arrivava a 1,5 GB; con 2.slot il peso resta ~750 MB e il vecchio
//      FULL esce alla PRIMA rotazione, non dopo 2 cicli vuoti)
//   - CLIENT a boot: se l'ultimo backup e' più fresco di 36 ore non fa
//     nulla (silenzioso, exit 0): gli avvii del launcher in serie non
//     fanno IO di tia senza motivo.
//
// DUE MODI DI USARE IL MOTORE (26/10, sezione GUI «Backup del save di EVO»
// in viste-d.js vivace in-process, senza spine l'CLI):
//   import { statoBackup, forzaBackup } from '../tools/salva-save.mjs';
//   statoBackup() → { saveDirFound, zips: [], ultimo, ageHours, fresh, ... }
//   forzaBackup() → { ok, zip, size, slot, zip_vivi, stato }
//
// CLI (node tools/salva-save.mjs):
//   (senza arg) backup SOLO se l'ultimo e' stantio (> 36 ore). Silenzioso:
//   se stantio zippa; se fresco esce 0 senza fare una piega.
//   --check        exit 0 = backup fresco, exit 1 = stantio/assen/corrotto
//                  [usato da tool di prima-hiberna e magazzino-check]
//   --force        backup SEMPRE (l'import in uppa non lo skipper)
//   --stale-hours N  cambia la soglia (peccaminoso solo per test)
//   --data <dir>   save da un'ALTRA cartella (peccaminoso per test)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dataDirCandidates } from '../src/paths.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST_BASE = join(RADICE, 'data', 'salva-save');

export const STALE_ORE_DEFAULT = 36;   // backup ogni ~girone e mezzo, massimo 3 avvii gratis
export const MAX_ZIP = 2;              // su TUTTI gli slot: vecchi si cancellano SOLI
export const NOMI_SLOT = ['slot-1', 'slot-2'];

// Esclusioni del backup (28/10, audit A1): NESSUNA è dato di salvataggio —
// MoTec (telemetrie), replay (176 MB), crashdumps (130 MB), mods UI (82 MB) e
// logs (8 MB) pesano tanto e si ricavano da soli. Il resto del save (ProfileData,
// GameModes, Results, setups, impostazioni) resta TUTTO nel zip. QUESITO CHIUSO 28/10
// (test restore in sandbox): nessun «2026.ld» monolitico esiste — i *.ld sono
// SOLO log MoTec (già esclusi) e il restore dell'ultimo zip tira su 701 file col save completo.
export const ESCLUSIONI_SAVE = ['MoTec', 'Replay', 'crashdumps', 'Logs', 'mods'];
// pattern per bsdtar: i membri del zip portano il prefisso ./ (tar -C dir .)
const argEsclusioniSave = ESCLUSIONI_SAVE.flatMap((n) => [`--exclude=./${n}`, `--exclude=./${n}/*`]);

// ————— parsing opzioni: solo se siamo la prima di comando —————
const argv = process.argv.slice(2);
function flag(nome) {
  const i = argv.indexOf(`--${nome}`);
  if (i < 0) return null;
  const next = argv[i + 1];
  return (next && !next.startsWith('--')) ? next : true;
}
function hasFlag(nome) { return argv.includes(`--${nome}`) || flag(nome) != null; }

/** quantità numerica CLI: Number('0') e' falsy e Number(null) = 0 — DUE
 *  BUG presi al vivo 26/10 che qui non cambiano (null = «opzione assente»,
 *  non ZERO). numberOr(flag) la risolve in un punto solo. */
function numeroOr(raw, _def) {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function leggiDirectory({ data = null } = {}) {
  const override = data || process.env.ACE_DATA || null;
  const candidates = override ? [override] : dataDirCandidates();
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

/** stato solo-lettura: l'ULTIMO zip, quanto e' fresco, lo slot destinato. */
export function statoBackup({ staleHours = null, data = null } = {}) {
  const soglia = numeroOr(staleHours, STALE_ORE_DEFAULT) ?? STALE_ORE_DEFAULT;
  const dir = leggiDirectory({ data });
  if (!dir) {
    return { saveDirFound: false, dir: null, zips: [], ultimo: null, ageHours: null, fresh: false, staleHours: soglia, json: null, next: null };
  }
  const zips = [];
  for (const slot of NOMI_SLOT) {
    const d = join(DEST_BASE, slot);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith('.zip')) continue; // solo gli zip: il json non pure
      const p = join(d, f);
      const st = statSync(p);
      // il file save-<quando>.zip porta il momento nel NOME; il mtime come
      // indicatore di recentita' e' piu' resistency (utile se uno rinomina)
      zips.push({ file: f, slot, path: p.replace(RADICE + '\\', '').replace(/\\/g, '/'), at: st.mtime.toISOString(), mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  zips.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const ultimo = zips[0] ?? null;
  const ageHours = ultimo ? (Date.now() - ultimo.mtimeMs) / 36e5 : null;
  const fresh = ultimo ? ageHours < soglia : false;
  let json = null, next = null;
  try {
    json = JSON.parse(readFileSync(join(DEST_BASE, 'salva-save.json'), 'utf8'));
    if (Number.isInteger(json?.next)) next = json.next;
  } catch { /* mai girato: tutto a zero */ }
  return { saveDirFound: true, dir, zips, ultimo, ageHours, fresh, staleHours: soglia, json, next: next ?? 1 };
}

/** fa il backup ORA (forza: sempre; nuovo: solo se stantio). Sync, tar.exe di
 *  Windows: qualche secondo sugli 1-50 MB tipici del save. Gira anche con
 *  EVO aperto (tar legge byte stabili: peggio che non far nulla). */
export function forzaBackup({ force = true, staleHours = null, data = null } = {}) {
  const soglia = numeroOr(staleHours, STALE_ORE_DEFAULT) ?? STALE_ORE_DEFAULT;
  const dir = leggiDirectory({ data });
  if (!dir) return { ok: false, motivo: 'save-dir-mancante' }; // EVO mai avviato: non e' un errore

  const st = statoBackup({ staleHours: soglia, data });
  if (!force && st.fresh) return { ok: false, motivo: 'fresco', stato: st };

  let prox = 1;
  if (Number.isInteger(st.json?.next) && st.json.next >= 1 && st.json.next <= NOMI_SLOT.length) prox = st.json.next;
  const slot = NOMI_SLOT[(prox - 1) % NOMI_SLOT.length];

  const d = new Date();
  const due = (n) => String(n).padStart(2, '0');
  const quando = `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}-${due(d.getMinutes())}-${due(d.getSeconds())}`;
  const file = join(DEST_BASE, slot, `save-${quando}.zip`);
  mkdirSync(join(DEST_BASE, slot), { recursive: true });

  const tar = process.env.WINDIR ? join(process.env.WINDIR, 'System32', 'tar.exe') : 'tar.exe';
  // ORDINE (28/10 al vivo): i tar POSIXLY_STRICT smettano di leggere opzioni al
  // primo operando — gli --exclude DOPO il '.' diventavano PATH da zippare
  // (errore «Couldn't visit directory»). Esclusioni prima del '.'.
  const esito = spawnSync(tar, ['-caf', file, '-C', dir, ...argEsclusioniSave, '.'], { windowsHide: true, timeout: 10 * 60_000 });
  if (esito.error || esito.status !== 0) {
    const chi = esito.error?.message ?? String(esito.stderr ?? '').slice(-400);
    rmSync(file, { force: true }); // il zip mezzo va tolto: e' promessa non tenuta
    return { ok: false, motivo: 'tar-fallita', errore: chi, stato: statoBackup({ staleHours: soglia, data }) };
  }

  // rotazione dei max MAX_ZIP su TUTTI gli slot (il json non conta)
  const tutti = [];
  for (const s of NOMI_SLOT) {
    const ds = join(DEST_BASE, s);
    if (!existsSync(ds)) continue;
    for (const f of readdirSync(ds)) {
      if (!f.endsWith('.zip')) continue;
      const p = join(ds, f);
      tutti.push({ p, m: statSync(p).mtimeMs });
    }
  }
  tutti.sort((a, b) => b.m - a.m);
  for (const vecchio of tutti.slice(MAX_ZIP)) rmSync(vecchio.p, { force: true });

  const prossimo = (prox % NOMI_SLOT.length) + 1;
  const centinaio = tutti.slice(0, MAX_ZIP).length;
  writeFileSync(join(DEST_BASE, 'salva-save.json'), JSON.stringify({
    active: prox, slot,
    zip: file.replace(RADICE + '\\', '').replace(/\\/g, '/'),
    quando,
    size: statSync(file).size,
    zip_vivi: centinaio,
    next: prossimo,
  }, null, 2) + '\n');

  return { ok: true, zip: file.replace(RADICE + '\\', '').replace(/\\/g, '/'), size: statSync(file).size, slot, zip_vivi: centinaio, stato: statoBackup({ staleHours: soglia, data }) };
}

// ————— CLI —————
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const st = statoBackup({ staleHours: numeroOr(flag('stale-hours'), STALE_ORE_DEFAULT) ?? STALE_ORE_DEFAULT, data: flag('data') });
  if (hasFlag('check')) {
    process.exit(st.saveDirFound && st.zips.length && st.fresh ? 0 : 1);
  }
  const esito = forzaBackup({ force: hasFlag('force'), staleHours: numeroOr(flag('stale-hours'), STALE_ORE_DEFAULT) ?? STALE_ORE_DEFAULT, data: flag('data') });
  if (!esito.ok) {
    if (esito.motivo === 'save-dir-mancante') process.exit(0); // mai EVO: silenzioso
    if (esito.motivo === 'fresco') process.exit(0); // fresh: CLIENT boot e' giusto che non faccia niente
    console.error(`[!] backup non riuscito (${esito.motivo}): ${esito.errore ?? ''}`);
    process.exit(0); // il launcher NON si blocca mai per il backup
  }
  console.log(`[x] backup del save: ${esito.zip} (${esito.size} B, slot diverso dal prec.)`);
}
