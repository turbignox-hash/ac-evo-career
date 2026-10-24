// mailbox.mjs — la POSTA del pilota: email generate al momento dallo stato
// della carriera (niente da salvare, niente da migrare).
//
// Regola del restyling (scelta Mauro 21/10/2026, dopo la posta a 14 urgenti):
// UNA EMAIL = UNA DECISIONE da prendere OGGI. Non "una gara = una mail":
// le gare dello stesso orizzonte viaggiano RAGGRUPPATE in una sola email,
// il direttore di corsa parla una volta sola per finestra temporale, e la
// priorità urgente spetta solo a ciò che esige un'azione entro oggi/domani.
// Obiettivo: la casella si legge in 20 secondi, non si ignora all'istante.

import { nodeById } from './state.mjs';
import { sponsorFor, sponsorOffers } from './life.mjs';
import { nemesisReport, raceBulletin } from './rivals.mjs';
import { tr } from './lang.mjs';

import {
  agendaDay, dateLabel, impegni, choicesForDay, nextUnplayedRound,
  MAX_SCELTE_PER_GIORNO, prossimoGiornoConGara, racesOnDay,
} from './agenda.mjs';

/** Orizzonte (in giorni) dell'email settimanale raggruppata del direttore di corsa. */
const ORIZZONTE_GIORNI = 7;

/** Icona meteo dal nome (i nomi ladder sono INGLESI: Clear/Scattered
 *  clouds/Overcast/Light rain/Rain/Heavy rain) — più le nostre italiane. */
const METEO_ICON = {
  'sereno': '☀️', 'nuvole sparse': '🌤️', 'nuvoloso': '☁️', 'coperto': '☁️',
  'pioggia leggera': '🌦️', 'pioggia': '🌧️', 'pioggia intensa': '⛈️', 'custom': '🎲',
  'clear': '☀️', 'scattered clouds': '🌤️', 'overcast': '☁️', 'cloudy': '☁️',
  'light rain': '🌦️', 'drizzle': '🌦️', 'rain': '🌧️', 'heavy rain': '⛈️',
};
const meteoIcon = (nome) => METEO_ICON[String(nome ?? '').toLowerCase()] || (nome ? '🌫️' : '');
/** Notte o giorno? Dall'ora di gara (piani orario scritti da orario.mjs): il
 *  dato doveva stare NELLA MAIL, non solo nel calendario (richiesta Mauro). */
const eNotte = (h) => h != null && (h <= 5 || h >= 21);

const takOrario = (r) => {
  const wx = r.weather ? `${meteoIcon(r.weather)} ${r.weather}` : '';
  const no = eNotte(r.hour) ? ' · ' + tr({ it: '🌙 notte', en: '🌙 night' }) : (r.hour != null && (r.hour >= 19 || r.hour <= 8) ? ' · ' + tr({ it: '🌅 luce bassa', en: '🌅 low light' }) : '');
  return wx || no ? ` · ${wx}${no}` : '';
};

export function mailbox(ladder, state) {
  const mails = [];
  const oggi = agendaDay(state);
  const oggiLabel = dateLabel(oggi);
  let n = 0;
  const add = (kind, from, oggetto, corpo, priorita = 'normale', action = null) => {
    mails.push({ id: `m${++n}`, kind, from, oggetto, corpo, date: oggiLabel, priorita, action });
  };

  /* ==== RACING: il direttore di corsa parla UNA volta per finestra ====
     Vecchia posta: 5 gare × (DOMANI + TRA 2 GIORNI) + 3 IN RITARDO = 13 email
     gemelle. Ora: UNA email "in ritardo" che elenca tutte le gare scadute
     (solo se ce ne sono) + UNA email "settimana in arrivo" raggruppata. */

  // Le gare TUOE (sedili attivi): prossima ronda non corsa per ogni serie iscritta.
  const mie = [];
  for (const nodeId of Object.keys(state.seats ?? {})) {
    let node;
    try { node = nodeById(ladder, nodeId); } catch { continue; }
    const r = nextUnplayedRoundSafe(ladder, state, node);
    if (r) {
      // CHIAVI DI CLICK (rule Mauro 21/10: i nomi cliccabili aprono le schede):
      // nodeId = la serie (scheda gara), trackKey = la pista (libro piste)
      // METEO NELLA MAIL (richiesta Mauro 21/10): "domani piove", "la prossima
      // è di notte" — i dati stanno già nel round del calendario, qui li racconto
      mie.push({ ...r, nodeId, trackKey: node.calendar?.[r.index]?.track ?? null });
    }
  }

  /* Gare IN RITARDO: UNA email sola che le elenca tutte. Nessuna gara si perde
     (restano corribili), ma ogni giorno in più è 0 punti: questa è la vera
     urgenza della casella, e merita un solo bullone compatto. */
  const ritardo = mie.filter((r) => r.day <= oggi);
  if (ritardo.length) {
    const righe = ritardo
      .sort((a, b) => a.day - b.day)
      .map((r) =>
        `• ${r.display} R${r.index + 1} — ${r.track}${takOrario(r)} — ${tr({ it: `doveva corrersi il ${dateLabel(r.day)} (${oggi - r.day} giorni di ritardo)`, en: `due on ${dateLabel(r.day)} (${oggi - r.day} days late)` })}`);
    add('Racing', tr({ it: 'Direttore di corsa', en: 'Race director' }),
      tr({ it: 'IN RITARDO', en: 'OVERDUE' }) + ': ' +
        (ritardo.length === 1
          ? `${ritardo[0].display} R${ritardo[0].index + 1} (${oggi - ritardo[0].day} ${tr({ it: 'giorni', en: 'days' })})`
          : tr({ it: `${ritardo.length} gare di campionato`, en: `${ritardo.length} championship races` })),
      (ritardo.length === 1
        ? tr({ it: `La gara di ${ritardo[0].display} doveva corrersi il ${dateLabel(ritardo[0].day)}: sono ${oggi - ritardo[0].day} giorni di ritardo.`, en: `The ${ritardo[0].display} race was due on ${dateLabel(ritardo[0].day)}: it is ${oggi - ritardo[0].day} days late.` })
        : tr({ it: `Gare di campionato in ritardo:\n${righe.join('\n')}`, en: `Championship races overdue:\n${righe.join('\n')}` })) +
      '\n\n' + tr({ it: 'Nessuna gara si perde: si corre quando vuoi. In classifica però i rivali continuano a incassare: ogni round lasciato lì è 0 punti tuoi.', en: 'No race is lost: run it whenever you want. But rivals keep scoring in the standings: every round left behind is 0 points for you.' }),
      'urgente', { kind: 'vai-gara', rows: ritardo.map((r) => ({ nodeId: r.nodeId, trackKey: r.trackKey, label: `${r.display} R${r.index + 1}`, track: r.track })) });
  }

  /* Il SETTIMANALE del direttore di corsa: tutte le gare TUOLE dei prossimi
     ORIZZONTE_GIORNI giorni in UNA mail sola, ordinate per data. Urgente solo
     se una cade DOMANI: prima, è informazione, non allarme. */
  const sette = mie
    .filter((r) => r.day > oggi && r.day <= oggi + ORIZZONTE_GIORNI)
    .sort((a, b) => a.day - b.day);
  if (sette.length) {
    // RIGHE CLICCABILI: ogni riga porta le chiavi per aprire la scheda gara
    // (guardo il nodeId della serie) e la scheda pista (guardo il nome pista)
    const righe = sette.map((r) =>
      `${dateLabel(r.day)} — ${r.display} R${r.index + 1} @ ${r.track}` +
      (r.laps ? `, ${r.laps} giri` : '') +
      (r.hour != null ? `, ore ${String(r.hour).padStart(2, '0')}:00` : '') +
      (takOrario(r) ? ` (${tr({ it: takOrario(r).replace(' · ', '').trim() + ' — previsto dal calendario', en: takOrario(r).replace(' · ', '').trim() + ' — from the calendar' })})` : ''));
    const domani = sette.some((r) => r.day === oggi + 1);
    add('Racing', tr({ it: 'Direttore di corsa', en: 'Race director' }),
      tr({ it: `Questa settimana: ${sette.length} gara${sette.length === 1 ? '' : 'e'}${domani ? ' — DOMANI la prima' : ''}`, en: `This week: ${sette.length} race${sette.length === 1 ? '' : 's'}${domani ? ' — TOMORROW the first one' : ''}` }),
      righe.join('\n') +
      '\n\n' + tr({ it: `Da qui, ${ORIZZONTE_GIORNI} giorni di orizzonte. Il pulsante rosso "Prossima gara" nell'header porta al Cruscotto: scheda gara, checklist e iscrizione.`, en: `An ${ORIZZONTE_GIORNI}-day horizon from here. The red "Next race" button in the header takes you to the Dashboard: race card, checklist and registration.` }),
      domani ? 'urgente' : 'normale', { kind: 'vai-gara', rows: sette.map((r) => ({ nodeId: r.nodeId, trackKey: r.trackKey, label: `${r.display} R${r.index + 1}`, track: r.track })) });
  }

  /* Gara di campionato OGGI: la mail che decide la stagione (raggruppata,
     una sola anche se più campionati cadono lo stesso giorno). */
  const tavoletta = racesOnDay(ladder, state, oggi)
    .filter((g) => g.stato === 'iscritto' && state.seats?.[g.node.nodeId] && g.onSchedule);
  if (tavoletta.length) {
    add('Racing', tr({ it: 'Direttore di corsa', en: 'Race director' }),
      tr({ it: 'OGGI', en: 'TODAY' }) + ': ' + tr({ it: 'gara di campionato — ', en: 'championship race — ' }) + tavoletta.map((g) => `${g.node.display} R${g.index + 1}`).join(' + '),
      tavoletta
        .map((g) => tr({
          it: `${g.node.display}: R${g.index + 1} a ${g.track} (${g.laps ?? '—'} giri, ore ${String(g.hour).padStart(2, '0')}:00). Il campionato si disputa anche senza di te: se non prendi parte, la ronda va a tutti gli altri e tu prendi 0 punti.`,
          en: `${g.node.display}: R${g.index + 1} at ${g.track} (${g.laps ?? '—'} laps, ${String(g.hour).padStart(2, '0')}:00). The championship runs even without you: if you skip it, every other driver scores and you get 0 points.`,
        }))
        .join('\n\n') +
      '\n\n' + tr({ it: 'Imposta la gara nella finestra del gioco e a fine gara registra il risultato col watcher (o Risultati → importa).', en: 'Set the race in the game window and log the result with the watcher when it ends (or Results → import).' }),
      'urgente', { kind: 'vai-gara' });
  }

  /* Consulenza: contratti e scaletta del calendario */
  const scelte = choicesForDay(state, oggi);
  if (scelte.length >= 2) {
    add('Contratti', tr({ it: 'Il tuo manager', en: 'Your manager' }),
      tr({ it: `Questa giornata è già piena: ${scelte.length} gare selezionate`, en: `This day is already full: ${scelte.length} races picked` }),
      tr({ it: `Hai già puntato ${scelte.length} gare su ${MAX_SCELTE_PER_GIORNO} per oggi. Ricorda il rischio: ogni gara corsa avanza il calendario di un giorno, e se la giornata ti toglie tempo per un round del tuo campionato quel round vale 0 punti. Meglio puntare su una sola gara di campionato e usarla bene.`, en: `You have already booked ${scelte.length} of ${MAX_SCELTE_PER_GIORNO} races for today. Remember the risk: each race you run advances the calendar one day, and if the day eats the time for a round of your championship that round is worth 0 points. Better to focus on one championship race and use it well.` }),
      'normale');
  } else if (!Object.keys(state.seats ?? {}).length) {
    add('Contratti', tr({ it: 'Il tuo manager', en: 'Your manager' }),
      tr({ it: 'Nessun contratto attivo: il calendario ti aspetta', en: 'No active contract: the calendar is waiting for you' }),
      tr({ it: 'Niente campionati in corso. Guarda la strip calendario dell\u2019Agenda e firma quando scatta la giornata adatta: i contratti si sottoscrivono SOLO lì, il giorno delle gare. Le serie con lo strappo di reputazione adatto sono già pronte per la firma.', en: 'No championship running. Look at the calendar strip on the Agenda and sign when the right day comes: contracts are signed ONLY there, on race days. The series with the right reputation gap are already ready to sign.' }),
      'normale');
  }
  /* Conflitti tra impegni: UNA email sola che elenca tutte le giornate in
     conflitto (non una mail per serie coinvolta). */
  const impegniInfo = impegni(ladder, state);
  if (impegniInfo.conflitti.length) {
    const righe = impegniInfo.conflitti.map((c) =>
      `${c.date} — ${c.gare.map((g) => `${g.display} R${g.roundIndex + 1}`).join(' + ')}`);
    add('Contratti', tr({ it: 'Il tuo manager', en: 'Your manager' }),
      tr({
        it: `Conflitti di calendario: ${impegniInfo.conflitti.length} giornat${impegniInfo.conflitti.length === 1 ? 'a in conflitto' : 'e in conflitto'}`,
        en: `Calendar conflicts: ${impegniInfo.conflitti.length} day${impegniInfo.conflitti.length === 1 ? '' : 's'} in conflict`,
      }),
      righe.join('\n\n') +
      '\n\n' + tr({ it: 'Risolvi dall\u2019Agenda col bottone sposta: la serie scelta si sposta di una settimana e la cadenza futura si ricalibra. Non iscriverti a troppi campionati insieme se non vuoi saltare round (0 punti).', en: 'Fix it from the Agenda with the move button: the chosen series shifts by one week and the future cadence recalibrates. Do not sign up for too many championships at once unless you want to skip rounds (0 points).' }),
      'urgente', { kind: 'vai-agenda' });
  }

  /* BOLLETTINO dell'ultima gara importata: il racconto del risultato, non un
     promemoria. Chi ti ha battuto, chi hai superato — nomi con la chiave rivale
     per la GUI (scheda pilota a un clic). Solo se la gara è recente (7 giorni). */
  try {
    const b = raceBulletin();
    if (b) {
      const diaPrima = b.davanti.length
        ? tr({ it: `Davanti a te: ${b.davanti.map((d) => d.name).join(', ')}.`, en: `Ahead of you: ${b.davanti.map((d) => d.name).join(', ')}.` })
        : tr({ it: 'Nessuno davanti: sei salito in cima.', en: 'Nobody ahead: you are on top.' });
      const dietro = b.dietro.length ? ` ${tr({ it: `Appena dietro: ${b.dietro[0].name}.`, en: `Right behind: ${b.dietro[0].name}.` })}` : '';
      add('Racing', tr({ it: 'Direttore di corsa', en: 'Race director' }),
        tr({ it: 'Bollettino', en: 'Bulletin' }) + `: ${b.node} — ${b.mePos != null ? 'P' + b.mePos : tr({ it: 'ritiro', en: 'retirement' })} @ ${b.track}`,
        `${diaPrima}${dietro}\n\n${tr({ it: 'La classifica completa e i tuoi giri: Cruscotto e Risultati.', en: 'The full standings and your laps: Dashboard and Results.' })}`,
        'normale', { kind: 'bollettino', rivals: [...b.davanti.map((d) => ({ key: d.key, name: d.name })), ...b.dietro.map((d) => ({ key: d.key, name: d.name }))] });
    }
  } catch { /* il registro rivali potrebbe essere assente: la posta non si blocca */ }

  /* CONTO con la NEMESI: se c'è chi ti domina (streak ≥2 o 3 battute), la faida
     parla da sola: le piste dove ti prende e quelle dove lo torni. Cliccabile.
     Si mostra ogni 3 giorni (streak corto e atterratto: non spammo). */
  try {
    const nem = nemesisReport();
    if (nem) {
      const doveDolora = nem.beatsMeAt.length ? tr({ it: `Ti prende a: ${nem.beatsMeAt.slice(0, 4).join(', ')}.`, en: `He gets you at: ${nem.beatsMeAt.slice(0, 4).join(', ')}.` }) : '';
      const doveTorni = nem.losesAt.length ? ` ${tr({ it: `Dove lo torni: ${nem.losesAt.slice(0, 3).join(', ')}.`, en: `Where you beat him back: ${nem.losesAt.slice(0, 3).join(', ')}.` })}` : '';
      add('Racing', tr({ it: 'La tua nemesi', en: 'Your nemesis' }),
        `${nem.name} ${nem.nemesis ? '— ' + tr({ it: 'la nemesi', en: 'the nemesis' }) : ''}: ${nem.h2h.beats}\u2013${nem.h2h.losses}`,
        `${nem.streak > 0 ? tr({ it: `${nem.streak} sconfitte consecutive inflitte. `, en: `${nem.streak} straight defeats inflicted. ` }) : ''}${doveDolora}${doveTorni}\n\n${tr({ it: 'Il conto lo chiudi in pista: la prossima volta che lo incontri ti conviene stare davanti.', en: 'Settle it on track: next time you meet, be in front.' })}`,
        'normale', { kind: 'vai-rivale', rivalKey: nem.key, name: nem.name });
    }
  } catch { /* il registro rivali potrebbe essere assente: la posta non si blocca */ }

  /* Prossima gara di campionato a calendario, FUORI dall'orizzonte settimanale
     (dentro l'orizzonte c'è già il settimanale: non duplichiamo). */
  const prox = prossimoGiornoConGara(ladder, state);
  if (prox != null && prox > oggi + ORIZZONTE_GIORNI) {
    const solo = racesOnDay(ladder, state, prox)
      .filter((g) => g.stato === 'iscritto' && state.seats?.[g.node.nodeId] && !g.late);
    if (solo.length) {
      add('Racing', tr({ it: 'Direttore di corsa', en: 'Race director' }),
        tr({ it: `Prossimo appuntamento: ${dateLabel(prox)}`, en: `Next date: ${dateLabel(prox)}` }),
        solo.map((g) => `${g.node.display} R${g.index + 1} — ${g.track} (${g.laps ?? '—'} ${tr({ it: 'giri', en: 'laps' })})`).join('\n') +
        '\n\n' + tr({ it: `Da qui ci sono ${prox - oggi} giorni. Tempo per un test in quaderno prove, un setup e una qualifica pulita.`, en: `${prox - oggi} days from here. Time for a test session, a setup and a clean qualifying.` }),
        'normale', { kind: 'vai-gara' });
    }
  }

  /* Sponsor: riepilogo + stato della missione */
  const sp = sponsorFor(state);
  if (sp) {
    const rimasti = Math.max(0, (sp.deadlineRound ?? 0) - (sp.roundsPaid ?? 0));
    const missione = sp.missionDone
      ? tr({ it: 'Missione sponsor già centrata: il bonus è incassato.', en: 'Sponsor mission already complete: the bonus has been banked.' })
      : tr({ it: `Missione a tema: ${sp.name} paga +${sp.bonus} se entro il round ${sp.deadlineRound + 1} sali sul podio. Restano ${rimasti} gare.`, en: `Themed mission: ${sp.name} pays +${sp.bonus} if you reach the podium by round ${sp.deadlineRound + 1}. ${rimasti} races left.` });
    add('Sponsor', sp.name,
      tr({ it: 'Il nostro programma è attivo', en: 'Our programme is active' }),
      tr({
        it: `Quota a gara: ${sp.perRace} €. ${missione}\n\nFondo spettatori: le piste più affollate del calendario portano fino a +50% oltre la quota: guarda "attesa pubblico" nelle card gara.`,
        en: `Per-race fee: ${sp.perRace} €. ${missione}\n\nCrowd fund: the busiest tracks on the calendar can add up to +50% on top of the fee: check "crowd waiting" on race cards.`,
      }),
      'normale');
  } else if (state.money < 8000) {
    add('Sponsor', tr({ it: 'Ufficio sponsorizzazioni', en: 'Sponsorship office' }),
      tr({ it: 'La cassa è stretta: serve uno sponsor', en: 'Money is tight: you need a sponsor' }),
      tr({ it: `Hai ${state.money} € in banca e nessuno sponsor in campo. Le iscrizioni e gli affitti dei sedili ogni round pesano: cerca un podio o due per attirare l\u2019attenzione, oppure difendi la cassa con la distanza gara ridotta (25%).`, en: `You have ${state.money} € in the bank and no sponsor in play. Entry fees and seat rent each round add up: chase a podium or two to attract attention, or defend the bank with the reduced race distance (25%).` }),
      'urgente', { kind: 'sponsor-broke' });
  }
  /* Proposte di sponsor in arrivo: l'email porta l'AZIONE con sé (tier),
     così dalla posta si firma direttamente senza cercare il pannello. */
  try {
    const proposte = sponsorOffers(ladder, state);
    for (const p of (proposte ?? []).slice(0, 3)) {
      add('Sponsor', p.name ?? tr({ it: 'Ufficio sponsorizzazioni', en: 'Sponsorship office' }),
        `${tr({ it: 'Proposta', en: 'Proposal' })}: ${p.name ?? 'sponsor'}`,
        `${p.tier ? tr({ it: 'Tier', en: 'Tier' }) + ' ' + p.tier + '. ' : ''}${p.perRace ? p.perRace + ` ${tr({ it: '€ a gara. ', en: '€ per race. ' })}` : ''}${p.bonus ? '+' + p.bonus + ' € ' + (p.missionText ? tr({ it: `con la missione ${p.missionText}`, en: `with the mission ${p.missionText}` }) : tr({ it: 'con la missione a tema', en: 'with the themed mission' })) + '.' : ''}\n${tr({ it: 'Firmi qui sotto, o dalla sezione VITA FUORI PISTA del Cruscotto.', en: 'Sign below, or from the LIFE OFF TRACK section of the Dashboard.' })}`,
        'normale', { kind: 'sponsor-sign', tier: p.tier ?? null, name: p.name ?? 'sponsor' });
    }
  } catch { /* sponsorOffers potrebbe non esistere (build vecchie): mai bloccare la posta */ }

  /* Carriera: lo sblocco più vicino di reputazione */
  let bestGate = null, bestDist = Infinity;
  for (const node of ladder.nodes) {
    if (state.seats?.[node.nodeId]) continue;
    const dist = (node.repRequired ?? 0) - (state.rep ?? 0);
    if (dist > 0 && dist < bestDist) { bestDist = dist; bestGate = node; }
  }
  if (bestGate) {
    add('Carriera', tr({ it: 'Il tuo manager', en: 'Your manager' }),
      tr({ it: `A soli ${bestDist} punti di reputazione da ${bestGate.display}`, en: `Only ${bestDist} reputation points away from ${bestGate.display}` }),
      tr({ it: `Ora hai ${state.rep} reputazione, ${bestGate.display} vuole ${bestGate.repRequired ?? 0}. Continua a fare podi nelle serie già aperte: ogni round nelle serie basse vale ancora reputazione (finché il trim resta in pista). E ricorda: le gare "iconiche" pagano reputazione ×1,25.`, en: `You now have ${state.rep} reputation, ${bestGate.display} requires ${bestGate.repRequired ?? 0}. Keep taking podiums in the series you already opened: every round in the lower series still earns reputation (as long as the trim stays on track). And remember: "iconic" races pay reputation ×1.25.` }),
      'normale', { kind: 'vai-classifica' });
  }
  /* trim di difficoltà in attesa di firma */
  const pend = state.difficulty?.pending;
  if (pend) {
    add('Carriera', tr({ it: 'Il tecnico di pista', en: 'Track technician' }),
      tr({ it: 'Il trim della difficoltà aspetta la tua firma', en: 'The difficulty trim is waiting for your signature' }),
      tr({ it: `La proposta del tool (trim ${pend.trim ?? '?'} su ${pend.node ?? 'la serie'}) non è ancora accettata né rifiutata. Vai su Difficoltà e decidi: il trim opportuno ti tiene in fase e i rivali continuano a essere onesti.`, en: `The tool's proposal (trim ${pend.trim ?? '?'} on ${pend.node ?? 'the series'}) is neither accepted nor declined yet. Go to Difficulty and decide: the right trim keeps you in phase and rivals stay honest.` }),
      'normale');
  }
  return { mails, oggi: oggiLabel, day: oggi };
}

/** Prossima ronda non corsa di una serie iscritta, blindata: se la serie non
 *  ha rondine futura (stagione completa) o il calendario risponde male, ritorna
 *  null invece di far inciampare tutta la posta. */
function nextUnplayedRoundSafe(ladder, state, node) {
  try {
    const r = nextUnplayedRound(ladder, state, node);
    if (!r || r.scheduledDay == null) return null;
    return {
      display: node.display,
      index: r.index,
      track: r.track,
      laps: r.laps ?? null,
      hour: r.hour ?? null,
      weather: r.weather ?? null,
      day: r.scheduledDay,
    };
  } catch { return null; }
}
