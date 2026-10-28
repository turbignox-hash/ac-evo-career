// gazzetta.mjs — la stampa del paddock: dopo ogni gara un titolo, con citazioni
// dei rivali costruite sui dati veri (h2h, forma, duelli). Testi da template
// deterministici: stesso risultato, stessa pagina. Tutto vive in data/news.json
// per restare leggibile anche a mesi di distanza.

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Stessa regola di import.mjs/flows.mjs: EVO_DATA_DIR (solo per i test) ridirige
// il foglio in una cartella temporanea — prima la news andava sempre in data/
// del progetto e la suite scriveva col launcher vero sullo stesso file (fonte
// del flaky del test 80 voci: la prova leggeva il foglio mischiato alle notizie
// vere dell'utente).
const NEWS_FILE = process.env.EVO_DATA_DIR
  ? join(process.env.EVO_DATA_DIR, 'news.json')
  : join(HERE, '..', 'data', 'news.json');

function loadNews() {
  try { return JSON.parse(readFileSync(NEWS_FILE, 'utf8')); } catch { return { items: [] }; }
}

function saveNews(news) {
  mkdirSync(dirname(NEWS_FILE), { recursive: true });
  writeJsonAtomic(NEWS_FILE, news); // atomico: la gazzetta non deve mai restare a metà
}

/** Le ultime notizie, dalla più recente. */
export function newsFeed(n = 30) {
  return loadNews().items.slice(0, n);
}

/** Nuova carriera: la stampa riparte da un foglio bianco. */
export function resetNews() {
  try { writeJsonAtomic(NEWS_FILE, { items: [] }); } catch { /* pazienza */ }
}

const DUE_DI_FILO = { 2: 'DUE DI FILO', 3: 'TRE DI FILO', 4: 'QUATTRO DI FILO', 5: 'CINQUE DI FILO' };
const fame = (first) => first || 'Il pilota';
const shortName = (full) => String(full ?? '').trim().split(/\s+/)[0] ?? '';

/* Serie consecutive: da fondo verso l'ultima gara prima di quella di oggi. */
function prevStreak(past, ok) {
  let n = 0;
  for (let i = past.length - 1; i >= 0 && ok(past[i]); i--) n++;
  return n;
}

/** Lo storico di ME nella serie corrente prima del round `entry`:
 *  [0] = gare della stagione corrente in ordine di round;
 *  [1] = vittorie mie sulla pista di oggi, stagioni comprese.
 *  state.results contiene già la gara di oggi: si scarta con round < entry.round. */
function myStory(state, node, entry) {
  const all = state.results?.[node.nodeId] ?? [];
  const past = all
    .filter((r) => r.season === state.season && r.round < (entry.round ?? 0))
    .sort((a, b) => a.round - b.round);
  const trackWins = entry.track
    ? all.filter((r) => r.round < (entry.round ?? 0) && r.track === entry.track && !r.dnf && r.position === 1).length
    : 0;
  return { past, trackWins };
}

/**
 * Genera e archivia la notizia di una gara appena importata.
 * `ctx` = { ladder, state, node, entry, rivals:[{key,name,h2h}] (chi era in griglia),
 *           duello:{name} (il rivale più vicino in classifica), beaten:[nomi battuti], beatMe:[nomi] }
 */
export function publishRaceNews(ctx) {
  const { state, node, entry } = ctx;
  const track = ctx.trackDisplay ?? node.display;
  const me = state.driver.first;
  const pos = entry.dnf ? null : entry.position;
  const podium = pos != null && pos <= 3;
  const win = pos === 1;
  const fl = !!entry.fl;
  const pole = entry.pole === true;
  const beaten = ctx.beaten ?? [];
  const beatMe = ctx.beatMe ?? [];

  const { past, trackWins } = myStory(state, node, entry);
  const pastDnfStreak = prevStreak(past, (r) => !!r.dnf);
  const pastWinStreak = prevStreak(past, (r) => !r.dnf && r.position === 1);
  const pastPodiumStreak = prevStreak(past, (r) => !r.dnf && r.position <= 3);
  const seasonPodiums = past.filter((r) => !r.dnf && r.position <= 3).length;

  const rivalQuote = () => {
    // la voce più interessante: chi mi ha battuto oggi, o la mia vittima di sempre
    const culprit = ctx.rivals?.find((r) => beatMe.includes(shortName(r.name))) ?? null;
    const victim = ctx.rivals?.find((r) => beaten.includes(shortName(r.name)) && r.h2h && (r.h2h.losses ?? 0) >= 2) ?? null;
    if (culprit) {
      const lines = [
        `«Questa volta sono passato io. La prossima vedremo», intima ${shortName(culprit.name)} ai microfoni.`,
        `${shortName(culprit.name)} non si lascia impressionare: «Il campionato è lungo, e lo sa anche lui».`,
        `«Abbiamo lavorato sulla velocità in curva, oggi si vede», sorride ${shortName(culprit.name)}.`,
      ];
      return lines[(entry.round + (pos ?? 5)) % lines.length];
    }
    if (victim) {
      const lines = [
        `«Contro di lui non parte mai bene», sospira ${shortName(victim.name)}. «Prima o poi cambia aria.»`,
        `${shortName(victim.name)} studia un piano: «Devo solo smettere di trovarmi davanti quell'elmetto giallo».`,
        `«Terza volta che mi becca all'ultimo giro», sbuffa ${shortName(victim.name)}. «Direi che è odio vero.»`,
      ];
      return lines[(entry.round + (pos ?? 3)) % lines.length];
    }
    const other = ctx.rivals?.[0];
    if (!other) return null;
    const lines = [
      `«Il ritmo c'è, manca la costanza», giudica freddo ${shortName(other.name)}.`,
      `${shortName(other.name)} è lucido: «Non regge il passo gara. Lo sapevamo tutti».`,
      `«Muoio di rimonta, come sempre», ride ${shortName(other.name)}. «Ma la gara è lunga, guarda.»`,
    ];
    return lines[(entry.round + 1) % lines.length];
  };

  let title, body;
  if (win && pole && fl) {
    title = `GRANDE CHELEM A ${track.toUpperCase()}: ${fame(me)} fattura pole, vittoria e giro veloce`;
    body = `Weekend perfetto: il pubblico in piedi e il box che urla. «La macchina era un sogno», sbotta il vincitore.`;
  } else if (pos == null && pole) {
    title = `LA POLE BUTTATA A ${track.toUpperCase()}: ${fame(me)} parte davanti e finisce fuori`;
    body = `Griglia numero uno, zero punti: il giro in qualifica resta l'unica foto da ricordare.`;
  } else if (pos == null && pastDnfStreak >= 1) {
    title = `BRUTTA SERIE A ${track.toUpperCase()}: ${pastDnfStreak + 1} ritiri consecutivi per ${fame(me)}`;
    body = `Serie nera in pieno campionato: “ci risiamo” scarabocchiato sul registro del box.`;
  } else if (win && pastDnfStreak >= 1) {
    title = `RITORNO DAL BOX A ${track.toUpperCase()}: ${fame(me)} vince subito dopo il ritiro`;
    body = `Sette giorni di silenzio, poi la risposta più netta possibile: la griglia torna a guardarsi le spalle.`;
  } else if (win && pastWinStreak >= 1) {
    title = `${DUE_DI_FILO[Math.min(pastWinStreak + 1, 5)]} A ${track.toUpperCase()}: ${fame(me)} firma la serie`;
    body = `La seggiolina si ripete: ${fame(me)} sta prendendo la mano sul resto della griglia.`;
  } else if (win && trackWins === 0) {
    title = `PRIMA VOLTA A ${track.toUpperCase()}: ${fame(me)} trionfa su questa pista`;
    body = `Il trofeo va a una pista nuova per lui: la ricetta finisce nel taccuino del box.`;
  } else if (win) {
    title = `${fame(me)} trionfa a ${track}${fl ? ' con anche il giro veloce' : ''}`;
    body = `Primo al traguardo${entry.gapMs ? ` con ${(entry.gapMs / 1000).toFixed(1)}" di margine` : ''}: il campionato si colora di giallo.`;
  } else if (podium && seasonPodiums === 0) {
    title = `IL PRIMO GRADINO: ${fame(me)} sale sul podio a ${track} (P${pos})`;
    body = `La stagione arriva sul podio per la prima volta: la classifica comincia a guardare in cima.`;
  } else if (podium && pastDnfStreak >= 1) {
    title = `RITORNO SUL PODIO A ${track.toUpperCase()}: ${fame(me)} si riscatta dal ritiro`;
    body = `Dopo il buco nero, un gradino: la costanza è tornata in griglia.`;
  } else if (podium && pastPodiumStreak >= 2) {
    title = `PODIO A SERIE: ${pastPodiumStreak + 1} podi consecutivi a ${track}`;
    body = `Firma di costanza: ${fame(me)} sta appiattendo il campionato sul suo gradino.`;
  } else if (podium) {
    title = `${track}: podio per ${fame(me)} (P${pos})${fl ? ' e giro veloce' : ''}`;
    body = `Il boato del box esplode al traguardo. Il passo c'è, adesso serve il gradino più alto.`;
  } else if (pos != null) {
    title = `Gara di carattere a ${track}: P${pos} per ${fame(me)}${fl ? ' col giro veloce' : ''}`;
    body = pos <= 6
      ? `Punti importanti e ritmo crescente: la curva di forma è in salita.`
      : `Gara di gestione, punti salvati: la classifica resta aperta.`;
  } else {
    title = `Brutta giornata a ${track}: ritiro per ${fame(me)}`;
    body = `Un fine settimana da dimenticare. «Ci risiamo al prossimo round», promette il box.`;
  }
  if (beatMe.length) body += ` ${shortName(beatMe[0])} chiude davanti: conto in sospeso.`;
  else if (beaten.length >= 3) body += ` ${shortName(beaten[0])} e altri ${beaten.length - 1} lasciano il passo.`;

  const q = rivalQuote();
  if (q) body += `\n${q}`;

  const news = loadNews();
  const item = {
    at: new Date().toISOString(),
    kind: 'race',
    season: state.season,
    node: node.nodeId,
    round: entry.round,
    track,
    title,
    body,
    outcome: entry.dnf ? 'dnf' : `P${pos}`,
  };
  news.items.unshift(item);
  news.items = news.items.slice(0, 80);
  saveNews(news);
  return item;
}

/** Notizia di mercato/contratto (firma, sponsor, fine stagione). */
export function publishNotice(title, body, { season = null, kind = 'notice' } = {}) {
  const news = loadNews();
  news.items.unshift({ at: new Date().toISOString(), kind, season, title, body });
  news.items = news.items.slice(0, 80);
  saveNews(news);
  return news.items[0];
}

/* ------------------------------------------------------------------ */
/* LA GAZZETTA DI STAGIONE (28/10): i titoli delle gare dell'anno */
/* riletti in una pagina unica, come un giornale rilegato in volume. */
/* Non sostituisce la rassegna (quella fa i conti): qui si rileggono */
/* le prime pagine scritte gara per gara, con l'esito in colonna. */
/* ------------------------------------------------------------------ */

/**
 * Il foglio di stagione `season`: titoli e brombe delle gare disputate,
 * in ordine di round, con un sommario in testa. DETERMINISTICO: stessi
 * dati, stessa pagina (nessuna frase a caso). Non tocca news.json:
 * LEGGE, non archivia — i titoli sono già salvati lì da publishRaceNews.
 */
export function seasonPress(state, { season = null } = {}) {
  const wanted = season ?? state.season;
  const raceItems = loadNews().items
    .filter((x) => x.kind === 'race' && x.season === wanted)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

  const dnf = raceItems.filter((x) => x.outcome === 'dnf').length;
  const wins = raceItems.filter((x) => x.outcome === 'P1').length;
  const podiums = raceItems.filter((x) => /^P[123]$/.test(x.outcome ?? '')).length;
  const heads = raceItems.map((x) => ({
    round: x.round, track: x.track, title: x.title, body: x.body,
    outcome: x.outcome ?? '—', at: x.at ?? null, node: x.node ?? null,
  }));

  return { season: wanted, races: raceItems.length, wins, podiums, dnf, heads };
}
