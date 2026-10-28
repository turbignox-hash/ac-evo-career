import "./_flows-sandbox.mjs"; // sandbox flussi
// gridclasses.test.mjs — le tre scoperte fragili del 19–20/10/2026, protette:
//   1) restrictor: nel FILE è una FRAZIONE (raw = %/100 — setF32(pct/100));
//      senza test, la classe roadster_classic era già regredita di un fattore 100.
//   2) classe monomarca: regole tutte a 0/0 (hyper_road) → la griglia si riscrive
//      nude, e il match di classe NON si rompe.
//   3) merge perTraccia: i supplementi sostituiscono il restrictor di regole
//      (non si sommano) solo sulla pista combaciata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// invarianti del FORMATO delle classi: letture a una fixture congelata
// (test/fixtures/grid-classes-sample.json) quando data/grid-classes.json non
// c'è (pacchetto amico estratto). Se c'è il dato del PC si usa quello: le
// stesse asserzioni valore-these valgono su entrambe le fonti (regole 0/0,
// aiStandard pinnato...). Priorità però all'archivo esistente del progetto.
const CLASSES = process.env.EVO_CLASSES_FILE
  ?? (existsSync(join(HERE, '..', 'data', 'grid-classes.json'))
    ? join(HERE, '..', 'data', 'grid-classes.json')
    : join(HERE, 'fixtures', 'grid-classes-sample.json'));

test('restrictor: la scrittura usa setF32(pct/100) — il campo file è una FRAZIONE', async () => {
  const src = readFileSync(join(HERE, '..', 'src', 'gridbuilder.mjs'), 'utf8');
  const restore = readFileSync(join(HERE, '..', 'src', 'grid-restore.mjs'), 'utf8');
  // scrittura: la % va in campo 25 come frazione; lettura: la frazione torna ×100
  assert.match(src, /setF32\(\s*rl\.pct\s*\/\s*100\s*\)/, 'gridbuilder: campo 25 = %/100');
  assert.match(restore, /f32of\(f\.bytes\)\s*\*\s*100/, 'grid-restore: % = frazione × 100');
});

test('hyper_road: classe monomarca con regole tutte a 0/0 (e aiStandard pinnato)', () => {
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const h = j.classi.hyper_road;
  assert.ok(h, 'classe presente');
  assert.ok(h.regole.every((r) => (r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0), 'tutte le regole a 0/0');
  assert.ok(Array.isArray(h.aiStandard) && h.aiStandard.length === 2, 'campo AI pinnato');
});

test('merge perTraccia: supplementi sostituiscono il restrictor (non si sommano) solo sulla pista combaciata', async () => {
  const { patchPerTrack, perTrackKey } = await import('../src/gridbuilder.mjs');
  const cls = {
    regole: [
      { preset: 'preset_a_mech_1', ballastKg: 100, restrictorPct: 1 },
      { preset: 'preset_b_mech_1', ballastKg: 100, restrictorPct: 2 },
    ],
    perTraccia: {
      '_readme': 'no',
      'Circuit Of The Americas': { restrictorPct: { preset_a_mech_1: 9 } },
    },
  };
  const rules = [
    { rule: { preset: 'preset_a_mech_1' }, kg: 100, pct: 1 },
    { rule: { preset: 'preset_b_mech_1' }, kg: 100, pct: 2 },
  ];
  // pista combaciante (anche per id ladder): la A sostituisce 1 → 9, la B resta 2
  const key = perTrackKey(cls, 'Circuit Of The Americas');
  assert.equal(key, 'Circuit Of The Americas');
  const out = patchPerTrack(rules, cls, 'circuit_of_the_americas');
  assert.equal(out, 'Circuit Of The Americas');
  assert.deepEqual(rules.map((r) => r.pct), [9, 2], 'sostituzione, non somma');
  // pista senza chiave: nessuna patch
  assert.equal(patchPerTrack(rules, cls, 'Brands Hatch'), null);
});

test('campionato_aperto: classe e nodo ladder combaciano, base 0/0 e tutto sotto i LIMITI_GIOCO', () => {
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const cls = j.classi.campionato_aperto;
  assert.ok(cls, 'classe presente (pool ampio in stile R5+Escort, 28/10)');
  // nodo ladder omonimo: stessa lista auto della classe (id ks_)
  const LADDER = JSON.parse(readFileSync(join(HERE, '..', 'config', 'career.evo.ladder.json'), 'utf8'));
  const node = LADDER.nodes.find((n) => n.nodeId === 'campionato_aperto');
  assert.ok(node, 'nodo carriera presente');
  assert.deepEqual([...(node.cars ?? [])].sort(), [...(cls.poolAuto ?? [])].sort(), 'poolAuto della classe = cars del nodo');
  // base 0/0, tutte le altre dentro i LIMITI_GIOCO del gioco (100kg / 20%)
  const caps = cls.LIMITI_GIOCO ?? {};
  const base = cls.regole.find((r) => (r.auto ?? '').includes(cls.autoBase))
    ?? cls.regole.find((r) => (r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0);
  assert.ok(base, 'base individabile');
  assert.equal(base.ballastKg ?? 0, 0, 'base senza zavorra');
  assert.equal(base.restrictorPct ?? 0, 0, 'base senza restrictor');
  for (const r of cls.regole) {
    assert.ok(r.preset || r.auto, 'ogni regola ha preset o auto');
    if (r === base) continue;
    assert.ok((r.ballastKg ?? 0) <= (caps.ballastMaxKg ?? 100), `ballast ${r.auto} entro cap`);
    assert.ok((r.restrictorPct ?? 0) <= (caps.restrictorMaxPct ?? 20), `restrictor ${r.auto} entro cap (lezione 27/10: niente oltre il 20%)`);
    // non-base senza penalità: solo se documentata (240Z Standard PI sotto base = 0/0 è la sua legge giusta)
    if ((r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0) {
      assert.ok(r.nota, `non-base a 0/0 richiede nota di giustificazione: ${r.auto}`);
    }
  }
  // preset unici: due regole che toccano lo stesso preset si sorpassano a vicenda
  const presets = cls.regole.filter((r) => r.preset).map((r) => r.preset);
  assert.equal(new Set(presets).size, presets.length, 'preset non duplicati');
});

test('campionato_sport_moderno: classe e nodo ladder combaciano, base 0/0 e regole sotto i LIMITI_GIOCO', () => {
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const cls = j.classi.campionato_sport_moderno;
  assert.ok(cls, 'classe presente (pool ampio moderno, 28/10)');
  const LADDER = JSON.parse(readFileSync(join(HERE, '..', 'config', 'career.evo.ladder.json'), 'utf8'));
  const node = LADDER.nodes.find((n) => n.nodeId === 'campionato_sport_moderno');
  assert.ok(node, 'nodo carriera presente');
  assert.deepEqual([...(node.cars ?? [])].sort(), [...(cls.poolAuto ?? [])].sort(), 'poolAuto della classe = cars del nodo');
  const caps = cls.LIMITI_GIOCO ?? {};
  const base = cls.regole.find((r) => r.auto === cls.autoBase);
  assert.ok(base, `base "${cls.autoBase}" individuabile`);
  assert.equal(base.ballastKg ?? 0, 0, 'base senza zavorra');
  assert.equal(base.restrictorPct ?? 0, 0, 'base senza restrictor');
  for (const r of cls.regole) {
    assert.ok(r.preset || r.auto, 'ogni regola ha preset o auto');
    if (r === base) continue;
    assert.ok((r.ballastKg ?? 0) <= (caps.ballastMaxKg ?? 100), `ballast ${r.auto} entro cap`);
    assert.ok((r.restrictorPct ?? 0) <= (caps.restrictorMaxPct ?? 20), `restrictor ${r.auto} entro cap (mai oltre il 20% del gioco)`);
    if ((r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0) {
      assert.ok(r.nota, `non-base a 0/0 richiede nota di giustificazione: ${r.auto}`);
    }
  }
  const presets = cls.regole.filter((r) => r.preset).map((r) => r.preset);
  assert.equal(new Set(presets).size, presets.length, 'preset non duplicati');
});

test('campionati stile (28/10): epoca/moderno/strada/pista/corsa combaciano, base 0/0 e regole entro i LIMITI_GIOCO', () => {
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const LADDER = JSON.parse(readFileSync(join(HERE, '..', 'config', 'career.evo.ladder.json'), 'utf8'));
  for (const id of ['campionato_epoca', 'campionato_moderno', 'campionato_strada', 'campionato_pista', 'campionato_corsa']) {
    const cls = j.classi[id];
    assert.ok(cls, `classe ${id} presente (pool stile, generati da _genera-stili)`);
    const node = LADDER.nodes.find((n) => n.nodeId === id);
    assert.ok(node, `nodo carriera ${id} presente`);
    assert.deepEqual([...(node.cars ?? [])].sort(), [...(cls.poolAuto ?? [])].sort(), `${id}: poolAuto = cars del nodo`);
    assert.ok(node.calendar.every((r) => LADDER.contentNames.tracks[(r.track)] != null), `${id}: calendario solo con piste del ladder`);
    const caps = cls.LIMITI_GIOCO ?? {};
    // base = la regola 0/0 SENZA nota: le varianti alla stessa PI della base
    // portano sempre nota (miscuglio random 28/10: i modelli multi-preset
    // possono avere lo stesso auto con PI diverse — il nome non basta).
    const senzanota = cls.regole.filter((r) => (r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0 && !r.nota);
    assert.equal(senzanota.length, 1, `${id}: una sola 0/0 senza nota (la base)`);
    const base = senzanota[0];
    assert.equal(base.auto, cls.autoBase, `${id}: la base 0/0 è il display "${cls.autoBase}"`);
    assert.equal(base.ballastKg ?? 0, 0, `${id}: base senza zavorra`);
    assert.equal(base.restrictorPct ?? 0, 0, `${id}: base senza restrictor`);
    for (const r of cls.regole) {
      assert.ok(r.preset || r.auto, `${id}: ogni regola ha preset o auto`);
      if (r === base) continue;
      assert.ok((r.ballastKg ?? 0) <= (caps.ballastMaxKg ?? 100), `${id}: ballast ${r.auto} entro cap`);
      assert.ok((r.restrictorPct ?? 0) <= (caps.restrictorMaxPct ?? 20), `${id}: restrictor ${r.auto} entro cap (mai oltre il 20%)`);
      assert.ok((r.restrictorPct ?? 0) % 0.5 === 0, `${id}: restrictor ${r.auto} a passi di 0.5%`);
      if ((r.ballastKg ?? 0) === 0 && (r.restrictorPct ?? 0) === 0) {
        assert.ok(r.nota, `${id}: non-base a 0/0 richiede nota di giustificazione: ${r.auto}`);
      }
    }
    const presets = cls.regole.filter((r) => r.preset).map((r) => r.preset);
    assert.equal(new Set(presets).size, presets.length, `${id}: preset non duplicati`);
  }
});

test('vigia campo AI: segnala il range perso e zitta quando combacia o senza pin', async () => {
  const { aiRangeProposal } = await import('../src/grid-restore.mjs');
  const j = JSON.parse(readFileSync(CLASSES, 'utf8'));
  const hyper = j.classi.hyper_road;
  // il giudizio esige un pin: senza aiStandard la vigia è muta (difesa regressione)
  assert.ok(hyper.aiStandard, 'hyper_road pinnata: senza questo test la vigia non avrebbe regole');
  // file assente/anomalo → null senza crash (comportamento già vinto dai watcher)
  assert.equal(aiRangeProposal('(inesistente).customgrid'), null);
});
