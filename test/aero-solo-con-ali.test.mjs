// test/aero-solo-con-ali.test.mjs — L'ALA SOLO A CHI CE L'HA (7/11).
//
// Richiesta di Mauro: «per le auto che lo possiedono» il consiglio aero di
// Brands Hatch («ala a metà carica»). Il carattere della pista (12 curve in
// 3.916 km → BILANCIATO) non dice se l'auto ha un'ala: nel .carsetup la sezione
// aero (root.6) c'è su TUTTE, ma wingFront/wingRear hanno un numero solo su GT
// e race. Sul Golf 8 GTI Clubsport (i valori veri del disco di Mauro) sono
// vuoti: il consiglio si tace, e non resta un «carica gli alettoni» da leggere
// su una macchina che di alettoni non ne ha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { haAlettoni, autoConAli } from '../src/carsetup.mjs';
import { setupAdvice } from '../src/setup.mjs';
import { TRACK_INFO } from '../src/tracks.mjs';
import { encodeMsg } from '../src/evo-grid.mjs';

const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };
/** un .carsetup minimo ma VERO: solo la sezione aero (root.6) */
const setup = (aero) => Buffer.from(encodeMsg([{
  field: 6, wire: 2,
  bytes: Buffer.from(encodeMsg(Object.entries(aero).map(([fld, v]) => ({ field: Number(fld), wire: 5, bytes: f32(v) })))),
}]));
// numeri presi dai file veri: Golf 8 GTI Clubsport (senza ali) e 296 GT3 / MX-5 Cup
const golf = { 2: 122, 3: 125 };
const gt3 = { 2: 58, 3: 58, 5: 10 };
const mx5 = { 2: 112, 3: 111, 4: 1 };

test('haAlettoni: le ali sono wingFront/wingRear, non le altezze da terra', () => {
  assert.equal(haAlettoni({ aero: { heightFront: 122, heightRear: 125, wingFront: null, wingRear: null } }), false, 'Golf 8 GTI: altezze sì, ali no');
  assert.equal(haAlettoni({ aero: { heightFront: 58, heightRear: 58, wingFront: null, wingRear: 10 } }), true, '296 GT3: ala posteriore');
  assert.equal(haAlettoni({ aero: { heightFront: 112, heightRear: 111, wingFront: 1, wingRear: null } }), true, 'MX-5 Cup: ala anteriore');
  assert.equal(haAlettoni({ aero: null }), false, 'auto senza sezione aero');
  assert.equal(haAlettoni(null), false);
});

test('Brands Hatch è il tracciato bilanciato della richiesta (12 curve · 3.916 km)', () => {
  const b = TRACK_INFO.brands_hatch;
  assert.equal(b.corners, 12);
  assert.equal(b.lengthKm, 3.916);
  assert.equal(setupAdvice({ ...b, ali: true }, null).tipo, 'bilanciata');
});

test('Brands Hatch: «ala a metà carica» per le auto che hanno le ali', () => {
  const adv = setupAdvice({ ...TRACK_INFO.brands_hatch, ali: true }, null);
  const txt = adv.consigli.map((c) => c.text).join(' | ');
  assert.match(txt, /Brands Hatch\*\* \(12 curve in 3\.916 km · tracciato BILANCIATO\)/);
  assert.match(txt, /ala a metà carica — il compromesso giusto fra i tratti veloci e le curve medi-lente/);
});

test('Brands Hatch: senza ali il consiglio aero non esce (né «ala» né «alettone»)', () => {
  for (const ali of [false, null, undefined]) {
    const txt = setupAdvice({ ...TRACK_INFO.brands_hatch, ali, car: 'Volkswagen Golf 8 GTI Clubsport' }, null)
      .consigli.map((c) => c.text).join(' | ');
    assert.doesNotMatch(txt, /ala|alett/i, `ali=${ali}: niente ala su un'auto senza ali`);
    assert.equal(setupAdvice({ ...TRACK_INFO.brands_hatch, ali }, null).consigli.some((c) => c.vedi === 'aero'), false);
  }
});

test('anche power e tecnico tacciono l’ala: il cambio resta per tutti', () => {
  const monza = { ...TRACK_INFO.monza, ali: false };
  const imola = { ...TRACK_INFO.imola, ali: false };
  assert.doesNotMatch(setupAdvice(monza, null).consigli.map((c) => c.text).join(' '), /alett/i);
  assert.match(setupAdvice(monza, null).consigli.map((c) => c.text).join(' '), /Cambio LUNGO/, 'la trasmissione non dipende dalle ali');
  assert.doesNotMatch(setupAdvice(imola, null).consigli.map((c) => c.text).join(' '), /alett/i);
  assert.match(setupAdvice(imola, null).consigli.map((c) => c.text).join(' '), /Cambio CORTO/);
});

/* --- il fatto «ali» si legge dal disco, non si inventa --- */

function sandbox(files) {
  const saved = mkdtempSync(join(tmpdir(), 'ali-'));
  for (const { car, track, name, buf, ms } of files) {
    const dir = join(saved, 'Car Setups', car, track);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.carsetup`);
    writeFileSync(file, buf);
    if (ms) utimesSync(file, new Date(ms), new Date(ms));
  }
  return saved;
}

test('autoConAli: true/false dai file, null senza setup salvati', () => {
  const saved = sandbox([
    { car: 'Volkswagen Golf 8 GTI Clubsport', track: 'Brands Hatch GP', name: 'Gara', buf: setup(golf) },
    { car: 'Ferrari 296 GT3', track: 'Imola', name: 'Gara', buf: setup(gt3) },
  ]);
  assert.equal(autoConAli(saved, 'Volkswagen Golf 8 GTI Clubsport'), false);
  assert.equal(autoConAli(saved, 'Ferrari 296 GT3'), true);
  assert.equal(autoConAli(saved, 'Abarth 695 Biposto'), null, 'senza setup: non lo so (non «non ce le ha»)');
  assert.equal(autoConAli(saved, ''), null);
});

test('autoConAli: conta il .carsetup PIÙ RECENTE, e sopporta maiuscole/barre', () => {
  const saved = sandbox([
    { car: 'Mazda MX-5 ND Cup', track: 'Brands Hatch GP', name: 'vecchio', buf: setup(golf), ms: Date.now() - 60000 },
    { car: 'Mazda MX-5 ND Cup', track: 'Imola', name: 'nuovo', buf: setup(mx5), ms: Date.now() },
  ]);
  assert.equal(autoConAli(saved, 'Mazda MX-5 ND Cup'), true, 'l’ultimo file è la firma attuale del setup');
  assert.equal(autoConAli(saved, 'mazda mx-5 nd cup'), true, 'il nome cartella non deve essere digitato alla lettera');
});
