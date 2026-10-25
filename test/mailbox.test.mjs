import "./_flows-sandbox.mjs"; // sandbox flussi
// mailbox.test.mjs — la posta del pilota: UNA EMAIL = UNA DECISIONE.
// Il restyling 21/10/2026 (dopo la casella a 14 urgenti gemelle) impone:
//  - gare in ritardo: UNA sola email che le elenca tutte (non una per serie);
//  - gare a venire: UNA sola email "settimana in arrivo" per l'intero orizzonte;
//  - niente doppioni "DOMANI/TRA 2 GIORNI" per la stessa gara;
//  - urgente SOLO: ritardo, gara di OGGI, conflitto di calendario, cassa in
//    rosso, prima gara del settimanale a DOMANI;
//  - le serie non iscritte ("altrove") non generano posta di gare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailbox } from '../src/mailbox.mjs';
import { CADENZA_GIORNI } from '../src/agenda.mjs';

function fakeNode(nodeId, display, rounds = 4) {
  return {
    nodeId,
    display,
    level: 1,
    gridSize: 16,
    calendar: Array.from({ length: rounds }, (_, i) => ({ name: `R${i + 1}`, track: `track${i + 1}`, laps: 3, hour: 14, weather: 1 })),
    econ: { prize: 5000 },
    repRequired: 0,
  };
}

// Un ladder minimale con 3 serie iscritte (sedili) e campionati in corso.
function fakeLadder(nodes) {
  return { nodes, contentNames: { tracks: {} }, weatherNames: { 1: 'sereno' } };
}

function fakeState({ day, seats, done, money = 50000, rep = 100, results = {} }) {
  return {
    agenda: { day, startDate: 0 },
    seats,
    money,
    rep,
    season: 1,
    node: Object.keys(seats)[0] ?? 'a',
    bestFinish: {},
    results,
    messages: [],
  };
}

const TRACKS = { track1: 'BrandsHatch', track2: 'Monza', track3: 'Suzuka', track4: 'Donington' };
const ladderBase = () => fakeLadder([fakeNode('a', 'Serie A'), fakeNode('b', 'Serie B'), fakeNode('c', 'Serie C')]);
const seatsABC = { a: { day: 5, season: 1 }, b: { day: 5, season: 1 }, c: { day: 5, season: 1 } };

const findBy = (mails, re) => mails.filter((m) => re.test(m.oggetto));

test('nessun doppione: la stessa gara non compare in due email di promemoria', () => {
  const st = fakeState({ day: 4, seats: seatsABC });   // 1 giorno prima della cadenza 5
  const mails = mailbox(ladderBase(), st).mails;
  // le gare di A,B,C compaiono nell'ELenco della settimana: 3 righe, UNA email
  const sette = findBy(mails, /Questa settimana/);
  assert.equal(sette.length, 1, `una sola email settimanale, trovate ${sette.length}: ${sette.map((m) => m.oggetto)}`);
  assert.equal(sette[0].corpo.split('\n').filter((l) => l.includes(' R')).length, 3, 'una riga per serie iscritta');
  assert.equal(findBy(mails, /DOMANI: gara/).length, 0, 'i promemoria col nome gara da soli non esistono più');
  assert.equal(findBy(mails, /TRA 2 GIORNI/).length, 0, 'niente email TRA 2 GIORNI: dentro l\u2019orizzonte non duplica');
});

test('urgente solo a 1 giorno dalla prima gara, normale prima', () => {
  const corridoio = (d) => fakeState({ day: d, seats: { a: { day: 5, season: 1 } } });
  assert.equal(findBy(mailbox(ladderBase(), corridoio(4)).mails, /Questa settimana/)[0].priorita, 'urgente', 'a -1 la prima è urgente');
  assert.equal(findBy(mailbox(ladderBase(), corridoio(3)).mails, /Questa settimana/)[0].priorita, 'normale', 'a -2 è informazione, non allarme');
  assert.equal(findBy(mailbox(ladderBase(), corridoio(1)).mails, /Questa settimana/)[0].priorita, 'normale', 'a -4 è informazione');
});

test('ritardi: UNA sola email urgente che elenca tutte le serie in ritardo', () => {
  // cadenza 7 day 5: senza risultati le serie a/b/c hanno la R1 al giorno 5 → a day 12 = 7 giorni di ritardo l'una
  const mails = mailbox(ladderBase(), fakeState({ day: 12, seats: seatsABC })).mails;
  const r = findBy(mails, /IN RITARDO/);
  assert.equal(r.length, 1, `una sola email di ritardo, trovate ${r.length}`);
  // 3 bullet: una per serie iscritta in ritardo
  const underlineRiga = r[0].corpo.split('\n').filter((x) => x.startsWith('•'));
  assert.equal(underlineRiga.length, 3, 'un bullet per serie in ritardo, elencate in un\u2019unica mail');
  assert.equal(r[0].priorita, 'urgente');
  // le gare in ritardo NON finiscono nel settimanale
  const sette = findBy(mails, /Questa settimana/);
  assert.equal(sette.length, 0, 'il ritardo non è una gara a venire');
});

test('in ritardo di 1 giorno: la email di ritardo esiste ed è urgente', () => {
  const mails = mailbox(ladderBase(), fakeState({ day: 6, seats: seatsABC })).mails;
  const r = findBy(mails, /IN RITARDO/);
  assert.equal(r.length, 1);
  assert.equal(r[0].priorita, 'urgente');
});

test('senza ritardi e senza gare entro 7 giorni: nessuna email racing urgente', () => {
  const mails = mailbox(ladderBase(), fakeState({ day: 1, seats: seatsABC })).mails;
  const ur = mails.filter((m) => m.priorita === 'urgente');
  const racingUr = ur.filter((m) => m.kind === 'Racing');
  assert.equal(racingUr.length, 0, `email racing urgenti inattese: ${racingUr.map((x) => x.oggetto)}`);
});

test('le serie non iscritte non generano posta di gare (no spam \"altrove\")', () => {
  // sedile soolo A; B e C NON hanno sedile → gare "altrove" e nessuna Racing a più di 1 giorno dall'events
  const mails = mailbox(ladderBase(), fakeState({ day: 1, seats: { a: { day: 5, season: 1 } } })).mails;
  const racing = mails.filter((m) => m.kind === 'Racing');
  for (const m of racing) {
    assert.ok(!/Serie B|Serie C/.test(m.corpo + m.oggetto), `posta di una serie non iscritta: ${m.oggetto}`);
  }
});

test('riassunto: max 20 email totali e id sequenziali in caso (inbox digeribile)', () => {
  const mails = mailbox(ladderBase(), fakeState({ day: 12, seats: seatsABC })).mails;
  assert.ok(mails.length <= 20, `casella troppo lunga: ${mails.length} email`);
  for (const [i, m] of mails.entries()) assert.equal(m.id, `m${i + 1}`, 'id sequenziali stabili');
});
