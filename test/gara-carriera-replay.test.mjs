// test/gara-carriera-replay.test.mjs — LA GARA VERA DI DONINGTON, RIPASSATA (7/11/2026).
//
// La prova che conta per la richiesta di Mauro («fai dichiarare la gara alla
// carriera invece che ai campi di EVO, così ultimo giro, bandiera a scacchi e
// cronaca funzionano nelle gare vere»): si prende la REGISTRAZIONE VERA della
// gara del 6/11 (`data/live-2026-11-06T22-49-20.ndjson`, 697 campioni del
// registratore) e la si ripassa per intero, una volta con la carriera che
// dichiara la sessione (pista + 3 giri del `pending`) e una lasciando decidere
// i campi di EVO. I numeri attesi sono MISURATI, non scelti:
//   • carriera che dichiara → `inRace` vero per tutta la gara (330 campioni,
//     dalle 22:52:15 alle 22:58:21), `isLastLap` acceso e finestra pit pronta;
//   • campi di EVO soli     → `inRace` vero in 2 campioni su 697 (il difetto);
//   • carriera che dice «prova» (nessun giro in palio) → ZERO, anche se lo
//     stesso snapshot dichiarerebbe gara: la carriera vince in tutti e due i
//     versi, e una prova non si trucca da gara.
// Il file di registrazione sta in data/ (fuori dal repository): senza, il test
// SALTA col motivo scritto, non finge di aver misurato niente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLog } from '../src/live-monitor-riepilogo.mjs';
import { conGaraCarriera, creaDichiarazioneGara, garaDallaCarriera } from '../src/gara-carriera.mjs';
import { engineerLive } from '../src/engineer.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(process.env.EVO_DATA_DIR ?? join(ROOT, 'data'), 'live-2026-11-06T22-49-20.ndjson');
const C_E = existsSync(FILE);
const pending = { trackId: 'donington', trackNames: ['Donington Park', 'donington'], laps: 3 };

test('gara di Donington: la carriera accende inRace, i campi di EVO no',
  { skip: C_E ? false : 'registrazione di Donington assente (data/ non è nel repository)' }, () => {
    const campioni = parseLog(readFileSync(FILE, 'utf8')).filter((o) => o?.snapshot);
    assert.ok(campioni.length > 600, `campioni nella registrazione: ${campioni.length}`);

    let conCarriera = 0, conEvo = 0, prova = 0, ultimoGiro = 0, pit = 0, diversi = 0;
    let primo = null, ultimo = null;
    // il tracker CON MEMORIA è quello che usano davvero il Cruscotto e la rotta
    // `live` (7/11): ripassarlo qui sulla registrazione vera dice che la memoria
    // della durata non disturba la dichiarazione a giri, dove la `sessionId` di
    // EVO resta la stessa per prove e gara
    const dichiarazione = creaDichiarazioneGara();
    for (const o of campioni) {
      // 1) la carriera dichiara la gara (come farebbe markPending col pending)
      const esito = dichiarazione.valuta(o.snapshot, pending);
      const snap = esito.snap;
      const gara = esito.gara;
      // equivalenza col percorso senza memoria: stesso verdetto su ogni campione
      if (esito.gara !== garaDallaCarriera(conGaraCarriera(o.snapshot, pending).session, o.snapshot.player, pending)) diversi += 1;
      const out = engineerLive(snap, { garaCarriera: gara, raceLaps: 3 });
      if (out.inRace) {
        conCarriera += 1;
        primo ??= o.t;
        ultimo = o.t;
      }
      if (out.gauges?.isLastLap === true) ultimoGiro += 1;
      if (out.pit) pit += 1;
      // 2) gli stessi campioni lasciando decidere solo EVO (senza carriera)
      if (engineerLive(o.snapshot, {}).inRace) conEvo += 1;
      // 3) la carriera dice «prova» (nessun giro in palio): non deve accendersi
      const garaProva = garaDallaCarriera(snap.session, snap.player, { ...pending, laps: null });
      if (engineerLive(snap, { garaCarriera: garaProva }).inRace) prova += 1;
    }

    // MISURATI il 7/11 su questa registrazione: 330 / 2 / 0. Le soglie sono larghe
    // attorno al misurato per non ballare a ogni tick di differenza.
    assert.ok(conCarriera >= 300, `inRace con la carriera: ${conCarriera} campioni (attesi ~330)`);
    assert.equal(primo, '2026-11-06T22:52:15.117Z', 'la gara comincia col via della sessione a 3 giri');
    assert.equal(ultimo, '2026-11-06T22:58:21.937Z', 'e dura fino al traguardo');
    assert.ok(ultimoGiro > 0, 'ultimo giro acceso in gara');
    assert.ok(pit > 0, 'finestra pit pronta in gara');
    assert.ok(conEvo <= 2, `inRace coi soli campi di EVO: ${conEvo} (il difetto: 2 su ${campioni.length})`);
    assert.equal(prova, 0, 'la carriera che dice «prova» zittisce inRace: nessun falso positivo');
    assert.equal(diversi, 0, 'il tracker con memoria e la dichiarazione pura dicono la stessa cosa su ogni campione');
  });
