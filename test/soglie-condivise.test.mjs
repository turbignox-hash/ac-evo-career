// test/soglie-condivise.test.mjs — la soglia del delta è UNA.
//
// 6/11 (audit): «guadagnato / perso / neutro» era la stessa regola scritta tre
// volte — allievo.mjs, prova-setup.mjs e il chip colorato di viste-c.js. Il
// rischio non è il numero sbagliato: è il numero GIUSTO in un posto e vecchio
// negli altri due, che fa dire al pannello «persi +0.12» mentre il meccanico
// considera quella differenza rumore. Questo test lega i tre posti.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DELTA_GUADAGNO_S, DELTA_PERDITA_S } from '../src/soglie.mjs';
import { SOGLIA_S } from '../src/prova-setup.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (p) => readFileSync(join(ROOT, p), 'utf8');

test('la prova A/B giudica col delta condiviso, non con un numero suo', () => {
  assert.equal(SOGLIA_S, DELTA_PERDITA_S,
    'SOGLIA_S di prova-setup deve venire da soglie.mjs: due soglie diverse = due verità');
});

test('allievo.mjs legge le soglie, non le riscrive a mano', () => {
  const fonte = leggi('src/allievo.mjs');
  assert.match(fonte, /DELTA_GUADAGNO_S/, 'allievo deve usare DELTA_GUADAGNO_S');
  assert.match(fonte, /DELTA_PERDITA_S/, 'allievo deve usare DELTA_PERDITA_S');
  assert.ok(!/[-]0\.05/.test(fonte), 'nessun -0.05 scritto a mano: viene da soglie.mjs');
  assert.ok(!/\b0\.15\b/.test(fonte), 'nessun 0.15 scritto a mano: viene da soglie.mjs');
});

test('il pannello (viste-c) usa gli stessi numeri del server', () => {
  const gui = leggi('gui/js/viste-c.js');
  assert.ok(gui.includes(String(DELTA_GUADAGNO_S)),
    `il chip del pannello deve usare ${DELTA_GUADAGNO_S}: la soglia del server è cambiata e il browser è rimasto indietro`);
  assert.ok(gui.includes(String(DELTA_PERDITA_S)),
    `il chip del pannello deve usare ${DELTA_PERDITA_S}: la soglia del server è cambiata e il browser è rimasto indietro`);
});
