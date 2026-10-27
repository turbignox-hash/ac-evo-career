// uiapp-pub.mjs — il PUBLISHER dell'app «Cruscotto» in gioco (27/10/2026).
//
// L'app vive in Saved Games/ACE/mods/uiresources/ACEUIAppLoader/cruscotto/ e
// ci parla come Paddock parla col suo paddock.py: LEGGE file JSON dalla
// propria cartella, col nome `ui-<fascia>.json` dove <fascia> cambia ogni
// PERIODO_MS — il gioco tiene le risposte in cache, e il nome nuovo bypassa
// la cache (la stessa trucca è dentro paddock.js). Niente richieste HTTP
// verso il server del cruscotto (origine incrociata e il gioco non ce l'ha
// con le pagine statiche): solo lettura pura di un file, il lavoro pesante
// resta qui dentro.
//
// Il publisher NON tocca il save e NON tocca il gioco: costruisce da solo
// (ladder + stato, in processo) la vetrina di oggi e la scrive sul disco.
// Se la cartella del loader manca (mod non installata) resta zitto.

import { writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { savedGamesRoots } from './paths.mjs';
import { agendaDay, racesOnDay, dateLabel, prossimoGiornoConGara, impegni } from './agenda.mjs';
import { context, SAVE_FILE } from './webui-env.mjs';
import { loadState, nodeById, standingsFor, playerStanding } from './state.mjs';
import { playerWorldSkill } from './world.mjs';
import { tr } from './lang.mjs';

export const PERIODO_MS = 2500;          // il ritmo delle fasce: 2.5 secondi esatti
export const APP_KEY = 'cruscotto';      // il nome della cartella-app nel loader

/** La cartella dell'app dentro il loader, o null se la mod non c'è:
 *  si prende il primo base «Saved Games» che ha l'App Loader installato
 *  (funziona pure con la cartella di sistema ricollocata). */
export function cartellaApp(env = process.env) {
  for (const root of savedGamesRoots(env)) {
    const dir = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', APP_KEY);
    if (existsSync(dir)) return dir;
  }
  return null;
}

let guiBaseUrl = null;
/** L'URL della GUI del cruscotto (server webui) per il collegamento «Mondiale
 *  completo»: lo start del server lo passa a startUiappPublisher. */
export function setGuiBaseUrl(url) {
  if (url && typeof url === 'string') guiBaseUrl = url.replace(/\/$/, '');
}

/** La vetrina di oggi: STESSO algoritmo dell'<agenda> del server
 *  (racesOnDay fa la stessa calibrazione per la GUI del browser) —
 *  niente logica nuova da tenere allineata, due file, una sola fonte. */
export function vetrina(ladder, state) {
  const giorno = agendaDay(state);
  if (state == null || giorno == null) {
    return { ok: 0, no_carriera: true, quando: new Date().toISOString(), giorno: null, iscritte: [], gare: [] };
  }
  const iscritte = (impegni(ladder, state).lista ?? []).map((x) => ({
    nodeId: x.nodeId, nome: x.display ?? x.nodeId ?? '',
    stagione: x.season ?? null, prossimoGiorno: x.nextRaceDay ?? null, track: x.track ?? null,
  }));
  const gare = (racesOnDay(ladder, state, giorno) ?? []).map((g) => {
    const cars = Array.isArray(g.node?.cars) ? g.node.cars : [];
    return {
      nodeId: g.node.nodeId, nome: g.node.display, disciplina: g.node.discipline,
      ronda: (g.index ?? 0) + 1, totalRonde: g.node.calendar?.length ?? 0,
      stagione: g.season, track: g.track, giri: g.laps ?? null, ora: g.hour ?? null,
      meteo: ladder.weatherNames?.[String(g.weather)] ?? null,
      stato: tr({
        it: g.stato === 'iscritto' ? 'iscritto' : (g.fattibile ? 'disponibile' : 'bloccata'),
        en: g.stato === 'iscritto' ? 'signed' : (g.fattibile ? 'available' : 'locked'),
      }),
      fattibile: !!g.fattibile, iscritto: g.stato === 'iscritto', isCorrente: !!g.isCurrent,
      inRitardo: !!g.late, sulProgramma: !!g.onSchedule,
      griglia: cars.length === 1 ? 'monomarca' : 'multimarca',
      premio: g.node.econ?.prize ?? 0,
      auto: cars.length ? (ladder.contentNames?.cars?.[cars[0]] ?? cars[0]) : null,
    };
  });
  return {
    ok: 1, quando: new Date().toISOString(),
    giorno, giornoLabel: dateLabel(giorno),
    prossimo: prossimoGiornoConGara(ladder, state),
    pilota: { nome: state?.driver?.name ?? '', saldo: state?.money ?? 0, rep: state?.rep ?? 0 },
    iscritte, gare,
    // MINI-CLASSIFICA della serie del giorno e PANNELLO mondiale (richieste
    // 28/10): entrambe calcolate con le funzioni UFFICIALI del server
    // (standingsFor / playerWorldSkill) così il numero in gioco è lo stesso
    // della GUI del browser. Ogni blocco in try: la vetrina non si rompe mai
    // per una statistica nuova.
    classifica: miniClassifica(ladder, state),
    mondo: pannelloMondo(ladder, state),
    guiUrl: guiBaseUrl ?? (typeof process !== 'undefined' ? process.env.PITWALL_GUI_URL : null) ?? null,
  };
}

/** Classifica della serie CORRENTE del pilota (node), fino a 6 righe + la tua:
 *  stessa fonte del tab Campionati della GUI. */
function miniClassifica(ladder, state) {
  try {
    if (!state || !state.node) return null;
    const node = nodeById(ladder, state.node);
    if (!node) return null;
    const rows = standingsFor(ladder, state, node).slice(0, 7).map((r) => ({
      pos: r.position, nome: r.name, punti: r.points, tu: !!r.isPlayer,
    }));
    if (!rows.some((r) => r.tu)) {
      const me = playerStanding(ladder, state, node);
      if (me) rows.push({ pos: me.position, nome: me.name, punti: me.points, tu: true });
    }
    return { nodeId: node.nodeId, nome: node.display ?? node.nodeId, righe: rows };
  } catch { return null; }
}

/** Pannello mondiale: la tua posizione nel mondo per skill e la top-5.
 *  Stessa formula del calcolo della GUI (playerWorldSkill). */
function pannelloMondo(ladder, state) {
  try {
    if (!state) return null;
    const cur = nodeById(ladder, state.node);
    const tuaSkill = Math.round((cur ? playerWorldSkill(cur, state) : 0) * 100);
    const rows = (state.world?.drivers ?? [])
      .filter((d) => d.active !== false)
      .map((d) => ({ nome: state?.alias?.[`world:${d.id}`] || `${d.first} ${d.last}`, skill: Math.round((Number(d.skill) || 0) * 100), tu: false }));
    rows.push({ nome: state.driver.name, skill: tuaSkill, tu: true });
    rows.sort((a, b) => b.skill - a.skill);
    // la posizione VERA di ogni riga si calcola una volta sola: la tua riga
    // appesa in fondo (oltre il 5° posto) non deve prendere la posizione finta
    // della top-5
    rows.forEach((x, i) => { x.pos = i + 1; });
    const tuaPos = rows.findIndex((x) => x.tu) + 1;
    const top = rows.slice(0, 5);
    if (tuaPos > 5) top.push(rows[tuaPos - 1]);
    return { totale: rows.length, tuaPosizione: tuaPos, tuaSkill, top: top.map((x) => ({ pos: x.pos, nome: x.nome, skill: x.skill, tu: !!x.tu })) };
  } catch { return null; }
}

/** Un giro del publisher: scrive la fascia corrente e pulisce le vecchie. */
export function uiappTick(env = process.env) {
  const dir = cartellaApp(env);
  if (!dir || !existsSync(SAVE_FILE)) return { ok: false, motivo: 'no app o no carriera' };
  const fascia = Math.floor(Date.now() / PERIODO_MS);
  const { ladder } = context();
  const dati = vetrina(ladder, loadState(SAVE_FILE));
  dati.slot = fascia;
  dati.validaFino = new Date((fascia + 1) * PERIODO_MS).toISOString();
  writeFileSync(join(dir, `ui-${fascia}.json`), JSON.stringify(dati), 'utf8');
  // la spazzatura va a casa: tengo la fascia scritta e le 2 prima (se il gioco
  // arriva un attimo in ritardo, una fascia indietro resta leggibile)
  const vecchi = readdirSync(dir).filter((f) => /^ui-\d+\.json$/.test(f) && f !== `ui-${fascia}.json`);
  for (const f of vecchi.slice(0, Math.max(0, vecchi.length - 2))) {
    try { unlinkSync(join(dir, f)); } catch { // di recente presa in lettura dal gioco: arriva al prossimo giro
    }
  }
  return { ok: true, file: `ui-${fascia}.json` };
}

let timer = null;
export function startUiappPublisher(baseUrl = null) {
  if (baseUrl) setGuiBaseUrl(baseUrl);
  if (timer) return timer;
  if (!cartellaApp()) {
    console.log('  App «Cruscotto» in gioco: la mod App Loader non è installata — publisher fermo (installa con tools/installa-cruscotto.mjs).');
    return null;
  }
  uiappTick();
  timer = setInterval(() => { try { uiappTick(); } catch { /* mai bloccare il server per la vetrina */ } }, PERIODO_MS);
  timer.unref?.();
  return timer;
}
