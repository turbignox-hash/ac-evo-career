// ab-senza-giri.test.mjs — LA GUARDIA DELL'ESCLUSIONE DAL BANCO A/B
// (3/11, richiesta Mauro: «un guard test che fallisce se ab-list propone una
// sessione senza giri cronometrati»).
//
// Lezione del banco (2/11): le sessioni MoTeC senza beacon nel .ldx
// (Marker Time sul traguardo) non hanno GIRR cronometrati — un A/B montato
// su una di esse era un confronto al buio (out-lap, fermo in griglia,
// sessione abbandonata subito). Da qui la legge: ZERO beacon = FUORI dai
// menu, e la voce resta al pilota solo DISABILITATA sotto l'intestazione
// «senza giri cronometrati» (viste-analisi legge `senzaGiri`).
//
// Questa guardia prova la legge A SERVER VIVO, su sessioni SINTETICHE in
// sandbox (stesso formato binario decodificato da motec.mjs: header 64B,
// 5 canali da 124B, beacon nel .ldx — builder come nomi-puliti-server):
//
//   1. `sessions` NON contiene NEMMENO una delle sessioni 0 beacon — nessun
//      menu, `prefer` (autopuntamento) e `last` (l'ultima scelta nel save)
//      inclusi: il banco non deve riaverla da NESSUNA porta posteriore;
//   2. `senzaGiri` contiene ESATTAMENTE le 0 beacon, con la STESSA forma
//      delle altre voci (la GUI le rideve disabilitate dal `senzaGiri`);
//   3. il quadro torna: ogni file MoTeC è in esattamente UNA lista —
//      nessuna doppia voce, nessuna sessione persa.
//
// Tre file coprono le strade morte vere: .ldx ASSENTE (copiata in blocco
// mozzata), .ldx PRESENTE ma SENZA marker BCN (XML senza il traguardo).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8746;           // libera, fuori dalle porte degli altri test (8731–8737, 8741, 8743–8745)
const BASE = `http://127.0.0.1:${PORT}`;

const AUTO = 'Ferrari 296 GT3';
const TRACK = 'ImolaGP';

// i NOMI di fixture usati per gli attesi sotto
const BUONA_A = 'preset_imola_a_Sat Sep 26 193715 2026.ld';
const BUONA_B = 'preset_imola_b_Sat Sep 26 203000 2026.ld';
const FILE_NO_LDX = 'preset_pitstop_Sat Sep 26 201000 2026.ld';
const FILE_LDX_CIECO = 'preset_morta_Sat Sep 26 205000 2026.ld';

// --- builder del .ld sintetico (stesso formato di nomi-puliti-server.test):
// 40 s di sessione, FUEL@20Hz + 4 canali@60Hz. ab-list legge SOLO .ldx per i
// beacon, ma il .ld VERO-formato tiene il test onesto se domani l'endpoint
// cominciasse a guardare dentro il .ld.
function scriviLd(dir, nomeBase, { ldx = null } = {}) {
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
  if (ldx === 'bcn') {
    // il traguardo C'È: tre marker BCN con Time in MICROsecondi (glob 1/11)
    writeFileSync(ld.replace(/\.ld$/, '.ldx'),
      '<?xml version="1.0"?><r><r ClassName="BCN" Time="0.0"/>'
      + '<r ClassName="BCN" Time="1.8000000e+7"/><r ClassName="BCN" Time="4.0000000e+7"/></r>');
  } else if (ldx === 'cieco') {
    // .ldx PRESENTE ma SENZA nessun marker BCN: XML compatto ma cieco
    writeFileSync(ld.replace(/\.ld$/, '.ldx'),
      '<?xml version="1.0"?><r><r ClassName="CH" Time="0.0"/></r>');
  }
  // ldx niente/null: NESSUN file a fianco del .ld (la copia in blocco mozzata)
}

// --- carriera finta MINIMA: ab-list legge state.abBanco, senza save il
// router muore prima di rispondere. La forma è quella di
// nomi-puliti-server (una carriera basta al redirect a requireState).
// abBanco DelIBERATAMENTE su una VOCE SENZA GIRI: il banco non deve
// risuscitarla dall'ultima scelta.
function scriviCarriera(data) {
  const state = {
    version: 1,
    driver: { name: 'Pilota Prova', nation: 'IT' }, money: 1000, messages: [],
    node: 'serie_gt3', season: 1, round: 0,
    difficulty: { base: {}, trim: {}, offClass: {}, offTrack: {}, locked: [], mode: 'adaptive', global: 0 },
    raceSettings: {}, results: {}, stats: {}, agenda: { day: 1 }, titles: [],
    abBanco: { fileA: FILE_NO_LDX, fileB: BUONA_A }, // una voce è SENZA giri → last DEVE restare null
  };
  writeFileSync(join(data, 'evo-career.save.json'), JSON.stringify(state));
}

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) {
      throw new Error(`il server è uscito subito (exit ${child.exitCode}): porta ${PORT} occupata o errore all'avvio`);
    }
    try {
      const r = await fetch(`${BASE}/api/watcher?probe=1`);
      if (r.ok) return;
    } catch { /* non ancora su */ }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`il server non ha risposto su ${BASE} entro ${ms}ms`);
}

test('ab-list: le sessioni senza giri cronometrati NON entrano nei menu (né prefer né last)', async () => {
  // sandbox: MoTeC + carriera finta all'interno; il server legge SOLO qui
  const DATA = mkdtempSync(join(tmpdir(), 'evo-ab-senza-giri-'));
  const motDir = join(DATA, 'MoTec', AUTO, TRACK);
  scriviLd(motDir, BUONA_A.replace(/\.ld$/, ''), { ldx: 'bcn' });
  scriviLd(motDir, BUONA_B.replace(/\.ld$/, ''), { ldx: 'bcn' });
  scriviLd(motDir, FILE_NO_LDX.replace(/\.ld$/, ''));                      // niente .ldx — nessun terzo argomento
  scriviLd(motDir, FILE_LDX_CIECO.replace(/\.ld$/, ''), { ldx: 'cieco' }); // .ldx senza BCN
  scriviCarriera(DATA);

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, ACE_LIVE: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await waitReady(child);

    const r = await fetch(`${BASE}/api/ab-list`);
    assert.equal(r.status, 200, `ab-list deve rispondere 200 (stderr: ${stderr.slice(-300)})`);
    const j = await r.json();
    assert.equal(j.ok, true, 'ab-list deve essere ok');

    const nomi = (x) => x.file;
    const proposte = (j.sessions ?? []).map(nomi);
    const escluse = (j.senzaGiri ?? []).map(nomi);

    // LA LEGGE: nessuna voce 0 beacon può farsi A o B del banco
    const morte = [FILE_NO_LDX, FILE_LDX_CIECO];
    for (const m of morte) {
      assert.ok(!proposte.includes(m), `GUARDIA COLPITA: «${m}» senza giri cronometrati è PROPOSTA dal banco (sessions): ${JSON.stringify(proposte)}`);
    }

    // la porta posteriore dell'autopuntamento: prefer pesca SOLO fra le buone
    if (j.prefer) {
      for (const f of [j.prefer.fileA, j.prefer.fileB]) {
        assert.ok(proposte.includes(f), `GUARDIA COLPITA: prefer propone «${f}» che non è fra le sessioni CON giri: ${JSON.stringify(j.prefer)}`);
        assert.ok(!morte.includes(f), `GUARDIA COLPITA: prefer propone «${f}» senza giri cronometrati: ${JSON.stringify(j.prefer)}`);
      }
    }

    // la porta posteriore dell'ULTIMA SCELTA: abBanco punta una senza giri →
    // il banco NON deve risuscitarla da `last`
    assert.equal(j.last, null, `GUARDIA COLPITA: last riporta la coppia col file SENZA giri (${FILE_NO_LDX}): ${JSON.stringify(j.last)}`);

    // il quadro torna: le 0 beacon stanno TUTTE e SOLO in senzaGiri,
    // con le buone in sessions — nessun doppione, nessuna perdita
    assert.deepEqual(new Set(escluse).size, escluse.length, `senzaGiri senza doppi: ${JSON.stringify(escluse)}`);
    assert.ok(escluse.includes(FILE_NO_LDX) && escluse.includes(FILE_LDX_CIECO), `le 0 beacon devono stare in senzaGiri (disabilitate): ${JSON.stringify(escluse)}`);
    assert.ok(proposte.includes(BUONA_A) && proposte.includes(BUONA_B), `le sessioni CON giri devono restare proposte: ${JSON.stringify(proposte)}`);
    const tutte = [...proposte, ...escluse];
    assert.equal(tutte.length, new Set(tutte).size, `nessun file in ENTRAMBE le liste: ${JSON.stringify(tutte)}`);
    assert.equal(tutte.length, 4, `il quadro deve essere completo (4 sessioni): ${JSON.stringify(tutte)}`);

    // la forma delle voci: senzaGiri porta gli STESSI campi di sessions
    // (car/track/when), così la GUI le disabilita coi nomi belli
    for (const e of j.senzaGiri ?? []) {
      assert.ok(typeof e.track === 'string' && typeof e.car === 'string' && typeof e.when === 'string', `voce senza giri incompleta: ${JSON.stringify(e)}`);
    }
  } finally {
    child.kill();
  }
});
