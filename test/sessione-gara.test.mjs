// test/sessione-gara.test.mjs — la gara di Laguna Seca del 6/11 ha mostrato
// quattro letture sbagliate, tutte insieme:
//   1) la sessione di gara scambiata per prove (tipo «TimeAttack», fase vuota);
//   2) «Ultimo giro!» mai detto in gara e detto a sproposito a fine prove;
//   3) benzina annunciata in giri d'autonomia con un giro da fare;
//   4) danni mostrati come 676 % e 964 %.
// Qui una regola per test, sui dati veri di quella gara.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eGaraSessione, danniPercent } from '../src/shmem.mjs';
import { engineerLive } from '../src/engineer.mjs';
import { narratore } from '../tools/_monitor-copilota.mjs';

test('è gara: sessione a giri senza timer, anche col tipo «TimeAttack»', () => {
  assert.equal(eGaraSessione({ tipo: 'Race' }), true);
  assert.equal(eGaraSessione({ tipo: 'TimeAttack', giriTotali: 3, tempoRimanente: null }), true, 'la gara non ha timer');
  assert.equal(eGaraSessione({ tipo: 'TimeAttack', giriTotali: 3, tempoRimanente: ' 4:59 ' }), false, 'la qualifica a tempo non è gara');
  assert.equal(eGaraSessione({ tipo: 'TimeAttack', giriTotali: 0, tempoRimanente: null }), false);
  assert.equal(eGaraSessione({ tipo: 'TimeAttack', tempoRimanente: '13:08' }), false, 'le prove sono a tempo');
});

test('inRace e ultimo giro reggono il tipo che mente e il flag muto', () => {
  const snap = ({ race = true, player = {} } = {}) => ({
    live: true,
    session: { type: 'TimeAttack', race },
    player: {
      car: 'Mazda MX-5 ND Cup', driver: 'Mauro Turbigno', position: 1, drivers: 15,
      lapsDone: 2, lapsTotal: 3, fuel: 11.8, isLastLap: false, timeLeft: null,
      tyreWear: [0, 0, 0, 0], flag: 'nessuna', ...player,
    },
    delta: null,
  });
  const gara = engineerLive(snap(), {});
  assert.equal(gara.inRace, true, 'gara a giri senza timer: inRace vero anche a fase vuota');
  assert.equal(gara.gauges.isLastLap, true, 'ultimo giro dedotto dal contatore quando il flag tace');

  const prova = engineerLive(snap({ race: false, player: { timeLeft: '5:00', lapsTotal: 0 } }), {});
  assert.equal(prova.inRace, false);
  assert.equal(prova.gauges.isLastLap, false, 'in prova il flag resta quello del gioco, senza inventare');
});

test('danni: frazioni 0..1 in %, blocchi già in % restano in %, mai oltre 100', () => {
  // fine sessione di Laguna Seca: il blocco arrivava in frazioni
  assert.deepEqual(danniPercent([0, 0, 0.12, 0.05, 0.17]), [0, 0, 12, 5, 17]);
  // in gara lo stesso blocco arrivava già in percentuale (6.76 = 6.76%)
  assert.deepEqual(danniPercent([0, 0, 6.76, 2.89, 9.64]), [0, 0, 7, 3, 10]);
  assert.deepEqual(danniPercent([120]), [100], 'nessun valore può superare il 100%');
  assert.deepEqual(danniPercent([]), []);
});

test('«Ultimo giro!» solo in gara: la prova non consuma il latch della gara', () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'weekend' };
  const frame = (inRace) => ({
    live: true, sessionId: '0:0:0', sessionType: 'TimeAttack', inRace,
    gauges: { lapsDone: 2, lapsTotal: 3, fuel: 12, lapsOnFuel: 9, lapsLeft: 1 },
    delta: { lapNo: 2, dv: 0 },
  });
  // fine delle prove: in prova il totale giri è già quello della gara, ma non è gara
  const prova = narratore(frame(false), slot, 1000);
  assert.equal(prova.filter((f) => f.chi === 'ultimoGiro').length, 0, 'la prova non annuncia l\'ultimo giro');
  // la gara vera, stesso slot e stessa firma di sessione: la frase esce
  const gara = narratore(frame(true), slot, 2000);
  assert.equal(gara.filter((f) => f.chi === 'ultimoGiro').length, 1, 'in gara parla una volta sola');
});

test('benzina in gara: parla dei giri che restano, non dell\'autonomia', () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'gara' };
  const base = { live: true, sessionId: 's', inRace: true, delta: { lapNo: 1, dv: 0 } };
  // semina l'autonomia
  narratore({ ...base, gauges: { lapsDone: 1, lapsTotal: 3, fuel: 12, lapsOnFuel: 11.6, lapsLeft: 2 } }, slot, 1000);
  const dette = narratore({ ...base, gauges: { lapsDone: 2, lapsTotal: 3, fuel: 11.8, lapsOnFuel: 10.9, lapsLeft: 1 } }, slot, 2000);
  const b = dette.find((f) => f.chi === 'benzina');
  assert.ok(b, 'la frase esce quando l\'autonomia scende');
  assert.match(b.it, /margine/, 'la frase dice il margine');
  assert.match(b.it, /restano 1/, 'e nomina il giro che resta');
  assert.ok(!/^Benzina per [\d.]+ giri$/.test(b.it), 'non è più la sola autonomia');
});
