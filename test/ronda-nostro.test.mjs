/* ronda-nostro.test.mjs — IL GENERATORE DI ROUND DEL «PADDOCK NOSTRO»
   (3/11, richiesta Mauro: «dal ladder, crea il weekend nativo con giri e
   traccia della ronda da girare, senza dipendere dal catalogo dell'exe del
   Paddock»).

   La prova centrale qui è una TRAPPOLA INTENZIONALE: nella sandbox il
   journal dell'exe (pd-calendar) porta una serie che COMBACIA col nodo
   attivo (stessaSerie vero per costruzione) e una ronda «next» DIVERSA da
   quella della ladder (Brands Hatch Indy, 9 giri, ore 20, pioggia battente).
   Se il generatore bevesse dal catalogo dell'exe anche SOLO una volta, la
   traccia registrerebbe Brands Hatch e il test muore. Il generatore vero
   beve dalla LADDER: ronda 2 del Trofeo MX-5 = Monza, 3 giri, ore 16,
   meteo ladder 3 («Pioggia leggera», preset 4).

   Scene su SANDBOX ACE_GAME_SAVEDIR + EVO_DATA_DIR + APP_JOURNAL_DIR (quelle
   stesse regole dei test del seminatore e del 2/11: env PRIMA degli import);
   il PC vergine non ha NESSUN file di gioco: il nativo deve nascere dal
   campione catturato (data/ricette/campionato/) e la succ sessione NON
   risemina. La traccia finisce accanto al save con lo slot del mirror. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// LA SANDBOX PRIMA DELL'IMPORT: le costanti dei tool leggono le env a import-time.
process.env.ACE_GAME_SAVEDIR = mkdtempSync(join(tmpdir(), 'ronda-nostro-gio-'));
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'ronda-nostro-dat-'));
process.env.ACE_SLOT = '1';
// IL CATALOGO DELL'EXE COME TRAPPOLA: un pd-calendar che userebbe QUALSIASI
// consumatore del cerchio, con la serie del nodo e la ronda sbagliata.
process.env.APP_JOURNAL_DIR = mkdtempSync(join(tmpdir(), 'ronda-nostro-pd-'));
writeFileSync(join(process.env.APP_JOURNAL_DIR, 'pd-calendar-trappola.json'), JSON.stringify({
  series: 'Trofeo MX-5', car: 'Mazda MX-5 ND Cup', season: 9, status: 'attiva',
  standings: [],
  rounds: [
    { n: 1, track: 'Brands Hatch', layout: 'Indy', laps: 9, time: '20:00', weather: 'Pioggia battente', state: 'next' },
    { n: 2, track: 'Donington Park', layout: 'International', laps: 9, time: '20:30', weather: 'Sereno', state: 'todo' },
  ],
}));

const { SAVE_FILE } = await import('../src/webui-env.mjs');
const { generaRondaNostro, leggiTraccia, tracciaPathForSave, scriviTraccia, luoDelPc } =
  await import('../tools/ronda-nostro.mjs');
const { WEEKEND_FILE, currentWeekendTrack } = await import('../tools/set-track.mjs');
const { sessionsOf } = await import('../tools/weekend-laps.mjs');
const { leggiPresetLgm, caricaCampione, RICETTA } = await import('../tools/semina-campionato.mjs');
const { TRACK_INFO } = await import('../src/tracks.mjs');

// il save della sandbox: Trofeo MX-5, ronda 2 (la TERZA del calendario ladder)
const scriviSave = (round) => {
  try {
    writeFileSync(SAVE_FILE, JSON.stringify({
      version: 1, driver: { first: 'Pip', last: 'Sperone', name: 'Pip Sperone' },
      money: 1000, messages: [], node: 'trofeo_mx5', round,
    }));
  } catch { /* la data dir esiste già */ }
};
scriviSave(2);

// il campione deve essere in casa (ci sta già, catturato il 2/11 con la lanciata vera)
test('il campione è in casa: quattro protobuf della lanciata vera per il nativo', () => {
  const c = caricaCampione();
  for (const r of RICETTA) assert.ok(c[r.chiave]?.length > 200, r.chiave + ': campione assente — catturalo con --inventa.');
});

test('PC vergine: il nativo nasce dal campione e la ronda arriva DALLA LADDER (la trappola dell\'exe non beve)', async () => {
  assert.ok(!existsSync(WEEKEND_FILE), 'il PC vergine non deve avere già il weekend');
  const res = await generaRondaNostro({ skip: ['auto'], force: true });

  // la semina: i QUATTRO protobuf, esattamente dal campione
  assert.equal(res.semina.scritti.length, 4, 'sul vergine il campione si scrive tutto');
  for (const r of RICETTA) assert.ok(existsSync(join(process.env.ACE_GAME_SAVEDIR, r.dest)), r.chiave + ': mancante');

  // la ronda dalla LADDER: ronda 2 del trofeo_mx5, NON la «next» della trappola
  assert.equal(res.node, 'trofeo_mx5');
  assert.equal(res.ronda, 2);
  assert.equal(res.entry.track, 'monza');
  assert.equal(res.entry.laps, 3);
  assert.equal(res.entry.hour, 16);
  assert.ok(res.entry.minute == null || res.entry.minute === 0, 'la ladder porta solo l\'ora tonda: i minuti li mette il piano orari a 0');
  assert.equal(res.entry.pd, undefined, 'il generatore non porta il timbro del pd-calendar');

  // il Luo nato col METEO della ronda (ladder 3 → preset 4 «Pioggia leggera»)
  assert.equal(leggiPresetLgm(readFileSync(luoDelPc())), 4, 'meteo del Luo = preset della LADDER');

  // pista viva e giri
  const pista = currentWeekendTrack();
  assert.equal(String(pista?.name ?? pista), TRACK_INFO.monza.name, 'la traccia della ronda è quella della ladder');
  const race = sessionsOf(readFileSync(WEEKEND_FILE)).find((s) => s.nome === 'Race');
  assert.equal(race.giri, 3, 'i giri gara sono quelli del calendario ladder');

  // la traccia della ronda, accanto al save con lo slot del mirror
  assert.equal(tracciaPathForSave().replace(process.env.EVO_DATA_DIR, ''), '\\evo-ronda-nostro.json');
  const traccia = leggiTraccia();
  assert.ok(Array.isArray(traccia.traccia), 'il file porta la lista delle tracce');
  const t = traccia.traccia[0];
  assert.equal(t.node, 'trofeo_mx5');
  assert.equal(t.ronda, 2);
  assert.equal(t.ronda_numero, 3);
  assert.equal(t.pista, 'monza');

  assert.equal(t.pista_nome, TRACK_INFO.monza.name);
  assert.equal(t.giri, 3);
  assert.equal(t.ora, '16:00');
  assert.equal(t.meteo, 'Pioggia leggera');
  assert.equal(t.meteo_preset, 4);
  assert.deepEqual(t.semina, { scritti: 4, saltati: 0, rimpiazzati: 0 });
  assert.equal(t.fonte, 'ladder');
  const griglia = res.passi.find((p) => p.nome === 'griglia');
  assert.equal(griglia.ok, true);
});

test('ronda successiva: senza risemina, la traccia in testa avanza', async () => {
  scriviSave(3);   // il save gira a ogni gara: Kyalami, ronda 4
  const res = await generaRondaNostro({ skip: ['auto'], force: true });
  assert.equal(res.semina, null, 'il nativo c\'è già: il campione NON si risemina');
  assert.equal(res.entry.track, 'kyalami');
  assert.equal(res.entry.hour, 15);
  const t = res.traccia;
  assert.equal(t.ronda, 3);
  assert.equal(t.pista, 'kyalami');
  assert.equal(t.semina, null);
  assert.equal(leggiTraccia().traccia[1].ronda, 2, 'la ronda di prima resta DIETRO');
});

test('dry: solo il piano — niente traccia nuova', async () => {
  scriviSave(4);   // Paul Ricard: ronda 5 della ladder (ronda indice 4)
  const prima = leggiTraccia();
  const res = await generaRondaNostro({ skip: ['auto'], dry: true });
  assert.equal(res.traccia, null, 'nel dry la traccia non si scrive');
  const dopo = leggiTraccia();
  assert.deepEqual(dopo, prima, 'il file della traccia resta com\'era');
  assert.equal(res.entry.track, 'paul_ricard');
});

test('la traccia pota al più 12 dietro e l\'ultimo resta in testa', () => {
  const path = join(process.env.EVO_DATA_DIR, 'evo-ronda-nostro-slot.json');
  for (let n = 1; n <= 15; n++) scriviTraccia(path, { n });
  const t = leggiTraccia(path).traccia;
  assert.equal(t.length, 12);
  assert.equal(t[0].n, 15);
  assert.equal(t[11].n, 4, 'il più vecchio sopravvissuto è il 4');
});
