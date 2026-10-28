// ripara-rivali.mjs — cura dell'archivio rivali dopo la scoperta del 27/10
// (Brands Hatch): i file risultato di EVO possono portare lo STESSO pilota su
// più righe (stesso driver_id, posizioni consecutive) e il registro rivals.json
// ha quindi griglie con 18 righe per 13 piloti veri — podio con la stessa
// persona tre volte, testa a testa e forma contati più volte.
//
// Cosa fa (con backup datato, idempotente):
//   1. pulisce OGNI raceRow.grid dalle righe doppie (stessa `key` = stessa
//      persona: la prima riga in ordine di posizione è la vera classificazione)
//   2. ricostruisce i totali vivi di ogni rivale partendo dalle gare rimaste:
//      races/wins/podiums/fastestLaps (dalla bestLap della griglia), h2h,
//      streakBeatMe, nemesi, last5, team/car visti di recente.
//_written: node tools/ripara-rivali.mjs        (default: applicare)
//
// Il niente-fastestLap-ottimo: il flag has_best_lap del file non è salvato
// nella raceRow — ricostruiamo il giro più veloce da bestLap (pari ai pari).
import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rivalKey } from '../src/rivals.mjs';
import { recordWarning } from '../src/warnings.mjs';
import { writeJsonAtomic } from '../src/atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const storeFile = join(HERE, '..', 'data', 'rivals.json');

const store = JSON.parse(readFileSync(storeFile, 'utf8'));
const races = store.races ?? [];

// 1) pulizia griglia: per ogni gara, righe raggruppate per key (persona), resta la prima
let doppieTotali = 0, gareToccate = 0;
for (const race of races) {
  const senzaDoppie = [];
  const visti = new Set();
  for (const g of [...(race.grid ?? [])].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))) {
    if (visti.has(g.key)) { doppieTotali++; continue; }
    visti.add(g.key);
    senzaDoppie.push(g);
  }
  if (senzaDoppie.length !== (race.grid ?? []).length) gareToccate++;
  race.grid = senzaDoppie;
  // chiusura RANGHI (1..N) su OGNI gara: senza le righe doppie le posizioni
  // avranno buchi (visto alle 19:46: 1, 4, 5… e il podio P2/P3 spariva) — il
  // campo griglia dei rivali è il set dei piloti, senso continuo. Riazzerare
  // è idempotente e NON tocca il salvataggio della carriera (che cresce da sé).
  senzaDoppie.forEach((g, i) => { g.position = i + 1; });
  race.gridSize = senzaDoppie.length;
}

// 2) ricostruzione dei rivali (stesse regole di recordRaceGrid)
const rivals = {};
for (const race of races) {
  const me = (race.grid ?? []).find((g) => g.isPlayer);
  if (!me) continue;                       // grid senza te: niente da capire
  const at = race.at;
  const raceVendetta = { newNemesi: [], settled: [] };
  for (const row of race.grid ?? []) {
    if (row.isPlayer) continue;
    if (!row.full) continue;
    const key = row.key ?? rivalKey(row.first ?? row.full.split(' ')[0], row.last ?? row.full.split(' ').slice(1).join(' '));
    const rv = rivals[key] ??= {
      key, first: row.first ?? '', last: row.last ?? '', full: row.full,
      team: row.team ?? null, nation: row.nation ?? null,
      since: at,
      totals: { races: 0, wins: 0, podiums: 0, fastestLaps: 0 },
      h2h: { beats: 0, losses: 0, ties: 0 },
    };
    rv.team = row.team ?? rv.team;
    rv.car = row.car ?? rv.car;
    const t = rv.totals;
    t.races += 1;
    if (!row.dnf && row.position === 1) t.wins += 1;
    if (!row.dnf && row.position <= 3) t.podiums += 1;
    if (!row.dnf && row.bestLap) {
      // giro più veloce della griglia: approssimazione del flag has_best_lap
      const ms = (s) => { const m = String(s).match(/^(\d+):(\d+)\.(\d+)$/); return m ? Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]) : Infinity; };
      const best = (race.grid ?? []).filter((g) => g.bestLap && !g.dnf).sort((a, b) => ms(a.bestLap) - ms(b.bestLap))[0];
      if (best && best.key === key) t.fastestLaps += 1;
    }
    // testa a testa
    const myPos = me.dnf ? (race.grid ?? []).length + 1 : me.position;
    const hisPos = row.dnf ? (race.grid ?? []).length + 1 : row.position;
    if (myPos < hisPos) rv.h2h.losses += 1;
    else if (myPos > hisPos) rv.h2h.beats += 1;
    else rv.h2h.ties += 1;
    // vendetta (di nuovo dichiarata/assolti: la flag PRIMA dell'aggiornamento)
    const prevNemesis = rv.nemesis === true;
    if (myPos > hisPos) {
      rv.streakBeatMe = (rv.streakBeatMe ?? 0) + 1;
      if (rv.streakBeatMe >= 2) rv.nemesis = true;
    } else if (myPos < hisPos) {
      rv.streakBeatMe = 0;
      rv.nemesis = false;
    }
    if (!prevNemesis && rv.nemesis === true && !raceVendetta.newNemesi.includes(rv.full)) raceVendetta.newNemesi.push(rv.full);
    if (prevNemesis && rv.nemesis !== true) raceVendetta.settled.push(rv.full);
    // forma: ultime 5 gare (stesso formato di recordRaceGrid)
    (rv.last5 ??= []).push({
      at, node: race.nodeDisplay ?? race.nodeId, round: race.round, season: race.season,
      nodeId: race.nodeId, track: race.trackDisplay ?? race.track,
      pos: row.dnf ? null : row.position, dnf: !!row.dnf, dsq: !!row.dsq, penalty: row.penalty ?? null,
      beatMe: myPos < hisPos,
    });
  }
  race.vendetta = raceVendetta;   // la vendetta della GARA sta accanto alla gara
}
for (const rv of Object.values(rivals)) if (rv.last5.length > 5) rv.last5 = rv.last5.slice(-5);
// le gare senza la tua riga non passano per il ciclo sopra: vendetta neutra
for (const race of races) race.vendetta = race.vendetta ?? { newNemesi: [], settled: [] };

// posizione nell'ordine: gli attuali rivals che non condividono gara vengono persi
// (nel registro solo contano persone gareggiate: già già l'ingestione ne esclude)
const prima = Object.keys(store.rivals ?? {}).length;
store.rivals = rivals;
const dopo = Object.keys(rivals).length;
console.log(`rivals.json: griglie ripulite ${gareToccate} · righe doppie scartate ${doppieTotali} · rivali ricostruiti ${dopo} (prima ${prima})`);
const nemesi = Object.values(rivals).filter((r) => r.nemesis).length;
console.log(`nemesi attive: ${nemesi}`);

if (process.argv.includes('--dry')) {
  console.log('dry: niente scritto (check su backup file).'); process.exit(0);
}
mkdirSync(join(HERE, '..', 'data'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
if (existsSync(storeFile)) copyFileSync(storeFile, `${storeFile}.bak-ripara-${stamp}`);
writeJsonAtomic(storeFile, store);
console.log(`scritto ${storeFile} · backup ${storeFile}.bak-ripara-${stamp}`);
recordWarning('rivals', `ripara-rivali: griglie ripulite ${gareToccate}, righe doppie scartate ${doppieTotali}, rivali ricostruiti ${dopo}`);
