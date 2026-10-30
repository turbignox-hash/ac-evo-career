// 31/10 — LA PROVA DEL VUOTO: Paddock NON installato sul PC non deve creare
// NESSUN problema, solo un silenzio pulito. Il ponte (src/paddock.mjs) scarta
// la ritorna NIENTE quando la cartella journal manca; qui si replica l'assenza
// con PADDOCK_JOURNAL_DIR che punta a un nido che NON esiste: per progetto del
// modulo (paddockRoot: «override esplicito: se la cartella NON esiste …»)
// root diventa null e ogni lettura torna ok:false o null — mai un throw.
// Il contratto da provare, consumatore per consumatore:
//   • webui  → GET /api/paddock = {ok:false, reason:'not-installed'} (HTTP 200, non 500)
//   • import → paddockNextRace()=null, il ramo rep-capped non esiste: nessun messaggio falso
//   • GUI    → la card Paddock si nasconde (pd.ok=false fa già il lavoro)
//   • state  → il bonus gara pulita è PURO (matematica), sfida senza Paddock
//   • cars/race → paddockSpec=null: scheda e raceCard rinunciano all'extra tecnico
import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';

// LA REDIREZIONE IMPOSSIBILE VA PRIMA DI QUALSIASI LETTURA: il nido non esiste
// eppure PADDOCK_JOURNAL_DIR è impostato → root=null (il modulo RIFIUTA di
// cadere sui journal veri di questa macchina, che il test leggerrebbe per errore).
process.env.PADDOCK_JOURNAL_DIR = 'C:/__nessun-paddock-qui__';

const {
  paddockRoot, paddockOverview, paddockHome, paddockCalendar, paddockCatalog,
  paddockLedger, paddockTeams, paddockHistory, paddockNextRace, paddockStats,
  carPaddockSpecsOf, cleanRaceBonusOf,
} = await import('../src/paddock.mjs');


test('paddockRoot: il nido mancante non è installato, e non ricade sui journal veri', () => {
  assert.equal(paddockRoot(), null);
});

test('le viste tutte dicono ok:false, mai un throw', () => {
  for (const view of [paddockHome, paddockCalendar, paddockCatalog, paddockLedger, paddockTeams, paddockHistory]) {
    assert.equal(view()?.ok, false, view.name);
  }
});

test('paddockOverview: ok:false con reason not-installed — l\'endpoint /api/paddock risponde 200 col JSON', () => {
  const o = paddockOverview();
  assert.equal(o.ok, false);
  assert.equal(o.reason, 'not-installed');
  // la GUI legge pd.ok && pd.next: qui mancano entrambe → la card non si disegna
  assert.equal(o.next, undefined);
  assert.equal(o.home, undefined);
  assert.equal(o.calendar, undefined);
});

test('paddockNextRace: null senz\'altro — import.mjs legge pn?.repCapped e resta zitto', () => {
  assert.equal(paddockNextRace(), null);
});

test('paddockStats: zeri onesti, ok:false', () => {
  const s = paddockStats();
  assert.equal(s.ok, false);
  assert.equal(s.cars, 0);
  assert.equal(s.withCurve, 0);
  assert.equal(s.complete, 0);
});

test('carPaddockSpecsOf: null per qualunque auto — scheda e raceCard perdono SOLO l\'extra tecnico', () => {
  assert.equal(carPaddockSpecsOf('Ferrari 488 GT3'), null);
  assert.equal(carPaddockSpecsOf(''), null);
  assert.equal(carPaddockSpecsOf(null), null);
});

test('cleanRaceBonusOf: la matematica del bonus non dipende da Paddock installato', () => {
  assert.equal(cleanRaceBonusOf(3000), 300);
  assert.equal(cleanRaceBonusOf(1255), 126);
  assert.equal(cleanRaceBonusOf(1000, 1), 0);
  assert.equal(cleanRaceBonusOf(null), 0);
});
