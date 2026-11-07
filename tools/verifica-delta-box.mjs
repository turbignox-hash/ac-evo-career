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
//   node tools/verifica-delta-box.mjs --ultima             → SOLO la sessione più
//                                                            recente (7/11: dopo la
//                                                            gara, senza calcolare
//                                                            l'orario a mano)
//   node tools/verifica-delta-box.mjs --dopo 2026-11-06T21:40:00Z
//                                                          → solo le finestre
//                                                            aperte dopo quell'istante
//   node tools/verifica-delta-box.mjs --file <percorso>    → un registro preciso
//   --json                                                 → esito in JSON
//
// `--ultima` (alias `--last`) non indovina: usa la marcatura che il Pitwall
// scrive da solo nel registro a ogni sessione («SESSIONE VIVA» / «SESSIONE
// NUOVA (firma cambiata)») e prende l'ultima. Se la marcatura non c'è, NON
// ripiega sul registro intero (un «pulito» falso è peggio di nessun controllo):
// lo dice ed esce 2. Con `--dopo` insieme vale il più recente dei due.
//
// Esce 0 se nessuna frase delta è uscita dai box, 1 se ne trova (o se il
// registro non c'è), 2 se `--ultima` non trova la sessione: così il controllo
// dopo la gara è una riga sola e l'esito è il codice d'uscita, non un'occhiata.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.EVO_DATA_DIR || join(ROOT, 'data');

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] ?? null : null; };
const json = args.includes('--json');
const ultima = args.includes('--ultima') || args.includes('--last');

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

/** Istante di --dopo: epoch ms (se il numero è grande) o data ISO. */
const istante = (v) => {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return n;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const dopoScalcolato = istante(argOf('--dopo'));

const local = (t) => new Date(t).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
const righe = readFileSync(file, 'utf8').split('\n');

const record = [];
for (const r of righe) {
  if (!r.trim()) continue;
  try { record.push(JSON.parse(r)); } catch { /* riga a metà scrittura: si salta */ }
}

/* LA SESSIONE PIÙ RECENTE (7/11): la firma la scrive il Pitwall da solo
   (giroVoce → «SESSIONE VIVA» al primo tick e «SESSIONE NUOVA» al cambio
   sessione), quindi non serve nessun orario calcolato a mano dopo la gara. */
const ultimaSessione = (() => {
  if (!ultima) return null;
  let t = null;
  for (const o of record) {
    if (!/SESSIONE\s+(VIVA|NUOVA)/i.test(String(o?.evento ?? ''))) continue;
    if (Number.isFinite(o.t)) t = t == null ? o.t : Math.max(t, o.t);
  }
  return t;
})();
if (ultima && ultimaSessione == null) {
  console.error('--ultima: nel registro non c\'è nessuna marcatura di sessione (SESSIONE VIVA / SESSIONE NUOVA) — usa --dopo <istante>');
  process.exit(2);
}

const dopo = [dopoScalcolato, ultimaSessione].filter((v) => v != null).reduce((a, b) => Math.max(a, b), 0) || null;

// La finestra si apre con boxopen e si chiude con boxclose; una sessione nuova
// chiude a forza (una sosta rimasta aperta a fine sessione non deve contare
// le frasi della sessione dopo).
const finestre = [];
let nelBox = false;
let cur = null;
for (const o of record) {
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
    ultimaSessione: ultimaSessione == null ? null : new Date(ultimaSessione).toISOString(),
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
  if (ultimaSessione != null) console.log(`ultima sessione: ${local(ultimaSessione)}`);
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
