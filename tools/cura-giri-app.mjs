// cura-giri-app.mjs — IL PATCH DEI GIRI DEL PADDOCK (2/11, «imposta i giri
// da 12 o più a 3 così provo nuovi campionati»). L'autore del programma lo
// dice dentro il catalogo stesso: «File generato da tools/generate_series.py
// (si può anche modificare a mano)». I giri di ogni ronda NON stanno né nel
// database (Roaming/Paddock/careers/career-N.db: nessun campo laps) né nei
// journal pd-* (quelli li RISCRIVE l'app a ogni giro): stanno nel JSON di
// Paddock.exe, in chiaro. La cura: cercare le occorrenze `"laps":12` nel
// binario e sostituirle con `"laps":3 ` — STESSA lunghezza in byte (lo spazio
// finale è ammesso dal JSON), così l'archivio interno resta congruo.
//
// Regole del mestiere:
//   • NON ammazzare niente: se Paddock.exe è ACCESO il file è bloccato
//     (Windows, EBUSY): la cura lo dice e si ferma — chiudi Paddock
//     dall'icona vicino all'orologio e rilancia.
//   • BACKUP PRIMA: Paddock.exe.bak-giri12 accanto all'exe (solo se manca).
//   • IDEMPOTENTE: un exe già curato (zero `"laps":12`) non viene riscritto.
//   • Solo i 12: le altre durate (5, 8, 9, 10, 11 di gare speciali e Paul
//     Ricard) restano come sono: «da 12 o più», e 11 non lo è.
//
// USO:
//   node tools/cura-giri-app.mjs                    # cerca Paddock.exe al posto di sempre
//   node tools/cura-giri-app.mjs <percorso-exe>     # percorso preciso (anche per le prove)
//   node tools/cura-giri-app.mjs --verifica         # solo diagnostica, nessuna scrittura
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const PAT12 = Buffer.from('"laps":12');
const PAT3 = Buffer.from('"laps":3 ');   // STESSA lunghezza (9 byte): spazio finale, JSON valido

/** Diagnostica di un binario: quante `"laps":12` restano e quante `"laps":3 ` ci sono. */
export function diagnostica(buf) {
  let dodici = 0, tre = 0, i = 0;
  while ((i = buf.indexOf(PAT12, i)) !== -1) { dodici++; i += PAT12.length; }
  i = 0;
  while ((i = buf.indexOf(PAT3, i)) !== -1) { tre++; i += PAT3.length; }
  return { dodici, tre };
}

/** La sostituzione: torna un NUOVO buffer (stessa lunghezza) e il numero di cure. */
export function cura(buf) {
  const out = Buffer.from(buf);              // copia difensiva: il caller non viene sorpreso
  let n = 0, i = 0;
  while ((i = out.indexOf(PAT12, i)) !== -1) {
    PAT3.copy(out, i);
    i += PAT12.length; n++;
  }
  return { buf: out, cure: n };
}

/** Dove sta Paddock.exe, nei posti di sua consuetudine. */
export function casaApp(env = process.env) {
  const candidati = [];
  if (env.USERPROFILE) candidati.push(join(env.USERPROFILE, 'Desktop', 'Paddock', 'Paddock.exe'));
  return candidati;
}

/* ---------------- riga di comando (i test importano le funzioni sopra) ---------- */
const argomenti = process.argv.slice(2);
const SOLO_VERIFICA = argomenti.includes('--verifica');
const percorso = argomenti.find((a) => a !== '--verifica');
// il modulo È il programma: confronto d'URL GIUSTO (pathToFileURL: gli spazi
// nel percorso, tipo «Mod ac evo», escono codificati — un banale confronto
// stringa si sbaglia e la cura taceva al lancio senza argomenti)
const maiModulo = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (maiModulo) {
  const bersaglio = percorso ?? casaApp().find((f) => { try { statSync(f); return true; } catch { return false; } });
  if (!bersaglio) {
    console.error('uso: node tools/cura-giri-app.mjs [<percorso Paddock.exe>] | --verifica');
    console.error('nessun Paddock.exe al posto di abitudine (Desktop/Paddock). Passa il percorso a mano.');
    process.exit(2);
  }
  let exe;
  try { exe = readFileSync(bersaglio); }
  catch (e) {
    if (e.code === 'EBUSY') {
      console.error("Paddock è ACCESO: il file è bloccato. Chiudi Paddock (icona vicino all'orologio) e rilancia la cura.");
      process.exit(1);
    }
    throw e;
  }
  const prima = diagnostica(exe);
  if (prima.dodici === 0) {
    console.log(`✓ ${bersaglio}: zero "laps":12 — già curato (${prima.tre} quote a 3 giri). Niente da fare.`);
    process.exit(0);
  }
  if (SOLO_VERIFICA) {
    console.log(`--verifica: ${bersaglio}: ${prima.dodici} da curare · ${prima.tre} già a 3`);
    process.exit(0);
  }
  const bak = bersaglio + '.bak-giri12';
  try { statSync(bak); } catch { copyFileSync(bersaglio, bak); console.log('backup scritto: ' + bak); }
  const { buf: curato, cure } = cura(exe);
  try {
    writeFileSync(bersaglio, curato);
    console.log(`✓ ${bersaglio}: ${cure} ronde 12→3 · file della STESSA lunghezza: ${curato.length === exe.length}`);
    console.log("  Riapri Paddock (icona vicino all'orologio): al prossimo giro i journal");
    console.log('  escono a 3 giri e la scheda gara li imposta nel gioco.');
  } catch (e) {
    if (e.code === 'EBUSY') {
      console.error('Paddock si è acceso durante la scrittura: chiudilo e rilancia (i blocchi sono al sicuro).');
      process.exit(1);
    }
    throw e;
  }
}
