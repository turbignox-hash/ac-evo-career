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
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'grid-templates-test-'));
process.env.EVO_DATA_DIR = TMP;               // magazzino e snapshot redirigono qua
process.env.EVO_FACTORY_DIR = join(TMP, 'fabbrica');   // griglie di fabbrica redirigono qua
// anche i FILE DI GIOCO (24/10): il gate del conteggio legge il VERO
// gamemodesave (weekendCarCount → src/set-track.mjs); senza sabbia, sul PC
// di sviluppo i cinque test che montano nodeName/track «Red Bull Ring» si
// allineavano ALLA GARA REALE in corso (gridSize → 14) e si spezzavano
// (servono 14, il fixture ne ha 6/8/4). Con la redirezione il file non c'è →
// nativo null → nessun align, come su un EVO vergine.
process.env.ACE_GAME_SAVEDIR = join(TMP, 'giochi-salvati');
const ga = await import('../src/grid-apply.mjs');
const ev = await import('../src/evo-grid.mjs');
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
// ADOCCHIATO IL FLAKY (31/10): i tre test della FABBRICA puliscono grid-templates/
// ma non i .bak-apply-* di griglia-della-ronda.customgrid lasciati dai test
// di prima. Finché ogni ronda sta DENTRO lo stesso minuto i bak si sovrascrivono
// a vicenda (bak-apply-<AAAA-MM-GG-hh-mm>: stesso nome, niente pila) e la
// corsa dei candidati parte pulita. Al cambio di minuto il bak d'epoca F40
// sopravvive: la build riesce COL BAK invece della fabbrica → niente
// NO_TEMPLATE/CAR_MISSING. Stessa lezione del commento del test 1, lato bak.
const pulisciBak = () => {
  for (const n of readdirSync(TMP)) {
    if (n.startsWith('griglia-della-ronda.customgrid') && n.includes('.bak-')) {
      try { rmSync(join(TMP, n)); } catch { /* occupato: non blocca */ }
    }
  }
};
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

/* ---------- CELLE SINTETICHE (1/11, gara al volo) ---------- */
test('celle NUOVE con opt-in: la RS 3 mai in griglia entra nel pool F40 (sintesi dal donatore + round-robin per modello)', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  const ev = await import('../src/evo-grid.mjs');
  // nodo MIXTO (caso reale del pool della gara al volo): F40 (sul disco,
  // 4 varianti byte-uniche) + RS 3 (mai state in NESSUNA griglia)
  LADDER.nodes.push({
    nodeId: 'serie_mista_test', display: 'Serie mista di prova', gridSize: 4,
    cars: ['ks_f40_lm', 'ks_audi_rs_3_sportback'],
    calendar: [{ name: 'Prova', track: 'Red Bull Ring', weather: 0, laps: 3 }],
  });
  const file = scrivi(templateF40(4));              // sul disco SOLO F40: la RS 3 non c'è da NESSUNA parte
  // senza opt-in, pool PARZIALE nel template: comportamento storico — le
  // presenti restano fotocopiate, la mancante NON entra (solo il log dei mancanti)
  const senzaOpt = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_mista_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true });
  assert.equal(Buffer.from(senzaOpt.buffer).toString('latin1').includes('ks_audi_rs_3_sportback'), false, 'senza opt-in la RS 3 non entra');
  assert.equal(senzaOpt.report.sintesi, null, 'senza opt-in il report non dichiara sintesi');
  // senza opt-in e pool totalmente assente dal template: rifiuto storico
  assert.throws(() => bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true }),
    /non contiene le auto/, 'senza opt-in e senza presenze il rifiuto resta');
  // con opt-in: la RS 3 entra trapiantata su una cella donatrice, e
  // round-robin per modello la fa entrare DENTRO la griglia (non tagliata)
  const out = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_mista_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true, celleNuove: true });
  const stiff = ev.decodeMsg(out.buffer);
  const celleOut = stiff.filter((f) => f.field === 1);
  const celleTxt = celleOut.map((f) => Buffer.from(f.bytes).toString('latin1'));
  assert.equal(celleOut.length, 4, '4 celle come gridSize');
  assert.equal(celleTxt.filter((t) => t.includes('ks_f40_lm')).length, 3, '3 celle F40');
  assert.ok(celleTxt.some((t) => t.includes('ks_audi_rs_3_sportback')), 'la RS 3 entra in griglia (round-robin per modello)');
  assert.ok(celleTxt.some((t) => t.includes('preset_')), 'la cella sintetica dichiara un preset (vero se il parco lo conosce, altrimenti il token)');
  assert.equal(new Set(celleOut.map((f) => Buffer.from(f.bytes).toString('hex'))).size, 4, 'tutte byte-uniche (lezione anti-crash)');
  assert.deepEqual(out.report.sintesi, ['ks_audi_rs_3_sportback'], 'il report dichiara le sintetizzate');
});

test('preset VERO al posto del token: la 695 manca dal template ma il parco la conosce (lezione 31/10, come il gioco)', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  // un template cugino NELLA STESSA dir porta una cella REALE della 695:
  // preset mech_1 (Standard), nome completo del catalogo, PI in f42.
  const fpi = Buffer.alloc(4); fpi.writeFloatLE(10.178277, 0);
  const cellaVera = encodeMsg([
    { field: 3, wire: 2, bytes: B('ks_abarth_695_biposto') },
    { field: 4, wire: 2, bytes: B('Abarth 695 Biposto') },
    { field: 10, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 2, bytes: B('preset_695b_mech_1') },
      { field: 2, wire: 2, bytes: B('Abarth 695 Biposto - Standard') },
      { field: 3, wire: 0, varint: 1n },
      { field: 4, wire: 2, bytes: B('Standard') },
    ]) },
    { field: 42, wire: 5, bytes: fpi },
  ]);
  const fields = [{ field: 1, wire: 2, bytes: cellaVera }, { field: 2, wire: 2, bytes: driver(0.60) }, { field: 2, wire: 2, bytes: driver(0.40) }, { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 3n }]) }];
  writeFileSync(join(TMP, 'cugina-695.customgrid'), encodeMsg(fields));   // sì: .customgrid nella dir del template = parco minato
  LADDER.nodes.push({
    nodeId: 'serie_mista_695_test', display: 'Mista con 695 mai in griglia', gridSize: 4,
    cars: ['ks_f40_lm', 'ks_abarth_695_biposto'],
    calendar: [{ name: 'Prova', track: 'Red Bull Ring', weather: 0, laps: 3 }],
  });
  const file = scrivi(templateF40(3));              // sul disco SOLO F40: la 695 senza celle, ma con IDENZA nel parco
  const out = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_mista_695_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true, celleNuove: true });
  const stiff = ev.decodeMsg(out.buffer);
  const sino = stiff.filter((f) => f.field === 1).find((f) => Buffer.from(f.bytes).toString('latin1').includes('ks_abarth_695_biposto'));
  assert.ok(sino, 'la 695 entra in griglia (sintesi)');
  const txt = Buffer.from(sino.bytes).toString('latin1');
  assert.ok(txt.includes('preset_695b_mech_1'), 'preset mech_1 VERO del catalogo, non il token inventato');
  assert.ok(txt.includes('Abarth 695 Biposto - Standard'), 'display completo del catalogo');
  const inner = ev.decodeMsg(sino.bytes);
  const f42 = inner.find((g) => g.field === 42 && g.wire === 5);
  assert.ok(f42 && Math.abs(Buffer.from(f42.bytes).readFloatLE(0) - 10.178277) < 1e-4, 'PI del catalogo al posto di quello del donatore');
  assert.match(String(out.report.sintesi[0]), /preset_695b_mech_1/, 'il report dichiara il preset vero');
});

/* ---------- RADICE DELLE CHIMERA (2/11, template riscritto a mano alle 19:15) ---------- */
test('cella INTERA del parco: la 695 entra TAL QUALE (f10+f11+f14 tutta scrittura del gioco, niente trapianto)', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  const fpi = Buffer.alloc(4); fpi.writeFloatLE(10.178277, 0);
  // la cella gioco-autore del parco: la STESSA coppia mech_1+visual_1 che il
  // GENERA scrive, CON il blocco f14 dei colori. È ciò che il 19:15 aveva
  // assemblato a mano (f11 gialla + f14 nere): qui invece tutto il blocco
  // arriva da UN file scritto da EVO.
  const cellaIntera = encodeMsg([
    { field: 3, wire: 2, bytes: B('ks_abarth_695_biposto') },
    { field: 4, wire: 2, bytes: B('Abarth 695 Biposto') },
    { field: 10, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 2, bytes: B('preset_695b_mech_1') },
      { field: 2, wire: 2, bytes: B('Abarth 695 Biposto - Standard') },
      { field: 3, wire: 0, varint: 1n },
      { field: 4, wire: 2, bytes: B('Standard') },
    ]) },
    { field: 11, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('preset_695b_visual_1') }]) },
    { field: 14, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('blocco colori del gioco') }]) },
    { field: 42, wire: 5, bytes: fpi },
  ]);
  writeFileSync(join(TMP, 'cugina-695-intera.customgrid'), encodeMsg([
    { field: 1, wire: 2, bytes: cellaIntera },
    { field: 2, wire: 2, bytes: driver(0.60) },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 1n }]) },
  ]));   // sì: .customgrid nella dir del template = parco minato
  LADDER.nodes.push({
    nodeId: 'serie_mista_695_intera_test', display: 'Mista con 695 cella intera', gridSize: 4,
    cars: ['ks_f40_lm', 'ks_abarth_695_biposto'],
    calendar: [{ name: 'Prova', track: 'Red Bull Ring', weather: 0, laps: 3 }],
  });
  const file = scrivi(templateF40(3));
  const out = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_mista_695_intera_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true, celleNuove: true });
  const stiff = ev.decodeMsg(out.buffer);
  const cella695 = stiff.filter((f) => f.field === 1).find((f) => Buffer.from(f.bytes).toString('latin1').includes('ks_abarth_695_biposto'));
  assert.ok(cella695, 'la 695 entra in griglia');
  assert.equal(Buffer.from(cella695.bytes).toString('hex'), Buffer.from(cellaIntera).toString('hex'),
    'la cella entra BYTE IDENTICA al parco: nessun trapianto di campi');
  assert.match(String(out.report.sintesi.at(-1)), /cella intera del parco/, 'il report dichiara la fotocopia intera');
  assert.match(String(out.report.sintesi.at(-1)), /preset_695b_mech_1/, 'e nomina il preset del gioco');
});

test('CANCELLAIO delle coppie (2/11): mech e visual di DUE modelli diversi sulla stessa cella → la build si rifiuta', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  // la signature delle celle assemblate a mano (lezione 19:15: f11 gialla su
  // blocco f14 nere, e i vecchi grily con visual di un altro modello): f10
  // dice F40, f11 dice CSLE46 — una combo che il GENERA non ha mai scritto.
  const cellaChimera = encodeMsg([
    { field: 3, wire: 2, bytes: B('ks_f40_lm') },
    { field: 4, wire: 2, bytes: B('Auto di prova') },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('preset_f40lm_mech_1') }]) },
    { field: 11, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('preset_e46csl_visual_1') }]) },
    { field: 7, wire: 0, varint: 9n },
  ]);
  const fields = [
    { field: 1, wire: 2, bytes: cellaChimera },
    ...[0, 1, 2].map((i) => ({ field: 1, wire: 2, bytes: cella('ks_f40_lm', i) })),
    { field: 2, wire: 2, bytes: driver(0.60) },
    { field: 2, wire: 2, bytes: driver(0.40) },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 4n }]) },
  ];
  LADDER.nodes.push(nodo('serie_guard_chimera_test', ['ks_f40_lm'], 4));
  const file = scrivi(encodeMsg(fields));
  let err = null;
  try { bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_guard_chimera_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true }); }
  catch (e) { err = e; }
  assert.ok(err, 'la build si rifiuta');
  assert.match(String(err.message), /ASSEMBLATE/, 'nomina la malattia: cella assemblata campo per campo');
  assert.match(String(err.message), /preset_f40lm_mech_1/, 'mostra il mech della cella velenosa');
  assert.match(String(err.message), /preset_e46csl_visual_1/, 'mostra il visual della cella velenosa');
  assert.match(String(err.message), /fotocopia INTERA/, 'dice la cura: fotocopia della cella intera');
  // e il builder non ha scritto niente: il contorno resta quello di prima
});

/* ---------- UNA CELLA, UN'AUTO (7/11, RS sparita dal pool endurance) ----------
   La graduale può far combaciare due modelli vicini: «ks_porsche_992_gt3_rs»
   (tappe parole: 992+gt3) contro «ks_porsche_992_gt3_r_rennsport». Prima la RS
   spariva dal pool SENZA dire niente — la griglia perdeva un modello e nessuno
   se ne accorgeva (nel pool multiclasse GT1+GT2+GT3 del 7/11). La cella va a
   chi la matcha MEGLIO; l'altra finisce nei mancanti e si recupera dal parco. */
test('matchPool: una cella non serve DUE auto — la RS non si prende la Rennsport', async () => {
  const { matchPool } = await import('../src/car-match.mjs');
  const celle = [
    { id: 'ks_porsche_992_gt3_r_rennsport', nome: 'Porsche 911 GT3 R Rennsport (992)' },
    { id: 'ks_ferrari_296_gt3', nome: 'Ferrari 296 GT3' },
  ];
  const m = matchPool(
    ['ks_porsche_992_gt3_r_rennsport', 'ks_porsche_992_gt3_rs', 'ks_ferrari_296_gt3'],
    celle, (c) => [c.id, c.nome], {},
  );
  assert.equal(m.perNome.find((p) => p.richiesto === 'ks_porsche_992_gt3_r_rennsport').stage, 'esatta', 'la Rennsport resta sulla sua cella, per nome esatto');
  assert.equal(m.perNome.find((p) => p.richiesto === 'ks_porsche_992_gt3_rs').trovato, null, 'la RS NON è la Rennsport: nessuna cella presa in prestito');
  assert.deepEqual(m.mancanti, ['ks_porsche_992_gt3_rs'], 'la RS finisce nei mancanti (e si recupera come cella intera del parco)');
  assert.equal(m.sel.length, 2, 'le celle del pool restano quelle delle due auto davvero presenti');
});

test('CANCELLAIO NON scatta sulle celle sane: mech e visual dello stesso modello passano (il parco reale: 2530/2530)', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  // due celle sane DISTINTE (visual diversi): anche la regola anti-celle-identiche deve stare in piedi insieme al cancellaio
  const cellaSana = (visual, i) => encodeMsg([
    { field: 3, wire: 2, bytes: B('ks_f40_lm') },
    { field: 4, wire: 2, bytes: B('Auto di prova') },
    { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B('preset_f40lm_mech_1') }]) },
    { field: 11, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: B(visual) }]) },
    { field: 7, wire: 0, varint: BigInt(i + 1) },
  ]);
  LADDER.nodes.push(nodo('serie_guard_sana_test', ['ks_f40_lm'], 2));
  const file = scrivi(encodeMsg([
    { field: 1, wire: 2, bytes: cellaSana('preset_f40lm_visual_3', 0) },
    { field: 1, wire: 2, bytes: cellaSana('preset_f40lm_visual_4', 1) },
    { field: 2, wire: 2, bytes: driver(0.60) },
    { field: 2, wire: 2, bytes: driver(0.40) },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 2n }]) },
  ]));
  const out = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_guard_sana_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true });
  const stiff = ev.decodeMsg(out.buffer);
  assert.equal(stiff.filter((f) => f.field === 1).length, 2, '2 celle come gridSize');
});

/* ---------- CONFIG SENZA CAMPO 2 (1/11, cura delle anteprime auto assenti) ---------- */
test('config del customgrid: niente campo 2 nelle scritture del builder (stessa forma del GENERA)', async () => {
  const bg = await import('../src/gridbuilder.mjs');
  LADDER.nodes.push(nodo('serie_f40_cfg2_test', ['ks_f40_lm'], 4));
  // template che PORTE ancora il campo 2 = 1 nella config (eredità pre-1/11):
  // il GENERA del gioco non lo scrive e col suo file le anteprime a posto —
  // il dato del confronto byte 18:07 vs 16:56. Il builder lo SCARTA prima di scrivere.
  const conF2 = encodeMsg([
    ...[0, 1, 2, 3].map((i) => ({ field: 1, wire: 2, bytes: cella('ks_f40_lm', i) })),
    { field: 2, wire: 2, bytes: driver(0.60) },
    { field: 2, wire: 2, bytes: driver(0.40) },
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: 4n }, { field: 2, wire: 0, varint: 1n }]) },
  ]);
  const file = scrivi(conF2);
  const out = bg.buildGridMessage({ ladder: LADDER, nodeId: 'serie_f40_cfg2_test', roundIndex: 0, file, aiBand: [88, 93], noBalance: true });
  const cfgField = ev.decodeMsg(out.buffer).find((f) => f.field === 3);
  const cfgInner = ev.decodeMsg(cfgField.bytes);
  assert.ok(cfgInner.every((g) => g.field !== 2), 'campo 2 ASSENTE nella config scritta (eredità del template scartata)');
  assert.ok(cfgInner.some((g) => g.field === 1), 'count (campo 1) restato in config');
});

/* ---------- griglie di fabbrica (distribuzione, 24/10) ---------- */
test('macchina vergine, nessun template sul disco: la GRIGLIA DI FABBRICA copre la serie (ultimo ripiego)', () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  pulisciBak();
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
  // (flake di ordine, 24/10) — e da 31/10 anche i .bak-apply del minutato
  // precedente se ne vanno con pulisciBak()
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  pulisciBak();
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
  pulisciBak();
  writeFileSync(FABBRICA('serie_rs_3_test'), templateF40(4, 'ks_audi_rs_3_sportback'));
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, force: true, dry: true });
  assert.equal(out.written, false);
  assert.ok(String(out.source).includes('griglia di fabbrica'), 'catalogo vuoto = gate silenzioso');
  ga.setInstallSnapshot(null);
});

/* ---------- MAGAZZINO STANTIO (4/11) ---------- */
test('magazzino di un altra serie: archiviato, vince la fabbrica e il magazzino si riscrive', () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  pulisciBak();
  mkdirSync(join(TMP, 'fabbrica'), { recursive: true });
  writeFileSync(FABBRICA('serie_rs_3_test'), templateF40(4, 'ks_audi_rs_3_sportback'));
  ga.storeTemplate('serie_rs_3_test', templateF40(4));   // SBAGLIATO: F40 per la serie RS 3
  ga.setInstallSnapshot({ cars: new Set(['ks_audi_rs_3_sportback']), carNames: new Set() });
  const file = scrivi(templateF40(4, 'ks_mazda_mx5_nd'));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_rs_3_test', roundIndex: 0, file, force: true });
  assert.equal(out.written, true);
  assert.ok(String(out.source ?? '').includes('fabbrica'), 'vince la fabbrica dopo l archivio');
  const storeFile = join(TMP, 'grid-templates', 'serie_rs_3_test.customgrid');
  assert.ok(Buffer.from(readFileSync(storeFile)).toString('latin1').includes('ks_audi_rs_3_sportback'), 'il magazzino ora è della serie (buffer costruito, non la copia grezza)');
  const meta = JSON.parse(readFileSync(join(TMP, 'grid-templates', 'serie_rs_3_test.json'), 'utf8'));
  assert.equal(meta.cells, 4);
  assert.ok(String(meta.source).includes('fabbrica'), 'la provenienza dice la fabbrica');
  const stale = readdirSync(join(TMP, 'grid-templates')).filter((n) => n.includes('.bak-stale-'));
  assert.equal(stale.length, 1, 'il vecchio magazzino è archiviato, non cancellato');
  ga.setInstallSnapshot(null);
});

/* ---------- BAK AL SECONDO (anti-regressione 28/10) ---------- */
// Il bak del template portava solo MINUTI nel nome (bak-<AAAA-MM-GG-hh-mm>):
// due riscritture dello stesso magazzino nello stesso minuto si SOVRASCRIVEVANO
// a vicenda e la pila dei bak perdeva le versioni precedenti (la corsa dei
// candidati resta corta). Regressione: le riscritture ravvicinate DEVONO
// restare tutte, in ordine d'arrivo.
test('BAK AL SECONDO: tre riscritture ravvicinate dello stesso template restano in pila, niente sovrascritture', () => {
  rmSync(join(TMP, 'grid-templates'), { recursive: true, force: true });
  ga.storeTemplate('serie_f40_test', templateF40(6));
  ga.storeTemplate('serie_f40_test', templateF40(8));   // bak del 6
  ga.storeTemplate('serie_f40_test', templateF40(4));   // bak dell'8, nello stesso secondo
  const dir = join(TMP, 'grid-templates');
  const baks = readdirSync(dir).filter((n) => n.startsWith('serie_f40_test.customgrid.bak-')).sort();
  assert.equal(baks.length, 2, `i bak restano in pila (attesi 2, trovati ${baks.length}): collisione al nome; ${baks.join(', ')}`);
  // .equals e NON deepEqual: encodeMsg reustituisce Uint8Array, readFileSync un
  // Buffer — prototipi diversi a byte uguali (il runner lo becca come fallback).
  assert.ok(readFileSync(join(dir, baks[0])).equals(templateF40(6)), 'il bak più vecchio contiene il template a 6');
  assert.ok(readFileSync(join(dir, baks[1])).equals(templateF40(8)), 'il bak più recente contiene il template a 8');
  assert.ok(readFileSync(join(dir, 'serie_f40_test.customgrid')).equals(templateF40(4)), 'il magazzino porta la versione corrente');
});

/* ---------- GUARDIA ANTI-SINGLETON (3/11, Coppa MX-5 ND Cup) ---------- */
// Incidente: il rientro del save (weekend azzerato) lasciava il vivo ridotto a
// UNA cella unica: la prima corsa sul vivo passava lo stesso (cloni ARMONICI
// della stessa livrea — MONOCOLORE, 16 posti tutti visual_1) e i candidati non
// partivano mai. La misura della guardia è la TINTA (campo 11), NON il
// byte-distinto: i cloni armonici lo sono per costruzione. Se il magazzino
// della serie ha più tinte del vivo, la prima corsa SALTA: vince il magazzino.
// Import DINAMICO dopo ACE_GAME_SAVEDIR: un import statico qui verrebbe
// valutato PRIMA del corpo del test (hoisting ESM), caricando evo-grid col
// save vero e facendo leggere al gate le 27 vetture della partita aperta.
const { readCells } = await import('../src/grid-balance.mjs');
// cella con la TINTA in formato GIOCO (preset visuale nel segmento PRECEDENTE a \x18)
const cellaTinta = (id, i, visio) => encodeMsg([
  { field: 3, wire: 2, bytes: B(id) },
  { field: 4, wire: 2, bytes: B('Auto di prova') },
  { field: 7, wire: 0, varint: BigInt(i + 1) },
  { field: 11, wire: 2, bytes: B(`\x12${String.fromCharCode(visio.length)}${visio}\x18Auto Visual ${visio.slice(-1)}`) },
]);
const templateF40Tinte = (n, tinte) => {
  const fields = [];
  for (let i = 0; i < n; i++) fields.push({ field: 1, wire: 2, bytes: cellaTinta('ks_f40_lm', i, tinte[i % tinte.length]) });
  fields.push({ field: 2, wire: 2, bytes: driver(0.60) });
  fields.push({ field: 2, wire: 2, bytes: driver(0.40) });
  fields.push({ field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 0, varint: BigInt(n) }]) });
  return encodeMsg(fields);
};
const tintaDisc = (buf) => new Set(readCells(buf).cells.map((c) => c.tinta).filter(Boolean)).size;

test('guardia anti-singleton: il vivo POCO TINTATO perde la prima corsa, vince il magazzino', () => {
  pulisciBak();
  writeFileSync(STORE(), templateF40Tinte(4, ['preset_f40lm_visual_2', 'preset_f40lm_visual_3']));
  const file = scrivi(templateF40(4));   // il vivo monolivrea di stanotte ('(default)' unica tinta)
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true });
  assert.ok(out.written, 'la riscrittura passa dal magazzino');
  assert.ok(String(out.source ?? '').includes('serie_f40_test'), `source dichiara il magazzino (trovato: ${out.source ?? 'undefined'})`);
  assert.ok(tintaDisc(readFileSync(file)) >= 2, 'la griglia scritta ha le TINTE del magazzino, non la monolivrea del vivo');
});

test('vivo SANO (pariggiato di tinte con il magazzino): la prima corsa resta sul vivo', () => {
  pulisciBak();
  writeFileSync(STORE(), templateF40Tinte(4, ['preset_f40lm_visual_2', 'preset_f40lm_visual_3']));
  const file = scrivi(templateF40Tinte(4, ['preset_f40lm_visual_2', 'preset_f40lm_visual_3']));
  const out = ga.rebuildGridApply({ ladder: LADDER, nodeId: 'serie_f40_test', roundIndex: 0, file, force: true });
  assert.ok(out.written, 'la prima corsa sul vivo scrive senza candidati');
  assert.equal(out.source, undefined, 'nessuna corsa dei candidati: il vivo ha bastato');
  assert.ok(tintaDisc(readFileSync(file)) >= 2, 'le tinte del vivo sano restano (niente rasterolazione dal magazzino)');
});
