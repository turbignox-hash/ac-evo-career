// events.mjs — gli eventi speciali: inviti "fuori calendario" con premio un'auto.
//
// Come funzionano (accordi con Mauro):
//  - gare speciali a tema DURANTE la stagione: un invito può arrivare dopo ogni
//    gara di campionato importata (cadenza automatica, con un po' di caso: non
//    sempre arriva, e mai più di un evento attivo per volta);
//  - FINALE di prestigio a fine stagione: invito garantito quando chiudi il campionato;
//  - auto in premio A TEMA: la vittoria mette l'auto in VETRINA (dentro il tool) e
//    le auto vinte diventano le protagoniste dei prossimi eventi;
//  - sfida bilanciata: pista/auto dal tema, difficoltà AI del tool normale ma con
//    2-3 rivali "ospiti" più forti del solito;
//  - nessuna automazione del gioco: la gara si imposta in EVO dalla scheda,
//    esattamente come le gare di campionato. Il risultato si registra con un
//    bottone ( posizione + giro veloce): è un evento extrasportivo, non tocca
//    il campionato, la classifica o i contratti di stagione.
//
// Lo stato vive in state.events = { active, history, showCase, lastRoundChecked }.
// Persistenza: via saveState (save.json), quindi backup e atomicità già garantiti.

import { recordFlows } from './flows.mjs';
import { tr } from './lang.mjs';
import { pushMessage } from './state.mjs';
import { publishNotice } from './gazzetta.mjs';
import { recordWarning } from './warnings.mjs';

/* ------------------------------------------------------------------ */
/* catalogo temi                                                       */
/* ------------------------------------------------------------------ */

// Ogni tema: auto protagoniste (quella in premio + le rivali ospiti), piste
// preferite, mood. Le auto sono scelte tra quelle che Mauro ha davvero in EVO
// (viste in MoTec o nel catalogo); id/label in stile leggibile.
// Doppio linguaggio: name resta la lingua di nascita (italiano, stabile dentro
// allo stato), nameEn è la controparte per la lettura in EN. La scelta della
// lingua avviene SOLO alla visualizzazione (themeName → tr), mai alla
// generazione: il save resta intatto rispetto alla lingua del momento.
export const THEMES = [
  {
    id: 'group_b',
    name: 'Ritorno del Gruppo B',
    nameEn: 'Return of Group B',
    intro: 'I mostri degli anni \'80 tornano in pista per una notte: rumore, turbina e paura.',
    prizeCar: { id: 'peugeot_205_t16', name: 'Peugeot 205 T16' },
    guests: ['audi_r8_lms_gt4_evo', 'lancia_delta_s4'], // rivali ospiti (se presenti nel gioco)
    guestNames: ['Rinaldo Capello', 'Michele Mouton'],
    tracks: ['cota', 'kyalami', 'redbull_ring', 'laguna_seca'],
    weathers: [0, 0, 1], // prevalentemente asciutto
    laps: 7,
    hour: 19,
    timeScale: 1,
    money: 7500,
    rep: 8,
    tier: 'stagione',
  },
  {
    id: 'classic_gt',
    name: 'Leggende GT',
    nameEn: 'GT Legends',
    intro: 'Le GT che hanno fatto la storia si sfidano su un tracciato al tramonto.',
    prizeCar: { id: 'ferrari_288_gto', name: 'Ferrari 288 GTO' },
    guests: ['porsche_911_gt3_rs_992', 'lamborghini_countach_lp5000_qv'],
    guestNames: ['Jochen Mass', 'Stefan Roser'],
    tracks: ['imola', 'monza', 'donington_park', 'fuji'],
    weathers: [0, 0, 2],
    laps: 8,
    hour: 18,
    timeScale: 1,
    money: 9000,
    rep: 10,
    tier: 'stagione',
  },
  {
    id: 'night_sprint',
    name: 'Notte Sprint',
    nameEn: 'Night Sprint',
    intro: 'Sprint notturna: giri contati, zero margini, fari accesi.',
    prizeCar: { id: 'audi_r8_lms_gt4_evo', name: 'Audi R8 LMS GT4 Evo' },
    guests: ['porsche_911_gt3_rs_992', 'mini_john_cooper_s'],
    guestNames: ['Nico Bakker', 'Luca Salgado'],
    tracks: ['laguna_seca', 'redbull_ring', 'kyalami'],
    weathers: [1],
    laps: 5,
    hour: 21,
    timeScale: 1,
    money: 6000,
    rep: 7,
    tier: 'stagione',
  },
  {
    id: 'legend_finale',
    name: 'Il Gran Finale dei Campioni',
    nameEn: 'The Champions’ Grand Finale',
    intro: tr({ it: "Invito d'onore a fine stagione: i migliori del paddock, una pista leggendaria, un'auto da sogno in palio.", en: 'End-of-season honor invite: the best of the paddock, one legendary track, a dream car at stake.' }),
    prizeCar: { id: 'lamborghini_countach_lp5000_qv', name: 'Lamborghini Countach LP5000 QV' },
    guests: ['porsche_911_gt3_rs_992', 'audi_r8_lms_gt4_evo', 'mini_john_cooper_s'],
    guestNames: ['Hans Stuck', 'Ayrton Senna Jr.', 'Tom Kristensen'],
    tracks: ['monza', 'imola', 'cota', 'redbull_ring'],
    weathers: [0],
    laps: 10,
    hour: 17,
    timeScale: 1,
    money: 15000,
    rep: 15,
    tier: 'finale',
  },
];

/* ------------------------------------------------------------------ */
/* stato                                                               */
/* ------------------------------------------------------------------ */

/** Nome del tema nella lingua attiva (nameEn può mancare nei vecchi inviti salvati). */
export function themeName(t) {
  return tr({ it: t?.name ?? '', en: t?.nameEn ?? t?.name ?? '' });
}

export function ensureEvents(state) {
  state.events ??= { active: null, history: [], showCase: [], lastRoundChecked: null };
  state.events.history ??= [];
  state.events.showCase ??= [];
  return state.events;
}

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

/** True se l'auto esiste nel contenuto del gioco (lista nomi/ids nota al tool). */
function carKnown(ladder, id) {
  const names = ladder.contentNames?.cars ?? {};
  const lower = Object.keys(names).map((k) => String(k).toLowerCase());
  const nameLc = String(names[id] ?? id).toLowerCase();
  return lower.includes(String(id).toLowerCase()) || lower.includes(nameLc) ||
    Object.values(names).some((v) => String(v).toLowerCase() === nameLc);
}

function pickTheme(ladder, { finale = false, seed = 1 } = {}) {
  const pool = THEMES.filter((t) => (finale ? t.tier === 'finale' : t.tier === 'stagione'));
  let list = pool.filter((t) => carKnown(ladder, t.prizeCar.id) || !ladder.contentNames?.cars);
  if (!list.length) list = pool; // meglio proporre comunque, con avviso
  return pick(list, seed);
}

/* ------------------------------------------------------------------ */
/* generazione inviti                                                  */
/* ------------------------------------------------------------------ */

/**
 * Chiamato dopo ogni import di gara di campionato: può far nascere un invito
 * "di stagione". Non crea nulla se c'è già un evento attivo o se la sorte dice no.
 */
export function maybeSpawnEvent(ladder, state, { seasonJustEnded = false } = {}) {
  const ev = ensureEvents(state);
  if (ev.active) return null;
  const racesRun = (state.results[state.node] ?? []).filter((r) => r.season === state.season).length;
  // dopo ogni gara: probabilità crescente (25%→65%) dal 2° giro di stagione, MA nelle
  // prime stagioni di carriera gli inviti sono rari (visione "dalla 500": prima i
  // campionati, poi le star events). La chance è scalata al numero di stagione.
  let invite = null;
  const seasonFactor = [0, 0.4, 0.7, 0.85, 1][Math.min(state.season ?? 1, 4)] ?? 1;
  if (racesRun >= 2 && !seasonJustEnded && Math.random() < seasonFactor) {
    const chance = Math.min(0.65, 0.25 + 0.10 * (racesRun - 2)) * seasonFactor;
    if (Math.random() < chance) {
      const theme = pickTheme(ladder, { seed: Math.floor(Math.random() * 997) + racesRun });
      invite = buildInvite(ladder, state, theme, 'stagione', racesRun);
    }
  }
  // a fine stagione: invito garantito al Finale dei Campioni
  if (seasonJustEnded && !invite) {
    const theme = pickTheme(ladder, { finale: true, seed: state.season });
    invite = buildInvite(ladder, state, theme, 'finale', racesRun);
  }
  if (!invite) return null;
  ev.active = invite;
  pushMessage(state, tr({ it: `${themeName(invite.theme)}: sei stato invitato a un evento speciale. Guarda il pannello Eventi nel Cruscotto.`, en: `${themeName(invite.theme)}: you have been invited to a special event. Check the Events panel on the Dashboard.` }), 'event');
  try {
    publishNotice(tr({ it: `Invito speciale: ${themeName(invite.theme)}`, en: `Special invite: ${themeName(invite.theme)}` }), invite.theme.intro, { season: state.season, kind: 'event' });
  } catch { /* la gazzetta non deve bloccare */ }
  return invite;
}

function buildInvite(ladder, state, theme, tier, racesRun) {
  const names = ladder.contentNames?.tracks ?? {};
  const trackId = pick(theme.tracks, Math.floor(Math.random() * theme.tracks.length) + state.season * 7 + racesRun);
  const trackDisplay = names[trackId] ?? trackId;
  const weather = pick(theme.weathers, Math.floor(Math.random() * 31) + state.season);
  const prize = theme.prizeCar;
  const owned = state.events.showCase.some((c) => c.carId === prize.id);
  // premio: se l'auto è già in vetrina, si trasforma in Liquidità extra
  const moneyPrize = owned ? Math.round(theme.money * 1.4) : theme.money;
  return {
    id: `ev_${state.season}_${Date.now()}`,
    kind: 'special-race',
    tier, // 'stagione' | 'finale'
    createdAt: new Date().toISOString(),
    season: state.season,
    afterRound: racesRun,
    theme: { id: theme.id, name: theme.name, nameEn: theme.nameEn ?? theme.name, intro: theme.intro },
    trackId, trackDisplay, weather,
    laps: theme.laps, hour: theme.hour, timeScale: theme.timeScale,
    guests: theme.guestNames,
    prize: { carId: prize.id, carName: prize.name, money: moneyPrize, rep: theme.rep, duplicateCash: owned },
    deadlineRounds: tier === 'finale' ? 99 : 2, // di stagione: va corsa entro 2 gare di campionato
  };
}

/* ------------------------------------------------------------------ */
/* azioni del giocatore                                                */
/* ------------------------------------------------------------------ */

export function acceptEvent(ladder, state, eventId) {
  const ev = ensureEvents(state);
  if (!ev.active || ev.active.id !== eventId) throw new Error(tr({ it: 'Invito non trovato o già scaduto.', en: 'Invite not found or already expired.' }));
  ev.active.acceptedAt = new Date().toISOString();
  pushMessage(state, tr({ it: `Accettato l'invito: ${themeName(ev.active.theme)} su ${ev.active.trackDisplay}. La scheda gara è nel pannello Eventi.`, en: `Invite accepted: ${themeName(ev.active.theme)} on ${ev.active.trackDisplay}. The race sheet is in the Events panel.` }), 'event');
  return ev.active;
}

export function declineEvent(ladder, state, eventId) {
  const ev = ensureEvents(state);
  if (!ev.active || ev.active.id !== eventId) throw new Error(tr({ it: 'Invito non trovato o già scaduto.', en: 'Invite not found or already expired.' }));
  ev.history.push({ ...ev.active, declinedAt: new Date().toISOString(), outcome: 'declined' });
  pushMessage(state, tr({ it: `Invito rifiutato: ${themeName(ev.active.theme)}. Magari la prossima.`, en: `Invite declined: ${themeName(ev.active.theme)}. Maybe next time.` }), 'info');
  ev.active = null;
  return true;
}

/** Scadenza naturale: gli inviti 'stagione' non accettati entro N gure di campionato svaniscono. */
export function expireEvents(ladder, state) {
  const ev = ensureEvents(state);
  if (!ev.active || ev.active.tier !== 'stagione' || !ev.active.acceptedAt) return false;
  const racesRun = (state.results[state.node] ?? []).filter((r) => r.season === state.season).length;
  if (racesRun - ev.active.afterRound > ev.active.deadlineRounds) {
    ev.history.push({ ...ev.active, outcome: 'expired' });
    pushMessage(state, tr({ it: `L'invito a ${themeName(ev.active.theme)} è scaduto: dovevi correrlo entro ${ev.active.deadlineRounds} gare.`, en: `The invitation to ${themeName(ev.active.theme)} expired: you had to race it within ${ev.active.deadlineRounds} races.` }), 'info');
    ev.active = null;
    return true;
  }
  return false;
}

/**
 * Registra il risultato della gara speciale. input: { position, bestLapSec }.
 * Vittoria (position 1) = auto in vetrina + soldi + rep; altri piazzamenti = soldi scalati.
 */
export function finishEvent(ladder, state, { position, bestLapSec = null, note = null } = {}) {
  const ev = ensureEvents(state);
  const a = ev.active;
  if (!a || !a.acceptedAt) throw new Error('Nessuna gara speciale in corso.');
  const pos = Math.max(1, Math.min(30, Math.round(Number(position))));
  const prize = a.prize;
  const scale = pos === 1 ? 1 : pos <= 3 ? 0.5 : pos <= 6 ? 0.25 : 0;
  const money = Math.round(prize.money * scale);
  const rep = Math.round(prize.rep * (pos === 1 ? 1 : 0.4));
  const won = pos === 1;

  ev.history.push({
    ...a, finishedAt: new Date().toISOString(), outcome: won ? 'won' : 'finished',
    position: pos, bestLapSec, moneyWon: money, repWon: rep,
  });

  if (money > 0) {
    state.money += money;
    recordFlows(state, [{ kind: 'bonus', money, reason: tr({ it: `evento speciale ${themeName(a.theme)} (P${pos})`, en: `special event ${themeName(a.theme)} (P${pos})` }) }]);
  }
  if (rep > 0) state.rep += rep;

  let showcaseEntry = null;
  if (won && !prize.duplicateCash) {
    showcaseEntry = { carId: prize.carId, carName: prize.carName, theme: a.theme.name, themeEn: a.theme.nameEn ?? null, season: state.season, at: new Date().toISOString(), bestLapSec };
    ev.showCase.push(showcaseEntry);
    pushMessage(state, tr({ it: `🏆 Auto vinta: ${prize.carName} entra in vetrina! (${themeName(a.theme)})`, en: `🏆 Car won: ${prize.carName} enters the trophy room! (${themeName(a.theme)})` }), 'title');
    try { publishNotice(tr({ it: `${state.driver.name} vince ${prize.carName}`, en: `${state.driver.name} wins ${prize.carName}` }), tr({ it: `${themeName(a.theme)}: vittoria e auto leggendaria in vetrina.`, en: `${themeName(a.theme)}: win and legendary car in the trophy room.` }), { season: state.season, kind: 'event' }); } catch { /* pazienza */ }
  }

  pushMessage(state, won
    ? tr({ it: `Vinto l'evento ${themeName(a.theme)} (P1)! Premio: ${prize.duplicateCash ? `${money} € (auto già in vetrina)` : prize.carName + ' + ' + money + ' €'}${rep ? `, +${rep} rep` : ''}.`, en: `Event ${themeName(a.theme)} won (P1)! Prize: ${prize.duplicateCash ? `${money} € (car already in the trophy room)` : prize.carName + ' + ' + money + ' €'}${rep ? `, +${rep} rep` : ''}.` })
    : tr({ it: `Evento ${themeName(a.theme)} chiuso in P${pos}: ${money ? money + ' €' : 'nessun premio'}${rep ? `, +${rep} rep` : ''}.`, en: `Event ${themeName(a.theme)} closed in P${pos}: ${money ? money + ' €' : 'no prize'}${rep ? `, +${rep} rep` : ''}.` }), won ? 'good' : 'info');
  a.outcome = won ? 'won' : 'finished';
  ev.active = null;
  recordWarning('events', tr({ it: `evento registrato: ${themeName(a.theme)} P${pos}`, en: `event recorded: ${themeName(a.theme)} P${pos}` }), `money:${money} rep:${rep}`);
  return { position: pos, money, rep, won, showcaseEntry, history: ev.history };
}

/* ------------------------------------------------------------------ */
/* scheda gara (per la GUI)                                            */
/* ------------------------------------------------------------------ */

/** Le impostazioni da inserire in EVO, in stile raceCard. */
export function eventCard(ladder, state) {
  const ev = ensureEvents(state);
  const a = ev.active;
  if (!a) return null;
  const theme = THEMES.find((t) => t.id === a.theme.id);
  const names = ladder.contentNames?.cars ?? {};
  const guestsKnown = (theme?.guests ?? []).map((id) => names[id] ?? id);
  const settings = [
    ['Modalità', 'Gara personalizzata (Custom Race: gara singola)'],
    ['Pista', a.trackDisplay],
    ['Auto', prizeOrOwnedLabel(ladder, state, a)],
    ['Avversari', `${a.guests.length + 2} auto (2-3 ospiti d'eccezione)`],
    ['Difficoltà AI', 'usa il consiglio della serie in corso (il tool lo mostra qui sotto)'],
    ['Aggressività AI', 'lasciala com\'è (bloccata in EVO)'],
    ['Gara', `${a.laps} giri (tempo reale)`],
    ['Moltiplicatore tempo', '1x'],
    ['Ora del giorno', `${String(a.hour).padStart(2, '0')}:00`],
    ['Meteo', a.weather === 0 ? 'Clear' : a.weather === 1 ? 'Light rain' : 'Cloudy'],
    ['Partenza', 'da fermo (griglia)'],
    ['Pit obbligatorio', 'no'],
    ['Danni', 'leggeri'],
  ];
  return {
    ...a,
    settings,
    guestsKnown,
    showCase: ev.showCase,
    history: ev.history.slice(-8).reverse(),
  };
}

function prizeOrOwnedLabel(ladder, state, a) {
  const ev = ensureEvents(state);
  const owned = ev.showCase.find((c) => c.carId === a.prize.carId);
  return owned
    ? tr({
        it: `${owned.carName} (la tua, vinta in ${owned.theme})`,
        en: `${owned.carName} (yours, won in ${owned.themeEn ?? owned.theme})`,
      })
    : tr({
        it: `${a.prize.carName} — è il premio: chi vince la porta a casa`,
        en: `${a.prize.carName} — it is the prize: whoever wins takes it home`,
      });
}

/* ------------------------------------------------------------------ */
/* vista pannello                                                      */
/* ------------------------------------------------------------------ */

export function eventsOverview(ladder, state) {
  const ev = ensureEvents(state);
  const nameOf = (t) => (t ? { ...t, name: themeName(t) } : t);
  return {
    active: ev.active && { ...ev.active, theme: nameOf(ev.active.theme) },
    card: eventCard(ladder, state),
    // vetrina e storia mostrate nella lingua attiva; nel raw restano quelle di nascita
    showCase: ev.showCase.slice().reverse().map((c) => ({ ...c, theme: tr({ it: c.theme, en: c.themeEn ?? c.theme }) })),
    history: ev.history.slice(-10).reverse().map((h) => ({ ...h, theme: nameOf(h.theme) })),
  };
}
