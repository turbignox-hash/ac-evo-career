// layout-skip-save.test.mjs — LA GUARDIA CHE PROVA LO SKIP DELLA GUARDIA DI LAYOUT
// (3/11, richiesta Mauro: «aggiungi un test veloce che sposti e rimetta il
// save di backup e asserisca il ramo skip del guard di layout, così non resta
// mai senza prova»).
//
// La voce «senza ambiente si salta» del diario (3/11) dichiara tre skip
// onesti in [test/layout-impostazioni.test.mjs]; il ramo «manca il save»
// era stato collaudato A MANO (radice finta + log in tmp/collau-*.log).
// Questo test rende la prova PERMANENTE: sposta il save vero (con fascicolo
// di riserva), gira `node --test` della guardia, e asserisce che il ramo
// sia verde che spiega: ok, `# skipped 1`, zero rossi, e il perché col
// percorso del save nel messaggio. Infine il save torna AL SUO POSTO nel
// `finally` — anche se un assert cade — e si rimette l'integrità byte per
// byte. Spostare un file resta dentro lo stesso volume (desktop e temp
// stanno entrambi su C:), quindi è un'operazione di metadati istantanea.
//
// NB: la guardia senza save esce PRIMA di aprire server o browser, quindi
// la prova dura un paio di secondi e non tocca chromium.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAVE = join(ROOT, 'data', 'evo-career.save.json');
/* il save VIA dal progetto per la durata della prova */
const SPOSTATO = 'evo-career.save.json.spostato-dalla-guardia-skip';

test('guard di layout senza save: skip col perché, e il save torna al suo posto byte per byte', { timeout: 120_000 }, () => {
  if (!existsSync(SAVE)) return; // save già assente: il ramo è qui la condizione normale, niente da spostare
  const riparo = mkdtempSync(join(tmpdir(), 'evo-guardia-skip-'));
  const riserva = join(riparo, 'evo-career.save.json.riserva');
  copyFileSync(SAVE, riserva); // il salvavita PRIMA di toccare l'originale

  try {
    renameSync(SAVE, join(riparo, SPOSTATO));
    assert.ok(!existsSync(SAVE), 'il save non è andato via: la prova non può scattare');

    const env = { ...process.env };
    // il runner che ci ospita firma i figli con NODE_TEST_CONTEXT=child-v8:
    // la guardia lo erediterebbe e perderebbe le righe TAP dello skip
    // («# SKIP …» e il contatore). Si toglie: il figlio deve ripartire
    // come un runner vergine, come quando lo si chiama a mano.
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--test', 'test/layout-impostazioni.test.mjs'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 100_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const tap = `${r.stdout}\n${r.stderr}`;
    assert.equal(r.status, 0, () => `senza save la guardia resta VERDE (skip, non rosso)\nexit=${r.status}\nTAP:\n${tap.slice(0, 4000)}`);
    assert.ok(tap.includes('# skipped 1'), () => `uno e uno solo skip atteso\nTAP:\n${tap.slice(-2000)}`);
    assert.ok(tap.includes('# fail 0'), () => `zero rossi attesi\nTAP:\n${tap.slice(-2000)}`);
    assert.match(tap, /manca il save .*evo-career\.save\.json/, 'lo skip deve dire il perché col percorso del save — il TAP dice altrimenti:\n' + tap.slice(-2000));
  } finally {
    // il save torna AL SUO POSTO qualunque cosa sia successo (rename dentro
    // lo stesso volume; se il volume cambia sotto ai piedi, copia)
    const via = join(riparo, SPOSTATO);
    try {
      renameSync(via, SAVE);
    } catch {
      copyFileSync(via, SAVE);
      rmSync(via);
    }
  }
  assert.ok(existsSync(SAVE), 'il save non è tornato al suo posto');
  assert.deepEqual(readFileSync(SAVE), readFileSync(riserva), 'il save è tornato ma NON è identico: fermare tutto e guardare la riserva in ' + riserva);
});
