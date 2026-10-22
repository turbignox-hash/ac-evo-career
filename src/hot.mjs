// hot.mjs — ricarico a CALDO per i moduli di calibrazione nel launcher.
//
// Questo file esiste grazie alla lezione del 22/10/2026: il launcher (webui.mjs)
// è un processo long-running e importa STATICAMENTE import.mjs → grid-calib.mjs.
// I due eventi Paul Ricard nati "già rotti" nel registro di calibrazione (base
// falsa, delta nulli) furono scritti proprio da quel processo con il VECCHIO
// grid-calib.mjs in memoria: patch applicata, codice stantio ancora in esecuzione.
// Static import = il codice del momento in cui il processo è partito, non quello
// su disco adesso.
//
// hot() misura il mtime del file su disco a OGNI chiamata: se è cambiato (o è
// la prima volta), ri-importa con cache-busting ESM '?hot=<mtime>'. In ESM la
// query RICREA l'intero grafo, incluse le dipendenze importate a catena:
// ricaricare './import.mjs' porta con sé un grid-calib fresco.
// Se il mtime non è cambiato si ritorna la stessa promise (nessun costo, la
// stessa istanza). Attenzione: l'ISTANZA cambia se qualcuno tocca il file —
// chi la usa deve rientrare nelle funzioni a ogni chiamata, non spararle
// la prima volta.
//
// Uso e limiti:
//   - i path in hot() sono relativi a src/ (hot.mjs vive lì);
//   - si impiega SOLO per la catena calibrazione (import.mjs, grid-calib.mjs):
//     il resto del launcher resta statico — i due moduli sono quasi stateless
//     (ledger e registri stanno su disco), quindi una istanza fresca è
//     intercambiabile con la stale;
//   - l'import fallito non viene ricordato: al prossimo giro si riprova.
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOT = new Map(); // spec → { mtime, promise }

/** Carica './<file>.mjs' rispetto a src/, ricaricandolo se il mtime su disco è cambiato. */
export function hot(relSpec) {
  const file = join(HERE, relSpec);
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { /* file sparito: mtime 0, l'import dirà il suo */ }
  const cached = HOT.get(relSpec);
  if (cached && cached.mtime === mtime) return cached.promise;
  const promise = import(`${pathToFileURL(file).href}?hot=${mtime}`)
    .catch((e) => { HOT.delete(relSpec); throw e; }); // l'errore non si cacha: si riprova la prossima volta
  HOT.set(relSpec, { mtime, promise });
  return promise;
}
