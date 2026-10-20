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
//
// Lezione (19/10): la prima versione faceva la riscrittura a mano e HA CORROTTO
// il file (tag/lunghezze ricalcolati male) → ripristinato dal .bak e riscritta
// con decode/encodeMsg del progetto, verificata con round-trip PRIMA di scrivere.
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { decodeMsg, encodeMsg, verifyRoundTrip } from '../tools/evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/GameModeType_RACE_WEEKEND.gamemodesave';
const gameIsRunning = () => /AssettoCorsaEVO/i.test(execSync('tasklist', { encoding: 'utf8' }) ?? '');

const asText = (b) => Buffer.from(b).toString('utf8').replace(/\x00/g, '').trim();

function sessionsOf(buf) {
  const blocks = decodeMsg(buf).filter((f) => f.field === 3 && f.wire === 2);
  return blocks.map((b, i) => {
    const inner = decodeMsg(b.bytes);
    const get = (field) => inner.find((g) => g.field === field);
    const nome = get(1)?.wire === 2 ? asText(get(1).bytes) : '?';
    const giri = get(2)?.wire === 0 ? Number(get(2).varint) : null;
    const tipo = get(3)?.wire === 0 ? Number(get(3).varint) : null;
    return { i, nome, giri, tipo };
  });
}

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

const lapsArg = getArg('race') ?? getArg('session');
if (lapsArg == null) { console.log('\nniente da scrivere: usa --race N oppure --session "<nome parziale>" N'); process.exit(0); }
const laps = Number(lapsArg);
if (!Number.isInteger(laps) || laps <= 0) { console.error('giri deve essere un intero > 0'); process.exit(1); }

const selName = getArg('session');
let which = selName != null
  ? ses.findIndex((s) => (s.nome ?? '').toLowerCase().includes(selName.toLowerCase()))
  : ses.findIndex((s) => /race|gara/i.test(s.nome ?? '') || s.tipo === 2);
if (which < 0) { console.error('sessione non trovata'); process.exit(1); }

if (gameIsRunning()) { console.error('\nEVO è APERTO: chiudi il gioco prima di scrivere (il menu riscrive il file).'); process.exit(1); }

// RITORNO-SICURO: patch round-trip su una copia e confronto byte
const fields = decodeMsg(buf);
patchLaps(fields, which, laps);
const out = Buffer.from(encodeMsg(fields));
const probe = decodeMsg(out);
const probeSes = sessionsOf(probe);
if (probeSes[which].giri !== laps) throw new Error('verifica fallita: il valore rileggetto non è ' + laps);
// round-trip di controllo: tutto il resto deve essere identico tranne i giri del blocco
const rt = verifyRoundTrip(out);
if (!rt.ok) { console.error('round-trip NON byte-identico:', JSON.stringify(rt)); process.exit(1); }

const bak = `${FILE}.bak-laps-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
copyFileSync(FILE, bak);
writeFileSync(`${FILE}.tmp`, out);
renameSync(`${FILE}.tmp`, FILE);
console.log(`\nscritto: giri=${laps} sul blocco "${ses[which].nome}" · backup: ${bak.split('/').pop()}`);
for (const s of sessionsOf(readFileSync(FILE))) console.log(label(s));
}
