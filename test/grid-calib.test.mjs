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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP = mkdtempSync(join(tmpdir(), 'calib-test-'));
process.env.EVO_DATA_DIR = TMP;   // PRIMA dell'import: grid-calib legge l'env

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
  const [lo, hi] = campo.a.split('-').map(Number);
  const [oldLo, oldHi] = campo.da.split('-').map(Number);
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
