// Helper di test (23/10/2026): isola i FILE DI GIOCO (quelli dentro
// Saved Games/ACE — weekend gamemodesave, customgrid, lastgamemode,
// drivergarage) in una cartella temporanea, via ACE_GAME_SAVEDIR
// (il modificatore di tools/evo-grid.mjs). Importarlo come PRIMA riga
// di un file di test: i moduli dopo girano solo dentro la sandbox, e un
// flusso webui di prova (event-prep, race) non può più cancellare o
// riscrivere i file veri di EVO sul PC di nessuno.
// (A differenza di EVO_DATA_DIR qui non si sposta né il save né i flussi:
// per quelli ci sono ACE_DATA/EVO_DATA_DIR e _flows-sandbox.mjs.)
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'evo-game-sandbox-'));
process.env.ACE_GAME_SAVEDIR = dir;
mkdirSync(join(dir, 'GameModes'), { recursive: true });
export const GAME_SANDBOX = dir;
