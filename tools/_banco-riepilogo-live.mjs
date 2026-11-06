// _banco-riepilogo-live.mjs — QUANTO COSTA IL RIEPILOGO LIVE (6/11).
//
// Misura, sullo stesso log, i due percorsi:
//   • PRIMA (fino al 6/11): readFileSync dell'intero log + parseLog + riepilogo,
//     rifatto a ogni scrittura del monitor — è quello che la rotta
//     `live-riepilogo` faceva a ogni poll con il log cambiato;
//   • DOPO: lettore incrementale (`src/live-log-incrementale.mjs`), che a ogni
//     giro consuma solo le righe nuove.
// Lavora SEMPRE su una copia in cartella temporanea: il log vero non si tocca.
//
//   node tools/_banco-riepilogo-live.mjs [righe]     (default 100.000)
//
// I numeri dipendono dalla macchina: servono a confrontare i due percorsi sullo
// STESSO giro, non a fare una classifica.

import { appendFileSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLog, riepiloghiMonitor, riepiloghiDa, creaAccumulatoreRiepiloghi, formattaRiassunto } from '../src/live-monitor-riepilogo.mjs';
import { lettoreLogLive } from '../src/live-log-incrementale.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = Math.max(1000, Math.floor(Number(process.argv[2]) || 100_000));
const dir = mkdtempSync(join(tmpdir(), 'evo-banco-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const linea = (i) => JSON.stringify({
  at: new Date(Date.parse('2026-11-06T10:00:00.000Z') + i * 5000).toISOString(),
  live: true, session: 'Race', track: 'Laguna Seca', pos: 3, speed: 120,
  lapsDone: Math.floor(i / 400), lastLapMs: i ? 91_500 : null, bestLapMs: 90_000,
  load: [4000, 4000, 3000, 3000], susp: [0.04, 0.04, 0.05, 0.05],
  slipDeg: [5.73, -5.73, 2.86, -2.86], slipRatio: [0.2, -0.2, 0.1, -0.1],
  brakeC: [300, 310, 200, 210], vibRoad: 0.02, vibKerb: 0.01, vibSlip: 0.03, vibAbs: 0, ffb: 0.4,
});

const ms = (t0, t1) => Math.round((Number(t1 - t0) / 1e6) * 10) / 10;
const ilPercorsoVecchio = (file) => riepiloghiMonitor(parseLog(readFileSync(file, 'utf8')));

/** Un caso: copia il log, misura il percorso vecchio e quello nuovo, verifica
 *  che dicano la stessa cosa. */
const banco = (origine, etichetta) => {
  const file = join(dir, `${etichetta.replace(/\W+/g, '-')}.log`);
  copyFileSync(origine, file);
  const mb = statSync(file).size / 1048576;

  const a0 = process.hrtime.bigint();
  const prima = ilPercorsoVecchio(file);
  const a1 = process.hrtime.bigint();

  const lettore = lettoreLogLive(file);
  const primo = lettore.aggiorna();
  if (primo.totale !== prima.totale || primo.testo !== prima.testo) {
    throw new Error(`${etichetta}: il primo giro del lettore non coincide col percorso completo`);
  }

  // una riga nuova (non-live: chiude la sessione senza aggiungerne una) e il
  // giro incrementale deve costare solo quella riga
  appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), live: false })}\n`, 'utf8');
  const b0 = process.hrtime.bigint();
  const dopo = lettore.aggiorna();
  const b1 = process.hrtime.bigint();
  const controllo = ilPercorsoVecchio(file);
  if (dopo.totale !== controllo.totale || dopo.testo !== controllo.testo) {
    throw new Error(`${etichetta}: dopo l'aggiornamento i due percorsi divergono`);
  }

  const c0 = process.hrtime.bigint();
  const fermo = lettore.aggiorna();
  const c1 = process.hrtime.bigint();
  if (fermo.cambiato !== false) throw new Error(`${etichetta}: senza byte nuovi non deve esserci lavoro`);

  return {
    caso: etichetta,
    'MB': Number(mb.toFixed(2)),
    'prima: ms per poll (log cambiato)': ms(a0, a1),
    'dopo: ms per poll (1 riga nuova)': ms(b0, b1),
    'dopo: ms per poll (niente nuovo)': ms(c0, c1),
    sessioni: prima.totale,
  };
};

/**
 * Il testo composto una volta sola: quanto costa rifare il lavoro del vecchio
 * `riepiloghiDa` (riformattare TUTTE le sessioni mostrate) contro il nuovo, che
 * formatta solo l'eventuale sessione aperta. Stesse sessioni, stesso giro.
 */
const bancoTesto = (sessioni) => {
  const K = 400;
  const scelte = sessioni.slice(-5);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < K; i++) {
    scelte.map((s) => ({ ...s, testo: formattaRiassunto(s) }));
    formattaRiassunto(scelte);
  }
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < K; i++) riepiloghiDa(sessioni);
  const t2 = process.hrtime.bigint();
  return {
    'sessioni mostrate': scelte.length,
    'prima: µs per poll': Math.round((Number(t1 - t0) / K / 1000) * 10) / 10,
    'dopo: µs per poll': Math.round((Number(t2 - t1) / K / 1000) * 10) / 10,
  };
};

const fuori = [];
const sintetico = join(dir, 'sintetico.log');
writeFileSync(sintetico, Array.from({ length: N }, (_, i) => linea(i)).join('\n') + '\n', 'utf8');
fuori.push(banco(sintetico, `sintetico ${N.toLocaleString('it-IT')} righe`));

const vero = join(ROOT, '.live-monitor.log');
if (existsSync(vero)) fuori.push(banco(vero, 'log vero .live-monitor.log'));

console.log('Riepilogo live: costo di un poll (stessi dati, stesso giro)');
console.table(fuori);

// dodici sessioni chiuse a turno: la finestra della scheda ne mostra cinque
const tante = join(dir, 'sessioni.log');
const righe = [];
for (let s = 0; s < 12; s++) {
  righe.push(linea(s * 1000), linea(s * 1000 + 1));
  righe.push(JSON.stringify({ at: new Date().toISOString(), live: false }));
}
writeFileSync(tante, righe.join('\n') + '\n', 'utf8');
const acc = creaAccumulatoreRiepiloghi();
for (const l of parseLog(readFileSync(tante, 'utf8'))) acc.aggiungi(l);
const testo = bancoTesto(acc.risultato());
console.log('Testo del riepilogo: comporre solo ciò che può cambiare');
console.table([testo]);
console.log('Il «primo giro» del lettore legge il file intero una volta sola (come prima); i giri successivi costano solo le righe nuove.');
