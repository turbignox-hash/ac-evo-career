// _prova-prepara.mjs — prepara la PROVA IN PISTA del copilota in UN comando
// (31/10, carta bianca): il protocollo di PROVA-COPILOTA.md §1 chiede 4 azioni
// manuali e a ogni gara una si dimentica. Qui i controlli di pre-volo prima,
// le due finestre giuste dopo, e davanti la scaletta di ciò che resta a mano.
//
//      node tools/_prova-prepara.mjs [porta-webui]     (o doppioclick prova.cmd)
//
// 1) liveMode: 'off' ZITTISCE la radio del server (webui.mjs, il tick esce
//    con «liveMode off»): è il muto più facile dimenticare → blocco esplicito.
// 2) livello radio (data/evo.config.json voceCopilota): STESSA regola del
//    server (voceServerLivello), tenuta in una funzione esportata e testata —
//    due fonti di verità che vanno di mano in mano è dove nascono i difetti
//    del «che livello c'è adesso?».
// 3) webui viva su 127.0.0.1:8642: senza server il monitor da solo è muto.
// 4) finestre STACCATE di monitor e ascolto live (console proprie, stdio
//    ignorato, detached): chiuse a mano a fine gara, mai figlie del lanciatore.
// 5) la scaletta che resta manuale: pill copilota ON + pagina visibile.
//
// Non parte il server da qui: un figlio staccato da tenere della finestra di
// lancio è un processo ghost in più — avvia.cmd resta il modo sbagliato di
// avviare la webui, e qui si ricorda e basta.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
const CONFIG = join(PROJECT, 'data', 'evo.config.json');
const DEFAULT_PORT = 8642;

/** Regola del livello radio, IDENTICA a voceServerLivello (src/webui.mjs).
 *  Esportata per il test. */
export function livelloVoceConfig(raw) {
  if (raw === false) return 'off';
  if (raw === true || raw == null) return 'normale';
  const s = String(raw);
  return ['off', 'essenziale', 'normale', 'full'].includes(s) ? s : 'normale';
}

function configProva() {
  try {
    if (!existsSync(CONFIG)) return { raw: null, liveMode: null };
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    return { raw: cfg.voceCopilota ?? null, liveMode: cfg.liveMode ?? null };
  } catch { return { raw: null, liveMode: null }; }
}

async function webuiViva(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

/** Le due finestre di prova, staccate dal lanciatore: console proprie, chiuse
 *  a mano a fine gara. Fuori Windows non apre nulla (la CLI lo dice). */
function apriFinestre() {
  let aperte = 0;
  const stacca = (script) => {
    if (process.platform !== 'win32') return;
    try {
      const figlio = spawn(process.execPath, [script], { detached: true, stdio: 'ignore', windowsHide: false });
      figlio.unref();
      aperte++;
    } catch { /* senza finestra la scaletta comanda i comandi a mano */ }
  };
  stacca(join(HERE, '_monitor-copilota.mjs'));
  stacca(join(HERE, '_ascolta-copilota.mjs'));
  return aperte;
}

export async function preparaProva({ port = DEFAULT_PORT, apri = true } = {}) {
  const esito = { webui: false, liveMode: null, livello: null, aperte: 0, blocco: null };
  const cfg = configProva();
  esito.liveMode = cfg.liveMode;
  esito.livello = livelloVoceConfig(cfg.raw);
  if (esito.liveMode === 'off') {
    esito.blocco = 'liveMode è "off" in data/evo.config.json: il tick della voce del server tace DI PROPOSITO. Attivalo da Impostazioni (liveMode "auto"/"on") e rilancia il comando.';
    return esito;      // il blocco lo dice tutto: niente finestre inutili
  }
  esito.webui = await webuiViva(port);
  if (!esito.webui) {
    esito.blocco = `webui NON viva su 127.0.0.1:${port}: avvia.cmd prima (o node src/webui.mjs), poi rilancia questo comando.`;
    return esito;
  }
  if (apri) esito.aperte = apriFinestre();
  return esito;
}

/* ---------- CLI (solo da script principale) ---------- */
const MAIN = process.argv[1] ? import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href : false;
if (MAIN) {
  const numeri = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const port = Number.isFinite(numeri[0]) ? numeri[0] : DEFAULT_PORT;
  const e = await preparaProva({ port });
  if (e.blocco) { console.error(`✗ ${e.blocco}`); process.exit(1); }
  console.log(`✓ webui viva su ${port} · liveMode ${e.liveMode ?? '(non impostato: auto)'} · radio: ${e.livello}`);
  console.log(e.aperte === 2
    ? '✓ monitor e ascolto live aperti: DUE finestre console nuove (chiudile a mano a fine gara).'
    : '− finestre non aperte da qui (fuori Windows): lancia a mano  node tools/_monitor-copilota.mjs 8642  e  node tools/_ascolta-copilota.mjs');
  console.log('· resta a mano, da PROVA-COPILOTA.md: pill «copilota ON» sul cruscotto (deve parlare la frase di attivazione) e pagina/gioco VISIBILI.');
  console.log('· a gara finita, il verdetto:  node tools/_monitor-copilota.mjs --riepilogo data/copilot-8642-24-10.jsonl');
}
