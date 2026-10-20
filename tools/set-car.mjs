// set-car.mjs — CAMBIO AUTO in una cella del customgrid a gioco APERTO.
//
// Suo fratello maggiore: set-track.mjs (pista del weekend, convalidato 3/3).
// Qui la sostituzione è di UNA CELLA del pool: prende il template completo
// dell'auto (carId, nome, brand, anno, preset meccanici/visuali, colori) da un
// file sorgente (es. un backup del customgrid con griglia mista) e lo trapianta
// nella cella N del customgrid corrente. Il menu di EVO — provato con la pista —
// adotta i file toccati a manina; il test qui è capire se lo fa anche per le auto.
//
// uso:
//   node tools/set-car.mjs --list                              (celle correnti + template disponibili nel sorgente)
//   node tools/set-car.mjs --cell 0 --car "Ferrari Daytona SP3" [--dry]
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { decodeMsg, encodeMsg, gameRunning } from './evo-grid.mjs';

export const GRID_FILE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid';
export const TEMPLATE_SOURCE = 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid.bak-griglia-2026-10-19T23-10';

/** Le celle del customgrid: [{ id, name, idx, field }] per lettura e scrittura in loco. */
export function gridCells(buf) {
  const fields = decodeMsg(buf);
  const cells = fields.filter((f) => f.field === 1 && f.wire === 2);
  return { fields, cells };
}

/** Identity di una cella: carId + nome presentabile. */
export function cellIdentity(cellBytes) {
  let id = null, name = null;
  for (const g of decodeMsg(cellBytes)) {
    if (g.field === 3) id = Buffer.from(g.bytes).toString('utf8');
    else if (g.field === 4) name = Buffer.from(g.bytes).toString('utf8');
  }
  return { id, name };
}

/**
 * Il template dell'auto richiesta dal file sorgente: { bytes, count } con il
 * bytes della PRIMA cella combanciante (match per nome presentabile o carId).
 */
export function findTemplateIn(sourceBuf, carNameOrId) {
  const { cells } = gridCells(sourceBuf);
  const want = String(carNameOrId).toLowerCase();
  for (const c of cells) {
    const { id, name } = cellIdentity(c.bytes);
    if ((name && name.toLowerCase().includes(want)) || (id && id.toLowerCase().includes(want))) {
      return { bytes: c.bytes, id, name, count: cells.filter((x) => cellIdentity(x.bytes).id === id).length };
    }
  }
  return null;
}

/**
 * Sostituisce la cella `idx` del customgrid con il template dato.
 * Ritorna { changed: 1, cell: identity nuova } — la scrittura del buffer è a
 * carico del chiamante (cla la CLI con backup, alla GUI va bene uguale).
 */
export function swapCell(buf, idx, templateBytes) {
  const { fields, cells } = gridCells(buf);
  if (!cells[idx]) throw Object.assign(new Error(`cella ${idx} inesistente (le celle sono ${cells.length})`), { code: 'BAD_CELL' });
  cells[idx].bytes = templateBytes;
  const i = fields.indexOf(cells[idx]);
  fields[i] = cells[idx];
  return { fields, cell: cellIdentity(templateBytes) };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes(k);
  const FILE = getArg('--file') ?? GRID_FILE;
  const SRC = getArg('--source') ?? TEMPLATE_SOURCE;

  if (has('--list')) {
    const { cells } = gridCells(readFileSync(FILE));
    const src = readFileSync(SRC);
    const tpl = new Map();
    for (const c of gridCells(src).cells) {
      const { id, name } = cellIdentity(c.bytes);
      if (!tpl.has(id)) tpl.set(id, { name, n: 0 });
      tpl.get(id).n++;
    }
    console.log(`celle del customgrid corrente (${cells.length}):`);
    cells.forEach((c, i) => { const { id, name } = cellIdentity(c.bytes); console.log(`  [${i}] ${id} · ${name}`); });
    console.log(`template nel sorgente (${SRC.split('/').pop()}):`);
    for (const [id, v] of tpl) console.log(`  ${id} · ${v.name} (×${v.n})`);
    process.exit(0);
  }

  const idx = Number(getArg('--cell'));
  const car = getArg('--car');
  if (!Number.isInteger(idx) || !car) { console.error('serve --cell <n> --car "<nome o ks_id>"'); process.exit(1); }

  const tpl = findTemplateIn(readFileSync(SRC), car);
  if (!tpl) { console.error(`template "${car}" non nel sorgente: usa --list per vederli`); process.exit(1); }
  console.log(`template: ${tpl.id} · ${tpl.name} (nel sorgente ×${tpl.count})`);

  const pre = gridCells(readFileSync(FILE));
  console.error(`DBG pre: top=${pre.fields.length} celle=${pre.cells.length} [${idx}]=${JSON.stringify(cellIdentity(pre.cells[idx].bytes))} bytes.len=${pre.cells[idx].bytes.length}`);
  const before = cellIdentity(pre.cells[idx].bytes);
  pre.cells[idx].bytes = tpl.bytes;
  const out = encodeMsg(pre.fields);
  console.log(`cella [${idx}]: ${before.name} → ${tpl.name}`);

  if (has('--dry')) { console.log('DRY: niente scritta.'); process.exit(0); }
  if (gameRunning() && !has('--force')) { console.error('EVO è APERTO: passa --force sapendolo (per il test a gioco aperto si scrive igual).'); process.exit(2); }
  const backup = `${FILE}.bak-car-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copyFileSync(FILE, backup);
  writeFileSync(`${FILE}.tmp`, out);
  renameSync(`${FILE}.tmp`, FILE);
  console.log(`scritto ${FILE} (${out.length}B) · backup ${backup}`);

  // rilettura di controllo
  const after = cellIdentity(gridCells(readFileSync(FILE)).cells[idx]);
  console.log(`rilettura cella [${idx}]: ${after.id} · ${after.name}`);
}
