// test/allievo-correzioni.test.mjs — il PENTIMENTO del meccanico: quando
// una leva provata ha fatto perdere tempo, la scusa arriva UNA volta sola,
// col peggiore in testa, e NON duelle sui round pendenti o sul rumore.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computaCorrezioni, storiePerCampo } from '../src/allievo.mjs';

const roundPerso = {
  at: '2026-11-05T10:00:00.000Z', sessFile: 'a.ld',
  bestBefore: 101.0, bestAfter: 101.32, delta: 0.32,
  advice: [
    { campo: 'camber', prio: 2, text: 'Camber fronte…' },
    { campo: 'pressioni', prio: 3, text: 'Pressioni…' },
  ],
};
const roundBuono = {
  at: '2026-11-05T11:00:00.000Z', sessFile: 'b.ld',
  bestBefore: 101.32, bestAfter: 100.9, delta: -0.42,
  advice: [{ campo: 'aero', prio: 2, text: 'Aero…' }],
};
const roundNeutro = {
  at: '2026-11-05T12:00:00.000Z', sessFile: 'c.ld',
  bestBefore: 100.9, bestAfter: 101.0, delta: 0.1,
  advice: [{ campo: 'freni', prio: 2, text: 'Freni…' }],
};

test('computaCorrezioni: solo round in perdita, il peggiore in testa, max due', () => {
  const persoDue = { ...roundPerso, at: '2026-11-04T10:00:00.000Z', delta: 0.51 };
  const scuse = computaCorrezioni([roundPerso, roundBuono, roundNeutro, persoDue], { best: { lap: 100.9, at: '2026-11-05T11:00:00.000Z' } });
  // il peggiore (0.51) prima, poi l'altro; il neutro e il buono tacciono
  assert.equal(scuse.length, 2);
  assert.equal(scuse[0].round.delta, 0.51);
  assert.equal(scuse[1].round.delta, 0.32);
  assert.ok(scuse[0].text.includes('Ho sbagliato IO'));
  assert.ok(scuse[0].text.includes('0.51'));
  // la leva e l'indirizzo di ritorno si leggono nel testo
  assert.ok(scuse[0].text.includes('camber ⟶ pressioni') || scuse[0].text.includes('.carsetup'));
  assert.ok(scuse[0].text.includes('2026-11-05'));
});

test('computaCorrezioni: round già pentito non si ripete (idempotenza)', () => {
  const scuse1 = computaCorrezioni([roundPerso], { best: null });
  assert.equal(scuse1.length, 1);
  const scuse2 = computaCorrezioni([{ ...roundPerso, pentAt: '2026-11-05T10:05:00.000Z' }], { best: null });
  assert.equal(scuse2.length, 0);
});

test('computaCorrezioni: pendenti e rumore sotto la soglia tacciono', () => {
  const pendente = { ...roundPerso, bestAfter: null, delta: null };
  assert.equal(computaCorrezioni([pendente]).length, 0, 'un round pendente non chiama scuse');
  assert.equal(computaCorrezioni([roundNeutro]).length, 0);
  assert.equal(computaCorrezioni([]).length, 0);
  assert.equal(computaCorrezioni(null).length, 0);
});

test('computaCorrezioni: senza campi leggibili segnalati in tavola, niente scusa', () => {
  const persoSenzaCampi = { ...roundPerso, advice: [{ campo: '?', prio: 9, text: 'raggy' }] };
  assert.equal(computaCorrezioni([persoSenzaCampi]).length, 0);
});

test('computaCorrezioni: la voce porta il nome vero in tavola per il narratore', () => {
  const [scusa] = computaCorrezioni([roundPerso], { best: { lap: 100.9, at: '2026-11-05T11:00:00.000Z' } });
  assert.equal(scusa.vedi, 'memoria');
  assert.equal(scusa.prio, 1);
  assert.ok(scusa.text.includes('loading') === false); // niente stringhe inglesi
});

/* 5/11 sera, trovato dal vivo aprendo la scheda Setup: la storia dell'allievo
   si rompeva con «r.advices is not iterable» — i round sul disco portano la
   lista in `advice` (singolare, la scrive registraRound) e il lettore chiedeva
   `advices`. Il pannello del meccanico (dialogo compreso) non si disegnava. */
test('storiePerCampo: la chiave vera `advice` è letta, il round senza lista non ferma gli altri', () => {
  const storie = storiePerCampo([
    { delta: 0.3, advice: [{ campo: 'camber', text: 'Camber fronte…' }] },
    { delta: -0.2, advice: [{ campo: 'aero', text: 'Aero…' }] },
    { delta: 0.1 },                                   // round senza lista: si salta, non scoppia
    { delta: null, advice: [{ campo: 'freni', text: 'pendente' }] },  // pendente: non giudica
  ]);
  assert.deepEqual(Object.keys(storie).sort(), ['aero', 'camber']);
  assert.equal(storie.camber.provati, 1);
  assert.equal(storie.camber.persi, 1);
  assert.equal(storie.aero.guadagnati, 1);
  assert.equal(storie.aero.ultimoText, 'Aero…');
});
