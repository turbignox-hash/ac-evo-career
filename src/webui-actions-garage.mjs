// webui-actions-garage.mjs — il dominio GARAGE PERSONALE della webui (4/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status. Il `case
// 'garage'` che resta in webui.mjs NON è questo dominio: è l'aiuto-meccanico
// (pressioni/telemetria) e per questo non è nel set GARAGE_ACTIONS.
import { garageOverview, catalogPicker, addCar, removeCar, setNote, sellCar } from './garage.mjs';
import { pushMessage } from './state.mjs';
import { tr } from './lang.mjs';
import { viewHeader } from './webui-views.mjs';
import { recordWarning } from './warnings.mjs';

export const GARAGE_ACTIONS = new Set([
  'my-garage', 'garage-catalog', 'garage-add', 'garage-remove', 'garage-note', 'garage-sell',
]);

export function garageAction(action, { ladder, state, body, paths, persist, sendJson, res }) {
  switch (action) {
    case 'my-garage': {
      // il garage personale: importa le auto vinte dagli eventi e arricchisce col catalogo
      try {
        const out = garageOverview(ladder, state, { paths });
        if (out.justImported.length) {
          for (const name of out.justImported) pushMessage(state, `🏆 ${name} entra nel garage (vinta in un evento speciale).`, 'title');
          persist(state);
        }
        return sendJson(res, 200, out);
      }
      catch (e) { recordWarning('webui.garage', 'vista garage non riuscita: ' + (e?.message ?? '')); return sendJson(res, 200, { cars: [], total: 0, won: 0, bought: 0, totalWins: 0, justImported: [] }); }
    }
    case 'garage-catalog': return sendJson(res, 200, { cars: catalogPicker(ladder, { paths }) });
    case 'garage-add': {
      try {
        const out = addCar(state, { carId: body.carId, carName: body.carName, how: body.how === 'won' ? 'won' : 'bought', note: body.note ?? null });
        if (!out.reused) pushMessage(state, out.car.how === 'won' ? tr({ it: `🏆 ${out.car.carName} entra nel garage (vinta).`, en: `🏆 ${out.car.carName} joins the garage (won).` }) : tr({ it: `${out.car.carName} entra nel garage (comprata a ${out.price.toLocaleString('it-IT')} €).`, en: `${out.car.carName} joins the garage (bought for ${out.price.toLocaleString('it-IT')} €).` }), 'money');
        persist(state);
        return sendJson(res, 200, { ok: true, reused: out.reused, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-remove': {
      try {
        const n = removeCar(state, String(body.carId ?? ''));
        if (n) persist(state);
        return sendJson(res, 200, { ok: n > 0, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-note': {
      try {
        setNote(state, String(body.carId ?? ''), body.note != null ? String(body.note) : null);
        persist(state);
        return sendJson(res, 200, { ok: true, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-sell': {
      try {
        const out = sellCar(ladder, state, String(body.carId ?? ''));
        persist(state);
        return sendJson(res, 200, { ok: true, sold: out, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    default: return false;
  }
}
