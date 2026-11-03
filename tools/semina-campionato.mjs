// semina-campionato.mjs — LA RICETTA DEL PADDOCK COME COMANDO (2/11).
//
// Il monitor del 2/11 (18:23:02→18:23:06, log di gioco + watcher su disco) ha
// beccato l'«Avvia» di un campionato già attivo: il gioco scrive QUATTRO
// protobuf, in quest'ordine:
//
//   t0     GameModes/gamemode.lastgamemode                       (il meteo: il Luo)
//   t0     GameModes/GameModeType_RACE_WEEKEND.gamemodesave      (lo stato del weekend)
//   t+2s   GameModes/last_grid.customgrid                        (le 16 celle: 15 rivali + te)
//   t+4s   last_season.seasondefinition                          (l'impronta del campionato)
//
// Per due di questi il progetto ha già gli scrittori (customgrid via grid-apply,
// gamemodesave via set-weekend/set-track); il Luo e la seasondefinition non li
// avevano da zero, e la seasondefinition porta team, auto e hash dell'IDENTITÀ
// che solo una lanciata vera garantisce. La ricetta allora è la stessa del
// Paddock: un CAMPIONE catturato da una lanciata vera (data/ricette/campionato/),
// seminato tale quale su un PC vergine, col Luo aggiustato sul meteo previsto.
//
// Comandi:
//   node tools/semina-campionato.mjs --inventa                    → cattura i 4 file vivi nel campione
//   node tools/semina-campionato.mjs --semina                     → semina i 4 file su questo PC (vergine: non ci sono)
//     [--preset pioggia|drizzle|sereno|heavy|custom|<0-7>]        → il meteo del Luo (default: quello del campione)
//     [--dry]                                                     → mostra cosa farebbe, non scrive
//     [--force]                                                   → sovrascrive file esistenti DIVERSI dal campione
//   node tools/semina-campionato.mjs --verifica                   → round-trip dei campioni + confronto col vivo
//
// Cosa NON tocca (lezione del monitor): ui_storage.uistorage e CarCameras —
// il gioco li scrive da solo, forzarli romperebbe le preferenze vere. E niente
// generatori da pd-*.json: quello tocca l'app, non i file del gioco.
//
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMsg, encodeMsg, GAME_SAVEDIR, bakName, pruneBackups, gameRunning } from './evo-grid.mjs';
import { presetFor } from '../src/weather.mjs';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RICETTE_DIR = join(PROJECT, 'data', 'ricette', 'campionato');

/** I quattro protobuf della ricetta: seed nel campione, dove finisce sul PC. */
export const RICETTA = [
  { seed: 'gamemode.lastgamemode',                  dest: 'GameModes/gamemode.lastgamemode',                    chiave: 'luo' },
  { seed: 'GameModeType_RACE_WEEKEND.gamemodesave', dest: 'GameModes/GameModeType_RACE_WEEKEND.gamemodesave',   chiave: 'weekend' },
  { seed: 'last_grid.customgrid',                   dest: 'GameModes/last_grid.customgrid',                     chiave: 'griglia' },
  { seed: 'last_season.seasondefinition',           dest: 'last_season.seasondefinition',                       chiave: 'stagione' },
];

const vivoDi = (r, root) => join(root, r.dest);

/** LA LETTURA DEL PRESET DEL Luo (proto3: il SERENO 0 È CAMPO OMISSO — lezione
 * di src/weather.mjs, audit byte 1/11). Ritorna 0-7, o null se il file non si legge. */
export function leggiPresetLgm(buf) {
  let fields;
  try { fields = decodeMsg(buf); } catch { return null; }
  const p = fields.find((f) => f.field === 2 && f.wire === 0);
  return p != null ? Number(p.varint) : 0;
}

/** Scrive il preset nel Luo: preset 0 → il campo SPARISCE (la forma del gioco,
 * proto3), 1-7 → il campo entra DOPO il campo 1 (l'ordine della lanciata vera:
 * 911 byte col preset 4, la stessa forma del reale bak-wx del 2/11 17:56). */
export function applicaPresetLgm(buf, preset) {
  const idx = presetFor(preset);
  if (idx == null) throw Object.assign(new Error(`preset meteo "${preset}" non riconosciuto (0-7 o nome)`), { code: 'BAD_WEATHER' });
  const fields = decodeMsg(buf).filter((f) => !(f.field === 2 && f.wire === 0));
  if (idx !== 0) {
    const pos = fields.findIndex((f) => f.field > 2);
    const f2 = { field: 2, wire: 0, varint: BigInt(idx) };
    if (pos < 0) fields.push(f2); else fields.splice(pos, 0, f2);
  }
  return encodeMsg(fields);
}

/** --inventa: cattura i QUATTRO file vivi nel campione. La lanciata vera è la
 * fonte (sola lettura sul disco di gioco); si scrive solo dentro il progetto. */
export function catturaRicetta(outDir = RICETTE_DIR, root = GAME_SAVEDIR) {
  const mala = RICETTA.filter((r) => !existsSync(vivoDi(r, root))).map((r) => r.chiave);
  if (mala.length) {
    throw Object.assign(new Error(
      `File mancanti per la cattura: ${mala.join(', ')}. Serve una lanciata vera (Avvia di un weekend dal Paddock) prima di --inventa.`),
      { code: 'NO_LAUNCH' });
  }
  mkdirSync(outDir, { recursive: true });
  return RICETTA.map((r) => {
    copyFileSync(vivoDi(r, root), join(outDir, r.seed));
    return { chiave: r.chiave, file: r.seed, byte: statSync(join(outDir, r.seed)).size };
  });
}

/** Legge il campione dal disco (i quattro seed devono essere tutti in casa). */
export function caricaCampione(outDir = RICETTE_DIR) {
  const perChiave = {};
  for (const r of RICETTA) {
    const p = join(outDir, r.seed);
    if (!existsSync(p)) {
      throw Object.assign(new Error(
        `Campione mancante: ${p}. Catturalo con --inventa da una lanciata vera sul tuo PC (o lo porta il pacchetto).`),
        { code: 'NO_SEED' });
    }
    perChiave[r.chiave] = readFileSync(p);
  }
  return perChiave;
}

/** --semina: scrive i quattro protobuf su questo PC, dal campione.
 * PC vergine: i file non esistono → si scrivono. PC abituato: un file ESISTENTE
 * e DIVERSO dal campione si tocca solo con --force (potrebbe essere la tua vera
 * gara in corso); identico → si salta, come il gioco risemina uguale. */
export function seminaCampionato({ root = GAME_SAVEDIR, preset = null, dry = false, force = false } = {}) {
  if (gameRunning() && !force) {
    throw Object.assign(new Error('EVO è APERTO: chiudi il gioco prima di seminare (o usa --force sapendolo).'), { code: 'GAME_OPEN' });
  }
  const campione = caricaCampione();
  const luoPatchato = preset != null ? applicaPresetLgm(campione.luo, preset) : campione.luo;
  const perChiave = { ...campione, luo: luoPatchato };
  const esito = { scritti: [], saltati: [], rimpiazzati: [] };
  for (const r of RICETTA) {
    const dest = vivoDi(r, root);
    const nuovo = perChiave[r.chiave];
    let corrente = null;
    try { corrente = readFileSync(dest); } catch { /* PC vergine: non c'è */ }
    if (corrente) {
      if (Buffer.compare(Buffer.from(corrente), Buffer.from(nuovo)) === 0) { esito.saltati.push(r.chiave); continue; }
      if (!force) {
        throw Object.assign(new Error(
          `${r.chiave}: sul PC esiste già una versione DIVERSA dal campione (${statSync(dest).size} byte). Sovrascriverla può toccare la tua gara vera: usa --force sapendolo.`),
          { code: 'FILE_DIFFERENTI' });
      }
      esito.rimpiazzati.push(r.chiave);   // il backup esce al momento della scrittura (nome al secondo)
    }
    esito.scritti.push({ chiave: r.chiave, dest, byte: nuovo.length, nuovo });
  }
  if (!dry) {
    for (const s of esito.scritti) {
      mkdirSync(dirname(s.dest), { recursive: true });
      if (esito.rimpiazzati.includes(s.chiave)) copyFileSync(s.dest, bakName(s.dest, 'semina'));
      writeFileSync(s.dest, s.nuovo);
      pruneBackups(s.dest);
    }
  }
  return esito;
}

/* ---------- CLI ---------- */
const isMain = process.argv[1]?.endsWith('semina-campionato.mjs');
if (isMain) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const force = argv.includes('--force');
  if (argv.includes('--inventa')) {
    const presi = catturaRicetta();
    console.log('Campione registrato in data/ricette/campionato/ (fonte: lanciata vera):');
    for (const p of presi) console.log(`  ${p.chiave} · ${p.file} · ${p.byte} byte`);
  } else if (argv.includes('--semina')) {
    const i = argv.indexOf('--preset');
    const preset = i >= 0 ? argv[i + 1] : null;
    const esito = seminaCampionato({ preset, dry, force });
    if (dry) {
      console.log(`DRY RUN — seminerei ${esito.scritti.length} file, salterei ${esito.saltati.length}:`);
      for (const s of esito.scritti) console.log(`  ${s.chiave} → ${s.dest} (${s.byte} byte)`);
      for (const s of esito.saltati) console.log(`  ${s.chiave} → identico, salto`);
    } else {
      console.log(`Seminati ${esito.scritti.length} file (saltati: ${esito.saltati.length}):`);
      for (const s of esito.scritti) console.log(`  ${s.chiave} → ${s.dest} (${s.byte} byte)`);
      if (preset != null) console.log(`  meteo del Luo: preset ${presetFor(preset)} ("${preset}")`);
      for (const c of esito.rimpiazzati) console.log(`  ${c}: c'era una versione diversa, backup col tag semina`);
      console.log('Pronto: lancia EVO — al menu dovresti vedere «Race Weekend» già dentro il campionato.');
    }
  } else if (argv.includes('--verifica')) {
    for (const r of RICETTA) {
      const p = join(RICETTE_DIR, r.seed);
      if (!existsSync(p)) { console.log(`${r.chiave}: CAMPIONE ASSENTE (${p})`); continue; }
      const buf = readFileSync(p);
      const rt = encodeMsg(decodeMsg(buf));
      const ok = Buffer.compare(Buffer.from(buf), Buffer.from(rt)) === 0;
      const vivo = vivoDi(r, GAME_SAVEDIR);
      const uguale = existsSync(vivo) && Buffer.compare(readFileSync(vivo), buf) === 0;
      console.log(`${r.chiave}: ${buf.length} byte · round-trip ${ok ? 'OK' : 'DIVERSO'}${uguale ? " · sul PC c'e' il campione" : " · sul PC c'e' una versione diversa (o non c'e')"}`);
    }
    console.log(`Preset del Luo nel campione: ${leggiPresetLgm(readFileSync(join(RICETTE_DIR, 'gamemode.lastgamemode')))} (0 = sereno, campo omesso)`);
  } else {
    console.log('uso: node tools/semina-campionato.mjs --inventa | --semina [--preset <meteo>] [--dry] [--force] | --verifica');
  }
}
