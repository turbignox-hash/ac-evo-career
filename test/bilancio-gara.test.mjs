// 6/11 — BILANCIO ARRIVATO IN PISTA: il buco misurato sulla Coppa Città.
// La gara di Brands Hatch (261106-2216) è stata corsa con 0 kg / 0% su tutte le
// 13 auto mentre il template della serie porta 100 kg / 1% sulla Golf 8 GTI:
// il menu di EVO, risalvando il customgrid, azzera le celle. zeroBalanceProposal
// guarda il file com'è ora; bilancioDaGara guarda la GARA (ballast/restrictor
// per pilota nel file dei risultati) e senza questo confronto l'import
// incassava una gara alla pari come se fosse regolare.
//
// Contratto:
//   - fonte del preteso: il TEMPLATE della serie, altrimenti la classe;
//   - varianti della stessa auto (mech_1 a 0/0, mech_2 al cap): se una combacia,
//     il bilancio è arrivato e il controllo tace;
//   - silenzio quando non c'è niente da pretendere (template a 0/0, <2 modelli,
//     nessuna classe), parlante quando il 0/0 corso non è spiegato da nessuno.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bilancioDaGara } from '../src/grid-guard.mjs';
import { encodeMsg } from '../src/evo-grid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return b; };

/** Una cella del customgrid: nome (campo 4), preset (10), zavorra (24), restrictor (25). */
const cella = (nome, preset, kg = 0, pct = 0) => encodeMsg([
  { field: 4, wire: 2, bytes: Buffer.from(nome) },
  { field: 10, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: Buffer.from(preset) }]) },
  ...(kg > 0 ? [{ field: 24, wire: 0, varint: BigInt(kg) }] : []),
  ...(pct > 0 ? [{ field: 25, wire: 5, bytes: f32(pct / 100) }] : []),
]);

/** Scrive un template sintetico nella cartella temporanea e ne torna il path. */
function templateCon(celle) {
  const dir = mkdtempSync(join(tmpdir(), 'bilancio-gara-'));
  const f = join(dir, 'serie.customgrid');
  writeFileSync(f, Buffer.from(encodeMsg(celle.map((c) => ({ field: 1, wire: 2, bytes: c })))));
  return f;
}

/** Una gara finta: per ogni auto il set dichiarato dal gioco. */
function gara(righe) {
  return {
    track: 'Brands Hatch',
    drivers: righe.map(([car_name, ballast, restrictor], i) => ({
      car_name, ballast, restrictor, position: i, laps: 5,
      best_lap: '01:45.000', total_time: '05:15.000',
    })),
  };
}

const TEMPLATE = () => templateCon([
  cella('Alfa Romeo Junior', 'preset_mln_mech_1', 0, 0),
  cella('Volkswagen Golf 8 GTI', 'preset_mk8gti_mech_1', 100, 1),
]);

test('zavorra persa: il gioco dichiara 0/0 su tutte le auto, il template ne pretende 100/1 sulla Golf', () => {
  const b = bilancioDaGara(gara([
    ['Alfa Romeo Junior', 0, 0],
    ['Volkswagen Golf 8 GTI', 0, 0],
  ]), { nodeId: 'coppa_citta', track: 'Brands Hatch', templateFile: TEMPLATE() });
  assert.ok(b, 'la zavorra mancante deve produrre un avviso');
  assert.match(b.fonte, /template della serie/);
  assert.equal(b.mancanti.length, 1);
  assert.equal(b.mancanti[0].auto, 'Volkswagen Golf 8 GTI');
  assert.equal(b.mancanti[0].kg, 100);
  assert.ok(Math.abs(b.mancanti[0].pct - 1) < 0.05, `preteso 1%, trovato ${b.mancanti[0].pct}`);
  assert.equal(b.mancanti[0].corsaKg, 0);
  assert.match(b.msg, /ZAVORRE NON ARRIVATE AL VIA/);
  assert.match(b.msg, /100 kg \/ 1%/, 'la % si stampa arrotondata (il restrictor è un float32)');
  assert.match(b.msg, /--serie coppa_citta/);
  assert.match(b.msg, /Brands Hatch/);
});

test('zavorra arrivata: la Golf dichiara 100 kg / 1% → nessun avviso', () => {
  const b = bilancioDaGara(gara([
    ['Alfa Romeo Junior', 0, 0],
    ['Volkswagen Golf 8 GTI', 100, 0.01],
  ]), { nodeId: 'coppa_citta', track: 'Brands Hatch', templateFile: TEMPLATE() });
  assert.equal(b, null);
});

test('varianti della stessa auto nel template: un 0/0 spiegato dalla variante base non è una perdita', () => {
  const tpl = templateCon([
    cella('Alfa Romeo Junior', 'preset_mln_mech_1', 0, 0),
    cella('Toyota Supra MKIV', 'preset_supramkiv_mech_1', 0, 0),
    cella('Toyota Supra MKIV', 'preset_supramkiv_mech_2', 100, 20),
  ]);
  const b = bilancioDaGara(gara([
    ['Alfa Romeo Junior', 0, 0],
    ['Toyota Supra MKIV', 0, 0],
  ]), { nodeId: 'campionato_moderno', track: 'Laguna Seca', templateFile: tpl });
  assert.equal(b, null, 'la variante mech_1 a 0/0 spiega il dichiarato');
});

test('senza template si ricade sulla classe combaciata dalle auto in gara', () => {
  const classes = {
    classi: {
      'serie-test': {
        regole: [
          { auto: 'Alfa Romeo Junior', ballastKg: 0, restrictorPct: 0 },
          { auto: 'Volkswagen Golf 8 GTI', ballastKg: 100, restrictorPct: 1 },
          { auto: 'Abarth 695 Biposto', ballastKg: 100, restrictorPct: 2.5 },
        ],
      },
    },
  };
  const persa = bilancioDaGara(gara([
    ['Alfa Romeo Junior', 0, 0],
    ['Volkswagen Golf 8 GTI', 0, 0],
    ['Abarth 695 Biposto', 0, 0],
  ]), { track: 'Brands Hatch', classes });
  assert.ok(persa);
  assert.equal(persa.mancanti.length, 2);

  const arrivata = bilancioDaGara(gara([
    ['Alfa Romeo Junior', 0, 0],
    ['Volkswagen Golf 8 GTI', 100, 0.01],
    ['Abarth 695 Biposto', 100, 0.025],
  ]), { track: 'Brands Hatch', classes });
  assert.equal(arrivata, null);
});

test('silenzio: regolamento a 0/0, un solo modello, nessuna classe nota', () => {
  const zero = templateCon([
    cella('Abarth 695 Biposto', 'preset_695b_mech_1', 0, 0),
    cella('Volkswagen Golf 8 GTI', 'preset_mk8gti_mech_1', 0, 0),
  ]);
  assert.equal(bilancioDaGara(gara([['Abarth 695 Biposto', 0, 0], ['Volkswagen Golf 8 GTI', 0, 0]]), { templateFile: zero }), null, 'template a 0/0');
  assert.equal(bilancioDaGara(gara([['Abarth 695 Biposto', 0, 0]]), { templateFile: TEMPLATE() }), null, 'un solo modello');
  assert.equal(bilancioDaGara(gara([['Auto Ignota A', 0, 0], ['Auto Ignota B', 0, 0]]), { classes: { classi: {} } }), null, 'classe ignota');
});

test('la gara vera del 6/11 (se il dato è sul PC): Coppa Città corsa senza la zavorra della Golf', (t) => {
  const tplFile = join(ROOT, 'data', 'grid-templates', 'coppa_citta.customgrid');
  const raceFile = join(ROOT, 'data', 'results-archive', '261106-2216_SP_Race.sessionresults.json');
  if (!existsSync(tplFile) || !existsSync(raceFile)) return t.skip('dati del PC assenti');
  const b = bilancioDaGara(JSON.parse(readFileSync(raceFile, 'utf8')), { nodeId: 'coppa_citta', track: 'Brands Hatch', templateFile: tplFile });
  assert.ok(b, 'quella gara è corsa a 0/0 con il template a 100/1: deve parlare');
  assert.equal(b.mancanti.length, 1);
  assert.equal(b.mancanti[0].auto, 'Volkswagen Golf 8 GTI');
  assert.equal(b.mancanti[0].kg, 100);
});
