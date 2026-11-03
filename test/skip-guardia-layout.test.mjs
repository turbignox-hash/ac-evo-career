// skip-guardia-layout.test.mjs — LA GUARDIA CHE GUARDA LA GUARDIA (3/11,
// richiesta Mauro: «Aggiungi un test che verifica che i tre messaggi di skip
// della guardia di layout contengano il perché, senza girare il browser»).
//
// Perché sul TESTO e non eseguendo: i tre presupposti della guardia di layout
// ([test/layout-impostazioni.test.mjs](layout-impostazioni.test.mjs)) non si
// possono far mancare da qui senza togliere l'ambiente che li rende veri — e
// importare quel file lancerebbe server e browser. Quello che conta però è un
// contratto sulle STRINGHE: ogni skip deve dire cosa manca, dove si guarda e
// cosa fare per averlo. Quelle stringhe stanno nel sorgente, quindi qui si
// legge il sorgente (readFileSync, nessun import) e si controlla il contratto.
//
// La legge è quella della voce di diario «senza ambiente si salta, non si
// sbaglia»: verde che spiega, non rosso che finge. Due dettagli non
// cosmetici: i tre skip devono essere `return t.skip(...)` (se non
// ritornassero, il codice sotto partirebbe lo stesso e il verde sarebbe una
// bugia) e il messaggio del save deve stampare il PERCORSO (`+ SAVE`), non una
// frase generica che non dice dove guardare.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARDIA = join(ROOT, 'test', 'layout-impostazioni.test.mjs');

/* I tre presupposti nell'ordine in cui la guardia li controlla, ognuno coi
 * frammenti che il suo messaggio DEVE portare: il nome di ciò che manca, il
 * posto dove si guarda e la mossa che lo risolve. */
const PRESUPPOSTI = [
  {
    nome: 'playwright-core',
    frammenti: ['playwright-core', 'npm install'],
  },
  {
    nome: 'chromium',
    frammenti: ['chromium assente', 'ms-playwright', 'npx playwright install chromium'],
  },
  {
    nome: 'save',
    frammenti: ['carriera', 'manca il save', 'SAVE'],
  },
];

test('guardia di layout: i tre skip dicono il perché (cosa manca, dove si guarda, cosa fare)', () => {
  const src = readFileSync(GUARDIA, 'utf8');
  // le righe dei tre skip, nell'ordine del file: prima playwright-core, poi
  // chromium, poi il save
  const righe = src.split(/\r?\n/).filter((r) => r.includes('t.skip('));

  assert.equal(righe.length, PRESUPPOSTI.length,
    `la guardia deve dichiarare ${PRESUPPOSTI.length} skip (playwright-core, chromium, save): ne trovo ${righe.length}`
    + `\n  righe: ${righe.map((r) => r.trim()).join(' | ')}`);

  const messaggi = righe.map((r) => r.trim());
  for (const [i, p] of PRESUPPOSTI.entries()) {
    const riga = messaggi[i];
    // 1) lo skip DEVE ritornare: senza `return`, il codice dopo gira lo stesso
    assert.ok(riga.startsWith('return t.skip('),
      `lo skip «${p.nome}» deve essere \`return t.skip(...)\` (altrimenti il test prosegue e finge verde): ${riga}`);
    // 2) il perché: ogni frammento richiesto compare nel messaggio
    for (const frammento of p.frammenti) {
      assert.ok(riga.includes(frammento),
        `il messaggio dello skip «${p.nome}» deve contenere «${frammento}»: ${riga}`);
    }
    // 3) un perché vero è una frase, non un'etichetta: almeno 40 caratteri
    assert.ok(riga.length >= 40,
      `il messaggio dello skip «${p.nome}» è troppo secco per spiegare (${riga.length} caratteri): ${riga}`);
  }

  // i tre perché sono DIVERSI: tre copie dello stesso testo non spiegano niente
  assert.equal(new Set(messaggi).size, PRESUPPOSTI.length,
    'i tre skip devono avere messaggi distinti, non lo stesso testo riciclato');
});

test('guardia di layout: nessuno dei tre presupposti è tornato un assert rosso', () => {
  // riga per riga, non con una regex sul file intero: `[^;]*` attraversa le
  // righe e univa per sbaglio un assert lontano con un `chromium` più sotto
  // (falso rosso visto subito, al primo giro di questo test). Il difetto
  // custodito è preciso: `assert.ok(existsSync(...playwright-core...))` e soci.
  const righe = readFileSync(GUARDIA, 'utf8').split(/\r?\n/);
  const chiavi = [
    { nome: 'playwright-core', chiave: 'playwright-core' },
    { nome: 'chromium', chiave: 'CHROMIUM' },
    { nome: 'save', chiave: 'SAVE' },
  ];
  for (const { nome, chiave } of chiavi) {
    const riga = righe.find((r) => r.includes('assert.') && r.includes(chiave));
    assert.equal(riga, undefined,
      `il presupposto «${nome}» non deve tornare un assert: deve restare uno skip col perché (verde che spiega, non rosso che finge) — riga trovata: ${riga}`);
  }
});
