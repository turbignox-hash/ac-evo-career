#!/usr/bin/env node
// evo-write.mjs — scrittore dei file di sessione di Assetto Corsa EVO.
//
// Modifica i file protobuf del gioco (quelli che EVO ripristina quando apri una gara)
// preservando la struttura e tutto ciò che non viene toccato. Ogni scrittura crea prima
// un backup accanto al file originale.
//
//   node tools/evo-write.mjs targets
//   node tools/evo-write.mjs dump "<file>" [--path .3[4]]
//   node tools/evo-write.mjs verify "<file>"
//   node tools/evo-write.mjs set "<file>" --path .3[4].2 --int 12
//   node tools/evo-write.mjs set "<file>" --path .3[1].5.2 --string Imola
//   node tools/evo-write.mjs set "<file>" --path .3[4].11[0].4 --float 0.93
//   node tools/evo-write.mjs backups "<file>"
//   node tools/evo-write.mjs restore "<file>" [--from "<backup>"]

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decode, encodeTree, nodeAt, render, FILES, dataDirs } from './evo-session.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function targets() {
  for (const { tag, dir } of dataDirs()) {
    console.log(`\n${tag} — ${dir}`);
    for (const rel of FILES) {
      const file = join(dir, rel);
      if (!existsSync(file)) continue;
      const size = readFileSync(file).length;
      console.log(`  ${rel.padEnd(50)} ${String(size).padStart(7)} byte`);
    }
  }
  console.log();
}

function load(file) {
  if (!existsSync(file)) throw new Error(`File non trovato: ${file}`);
  const buf = readFileSync(file);
  const tree = decode(buf);
  if (!tree) throw new Error(`${basename(file)} non è decodificabile: non lo tocco.`);
  return { buf, tree };
}

function verify(file) {
  const { buf, tree } = load(file);
  const back = encodeTree(tree);
  const ok = back.length === buf.length && Buffer.compare(back, buf) === 0;
  console.log(`\n${basename(file)}: ${buf.length} byte -> ${back.length} byte  ${ok ? 'ricostruzione identica' : 'DIVERSA (non userei questo file)'}`);
  if (!ok) {
    const n = Math.min(buf.length, back.length);
    let i = 0;
    while (i < n && buf[i] === back[i]) i++;
    console.log(`  primo byte diverso all'offset ${i}`);
  }
  console.log();
  return ok;
}

function backup(file) {
  const target = `${file}.bak-${stamp()}`;
  writeFileSync(target, readFileSync(file)); // copia fedele del file di gioco
  return target;
}

/** Valore leggibile: i varint sono BigInt e non si possono serializzare con JSON. */
function show(value) {
  if (typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function setField(file, path, value) {
  const { buf, tree } = load(file);
  const node = nodeAt(tree, path);
  const before = node.modified !== undefined ? node.modified : node.asString ?? node.value;
  if (node.wire === 2 && typeof value !== 'string') {
    throw new Error(`Il campo ${path} è una stringa: usa --string`);
  }
  if (node.wire !== 2 && typeof value === 'string') {
    throw new Error(`Il campo ${path} è numerico: usa --int o --float`);
  }
  node.modified = value;
  const out = encodeTree(tree);
  const bak = backup(file);
  writeFileSync(file, out);
  console.log(`\n${basename(file)}`);
  console.log(`  ${path}: ${show(before)} -> ${show(value)}`);
  console.log(`  ${buf.length} -> ${out.length} byte   backup: ${basename(bak)}\n`);
  return out;
}

function listBackups(file) {
  const dir = join(file, '..');
  const base = basename(file);
  const found = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.startsWith(base + '.bak-'))
    .sort();
  if (!found.length) { console.log(`\nNessun backup per ${base}\n`); return []; }
  console.log(`\nBackup di ${base}:`);
  for (const f of found) console.log(`  ${f}`);
  console.log();
  return found;
}

function restore(file, from = null) {
  const found = listBackups(file);
  const chosen = from ?? (found.length ? join(join(file, '..'), found[found.length - 1]) : null);
  if (!chosen || !existsSync(chosen)) throw new Error('Nessun backup da ripristinare.');
  writeFileSync(file, readFileSync(chosen));
  console.log(`Ripristinato ${basename(file)} da ${basename(chosen)}\n`);
}

const command = process.argv[2];
const file = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;

try {
  if (command === 'targets') targets();
  else if (command === 'dump') {
    const { tree } = load(file);
    const path = arg('path');
    const nodes = path ? (nodeAt(tree, path).asMessage ?? [nodeAt(tree, path)]) : tree;
    console.log(render(nodes).join('\n'));
  } else if (command === 'verify') verify(file);
  else if (command === 'set') {
    const path = arg('path');
    if (!path) throw new Error('Serve --path, per esempio --path .3[4].2');
    let value;
    if (arg('int') !== null) value = Number(arg('int'));
    else if (arg('float') !== null) value = Number(arg('float'));
    else if (arg('string') !== null) value = String(arg('string'));
    else throw new Error('Serve un valore: --int N, --float F oppure --string Testo');
    setField(file, String(path), value);
  } else if (command === 'backups') listBackups(file);
  else if (command === 'restore') restore(file, arg('from'));
  else {
    console.log('Uso:');
    console.log('  node tools/evo-write.mjs targets');
    console.log('  node tools/evo-write.mjs dump "<file>" [--path .3[4]]');
    console.log('  node tools/evo-write.mjs verify "<file>"');
    console.log('  node tools/evo-write.mjs set "<file>" --path .3[4].2 --int 12');
    console.log('  node tools/evo-write.mjs backups "<file>"');
    console.log('  node tools/evo-write.mjs restore "<file>"');
  }
} catch (e) {
  console.error(`Errore: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
