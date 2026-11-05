// test/repair-ronda.test.mjs — il medico delle ronde azzerate dal vigia.
// La regola è UNA (src/repair-ronda.mjs) e deve calcolare ALLA STESSA
// MANIERA di `applyRaceResult`: la prova d'identità qui sotto registra una
// gara vera con applyRaceResult (con e senza il sigillo del vigia) e
// pretende che ricalcolaEntry torni GLI STESSI numeri. Il GOVERNO è del
// parco di oggi (car-pool): se il parco ammette l'auto della entry, il
// sigillo cade; mai un numero a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCareer, nodeById, applyRaceResult } from '../src/state.mjs';
import { ricalcolaEntry, riabilitabile } from '../src/repair-ronda.mjs';
import { carPoolOf, carInPool } from '../src/car-pool.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = dirname(QUI);
const LADDER = JSON.parse(readFileSync(join(RADICE, 'config', 'career.evo.ladder.json'), 'utf8'));

function statoFresco() {
  const state = createCareer(LADDER, { name: 'Prova Del Medico', first: 'Prova', last: 'Medico', nation: 'ITA' });
  state.results = {};
  state.raceSettings = {};
  return state;
}

const NODO = nodeById(LADDER, 'coppa_vintage-mini');
assert.ok(NODO, 'nel ladder del progetto c\'è la Coppa Mini (compagna del difetto di stanotte)');

test('ricalcolaEntry = applyRaceResult: i numeri di una vittoria riabilitata tornano alla virgola', () => {
  const track = NODO.calendar[0].track;
  const payloadComune = {
    position: 1, gridSize: 15, dnf: false, fl: true, track,
    laps: 3, winnerLaps: 3, bestLap: '1:52.000', car: 'Mini John Cooper S', carNumber: 0,
  };
  // 1) la gara azzerata al primo import (sigillo del vigia, come stanotte)
  const statoSospesa = statoFresco();
  applyRaceResult(LADDER, statoSospesa, NODO, { ...payloadComune, round: 0, autoFuori: { car: 'Mini John Cooper S', ammesse: ['Mini JCS 1990'] } });
  const sospesa = statoSospesa.results[NODO.nodeId][0];
  assert.equal(sospesa.points, 0, 'la entry sospesa vale zero');
  // 2) ricalcolaEntry sul CLONE della entry sospesa: i numeri della gara riabilitata
  const calc = ricalcolaEntry(LADDER, statoSospesa, NODO.nodeId, JSON.parse(JSON.stringify(sospesa)));
  assert.ok(calc, 'il nodo esiste: la riabilitazione calcola');
  // 3) la STESSA gara senza il sigillo: la misura di paragone è applyRaceResult
  const statoPagato = statoFresco();
  applyRaceResult(LADDER, statoPagato, NODO, { ...payloadComune, round: 0 });
  const pagata = statoPagato.results[NODO.nodeId][0];
  assert.equal(calc.points, pagata.points, 'punti uguali alla gara pagata');
  assert.equal(calc.prize, pagata.prize, 'premio uguale alla gara pagata');
  assert.equal(calc.rep, pagata.rep, 'rep uguale alla gara pagata');
  assert.ok(calc.prize > 0 && calc.points > 0, 'la vittoria riabilitata paga e punta');
});

test('riabilitabile: il parco di oggi comanda, il sigillo vecchio no', () => {
  // il parco VERO (ladder del progetto, con le etichette già riparate)
  assert.ok(riabilitabile(LADDER, 'coppa_vintage-mini',
    { autoFuori: { car: 'Mini John Cooper S' }, car: 'Mini John Cooper S' },
    { carPoolOf, carInPool }), 'il parco di oggi ammette la Mini: il sigillo cade');
  // col nome VECCHIO nell'elenco (il difetto di stanotte) il sigillo resta
  const ladderVecchio = {
    ...LADDER,
    contentNames: { ...LADDER.contentNames, cars: { ...LADDER.contentNames.cars, ks_mini_jcs_1990: 'Mini JCS 1990' } },
  };
  assert.equal(riabilitabile(ladderVecchio, 'coppa_vintage-mini',
    { autoFuori: { car: 'Mini John Cooper S' }, car: 'Mini John Cooper S' },
    { carPoolOf, carInPool }), null, 'col vigia vecchio la ronda resta ferma: non si cambia a mano');
  assert.equal(riabilitabile(LADDER, 'coppa_vintage-mini',
    { autoFuori: null, car: 'Mini John Cooper S' },
    { carPoolOf, carInPool }), null, 'entry senza sigillo: il medico non entra');
  assert.equal(riabilitabile(LADDER, 'coppa_vintage-mini',
    { autoFuori: { car: 'Ferrari F40 LM' }, car: 'Ferrari F40 LM' },
    { carPoolOf, carInPool }), null, 'auto veramente fuori: la entry resta azzerata');
});

test('ricalcolaEntry per la casa: nodo incerto = THROW con il messaggio chiaro', () => {
  assert.throws(() => ricalcolaEntry(LADDER, statoFresco(), 'nodo_inesistente',
    { autoFuori: { car: 'Mini John Cooper S' }, car: 'Mini John Cooper S' }),
  // la regola della casa: «Serie sconosciuta: X» con il rimedio a seguire
  /Serie sconosciuta/,
  'nodo inesistente: la casa sa dire cosa manca');
});
