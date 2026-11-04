// webui-actions-agenda.mjs — il dominio AGENDA della webui (4/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status: il dispatcher
// HTTP resta là, qui vivono soltanto le sei azioni e la loro logica.
import {
  agendaDay, prossimoGiornoConGara, avanzaGiorno, racesOnDay, calendarStrip,
  dateLabel, MAX_SCELTE_PER_GIORNO, CADENZA_GIORNI, choicesForDay, impegni,
  shiftSeat, impostaOraRonda, agendaOra, portaGiornata, scegliRonda,
} from './agenda.mjs';
import { grigliaSimEstesa, nomeDisciplina, pushMessage } from './state.mjs';
import { tr } from './lang.mjs';

export const AGENDA_ACTIONS = new Set([
  'agenda', 'agenda-advance', 'agenda-skip-to-next', 'agenda-shift', 'agenda-hour', 'agenda-choose',
]);

export function agendaAction(action, { ladder, state, body, persist, gridLabel, sendJson, res }) {
  switch (action) {
    case 'agenda': {
      // calendario CONTINUO stile del modello originario: vista giornata + strip calendario + griglia filtri
      const day = agendaDay(state);
      const viewDay = Number.isFinite(Number(body.day)) && Number(body.day) >= 1 ? Math.floor(Number(body.day)) : day;
      const filter = typeof body.filter === 'string' ? body.filter : 'tutte';    // tutte|fattibili|iscritte|bloccate
      const disc = typeof body.discipline === 'string' ? body.discipline : null; // id disciplina o null
      const griglia = racesOnDay(ladder, state, viewDay).filter((g) => {
        if (filter === 'fattibili') return g.fattibile;
        if (filter === 'iscritte') return g.stato === 'iscritto';
        if (filter === 'bloccate') return !g.fattibile;
        return true;
      }).filter((g) => !disc || g.node.discipline === disc);
      return sendJson(res, 200, {
        day,
        viewDay,
        todayLabel: dateLabel(day),
        viewLabel: dateLabel(viewDay),
        // OROLOGIO DI GIORNATA (1/11): null = inizio giornata; dopo ogni gara
        // salta di 8, alla 24 la giornata è chiusa e il giorno salta avanti.
        ora: agendaOra(state),
        nextRaceDay: prossimoGiornoConGara(ladder, state),
        maxScelte: MAX_SCELTE_PER_GIORNO,
        scelteOggi: choicesForDay(state, day),
        impegni: impegni(ladder, state),
        disciplines: ladder.disciplines.map((d) => ({ id: d.id, name: nomeDisciplina(d) })),
        strips: calendarStrip(ladder, state, { from: day - 3 < 1 ? 1 : day - 3, days: 21 }),
        gare: griglia.map((g) => ({
          nodeId: g.node.nodeId, display: g.node.display, level: g.node.level ?? 0,
          discipline: g.node.discipline, roundIndex: g.index, totalRounds: g.node.calendar.length,
          season: g.season, name: g.name, track: g.track, laps: g.laps, hour: g.hour,
          weather: g.weather ?? null, wx: g.wx ?? null, scheduledDay: g.scheduledDay,
          // LA PORTA: la gara di OGGI con l'ora già oltre l'orologio resta visibile
          // ma si griggia (la scaletta non torna indietro); server la blocca pure.
          passata: portaGiornata(state, viewDay, g.hour),
          onSchedule: !!g.onSchedule, late: !!g.late, champStarted: !!g.champStarted, stato: g.stato,
          griglia: gridLabel(g.node),
          fattibile: g.fattibile, gateReasons: g.gateReasons ?? [], isCurrent: !!g.isCurrent,
          prize: g.node.econ?.prize ?? null,
          // CARD AGENDA (30/10): griglia tipica (massimo visto) come nella card serie
          gridSize: grigliaSimEstesa(ladder, state, g.node).gridSize ?? null,
          carName: (ladder.contentNames?.cars?.[g.node.cars?.[0]] ?? g.node.cars?.[0] ?? null),
        })),
      });
    }
    case 'agenda-advance': {
      const before = agendaDay(state);
      const to = Number.isFinite(Number(body.to)) ? Number(body.to) : null;
      const after = avanzaGiorno(state, to);
      persist(state);
      return sendJson(res, 200, { before, after });
    }
    case 'agenda-skip-to-next': {
      const target = prossimoGiornoConGara(ladder, state);
      if (target == null) return sendJson(res, 200, { error: tr({ it: 'Nessuna gara futura nei campionati iscritti.', en: 'No future race in the entered championships.' }) });
      const after = avanzaGiorno(state, target);
      persist(state);
      return sendJson(res, 200, { after });
    }
    case 'agenda-shift': {
      // risolve un conflitto spostando la serie: il suo sedile slitta di +1 cadenza
      // (tutte le sue prossime ronde si spostano con lui), con nota nel diario
      const id = String(body.nodeId ?? '');
      const inf = impegni(ladder, state);
      const m = inf.lista.find((x) => x.nodeId === id);
      if (!m) return sendJson(res, 400, { error: 'Non hai un impegno con questa serie.' });
      const now = shiftSeat(state, id, CADENZA_GIORNI);
      pushMessage(state, `${m.display} spostata in avanti: prossima gara ${dateLabel(now)} (conflitto di calendario risolto).`, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, nextDay: now });
    }
    case 'agenda-hour': {
      // ORE SPOSTABILI (1/11, richieste Mauro): due gare dello stesso giorno NON
      // si rimescolano più di serie — si sposta l'ORA. Il pannello del conflitto
      // propone un selettore: setteMattina, gara del pomeriggio, ecc.; vuoto =
      // torna l'ora del calendario. L'override è per RONDA (nodeId+roundIndex):
      // la serie resta a cadenza fissa, solo quella ronda corre all'ora nuova.
      const id = String(body.nodeId ?? '');
      const roundIndex = Number(body.roundIndex);
      const inf = impegni(ladder, state);
      const m = inf.lista.find((x) => x.nodeId === id);
      if (!m) return sendJson(res, 400, { error: 'Non hai un impegno con questa serie.' });
      if (!Number.isFinite(Number(m.roundIndex)) || Number(m.roundIndex) !== roundIndex) {
        return sendJson(res, 400, { error: 'La ronda indicata non è quella a programma.' });
      }
      // ORE SPOSTABILI DIETRO LA PORTA (1/11): se la gara è per OGGI e l'orologio
      // della giornata è oltre l'ora scelta, l'override si rifiuta col motivo
      // (non solo disabilitare: la scaletta deve dire «non consentito prima delle 12»).
      const portaOra = (m.day === agendaDay(state) && Number.isInteger(Number(body.hour))
        && Number(body.hour) >= 0 && portaGiornata(state, m.day, Number(body.hour)))
        ? agendaOra(state) : null;
      if (portaOra != null) {
        return sendJson(res, 409, { error: tr({
          it: `Giornata già alle ${portaOra}:00: non consentito spostare la ronda prima delle ${portaOra} — la scaletta non torna indietro.`,
          en: `Day already at ${portaOra}:00: not allowed to move the round before ${portaOra} — the schedule doesn't go back.`,
        }) });
      }
      const hour = impostaOraRonda(state, id, roundIndex, body.hour);
      const testo = hour == null
        ? tr({
            it: `${m.display} R${roundIndex + 1}: ora tornata quella del calendario.`,
            en: `${m.display} R${roundIndex + 1}: hour back to the calendar value.`,
          })
        : tr({
            it: `${m.display} R${roundIndex + 1} spostata alle ${hour}:00 (stesso giorno, orario diverso).`,
            en: `${m.display} R${roundIndex + 1} moved to ${hour}:00 (same day, different time).`,
          });
      pushMessage(state, testo, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, roundIndex, hour });
    }
    case 'agenda-choose': {
      // IL CUORE È IN agenda.mjs (scegliRonda, 2/11): «scegli per oggi» e il
      // bottone «Punta la ronda in Agenda» del pannello Eredità (anche nel
      // cruscotto in gioco) corrono la STESSA sequenza — qui solo il finale:
      // persist col suo canale e la firma HTTP con i SUOI status (400/403/409).
      const r = scegliRonda(ladder, state, body.nodeId, body.day);
      if (!r.ok) return sendJson(res, r.status, { error: r.error });
      persist(state);
      return sendJson(res, 200, r);
    }
    default: return false;
  }
}
