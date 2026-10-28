// 2/11 — L'IDENTITÀ DEL PILOTA è il punto più delicato della suite: decide chi
// sei nei risultati (archivio, import, libro rivali) e finora NON aveva test
// unit propri: solo copertura indiretta. Qui il contratto completo di
// findPlayerDriver (results.mjs): la bandierina, il riconoscimento per nome,
// l'esclusione AI — e il regresso del bug trovato da archivio-online.test
// (il nickname SENZA cognome «TOINE» che attaccava qualunque ricerca per via
// di 'turbigno'.startsWith('') === true).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlayerDriver, dedupeDriverDiRiga, penaltyOf, officialPositionOf } from '../src/results.mjs';

const ME = { name: 'Mauro Turbigno', first: 'Mauro', last: 'Turbigno' };
const p = (nome, cognome, opts = {}) => ({ driver_name: nome, driver_surname: cognome, position: opts.pos ?? 1, ...opts });

test('la bandierina del gioco vale quando parla SOLO di te', () => {
  const r = { drivers: [p('Mauro', 'Turbigno', { is_current_driver: true, pos: 3 }), p('Luca', 'Bianchi')] };
  const f = findPlayerDriver(r, ME);
  assert.equal(f.driver?.driver_name, 'Mauro');
  assert.equal(f.how, 'flag del gioco');
});

test('flag su TUTTI («tutti te» delle qualifiche): il primo della griglia non vince, decide il nome', () => {
  const r = { drivers: [
    p('TOINE', '', { is_current_driver: true, pos: 0 }),
    p('Mauro', 'Turbigno', { is_current_driver: true }),
    p('Luca', 'Bianchi', { is_current_driver: true }),
  ] };
  const f = findPlayerDriver(r, ME);
  assert.equal(f.driver?.driver_name, 'Mauro', 'la tua riga, NON la prima della griglia');
  assert.equal(f.how, 'nome pilota (il flag del gioco era generico)');
});

test('REGRESSO 2/11: un nickname senza cognome NON attacca il cognome cercato', () => {
  // prima del fix: 'turbigno'.startsWith('') = true → la riga vuota matchava
  // prima del tuo vero cognome e «tu» diventavi il capogriglia avversario.
  const r = { drivers: [
    p('TOINE', '', { is_current_driver: true }),
    p('Mauro', 'Turbigno', { is_current_driver: true }),
    p('Luca', 'Bianchi', { is_current_driver: true }),
  ] };
  const f = findPlayerDriver(r, ME);
  assert.equal(f.driver?.driver_name, 'Mauro');
  assert.equal(f.driver?.driver_surname, 'Turbigno');
});

test('accenti e maiuscole si pareggiano (José María vs jose maria)', () => {
  const r = { drivers: [p('luca', 'Bianchi'), p('Jose', 'Maria')] };
  const f = findPlayerDriver(r, { name: 'José María', first: 'José', last: 'María' });
  assert.equal(f.driver?.driver_name, 'Jose');
});

test('nome di una parola sola (nessun cognome): matcha il tuo nome di battesimo', () => {
  const r = { drivers: [p('Luca', 'Bianchi'), p('Mauro', 'Turbigno')] };
  const f = findPlayerDriver(r, { name: 'Mauro', first: 'Mauro', last: '' });
  assert.equal(f.driver?.driver_name, 'Mauro');
  assert.equal(f.how, 'nome pilota');
});

test('le righe AI (• contrassegnate) non prendono il tuo posto', () => {
  const r = { drivers: [
    p('• Rival One', '', { pos: 1 }),
    p('Mauro', 'Turbigno', { pos: 4 }),
  ] };
  const f = findPlayerDriver(r, ME);
  assert.equal(f.driver?.driver_name, 'Mauro');
});

test('senza te in griglia: driver null e il pool dei candidati a chi guarda', () => {
  const r = { drivers: [p('Luca', 'Bianchi'), p('Paolo', 'Verdi')] };
  const f = findPlayerDriver(r, ME);
  assert.equal(f.driver, null);
  assert.equal(f.how, null);
  assert.ok(Array.isArray(f.candidates), 'il pool dei non-AI resta per la scelta manuale');
});

test('righe duplicate dai server: dedupeDriverDiRiga tiene UNA riga per identità (driver_id, poi nome)', () => {
  const id = { a: 'r9', b: 'k' };
  const r = { drivers: [
    p('TOINE', '', { pos: 0, driver_id: id, is_current_driver: true }),
    p('Antoine', 'Laisne', { pos: 1, driver_id: id, is_current_driver: true }),
    p('luca', 'bianchi', { pos: 2 }),
    p('Luca', 'Bianchi', { pos: 3 }),
  ] };
  const clean = dedupeDriverDiRiga(r);
  assert.equal(clean.drivers.length, 2, 'r9×2 e Luca Bianchi×2 = 2 sole righe');
  assert.equal(clean._driverDuplicati, 2);
  // la riga tenuta per un\'identità è la MIGLIORE in classifica (prima per posizione)
  const tenuta = clean.drivers.find((d) => d.driver_id === id);
  assert.equal(tenuta?.position, 0);
  assert.equal(tenuta?.driver_name, 'TOINE');
  // un file già pulito esce INTOCCATO: nessun flag, stesso riferimento
  const pulito = { drivers: [p('A', 'B', { pos: 1 })] };
  assert.equal(dedupeDriverDiRiga(pulito), pulito);
});

test('penaltyOf: la penalità vera vive nel campo high_penalty, non nell\'array penalties', () => {
  assert.deepEqual(penaltyOf({ driver_name: 'A', driver_surname: 'B', high_penalty: '+5.0s' }), { label: '+5.0s', kind: 'time', ms: 5000, dsq: false });
  assert.equal(penaltyOf({ driver_name: 'A', driver_surname: 'B', high_penalty: 'DSQ' }).dsq, true);
  assert.equal(penaltyOf({ driver_name: 'A', driver_surname: 'B', high_penalty: 'DT' }).kind, 'DT');
  assert.equal(penaltyOf({ driver_name: 'A', driver_surname: 'B' }).label ?? null, null, 'niente penalità: label null, non 0 né \'\'');
});

test('officialPositionOf: la penalità a tempo RIORDINA (pista ordine ≠ classifica ufficiale)', () => {
  // chi ha tagliato il traguardo secondo MA con +3s finisce TERZO: il corrected
  // time (15:04 + 3 = 15:07) resta davanti a 15:10, quindi serve una penalità che
  // lo scavalchi davvero: +8s → 15:12, dietro al 15:10 del terzo pulito.
  const r = { drivers: [
    { driver_name: 'Vincitore', driver_surname: 'Pulito', position: 0, laps: 10, total_time: '15:00.000' },
    { driver_name: 'Secondo', driver_surname: 'Punito', position: 1, laps: 10, total_time: '15:04.000', high_penalty: '+8.0s' },
    { driver_name: 'Terzo', driver_surname: 'Pulito', position: 2, laps: 10, total_time: '15:10.000' },
  ] };
  assert.equal(officialPositionOf(r, r.drivers[1]).position, 3, 'il +8s (15:12) lo manda dietro al 15:10 del terzo');
  assert.equal(officialPositionOf(r, r.drivers[2]).position, 2);
  assert.equal(officialPositionOf(r, r.drivers[0]).position, 1);
  // DSQ: fuori dal conto, nessuna posizione ufficiale
  const dsq = officialPositionOf({ drivers: [ ...r.drivers, { driver_name: 'Quarto', driver_surname: 'Squalificato', position: 3, laps: 10, total_time: '15:20.000', high_penalty: 'DSQ' } ] }, { driver_name: 'Quarto', driver_surname: 'Squalificato', position: 3, laps: 10, total_time: '15:20.000', high_penalty: 'DSQ' });
  assert.equal(dsq.position, null);
  assert.equal(dsq.dsq, true);
});
