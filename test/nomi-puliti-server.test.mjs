// nomi-puliti-server.test.mjs — LA GUARDIA DEI NOMI PULITI (3/11, richiesta
// Mauro): «un test dedicato a systemHealth (lastLd col nome pulito) e ai campi
// trackPretty di garage/sessions e tetto, come il test del banco A/B».
//
// Il 1/11 i nomi belli (prettyTrackLabeled di src/testday.mjs, la STESSA
// implementazione del banco A/B del quaderno prove) sono entrati in quattro
// punti del server, ma nessun test li sorvegliava ASSIEME, a server vivo:
//
//   1) /api/system-health → telem.lastLd.track: il chip MoTeC dell'header
//      legge la CARTELLA pista («ImolaGP») e deve parlare col nome bello;
//   2) /api/garage {action:'sessions'} → sessions[].trackPretty (il selettore
//      del pannello meccanico) e basisTrack (dove è stata girata la telemetria);
//   3) /api/tetto → perTrack[].track e worstSectors[].track: la tabella del
//      tetto dice «Imola», non il token dell'import («ImolaGP»).
//
// Qui un server VERO con una carriera finta in SANDBOX (stesso gesto di
// clear-consiglio e cover-ponte: EVO_DATA_DIR + ACE_DATA in tmpdir, porta
// propria 8744) e sessioni MoTeC SINTETICHE (stesso formato binario decodificato
// da motec.mjs: header 64B, 5 canali da 124B, beacon nel .ldx). Due piste con
// token VERI di cartella e una che il ladder non conosce: le prime due devono
// uscire pulite, la terza deve restare il token onesto — come la legge del
// banco A/B (test/tracknames.test.mjs): «fuori dal ladder: token onesto».
// Il confronto atteso lo ricalcolo con l'import STESSO del server
// (prettyTrackLabeled + ladder vero del progetto), così se i due mondi
// divergono non si nasconde un semplice cambiamento di stringa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8744;           // sua, fuori dai fallback 8642..8655 e dalle altre suite (8731..8743)
const BASE = `http://127.0.0.1:${PORT}`;

// il ladder VERO: il server lo legge da lì, il test ricalcola l'atteso con lo
// STESSO import (prettyTrackLabeled) — una sola implementazione, niente copie.
const ladder = JSON.parse(readFileSync(join(ROOT, 'config', 'career.evo.ladder.json'), 'utf8'));
const { prettyTrackLabeled } = await import('../src/testday.mjs');
// la serie più bassa: la carriera finta punta a lei (come clear-consiglio)
const node0 = ladder.nodes.slice().sort((a, b) => a.level - b.level)[0];

const AUTO = 'Ferrari 296 GT3';
// token di cartella MoTeC REALI: attaccati, come EVO li scrive
const TRACK_GP = 'ImolaGP';                     // → «Imola» (il «GP» generico si toglie)
const TRACK_VARIANTE = 'Oulton ParkInternational'; // → «Oulton Park International»
const TRACK_SCONOSCIUTA = 'Pista Fantasma';     // ladder ignoto → token onesto

// --- builder del .ld sintetico (stesso formato di analisi.test / cover-ponte):
// 40 s di sessione, FUEL@20Hz + 4 canali@60Hz, beacon 0/1.8/4.0 e7 nel .ldx
function scriviLd(dir, nomeBase) {
  mkdirSync(dir, { recursive: true });
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
    buf.writeFloatLE(100 + (200 / 40) * t, SPEED_OFF + 4 * i);
    buf.writeFloatLE(Math.min(1, t / 10), TH_OFF + 4 * i);
    buf.writeFloatLE(t % 20 < 5 ? 1 : 0, BR_OFF + 4 * i);
    buf.writeFloatLE(27, PLF_OFF + 4 * i);
  }
  const ld = join(dir, `${nomeBase}.ld`);
  writeFileSync(ld, buf);
  writeFileSync(ld.replace(/\.ld$/, '.ldx'),
    '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.0"/>'
    + '<r ClassName="BCN" Time="1.8000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>');
  return ld;
}

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server non ha risposto su ${BASE} entro ${ms}ms`);
}

async function call(path, method = 'GET', body = null) {
  const r = await fetch(`${BASE}${path}`, { method, headers: body !== null ? { 'Content-Type': 'application/json' } : undefined, body: body !== null ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { }
  return { code: r.status, j, text };
}

test('I NOMI PULITI parlano anche dal server: lastLd, garage/sessions e tetto (col token onesto per l\'ignota)', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-nomi-puliti-'));
  const RESULTS = join(DATA, 'Results'); mkdirSync(RESULTS, { recursive: true });

  // sessioni MoTeC sintetiche (auto/pista = token di cartella veri);
  // mtimi DETERMINISTI: l'ultima scritta (ImolaGP) è la lastLd della salute
  const mot = join(DATA, 'MoTec', AUTO);
  const OF = 60 * 60 * 1000;
  const ora = (h) => ({ at: new Date(Date.now() - 12 * OF + h * OF) }); // Windows: utimesSync prende SOLE le Date (i numeri danno EINVAL)
  const fileF = scriviLd(join(mot, TRACK_SCONOSCIUTA), 'preset_fantasma_Sat Oct 31 100000 2026');
  const fileV = scriviLd(join(mot, TRACK_VARIANTE), 'preset_oulton_Sat Oct 31 110000 2026');
  const fileG = scriviLd(join(mot, TRACK_GP), 'preset_imola_Sat Oct 31 120000 2026');
  utimesSync(fileF, ora(1).at, ora(1).at);
  utimesSync(fileV, ora(2).at, ora(2).at);
  utimesSync(fileG, ora(3).at, ora(3).at);

  // carriera finta: gare di settori sulla GP e sulla SCONOSCIUTA — la materia
  // del tetto. Un rivale col campo vivo in ogni settore (conCampo).
  const settori = (base, guadagno) => [
    { index: 1, mine: base, best: base - 1000, deltaMs: 1000, fieldCount: 5 },
    { index: 2, mine: base + 3000, best: base + 2800, deltaMs: 200, fieldCount: 5 },
    { index: 3, mine: base + guadagno, best: base + guadagno - 500, deltaMs: 500, fieldCount: 5 },
  ];
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
    node: node0.nodeId, season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {},
    results: {
      [node0.nodeId]: [
        { track: TRACK_GP, season: 1, round: 1, position: 2, dnf: false, sectors: { sectors: settori(28000, 35200) } },
        { track: TRACK_SCONOSCIUTA, season: 1, round: 2, position: 1, dnf: false, sectors: { sectors: settori(27000, 34100) } },
      ],
    },
    stats: { bestLaps: {} }, agenda: { day: 1 }, titles: [],
  };
  writeFileSync(join(DATA, 'evo-career.save.json'), JSON.stringify(state));

  // gli ATTESI: le stesse voci che il server deve dire, calcolate col suo import
  const prettyGp = prettyTrackLabeled(ladder, TRACK_GP);
  const prettyVariante = prettyTrackLabeled(ladder, TRACK_VARIANTE);
  assert.equal(prettyGp, 'Imola', `la GP si mostra come circuito (calcolato: ${prettyGp})`);
  assert.equal(prettyVariante, 'Oulton Park International', `la variante vera si vede (calcolato: ${prettyVariante})`);

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA, ACE_LIVE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let _stderr = '';
  child.stderr.on('data', (d) => { _stderr += d; });
  try {
    await waitReady(child);

    // 1) SALUTE SISTEMA: il chip MoTeC legge la CARTELLA («ImolaGP») → nome bello
    const h = await call('/api/system-health', 'POST');
    assert.equal(h.code, 200, `system-health risponde 200: ${h.text.slice(0, 200)}`);
    assert.ok(h.j?.telem?.lastLd, 'telem.lastLd c\'è (la sandbox ha sessioni)');
    assert.equal(h.j.telem.lastLd.track, prettyGp,
      `lastLd.track parla col nome bello del ladder (ha: ${h.j.telem.lastLd.track} — atteso ${prettyGp})`);
    assert.ok(h.j.telem.lastLd.valid, 'la sessione sintetica è valida (canali con dati)');

    // 2) GARAGE/SESSIONS: trackPretty del selettore + basisTrack del consiglio
    const g = await call('/api/garage', 'POST', { action: 'sessions', car: AUTO, track: 'all' });
    assert.equal(g.code, 200, `garage sessions risponde 200: ${g.text.slice(0, 200)}`);
    assert.equal(g.j?.ok, true, 'il pannello risponde ok');
    const sess = g.j.sessions ?? [];
    assert.equal(sess.length, 3, `le tre sessioni sintetiche compaiono (ha: ${sess.length})`);
    for (const s of sess) {
      const atteso = prettyTrackLabeled(ladder, s.track) ?? s.track;
      assert.equal(s.trackPretty, atteso,
        `trackPretty di ${s.track} è la voce del ladder (ha: ${s.trackPretty}, atteso ${atteso})`);
    }
    const gp = sess.find((s) => s.track === TRACK_GP);
    assert.equal(gp.trackPretty, prettyGp, 'ImolaGP → «Imola» nel selettore');
    const varz = sess.find((s) => s.track === TRACK_VARIANTE);
    assert.equal(varz.trackPretty, prettyVariante, 'la variante del banco (Oulton ParkInternational) si vede');
    const fan = sess.find((s) => s.track === TRACK_SCONOSCIUTA);
    assert.equal(fan.trackPretty, TRACK_SCONOSCIUTA, 'fuori dal ladder: token onesto, nessun nome inventato');
    assert.equal(g.j.basisTrack, prettyGp, `basisTrack (dove è girata la telemetria del consiglio) parla pulito (ha: ${g.j.basisTrack})`);

    // 3) TETTO: tabella per pista e chip peggiori settori col nome pulito
    const t = await call('/api/tetto', 'POST');
    assert.equal(t.code, 200, `tetto risponde 200: ${t.text.slice(0, 200)}`);
    assert.equal(t.j?.ok, true, 'il tetto risponde ok');
    const trackGp = (t.j.perTrack ?? []).find((x) => x.track === prettyGp);
    assert.ok(trackGp, `la GP sta in perTrack col NOME BELLO (${prettyGp}): ${JSON.stringify((t.j.perTrack ?? []).map((x) => x.track))}`);
    assert.ok(!(t.j.perTrack ?? []).some((x) => x.track === TRACK_GP), 'il token grezzo «ImolaGP» non deve comparire');
    const trackFan = (t.j.perTrack ?? []).find((x) => x.track === TRACK_SCONOSCIUTA);
    assert.ok(trackFan, `la pista ignota resta col token onesto: ${JSON.stringify((t.j.perTrack ?? []).map((x) => x.track))}`);
    // i chip dei peggiori settori: stessa cura
    const chipGp = (t.j.worstSectors ?? []).find((w) => w.deltaMs === 1000);
    assert.ok(chipGp && chipGp.track === prettyGp, `il chip del settore peggiore dice «${prettyGp}» (ha: ${JSON.stringify(chipGp)})`);
    assert.ok((t.j.worstSectors ?? []).some((w) => w.track === TRACK_SCONOSCIUTA), 'il chip della pista ignota resta onesto');
  } finally {
    child.kill();
    await new Promise((res) => setTimeout(res, 300));
  }
});
