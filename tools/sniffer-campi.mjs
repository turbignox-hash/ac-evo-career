// sniffer-campi.mjs — COSA SCRIVE DAVVERO EVO (27/10, companion del Single Make)
//
// Le posizioni dei campi del gamemodesave sono "stabili ma non sante": il flag
// single-make sta DOPO la lista avversari, ma il NUMERO può cambiare a ogni
// versione. Questo sniffing compare ogni volta che EVO tocca i file di gara e
// annota su data/sniffer-campi/ come li ha visti — così se qualcosa si sposta
// si vede SUBITO da qui (o dal report "Sniffer" del Pitwall), senza debugging
// alla cieca.
//
// uso:
//   node tools/sniffer-campi.mjs                → un colpo: fotografa il save attuale
//   node tools/sniffer-campi.mjs --watch        → continua: ogni cambio di mtime fotografa
//
// La fotografia è un JSON line (data/sniffer-campi/campi-<YYYYMMDD>.jsonl):
//   { t, file, size, sessioni:[{nome, i, campi:[{f,w}...], avversari, singleMakeField, singleMakeValue}] }
// Con --diff confronta con la fotografia precedente e stampa SOLO le differenze.
//
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { decodeMsg, GAME_MODES_DIR } from './evo-grid.mjs';

const HERE = join(import.meta.dirname ?? '.');
const OUT_DIR = join(HERE, '..', 'data', 'sniffer-campi');
const FILE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');
const CUSTOMGRID = join(GAME_MODES_DIR, 'last_grid.customgrid');

const asText = (b) => Buffer.from(b).toString('utf8').split('\u0000').join('').trim();
const zona = (b) => Buffer.from(b).toString('hex').slice(0, 16);

/** fotografia dei CAMPI del gamemodesave come stanno ADESSO sul disco */
export function snapshotGamemode(file = FILE, sizeMax = 40) {
  const size = statSync(file).size;
  const raw = readFileSync(file);
  const sessioni = [];
  let k = 0;
  for (const f of decodeMsg(raw)) {
    if (f.field !== 3 || f.wire !== 2) continue;
    const inner = decodeMsg(f.bytes).slice(0, sizeMax);
    const nomeF = inner.find((g) => g.field === 1 && g.wire === 2);
    const nome = nomeF ? asText(nomeF.bytes) : '?';
    const campi = inner.map((g) => ({ f: g.field, w: g.wire, v: g.wire === 0 ? Number(g.varint) : (g.wire === 5 ? 'f32' : `len=${(g.bytes?.length ?? 0)}`) }));
    // dove sta il FLAG singolo: il PRIMO varint 0/1 subito DOPO l'ULTIMO f11
    const lastOpp = decodeMsg(f.bytes).reduce((acc, g, i) => (g.field === 11 && g.wire === 2 ? i : acc), -1);
    const innerAll = decodeMsg(f.bytes);
    let sm = null;
    for (let i = lastOpp < 0 ? 0 : lastOpp + 1; i < innerAll.length; i++) {
      const g = innerAll[i];
      if (g.wire === 0 && (Number(g.varint) === 0 || Number(g.varint) === 1)) { sm = { field: g.field, value: Number(g.varint) }; break; }
      if (i > lastOpp + 1 && g.wire !== 0) break;
    }
    sessioni.push({
      nome, avversariUltimo: lastOpp,
      avversari: innerAll.filter((g) => g.field === 11 && g.wire === 2).length,
      singleMakeField: sm?.field ?? null,
      singleMakeValue: sm?.value ?? null,
      campi,
    });
  }
  return { t: new Date().toISOString(), file, size, sessioni };
}

/** customgrid: SOLO il conteggio e la lista dei preset (la parte che si sposta) */
function snapshotCustomgrid(file = CUSTOMGRID) {
  if (!existsSync(file)) return { presente: false };
  const raw = readFileSync(file);
  const scheda = decodeMsg(raw);
  const celle = scheda.filter((f) => f.field === 1 && f.wire === 2).length;
  return { presente: true, size: raw.length, celle, hash: zona(raw).slice(0, 12) };
}

/** scrive la fotografia su disco + difformità con la precedente */
function saveSnap(snap, previous) {
  mkdirSync(OUT_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const line = JSON.stringify(snap);
  appendFileSync(join(OUT_DIR, `campi-${day}.jsonl`), line + '\n', 'utf8');
  writeFileSync(join(OUT_DIR, 'ultimo.json'), JSON.stringify(snap, null, 2), 'utf8');
  if (previous) {
    const diff = differenzaFoto(previous, snap);
    if (diff.length) {
      appendFileSync(join(OUT_DIR, `campi-${day}.jsonl`), JSON.stringify({ t: snap.t, diff }) + '\n', 'utf8');
      console.log('CAMBIATI rispetto alla foto precedente:');
      for (const d of diff) console.log('  ' + d);
    } else console.log('nessuna differenza di forma rispetto alla precedente');
  }
}

/** cambia QUANTO è cambiata l'ORIGINE: confronti campo per campo per sessione */
function differenzaFoto(a, b) {
  const out = [];
  const mapA = new Map(a.sessioni?.map((s) => [s.nome, s]) ?? []);
  for (const s of b.sessioni ?? []) {
    const p = mapA.get(s.nome);
    if (!p) { out.push(`sessione "${s.nome}" NUOVA`); continue; }
    if (p.singleMakeField !== s.singleMakeField) out.push(`"${s.nome}": flag single-make campo ${p.singleMakeField} → ${s.singleMakeField}`);
    if (p.avversari !== s.avversari) out.push(`"${s.nome}": avversari ${p.avversari} → ${s.avversari}`);
    const campiP = p.campi?.map((c) => `${c.f}:${c.w}`) ?? [];
    const campiS = s.campi?.map((c) => `${c.f}:${c.w}`) ?? [];
    const shapeA = campiP.join('|'), shapeS = campiS.join('|');
    if (shapeA !== shapeS) out.push(`"${s.nome}": LABIRINTO campi cambiato — PRIMA ${shapeA.slice(0, 120)}… ORA ${shapeS.slice(0, 120)}…`);
  }
  return out;
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const watch = process.argv.includes('--watch');
  const diff = process.argv.includes('--diff');
  const snap0 = (() => { try { return JSON.parse(readFileSync(join(OUT_DIR, 'ultimo.json'), 'utf8')); } catch { return null; } })();
  const one = (prev) => {
    try {
      const snap = snapshotGamemode();
      snap.customgrid = snapshotCustomgrid();
      const summary = snap.sessioni.map((s) => `${s.nome}: flag=campo${s.singleMakeField ?? '—'}·val=${s.singleMakeValue ?? '—'} opp=${s.avversari} campi=${s.campi.length}`).join(' · ');
      console.log(`[${snap.t.slice(11, 19)}] ${(snap.customgrid?.presente === false) ? 'customgrid assente' : `customgrid ${snap.customgrid.celle} celle`} → ${summary}`);
      saveSnap(snap, diff ? prev : null);
      return snap;
    } catch (e) { console.error('sniffer: ' + e.message); return prev; }
  };
  let prev = one(snap0);
  if (watch) {
    let last = statSync(FILE).mtimeMs;
    colonne: while (true) {
      execSync('timeout /t 4 /nobreak >nul', { stdio: 'ignore', shell: 'cmd.exe' });
      const now = statSync(FILE).mtimeMs;
      if (now === last) continue colonne;
      last = now;
      prev = one(prev);
    }
  }
}
