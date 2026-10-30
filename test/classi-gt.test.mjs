import test from 'node:test';
import assert from 'node:assert/strict';
import { classeAuto, classiGT, riepilogoPerClasse, regoleClear, griglieConClassiVive, ORDINE_CLASSI } from '../src/classi-gt.mjs';
import { sezioneClassi, mdCompose } from '../src/rapporto-gara.mjs';

// righe come le compone resultDetail (campi usati dal rapporto): già
// ordinate per offSort (giri prima, tempo+penalità poi), DSQ in coda.
const riga = (o) => ({
  position: o.p ?? 1, posClasse: null, dsq: !!o.dsq, name: o.nome, car: o.car,
  laps: o.laps ?? 20, bestLap: o.best ?? '2:01.500', hasBest: true,
  totalTime: o.tt ?? '40:30.000', gap: o.gap ?? null, penalty: o.pen ?? null,
  me: !!o.me, offSort: o.p ?? 1,
});

test('classeAuto: i nomi delle auto del gioco cadono nelle classi giuste', () => {
  assert.equal(classeAuto('Ferrari 296 GT3'), 'GT3');
  assert.equal(classeAuto('BMW M4 GT3'), 'GT3');
  assert.equal(classeAuto('Ford Mustang GT3'), 'GT3');
  assert.equal(classeAuto('McLaren 720S GT3 Evo'), 'GT3');
  assert.equal(classeAuto('Mercedes-AMG GT2 EVO'), 'GT2');
  assert.equal(classeAuto('KTM X-Bow GT2'), 'GT2');
  assert.equal(classeAuto('Ferrari F40 LM'), 'GT1');
  assert.equal(classeAuto('McLaren F1 GTR (1995)'), 'GT1');
  assert.equal(classeAuto('Audi R8 LMS GT4 Evo'), 'GT4');
  assert.equal(classeAuto('Renault 5 GT Turbo'), '-');       // fuori dalle classi GT
  assert.equal(classeAuto(''), '-');
  assert.equal(classeAuto(null), '-');
});

test('regole override (param): un pezzo nuovo assegna classe senza toccare i default', () => {
  const regole = { GT1: ['f40 lm'], GT2: ['gt2'], GT3: ['gt3', 'c7r'], GT4: ['gt4'] };
  assert.equal(classeAuto('Callaway Corvette C7R', regole), 'GT3');
});

test('Hypercar e LMP2 (28/10, endurance): prototipi e 963 LMDH a parte dalle GT', () => {
  assert.equal(classeAuto('Porsche 963'), 'Hypercar');
  assert.equal(classeAuto('Porsche 963 LMDH'), 'Hypercar');
  assert.equal(classeAuto('Glickenhaus 007 Hypercar'), 'Hypercar');
  assert.equal(classeAuto('Oreca 07 LMP2'), 'LMP2');
  // il 963 non deve smarrire in GT2 (due parole «2  ni»? no, sono parole separate)
  assert.notEqual(classeAuto('Porsche 911 GT2 RS'), 'Hypercar');
});

test('ORDINE_CLASSI: Hypercar e LMP2 davanti alle GT nel rapporto', () => {
  const rows = [
    riga({ p: 1, nome: 'Ellis', car: 'Porsche 963' }),
    riga({ p: 4, nome: 'Rossi', car: 'Oreca 07 LMP2' }),
    riga({ p: 5, nome: 'Blanc', car: 'Ferrari 296 GT3' }),
    riga({ p: 9, nome: 'Nero', car: 'Porsche 911 GT3 R' }),
  ];
  const res = classiGT(rows);
  assert.deepEqual(res.classi, ['Hypercar', 'LMP2', 'GT3']);
  assert.equal(res.gruppi[0].righe[0].posClasse, 1);
  assert.equal(res.gruppi[1].righe[0].posClasse, 1);
  assert.equal(riepilogoPerClasse(rows).gruppi.length, 3);
});

test('classiGT: posClasse per gruppo e ordine GT1→GT2→GT3→(-) in coda', () => {
  const rows = [
    riga({ p: 1, nome: 'Cavaliere', car: 'Ferrari 296 GT3' }),
    riga({ p: 2, nome: 'Trovatio', car: 'Mercedes-AMG GT2 EVO' }),
    riga({ p: 3, nome: 'Bagnato', car: 'Ferrari 296 GT3' }),
    riga({ p: 4, nome: 'Longo', car: 'Ferrari F40 LM' }),
    riga({ p: 5, nome: 'Orsini', car: 'BMW M4 GT3' }),
    riga({ p: 6, nome: 'Nudo', car: 'Renault 5 GT Turbo' }),
    riga({ p: 7, nome: 'S Cristo', car: 'KTM X-Bow GT2' }),
  ];
  const res = classiGT(rows);
  assert.deepEqual(res.classi, ['GT1', 'GT2', 'GT3', '-']);
  const gt1 = res.gruppi.find((x) => x.classe === 'GT1');
  assert.equal(gt1.righe[0].name, 'Longo');
  assert.equal(gt1.righe[0].posClasse, 1);
  const gt2 = res.gruppi.find((x) => x.classe === 'GT2');
  assert.equal(gt2.righe.length, 2);
  assert.equal(gt2.righe[1].posClasse, 2);
  const diversi = res.gruppi.find((x) => x.classe === '-');
  assert.equal(diversi.righe[0].name, 'Nudo');
});

test('riepilogoPerClasse: griglia a classe UNICA → null (il rapporto non mostra niente)', () => {
  const rows = [riga({ nome: 'A', car: 'Ferrari 296 GT3' }), riga({ p: 2, nome: 'B', car: 'BMW M4 GT3' })];
  assert.equal(riepilogoPerClasse(rows), null);
  // e nemmeno tutte sconosciute
  assert.equal(riepilogoPerClasse([riga({ nome: 'C', car: 'Renault 5' })]), null);
});

test('griglieConClassiVive (31/10, «menu con classi vive»): mono per classe viva e TUTTE le miscele 2–4', () => {
  const perClasse = new Map([
    ['GT3', ['auto_a', 'auto_b', 'auto_c']],
    ['GT4', ['auto_d', 'auto_e']],
    ['Coppa', ['auto_f']],                    // classe VIVA fuori da ORDINE_CLASSI: in coda, alfabetiche
  ]);
  const g = griglieConClassiVive(perClasse);
  // mono: GT3, GT4 (ordine 24 Le Mans) e la Coppa viva in coda
  const mono = g.slice(0, 3).map((x) => x.nome);
  assert.deepEqual(mono, ['GT3 monoclasse (3 auto)', 'GT4 monoclasse (2 auto)', 'Coppa monoclasse (1 auto)']);
  assert.deepEqual(g[0].pool, ['auto_a', 'auto_b', 'auto_c']);
  // tutte le miscele: coppie 3 + l'intera (la UNICA triple, 3 classi vive)
  assert.equal(g.length, 3 + 3 + 1);
  const gt3gt4 = g.find((x) => x.nome === 'GT3 + GT4 — multiclasse (3+2)');
  assert.ok(gt3gt4, 'la multiclasse nota c\'è ancora, ma dal generatore');
  assert.deepEqual(gt3gt4.pool, ['auto_a', 'auto_b', 'auto_c', 'auto_d', 'auto_e']);
  assert.ok(g.some((x) => x.nome.startsWith('GT3 + GT4 + Coppa')), 'un\'endurance col aggiunta della classe viva in coda c\'è');
  assert.ok(g.filter((x) => x.nome.includes('multiclasse')).every((x) => x.pool.length >= 2), 'ogni combinazione ha un pool d\'almeno due auto');
  // nessuna classe viva e perClasse assente: menu povero, nessun ramo
  assert.deepEqual(griglieConClassiVive(new Map()), []);
  assert.deepEqual(griglieConClassiVive(null), []);
});

test('griglieConClassiVive: più di 4 classi vive → miscele fino a 4 + l\'endurance INTERA in coda', () => {
  const perClasse = new Map(ORDINE_CLASSI.map((cl) => [cl, [`id_${cl}`]]));
  const g = griglieConClassiVive(perClasse);
  // miscele fino a 4 classi: 15 coppie + 20 triple + 15 quadruple; poi l'intera
  assert.equal(g.length, 6 + 15 + 20 + 15 + 1, '6 mono + tutte le miscele 2–4 + l\'endurance intera');
  const tutta = g[g.length - 1];
  assert.equal(tutta.nome, 'Hypercar + LMP2 + GT1 + GT2 + GT3 + GT4 — multiclasse (1+1+1+1+1+1)');
  assert.equal(tutta.pool.length, 6);
});

test('sezioneClassi → mdCompose: blocco classi dentro il MD, podio per classe, niente sezione a classe unica', () => {
  const rows = [
    riga({ p: 1, nome: 'Cavaliere', car: 'Ferrari 296 GT3', me: true, gap: 0, tt: '1:40:00.000' }),
    riga({ p: 2, nome: 'Trovatio', car: 'Mercedes-AMG GT2 EVO', gap: 32000, tt: '1:40:32.000' }),
    riga({ p: 3, nome: 'Bagnato', car: 'Ferrari 296 GT3', gap: 48000, tt: '1:40:48.000' }),
    riga({ p: 4, nome: 'Longo', car: 'Ferrari F40 LM', gap: 96000, tt: '1:41:36.000' }),
  ];
  const d = {
    file: '260416-2108_SP_Race.sessionresults.json', track: 'Spa-Francorchamps', layout: '',
    session: 'Race', event: 'Endurance Prova', hour: 14, min: 30, weather: 'Cloud', rows,
  };
  const sec = sezioneClassi(rows);
  assert.ok(sec, 'con due classi serve la sezione');
  assert.match(sec.titolo, /CLASSIFICA PER CLASSE/);
  assert.match(sec.premi, /GT1 — \*\*Longo\*\* \(Ferrari F40 LM\)/);
  // 31/10 notte: l'anteprima HTML legge .gruppi (con posClasse) — un tempo
  // mancava e il rapporto HTML moriva lì (giornata 261030, fermo a Donington).
  assert.ok(Array.isArray(sec.gruppi) && sec.gruppi.length, 'i gruppi esistono per la tabella HTML');
  const md = mdCompose(d, { me: rows[0], fl: rows[0], sect: null, prev: null, build: null });
  assert.match(md, /CLASSIFICA PER CLASSE · stile 24h Le Mans/);
  assert.match(md, /🥇 GT1 — \*\*Longo\*\*/);
  assert.match(md, /P1 *\| *Longo/);
  // classe unica: NESSUNA sezione, il MD resta il bianco consueto
  const rowsUna = rows.map((r) => ({ ...r, car: 'Ferrari 296 GT3' }));
  assert.equal(sezioneClassi(rowsUna), null);
  const mdUna = mdCompose({ ...d, rows: rowsUna }, { me: rowsUna[0], fl: rowsUna[0], sect: null, prev: null, build: null });
  assert.doesNotMatch(mdUna, /CLASSIFICA PER CLASSE/);
});

test('regoleClear: le regole tornano ai DEFAULT dopo un tocco', async () => {
  regoleClear();
  assert.equal(classeAuto('Ferrari 296 GT3'), 'GT3');
});
