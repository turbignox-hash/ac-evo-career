// _spia-gamemodes.mjs — LA SPIA DEI MENU (29/10, «premo tutti i tasti anche
// per la modalità pratica e gara veloce»): ogni 2 s haash di OGNI file di
// GameModes (mtime+size+sha16); quando qualcosa cambia, AJAX una riga sul log
// data/spia-gamemodes.log con il timestamp: e poi a fonti dell'azione si legge
// CHE COSA i menu hanno scritto e DOPO. Solo LETTURE del disco di gioco.
// Uso: node tools/_spia-gamemodes.mjs [secondi-max]
import { readdirSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.ACE_GAME_SAVEDIR
  ? join(process.env.ACE_GAME_SAVEDIR, 'GameModes')
  : join('C:', 'Users', 'Mauro', 'Saved Games', 'ACE', 'GameModes');
const LOG = join(RADICE, 'data', 'spia-gamemodes.log');
const TETTO = (Number(process.argv[2]) || 3600) * 1000;

const sha16 = (p) => {
  try { return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16); }
  catch { return 'unreadable'; }
};
const istantanea = () => {
  const m = {};
  for (const f of readdirSync(DIR)) {
    try {
      const p = join(DIR, f);
      const st = statSync(p);
      m[f] = `${Math.floor(st.mtimeMs)} ${st.size} ${sha16(p)}`;
    } catch { /* file svanito a metà: pazienza */ }
  }
  return m;
};

const PRI = istantanea();
appendFileSync(LOG, `${Date.now()} AVVIO spia su ${DIR} — ${Object.keys(PRI).length} file\n`);
process.on('SIGINT', () => process.exit(0));
process.on('SIGHUP', () => process.exit(0));
const fine = Date.now() + TETTO;
const tick = setInterval(() => {
  if (Date.now() > fine) { clearInterval(tick); appendFileSync(LOG, `${Date.now()} FINE spia\n`); process.exit(0); }
  const ora = istantanea();
  for (const [f, stato] of Object.entries(ora)) {
    if (PRI[f] === stato) continue;
    appendFileSync(LOG, `${Date.now()} CAMBIO ${f}: ${stato}\n`);
  }
  for (const f of Object.keys(PRI)) if (ora[f] == null) appendFileSync(LOG, `${Date.now()} SPARITO ${f}\n`);
  Object.assign(PRI, ora);
  for (const f of Object.keys(PRI)) if (ora[f] == null) delete PRI[f];
}, 2000);
