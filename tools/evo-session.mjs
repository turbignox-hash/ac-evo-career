#!/usr/bin/env node
// evo-session.mjs — fotografia e confronto dei file di sessione di Assetto Corsa EVO.
//
// Serve a imparare il formato con cui il gioco salva una gara, confrontando lo stato
// "prima" e "dopo" una configurazione fatta a mano nell'interfaccia:
//
//   node tools/evo-session.mjs snapshot --label prima
//   ... configuri la gara in EVO ...
//   node tools/evo-session.mjs snapshot --label dopo
//   node tools/evo-session.mjs diff prima dopo
//   node tools/evo-session.mjs dump <file>        (per vedere l'albero di un file)
//
// I file sono protobuf binari (le stesse strutture che il gioco scrive accanto ai .json):
// qui vengono decodificati in un albero di campi, così le differenze si leggono.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const SAMPLES = join(PROJECT, 'data', 'samples');

const FILES = [
  'last_season.seasondefinition',
  'last_season.seasondefinition.json',
  'GameModes/gamemode.lastgamemode',
  'GameModes/GameModeType_INSTANT_RACE.gamemodesave',
  'GameModes/GameModeType_RACE_WEEKEND.gamemodesave',
  'GameModes/GameModeType_PRACTICE.gamemodesave',
];

function dataDirs() {
  const home = homedir();
  const list = [
    { tag: 'savedgames', dir: join(home, 'Saved Games', 'ACE') },
    { tag: 'documents', dir: join(home, 'Documents', 'ACE') },
  ];
  if (process.env.ACE_DATA) list.unshift({ tag: 'custom', dir: process.env.ACE_DATA });
  return list.filter((x) => existsSync(x.dir));
}

/* ------------------------------------------------------------------ */
/* protobuf: lettura generica                                          */
/* ------------------------------------------------------------------ */

function readVarint(buf, p) {
  let value = 0n;
  let shift = 0n;
  while (p < buf.length) {
    const b = buf[p++];
    value |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: p };
    shift += 7n;
    if (shift > 70n) return null;
  }
  return null;
}

/**
 * Lettura tollerante: si ferma al primo campo che non capisce invece di scartare tutto.
 * Serve perché questi file contengono anche campi non protobuf (blocchi opachi),
 * e a noi interessa comunque tutto ciò che viene prima.
 */
function parseFields(buf, start = 0, end = buf.length) {
  const fields = [];
  let p = start;
  let error = null;
  while (p < end) {
    const at = p;
    const key = readVarint(buf, p);
    if (!key) { error = { offset: at, why: 'varint di chiave troncato' }; break; }
    p = key.next;
    const no = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    if (no === 0) { error = { offset: at, why: 'numero di campo 0' }; break; }
    if (wire === 0) {
      const v = readVarint(buf, p);
      if (!v) { error = { offset: at, why: 'varint troncato' }; break; }
      fields.push({ no, wire, kind: 'varint', value: v.value });
      p = v.next;
    } else if (wire === 1) {
      if (p + 8 > end) { error = { offset: at, why: 'double troncato' }; break; }
      fields.push({ no, wire, kind: 'double', value: buf.readDoubleLE(p) });
      p += 8;
    } else if (wire === 5) {
      if (p + 4 > end) { error = { offset: at, why: 'float troncato' }; break; }
      fields.push({ no, wire, kind: 'float', value: buf.readFloatLE(p) });
      p += 4;
    } else if (wire === 2) {
      const len = readVarint(buf, p);
      if (!len) { error = { offset: at, why: 'lunghezza troncata' }; break; }
      const n = Number(len.value);
      p = len.next;
      if (n < 0 || p + n > end) { error = { offset: at, why: `campo ${no}: lunghezza ${n} oltre la fine` }; break; }
      fields.push({ no, wire, kind: 'bytes', bytes: buf.subarray(p, p + n) });
      p += n;
    } else if (wire === 3 || wire === 4) {
      fields.push({ no, wire, kind: 'group', value: wire });
    } else {
      error = { offset: at, why: `wire type ${wire} non valido` };
      break;
    }
  }
  return { fields, consumed: p, error };
}

const PRINTABLE = /^[\t\n\r\x20-\x7e\u00a0-\uffff]*$/;

function decode(buf, depth = 0) {
  const { fields, consumed, error } = parseFields(buf);
  if (!fields.length) return null;
  const nodes = fields.map((f) => {
    if (f.kind !== 'bytes') return f;
    const raw = f.bytes;
    const text = raw.toString('utf8');
    const looksText = raw.length > 0 && PRINTABLE.test(text) && /[A-Za-z0-9]/.test(text);
    if (looksText) return { ...f, asString: text };
    if (depth < 12) {
      const nested = decode(raw, depth + 1);
      if (nested) return { ...f, asMessage: nested };
    }
    return f;
  });
  if (error && consumed < buf.length) {
    nodes.push({ no: -1, wire: -1, kind: 'tail', value: buf.length - consumed, tailBytes: buf.subarray(consumed), error });
  }
  return nodes;
}

/* ------------------------------------------------------------------ */
/* protobuf: riscrittura (per evo-write.mjs)                           */
/* ------------------------------------------------------------------ */

function writeVarint(value) {
  let v = BigInt(value);
  const bytes = [];
  while (v > 127n) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

/** Vero se il nodo o uno dei suoi figli è stato modificato. */
function isDirty(node) {
  if (node.modified !== undefined) return true;
  if (node.asMessage) return node.asMessage.some(isDirty);
  return false;
}

function encodeField(node) {
  const key = writeVarint((BigInt(node.no) << 3n) | BigInt(node.wire));
  const value = node.modified !== undefined ? node.modified : undefined;
  if (node.wire === 2) {
    let payload;
    if (value !== undefined) payload = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
    else payload = isDirty(node) && node.asMessage ? encodeTree(node.asMessage) : node.bytes;
    return Buffer.concat([key, writeVarint(payload.length), payload]);
  }
  if (node.wire === 5) {
    const b = Buffer.alloc(4);
    b.writeFloatLE(Number(value !== undefined ? value : node.value));
    return Buffer.concat([key, b]);
  }
  if (node.wire === 1) {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(Number(value !== undefined ? value : node.value));
    return Buffer.concat([key, b]);
  }
  if (node.wire === 0) return Buffer.concat([key, writeVarint(value !== undefined ? value : node.value)]);
  return key; // gruppi: solo la chiave, non usati da questi file
}

function encodeTree(nodes) {
  const parts = [];
  for (const node of nodes) {
    if (node.kind === 'tail') { parts.push(node.tailBytes ?? Buffer.alloc(0)); continue; }
    parts.push(encodeField(node));
  }
  return Buffer.concat(parts);
}

/** Ritrova un nodo da un percorso tipo ".3[1].5.2" (numero di campo + indice fra i ripetuti). */
export function nodeAt(nodes, path) {
  const segments = String(path).replace(/^\./, '').split('.').filter(Boolean);
  let current = nodes;
  let node = null;
  for (const segment of segments) {
    const m = segment.match(/^(\d+)(?:\[(\d+)\])?$/);
    if (!m) throw new Error(`Percorso non valido: "${segment}" in "${path}"`);
    const no = Number(m[1]);
    const index = m[2] !== undefined ? Number(m[2]) : 0;
    const matches = (current ?? []).filter((n) => n.no === no);
    node = matches[index];
    if (!node) throw new Error(`Campo ${no}[${index}] non trovato in "${path}"`);
    current = node.asMessage ?? null;
  }
  return node;
}

export { parseFields, decode, encodeTree, isDirty, render, FILES, dataDirs, writeVarint };

/* ------------------------------------------------------------------ */
/* stampa e confronto                                                  */
/* ------------------------------------------------------------------ */

function valueOf(node) {
  if (node.kind === 'tail') return `${node.value} byte non interpretati da offset ${node.error?.offset} (${node.error?.why})`;
  if (node.kind === 'group') return `gruppo wire ${node.value}`;
  if (node.asString !== undefined) return `"${node.asString}"`;
  if (node.asMessage) return `${node.asMessage.length} campi`;
  if (node.kind === 'float') return `f${Number(node.value).toFixed(6)}`;
  if (node.kind === 'double') return `d${Number(node.value).toFixed(6)}`;
  if (node.kind === 'varint') return `i${node.value}`;
  return `<${node.bytes?.length ?? 0} byte>`;
}

function render(nodes, prefix = '', depth = 0, lines = []) {
  if (depth > 8) return lines;
  nodes.forEach((node, index) => {
    const tag = `${prefix}.${node.no}[${index}]`;
    const short = valueOf(node);
    if (node.asMessage) {
      lines.push(`${'  '.repeat(depth)}${tag} {${short}}`);
      render(node.asMessage, tag, depth + 1, lines);
    } else if (node.asString && node.asString.length > 90) {
      lines.push(`${'  '.repeat(depth)}${tag} = "${node.asString.slice(0, 60)}..." (${node.asString.length} caratteri)`);
    } else {
      lines.push(`${'  '.repeat(depth)}${tag} = ${short}`);
    }
  });
  return lines;
}

function sameValue(a, b) {
  if (!!a.asString !== !!b.asString) return false;
  if (a.asString !== undefined) return a.asString === b.asString;
  if (!!a.asMessage !== !!b.asMessage) return false;
  if (a.asMessage) return true; // i figli si confrontano a parte
  if (a.kind !== b.kind) return false;
  if (a.kind === 'float' || a.kind === 'double') return Math.abs(Number(a.value) - Number(b.value)) < 1e-9;
  if (a.kind === 'bytes') return Buffer.compare(a.bytes, b.bytes) === 0;
  return String(a.value) === String(b.value);
}

function groupByField(nodes) {
  const map = new Map();
  for (const n of nodes) {
    if (n.no < 0) continue;
    const arr = map.get(n.no) ?? [];
    arr.push(n);
    map.set(n.no, arr);
  }
  return map;
}

/** La prima stringa del sottoalbero: serve ad allineare gli elenchi ripetuti (piste, auto, container). */
function keyOf(node) {
  if (node.asString) return node.asString.slice(0, 80);
  if (node.asMessage) {
    for (const child of node.asMessage) {
      const key = keyOf(child);
      if (key) return key;
    }
  }
  return null;
}

function preview(nodes, limit = 4) {
  const parts = nodes.slice(0, limit).map((n) => valueOf(n));
  return parts.join(', ') + (nodes.length > limit ? `, ... (${nodes.length} in tutto)` : '');
}

function diffTrees(a, b, path = '', out = []) {
  const ga = groupByField(a);
  const gb = groupByField(b);
  const numbers = [...new Set([...ga.keys(), ...gb.keys()])].sort((x, y) => x - y);
  for (const no of numbers) {
    const A = ga.get(no) ?? [];
    const B = gb.get(no) ?? [];
    const label = `${path}.${no}`;
    if (!A.length) { out.push(`+ ${label} (${B.length}) = ${preview(B)}`); continue; }
    if (!B.length) { out.push(`- ${label} (${A.length}) = ${preview(A)}`); continue; }
    if (A.length !== B.length) out.push(`~ ${label}: numero di valori ${A.length} -> ${B.length}`);
    const used = new Set();
    for (const na of A) {
      const key = keyOf(na);
      let index = -1;
      if (key) index = B.findIndex((x, i) => !used.has(i) && keyOf(x) === key);
      if (index < 0) index = B.findIndex((x, i) => !used.has(i));
      if (index < 0) { out.push(`- ${label} = ${valueOf(na)}`); continue; }
      used.add(index);
      const nb = B[index];
      if (na.asMessage && nb.asMessage) { diffTrees(na.asMessage, nb.asMessage, label, out); continue; }
      if (na.asMessage || nb.asMessage) { out.push(`~ ${label}: ${valueOf(na)} -> ${valueOf(nb)}`); continue; }
      if (!sameValue(na, nb)) out.push(`~ ${label}: ${valueOf(na)} -> ${valueOf(nb)}`);
    }
    for (let i = 0; i < B.length; i++) if (!used.has(i)) out.push(`+ ${label} = ${valueOf(B[i])}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* comandi                                                             */
/* ------------------------------------------------------------------ */

function snapshot(label) {
  const outDir = join(SAMPLES, label);
  mkdirSync(outDir, { recursive: true });
  let count = 0;
  for (const { tag, dir } of dataDirs()) {
    for (const rel of FILES) {
      const src = join(dir, rel);
      if (!existsSync(src)) continue;
      const dst = join(outDir, `${tag}__${rel.replace(/\//g, '_')}`);
      writeFileSync(dst, readFileSync(src));
      count++;
    }
  }
  console.log(`Fotografia "${label}": ${count} file in ${outDir}`);
  for (const f of readdirSync(outDir)) {
    const size = statSync(join(outDir, f)).size;
    console.log(`  ${f.padEnd(52)} ${String(size).padStart(7)} byte`);
  }
  return count;
}

function listLabels() {
  if (!existsSync(SAMPLES)) return [];
  return readdirSync(SAMPLES).filter((d) => statSync(join(SAMPLES, d)).isDirectory());
}

function diff(labelA, labelB) {
  const dirA = join(SAMPLES, labelA);
  const dirB = join(SAMPLES, labelB);
  if (!existsSync(dirA) || !existsSync(dirB)) {
    throw new Error(`Servono due fotografie. Presenti: ${listLabels().join(', ') || 'nessuna'}`);
  }
  const names = [...new Set(readdirSync(dirA).concat(readdirSync(dirB)))].sort();
  for (const name of names) {
    const fa = join(dirA, name);
    const fb = join(dirB, name);
    if (!existsSync(fa) || !existsSync(fb)) {
      console.log(`\n=== ${name} — presente solo in ${existsSync(fa) ? labelA : labelB}`);
      continue;
    }
    const a = readFileSync(fa);
    const b = readFileSync(fb);
    const identical = a.length === b.length && Buffer.compare(a, b) === 0;
    console.log(`\n=== ${name}  (${a.length} -> ${b.length} byte)${identical ? '  identico' : ''}`);
    if (identical) continue;
    if (name.endsWith('.json')) {
      console.log('  (file JSON: usa un diff testuale, qui si dice solo che è cambiato)');
      continue;
    }
    const ta = decode(a);
    const tb = decode(b);
    if (!ta || !tb) { console.log('  non decodificabile come protobuf'); continue; }
    const changes = diffTrees(ta, tb);
    if (!changes.length) console.log('  struttura identica (cambiano solo byte non interpretati)');
    for (const line of changes.slice(0, 120)) console.log('  ' + line);
    if (changes.length > 120) console.log(`  ... e altre ${changes.length - 120} differenze`);
  }
}

function dump(file) {
  const buf = readFileSync(file);
  console.log(`\n${basename(file)} — ${buf.length} byte\n`);
  if (file.endsWith('.json')) { console.log(buf.toString('utf8').slice(0, 4000)); return; }
  const tree = decode(buf);
  if (!tree) { console.log('non decodificabile come protobuf'); return; }
  console.log(render(tree).join('\n'));
}

// Il blocco comandi gira solo se il file è lanciato direttamente (non quando viene importato).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) run();

function run() {
const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'snapshot') {
    const i = rest.indexOf('--label');
    snapshot(i >= 0 && rest[i + 1] ? rest[i + 1] : new Date().toISOString().replace(/[:.]/g, '-'));
  } else if (command === 'diff') {
    diff(rest[0], rest[1]);
  } else if (command === 'labels') {
    console.log(listLabels().join('\n') || '(nessuna fotografia)');
  } else if (command === 'dump') {
    dump(rest[0]);
  } else {
    console.log('Uso:');
    console.log('  node tools/evo-session.mjs snapshot --label prima');
    console.log('  node tools/evo-session.mjs snapshot --label dopo');
    console.log('  node tools/evo-session.mjs diff prima dopo');
    console.log('  node tools/evo-session.mjs dump <file>');
  }
} catch (e) {
  console.error(`Errore: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
}
