// posizione-blocchi.test.mjs — la posizione ufficiale rispetta i blocchi di classe
// (audit 4/11: in 16 gare su 88 il riordino per tempo scavalcava l'ordine del file).
//
// Caso vero: Donington 18/10, 5 piloti davanti con 38-45 s PIÙ del giocatore
// (un'altra classe/Pro-Am). Il file dice P7; il vecchio ricalcolo diceva P2.
// La regola nuova: il file si spezza in blocchi quando i giri cambiano o il
// tempo scende; dentro il blocco valgono giri e tempo+penalità, fra blocchi no.
import test from 'node:test';
import assert from 'node:assert/strict';
import { officialPositionOf, penaltyOf } from '../src/results.mjs';

const drv = (name, position, time, { laps = 5, pen = '', dsq = false } = {}) => ({
  driver_name: name, driver_surname: 'X', position, laps, total_time: time,
  high_penalty: dsq ? 'DSQ' : pen, is_current_driver: false,
});

test('blocchi di classe: il giocatore resta P7, non viene promosso a P2', () => {
  const result = { drivers: [
    drv('A', 0, '09:23.476'), drv('B', 1, '09:25.633'), drv('C', 2, '09:26.125'),
    drv('D', 3, '09:26.888'), drv('E', 4, '09:32.242'),
    drv('F', 5, '08:45.541'), drv('Mauro', 6, '08:46.957'), drv('H', 7, '08:51.182'),
  ] };
  const me = result.drivers.find((d) => d.driver_name === 'Mauro');
  assert.equal(officialPositionOf(result, me).position, 7, 'il file dice P7: i primi 5 sono un altro blocco');
});

test('dentro il blocco la penalità vale: +5s e si scende di un posto', () => {
  const result = { drivers: [
    drv('A', 0, '06:56.215'), drv('C', 1, '06:57.000'), drv('Mauro', 2, '06:58.000', { pen: '+5.0s' }),
  ] };
  const me = result.drivers.find((d) => d.driver_name === 'Mauro');
  assert.equal(officialPositionOf(result, me).position, 3, 'con +5s il 6:59.900 passa avanti');
});

test("senza penalità l'ordine del file (tempo monotòno) resta", () => {
  const result = { drivers: [
    drv('A', 0, '06:56.215'), drv('Mauro', 1, '06:57.900'), drv('C', 2, '06:58.500'),
  ] };
  const me = result.drivers.find((d) => d.driver_name === 'Mauro');
  assert.equal(officialPositionOf(result, me).position, 2);
});

test('DSQ e giri zero restano fuori classifica', () => {
  const result = { drivers: [drv('A', 0, '06:56.215'), drv('B', 1, '06:00.000', { dsq: true }), drv('C', 2, '05:00.000', { laps: 0 })] };
  assert.equal(officialPositionOf(result, result.drivers[1]).position, null);
  assert.equal(officialPositionOf(result, result.drivers[2]).position, null);
  assert.equal(officialPositionOf(result, result.drivers[0]).position, 1);
});

test('penaltyOf resta la fonte del tipo di penalità', () => {
  assert.equal(penaltyOf({ high_penalty: '+5.0s' }).ms, 5000);
  assert.equal(penaltyOf({ high_penalty: 'DSQ' }).dsq, true);
});
