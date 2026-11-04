// webui-actions-events.mjs — il dominio AZIONI EVENTO della webui (4/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status: il dispatcher
// HTTP resta là, qui vivono le cinque azioni di stato dell'evento speciale.
// `events` (vista) ed `event-prep` (griglia + lancio) restano in webui.mjs:
// il primo è una vista, il secondo orchestra gridbuilder, backup e launcher e
// avrebbe bisogno di troppe dipendenze per un modulo pulito.
import { acceptEvent, declineEvent, finishEvent, ensureEvents, refreshActivePrize, eventsOverview } from './events.mjs';
import { viewHeader } from './webui-views.mjs';

export const EVENT_ACTIONS = new Set([
  'event-accept', 'event-decline', 'event-finish', 'event-abandon', 'event-prize-refresh',
]);

export function eventAction(action, { ladder, state, body, persist, sendJson, res }) {
  switch (action) {
    case 'event-accept': {
      try { acceptEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-prize-refresh': {
      // correzione premio del vecchio invito attivo: se l'auto in palio è già
      // posseduta e il tema ha riserve, sostituisce il premio (richiesta Mauro
      // 23/10: "un'auto diversa che non ho già in garage"). Idempotente e scritta
      // subito su disco (persist), come gli altri comandi evento.
      // giudizio del possesso: SOLO garage del tool + vetrina (28/10). Lo scan
      // disco è uscito: i .carfinalstate restano anche per auto vendute e
      // noleggiate, e spingevano 13 falsi «già tua» nella scelta premio.
      try { const out = refreshActivePrize(ladder, state); persist(state); return sendJson(res, 200, { ok: true, ...out, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { ok: false, error: String(e.message ?? e) }); }
    }
    case 'event-decline': {
      try { declineEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-finish': {
      try {
        const out = finishEvent(ladder, state, { position: Number(body.position), bestLapSec: body.bestLapSec != null ? Number(body.bestLapSec) : null });
        persist(state);
        return sendJson(res, 200, { ok: true, result: out, events: eventsOverview(ladder, state), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-abandon': {
      // ripensamento: l'invito accettato torna libero (senza penali)
      try {
        const ev = ensureEvents(state);
        if (ev.active?.acceptedAt) { delete ev.active.acceptedAt; persist(state); }
        return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    default: return false;
  }
}
