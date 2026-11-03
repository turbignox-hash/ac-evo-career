/* ronda-ladder.test.mjs — la logica PURA del prepara-ronda (2/11): nessuna
   scrittura di file, solo i piani che escono dalla ladder veri del progetto.
   Scene:
     • griglia: nodo monomarca (Coppa Abarth di Paddock) → AUTOMATIC;
       nodo multiclasse (Campionato Aperto) → CUSTOM con gridSize − 1;
       l'override --singlemake gira la mano dell'operatore;
     • orari di Paddock: la gara all'ora del calendario, Practice un'ora
       prima, Qualifying/Warmup schierati nei minuti che la precedono;
     • meteo: l'indice della LADDER (weatherNames 0 Clear…5 Heavy rain) va
       TRADOTTO alla scala PRESETS di weather.mjs — NON coincidono da 3 in su
       (ladder 3 = "Light rain" ma Light rain è il preset 4; ladder 5 =
       "Heavy rain" ma heavy è il preset 6). Fuori scala → Sereno con spia;
     • auto: l'engine-id ladder (ks_datsun_240z_fairlady) si spoglia in nome
       a parole per cercare nel dizionario del garage;
     • trovaronda: so l'attiva (lettura sola) combacia con st.node/st.round
       del save, e le override del CLI correggono il calendario al volo. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// LA LEZIONE DEL 2/11 (18:56 e 19:17, due volte): senza EVO_DATA_DIR, SAVE_FILE
// di webui-env indica il SAVE VERO del PC e il save-finto qui sotto lo
// SOVRASCRIVEVA — la carriera di Mauro ridotta a 9 campi. Il save-finto va nel
// sandbox: EVO_DATA_DIR PRIMA di caricare webui-env (che legge l'env a
// import-time). ATTENZIONE: gli import statici vengono INNALZATI da ESM — anche
// scritti dopo process.env girano PRIMA — quindi qui i modulei col SAVE_FILE
// si caricano con await import DOPO la messa in sandbox (stessa regola di
// testday-margine e grid-calib.test.mjs).
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'ronda-ladder-'));
process.env.ACE_SLOT = '1';
// il journal pd-calendar del test è FIFA NELLA SUA CARTELLA (APP_JOURNAL_DIR):
// sennò il test leggerebbe i journal VERI di Mauro (lezione del ponte del 2/11:
// i test in sandbox non toccano MAI i dati reali). Il match della serie la fa
// l'AUTO del calendario contro le auto del nodo, quindi il fake porta
// «Mazda MX-5 ND Cup» e i test che usano il nodo campionato_aperto (série
// differente) restano sulla ladder.
process.env.APP_JOURNAL_DIR = mkdtempSync(join(tmpdir(), 'ronda-pd-'));
writeFileSync(join(process.env.APP_JOURNAL_DIR, 'pd-calendar-test.json'), JSON.stringify({
  series: 'Mazda MX-5 Cup', car: 'Mazda MX-5 ND Cup', season: 2, status: 'attiva',
  standings: [],
  rounds: [
    { n: 1, track: 'Donington Park', layout: 'National', laps: 3, time: '18:00', weather: 'Pioggerella', state: 'next' },
    { n: 2, track: 'Brands Hatch', layout: 'Indy', laps: 3, time: '13:30', weather: 'Sereno', state: 'todo' },
    { n: 3, track: 'Oulton Park', layout: 'Fosters', laps: 3, time: '17:00', weather: 'Nuvoloso', state: 'todo' },
  ],
}));
const { SAVE_FILE } = await import('../src/webui-env.mjs');
const { pianoGriglia, autoRonda, meteoRonda, pianoOrari, trovaRonda } = await import('../tools/ronda-ladder.mjs');

// tra le vasche del test la carriera FUNZIA FINTA: uno state minimo col nodo
// attivo della ladder vera (la stessa che ammo da Mauro nel save reale).
try {
  mkdirSync(dirname(SAVE_FILE), { recursive: true });
  writeFileSync(SAVE_FILE, JSON.stringify({
    version: 1, driver: { first: 'Pip', last: 'Sperone', name: 'Pip Sperone' },
    money: 1000, messages: [], node: 'campionato_aperto', round: 0,
  }));
} catch { /* se il sandbox non lo serve, si va col save reale */ }

const MONOMARCA = { cars: ['ks_abarth_695_biposto'], gridSize: 14 };
const MULTICLASSE = {
  cars: ['ks_datsun_240z_fairlady', 'ks_alfa_romeo_75_turbo_evo', 'ks_ford_escort_rs_cosworth'],
  gridSize: 14,
};
const SINGLE = { cars: ['abarth_695'], gridSize: 18 };

test('griglia: monomarca → AUTOMATIC', () => {
  const p = pianoGriglia(MONOMARCA);
  assert.equal(p.mode, 'automatic');
  assert.equal(p.count, null);
  assert.equal(p.mono, true);
});

test('griglia: multiclasse → CUSTOM con gridSize − 1 avversari', () => {
  const p = pianoGriglia(MULTICLASSE);
  assert.equal(p.mode, 'custom');
  assert.equal(p.count, 13);
  assert.equal(p.mono, false);
});

test('griglia: --singlemake on/spente la mano dell\'operatore', () => {
  assert.equal(pianoGriglia(MULTICLASSE, 'on').mode, 'automatic');
  assert.equal(pianoGriglia(MONOMARCA, 'off').mode, 'custom');
  assert.equal(pianoGriglia(MONOMARCA, 'off').count, 13);   // gridSize − 1 anche qui
  assert.equal(pianoGriglia(SINGLE, 'off').count, 17);     // gridSize 18 → 17 avversari
});

test('auto: l\'engine-id ladder spogliato delle underscore', () => {
  assert.equal(autoRonda({ cars: ['ks_abarth_695_biposto'] }), 'abarth 695 biposto');
  assert.equal(autoRonda({ cars: ['ks_datsun_240z_fairlady'] }), 'datsun 240z fairlady');
  assert.equal(autoRonda(MULTICLASSE, { car: 'Alfa 75 Turbo Evo' }), 'Alfa 75 Turbo Evo');
  assert.equal(autoRonda({ cars: [] }), null);
});

test('meteo: l\'indice LADDER tradotto alla scala PRESETS — NON coincidono da 3 in su', () => {
  // lezione weather.mjs (audit 1/11): prima qui si credeva «l'indice ladder È
  // l'id dei PRESETS» e una ronda bagnata leggera il meteo la diventava
  // «Coperto» (preset 3): il test faceva DA CAVALLO al bug. Adesso: 3→Pioggia
  // leggera (preset 4), 5→Pioggia intensa (preset 6), Overcast→Nuvoloso (2).
  assert.deepEqual({ label: meteoRonda({ weather: 0 }).label, spia: meteoRonda({ weather: 0 }).spia }, { label: 'Sereno', spia: false });
  assert.equal(meteoRonda({ weather: 3 }).label, 'Pioggia leggera');
  assert.equal(meteoRonda({ weather: 5 }).label, 'Pioggia intensa');   // NON «Pioggia»
  assert.equal(meteoRonda({ weather: 2 }).id, 2);
  const fuori = meteoRonda({ weather: 99 });
  assert.equal(fuori.label, 'Sereno');
  assert.equal(fuori.spia, true);
});

test('orari di Paddock: gara all\'ora del calendario, sessioni schierate prima', () => {
  const ops = pianoOrari({ hour: 13 });
  assert.deepEqual(ops.sessions.Race, { hour: 13, minute: 0 });
  assert.deepEqual(ops.sessions.Practice, { durationSec: 900, hour: 12, minute: 0 });
  assert.deepEqual(ops.sessions.Qualifying, { durationSec: 600, hour: 12, minute: 50 });
  assert.deepEqual(ops.sessions.Warmup, { durationSec: 300, hour: 12, minute: 55 });
  // durata custom del CLI
  const ops2 = pianoOrari({ hour: 15 }, { practiceMin: 10 });
  assert.equal(ops2.sessions.Practice.durationSec, 600);
  // ora mancante → ripiego gentile a 14
  assert.equal(pianoOrari({}).sessions.Race.hour, 14);
});

test('trovaRonda: so l\'attiva dal save e accetta le override CLI', () => {
  const r = trovaRonda();
  assert.equal(r.nodeId, 'campionato_aperto');   // nel save-finto della sandbox (o il vero, che su lì sta)
  assert.equal(r.entry.track, 'monza');          // ronda 0 del calendario ladder vero
  const r2 = trovaRonda({ track: 'brands_hatch', laps: 5, hour: 9, weather: 5 });
  assert.equal(r2.entry.track, 'brands_hatch');
  assert.equal(r2.entry.laps, 5);
  assert.equal(r2.entry.hour, 9);
  assert.equal(r2.entry.weather, 5);
});

/* ---------- IL CERCHIO (2/11): la ronda la dice il pd-calendar ---------- */
const { stessaSerie, meteoPdIndex, trackIdDaNome, specOverridePerRonda } = await import('../tools/ronda-ladder.mjs');

// il nodo attivo del save reale di Mauro: il Trofeo MX-5 ha la serie SEMINATA
// nel calendario del GIOCO (stessa tabella delle ronde, layout compresi)
const MX5 = { display: 'Trofeo MX-5', cars: ['ks_mazda_mx5_na', 'ks_mazda_mx5_nd_cup'] };
const CAL = { series: 'Mazda MX-5 Cup', car: 'Mazda MX-5 ND Cup' };

test('pd-calendar: la serie combacia per AUTO, non solo per nome display', () => {
  assert.equal(stessaSerie(MX5, CAL), true);                             // ND Cup del calendario È nel nodo
  // il nodo MONO-NA non prende le gare della serie ND Cup: l'auto del calendario
  // non è tra le sue E il nome display non combacia
  assert.equal(stessaSerie({ cars: ['ks_mazda_mx5_na'], display: 'Trofeo MX-5 NA' }, CAL), false);
  assert.equal(stessaSerie({ display: 'Trofeo MX-5', cars: [] }, CAL), false);
  assert.equal(stessaSerie({ cars: ['x'], display: 'Mazda MX-5 Cup' }, CAL), true);   // nome display combacia
  assert.equal(stessaSerie(MULTICLASSE, CAL), false);                    // la serie datsun/alfa/escort non è la Mazda Cup
});

test('pd-calendar: il meteo a PAROLE del gioco → DUE idi (LADDER e PRESETS)', () => {
  // UNA verità, DUE formati: id = scala LADDER (weatherNames 0..5, per
  // round.weather e i template griglia), idPreset = scala PRESETS di
  // weather.mjs (0..6, per setWeatherPreset). ATTENZIONE: NON coincidono da
  // 3 in su («Coperto» nella scala EVO preset è il 3 ma nella LADDER resta
  // Overcast = 2; «Pioggerella» ladder 3, preset 4).
  const tabelle = [
    // [parola, idLADDER, idPreset]
    ['Sereno', 0, 0], ['Parzialmente nuvoloso', 1, 1], ['Nuvoloso', 2, 2],
    ['Coperto', 2, 3], ['Pioggerella', 3, 4], ['Pioggia', 4, 5],
    ['Pioggia battente', 5, 6], ['Temporale', 5, 6],
  ];
  for (const [nome, id, idPreset] of tabelle) {
    assert.equal(meteoPdIndex(nome).id, id, `${nome} (ladder)`);
    assert.equal(meteoPdIndex(nome).idPreset, idPreset, `${nome} (preset)`);
  }
  const strano = meteoPdIndex('Nebbia a zuppa');
  assert.equal(strano.id, null);         // parola ignota → NULL: il meteo NON si inventa
  assert.equal(strano.idPreset, null);   //        (né «Sereno» forzato per difetto)
  assert.equal(strano.spia, null);
});

test('pd-calendar: dal nome display del giornal all\'id del libro', () => {
  assert.equal(trackIdDaNome('Donington Park'), 'donington_park');
  assert.equal(trackIdDaNome('donington_park'), 'donington_park');   // già un id: torna se stesso
  assert.equal(trackIdDaNome('pista inventata'), null);
});

test('pd-calendar: il layout → tag/layout + pitSlots/lunghezza del catalogo', () => {
  // i valori del catalogo del server dedicato (National Race 3149 m, slot 19)
  assert.deepEqual(specOverridePerRonda({ track: 'donington_park', layout: 'National' }),
    { tag: 'National', layout: 'National Race', lengthM: 3149, pitSlots: 19 });
  // Oulton Fosters: il catalogo è l'unica fonte (2662 m; il libro dice 4.020 km)
  assert.deepEqual(specOverridePerRonda({ track: 'oulton_park', layout: 'Fosters' }),
    { tag: 'Fosters', layout: 'Fosters Race', lengthM: 2662, pitSlots: 16 });
  // layout NON nel catalogo: tag/layout con la regola, il resto resta alla specFor
  assert.deepEqual(specOverridePerRonda({ track: 'imola', layout: 'GP' }),
    { tag: 'GP', layout: 'GP Race' });
  // senza layout: niente override (la ladder com'era prima del cerchio)
  assert.deepEqual(specOverridePerRonda({ track: 'monza' }), {});
});

test('pd-calendar: trovaRonda adotta la ronda «next» del GIOCO', () => {
  const r = trovaRonda({ nodeId: 'trofeo_mx5' });
  // la ladder per la ronda 0 diceva mount_panorama; il pd-calendar del gioco
  // dice Donington Park NATIONAL: è LUI la ronda attiva (lezione del cerchio)
  assert.equal(r.entry.track, 'donington_park');
  assert.equal(r.entry.layout, 'National');
  assert.equal(r.entry.laps, 3);
  assert.equal(r.entry.hour, 18);
  assert.equal(r.entry.minute, 0);
  assert.equal(r.entry.weather, 3);                 // «Pioggerella» → indice LADDER 3
                                                    // (preset 4: la traduzione la fa meteoRonda)
  assert.equal(r.entry.pd?.n, 1);
  assert.equal(r.entry.pd?.serie, 'Mazda MX-5 Cup');
  assert.equal(r.entry.pd?.weather, 'Pioggerella');  // la parola ORIGINALE del calendario
  assert.equal(r.entry.pd?.time, '18:00');
  assert.equal(r.ronda, 0);
  assert.ok(r.ronda_nome.includes('Donington Park'));
});

test('pd-calendar: l\'override a mano della pista perde il layout', () => {
  const r = trovaRonda({ nodeId: 'trofeo_mx5', track: 'monza' });
  assert.equal(r.entry.track, 'monza');
  assert.equal(r.entry.layout, null);               // layout della ronda letta non vale più
  assert.equal(r.entry.pd, undefined);
  const r2 = trovaRonda({ nodeId: 'trofeo_mx5', round: 2 });   // round a mano → ladder
  assert.equal(r2.entry.track, 'monza');            // ronda 2 del calendario ladder del trofeo
  assert.equal(r2.entry.pd, undefined);
});

test('orari col MEZZ\'ORA del pd-calendar: la GARA prende i minuti veri', () => {
  const ops = pianoOrari({ hour: 13, minute: 30 });
  assert.deepEqual(ops.sessions.Race, { hour: 13, minute: 30 });
  // le sessioni prima restano a MINUTI FISSI nell'ora della partenza
  assert.deepEqual(ops.sessions.Warmup, { durationSec: 300, hour: 12, minute: 55 });
  assert.deepEqual(ops.sessions.Qualifying, { durationSec: 600, hour: 12, minute: 50 });
  assert.deepEqual(ops.sessions.Practice, { durationSec: 900, hour: 12, minute: 0 });
});

test('specFor: l\'override esplicito vince ANCHE sui TRACK_SPECIALS', async () => {
  const setTrack = await import('../tools/set-track.mjs');
  // Oulton Park è pista SPECIAL (International): col layout del pd-calendar
  // Fosters sono tag e layout CONQ forse Fosters ad essere scritti
  const s = setTrack.specFor('Oulton Park', { tag: 'Fosters', layout: 'Fosters Race', lengthM: 2662, pitSlots: 16 });
  assert.equal(s.tag, 'Fosters');
  assert.equal(s.layout, 'Fosters Race');
  assert.equal(s.lengthM, 2662);
  assert.equal(s.pitSlots, 16);
  // senza over: i SPECIALS restano il ripiego (comportamento di prima)
  assert.equal(setTrack.specFor('Oulton Park')?.tag, 'International');
});
