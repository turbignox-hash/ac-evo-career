// 2/11 — SESTA FILA: IL PONTE CON PADDOCK senza strumento. src/app-carriera.mjs
// (344 righe) non aveva NESSUN test unit: è il modulo che legge i journal
// JSON dell'app Paddock dentro EVO in sola lettura. Il punto isolabile è
// APP_JOURNAL_DIR: qui scrivo journal finti in tmpdir e svuoto la cache
// (appCacheClear) a ogni cambio nido — i journal veri del gioco non
// vengono mai toccati. Il contratto da provare: il journal PIÙ RECENTE per
// mtime vince a ogni hash, la cache sta per mtime, la gara BAGNATA porta
// i suggerimenti d'assetto, la deterministica economia e il matching
// norm-accenti del catalogo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { appWet, cleanRaceBonusOf, carAppSpecsOf, appNextRace,
  appStats, appRoot, appCacheClear, appHome, appLedger,
  appLevelBadge, APP_LEVEL_FLOOR_ACE, APP_LEVEL_COLOR_ACE,
} = await import('../src/app-carriera.mjs');

// SANDBOX DATI: EVO_DATA_DIR deve essere PRIMA del caricamento del modulo
// (app-carriera.mjs lo legge a chiamata, la sandbox anzi sta stabile): senza
// anche il "journal nostro" dentro data/ del progetto finisce nei lettori
// dei test (che precisamente non devono leggerlo).
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-paddock-data-'));

const NIDO = mkdtempSync(join(tmpdir(), 'evo-paddock-'));
// LA REDIREZIONE VA PRIMA DI QUALSIASI LETTURA: senza env il modulo cade sui
// journal VERI del gioco (Saved Games/ACE/.../paddock) e i test li leggerebbero
// invece dei finto. Qui l'intero nido è questo tmpdir.
process.env.APP_JOURNAL_DIR = NIDO;
// IL MIRROR A DATA (2/11): con il journal nostro, la cartella dati del progetto
// può avere un evo-calendar rispecchiato dal save — anche quando il ppt non c'è:
// senza sandbox anche il test «niente journal → niente scheda» leggerebbe il
// CV del PC anziché il vuoto voluto. Isolazione identica a ronda-ladder.test.

// il journal pd-<kind>-<hash>.json, con mtime in vecchio/nuovo per simulare due riscritture
function jr(kind, hash, body, mtimeFactory = Date.now() - 10000) {
  const f = join(NIDO, `pd-${kind}-${hash}.json`);
  writeFileSync(f, JSON.stringify(body), 'utf8');
  utimesSync(f, new Date(mtimeFactory), new Date(mtimeFactory));
  return f;
}

// i testi dei TIPS sono già STRINGHE (tr({it,en}) ritorna la lingua corretta):
// l'assert legge la stringa qualunque sia la lingua corrente del progetto.
const say = (t) => typeof t === 'string' ? t : (t?.it || t?.en || '');

/* ---------------------------------------------- */
//   piccola economia: wet-words e bonus gara pulita
/* ---------------------------------------------- */

test('appWet riconosce pioggia/rain/scrosci in qualunque caso, non su sereno', () => {
  assert.equal(appWet('Pioggia leggera'), true);
  assert.equal(appWet('LIGHT RAIN'), true);
  assert.equal(appWet('scrosci localizzati'), true);
  assert.equal(appWet('sereno'), false);
  assert.equal(appWet('nuvoloso'), false);
  assert.equal(appWet(null), false);
});

test('cleanRaceBonusOf: 10% del premio, ZERO con penalità o premio nullo', () => {
  assert.equal(cleanRaceBonusOf(3000), 300);        // arrotondato giusto
  assert.equal(cleanRaceBonusOf(1255), 126);        // round, non troncato
  assert.equal(cleanRaceBonusOf(1000, 1), 0);       // una penalità toglie tutto
  assert.equal(cleanRaceBonusOf(0), 0);             // premio zero
  assert.equal(cleanRaceBonusOf(null), 0);          // premio assente
});

/* ---------------------------------------------- */
//   la prossima gara: home vince, calendario ripescala
/* ---------------------------------------------- */

const catCars = [
  { name: 'Porsche 962c Evo', slug: 'porsche-962c', curve: [[1000, 40], [3000, 80]], kw: 383, cv: 520, mass: 950, torque: 470, price: 120000, rental: 5000 },
  { name: 'Nürburgring Edition 2', curve: [[1000, 41], [3000, 81]], kw: 260, cv: 355, mass: 1080, torque: 420 },
  { name: 'Alfa Romeo 75 IMSA', curve: [[1000, 42], [2500, 70]], kw: 220, cv: 300, mass: 980, torque: 400, versus: [{ label: 'vs R5', delta: '+0.9%' }, {}] },
  { name: 'Auto Muta', curve: [[1]], kw: 50, mass: 900 },   // curva invalida
];
jr('catalog', 'aaaa11', { cars: catCars }, Date.now() - 9000);

test('appNextRace: dal journal home, pioggia → tips bagnato, sera → tip raffreddamento', () => {
  jr('home', 'h1', {
    next: { track: 'Imola', laps: 10, time: '18:30', weather: 'Pioggia leggera', round: 3, opponents: 13 },
    season: { series: 'Le Manses', number: 2, done: 3, rank: 4, points: 59, total: 8, rep_capped: true },
  });
  appCacheClear();
  const n = appNextRace();
  assert.equal(n.ok, true);
  assert.equal(n.track, 'Imola');
  assert.equal(n.series, 'Le Manses');
  assert.equal(n.season, 2);
  assert.equal(n.round, 3);
  assert.equal(n.total, 8);
  assert.equal(n.wet, true);
  assert.ok(n.tips.some((t) => /assetto pioggia|wet setup|BAGNATA|WET/i.test(say(t))), `tips: ${n.tips.map(say).join(' | ')}`);
  assert.ok(n.tips.some((t) => say(t).includes('18:30')), 'la partenza serale entra nei tips');
});

test('appNextRace: senza home, il calendario con state:"next" salva la scheda', () => {
  // SENZA home davvero: nido nuovo con SOLO il calendario (la home del test
  // sopra sta in un altro nido — il journal della scheda non deve guardarla)
  const NIDO2 = mkdtempSync(join(tmpdir(), 'evo-paddock-cal-'));
  writeFileSync(join(NIDO2, 'pd-calendar-c1.json'), JSON.stringify({
    series: 'Campionato Calendario', car: 'porsche-962c', season: 3,
    rounds: [
      { state: 'done', track: 'Monza', laps: 8, weather: 'sereno' },
      { state: 'next', track: 'Spa', layout: 'GP', laps: 12, time: '10:00', weather: 'sereno' },
      { state: 'future', track: 'Suzuka', weather: 'sereno' },
    ],
    standings: [], summary: { rank: 2, points: 40 },
  }), 'utf8');
  process.env.APP_JOURNAL_DIR = NIDO2;
  appCacheClear();
  const n = appNextRace();
  process.env.APP_JOURNAL_DIR = NIDO;   // ripristino per i test dopo
  appCacheClear();
  assert.equal(n.track, 'Spa');                  // la ronda "next" del calendario vince
  assert.equal(n.series, 'Campionato Calendario');
  assert.equal(n.done, 1);                       // contegnata dall'insieme cal
  assert.equal(n.wet, false);                    // sereno: NESSUN tip assetto
  assert.ok(n.tips.length === 0, `tips: ${n.tips.map((t) => t.it).join(' | ')}`);
  // il rank viene dal summary
  assert.equal(n.rank, 2);
});

test('appNextRace: niente journal → niente scheda', () => {
  const NIDO2 = mkdtempSync(join(tmpdir(), 'evo-paddock2-'));
  process.env.APP_JOURNAL_DIR = NIDO2;
  appCacheClear();
  assert.equal(appNextRace(), null);
  process.env.APP_JOURNAL_DIR = NIDO;
  appCacheClear();
});

/* ---------------------------------------------- */
//   scheda auto: curva, versus, matching norm-accenti
/* ---------------------------------------------- */

test('carAppSpecsOf: la scheda completa del 962, e il grazing se non esiste', () => {
  appCacheClear();
  const s = carAppSpecsOf('Porsche 962c Evo');
  assert.equal(s.source, 'app');
  assert.deepEqual(s.torqueCurve, [[1000, 40], [3000, 80]]);
  assert.equal(s.kw, 383);
  assert.equal(s.cv, 520);
  assert.equal(s.mass, 950);
  assert.equal(s.price, 120000);
  // chi non c'è: null, e chi chiama non mostrerà la scheda
  assert.equal(carAppSpecsOf('Auto Fantasma 999'), null);
  assert.equal(carAppSpecsOf(null), null);   // chiama con null: silenzio
});

test('carAppSpecsOf: matching SENZA accenti (nurburgring contro Nürburgring) e slug', () => {
  const s = carAppSpecsOf('nURBURGRING edition 2');      // accentata devantu non serve
  assert.equal(s.kw, 260);
  const s2 = carAppSpecsOf('porsche-962c');                  // slug
  assert.equal(s2.kw, 383);
  // versus: le voci senza label vengono filtrate
  const s3 = carAppSpecsOf('Alfa Romeo 75 IMSA');
  assert.deepEqual(s3.versus, [{ label: 'vs R5', delta: '+0.9%' }]);
  // curva di 1 punto NON è una curva: null
  const s4 = carAppSpecsOf('Auto Muta');
  assert.equal(s4.torqueCurve, null);
  // l'EN-nessuno: la registrazione del widget appCatalog è passata per norm
});

/* ---------------------------------------------- */
//   il journal PIÙ RECENTE vince e la cache attraversa
/* ---------------------------------------------- */

test('latestJournal: il mtime vince (hash diverso a ogni riscrittura) e il dato resta stabile', () => {
  // il journal "vecchio" (Date.now() - 9000) entra
  const old = appHome();
  assert.equal(old.ok, true);
  // nuovo hash, mtime PIÙ nuovo: ora il journal home è quello nuovo
  const t = Date.now();
  jr('home', 'h2', { next: { track: 'Monza', laps: 8, time: '14:30', weather: 'sereno' }, season: { done: 9 } }, t + 100);
  appCacheClear();
  const refreshed = appHome();
  assert.equal(refreshed.season.done, 9);         // il nuovo journal sostituisce il vecchio
  assert.equal(refreshed.next.track, 'Monza');
  // la cache regge il dato: la chiamata successiva dà Lo STESSO contenuto
  // (l'astrattivo interno sta per mtime; qui si prova il comportamento osservabile)
  const same = appHome();
  assert.deepEqual(same, refreshed);
});

/* ---------------------------------------------- */
//   copertura del catalogo (per lo stato del cruscotto)
/* ---------------------------------------------- */

test('appStats: con curva/completa/missing, contando SOLO curve valide', () => {
  const st = appStats();
  assert.equal(st.ok, true);
  assert.equal(st.cars, 4);
  assert.equal(st.withCurve, 3);                  // la "Auto Muta" con curva da 1 pt non conta
  // completa: curva + massa + coppia (nella 4-le auto: "Auto Muta" ha massa e coppia MA curva invalida → missing)
  assert.equal(st.complete, 3);
});

test('appLedger: il registro contabile passa per intero', () => {
  jr('ledger', 'l1', { rows: [{ kind: 'prize', money: 5000 }] });
  appCacheClear();
  const led = appLedger();
  assert.equal(led.ok, true);
  assert.equal(led.rows[0].money, 5000);
});

/* ---------------------------------------------- */
//   APP_JOURNAL_DIR: la redirezione dell'ambiente funziona
/* ---------------------------------------------- */

test('appRoot: la variabile ambiente sposta la root, la cartella inesistente no', () => {
  // rotta esplicita: APP_JOURNAL_DIR esiste → vince
  process.env.APP_JOURNAL_DIR = NIDO;
  appCacheClear();
  assert.equal(appRoot(), NIDO);
  // la cartella inesistente non può essere la root: silenzio
  process.env.APP_JOURNAL_DIR = join(NIDO, 'no-such-dir');
  appCacheClear();
  assert.equal(appRoot(), null);       // NON cade sui journal veri: null è null
  // e il ripristino ridà la root del nido (mai il disco reale nei test)
  process.env.APP_JOURNAL_DIR = NIDO;
  appCacheClear();
  assert.equal(appRoot(), NIDO);
});

/* ---------------------------------------------- */
/*   la tessera del LIVELLO (31/10): VERA col ponte,  */
/*   stima dalla reputazione in assenza di Paddock    */
/* ---------------------------------------------- */

test('appLevelBadge: col journal level reale → name/color/pct con source paddock', () => {
  jr('home', 'lvl1', {
    profile: { level: { name: 'Fuoriclasse', color: '#f5c542', floor: 490, rep: 1000, next_floor: null, pct: 100 } },
  }, Date.now() + 5000);   // il mtime più recente vince su tutti i home precedenti
  appCacheClear();
  const b = appLevelBadge(0);
  assert.equal(b.source, 'app');
  assert.equal(b.name, 'Fuoriclasse');
  assert.equal(b.color, '#f5c542');
  assert.equal(b.pct, 100);
});

test('appLevelBadge: senza Paddock la stima parte SOLO sopra la soglia osservata', () => {
  // nido vuoto: Paddock non parla
  const NIDO2 = mkdtempSync(join(tmpdir(), 'evo-paddock-lvl-'));
  process.env.APP_JOURNAL_DIR = NIDO2;
  appCacheClear();
  // la soglia è QUELLA osservata sul vivo (journal reale 31/10): Se la cambia
  // fuori dal controllo, il test lo ferma — niente soglia inventata.
  assert.equal(APP_LEVEL_FLOOR_ACE, 490);
  // 489: sotto la soglia — niente chip
  assert.equal(appLevelBadge(489), null);
  // 490: il floor OSSERVATO nel journal reale — Fuoriclasse giallo, segnata come stima
  const b = appLevelBadge(490);
  assert.equal(b.source, 'stima');
  assert.equal(b.name, 'Fuoriclasse');
  assert.equal(b.color, APP_LEVEL_COLOR_ACE);
  process.env.APP_JOURNAL_DIR = NIDO;   // ripristino
  appCacheClear();
});

