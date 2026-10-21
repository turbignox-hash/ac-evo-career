// mailbox.mjs — la POSTA del pilota: email generate al momento dallo stato
// della carriera (niente da salvare, niente da migrare).
//
// Regola del restyling (scelta Mauro 21/10/2026, dopo la posta a 14 urgenti):
// UNA EMAIL = UNA DECISIONE da prendere OGGI. Non "una gara = una mail":
// le gare dello stesso orizzonte viaggiano RAGGRUPPATE in una sola email,
// il direttore di corsa parla una volta sola per finestra temporale, e la
// priorità urgente spetta solo a ciò che esige un'azione entro oggi/domani.
// Obiettivo: la casella si legge in 20 secondi, non si ignora all'istante.

import { nodeById, gateStatus } from './state.mjs';
import { sponsorFor, sponsorOffers } from './life.mjs';
import { nemesisReport, raceBulletin } from './rivals.mjs';

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
  const no = eNotte(r.hour) ? ' · 🌙 notte' : (r.hour != null && (r.hour >= 19 || r.hour <= 8) ? ' · 🌅 luce bassa' : '');
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
        `• ${r.display} R${r.index + 1} — ${r.track}${takOrario(r)} — doveva corrersi il ${dateLabel(r.day)} (${oggi - r.day} giorni di ritardo)`);
    add('Racing', 'Direttore di corsa',
      ritardo.length === 1
        ? `IN RITARDO: ${ritardo[0].display} R${ritardo[0].index + 1} (${oggi - ritardo[0].day} giorni)`
        : `IN RITARDO: ${ritardo.length} gare di campionato`,
      (ritardo.length === 1
        ? `La gara di ${ritardo[0].display} doveva corrersi il ${dateLabel(ritardo[0].day)}: sono ${oggi - ritardo[0].day} giorni di ritardo.`
        : `Gare di campionato in ritardo:\n${righe.join('\n')}`) +
      `\n\nNessuna gara si perde: si corre quando vuoi. In classifica però i rivali continuano a incassare: ogni round lasciato lì è 0 punti tuoi.`,
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
      (takOrario(r) ? ` (${takOrario(r).replace(' · ', '').trim()} — previsto dal calendario)` : ''));
    const domani = sette.some((r) => r.day === oggi + 1);
    add('Racing', 'Direttore di corsa',
      `Questa settimana: ${sette.length} gara${sette.length === 1 ? '' : 'e'}${domani ? ' — DOMANI la prima' : ''}`,
      righe.join('\n') +
      `\n\nDa qui, ${ORIZZONTE_GIORNI} giorni di orizzonte. Il pulsante rosso "Prossima gara" nell'header porta al Cruscotto: scheda gara, checklist e iscrizione.`,
      domani ? 'urgente' : 'normale', { kind: 'vai-gara', rows: sette.map((r) => ({ nodeId: r.nodeId, trackKey: r.trackKey, label: `${r.display} R${r.index + 1}`, track: r.track })) });
  }

  /* Gara di campionato OGGI: la mail che decide la stagione (raggruppata,
     una sola anche se più campionati cadono lo stesso giorno). */
  const tavoletta = racesOnDay(ladder, state, oggi)
    .filter((g) => g.stato === 'iscritto' && state.seats?.[g.node.nodeId] && g.onSchedule);
  if (tavoletta.length) {
    add('Racing', 'Direttore di corsa',
      `OGGI: gara di campionato — ${tavoletta.map((g) => `${g.node.display} R${g.index + 1}`).join(' + ')}`,
      tavoletta
        .map((g) => `${g.node.display}: R${g.index + 1} a ${g.track} (${g.laps ?? '—'} giri, ore ${String(g.hour).padStart(2, '0')}:00). Il campionato si disputa anche senza di te: se non prendi parte, la ronda va a tutti gli altri e tu prendi 0 punti.`)
        .join('\n\n') +
      `\n\nImposta la gara nella finestra del gioco e a fine gara registra il risultato col watcher (o Risultati → importa).`,
      'urgente', { kind: 'vai-gara' });
  }

  /* Consulenza: contratti e scaletta del calendario */
  const scelte = choicesForDay(state, oggi);
  if (scelte.length >= 2) {
    add('Contratti', 'Il tuo manager',
      `Questa giornata è già piena: ${scelte.length} gare selezionate`,
      `Hai già puntato ${scelte.length} gare su ${MAX_SCELTE_PER_GIORNO} per oggi. Ricorda il rischio: ogni gara corsa avanza il calendario di un giorno, e se la giornata ti toglie tempo per un round del tuo campionato quel round vale 0 punti. Meglio puntare su una sola gara di campionato e usarla bene.`,
      'normale');
  } else if (!Object.keys(state.seats ?? {}).length) {
    add('Contratti', 'Il tuo manager',
      'Nessun contratto attivo: il calendario ti aspetta',
      'Niente campionati in corso. Guarda la strip calendario dell\u2019Agenda e firma quando scatta la giornata adatta: i contratti si sottoscrivono SOLO lì, il giorno delle gare. Le serie con lo strappo di reputazione adatto sono già pronte per la firma.',
      'normale');
  }
  /* Conflitti tra impegni: UNA email sola che elenca tutte le giornate in
     conflitto (non una mail per serie coinvolta). */
  const impegniInfo = impegni(ladder, state);
  if (impegniInfo.conflitti.length) {
    const righe = impegniInfo.conflitti.map((c) =>
      `${c.date} — ${c.gare.map((g) => `${g.display} R${g.roundIndex + 1}`).join(' + ')}`);
    add('Contratti', 'Il tuo manager',
      `Conflitti di calendario: ${impegniInfo.conflitti.length} giornat${impegniInfo.conflitti.length === 1 ? 'a in conflitto' : 'e in conflitto'}`,
      righe.join('\n\n') +
      `\n\nRisolvi dall\u2019Agenda col bottone sposta: la serie scelta si sposta di una settimana e la cadenza futura si ricalibra. Non iscriverti a troppi campionati insieme se non vuoi saltare round (0 punti).`,
      'urgente', { kind: 'vai-agenda' });
  }

  /* BOLLETTINO dell'ultima gara importata: il racconto del risultato, non un
     promemoria. Chi ti ha battuto, chi hai superato — nomi con la chiave rivale
     per la GUI (scheda pilota a un clic). Solo se la gara è recente (7 giorni). */
  try {
    const b = raceBulletin();
    if (b) {
      const diaPrima = b.davanti.length
        ? `Davanti a te: ${b.davanti.map((d) => d.name).join(', ')}.`
        : `Nessuno davanti: sei salito in cima.`;
      const dietro = b.dietro.length ? ` Appena dietro: ${b.dietro[0].name}.` : '';
      add('Racing', 'Direttore di corsa',
        `Bollettino: ${b.node} — ${b.mePos != null ? 'P' + b.mePos : 'ritiro'} a ${b.track}`,
        `${diaPrima}${dietro}\n\nLa classifica completa e i tuoi giri: Cruscotto e Risultati.`,
        'normale', { kind: 'bollettino', rivals: [...b.davanti.map((d) => ({ key: d.key, name: d.name })), ...b.dietro.map((d) => ({ key: d.key, name: d.name }))] });
    }
  } catch { /* il registro rivali potrebbe essere assente: la posta non si blocca */ }

  /* CONTO con la NEMESI: se c'è chi ti domina (streak ≥2 o 3 battute), la faida
     parla da sola: le piste dove ti prende e quelle dove lo torni. Cliccabile.
     Si mostra ogni 3 giorni (streak corto e atterratto: non spammo). */
  try {
    const nem = nemesisReport();
    if (nem) {
      const doveDolora = nem.beatsMeAt.length ? `Ti prende a: ${nem.beatsMeAt.slice(0, 4).join(', ')}.` : '';
      const doveTorni = nem.losesAt.length ? ` Dove lo torni: ${nem.losesAt.slice(0, 3).join(', ')}.` : '';
      add('Racing', 'La tua nemesi',
        `${nem.name} ${nem.nemesis ? '— la nemesi' : ''}: ${nem.h2h.beats}\u2013${nem.h2h.losses}`,
        `${nem.streak > 0 ? `${nem.streak} sconfitte consecutive inflitte. ` : ''}${doveDolora} ${doveTorni}\n\nIl conto lo chiudi in pista: la prossima volta che lo incontri ti conviene stare davanti.`,
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
      add('Racing', 'Direttore di corsa',
        `Prossimo appuntamento: ${dateLabel(prox)}`,
        solo.map((g) => `${g.node.display} R${g.index + 1} — ${g.track} (${g.laps ?? '—'} giri)`).join('\n') +
        `\n\nDa qui ci sono ${prox - oggi} giorni. Tempo per un test in quaderno prove, un setup e una qualifica pulita.`,
        'normale', { kind: 'vai-gara' });
    }
  }

  /* Sponsor: riepilogo + stato della missione */
  const sp = sponsorFor(state);
  if (sp) {
    const rimasti = Math.max(0, (sp.deadlineRound ?? 0) - (sp.roundsPaid ?? 0));
    const missione = sp.missionDone
      ? 'Missione sponsor già centrata: il bonus è incassato.'
      : `Missione a tema: ${sp.name} paga +${sp.bonus} se entro il round ${sp.deadlineRound + 1} sali sul podio. Restano ${rimasti} gare.`;
    add('Sponsor', sp.name,
      'Il nostro programma è attivo',
      `Quota a gara: ${sp.perRace} €. ${missione}\n\nFondo spettatori: le piste più affollate del calendario portano fino a +50% oltre la quota: guarda "attesa pubblico" nelle card gara.`,
      'normale');
  } else if (state.money < 8000) {
    add('Sponsor', 'Ufficio sponsorizzazioni',
      'La cassa è stretta: serve uno sponsor',
      `Hai ${state.money} € in banca e nessuno sponsor in campo. Le iscrizioni e gli affitti dei sedili ogni round pesano: cerca un podio o due per attirare l\u2019attenzione, oppure difendi la cassa con la distanza gara ridotta (25%).`,
      'urgente', { kind: 'sponsor-broke' });
  }
  /* Proposte di sponsor in arrivo: l'email porta l'AZIONE con sé (tier),
     così dalla posta si firma direttamente senza cercare il pannello. */
  try {
    const proposte = sponsorOffers(ladder, state);
    for (const p of (proposte ?? []).slice(0, 3)) {
      add('Sponsor', p.name ?? 'Ufficio sponsorizzazioni',
        `Proposta: ${p.name ?? 'sponsor'}`,
        `${p.tier ? 'Tier ' + p.tier + '. ' : ''}${p.perRace ? p.perRace + ' € a gara. ' : ''}${p.bonus ? '+' + p.bonus + ' € con la missione ' + (p.missionText ?? 'a tema') + '.' : ''}\nFirmi qui sotto, o dalla sezione VITA FUORI PISTA del Cruscotto.`,
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
    add('Carriera', 'Il tuo manager',
      `A soli ${bestDist} punti di reputazione da ${bestGate.display}`,
      `Ora hai ${state.rep} reputazione, ${bestGate.display} vuole ${bestGate.repRequired ?? 0}. Continua a fare podi nelle serie già aperte: ogni round nelle serie basse vale ancora reputazione (finché il trim resta in pista). E ricorda: le gare "iconiche" pagano reputazione ×1,25.`,
      'normale', { kind: 'vai-classifica' });
  }
  /* trim di difficoltà in attesa di firma */
  const pend = state.difficulty?.pending;
  if (pend) {
    add('Carriera', 'Il tecnico di pista',
      `Il trim della difficoltà aspetta la tua firma`,
      `La proposta del tool (trim ${pend.trim ?? '?'} su ${pend.node ?? 'la serie'}) non è ancora accettata né rifiutata. Vai su Difficoltà e decidi: il trim opportuno ti tiene in fase e i rivali continuano a essere onesti.`,
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
