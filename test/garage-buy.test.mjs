// garage-buy.test.mjs — BUG 23/10: le auto COMPRATE da scheda non costavano
// nulla (si aggiungevano gratis e si rivendevano a profitto). Ora l'acquisto
// porta il prezzo di listino, scrive il flusso `buy` e rifiuta se i soldi
// non bastano o il prezzo è ignoto; le auto VINTE restano gratis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// il registro di test non tocca data/flows.jsonl della carriera vera
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-garagebuy-'));

const { addCar, sellCar, carValueKm, salePrice } = await import('../src/garage.mjs');
const { carPriceOf } = await import('../src/cars.mjs');

const mkState = (money = 500000) => ({
  season: 8,
  money,
  rep: 0,
  node: null,
  round: 0,
  agenda: { day: 1 },
  results: {},
  garage: { cars: [], importedFromShowcase: [] },
  messages: [],
});

// auto con prezzo noto nel listino del progetto (quella usata per scoprire il bug)
const ALFA = { carId: 'alfa_75_turbo_evo_test', carName: 'Alfa Romeo 75 Turbo Evoluzione' };

test("comprata: costa il prezzo di listino e l'auto entra nel garage", () => {
  const price = carPriceOf(ALFA.carName);
  if (price == null) return; // listino assente nell'installazione di test: niente da provare qui
  const state = mkState(500000);
  const out = addCar(state, { ...ALFA, how: 'bought' });
  assert.equal(out.reused, false);
  assert.equal(out.price, price);
  assert.equal(state.money, 500000 - price);
  assert.equal(state.garage.cars.length, 1);
  assert.equal(state.garage.cars[0].how, 'bought');
});

test('comprata senza soldi sufficienti: rifiuta e non tocca nulla', () => {
  const price = carPriceOf(ALFA.carName);
  if (price == null) return;
  const state = mkState(500);
  assert.throws(() => addCar(state, { ...ALFA, how: 'bought' }), /Soldi insufficienti|Not enough money|500|price/i);
  assert.equal(state.money, 500);
  assert.equal(garageBought(state), 0, 'neanche un\'auto finisce in garage se i soldi non bastano');
});

/* piccola helper locale (hoisted) */
function garageBought(state) { return state.garage.cars.filter((c) => c.how === 'bought').length; }

test('il prezzo ignoto si rifiuta: niente acquisti a prezzo inventato', () => {
  const state = mkState();
  assert.throws(() => addCar(state, { carId: 'auto_fantasma', carName: 'Auto Che Non Esiste Zzz', how: 'bought' }), /Prezzo non noto|price/i);
  assert.equal(state.garage.cars.length, 0);
});

test('vinta: entra gratis come prima', () => {
  const state = mkState(123000);
  const out = addCar(state, { carId: 'vinta_1', carName: 'Mazda RX-7 FD Spirit R', how: 'won' });
  assert.equal(out.price, null);
  assert.equal(state.money, 123000);
  assert.equal(state.garage.cars.length, 1);
});

test('acquisto subito seguito da rivendita: non impana soldi dal nulla', () => {
  const price = carPriceOf(ALFA.carName);
  if (price == null) return;
  const state = mkState(500000);
  const out = addCar(state, { ...ALFA, how: 'bought' });
  const sell = sellCar(null, state, out.car.carId);
  // rivendere al momento zero: valutazione 85% del prezzo, incasso 70% → in perdita
  const val = carValueKm(price, 0);
  assert.equal(sell.gain, salePrice(val.value));
  assert.ok(sell.gain < price, `ricavo ${sell.gain} € deve stare sotto il prezzo pagato ${price} €`);
  assert.equal(state.money, 500000 - price + sell.gain);
});
