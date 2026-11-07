// weather.mjs — il meteo della sessione EVO.
//
// Scoperto il 20/10/2026 (reverse-engineering con watcher su disco + log di gioco):
// il meteo applicato a una sessione NON viene dai salvataggi del menu (la scelta
// del preset nel menu non tocca nessun file) ma dal PRESET SELEZIONATO scritto
// in GameModes/gamemode.lastgamemode, top field 2 (varint, 0-based):
//
//   0 sereno · 1 nuvole sparse · 2 nuvoloso · 3 coperto · 4 pioggia leggera
//   5 pioggia · 6 pioggia intensa · 7 custom
//
// Il log di gioco lo conferma a inizio sessione:
//   Game Started! ... | GameModeSelectionWeatherType_HEAVY_RAIN
//   Initial weather type: heavy rain (6)
// Con preset 6 la partenza è in HEAVY_RAIN; con 4 in DRIZZLE (testato reale).
//
// Lo stesso file porta la TIMELINA PREVISIONI: 9 sub-message (field 3) con i
// float del meteo dinamico (f4=temp aria C, f8=pioggia 0-1, f11=copertura 0-1,
// f12=nebbia 0-1, f2=flag step attivo). Scrivibile con la SESTRA patch in-place
// (stessa lunghezza, protobuf invariato): usata col preset 7 (custom).
//
// librerie (usata da webui/race.mjs):
//   import { currentWeatherPreset, setWeatherPreset, PRESETS } from './weather.mjs';
// CLI:
//   node src/weather.mjs                // legge e mostra preset + timeline
//   node src/weather.mjs pioggia        // imposta il preset per nome
//   node src/weather.mjs 4              // o per indice
//   node src/weather.mjs --custom 0.35 0.45 0.1   // preset 7 + float timeline
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMsg, encodeMsg, GAME_MODES_DIR, pruneBackups } from './evo-grid.mjs';
import { meteoLibero } from './test-mode.mjs';
import { tr } from './lang.mjs';

const LGM = join(GAME_MODES_DIR, 'gamemode.lastgamemode');

/**
 * LA GUARDIA DEL METEO (2/11, richiesta Mauro: «quando lancio la gara dal
 * preparatutto, poi posso cambiare es il tempo — dobbiamo evitarlo, per non
 * barare»). Il cambio meteo a mano di una gara è la scorciatoia che salta
 * la pista bagnata: fuori dalla MODALITÀ TEST si rifiuta. Passa il cancello:
 *   • la scrittura del meteo PREVISTO (preparatutto ronda/evento: opts.previsto —
 *     e il chiamante ha già verificato che il preset combaci col calendario);
 *   • qualunque prova asciutta (dry: niente su disco);
 *   • qualunque meteo con test-mode attiva (sessione di collaudo libera).
 */
function guardedMeteo(opts) {                // opts = { dry, previsto, libera }
  // `libera` (7/11): gare che NON sono della carriera — la gara al volo, dove
  // il meteo lo sceglie il giocatore dal pannello (richiesta Mauro: «aggiungi
  // anche il meteo selezionabile e orario»). La guardia resta com'è per le
  // ronde: lì il meteo è quello previsto dal calendario.
  if (opts?.dry || opts?.previsto || opts?.libera || meteoLibero()) return;
  throw Object.assign(new Error(tr({
    it: 'Meteo della gara bloccato fuori dalla modalità test: le gare si corrono col meteo previsto (le bagnate pure). Per provare il meteo libera la gara in test-mode: node ac-evo-career.mjs test-mode --on',
    en: 'Race weather is locked outside test mode: races run with the planned weather (wet ones included). To experiment freely, turn test mode on: node ac-evo-career.mjs test-mode --on',
  })), { code: 'WX_LOCKED' });
}

export const PRESETS = [
  { id: 0, key: 'sereno', label: 'Sereno' },
  { id: 1, key: 'sparse', label: 'Nuvole sparse' },
  { id: 2, key: 'nuvoloso', label: 'Nuvoloso' },
  { id: 3, key: 'coperto', label: 'Coperto' },
  { id: 4, key: 'drizzle', label: 'Pioggia leggera' },
  { id: 5, key: 'rain', label: 'Pioggia' },
  { id: 6, key: 'heavy', label: 'Pioggia intensa' },
  { id: 7, key: 'custom', label: 'Custom' },
];

/** Legge il preset selezionato (0-7) o null se il file non è leggibile.
 * ATTENZIONE: il campo 2 può ESSERE ASSENTE: il gioco lo omette quando il
 * preset è 0 (sereno) — è il comportamento proto3 (0 = default = omesso).
 * Visto realmente il 20/10/2026 dopo un cambio manuale in sereno nel menu.
 */
export function currentWeatherPreset(lgmFile = LGM) {
  let buf = null;
  try { buf = readFileSync(lgmFile); } catch { return null; }
  const fields = decodeMsg(buf);
  const hasF3 = fields.some((f) => f.field === 3 && f.wire === 2);
  if (!hasF3 && fields.length === 0) return null;   // file vuoto/insolito
  const p = fields.find((f) => f.field === 2 && f.wire === 0);
  return p != null ? Number(p.varint) : 0;          // assente = sereno
}

export function presetFor(nameOrIndex) {
  if (nameOrIndex == null) return null;
  const s = String(nameOrIndex).trim().toLowerCase();
  const byName = PRESETS.find((p) => p.key === s || p.label.toLowerCase() === s);
  if (byName) return byName.id;
  const n = Number(nameOrIndex);
  if (Number.isInteger(n) && n >= 0 && n <= 7) return n;
  // accetta anche varianti dei nomi in gioco: heavy|intense, drizzle|light ...
  const alt = [
    ['heavy', 'intense', 'heavyrain', 'pioggiintensa', 'pioggiaintensa'], ['rain', 'pioggia'],
    ['drizzle', 'light', 'lightrain', 'pioggialeggera'],
  ];
  // Etichette EN del menu/preset (verifica 28/10): le bagnate passavano per le
  // bande sopra, quelle SECCHE azzeccavano null → BAD_WEATHER. Stessa semantica
  // di presetForLabel: clear→0, scattered/few clouds→1, overcast/cloudy→2, custom→7.
  if (/clear|sunny/.test(s)) return 0;
  if (/scattered|few[ _]?clouds/.test(s)) return 1;
  if (/overcast|cloudy/.test(s)) return 2;
  if (/^custom$/.test(s)) return 7;
  // banda drizzle PRIMA della banda rain (2/11, dal test): 'light rain' — il
  // nome ESATTO del menu inglese di EVO — contiene 'rain' e con l'ordine 6-5-4
  // cadeva nel preset 5 (pioggia secca) invece del 4: al posto della drizzle si
  // partiva bagnato pesante. heavy resta il primo ('pioggia intensa' contiene 'pioggia').
  for (const [id, names] of [[6, alt[0]], [4, alt[2]], [5, alt[1]]]) if (names.some((x) => s.includes(x))) return id;
  return null;
}

/**
 * Traduce un'etichetta meteo (dalla ladder weatherNames: Clear/Scattered
 * clouds/Overcast/Light rain/Rain/Heavy rain, o le nostre) nel preset EVO.
 * 
 * ATTENZIONE: le due numerazioni NON coincidono — ladder 3="Light rain" ma
 * preset EVO 3="Coperto" e light rain è il 4; ladder 4="Rain" ma pioggia secca
 * è il preset 5. Tradurre per NOME, mai per numero.
 */
export function presetForLabel(label) {
  if (label == null) return null;
  const s = String(label).trim().toLowerCase();
  if (!s) return null;
  if (/clear|sole|sereno|sunny/.test(s)) return 0;
  if (/scattered|few[ _]?clouds/.test(s)) return 1;
  if (/overcast|nuvol/.test(s)) return 2;
  if (/cloudy/.test(s)) return 2;
  if (/heavy/.test(s)) return 6;
  if (/light (rain|drizzle)/.test(s)) return 4;
  if (/drizzle/.test(s)) return 4;
  if (/rain|pioggia/.test(s)) return 5;
  if (/custom/.test(s)) return 7;   // il selettore può chiedere il preset 7 (timeline float)
  return null;
}

/**
 * Scrive il preset selezionato (campo 2) in gamemode.lastgamemode NELLA FORMA
 * DEL GIOCO (proto3: il SERENO 0 È campo OMESSO — audit byte 1/11; prima si
 * metteva 2=0 in cima, forma che EVO non scrive mai). Idempotente: già a
 * posto → nessun backup e nessuna scrittura. Ritorna { from, to, written, backup }.
 */
export function setWeatherPreset(preset, { lgmFile = LGM, dry = false, previsto = false, libera = false } = {}) {
  const idx = presetFor(preset);
  if (idx == null) throw Object.assign(new Error(`preset meteo "${preset}" non riconosciuto (0-7 o nome)`), { code: 'BAD_WEATHER' });
  guardedMeteo({ dry, previsto, libera });
  let buf;
  try { buf = readFileSync(lgmFile); } catch (e) { throw Object.assign(new Error('gamemode.lastgamemode non leggibile: ' + e.message), { code: 'NO_FILE' }); }
  const fields = decodeMsg(buf);
  const p = fields.find((f) => f.field === 2 && f.wire === 0);
  const from = p != null ? Number(p.varint) : 0;
  // FORMA DEL GIOCO (1/11): proto3 — il sereno 0 è campo OMESSO. idx=0 → field 2
  // RIMOSSO se c'è (no-op se assente); idx>0 → in-place o INSERT prima del
  // primo blocco 3 (come quando il gioco passa da sereno a un preset).
  let touched = false;
  if (p) {
    if (idx === 0) { fields.splice(fields.indexOf(p), 1); touched = true; }
    else if (Number(p.varint) !== idx) { p.varint = BigInt(idx); touched = true; }
  } else if (idx !== 0) {
    const out = [];
    let inserted = false;
    for (const f of fields) {
      if (f.field === 3 && !inserted) { out.push({ field: 2, wire: 0, varint: BigInt(idx) }); inserted = true; }
      out.push(f);
    }
    if (!inserted) out.push({ field: 2, wire: 0, varint: BigInt(idx) });
    fields.length = 0; fields.push(...out);
    touched = true;
  }
  // SECONDI nel nome bak (4/11, sonda ciclo-weekend): a MINUTO dopo minuto
  // due scritture nello stesso minuto (es. fine-sessione + cambio ronda di
  // fila) si sfiliavano il bak l'una con l'altra stesso nome e restavava in
  // giro l'undo sbagliato. Stessa famiglia di nome, granularità in più.
  const backup = `${lgmFile}.bak-wx-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  let written = false;
  if (!dry && touched) {
    copyFileSync(lgmFile, backup);
    pruneBackups(lgmFile);   // rotazione bak automatica (tetto 25, comune 31/10)
    writeFileSync(lgmFile, encodeMsg(fields));   // re-encode completo: i campi top restano
    written = true;
  }
  return { from, to: idx, preset: PRESETS[idx], written, backup: written ? backup : null };
}

/**
 * Preset custom: scrive preset=7 E i float della timeline (f8=pioggia, f11=copertura,
 * f12=nebbia, tutti 0-1). Patch in-place a stessa lunghezza: solo i campi float
 * presenti in ogni step vengono sovrascritti. Ritorna { patched, preset: 7, written }.
 */
export function setWeatherCustom({ rain = null, cloud = null, fog = null, lgmFile = LGM, dry = false, previsto = false } = {}) {
  if (rain == null && cloud == null && fog == null) throw Object.assign(new Error('serve almeno un valore (rain/cloud/fog)'), { code: 'NO_VALUES' });
  guardedMeteo({ dry, previsto });
  const clamp = (v) => Math.max(0, Math.min(1, Number(v)));
  let buf;
  try { buf = readFileSync(lgmFile); } catch (e) { throw Object.assign(new Error('gamemode.lastgamemode non leggibile: ' + e.message), { code: 'NO_FILE' }); }
  const fields = decodeMsg(buf);
  const presetField = fields.find((f) => f.field === 2 && f.wire === 0);
  const from = presetField != null ? Number(presetField.varint) : 0;
  let patched = 0;
  for (const subWrap of fields.filter((f) => f.field === 3 && f.wire === 2)) {
    const sub = decodeMsg(subWrap.bytes);
    const w = sub.find((x) => x.field === 3 && x.wire === 2);   // payload meteo dello step
    if (!w) continue;
    const wFields = decodeMsg(w.bytes);
    let touched = false;
    for (const f of wFields) {
      const want = f.field === 8 ? rain : f.field === 11 ? cloud : f.field === 12 ? fog : undefined;
      if (f.wire === 5 && want != null) {
        // sostituisco il byte stream del float nel re-encode: encodeMsg supporta bytes
        const nb = Buffer.alloc(4);
        nb.writeFloatLE(clamp(want), 0);
        f.bytes = nb; f.wire = 5;
        touched = true; patched++;
      }
    }
    if (touched) w.bytes = encodeMsg(wFields);
    subWrap.bytes = encodeMsg(sub);
  }
  if (presetField) { if (Number(presetField.varint) !== 7) presetField.varint = BigInt(7); }   // custom
  else {
    const out = [];
    let inserted = false;
    for (const f of fields) {
      if (f.field === 3 && !inserted) { out.push({ field: 2, wire: 0, varint: 7n }); inserted = true; }
      out.push(f);
    }
    if (!inserted) out.push({ field: 2, wire: 0, varint: 7n });
    fields.length = 0; fields.push(...out);
  }
  // IDEMPOTENZA a byte (1/11): encodeMsg riproduce byte-per-byte il lastgamemode
  // scritto da EVO, quindi dietro la cura «forma del gioco»: se il risultato
  // NON cambia un byte (preset già 7 e float già uguali), non si riscrive.
  // i SECONDI nel bak: v. nota in setWeatherPreset (stesso nome,
  // stessa granularità).
  const backup = `${lgmFile}.bak-wx-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const nuovo = encodeMsg(fields);
  let written = false;
  if (!dry && Buffer.compare(nuovo, buf) !== 0) {
    copyFileSync(lgmFile, backup);
    pruneBackups(lgmFile);   // rotazione bak automatica (tetto 25, comune 31/10)
    writeFileSync(lgmFile, nuovo);
    written = true;
  }
  return { from, to: 7, patched, written, backup: written ? backup : null };
}

/* ---------------- CLI ---------------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--custom') {
    const [rain, cloud, fog] = args.slice(1).map(Number);
    const r = setWeatherCustom({ rain, cloud, fog });
    console.log(`custom scritto: pioggia=${rain} copertura=${cloud} nebbia=${fog} · ${r.patched} float patchati · backup ${r.backup}`);
  } else if (args.length) {
    const r = setWeatherPreset(args[0]);
    console.log(`preset meteo: ${r.from} -> ${r.to} (${r.preset.label}) · backup ${r.backup}`);
  } else {
    const cur = currentWeatherPreset();
    const p = cur != null ? PRESETS[cur] : null;
    console.log(`preset meteo attuale: ${cur != null ? `${cur} · ${p.label}` : 'sconosciuto'}`);
  }
}
