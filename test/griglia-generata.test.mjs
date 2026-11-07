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
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serieGenerataDalGioco, grigliaGaraFuori } from '../src/grid-apply.mjs';
import { decodeMsg, encodeMsg } from '../src/evo-grid.mjs';
import {
  setWeekendAi, weekendAi, setWeekendGridAuto, setWeekendGridCustom,
  weekendGridMode,
} from '../src/set-track.mjs';

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

test('forma STRANA (7 senza 6): CUSTOM rimette il 6 = 1, non ci mette il conteggio', () => {
  // IL CASO VERO del 7/11: l'istantanea della gara al volo aveva 7 = 18 e
  // NESSUN 6 — la forma che il gioco scarta (menu AUTOMATICO, 14 avversari
  // suoi). Il primo giro del passo custom inseriva il 6 proprio dove stava il
  // 7 e poi scriveva il conteggio sul vecchio indice: 6 = 18. Qui si cuce
  // quella regressione: dopo la cura il 6 DEVE valere 1.
  const dir = mkdtempSync(join(tmpdir(), 'griglia-strana-'));
  const file = join(dir, 'GameModeType_INSTANT_RACE.gamemodesave');
  try {
    gamemodesave(file, { mode: 'custom', count: 18 });
    const top = decodeMsg(readFileSync(file));
    const f3 = top.find((f) => f.field === 3 && f.wire === 2);
    f3.bytes = encodeMsg(decodeMsg(f3.bytes).filter((s) => !(s.field === 6 && s.wire === 0)));
    writeFileSync(file, encodeMsg(top));
    assert.ok(!decodeMsg(decodeMsg(readFileSync(file)).find((f) => f.field === 3 && f.wire === 2).bytes).some((s) => s.field === 6),
      'la prova parte davvero senza il 6 (il solo 7)');

    const r = setWeekendGridCustom(18, { file });
    assert.equal(r.written, true, 'la forma strana va CURATA, non dichiarata a posto');
    const sess = decodeMsg(decodeMsg(readFileSync(file)).find((f) => f.field === 3 && f.wire === 2).bytes);
    assert.equal(Number(sess.find((s) => s.field === 6)?.varint), 1, 'il 6 vale 1 SEMPRE (in entrambe le forme canoniche)');
    assert.equal(Number(sess.find((s) => s.field === 7)?.varint), 18, 'il conteggio vive nel 7');
    assert.deepEqual(weekendGridMode(file), { mode: 'custom', count: 18 });
    // e il secondo giro non riscrive
    assert.equal(setWeekendGridCustom(18, { file }).written, false, 'idempotente dopo la cura');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    assert.equal(ai.blocchi, decodeMsg(readFileSync(file)).filter((f) => f.field === 3 && f.wire === 2).length,
      'la banda va in TUTTE le sessioni del file, non solo nella prima');
    assert.deepEqual(weekendAi(file), { min: 88, max: 92 },
      'la banda AI del weekend è quella che il gioco mostra al caricamento.');
    // 7/11: la difficoltà che CONTA è quella della GARA — prima restava 85-86
    // perché il write toccava solo il primo blocco (Practice).
    const blocchi = decodeMsg(readFileSync(file)).filter((f) => f.field === 3 && f.wire === 2);
    for (const b of blocchi) {
      const s = decodeMsg(b.bytes);
      const nome = Buffer.from(s.find((x) => x.field === 1)?.bytes ?? '').toString('utf8');
      assert.deepEqual([Number(s.find((x) => x.field === 30)?.varint), Number(s.find((x) => x.field === 31)?.varint)], [88, 92],
        `la sessione "${nome}" deve avere la stessa banda AI delle altre`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
