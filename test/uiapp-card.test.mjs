// test/uiapp-card.test.mjs — LE CARD ARRICCHITE dei bottoni «Prepara e
// divertiti» (4/11, «prova in pista i bottoni» senza aprire il gioco):
// l'e2e in SANDBOX assembla la STESSA catena che gira sul PC reale —
//   INSTANT_RACE finto (encoder/decoder del progetto) → statoIstantanea
//   registro della durata (EVO_FLOWS_DIR isolato) → rigaRegistro
// → azioniPulsanti → la card del pannello in gioco.
// Niente file di gioco vero toccato: _game-sandbox manda GameModes in tmp
// (INSTANT_FILE = GameModeType_INSTANT_RACE.gamemodesave dentro la sandbox),
// _flows-sandbox manda gara-veloce.jsonl in tmp. Importarli come PRIME righe:
// i moduli dopo calcolano i percorsi dall'ambiente così sistemato.
import { GAME_SANDBOX } from './_game-sandbox.mjs';
import './_flows-sandbox.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';
import { REGISTRO_FILE } from '../tools/_gara-veloce.mjs';
import { azioniPulsanti } from '../src/uiapp-pub.mjs';

// ---- fixture: l'INSTANT_RACE del sandbox, con 5 giri e banda AI 88–93 ----
const instantFile = join(GAME_SANDBOX, 'GameModes', 'GameModeType_INSTANT_RACE.gamemodesave');
{
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(5) },          // f2: 5 giri
    { field: 3, wire: 0, varint: BigInt(2) },          // f3: a giri
    { field: 4, wire: 2, bytes: Buffer.from('0123456789abcd', 'utf8') },
    { field: 30, wire: 0, varint: BigInt(88) },        // f30: AI min
    { field: 31, wire: 0, varint: BigInt(93) },        // f31: AI max
    { field: 32, wire: 0, varint: BigInt(1) },         // f32: partenza da fermo
  ]);
  appendFileSync(instantFile, encodeMsg([{ field: 2, wire: 0, varint: BigInt(3) }, { field: 3, wire: 2, bytes: race }]));
}

/** Una riga del registro della durata, come la scrive registra() di garaVeloce. */
const scriviRegistro = (voci) => appendFileSync(REGISTRO_FILE, JSON.stringify({ at: new Date().toISOString(), ...voci }, 0, 0) + '\n');

const ladder = { nodes: [], contentNames: { cars: { r5_touring: 'R5 Touring' } } };

const EVENTO = {
  id: 'ev_card', kind: 'special-race', tier: 'finale',
  createdAt: new Date().toISOString(), season: 5, afterRound: 0,
  theme: { id: 'legend_finale', name: 'Il Gran Finale dei Campioni' },
  trackId: 'cota', trackDisplay: 'cota', weather: 0, laps: 10, hour: 17, timeScale: 1,
  guests: ['Hans Stuck'],
  prize: { carId: 'f40_leggenda', carName: 'F40 Leggenda', money: 21000, rep: 15, duplicateCash: false },
  deadlineRounds: 99,
  acceptedAt: new Date().toISOString(),
};
const statoEvento = () => ({ node: 'coppa_rx7', results: {}, events: { active: EVENTO, history: [], showCase: [], lastRoundChecked: null } });

// -------------------- CARD DEMO (gara al veloce) --------------------

test('card demo fresca: istantanea VERA (5 giri) e registro ancora vuoto (null)', () => {
  const state = { vetrinaCustom: { car: 'r5_touring', startedAt: Date.now() - 10_000 } };
  const card = azioniPulsanti(ladder, state).demo;
  assert.ok(card, 'la finestra demo è viva: la card esce');
  assert.equal(card.nome, 'R5 Touring');
  assert.equal(card.tipo, 'evento', 'la demo comanda SOLO il sedile (tipo evento)');
  assert.ok(card.id.startsWith('demo:'), 'id legato alla vetrina custom');
  assert.ok(card.scadeIn > 0 && card.scadeIn <= 24 * 3600 * 1000, 'finestra di 24h');
  assert.deepEqual(card.istantanea?.durata, { giri: 5 }, 'la durata letta dal FILE, non promessa');
  assert.equal(card.istantanea?.banda, '88–93', 'banda letta dal blocco Race');
  assert.equal(card.registro, null, 'registro mai scritto = riga null, niente reinvenzioni');
});

test('card demo dopo una scrittura vera: la riga del REGISTRO arriva alla card', () => {
  scriviRegistro({ giri: 5, aiMin: 88, aiMax: 93, pista: 'Monza', auto: 'r5_touring', pool: null });
  const state = { vetrinaCustom: { car: 'r5_touring', startedAt: Date.now() - 10_000 } };
  const card = azioniPulsanti(ladder, state).demo;
  assert.match(card.registro, /^5 giri · AI 88–93 · Monza · \d\d:\d\d$/,
    'l’ultima scrittura vera diventa una riga leggibile');
});

test('card demo: la scrittura a TEMPO nel registro esce in minuti', () => {
  scriviRegistro({ giri: null, tempo: 30, aiMin: 95, aiMax: 96, pista: null, auto: null, pool: null });
  const state = { vetrinaCustom: { car: 'r5_touring', startedAt: Date.now() - 10_000 } };
  const card = azioniPulsanti(ladder, state).demo;
  assert.match(card.registro, /^30 min a tempo · AI 95–96 · \d\d:\d\d$/, '30 minuti, non 30 giri');
});

// -------------------- CARD RONDA (serie) --------------------

// trackNames col NOME del libro (come lì lo scrive la prepara di gara vera):
// 'cota' lì è l'id grezzo della ladder che specFor non risolve (lezione 24/10).
const pendingFresco = (node = 'coppa_rx7', car = 'r5_touring') =>
  ({ car, node, trackNames: ['circuit_of_the_americas', 'circuit_of_the_americas'], startedAt: Date.now() - 60_000 });

test('card ronda con gli override dei cursori: porta la banda della serie', () => {
  const state = { pending: pendingFresco(), raceSettings: { coppa_rx7: { sliderMin: 89, sliderMax: 91 } } };
  const card = azioniPulsanti(ladder, state).ronda;
  assert.ok(card, 'ronda fresca: la card esce');
  assert.equal(card.tipo, 'setcar', 'la ronda porta la sequenza completa (tipo gara → pista → auto)');
  assert.equal(card.nome, 'R5 Touring');
  assert.equal(card.pista, 'Circuit Of The Americas', 'pista dal libro TRACK_INFO');
  assert.equal(card.banda, '89–91', 'la banda dagli override, la STESSA di raceCard');
});

test('card ronda senza override: banda null, mai una banda inventata', () => {
  const card = azioniPulsanti(ladder, { pending: { ...pendingFresco('serie_nuova') } }).ronda;
  assert.ok(card);
  assert.equal(card.banda, null, 'nessun raceSettings = nessuna banda dichiarata');
});

// -------------------- CARD EVENTO (premio) --------------------

test('card evento accettato: porta anche il PREMIO (auto + soldi del prize)', () => {
  const card = azioniPulsanti(ladder, statoEvento()).evento;
  assert.ok(card, 'evento attivo e accettato: la card esce');
  assert.equal(card.nome, 'F40 Leggenda', 'l’auto da mettere nel sedile resta quella');
  assert.equal(card.tema, 'Il Gran Finale dei Campioni');
  assert.equal(card.banda, '88–93', 'banda fissa degli eventi');
  assert.match(card.premio, /^F40 Leggenda \+ €21\.000$/, 'il premio in palio è leggibile in gioco');
});

test('card evento col premio senza soldi: solo l\'auto, mai «undefined»', () => {
  const senzaSoldi = statoEvento();
  senzaSoldi.events.active.prize = { carId: 'f40_leggenda', carName: 'F40 Leggenda', money: null, rep: 0 };
  const card = azioniPulsanti(ladder, senzaSoldi).evento;
  assert.ok(card);
  assert.equal(card.premio, 'F40 Leggenda', 'auto senza soldi = solo il nome, nessun «undefined»');
});

test('con la finestra demo viva la card evento RESTA NASCOSTA (mai due sedili)', () => {
  const state = { ...statoEvento(), vetrinaCustom: { car: 'r5_touring', startedAt: Date.now() - 10_000 } };
  const az = azioniPulsanti(ladder, state);
  assert.ok(az.demo, 'la demo comanda');
  assert.equal(az.evento, undefined, 'l’evento aspetta il suo turno');
});
