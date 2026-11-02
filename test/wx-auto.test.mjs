// 3/11 — IL BOLLETTINO AUTOMATICO SENZA EVO. src/wx-auto.mjs reagisce al
// file Risultati che EVO chiude a fine sessione e scrive il meteo della
// sessione SUCCESSIVA del piano. Qui non si tocca NESSUN file vero: la
// cartella Results è un tmpdir, il gamemode.lastgamemode è un protobuf di
// fixture scritto con lo STESSO encodeMsg del tool (stesso stampo del test
// weather-preset), e il file passa giù per lgmFile esplicito — la stessa
// via che il modulo offre in produzione.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';

const GAME = mkdtempSync(join(tmpdir(), 'evo-wxauto-game-'));
const Results = mkdtempSync(join(tmpdir(), 'evo-wxauto-results-'));
const paths = { resultsDirs: [Results] };
// REGISTRO (4/11): anche data/wx-auto.jsonl resta FUORI dal disco vero —
// EVO_DATA_DIR redirige wx-registro.mjs verso il sandbox del test.
const DATA = mkdtempSync(join(tmpdir(), 'evo-wxauto-data-'));
process.env.EVO_DATA_DIR = DATA;
const leggiRegistro = async () => (await import('../src/wx-registro.mjs')).leggi({ n: 15 });

// file LGM di fixture: preset 0 (sereno) in cima + timeline di 9 step
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); return new Uint8Array(b); };
const step = (rain, cloud, fog) => encodeMsg([{ field: 3, wire: 2, bytes: encodeMsg([
  { field: 8, wire: 5, bytes: f32(rain) }, { field: 11, wire: 5, bytes: f32(cloud) }, { field: 12, wire: 5, bytes: f32(fog) },
]) }]);
const LGM = join(GAME, 'gamemode.lastgamemode');
const steps = Array.from({ length: 9 }, () => ({ field: 3, wire: 2, bytes: step(0.2, 0.5, 0) }));
writeFileSync(LGM, encodeMsg([{ field: 2, wire: 0, varint: BigInt(0) }, ...steps]));

const { decodeMsg } = await import('../tools/evo-grid.mjs');
const leggiPreset = () => {
  const p = decodeMsg(readFileSync(LGM)).find((x) => x.field === 2 && x.wire === 0);
  return p != null ? Number(p.varint) : 0;
};

const { wxAutoTick, wxAutoPrima } = await import('../src/wx-auto.mjs');

/* Il piano del weekend: STESSA forma che esce da race.mjs weatherPlanFor
   (ronda con weather livello 4 = l'esempio di Mauro: si peggiora verso la gara). */
const piano = [
  { session: 'Practice', sessionLabel: 'Prove libere', weather: 2, label: 'Nuvoloso', hour: 9 },
  { session: 'Qualifying', sessionLabel: 'Qualifiche', weather: 3, label: 'Coperto', hour: 11 },
  { session: 'Warmup', sessionLabel: 'Warm-up', weather: 3, label: 'Coperto', hour: 12 },
  { session: 'Race', sessionLabel: 'Gara', weather: 4, label: 'Pioggia leggera', hour: 15 },
];
const MONZA = ['monza', 'Monza', 'Italian Grand Prix'];

let pushMsg = null;
const costruisci = () => ({ piano, pistaNomi: MONZA, lgmFile: LGM, push: (...a) => { pushMsg = a; } });

/* Un Risultati finto: il NOME conta (il gioco trasporta la sessione nel file
   stesso), il JSON conta per session/track. mtime: adesso = fresco. */
const scriviResult = (nome, corpo) => {
  const f = join(Results, nome);
  writeFileSync(f, JSON.stringify(corpo));
  return f;
};
const resultSP = (session, track) => ({ session, track, layout: 'GP', drivers: [] });

test('wxAutoTick senza paths e senza Results: niente, nessun lancio', () => {
  assert.equal(wxAutoTick(null, null), null);
  assert.equal(wxAutoTick({ resultsDirs: [] }, null), null);
});

test('finita la Practice il meteo delle Qualifiche si scrive da solo (previsto)', async () => {
  scriviResult('261103-103000_SP_Practice.sessionresults.json', resultSP('Practice', 'Monza'));
  const esito = wxAutoTick(paths, costruisci);
  assert.equal(esito?.scritto, true);
  assert.equal(esito.da, 'Practice');
  assert.equal(esito.session, 'Qualifying');
  assert.equal(esito.weather, 3);
  assert.equal(leggiPreset(), 3, 'LGM = il preset del piano per le Qualifiche');
  assert.ok(pushMsg?.[0].includes('Qualifying'), 'notifica per la GUI');
  // REGISTRO (4/11): la scrittura riuscita lascia la voce sul disco
  const reg = await leggiRegistro();
  const v = reg.voci[0];
  assert.equal(v?.via, 'fine-sessione');
  assert.equal(v?.sessione, 'Qualifying');
  assert.equal(v?.preset, 3);
  assert.equal(v?.label, 'Coperto');
  assert.ok(v?.file?.includes('SP_Practice'), 'il Risultati che ha innescato');
});

test('lo STESSO file non viene mai riscritto: il tick dopo tace', () => {
  const prima = leggiPreset();
  const seconda = wxAutoTick(paths, costruisci);
  assert.equal(seconda, null);
  assert.equal(leggiPreset(), prima, 'nessun tocco al LGM');
});

test('hotlap sulla STESSA pista fuori dal piano: niente su disco', () => {
  pushMsg = null;
  scriviResult('261103-113000_SP_Hotlap.sessionresults.json', resultSP('Hotlap', 'Monza'));
  const esito = wxAutoTick(paths, costruisci);
  assert.equal(esito, null);
  assert.equal(pushMsg, null);
});

test('sessione del piano su UN ALTRA pista: la salvaguardia pista chiude', () => {
  pushMsg = null;
  scriviResult('261103-114500_SP_Qualifying.sessionresults.json', resultSP('Qualifying', 'Imola'));
  const esito = wxAutoTick(paths, costruisci);
  assert.equal(esito, null, 'non è la ronda in corso: nessuna scrittura');
  assert.equal(leggiPreset(), 3, 'LGM intoccato');
});

test('finita la Gara non c\'è una prossima: fine piano, si tace', () => {
  pushMsg = null;
  scriviResult('261103-160000_SP_Race.sessionresults.json', resultSP('Race', 'Monza'));
  const esito = wxAutoTick(paths, costruisci);
  assert.equal(esito?.finePiano, true);
  assert.equal(esito?.scritto, false);
  assert.equal(pushMsg, null);
  assert.equal(leggiPreset(), 3, 'nessun tocco al LGM');
});

test('risultato preistorico (mtime più vecchio del boot del server): niente', () => {
  pushMsg = null;
  const f = scriviResult('261102-103000_SP_Practice.sessionresults.json', resultSP('Practice', 'Monza'));
  const vecchio = new Date(Date.now() - 3600 * 1000);
  utimesSync(f, vecchio, vecchio);       // mtime indietro: deve cadere sotto la soglia di AVVIO
  const esito = wxAutoTick(paths, costruisci);
  assert.equal(esito, null);
  assert.equal(pushMsg, null);
});

test('Risultati corrotto: warning, nessun lancio, non si riprova più', () => {
  pushMsg = null;
  writeFileSync(join(Results, '261103-120000_SP_Warmup.sessionresults.json'), '{copy rotta');
  assert.doesNotThrow(() => wxAutoTick(paths, costruisci));
  assert.equal(leggiPreset(), 3);
});

test('già a posto: il piano chiede il preset che il LGM ha già → niente su disco', () => {
  pushMsg = null;
  scriviResult('261103-121000_SP_Warmup.sessionresults.json', resultSP('Warmup', 'Monza'));
  const esito = wxAutoTick(paths, costruisci);   // Warmup finita → tocca alla Gara (preset 4)
  assert.equal(esito?.scritto, true);
  assert.equal(esito.session, 'Race');
  assert.equal(leggiPreset(), 4);
  // e se il gioco ripeta lo STESSO risultato (lgm già a 4): giaOk, zero backup
  scriviResult('261103-121500_SP_Warmup.sessionresults.json', resultSP('Warmup', 'Monza'));
  const esito2 = wxAutoTick(paths, costruisci);
  assert.equal(esito2?.scritto, false);
  assert.equal(esito2?.giaOk, true);
  // il circuito del backup è del modulo meteo: nome da minuto ISO → DUE
  // scritte nello stesso minuto condividono (e si sovrascrivono) lo stesso
  // nome file. Qui basta che C'È, e il secondo giro già a posto non ne crea
  const bak = readdirSync(GAME).filter((x) => x.startsWith('gamemode.lastgamemode.bak-wx-')).length;
  assert.ok(bak >= 1, `backup presente per la scrittura vera (trovati: ${bak})`);
});

/* ============ PRIMA SESSIONE AUTOMATICA (4/11): wxAutoPrima ============
   Innovazione separata: il trigger è il CAMBIO RONDA, non un file Risultati.
   Cartella Results DIVERSA (Results2): lo stato di wxAutoTick nei test sopra
   non deve inquinare le decisioni per ronda. LGM condivisa: la sequenza dei
   preset si segue con leggiPreset(). */
const Results2 = mkdtempSync(join(tmpdir(), 'evo-wxauto2-results-'));
const paths2 = { resultsDirs: [Results2] };
const scriviResult2 = (nome, corpo) => {
  const f = join(Results2, nome);
  writeFileSync(f, JSON.stringify(corpo));
  return f;
};

// ronda nuova su un'altra pista (Fiorano, non ci sono file risultati): scrittura seria
const costruisciAltro = () => ({ piano: [{ session: 'Practice', sessionLabel: 'Prove libere', weather: 4, label: 'Pioggia leggera', hour: 9 }], pistaNomi: ['Fiorano'], lgmFile: LGM, push: (...a) => { pushMsg = a; } });

test('wxAutoPrima senza chiave ronda: nessun lancio', () => {
  assert.equal(wxAutoPrima(paths2, costruisci, null), null);
  assert.equal(wxAutoPrima(paths2, costruisci, ''), null);
});

test('ronda nuova senza storico: il meteo delle Prove si scrive da solo (previsto)', () => {
  const esito = wxAutoPrima(paths2, costruisci, 'serie#7');
  assert.equal(esito?.scritto, true);
  assert.equal(esito.session, 'Practice');
  assert.equal(esito.weather, 2);
  assert.equal(leggiPreset(), 2, 'LGM = il preset del piano per le Prove');
  assert.ok(pushMsg?.[0].includes('Prove'), 'notifica per la GUI');
});

test('stessa chiave ronda: il tick dopo tace, nessun tocco al LGM', () => {
  assert.equal(wxAutoPrima(paths2, costruisci, 'serie#7'), null);
  assert.equal(leggiPreset(), 2);
});

test('niente Practice nel piano: dichiarato', () => {
  const soloQuali = () => ({ piano: piano.slice(1), pistaNomi: MONZA, lgmFile: LGM });
  const esito = wxAutoPrima(paths2, soloQuali, 'serie#-piano');
  assert.equal(esito?.nessunPiano, true);
});

/* Le Prove sono GIÀ GIRATE (file della pista sul disco): si tace — è il caso
   in cui il «Metti» manuale resta utile. */
test('file delle Prove già sul disco: si tace, LGM intatto', () => {
  scriviResult2('261104-103000_SP_Practice.sessionresults.json', resultSP('Practice', 'Monza'));
  const esito = wxAutoPrima(paths2, costruisci, 'serie#8');
  assert.equal(esito?.scritto, false);
  assert.equal(esito?.giaCorsa, true);
  assert.equal(leggiPreset(), 2);
});

/* Cambio ronda DA VIVO: la Gara appena chiusa è sul disco MA su un'altra
   pista (la ronda nuova cambia pista) — non blocca la scrittura delle Prove. */
test("cambio ronda da vivo: il file dell'altra pista non blocca", () => {
  scriviResult2('261104-160000_SP_Race.sessionresults.json', resultSP('Race', 'Imola'));
  const esito = wxAutoPrima(paths2, costruisci, 'serie#9');
  // il preset delle Prove della ronda nuova combacia con quello già scritto: giaOk
  assert.equal(esito?.giaOk, true);
  assert.equal(esito?.scritto, false);
  assert.equal(leggiPreset(), 2);
});
test("cambio ronda con piano di un'altra pista: scrittura SERIA", () => {
  const esito = wxAutoPrima(paths2, costruisciAltro, 'serie#10');
  assert.equal(esito?.scritto, true);
  assert.equal(esito.weather, 4);
  assert.equal(leggiPreset(), 4);
});

test('due ronde di fila sulla STESSA pista: la Gara appena chiusa chiude le Prove (resta a mano)', () => {
  scriviResult2('261104-161000_SP_Race.sessionresults.json', resultSP('Race', 'Fiorano'));
  const esito = wxAutoPrima(paths2, costruisciAltro, 'serie#11');
  assert.equal(esito?.scritto, false);
  assert.equal(esito?.giaCorsa, true);
  assert.equal(leggiPreset(), 4, 'LGM intoccato');
});

/* REGISTRO: la scrittura della PRIMA sessione lascia la voce col TUO perché. */
test('la scrittura delle Prove si registra con via cambio-ronda', async () => {
  const reg = await leggiRegistro();
  const v = reg.voci.find((x) => x.via === 'cambio-ronda');
  assert.ok(v, 'una voce cambio-ronda esiste nel registro');
  assert.equal(v.sessione, 'Practice');
  assert.ok(v.preset != null && v.label, `preset e label dentro la voce: ${JSON.stringify(v)}`);
  assert.equal(v.file, null, 'nessun file Risultati: il trigger è la ronda');
});
