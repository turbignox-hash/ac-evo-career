// test/setup-carta-unica.test.mjs — IL MECCANICO DA UNA CARTA SOLA (6/11 notte).
//
// Segnalazione di Mauro: «il meccanico non so perché quando mi dà il primo setup
// è 30 L, e ne dà 2 con nome diverso». Sul disco di casa (Golf 8 a Brands Hatch,
// 22:04) le due carte c'erano davvero:
//   «Volkswagen Golf 8 GTI Clubsport - Brands HatchGP - Gara.carsetup»   23 L
//   «… - Gara — EVO-consigliato.carsetup»                                 6 L
// e la seconda aveva riscritto la benzina (23 → 6 L, cioè 3 giri di telemetria
// al posto dei 10 della gara) e le pressioni (31 → 35 PSI). Due carte per la
// stessa gara che si contraddicono: il click ⚡ non deve duplicare la carta
// appena uscita dal meccanico, e i giri della benzina sono quelli del ROUND.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cartaDelMeccanicoSuFile } from '../src/prova-setup.mjs';
import { giriGaraDa } from '../src/setup.mjs';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const AZIONI = readFileSync(join(QUI, 'src', 'webui-actions-setup.mjs'), 'utf8');


/* --- 1) la carta del meccanico si riconosce dalla memoria delle prove --- */

const prova = (file, esito = null) => ({ car: 'A', track: 'B', setupFile: file, esito, bestPrima: 90 });

test('cartaDelMeccanicoSuFile: trova la carta scritta dal meccanico', () => {
  const prove = [prova('C:\\setups\\Gara.carsetup'), prova('C:\\setups\\Quali.carsetup')];
  assert.equal(cartaDelMeccanicoSuFile('C:\\setups\\Gara.carsetup', prove)?.setupFile, 'C:\\setups\\Gara.carsetup');
  assert.equal(cartaDelMeccanicoSuFile('C:\\setups\\Altro.carsetup', prove), null, 'il base del pilota non è una carta del meccanico');
});

test('cartaDelMeccanicoSuFile: vale anche a prova CHIUSA (la carta resta sua)', () => {
  const prove = [prova('C:\\setups\\Gara.carsetup', 'migliorato')];
  assert.ok(cartaDelMeccanicoSuFile('C:\\setups\\Gara.carsetup', prove), 'dopo i giri la carta è ancora del meccanico');
});

test('cartaDelMeccanicoSuFile: barre rovesce e maiuscole non nascondono la carta', () => {
  /* la memoria nomina `C:\\Users\\…\\Gara.carsetup`, il chiamante può passare
     `c:/users/…/gara.carsetup`: con l'uguaglianza secca la carta del meccanico
     risultava «base del pilota» (provato sul Golf vero). */
  const prove = [prova('C:\\Users\\Mauro\\Car Setups\\Gara.carsetup')];
  assert.ok(cartaDelMeccanicoSuFile('c:/users/mauro/Car Setups/Gara.carsetup', prove));
});

test('cartaDelMeccanicoSuFile: file vuoto o assente → null, senza leggere il disco', () => {
  assert.equal(cartaDelMeccanicoSuFile('', [prova('x')]), null);
  assert.equal(cartaDelMeccanicoSuFile(null, [prova('x')]), null);
  assert.equal(cartaDelMeccanicoSuFile('C:\\setups\\Gara.carsetup', []), null);
});

/* --- 2) i giri della benzina: il round comanda sulla telemetria --- */

test('giriGaraDa: la scheda del round batte i giri della telemetria', () => {
  assert.equal(giriGaraDa({ cardLaps: 10, bodyLaps: 3 }), 10, 'gara da 10, telemetria da 3 → 10 (era il 6 L)');
  assert.equal(giriGaraDa({ cardLaps: null, bodyLaps: 3 }), 3, 'senza scheda vale il chiamante');
  assert.equal(giriGaraDa({ cardLaps: null, bodyLaps: null }), 10, 'senza niente, il default di sempre');
  assert.equal(giriGaraDa({ cardLaps: 2, bodyLaps: 12 }), 12, 'sotto i 3 giri non è una gara: non detta legge');
  assert.equal(giriGaraDa({ cardLaps: 0, bodyLaps: 0 }), 10);
});

/* --- 3) il collegamento nella rotta: prima la guardia, poi la scrittura --- */

test('setup-apply: sulla carta del meccanico la copia scrive QUELLA (niente secondo nome)', () => {
  const carta = AZIONI.indexOf('const cartaMeccanico = cartaDelMeccanicoSuFile(src.file);');
  const dest = AZIONI.indexOf("const dest = cartaMeccanico ? src.file : join(dirname(src.file), src.name + ' — EVO-consigliato.carsetup');");
  assert.ok(carta > 0, 'la memoria delle prove non viene consultata: la carta tornerebbe a duplicarsi');
  assert.ok(dest > 0, 'la scrittura deve scegliere fra la carta del meccanico e il suffisso sul base');
  assert.ok(carta < dest, 'la scelta va fatta PRIMA della scrittura, o non cambia niente');
  assert.match(AZIONI, /inPlace: !!cartaMeccanico/, 'la risposta dice che ha aggiornato la carta esistente');
  assert.match(AZIONI, /setupName: nomeDest/);
});

test('setup-apply e meccanico-parla: la benzina segue i giri del round, non la telemetria', () => {
  assert.equal((AZIONI.match(/const giriGara =/g) ?? []).length, 2, '⚡ e meccanico a voce calcolano lo stesso numero');
  assert.ok((AZIONI.match(/raceLaps: giriGara/g) ?? []).length >= 2, 'il numero del round deve arrivare al piano');
  assert.doesNotMatch(AZIONI, /raceLaps: raceAdvice\?\.raceLaps \?\? \(Number\(body\.raceLaps\)/);
  assert.doesNotMatch(AZIONI, /raceLaps: raceLaps >= 3/, 'nessun ramo deve tornare al default 10 ignorando la scheda');
});
