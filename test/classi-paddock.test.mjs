// classi-paddock.test.mjs — il ripartito del 27/10: Paddock riempie i BUCHI
// delle classi, le regole di Mauro restano sopra. Protegge le regole oneste del
// tool (il «niente dati fittizi» deve reggere anche con dati corrotti o assenti):
//   1) la pendenza si CALIBRA sui punti misurati della classe e si RIFIUTA se
//      scartano oltre la tolleranza (niente fit forzato);
//   2) con UN solo punto misurato non si calibra (come gr86-r5-escort, dato reale);
//   3) le auto fuori dalla finestra PI non si toccano;
//   4) il ramo negativo (Δkw/t<0): PI ≤ base → 0/0, PI sopra base → non
//      derivabile (lezione Mini/Delta del 21/10);
//   5) la zavorra si scala per massa reale (lezione del 19/10: 100kg su auto
//      leggere pesa troppo — in pista Mini/MX-5 sono scese a 50kg);
//   6) la scrittura tocca SOLE le regole fonte 'paddock', con backup, e le
//      regole di Mauro restano intatte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  proposteDaPaddock, scriviProposte, calibraturaClasse,
  paddockIndexFromCat,
} from '../tools/classi-da-paddock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------- fixture MINIME ma con i FIGURI veri del 27/10 ---------- */
const classes = {
  classi: {
    'test-9-10': {
      piMin: 9, piMax: 10,
      autoBase: 'Mercedes-base (base della calibrazione: kg 0 / 0%)',
      regole: [
        { preset: 'preset_base_mech_1', auto: 'Mercedes-base', ballastKg: 0, restrictorPct: 0 },
        { preset: 'preset_media_mech_1', auto: 'Auto media', ballastKg: 100, restrictorPct: 2 },
        { preset: 'preset_forte_mech_1', auto: 'Auto forte', ballastKg: 100, restrictorPct: 5 },
      ],
    },
    'test-classe-incoerente': {
      piMin: 9, piMax: 10,
      autoBase: 'Mercedes-base',
      regole: [
        { preset: 'preset_base_mech_1', auto: 'Mercedes-base', ballastKg: 0, restrictorPct: 0 },
        { preset: 'preset_media_mech_1', auto: 'Auto media', ballastKg: 100, restrictorPct: 1 },
        { preset: 'preset_fortissima_mech_1', auto: 'Auto fortissima', ballastKg: 100, restrictorPct: 35 },
      ],
    },
    'test-monomarca': { regole: [{ auto: 'Auto forte', ballastKg: 0, restrictorPct: 0 }] }, // senza piMin/piMax
  },
};
// kw/t della base = 118: lo stesso valore REALE del 190E sui dati del 27/10
const cat = [
  { name: 'Mercedes-base', kw_per_t: 118, mass: 1420 },
  { name: 'Auto media', kw_per_t: 132, mass: 1380 },      // Δkw/t +14 → misurato 2%
  { name: 'Auto forte', kw_per_t: 168, mass: 1450 },      // Δkw/t +50 → misurato 5%
  { name: 'Auto fortissima', kw_per_t: 250, mass: 1565 }, // Δkw/t +132 → misurato 35% (SOLO incoerente)
  { name: 'Bicocolino', kw_per_t: 168, mass: 900 },       // Δkw/t +50, leggera: zavorra scalata
  { name: 'Auto presa', kw_per_t: 90, mass: 1200 },       // Δkw/t −28, PI sopra base → non derivabile
  { name: 'Auto lenta', kw_per_t: 90, mass: 1300 },       // Δkw/t −28, PI sotto base → 0/0
  { name: 'Sconosciuta', kw_per_t: null, mass: null },    // fuori catalogo: niente Δkw/t
];
const carRaw = {
  cars: [
    { name: 'preset_base_mech_1', display_name: 'Mercedes-base - Standard', performance_indicator: 9.79 },
    { name: 'preset_media_mech_1', display_name: 'Auto media - Standard', performance_indicator: 9.88 },
    { name: 'preset_forte_mech_1', display_name: 'Auto forte - Standard', performance_indicator: 9.93 },
    { name: 'preset_fortissima_mech_1', display_name: 'Auto fortissima - Standard', performance_indicator: 9.84 },
    { name: 'preset_bico_mech_1', display_name: 'Bicocolino - Standard', performance_indicator: 9.51 },
    { name: 'preset_presa_mech_1', display_name: 'Auto presa - Standard', performance_indicator: 9.84 },
    { name: 'preset_lenta_mech_1', display_name: 'Auto lenta - Standard', performance_indicator: 9.40 },
    { name: 'preset_scon_mech_1', display_name: 'Sconosciuta - Standard', performance_indicator: 9.86 },
    { name: 'preset_maxi_mech_1', display_name: 'Maxi turbo - Standard', performance_indicator: 12.5 }, // fuori PI window
  ],
};

/* ---------- la pendenza si calibra SOLO sui misurati ---------- */
test.beforeEach(() => { rmSync(join(HERE, '_classi-paddock-tmp'), { recursive: true, force: true }); });
test.after(() => { rmSync(join(HERE, '_classi-paddock-tmp'), { recursive: true, force: true }); });

test('la pendenza si calibra SOLO sui misurati', () => {
  const cal = calibraturaClasse(classes.classi['test-9-10'], paddockIndexFromCat(cat));
  assert.ok(cal.k != null, 'k derivata dai 2 punti misurati (Δ14→2%, Δ50→5%)');
  assert.ok(Math.abs(cal.k * 50 - 5) < 0.25, `k riproduce il misurato (got ${(cal.k * 50).toFixed(2)})`);
  assert.ok(cal.scartoMax <= 2.5);
});

test('calibratura: si RIFIUTA se i misurati contraddicono (niente fit forzato)', () => {
  const cal = calibraturaClasse(classes.classi['test-classe-incoerente'], paddockIndexFromCat(cat));
  assert.equal(cal.k, null, 'la classe incoerente NON produce numeri');
  assert.match(cal.motivo ?? '', /classo NON derivabile|un punto misurato scarta|NON derivabile/);
});

test('calibratura: con UN solo punto misurato non si calibra (gr86-r5-escort sul dato reale)', () => {
  const una = {
    piMin: 9, piMax: 10, autoBase: 'Mercedes-base',
    regole: [
      { preset: 'preset_base_mech_1', auto: 'Mercedes-base', ballastKg: 0, restrictorPct: 0 },
      { preset: 'preset_forte_mech_1', auto: 'Auto forte', ballastKg: 100, restrictorPct: 5 },
    ],
  };
  const cal = calibraturaClasse(una, paddockIndexFromCat(cat));
  assert.equal(cal.k, null);
  assert.match(cal.motivo, /servono le gare vere/);
});

test('senza piMin/piMax la classe esce dal perimetro, dichiarato (monomarca/ricette a mano)', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-monomarca');
  assert.equal(cls.stato, 'non-derivabile');
  assert.match(cls.motivo, /piMin\/piMax/);
});

/* ---------- i BUCHI: numeri SOLO con i dati veri ---------- */
test('buchi: proposte con k derivata, fonte paddock, nota che dichiara la derivazione', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-9-10');
  assert.equal(cls.stato, 'proposta');
  const p = cls.proposte.find((x) => x.auto.startsWith('Bicocolino'));
  assert.ok(p, 'Bicocolino (Δkw/t +50, PI 9.51) proposto');
  assert.equal(p.fonte, 'paddock');
  const k = calibraturaClasse(classes.classi['test-9-10'], paddockIndexFromCat(cat)).k;
  assert.equal(p.restrictorPct, Math.round(k * 50 * 2) / 2, 'restrittore = k × Δkw/t (arrotondato al 0,5)');
  assert.ok(p.ballastKg < 100, `zavorra scalata per massa (got ${p.ballastKg})`);
  assert.match(p.note ?? '', /griglia-calib/);
});

test('buchi: auto fuori dalla finestra PI della classe non si toccano', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const tutte = esito.classi.flatMap((c) => [...(c.proposte ?? []), ...(c.senzaNumero ?? [])].map((x) => String(x.auto)));
  assert.ok(!tutte.some((a) => a.includes('Maxi turbo')), 'PI 12.5 è fuori dalla 9–10');
});

test('buchi: auto senza kw/t dichiarate SENZA numero, mai riempite col vuoto', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-9-10');
  const s = cls.senzaNumero.find((x) => x.auto.startsWith('Sconosciuta'));
  assert.ok(s, 'Sconosciuta elencata');
  assert.match(s.motivo, /catalogo Paddock/);
  assert.equal(cls.proposte.find((x) => x.auto.startsWith('Sconosciuta')), undefined);
});

test('ramo negativo: PI sopra base → dichiarato non derivabile (lezione Mini/Delta)', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-9-10');
  const senza = cls.senzaNumero.find((x) => x.auto.startsWith('Auto presa'));
  assert.ok(senza, 'Δkw/t negativo + PI sopra la base: NON si deriva');
  assert.match(senza.motivo, /presa\/grip|derivabile/);
  assert.equal(cls.proposte.find((x) => x.auto.startsWith('Auto presa')), undefined);
});

test('ramo negativo: PI sotto base → 0/0 proposto (più lenta della base, parità fisica)', () => {
  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-9-10');
  const p = cls.proposte.find((x) => x.auto.startsWith('Auto lenta'));
  assert.ok(p, 'PI sotto base e potenza inferiore → 0/0 scritta come regola onesta');
  assert.equal(p.ballastKg, 0);
  assert.equal(p.restrictorPct, 0);
});

/* ---------- la scrittura non tocca le regole di Mauro ---------- */
test('scrittura: SOLE le regole fonte paddock cambiano, backup incluso, secondo giro idempotente', () => {
  const tmp = join(HERE, '_classi-paddock-tmp');
  mkdirSync(tmp, { recursive: true });
  const file = join(tmp, 'grid-classes.json');
  writeFileSync(file, JSON.stringify(classes, null, 2), 'utf8');

  const esito = proposteDaPaddock(classes, { carRaw, catCars: cat });
  const cls = esito.classi.find((c) => c.id === 'test-9-10');
  assert.ok(cls.proposte.length > 0, 'ci sono proposte da scrivere');

  const origRegole = JSON.parse(JSON.stringify(classes.classi['test-9-10'].regole));
  const res = scriviProposte(classes, esito, { file });
  assert.ok(res && res.scritte.length > 0, 'scrittura avvenuta');

  // ogni regola di Mauro resta IDENTICA (auto, preset, kg, pct, niente fonte)
  for (const o of origRegole) {
    const after = classes.classi['test-9-10'].regole.find((r) => r.auto === o.auto);
    assert.ok(after, `regola "${o.auto}" resta`);
    assert.equal(after.restrictorPct, o.restrictorPct, `pct di "${o.auto}" intatta`);
    assert.equal(after.ballastKg, o.ballastKg, `kg di "${o.auto}" intatti`);
    assert.equal(after.fonte, undefined, `"${o.auto}" NON marcata paddock`);
  }
  // il backup esiste davvero accanto al file
  const bdir = join(tmp, 'backups');
  assert.ok(existsSync(bdir) && readdirSync(bdir).some((f) => f.startsWith('grid-classes.bak-')), 'backup scritto');
  // il file su disco si rilegge e ha le proposte
  const reclasses = JSON.parse(readFileSync(file, 'utf8'));
  const reregole = reclasses.classi['test-9-10'].regole;
  assert.equal(reregole.filter((r) => r.fonte === 'paddock').length, cls.proposte.length);
  // secondo giro: la classe è chiusa, nessun doppione
  const esito2 = proposteDaPaddock(reclasses, { carRaw, catCars: cat });
  const cls2 = esito2.classi.find((c) => c.id === 'test-9-10');
  assert.equal(cls2.proposte.length, 0, 'dopo la scrittura non c\'è più da proporre');
});
