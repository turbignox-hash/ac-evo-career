// gazzetta.mjs — la stampa del paddock: dopo ogni gara un titolo, con citazioni
// dei rivali costruite sui dati veri (h2h, forma, duelli). Testi da template
// deterministici: stesso risultato, stessa pagina. Tutto vive in data/news.json
// per restare leggibile anche a mesi di distanza.

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NEWS_FILE = join(HERE, '..', 'data', 'news.json');

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

const fame = (first) => first || 'Il pilota';
const shortName = (full) => String(full ?? '').trim().split(/\s+/)[0] ?? '';

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
  } else if (win) {
    title = `${fame(me)} trionfa a ${track}${fl ? ' con anche il giro veloce' : ''}`;
    body = `Primo al traguardo${entry.gapMs ? ` con ${(entry.gapMs / 1000).toFixed(1)}\" di margine` : ''}: il campionato si colora di giallo.`;
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
