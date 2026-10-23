// set-racetime.mjs — L'OROLOGIO DECLARATO: scrivi ora e moltiplicatore tempo
// nel gamemodesave del weekend, a gioco eventualmente aperto (come set-track).
//
// Dove stanno i campi (mappa ricavata dal dump 21/10/2026, gamemodesave sano):
//   TOP level:  blocco 3 ripetuto = UNA sessione (Practice, Qualifying, Warmup, Race)
//   blocco f4   = il DATETIME della sessione (sub-message):
//                 f4.1 anno · f4.2 mese · f4.3 giorno · f4.4 ora · f4.5 minuti
//   blocco f7   (float, naken)  = la SCALA di avanzamento del tempo (1 = reale)
//   blocco f4.f7 float          = scala alternativa vista nel dump (coerente col f7 top)
//
// Con il moltiplicatore >1 il tempo di gioco scorre più veloce: "dal tramonto
// all'alba" (f4.4=21, scala 48) attraversa cicli completi di luce nella gara
// di 3 giri. Con scala 1 e f4.4=2 la gara è tutta al buio, con i fari.
//
// libreria (usata da webui):
//   import { setRaceTime, currentRaceTime } from './set-racetime.mjs';
// CLI:
//   node tools/set-racetime.mjs                 // legge e mostra
//   node tools/set-racetime.mjs --hour 2        // gara di notte, scala invariata
//   node tools/set-racetime.mjs --hour 21 --scale 48   // tramonto -> alba
//   node tools/set-racetime.mjs --hour 2 --scale 2 --dry
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { decodeMsg, encodeMsg, GAME_MODES_DIR } from './evo-grid.mjs';
import { join } from 'node:path';

export const WEEKEND_FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');

/** Legge ora/minuti/scala dal blocco "Race" (o dal blocco indicato, 0-based) del gamemodesave. */
export function currentRaceTime(file = WEEKEND_FILE, blockName = 'Race') {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  const fields = decodeMsg(buf);
  const f3s = fields.filter((f) => f.field === 3 && f.wire === 2);
  const blk = f3s.map((f3) => decodeMsg(f3.bytes));
  const i = blk.findIndex((s) => {
    const n = s.find((x) => x.field === 1);
    return n && Buffer.from(n.bytes).toString('utf8') === blockName;
  });
  if (i < 0) return null;
  const sess = blk[i];
  const f4 = sess.find((s) => s.field === 4 && s.wire === 2);
  const dt = f4 ? decodeMsg(f4.bytes) : [];
  const hour = dt.find((x) => x.field === 4)?.varint;
  const min = dt.find((x) => x.field === 5)?.varint;
  const scaleF = sess.find((s) => s.field === 7 && s.wire === 5);
  const scale = scaleF?.bytes ? Buffer.from(scaleF.bytes).readFloatLE(0) : 1;
  return { hour: hour != null ? Number(hour) : null, minute: min != null ? Number(min) : null, scale, block: i + 1, blocchi: blkl(blk) };
}
function blkl(blk) {
  return blk.map((s) => {
    const n = s.find((x) => x.field === 1);
    return n ? Buffer.from(n.bytes).toString('utf8') : '?';
  });
}

/**
 * Scrive ora (0-23) e/o moltiplicatore (1-60) in TUTTI i blocchi sessione
 * (anche la prova e la qualifica si disallineano indietro col scale che il
 * gioco ricalcola; qui si scrive la STESSA ora di gara per coerenza col
 * flusso "le sessioni precedenti si calcolano a ritroso" del cruscotto).
 * Ritorna { blocchi, changed, written, backup }.
 */
export function setRaceTime({ hour = null, minute = null, scale = null, file = WEEKEND_FILE, dry = false } = {}) {
  if (hour == null && scale == null && minute == null) throw Object.assign(new Error('serve almeno un valore (hour/minute/scale)'), { code: 'NO_VALUES' });
  const h = hour != null ? Math.max(0, Math.min(23, Math.round(Number(hour)))) : null;
  const m = minute != null ? Math.max(0, Math.min(59, Math.round(Number(minute)))) : null;
  const sc = scale != null ? Math.max(1, Math.min(60, Number(scale))) : null;
  const buf = readFileSync(file);
  const fields = decodeMsg(buf);
  const f3s = fields.filter((f) => f.field === 3 && f.wire === 2);
  let blocchi = 0, changed = 0;
  const scaleBytes = sc != null ? (() => { const b = Buffer.alloc(4); b.writeFloatLE(sc, 0); return b; })() : null;
  for (const f of f3s) {
    const sess = decodeMsg(f.bytes);
    blocchi++;
    let touched = false;
    // f4: data/ora della sessione
    const f4 = sess.find((s) => s.field === 4 && s.wire === 2);
    if (f4) {
      const dt = decodeMsg(f4.bytes);
      for (const d of dt) {
        if (h != null && d.field === 4 && Number(d.varint) !== h) { d.varint = BigInt(h); touched = true; }
        if (m != null && d.field === 5 && Number(d.varint) !== m) { d.varint = BigInt(m); touched = true; }
      }
      if (touched) f4.bytes = encodeMsg(dt);
    }
    // f7: scala di avanzamento del tempo (float)
    if (scaleBytes) {
      const f7 = sess.find((s) => s.field === 7 && s.wire === 5);
      if (f7) {
        const cur = Buffer.from(f7.bytes).readFloatLE(0);
        if (Math.abs(cur - sc) > 1e-6) { f7.bytes = scaleBytes; touched = true; }
      } else {
        sess.push({ field: 7, wire: 5, bytes: scaleBytes });
        touched = true;
      }
    }
    if (touched) { changed++; f.bytes = encodeMsg(sess); }
    else f.bytes = encodeMsg(sess); // re-encode identico: il loop su tutti i blocchi non cambia niente
  }
  if (dry || changed === 0) return { blocchi, changed, written: false, spec: { hour: h, minute: m, scale: sc } };
  const backup = `${file}.bak-racetime-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, encodeMsg(fields));
  renameSync(`${file}.tmp`, file);
  return { blocchi, changed, written: true, backup, spec: { hour: h, minute: m, scale: sc } };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : null; };
  const dry = args.includes('--dry');
  if (args.includes('--hour') || args.includes('--scale') || args.includes('--minute')) {
    const r = setRaceTime({ hour: val('--hour'), minute: val('--minute'), scale: val('--scale'), dry });
    console.log(`${dry ? '[dry] ' : ''}orario gara: hour=${r.spec.hour ?? '—'} min=${r.spec.minute ?? '—'} scala=${r.spec.scale ?? '—'}x → ${r.changed}/${r.blocchi} blocchi toccati${r.written ? ` · backup ${r.backup}` : ' (nessuna scrittura)'}`);
  } else {
    const cur = currentRaceTime();
    if (!cur) { console.log('gamemodesave non leggibile (gioco mai aperto sul weekend?)'); process.exit(1); }
    console.log(`sessioni: ${cur.blocchi.join(', ')} · gara ora ${cur.hour ?? '?'}:${String(cur.minute ?? 0).padStart(2, '0')} · scala tempo ${cur.scale}x`);
  }
}
