#!/usr/bin/env node
// registra-live.mjs — registra i tick live in NDJSON o CSV (4/11/2026).
//
// Uso:
//   node tools/registra-live.mjs                         // NDJSON in data/live-<ora>.ndjson
//   node tools/registra-live.mjs --format csv --durata 300
//   node tools/registra-live.mjs --url http://127.0.0.1:8642/api/live --tick 100
//
// Legge dal server già acceso: NIENTE secondo PowerShell e nessuna seconda
// lettura della shared memory. Ctrl+C chiude pulito e stampa il riepilogo.

import { LiveRecorder } from '../src/live-record.mjs';
import { join } from 'node:path';

function leggiArgomenti(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
    out[k] = v;
  }
  return out;
}

const opt = leggiArgomenti(process.argv.slice(2));
if (opt.aiuto || opt.help) {
  console.log('Uso: node tools/registra-live.mjs [--format ndjson|csv] [--out file] [--url URL] [--intervallo 900] [--tick N] [--durata secondi]');
  process.exit(0);
}
const format = String(opt.format ?? 'ndjson').toLowerCase();
const intervallo = Math.max(100, Number(opt.intervallo ?? 900) || 900);
const maxTick = Math.max(0, Number(opt.tick ?? 0) || 0);
const durataSec = Math.max(0, Number(opt.durata ?? 0) || 0);
const url = String(opt.url ?? 'http://127.0.0.1:8642/api/live');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = String(opt.out ?? opt.file ?? join('data', `live-${stamp}.${format === 'csv' ? 'csv' : 'ndjson'}`));

const source = async () => {
  const r = await fetch(url, { signal: AbortSignal.timeout(Math.max(1500, intervallo + 1000)) });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${url}`);
  return r.json();
};

const rec = new LiveRecorder({ source, file: out, format, maxTicks: maxTick });
let attivo = true;
let ticks = 0;
const ferma = () => { attivo = false; };
process.on('SIGINT', ferma);
process.on('SIGTERM', ferma);
if (durataSec > 0) setTimeout(ferma, durataSec * 1000).unref();

const dormi = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`Registro live → ${out} (${format}, ${intervallo} ms, ${url})`);
while (attivo) {
  try {
    const snap = await rec.tick();
    ticks += 1;
    if (ticks % 10 === 0) console.log(`  ${ticks} tick · ${snap?.game ? 'gioco live' : 'fuori sessione'} · ${out}`);
  } catch (e) {
    console.error(`  tick non scritto: ${e?.message ?? e}`);
    break;
  }
  if (maxTick > 0 && ticks >= maxTick) break;
  await dormi(intervallo);
}
rec.stop();
console.log(`Fatto: ${ticks} tick in ${out}`);
