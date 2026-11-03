// grid-cura.test.mjs — la cura d'identità (3/11): fotocopia dei soli f10/f11
// dal donatore EVO, tutto il resto della cella intatto, celle distinte fra loro,
// idempotente. Donatore di prova in sandbox temp (nessuna dipendenza dal repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';
import { veleniIn, curaBuf, trovaDonore, dimenticaDonore } from '../src/grid-cura.mjs';

/* ---- le forme V assertThat del DONATORE e del VELENO (da EVO, commisurate il 23/10 e non solo) ---- */
const SUPRA = 'ks_toyota_supra_mkiv';
const f10Veleno = Buffer.from(
  '\n\x17preset_supramkiv_mech_1\x12\x1cToyota Supra MKIV - Standard\x22\x08Standard',
  'binary',
);
const f11Veleno = Buffer.from(
  '\n\x19preset_supramkiv_visual_2\x12\x13Supra MKIV Visual 2',
  'binary',
);
const f10Vero = Buffer.from(
  '\n\x17preset_supramkiv_mech_1\x12\x16Supra MKIV Preset Base\x18\x01\x22\x08Standard',
  'binary',
);
const f11Vero = Buffer.from(
  '\n\x19preset_supramkiv_visual_1\x12\x13Supra MKIV Visual 1',
  'binary',
);
const donnaGriglia = (celle) => encodeMsg(celle.map((bytes) => ({ field: 1, wire: 2, bytes })));
const campi = (cella) => decodeMsg(cella);
const f = (cella, campo) => campi(cella).find((g) => g.field === campo);   // su BYTE di cella
const c = (campiCella, campo) => campiCella.find((g) => g.field === campo);  // su CAMPI già decodificati
const txt = (b) => (b ? Buffer.from(b).toString('binary') : '');

/* due celle Supra velenose che differiscono SOLO nel f19 (il resto della cella
   è asimmetrizzato: le cure non toccano l'identità ma nemmeno le spaccia gemelle) */
const cellaVelenosa = (f19) => [
  { field: 3, wire: 2, bytes: Buffer.from(SUPRA) },
  { field: 10, wire: 2, bytes: f10Veleno },
  { field: 11, wire: 2, bytes: f11Veleno },
  { field: 19, wire: 0, varint: BigInt(f19) },
];
const cellaSupraVelenosa = (f19) => encodeMsg(cellaVelenosa(f19));
const cellaSana = () => encodeMsg([{ field: 3, wire: 2, bytes: Buffer.from('ks_ferrari_288_gto') }]);

/* ---- il donatore in sandbox (grezze temporanee: nessun dipendere dal repo) ---- */
const creaGrezze = () => {
  const base = mkdtempSync(join(tmpdir(), 'grid-cura-'));
  const grezze = join(base, 'grezze');
  mkdirSync(grezze, { recursive: true });
  const donoreCelle = [
    { field: 3, wire: 2, bytes: Buffer.from(SUPRA) },
    { field: 10, wire: 2, bytes: f10Vero },
    { field: 11, wire: 2, bytes: f11Vero },
  ];
  writeFileSync(join(grezze, 'donore-23-10.customgrid'), donnaGriglia([encodeMsg(donoreCelle)]));
  return grezze;
};

test('round-trip byte-fidus della primitiva (precondizione: encodeMsg(decodeMsg) non deformi il resto)', () => {
  const grid = donnaGriglia([cellaSupraVelenosa(85), cellaSana(), cellaSupraVelenosa(60)]);
  assert.equal(Buffer.compare(encodeMsg(decodeMsg(grid)), grid), 0);
});

test('veleniIn conta le sole celle con identità non risolvibile', () => {
  const grid = donnaGriglia([cellaSupraVelenosa(85), cellaSana(), cellaSupraVelenosa(60)]);
  assert.equal(veleniIn(grid), 2);
});

test('trovaDonore beve una grezza scritta da EVO (donatore con f10 vero + f11 vero + f3)', () => {
  const grezze = creaGrezze();
  dimenticaDonore();
  const d = trovaDonore({ grezze });
  assert.equal(Buffer.compare(c(d, 10).bytes, f10Vero), 0);
  assert.equal(Buffer.compare(c(d, 11).bytes, f11Vero), 0);
  assert.equal(Buffer.compare(c(d, 3).bytes, Buffer.from(SUPRA)), 0);
});

test('curaBuf: fotocopia dei SOLI f10/f11; il resto della cella e le altre celle restano', () => {
  const grezze = creaGrezze();
  dimenticaDonore();
  const donore = trovaDonore({ grezze });
  const grid = donnaGriglia([cellaSupraVelenosa(85), cellaSana(), cellaSupraVelenosa(60)]);
  const curata = curaBuf(grid, { donore });
  assert.ok(curata, 'la cura deve produrre un buffer');
  const celle = decodeMsg(curata).filter((g) => g.field === 1 && g.wire === 2).map((g) => g.bytes);
  assert.equal(celle.length, 3);
  const [a, sana, b] = celle;
  // le identità sono fotocopiate dal donatore
  assert.equal(Buffer.compare(f(a, 10).bytes, f10Vero), 0);
  assert.equal(Buffer.compare(f(a, 11).bytes, f11Vero), 0);
  assert.equal(Buffer.compare(f(b, 10).bytes, f10Vero), 0);
  assert.equal(Buffer.compare(f(b, 11).bytes, f11Vero), 0);
  // il RESTO di ciascuna cella intatto: f3 identità + f19 asimmetria
  assert.equal(Number(f(a, 19).varint), 85);
  assert.equal(Number(f(b, 19).varint), 60);
  assert.equal(txt(f(a, 3).bytes), SUPRA);
  // la cella sana non toccata
  assert.equal(Buffer.compare(sana, cellaSana()), 0);
  // le due Supra restano byte-distinte fra loro (la regola del cancellaio)
  assert.equal(Buffer.compare(a, b) !== 0, true);
});

test('la cura è idempotente: secondo passaggio = nothing (curaBuf null, veleni 0)', () => {
  const grezze = creaGrezze();
  dimenticaDonore();
  const donore = trovaDonore({ grezze });
  const grid = donnaGriglia([cellaSupraVelenosa(85), cellaSana()]);
  const prima = curaBuf(grid, { donore });
  assert.equal(veleniIn(prima), 0);
  assert.equal(curaBuf(prima, { donore }), null);
});

test('il donatore inciso (fallback) dà la STESSA copia vera quando le grezze mancano', () => {
  dimenticaDonore();
  const donore = trovaDonore({ grezze: join(tmpdir(), 'grid-cura-niente') });
  const grid = donnaGriglia([cellaSupraVelenosa(7)]);
  const curata = curaBuf(grid, { donore });
  const a = decodeMsg(curata).filter((g) => g.field === 1 && g.wire === 2)[0].bytes;
  assert.equal(Buffer.compare(f(a, 10).bytes, f10Vero), 0);
  assert.equal(Buffer.compare(f(a, 11).bytes, f11Vero), 0);
  assert.equal(String(Number(f(a, 19).varint)), '7');
});

/* ---- LA GUARDIA DEL GANCIO (3/11, richiesta Mauro: «la griglia appena scritta
   da EVO si autocura da sola»): il guardiano raccogli-griglie deve CHIAMARE la
   cura viva a ogni griglia nuova, e chiamarla PRIMA della fotografia — così la
   copia archiviata in magazzino/fabbrica è già quella curata, non il veleno.
   Guardia a SORGENTE VIVO: la rottura è una riga tolta, che nessun import vede. */
test('raccogli-griglie è AGGANCIATO: chiama autocuraVivo() nel tick, prima della fotografia', () => {
  const src = readFileSync(new URL('../tools/raccogli-griglie.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bautocuraVivo\b[^}]*\} from '\.\.\/src\/grid-cura\.mjs'/, 'il guardiano deve importare autocuraVivo da src/grid-cura.mjs');
  const iAuto = src.indexOf('refisciAuto(autocuraVivo())');
  const iTick = src.lastIndexOf('refisciAuto(autocuraVivo())');
  const iFoto = src.indexOf('const esito = fotografia(buf)');
  const iVia = src.indexOf('setInterval(');
  assert.ok(iAuto > 0, 'GUARDIA COLPITA: il guardiano non chiama più refisciAuto(autocuraVivo()) — la cura non è agganciata');
  assert.ok(iFoto > 0, 'faro della guardia spostato: la fotografia non è più dove la guardia la cerca');
  assert.ok(iAuto !== iTick, 'GUARDIA COLPITA: manca la visita AL VIA — un veleno già sul disco all\'accensione non si curerebbe');
  assert.ok(iAuto < iVia, 'la visita al via deve stare prima del setInterval (vale subito, non al primo tick)');
  assert.ok(iTick < iFoto, 'l\'autocura deve precedere la fotografia: si archivia la griglia CURATA, non il veleno');
  // e un veleno in attesa si ripete a ogni tick (gioco aperto → chiuso), non si dimentica
  assert.match(src, /ATTESA_AUTO\.has\(statoAuto\)/, 'i veleni in attesa devono essere ripresi a ogni tick, non solo al cambio del file');
});
