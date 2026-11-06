// test/avvia-gui.test.mjs — il doppio click non deve rompersi in WSH.
//
// WScript è un oggetto globale VBScript (contiene ScriptFullName). Una Dim
// `wscript` lo oscura senza distinzione di maiuscole: la riga 22 del launcher
// dava «Necessario oggetto: 'WScript'» prima ancora di avviare il programma.
// Inoltre aggiornamenti.mjs e salva-save.mjs sono librerie in src/, non in
// tools/: il doppio click deve invocare le posizioni nuove.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const vbs = readFileSync(join(ROOT, 'tools', 'avvia-gui.vbs'), 'utf8');

test('il launcher VBScript non oscura l’oggetto globale WScript', () => {
  assert.match(vbs, /WScript\.ScriptFullName/i, 'la radice deve venire dal file VBS');
  assert.doesNotMatch(vbs, /\bDim\b[^\r\n]*\bwscript\b/i,
    'VBScript non distingue maiuscole e minuscole: `Dim wscript` oscura WScript');
  assert.match(vbs, /wshExe\s*=\s*sh\.ExpandEnvironmentStrings/i,
    'l’eseguibile wscript.exe deve stare in una variabile distinta dal globale');
  assert.match(vbs, /Q\(wshExe\)/, 'la tray va lanciata con wscript.exe');
});

test('il launcher usa le nuove posizioni delle librerie e lascia i tool nei tool', () => {
  assert.ok(existsSync(join(ROOT, 'src', 'aggiornamenti.mjs')));
  assert.ok(existsSync(join(ROOT, 'src', 'salva-save.mjs')));
  assert.match(vbs, /\\src\\aggiornamenti\.mjs/);
  assert.match(vbs, /\\src\\salva-save\.mjs/);
  assert.match(vbs, /\\tools\\crea-scorciatoia\.mjs/);
  assert.match(vbs, /\\tools\\installa-gioco\.mjs/);
  assert.match(vbs, /\\tools\\evo-tray\.vbs/);
});
