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
//   file classi CORROTTO (JSON invalido, 3/11 richiesta Mauro) → ERRORE CHIARO
//                              che NOMINA il file — non un SyntaxError secco
//                              senza percorso, non un mezzo tab Campionati con
//                              il pannello sparito in silenzio;
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

test('File classi CORROTTO (JSON invalido): errore CHIARO che nomina il file, non un mezzo tab', () => {
  // la cura è doppia (3/11): loadClasses (gridbuilder.mjs) smette di lanciare
  // un SyntaxError secco e il server lo gira come risposta (case 'stili') —
  // la GUI mostra il pannello d'errore (viste-b.js stileErrore) invece di
  // ingoiarlo nel vecchio catch(()=>({stili:[]})) che spezzava il tab in due
  // senza spieganni.
  const leggibile = join(mkdtempSync(join(tmpdir(), 'cap-corrotto-')), 'grid-classes.json');
  writeFileSync(leggibile, JSON.stringify({ classi: { campionato_epoca: { LIMITI_GIOCO: { restrictorMaxPct: 10 } } } }), 'utf8');
  process.env.EVO_CLASSES_FILE = leggibile;
  assert.equal(capPer('campionato_epoca'), 10, 'la lettura BUONA deve passare: il corrotto è un altro scenario, non un nuovo fallback.');

  // STESSO percorso, il file viene marcito SOTTO: il memo non deve mascherare
  // il marcio (il mtime cambia, la rilettura deve esplodere in modo normale).
  writeFileSync(leggibile, '{ "classi": { "campionato_epoca": { "LIMITI_GIOCO": { "restrictorMaxPct"', 'utf8');
  try {
    assert.throws(() => stileOverview(LADDER, STATE),
      'un file corrotto non deve né riempire il tab con classi mezze né passare in silenzio: errore che parla.');
  } finally { delete process.env.EVO_CLASSES_FILE; }

  // e un file corrotto FRESCO (mai letto prima): non ci deve essere drammatica
  // diversa — l'errore è quello, sempre e comunque.
  const corrotto = join(mkdtempSync(join(tmpdir(), 'cap-corrotto-')), 'grid-classes.json');
  writeFileSync(corrotto, '{ "classi": { "campionato_strada": { "LIMITI"', 'utf8');
  process.env.EVO_CLASSES_FILE = corrotto;
  try {
    // NOTA (3/11): assert.throws ritorna l'errore SOLO con l'arg error (su questo
    // Node senza arg esce undefined): catturo in chiaro, che mi serve il MESSAGGIO.
    let lancio = null;
    try { stileOverview(LADDER, STATE); } catch (err) { lancio = err; }
    assert.ok(lancio, 'il file corrotto FRESCO deve LANCIARE; un mezzo tab silenzioso non va bene.');
    const msg = String(lancio.message ?? '');
    assert.ok(/corrotto/i.test(msg), `il messaggio deve dire «corrotto»: ${msg}`);
    assert.ok(msg.includes('grid-classes.json'), `il messaggio deve NOMINARE il file: ${msg}`);
    // l'errore APRE col nome del file; la causa SyntaxError può restare dentro
    // come dettaglio, MA il SyntaxError secco non deve più essere l'unica faccia
    // (chi legge il pannello della GUI non sa nemmeno QUALE file è marcio).
    assert.match(msg, /^grid-classes\.json CORROTTO/, `l'errore deve APRIRE col nome del file, è uscito: ${msg}`);
    assert.ok(!/^Unexpected token/.test(msg), `un messaggio che APRE SOLO «Unexpected token» senza percorso è la tenebra che il file corrotto toglie via: ${msg}`);
  } finally { delete process.env.EVO_CLASSES_FILE; }
});

test('LADDER VIVO del progetto: capPct è un NUMERO SANO per OGNI campionato, e combacia col file classi', () => {
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const classiVive = JSON.parse(readFileSync(join(ROOT, 'data', 'grid-classes.json'), 'utf8')).classi ?? {};
  const { stili } = stileOverview(ladder, STATE);
  assert.ok(stili.length >= 5, 'nel ladder vivo i 5 campionati devono uscire (almeno).');
  for (const s of stili) {
    // LA MAPPA LADDER→CLASSI al BARBIERE (3/11, richiesta Mauro: «il cap in GUI
    // venga DAVVERO dai dati di oggi»): con tutte le classi ancora a cap 20 la
    // combacienza si maschera nel FALLBACK — un nodo che puntasse a una chiave
    // rotta farebbe lo stesso uscire 20 e NESSUN test esploderebbe. Quindi il
    // legame è asserto DIRETTAMENTE: il nodo DEVE avere la classe nel file; il
    // cap che ne esce è il SUO dato (o il fallback SOLO se la classe nata
    // nuda). Chi rinomina una chiave in grid-classes.json senza toccare il
    // ladder (o vice versa) sfonda qui, non nel pannello della GUI.
    assert.ok(classiVive[s.id] != null,
      `${s.id}: il nodo ladder NON ha classe in data/grid-classes.json — la mappa ladder→classi è rotta e il cap uscirebbe dal FALLBACK, non dai dati.`);
    assert.ok(typeof s.capPct === 'number' && Number.isFinite(s.capPct),
      `${s.id}: capPct DEVE essere un numero, è ${JSON.stringify(s.capPct)} — un «undefined» nel badge è ERROR.`);
    assert.ok(s.capPct > 0 && s.capPct <= 100, `${s.id}: un cap ${s.capPct}% fuori dal 0–100 è da rivedere.`);
    // la verità paragonata sul FILE VIVO: se la classe di oggi porta LIMITI_GIOCO
    // deve combaciare; se non la porta, vale il fallback 20 — mai una terza cifra.
    const fileCap = classiVive[s.id]?.LIMITI_GIOCO?.restrictorMaxPct;
    assert.equal(s.capPct, fileCap ?? 20,
      `${s.id}: il badge dice ${s.capPct} ma il file classi (LIMITI_GIOCO.restrictorMaxPct ${fileCap}) — il cap deve venire SOLO da lì o dal fallback 20.`);
  }
  // e i campionati del ladder COMPATTEMENTE fuori dal set dei Cinque (aperto,
  // sport_moderno) portano ANCHE LORO LIMITI_GIOCO nei dati: se cresce il
  // parco di oggi, chi li Toca sa che le loro chiavi vivono nel file classi.
  const GIA_GUARDATI = new Set(stili.map((x) => x.id));
  for (const n of ladder.nodes ?? []) {
    if (!String(n.nodeId).startsWith('campionato_') || GIA_GUARDATI.has(n.nodeId)) continue;
    if (classiVive[n.nodeId] == null) continue; // serie senza classe nel file: nessuna cura qui
    assert.ok(classiVive[n.nodeId].LIMITI_GIOCO != null,
      `${n.nodeId}: classe VIVA nel file ma SENZA LIMITI_GIOCO — il cap della sua serie non ha dato, solo fallback 20 silenzioso.`);
  }
});
