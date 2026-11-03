/* testday-margine.test.mjs — il MARGINE VERO anche nel quaderno proves (3/11).
   testDayLog(n, { logsDirs }) decora ogni prova copiando i CAMPI di hotlapsLog
   (stessa legge di rapporto gara e tetto): best = la tripla accreditata del
   file risultato, teorico = minimo per settore dei giri segnati nei log.
   Sandbox totale: EVO_DATA_DIR in tmp, un log finto con una finestra Practice
   su Kyalami e due giri; quaderno con tre provine:
     • res-practice:  segna la tripla [30000,35000,36000] → teorico 100200,
     • nota-manuale:  kind manual → nessun campo aggiunto (tace),
     • mai-girata:    tripla senza abbinamento nel log → campi assenti. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { join } from 'node:path';

// EVO_DATA_DIR PRIMA dell'import: testdays.json e i nidi nascono nel sandbox,
// niente tocca i dati veri (stessa regola di grid-calib.test.mjs).
process.env.EVO_DATA_DIR = mkdtempSync(join(tmpdir(), 'testday-margine-'));
process.env.ACE_SLOT = '1';
const mod = await import('../src/testday.mjs');
const { testDayLog, TESTDAY_FILE } = mod;

const riga = (ts, car, ms, id, lap = 1) =>
  `[2026-10-31 ${ts}] [gameplay] [info] Split completed for car ${car}: (${ms} ms, splitindex ${id}) lap:${lap}`;
const marker = (ts, pista, tipo) =>
  `[2026-10-31 ${ts}] [gameplay] [info] Game Started! GameModeType_RACE_WEEKEND | ${pista} ${tipo} 900 seconds @2014/8/15 9:0:0 | ks_car | fine`;

const CAR = '4e295b6676c6e38d-ff867ff83e4dc788';
const cont = [
  marker('10:01:00.000', 'Kyalami GP', 'Time Attack Practice'),
  // due giri di Practice (il secondo segnala più lento: il teorico sta sotto)
  ...[1, 2, 3].map(() => riga('10:02:00.000', CAR, '30000', 0, 1)),
  riga('10:02:05.000', CAR, '35000', 1, 1),
  riga('10:02:10.000', CAR, '36000', 2, 1),
  ...[1, 2, 3].map(() => riga('10:03:00.000', CAR, '29500', 0, 2)),
  riga('10:03:05.000', CAR, '34800', 1, 2),
  riga('10:03:10.000', CAR, '35900', 2, 2),
].join('\r\n');

const LOGS = join(process.env.EVO_DATA_DIR, 'Logs');
mkdirSync(LOGS, { recursive: true });
writeFileSync(join(LOGS, 'log-261031-100033.txt'), cont + '\r\n');

writeFileSync(TESTDAY_FILE, JSON.stringify({
  sessions: [
    {
      at: '2026-10-31T18:00:00.000Z', kind: 'file', file: 'res-practice.sessionresults.json',
      track: 'Kyalami', trackMatch: true,
      bestLap: '1:41.000',
      sectors: { sectors: [{ index: 1, mine: 30000 }, { index: 2, mine: 35000 }, { index: 3, mine: 36000 }], bestLapMs: 101000 },
    },
    {
      at: '2026-10-31T19:00:00.000Z', kind: 'manual', track: 'Kyalami', bestLap: '1:45.000',
      note: '--',
    },
    {
      at: '2026-10-31T20:00:00.000Z', kind: 'file', file: 'res-mai-girata.sessionresults.json',
      track: 'Brands Hatch', bestLap: '1:00.000',
      sectors: { sectors: [{ index: 1, mine: 15000 }, { index: 2, mine: 20000 }, { index: 3, mine: 25000 }], bestLapMs: 60000 },
    },
  ],
}), 'utf8');

test('testDayLog: la prova legata porta il margine vero con i CAMPI di hotlapsLog', () => {
  const prima = testDayLog(30, { logsDirs: [LOGS] }).find((e) => e.file === 'res-practice.sessionresults.json');
  assert.equal(prima.theoreticalMargineMs, 800, `best 101000 − teorico 100200 = 800 (con ${prima.theoreticalMargineMs})`);
  assert.equal(prima.theoreticalText, '1:40.200', '100200 ms = 1:40.200 (testo mm:ss.mmm come hotlapsLog)');
  assert.equal(prima.theoreticalGainText, '0:00.800', 'il tempo guadagnabile: best − teorico (testo mm:ss.mmm)');
  assert.equal(prima.theoreticalGiri, 2, 'i giri che sostengono il numero');
  // le voci del quaderno su disco non sono toccate (calcolo a LETTURA)
  const riletto = JSON.parse(readFileSync(TESTDAY_FILE, 'utf8'));
  assert.ok(!('theoreticalMargineMs' in riletto.sessions[2]), 'il quaderno su disco resta com\'è');
});

test('testDayLog: manuale e senza abbinamento restano muti (niente numeri finti)', () => {
  const out = testDayLog(30, { logsDirs: [LOGS] });
  const manuale = out.find((e) => e.kind === 'manual');
  assert.ok(!('theoreticalMargineMs' in manuale), 'la nota manuale tace: nessun log da abbinare');
  const mai = out.find((e) => e.file === 'res-mai-girata.sessionresults.json');
  assert.ok(!('theoreticalMargineMs' in mai), 'la tripla di un\'altra pista non abbatte il margine');
});

test('testDayLog: senza logDirs (server vecchio/CLI) non esplode e tace', () => {
  const out = testDayLog(30);
  assert.equal(out.length, 3);
  assert.ok(out.every((e) => !('theoreticalMargineMs' in e)), 'niente log → niente campi');
});
