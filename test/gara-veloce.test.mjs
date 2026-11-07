// gara-veloce.test.mjs — LA GARA AL VOLO (1/11): la funzione condivisa
// garaVeloce() del CLI e dell'endpoint webui, sui FILE in sandbox (ACE_GAME_
// SAVEDIR redirige Saved Games/ACE; nessun file reale di gioco toccato).
// Verifica:
//   1. senza ricetta (o con giri+tempo insieme) → rifiuto pulito (400)
//   2. dry-run: passi con «dry:» e NESSUN byte toccato (raw invariato)
//   3. scrittura vera: giri + banda confermati dalla rilettura
//   4. griglia dal pool senza customgrid sul disco → passo KO ma senza crash
//   5. sedile con auto fuori dal libro ladder → passo KO non blocca gli altri
//   6. griglia dal pool: la 2ª chiamata identica trova i byte uguali sul disco
//      («già identiche», idempotenza 30/10) e NON crea bak; scritture ravvicinate
//      col disco cambiato lasciano DUE bak-veloce (bak al secondo, lezione 28/10
//      estesa a set-instantrace e gara-veloce via evo-grid.bakName)
import './_game-sandbox.mjs';
import './_flows-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// LA SANDBOX DEL SAVE (lezione 1/11, ore 00:07): garaVeloce col passo «sedile»
// (vetrina custom) scrive il SAVE della carriera su EVO_DATA_DIR — senza
// questa riga ogni suite ripristinava la Ferrari 296 GT3 nel menu del gioco
// «senza toccare nulla» (nuovo startedAt = nuovo comando ancora non ackato).
// Stesso patto di backup-rotation, garage-buy, integrity: EVO_DATA_DIR
// PRIMA degli import dinamici (SAVE_FILE nasce a import di webui-env.mjs).
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'evo-garavolo-'));

const { encodeMsg, decodeMsg, GAME_MODES_DIR } = await import('../src/evo-grid.mjs');
const { garaVeloce } = await import('../tools/_gara-veloce.mjs');
const { currentInstantRace, INSTANT_FILE } = await import('../src/set-instantrace.mjs');

const mkInstant = (giri = 7, mode = 2, aiMin = 60, aiMax = 90, { conPista = false } = {}) => {
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(giri) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    // f4 = datetime della sessione (anno/mese/giorno/ORA/minuti + scala in f4.7):
    // la stessa forma del file vero, così l'ora si scrive e si rilegge davvero
    { field: 4, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 0, varint: BigInt(2014) },
      { field: 2, wire: 0, varint: BigInt(8) },
      { field: 3, wire: 0, varint: BigInt(15) },
      { field: 4, wire: 0, varint: BigInt(14) },
      { field: 5, wire: 0, varint: BigInt(0) },
      { field: 7, wire: 5, bytes: (() => { const b = Buffer.alloc(4); b.writeFloatLE(1, 0); return b; })() },
    ]) },
    ...(conPista ? [{ field: 5, wire: 2, bytes: encodeMsg([
      { field: 1, wire: 2, bytes: Buffer.from('ITA', 'utf8') },
      { field: 2, wire: 2, bytes: Buffer.from('Foo', 'utf8') },
      { field: 3, wire: 2, bytes: Buffer.from('GP', 'utf8') },
    ]) }] : []),
    { field: 30, wire: 0, varint: BigInt(aiMin) },
    { field: 31, wire: 0, varint: BigInt(aiMax) },
    { field: 32, wire: 0, varint: BigInt(1) },
  ]);
  writeFileSync(INSTANT_FILE, encodeMsg([{ field: 2, wire: 0, varint: BigInt(3) }, { field: 3, wire: 2, bytes: race }]));
};

test('gara al volo senza ricetta (o doppia): rifiuto pulito', () => {
  mkInstant();
  assert.throws(() => garaVeloce({}), (e) => e.code === 'NO_RECIPE');
  assert.throws(() => garaVeloce({ giri: 5, tempo: 30 }), (e) => e.code === 'NO_ENTRAMBI');
  assert.throws(() => garaVeloce({ giri: 0 }), (e) => e.code === 'BAD_DURATA');
  assert.throws(() => garaVeloce({ giri: 5, aiMin: 101 }), (e) => e.code === 'BAD_BANDA');
});

test('dry-run: niente scritture, passi con «dry:»', () => {
  mkInstant();
  const prima = readFileSync(INSTANT_FILE);
  const out = garaVeloce({ giri: 5, auto: 'ks_ferrari_296_gt3', dry: true, force: true });
  assert.equal(out.dry, true);
  assert.ok(out.passi.some((p) => p.nome === 'durata gara' && /dry:/.test(p.esito)), `passo durata in dry: ${JSON.stringify(out.passi[0])}`);
  assert.ok(out.passi.some((p) => p.nome === 'banda AI' && /dry:/.test(p.esito)), 'passo banda in dry');
  assert.ok(out.passi.some((p) => p.nome === 'sedile (vetrina custom)' && /dry:/.test(p.esito)), 'anche il sedile resta in PROVA a inizio asciutta (lezione 1/11)');
  assert.ok(readFileSync(INSTANT_FILE).equals(prima), 'dry: nessun byte toccato');
  assert.ok(!existsSync(join(process.env.EVO_DATA_DIR, 'save-current.json')), 'dry col sedile: il SAVE della carriera NON nasce (1/11, ore 00:07)');
});

test('scrittura vera: 5 giri e banda 99-99 confermati dalla rilettura', () => {
  mkInstant(7, 2, 60, 90);
  const out = garaVeloce({ giri: 5, aiMin: 99, aiMax: 99, force: true });
  assert.ok(out.passi.find((p) => p.nome === 'durata gara' && /scritti/.test(p.esito) && /5 giri/.test(p.esito)), JSON.stringify(out.passi));
  const ai = out.passi.find((p) => p.nome === 'banda AI');
  assert.ok(ai && /99–99 scritta/.test(ai.esito), JSON.stringify(ai));
  const cur = currentInstantRace();
  assert.equal(cur.durata, 5);
  assert.deepEqual([cur.aiMin, cur.aiMax], [99, 99]);
  // idempotente: seconda chiamata, niente scritture
  const out2 = garaVeloce({ giri: 5, aiMin: 99, aiMax: 99, force: true });
  assert.ok(out2.passi.every((p) => !/scritt/.test(p.esito)), 'seconda chiamata: tutto già a posto');
});

// la carriera minima in sandbox: il comando del roster vive nel salvataggio
const salvaCarriera = () => writeFileSync(join(process.env.EVO_DATA_DIR, 'evo-career.save.json'), JSON.stringify({
  driver: { name: 'Prova', nation: 'ITA' }, money: 1000, messages: [], node: 'coppa_rx7', results: {}, events: { history: [], showCase: [] },
}));

test('griglia: il roster va al gioco (state.volo), NIENTE customgrid nostro', () => {
  mkInstant();
  salvaCarriera();
  rmSync(GRID_GV(), { force: true });
  const out = garaVeloce({ giri: 3, pool: 'ks_f40_lm,ks_ferrari_296_gt3', aiMin: 88, aiMax: 93, force: true });
  const g = out.passi.find((p) => p.nome === 'griglia (roster al gioco)');
  assert.ok(g?.ok && /armata/.test(g.esito), JSON.stringify(g));
  assert.equal(out.passi.length, 3, 'durata + banda + griglia: la lista resta completa');
  // IL PATTO (7/11): la griglia la scrive EVO coi suoi preset — il tool non
  // tocca più il customgrid, quindi non può più consegnare celle assemblate.
  assert.ok(!existsSync(GRID_GV()), 'nessun customgrid scritto dal tool');
  const st = JSON.parse(readFileSync(join(process.env.EVO_DATA_DIR, 'evo-career.save.json'), 'utf8'));
  assert.deepEqual(st.volo?.pool, ['ks_f40_lm', 'ks_ferrari_296_gt3'], 'il roster è armato nel save');
  assert.equal(st.volo?.opponents, 2, 'posti avversari = modelli − il posto del giocatore');
  assert.equal(st.volo?.aiMin, 88);
  assert.equal(st.volo?.aiMax, 93);
});

test('sedile con auto fuori libro: passo KO dichiarato, gli altri passi proseguono', () => {
  mkInstant();
  const out = garaVeloce({ giri: 4, auto: 'auto_che_non_esiste', force: true });
  const s = out.passi.find((p) => p.nome === 'sedile (vetrina custom)');
  assert.ok(s && !s.ok && /NON nel libro/.test(s.esito), JSON.stringify(s));
  assert.ok(out.passi.find((p) => p.nome === 'durata gara'), 'gli altri passi ci sono');
  assert.ok(!existsSync(join(GAME_MODES_DIR, 'last_grid.customgrid')), 'niente griglia scritta se non chiesta');
});

/* --- pista (3/11, prova pilota): il blocco 3.5 dell'istantanea --- */

const pistaIst = () => {
  const f3 = decodeMsg(readFileSync(INSTANT_FILE)).find((x) => x.field === 3 && x.wire === 2);
  const sess = decodeMsg(f3.bytes);
  const trk = sess.find((x) => x.field === 5);
  const sub = decodeMsg(trk.bytes);
  return sub.find((x) => x.field === 2) ? Buffer.from(sub.find((x) => x.field === 2).bytes).toString('utf8') : null;
};



test('pista in dry: esito «dry:», nessun byte toccato', () => {
  mkInstant(7, 2, 60, 90, { conPista: true });
  const prima = readFileSync(INSTANT_FILE);
  const out = garaVeloce({ giri: 5, pista: 'Monza', dry: true, force: true });
  const p = out.passi.find((x) => x.nome === 'pista (istantanea)');
  assert.ok(p?.ok && /dry: scriveresti Monza/.test(p.esito), JSON.stringify(p));
  assert.ok(readFileSync(INSTANT_FILE).equals(prima), 'dry pista: nessun byte toccato');
});

test('pista vera: scritta nel blocco 3.5 e confermata dalla rilettura', () => {
  mkInstant(7, 2, 60, 90, { conPista: true });
  const out = garaVeloce({ giri: 5, pista: 'Monza', force: true });
  const p = out.passi.find((x) => x.nome === 'pista (istantanea)');
  assert.ok(p?.ok && /scritta/.test(p.esito), JSON.stringify(p));
  assert.equal(pistaIst(), 'Monza');
  // idempotente: seconda chiamata sulla medesima pista, niente scritto
  const out2 = garaVeloce({ giri: 5, pista: 'Monza', force: true });
  const p2 = out2.passi.find((x) => x.nome === 'pista (istantanea)');
  assert.ok(p2?.ok && /idempotente/.test(p2.esito), JSON.stringify(p2));
});

test('pista fuori dal libro: passo KO senza toccare la pista', () => {
  mkInstant(7, 2, 60, 90, { conPista: true });
  const prima = readFileSync(INSTANT_FILE);
  const out = garaVeloce({ giri: 7, aiMin: 60, aiMax: 90, pista: 'pista_che_non_esiste', force: true });
  const p = out.passi.find((x) => x.nome === 'pista (istantanea)');
  assert.ok(p && !p.ok && /non nel libro TRACK_INFO/.test(p.esito), JSON.stringify(p));
  assert.equal(pistaIst(), 'Foo', 'pista KO: il blocco 3.5 resta com\'era');
  assert.ok(readFileSync(INSTANT_FILE).equals(prima), 'pista KO: nessun byte toccato');
});

test('istantanea senza blocco pista: passo KO chiaro, senza crash', () => {
  mkInstant();
  const out = garaVeloce({ giri: 5, pista: 'Monza', force: true });
  const p = out.passi.find((x) => x.nome === 'pista (istantanea)');
  assert.ok(p && !p.ok && /blocco pista/.test(p.esito), JSON.stringify(p));
  assert.ok(out.passi.find((x) => x.nome === 'durata gara'), 'gli altri passi ci sono');
});

/* --- IL REGISTRO DELLA DURATA (1/11): una riga SOLO sulle scritture vere,
on lo stesso JSONL dei registri voce, dentro la sandbox flussi --- */
const { REGISTRO_FILE, leggiRegistro } = await import('../tools/_gara-veloce.mjs');
const svuotaRegistro = () => { try { rmSync(REGISTRO_FILE, { force: true }); } catch { /* già assente */ } };
const righe = () => leggiRegistro(50);

/* --- L'ULTIMA RICETTA «PARTE SUBITO» (30/10): l'ultima riga con UNA durata
   del registro è la ricetta che il webui ri-esegue col bottone ▶: giri o
   tempo, banda, pista, sedile e pool, TUTTO quello che il pannello GUI
   precompila. Il registro qui sotto è lo stesso file sandbox dei test della
   sezione registro (svuoto da questo file una riga, alla fine la lascio). --- */
const { ultimaRicetta } = await import('../tools/_gara-veloce.mjs');

test('ultimaRicetta: null a registro vuoto, poi l\'ultima riga con UNA durata vale come ricetta', () => {
  rmSync(REGISTRO_FILE, { force: true });       // sandbox flussi: parto da registro pulito
  assert.equal(ultimaRicetta(), null, 'senza registro: null, mai un\'eccezione');
  garaVeloce({ tempo: 30, aiMin: 88, aiMax: 93, pista: 'Monza', auto: 'ks_ferrari_296_gt3', pool: 'ks_f40_lm,ks_ferrari_296_gt3', force: true });
  const r = ultimaRicetta();
  assert.equal(r?.tempo, 30, 'i minuti a tempo del registro diventano la durata della ricetta');
  assert.equal(r?.pista, 'Monza');
  assert.equal(r?.auto, 'ks_ferrari_296_gt3');
  assert.deepEqual(r?.pool, ['ks_f40_lm', 'ks_ferrari_296_gt3'], 'la stringa-del-pannello del pool si spacca in lista');
  assert.equal(r?.aiMin, 88);
  assert.equal(r?.aiMax, 93);
  // la ricetta riletta SI RIAPLICA: garaVeloce la accetta così com'è (proprio
  // ciò che fa l'endpoint parti-subito) — la durata torna 30 (qui già a
  // posto: l'istantanea della sandbox era a tempo), idempotenza confermata.
  const out2 = garaVeloce({ ...r, force: true });
  assert.ok(out2.passi.find((p) => p.nome === 'durata gara' && /(30 min|già a posto)/.test(p.esito)), JSON.stringify(out2.passi));
  // e RIRILETTA riusa come ricetta (due letture consecutive, stessa ricetta)
  assert.deepEqual(ultimaRicetta()?.tempo, 30);
});

/* --- DURATA A TEMPO end-to-end (1/11, le serie endurance): mkInstant è solo
   a giri — per A TEMPO serve mode=1 e la varint in SECONDI (30 min = 1800,
   come la scrive EVO e come la rilegge timedRace). Regola end-to-end:
   scrivo col tasto → rileggo dal file → la durata quello che ho chiesto. --- */
const mkTempo = (secondi = 600, aiMin = 60, aiMax = 90) => {
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(secondi) },
    { field: 3, wire: 0, varint: BigInt(1) },
    { field: 4, wire: 2, bytes: Buffer.from('0123456789abcd', 'utf8') },
    { field: 30, wire: 0, varint: BigInt(aiMin) },
    { field: 31, wire: 0, varint: BigInt(aiMax) },
    { field: 32, wire: 0, varint: BigInt(1) },
  ]);
  writeFileSync(INSTANT_FILE, encodeMsg([{ field: 2, wire: 0, varint: BigInt(3) }, { field: 3, wire: 2, bytes: race }]));
};

test('durata a tempo end-to-end: iscrivo 15 min, il file li rilegge come 900 s', () => {
  mkTempo(600);
  const out = garaVeloce({ tempo: 15, force: true });
  assert.ok(out.passi.find((p) => p.nome === 'durata gara' && /scritti/.test(p.esito) && /15 min a tempo/.test(p.esito)), JSON.stringify(out.passi));
  const cur = currentInstantRace();
  assert.equal(cur.modeTxt, 'a tempo');
  assert.equal(cur.durata, 900, 'la varint del file è in SECONDI (15 min)');
});

test('tempo 0 e tempo negativo: rifiuto BAD_DURATA senza toccare il file', () => {
  mkTempo(600);
  const prima = readFileSync(INSTANT_FILE);
  assert.throws(() => garaVeloce({ tempo: 0 }), (e) => e.code === 'BAD_DURATA');
  assert.throws(() => garaVeloce({ tempo: -30 }), (e) => e.code === 'BAD_DURATA');
  assert.ok(readFileSync(INSTANT_FILE).equals(prima), 'input sbagliato: nessun byte toccato');
});

/* --- IL REGISTRO DELLA DURATA: riga SOLO sulle scritture vere --- */
test('registro della durata: scrittura vera = riga; dry e idempotente = niente riga', () => {
  svuotaRegistro();
  mkTempo(600);
  // 1) dry-run: NON registra (nulla scritto, il registro non mente)
  garaVeloce({ tempo: 15, dry: true, force: true });
  assert.deepEqual(righe(), [], 'dry: il registro resta vuoto');
  // 2) scrittura vera: UNA riga con i parametri che l'hanno comandata
  garaVeloce({ tempo: 15, aiMin: 88, aiMax: 93, pista: null, force: true });
  const dopo = righe();
  assert.equal(dopo.length, 1, `una riga sola, viste: ${JSON.stringify(dopo)}`);
  assert.equal(dopo[0].tempo, 15);
  assert.equal(dopo[0].aiMin, 88);
  assert.ok(dopo[0].at, 'timestamp presente');
  // 3) idempotente (tutto già a posto): NESSUNA riga nuova
  garaVeloce({ tempo: 15, aiMin: 88, aiMax: 93, force: true });
  assert.equal(righe().length, 1, 'idempotente: il registro non conta nulla');
  // 4) nuova ricetta vera: riga nuova
  garaVeloce({ giri: 5, aiMin: 99, aiMax: 99, force: true });
  const ultime = righe();
  assert.equal(ultime.length, 2);
  assert.equal(ultime[0].giri, 5, 'l\'ultima riga è la piu recente');
});

/* ---------- GRIGLIA DAL POOL: idempotenza + bak anti-collisione (31/10) ----------
   Con un customgrid minimo sul disco (2 celle F40 byte-distinte + 2 driver con
   skill + config), la STESSA ricetta col pool due volte: la 2ª deve trovare i
   byte identici sul disco («già identiche», idempotenza 30/10) e NON creare
   bak-veloce; e se il disco cambia fra due scritture ravvicinate (il menu EVO
   l'ha toccato nel frattempo) i bak al SECONDO restano in pila, come faceva
   già grid-apply dalla lezione 28/10 — non più i nomi al minuto che si
   sovrascrivevano a vicenda. ---------- */
const B40 = (s) => Buffer.from(String(s), 'utf8');
const cellaF40 = (i) => encodeMsg([
  { field: 3, wire: 2, bytes: B40('ks_f40_lm') },
  { field: 4, wire: 2, bytes: B40('Auto di prova') },
  { field: 7, wire: 0, varint: BigInt(i + 1) },
]);
const driverGv = (skill) => {
  const f = Buffer.alloc(4); f.writeFloatLE(skill, 0);
  return encodeMsg([{ field: 4, wire: 5, bytes: f }]);
};
// (la griglia VIVA nelle prove: dal 7/11 il tool non la scrive più — la monta
// il gioco dal roster — quindi il file qui serve solo a controllare che resti
// INTATTO. cellaF40/driverGv restano come memory della forma del customgrid.)
const GRID_GV = () => join(GAME_MODES_DIR, 'last_grid.customgrid');
const _cellaGv = (i) => encodeMsg([
  { field: 1, wire: 2, bytes: cellaF40(i) },
  { field: 2, wire: 2, bytes: driverGv(0.6 + i * 0.2) },
]);

/* ---------- METEO E ORARIO della gara al volo (7/11) ----------
   Mauro: «aggiungi anche il meteo selezionabile e orario». Il meteo vive in
   gamemode.lastgamemode (campo 2, preset di sessione), l'ora nel datetime
   della sessione dell'istantanea. Qui si prova che i due passi scrivono
   DAVVERO e che sono idempotenti; e che un meteo scritto storto si rifiuta
   invece di diventare «sereno» di nascosto. ---------- */
test('meteo e ora della gara al volo: scritti, poi idempotenti', () => {
  mkInstant();
  // il preset meteo vive in gamemode.lastgamemode: in sandbox una volta (in
  // gioco lo scrive il gioco), con un blocco sessione e NIENTE campo 2 = sereno
  writeFileSync(join(GAME_MODES_DIR, 'gamemode.lastgamemode'), encodeMsg([
    { field: 3, wire: 2, bytes: encodeMsg([{ field: 1, wire: 2, bytes: Buffer.from('Practice', 'utf8') }]) },
  ]));
  const out1 = garaVeloce({ tempo: 30, meteo: 'pioggia', ora: 21, force: true });
  const m1 = out1.passi.find((p) => p.nome === 'meteo (sessione)');
  const o1 = out1.passi.find((p) => p.nome === 'ora (istantanea)');
  assert.ok(m1?.ok && /Pioggia/.test(m1.esito), JSON.stringify(m1));
  assert.ok(o1?.ok && /21:00/.test(o1.esito), JSON.stringify(o1));
  // il disco dice lo stesso: preset meteo 5 (pioggia) e ora 21 nel blocco Race
  const lgm = decodeMsg(readFileSync(join(GAME_MODES_DIR, 'gamemode.lastgamemode')));
  assert.equal(Number(lgm.find((f) => f.field === 2 && f.wire === 0)?.varint ?? 0), 5, 'preset meteo = pioggia');
  assert.equal(readInstantHour(), 21, 'ora della sessione scritta nell\'istantanea');
  // idempotenza: la stessa ricetta non riscrive nulla
  const out2 = garaVeloce({ tempo: 30, meteo: 'pioggia', ora: 21, force: true });
  assert.ok(/già a posto/.test(out2.passi.find((p) => p.nome === 'meteo (sessione)')?.esito ?? ''), 'meteo idempotente');
  assert.ok(/già a posto/.test(out2.passi.find((p) => p.nome === 'ora (istantanea)')?.esito ?? ''), 'ora idempotente');
});

test('meteo sconosciuto e ora fuori range: rifiuto con codice, niente scritture', () => {
  mkInstant();
  assert.throws(() => garaVeloce({ tempo: 10, meteo: 'nebbia-pesante', force: true }), (e) => e.code === 'BAD_METEO');
  assert.throws(() => garaVeloce({ tempo: 10, ora: 42, force: true }), (e) => e.code === 'BAD_ORA');
});

function readInstantHour() {
  const sess = decodeMsg(decodeMsg(readFileSync(INSTANT_FILE)).find((f) => f.field === 3 && f.wire === 2).bytes);
  const dt = decodeMsg(sess.find((f) => f.field === 4 && f.wire === 2).bytes);
  return Number(dt.find((f) => f.field === 4)?.varint);
}

