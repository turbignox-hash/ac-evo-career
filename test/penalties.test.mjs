// Regressione (richiesta Mauro 23/10/2026): «ho vinto con 5 secondi di penalità,
// il gioco alla fine l'ha calcolata, il tool no — e nemmeno la squalifica».
// La penalità vera di EVO sta in high_penalty ('+5.0s' | 'DT' | 'DSQ'), NON
// nell'array `penalties` (quasi sempre vuoto, prima era l'unico campo letto).
// Il campo `position` del file è l'ordine DI PISTA: i secondi il gioco li
// aggiunge a classificazione fatta. Caso reale usato come fixture:
// Paul Ricard 17/10/26 — mauro P0 con +5.0s, gap su P1 di 0.285s → ufficialmente P6.
import test from 'node:test';
import assert from 'node:assert/strict';

const { classify, penaltyOf, officialPositionOf } = await import('../src/results.mjs');

const kis = (nome, cognome, extra = {}) => ({
  driver_id: 'k', is_current_driver: false, position: 0,
  driver_name: nome, driver_surname: cognome, driver_nation: 'ITA',
  team: null, car_brand: 'Alfa', car_name: 'Giulietta', car_number: 8,
  laps: 9, splits: [], best_lap: '01:23.456', has_best_lap: true,
  total_time: '23:31.571', diff_first: '', diff_previous: '', num_pits: 0,
  penalties: [], high_penalty: '', ballast: 0, restrictor: 0, ...extra,
});

const paulRicard = (mauroExtra = {}) => ({
  season: 'A', event: 'Campionato', session: 'Race', track: 'Paul Ricard', layout: '',
  weather_type: 'WeatherType_Clear', hour: 21, min: 19,
  drivers: [
    kis('mauro', 'turbigno', { total_time: '23:31.571', high_penalty: '+5.0s', ...mauroExtra }),
    kis('carlos', 'mendoza', { total_time: '23:31.856' }),
    kis('kurt', 'weidner', { total_time: '23:32.029' }),
    kis('henrik', 'jensen', { total_time: '23:34.220' }),
    kis('william', 'foster', { total_time: '23:34.656' }),
    kis('john', 'anderson', { total_time: '23:35.100' }),
    kis('marco', 'conti', { total_time: '23:40.354' }),
    kis('gabriel', 'torres', { total_time: '23:42.660' }),
  ].map((d, i) => ({ ...d, position: i })),
});

test('penaltyOf: legge i tre formati di high_penalty (+X.Xs, DT, DSQ) e ignora penaltà vuote', () => {
  assert.deepEqual(penaltyOf({ high_penalty: '+5.0s' }), { label: '+5.0s', kind: 'time', ms: 5000, dsq: false });
  assert.deepEqual(penaltyOf({ high_penalty: '+10.0s' }), { label: '+10.0s', kind: 'time', ms: 10000, dsq: false });
  assert.deepEqual(penaltyOf({ high_penalty: 'DT' }), { label: 'DT', kind: 'DT', ms: 0, dsq: false });
  assert.deepEqual(penaltyOf({ high_penalty: 'DSQ' }), { label: 'DSQ', kind: 'dsq', ms: 0, dsq: true });
  assert.deepEqual(penaltyOf({}), { label: null, kind: null, ms: 0, dsq: false });
});

test('vittoria con +5.0s: la posizione viene RIPREZZATA come fa il gioco (P0 di pista → P6 ufficiale)', () => {
  const result = paulRicard();
  const me = result.drivers[0];
  const info = classify(result, { driver: me });
  assert.equal(info.dnf, false);
  assert.equal(info.penalty, '+5.0s');
  assert.equal(info.rawPos, 1, 'nel file resta l\'ordine di pista');
  assert.equal(info.position, 6, '23:36.571 reale: davanti restano Mendoza, Weidner, Jensen, Foster, Anderson');
});

test('senza penalità nulla cambia: P di pista = P ufficiale', () => {
  const result = paulRicard({ high_penalty: '' });
  const info = classify(result, { driver: result.drivers[0] });
  assert.equal(info.position, 1);
  assert.equal(info.penalty, null);
  assert.equal(info.dnf, false);
});

test('squalifica (DSQ): è un ritiro, niente punti dalla posizione, segnalata dal flag', () => {
  // Red Bull Ring 17/04/26: la DSQ arrivava anche con giri a zero; qui si verifica
  // il caso peggiorre: DSQ CON giri e tempo (chi squalifica l'ultimo tagliato davanti)
  const result = paulRicard({ high_penalty: 'DSQ', total_time: '23:31.571' });
  const me = result.drivers[0];
  const info = classify(result, { driver: me });
  assert.equal(info.dsq, true);
  assert.equal(info.dnf, true, 'la DSQ vale come ritiro: niente punti né premio');
  assert.equal(info.penalty, 'DSQ');
  const off = officialPositionOf(result, me);
  assert.equal(off.position, null, 'dalla classifica ufficiale la DSQ esce');
});

test('drive-through (DT): il tempo perso è già nel giro, niente ricomposizione, ma resta VISIBILE', () => {
  const result = paulRicard({ high_penalty: 'DT' });
  const me = result.drivers[0];
  const info = classify(result, { driver: me });
  assert.equal(info.position, 1, 'l\'ordine di pista già contiene il DT');
  assert.equal(info.rawPos, 1);
  assert.equal(info.dnf, false);
  assert.equal(info.penalty, 'DT');
});

test('penalità anche per gli AVVERSARI: la classifica ufficiale scala tutti ugualmente', () => {
  const result = paulRicard();
  // Conti (P6 di pista, 23:40.354) prende +5s: 23:45.354 → finisce dietro Torres
  result.drivers[6].high_penalty = '+5.0s';
  assert.equal(officialPositionOf(result, result.drivers[6]).position, 8);
  assert.equal(officialPositionOf(result, result.drivers[7]).position, 7, 'Torres guadagna la posizione senza spostare un dito');
});

test('ritiro vero resta tale e non prende un posto ufficiale', () => {
  const result = paulRicard();
  const dnfDriver = kis('paolo', 'fabbri', { laps: 0, total_time: '', has_best_lap: false, best_lap: '' });
  dnfDriver.position = 8;
  result.drivers.push(dnfDriver);
  const off = officialPositionOf(result, dnfDriver);
  assert.equal(off.position, null);
  const info = classify(result, { driver: dnfDriver });
  assert.equal(info.dnf, true);
  assert.equal(info.position, 9);
});
