// tools/vetrina-custom.mjs — il comando AUTO della GARA PERSONALIZZATA
// (28/10 sera, «deve farlo in automatico come paddock»).
//
// Storia: la griglia di una gara personalizzata (demo endurance multi-classe)
// il tool la scrive su disco e il gioco la adotta dal menu principale, ma
// l'AUTO del pilota resta la corrente del garage — e il Cruscotto in gioco
// la riscrive ogni fascia con l'auto della ronda di carriera pendente (R5
// al posto della 296 GT3 richiesta). Il ramo `vetrinaCustom` di
// src/uiapp-pub.mjs risolve: mentre è armato (24h), il publisher comanda
// SOLO l'auto qui indicata, e una volta applicata dal gioco (ack) resta
// muto per tutta la finestra — niente ping-pong col garage.
//
// USO:
//   node tools/vetrina-custom.mjs ks_ferrari_296_gt3    # arma l'auto (nome id della ladder)
//   node tools/vetrina-custom.mjs --off                 # spegne (torna la priorità ronda/evento)
//
// Funziona a EVO APERTO: il publisher rilegge il save a ogni fascia (2.5 s),
// l'app in gioco applica entro il suo giro di scansione.

import { loadState, saveState } from '../src/state.mjs';
import { loadLadder, SAVE_FILE } from '../src/webui-env.mjs';

const arg = process.argv[2] ?? '';
const OFF = arg === '--off' || arg === 'off';
if (!OFF && !arg) {
  console.error('uso: node tools/vetrina-custom.mjs <car-id-della-ladder> | --off');
  console.error('esempio: node tools/vetrina-custom.mjs ks_ferrari_296_gt3');
  process.exit(2);
}

const ladder = loadLadder();
const state = loadState(SAVE_FILE);

if (OFF) {
  if (!state.vetrinaCustom) { console.log('Vetrina custom già spenta: la ronda/evento comandano come sempre.'); process.exit(0); }
  delete state.vetrinaCustom;
  saveState(SAVE_FILE, state);
  console.log('Vetrina custom SPENTA: il Cruscotto torna a comandare ronda/evento al prossimo giro.');
  process.exit(0);
}

const nome = ladder?.contentNames?.cars?.[arg] ?? null;
if (!nome) {
  console.error(`Auto "${arg}" non nel libro della ladder (contentNames.cars). Usa l'id del catalogo (es. ks_ferrari_296_gt3).`);
  process.exit(1);
}

state.vetrinaCustom = { car: arg, startedAt: Date.now() };
saveState(SAVE_FILE, state);
console.log(`Vetrina custom ARMATA: il Cruscotto in gioco imposta "${nome}" nel menu di EVO entro pochi secondi.`);
console.log('  (a ACK in arrivo il comando tace per 24 h — niente ping-pong col garage;');
console.log('   spegnilo con: node tools/vetrina-custom.mjs --off)');
