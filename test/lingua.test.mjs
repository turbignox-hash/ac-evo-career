// Lingua: le schede delle piste e i capitoli delle Memorie di famiglia sono
// bilingui per costruzione; qui si verifica che NESSUN elemento sia tornato
// solo-italiano (la GUI mostra l'inglese solo se il campo En c'è).

import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_INFO } from '../src/tracks.mjs';
import { MEM_TEMPLATES, RELATIONS, RELATIONS_EN, RANKS } from '../src/memories.mjs';
import { PIANI_EN, legacyMessageEn } from '../src/webui-views.mjs';
import { PIANI } from '../src/orario.mjs';
import { THEMES } from '../src/events.mjs';

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

test('THEMES: ogni evento speciale ha nameEn diversa dall’italiano', () => {
  assert.ok(THEMES.length >= 4, `solo ${THEMES.length} temi evento`);
  for (const t of THEMES) {
    assert.equal(typeof t.name, 'string', `name italiana manca su ${t.id}`);
    assert.equal(typeof t.nameEn, 'string', `nameEn manca su ${t.id}`);
    assert.notEqual(t.nameEn, t.name, `nameEn = name (traduzione mancante) su ${t.id}`);
  }
});

// I messaggi vecchi (in bacheca da save pre-bilingui) hanno formati fissi:
// legacyMessageEn li rigenera in inglese. Ogni formato noto DEVE tradurre.
test('legacyMessageEn: clausole sponsor e bollettini gara tradotti', () => {
  const IT_EN = [
    ['Contratto sponsor: prendi almeno il giro veloce nelle ultime 2 gare. Premio al rispetto: 500 €', 'Contract sponsor: get at least the fastest lap in the last 2 races. Reward for compliance: €500'],
    ['Iscrizione Trofeo Sostenibile round 1 (-250).', 'Entry fee Trofeo Sostenibile round 1 (-250).'],
    ['Stagione 3 in GT World chiusa in P2 con 84 punti.', 'Season 3 in GT World closed in P2 with 84 points.'],
    ['CAMPIONE di GT World (stagione 3)! Bonus titolo +2500.', 'CHAMPION of GT World (season 3)! Title bonus +2500.'],
    ['Formula Re · 2: ritiro · +0 premio (+0 sponsor) · +4 reputazione', 'Formula Re · 2: retired · +0 prize (+0 sponsor) · +4 reputation'],
    ['Monza · Gara di apertura: P1 · +500 premio (+250 sponsor) · +8 reputazione', 'Monza · Gara di apertura: P1 · +500 prize (+250 sponsor) · +8 reputation'],
    ['Monza · Gara di apertura: P1 +2.3" · giro veloce 1:23.456 · +500 premio (prova iconica) (+250 sponsor) · +8 reputazione', 'Monza · Gara di apertura: P1 +2.3" · fastest lap 1:23.456 · +500 prize (iconic race) (+250 sponsor) · +8 reputation'],
    ['Nuovo miglior giro personale a Suzuka: 02:17.976 (Porsche 911 GT3 RS (992)).', 'New personal best lap at Suzuka: 02:17.976 (Porsche 911 GT3 RS (992)).'],
    ['Missione sponsor centrata: podio entro il round 4 (+2400 da Officina Bruno).', 'Sponsor mission met: podium by round 4 (+2400 from Officina Bruno).'],
    ['Scelta la gara del giorno: Roadster Challenge R2 (Mount Panorama).', 'Picked today\'s race: Roadster Challenge R2 (Mount Panorama).'],
    ['Iscritto a Roadster Challenge: le sue gare partono sulla griglia del calendario da oggi.', 'Signed up for Roadster Challenge: its races start from today\'s calendar grid.'],
    ['Difficoltà AI impostata su "fixed" (valore 93).', 'AI difficulty set to "fixed" (value 93).'],
    ['Difficoltà EVO di Roadster Challenge impostata a consiglio automatico.', 'EVO difficulty of Roadster Challenge set to auto suggestion.'],
    ['Difficoltà regolata a mano: trim -6 su Roadster Challenge.', 'Difficulty set by hand: trim -6 on Roadster Challenge.'],
    ['Difficoltà di Roadster Challenge portata a trim -5 (P1 su 12 (atteso intorno a P6, scarto +5)): banda EVO ora 69–70%.', 'Difficulty of Roadster Challenge moved to trim -5 (P1 su 12 (atteso intorno a P6, scarto +5)): EVO band now 69–70%.'],
    ['Modalità test attiva: tutte le gare a 3 giri (richiesta Mauro 19/10). Riattiva con: node ac-evo-career.mjs test-mode --off', 'Test mode active: all races at 3 laps (richiesta Mauro 19/10). Restore with: node ac-evo-career.mjs test-mode --off'],
    ['Il Gran Finale dei Campioni: sei stato invitato a un evento speciale. Guarda il pannello Eventi nel Cruscotto.', 'Il Gran Finale dei Campioni: you have been invited to a special event. Check the Events panel on the Dashboard.'],
    ['Default difficoltà: AI 94-95% su tutte le serie (modalità fissa, interna 93). È il tuo livello di gara dopo le due P1 a Mount Panorama e Suzuka.', 'Default difficulty: AI 94-95% on all series (fixed mode, internal 93). It\'s your race level after due P1 a Mount Panorama e Suzuka.'],
    ['Carriera iniziata in Coppa 500. Soldi in tasca: 6000.', 'Career started in Coppa 500. Cash on hand: €6000.'],
  ];
  for (const [it, en] of IT_EN) assert.equal(legacyMessageEn(it), en, `traduzione EN mancante per: ${it}`);
});
