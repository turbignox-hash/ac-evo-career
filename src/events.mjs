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
import { TRACK_INFO } from './tracks.mjs';
import { sameTrack, matchesAnyTrack } from './tracknames.mjs';
import { pushMessage } from './state.mjs';
import { publishNotice } from './gazzetta.mjs';
import { recordWarning } from './warnings.mjs';
import { listResultFiles, readSessionResult, isRaceSession, findPlayerDriver, classify, lapToMs } from './results.mjs';

/* ------------------------------------------------------------------ */
/* premio: auto non possedute                                          */
/* ------------------------------------------------------------------ */

/**
 * CHOOSER del premio (richesta Mauro 23/10: "un'auto diversa che non ho
 * già in garage per questi eventi"). Regole:
 *  - le auto già possedute NON tornano come premio: possedute = vetrina
 *    eventi (state.events.showCase) + garage (state.garage.cars);
 *  - se la prima scelta del tema è già tua si passa alle riserve AUTO del
 *    tema (altPrizes, in ordine, con un po' di caso);
 *  - se TUTTE sono in tuo possesso scatta l'unico caso legacy: liquidità
 *    extra x1,4 (duplicateCash), esattamente come prima;
 *  - a invito già nato la scelta NON cambia da sola: il premio si cuoce
 *    nell'invito (refreshActivePrize serve per correggerlo a mano).
 */
export function choosePrize(ladder, state, theme, { seed = 1 } = {}) {
  ensureEvents(state);
  const owned = new Set([
    ...(state.events.showCase ?? []).map((c) => c.carId),
    ...(state.garage?.cars ?? []).map((c) => c.carId),
  ]);
  const list = [theme.prizeCar, ...(theme.altPrizes ?? [])];
  const free = list.filter((p) => !owned.has(p.id));
  if (!free.length) {
    // tutte possedute (o tema senza riserve e premi già in garage):
    // resta il comportamento storico, liquidità extra
    return { carId: theme.prizeCar.id, carName: theme.prizeCar.name, duplicateCash: true, alternatives: [] };
  }
  const picked = free.length === 1 ? free[0] : pick(free, seed);
  return { carId: picked.id, carName: picked.name, duplicateCash: false, alternatives: free.length - 1 };
}

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
    introEn: "The '80s monsters return to the track for one night: noise, turbos and fear.",
    prizeCar: { id: 'peugeot_205_t16', name: 'Peugeot 205 T16' },
    // riserve Group B presenti davvero in EVO: se la 205 T16 è già tua non ritorna
    altPrizes: [
      { id: 'audi_sport_quattro', name: 'Audi Sport quattro' },
      { id: 'renault_5_gt_turbo', name: 'Renault 5 GT Turbo' },
    ],
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
    introEn: 'The GTs that made history duel on a track at sunset.',
    prizeCar: { id: 'ferrari_288_gto', name: 'Ferrari 288 GTO' },
    // riserve GT classiche: Porsche 935 e 964 Turbo, auto reali di EVO
    altPrizes: [
      { id: 'porsche_935', name: 'Porsche 935' },
      { id: 'porsche_964_turbo_3_6', name: 'Porsche 911 Turbo 3.6 (964)' },
    ],
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
    introEn: 'Night sprint: counted laps, zero margins, headlights on.',
    prizeCar: { id: 'audi_r8_lms_gt4_evo', name: 'Audi R8 LMS GT4 Evo' },
    // riserve racing: M4 GT3 / X-Bow GT2
    altPrizes: [
      { id: 'bmw_m4_gt3', name: 'BMW M4 GT3' },
      { id: 'ktm_xbow_gt2', name: 'KTM X-Bow GT2' },
    ],
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
    intro: "Invito d'onore a fine stagione: i migliori del paddock, una pista leggendaria, un'auto da sogno in palio.",
    introEn: 'End-of-season honor invite: the best of the paddock, one legendary track, a dream car at stake.',
    prizeCar: { id: 'lamborghini_countach_lp5000_qv', name: 'Lamborghini Countach LP5000 QV' },
    // riserve da sogno per il finale: auto reali di EVO, senza duplicare
    // la Countach già portata a casa l'altra stagione
    altPrizes: [
      { id: 'ferrari_f40_lm', name: 'Ferrari F40 LM' },
      { id: 'dallara_stradale', name: 'Dallara Stradale' },
    ],
    // GRIGLIA MONOMARCA (richiesta Mauro 23/10: "solo Ferrari F40 — in premio
    // c'è un'auto e meglio che tutti siano alla pari"): il tool la COSTRUISCE
    // DA SOLO col builder (come il bottone Prepara tutto del campionato).
    // L'auto va però già presente nel template (zero-crash, la sorgente delle
    // celle resta il customgrid): l'ID è quello fotografato nella griglia
    // scritta a mano dal 23/10 — vede NOTE-AUTOMAZIONE.
    gridCars: ['ks_ferrari_f40_lm'],
    // STORIA BISECT 23/10: 5 = 4/4 crash → 14 = validata in gioco (log 20:48
    // E 20:57: due sessioni consecutive a 14, zero eccezioni) → 8 TRONCATA
    // (primi 8 piloti/celle + count=8) = CRASH (log 21:01:54: 0xC0000005 su
    // Render Worker 0, subito dopo aver trovato gli 8 avversari). Quindi NON
    // è la monotonia del conteggio: la 14 (che ha la STESSA provenienza tool
    // della 8) gira, la 8 e la 5 no. Bersaglio della caccia: la STRUTTURA del
    // file scritto dal tool sotto le 14 celle (diff 5/8 vs 14: qualcosa nel
    // file che EVO legge per vivere e non fornisce più quando gli oppati sono
    // meno di 14 — backup 8trunc:bak-prova8trunc-*). RISPOSTA SICURA per
    // giocare l'evento: griglia a 14, tornata sul disco dal bak-prova8-*.
    gridSize: 14,   // 14 per scelta della serie (verdetto 23/10 rev.4: il crash del gioco all'avvio è flaky e NON dipende dal conto della griglia)
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

/** Tema legacy per id o nome italiano dei vecchi salvataggi (senza nameEn):
 *  rimappare qui mantiene la traduzione disponibile una volta per tutti. */
const LEGACY_THEME = { 'Ritorno del Gruppo B': 'Return of Group B' };
export function legacyThemeNameEn(name) {
  const inThemes = THEMES.find((x) => x.name === name);
  return inThemes?.nameEn ?? LEGACY_THEME[name ?? ''] ?? null;
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

/**
 * Correzione dell'invito ATTIVO (per i vecchi inviti nati prima della correzione):
 * se il premio in palio è un'auto già posseduta (vetrina o garage) e il tema
 * ha riserve non possedute, sostituisce il premio con la riserva scelta; se
 * TUTTE le auto del tema sono già tue, resta la liquidità extra x1,4.
 * Ritorna il dettaglio per la GUI: { changed, prize, reason, message }.
 */
export function refreshActivePrize(ladder, state) {
  const ev = ensureEvents(state);
  const a = ev.active;
  if (!a) return { changed: false, prize: null, reason: 'no-active-event', message: tr({ it: 'Nessuna gara speciale attiva.', en: 'No active special race.' }) };
  const theme = THEMES.find((t) => t.id === a.theme.id);
  if (!theme) return { changed: false, prize: null, reason: 'theme-not-found', message: tr({ it: `Tema non nel catalogo: ${a.theme.id}`, en: `Theme not in the catalog: ${a.theme.id}` }) };
  const chosen = choosePrize(ladder, state, theme, { seed: Math.floor(Math.random() * 997) + state.season });
  const owned = (ev.showCase ?? []).some((c) => c.carId === a.prize.carId) ||
    (state.garage?.cars ?? []).some((c) => c.carId === a.prize.carId);
  // il premio attuale NON è posseduto: nessuna sostituzione (idempotente),
  // anche se il ripcalcolo casuale sceglierebbe un'altra riserva — l'invito
  // già nato resta quello che è
  if (!owned) {
    return { changed: false, prize: a.prize, reason: 'already-ok', message: tr({ it: `Il premio non è già tuo, resta così: ${a.prize.carName}.`, en: `The prize is not yours yet, leaving it as is: ${a.prize.carName}.` }) };
  }
  if (chosen.duplicateCash) {
    // tutte le auto del tema sono possedute: liquidità extra, come prima della correzione
    a.prize = { ...a.prize, money: Math.round(theme.money * 1.4), duplicateCash: true };
    pushMessage(state, tr({ it: `${themeName(a.theme)}: ${a.prize.carName} è già tua — premio in liquidità extra (${a.prize.money.toLocaleString('it-IT')} €).`, en: `${themeName(a.theme)}: ${a.prize.carName} is already yours — prize becomes extra cash (${a.prize.money} €).` }), 'event');
    return { changed: true, prize: a.prize, reason: 'duplicate-cash', message: tr({ it: `Auto in palio ${a.prize.carName} già tua: premio in liquidità extra.`, en: `Prize car ${a.prize.carName} already owned: prize becomes extra cash.` }) };
  }
  const before = a.prize.carName;
  a.prize = { carId: chosen.carId, carName: chosen.carName, money: theme.money, rep: theme.rep, duplicateCash: false };
  pushMessage(state, tr({ it: `Premio aggiornato di ${themeName(a.theme)}: ${before} era già tua — la nuova in palio è ${a.prize.carName}.`, en: `Prize of ${themeName(a.theme)} updated: ${before} was already yours — the new car at stake is ${a.prize.carName}.` }), 'event');
  return { changed: true, prize: a.prize, reason: 'replaced', message: tr({ it: `Premio sostituito: ${before} → ${a.prize.carName}.`, en: `Prize replaced: ${before} → ${a.prize.carName}.` }) };
}

function buildInvite(ladder, state, theme, tier, racesRun) {
  const trackId = pick(theme.tracks, Math.floor(Math.random() * theme.tracks.length) + state.season * 7 + racesRun);
  // i nomi delle PISTE (non delle auto): buildInvite è fuori da choosePrize,
  // dove `names` era definito (bug 24/10: ReferenceError a ogni invito speciale)
  const names = ladder.contentNames?.tracks ?? {};
  const trackDisplay = names[trackId] ?? trackId;
  const weather = pick(theme.weathers, Math.floor(Math.random() * 31) + state.season);
  // il premio NON è più fisso del tema: se l'auto da tema (o una riserva) è già
  // nel garage/in vetrina si passa alla prossima auto non posseduta (scelta
  // resa leggibile: 'duplicateCash' resta il caso limite tutto-in-tuo-possesso)
  const chosen = choosePrize(ladder, state, theme, { seed: Math.floor(Math.random() * 997) + state.season });
  const moneyPrize = chosen.duplicateCash ? Math.round(theme.money * 1.4) : theme.money;
  return {
    id: `ev_${state.season}_${Date.now()}`,
    kind: 'special-race',
    tier, // 'stagione' | 'finale'
    createdAt: new Date().toISOString(),
    season: state.season,
    afterRound: racesRun,
    // La griglia del tool va SNAPSHOTTATA A CREAZIONE (lezione 23/10): i prossimi
    // eventi portano gridCars/gridSize NEL tema salvato, così scheda, prep e
    // guard «regola della 14» non dipendono dal tema arricchito a runtime —
    // che il vecchio tema a 5 salvato (senza campi) faceva puntare male.
    theme: {
      id: theme.id,
      name: theme.name,
      nameEn: theme.nameEn ?? theme.name,
      intro: theme.intro,
      introEn: theme.introEn ?? theme.intro,
      ...(theme.gridCars ? { gridCars: theme.gridCars } : {}),
      ...(theme.gridSize ? { gridSize: theme.gridSize } : {}),
    },
    trackId, trackDisplay, weather,
    laps: theme.laps, hour: theme.hour, timeScale: theme.timeScale,
    guests: theme.guestNames,
    prize: { carId: chosen.carId, carName: chosen.carName, money: moneyPrize, rep: theme.rep, duplicateCash: chosen.duplicateCash },
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
export function finishEvent(ladder, state, { position, bestLapSec = null } = {}) {
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

/**
 * AUTOREGISSTRAZIONE dell'evento (richiesta Mauro 23/10: «ho dovuto cliccare
 * importa risultato a mano — si può fare automaticamente?» — sì: il file
 * risultato dell'evento è scritto da EVO come per le gare di campionato).
 *
 * Cerca il più recente file gara sulla pista dell'evento, scritto da quando la
 * gara è armata, e chiude l'evento con la posizione UFFICIALE del pilota
 * (penalità incluse, stessa lettura dell'import carriera) e il miglior giro.
 *
 * Ritorna:
 *   null                  → nessun evento accettato in corso: prosegui col
 *                            flusso normale (import di carriera)
 *   { waiting: motivo }   → file risultato non ancora leggibile: riprova
 *   { done, result, file } → evento chiuso in automatico (già persistato chi
 *                            chiama: qui NON si tocca il disco)
 */
export function autoFinishEventFromFile(ladder, state, { paths, sinceMs = null } = {}) {
  const ev = ensureEvents(state);
  const a = ev.active;
  if (!a || !a.acceptedAt) return null;
  const trackReal = eventTrackReal(a);
  const since = sinceMs ?? (Date.parse(a.acceptedAt ?? '') || Date.now()) - 60 * 1000;
  for (const f of listResultFiles(paths)) {
    if (f.mtime < since) break;                        // i file arrivano in ordine di tempo: il fronte è qui
    let result;
    try { result = readSessionResult(f.file); } catch { continue; }
    if (!isRaceSession(result)) continue;
    if (!matchesAnyTrack(result.track, [trackReal])) continue;
    const { driver } = findPlayerDriver(result, state.driver ?? { name: '' });
    if (!driver) return { waiting: `risultato su ${result.track}: il tuo pilota non è ancora leggibile` };
    const info = classify(result, { driver });
    if (!info.totalTime || Number(info.laps ?? 0) === 0) {
      return { waiting: `risultato su ${result.track}: gara ancora aperta o scrittura finita` };
    }
    const pos = info.dnf ? result.drivers.length : info.position;
    const bestLapSec = info.bestLap && Number.isFinite(lapToMs(info.bestLap)) ? lapToMs(info.bestLap) / 1000 : null;
    const res = finishEvent(ladder, state, { position: pos, bestLapSec, note: f.name });
    return {
      done: true, file: f.name,
      result: { ...res, rawPosition: info.rawPos, penalty: info.penalty, carName: a.prize?.carName ?? null },
    };
  }
  return { waiting: 'nessun file gara ancora sulla pista dell\u2019evento' };
}

/* ------------------------------------------------------------------ */
/* scheda gara (per la GUI)                                            */
/* ------------------------------------------------------------------ */

/** Alias id ladder → chiave del libro TRACK_INFO per gli id OPI quando il nome
 *  non corrisponde ('cota' vs 'circuit_of_the_americas' non colla ne per prefisso). */
const EVENT_TRACK_ALIAS = { cota: 'circuit_of_the_americas' };

/** L'id pista della ladder ('cota') col NOME VERO del libro Tracks
 *  ("Circuit Of The Americas"): è il nome che il gamemodesave e la scheda
 *  EVO si aspettano — l'id grezzo a schermo non si capisce e le stesse
 *  funzioni di cambio pista (set-track) risolvono solo nomi del libro.
 *  Match: chiave esatta (o via alias) → sameTrack contro name/fullName/display.
 */
export function eventTrackReal(a) {
  const id = a.trackId;
  const t = TRACK_INFO[id] ?? TRACK_INFO[EVENT_TRACK_ALIAS[id] ?? ''] ?? null;
  if (t) return t.name;
  for (const [k, x] of Object.entries(TRACK_INFO)) {
    if (sameTrack(x.name, id) || sameTrack(x.fullName ?? '', id) || sameTrack(x.name, a.trackDisplay) || sameTrack(k, id)) return x.name;
  }
  return a.trackDisplay;
}

/** L'auto che correrai l'evento: quella già in vetrina, o il premio da vincere. */
export function eventCarName(ladder, state, a) {
  const ev = ensureEvents(state);
  return ev.showCase.find((c) => c.carId === a.prize.carId)?.carName ?? a.prize.carName;
}

/** Le impostazioni da inserire in EVO, in stile raceCard. */
export function eventCard(ladder, state) {
  const ev = ensureEvents(state);
  const a = ev.active;
  if (!a) return null;
  const theme = THEMES.find((t) => t.id === a.theme.id);
  const names = ladder.contentNames?.cars ?? {};
  const guestsKnown = theme?.gridCars?.length
    ? [] // griglia monomarca costruita dal tool: gli ospiti d'eccezione non corrono
    : (theme?.guests ?? []).map((id) => names[id] ?? id);
  const trackReal = eventTrackReal(a);
  // tutte le piste della pool eventi sono mono-layout EVO: layout "GP" (la scritta
  // che il live-check di gara normale già si aspetta e ricompone dal campo layout)
  const layout = 'GP';
  const carReal = eventCarName(ladder, state, a);
  // DIFFICOLTÀ dell'evento: banda FISSA 88–93 su richiesta Mauro (23/10:
  // "88-93 anche per gli eventi") — non la banda della serie in corso (che nel
  // save era salita a 94-95) e non il vecchio "consiglio della serie": gli
  // invitati sono rivali mirate alla tua banda larga. event-prep la scrive
  // diretta nei campi 30/31 del gamemodesave.
  const EVENT_DIFF_RANGE = [88, 93];
  const diffBand = EVENT_DIFF_RANGE;
  const settings = [
    ['Modalità', 'Gara personalizzata (Custom Race: gara singola)'],
    ['Pista', `${trackReal} — layout ${layout}`],
    ['Auto', prizeOrOwnedLabel(ladder, state, a)],
    ['Avversari', theme?.gridCars?.length
      ? `${theme.gridSize ?? 14} in griglia — ${Math.max(0, (theme.gridSize ?? 14) - 1)} avversari, tutti ${theme.gridCars.map((id) => names[id] ?? id).join(', ')} (griglia scritta dal tool, tutti alla pari)`
      : `${a.guests.length + 2} auto (2-3 ospiti d'eccezione)`],
    ['Difficoltà AI', diffBand ? `${diffBand[0]}–${diffBand[1]} %` : 'usa il consiglio della serie in corso (il tool lo mostra qui sotto)'],
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
    // tema arricchito con la config del tema COMPLETO (gridCars/gridSize): serve
    // a event-prep per la griglia monomarca — il tema salvato alla CREAZIONE
    // dell'evento non ha quei campi (nati prima della griglia dal tool).
    theme: {
      ...a.theme,
      gridCars: theme?.gridCars ?? a.theme.gridCars ?? null,
      gridSize: theme?.gridSize ?? a.theme.gridSize ?? null,
    },
    // campi stile raceCard: servono a event-prep (cambio pista + auto) e alla
    // verifica live del pannello Eventi — non all'impostazione a mano
    trackName: trackReal,
    layout,
    carName: carReal,
    carChoices: [carReal],
    diffMin: diffBand[0],
    diffMax: diffBand[1],
    settings,
    guestsKnown,
    // scheda onesta: con la griglia monomarca del tool gli ospiti non corrono —
    // sovrascrive quelli già memorizzati alla creazione dell'evento attivo
    guests: guestsKnown,
    // ID AUTO degli ospiti (non solo i nomi): servono a event-prep per filtrare
    // le celle della griglia dal template (carIdOf del customgrid) — richiesta
    // Mauro 23/10: "impdota anche ora/giri/avversari per gli eventi".
    guestCarIds: theme?.guests ?? [],
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
        en: `${owned.carName} (yours, won in ${owned.themeEn ?? legacyThemeNameEn(owned.theme) ?? owned.theme})`,
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
  const nameOf = (t) => (t ? { ...t, name: themeName(t), intro: tr({ it: t.intro ?? '', en: t.introEn ?? THEMES.find((x) => x.id === t.id)?.introEn ?? t.intro ?? '' }) } : t);
  return {
    active: ev.active && { ...ev.active, theme: nameOf(ev.active.theme) },
    card: eventCard(ladder, state),
    // vetrina e storia mostrate nella lingua attiva; nel raw restano quelle di nascita
    showCase: ev.showCase.slice().reverse().map((c) => ({ ...c, theme: tr({ it: c.theme, en: c.themeEn ?? legacyThemeNameEn(c.theme) ?? c.theme }) })),
    history: ev.history.slice(-10).reverse().map((h) => ({ ...h, theme: nameOf(h.theme) })),
  };
}
