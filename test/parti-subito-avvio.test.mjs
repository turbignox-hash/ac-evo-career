// parti-subito-avvio.test.mjs — «PARTE SUBITO» che apre il gioco (7/11).
//
// Il patto, provato sull'ENDPOINT vero in sandbox (niente gioco, niente file
// dell'utente — `body.noLaunch` è la via di fuga che il caso 'race' usa già):
//   1. se la DURATA non si scrive (istantanea senza il blocco Race) il gioco
//      NON si apre: un ✗ chiaro, non EVO aperto sulla gara vecchia;
//   2. con la durata scritta, la ricetta arma il VIA (state.volo.avviaFino) e
//      nessun passo di avvio parte con noLaunch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { encodeMsg } = await import('../src/evo-grid.mjs');

const SB = mkdtempSync(join(tmpdir(), 'evo-parti-subito-'));
const GAME = join(SB, 'save-gioco');
const GAME_MODES = join(GAME, 'GameModes');
mkdirSync(GAME_MODES, { recursive: true });
const DINI = join(SB, 'dati-tool');
mkdirSync(DINI, { recursive: true });
const FLUSSI = join(SB, 'flussi');
mkdirSync(FLUSSI, { recursive: true });
const ACE_DATA = join(SB, 'ace');
mkdirSync(join(ACE_DATA, 'Results'), { recursive: true });

const SAVE = join(DINI, 'evo-career.save.json');
writeFileSync(SAVE, JSON.stringify({
  driver: { name: 'Prova', nation: 'ITA' }, money: 1000, messages: [],
  node: 'coppa_rx7', results: {}, events: { history: [], showCase: [] },
}, null, 2));
writeFileSync(join(DINI, 'evo.config.json'), JSON.stringify({ lang: 'it' }));

// LA RICETTA IN CANNA: la stessa forma che scrive `registra()` (tempo 10 min,
// Monza, sereno, ore 12, due modelli e 2 rivali)
const RICETTA = {
  at: new Date().toISOString(), giri: null, tempo: 10, aiMin: 88, aiMax: 93,
  pista: 'Monza', auto: null, pool: ['ks_ferrari_f40_lm', 'ks_ferrari_296_gt3'],
  meteo: 'sereno', ora: 12, rivali: 2,
};
writeFileSync(join(FLUSSI, 'gara-veloce.jsonl'), `${JSON.stringify(RICETTA)}\n`);

const INSTANT = join(GAME_MODES, 'GameModeType_INSTANT_RACE.gamemodesave');
// istantanea SENZA il blocco Race (f3): la durata non si può scrivere
writeFileSync(INSTANT, encodeMsg([{ field: 2, wire: 0, varint: 3n }]));
// istantanea VERA: Race a 7 giri (f2) in modalità giri (f3=2), AI 60-90
const raceBuona = () => writeFileSync(INSTANT, encodeMsg([{ field: 3, wire: 2, bytes: encodeMsg([
  { field: 1, wire: 2, bytes: Buffer.from('Race', 'utf8') },
  { field: 2, wire: 0, varint: 7n },
  { field: 3, wire: 0, varint: 2n },
  { field: 30, wire: 0, varint: 60n },
  { field: 31, wire: 0, varint: 90n },
]) }]));

const PORT = 8793;
const BASE = `http://127.0.0.1:${PORT}`;
const child = spawn(process.execPath, [join(ROOT, 'src', 'webui.mjs')], {
  cwd: ROOT,
  env: {
    ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA,
    ACE_GAME_SAVEDIR: GAME, EVO_DATA_DIR: DINI, EVO_FLOWS_DIR: FLUSSI,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const post = async (azione, body) => {
  const r = await fetch(`${BASE}/api/${azione}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  return { stato: r.status, corpo: await r.json().catch(() => null) };
};

test('PARTE SUBITO: durata KO = il gioco non si apre; durata ok = via armato', async () => {
  let su = false;
  for (let i = 0; i < 80 && child.exitCode === null; i++) {
    try { if ((await fetch(`${BASE}/api/watcher?probe=1`)).ok) { su = true; break; } } catch { /* ancora giù */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(su, `il server deve partire: ${log.slice(-600)}`);

  try {
    // 1) DURATA KO -> nessun avvio, e il motivo è nel passo. noLaunch SEMPRE:
    // un test non deve potere aprire il gioco sul desktop di nessuno — la
    // porta della durata scatta PRIMA del ramo di avvio, quindi il ✗ resta
    // la prova che il paletto ha deciso.
    const ko = await post('parti-subito', { noLaunch: true });
    assert.equal(ko.stato, 200, JSON.stringify(ko.corpo));
    const passi = ko.corpo?.passi ?? [];
    const durata = passi.find((p) => p.nome === 'durata gara');
    assert.ok(durata && durata.ok === false, `la durata deve essere KO: ${JSON.stringify(passi)}`);
    const avvio = passi.find((p) => p.nome === 'gioco (avvio)');
    assert.ok(avvio && avvio.ok === false && /non l'ho aperto/.test(avvio.esito), `EVO non si deve aprire: ${JSON.stringify(avvio)}`);
    assert.equal(ko.corpo?.lancio, undefined, 'nessun lancio riportato');

    // 2) DURATA OK + noLaunch -> il via si arma e il gioco non viene aperto
    raceBuona();
    const ok = await post('parti-subito', { noLaunch: true });
    assert.equal(ok.stato, 200, JSON.stringify(ok.corpo));
    const p2 = ok.corpo?.passi ?? [];
    assert.ok(p2.find((p) => p.nome === 'durata gara' && p.ok === true), `durata scritta: ${JSON.stringify(p2)}`);
    assert.equal(p2.find((p) => p.nome === 'gioco (avvio)'), undefined, 'con noLaunch nessun passo di avvio');
    assert.equal(ok.corpo?.lancio, undefined, 'noLaunch: nessuna apertura del gioco');
    const salvato = JSON.parse(readFileSync(SAVE, 'utf8'));
    assert.ok(Number(salvato.volo?.avviaFino) > Date.now(), 'PARTE SUBITO arma il via in state.volo');
    assert.deepEqual(salvato.volo?.pool, RICETTA.pool, 'il roster della ricetta è armato');
  } finally {
    child.kill();
  }
});
