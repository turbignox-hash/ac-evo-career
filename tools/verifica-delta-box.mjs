#!/usr/bin/env node
// verifica-delta-box.mjs — dopo una gara CON SOSTA, il registro vocale dice se
// la radio ha parlato di delta mentre si era ai box (richiesta di Mauro 6/11).
//
// Come funziona: il copilota scrive ogni frase in data/copilot-voce-*.jsonl con
// `chi` (chi parla: `delta`, `boxopen`, `boxclose`, ...) e `it` (il testo detto).
// `boxopen` apre la finestra ai box, `boxclose` la chiude: un `chi: "delta"`
// dentro la finestra è ESATTAMENTE il difetto corretto in v0.1.68 («ai box la
// radio non dice più sei più veloce del best», gate in src/shmem.mjs::_deltaInfo
// + guardia in gui/js/narratore-unito.js).
//
// Uso:
//   node tools/verifica-delta-box.mjs                      → tutto il registro
//   node tools/verifica-delta-box.mjs --dopo 2026-11-06T21:40:00Z
//                                                          → solo le finestre
//                                                            aperte dopo quell'istante
//   node tools/verifica-delta-box.mjs --file <percorso>    → un registro preciso
//   --json                                                 → esito in JSON
//
// Esce 0 se nessuna frase delta è uscita dai box, 1 se ne trova (o se il
// registro non c'è): così il controllo dopo la gara è una riga sola e
// l'esito è il codice d'uscita, non un'occhiata.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.EVO_DATA_DIR || join(ROOT, 'data');

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] ?? null : null; };
const json = args.includes('--json');

/** Il registro più recente di data/ (copilot-voce-*.jsonl). */
function registroPiuRecente() {
  try {
    const files = readdirSync(DATA).filter((f) => /^copilot-voce-.*\.jsonl$/.test(f));
    if (!files.length) return null;
    return files.map((f) => join(DATA, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  } catch { return null; }
}

const file = argOf('--file') ?? registroPiuRecente();
if (!file || !existsSync(file)) {
  console.error('registro vocale non trovato (cerca data/copilot-voce-*.jsonl, oppure --file <percorso>)');
  process.exit(1);
}

const dopo = (() => {
  const v = argOf('--dopo');
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
})();

const local = (t) => new Date(t).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
const righe = readFileSync(file, 'utf8').split('\n');

// La finestra si apre con boxopen e si chiude con boxclose; una sessione nuova
// chiude a forza (una sosta rimasta aperta a fine sessione non deve contare
// le frasi della sessione dopo).
const finestre = [];
let nelBox = false;
let cur = null;
for (const r of righe) {
  if (!r.trim()) continue;
  let o;
  try { o = JSON.parse(r); } catch { continue; }
  if (/SESSIONE NUOVA/.test(o.evento ?? '')) {
    if (nelBox && cur) { cur.chiusa = 'sessione nuova'; finestre.push(cur); }
    nelBox = false; cur = null;
  }
  if (o.chi === 'boxopen') {
    if (nelBox && cur) finestre.push(cur);
    nelBox = true;
    cur = { da: o.t, a: null, chiusa: null, deltas: [] };
  } else if (o.chi === 'boxclose') {
    if (nelBox && cur) { cur.a = o.t; cur.chiusa = 'boxclose'; finestre.push(cur); }
    nelBox = false; cur = null;
  } else if (o.chi === 'delta' && nelBox && cur) {
    cur.deltas.push({ t: o.t, it: o.it ?? '' });
  }
}
if (nelBox && cur) finestre.push(cur);

const interessate = dopo == null ? finestre : finestre.filter((f) => f.da >= dopo);
const sporche = interessate.filter((f) => f.deltas.length > 0);
const frasi = sporche.reduce((s, f) => s + f.deltas.length, 0);

if (json) {
  console.log(JSON.stringify({
    file,
    dopo: dopo == null ? null : new Date(dopo).toISOString(),
    finestre: interessate.length,
    finestreConDelta: sporche.length,
    frasiDeltaInBox: frasi,
    dettaglio: sporche.map((f) => ({
      da: new Date(f.da).toISOString(),
      a: f.a == null ? null : new Date(f.a).toISOString(),
      durataSec: f.a == null ? null : Math.round((f.a - f.da) / 1000),
      frasi: f.deltas.map((d) => d.it),
    })),
  }, null, 2));
} else {
  console.log(`registro: ${file}`);
  if (dopo != null) console.log(`finestre aperte dopo: ${local(dopo)}`);
  console.log(`finestre ai box considerate: ${interessate.length}`);
  if (!sporche.length) {
    console.log('  [x] nessuna frase delta uscita dai box');
  } else {
    console.log(`  [!] ${frasi} frase/i delta uscite dai box, in ${sporche.length} soste:`);
    for (const f of sporche) {
      const dur = f.a == null ? 'senza boxclose' : `${Math.round((f.a - f.da) / 1000)}s`;
      console.log(`  - ${local(f.da)} (${dur})`);
      for (const d of f.deltas) console.log(`      ${local(d.t)}  «${d.it}»`);
    }
  }
}

process.exit(frasi > 0 ? 1 : 0);
