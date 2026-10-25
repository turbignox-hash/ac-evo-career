// 25/10 — il copilota sbagliava le posizioni (8 in pista → diceva 6): la SM di
// EVO porta currentPos 0-based (l'header del pacchetto dice «1 = leader» ma è
// finzione: la gara di Imola importata P5/10 viaggiava a 4 in SM per tutta la
// sessione). Qui si prova che la vista LIVE ha la posizione già normalizzata
// a 1-base COME L'HUD. ZERO in SM è il LEADER (il campo ACEVO_UNASSIGNED
// dell'header riguarda la CAR LOCATION, non la posizione). LiveReader si
// costruisce senza processo: snapshot su un blocco graphics finto è il
// contratto del test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveReader } from '../src/shmem.mjs';

function readerCon(gf) {
  const r = new LiveReader();          // niente spawn: costruttore puro
  r.last = {
    game: true, at: Date.now(),
    static: { sessionType: 1, sessionName: 'Race', track: 'Imola', startingGrip: 0, online: false, timedRace: false },
    graphics: { status: 2, timing: null, carCoords: [], ...gf },
    physics: null,
  };
  return r;
}

test('SM 0-based → posizione 1-based come l\'HUD: currentPos 4 di 10 auto = P5', () => {
  const snap = readerCon({ currentPos: 4, totalDrivers: 10, totalLapCount: 0, currentLapNo: 1, totalLapsSession: 3, carLocation: 4 }).snapshot();
  assert.equal(snap.player.position, 5, 'il player.position è quello che parla e che si vede in pista');
  assert.equal(snap.player.drivers, 10);
});

test('currentPos 0 = LEADER (non «non assegnata»): vive P1, mai nascosto', () => {
  const snap = readerCon({ currentPos: 0, totalDrivers: 10, totalLapCount: 0, currentLapNo: 1, totalLapsSession: 3, carLocation: 4 }).snapshot();
  assert.equal(snap.player.position, 1);
});

test('valore fuori griglia (≥ auto totali) = spazzatura del buffer → null, mai fantasma', () => {
  const snap = readerCon({ currentPos: 10, totalDrivers: 10, totalLapCount: 0, currentLapNo: 1, totalLapsSession: 3, carLocation: 4 }).snapshot();
  assert.equal(snap.player.position, null);
});

test('senza autos totali (buffer a metà): peggio valor sensato → +1 comunque, mai null in pista', () => {
  const snap = readerCon({ currentPos: 3, totalDrivers: 0, totalLapCount: 0, currentLapNo: 1, totalLapsSession: 3, carLocation: 4 }).snapshot();
  assert.equal(snap.player.position, 4);
});
