// test/uiapp-pub-paddock.test.mjs — LE FASCE RAPIDE DEL PADDOCK + IL
// KILL-SWITCH del meteo/ora al volo (1/11, dopo il crash 0xC0000005).
//
// A) il flood: l'app Paddock chiede una `ui-<fascia>.json` OGNI 500 ms, il
//    tick del Cruscotto gira a 2500 ms e il suo vecchio editor è smorto
//    (alle 02:46 l'ultimo head): nel log di EVO del 31/10 10.398 richieste
//    fallite a ~2 al secondo. La cura: fascePaddock scrive 5 fasce per tick
//    (copertura continua) riprendendo l'head già sul disco, e pota a 12.
// B) il kill-switch: AC_EVO_METEO_ORA_VOLO=0 esclude ora+meteo dal comando
//    ronda (i sospetti del crash), lasciando intatti auto, pista e id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';

import { comandoAuto, fascePaddock, voloMeteoOra } from '../src/uiapp-pub.mjs';

const mkLadder = () => ({ nodes: [], contentNames: { cars: { r5_touring: 'R5 Touring' } } });
const statoConRonda = (extra = {}) => ({
  pending: {
    car: 'r5_touring', trackNames: ['cota', 'cota'],
    hour: 17, weather: 'pioggia leggera', startedAt: Date.now() - 60_000,
  },
  ...extra,
});

/* --------- A. LE FASCE RAPIDE --------- */

test('fascePaddock: 5 teste consecutive che coprono i 500 ms, con slot e head ripreso', () => {
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-paddock-'));
  const dir = join(root, 'paddock');
  mkdirSync(dir, { recursive: true });
  // l'head VERO della sera (stesso formato del 02:46): puntatori statici
  writeFileSync(join(dir, 'ui-100.json'), JSON.stringify({
    v: 2, engine: 'Paddock 1.0.2', acks: {}, generatedAt: 50500,
    sections: { main: 'pd-main-aed3b3d8aea6.json', home: 'pd-home-5a3ed9d423bb.json' },
  }), 'utf8');
  const r = fascePaddock(dir, 1000);
  assert.equal(r.ok, true, 'le fasce escono scritte');
  assert.equal(r.file.length, 5, 'una fascia per 500 ms × 5 = copertura del tick intero');
  for (let i = 0; i < 5; i++) {
    const nome = join(dir, `ui-${1000 + i}.json`);
    const d = JSON.parse(readFileSync(nome, 'utf8'));
    assert.equal(d.slot, 1000 + i, 'la fascia porta il suo slot');
    assert.equal(d.sections.main, 'pd-main-aed3b3d8aea6.json', 'l\'head del disco (puntatori statici) resta nel canale');
    assert.ok(d.generatedAt > 0, 'fresco per la validità della fascia');
  }
  rmSync(root, { recursive: true, force: true });
});

test('fascePaddock senza head sul disco: head di accompagnamento, il canale resta vivo', () => {
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-paddock-'));
  const dir = join(root, 'paddock');
  mkdirSync(dir, { recursive: true });
  const r = fascePaddock(dir, 2000);
  assert.equal(r.ok, true);
  const d = JSON.parse(readFileSync(join(dir, 'ui-2000.json'), 'utf8'));
  assert.deepEqual(d.sections, {}, 'senza head non si inventano sezioni');
  assert.equal(d.v, 2);
  rmSync(root, { recursive: true, force: true });
});

test('fascePaddock pota: dopo molti tick restano al più 12 fasce', () => {
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-paddock-'));
  const dir = join(root, 'paddock');
  mkdirSync(dir, { recursive: true });
  for (let fascia = 0; fascia < 30; fascia += 5) fascePaddock(dir, fascia);
  const presenti = readdirSync(dir).filter((f) => /^ui-\d+\.json$/.test(f));
  assert.ok(presenti.length <= 12, `la potatura tiene al più 12 fasce (trovate ${presenti.length})`);
  // le più recenti sopravvivono: la copertura è sempre sugli ultimi slot
  const numeri = presenti.map((f) => Number(f.slice(3, -5))).sort((a, b) => a - b);
  assert.equal(numeri[numeri.length - 1], 29, 'la fascia più avanzata resta');
  rmSync(root, { recursive: true, force: true });
});

test('fascePaddock senz\'installazione: esce senza rompere il tick', () => {
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-paddock-'));
  const r = fascePaddock(join(root, 'che-non-c-esiste'), 1000);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'paddock non installato');
  rmSync(root, { recursive: true, force: true });
});

test('head smarrito: le sezioni si difificcano dalle pd-*.json sul disco (il Paddock torna vivo)', () => {
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-paddock-'));
  const dir = join(root, 'paddock');
  mkdirSync(dir, { recursive: true });
  // le sezioni statiche dell'install di oggi: file veri, head vero smarrito
  for (const f of ['pd-main-aed3b3d8aea6.json', 'pd-home-5a3ed9d423bb.json', 'pd-garage-2550759863da.json']) {
    writeFileSync(join(dir, f), '{"n":1}', 'utf8');
  }
  const r = fascePaddock(dir, 3000);
  const d = JSON.parse(readFileSync(join(dir, 'ui-3000.json'), 'utf8'));
  assert.equal(d.sections.main, 'pd-main-aed3b3d8aea6.json');
  assert.equal(d.sections.home, 'pd-home-5a3ed9d423bb.json');
  assert.equal(d.sections.garage, 'pd-garage-2550759863da.json');
  assert.equal(r.ok, true);
  rmSync(root, { recursive: true, force: true });
});

/* --------- B. IL KILL-SWITCH --------- */

test('ronda: ora e meteo AL VOLO nel comando (default acceso)', () => {
  const cmd = comandoAuto(mkLadder(), statoConRonda(), {});
  assert.equal(cmd?.tipo, 'setcar');
  assert.equal(cmd?.ora, 17);
  assert.equal(cmd?.meteo, 'LIGHT_RAIN');
  assert.equal(cmd?.carId, 'r5_touring');
});

test('kill-switch: AC_EVO_METEO_ORA_VOLO=0 esclude ora e meteo, il resto resta', () => {
  const cmd = comandoAuto(mkLadder(), statoConRonda(), { AC_EVO_METEO_ORA_VOLO: '0' });
  assert.equal(cmd?.ora, null, 'senza ora al volo');
  assert.equal(cmd?.meteo, null, 'senza meteo al volo');
  assert.equal(cmd?.carId, 'r5_touring', 'auto e id restano');
  const cmdVivo = comandoAuto(mkLadder(), statoConRonda(), {});
  assert.equal(cmd?.pista, cmdVivo?.pista, 'la pista resta la stessa del canale acceso');
});

test('voloMeteoOra: default acceso, 0 spento, altro valore ON', () => {
  assert.equal(voloMeteoOra({}), true);
  assert.equal(voloMeteoOra({ AC_EVO_METEO_ORA_VOLO: '0' }), false);
  assert.equal(voloMeteoOra({ AC_EVO_METEO_ORA_VOLO: '1' }), true);
});
