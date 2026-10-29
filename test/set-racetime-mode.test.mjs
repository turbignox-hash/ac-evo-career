// set-racetime-mode.test.mjs — currentSessionTimes LEGGE LA MODALITÀ (f3).
// Scoperta del 28/10: f3=1 → a tempo (f2 = SECONDI), f3=2 → a giri (f2 = GIRI).
// Verifica, su fixture sintetica con gli stessi encoder del progetto:
//   1. la Race a tempo riporta durSec (i secondi veri) e aTempo true
//   2. la Race a giri riporta durSec null e aTempo false (i «giri» il tool li tocca)
//   3. la pratica a tempo riporta durSec come prima (retrocompatibilità)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeMsg } from '../tools/evo-grid.mjs';
import { currentSessionTimes } from '../tools/set-racetime.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'evo-modal-'));
const mkFile = () => {
  const sess = (nome, durata, mode, extra = []) => encodeMsg([
    { field: 1, wire: 2, bytes: Buffer.from(nome, 'utf8') },
    { field: 2, wire: 0, varint: BigInt(durata) },
    { field: 3, wire: 0, varint: BigInt(mode) },
    { field: 4, wire: 2, bytes: encodeMsg([{ field: 4, wire: 0, varint: BigInt(15) }, { field: 5, wire: 0, varint: BigInt(30) }]) },
    { field: 7, wire: 5, bytes: (() => { const b = Buffer.alloc(4); b.writeFloatLE(1, 0); return b; })() },
    ...extra,
  ]);
  // gara a TEMPO (5 min) + gara a GIRI (3 giri) in due file distintos
  const fileT = join(TMP, `timed-${Date.now()}.gamemodesave`);
  writeFileSync(fileT, encodeMsg([sess('Practice', 900, 1), sess('Qualifying', 600, 1), sess('Race', 300, 1)].map((bytes) => ({ field: 3, wire: 2, bytes }))));
  const fileG = join(TMP, `laps-${Date.now()}.gamemodesave`);
  writeFileSync(fileG, encodeMsg([sess('Practice', 900, 1), sess('Race', 3, 2)].map((bytes) => ({ field: 3, wire: 2, bytes }))));
  return { fileT, fileG };
};

test('currentSessionTimes: la Race A TEMPO riporta durSec (300 s) e aTempo', () => {
  const { fileT } = mkFile();
  const ses = currentSessionTimes(fileT);
  const race = ses.find((s) => s.name === 'Race');
  assert.deepEqual([race.aTempo, race.mode, race.durSec], [true, 1, 300]);
  const prat = ses.find((s) => s.name === 'Practice');
  assert.deepEqual([prat.aTempo, prat.durSec], [true, 900]);   // come prima: la prova era già letta a tempo
});

test('currentSessionTimes: la Race A GIRI riporta durSec null (i giri non sono secondi)', () => {
  const { fileG } = mkFile();
  const ses = currentSessionTimes(fileG);
  const race = ses.find((s) => s.name === 'Race');
  assert.deepEqual([race.aTempo, race.mode, race.durSec], [false, 2, null]);
  const prat = ses.find((s) => s.name === 'Practice');
  assert.deepEqual([prat.aTempo, prat.durSec], [true, 900]);
});
