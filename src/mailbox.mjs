// mailbox.mjs — la POSTA del pilota: email generate al momento dallo stato
// della carriera (niente da salvare, niente da migrare). Consigli concreti come
// "non firmare altri contratti ora"/"oggi c'è la gara di campionato, se salti
// vali 0 punti", posta degli sponsor, proposte e la gazzetta del giorno.
//
// Ogni email: { id, kind, from, oggetto, corpo, date, priorità }.
// kind: Racing | Sponsor | Contratti | Carriera | Gazzetta

import { nodeById, gateStatus } from './state.mjs';
import { sponsorFor, sponsorOffers } from './life.mjs';
import {
  agendaDay, dateLabel, impegni, choicesForDay,
  MAX_SCELTE_PER_GIORNO, prossimoGiornoConGara, racesOnDay,
} from './agenda.mjs';

export function mailbox(ladder, state) {
  const mails = [];
  const oggi = agendaDay(state);
  const oggiLabel = dateLabel(oggi);
  let n = 0;
  const add = (kind, from, oggetto, corpo, priorita = 'normale') => {
    mails.push({ id: `m${++n}`, kind, from, oggetto, corpo, date: oggiLabel, priorita });
  };

  /* Gara di campionato in RITARDO: mail urgente (gare mai perdute, ma i punti scappano) */
  const tavoletta = racesOnDay(ladder, state, oggi);
  const ritardatarie = tavoletta.filter((g) => g.stato === 'iscritto' && g.late);
  for (const g of ritardatarie) {
    add('Racing', 'Direttore di corsa',
      `IN RITARDO: ${g.node.display} R${g.index + 1} doveva corrersi il ${dateLabel(g.scheduledDay)}`,
      `La gara del campionato ${g.node.display} è in ritardo di ${oggi - g.scheduledDay} giorni. Nessuna gara si perde: puoi ancora correre la R${g.index + 1} a ${g.track}. In classifica però i rivali continuano a incassare: ogni round lasciato lì è 0 punti tuoi.`,
      'urgente');
  }
  /* Gara di campionato del giorno: la mail che decide la stagione */
  const campOggi = tavoletta.filter((g) => g.stato === 'iscritto' && !g.late);
  if (campOggi.length) {
    add('Racing', 'Direttore di corsa',
      `OGGI: gara di campionato — ${campOggi.map((g) => `${g.node.display} R${g.index + 1}`).join(' + ')}`,
      campOggi
        .map((g) => `${g.node.display}: R${g.index + 1} a ${g.track} (${g.laps ?? '—'} giri, ore ${String(g.hour).padStart(2, '0')}:00). Il campionato si disputa anche senza di te: se non prendi parte, la ronda va a tutti gli altri e tu prendi 0 punti.`)
        .join('\n\n') + '\n\nImposta la gara nella finestra del gioco e inquadra col telefono? No: a fine gara registrare il risultato col watcher (o Risultati → importa).',
      'urgente');
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
  /* Conflitti tra impegni: alert proattivo */
  const impegniInfo = impegni(ladder, state);
  for (const c of impegniInfo.conflitti) {
    for (const g of c.gare) {
      add('Contratti', 'Il tuo manager',
        `Conflitto di calendario il ${c.date}: ${c.gare.length} campionati la stessa giornata`,
        `${g.display} R${g.roundIndex + 1} cade il ${c.date} insieme a: ${c.gare.filter((x) => x.nodeId !== g.nodeId).map((x) => x.display).join(', ')}. Risolvi dall\u2019Agenda col bottone sposta: la serie scelta si sposta di una settimana e la cadenza futura si ricalibra. Non iscriverti a troppi campionati insieme se non vuoi saltare round (0 punti).`,
      'urgente');
    }
  }
  /* Prossima gara di campionato a calendario */
  const prox = prossimoGiornoConGara(ladder, state);
  if (prox != null && prox > oggi) {
    const solo = racesOnDay(ladder, state, prox).filter((g) => g.stato === 'iscritto');
    if (solo.length) {
      add('Racing', 'Direttore di corsa',
        `Prossimo appuntamento: ${dateLabel(prox)}`,
        solo.map((g) => `${g.node.display} R${g.index + 1} — ${g.track} (${g.laps ?? '—'} giri)`).join('\n') +
        `\n\nDa qui ci sono ${prox - oggi} giorni. Tempo per abbigliare la formula con prova, setup e una sessione di qualificà pulita.`,
      'normale');
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
      `Hai ${state.money} € in banca e nessuno sponsor in campo. Le iscrizioni e gli afforti dei sedili ogni round pesano: cerca un podio o due per attirare l\u2019attenzione, oppure difendi la cassa con la distanza gara ridotta (25%).`,
      'urgente');
  }
  /* Proposte di sponsor in arrivo (offerte attuali del paddock) */
  try {
    const proposte = sponsorOffers(ladder, state);
    for (const p of (proposte ?? []).slice(0, 3)) {
      add('Sponsor', p.name ?? 'Ufficio sponsorizzazioni',
        `Proposta: ${p.name ?? 'sponsor'}`,
        `${p.tier ? 'Tier ' + p.tier + '. ' : ''}${p.perRace ? p.perRace + ' € a gara. ' : ''}${p.bonus ? '+' + p.bonus + ' € con la missione ' + (p.missionText ?? 'a tema') + '.' : ''}\nFirma dalla sezione VITA FUORI PISTA del Cruscotto.`,
        'normale');
    }
  } catch { /* sponsorOffers potrebbe non esistere (build vecchie): mai bloccare la posta */ }

  /* Carriera: lo sblocco più vicino di reputazione */
  let bestGate = null, bestDist = Infinity;
  for (const node of ladder.nodes) {
    if ((state.seats ?? {})[node.nodeId]) continue;
    const dist = (node.repRequired ?? 0) - (state.rep ?? 0);
    if (dist > 0 && dist < bestDist) { bestDist = dist; bestGate = node; }
  }
  if (bestGate) {
    add('Carriera', 'Il tuo manager',
      `A soli ${bestDist} punti di reputazione da ${bestGate.display}`,
      `Ora hai ${state.rep} reputazione, ${bestGate.display} vuole ${bestGate.repRequired ?? 0}. Continua a fare podi nelle serie già aperte: ogni round nelle serie basse vale ancora reputazione (finché il trim resta in pista). E ricorda: le gare "iconiche" pagano reputazione ×1,25.`,
      'normale');
  }
  /* propone di trim in attesa (difficoltà) */
  const pend = state.difficulty?.pending;
  if (pend) {
    add('Carriera', 'Il tecnico di pista',
      `Il trim della difficoltà aspetta la tua firma`,
      `La proposta del tool (trim ${pend.trim ?? '?'} su ${pend.node ?? 'la serie'}) non è ancora accettata né rifiutata. Vai su Difficoltà e decidi: il trim opportuno ti tiene in fase e i rivali continuano a essere onesti.`,
      'normale');
  }
  /* riepilogo del campionato attuale vicino al numero di round decisi */
  return { mails, oggi: oggiLabel, day: oggi };
}
