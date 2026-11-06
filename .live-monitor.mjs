// monitor temporaneo (6/11): campiona /api/live ogni 5 s e scrive una riga per
// tick con i campi che contano per la sessione in pista (giri, tempi, contatto
// per ruota). Si spegne da solo dopo 2 ore o quando lo si ferma.
//
// A fine sessione (`live` che smette di essere vero per due tick di fila)
// scrive il riepilogo in `.live-monitor.riepilogo.txt` e lo stampa.
// Con `--riassumi` riassume un log già chiuso senza campionare:
//   node .live-monitor.mjs --riassumi [file]
import { appendFileSync, readFileSync } from 'node:fs';
import { parseLog, riassumiMonitor, formattaRiassunto, rigaMonitor } from './src/live-monitor-riepilogo.mjs';

// percorsi e indirizzo sovrascrivibili per provare il monitor su una finta API
const OUT = process.env.LIVE_MONITOR_OUT ?? '.live-monitor.log';
const RIEPILOGO = process.env.LIVE_MONITOR_RIEPILOGO ?? '.live-monitor.riepilogo.txt';
const URL = process.env.LIVE_MONITOR_URL ?? 'http://127.0.0.1:8642/api/live';
const step = Number(process.env.LIVE_MONITOR_STEP) || 5000;
// un solo tick senza live può essere un'attesa tra due sessioni: la fine si
// dichiara solo dopo due tick consecutivi, cioè 10 s.
const TICK_FINE = 2;

if (process.argv.includes('--riassumi')) {
  const file = process.argv[process.argv.indexOf('--riassumi') + 1];
  const percorso = file && !file.startsWith('--') ? file : OUT;
  console.log(formattaRiassunto(riassumiMonitor(parseLog(readFileSync(percorso, 'utf8')))));
  process.exit(0);
}

const t0 = Date.now();
let last = '';
let sessione = [];
let nonLive = 0;

const chiudiSessione = (nota) => {
  if (!sessione.length) return;
  const testo = `${nota ? `${nota}\n` : ''}${formattaRiassunto(riassumiMonitor(sessione))}\n\n`;
  appendFileSync(RIEPILOGO, testo);
  console.log(testo.trimEnd());
  sessione = [];
};

while (Date.now() - t0 < 2 * 3600 * 1000) {
  let line;
  let riga = null;
  try {
    const r = await fetch(URL);
    const s = await r.json();
    riga = rigaMonitor(s);
    line = JSON.stringify(riga);
  } catch (e) {
    line = JSON.stringify({ at: new Date().toISOString(), error: String(e?.message ?? e) });
  }
  // confronto senza `at`: due tick identici non scrivono due righe (a gioco
  // chiuso il log resterebbe pieno di righe uguali)
  const chiave = line.replace(/"at":"[^"]*",?/, '');
  if (chiave !== last) {
    last = chiave;
    appendFileSync(OUT, `${line}\n`);
  }
  if (riga?.live) {
    nonLive = 0;
    sessione.push(riga);
  } else if (sessione.length) {
    nonLive += 1;
    if (nonLive >= TICK_FINE) chiudiSessione();
  }
  await new Promise((r) => setTimeout(r, step));
}

chiudiSessione('(sessione ancora in corso: riepilogo parziale, limite delle 2 ore del monitor)');
