// weekend-laps.mjs — I GIRI delle sessioni del Race Weekend non stanno nel
// customgrid (solo celle/piloti/config/meteo): stanno nel salvataggio del
// Game Mode, GameModeType_RACE_WEEKEND.gamemodesave, come protobuf a 4+ blocchi
// (Practice/Qualifying/Warmup/Race) con per blocco:
//   f1 = nome sessione (stringa)   f2 = giri o durata (varint)
//   f3 = tipo sessione (1 pratica/qualifica, 2 race)
//   f30/f31 = AI min/max, f32 = aggressività
//
// uso:
//   node tools/weekend-laps.mjs                        → elenco sessioni + giri
//   node tools/weekend-laps.mjs --race N               → imposta N giri alla GARA (EVO chiuso)
//   node tools/weekend-laps.mjs --session "<nome>" N   → imposta N alla sessione col nome dato
//   node tools/weekend-laps.mjs --singlemake off|on     → griglia CUSTOM (N=13) / AUTOMATIC (mono)
//
// Lezione (19/10): la prima versione faceva la riscrittura a mano e HA CORROTTO
// il file (tag/lunghezze ricalcolati male) → ripristinato dal .bak e riscritta
// con decode/encodeMsg del progetto, verificata con round-trip PRIMA di scrivere.
// Lezione (23/10): la funzione diventa LIBRERIA (weekendLaps/setWeekendLaps)
// per il tasto "Prepara tutto e divertiti" degli eventi speciali in webui —
// stessi identici gesti del CLI, con verifica di round-trip sul buffer OUT.
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { decodeMsg, encodeMsg, GAME_MODES_DIR } from '../tools/evo-grid.mjs';
import { setWeekendGridMode } from './set-track.mjs';

const FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');
const gameIsRunning = () => /AssettoCorsaEVO/i.test(execSync('tasklist', { encoding: 'utf8' }) ?? '');

/** Elenca le sessioni del gamemodesave: [{ i, nome, giri, tipo }] (letture pure). */
export function sessionsOf(buf) {
  const blocks = decodeMsg(buf).filter((f) => f.field === 3 && f.wire === 2);
  return blocks.map((b, i) => {
    const inner = decodeMsg(b.bytes);
    const get = (field) => inner.find((g) => g.field === field);
    const nome = get(1)?.wire === 2 ? asText(get(1).bytes) : '?';
    const giri = get(2)?.wire === 0 ? Number(get(2).varint) : null;
    const tipo = get(3)?.wire === 0 ? Number(get(3).varint) : null;
    const sm = singleMakeOf(inner);
    return { i, nome, giri, tipo, avversari: inner.filter((g) => g.field === 11 && g.wire === 2).length, singleMake: sm?.valore ?? null, singleMakeField: sm?.field ?? null };
  });
}

/* ---------- SINGLE MAKE (26/10, importato dal Gufo Paddock) ----------
 * Il boolean single-make NON ha un nome stabile fra le versioni di EVO, ma ha
 * una POSIZIONE stabile: è il primo varint 0/1 che arriva DOPO la lista degli
 * avversari (f11 × 14 nel vero gambling del 26/10: f12 = 1 sulla Coppa
 * Abarth monomarca). La posizione è più solida del numero: se Kunos un giorno
 * rinumera i campi spostando il flag POCO importa — resta lì, subito dopo.
 * Il numero vero a ogni lettura va nel report: se il gioco lo sposta, il
 * SNIFFER companion (tools/sniffer-campi.mjs) lo mostra e si corregge.
 */
export function singleMakeOf(inner) {
  const lastOpp = inner.reduce((acc, g, i) => (g.field === 11 && g.wire === 2 ? i : acc), -1);
  const da = lastOpp < 0 ? 0 : lastOpp + 1;
  for (let i = da; i < inner.length; i++) {
    const g = inner[i];
    if (g.wire === 0 && (Number(g.varint) === 0 || Number(g.varint) === 1)) return { field: g.field, valore: Number(g.varint), index: i };
    // un campo non-varint dopo gli avversari (datetime f4, scale f5…) rompe la
    // contiguità: il flag sta SOLO subito dopo la lista — oltre, è un altro dato.
    if (i > da && g.wire === 2) break;
  }
  return lastOpp < 0 ? null : null;
}
export const weekendLaps = (file = FILE) => sessionsOf(readFileSync(file));
const asText = (b) => Buffer.from(b).toString('utf8').split('\u0000').join('').trim();

/** Round-trip di controllo su un BUFFER (verifyRoundTrip di evo-grid legge un FILE). */
const roundTripOk = (buf) => {
  const out = encodeMsg(decodeMsg(buf));
  return { ok: Buffer.compare(buf, Buffer.from(out)) === 0, size: buf.length, sizeOut: out.length };
};

/** patch del varint giri sul blocco sel: MODIFICA MINIMA sui byte decodificati. */
function patchLaps(fields, sel, laps) {
  let k = 0;
  for (const f of fields) {
    if (f.field !== 3 || f.wire !== 2) continue;
    if (k++ !== sel) continue;
    const inner = decodeMsg(f.bytes);
    const j = inner.findIndex((g) => g.field === 2 && g.wire === 0);
    if (j < 0) throw new Error(`blocco ${sel} senza campo giri (f2 varint): niente scrittura`);
    inner[j] = { ...inner[j], varint: BigInt(laps) };
    f.bytes = encodeMsg(inner);          // encodeMsg gestisce tag/lunghezze
    return;
  }
  throw new Error(`blocco sessione ${sel} non trovato`);
}

/** qual è il blocco GARA (nome race/gara o tipo 2) — stessa scelta del CLI. */
export function raceBlockIndex(ses) {
  return ses.findIndex((s) => /race|gara/i.test(s.nome ?? '') || s.tipo === 2);
}

/**
 * Scrive il SINGLE MAKE (26/10, stesso gesto di Paddock): il flag è dentro
 * OGNI blocco sessione — il campo subito dopo la lista avversari (f12 nel
 * layout del 26/10).
 *
 * 27/10, ripensamento: NEI TEST il flag ha girato, ma la STRADA GIUSTA per
 * girarlo è già canonica da prima: `setWeekendGridMode('automatic'|'custom')`
 * in tools/set-track.mjs (la forma 6=1+7=N osservata toggle vivo, richiesta
 * Mauro «tutti alla pari, zavorre e penalità non servono»). Il WRITER qui
 * sotto resta solo come spia dei campi veri; l'AZIONE delega a quella
 * funzione, così niente due scrittori che possono discostarsi.
 * opts: { file, dry }. Ritorna { written, perBlocco, nonTrovato, backup }.
 */
export const SINGLE_MAKE_DEFAULT_OPPONENTS = 13;   // custom → N avversari quando si torna NON-mono

export function setSingleMake(on, { file = FILE, dry = false, opponents = SINGLE_MAKE_DEFAULT_OPPONENTS } = {}) {
  // diagnosi: dove sta il flag nel save attuale (e dove non si trova)
  const buf = readFileSync(file);
  const spia = [];
  for (const f of decodeMsg(buf)) {
    if (f.field !== 3 || f.wire !== 2) continue;
    const inner = decodeMsg(f.bytes);
    const nomeF = inner.find((g) => g.field === 1 && g.wire === 2);
    const nome = nomeF ? asText(nomeF.bytes) : '?';
    const sm = singleMakeOf(inner);
    spia.push({ nome, campo: sm?.field ?? null, valore: sm?.valore ?? null });
  }
  // azione: il writer CANONICO (set-track) gira il selettore del menu:
  // mono → AUTOMATIC (conteggio fissato da EVO), non-mono → CUSTOM con N.
  // Le celle vere restano quelle del customgrid (set-track non lo tocca).
  const r = setWeekendGridMode(on ? 'automatic' : 'custom', on ? null : opponents, { file, dry });
  return { written: !!r.written, mode: r.mode, count: r.count, spia, backup: r.backup ?? null };
}

/**
 * Scrive `laps` giri sul blocco GARA del gamemodesave, con la SESSITA rete del
 * CLI patchata in libreria (richiesta Mauro 23/10 per gli eventi speciali):
 *   • patch minima del varint f2 del blocco race via decodeMsg/encodeMsg
 *   • verifica di round-trip byte-identica sul buffer OUT + rilettura del valore
 *   • backup datato + scrittura atomica (tmp → rename)
 * Idempotente: se il blocco dice già quei giri, non tocca niente (written:false).
 * opts: { file }. Ritorna { already, written, block, giri, backup }.
 */
export function setWeekendLaps(laps, { file = FILE } = {}) {
  if (!Number.isInteger(laps) || laps <= 0) throw Object.assign(new Error(`giri deve essere un intero > 0, ricevo ${laps}`), { code: 'BAD_LAPS' });
  const buf = readFileSync(file);
  const ses = sessionsOf(buf);
  const which = raceBlockIndex(ses);
  if (which < 0) throw Object.assign(new Error('blocco gara non trovato nel gamemodesave'), { code: 'NO_RACE' });
  if (ses[which].giri === laps) return { already: true, written: false, block: ses[which].nome, giri: laps, backup: null };
  const fields = decodeMsg(buf);
  patchLaps(fields, which, laps);
  const out = Buffer.from(encodeMsg(fields));
  const probeSes = sessionsOf(out);
  if (probeSes[which].giri !== laps) throw new Error(`verifica fallita: il valore rileggetto non è ${laps}`);
  const rt = roundTripOk(out);
  if (!rt.ok) throw new Error(`round-trip NON byte-identico: ${JSON.stringify(rt)}`);
  const backup = `${file}.bak-laps-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(file, backup);
  writeFileSync(`${file}.tmp`, out);
  renameSync(`${file}.tmp`, file);
  return { already: false, written: true, block: ses[which].nome, giri: laps, backup };
}

/* ---------- CLI (solo se eseguito direttamente, non importato) ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (isMain) {
const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };

const buf = readFileSync(FILE);
const ses = sessionsOf(buf);
const label = (s) => `  blocco ${s.i}: "${s.nome || '(senza nome)'}"  giri=${s.giri ?? '(f2 assente)'}  tipo=${s.tipo ?? '?'}`;
console.log(`${FILE} — ${ses.length} sessioni:`);
for (const s of ses) console.log(label(s));

// il single-make va PRIMA dei giri (il write dei giri termina qui sotto)
const smArg = (getArg('singlemake') ?? '').toLowerCase();
if (smArg === 'on' || smArg === 'off') {
  if (gameIsRunning()) { console.error('\nEVO è APERTO: chiudi il gioco prima di scrivere (il menu riscrive il file).'); process.exit(1); }
  const sm = setSingleMake(smArg === 'on', { file: FILE });
  console.log(`\nsingle-make ${smArg}: mode=${sm.mode} count=${sm.count ?? '-'} ${sm.written ? `· scritto (backup ${sm.backup})` : '· già in piedi'}`);
  for (const s of sm.spia) console.log(`  flag dopo la lista avversari di "${s.nome}": campo=${s.campo ?? '—'} valore=${s.valore ?? '—'}`);
}

const lapsArg = getArg('race') ?? getArg('session');
if (lapsArg == null) { console.log('\nniente da scrivere: usa --race N oppure --session "<nome parziale>" N'); process.exit(0); }
const laps = Number(lapsArg);
if (!Number.isInteger(laps) || laps <= 0) { console.error('giri deve essere un intero > 0'); process.exit(1); }

const selName = getArg('session');
const which = selName != null
  ? ses.findIndex((s) => (s.nome ?? '').toLowerCase().includes(selName.toLowerCase()))
  : raceBlockIndex(ses);
if (which < 0) { console.error('sessione non trovata'); process.exit(1); }

if (gameIsRunning()) { console.error('\nEVO è APERTO: chiudi il gioco prima di scrivere (il menu riscrive il file).'); process.exit(1); }

const res = setWeekendLaps(laps, { file: FILE });  // tutta la rete (round-trip + backup) ora è nella libreria
if (res.already) console.log(`\nil blocco "${res.block}" dice già ${laps} giri: niente scrittura.`);
else console.log(`\nscritto: giri=${res.giri} sul blocco "${res.block}"${res.backup ? ` · backup: ${res.backup.split('/').pop()}` : ''}`);
for (const s of sessionsOf(readFileSync(FILE))) console.log(label(s));
}