import "./_flows-sandbox.mjs"; // sandbox flussi
// meccanico.test.mjs — "il meccanico": consigli di setup per pista.
// Si verifica che il profilo di pista derivi la base giusta (Monza=power,
// piste dense=tecnica, metà=bilanciata) e che la telemetria CORREGGA
// (bumpstop alto, camber squilibrato, freni bollenti, pressioni off-target).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trackProfile, setupAdvice } from '../src/setup.mjs';

const monza = { name: 'Monza', lengthKm: 5.793, corners: 11 };         // 1.9 c/km → power
const rbb   = { name: 'Red Bull Ring', lengthKm: 4.318, corners: 10 }; // 2.3 → bilanciata?
const imola = { name: 'Imola', lengthKm: 4.909, corners: 19 };         // 3.9 → tecnica
const suzuka= { name: 'Suzuka', lengthKm: 5.807, corners: 18 };        // 3.1 → bilanciata

test('profilo pista: densità di curve decide il tipo', () => {
  assert.equal(trackProfile(monza).tipo, 'power');
  assert.equal(trackProfile(imola).tipo, 'tecnica');
  assert.equal(trackProfile(suzuka).tipo, 'bilanciata');
  // RBB: 10/4.318 = 2.32 → bilanciata (confinario power: la soglia è 2.2)
  assert.equal(trackProfile(rbb).tipo, 'bilanciata');
  assert.equal(trackProfile(null).tipo, 'sconosciuta');
});

test('base pista-solo: alettoni e cambio per tipo (senza telemetria)', () => {
  const m = setupAdvice(monza, null);
  assert.equal(m.tipo, 'power');
  const txt = m.consigli.map((c) => c.text).join(' ');
  assert.match(txt, /alettoni/i);
  assert.match(txt, /Cambio LUNGO/);
  // con pista-solo c'è il consiglio che la telemetria aggiunge lo strato 2
  assert.match(m.consigli.map((c) => c.vedi).join(' '), /telemetria/);

  const t = setupAdvice(imola, null);
  assert.match(t.consigli.map((c) => c.text).join(' '), /Cambio CORTO/);
});

const telemBase = () => ({
  bump: { LF: { contactPct: 0 }, RF: { contactPct: 0 }, LR: { contactPct: 0 }, RR: { contactPct: 0 } },
  camberProxy: { LF: 0.4, RF: -0.3 },   // dentro la finestra (soglia ±0.5)
  brakes: { LF: 300, RF: 300, LR: 220, RR: 220 },
  lastPressures: { LF: 27, RF: 27, RR: 27, LR: 27 },
});
// con l'auto nella scheda pista la classe gomme (target) è nota: GT3RS → slicks 27
const suzukaGt3 = { ...suzuka, car: 'Porsche 911 GT3 RS (992)' };

test('correzione telemetria: bumpstop alto → alza, camber squilibrato → rih', () => {
  // RBB non in TRACK_INFO nel fixture? Verifichiamo con info minime
  const bump = telemBase();
  bump.bump.LR = { contactPct: 1.4 };
  const m = setupAdvice(suzukaGt3, bump);
  const all = m.consigli.map((c) => `${c.vedi}|${c.text}`).join(' ');
  assert.match(all, /ALZA l'altezza/);
  // camber dentro la finestra: nessun consiglio correttivo (solo OK silenziosi)
  assert.doesNotMatch(all, /TOGLI camber|AGGIUNGI camber/);
});

test('correzione telemetria: esterno scotta → aggiungi camber; freni bollenti → messa in guardia', () => {
  const d = telemBase();
  d.camberProxy.RF = -1.2;          // esterno scotta
  d.brakes.LF = 640;                // bollenti
  const m = setupAdvice(suzukaGt3, d);
  const all = m.consigli.map((c) => `${c.vedi}|${c.text}`).join(' ');
  assert.match(all, /AGGIUNGI camber negativo/);
  assert.match(all, /picco 640/);
});

test('pressioni fuori target → rimando alla regola dei 4 PSI', () => {
  const d = telemBase();
  d.lastPressures.LF = 33; d.lastPressures.RR = 33;
  const m = setupAdvice(suzukaGt3, d);
  const all = m.consigli.map((c) => `${c.vedi}|${c.text}`).join(' ');
  // la GT3RS → classe slicks (target 27): 33 è fuori
  assert.match(all, /regola dei 4 PSI/);
  // dentro la finestra: niente rimando
  const d2 = telemBase();
  const m2 = setupAdvice(suzukaGt3, d2);
  assert.doesNotMatch(m2.consigli.map((c) => c.text).join(' '), /regola dei 4 PSI/);
});
