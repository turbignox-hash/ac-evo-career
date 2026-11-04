// webui-actions-integrity-backup.mjs — integrità e backup della webui (4/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status. La rotta
// `maintenance` ha il suo modulo webui-actions-maintenance.mjs: possiede
// maintenanceTick e i timer, quindi non è una semplice azione HTTP.
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { reviewableSeasons } from './review.mjs';
import { BACKUP_DIR, SAVE_FILE } from './webui-env.mjs';
import { forzaBackup, statoBackup } from '../tools/salva-save.mjs';
import { tr } from './lang.mjs';
import { viewHeader } from './webui-views.mjs';

export const INTEGRITY_BACKUP_ACTIONS = new Set([
  'integrity', 'integrity-fix', 'backup', 'save-backup',
]);

export function integrityBackupAction(action, { ladder, state, body, sendJson, res, listBackups }) {
  switch (action) {
    case 'integrity': return sendJson(res, 200, { issues: checkIntegrity(ladder, state), seasons: reviewableSeasons(state) });
    case 'integrity-fix': {
      const out = fixIntegrity(ladder, state);
      return sendJson(res, 200, { ...out, header: viewHeader(ladder, state) });
    }
    case 'backup': {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const target = join(BACKUP_DIR, `evo-career.save.bak-${stamp}.json`);
        copyFileSync(SAVE_FILE, target);
        const backups = listBackups(8);
        return sendJson(res, 200, { ok: true, created: target, backups });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'save-backup': {
      // Stato del backup del SAVE di EVO (quello del gioco, non della
      // carriera): vive in data/salva-save/ e si accomoda con tools/
      // salva-save.mjs — libreria usata IN-PROCESS (26/10): lo stato e'
      // uno scan solo-lettura, il forza chiama la stessa tar dell'avvio.
      try {
        const op = String(body.op ?? 'status');
        let esito = null; // (scope, bug al vivo 26/10: const dentro l'if era invisibile a lastRun)
        if (op === 'force') {
          esito = forzaBackup({ force: true });
          if (!esito.ok && esito.motivo !== 'save-dir-mancante') {
            return sendJson(res, 500, { error: tr({ it: `backup non riuscito (${esito.motivo}): ${esito.errore ?? ''}`, en: `backup failed (${esito.motivo}): ${esito.errore ?? ''}` }), ...esito.stato, forced: true, lastRun: esito });
          }
        }
        const st = statoBackup();
        return sendJson(res, 200, { ...st, forced: op === 'force', lastRun: esito });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    default: return false;
  }
}
