// Helper di test (23/10/2026): isola il REGISTRO FLUSSI in una cartella temporanea.
// Importarlo come PRIMA riga di un file di test: i moduli che girano dopo non
// toccano più i flussi veri del PC anche quando il test registra premi, rent o rep.
// (A differenza di EVO_DATA_DIR qui non si sposta né il save né le altre cartelle.)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.EVO_FLOWS_DIR = mkdtempSync(join(tmpdir(), 'evo-flows-test-'));
