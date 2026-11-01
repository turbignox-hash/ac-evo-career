// uiapp-periodo.test.mjs — LA LEGGE DEL RITMO fra publisher e app (8/11/2026).
// PERIODO_MS vive in TRE file senza alcun import fra loro: il publisher
// src/uiapp-pub.mjs, Cruscotto e Pitwall sono script isolati dentro EVO e
// giudicati dai loro commenti dicono "lo stesso ritmo del publisher — se lo
// cambi, cambia là". Quei "cambia là" erano fiducia orale: il test la rende
// una spunta con nome. Tre fili li legano:
//   1) il NUMERO: la dichiarazione del publisher e quelle delle due app sono
//      la STESSA costante (una cifra cambiata sola = le app chiedono slot
//      che non esistono e muoiono in silenzio);
//   2) il NOME dello slot: publisher e app nascono la fascia con la STESSA
//      formula (Math.floor(now / PERIODO_MS)) e il file si chiama
//      ui-<slot>.json da ENTRAMBE le parti — un nome o una formula scelta a
//      mano = una fascia mai trovata;
//   3) il SONDAGGIO a metà: le app leggono ogni PERIODO_MS/2, il publisher
//      scrive ogni PERIODO_MS — mai una fascia persa perché chi leggeva era
//      più lento del periodo che scandisce.
//
// Solo i sorgenti del WORKSPACE sono la verità qui dentro: le copie
// installate in Saved Games le sorvegliano i test degli installatori
// (installa-gioco, installatore-sandbox) con la LORO sandbox, non questo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONTI = {
  publisher: join(ROOT, 'src', 'uiapp-pub.mjs'),
  cruscotto: join(ROOT, 'uiapp', 'cruscotto', 'cruscotto.js'),
  pitwall: join(ROOT, 'uiapp', 'pitwall', 'pitwall.js'),
};
const testo = Object.fromEntries(
  Object.entries(FONTI).map(([nome, via]) => [nome, readFileSync(via, 'utf8')]),
);

/** La costante `PERIODO_MS = N` di UN file (la dichiarazione, non i commenti
 *  che parlano del ritmo: /se lo cambi, cambia là/ non è un valore). */
function periodoDi(src, nome) {
  const m = src.match(/(?<!\w)(?:export\s+)?const\s+PERIODO_MS\s*=\s*(\d+)/);
  assert.ok(m, `PERIODO_MS non dichiarato in ${nome}: il ritmo è vitale, non ingoiarlo`);
  return Number(m[1]);
}

test('LEGALE DEL RITMO: il PERIODO_MS del publisher è lo stesso delle due app in gioco', () => {
  const publisher = periodoDi(testo.publisher, 'src/uiapp-pub.mjs');
  assert.equal(publisher, 2500, 'il publisher scandisce 2.5s: cambiando LUI, cambiano le app (assert qui sotto)');
  for (const app of ['cruscotto', 'pitwall']) {
    const periodo = periodoDi(testo[app], app);
    assert.equal(periodo, publisher, `PERIODO_MS di ${app} (${periodo}) ≠ publisher (${publisher})`);
    assert.ok(periodo >= 500, `PERIODO_MS di ${app} sotto i 500ms: il gioco non regge quel ritmo`);
  }
});

test('NOME DELLO SLOT: fascia calcolata uguale e file ui-<slot>.json lo stesso nome', () => {
  assert.ok(testo.publisher.includes('const fascia = Math.floor(Date.now() / PERIODO_MS);'),
    'publisher: la fascia nasce da Math.floor(Date.now() / PERIODO_MS)');
  assert.ok(/ui-\$\{fascia\}\.json/.test(testo.publisher),
    'publisher: scrive il file ui-<fascia>.json (le app NON possono chiamarlo diverso)');
  for (const app of ['cruscotto', 'pitwall']) {
    assert.ok(testo[app].includes('const slot = Math.floor(now / PERIODO_MS);'),
      `${app}: il suo slot nasce da Math.floor(now / PERIODO_MS), la stessa formula del publisher`);
    assert.ok(/'ui-'\s*\+\s*slot/.test(testo[app]),
      `${app}: chiede 'ui-' + slot, il nome esatto che il publisher scrive`);
  }
});

test('SONDAGGIO A METÀ: le app leggono ogni PERIODO_MS/2, il publisher scrive ogni PERIODO_MS', () => {
  for (const app of ['cruscotto', 'pitwall']) {
    assert.ok(/setInterval\s*\(\s*function\s*\(\)\s*\{\s*prendiSlot\(Date\.now\(\)\);\s*\}\s*,\s*PERIODO_MS\s*\/\s*2\s*\)/.test(testo[app]),
      `${app}: il sondaggio prendiSlot deve girare a PERIODO_MS/2 (due letture per fascia)`);
  }
  assert.ok(/setInterval\s*\(\s*\(?\s*\)?\s*=>\s*\{\s*try\s*\{\s*uiappTick\(\);\s*\}\s*catch/.test(testo.publisher),
    'publisher: uiappTick deve girare a PERIODO_MS esatto (una scrittura per fascia)');
});
