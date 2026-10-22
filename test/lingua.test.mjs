// Lingua: le schede delle piste e i capitoli delle Memorie di famiglia sono
// bilingui per costruzione; qui si verifica che NESSUN elemento sia tornato
// solo-italiano (la GUI mostra l'inglese solo se il campo En c'è).

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_INFO } from '../src/tracks.mjs';
import { MEM_TEMPLATES, RELATIONS, RELATIONS_EN, RANKS } from '../src/memories.mjs';
import { PIANI_EN } from '../src/webui-views.mjs';
import { PIANI } from '../src/orario.mjs';

test('TRACK_INFO: historyEn, nickEn e countryEn su ogni pista (per lo meno 15 piste)', () => {
  const ids = Object.keys(TRACK_INFO);
  assert.ok(ids.length >= 15, `solo ${ids.length} piste nel database`);
  for (const id of ids) {
    const t = TRACK_INFO[id];
    assert.equal(typeof t.history, 'string', `history italiana manca su ${id}`);
    assert.equal(typeof t.nick, 'string', `nick italiana manca su ${id}`);
    assert.equal(typeof t.historyEn, 'string', `historyEn manca su ${id}`);
    assert.ok(t.historyEn.length > 20, `historyEn troppo corta su ${id}`);
    assert.notEqual(t.historyEn, t.history, `historyEn = history (traduzione mancante) su ${id}`);
    assert.equal(typeof t.nickEn, 'string', `nickEn manca su ${id}`);
    // il nick può combaciare se l'originale è già inglese (es. "The Glen" di Watkins Glen):
    // l'uglianza è sospetta solo quando l'italiano porta segni distintivi (accenti)
    if (t.nickEn === t.nick) assert.ok(!/[àèéìòù]/i.test(t.nick), `nickEn = nick (traduzione mancante) su ${id}`);
    assert.equal(typeof t.countryEn, 'string', `countryEn manca su ${id}`);
  }
});

test('MEM_TEMPLATES: titolo, stemma e obiettivo in doppia lingua su ogni capitolo', () => {
  assert.ok(MEM_TEMPLATES.length >= 5, `solo ${MEM_TEMPLATES.length} capitoli`);
  for (const tpl of MEM_TEMPLATES) {
    assert.equal(typeof tpl.title, 'string', `title italiana manca su ${tpl.id}`);
    assert.equal(typeof tpl.crest, 'string', `crest italiana manca su ${tpl.id}`);
    assert.equal(typeof tpl.objective?.text, 'string', `objective.text manca su ${tpl.id}`);
    assert.equal(typeof tpl.titleEn, 'string', `titleEn manca su ${tpl.id}`);
    assert.notEqual(tpl.titleEn, tpl.title, `titleEn = title (traduzione mancante) su ${tpl.id}`);
    assert.equal(typeof tpl.crestEn, 'string', `crestEn manca su ${tpl.id}`);
    assert.notEqual(tpl.crestEn, tpl.crest, `crestEn = crest (traduzione mancante) su ${tpl.id}`);
    assert.equal(typeof tpl.objective.en, 'string', `objective.en manca su ${tpl.id}`);
    assert.notEqual(tpl.objective.en, tpl.objective.text, `objective.en = objective.text (traduzione mancante) su ${tpl.id}`);
  }
});

test('RELATIONS/RELATIONS_EN: stessa lunghezza, traduzioni diverse', () => {
  assert.equal(RELATIONS_EN.length, RELATIONS.length);
  for (let i = 0; i < RELATIONS.length; i++) {
    assert.notEqual(RELATIONS_EN[i], RELATIONS[i], `RELATIONS_EN[${i}] = RELATIONS[${i}] (traduzione mancante)`);
  }
});

test('RANKS: ogni grado ha labelEn diversa dall’italiano', () => {
  for (const r of RANKS) {
    assert.equal(typeof r.label, 'string', `label manca su ${r.min}`);
    assert.equal(typeof r.labelEn, 'string', `labelEn manca su ${r.min}`);
    assert.notEqual(r.labelEn, r.label, `labelEn = label (traduzione mancante) su ${r.min} ${r.label}`);
  }
});

test('PIANI_EN: una traduzione per ogni piano orario', () => {
  for (const id of Object.keys(PIANI)) {
    assert.equal(typeof PIANI_EN[id], 'string', `PIANI_EN non ha '${id}'`);
    assert.notEqual(PIANI_EN[id], PIANI[id].label, `PIANI_EN[${id}] = label italiana (traduzione mancante)`);
  }
  for (const id of Object.keys(PIANI_EN)) {
    assert.ok(PIANI[id], `PIANI_EN ha la chiave in piu' '${id}'`);
  }
});
