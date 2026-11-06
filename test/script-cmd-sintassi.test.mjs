// script-cmd-sintassi.test.mjs — LA GUARDIA DEI .CMD (6/11, richiesta Mauro:
// «aggiungi una guardia che fallisce se negli script .cmd ricompare sintassi
// Unix come >/dev/null»).
//
// Il difetto custodito, appena costato un test rosso: in installa.cmd la copia
// dello zip era scritta `copy /Y ... >/dev/null`. In un .cmd quel redirect è un
// PERCORSO, non un device: cmd prova a creare \dev\null, non ci riesce e
// ABORTISCE la riga PRIMA di eseguire `copy` — ma l'`errorlevel` resta 0, quindi
// nessun controllo se ne accorge e il guasto salta fuori più tardi, da `tar`
// («Impossibile trovare il percorso specificato»). Un errore così non si vede
// leggendo lo script: si vede solo eseguendolo.
//
// Qui si leggono TUTTI gli .cmd/.bat del progetto (tranne le cartelle generate
// o ignorate: node_modules, .git, dist, data) e si cerca la sintassi che cmd
// non capisce, riga per riga, SALTANDO i commenti (`rem` e `::`): un commento
// che nomina /dev/null è proprio quello che spiega il divieto, e non deve far
// fallire la guardia.
//
// Le regole sono poche e volutamente strette, per non diventare un semaforo
// rumoroso: il null device di Unix, i redirect verso le cartelle di sistema di
// Unix, lo shebang, e i comandi dell'altra shell che in un .cmd non esistono o
// hanno un'altra opzione (chmod, `mkdir -p`, rm, cp, mv, …). Ognuno porta
// l'EQUIVALENTE cmd nel messaggio, perché un errore che non dice cosa scrivere
// al suo posto fa perdere il tempo che la guardia doveva risparmiare. Il
// controllo è senza browser e senza Windows: legge file, quindi gira ovunque.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Cartelle generate o di dati: non sono sorgenti da correggere (dist/ è
 *  gitignored e nasce dai sorgenti, data/ è del giocatore). */
const SALTATE = new Set(['node_modules', '.git', 'dist', 'data']);

/** Tutti gli .cmd/.bat del progetto, percorsi relativi alla radice. */
function scriptCmd(dir = RADICE, out = []) {
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    const pieno = join(dir, voce.name);
    if (voce.isDirectory()) {
      if (!SALTATE.has(voce.name)) scriptCmd(pieno, out);
    } else if (/\.(cmd|bat)$/i.test(voce.name)) {
      out.push(relative(RADICE, pieno));
    }
  }
  return out.sort();
}

/** Un commento cmd: `rem ...` (anche `@rem`) o `:: ...`. Lì dentro si può
 *  parlare di /dev/null quanto si vuole. */
const eCommento = (riga) => /^\s*@?\s*(?:rem\b|::)/i.test(riga);

const REGOLE = [
  {
    nome: 'null device di Unix',
    re: /\/dev\/(?:null|stdout|stderr|zero|tty)\b/i,
    fix: 'usa >nul per il silenzio su stdout e 2>nul per stderr',
  },
  {
    nome: 'redirect in una cartella di sistema Unix',
    re: />{1,2}\s*\/(?:tmp|etc|usr|var|bin|opt|home|proc|sys)\//i,
    fix: 'scrivi in %TEMP% (o in %WORK% dello script), non in una cartella Unix',
  },
  {
    nome: 'shebang Unix dentro un .cmd',
    re: /^#!\s*\/(?:usr\/)?bin\//,
    fix: "un .cmd non ha shebang: l'interprete è cmd.exe",
  },
];

/**
 * I COMANDI DELL'ALTRA SHELL (6/11, richiesta Mauro: «aggiungi alla guardia anche
 * i comandi Unix più comuni, con l'elenco dei comandi cmd equivalenti nel
 * messaggio d'errore»).
 *
 * Sono le forme che un copia-incolla da Linux porta dentro un .cmd: il comando
 * o non esiste (`rm`, `cp`, `chmod`), o esiste con un'altra opzione (`mkdir -p`:
 * in cmd `mkdir` crea già le cartelle intermedie, senza -p). Il comando deve
 * stare a INIZIO COMANDO — inizio riga o dopo & | ( ) — così un nome citato in
 * un `echo`, o un pezzo di percorso, non fa scattare niente.
 */
const EQUIVALENTI = [
  { nome: 'chmod (permessi Unix)', re: /\bchmod\b/gi, fix: 'usa icacls per i permessi, attrib per sola-lettura/nascosto' },
  { nome: 'chown (proprietario Unix)', re: /\bchown\b/gi, fix: "non c'è: su Windows il proprietario si cambia con icacls /setowner" },
  { nome: 'ln -s (collegamento simbolico)', re: /\bln\b\s+-s/gi, fix: 'usa mklink per un file, mklink /D per una cartella' },
  { nome: 'mkdir -p (cartelle intermedie)', re: /\bmkdir\b\s+(?:-[a-z]*p\b|--parents)/gi, fix: 'usa mkdir (o md) SENZA -p: in cmd crea già le cartelle intermedie' },
  { nome: 'rm (cancellazione Unix)', re: /\brm\b/gi, fix: 'usa del /F /Q per i file, rmdir /S /Q per una cartella intera (rm -rf)' },
  { nome: 'mv (spostamento Unix)', re: /\bmv\b/gi, fix: 'usa move, per file e cartelle' },
  { nome: 'cp (copia Unix)', re: /\bcp\b/gi, fix: 'usa copy /Y per un file, xcopy /E /I o robocopy per una cartella (cp -r)' },
  { nome: 'touch (crea o vuota un file)', re: /\btouch\b/gi, fix: 'usa type nul > file, oppure copy nul file >nul' },
  { nome: 'cat (legge un file)', re: /\bcat\b/gi, fix: 'usa type file' },
  { nome: 'ls (elenca una cartella)', re: /\bls\b/gi, fix: 'usa dir' },
  { nome: 'grep (cerca nel testo)', re: /\bgrep\b/gi, fix: 'usa findstr: findstr /S /I "testo" *.txt' },
  { nome: 'sed/awk (filtri Unix)', re: /\b(?:sed|awk)\b/gi, fix: 'non ci sono in cmd: usa uno script Node o PowerShell' },
  { nome: 'which (dove sta un comando)', re: /\bwhich\b/gi, fix: 'usa where' },
  { nome: 'export VAR=valore (ambiente Unix)', re: /\bexport\b\s+[A-Za-z_]\w*=/gi, fix: 'usa set "VAR=valore"' },
  { nome: 'shell Unix (bash/sh)', re: /\b(?:bash|sh)\b\s+(?:-\w|\S+\.sh)/gi, fix: 'un .cmd lo esegue cmd.exe: riscrivi la riga in comandi cmd' },
  { nome: 'sudo (elevazione Unix)', re: /\bsu(?:do)\b/gi, fix: "non c'è: lo script deve dire cosa serve e lasciare l'elevazione all'utente" },
];

/** Il comando è a inizio riga o dopo un separatore di comandi cmd (& | ( ))? */
function aInizioComando(riga, indice) {
  const prima = riga.slice(0, indice).replace(/\s+$/, '');
  return prima === '' || /[&|(]$/.test(prima);
}

/** Le violazioni di UNA riga (array vuoto = riga pulita). Puro: la guardia lo
 *  prova anche su righe finte, così non può passare perché non guarda niente. */
function violazioniRiga(riga) {
  if (eCommento(riga)) return [];
  const fuori = REGOLE.filter((r) => r.re.test(riga)).map((r) => ({ nome: r.nome, fix: r.fix }));
  for (const c of EQUIVALENTI) {
    // tutte le occorrenze: `chmod +x a; rm -rf b` ne ha due da dire
    for (const m of riga.matchAll(c.re)) {
      if (!aInizioComando(riga, m.index)) continue;
      fuori.push({ nome: c.nome, fix: c.fix });
      break;
    }
  }
  return fuori;
}

/** Le violazioni di un intero script: `{ riga, testo, nome, fix }`. */
function violazioniScript(contenuto) {
  const fuori = [];
  contenuto.split(/\r?\n/).forEach((testo, i) => {
    for (const v of violazioniRiga(testo)) fuori.push({ riga: i + 1, testo: testo.trim(), ...v });
  });
  return fuori;
}

test('nessuno script .cmd/.bat del progetto usa sintassi Unix', () => {
  const script = scriptCmd();
  assert.ok(script.length >= 5, `trovati solo ${script.length} script .cmd/.bat: la scansione non sta guardando il progetto (radice: ${RADICE}).`);

  const guasti = [];
  for (const file of script) {
    for (const v of violazioniScript(readFileSync(join(RADICE, file), 'utf8'))) {
      guasti.push(`${file}:${v.riga} — ${v.nome}: ${v.testo}\n    → ${v.fix}`);
    }
  }
  assert.equal(guasti.length, 0,
    `${guasti.length} righe di script Windows usano sintassi Unix (cmd le esegue male, spesso senza segnalare l'errore):\n  ${guasti.join('\n  ')}`);
});

test('la guardia riconosce i casi veri (e non è cieca)', () => {
  assert.deepEqual(violazioniRiga('copy /Y "a.zip" "b.zip" >/dev/null').map((v) => v.nome), ['null device di Unix']);
  assert.equal(violazioniRiga('curl -s http://x -o out.zip 2>/dev/null').length, 1, 'la forma 2>/dev/null deve cadere');
  assert.equal(violazioniRiga('echo fatto >>/tmp/log.txt').length, 1, 'un redirect in /tmp è sintassi Unix');
  assert.equal(violazioniRiga('#!/bin/sh').length, 1, 'lo shebang dentro un .cmd è sintassi Unix');
  // e il messaggio dice come si corregge
  assert.match(violazioniRiga('x >/dev/null')[0].fix, />nul/);
});

test('la guardia vede i comandi Unix più comuni e dice il comando cmd equivalente', () => {
  const casi = [
    ['chmod +x avvia.cmd', /chmod/, /icacls/],
    ['mkdir -p "%WORK%\\tools"', /mkdir -p/, /senza -p/i],
    ['mkdir --parents out', /mkdir -p/, /md/],
    ['rm -rf "%WORK%"', /rm /, /rmdir \/S \/Q/],
    ['rm vecchio.zip', /rm /, /del \/F \/Q/],
    ['cp -r tools x', /cp /, /xcopy \/E \/I/],
    ['cp a.zip b.zip', /cp /, /copy \/Y/],
    ['mv out.git out', /mv /, /move/],
    ['ln -s src/app.mjs app.mjs', /ln -s/, /mklink/],
    ['touch build-id.txt', /touch/, /type nul/],
    ['cat build-id.txt', /cat/, /type/],
    ['ls dist', /ls /, /dir/],
    ['grep -i token data/.github-token', /grep/, /findstr/],
    ['which node', /which/, /where/],
    ['export EVO_INSTALLER_FAST=1', /export/, /set "VAR=valore"/],
    ['bash tools/x.sh', /bash/, /cmd\.exe/],
  ];
  for (const [riga, nome, equivalente] of casi) {
    const v = violazioniRiga(riga);
    assert.equal(v.length, 1, `«${riga}» deve cadere una volta sola (cadute: ${v.map((x) => x.nome).join(', ') || 'nessuna'})`);
    assert.match(v[0].nome, nome, `nome sbagliato per «${riga}»: ${v[0].nome}`);
    assert.match(v[0].fix, equivalente, `il messaggio per «${riga}» deve dire cosa scrivere al posto suo: ${v[0].fix}`);
  }
  // due comandi Unix sulla stessa riga, separati da &&: si vedono tutti e due
  assert.equal(violazioniRiga('chmod +x a && rm -rf b').length, 2);
  // con il punto e virgola (che in cmd NON separa comandi) il comando di testa
  // è comunque segnalato: la riga va riscritta lo stesso
  assert.equal(violazioniRiga('chmod +x a; rm -rf b').length, 1);
});

test('la guardia non scambia per comando Unix ciò che è cmd vero o solo una parola', () => {
  // comandi cmd legittimi, compreso quello che lo script usa davvero
  for (const riga of [
    'mkdir "%WORK%" >nul 2>nul',
    'md "%WORK%"',
    'del /F /Q "%ZIPCOD%"',
    'rmdir /S /Q "%WORK%"',
    'move /Y a b',
    'xcopy /E /I tools "%DEST%\\tools"',
    'copy /Y "%P%" "%Q%" >nul',
    'icacls "%DEST%" /grant *S-1-1-0:(OI)(CI)F',
    'type nul > build-id.txt',
    'where node',
  ]) {
    assert.deepEqual(violazioniRiga(riga), [], `«${riga}» è cmd valido e non deve cadere`);
  }
  // il nome dentro un messaggio o un percorso non è un comando
  assert.deepEqual(violazioniRiga('echo uso chmod e rm -rf solo su Linux'), []);
  assert.deepEqual(violazioniRiga('set "PATH=%PATH%;C:\\cp"'), []);
  assert.deepEqual(violazioniRiga('echo copia in %TEMP%\\ls\\out'), []);
  // e nei commenti si può parlare di tutto
  assert.deepEqual(violazioniRiga('rem qui niente chmod né rm -rf'), []);
});

test('la guardia non grida sui commenti né sul cmd corretto', () => {
  assert.deepEqual(violazioniRiga('rem niente /dev/null qui: in un .cmd il redirect a Unix fallisce'), []);
  assert.deepEqual(violazioniRiga('  :: 2>/dev/null non si usa'), []);
  assert.deepEqual(violazioniRiga('@rem attenzione a >/dev/null'), []);
  assert.deepEqual(violazioniRiga('copy /Y "%P%" "%Q%" >nul'), []);
  assert.deepEqual(violazioniRiga('echo   [!] Errore & goto fallito'), []);
  assert.deepEqual(violazioniRiga('if errorlevel 1 ( echo   [!] no & goto fallito )'), []);
  // il conteggio delle righe resta quello del file: la riga del guasto si indica
  assert.deepEqual(violazioniScript('@echo off\r\nrem ok /dev/null\r\ncopy a b >/dev/null\r\n'), [
    { riga: 3, testo: 'copy a b >/dev/null', nome: 'null device di Unix', fix: 'usa >nul per il silenzio su stdout e 2>nul per stderr' },
  ]);
});

test('la scansione trova davvero gli script (nomi e cartelle giuste)', () => {
  const script = scriptCmd();
  for (const atteso of ['installa.cmd', 'avvia.cmd', 'disinstalla.cmd']) {
    assert.ok(script.includes(atteso), `la scansione non vede ${atteso} (visti: ${script.slice(0, 8).join(', ')}…)`);
  }
  assert.ok(!script.some((f) => f.startsWith('node_modules')), 'node_modules non va scandito');
  assert.ok(!script.some((f) => f.startsWith('dist')), 'dist (generata) non va scandita: conterebbe copie vecchie');
  assert.ok(script.every((f) => statSync(join(RADICE, f)).isFile()), 'ogni voce deve essere un file vero');
});
