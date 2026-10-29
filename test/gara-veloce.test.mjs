// gara-veloce.test.mjs — LA GARA AL VOLO (1/11): la funzione condivisa
// garaVeloce() del CLI e dell'endpoint webui, sui FILE in sandbox (ACE_GAME_
// SAVEDIR redirige Saved Games/ACE; nessun file reale di gioco toccato).
// Verifica:
//   1. senza ricetta (o con giri+tempo insieme) → rifiuto pulito (400)
//   2. dry-run: passi con «dry:» e NESSUN byte toccato (raw invariato)
//   3. scrittura vera: giri + banda confermati dalla rilettura
//   4. griglia dal pool senza customgrid sul disco → passo KO ma senza crash
//   5. sedile con auto fuori dal libro ladder → passo KO non blocca gli altri
import './_game-sandbox.mjs';
import './_flows-sandbox.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const { encodeMsg, GAME_MODES_DIR } = await import('../tools/evo-grid.mjs');
const { garaVeloce } = await import('../tools/_gara-veloce.mjs');
const { currentInstantRace, INSTANT_FILE } = await import('../tools/set-instantrace.mjs');

const mkInstant = (giri = 7, mode = 2, aiMin = 60, aiMax = 90, { conPista = false } = {}) => {
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(giri) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    { field: 4, wire: 2, bytes: Buffer.from('0123456789abcd', 'utf8') },
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
  const out = garaVeloce({ giri: 5, dry: true, force: true });
  assert.equal(out.dry, true);
  assert.ok(out.passi.some((p) => p.nome === 'durata gara' && /dry:/.test(p.esito)), `passo durata in dry: ${JSON.stringify(out.passi[0])}`);
  assert.ok(out.passi.some((p) => p.nome === 'banda AI' && /dry:/.test(p.esito)), 'passo banda in dry');
  assert.ok(readFileSync(INSTANT_FILE).equals(prima), 'dry: nessun byte toccato');
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

test('griglia dal pool senza customgrid: passo KO senza crash', () => {
  mkInstant();
  const out = garaVeloce({ giri: 3, pool: 'ks_f40_lm', force: true });
  const g = out.passi.find((p) => p.nome === 'griglia dal pool');
  assert.ok(g && !g.ok && /last_grid.customgrid/.test(g.esito), JSON.stringify(g));
  assert.equal(out.passi.length, 3, 'durata + banda + griglia: la lista resta completa');
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

const { decodeMsg } = await import('../tools/evo-grid.mjs');

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

