// leggi-log-evo.mjs — i log di EVO in formato leggibile (31/10/2026).
//
// Perché esiste: i log di Assetto Corsa EVO sono file da decine di migliaia di
// righe, con \r in fondo, righe scalpate a metà formato e (a volte) byte
// binari dentro: trovare un crash a mano è un giro di `grep -a` + contesto +
// pazienza. Questo tool li riassume in UNA riga per evento: crash (codice,
// RVA, thread, cosa stava caricando), avvisi pista (layout dichiarati con 0
// punti Bezier — lezione 31/10) e l'orario di inizio/fine del log.
//
// uso:
//   node tools/leggi-log-evo.mjs
//     → tutti i log degli ultimi 2 giorni, un riquadro per file
//   node tools/leggi-log-evo.mjs log-261031-153615
//     → UN log per nome (l'estensione .txt è opzionale, il prefisso basta)
//   node tools/leggi-log-evo.mjs log-261031-153615 --crash
//     → sopra al riquadro, il PARAGRAFO del primo crash (12 righe prima, 8 dopo)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths(process.env);
const DUE_GIORNI_MS = 2 * 24 * 60 * 60 * 1000;
const NOME_RICHIESTO = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].replace(/\.txt$/, '') : null;
const PARAGRAFO_CRASH = process.argv.includes('--crash');

// Binary-ish: si legge come testo, si toglie il \r, si buttano le righe vuote.
// NESSUNA altra trasformazione: quello che esce è il testo del file.
function righeLog(via) {
  return readFileSync(via, 'utf8').replace(/\r/g, '')
    .split('\n')
    .filter((r) => r.trim() !== '');
}

// [2026-10-31 17:59:04.764] → «2026-10-31 17:59:04»
const oraDi = (riga) => {
  const m = riga.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return m ? m[1] : '?';
};

// una riga = niente caratteri non stampabili, più spazi diventano uno: entra
// in console come una frase, non come un blocco esadecimale.
const UNA = (testo) => String(testo).replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();

function riassunto(via) {
  const righe = righeLog(via);
  if (!righe.length) return null;
  const crash = righe.filter((r) => r.includes('[crash]'));

  // firma: UNA riga per crash-evento (stesso secondo) — un sol avvio
  // produce decine di righe [crash] ripetute per gli STESSI Physics Worker:
  // codice, RVA e thread vengono RACCOLTI, non separati.
  const firme = new Map();   // ora ISO → { codice, rva, thread:Set, quante }
  for (const riga of crash) {
    const mOra = riga.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    const chiave = mOra ? mOra[1] : 'ora incognita';
    let f = firme.get(chiave);
    if (!f) { f = { codice: null, rva: null, thread: new Set(), quante: 0 }; firme.set(chiave, f); }
    const cod = riga.match(/Exception Detected: (\S+)/);
    if (cod && !f.codice) f.codice = cod[1];
    const rv = riga.match(/RVA: (0x[0-9A-Fa-f]+)/);
    if (rv && !f.rva) f.rva = rv[1];
    const thr = riga.match(/Thread: ([^(]+)/);
    if (thr) f.thread.add(thr[1].trim());
    f.quante++;
  }

  // cosa stava facendo al primo crash: l'ultima riga di caricamento
  // (world/pista/AI/camera) prima della prima riga [crash].
  let momento = null;
  if (crash.length) {
    const iCras = righe.indexOf(crash[0]);
    for (let i = iCras - 1; i >= 0; i--) {
      if (/\[(loading|dataUtils|ai|gameplay)\]/.test(righe[i])) { momento = righe[i]; break; }
    }
  }

  // piste: le dichiarazioni di layout con ZERO punti Bezier, dedup.
  const piste = [];
  for (const riga of righe) {
    const m = riga.match(/Loaded 0 TrackLayoutBezier points from ['"]?([^'"]*)['"]?/);
    if (!m) continue;
    const corpo = UNA(m[1]) || '<vuoto>';
    if (!piste.includes(corpo)) piste.push(corpo);
  }

  return {
    nome: via.split(/[\\/]/).pop(),
    righe: righe.length,
    prima: oraDi(righe[0]),
    ultima: oraDi(righe[righe.length - 1]),
    firme: [...firme.entries()],
    momento,
    piste,
  };
}

const dirLogs = (paths.logsDirs ?? [])[0];
if (!dirLogs) { console.error('Nessuna cartella Logs di EVO trovata (Saved Games).'); process.exit(1); }

// log-YYMMDD-HHMMSS.txt, il più recente per primo
const tutti = readdirSync(dirLogs)
  .filter((nome) => /^log-\d{6}-\d{6}\.txt$/.test(nome))
  .sort()
  .reverse();

// default: gli ultimi 2 giorni (lo stesso respiro del vecchio _crashlog.ps1)
const dmScaduta = new Date(Date.now() - DUE_GIORNI_MS);
const recenti = tutti.filter((nome) => {
  const y = Number(nome.slice(4, 6)), mo = Number(nome.slice(6, 8)), g = Number(nome.slice(8, 10));
  const dataLog = new Date(2000 + y, mo - 1, g);
  return dataLog >= dmScaduta;
});

// bersaglio: prefisso del nome (o nome intero) DENTRO la cartella Logs
const bersagli = [];
if (NOME_RICHIESTO) {
  const trovato = tutti.find((nome) => nome.startsWith(NOME_RICHIESTO));
  bersagli.push(trovato ? join(dirLogs, trovato) : NOME_RICHIESTO);
} else {
  for (const nome of recenti) bersagli.push(join(dirLogs, nome));
}

let almenoUno = false;
for (const via of bersagli) {
  try {
    const s = riassunto(via);
    if (!s) continue;
    almenoUno = true;
    console.log('\n' + s.nome + ' · ' + s.righe + ' righe · da ' + s.prima + ' a ' + s.ultima);
    if (!s.firme.length && !s.piste.length) console.log('  pulito: nessun crash, nessun avviso pista');
    for (const [chiave, f] of s.firme) {
      const pezzi = [
        f.codice ?? 'eccezione senza codice',
        f.rva ? 'RVA ' + f.rva : null,
        f.thread.size ? 'su ' + [...f.thread].slice(0, 4).join(', ') + (f.thread.size > 4 ? '…' : '') : null,
        f.quante + ' righe [crash]',
      ].filter(Boolean);
      console.log('  ' + chiave + ' ✖ ' + pezzi.join(', '));
    }
    if (s.momento) console.log('  ↳ stava a: ' + UNA(s.momento));
    for (const p of s.piste) console.log('  ⚠ layout con 0 punti Bezier: ' + p);
  } catch (e) {
    console.error('✖ ' + via + ': ' + (e.message ?? e));
  }
}
if (!almenoUno) console.log('Nessun log da riassumere (nessun file o nessuno dentro la finestra di 2 giorni).');

// --crash: il paragrafo del primo crash del log richiesto, così la finestra
// del fault si legge com'è senza andarla a scavare a mano.
if (PARAGRAFO_CRASH && NOME_RICHIESTO) {
  const righe = righeLog(bersagli[0]);
  const iCras = righe.findIndex((r) => r.includes('[crash]'));
  if (iCras >= 0) {
    console.log('\n--- paragrafo del crash (' + oraDi(righe[iCras]) + ') ---');
    const da = Math.max(0, iCras - 12);
    const a = Math.min(righe.length, iCras + 8);
    for (let i = da; i < a; i++) console.log(righe[i]);
  } else {
    console.log('\nNessun crash in questo log.');
  }
}
