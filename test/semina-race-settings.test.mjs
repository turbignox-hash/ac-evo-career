// semina-race-settings.test.mjs — LA GUARDIA DELLA SEMINA DEI CURSORI (3/11,
// richiesta Mauro: «aggiungi una guardia che fallisce se la banda AI di una
// serie mostra un record vuoto riempito dal seeding»).
//
// Il difetto custodito: la riga «↺» del pannello Difficoltà (ENTRAMBI i
// cursori a null) È una riga tornata al consiglio calcolato, NON una serie
// senza impostazione. La semina (seminaRaceSettings in src/state.mjs, video
// estratta dal blocco inline di webui.mjs dove gira a ogni richiesta) non
// deve MAI riempirla: se lo facesse, il fisso [84, 85] risorgerebbe dal
// retro — il peccato che il ladder aiSerie del 2/11 ha tolto davanti.
//
// Ordine della semina, ogni porta col SUO esito atteso:
//   record MEZZO  (un cursore)  → si completa solo il valore mancante;
//   record ASSENTE             → banda di serie del LADDER (aiSerie della
//                                release), MAI il fisso quando il ladder
//                                porta la sua banda;
//   record VUOTO («↺»)         → NIENTE riempimento: la guardia fallisce
//                                se sulla riga appare un numero.
// Il ripiego [84, 85] vive SOLO in fondo: un ladder davvero senza aiSerie —
// e anche lì un record «↺» resta vuoto. La semina è IDEMPOTENTE: il server
// la rilancia a ogni richiesta, la seconda volta non deve cambiare niente.
//
// Niente server né browser qui: la funzione è pura su state in memoria
// (le pause del codice viva girano in webui-smoke.test.mjs e compagnia).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seminaRaceSettings, bandaSerieLadder } from '../src/state.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ladder di PROVA: le bande di serie NON sono [84, 85] di proposito — così
// se sulla riga appare 84–85 si SA da dove è arrivato (il fisso del codice,
// non il ladder): la narrazione dei due canali resta leggibile nei messaggi.
const LADDER = {
  nodes: [
    { nodeId: 'serie_a', aiSerie: [80, 90] },   // assente alla semina
    { nodeId: 'serie_b', aiSerie: [86, 86] },   // vuota («↺») alla semina
    { nodeId: 'serie_c', aiSerie: [88, 88] },   // mezza (solo max mancante)
  ],
};

test('Il record VUOTO («↺») non si riempie: la guardia fallisce se appare un numero', () => {
  const state = { raceSettings: { serie_b: { sliderMin: null, sliderMax: null } } };
  seminaRaceSettings(LADDER, state);
  assert.deepEqual(state.raceSettings.serie_b, { sliderMin: null, sliderMax: null },
    'la semina ha riempito la riga «↺»: il fisso [84, 85] risorge dal retro — la riga vuota è tornata al consiglio calcolato, si lascia lì.');
});

test('Il record ASSENTE prende la banda del LADDER, mai il fisso [84, 85]', () => {
  const state = {};
  seminaRaceSettings(LADDER, state);
  assert.deepEqual(state.raceSettings.serie_a, { sliderMin: 80, sliderMax: 90 },
    'la banda attesa è quella del ladder (aiSerie), non quella scritta a mano nel codice.');
});

test('Il record MEZZO si completa solo sul cursore mancante, l\'utente non si tocca', () => {
  const state = { raceSettings: { serie_c: { sliderMin: 90, sliderMax: null } } };
  seminaRaceSettings(LADDER, state);
  assert.deepEqual(state.raceSettings.serie_c, { sliderMin: 90, sliderMax: 88 },
    'il valore dell\'utente (90) doveva restare: si completa solo il cursore che manca.');
});

test('Il fisso [84, 85] vive SOLO nel ripiego: ladder senza aiSerie — e lì «↺» resta vuoto', () => {
  const vecchio = { nodes: [{ nodeId: 'k1' }, { nodeId: 'k2' }] };   // niente aiSerie, niente bandaSerie
  const state = { raceSettings: { k2: { sliderMin: null, sliderMax: null } } };
  seminaRaceSettings(vecchio, state);
  assert.deepEqual(state.raceSettings.k1, { sliderMin: 84, sliderMax: 85 },
    'per un ladder davvero privo di aiSerie il ripiego [84, 85] è l\'ultima rete.');
  assert.deepEqual(state.raceSettings.k2, { sliderMin: null, sliderMax: null },
    'anche sotto il ripiego la riga «↺» non si riempie.');
  assert.equal(bandaSerieLadder(vecchio, vecchio.nodes[0]), null,
    'senza aiSerie né bandaSerie il lettore del ladder deve dire null, non inventare.');
});

test('La semina è IDEMPOTENTE: il server la rilancia a ogni richiesta, la seconda passata non muove niente', () => {
  const state = { raceSettings: { serie_b: { sliderMin: null, sliderMax: null }, serie_c: { sliderMin: 90, sliderMax: null } } };
  const prima = JSON.stringify(seminaRaceSettings(LADDER, state));
  const dopo = JSON.stringify(seminaRaceSettings(LADDER, state));
  assert.equal(dopo, prima, 'la seconda semina ha toccato i record: il server risemina a ogni richiesta.');
});

test('Nel LADDER VERO del progetto ogni record nasce dalla sua banda aiSerie, non dal fisso', () => {
  const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
  const state = {};
  seminaRaceSettings(ladder, state);
  const nodi = ladder.nodes ?? [];
  assert.ok(nodi.length > 0, 'il ladder del progetto non si legge');
  for (const n of nodi) {
    const attesa = bandaSerieLadder(ladder, n);
    assert.ok(attesa, `${n.nodeId}: il ladder del progetto deve portare aiSerie per OGNI nodo (questo è il dato vivo).`);
    assert.deepEqual(state.raceSettings[n.nodeId], { sliderMin: attesa[0], sliderMax: attesa[1] },
      `${n.nodeId}: la semina doveva usare la banda del ladder (${attesa.join('-')}), non un numero scritto nel codice.`);
  }
});
