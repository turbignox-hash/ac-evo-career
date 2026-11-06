// collaudo-amico-collegato.test.mjs — IL COLLAUDO DEL PC AMICO È VIVO E
// AGGANCIATO (6/11, richiesta Mauro: «ricostruisci il collaudo end-to-end del
// PC amico e rimettilo nel flusso di release»).
//
// Il difetto custodito: la sonda era stata spostata in `tools/archivio/` col
// riordino del 6/11, e da lì non la chiamava più nessuno — mentre la checklist
// di release la pretendeva come soglia e il diario la citava come se ci fosse.
// Una sonda che nessuno chiama è come non averla: la release si sarebbe potuta
// preparare senza aver mai provato che l'amico installa e gioca.
//
// Questa guardia non riesegue la danza (costa un installer vero, ed è già nel
// preflight): controlla che esista una copia sola, che non sia un guscio vuoto,
// che `crea-release.mjs` la faccia girare con `preghiamo` PRIMA dell'uscita di
// `--solo-preflight`, e che la checklist nomini lo stesso percorso. Se qualcuno
// la riarchivia o la scollega, qui si diventa rossi prima della release.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (rel) => readFileSync(join(RADICE, rel), 'utf8');

const collaudo = leggi('tools/_collaudo-amico.mjs');
const release = leggi('tools/crea-release.mjs');
const checklist = leggi('RELEASE_CHECKLIST.md');

test('il collaudo sta in tools/ e in una copia sola', () => {
  assert.ok(existsSync(join(RADICE, 'tools', '_collaudo-amico.mjs')),
    'tools/_collaudo-amico.mjs deve esistere: è la soglia end-to-end della release');
  assert.ok(!existsSync(join(RADICE, 'tools', 'archivio', '_collaudo-amico.mjs')),
    'niente doppione in tools/archivio/: due copie divergono e la checklist ne nomina una sola');
});

test('il collaudo non è un guscio: fa la danza vera e sa fallire', () => {
  // le quattro tappe della sequenza, ognuna con la sua prova nel testo
  assert.match(collaudo, /git', \['ls-files'\]/, 'deve costruire la zipball dal ramo (git ls-files)');
  assert.match(collaudo, /installa\.cmd/, 'deve lanciare l\'installatore vero in sandbox');
  assert.match(collaudo, /installa-gioco\.mjs/, 'deve simulare il primo avvio delle app in gioco');
  assert.match(collaudo, /ACEUIAppLoader/, 'deve partire da un PC con la mod App Loader e zero app nostre');
  assert.match(collaudo, /process\.exit\(1\)/, 'un KO deve uscire non-zero (la release si ferma)');
  assert.match(collaudo, /TOT - KO/, 'deve stampare il riepilogo N/N, non solo «ok»');
  // il costo di un finto sarebbe zero: qui si contano le verifiche vere
  const prove = [...collaudo.matchAll(/\n\s*ok\(/g)].length;
  assert.ok(prove >= 15, `la danza ha solo ${prove} verifiche: sotto le 15 non prova niente di serio`);
});

test('crea-release lo fa girare nel preflight, prima dell\'uscita di --solo-preflight', () => {
  const chiamata = release.indexOf("'_collaudo-amico.mjs'");
  assert.ok(chiamata > 0, 'crea-release.mjs non chiama più tools/_collaudo-amico.mjs: la release perderebbe la sua soglia end-to-end');
  const preghiamo = release.lastIndexOf('preghiamo(', chiamata);
  assert.ok(preghiamo > 0 && chiamata - preghiamo < 400,
    'la danza deve passare da preghiamo(...): un esito non-zero deve fermare la release');
  const uscitaSecco = release.indexOf('if (SOLO_PREFLIGHT) {');
  assert.ok(uscitaSecco > 0, 'non trovo più l\'uscita di --solo-preflight: guardia da rivedere');
  assert.ok(chiamata < uscitaSecco,
    'la danza deve stare PRIMA dell\'uscita di --solo-preflight, altrimenti la prova a secco non la misura');
});

test('la checklist di release nomina lo stesso comando', () => {
  assert.match(checklist, /node tools\/_collaudo-amico\.mjs/,
    'RELEASE_CHECKLIST.md deve continuare a pretendere la danza (stesso percorso di tools/)');
  assert.match(checklist, /27\/27/, 'la checklist dichiara l\'esito atteso: se cambia, si aggiorna qui');
  assert.match(checklist, /crea-release/, 'la checklist deve dire che la danza è automatica nel preflight');
});
