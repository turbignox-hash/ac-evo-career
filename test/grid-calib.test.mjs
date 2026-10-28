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
  assert.ok(golf.comando.includes('--rule') && golf.comando.includes('Volkswagen Golf 8 GTI'), `comando pronto: ${golf.comando}`);
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

/* ------------ 7. IL VERIFICATORE DI PADDOCK (27/10): le regole fonte:'paddock'
 * NON le ha costruite nessuna gara — le gare vere le CONVALIDANO. Nel riepilogo
 * ogni regola paddock porta l'esito dalle misure reali per-auto:
 * confermata (entro tolleranza dalla base) / sballata (oltre) / da corse.
 * Test sul file classi TEMPORANEO del test (come gli altri: mai il data/ vero). */
test('regole fonte paddock nel riepilogo: confermata, sballata e da corse dall\'esito delle misure', () => {
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
  calib.recordRaceFromResult({ result: race, track: race.track, sourceFile: 'pad-verifica.json' });
  // patch del file classi TEMPORANEO: tre regole paddock — due che girano in
  // pista e una mai corsa. Al termine il file torna la fixture INTATTA (test.after
  // cancella tutto: gli altri test la richiedono pulita al 24/10).
  const classes = JSON.parse(readFileSync(CLASSES_TMP, 'utf8'));
  classes.classi['pi-10-11-moderna'].regole.push(
    { preset: 'preset_padtest_sballata', auto: 'BMW M3 E46 CSL', ballastKg: 100, restrictorPct: 4, fonte: 'paddock' },
    { preset: 'preset_padtest_conferma', auto: 'Mini John Cooper S', ballastKg: 100, restrictorPct: 2, fonte: 'paddock' },
    { preset: 'preset_padtest_dacorse', auto: 'Peugeot 205 T16', ballastKg: 0, restrictorPct: 5, fonte: 'paddock' },
  );
  writeFileSync(CLASSES_TMP, JSON.stringify(classes, null, 2));
  try {
    const sum = calib.calibSummary();
    const g = sum.gruppi.find((x) => x.classe === 'pi-10-11-moderna');
    assert.ok(g?.paddock?.length === 3, `le tre regole paddock sono nel riepilogo: ${JSON.stringify(g?.paddock)}`);
    const m3 = g.paddock.find((p) => p.auto.includes('M3'));
    assert.equal(m3.esito, 'sballata', `M3 spalancata a ~8s dalla base: ${JSON.stringify(m3)}`);
    assert.ok(m3.medSec != null && m3.medSec <= -1, `il delta misurato c'è: ${m3.medSec}s`);
    const mini = g.paddock.find((p) => p.auto.includes('Mini'));
    assert.equal(mini.esito, 'confermata', `Mini a parità di base: ${JSON.stringify(mini)}`);
    const t16 = g.paddock.find((p) => p.auto.includes('T16'));
    assert.equal(t16.esito, 'da corse', 'T16 mai corsa: in attesa, non una misurazione inventata');
  } finally {
    // la fixture torna INTATTA per i test successivi (e il memo invalidato da mtime)
    copyFileSync(SAMPLE, CLASSES_TMP);
  }
});
