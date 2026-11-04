// griglia-generata.test.mjs — IL MODELLO DEL GIOCO (4/11/2026, richiesta Mauro:
// «implementa pure e semplifica se c'è margine»).
//
// Il gioco non scrive le celle: dichiara il weekend (Single Make + avversari)
// e lascia che sia EVO a generare la griglia; poi CONTROLLA il risultato con
// grid_problem («non era Single Make», «auto di un'altra classe»).
// Qui si custodiscono le tre parti di quel modello nel nostro sistema:
//   1. serieGenerataDalGioco: monomarca senza regole di classe → niente
//      customgrid, niente magazzino, niente fabbrica;
//   2. setWeekendGridAuto/Custom + setWeekendAi: il weekend è l'unico
//      contratto scritto (la forma canonica 6=1 / 6=1+7=N);
//   3. grigliaGaraFuori: la validazione post-gara, che non riscrive nulla.
//
// Niente server né browser: solo funzioni pure e un gamemodesave sintetico.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serieGenerataDalGioco, grigliaGaraFuori } from '../src/grid-apply.mjs';
import { encodeMsg } from '../tools/evo-grid.mjs';
import {
  setWeekendAi, weekendAi, setWeekendGridAuto, setWeekendGridCustom,
  weekendGridMode,
} from '../tools/set-track.mjs';

const LADDER = {
  nodes: [
    { nodeId: 'mono', cars: ['car_a'] },
    { nodeId: 'multi', cars: ['car_a', 'car_b'] },
  ],
  contentNames: {
    cars: {
      car_a: 'Abarth 695 Biposto',
      car_b: 'Mazda MX-5 ND Cup',
    },
  },
};

const nodo = (id) => LADDER.nodes.find((n) => n.nodeId === id);

/** Un gamemodesave minimo ma VERO: blocco sessione con pista, 6/7, 30/31. */
function gamemodesave(file, { mode = 'custom', count = 15 } = {}) {
  const sessione = [
    { field: 5, wire: 2, bytes: encodeMsg([{ field: 2, wire: 2, bytes: Buffer.from('Imola') }]) },
    { field: 6, wire: 0, varint: BigInt(1) },
  ];
  if (mode === 'custom') sessione.push({ field: 7, wire: 0, varint: BigInt(count) });
  sessione.push(
    { field: 30, wire: 0, varint: BigInt(80) },
    { field: 31, wire: 0, varint: BigInt(85) },
    { field: 10, wire: 2, bytes: Buffer.from('car_a') },
    { field: 10, wire: 2, bytes: Buffer.from('car_a') },
  );
  writeFileSync(file, encodeMsg([{ field: 3, wire: 2, bytes: encodeMsg(sessione) }]));
}

test('serieGenerataDalGioco: la monomarca è del gioco, la multiclasse resta nostra', () => {
  assert.equal(serieGenerataDalGioco(LADDER, 'mono'), true,
    'una serie con una sola auto non ha zavorre di classe: la griglia la sa generare EVO.');
  assert.equal(serieGenerataDalGioco(LADDER, 'multi'), false,
    'la multiclasse ha bisogno del customgrid per le regole di classe.');
  assert.equal(serieGenerataDalGioco(LADDER, 'assente'), false,
    'un nodo che non esiste non deve mai diventare «generato dal gioco».');
  assert.equal(serieGenerataDalGioco(null, 'mono'), false,
    'senza ladder non si decide niente.');
});

test('grigliaGaraFuori: monomarca con un\'altra auto → il grid_problem del gioco', () => {
  const pulita = {
    drivers: [
      { car_brand: 'Abarth', car_name: '695 Biposto' },
      { car_brand: 'Abarth', car_name: '695 Biposto' },
    ],
  };
  assert.equal(grigliaGaraFuori(pulita, { ladder: LADDER, node: nodo('mono') }), null,
    'tutte le auto sono quella della serie: nessun problema.');

  const sporca = {
    drivers: [
      ...pulita.drivers,
      { car_brand: 'Mazda', car_name: 'MX-5 ND Cup' },
    ],
  };
  const out = grigliaGaraFuori(sporca, { ladder: LADDER, node: nodo('mono') });
  assert.ok(out, 'la Mazda in una monomarca Abarth doveva essere segnalata.');
  assert.equal(out.tipo, 'single_make');
  assert.ok(out.fuori.some((c) => /Mazda/i.test(c)), 'il colpevole deve essere nominato.');
});

test('grigliaGaraFuori: classe con un\'auto fuori parco → tipo classe', () => {
  const out = grigliaGaraFuori({
    drivers: [
      { car_brand: 'Abarth', car_name: '695 Biposto' },
      { car_brand: 'Ferrari', car_name: '488 Challenge' },
    ],
  }, { ladder: LADDER, node: nodo('multi') });
  assert.ok(out, 'la Ferrari fuori dal parco della classe doveva essere segnalata.');
  assert.equal(out.tipo, 'classe');
  assert.ok(out.fuori.some((c) => /Ferrari/i.test(c)));
});

test('grigliaGaraFuori: risultato senza auto o parco vuoto → nessun giudizio', () => {
  assert.equal(grigliaGaraFuori({ drivers: [{ driver_name: 'Mauro' }] }, { ladder: LADDER, node: nodo('mono') }), null);
  assert.equal(grigliaGaraFuori({ drivers: [] }, { ladder: LADDER, node: nodo('mono') }), null);
  assert.equal(grigliaGaraFuori({ drivers: [{ car_name: 'X' }] }, { ladder: { nodes: [] }, node: nodo('mono') }), null);
});

test('Il weekend è il contratto: AUTO toglie il 7, CUSTOM lo rimette, AI resta', () => {
  const dir = mkdtempSync(join(tmpdir(), 'griglia-generata-'));
  const file = join(dir, 'GameModeType_RACE_WEEKEND.gamemodesave');
  try {
    gamemodesave(file, { mode: 'custom', count: 15 });
    assert.deepEqual(weekendGridMode(file), { mode: 'custom', count: 15 });

    const auto = setWeekendGridAuto({ file });
    assert.equal(auto.written, true);
    assert.deepEqual(weekendGridMode(file), { mode: 'automatic', count: 1 },
      'AUTOMATIC è la forma in cui EVO sceglie da sé il conteggio di carriera: il 7 non deve restare.');

    const custom = setWeekendGridCustom(15, { file });
    assert.equal(custom.written, true);
    assert.deepEqual(weekendGridMode(file), { mode: 'custom', count: 15 },
      'CUSTOM deve riportare il 7 subito dopo il 6, la forma che il menu adotta al riavvio.');

    const ai = setWeekendAi(88, 92, { file });
    assert.equal(ai.written, true);
    assert.deepEqual(weekendAi(file), { min: 88, max: 92 },
      'la banda AI del weekend è quella che il gioco mostra al caricamento.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
