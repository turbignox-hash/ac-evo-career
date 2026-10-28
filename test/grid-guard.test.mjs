// 2/11 — IL GUARDIANO DELLE CLASSI senza strumento: grid-guard.mjs (124 righe)
// decide SE e QUALE ricalibrazione propone dopo una gara, ma nessun test lo
// copriva (pecca del guardiano incustodito). Qui il contratto completo:
// - misureDaGara: mediana dei best per modello, minimo 3 righe con zavorra,
//   minimo 2 set DIVERSI (una gara di calibrazione non misura niente);
// - matchClasse: la classe che copre PIÙ modelli (almeno 2 hit);
// - statoConvalida: silenzioso se convalidata SU QUESTA pista, parlante altrimenti;
// - gridGuardProposal end-to-end su un file finto, senza toccare
//   grid-classes.json reale (il doc passa via opts.classes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { misureDaGara, matchClasse, statoConvalida, gridGuardProposal } from '../src/grid-guard.mjs';
import { sameCar } from '../src/tracknames.mjs';

const CLS = {
  classi: {
    'gr-coventry': {
      convalidatoSu: ['Brands Hatch'],
      regole: [
        { auto: 'Hillman Imp', ballastKg: 0, restrictorPct: 0 },
        { auto: 'Mini Cooper S', ballastKg: 40, restrictorPct: 4 },
        { auto: 'Ford Lotus Cortina', ballastKg: 80, restrictorPct: 8 },
      ],
    },
    'cl-convalid-in-pista': {
      convalidatoSu: [],
      perTraccia: { 'Imola': { convalidato: true, restrictorPct: { 'Hillman Imp': 12 } } },
      regole: [{ auto: 'Hillman Imp', ballastKg: 0, restrictorPct: 0 }],
    },
  },
};

/* Griglia finta: Imp veloce e Cortina lenta, con set DIVERSI (una sola zavorra
   condivisa sarebbe una gara di calibrazione e tornerebbe null). */
const riga = (nome, auto, ballast, restrictor, best, pos) => ({
  driver_name: nome, driver_surname: 'Gruppo', position: pos, car_name: auto,
  ballast, restrictor, best_lap: best, total_time: '15:00.000', laps: 9,
});
const gara = {
  session: 'Race', track: 'Silverstone', layout: 'National', drivers: [
    riga('A', 'Hillman Imp', 0, 0, '01:30.000', 0),
    riga('B', 'Hillman Imp', 0, 0, '01:30.400', 1),
    riga('C', 'Hillman Imp', 0, 0, '01:30.200', 2),
    riga('D', 'Ford Lotus Cortina', 80, 0.08, '01:32.000', 3),
    riga('E', 'Ford Lotus Cortina', 80, 0.08, '01:32.600', 4),
    riga('F', 'Ford Lotus Cortina', 80, 0.08, '01:33.000', 5),
  ],
};

test('misureDaGara: mediana per modello e SET corretti, i più veloci prima', () => {
  const m = misureDaGara(gara);
  assert.ok(m);
  assert.equal(m.length, 2);
  assert.equal(m[0].auto, 'Hillman Imp');
  assert.equal(m[0].best, 90200, 'mediana di 90000/90400/90200 = 90200 ms');
  assert.equal(m[1].car_name ?? m[1].auto, 'Ford Lotus Cortina');
  assert.equal(m[1].bal, '80kg');
  assert.equal(m[1].res, '8%');
});

test('misureDaGara: campione troppo piccolo O gara di calibrazione → null (non misura niente)', () => {
  assert.equal(misureDaGara({ drivers: gara.drivers.slice(0, 2) }), null, 'meno di 3 righe con zavorra');
  const calib = { drivers: gara.drivers.map((d) => ({ ...d, ballast: 0, restrictor: 0 })) };
  assert.equal(misureDaGara(calib), null, 'un set solo = gara di calibrazione: nessuna proposta');
});

test('matchClasse: la classe con più hit vince, con meno di 2 modelli non c\'è match', () => {
  const m = matchClasse(misureDaGara(gara), CLS);
  assert.equal(m.id, 'gr-coventry');
  assert.ok(m.nHit >= 2);
  // nessuna classe copre 2 modelli di questa microgriglia → null
  assert.equal(matchClasse([{ auto: 'Fiat Panda', n: 3, bal: '0kg', res: '0%', best: 90000 }], CLS), null);
});

test('statoConvalida: silenzio su pista convalidata (base o per-traccia), parlante fuori', () => {
  const cv = CLS.classi['gr-coventry'];
  assert.equal(statoConvalida(cv, 'gr-coventry', 'Brands Hatch'), null);
  const motivo = statoConvalida(cv, 'gr-coventry', 'Silverstone');
  assert.ok(/convalidate solo su/.test(motivo ?? ''), `fuori dalla lista di validità: ${motivo}`);
  // la classe con supplementi per-traccia convalidati in pista è a posto LÌ,
  // e FUORI da quella pista parla: la messaggistica dipende da cosa manca.
  // Qui la classe non ha NESSUNA convalida base → il messaggio è quello
  // «NISSUNA convalida», non il «per-traccia» (che arriva solo se le basi
  // sono convalidate altrove e resta a falcolo il supplemento).
  const vp = CLS.classi['cl-convalid-in-pista'];
  assert.equal(statoConvalida(vp, 'cl-convalid-in-pista', 'Imola'), null);
  assert.ok(statoConvalida(vp, 'cl-convalid-in-pista', 'Monza'), 'fuori dal supplemento di pista: parla');
});

test('statoConvalida: classe senza NESSUNA convalida dice tutto chiaramente', () => {
  const motivo = statoConvalida({ regole: [] }, 'x', 'Monza');
  assert.ok(/NISSUNA|NISSUN önem|nessun/i.test(motivo ?? ''), `motivo chiaro: ${motivo}`);
});

test('gridGuardProposal end-to-end su file finto: proposta col perché e i gap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-guard-'));
  const file = join(dir, '260417-1936_MP_Race.sessionresults.json');
  writeFileSync(file, JSON.stringify(gara), 'utf8');
  const p = gridGuardProposal(file, { classes: CLS });
  assert.ok(p, 'regole di gr-coventry NON convalidate su Silverstone → proposta');
  assert.equal(p.classe, 'gr-coventry');
  assert.equal(p.track, 'Silverstone');
  assert.equal(p.propose, true);
  assert.ok(Array.isArray(p.gaps) && p.gaps.length === 2);
  const imp = p.gaps.find((g) => sameCar(g.auto, 'Hillman Imp'));
  assert.equal(imp.delta, 0, 'il centro non ha gap da sé');
  const cor = p.gaps.find((g) => sameCar(g.auto, 'Ford Lotus Cortina'));
  // mediana Cortina 92.600 − mediana Imp 90.200 = 2.4s dal centro
  assert.ok(Math.abs(cor.delta - 2.4) < 0.05, `gap misurato verso il centro: ${cor.delta}s`);
  assert.ok(p.msg.includes('ricalibrazione proposta'), `messaggio corto: ${p.msg.slice(0, 120)}`);
  // stessa gara, pista CONVALIDATA → silenzio totale
  const okTrack = { ...gara, track: 'Brands Hatch' };
  const okFile = join(dir, '260418-2000_MP_Race.sessionresults.json');
  writeFileSync(okFile, JSON.stringify(okTrack), 'utf8');
  assert.equal(gridGuardProposal(okFile, { classes: CLS }), null);
});

test('gridGuardProposal: file rotto, senza pista o senza classe → null senza ambiente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evo-guard2-'));
  const rotto = join(dir, 'rotto.sessionresults.json');
  writeFileSync(rotto, '{"session":"Race","track":', 'utf8');
  assert.equal(gridGuardProposal(rotto, { classes: CLS }), null);
  const senzaTrack = join(dir, 'senza-pista.json');
  writeFileSync(senzaTrack, JSON.stringify({ session: 'Race', drivers: gara.drivers }), 'utf8');
  assert.equal(gridGuardProposal(senzaTrack, { classes: CLS }), null);
  const senzaCls = join(dir, 'senza-classe.json');
  writeFileSync(senzaCls, JSON.stringify({ session: 'Race', track: 'Monza', drivers: gara.drivers.map((d) => ({ ...d, car_name: 'Skoda Fabia' })) }), 'utf8');
  assert.equal(gridGuardProposal(senzaCls, { classes: CLS }), null);
  assert.equal(gridGuardProposal(join(dir, 'inesistente.json'), { classes: CLS }), null);
});
