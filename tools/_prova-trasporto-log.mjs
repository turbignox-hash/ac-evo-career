// _prova-trasporto-log.mjs — replica il trasporto IDENTICO al server
// (stesso PS_SCRIPT qui sotto, copiato da src/voce-copilota.mjs) ma ogni
// riga letta da PowerShell lascia un'impronta su %TEMP%\trasporto-letture.log:
// se il loop non legge, non decodifica o non parla, l'impronta lo dice.
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARK = join(tmpdir(), 'trasporto-letture.log');
const IMP = (s) => { try { appendFileSync(MARK, `${Date.now()} ${s}\n`); } catch {} };

const PS_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
try { Add-Type -AssemblyName System.Speech; $_la = 'ok' } catch { $_la = $_.Exception.Message }
IMPRONA-CARICAMENTO
$sp = New-Object System.Speech.Synthesis.SpeechSynthesizer
$sp.Rate = 0
$sp.Volume = 100
try {
  $it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' -and $_.VoiceInfo.Gender -eq 'Male' } | Select-Object -First 1
  if (-not $it) { $it = $sp.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'it*' } | Select-Object -First 1 }
  if ($it) { $sp.SelectVoice($it.VoiceInfo.Name) }
} catch {}
IMPRONA-VOCI
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line) { continue }
  try {
    if ($line -eq '__CANCEL__') { $sp.SpeakAsyncCancelAll(); continue }
    if ($line.StartsWith('B64:')) {
      $t = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($line.Substring(4)))
      IMPIERA-LETTURA
      if ($t) {
        $sp.Speak($t)
        IMPFESA-FINITA
      }
    }
  } catch {}
}`;

// il PS vero non conosce i miei segnaposto: li trasformo in Scrivi su TMP
// PowerShell accetta BARRE INVERTE UNICHE ("/") nel cammino file:
// JSON.stringify ai backslash produce il doppio escape uccidevi (disporta
// parsa di PS 5.1 e la vox muore al silenzio). Barri sempri ilti.
const tmpF = MARK.split('\\').join('/');
const rigaLog = (nome) => `try { [IO.File]::AppendAllText("${tmpF}", "${nome} " + [DateTime]::Now.ToString('HH:mm:ss.fff') + [Environment]::NewLine) } catch {}`;
const SCRIPT_REALE = PS_SCRIPT
  .replace('IMPRONA-CARICAMENTO', rigaLog('CARICAMENTO'))
  .replace('IMPRONA-VOCI', rigaLog('VOCE:' + '$it.VoiceInfo.Name'))
  .replace('IMPIERA-LETTURA', rigaLog('LETTA:' + '$t'))
  .replace('IMPFESA-FINITA', rigaLog('FINITA'));

try { appendFileSync(MARK, ''); } catch {}
const figlio = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT_REALE], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
figlio.stderr.on('data', (c) => IMP(`STDERR ${String(c).slice(0, 200)}`));
figlio.on('exit', (code, sig) => IMP(`ESCE code=${code} sig=${sig}`));
'__BLOCCO_NON_VALORI__' && IMP(`spawn pid=${figlio.pid}`);
figlio.stdin.write('B64:' + Buffer.from('Prova del trasporto strumentato: uno, due, tre.', 'utf8').toString('base64') + '\n');
await sleep(22000);
try { figlio.stdin.end(); } catch {}
await sleep(1500);
console.log('--- impronte ---');
console.log(readFileSync(MARK, 'utf8'));
