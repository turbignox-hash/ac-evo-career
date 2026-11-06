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
// Unix, lo shebang. Il controllo è senza browser e senza Windows: legge file,
// quindi gira ovunque.

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

/** Le violazioni di UNA riga (array vuoto = riga pulita). Puro: la guardia lo
 *  prova anche su righe finte, così non può passare perché non guarda niente. */
function violazioniRiga(riga) {
  if (eCommento(riga)) return [];
  return REGOLE.filter((r) => r.re.test(riga)).map((r) => ({ nome: r.nome, fix: r.fix }));
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
