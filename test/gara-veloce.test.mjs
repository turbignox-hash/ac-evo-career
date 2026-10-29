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
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const { encodeMsg, GAME_MODES_DIR } = await import('../tools/evo-grid.mjs');
const { garaVeloce } = await import('../tools/_gara-veloce.mjs');
const { currentInstantRace, INSTANT_FILE } = await import('../tools/set-instantrace.mjs');

const mkInstant = (giri = 7, mode = 2, aiMin = 60, aiMax = 90) => {
  const race = encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
    { field: 2, wire: 0, varint: BigInt(giri) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    { field: 4, wire: 2, bytes: Buffer.from('0123456789abcd', 'utf8') },
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
