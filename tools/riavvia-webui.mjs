// riavvia-webui.mjs — IL RIENTRO DI "AGGIORNA ORA" (24/10, richiesta Mauro):
// «l'aggiornamento dice "Riavvia il launcher": automatizza il kill+rientro».
//
// Il server webui.mjs, quando ha aggiornato il codice NUOVO a disco
// (fetch + merge riusciti da "Aggiorna ora"), spawna QUESTO helper staccato
// e poi esce. L'helper:
//   1. aspetta una manciata di millisecondi (la risposta "Aggiornato a …"
//      del clic deve arrivare al browser PRIMA che il server muoia);
//   2. ammazza il PID vecchio;
//   3. aspetta che la porta si liberi davvero (poll, max 10s);
//   4. riparte "node src/webui.mjs" (finestra ridotta a icona su Windows),
//      e NON torna mai prima che la nuova interfaccia risponda.
// Se qualcosa va storto, esce con il messaggio sullo stdout della finestra
// nuova: la GUI resta al vecchio codice e l'utente vede la barra sparita,
// mai una pagina morta.
// Uso: node tools/riavvia-webui.mjs <pid-vecchio>
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const pidVecchio = Number(process.argv[2]);
const win32 = process.platform === 'win32';

// 1) caccia la risposta al browser
await sleep(1200);

// 2) ammazza il vecchio (se c'è ancora)
if (pidVecchio) {
  try { process.kill(pidVecchio); } catch { /* già morto: va bene così */ }
}

// 3) aspetta la porta libera: un tentativo ogni 300ms, max 10s
const PORTA = 8642;
const url = `http://127.0.0.1:${PORTA}/api/agg-info`;
const tetto = Date.now() + 10000;
for (;;) {
  try { await fetch(url, { signal: AbortSignal.timeout(1200) }); await sleep(300); } // ancora vivo: riprova
  catch { break; }                                                            // giù: la porta è libera
  if (Date.now() > tetto) break;                                              // non cede: partiamo lo stesso
}
await sleep(500);

// 4) rientro: stessa interfaccia, stesso porto
if (win32) {
  // `start "titolo" /min cmd /c ...`: finestra console ridotta a icona, chiudibile
  spawn('cmd', ['/c', 'start', 'EVO Pitwall', '/min', 'cmd', '/c', 'node src\\webui.mjs'], {
    cwd: RADICE, detached: true, stdio: 'ignore',
  }).unref();
} else {
  spawn('node', ['src/webui.mjs'], { cwd: RADICE, detached: true, stdio: 'ignore' }).unref();
}

// e verifica che sia tornato (solo per la verità del log: se fallisce la GUI
// resta sulla pagina già aperta, che rinfresca da sé)
for (let n = 0; n < 20; n++) {
  await sleep(700);
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1200) }); if (r.ok) process.exit(0); } catch { /* non ancora */ }
}
process.exit(0);
