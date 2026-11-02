// cap-dati-guard.test.mjs — LA GUARDIA DEL CAP DAL PAYLOAD (3/11, richiesta
// Mauro: «il cap del miscuglio dai dati»): il badge del tab Campionati non deve
// portare ARROTONDAMENTI NEL CODICE ma leggere grid-classes.json.
//
// Il difetto custodito: prima di oggi il CAP del restrictor era una costante
// della GUI (20) — se una classe un giorno avesse un limite diverso, il badge
// avrebbe continuato a dire 20. stileOverview (src/stile-webui.mjs) oggi legge
// capPct da cls.LIMITI_GIOCO.restrictorMaxPct, lo STESSO file che clampa
// grid-calib e gridbuilder e che il gioco CAPPA in gara — una sola verità,
// tre consumatori.
//
// Ordine della guardia, ogni porta col SUO esito atteso:
//   classe CON LIMITI_GIOCO  → capPct = restrictorMaxPct del FILE (pure 35,
//                              se il file un giorno lo porta: il badge segue i DATI);
//   classe SENZA LIMITI_GIOCO → capPct = 20 di fallimento, MAI undefined e MAI
//                              un ERROR del server (il tab Campionati deve uscire
//                              leggibile anche con una classe nuda);
//   LIMITI_GIOCO senza restrictorMaxPct → 20 (il ballastMaxKg non copre il cap);
//   classe ASSENTE             → 20 (classi vuote, bootstrap vergine);
//   file CLASSI ASSENTE        → NESSUN errore, capPct = 20;
//   LADDER VIVO del progetto   → capPct UN NUMERO per OGNI campionato
//                                arrogato (mai undefined/NaN/stringa), e se
//                                la classe viva porta LIMITI_GIOCO deve
//                                combaciare col file, MAI con una costante.
//
// Niente server né browser: stileOverview è puro su (ladder, state) e il file
// classi passa da EVO_CLASSES_FILE come vuole car-pool.test.mjs (loadClasses
// rilegge l'env a ogni giro — il memo dialoga su PERCORSO+MTIME).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stileOverview } from '../src/stile-webui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ladder minimo: i CINQUE campionati che il tab Campionati elenca (il filtro
// PROPRIETARI di stile-webui.mjs passa solo questi nodeId). Niente cifre di
// cap nel ladder: il cap NON vive nel ladder, vive in grid-classes.json.
const LADDER = {
  nodes: [
    { nodeId: 'campionato_epoca', display: 'Epoca', repRequired: 0, cars: [] },
    { nodeId: 'campionato_moderno', display: 'Moderno', repRequired: 0, cars: [] },
    { nodeId: 'campionato_strada', display: 'Strada', repRequired: 90, cars: [] },
    { nodeId: 'campionato_pista', display: 'Pista', repRequired: 150, cars: [] },
    { nodeId: 'campionato_corsa', display: 'Corsa', repRequired: 450, cars: [] },
  ],
};

const STATE = { rep: 500, seats: {} };   // tutto sbloccato, nessuno iscritto

function scriviClassi(obj) {
  const f = join(mkdtempSync(join(tmpdir(), 'cap-dati-')), 'grid-classes.json');
  writeFileSync(f, JSON.stringify(obj), 'utf8');
  process.env.EVO_CLASSES_FILE = f;
  return () => { delete process.env.EVO_CLASSES_FILE; };
}

function capPer(nodeId) {
  const { stili } = stileOverview(LADDER, STATE);
  const s = stili.find((x) => x.id === nodeId);
  return s ? s.capPct : undefined;
}

test('La classe CON LIMITI_GIOCO porta al badge il SUO restrictorMaxPct: 35, anche se il codice diceva 20', () => {
  const ripristina = scriviClassi({
    classi: { campionato_strada: { LIMITI_GIOCO: { ballastMaxKg: 100, restrictorMaxPct: 35 } } },
  });
  try {
    assert.equal(capPer('campionato_strada'), 35,
      'il cap del badge doveva essere il restrictorMaxPct del FILE (35): se esce 20 il codice ha di nuovo una costante incisa.');
  } finally { ripristina(); }
});

test('La classe SENZA LIMITI_GIOCO NON genera ERROR: il badge mostra 20 di fallback, il tab esce leggibile', () => {
  const ripristina = scriviClassi({
    classi: { campionato_moderno: { poolAuto: ['ks_mazda_mx5_nd_cup'], regole: [{ auto: 'nd_cup', restrictorPct: 20, nota: '→ cap 20; la prima gara decide' }] } },
  });
  try {
    assert.doesNotThrow(() => stileOverview(LADDER, STATE),
      'una classe senza limiti di gioco non deve mandare in errore l\'endpoint dei Campionati.');
    assert.equal(capPer('campionato_moderno'), 20,
      'classe nuda → il badge porta il cap 20: MAI undefined, MAI «NaN» o «error» nel tab Campionati.');
  } finally { ripristina(); }
});

test('LIMITI_GIOCO con solo ballastMaxKg NON copre il cap del restrictor: resta 20, non undefined', () => {
  const ripristina = scriviClassi({
    classi: { campionato_epoca: { LIMITI_GIOCO: { ballastMaxKg: 100 } } },
  });
  try {
    assert.equal(capPer('campionato_epoca'), 20,
      'il ballast ha un suo mondo: il cap della RESTRIZIONE non si legge da lì, il fallback deve stare a 20.');
  } finally { ripristina(); }
});

test('Classe ASSENTE dal file classi: capPct 20 di fallback, nessun errore', () => {
  const ripristina = scriviClassi({ classi: {} });
  try {
    const { stili } = stileOverview(LADDER, STATE);
    assert.equal(stili.length, 5, 'senza classi i Cinque campionati DEVONO uscire comunque');
    for (const s of stili) {
      assert.equal(s.capPct, 20, `${s.id}: capPct deve essere 20 anche senza classe, mai undefined.`);
    }
  } finally { ripristina(); }
});

test('FILE CLASSI ASSENTE (bootstrap vergine): NESSUN errore e cap che non sparisce', () => {
  const f = join(tmpdir(), `cap-dati-inesistente-${Date.now()}.json`);
  delete process.env.EVO_CLASSES_FILE;
  assert.ok(!existsSync(f), 'il test vuole un percorso inesistente (nessun bootstrap qui)');
  process.env.EVO_CLASSES_FILE = f;
  try {
    // il bootstrap di loadClasses NON partecipa via EVO_CLASSES_FILE (vedi
    // gridbuilder): il percorso punta da sé, nessuna copia parte, la lettura
    // esce vuota — e il tab Campionati deve restare in piedi.
    const { stili } = stileOverview(LADDER, STATE);
    for (const s of stili) assert.equal(s.capPct, 20, `${s.id}: senza file classi il badge resta in piedi a 20.`);
  } finally {
    delete process.env.EVO_CLASSES_FILE;
  }
});

test('LADDER VIVO del progetto: capPct è un NUMERO SANO per OGNI campionato, e combacia col file classi', () => {
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const classiVive = JSON.parse(readFileSync(join(ROOT, 'data', 'grid-classes.json'), 'utf8')).classi ?? {};
  const { stili } = stileOverview(ladder, STATE);
  assert.ok(stili.length >= 5, 'nel ladder vivo i 5 campionati devono uscire (almeno).');
  for (const s of stili) {
    assert.ok(typeof s.capPct === 'number' && Number.isFinite(s.capPct),
      `${s.id}: capPct DEVE essere un numero, è ${JSON.stringify(s.capPct)} — un «undefined» nel badge è ERROR.`);
    assert.ok(s.capPct > 0 && s.capPct <= 100, `${s.id}: un cap ${s.capPct}% fuori dal 0–100 è da rivedere.`);
    // la verità paragonata sul FILE VIVO: se la classe di oggi porta LIMITI_GIOCO
    // deve combaciare; se non la porta, vale il fallback 20 — mai una terza cifra.
    const fileCap = classiVive[s.id]?.LIMITI_GIOCO?.restrictorMaxPct;
    assert.equal(s.capPct, fileCap ?? 20,
      `${s.id}: il badge dice ${s.capPct} ma il file classi (LIMITI_GIOCO.restrictorMaxPct ${fileCap}) — il cap deve venire SOLO da lì o dal fallback 20.`);
  }
});
