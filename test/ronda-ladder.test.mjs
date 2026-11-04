/* ronda-ladder.test.mjs — la logica PURA del prepara-ronda (2/11): nessuna
   scrittura di file, solo i piani che escono dalla ladder veri del progetto.
   Scene:
     • griglia: nodo monomarca (una serie monomarca) → AUTOMATIC;
       nodo multiclasse (Campionato Aperto) → CUSTOM con gridSize − 1;
       l'override --singlemake gira la mano dell'operatore;
     • orari del calendario: la gara all'ora del calendario, Practice un'ora
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

test('orari del calendario: gara all\'ora del calendario, sessioni schierate prima', () => {
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
