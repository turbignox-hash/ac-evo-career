// set-weekend.mjs — ORARI/DURATE/METEO del weekend a gioco APERTO.
//
// Il quarto strumento della famiglia set-track/set-car: stessa sede battuta
// (GameModeType_RACE_WEEKEND.gamemodesave, menu EVO che adotta il file al
// rientro nella schermata — provato con pista e griglia).
// Anatomia verificata oggi sul file reale:
//   blocco sessione (field 3 ripetuto: Practice / Qualifying / Warmup / Race)
//     .1  nome   ("Practice")
//     .2  durata in secondi (600 = 10 min) o GIRI per la Race (3)
//     .4  data/ora d'inizio { 1: anno, 2: mese, 3: giorno, 4: ora, [5: minuto],
//                             7: f32 = 1.0 (flag?) }
//     .17 f32 temp aria  .18 f32 temp 1  .19 f32 temp 2  .20 f32 vento?
//     .21 f32 (43 = forse pressione o indice meteo)
//
// uso:
//   node tools/set-weekend.mjs --show
//   node tools/set-weekend.mjs --session Practice --duration-min 20 --hour 11
//   node tools/set-weekend.mjs --race-laps 5 --race-hour 15
//   node tools/set-weekend.mjs --air-temp 22 --clear            (meteo: sempre sereno = fixed)
//   node tools/set-weekend.mjs --date 2025-05-12               (data del weekend)
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg, encodeMsg, gameRunning, GAME_MODES_DIR } from './evo-grid.mjs';

export const WEEKEND_FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');

/** Legge tutti i parametri programmatici del weekend per la CLI/GUI. */
export function weekendShow(file = WEEKEND_FILE) {
  const fields = decodeMsg(readFileSync(file));
  const out = [];
  for (const b of fields.filter((f) => f.field === 3 && f.wire === 2)) {
    const s = decodeMsg(b.bytes);
    const name = Buffer.from(s.find((x) => x.field === 1).bytes).toString('utf8');
    const g2 = s.find((x) => x.field === 2)?.varint;
    const d = s.find((x) => x.field === 4);
    const dd = d ? decodeMsg(d.bytes) : [];
    const f32of = (x) => Number.isFinite(x) && x != null ? x : null;
    out.push({
      session: name,
      durationSec: g2 != null ? Number(g2) : null,
      date: { y: Number(dd[0]?.varint ?? 0), m: Number(dd[1]?.varint ?? 0), d: Number(dd[2]?.varint ?? 0) },
      start: { h: Number(dd[3]?.varint ?? 0), m: Number(dd[4]?.varint ?? 0) },
      weather: {
        air: dd[16]?.varint != null ? null : f32of(s.find((x) => x.field === 17) ? Buffer.from(s.find((x) => x.field === 17).bytes).readFloatLE(0) : null),
      },
    });
  }
  return out;
}

const _SESSION_NAMES = ['Practice', 'Qualifying', 'Warmup', 'Race'];

/**
 * Applica le modifiche ai blocchi sessione.
 * ops = { sessions: { Practice?: { durationSec, hour, minute }, ... },
 *         raceLaps?, date?: { y, m, d }, airTemp? }
 * I blocchi non toccati restano com'erano. Ritorna { fields, changed }.
 */
export function setWeekend(buf, ops = {}) {
  const fields = decodeMsg(buf);
  let changed = 0;
  for (const b of fields.filter((f) => f.field === 3 && f.wire === 2)) {
    const s = decodeMsg(b.bytes);
    const name = Buffer.from(s.find((x) => x.field === 1).bytes).toString('utf8');
    const isRace = /^race$/i.test(name);
    let touched = false;
    // durata (o giri per la Race)
    if (!isRace && ops.raceLaps != null) throw new Error('raceLaps vale solo per la Race');
    const opts = ops.sessions?.[name] ?? {};
    if (ops.raceLaps != null && isRace) {
      const g2 = s.find((x) => x.field === 2);
      if (g2 && Number(g2.varint) !== ops.raceLaps) { g2.varint = BigInt(ops.raceLaps); touched = true; }
    } else if (opts.durationSec != null) {
      const g2 = s.find((x) => x.field === 2);
      if (g2 && Number(g2.varint) !== opts.durationSec) { g2.varint = BigInt(opts.durationSec); touched = true; }
    }
    // data/ora d'inizio
    const d = s.find((x) => x.field === 4);
    if (d) {
      const dd = decodeMsg(d.bytes);
      const set = (num, val) => {
        const g = dd.find((x) => x.field === num);
        if (g != null && val != null && Number(g.varint) !== val) { g.varint = BigInt(val); touched = true; }
      };
      if (ops.date) { set(1, ops.date.y); set(2, ops.date.m); set(3, ops.date.d); }
      set(4, opts.hour); set(5, opts.minute);
      d.bytes = encodeMsg(dd);
    }
    // meteo: aria (17) e gli altri campi seguono la tregua del tool: se airTemp
    // dato, gli altri (18-21) restano — sono "sensazioni" e indice di nuvolosità, non numericamente numeri che il menu mostra.
    if (ops.airTemp != null) {
      const g17 = s.find((x) => x.field === 17);
      if (g17) { const v = Buffer.from(g17.bytes); v.writeFloatLE(ops.airTemp); g17.bytes = v; touched = true; }
    }
    if (touched) changed++;
    b.bytes = encodeMsg(s);
  }
  return { fields, changed };
}

/** Il gesto alto-nivel per la GUI: prepara l'intero weekend da una scheda regole. */
export function prepareWeekend(rules, { file = WEEKEND_FILE } = {}) {
  // rules = { practiceMin, practiceHour, qualifyMin, qualifyHour, raceLaps, raceHour, hour?, airTemp?, date? }
  const sessions = {};
  if (rules.practiceMin != null) sessions.Practice = { durationSec: rules.practiceMin * 60, hour: rules.practiceHour ?? null };
  if (rules.qualifyMin != null) sessions.Qualifying = { durationSec: rules.qualifyMin * 60, hour: rules.qualifyHour ?? null };
  if (rules.raceHour != null) sessions.Race = { hour: rules.raceHour };
  const res = setWeekend(readFileSync(file), {
    sessions, raceLaps: rules.raceLaps ?? null,
    airTemp: rules.airTemp ?? null,
    date: rules.date ?? null,
  });
  const out = encodeMsg(res.fields);
  const backup = `${file}.bak-weekend-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { changed: res.changed, backup };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes(k);
  const FILE = getArg('--file') ?? WEEKEND_FILE;

  if (has('--show')) {
    for (const row of weekendShow(FILE)) console.log(JSON.stringify(row));
    process.exit(0);
  }
  if (gameRunning() && !has('--force')) { console.error('EVO è APERTO: passa --force (questo file il menu lo adotta al rientro).'); process.exit(2); }
  // costruzione ops dalla CLI
  const ops = { sessions: {} };
  const session = getArg('--session');   // 'Practice' | 'Qualifying' | 'Race'
  const durMin = getArg('--duration-min');
  const hour = getArg('--hour'); const minute = getArg('--minute');
  const sessOpts = {};
  if (durMin != null) sessOpts.durationSec = Number(durMin) * 60;
  if (hour != null) sessOpts.hour = Number(hour);
  if (minute != null) sessOpts.minute = Number(minute);
  if (Object.keys(sessOpts).length) ops.sessions[session ?? 'Practice'] = sessOpts;
  if (getArg('--race-laps') != null) ops.raceLaps = Number(getArg('--race-laps'));
  if (getArg('--air-temp') != null) ops.airTemp = Number(getArg('--air-temp'));
  const date = getArg('--date');
  if (date) { const [y, m, d] = date.split('-').map(Number); ops.date = { y, m, d }; }

  try {
    const r = setWeekend(readFileSync(FILE), ops);
    console.log(`blocchi toccati: ${r.changed}`);
    if (has('--dry')) { console.log('DRY (nessuna scritta: ops non applicate su file)'); process.exit(0); }
    const backup = `${FILE}.bak-weekend-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
    copyFileSync(FILE, backup);
    const out = encodeMsg(r.fields);
    writeFileSync(`${FILE}.tmp`, out);
    renameSync(`${FILE}.tmp`, FILE);
    console.log(`scritto ${FILE} · backup ${backup}`);
    for (const row of weekendShow(FILE)) console.log(JSON.stringify(row));
  } catch (e) { console.error(e.message); process.exit(1); }
}
