// set-instantrace.mjs — LA GARA CUSTOM "A TEMPO": cambia DURATA E MODALITÀ
// della gara nel gamemodesave delle gare custom di EVO (INSTANT_RACE), a
// gioco chiuso, con backup automatico.
//
// Scoperta del 28/10/2026 («si potrebbe impostare a tempo, 5 minuti in fase
// test»): nel blocco sessione dei gamemodesave:
//   f1 = nome ("Race") · f2 = DURATA · f3 = MODALITÀ della sessione
// con la mappa confermata su TRE file indipendenti:
//   f3=1 → a TEMPO (f2 = secondi: Practice 1800", weekend Practice 900")
//   f3=2 → a GIRI (f2 = giri: custom Race 7, weekend Race 3)
// Quindi la gara custom a 5 minuti = blocco Race con f3=1 e f2=300.
//
// Uso:
//   node tools/set-instantrace.mjs                    legge e mostra lo stato
//   node tools/set-instantrace.mjs --tempo 5 [--dry]  gara a 5 minuti
//   node tools/set-instantrace.mjs --giri 7 [--dry]   torna a giri
//   (+ --force per scrivere col gioco aperto, sapendolo)
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg, encodeMsg, GAME_MODES_DIR, gameRunning, bakName, pruneBackups } from './evo-grid.mjs';

export const INSTANT_FILE = join(GAME_MODES_DIR, 'GameModeType_INSTANT_RACE.gamemodesave');

const MODALITA = { 1: 'a tempo', 2: 'a giri' };

/** Legge il blocco Race dell'INSTANT_RACE: { giri, mode, aiMin, aiMax, partenza }. */
export function currentInstantRace(file = INSTANT_FILE) {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  const f3s = decodeMsg(buf).filter((f) => f.field === 3 && f.wire === 2);
  for (const f3 of f3s) {
    const sess = decodeMsg(f3.bytes);
    const n = sess.find((x) => x.field === 1);
    if (!n || Buffer.from(n.bytes).toString('utf8') !== 'Race') continue;
    const g = (k) => sess.find((x) => x.field === k);
    const f4 = g(4);
    return {
      durata: g(2) ? Number(g(2).varint) : null,
      mode: g(3) ? Number(g(3).varint) : null,
      modeTxt: MODALITA[g(3) ? Number(g(3).varint) : null] ?? '?',
      aiMin: g(30) ? Number(g(30).varint) : null,
      aiMax: g(31) ? Number(g(31).varint) : null,
      partenza: g(32) ? Number(g(32).varint) : null,
      blocchi: f3s.length,
      datetime16B: f4?.bytes ? Buffer.from(f4.bytes).toString('hex') : null,
    };
  }
  return null;
}

/**
 * Imposta la Race dell'INSTANT_RACE:
 *   timedRace({ minutes: 5 })   → f3=1, f2=5*60 (a tempo, 300 secondi)
 *   timedRace({ laps: 7 })      → f3=2, f2=7 (a giri — lo stato di default)
 * Idempotente: se il blocco è già a posto non tocca nulla. Con --force scrive
 * anche a gioco aperto; senza, rifiuta (guardWrite come evo-grid).
 */
export function timedRace({ minutes = null, laps = null, file = INSTANT_FILE, dry = false, force = false } = {}) {
  if (minutes == null && laps == null) throw Object.assign(new Error('serve --tempo N (minuti) o --giri N'), { code: 'NO_VALUES' });
  if (minutes != null && laps != null) throw Object.assign(new Error('o a tempo o a giri, non entrambi'), { code: 'AMBIGUOUS' });
  const mode = minutes != null ? 1 : 2;
  const duraInput = minutes != null ? Number(minutes) : Number(laps);
  if (!Number.isFinite(duraInput) || duraInput <= 0) throw Object.assign(new Error('durata: intero > 0 richiesto'), { code: 'BAD_DURATA' });
  const durata = minutes != null ? Math.max(60, Math.min(24 * 3600, Math.round(duraInput) * 60)) : Math.max(1, Math.min(500, Math.round(duraInput)));
  // la LETTURA non è mai pericolosa (anche a gioco aperto); la guardia sta SOLO
  // davanti alla SCrittura: il dry-run deve potere girare col gioco in esecuzione.
  const buf = readFileSync(file);
  const fields = decodeMsg(buf);
  const f3s = fields.filter((f) => f.field === 3 && f.wire === 2);
  let changed = false;
  for (const f3 of f3s) {
    const sess = decodeMsg(f3.bytes);
    const n = sess.find((x) => x.field === 1);
    if (!n || Buffer.from(n.bytes).toString('utf8') !== 'Race') continue;
    const g2 = sess.find((x) => x.field === 2);
    const g3 = sess.find((x) => x.field === 3);
    if ((g3 == null || Number(g3.varint) !== mode) || (g2 == null || Number(g2.varint) !== durata)) {
      if (g2) g2.varint = BigInt(durata); else sess.push({ field: 2, wire: 0, varint: BigInt(durata) });
      if (g3) g3.varint = BigInt(mode); else sess.push({ field: 3, wire: 0, varint: BigInt(mode) });
      f3.bytes = encodeMsg(sess);
      changed = true;
    }
  }
  if (!changed) return { written: false, mode, durata, nota: 'blocco Race già a posto (idempotente)' };
  if (dry) return { written: false, dry: true, mode, durata };
  if (gameRunning() && !force) throw new Error('EVO è APERTO: chiudi il gioco prima di scrivere (o usa --force sapendolo).');
  // bak al SECONDO (lezione 28/10 condivisa in evo-grid.bakName): due
  // scritture dello stesso file nello stesso minuto non si sovrascrivono più.
  const backup = bakName(file, 'temprace-');
  copyFileSync(file, backup);
  pruneBackups(file);   // la pila dei bak cresceva senza freno: terreno comune 25, come grid-apply (31/10)
  writeFileSync(`${file}.tmp`, encodeMsg(fields));
  renameSync(`${file}.tmp`, file);
  return { written: true, mode, durata, backup };
}

/**
 * Banda AI della gara custom (1/11, «al volo»): campi f30/f31 del blocco Race
 * dell'INSTANT_RACE — gli stessi cursori che il menu mostra quando apri
 * Gara personalizzata. La LETTURA ce l'ha già currentInstantRace; questo è
 * il SCRITTORE mancante (setWeekendAi appartiene al weekend, non all'istantanea).
 *
 * setInstantAi(88, 93) → cursori 88–93 nel blocco Race
 * Stessa rete del timedRace: idempotente (banda già uguale → written:false),
 * dry-run, backup datato, scrittura atomica, guard a gioco aperto (--force).
 */
export function setInstantAi(min, max, { file = INSTANT_FILE, dry = false, force = false } = {}) {
  const lo = Math.round(Number(min)), hi = Math.round(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi > 100) throw Object.assign(new Error('banda AI: due interi fra 0 e 100'), { code: 'BAD_BANDA' });
  const [aiMin, aiMax] = lo <= hi ? [lo, hi] : [hi, lo];   // invertita? si ordina, non si rifiuta
  const buf = readFileSync(file);
  const fields = decodeMsg(buf);
  const f3s = fields.filter((f) => f.field === 3 && f.wire === 2);
  let changed = false, bloccoTrovato = false;
  for (const f3 of f3s) {
    const sess = decodeMsg(f3.bytes);
    const n = sess.find((x) => x.field === 1);
    if (!n || Buffer.from(n.bytes).toString('utf8') !== 'Race') continue;
    bloccoTrovato = true;
    const g30 = sess.find((x) => x.field === 30);
    const g31 = sess.find((x) => x.field === 31);
    if ((g30 == null || Number(g30.varint) !== aiMin) || (g31 == null || Number(g31.varint) !== aiMax)) {
      if (g30) g30.varint = BigInt(aiMin); else sess.push({ field: 30, wire: 0, varint: BigInt(aiMin) });
      if (g31) g31.varint = BigInt(aiMax); else sess.push({ field: 31, wire: 0, varint: BigInt(aiMax) });
      f3.bytes = encodeMsg(sess);
      changed = true;
    }
  }
  if (!bloccoTrovato) throw Object.assign(new Error('blocco Race non trovato nell\'INSTANT_RACE (mai aperta una gara custom?): aprine una volta in EVO e prennl'), { code: 'NO_RACE' });
  if (!changed) return { written: false, aiMin, aiMax, nota: 'banda già a posto (idempotente)' };
  if (dry) return { written: false, dry: true, aiMin, aiMax };
  if (gameRunning() && !force) throw new Error('EVO è APERTO: chiudi il gioco prima di scrivere (o usa --force sapendolo).');
  // verifica di rilettura prima di toccare il file: la banda FUORI dai byte
  // finali deve coincidere, o niente scrittura
  const out = encodeMsg(fields);
  const probe = currentInstantRaceProbe(out, file);
  if (probe.aiMin !== aiMin || probe.aiMax !== aiMax) throw new Error(`verifica fallita: rileggo AI ${probe.aiMin ?? '?'}–${probe.aiMax ?? '?'}`);
  const backup = bakName(file, 'instantai-');
  copyFileSync(file, backup);
  pruneBackups(file);   // stesso tetto: la pila dei bak della banda AI era senza freno
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { written: true, aiMin, aiMax, backup };
}

/** currentInstantRace su un BUFFER (per la pre-verifica senza riscrivere il file). */
function currentInstantRaceProbe(buf) {
  const f3s = decodeMsg(buf).filter((f) => f.field === 3 && f.wire === 2);
  for (const f3 of f3s) {
    const sess = decodeMsg(f3.bytes);
    const n = sess.find((x) => x.field === 1);
    if (!n || Buffer.from(n.bytes).toString('utf8') !== 'Race') continue;
    const g = (k) => sess.find((x) => x.field === k);
    return { aiMin: g(30) ? Number(g(30).varint) : null, aiMax: g(31) ? Number(g(31).varint) : null };
  }
  return {};
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : null; };
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  if (args.includes('--tempo') || args.includes('--giri')) {
    const r = timedRace({ minutes: val('--tempo'), laps: val('--giri'), dry, force });
    const descr = r.mode === 1 ? `${durataTxt(r.durata)} a tempo` : `${r.durata ?? '?'} giri`;
    console.log(`${dry ? '[dry] ' : ''}Race custom → ${descr}${r.written ? ` · backup ${r.backup}` : r.nota ? ` · ${r.nota}` : ' (nessuna scrittura)'}`);
  } else {
    const cur = currentInstantRace();
    if (!cur) { console.log('INSTANT_RACE non leggibile (mai aperta una gara custom?)'); process.exit(1); }
    console.log(`Race custom: ${cur.modeTxt === 'a tempo' ? durataTxt(cur.durata) : String(cur.durata)} giri · modalità ${cur.modeTxt} · AI ${cur.aiMin ?? '?'}–${cur.aiMax ?? '?'}%`);
  }
}

function durataTxt(sec) {
  const m = Math.round(sec / 60);
  return m >= 1 ? `${m} min` : `${sec}s`;
}
