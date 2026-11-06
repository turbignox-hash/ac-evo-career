// test/grid-calib.test.mjs — la calibrazione dai risultati reali, provata SENZA
// toccare né carriera né customgrid né il registro vero:
// EVO_DATA_DIR → cartella temporanea (grid-calibrazione.json e i backup finiscono lì).
//
// Scenari (classe REALE pi-10-11-moderna, base = Abarth 695 Biposto):
//   1. auto della classe sfuggono dalla base su una pista senza perTraccia → proposte perTraccia;
//   2. Sebring: supplementi già al cap 20% → niente ULTERIORE penalità ma proposta di
//      ESCLUSIONE (la leva della nota di classe 19/10); Supra sotto il cap → penalità;
//   3. campo-ai in giù quando la mediana del campo scappa e ti ha battuto in gara;
//   4. vittoria larga con classe già a 100 → nessuna proposta in su (niente rumore);
//   5. confidenza: due gare in tolleranza sulla STESSA pista → ALTA e convalidabile (dry);
//   6. classe sconosciuta → niente evento, niente rumore.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = mkdtempSync(join(tmpdir(), 'calib-test-'));
process.env.EVO_DATA_DIR = TMP;   // PRIMA dell'import: grid-calib legge l'env
// La calibrazione dei test vive su UNA COPIA della fixture congelata
// (test/fixtures/grid-classes-sample.json = le classi di data/grid-classes.json
// al 24/10/2026): senza questo i test grid-calib dipendevano dal data/ locales
// e nel pacchetto amico estratto cadevano 12/173. La copia è scrivibile (le
// convalide del test 5 scrivono il file) e sta nella cartella temporanea:
// niente mutate né il data/ vero né la fixture.
const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'grid-classes-sample.json');
const CLASSES_TMP = join(TMP, 'grid-classes.json');
copyFileSync(SAMPLE, CLASSES_TMP);
process.env.EVO_CLASSES_FILE = CLASSES_TMP;   // PRIMA dell'import: gridbuilder legge l'env

const calib = await import('../src/grid-calib.mjs');

// --- fixture: piloti come li scrive EVO (nome nel driver_name/surname, AUTO in car_*) ---
const bestStr = (sec) => `2:${String(Math.floor(sec) % 60).padStart(2, '0')}.${String(Math.round((sec % 1) * 1000)).padStart(3, '0')}`;

/** un AI della classe: l'auto è CAR_NAME + CAR_BRAND (da lì avviene il match con la classe) */
const carAI = (surname, brand, car, bestSec, laps = 3) => ({
  driver_name: '• AI', driver_surname: surname, position: 0, laps,
  car_name: car, car_brand: brand,
  best_lap: bestStr(bestSec), total_time: '8:00.000',
});

const AUTO = {
  golf: ['Volkswagen', 'Golf 8 GTI'],
  m3: ['BMW', 'M3 E46 CSL'],
  supra: ['Toyota', 'Supra MKIV'],
  mini: ['Mini', 'Mini John Cooper S'],
  abarth: ['Abarth', '695 Biposto'],
};

/** una griglia importata coi best e risordinata per posizione (0-based, come nel file EVO) */
function griglia(...rows) {
  const msOf = (d) => { const m = String(d.best_lap).match(/^(\d+):(\d+)\.(\d+)$/); return m ? (+m[1] * 60000) + (+m[2] * 1000) + (+m[3]) : null; };
  const ordinata = rows.filter((r) => r && !Array.isArray(r))
    .sort((a, b) => (msOf(b) ?? 0) - (msOf(a) ?? 0))   // decrescente, poi rimappo le posizioni
    .reverse()
    .map(({ best_raw, ...rest }, i) => ({ ...rest, position: i }));
  return { session: 'race', track: 'Pista Di Prova Senza Regole', drivers: ordinata };
}

test.after(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* pazienza */ } });

/* ------------ 1. classe per NOMI auto + proposte perTraccia su pista senza regole ------------ */
test('classe matchata per NOMI auto e proposte perTraccia quando sfugge dalla base', () => {
  const race = griglia(
    carAI('Golf1', ...AUTO.golf, 157.5),
    carAI('Golf2', ...AUTO.golf, 157.6),
    carAI('M3a', ...AUTO.m3, 153.0),
    carAI('M3b', ...AUTO.m3, 153.5),
    carAI('Supra1', ...AUTO.supra, 161.48),
    carAI('Supra2', ...AUTO.supra, 161.52),
    carAI('Mini1', ...AUTO.mini, 161.55),
    carAI('Abarth1', ...AUTO.abarth, 161.49),
    carAI('Abarth2', ...AUTO.abarth, 161.51),
  );
  race.track = 'Pista Di Prova Senza Regole';
  const { evento, proposte } = calib.analyzeRace(race, { track: race.track });
  assert.equal(evento.classe, 'pi-10-11-moderna', 'le auto della classe si riconoscono dai nomi');
  const m3 = evento.perAuto.find((r) => r.auto === 'BMW M3 E46 CSL');
  assert.ok(m3, 'M3 riconosciuta');
  assert.ok(m3.deltaVsBaseSec <= -7, `M3 ~8s più veloce della base (delta ${m3.deltaVsBaseSec}s)`);
  const sup = evento.perAuto.find((r) => r.auto === 'Toyota Supra MKIV');
  assert.ok(sup && Math.abs(sup.deltaVsBaseSec) < 0.2, `Supra ≈ base (delta ${sup.deltaVsBaseSec}s)`);
  const m3p = proposte.find((p) => p.leva === 'perTraccia' && p.auto === 'BMW M3 E46 CSL');
  assert.ok(m3p, 'serve una proposta perTraccia per la M3');
  assert.ok(/%/.test(m3p.a), `la proposta porta una penalità %: ${m3p.a}`);
  const golfp = proposte.find((p) => p.leva === 'perTraccia' && p.auto === 'Volkswagen Golf 8 GTI');
  assert.ok(golfp, 'anche il Golf sfugge: proposta perTraccia');
});

/* ------------ 2. Sebring: cap 20% raggiunto → esclusione, non un altro % ------------ */
test('Sebring: cap 20% colpito → niente altra penalità ma proposta di ESCLUSIONE', () => {
  const race = griglia(
    carAI('Golf1', ...AUTO.golf, 156.7),
    carAI('Golf2', ...AUTO.golf, 156.71),
    carAI('M3a', ...AUTO.m3, 153.2),
    carAI('M3b', ...AUTO.m3, 153.3),
    carAI('Supra1', ...AUTO.supra, 155.9),
    carAI('Supra2', ...AUTO.supra, 155.95),
    carAI('Abarth1', ...AUTO.abarth, 161.5),
    carAI('Abarth2', ...AUTO.abarth, 161.52),
  );
  race.track = 'Sebring International Raceway';
  const { evento, proposte } = calib.analyzeRace(race, { track: race.track });
  const m3 = evento.perAuto.find((r) => r.auto === 'BMW M3 E46 CSL');
  assert.equal(m3.capRaggiunto, true, 'M3 in perTraccia Sebring è già a 20% (cap)');
  const sup = evento.perAuto.find((r) => r.auto === 'Toyota Supra MKIV');
  assert.equal(sup.capRaggiunto, false, 'Supra è a 5%, sotto il cap');
  assert.ok(!proposte.some((p) => p.leva === 'perTraccia' && p.auto === 'BMW M3 E46 CSL'),
    'al cap NON si propone un altro % per la M3');
  const golfEsc = proposte.find((p) => p.leva === 'escludi' && p.auto === 'Volkswagen Golf 8 GTI');
  assert.ok(golfEsc, 'Golf al cap e sfuggente → proposta di escludi-auto');
  assert.equal(golfEsc.preset, 'preset_mk8gti_mech_1', 'la proposta di esclusione porta il preset');
  assert.ok(proposte.some((p) => p.leva === 'perTraccia' && p.auto === 'Toyota Supra MKIV'),
    'Supra sotto il cap: proposta di penalità aumentata');
});

/* ------------ 2-bis. regola-classe: le piste convergenti sulla STESSA auto zolano il default di classe ------------ */
test('regola-classe: perTraccia convergenti (>=2 piste, lezione 28/10) sopra la base proponono il default zollato', () => {
  // stessa corsia del test 1; la fixture porta GIÀ 3 piste overrideate sopra il default
  // (Golf: COTA 9%, Sebring 20%, Monza 20% contro la regola di classe a 1%)
  const race = griglia(
    carAI('Golf1', ...AUTO.golf, 157.5),
    carAI('Golf2', ...AUTO.golf, 157.6),
    carAI('M3a', ...AUTO.m3, 153.0),
    carAI('Supra1', ...AUTO.supra, 161.48),
    carAI('Abarth1', ...AUTO.abarth, 161.49),
  );
  race.track = 'Pista Di Prova Senza Regole';
  const { proposte } = calib.analyzeRace(race, { track: race.track });
  const golf = proposte.find((p) => p.leva === 'regola-classe' && p.auto === 'Volkswagen Golf 8 GTI');
  assert.ok(golf, `serve la proposta regola-classe per il Golf (3 piste confermanti) — proposte=${JSON.stringify(proposte.map((p) => p.leva + ':' + p.auto))}`);
  assert.equal(golf.a, '100kg/20%', `il valore zollato al cap: ${golf.a}`);
  // IL COMANDO FA QUELLO CHE DICE (7/11): la regola di classe sta in grid-classes.json,
  // non nel customgrid — `--rule ... --apply` riscriverebbe solo la griglia corrente
  // e la classe resterebbe a 1% (sparirebbe al Prepara dopo).
  assert.ok(golf.comando.includes('grid-classes.json') && golf.comando.includes('--serie pi-10-11-moderna'), `comando sulla classe: ${golf.comando}`);
  assert.ok(!golf.comando.includes('--rule'), `niente --rule: scriverebbe il customgrid, non la classe — ${golf.comando}`);
  assert.ok(!proposte.some((p) => p.leva === 'regola-classe' && p.auto === 'Toyota Supra MKIV'),
    'la Supra ha conferme sotto la base/una sola: niente regola-classe');
  assert.ok(!proposte.some((p) => p.leva === 'regola-classe' && p.auto === 'Abarth 695 Biposto'),
    'la base nuda non si autopromuove');
});

/* ------------ 2-ter. escludi-CLASSE: attivata SOLO dai dati già scritti (28/10) ------------ 
 * richiesta Mauro: «se un'auto è troppo veloce anche con le zavorre al max, si
 * potrebbe escluderla dal campionato, ma attivabile solo se i dati sono dimostrati».
 * La dimostrazione sono le esclusioni per-traccia GIÀ APPLICATE (ramo B accetta):
 * una sola → mai; due piste → proposta; già scritta in classe → silenzio. */
test('escludi-classe: due piste confermate aprono la proposta, una sola NON basta, già scritta tace', async () => {
  calib.resetCalib();
  const PRE = readFileSync(CLASSES_TMP, 'utf8');
  const raceSebring = () => {
    const race = griglia(
      carAI('Golf1', ...AUTO.golf, 156.7),   // al cap (20% di perTraccia Sebring in fixture)
      carAI('Golf2', ...AUTO.golf, 156.71),
      carAI('Abarth1', ...AUTO.abarth, 161.5),
      carAI('Abarth2', ...AUTO.abarth, 161.52),
    );
    race.track = 'Sebring International Raceway';
    return race;
  };
  const edit = (fn) => {
    const j = JSON.parse(readFileSync(CLASSES_TMP, 'utf8'));
    fn(j.classi['pi-10-11-moderna']);
    writeFileSync(CLASSES_TMP, JSON.stringify(j, null, 2));
    return new Promise((r) => setTimeout(r, 15));   // mtime: le scritture nello stesso tick si tengono
  };
  try {
    // (a) zero conferme: il ramo B propone il per-traccia, la classe resta muta
    const { proposte: p0 } = calib.analyzeRace(raceSebring(), { track: 'Sebring International Raceway' });
    assert.ok(p0.some((p) => p.leva === 'escludi' && p.auto === 'Volkswagen Golf 8 GTI'), 'al cap e scappante: escludi per-traccia');
    assert.ok(!p0.some((p) => p.leva === 'escludi-classe'), 'senza conferme scritte: NIENTE esclusione di classe');
    // (b) UNA sola pista confermante: ancora niente
    await edit((c) => { c.perTraccia.Monza.escludiAuto = ['preset_mk8gti_mech_1']; });
    const { proposte: p1 } = calib.analyzeRace(raceSebring(), { track: 'Sebring International Raceway' });
    assert.ok(p1.some((p) => p.leva === 'escludi' && p.auto === 'Volkswagen Golf 8 GTI'), 'una pista: ancora solo il per-traccia');
    assert.ok(!p1.some((p) => p.leva === 'escludi-classe'), 'UNA sola esclusione di pista NON dimostra niente');
    // (c) DUE piste confermanti: qui arrivera la proposta di classe, col comando pronto
    await edit((c) => { c.perTraccia['Circuit Of The Americas'].escludiAuto = ['preset_mk8gti_mech_1']; });
    const { proposte: p2, evento } = calib.analyzeRace(raceSebring(), { track: 'Sebring International Raceway' });
    const cl = p2.find((p) => p.leva === 'escludi-classe' && p.preset === 'preset_mk8gti_mech_1');
    assert.ok(cl, `due piste che hanno escrio l'esclusione → proposta escludi-classe — proposte=${JSON.stringify(p2.map((p) => p.leva + ':' + (p.auto ?? '')))}`);
    assert.equal(cl.auto, 'Volkswagen Golf 8 GTI');
    assert.equal(cl.classe, evento.classe, 'la proposta porta la classe');
    assert.ok(cl.comando.includes('escludiAuto') && cl.comando.includes('--drop') && cl.comando.includes('preset_mk8gti_mech_1'), `comando pronto: ${cl.comando}`);
    // (d) già scritta in escludiAuto di classe: silenzio (né doppioni né rumore)
    await edit((c) => { c.escludiAuto = ['preset_mk8gti_mech_1']; });
    const { proposte: p3 } = calib.analyzeRace(raceSebring(), { track: 'Sebring International Raceway' });
    assert.ok(!p3.some((p) => p.leva === 'escludi-classe' || p.leva === 'escludi'), 'esclusione di classe già scritta: zero proposte di esclusione');
  } finally {
    writeFileSync(CLASSES_TMP, PRE);   // la fixture torna vergine per i test dopo
  }
});

/* ------------ 3. campo-ai in giù: mediana che scappa + battuto in gara ------------ */
test('campo-ai in giù quando la mediana del campo scappa e ti ha battuto in gara', () => {
  const me = {
    driver_name: 'Mauro Turbigno', driver_surname: 'Turbigno', position: 0, laps: 3,
    car_name: 'RX-7 FD Spirit R', car_brand: 'Mazda', is_current_driver: true,
    best_lap: bestStr(160.7), total_time: '8:05.000',
  };
  const race = griglia(
    carAI('f1', ...AUTO.golf, 156.5),
    carAI('f2', ...AUTO.golf, 156.6),
    carAI('f3', ...AUTO.m3, 156.7),
    me,
    carAI('f4', ...AUTO.mini, 161.5),
  );
  race.track = 'Pista Di Prova Senza Regole';
  // come fa runImport: il pilota è l'oggetto DENTRO il file (stesso riferimento)
  const meRow = race.drivers.find((d) => d.driver_name === 'Mauro Turbigno');
  const { proposte, evento } = calib.analyzeRace(race, { track: race.track, playerDriver: meRow });
  const campo = proposte.find((p) => p.leva === 'campo-ai');
  assert.ok(campo, `campo troppo forte: serve una proposta di campo-ai
     classe=${evento.classe} campo=${JSON.stringify(evento.campo)} aiCampo=${JSON.stringify(evento.aiCampo)}
     proposte=${JSON.stringify(proposte)}
     perAuto=${JSON.stringify(evento.perAuto)}`);
  assert.equal(campo.direzione, 'giù');
  const [_lo, hi] = campo.a.split('-').map(Number);
  const [_oldLo, oldHi] = campo.da.split('-').map(Number);
  assert.ok(hi < oldHi, `la cima scende (${campo.a} ← ${campo.da})`);
});

/* ------------ 4. vittoria larga con classe già a soffitto: niente proposta in su ------------ */
test('vittoria larga con aiStandard già a 100: NESSUNA proposta in su', () => {
  const me = {
    driver_name: 'Mauro Turbigno', driver_surname: 'Turbigno', position: 0, laps: 3,
    car_name: 'RX-7 FD Spirit R', car_brand: 'Mazda', is_current_driver: true,
    best_lap: bestStr(161.0), total_time: '8:00.000',
  };
  const race = griglia(
    me,
    { ...carAI('f1', 'Mazda', 'RX-7 FD Spirit R', 161.5), total_time: '8:15.000' },
    { ...carAI('f2', 'Mazda', 'RX-7 FD Spirit R', 161.6), total_time: '8:20.000' },
    { ...carAI('f3', 'Mazda', 'RX-7 FD Spirit R', 161.7) },
  );
  race.track = 'Pista Di Prova Senza Regole';
  const { proposte } = calib.analyzeRace(race, { track: race.track, playerDriver: me });
  const su = proposte.find((p) => p.leva === 'campo-ai' && p.direzione === 'su');
  assert.ok(!su, 'aiStandard [99,100] già a soffitto: niente rumore');
});

/* ------------ 5. confidenza e convalida (dry) ------------ */
test('confidenza: due gare in tolleranza sulla STESSA pista → ALTA e convalidabile', () => {
  calib.resetCalib();
  const raceOk = () => griglia(
    carAI('M3a', ...AUTO.m3, 161.0),
    carAI('M3b', ...AUTO.m3, 161.2),
    carAI('Supra1', ...AUTO.supra, 161.3),
    carAI('Abarth1', ...AUTO.abarth, 161.5),
    carAI('Abarth2', ...AUTO.abarth, 161.6),
  );
  const brief1 = calib.recordRaceFromResult({ result: raceOk(), track: 'Pista Di Prova Senza Regole' });
  assert.equal(brief1.confidenza, 'media', `una gara in pace: confidenza media (${brief1.confidenza})`);
  const brief2 = calib.recordRaceFromResult({ result: raceOk(), track: 'Pista Di Prova Senza Regole' });
  assert.equal(brief2.confidenza, 'alta', 'due gare in pace: confidenza ALTA');
  const sum = calib.calibSummary();
  const g = sum.gruppi.find((x) => x.classe === 'pi-10-11-moderna' && x.trkKey === 'Pista Di Prova Senza Regole');
  assert.ok(g, 'il gruppo classe+pista esiste nel riepilogo');
  assert.ok(g.suggerisciConvalida, 'confidenza alta senza timbro: suggerisce la convalida');
  const stampOut = calib.appuntaConvalida({ classe: 'pi-10-11-moderna', trkKey: 'Pista Di Prova Senza Regole', dry: true });
  assert.equal(stampOut.applicate.length, 0, '(dry) non scrive niente');
  assert.ok(stampOut.messaggio[0].includes('convalidato: true'));
});

/* ------------ 5b. stessa gara (stesso file) non doppia-registra ------------ */
test('stesso file = stessa gara: il registro non doppia-registra e non gonfia la confidenza', () => {
  calib.resetCalib();
  const raceOk = () => ({
    session: 'race', track: 'Pista Di Prova Senza Regole',
    drivers: [
      { driver_name: '• A', driver_surname: 'M3a', position: 0, car_name: 'M3 E46 CSL', car_brand: 'BMW', best_lap: '2:41.000', laps: 3, total_time: '8:00.000' },
      { driver_name: '• B', driver_surname: 'Abarth1', position: 1, car_name: '695 Biposto', car_brand: 'Abarth', best_lap: '2:41.500', laps: 3, total_time: '8:00.000' },
    ],
  });
  const brief1 = calib.recordRaceFromResult({ result: raceOk(), track: 'Pista Di Prova Senza Regole', sourceFile: 'stessagara.json' });
  const brief2 = calib.recordRaceFromResult({ result: raceOk(), track: 'Pista Di Prova Senza Regole', sourceFile: 'stessagara.json' });
  assert.equal(brief1.confidenza, 'media', 'prima occorrenza: una gara, confidenza media');
  assert.equal(brief2.confidenza, 'media', 'secondo giro sullo STESSO file: NON alza a alta');
  const sum = calib.calibSummary();
  const g = sum.gruppi.find((x) => x.classe === 'pi-10-11-moderna' && x.trkKey === 'Pista Di Prova Senza Regole');
  assert.equal(g?.obs, 1, 'il gruppo deve contare UNA sola osservazione');
});

/* ------------ 5c. autoBase con annotazione tra parentesi e nomi auto con suffissi ------------
// Entrambe le condizioni vere trovate 22/10 su Coppa RX-7 a Paul Ricard: l'autoBase
// del file porte l'annotazione «(base della calibrazione: kg 0 / 0%)» e due modelli
// nel pool hanno i suffissi che EVO scrive nei risultati — ma NON nella regola di classe.
// Con match a stringa esatta la base non si trova e TUTTI i delta per-auto restano null. */
test('autoBase mentita fra parentesi e nomi con suffissi: i delta per-auto esistono comunque', () => {
  // total_time fisicamente coerenti col best (3 giri): la guardia di riga 22/10 scarterebbe
  // una best impossibile (best > media) e qui le gare sono tutte VERE
  const tot3 = (sec) => `${Math.floor((sec * 3 + 2) / 60)}:${String(Math.round((sec * 3 + 2) % 60)).padStart(2, '0')}.000`;
  const aiVera = (n, b, c, s) => ({ ...carAI(n, b, c, s), total_time: tot3(s) });
  const race = griglia(
    aiVera('N1', 'Honda', 'NSX-R 92R', 161.0),
    aiVera('N2', 'Honda', 'NSX-R 92R', 164.1),
    aiVera('S1', 'Honda', 'S2000 AP1', 164.12),
    aiVera('B1', 'Mercedes-Benz', '190E 2.5-16 Evo II', 164.54),   // base mia, annota nel file
    aiVera('M1', 'BMW', 'M3 E30 Sport Evo (Evolution III)', 166.6),  // suffisso NON nella regola
    aiVera('L1', 'Lancia', 'Delta HF integrale Evoluzione II', 170.8), // 'integrale' minuscolo, NON nella regola
  );
  race.track = 'Circuito Paul Ricard';
  const { evento } = calib.analyzeRace(race, { track: race.track });
  assert.equal(evento.classe, 'coppa_mazda-rx7-fd', 'le auto si matchano comunque');
  const base = evento.perAuto.find((r) => r.base);
  assert.ok(base?.auto.includes('190E'), 'la base si riconosce oltre alle annotazioni');
  const nsx = evento.perAuto.find((r) => r.auto.includes('NSX'));
  assert.ok(nsx.deltaVsBaseSec != null && nsx.deltaVsBaseSec < -0.8,
    `NSX sfugge col delta calcolato (non null): ${nsx.deltaVsBaseSec}s`);
  const m3 = evento.perAuto.find((r) => r.auto.includes('M3'));
  assert.ok(m3.deltaVsBaseSec != null, `anche l'M3 col suffisso (Evolution III) ha un delta: ${JSON.stringify(m3)}`);
  const lancia = evento.perAuto.find((r) => r.auto.includes('Delta'));
  assert.ok(lancia.deltaVsBaseSec != null, `anche la Delta con 'Evoluzione II' ha un delta: ${JSON.stringify(lancia)}`);
});

/* ------------ 5d. GUARDIE ANTI-DATI-CORROTTI (lezione 22/10, Paul Ricard 1901/1935) ------------
 * il writer di EVO scrive i best-lap delle AI STORTI: stesso giorni, stesso impianto,
 * lo stesso campo registra best written ×1,15 LENTI (i tre di coda della gara prima)
 * e ×0,87 VELOC (il 19:35: S1/S2 delle AI combacianti le mie a ±0,5 ma S3 da 46,8s dove
 * le mie 67,0, e i totali di gara parlano di un RITMO identico alla gara prima). */
test('guardia di RIGA: best sopra la media dei giri non esistono — la riga esce dalla mediana', () => {
  calib.resetCalib();
  // riga REALE di Paul Ricard 19:01 (Franke, 205 T16): best scritto 2:51.876 con ritmo
  // di gara 149,7 (total 7:28.994 / 3 giri): matematicamente impossibile.
  const race = griglia(
    { ...carAI('corrotto', ...AUTO.m3, 171.876), total_time: '7:28.994' },
    { ...carAI('sano', ...AUTO.m3, 149.5), total_time: '8:00.000' },
    carAI('b1', ...AUTO.abarth, 161.5),
    carAI('b2', ...AUTO.abarth, 161.6),
  );
  const { evento } = calib.analyzeRace(race, { track: 'Pista Di Prova Senza Regole' });
  assert.equal(evento.bestScartati, 1, `la riga impossibile è scartata: ${evento.bestScartati}`);
  const m3 = evento.perAuto.find((r) => r.auto.includes('M3'));
  assert.ok(Math.abs(m3.bestMedSec - 149.5) < 0.01, `la mediana M3 usa SOLO la riga sana: ${m3.bestMedSec}s`);
});

test('guardia di EVENTO: AI con S1/S2 miei e un best lap impossibile → evento scartato, niente proposte', () => {
  calib.resetCalib();
  const me = {
    driver_name: 'Mauro Turbigno', driver_surname: 'Turbigno', position: 0, laps: 3,
    car_name: 'RX-7 FD Spirit R', car_brand: 'Mazda', is_current_driver: true,
    best_lap: bestStr(158.655), total_time: '8:03.761',
    splits: ['00:44.310', '00:47.328', '01:07.017'],
  };
  // le AI COME LE SCRIVE EVO nella gara 19:35: S1/S2 uguali ai miei, best gpu-ina veloce
  const aiFake = (n, sec) => ({
    ...carAI(n, ...AUTO.golf, sec), laps: 3, total_time: '9:29.000',
    splits: ['00:44.361', '00:48.465', '00:46.768'],
  });
  // servono ALMENO due MODELLI affinché la classe si matchi (come la gara vera:
  // il campo non è mai un solo modello)
  const race = griglia(
    me,
    aiFake('f1', 139.594),
    aiFake('f2', 143.058),
    aiFake('f3', 144.323),
    carAI('b1', ...AUTO.abarth, 161.5),
    carAI('b2', ...AUTO.abarth, 161.6),
  );
  race.track = 'Pista Di Prova Senza Regole';
  const meRow = race.drivers.find((d) => d.driver_name === 'Mauro Turbigno');
  const { evento, proposte } = calib.analyzeRace(race, { track: race.track, playerDriver: meRow });
  assert.ok(evento.sospetto, `l'evento è marcato sospetto: ${JSON.stringify(evento.sospetto ?? null, null, 0)}`);
  assert.equal(evento.segnale.tipo, 'dati-sospetti');
  assert.equal(proposte.length, 0, 'nessuna proposta nasce da dati che non si fidano di');
  // e NON contano per la confidenza né per le mediane del riepilogo. Osserva come
  // fa l'import: playerDriver viene passato (senza di lui la guardia di evento non gira)
  const meRow34 = race.drivers.find((d) => d.driver_name === 'Mauro Turbigno');
  calib.recordRaceFromResult({ result: race, track: race.track, sourceFile: 'f35.json', playerDriver: meRow34 });
  calib.recordRaceFromResult({ result: race, track: race.track, sourceFile: 'f35b.json', playerDriver: meRow34 });
  // il gruppo SOLO DI GARE SOSPETTE resta visibile nel riepilogo ma vuoto:
  // obs 0, mediane non calcolabili, confidenza nessuna, scartate dichiarate
  const sum = calib.calibSummary();
  const g = sum.gruppi.find((x) => x.classe === 'pi-10-11-moderna' && x.trkKey === 'Pista Di Prova Senza Regole');
  assert.ok(g, 'il gruppo resta visibile nel riepilogo');
  assert.equal(g.obs, 0, 'le gare sospette NON contano come osservazioni');
  assert.equal(g.scartate, 2, 'le due gare sospette dichiariate come scartate');
  assert.equal(g.confidenza, 'nessuna');
  assert.equal(g.perAuto.length, 0, 'nessuna mediana per-auto da dati che non si fidano di');
});

/* ------------ 7-bis. BILANCIO PERSO (7/11, «sistema di apprendimento»): una gara
 * corsa SENZA le zavorre della serie non è una misura di quelle zavorre. Prima di
 * questa porta l'analisi poteva proporre di AUMENTARE la penalità proprio per
 * colpa della penalità persa (circuito chiuso): la sola guardia dei dati sospetti
 * l'aveva fermata per caso a Donington, il 6/11. */
test('bilancio perso: la gara corsa senza zavorre non propone aumenti e non conta come osservazione', () => {
  calib.resetCalib();
  const corsa = () => griglia(
    carAI('Golf1', ...AUTO.golf, 157.5),
    carAI('Golf2', ...AUTO.golf, 157.6),
    carAI('M3a', ...AUTO.m3, 153.0),
    carAI('M3b', ...AUTO.m3, 153.5),
    carAI('Abarth1', ...AUTO.abarth, 161.49),
    carAI('Abarth2', ...AUTO.abarth, 161.51),
  );
  const race = corsa();
  race.track = 'Pista Di Prova Senza Regole';

  // la prova di non-cecità: senza bilancio la stessa gara PROPONE (M3/Golf sfuggono)
  const senza = calib.analyzeRace(corsa(), { track: race.track });
  assert.ok(senza.proposte.length > 0, `senza il bilancio la gara propone: ${JSON.stringify(senza.proposte.map((p) => p.leva))}`);

  // con il bilancio perso: zero proposte, segnale dedicato, motivo scritto
  const perso = { msg: '⚠  ZAVORRE NON ARRIVATE AL VIA — la gara ha girato senza il bilancio della serie\n    preteso: …' };
  const con = calib.analyzeRace(corsa(), { track: race.track, bilancio: perso });
  assert.equal(con.proposte.length, 0, 'nessuna proposta nasce da una gara corsa senza la zavorra che dovrebbe misurare');
  assert.equal(con.evento.segnale.tipo, 'bilancio-perso');
  assert.match(con.evento.bilancioPerso, /ZAVORRE NON ARRIVATE AL VIA/);

  // registro: due gare col bilancio perso sulla STESSA pista → nessuna osservazione
  calib.recordRaceFromResult({ result: corsa(), track: race.track, sourceFile: 'bp1.json', bilancio: perso });
  calib.recordRaceFromResult({ result: corsa(), track: race.track, sourceFile: 'bp2.json', bilancio: perso });
  const g = calib.calibSummary().gruppi.find((x) => x.classe === 'pi-10-11-moderna' && x.trkKey === 'Pista Di Prova Senza Regole');
  assert.ok(g, 'il gruppo resta visibile nel riepilogo');
  assert.equal(g.obs, 0, 'le gare senza zavorra NON contano come osservazioni');
  assert.equal(g.bilancioPerso, 2, 'le due gare sono dichiarate come bilancio perso');
  assert.equal(g.scartate, 2);
  assert.equal(g.confidenza, 'nessuna');
  assert.equal(g.perAuto.length, 0, 'nessuna mediana per-auto da gare senza la zavorra pretesa');
});

/* ------------ 6. classe sconosciuta ------------ */
test('classe sconosciuta: nessun evento, nessun rumore', () => {
  calib.resetCalib();
  const noto = griglia(
    carAI('Q1', 'Fantamarchi', 'Supercar X', 101.0),
    carAI('Q2', 'Fantamarchi', 'Supercar Y', 101.5),
  );
  noto.track = 'X';
  const { evento } = calib.analyzeRace(noto, { track: 'X' });
  assert.equal(evento.classe, null, 'le auto senza classe non inventano una classe');
  const brief = calib.recordRaceFromResult({ result: noto, track: 'X' });
  assert.ok(brief === null || brief.classe == null, 'la classe sconosciuta NON produce proposte');
});

/* ------------ 7. IL VERIFICATORE DELLE REGOLE DELL'APP (27/10): regole fonte:'app'
 * NON le ha costruite nessuna gara — le gare vere le CONVALIDANO. Nel riepilogo
 * ogni regola dell'app porta l'esito dalle misure reali per-auto:
 * confermata (entro tolleranza dalla base) / sballata (oltre) / da corse.
 * Test sul file classi TEMPORANEO del test (come gli altri: mai il data/ vero). */
test('regole fonte app nel riepilogo: confermata, sballata e da corse dall\'esito delle misure', () => {
  calib.resetCalib();
  // misura reale: M3 ~8s più veloce della base, Mini a parità (±0.8), nessun T16
  const race = griglia(
    carAI('Golf1', ...AUTO.golf, 157.5),
    carAI('M3a', ...AUTO.m3, 153.0),
    carAI('M3b', ...AUTO.m3, 153.5),
    carAI('Mini1', ...AUTO.mini, 161.55),
    carAI('Abarth1', ...AUTO.abarth, 161.49),
    carAI('Abarth2', ...AUTO.abarth, 161.51),
  );
  race.track = 'Pista Di Prova Senza Regole';
  calib.recordRaceFromResult({ result: race, track: race.track, sourceFile: 'pad-verifica.json' });   // patch del file classi TEMPORANEO: tre regole dell'app — due che girano in
  // pista e una mai corsa. Al termine il file torna la fixture INTATTA (test.after
  // cancella tutto: gli altri test la richiedono pulita al 24/10).
  const classes = JSON.parse(readFileSync(CLASSES_TMP, 'utf8'));
  classes.classi['pi-10-11-moderna'].regole.push(     { preset: 'preset_aptest_sballata', auto: 'BMW M3 E46 CSL', ballastKg: 100, restrictorPct: 4, fonte: 'app' },     { preset: 'preset_aptest_conferma', auto: 'Mini John Cooper S', ballastKg: 100, restrictorPct: 2, fonte: 'app' },     { preset: 'preset_aptest_dacorse', auto: 'Peugeot 205 T16', ballastKg: 0, restrictorPct: 5, fonte: 'app' },
  );
  writeFileSync(CLASSES_TMP, JSON.stringify(classes, null, 2));
  try {
    const sum = calib.calibSummary();
    const g = sum.gruppi.find((x) => x.classe === 'pi-10-11-moderna');     assert.ok(g?.app?.length === 3, `le tre regole dell'app sono nel riepilogo: ${JSON.stringify(g?.app)}`);     const m3 = g.app.find((p) => p.auto.includes('M3'));
    assert.equal(m3.esito, 'sballata', `M3 spalancata a ~8s dalla base: ${JSON.stringify(m3)}`);
    assert.ok(m3.medSec != null && m3.medSec <= -1, `il delta misurato c'è: ${m3.medSec}s`);     const mini = g.app.find((p) => p.auto.includes('Mini'));
    assert.equal(mini.esito, 'confermata', `Mini a parità di base: ${JSON.stringify(mini)}`);     const t16 = g.app.find((p) => p.auto.includes('T16'));
    assert.equal(t16.esito, 'da corse', 'T16 mai corsa: in attesa, non una misurazione inventata');
  } finally {
    // la fixture torna INTATTA per i test successivi (e il memo invalidato da mtime)
    copyFileSync(SAMPLE, CLASSES_TMP);
  }
});

/* ------------ 7-ter. LA CATEGORIA VIENE DALLA SERIE, NON DALLA GRIGLIA (7/11).
 * Mauro: «vanno escluse anche le gare di categoria diverse tipo le endurance,
 * gt1+gt2+gt3 etc». Il match sui SOLI nomi della gara ha già sbagliato in vero:
 * una gara del nodo «GT3 Endurance» corsa con le stradali è finita nella classe
 * coppa_mazda-rx7-fd, e la Coppa MX-5 (monomarca) nel «Campionato Moderno».
 * Qui si passa la serie (nodo + parco del ladder): se la gara non corre quelle
 * auto, o la serie è a modello unico, la gara non insegna — né proposte né obs. */
const GT3_ENDURANCE = ['Ferrari 296 GT3', 'BMW M4 GT3', 'Porsche 911 GT3 R Rennsport'];

test('gara di un\'altra categoria (serie GT3 corsa con le stradali): fuori dal calcolo', () => {
  calib.resetCalib();
  const corsa = () => griglia(
    carAI('Golf1', ...AUTO.golf, 157.5),
    carAI('Golf2', ...AUTO.golf, 157.6),
    carAI('M3a', ...AUTO.m3, 153.0),
    carAI('M3b', ...AUTO.m3, 153.5),
    carAI('Abarth1', ...AUTO.abarth, 161.49),
    carAI('Abarth2', ...AUTO.abarth, 161.51),
  );
  // la prova di non-cecità: sui SOLI nomi la stessa gara entra in pi-10-11-moderna e propone
  const senza = calib.analyzeRace(corsa());
  assert.equal(senza.evento.classe, 'pi-10-11-moderna');
  assert.ok(senza.proposte.length > 0, `senza la serie la gara propone: ${JSON.stringify(senza.proposte.map((p) => p.leva))}`);

  // con la serie: le auto in pista non sono quelle della GT3 Endurance → niente da imparare
  const con = calib.analyzeRace(corsa(), { serie: 'GT3 Endurance', serieAuto: GT3_ENDURANCE });
  assert.equal(con.proposte.length, 0);
  assert.equal(con.evento.segnale.tipo, 'categoria-diversa');
  assert.equal(con.evento.classe, null, 'una gara di un\'altra categoria non si attribuisce a una classe');
  assert.equal(con.evento.serie, 'GT3 Endurance');
  assert.match(con.evento.categoriaDiversa ?? '', /categoria diversa/);

  // registro: l'evento è scritto (trasparenza) ma fuori da gruppi, obs e mediane
  calib.recordRaceFromResult({ result: corsa(), sourceFile: 'gt3-1.json', serie: 'GT3 Endurance', serieAuto: GT3_ENDURANCE });
  const sum = calib.calibSummary();
  assert.equal(sum.gruppi.length, 0, 'nessun gruppo classe+pista nasce da una gara di un\'altra categoria');
  assert.equal(sum.fuoriSerie.categoriaDiversa, 1, 'la gara è dichiarata fuori serie nel riepilogo');
});

test('serie a modello unico: non c\'è bilanciamento di classe da imparare', () => {
  calib.resetCalib();
  const corsa = () => griglia(
    carAI('Mx1', 'Mazda', 'MX-5 ND Cup', 160.2),
    carAI('Mx2', 'Mazda', 'MX-5 ND Cup', 160.4),
    carAI('Mx3', 'Mazda', 'MX-5 ND Cup', 160.5),
  );
  const con = calib.analyzeRace(corsa(), { serie: 'Coppa Mazda MX-5 ND Cup', serieAuto: ['Mazda MX-5 ND Cup'] });
  assert.equal(con.proposte.length, 0);
  assert.equal(con.evento.segnale.tipo, 'serie-monomarca');
  assert.match(con.evento.serieMonomarca ?? '', /modello unico/);
  calib.recordRaceFromResult({ result: corsa(), sourceFile: 'mx5-1.json', serie: 'Coppa Mazda MX-5 ND Cup', serieAuto: ['Mazda MX-5 ND Cup'] });
  const sum = calib.calibSummary();
  assert.equal(sum.gruppi.length, 0, 'il monomarca non entra in nessun gruppo classe+pista');
  assert.equal(sum.fuoriSerie.monomarca, 1);
});

test('la classe si sceglie dal PARCO della serie: la più precisa, non quella che copre la griglia', () => {
  calib.resetCalib();
  // la classe Coppa Strada 80 esiste nel data/ vero ma non nella fixture del 24/10:
  // si aggiunge qui, e si ripristina la fixture alla fine (come il test 7)
  const classes = JSON.parse(readFileSync(CLASSES_TMP, 'utf8'));
  classes.classi.coppa_strada_80 = {
    regole: [
      { preset: 'preset_r5', auto: 'Renault 5 GT Turbo', ballastKg: 0, restrictorPct: 0 },
      { preset: 'preset_cosworth', auto: 'Ford Escort RS Cosworth', ballastKg: 100, restrictorPct: 8 },
    ],
  };
  writeFileSync(CLASSES_TMP, JSON.stringify(classes, null, 2));
  try {
    // griglia reale di Brands Hatch: Coppa Strada + UNA GR86 estranea (così era)
    const corsa = () => griglia(
      carAI('R1', 'Renault', '5 GT Turbo', 100.0),
      carAI('R2', 'Renault', '5 GT Turbo', 100.4),
      carAI('E1', 'Ford', 'Escort RS Cosworth', 98.0),
      carAI('E2', 'Ford', 'Escort RS Cosworth', 98.3),
      carAI('G1', 'Toyota', 'GR86 Standard', 96.0),
    );
    // con la serie (R5 + Escort Cosworth) la classe è quella che ne copre il parco
    // PER INTERO: la GR86 capitata in griglia non sposta l'attribuzione
    const con = calib.analyzeRace(corsa(), { serie: 'Coppa Strada', serieAuto: ['Renault 5 GT Turbo', 'Ford Escort RS Cosworth'] });
    assert.equal(con.evento.classe, 'coppa_strada_80', `la classe deve venire dal parco della serie: ${con.evento.classe}`);
    assert.equal(con.evento.serie, 'Coppa Strada');

    // una serie coperta SOLO A METÀ (GT86 Cup: GR86 + AE86, e l'AE86 non è in nessuna
    // classe) non si attribuisce per forza alla classe larga che prende la GR86:
    // la griglia è quella vera della serie (coerente), è la CLASSE che non la copre
    const gt86corsa = () => griglia(
      carAI('A1', 'Toyota', 'GR86 Standard', 100.0),
      carAI('A2', 'Toyota', 'GR86 Standard', 100.3),
      carAI('B1', 'Toyota', 'AE86 Sprinter Trueno', 104.0),
      carAI('B2', 'Toyota', 'AE86 Sprinter Trueno', 104.2),
    );
    const gt86 = calib.analyzeRace(gt86corsa(), { serie: 'GT86 Cup', serieAuto: ['Toyota GR86', 'Toyota AE86 Sprinter Trueno'] });
    assert.equal(gt86.proposte.length, 0);
    assert.equal(gt86.evento.segnale.tipo, 'serie-senza-classe');
    assert.match(gt86.evento.serieSenzaClasse ?? '', /nessuna classe/);
  } finally {
    copyFileSync(SAMPLE, CLASSES_TMP);
  }
});
