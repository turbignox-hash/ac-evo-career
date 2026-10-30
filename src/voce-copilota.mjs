// voce-copilota.mjs - la voce della copilota passa lato PITWALL (29/10):
// prima esisteva SOLO dentro la barra «Ingegnere LIVE» della GUI del browser
// (viste-a.js, speechSynthesis): in gara con la GUI chiusa oppure non aperta
// sul cruscotto la copilota taceva del tutto — è la causa certa della serata
// muta del 28/10: il registro data/copilot-*.jsonl mostrava frasi giuste già
// calcolate e nessuna voce fuori perché nessuno parlava.
// Da qui: un relatore Windows (System.Speech di PowerShell, nulla da installare)
// che il server Node tiene VIVO: un processo PowerShell persistente legge una
// riga alla volta da stdin e la parla IN FILA (Speak bloccante sequenziale —
// le frasi non si accavalcano, come la coda del copilot che ha sempre avuto la
// GUI), rinasce da solo se muore, tace se la finestra chiusa.
// I DISCORSI li scrive l'UNICO narratore già replicato 1:1 con la vista e
// guidato dal test (tools/_monitor-copilota.mjs → narratore): qui dentro solo
// il trasporto (righe → voce) e la fase di sessione (firma/grazia/live),
// nessuna logica di radio duplicata.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { narratore } from '../tools/_monitor-copilota.mjs';

/* Lo script del relatore: riga per riga da stdin.
   $sp.Speak() è BLOCCANTE: le frasi si incodano da sole nell'ordine in cui
   arrivano — mantiene l'ordine di discorso come la radio reale. Il testo
   viaggia in BASE64 (prefisso 'B64:') perché stdin di PowerShell non
   garantisce l'UTF-8 delle lettere accentate ('è'/'à') al primo colmo.
   '__CANCEL__' svuota la coda al volo (usato da silenzio()/spegnimento voce). */
const PS_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sp.Rate = 0
$sp.Volume = 100
try {
  # Prima quello che c'è SEMPRE stato: la voce italiana MASCHILE (Cosimo;
  # Elsa Desktop, la femminile vecchia e pasticciata, solo come ripiego).
  $it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' -and $_.VoiceInfo.Gender -eq 'Male' } | Select-Object -First 1
  if (-not $it) { $it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' } | Select-Object -First 1 }
  if ($it) { $sp.SelectVoice($it.VoiceInfo.Name) }
} catch {}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line) { continue }
  try {
    if ($line -eq '__CANCEL__') { $sp.SpeakAsyncCancelAll(); continue }
    if ($line.StartsWith('B64:')) {
      $t = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($line.Substring(4)))
      if ($t) { $sp.Speak($t) }
    }
  } catch {}
}`;

/* creaVoceCopilota(): il relatore. parla(t) incoda la frase (avvia il processo
   al primo uso, lo rigenera se è morto), silenzio() svuota la coda al volo,
   spegni() chiude lo stdin (il loop di PS esce da solo, chiude pulito). */
export function creaVoceCopilota() {
  let figlio = null;
  const avvia = () => {
    if (figlio) return figlio;
    try {
      figlio = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      figlio.on('exit', () => { figlio = null; });
      figlio.on('error', () => { figlio = null; });
      figlio.stdin.on('error', () => { figlio = null; });      // scrivere su un processo appena morto non deve seppellire il server
      figlio.stderr.on('data', () => {});
      figlio.stderr.on('error', () => { figlio = null; });
    } catch { return null; }
    return figlio;
  };
  return {
    parla(testo) {
      if (!testo || process.platform !== 'win32') return;
      const f = avvia();
      if (!f) return;
      try { f.stdin.write('B64:' + Buffer.from(String(testo), 'utf8').toString('base64') + '\n'); } catch { figlio = null; }
    },
    silenzio() { try { figlio?.stdin.write('__CANCEL__\n'); } catch { /* niente */ } },
    spegni() { try { figlio?.stdin.end(); } catch { /* niente */ } figlio = null; },
  };
}

/* nuovoSlotVoce(): la memoria dei narratori lato server, la stessa anatomia
   di slot/narratore (last.*, at, said) più la FIRMA di sessione e la GRAZIA
   (15 s di silenzio a inizio sessione: i primi valori della shared memory
   portano spesso la sessione prima — l'incantesimo del «metà gara in baia»). */
export function nuovoSlotVoce() {
  return { last: {}, at: 0, said: {}, firma: null, sawLive: false, grace: 0 };
}

const loga = (log, riga) => { if (!log) return; try { appendFileSync(log.file, JSON.stringify(riga) + '\n'); } catch { /* il muro non deve frenare la voce */ } };

/* LIVELLI VOCE (30/10, richiesta Mauro: "se il copilot deve funzionare minimo
   indispensabile, normale o full con tutto quello che puo' dire"):
   - essenziale: SOLO quello che reputi mentre guidi - box aperti/chiusi, finestra
     sosta, benzina, bandiera blu, ultimo giro, bandiera a scacchi, penalita' tagli.
   - normale (il default di SEMPRE): + il turno del giro fatto, meta benzina,
     gomme, posizione persa/recuperata.
   - full: TUTTO - anche il delta di ritmo e la distanza da chi ti sta davanti.
   'off' non entra nel filtro giroVoce: lo legge la webui e non chiama la voce. */
export const VOCE_LIVELLI = ['essenziale', 'normale', 'full'];
const FRASI_LIVELLO = {
  // 29/10: + «verde» — la bandiera verde di via libera si sente in pista a
  // qualunque livello (essenziale incluso): è l'ordine di partire, non un
  // dettaglio di ricchezza.
  // 31/10 notte: + «rossa» e «nera» — stessa fontana del verde (flagCode 3
  // e 6): la rossa del restart e la nera della squalifica sono ordini di
  // pista, non dettagli di ricchezza, e devono potersi SENTIRE e REGISTRARE.
  // 29/10 tardi: + «minuto» nelle gare a TEMPO («Ultimo minuto!», «Trenta
  // secondi!») — chi guida deve sapere che la gara chiude, e la fonte
  // esiste SOLO nelle gare a tempo (timeLeft arriva quando lo static dice
  // timedRace): nelle gare a giri la frase non nasce mai, il livello non
  // cambia nulla. Opposto del delta di ritmo, che resta di lusso del full.
  essenziale: 'boxclose boxopen blu ultimoGiro bandiera minuto verde rossa nera benzina pit pitcount penalia'.split(' '),
  normale: 'boxclose boxopen blu ultimoGiro bandiera minuto verde rossa nera benzina pit pitcount penalia giroFatto metaBenzina gomme postalk'.split(' '),
  full: null,   // null = nessun filtro: anche delta e gap parlano
};
const chePuoiDire = (livello) => {
  if (!FRASI_LIVELLO[livello]) return null;
  return new Set(FRASI_LIVELLO[livello]);
};

/* giroVoce(m, slot, voce, log): UNO TICK. Riceve il payload di /api/ingegnere,
   segue la fase (live fuori/viva, firma sessione = memoria a zero, 15 s di
   grazie) e alimenta l'único narratore; le frasi NUOVE (non zittite dalla
   guardia dei 70 s) vanno alla voce del Pitwall e in coda al registro. */
export function giroVoce(m, slot, voce, { log = null, ora = Date.now(), graziaMs = 15000, livello = 'normale' } = {}) {
  if (!m?.live) {
    if (slot.sawLive) {
      slot.sawLive = false;
      loga(log, { t: ora, evento: 'SESSIONE FUORI — la voce del Pitwall tace finché non riparte la live' });
    }
    return;
  }
  if (!slot.sawLive) {
    slot.sawLive = true;
    slot.last = {}; slot.at = 0; slot.grace = ora + graziaMs;
    loga(log, { t: ora, evento: `SESSIONE VIVA — voce del Pitwall pronta${graziaMs > 0 ? ' (15 s di grazia)' : ''}` });
  }
  const firma = m.sessionId ?? null;
  if (firma != null && firma !== slot.firma) {
    slot.firma = firma;
    slot.last = {}; slot.said = {}; slot.at = 0;
    slot.grace = ora + graziaMs;
    loga(log, { t: ora, evento: 'SESSIONE NUOVA (firma cambiata) — memoria dei narratori azzerata, grazia ripartita' });
  }
  if (ora < (slot.grace ?? 0)) return;   // la grazia mangia i dati bruciati: non si ragiona su di loro
  /* il filtro del LIVELLO (30/10): il narratore calcola tutte le frasi
     (funzione pura), qui si decide quale CHI ha il permesso del livello scelto. */
  const concesso = livello === 'full' ? null : chePuoiDire(livello);
  for (const f of narratore(m, slot)) {
    if (f.detto) continue;
    // 'off' = la radio gira lo stesso (il narratore semina lo stato di slot:
    // al ritorno di un livello superiore la memoria è sgombra di fantasmi)
    // ma NON esce una frase né al parlante né sul registro.
    if (livello === 'off' || (concesso && !concesso.has(f.chi))) continue;
    voce.parla(f.it);
    loga(log, { t: ora, chi: f.chi, it: f.it, livello });
  }
}
