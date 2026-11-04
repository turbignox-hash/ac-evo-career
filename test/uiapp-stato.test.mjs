// test/uiapp-stato.test.mjs — LO STATO DELL'APP IN GIOCO (4/11/2026).
//
// «Prepara tutto e avvia» arma il via automatico, ma il via lo preme l'app
// Cruscotto solo se è viva: il segnale VERO è un ACK recente (memoria del
// processo + storia su disco). La scheda deve poterlo dire senza mentire:
// nessun ack = nessuna prova, e il gesto resta a te.
// Funzione pura con sorgenti iniettabili: niente disco, niente processo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { statoAppInGioco } from '../src/uiapp-pub.mjs';

test('l\'app è «attiva» solo con un ack dentro la finestra', () => {
  const acks = new Map([['auto', 1_000]]);
  const fresco = statoAppInGioco({ acks, righe: [], installata: true, ora: 61_000 });
  assert.equal(fresco.attiva, true);
  assert.equal(fresco.ultimoAck, 1_000);

  const vecchio = statoAppInGioco({ acks, righe: [], installata: true, ora: 1_000 + 20 * 60_000 });
  assert.equal(vecchio.attiva, false, 'oltre la finestra di 15 minuti non è più una prova');
});

test('la storia su disco vale quanto la memoria, e senza app si dice', () => {
  const daStoria = statoAppInGioco({
    acks: new Map(),
    righe: [{ stato: 'confermato', t: 5_000 }, { stato: 'inviato', t: 9_000 }],
    installata: true,
    ora: 6_000,
  });
  assert.equal(daStoria.attiva, true, 'la conferma persistita accende l\'app');
  assert.equal(daStoria.ultimoAck, 5_000, 'le righe «inviato» non contano come ack');

  const senza = statoAppInGioco({ acks: new Map(), righe: [], installata: false });
  assert.equal(senza.installata, false);
  assert.equal(senza.attiva, false);
  assert.equal(senza.ultimoAck, null);
});

test('lo stato unico tiene distinti loader, app, publisher e ack', () => {
  const pieno = statoAppInGioco({
    acks: new Map([['x', 1_000]]), righe: [], installata: true, loader: true, publisher: true, ora: 2_000,
  });
  assert.deepEqual(
    { loader: pieno.loader, installata: pieno.installata, publisher: pieno.publisher, attiva: pieno.attiva },
    { loader: true, installata: true, publisher: true, attiva: true },
  );

  const senzaLoader = statoAppInGioco({ acks: new Map(), righe: [], installata: false, loader: false, publisher: false });
  assert.equal(senzaLoader.loader, false);
  assert.equal(senzaLoader.installata, false);
  assert.equal(senzaLoader.publisher, false);
  assert.equal(senzaLoader.attiva, false);
});
