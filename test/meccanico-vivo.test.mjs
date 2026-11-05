// test/meccanico-vivo.test.mjs — il meccanico dal vivo: i dati REALI del
// gioco passano integri (arrotondatura leggera, mai stimati) e i consigli
// sono regole con soglie in chiaro: camber (temperatura interna/esterno
// per asse), pressioni (bersaglio fourPsi quando arriva), freni
// (termografo + vita pastiglie). Regresso: senza gioco, niente dati.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vivoDaSnapshot, consigliVivo } from '../src/meccanico-vivo.mjs';

/* scattino di snapshot: l'oggetto che liveReader().snapshot({raw:true})
 * espone all'endpoint del meccanico. Solo i campi letti dal modulo. */
const snap = () => ({
  game: true, live: true,
  session: { track: 'Imola', type: 'TimeAttack', name: 'Libere 1' },
  raw: {
    graphics: {
      tyres: {
        lf: { slip: 0.112, lock: false, compoundFront: 'S3' },
        rf: { slip: 0.095, lock: false, compoundFront: 'S3' },
        lr: { slip: 0.203, lock: true, compoundRear: 'S3' },
        rr: { slip: 0.18, lock: false, compoundRear: 'S3' },
      },
    },
    physics: { padLife: [0.6, 0.61, 0.35, 0.34], discLife: [0.8, 0.8, 0.7, 0.7], brakeBias: 0.545 },
  },
  player: {
    airTempC: 24, roadTempC: 37,
    tyrePressure: [27.2, 27.3, 26.9, 27.0],
    tyreInnerC: [92, 91, 84, 83],
    tyreTempC: [87, 86, 80, 79],
    tyreOuterC: [68, 67, 66, 65],
    brakeTempC: [350, 352, 210, 208],
    tyreWear: [0.98, 0.98, 0.96, 0.96],
    damage: [0, 0, 0, 0, 0],
    camberRAD: [-0.0365, -0.0365, -0.0490, -0.0490],
    suspensionTravel: [0.021, 0.022, 0.014, 0.015],
    rideHeight: [0.045, 0.046],
    fuel: 100.4, fuelPerLap: 3.12,
  },
});

test('vivoDaSnapshot: i dati reali passano verbatim (arrotondamenti da GUI)', () => {
  const v = vivoDaSnapshot(snap());
  assert.equal(v.sessione.pista, 'Imola');
  assert.equal(v.ambiente.ariaC, 24);
  assert.equal(v.ambiente.asfaltoC, 37);
  // gomme: psi, temperature per bordo, compound e slittamento dal graphics
  assert.equal(v.gomme.LF.psi, 27.2);
  assert.equal(v.gomme.RR.intC, 83);
  assert.equal(v.gomme.RR.centroC, 79);
  assert.equal(v.gomme.RR.extC, 65);
  assert.equal(v.gomme.LR.bloccata, true);
  assert.equal(v.gomme.LR.composto, 'S3');
  assert.ok(Math.abs(v.gomme.LR.slittamento - 0.203) < 1e-9);
  // usura gomma 0.98 nel gioco = 98% nel payload del meccanico
  assert.equal(v.gomme.LR.usuraPct, 96);
  assert.equal(v.gomme.LF.usuraPct, 98);
  // freni: bilanciere 0.545 = 54.5 -> 55, pastiglie in %
  assert.equal(v.freni.bilancierePct, 55);
  assert.deepEqual(v.freni.pastigliePct, [60, 61, 35, 34]);
  assert.deepEqual(v.freni.dischiPct, [80, 80, 70, 70]);
  // assetto: camber rad->gradi, altezza e sosp m -> mm, danno intatto = null
  assert.deepEqual(v.assetto.camberGradi, [-2.1, -2.1, -2.8, -2.8]);
  assert.deepEqual(v.assetto.sospensioniMm, [21, 22, 14, 15]);
  assert.deepEqual(v.altezzaMm === undefined ? v.assetto.altezzaMm : v.assetto.altezzaMm, [45, 46]);
  assert.equal(v.assetto.dannoPct, null);
  assert.equal(v.benzina.litri, 100.4);
  assert.equal(v.benzina.perGiro, 3.12);
});

test('vivoDaSnapshot: senza gioco LIVE restituisce null (nulla di inventato)', () => {
  const spento = snapshotSpento();
  assert.equal(vivoDaSnapshot({ game: false }), null);
  assert.equal(vivoDaSnapshot({ game: true, live: false, player: {} }), null);
  assert.equal(vivoDaSnapshot(null), null);
  assert.equal(vivoDaSnapshot(spento), null);
});

test('consigliVivo camber: fronte con bordo interno molto più caldo = riduci camber', () => {
  const v = vivoDaSnapshot(snap());
  const consigli = consigliVivo(v);
  const camber = consigli.filter((c) => c.vedi === 'camber');
  // fronte: int 91.5 vs ext 67.5 => +24 (>= 20) -> riduci; posto: 83.5 vs 65.5 => +18 -> no
  assert.equal(camber.length, 1);
  assert.match(camber[0].text, /fronte/);
  assert.match(camber[0].text, /riduci camber fronte/);
});

test('consigliVivo camber: esterno più caldo = aggiungi camber (soglia 20°)', () => {
  const s = snap();
  s.player.tyreInnerC = [62, 61, 60, 60];
  s.player.tyreOuterC = [85, 84, 82, 82];
  const consigli = consigliVivo(vivoDaSnapshot(s));
  const camber = consigli.filter((c) => c.vedi === 'camber');
  assert.equal(camber.length, 2);
  assert.match(camber[0].text, /aggiungi camber/);
});

test('consigliVivo camber: differenze sotto soglia = nessun consiglio (no rumore)', () => {
  const s = snap();
  s.player.tyreInnerC = [80, 80, 80, 80];
  s.player.tyreOuterC = [74, 74, 74, 74];
  const v = vivoDaSnapshot(s);
  assert.equal(consigliVivo(v).filter((c) => c.vedi === 'camber').length, 0);
});

test('consigliVivo pressioni: corregge solo con bersaglio fourPsi reale', () => {
  const v = vivoDaSnapshot(snap());
  // senza bersaglio: primo tentativo, niente pressioni
  assert.equal(consigliVivo(v).filter((c) => c.vedi === 'pressioni').length, 0);
  // con bersaglio 27.9: fronte medio 27.25 => -0.65 (sotto soglia), posto 26.95 => -0.95 (>= 0.8)
  const con = consigliVivo(v, { targetPsi: 27.9 });
  const press = con.filter((c) => c.vedi === 'pressioni');
  assert.equal(press.length, 1);
  assert.match(press[0].text, /posto/);
  assert.match(press[0].text, /gonfia 0\.9 psi posto/);
});

test('consigliVivo freni: fronte sforato = bilanciere avanti; pastiglie sotto 20% = allerta rossa', () => {
  const v = vivoDaSnapshot(snap());
  const consigli = consigliVivo(v);
  const freni = consigli.filter((c) => c.vedi === 'freni');
  // termografo: fronte 351 vs posto 209 => +142 (>= 120) -> avanti.
  // Pastiglie min 34% > 20% => nessuna allerta.
  assert.equal(freni.length, 1);
  assert.match(freni[0].text, /bilanciere avanti/);
  // pastiglie logore:
  const s = snap();
  s.raw.physics.padLife = [0.19, 0.61, 0.35, 0.34];
  const basso = consigliVivo(vivoDaSnapshot(s), {});
  const allerta = basso.find((c) => c.vedi === 'freni' && c.severita === 'alta');
  assert.ok(allerta);
  assert.match(allerta.text, /Pastiglie al 19%/);
});

test('consigliVivo: sempre una lista, anche con dati a metà (mai scoppio)', () => {
  const v = vivoDaSnapshot(snap());
  v.gomme.LF.intC = null; v.gomme.RF.intC = null; v.gomme.LR.frenoC = null;
  const consigli = consigliVivo(v, { targetPsi: null });
  assert.ok(Array.isArray(consigli));
  assert.equal(consigli.every((c) => typeof c.vedi === 'string' && typeof c.text === 'string' && typeof c.severita === 'string'), true);
});

function snapshotSpento() {
  return { game: true, live: false, session: null, raw: null, player: null };
}
