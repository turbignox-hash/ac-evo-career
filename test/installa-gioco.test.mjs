// installa-gioco.test.mjs — LE PROVE DELL'INSTALLATORE UNITARIO delle app in
// gioco (1/11/2026, «l'amico deve installare e giocare»: le app del loader che
// si mettono a posto da sole al primo avvio).
//
// Nei SAFARI NON si tocca niente di vero: il tool rispetta ACE_SAVEDIR
// (src/paths.mjs: l'override comanda per savedGamesRoots), quindi la «base
// Saved Games» qui è una palude temporanea con dentro la struttura minima.
//
// Casi: (1) mod presente → copia di entrambe le app + marcatori Video, e al
// secondo giro «già a giorno» senza alcuna copia; (2) modo silenzioso senza
// niente da fare → rasente al muto; (3) sorgente cambiata → aggiorne solo
// il file toccato; (4) mod assente → uscita 0 e un avviso che parla chiaro
// (anche in silenzioso: è una cosa da sapere, non rumore).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(QUI, 'tools', 'installa-gioco.mjs');

function giro(ACE_SAVEDIR, extra = []) {
  const r = spawnSync(process.execPath, [TOOL, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ACE_SAVEDIR },
  });
  return { status: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function palude(loader = true) {
  const root = mkdtempSync(join(tmpdir(), 'insta-gioco-'));
  if (loader) {
    mkdirSync(join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader'), { recursive: true });
    mkdirSync(join(root, 'ACE', 'Video'), { recursive: true });
  }
  return root;
}

test('insta-gioco: copia le app, scrive i marcatori e il secondo giro non tocca niente', () => {
  const root = palude();
  const prima = giro(root);
  assert.equal(prima.status, 0, `uscita ${prima.status}: ${prima.out}`);

  // le due app copiate, con i CONTENTI uguali alle sorgenti
  const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
  for (const [chiave, file] of [
    ['cruscotto', 'app.json'], ['cruscotto', 'cruscotto.js'],
    ['pitwall', 'app.json'], ['pitwall', 'pitwall.js'],
  ]) {
    const dest = join(loader, chiave, file);
    assert.ok(existsSync(dest), `manca ${chiave}/${file}`);
    assert.deepEqual(readFileSync(dest), readFileSync(join(QUI, 'uiapp', chiave, file)),
      `${chiave}/${file} copiato diverso dalla sorgente`);
  }
  // nessuna pagina consegnata al loader (lezione 27/10 18:40)
  assert.ok(!existsSync(join(loader, 'cruscotto', 'menu.html')), 'menu.html consegnato: il gioco lo apre nel suo drawer e sbanda');

  // I MARCATORI: senza il settingspreset il loader non accende l'app
  for (const chiave of ['cruscotto', 'pitwall']) {
    const m = join(root, 'ACE', 'Video', `ACEUIAppLoader-${chiave}.settingspreset`);
    assert.ok(existsSync(m), `manca il marcatore di ${chiave} in ACE/Video`);
    assert.equal(readFileSync(m, 'utf8'), '', 'il marcatore deve restare vuoto');
  }
  assert.ok(prima.out.includes('App «cruscotto» in gioco'), `non dichiara la copia: ${prima.out}`);
  assert.ok(prima.out.includes('App «pitwall» in gioco'), `non dichiara la copia: ${prima.out}`);

  // secondo giro: tutto identico → «già a giorno», e nessun avviso [x]
  const dopo = giro(root);
  assert.equal(dopo.status, 0);
  assert.ok(dopo.out.includes('già a giorno'), `il secondo giro non è silenzioso: ${dopo.out}`);
  assert.ok(!dopo.out.includes('[x]'), `il secondo giro dichiara copie: ${dopo.out}`);

  // modo silenzioso senza niente da fare: rasente al muto
  const mutus = giro(root, ['--silenzioso']);
  assert.equal(mutus.status, 0);
  assert.equal(mutus.out.trim(), '', `il silenzioso parla senza motivo: ${JSON.stringify(mutus.out)}`);
});

test('insta-gioco: aggiornamento selettivo — tocca solo il file realmente cambiato', () => {
  const root = palude();
  assert.equal(giro(root).status, 0);

  // un sorgente subisce una modifica: al giro dopo SOLO quello si ricopia
  const sorgente = join(QUI, 'uiapp', 'pitwall', 'app.json');
  const vecchio = readFileSync(sorgente, 'utf8');
  writeFileSync(sorgente, vecchio.replace('"version"', '"version" /* tocca a te */'), 'utf8');
  try {
    const r = giro(root);
    assert.equal(r.status, 0, `uscita ${r.status}: ${r.out}`);
    assert.ok(r.out.includes('App «pitwall» in gioco'), `non dichiara il pitwall: ${r.out}`);
    assert.ok(!r.out.includes('App «cruscotto» in gioco'), `ricopia anche il cruscotto intatto: ${r.out}`);
  } finally {
    writeFileSync(sorgente, vecchio, 'utf8');   // la sorgente torna com'era, niente sporcare
  }
});

test('insta-gioco: senza la mod esce 0 e dice che il resto funziona', () => {
  const root = palude(false);
  const parlato = giro(root);
  assert.equal(parlato.status, 0, `la mod mancante non deve bloccare: ${parlato.out}`);
  assert.ok(parlato.out.includes('ACE UI App Loader'), `non nomina la mod: ${parlato.out}`);
  assert.ok(parlato.out.includes('funziona'), `non rassicura sul resto: ${parlato.out}`);

  // anche in silenzioso l'avviso passa: è una cosa da sapere, non un rumore
  const mutus = giro(root, ['--silenzioso']);
  assert.equal(mutus.status, 0);
  assert.ok(mutus.out.includes('ACE UI App Loader'), `il silenzioso non avvisa della mod: ${JSON.stringify(mutus.out)}`);
});
