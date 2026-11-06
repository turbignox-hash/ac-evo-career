// test/meccanico-novita.test.mjs — «cosa è cambiato dall'ultima visita».
//
// Segnalazione di Mauro (6/11 notte): «quando rientro dal meccanico non capisco
// se ha consigli o migliorie da aggiungere, vedo la solita scheda della prima
// visita». La scheda è calcolata dai dati: se i dati non cambiano il testo è
// identico, e senza un confronto «stessa scheda» e «scheda aggiornata» sono
// indistinguibili. Qui si pesa il confronto — e il silenzio quando non c'è
// niente di nuovo (niente avvisi inventati).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firmaMeccanico, novitaDa, chiaveMeccanico } from '../src/meccanico-novita.mjs';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = readFileSync(join(QUI, 'src', 'webui.mjs'), 'utf8');
const GUI = readFileSync(join(QUI, 'gui', 'js', 'viste-c.js'), 'utf8');

const firma = (over = {}) => firmaMeccanico({
  consigli: [{ text: 'Pressioni: parti da 31 psi (bersaglio 31 a caldo).' }, { text: 'Ala post: metà carica.' }],
  bestLap: 106.4,
  sessFile: 'sess-1.ld',
  prova: null,
  allievo: null,
  ...over,
});

test('chiaveMeccanico: stessa chiave per le due grafie (spazi e maiuscole)', () => {
  assert.equal(chiaveMeccanico(' Golf 8 ', 'Brands Hatch'), chiaveMeccanico('golf 8', 'brands hatch'));
  assert.notEqual(chiaveMeccanico('Golf 8', 'Brands Hatch'), chiaveMeccanico('Golf 8', 'Imola'));
});

test('prima visita: lo dice, non finge novità', () => {
  const n = novitaDa(null, firma());
  assert.equal(n.length, 1);
  assert.match(n[0].text, /Prima visita/);
});

test('niente di nuovo: nessuna riga (la scheda è la stessa di ieri)', () => {
  const a = firma();
  const b = firmaMeccanico({ consigli: [{ text: a.consigli[0] }, { text: a.consigli[1] }], bestLap: a.bestLap, sessFile: a.sessFile });
  assert.deepEqual(novitaDa(a, b), []);
});

test('uscita nuova: lo dice col giro migliore', () => {
  const n = novitaDa(firma(), firma({ sessFile: 'sess-2.ld', bestLap: 105.2 }));
  assert.ok(n.some((x) => x.chi === 'uscita' && /giro migliore 1:45\.20/.test(x.text)), JSON.stringify(n));
});

test('giro migliore migliorato: da → a con il guadagno', () => {
  const n = novitaDa(firma(), firma({ bestLap: 105.1 }));
  const g = n.find((x) => x.chi === 'giro');
  assert.ok(g, JSON.stringify(n));
  assert.match(g.text, /da 1:46.40 a 1:45.10/);
  assert.match(g.text, /−1\.3 s/);
});

test('prova chiusa: è la notizia più importante del rientro', () => {
  const chiusa = { at: '2026-11-06T22:10:00.000Z', esito: 'migliorato', delta: -0.42, campi: ['pressioni'] };
  const n = novitaDa(firma(), firma({ prova: { aperta: null, chiuse: [chiusa] } }));
  assert.ok(n.some((x) => x.chi === 'prova' && /pressioni: migliorato di 0\.42 s/.test(x.text)), JSON.stringify(n));
});

test('la stessa prova chiusa non torna a galla alla visita dopo', () => {
  const chiusa = { at: '2026-11-06T22:10:00.000Z', esito: 'peggiorato', delta: 0.3, campi: ['camber'] };
  const visto = firma({ prova: { aperta: null, chiuse: [chiusa] } });
  const ora = firma({ prova: { aperta: null, chiuse: [chiusa] } });
  assert.equal(novitaDa(visto, ora).filter((x) => x.chi === 'prova').length, 0);
});

test('prova in corso nuova: dice quale carta caricare', () => {
  const n = novitaDa(firma(), firma({ prova: { aperta: { setupName: 'Golf - Gara 3 giri', campi: ['pressioni'], bestPrima: 106.4 }, chiuse: [] } }));
  assert.ok(n.some((x) => x.chi === 'prova-aperta' && /Golf - Gara 3 giri/.test(x.text)), JSON.stringify(n));
});

test('consiglio nuovo: si nomina il primo, senza muri di testo', () => {
  const lungo = `Camber anteriore: ${'x'.repeat(200)}`;
  const n = novitaDa(firma(), firma({ consigli: [{ text: 'Pressioni: parti da 31 psi (bersaglio 31 a caldo).' }, { text: 'Ala post: metà carica.' }, { text: lungo }] }));
  const c = n.find((x) => x.chi === 'consigli');
  assert.ok(c, JSON.stringify(n));
  assert.match(c.text, /^Consiglio nuovo: Camber/);
  assert.ok(c.text.length <= 120, 'la riga resta leggibile');
});

test('al massimo `max` righe: il pannello non diventa un muro', () => {
  const chiusa = (i) => ({ at: `2026-11-06T22:0${i}:00.000Z`, esito: 'migliorato', delta: -0.2, campi: ['pressioni'] });
  const n = novitaDa(firma(), firma({
    sessFile: 'sess-9.ld', bestLap: 100,
    prova: { aperta: { setupName: 'X', campi: ['aero'], bestPrima: 110 }, chiuse: [chiusa(1), chiusa(2), chiusa(3)] },
    consigli: [{ text: 'nuovo uno' }, { text: 'nuovo due' }],
  }), { max: 3 });
  assert.equal(n.length, 3);
});

/* --- il collegamento nella rotta e nella scheda --- */

test('webui: il pannello manda le novità e «Ho visto» le archivia', () => {
  assert.match(SERVER, /novita = novitaDa\(visto, firma\)/);
  assert.match(SERVER, /novita, vistoAt,/);
  assert.match(SERVER, /body\.action === 'meccanico-visto'/);
  assert.match(SERVER, /salvaVisto\(body\.car, body\.track, firma\)/);
});

test('viste-c: le novità stanno SOPRA i consigli, col pulsante «Ho visto»', () => {
  const banner = GUI.indexOf('const novitaHtml');
  const riga = GUI.match(/\$\{novitaHtml\}\$\{memoHtml\}/);
  const consigli = GUI.indexOf('{rows ||');
  assert.ok(banner > 0 && riga, 'il banner deve esistere ed entrare nella scheda');
  assert.ok(riga.index < consigli, 'le novità vanno PRIMA dei consigli: è la prima cosa da leggere');
  assert.match(GUI, /id=\\?"b-mech-visto\\?"/);
  assert.match(GUI, /action: 'meccanico-visto'/);
});
