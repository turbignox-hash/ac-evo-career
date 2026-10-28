// test/grid-templates.test.mjs — regressione di 23/10 sera (Coppa Audi RS 3):
// a ogni NUOVO campionato la griglia sul disco restava quella della serie
// scorsa (14×F40) e nessun file sul disco aveva le auto della serie nuova:
// il rebuild si fermava e in EVO si vedeva la griglia vecchia. Da qui il
// magazzino PER SERIE (data/grid-templates/<nodeId>.customgrid): la prima
// build riuscita viene appuntata e i round seguenti si riscrivono da lì,
// anche dopo che il customgrid sul disco è passato ad altra serie. Regole:
//   • monomarca con pool di UNA auto: il minimo di carId combacianti è il
//     pool intero, non 3 (con la vecchia soglia il template appuntato
//     sarebbe restato ignorato in eterno);
//   • quando niente copre la serie, l'errore è il RITUALE corretto (GENERA +
//     APPLICA in EVO una volta per serie), non un'ansia senza gesto.
// Il test NON tocca né la carriera né il customgrid vero: scrive tutto nel
// tmp (EVO_DATA_DIR redirige il magazzino; GRID_FILE viene passato a parte).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'grid-templates-test-'));
process.env.EVO_DATA_DIR = TMP;               // magazzino e snapshot redirigono qua
process.env.EVO_FACTORY_DIR = join(TMP, 'fabbrica');   // griglie di fabbrica redirigono qua
// anche i FILE DI GIOCO (24/10): il gate del conteggio legge il VERO
// gamemodesave (weekendCarCount → tools/set-track.mjs); senza sabbia, sul PC
// di sviluppo i cinque test che montano nodeName/track «Red Bull Ring» si
// allineavano ALLA GARA REALE in corso (gridSize → 14) e si spezzavano
// (servono 14, il fixture ne ha 6/8/4). Con la redirezione il file non c'è →
// nativo null → nessun align, come su un EVO vergine.
process.env.ACE_GAME_SAVEDIR = join(TMP, 'giochi-salvati');
const ga = await import('../src/grid-apply.mjs');
const ev = await import('../tools/evo-grid.mjs');
const { encodeMsg } = ev;

const B = (s) => Buffer.from(String(s), 'utf8');
// come il GENERA del gioco, ogni cella è UNICA (liverie/visual diverso): la
// regola anti-crash delle celle byte-uniche deve reggere anche nel fixture
const cella = (id, i) => encodeMsg([
  { field: 3, wire: 2, bytes: B(id) },
  { field: 4, wire: 2, bytes: B('Auto di prova') },
  { field: 7, wire: 0, varint: BigInt(i + 1) },
]);
const driver = (skill) => {
  const f = Buffer.alloc(4); f.writeFloatLE(skill, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};
// template monomarca F40: n celle della STESSA auto + 2 driver + config count
const templateF40 = (n, id = 'ks_f40_lm') => {
  const fields = [];
  for (let i = 0; i < n; i++) fields.push({ field: 1, wire: 2, bytes: cella(id, i) });
  fields.push({ field: 2, wire: 2, bytes: driver(0.60) });
  fields.push({ field: 2, wire: 2, bytes: driver(0.40) });
  fields.push({ field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(n) }]) });
  return encodeMsg(fields);
};
const nodo = (nodeId, cars, gridSize) => ({
  nodeId, display: 'Serie di prova', gridSize,
  cars,
  calendar: [{ name: 'Prova', track: 'Red Bull Ring', weather: 0, laps: 3 }],
});
const LADDER = {
  contentNames: { cars: { ks_f40_lm: 'Ferrari F40 LM', ks_audi_rs_3_sportback: 'Audi RS 3 Sportback' } },
  nodes: [
    nodo('serie_f40_test', ['ks_f40_lm'], 4),                  // monomarca F40 (il template che il magazzino riusa)
    nodo('serie_rs_3_test', ['ks_audi_rs_3_sportback'], 4),   // serie NUOVA: auto mai state in griglia
  ],
};
const GRIGLIA = (_buf) => join(TMP, 'griglia-della-ronda.customgrid');
const scrivi = (buf) => { const f = GRIGLIA(); writeFileSync(f, buf); return f; };
const STORE = () => join(TMP, 'grid-templates', 'serie_f40_test.customgrid');
const FABBRICA = (nodeId = 'serie_rs_3_test') => join(TMP, 'fabbrica', nodeId + '.customgrid');

test('la prima build riuscita viene APPUNTATA per la serie (template store)', async () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  const file = scrivi(templateF40(6));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true });
  assert.equal(out.written, true);
  assert.ok(existsSync(STORE()), 'il template della serie resta sul disco');
  const prima = readFileSync(STORE());
  const secondo = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true });
  assert.equal(secondo.written, true);
  // a byte uguali il magazzino NON si riscrive: niente confronto sui nomi dei
  // backup (il 24/10 flakAVA quando il test attraversava il cambio di minuto:
  // bak-apply-...T12-12 vs ...T12-13) — si confronta il CONENUTO del store.
  assert.equal(readFileSync(STORE()).equals(prima), true, 'a byte uguali il magazzino non si riscrive');
});

test('il cambio ronda su altra serie non blocca la ronda: il template appuntato vale', async () => {
  // sul disco file = griglia di ALTRA serie; il solo template che ha le auto
  // della serie è quello APPUNTATO dal test prima (scopo: ordine dei candi-
  // dati e match per carId con pool monomarca da 1 auto)
  mkdirSync(join(TMP, 'grid-templates'), { recursive: true });
  writeFileSync(STORE(), templateF40(8));
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true });
  assert.equal(out.written, true, 'costruita col template appuntato nonostante il file su disco sia di altra serie');
  assert.ok(String(out.source ?? '').includes('serie_f40_test'), 'il source dichiara il template appuntato');
});

test('monomarca in dry: il template appuntato passa e non sovrascrive niente', async () => {
  writeFileSync(STORE(), templateF40(8));
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  const prima = existsSync(STORE());
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true, dry: true });
  assert.equal(out.written, false);
  assert.ok(String(out.source ?? '').includes('serie_f40_test'));
  assert.equal(existsSync(STORE()), prima, 'in dry nulla viene toccato');
});

test('serie mai messa in griglia da nessuna parte: errore col RITUALE (NO_TEMPLATE)', () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  let err = null;
  try { ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, force: true, dry: true }); }
  catch (e) { err = e; }
  assert.ok(err, 'la build per la serie nuova si rifiuta');
  assert.equal(err.code, 'NO_TEMPLATE');
  assert.match(err.message, /UNA volta per serie/, 'dice il QUANDO del rituale');
  assert.match(err.message, /APPLICA/, 'dice il GESTO preciso (GENERA+APPLICA in EVO)');
});

/* ---------- griglie di fabbrica (distribuzione, 24/10) ---------- */
test('macchina vergine, nessun template sul disco: la GRIGLIA DI FABBRICA copre la serie (ultimo ripiego)', () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  mkdirSync(join(TMP, 'fabbrica'), { recursive: true });
  writeFileSync(FABBRICA('serie_rs_3_test'), templateF40(4, 'ks_audi_rs_3_sportback'));
  // installazione giudicabile: la RS 3 c'è → il gate lascia passare
  ga.setInstallSnapshot({ cars: new Set(['ks_audi_rs_3_sportback']), carNames: new Set() });
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));   // sul disco griglia di ALTRA serie
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, force: true, dry: true });
  assert.equal(out.written, false);
  assert.ok(String(out.source).includes('griglia di fabbrica'), 'il source dichiara la fabbrica');
});

test("griglia di fabbrica con auto ASSENTE dall'installazione: rifiuto chiaro (CAR_MISSING)", () => {
  // il magazzino parte VUOTO: con un template della F40 ancora in piedi dai test
  // precedenti la costruzione si sarebbe fermata al template, mai alla fabbrica
  // (flake di ordine, 24/10)
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  ga.setInstallSnapshot({ cars: new Set(), carNames: new Set(['audi rs 3 sportback']) });   // la F40 no
  writeFileSync(FABBRICA('serie_f40_test'), templateF40(4, 'ks_f40_lm'));
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  let err = null;
  try { ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true, dry: true }); }
  catch (e) { err = e; }
  assert.ok(err, 'il gate di fabbrica blocca');
  assert.equal(err.code, 'CAR_MISSING');
  assert.match(err.message, /Ferrari F40 LM/, 'dice QUALI auto mancano (nome leggibile)');
  assert.match(err.message, /APPLICA/, 'il rimedio (rituale) resta dentro il messaggio');
});

test('installazione non giudicabile (catalogo vuoto): nessun blocco, la corsa dei candidati decide', () => {
  ga.setInstallSnapshot({ cars: new Set(), carNames: new Set() });
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  writeFileSync(FABBRICA('serie_rs_3_test'), templateF40(4, 'ks_audi_rs_3_sportback'));
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, force: true, dry: true });
  assert.equal(out.written, false);
  assert.ok(String(out.source).includes('griglia di fabbrica'), 'catalogo vuoto = gate silenzioso');
  ga.setInstallSnapshot(null);
});
