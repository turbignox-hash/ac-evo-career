// cover-ponte-sandbox.test.mjs — il bottone 🌉 PONTALO del pannello «🗺 Copertura
// dei setup» provato SU SANDBOX intera (1/11): un server webui VERO su porta sua
// (stesso schema di webui-smoke), con una Saved Games finta che contiene:
//   Car Setups/Ferrari 296 GT3/Imola/Mio setup.carsetup   ← il base setup
//   MoTec/Ferrari 296 GT3/Red Bull Ring GP/*.ld + .ldx    ← piste girate da te,
// il .ld sintetico (stesso formato decodificato da laptrace/analisi) fa si che
// setup-cover dichiari «Red Bull Ring GP» tra le GIRATE senza setup: la chip ✖
// col bottone 🌉. Qui NON si apre un browser: il POST che facciamo è quello che
// il gestore del click in gui/js/viste-c.js manda DAVVERO
// ({ car, track: dataset.coverBridge, srcFile: dataset.src }).
//
// Il ciclo verificato, in tre colpi:
//   1. setup-cover → la pista di arrivo è in `missing` COL SORGENTE (chip ✖ + 🌉);
//   2. setup-bridge col payload del bottone → il .carsetup NUOVO esiste nella
//      cartella della pista di arrivo, BYTE PER BYTE pari al base;
//   3. setup-cover daccapo → la pista è in `covered` (chip ✔ per la GUI) e
//      non è più in `missing`; un secondo click rifiuta pulito con already.
//
// ACE_LIVE=0: il lettore live resta spento nel processo di test, così la
// guardia «pista viva» del ponte non può fire col gioco VERO eventualmente
// aperto sul PC mentre il test gira — la sandbox è deterministica.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8743; // fuor dai fallback 8642..8655 e dalle altre suite (8731/8741)
const BASE = `http://127.0.0.1:${PORT}`;
const AUTO = 'Ferrari 296 GT3';
const SRC_TRACK = 'Imola';
const DEST_TRACK = 'Red Bull Ring GP';

function sandbox() {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-cover-ponte-'));
  const payload = 'PAYLOAD-IMOLA-42-byte-per-byte';
  const srcDir = join(DATA, 'Car Setups', AUTO, SRC_TRACK);
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'Mio setup.carsetup'), payload, 'utf8');
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  // sessione MoTeC sintetica sulla pista SENZA setup: 40 s, due giri (18 + 22 s).
  // Header 64 B + 5 canali da 124 B (FUEL 20 Hz, gli altri 60 Hz), beacon nel .ldx.
  const T0 = 64, N_CH = 5, T1 = T0 + N_CH * 124;
  const n20 = 40 * 20, n60 = 40 * 60;
  const FUEL_OFF = T1, SPEED_OFF = FUEL_OFF + 4 * n20;
  const TH_OFF = SPEED_OFF + 4 * n60, BR_OFF = TH_OFF + 4 * n60;
  const PLF_OFF = BR_OFF + 4 * n60;
  const buf = Buffer.alloc(PLF_OFF + 4 * n60);
  buf.writeUInt32LE(T0, 8);
  buf.writeUInt32LE(T1, 12);
  const channel = (R, name, unit, off, cnt, rate) => {
    buf.writeUInt32LE(off, R + 8);
    buf.writeUInt32LE(cnt, R + 12);
    buf.writeUInt32LE(rate << 16, R + 20);
    buf.write(name, R + 32, 'latin1');
    buf.write(unit, R + 72, 'latin1');
  };
  let R = T0;
  channel(R, 'FUEL', 'L', FUEL_OFF, n20, 20); R += 124;
  channel(R, 'SPEED', 'km/h', SPEED_OFF, n60, 60); R += 124;
  channel(R, 'THROTTLE', '%', TH_OFF, n60, 60); R += 124;
  channel(R, 'BRAKE', '%', BR_OFF, n60, 60); R += 124;
  channel(R, 'TYRE_PRESS_LF', 'psi', PLF_OFF, n60, 60);
  for (let i = 0; i < n20; i++) buf.writeFloatLE(30, FUEL_OFF + 4 * i);
  for (let i = 0; i < n60; i++) {
    const t = i / 60;
    buf.writeFloatLE(t < 18 ? 100 + (200 / 18) * t : 75 + (200 / 22) * (t - 18), SPEED_OFF + 4 * i);
    buf.writeFloatLE(Math.min(1, t / 10), TH_OFF + 4 * i);
    buf.writeFloatLE(t < 18 ? 1 : 0, BR_OFF + 4 * i);
    buf.writeFloatLE(27, PLF_OFF + 4 * i);
  }
  const motDir = join(DATA, 'MoTec', AUTO, DEST_TRACK);
  mkdirSync(motDir, { recursive: true });
  const LD = join(motDir, 'preset_test_prova_Sat Oct 31 120000 2026.ld');
  writeFileSync(LD, buf);
  writeFileSync(LD.replace(/\.ld$/, '.ldx'),
    '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.0"/>' +
    '<r ClassName="BCN" Time="1.8000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>');
  return DATA;
}

const postJson = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { }
  return { code: r.status, j };
};

test('Il bottone 🌉 del pannello Copertura: ✖ → ponte (payload del click) → ✔ sul disco e nel quadro', async () => {
  const DATA = sandbox();
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, ACE_LIVE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    // attesa server: /api/watcher?probe=1 risponde appena su (come webui-smoke)
    const t0 = Date.now();
    for (;;) {
      if (child.exitCode !== null) throw new Error(`server uscito subito (exit ${child.exitCode}). stderr: ${stderr.slice(-400)}`);
      try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) break; } catch { }
      if (Date.now() - t0 > 12000) throw new Error(`server non pronto su ${BASE} entro 12s. stderr: ${stderr.slice(-400)}`);
      await new Promise((res) => setTimeout(res, 250));
    }

    // 1) CHIP ✖: la pista girata senza setup sta in `missing` col SORGENTE pronto
    const q0 = await postJson('/api/setup-cover', { car: AUTO });
    assert.equal(q0.code, 200, `setup-cover risponde 200 (ricevuto ${q0.code})`);
    assert.equal(q0.j?.ok, true, 'setup-cover ok');
    const covered0 = (q0.j.covered ?? []).map((x) => x.track);
    assert.ok(covered0.some((t) => t === SRC_TRACK), `la base di Imola deve essere coperta: ${JSON.stringify(covered0)}`);
    const miss = (q0.j.missing ?? []).find((x) => x.track === DEST_TRACK);
    assert.ok(miss, `«${DEST_TRACK}» deve essere fra le girate senza setup (missing): ${JSON.stringify(q0.j.missing)}`);
    assert.ok(miss.srcFile?.endsWith(join(AUTO, SRC_TRACK, 'Mio setup.carsetup')), `il chip ✖ deve portare il srcFile del bottone 🌉: ${JSON.stringify(miss)}`);
    assert.ok(miss.srcFile.startsWith(DATA), 'il sorgente proposto sta in SANDBOX, mai sul disco vero del PC');

    // 2) IL CLICK 🌉: POST setup-bridge con lo STESSO payload che manda
    //    viste-c.js (car, track = data-cover-bridge, srcFile = data-src)
    const click = await postJson('/api/setup-bridge', { car: AUTO, track: miss.track, srcFile: miss.srcFile });
    assert.equal(click.code, 200, `setup-bridge risponde 200 (ricevuto ${click.code})`);
    assert.equal(click.j?.ok, true, `il ponte deve riuscire: ${JSON.stringify(click.j)}`);
    assert.equal(click.j.destTrack, DEST_TRACK);
    assert.equal(click.j.fromTrack, SRC_TRACK);
    assert.equal(click.j.name, 'Mio setup', 'il pontato non sovrascrive: primo nome integro');

    // 3) IL .CARSETUP NUOVO SUL DISCO: cartella giusta + byte per byte
    const destFile = join(DATA, 'Car Setups', AUTO, DEST_TRACK, 'Mio setup.carsetup');
    assert.equal(readFileSync(destFile, 'utf8'), 'PAYLOAD-IMOLA-42-byte-per-byte', 'il file pontato è la copia byte per byte del base');
    const cartellaArrivo = readdirSync(join(DATA, 'Car Setups', AUTO, DEST_TRACK));
    assert.equal(cartellaArrivo.filter((f) => f === 'Mio setup.carsetup').length, 1, 'in pista di arrivo UN solo file (nessun doppione)');

    // 4) CHIP ✔: ridisegno del quadro dopo il ponte (viste-c richiama __drawSetupCover)
    const q1 = await postJson('/api/setup-cover', { car: AUTO });
    assert.equal(q1.code, 200);
    const covered1 = (q1.j.covered ?? []).map((x) => x.track);
    assert.ok(covered1.includes(DEST_TRACK), `«${DEST_TRACK}» deve passare a ✔ (covered): ${JSON.stringify(covered1)}`);
    assert.ok(!((q1.j.missing ?? []).some((x) => x.track === DEST_TRACK)), 'non deve più stare fra le girate senza setup');
    const entry = (q1.j.covered ?? []).find((x) => x.track === DEST_TRACK);
    assert.equal(entry.files, 1, 'la chip ✔ conta i file: ×1');

    // 5) SECONDO CLICK 🌉: il ponte rifiuta in modo civile (lì il setup C'È già)
    const again = await postJson('/api/setup-bridge', { car: AUTO, track: DEST_TRACK, srcFile: miss.srcFile });
    assert.equal(again.code, 200);
    assert.equal(again.j?.ok, false, `un ponte su pista già coperta rifiuta: ${JSON.stringify(again.j)}`);
    assert.equal(again.j?.already, true, 'il rifiuto è «già coperta», non un errore');
  } finally {
    child.kill();
    await new Promise((res) => setTimeout(res, 300));
  }
});
