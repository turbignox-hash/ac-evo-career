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
