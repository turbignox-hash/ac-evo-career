// ab-senza-giri-gui.test.mjs — LA GUARDIA GUI DELLE VOCI SENZA GIRI
// (3/11, richiesta Mauro: «la stessa guardia del banco, ma per senzaGiri:
// fallisce se la GUI mostra voci NON disabilitate sotto "senza giri
// cronometrati"»).
//
// La legge del banco (2/11) ha due metà: il SERVER esclude le sessioni
// 0 beacon da `sessions` e le rispedisce in `senzaGiri` (coperta a server
// vivo, sandbox con MoTeC sintetici: test/ab-senza-giri.test.mjs); la
// GUI (gui/js/viste-analisi.js) le rimette in menu SOLO DISABILITATE
// sotto l'optgroup muto «senza giri cronometrati». QUESTA guardia copre
// la seconda metà: se qualcuno smonta il disabled, le voci morte (out-lap,
// fermo in griglia, sessione abbandonata) tornano CLICCABILI e il banco
// si costruisce un confronto al buio — un difetto che Biome non vede
// (Biome compila ogni file isolato, senza il contratto con il server) e
// che il test a server vivo non guarda (passerebbe anche con option
// tutte cliccabili: il disabled nasce nella viste). I quattro agguati:
//
//   1. la porta: `senza` nasce SOLO da `d.senzaGiri` del server (mai
//      da `sessions`, mai da una variabile di commiato);
//   2. la legatura: `opt(s, dis)` mette `disabled` sull'<option> in
//      funzione del SECONDO ARGOMENTO — non un valore fisso;
//   3. il gruppo muto: l'espressione che pende da `escluse.length` porta
//      l'optgroup «senza giri cronometrati» e TUTTE le escluse mappate
//      col flag `true` — su un'unica DIPENDENZA, in modo che option
//      disabilitata e gruppo muto non possano disgiungersi;
//   4. il gruppo vivo: le voci di banco chiamano `opt` NUDO, senza flag —
//      e `opt(…, true)` esiste UNA volta sola in tutto il file (nessuna
//      altra corsia può ereditare il disabled per errore).
//
// A SORGENTE VIVO, come viste-guard.test.mjs: le viste del gui sono
// globali dei <script> di index.html e NON girano in node — la forma del
// codice è ciò che il browser esegue, e la guardia la lega con nome.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const V = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'gui', 'js', 'viste-analisi.js'),
  'utf8',
);

test("le voci morte entrano in menu SOLO dalla porta server `senzaGiri`", () => {
  assert.ok(
    V.includes("senza = d.senzaGiri ?? [];"),
    "la lista delle escluse NON legge più d.senzaGiri: se il ramo GUI mostra\n"
      + "qualcos'altro il disabled parte da una fonte che il SERVER non ha\n"
      + "confermato — torna a `senza = d.senzaGiri ?? []` in renderAB.",
  );
});

test("il disabled dell'option dipende dal flag di opt(), non da un valore fisso", () => {
  const optRow = V.split("\n").find((l) => l.includes("const opt = (s, dis) =>"));
  assert.ok(
    /\$\{dis \?\s*' disabled' : ''\}/.test(optRow ?? ""),
    "la funzione opt() non lega più `disabled` al secondo argomento:\n"
      + "senza questa legatura, cambiare la mappa delle escluse non cambia\n"
      + "niente — il contratto sulla riga `const opt` in gui/js/viste-analisi.js:\n"
      + "col flag `dis` VERO l'option nasce disabilitata, col nudo resta cliccabile.",
  );
});

test("TUTTE le voci sotto «senza giri cronometrati» nascono disabilitate, nella STESSA espressione del gruppo", () => {
  // la grip cerca il letterale VERO (tr { it: ... }) dentro l'espressione
  // del menu: da lì la finestra ±400 lega disabled e optgroup sullo stesso
  // ramo di sel.innerHTML — gruppo muto e disabled si muovono assieme.
  const label = V.indexOf("'senza giri cronometrati'");
  assert.ok(label >= 0, "l'optgroup «senza giri cronometrati» sparito dal sorgente: la\n"
    + "coda delle voci morte non ha più la sua intestazione.");

  const FINESTRA = 400;
  const davv = V.slice(Math.max(0, label - FINESTRA), label + FINESTRA);
  assert.ok(
    davv.includes("escluse.length"),
    "l'etichetta del gruppo muto non sta più accanto al ramo escluse: la\n"
      + "coda disabilitata non si capisce più a sorgente (in gui/js/viste-analisi.js\n"
      + "il gruppo «senza giri cronometrati» vive SOLO nell'espressione di\n"
      + "`sel.innerHTML` che pende da `escluse.length`).",
  );
  assert.ok(
    davv.includes("opt(s, true)"),
    "GUARDIA COLPITA: le voci del gruppo «senza giri cronometrati» NON nascono\n"
      + "più disabilitate (nessun `opt(s, true)` accanto all'etichetta del gruppo):\n"
      + "sarebbero CLICCABILI e potrebbero farsi A o B di un confronto al buio.\n"
      + "La legge: le escluse si mappano con `opt(s, true)` DENTRO l'optgroup muto.",
  );
});

test("il disabled ha UNA sola corsia: le voci di banco chiamano opt() nudo e `opt(…, true)` ha un solo legittimo", () => {
  const corse = V.match(/gr\.ses\.map\(opt\)/g) ?? [];
  assert.ok(corse.length >= 1, "le voci DI BANCO non chiamano più `opt` nudo (gruppi del giorno):\n"
    + "o sono state disabilitate per errore o è cambiata la corsia del gruppo vivo.");
  assert.equal(
    (V.match(/opt\([a-z]+,\s*true\)/g) ?? []).length, 1,
    "più di una corsia porta `opt(…, true)`: il disabled sta uscendo dal\n"
    + "gruppo muto e contaminando voci di banco — per la legge, SOLO le\n"
    + "sessioni senza giri cronometrati nascono disabilitate.",
  );
});
