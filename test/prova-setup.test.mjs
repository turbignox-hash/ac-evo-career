// test/prova-setup.test.mjs — la prova A/B del setup scritto dal meccanico:
// si apre solo con un giro di riferimento, si chiude solo con una sessione
// NUOVA, e sotto la soglia il tempo non giudica (niente inseguimenti al rumore).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  campoDi, campiDi, chiudiConSessione, provaAperta, riepilogoPerCampo,
  leveBruciate, SOGLIA_S,
} from '../src/prova-setup.mjs';

test('campoDi: le righe del meccanico finiscono nel campo giusto', () => {
  assert.equal(campoDi('Pressione LF: 27→27.4 PSI'), 'pressioni');
  assert.equal(campoDi('Campanatura ant sx: -2.1°→-2.4°'), 'camber');
  assert.equal(campoDi('Altezza post: 60→62 mm'), 'altezza');
  assert.equal(campoDi('Ala post: 5→6'), 'aero');
  assert.equal(campoDi('Bias freni: 55→54%'), 'freni');
  assert.equal(campoDi('TC1: 3→4'), 'elettronica');
  assert.equal(campoDi('Molla ant sx: 260k→300k N/m'), 'molle');
  assert.equal(campoDi('riga senza senso'), 'altro');
});

test('campiDi: nessun doppione, ordine di arrivo', () => {
  assert.deepEqual(campiDi(['Pressione LF: 27→27.4 PSI', 'Pressione RF: 27→27.2 PSI', 'Ala post: 5→6']), ['pressioni', 'aero']);
  assert.deepEqual(campiDi([]), []);
  assert.deepEqual(campiDi(null), []);
});

const base = {
  car: 'Ferrari 296 GT3', track: 'Imola',
  baseFile: 'C:/x/base.carsetup', baseName: 'base',
  setupFile: 'C:/x/base — EVO-consigliato.carsetup', setupName: 'base — EVO-consigliato',
  campi: ['pressioni'], righe: ['Pressione LF: 27→27.4 PSI'],
  bestPrima: 101.0, sessFile: 'sess-1.ld',
  bestDopo: null, delta: null, esito: null, chiusoAt: null,
};

test('chiudiConSessione: la STESSA sessione non giudica (i giri sono ancora quelli)', () => {
  const { chiuse, prove } = chiudiConSessione([base], { car: base.car, track: base.track, bestDopo: 100.2, sessFile: 'sess-1.ld' });
  assert.equal(chiuse.length, 0);
  assert.equal(prove[0].esito, null);
});

test('chiudiConSessione: sessione nuova e più veloce oltre soglia → migliorato', () => {
  const { chiuse } = chiudiConSessione([base], { car: base.car, track: base.track, bestDopo: 100.6, sessFile: 'sess-2.ld' });
  assert.equal(chiuse.length, 1);
  assert.equal(chiuse[0].esito, 'migliorato');
  assert.equal(chiuse[0].delta, -0.4);
  assert.equal(chiuse[0].bestDopo, 100.6);
});

test('chiudiConSessione: più lento oltre soglia → peggiorato; dentro soglia → neutro', () => {
  const lento = chiudiConSessione([base], { car: base.car, track: base.track, bestDopo: 101.4, sessFile: 'sess-2.ld' }).chiuse[0];
  assert.equal(lento.esito, 'peggiorato');
  assert.equal(lento.delta, 0.4);
  const rumore = chiudiConSessione([base], { car: base.car, track: base.track, bestDopo: 101.0 + SOGLIA_S / 2, sessFile: 'sess-2.ld' }).chiuse[0];
  assert.equal(rumore.esito, 'neutro');
});

test('chiudiConSessione: un\'altra auto o pista non chiude questa prova', () => {
  const a = chiudiConSessione([base], { car: 'Alfa Romeo 75', track: base.track, bestDopo: 100.0, sessFile: 'sess-2.ld' });
  const b = chiudiConSessione([base], { car: base.car, track: 'Monza', bestDopo: 100.0, sessFile: 'sess-2.ld' });
  assert.equal(a.chiuse.length, 0);
  assert.equal(b.chiuse.length, 0);
});

test('chiudiConSessione: senza giro dopo non si chiude niente', () => {
  const { chiuse } = chiudiConSessione([base], { car: base.car, track: base.track, bestDopo: null, sessFile: 'sess-2.ld' });
  assert.equal(chiuse.length, 0);
  assert.equal(chiudiConSessione(null).chiuse.length, 0);
});

test('provaAperta: torna l\'ultima ancora in attesa della stessa auto+pista', () => {
  const chiusa = { ...base, esito: 'neutro', delta: 0.02, sessFile: 'sess-0.ld' };
  const p2 = { ...base, id: 'b', sessFile: 'sess-2.ld' };
  assert.equal(provaAperta([chiusa, base, p2], { car: base.car, track: base.track })?.id, 'b');
  assert.equal(provaAperta([chiusa], { car: base.car, track: base.track }), null);
  assert.equal(provaAperta([base], { car: 'Altra', track: base.track }), null);
});

test('riepilogoPerCampo e leveBruciate: conta le vittorie e le sconfitte per leva', () => {
  const prove = [
    { ...base, id: '1', esito: 'peggiorato', delta: 0.4, campi: ['camber'] },
    { ...base, id: '2', esito: 'peggiorato', delta: 0.3, campi: ['camber'] },
    { ...base, id: '3', esito: 'migliorato', delta: -0.4, campi: ['pressioni'] },
    { ...base, id: '4', esito: 'neutro', delta: 0.05, campi: ['ala'] },
    { ...base, id: '5', esito: null, delta: null, campi: ['molle'] },
  ];
  const r = riepilogoPerCampo(prove);
  assert.equal(r.camber.provate, 2);
  assert.equal(r.camber.perse, 2);
  assert.equal(r.pressioni.vinte, 1);
  assert.equal(r.ala, undefined, 'un esito neutro non entra nelle statistiche');
  assert.equal(r.molle, undefined, 'una prova aperta non giudica');
  assert.deepEqual(leveBruciate(prove), ['camber']);
});
