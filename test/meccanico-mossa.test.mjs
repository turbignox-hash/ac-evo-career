// 6/11 notte — «il pannello dice cosa è cambiato, ma non cosa fare».
// prossimaMossa sceglie UNA azione concreta, in ordine di priorità, dai dati che
// il pannello del meccanico ha già. Funzione pura: qui il contratto completo,
// compresa la precedenza (una prova A/B aperta batte tutto il resto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { prossimaMossa } from '../src/meccanico-mossa.mjs';

const consiglio = (vedi, text) => ({ vedi, prio: 1, text });

test('prova A/B aperta: la mossa è uscire e chiuderla, coi giri della ronda', () => {
  const m = prossimaMossa({
    consigli: [consiglio('pressioni', 'Alza la LF di 0.3 psi')],
    prova: { aperta: { setupName: 'Gara 3 giri', campi: ['pressioni'] } },
    hasTelem: true, fuelPerLap: 2.1, bestLap: 104.5, giriGara: 5,
  });
  assert.equal(m.chiave, 'prova');
  assert.match(m.testo, /Gara 3 giri/);
  assert.match(m.testo, /5 giri/);
  assert.match(m.testo, /si chiude da sola/);
});

test('senza telemetria la mossa è attivarla (e non toccare nulla)', () => {
  const m = prossimaMossa({ consigli: [consiglio('freni', 'bias 52→51')], hasTelem: false });
  assert.equal(m.chiave, 'telemetria');
  assert.match(m.testo, /Telemetria: ON/);
  assert.match(m.testo, /3 giri/);
});

test('telemetria ma consumo mai misurato: un giro per misurare la benzina', () => {
  const m = prossimaMossa({ hasTelem: true, fuelPerLap: null, bestLap: 104.5 });
  assert.equal(m.chiave, 'consumo');
  assert.match(m.testo, /consumo/);
});

test('con i dati veri la mossa è la PRIMA voce azionabile (non la memoria)', () => {
  const m = prossimaMossa({
    consigli: [
      consiglio('memoria', 'Il tuo miglior giro resta 1:44.5: oggi +0.8s'),
      consiglio('pressioni', 'Pressioni da freddo 27.2 psi: la RF è a 26.8'),
      consiglio('freni', 'bias 52→51'),
    ],
    hasTelem: true, fuelPerLap: 2.1, bestLap: 105.2,
  });
  assert.equal(m.chiave, 'consiglio');
  assert.match(m.testo, /pressioni/);
  assert.match(m.testo, /RF è a 26\.8/);
  assert.match(m.testo, /3 giri di verifica/);
  assert.doesNotMatch(m.testo, /miglior giro resta/);
});

test('niente sotto soglia: la mossa è la pista, col tempo da battere', () => {
  const m = prossimaMossa({ consigli: [], hasTelem: true, fuelPerLap: 2.1, bestLap: 104.54 });
  assert.equal(m.chiave, 'pista');
  assert.match(m.testo, /1:44\.54/);
});

test('a mani vuote la mossa è ancora la telemetria; con i dati ma senza niente da dire, nessuna mossa inventata', () => {
  // PC appena installato: il primo gesto concreto è la telemetria, non il silenzio
  assert.equal(prossimaMossa({}).chiave, 'telemetria');
  // dati completi, nessun consiglio, nessun tempo: non c'è un'azione vera da suggerire
  assert.equal(prossimaMossa({ consigli: [], hasTelem: true, fuelPerLap: 2.1, bestLap: null }), null);
});
