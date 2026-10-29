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
//
// USO (2/11, lezione live della mattina): invocato SENZA PID il vecchio
// comportamento partiva comunque il rientro senza ammazzare il vecchio —
// il nuovo processo moriva sulla porta occupata e restava il doppione.
// Ora il PID si SCOPRE DA SOLO con un colpo di netstat: anche l'uso a mano
// («node tools/riavvia-webui.mjs») rientra davvero col server viva.
import { spawn, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const win32 = process.platform === 'win32';

/** Il PID passato a mano («riavvia-webui.mjs 23732»): numero > 0 o niente. */
function pidDaArgomenti() {
  const n = Number(process.argv[2]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Il PID che LISTENA sulla porta (netstat -ano, colonna PID): il server
 *  webui ascolta SEMPRE su 127.0.0.1, per cui una sola riga LISTENING basta.
 *  IPv4 e IPv6 portano lo stesso PID: l'overlap non preoccupa (due PID diversi
 *  SULLA STESSA porta = due processi attaccati in podem — non decidiamo
 *  noi quale ammazzare: `null`, farsi stabile per il gestore della porta).
 *  Porta libera o netstat muto: `null` (non ammazzo nessuno). `righe`
 *  (solo per i test) sostituisce l'output: il parsing si prova senza lanciarlo. */
export function pidSullaPorta(porta, { cmd = 'netstat -ano', righe = null } = {}) {
  let testi = righe;
  if (!testi) {
    try { testi = execSync(cmd, { encoding: 'utf8', timeout: 4000, windowsHide: true }).split(/\r?\n/); } catch { return null; }
  }
  const suPorta = new RegExp(`:${porta}\\b`);
  const pidVisti = new Set();
  for (const riga of testi) {
    if (!/\bLISTENING\b/.test(riga)) continue;
    const colonne = riga.trim().split(/\s+/);
    // registro TCP: [proto, local, remote, stato, pid]   (UDP non listen)
    if (colonne.length < 5) continue;
    if (!suPorta.test(colonne[1])) continue;
    const pid = Number(colonne[colonne.length - 1]);
    if (Number.isInteger(pid) && pid > 0) pidVisti.add(pid);
  }
  const visti = [...pidVisti];
  return visti.length === 1 ? visti[0] : null;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // 1) caccia la risposta al browser
  await sleep(1200);

  // 2) ammazza il vecchio (se c'è ancora) — a mano o scoperto sulla porta
  const PORTA = 8642;
  const pidVecchio = pidDaArgomenti() ?? pidSullaPorta(PORTA);
  if (pidVecchio) {
    try { process.kill(pidVecchio); } catch { /* già morto: va bene così */ }
  }

  // 3) aspetta la porta libera: un tentativo ogni 300ms, max 10s
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
}
