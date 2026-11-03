// La cura dei GIRI del Paddock (2/11): il modulo della cura (tools/cura-giri-
// app-carriera.mjs) supera le prove su un binario FINETO: le funzioni diagnostica/
// cura devono esserca STESURE a lunghezza invariata (l'archivio PyInstaller
// non sopporta riscritture di lunghezza diversa) e idempotenti — un exe già
// curato non si ritocca. Il finto exe nella tmpdir NON è il vero Paddock.exe:
// il test non tocca mai i file vivi del gioco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { diagnostica, cura, casaApp } = await import('../tools/cura-giri-app.mjs');

// un finto exe: il JSON del catalogo, spalmato come sta dentro il vero
const catalogo = JSON.stringify({
  series: [
    { id: 'abarth_challenge', calendar: [
      { track: 'Brands Hatch', laps: 12 },
      { track: 'Red Bull Ring', laps: 12 },
      { track: 'Paul Ricard', laps: 11 },     // sotto i 12: NON si tocca
      { track: 'gara speciale', laps: 5 },    // le durate speciali: NON si toccano
    ] },
  ],
});
const finzione = Buffer.concat([Buffer.from('MZfinta' + '\0'.repeat(100)), Buffer.from(catalogo), Buffer.from('coda-finta' + '\0'.repeat(50))]);

test('diagnostica conta solo le durate 12, non le 11 e le 5', () => {
  const d = diagnostica(finzione);
  assert.equal(d.dodici, 2);
  assert.equal(d.tre, 0);        // nessun "laps":3  (con spazio) nel finzione
});

test('cura: sostituzione a lunghezza INVARIATA, JSON resta valido', () => {
  const { buf, cure } = cura(finzione);
  assert.equal(cure, 2);
  assert.equal(buf.length, finzione.length, 'la lunghezza NON cambia: il trick è il trucco');
  assert.deepEqual(diagnostica(buf), { dodici: 0, tre: 2 });
  // il JSON incastonato resta leggibile: gli altri giri affiorano intatti
  const s = buf.toString('utf8');
  assert.ok(s.includes('"laps":3 '), 'le due ronde da 12 hanno preso lo spazio finale');
  assert.ok(s.includes('"laps":11'), 'Paul Ricard resta com\'era');
  assert.ok(s.includes('"laps":5'), 'le gare speciali restano com\'erano');
});

test('cura idempotente: il secondo giro non tocca niente', () => {
  const { buf } = cura(finzione);
  const secondo = cura(buf);
  assert.equal(secondo.cure, 0);
  assert.deepEqual([...secondo.buf], [...buf], 'buffer byte per byte identico');
});

test('casaApp guarda Desktop/Paddock del proprio utente', () => {
  const miei = casaApp({ USERPROFILE: 'C:\\Utenti\\saggio' });
  assert.deepEqual(miei, ['C:\\Utenti\\saggio\\Desktop\\Paddock\\Paddock.exe']);
  assert.deepEqual(casaApp({}), [], 'senza USERPROFILE niente segreti');
});

test('la riga di comando su un finzione-commento va al termine giusto (prova di fumo)', async () => {
  const nido = mkdtempSync(join(tmpdir(), 'cura-giri-'));
  const exe = join(nido, 'Paddock.exe');
  writeFileSync(exe, finzione);
  const { spawnSync } = await import('node:child_process');
  // diagnostica da riga di comando: 2 da curare, exit 0
  const prima = spawnSync(process.execPath, ['tools/cura-giri-app.mjs', '--verifica', exe], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
  assert.equal(prima.status, 0, prima.stderr || prima.stdout);
  assert.match(prima.stdout, /2 da curare/);
  // cura da riga di comando sul finzione del nido
  const poi = spawnSync(process.execPath, ['tools/cura-giri-app.mjs', exe], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
  assert.equal(poi.status, 0, poi.stderr || poi.stdout);
  assert.match(poi.stdout, /2 ronde 12→3/);
  assert.match(readFileSync(exe, 'utf8'), /"laps":3 /g);
  assert.equal(readFileSync(exe).length, finzione.length);
  // il backup sta accanto
  assert.match(readFileSync(exe + '.bak-giri12', 'utf8'), /"laps":12/);
  // rilancio: già curato, niente scritture nuove
  const terzo = spawnSync(process.execPath, ['tools/cura-giri-app.mjs', exe], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' });
  assert.equal(terzo.status, 0);
  assert.match(terzo.stdout, /già curato/);
});
