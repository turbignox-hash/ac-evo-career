// _ripara-sonda.mjs — RESTAURATO DEL SALVATAGGIO colpito dalla sonda API del 31/10
// (tmp/_colpo-api.mjs: ha spingiuto CHGITTO senza dossier necessari, con carriera reale
// perché ACE_DATA non isola la carriera). One-shot: NON è destinato a girare di nuovo;
// tutte le operazioni sono IDEMPOTENTI e verificano le precondizioni prima di scrivere.
//
// COSA FA (pre-state fotografato alle ~11:56, ricavato dai messaggi di ieri sera e
// dall'andamento deterministico del vitto sponsor):
//   1. paidEntries['entry:campionato_epoca:12:2'] è stata scritta dalla sonda (message +ifacts
//      +545 chargeEntry alle 11:56:59.928Z) → si cancella e si rconuturano i +450.
//   2. life.challenge.accepted era probabilmente false: la sonda lo messe a true
//      (challenge-accept senza il verdetto successor). Lo riporta a false.
//   3. life.sponsor fu rittasato NELL'ordine: sponsor-accept (12:02+X) poi sponsor-decline.
//      Il contratto a Mauro (firmato a 00:14, message wallet!) è: Caffè Pole Position tier 3,
//      500 €/gara, bonus 2400 € entro il round 4 → deadlineRound 0-based = 3, takenSeason 12,
//      roundsPaid 0. Deterministico dalla stagione — il messaggio lo bona.
//   4. state.node/round era campionato_epoca / 2 (la deterministica della sonda ha cambiato
//      nodo a roadster_classic/0 alla 12:02:16, con messaggio e recordChoice).
//   5. messages: 3 messaggi è storicamente probe (11:56:59, 11:57:11, 12:02:16).
//   6. flows.jsonl: rimossa la stessa riga entry -450 di quell'11:56:59.928Z.
// Non tocca: seats, raceSettings (probe-body vuoto → nessuna scrittura), pendingSettings,
//              pending.startedAt/avviaFino (recette da markPending della sonda ma coerenti).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SAVE = 'data/evo-career.save.json';
const FLOWS = 'data/flows.jsonl';
const TAG = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const BAK_DIR = 'data/bak';
mkdirSync(BAK_DIR, { recursive: true });

// ---- backup preliminare -------------------------------------------------
const bakSave = join(BAK_DIR, `evo-career.save.pre-ripara-sonda-${TAG}.json`);
const bakFlows = join(BAK_DIR, `flows.pre-ripara-sonda-${TAG}.jsonl`);
if (!existsSync(bakSave)) writeFileSync(bakSave, readFileSync(SAVE));
if (existsSync(FLOWS) && !existsSync(bakFlows)) writeFileSync(bakFlows, readFileSync(FLOWS, 'utf8'));
console.log('backup:', bakSave, existsSync(bakFlows) ? bakFlows : '');

const s = JSON.parse(readFileSync(SAVE, 'utf8'));
const before = { money: s.money, node: s.node, round: s.round };
const fatto = [];
const skip = [];

// 1. paidEntries + rimborso 450 -----------------------------------------
const KEY = 'entry:campionato_epoca:12:2';
if (s.paidEntries?.[KEY]) {
  delete s.paidEntries[KEY];
  s.money = Number(s.money) + 450;
  fatto.push(`paidEntries['${KEY}'] cancellata, money ${before.money}→${s.money} (+450)`);
} else skip.push('paidEntries key già assente');

// 2. challenge.accepted → false ------------------------------------------
if (s.life?.challenge) {
  if (s.life.challenge.accepted === true) { s.life.challenge.accepted = false; fatto.push('challenge.accepted true→false'); }
  else skip.push('challenge.accepted già ' + JSON.stringify(s.life.challenge.accepted));
}

// 3. restore sponsor (contratto firmato ieri 00:14) -----------------------
const SPONSOR = { name: 'Caffè Pole Position (tier 3)', tier: 3, perRace: 500, bonus: 2400, deadlineRound: 3, takenSeason: 12, roundsPaid: 0 };
if (!s.life.sponsor || s.life.sponsor.name !== SPONSOR.name || s.life.sponsor.takenSeason !== 12) {
  s.life.sponsor = SPONSOR;
  fatto.push('life.sponsor restaurato (Caffè Pole Position tier 3, perRace 500, bonus 2400, deadlineRound 3)');
} else skip.push('sponsor già presente');

// 4. node/round del nodo giusto ------------------------------------------
if (s.node !== 'campionato_epoca') { s.node = 'campionato_epoca'; s.round = 2; fatto.push(`state.node ${before.node}/${before.round}→campionato_epoca/2`); }
else skip.push('node già campionato_epoca');

// 5. choices di oggi: via roadster_classic --------------------------------
if (s.agenda?.choices?.['203']?.includes('roadster_classic')) {
  s.agenda.choices['203'] = s.agenda.choices['203'].filter((x) => x !== 'roadster_classic');
  fatto.push("agenda.choices['203'] roadster_classic eliminato");
} else skip.push("choices['203'] senza roadster_classic");

// 6. messaggi probe via ---------------------------------------------------
const AUDIT = [
  { at: '2026-10-31T11:56:59.929Z', id: 'Iscrizione' },
  { at: '2026-10-31T11:57:11.172Z', id: 'Nome' },
  { at: '2026-10-31T12:02:16.962Z', id: 'Scelta' },
  // secondo colpo da PROVA della difesa (my probe POST race su tmp ha toccato
  // di nuovo il save vero — stessa lezione, seconda volta): 12:30:48.
  { at: '2026-10-31T12:30:48.516Z', id: 'Contratto (raddoppiato)' },
  { at: '2026-10-31T12:30:48.519Z', id: 'Iscrizione (raddoppiata)' },
];
const prima = s.messages?.length ?? 0;
s.messages = (s.messages ?? []).filter((m) => !AUDIT.some((a) => m.at === a.at));
if (prima !== s.messages.length) fatto.push(`messages ${prima}→${s.messages.length} (rimossi ${prima - s.messages.length} probe)`);
else skip.push('messages già puliti');

// 7. flows.jsonl: via la riga -450 ----------------------------------------
if (existsSync(FLOWS)) {
  const righe = readFileSync(FLOWS, 'utf8').split('\n').filter(Boolean);
  const salvate = righe.filter((l) => !(
    (l.includes('2026-10-31T11:56:59.928Z') || l.includes('2026-10-31T12:30:48.516Z'))
    && l.includes('"kind"') && l.includes('"entry"') && l.includes('-450')
  ));
  if (salvate.length !== righe.length) {
    writeFileSync(FLOWS, salvate.join('\n') + '\n');
    fatto.push(`flows.jsonl ${righe.length}→${salvate.length} righe (rimossa entry -450 della sonda)`);
  } else skip.push('flows.jsonl già pulito');
}

// ---- scrivere con lo stesso indent dell'app (2 spazi) + LF --------------
writeFileSync(SAVE, JSON.stringify(s, null, 2) + '\n');
console.log('fatto:');
for (const f of fatto) console.log('  ✓', f);
for (const f of skip) console.log('  (skip)', f);
console.log('POST:', JSON.stringify({ money: s.money, node: s.node, round: s.round, sponsor: s.life.sponsor?.name ?? null, challengeAccepted: s.life?.challenge?.accepted, msgCount: s.messages.length }));
if (!fatto.length) { console.error('niente da fare: nessuna precondizione trovata — NON ho scritto il save'); process.exit(2); }
