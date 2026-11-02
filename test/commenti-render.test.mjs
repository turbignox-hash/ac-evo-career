// commenti-render.test.mjs — GUARDIA ANTI-COMMENTO RENDERIZZATO (1/11):
// i commenti /* ... */ nel codice della GUI/UIAPP sono normali, ma i testi
// della pagina nascono dentro template literal: un commento scritto DENTRO
// un backtick non resta commento, finisce come testo nella pagina (innerHTML).
// Biome non lo vede: e' sintassi valida. Questa guardia fa fallire il test.
//
// Regola: in un template literal (fuori da ${...}) un /* e' SEMPRE un difetto.
// Unica eccezione: dentro <style>...</style>, dove e' un commento del CSS e
// il CSS non parla. Scanner a stati: stringhe, commenti, regex, ${...} annidate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const esiste = (p) => { try { statSync(join(ROOT, p)); return true; } catch { return false; } };

const DIRS = ['gui/js', 'uiapp'];   // sorgenti: le copie installate nel gioco non contano
const files = DIRS.flatMap((d) => (esiste(d) ? readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`) : []));

/* SCANNER A STATI: segnala ogni segno /* che vive dentro un template literal.
 * Modalita' in stack:
 *   C = codice (top-level o dentro ${...}), T = corpo del template literal.
 * In C si saltano stringhe, commenti e regex (un regex e' codice: i backtick
 * e gli apici dentro le sue classi non aprono stringhe). Dal backtick si va
 * in T; in T, ${...} torna in C e le graffe contano la profondita' — la
 * graffa che chiude e' quella del ${...} stesso (pop). ` chiude e torna a C.
 * In T un /* e' il difetto: viene riportato con riga ed estratto. */
function cercaCommentiNeiTemplate(codice) {
  const trovati = [];
  const stack = [{ m: 'C', d: 0 }];
  let riga = 1, i = 0, prev = '';
  const top = () => stack[stack.length - 1];
  const regexDopo = () => '(,=:[!&|?{};+*%-<>~^'.includes(prev)
    || /\b(?:return|typeof|case|in|of|new|delete|void|instanceof|do|else|await)\s*$/.test(codice.slice(Math.max(0, i - 14), i + 1));
  while (i < codice.length) {
    const c = codice[i], s = top();
    if (c === '\n') riga++;
    if (s.m === 'C') {
      if (c === '/' && codice[i + 1] === '/') { const n = codice.indexOf('\n', i); i = n === -1 ? codice.length : n; continue; }
      if (c === '/' && codice[i + 1] === '*') { const n = codice.indexOf('*/', i + 2); i = n === -1 ? codice.length : n + 2; continue; }
      if (c === '\'' || c === '"') { i++; while (i < codice.length && codice[i] !== c) i += codice[i] === '\\' ? 2 : 1; i++; prev = c; continue; }
      if (c === '`') { stack.push({ m: 'T' }); i++; prev = ''; continue; }
      if (c === '/' && regexDopo()) {   // regex: skip, con classi ed escape
        let classe = false;
        for (i++; i < codice.length; i++) {
          const r = codice[i];
          if (r === '\\') { i++; continue; }
          if (r === '[') classe = true; else if (r === ']') classe = false;
          else if (r === '/' && !classe) break;
        }
        i++; prev = ')';
        continue;
      }
      if (c === '{') { s.d++; i++; prev = c; continue; }
      if (c === '}') { if (s.d > 0) s.d--; else if (stack.length > 1) stack.pop(); i++; prev = c; continue; }
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') prev = c;
      i++; continue;
    }
    if (c === '`') { stack.pop(); if (!stack.length) stack.push({ m: 'C', d: 0 }); i++; prev = ''; continue; }
    if (c === '$' && codice[i + 1] === '{') { stack.push({ m: 'C', d: 0 }); i += 2; prev = ''; continue; }
    if (c === '/' && codice[i + 1] === '*') {
      const n = codice.indexOf('*/', i + 2);
      const fine = n === -1 ? Math.min(codice.length, i + 90) : n + 2;
      trovati.push({ riga, idx: i, estratto: codice.slice(i, fine).replace(/\s+/g, ' ').trim() });
      i = n === -1 ? codice.length : n + 2;
      continue;
    }
    i++;
  }
  return trovati;
}

/* CSS: dentro <style>...</style> il commento e' del CSS, non testo pagina. */
const dentroStyle = (codice, idx) => {
  const prima = codice.slice(0, idx).toLowerCase();
  return prima.lastIndexOf('<style') > prima.lastIndexOf('</style');
};

/* AUTO-VERIFICA dello scanner: costruisce i casi con il backtick concatenato
 * (valore 96) cosi' il sorgente del test non diventa lui stesso un template. */
const BT = String.fromCharCode(96);
test('lo scanner becca il difetto e non segnala il codice giusto', () => {
  const concia = BT + '<div> /* nota */ <b>x</b></div>' + BT;
  assert.equal(cercaCommentiNeiTemplate('return ' + concia + ';').length, 1, 'commento nel corpo del template: si segnala');
  const dueRighe = BT + 'riga1\n  /* nota */ riga2' + BT;
  const v = cercaCommentiNeiTemplate(dueRighe);
  assert.equal(v.length, 1);
  assert.equal(v[0].riga, 2, 'la riga segnalata e\\' + ' quella vera');
  // '${...}' scritto a pezzi: Biome non deve vedersi un placeholder in una stringa
  const interp = '$' + '{a /* in interpolazione */ b}';
  const pulito = '/* codice */ const s = "/* stringa */"; '
    + 'const t = ' + BT + interp + BT + '; // commento a fine riga';
  assert.deepEqual(cercaCommentiNeiTemplate(pulito), [], 'commenti veri e interpolazioni restano puliti');
  const regex = 'x.replace(/[*' + String.fromCharCode(92) + '/]/g, ""); y.match(/[a-z]*/);';
  assert.deepEqual(cercaCommentiNeiTemplate(regex), [], 'il regex non apre stringhe finte');
});

test('nessun commento /* ... */ nel corpo dei template literal della GUI', () => {
  const colpevoli = [];
  for (const f of files) {
    const code = readFileSync(join(ROOT, f), 'utf8');
    for (const t of cercaCommentiNeiTemplate(code)) {
      if (dentroStyle(code, t.idx)) continue;
      colpevoli.push(`${f}:${t.riga} → ${t.estratto}`);
    }
  }
  assert.deepEqual(colpevoli, [], `commenti visibili nel testo della pagina:\n  ${colpevoli.join('\n  ')}`);
});
