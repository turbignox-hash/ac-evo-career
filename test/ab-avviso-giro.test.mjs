// ab-avviso-giro.test.mjs — LA GUARDIA DELL'AVVISO DEL GIRO SINGOLO
// (3/11, richiesta Mauro: «un guard test che fallisce se il modale A/B non
// porta l'avviso del giro singolo»).
//
// La lezione del banco (Monza 296 · 18:13, «best» 133,10 s): una sessione
// con un solo giro valido può essere un OUT-LAP senza cronometro — il .ldx
// non ha beacon e il parser tiene la SESSIONE INTERA come unico giro, così
// il «best» è la durata dell'uscita, non un giro. Il modale del confronto
// porta da quel giorno un banner ⚠️ in testa, sempre, quando A o B arriva
// con un solo giro (viste-analisi.js: unSoloGiro → avvisoGiro).
//
// Stessa cura delle guardie delle viste (viste-guard.test.mjs): la sorgente
// gui/js si legge TESTUALMENTE, perché gli script globali della GUI sfuggono
// a Biome e a ogni import — la rottura qui è un cancello che si toglie con
// un backspace, e la guardia deve accorgersene. Tre leggi:
//
//   1. il trigger esiste: avvisoGiro nasce solo quando A o B ha
//      `d.A.laps === 1 || d.B.laps === 1` — niente banner di fondo a caso;
//   2. il banner è DENTRO il modale: la wire `${avvisoGiro}` ricercata nel
//      template tra il marker del titolo «Banco A/B — confronto» e la fine
//      della sezione del banco — cancellarla dal template = test rosso;
//   3. l'avviso dice COSA guardare: parola di out-lap e di beacon nel testo
//      del banner (it/EN), così l'avvertimento regge anche tradotto.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'gui', 'js', 'viste-analisi.js'), 'utf8');

// la fetta del modale: dal titolo del confronto ALLA FRONTIERA della sezione
// successiva (4) MONTE CARLO) — tutta la veste resa dal modale del banco;
// nessun `${avvisoGiro}` fuori posto in altro file o in altro modale.
const segno = 'Banco A/B — confronto';
const inizio = src.indexOf(segno);
assert.ok(inizio >= 0, 'faro mancante: nel renderAB non c\'è più il titolo «Banco A/B — confronto» — sistemare il faro della guardia');
const fine = src.indexOf('/* -------------------- 4)');
const vesta = inizio >= 0 && fine > inizio ? src.slice(inizio, fine) : src;

test('il modale del banco porta il banner dell\'avviso del giro singolo', () => {
  assert.ok(vesta.includes('${avvisoGiro}'), 'GUARDIA COLPITA: il modale A/B non porta più ${avvisoGiro} — l\'avviso del giro singolo è sparito dal confronto');
});

test('il trigger dell\'avviso è il conto giri di A e B (niente banner a caso)', () => {
  assert.ok(src.includes('d.A.laps === 1 || d.B.laps === 1'),
    'GUARDIA COLPITA: il trigger «d.A.laps === 1 || d.B.laps === 1» non c\'è più — avvisoGiro non è più legato al conto dei giri');
  // il banner warn si costruisce solo sotto quel trigger (operatore ternario)
  const riga = src.match(/\n\s*const avvisoGiro = .*/)?.[0] ?? '';
  assert.ok(riga.includes('unSoloGiro ?'),
    `GUARDIA COLPITA: avvisoGiro non dipende più da unSoloGiro (riga: «${riga.trim().slice(0, 120)}»)`);
});

test('il banner dice cosa guardare: out-lap e beacon, in entrambe le lingue', () => {
  for (const parola of ['out-lap', 'nessun beacon', 'no timed crossing', 'no beacons']) {
    assert.ok(src.includes(parola), `GUARDIA COLPITA: il testo dell'avviso non parla più di «${parola}» — l'avviso ha perso il perché`);
  }
});
