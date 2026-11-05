// test/meccanico-parla-rotta.test.mjs — la rotta del meccanico a voce è UNA.
//
// 5/11 sera, la benzina che in gioco restava a 30 L: il dialogo della GUI
// chiamava api('garage', {action:'meccanico-parla'}) — e il «garage»
// rispondeva con l'overview delle pressioni SENZA errori (200, ok assente):
// il piano non veniva mai scritto su disco e in EVO si applicava il vecchio
// file. Nessun test della GUI guardava la rotta: qui la guardia in linea.
// L'azione vera vive al top-level (/api/meccanico-parla, case del server).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = dirname(fileURLToPath(import.meta.url));
const gui = readFileSync(join(qui, '..', 'gui', 'js', 'viste-c.js'), 'utf8');
const server = readFileSync(join(qui, '..', 'src', 'webui.mjs'), 'utf8');

test('viste-c: il dialogo del meccanico chiama /api/meccanico-parla, non il garage', () => {
  assert.ok(gui.includes("api('meccanico-parla'"),
    'la chiamata del dialogo va alla rotta top-level /api/meccanico-parla');
  assert.ok(!gui.includes("api('garage', { action: 'meccanico-parla'"),
    'la forma vecchia (garage con action dentro) NON deve tornare: rispondeva l’overview delle pressioni');
});

test('webui: il case meccanico-parla esiste al top-level del dispatcher', () => {
  assert.match(server, /case 'meccanico-parla': \{\s*\n\s*try \{/,
    'il server deve avere il case dedicato (il test e2e lo pesa altrove)');
});

/* 6/11 (il gesto unico): i chip Quali/Gara/Pioggia e la richiesta a voce
   SCRIVONO al primo gesto (esegui true) — «Correggiti» resta chiacchiera a
   voce. Finché il piano della GUI chiamava con esegui=false l'utente
   no vedeva mai il tasto «✍️ Scrivi nel gioco» e il file non nasceva. */
test('viste-c: i chip scrivono al primo gesto (correggiti no), la richiesta a voce pure', () => {
  assert.match(gui, /window\.__mechParla\(chip\.dataset\.mech, chip\.dataset\.mech !== 'correggiti'\)/,
    'i chip che preparano scrivono al primo gesto (delega document): esegui true, tranne correggiti');
  assert.match(gui, /window\.__mechParla\(t, true\)/,
    'la richiesta a voce («prepara una gara con 3 giri») scrive al primo gesto');
});
