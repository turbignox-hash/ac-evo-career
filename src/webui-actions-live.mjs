// webui-actions-live.mjs — il dominio LIVE/COPILOTA della webui (6/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status. Restano qui:
//   live        → lo snapshot del lettore con la verifica della scheda gara
//   live-toggle → auto|off|sempre, persistito in evo.config.json
//   voce-server → chip e livello della copilota parlata
//   voce-prova  → la prova della radio vera, senza correre
//   ingegnere   → il payload del pannello live (anche nella variante leggera)
//   voce-pagina → chi tiene la radio: una pagina viva o una scheda vecchia
// Il dispatcher resta in webui.mjs; `sonda-menu` resta nello switch perché è
// la sonda del cruscotto, non il live.
import { eventCard } from './events.mjs';
import { creaDichiarazioneGara } from './gara-carriera.mjs';
import { durateDalSave } from './durate-save.mjs';
// memoria della durata della sessione viva per le ronde A TEMPO (7/11): la
// rotta è interrogata dal monitor ogni pochi secondi, quindi vede il timer
// pieno al via come lo vede l'ingegnere. I minuti attesi vengono dal
// gamemodesave (cache per mtime), con la scheda come riserva.
const DICHIARAZIONE_GARA = creaDichiarazioneGara({ durate: () => durateDalSave() });
import { tr } from './lang.mjs';
import { raceCard } from './race.mjs';
import { VOCE_LIVELLI } from './voce-copilota.mjs';
import { recordWarning } from './warnings.mjs';
import { writeConfig } from './webui-env.mjs';

export const LIVE_ACTIONS = new Set([
  'live', 'live-toggle', 'voce-server', 'voce-prova', 'ingegnere', 'voce-pagina',
]);

export async function liveAction(action, ctx) {
  const { state, body, res, sendJson, context0, syncLiveReader, gameRunningMemo, vigiaSordo, liveReader, LIVE_MODES, liveMode, payloadIngegnere, voceSrv, voceServerAttiva, voceServerLivello, pingVoce } = ctx;
  // IL LADDER DEL CONTESTO (7/11): `raceCard`/`eventCard` lo vogliono come primo
  // argomento e qui non era mai stato preso — ogni verifica della scheda gara
  // moriva in «ladder is not defined» dentro il try e il monitor riceveva
  // `check: null` (warning ripetuto in data/errors.jsonl). Il ladder è lo
  // stesso che webui.mjs legge da context0.
  const { ladder } = context0 ?? {};
  switch (action) {
    case 'live': {
      const mode = await syncLiveReader();
      if (mode === 'off') return sendJson(res, 200, { game:false, liveMode:'off' });
      const r = liveReader();
      let snap = r.snapshot({ raw: true });
      // RECUPERO: il lettore PowerShell può restare "inciappato" in nogame (genere
      // avviato mentre EVO era chiuso, MMF già passate): se il PROCESSO del gioco
      // è vivo ma il lettore non lo vede, lo riciclo al volo e riprovo.
      if (!snap.game && await gameRunningMemo()) {
        r.stop();
        r.start();
        snap = r.snapshot({ raw: true });
      }
      // RECUPERO SORDO (29/10): vivo ma senza dati (sessione sconosciuta,stale)
      // per più di 15 s col gioco avviato → stesso riciclo, automatico.
      if (await vigiaSordo(r, snap)) snap = r.snapshot({ raw: true });
      // LA GARA DICHIARATA DALLA CARRIERA (7/11): il gioco dice «TimeAttack» e
      // vince anche dandole un timer, quindi è la carriera — pista + giri del
      // `pending` — a dire che questa sessione è la gara preparata. Lo snapshot
      // marcato qui serve a TUTTO il resto: la verifica della scheda, il
      // copilota (inRace) e il log del monitor, che da questo snapshot scrive
      // le sue righe.
      snap = DICHIARAZIONE_GARA.valuta(snap, state?.pending).snap;
      // verifica della configurazione: confronta la sessione live con la scheda gara attesa
      let check = null;
      if (snap.game && state) {
        try {
          // body.event: verifica della SCHEDA EVENTO SPECIALE (pannello Eventi) invece
          // della ronda di campionato — stessa meccanica, card diversa (eventCard porta
          // già trackName/layout/carChoices stile raceCard)
          const card = body.event
            ? eventCard(ladder, state)
            : raceCard(ladder, state, { car: typeof body.car === 'string' ? body.car : null });
          if (!card) return sendJson(res, 200, { ...snap, check: null, waiting: true });
          const live = snap.session;
          const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
          const has = (hay, needle) => !!hay && !!needle && (norm(hay).includes(norm(needle)) || norm(needle).includes(norm(hay)));
          // al menu (nessuna sessione caricata) niente verifica: solo stato
          if (!live.track) {
            return sendJson(res, 200, { ...snap, check: null, waiting: true });
          }
          // attese costruite dai dati veri della scheda
          const pistaSetting = card.settings.find(([k]) => norm(k).startsWith('pista'))?.[1] ?? '';
          const layoutMatch = String(pistaSetting).match(/layout\s+([A-Za-z0-9' ]+)/i);
          const expectedLayout = layoutMatch ? layoutMatch[1].trim() : null;
          const expectedTrack = card.trackName ?? null;
          const choices = (card.carChoices ?? []).map((c) => c.display);
          const liveCar = snap.player?.car ?? null;
          const carOk = !!liveCar && choices.some((ch) => {
            const a = norm(ch), b = norm(liveCar);
            return b.includes(a) || a.includes(b);
          });
          const rows = [
            { key: 'pista', expected: expectedTrack, live: live.track, ok: has(live.track, expectedTrack) },
            { key: 'layout', expected: expectedLayout, live: live.layout, ok: has(live.layout, expectedLayout) },
            // 6/11: il tipo STATIC mente («TimeAttack» anche in gara) e la fase può
            // essere vuota — la riga restava rossa per tutta la gara vera. La gara
            // la dichiara lo snapshot (session.race: giri senza timer), la stessa
            // regola che alimenta inRace e la copilota.
            { key: 'sessione', expected: 'Gara', live: live.race ? 'Gara' : live.type, ok: live.race === true },
            { key: 'auto', expected: choices.join(', ') || null, live: liveCar, ok: carOk },
          ];
          const allOk = rows.every((r) => r.ok);
          check = { rows, ready: allOk };
        } catch (e) {
          recordWarning('webui.livecheck', 'verifica live non riuscita (rispondo senza check): ' + (e?.message ?? ''));
        }
      }
      return sendJson(res, 200, { ...snap, check, liveMode: mode });
    }
    case 'live-toggle': {
      /* accende/spegne il lettore LIVE a comando (strip + Impostazioni):
         persiste in data/evo.config.json così sopravvive al riavvio. */
      const want = String(body.mode ?? '').toLowerCase();
      if (!LIVE_MODES.includes(want)) return sendJson(res, 400, { error: tr({ it: "Modalità live non valida (", en: 'Invalid live mode (' }) + LIVE_MODES.join('|') + ').' });
      writeConfig({ liveMode: want });
      await syncLiveReader();
      return sendJson(res, 200, { ok: true, liveMode: liveMode() });
    }
    case 'voce-server': {
      // il chip della copilota comanda la voce del PITWALL (29/10): ACCENDI/
      // SPEGNI persistono in evo.config.json (voceCopilota) e sopravvivono al
      // riavvio. Spegninga = la coda del parlante si svuota al volo.
      // 30/10: oltre a on:true/false accetta body.livello (essenziale|normale|
      // full|off) dal selettore delle impostazioni — lo persiste in chiaro e
      // svuota la coda se il livello è off.
      if (body.on != null) {
        const cur = voceServerAttiva();
        const want = !!body.on;
        if (want !== cur) writeConfig({ voceCopilota: want });
        if (!want) voceSrv.silenzio();
      }
      if (body.livello != null) {
        const want = String(body.livello).toLowerCase();
        if (!['off', ...VOCE_LIVELLI].includes(want)) {
          return sendJson(res, 400, { error: tr({ it: 'Livello voce non valido: ', en: 'Invalid voice level: ' }) + ['off', ...VOCE_LIVELLI].join('|') + '.' });
        }
        if (want !== voceServerLivello()) writeConfig({ voceCopilota: want });
        if (want === 'off') voceSrv.silenzio();
      }
      return sendJson(res, 200, { ok: true, on: voceServerAttiva(), livello: voceServerLivello() });
    }
    case 'voce-prova': {
      // 31/10, «fai quello che vuoi»: PROVA DELLA RADIO VERA — la voce che
      // parla in gara è la Windows del Pitwall (voceSrv), non quella del
      // browser (che il bottone «Prova la voce» collauda da 27/10). Qui si
      // sente il repertorio DEL LIVELLO SCELTO senza correre una gara:
      // essenziale → box/benzina/bandiere; normale → anche giro, posizione,
      // gomme, meta; full → anche le due voci extra (gap e delta di ritmo).
      // Spenta: 400 con il motivo, niente frase sepolta in una voce muta.
      const lv = voceServerLivello();
      if (lv === 'off') return sendJson(res, 400, { error: tr({ it: 'Copilota spenta: accendi prima il copilota, poi prova la radio.', en: 'Copilot is off: turn it on before testing the radio.' }) });
      const PROVA = {
        essenziale: 'Prova della radio, livello essenziale. Box aperto: in pitlane — limiter on, niente gas. Sosta questo giro o il prossimo. Penalità tagli: 1.3 secondi. Ultimo giro! Bandiera a scacchi!',
        normale: 'Prova della radio, livello normale. Giro 3 fatto in 1:42.576 — nuovo best! P14, posizione recuperata. Metà gara: benzina 26 litri, per 8 giri. Gomme al 66 percento. Ultimo giro! Bandiera a scacchi!',
        full: 'Prova della radio, livello full. Chi ti sta davanti: 0.8 secondi. Sei più lento del best di 0.6. Ultimo giro! Bandiera a scacchi!',
      };
      const testo = PROVA[lv] ?? PROVA.normale;
      voceSrv.parla(testo);   // stessa coda delle frasi reali: ordine rispettato
      return sendJson(res, 200, { ok: true, on: voceServerAttiva(), livello: lv, prova: testo });
    }
    case 'ingegnere':
      // l'ingegnere di gara LIVE (29/10): il payload lo costruisce payloadIngegnere()
      // — la STESSA funzione alimenta anche la voce della copilota dentro il
      // Pitwall (voce-copilota.mjs), così radio parlata e pannello non possono
      // andare fuori passo: un solo costruttore per tutti i consumatori.
      // LEGGERO su richiesta (31/10 pomeriggio): il monitor del copilota chiede
      // body { leggero: true } e RICEVE il payload senza raceCard né albero
      // MoTeC (la stessa variante del tick della voce). Nella gara 15:29 il
      // monitor a payload INTERO ha preso timeout al minuto PER TUTTA LA
      // GARA: il costruttore intero impiega più dei suoi 2,5 s di fetch sul
      // disco lento e il registro è rimasto senza dati flag/gap raw.
      // Il pannello della GUI passa il body di sua e resta intero.
      return sendJson(res, 200, await payloadIngegnere(context0, state, body, { leggero: body?.leggero === true }));
    case 'voce-pagina': {
      // 29/10 sera, seconda cura: SOLO una pagina col codice VIVO dichiara qui
      // chi tiene la radio parlata (on:true, chip ON) o il silenzio
      // (on:false, chip OFF). Una scheda vecchia (JS in cache) NON pinga MAI:
      // il Pitwall torna a parlare lui — è la gara muta delle 11:36 chiusa
      // per sempre (poll interroga ≠ pagina parla).
      pingVoce(body.on);   // la variabile resta in webui.mjs (diagnostica)
      return sendJson(res, 200, { ok: true });
    }
    default: return false;
  }
}
