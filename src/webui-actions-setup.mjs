// webui-actions-setup.mjs — il dominio SETUP della webui (6/11, P1.5).
// Estratto da webui.mjs senza cambiare rotte, payload o status. Qui vivono
//   setup           → la vista delle schede (viewSetup)
//   meccanico-parla → la richiesta in parole che diventa un .carsetup vero
//   setup-apply     → la scrittura del setup consigliato (allievo, prove A/B)
//   setup-cover     → la copertina del setup (metadati per il pannello)
//   setup-history   → lo storico dei setup con i delta
//   setup-bridge    → il ponte byte-per-byte fra piste
//   setup-save      → il salvataggio dei percorsi EVO
// Il dispatcher resta in webui.mjs: il modulo risponde `false` solo se
// l'azione non è sua.
import { correzioniDiStoria, registraRound } from './allievo.mjs';
import { bridgeSetup, listSetups, parseSetup, writeSetupCopy } from './carsetup.mjs';
import { tr } from './lang.mjs';
import { leggiIntenzione, nomeFileSetup, pianoSetup } from './meccanico-parla.mjs';
import { collectSessions, pressureAdvice, racePressureAdvice } from './motec.mjs';
import { GAME_EXE, resolvePaths } from './paths.mjs';
import { apriProva, cartaDelMeccanicoSuFile } from './prova-setup.mjs';
import { raceCard } from './race.mjs';
import { giriGaraDa, liveSetupSignals, mechanicExtraEdits, startPsiFromLive, tyreClassOf } from './setup.mjs';
import { liveReader } from './shmem.mjs';
import { sameCar as carSame, sameTrack as trkSame } from './tracknames.mjs';
import { TRACK_INFO } from './tracks.mjs';
import { DATA_DIR, writeConfig } from './webui-env.mjs';
import { viewSetup } from './webui-views.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const SETUP_ACTIONS = new Set([
  'meccanico-parla', 'setup-apply', 'setup-cover', 'setup-history', 'setup-bridge', 'setup-save', 'setup',
]);

export async function setupAction(action, ctx) {
  const { ladder, state, paths, body, res, sendJson, syncLiveReader } = ctx;
  switch (action) {
    /* IL MECCANICO A VOCE (6/11, richiesta Mauro: «interagire con lui per
       chiedere aggiustamenti… li prepara già con il nome giusto»): la
       richiesta in parole («qualifica», «gara con 8 giri», «bagnato»)
       diventa un file .carsetup VERO col nome GIUSTO — «Qualifica»,

       «Gara 8 giri», «Bagnato» — niente più «EVO-consigliato». Il piano
       tocca benzina e pressioni SOLO con dati veri (consumo misurato,
       vivo o fourPsi); il composto pioggia resta una scelta di gioco e la
       risposta lo dice. Con `esegui` scrive il file: niente sovrascritture,
       il contatore « (2)» protegge quello che già c'è; il piano entra nel
       ciclo dell'allievo così anche le richieste a voce incassano l'esito. */
    case 'meccanico-parla': {
      try {
        const cartella = paths.dataDirs?.[0] ?? '';
        if (!cartella) return sendJson(res, 409, { error: tr({ it: 'Cartella Saved Games/ACE non impostata (Impostazioni).', en: 'Saved Games/ACE folder not set (Settings).' }) });
        const carName = String(body.car ?? '').trim();
        let trackName = String(body.track ?? '').trim();
        const esegui = !!body.esegui;
        const int = leggiIntenzione(String(body.richiesta ?? ''), body.preset ?? null);
        if (int.tipo === 'pentito') {
          // «correggiti»: la scusa del meccanico senza toccare nessun file
          const scuse = correzioniDiStoria(carName, trackName);
          return sendJson(res, 200, { ok: scuse.length > 0, tipo: 'pentito', car: carName, track: trackName, risposta: scuse.length ? scuse[0].text : tr({ it: 'Nessuna leva passata ha perso tempo: non ho scuse da fare.', en: 'No past lever lost time: nothing to apologise for.' }), righe: [], note: [] });
        }
        if (!int.tipo || !carName) return sendJson(res, 200, { ok: false, hint: tr({ it: "Dimmelo in parole: «qualifica», «gara con N giri» o «bagnato» — con l'auto e la pista della scheda in vista.", en: 'Say it in words: qualifying, race with N laps, or wet - with the car and track of the sheet visible.' }) });
        // la PISTA VIVA comanda (lezione 22/10 ore 20:49): stessa guardia di setup-apply
        let liveNow = null;
        try {
          if (await syncLiveReader() !== 'off') liveNow = liveReader()?.snapshot?.({ raw: true }) ?? null;
        } catch { /* il dialogo nasce anche a gioco spento */ }
        if (liveNow?.session?.track) {
          if (trackName && !trkSame(liveNow.session.track, trackName)) return sendJson(res, 200, { ok: false, hint: tr({ it: `Il gioco è su «${liveNow.session.track}» ma la richiesta mira a «${trackName}»: non scrivo setup su una pista diversa (in gioco si vedono solo i setup della pista corrente).`, en: `The game is at «${liveNow.session.track}» but the request targets «${trackName}»: I won't write a setup for a different track.` }) });
          trackName = trackName || liveNow.session.track;
        }
        // il BASE è sempre il TUO setup (le copie generate dalle richieste si escludono)
        const radice = cartella.replace(/[\\/]$/, '');
        let setups = listSetups(radice, { car: carName, track: trackName });
        if (!setups.length) {
          const tutti = listSetups(radice);
          const fuzzy = tutti.filter((s) => carSame(s.car, carName) && (!trackName || trkSame(s.track, trackName)));
          if (fuzzy.length) setups = fuzzy;
        }
        setups = setups.filter((s) => !s.name.includes('EVO-consigliato'));
        if (!setups.length) return sendJson(res, 200, { ok: false, hint: tr({ it: `Nessun .carsetup tuo per «${carName}»: dentro EVO salva una volta il setup (CARICA/SALVA, anche i valori default) e riprova — il meccanico parte sempre dal TUO file.`, en: `No .carsetup of your own for «${carName}»: inside EVO save the setup once (LOAD/SAVE) and try again — the mechanic always starts from YOUR file.` }) });
        setups.sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
        const src = body.file ? (setups.find((s) => s.file === body.file) ?? setups[0]) : setups[0];
        const bufBase = readFileSync(src.file);
        const cur = parseSetup(bufBase);
        const carEf = src.car || carName;
        // i DATI VERI: consumo dall'ultima telemetria (o dal vivo) + pressioni dal vivo
        const radiceTelem = join(cartella, 'MoTec');
        const dirRes = paths.resultsDirs?.[0] ?? join(cartella, 'Results');
        let sessions = collectSessions(radiceTelem, dirRes, { car: carEf, track: trackName || undefined, limit: 4 });
        if (!sessions.length) sessions = collectSessions(radiceTelem, dirRes, { car: carEf, limit: 4 });
        const tyre = tyreClassOf(carEf);
        let fixViva = null;
        if (liveNow?.live) {
          try {
            fixViva = startPsiFromLive({
              livePsi: liveSetupSignals({ raw: liveNow.raw, player: liveNow.player })?.livePsi ?? null,
              target: tyre?.target ?? null,
              coldNow: Number(cur.tires?.[0]?.pressure),
              coldByWheel: (cur.tires ?? []).map((t) => Number(t.pressure)),
            });
          } catch { /* senza vivo si va di telemetria */ }
        }
        const sess = sessions[0] ?? null;
        const fuelPerLap = (liveNow?.live && Number(liveNow.player?.fuelPerLap) > 0) ? Number(liveNow.player.fuelPerLap) : (sess?.fuelPerLap ?? null);
        /* NOME AUTO-PISTA-SESSIONE (5/11 sera, richiesta Mauro: «vorrei che lo
           creasse con il nome auto-pista: gara o qualifica, pioggia etc»): il
           file si chiama «Ferrari 296 GT3 - Brands Hatch - Qualifica», la
           forma che si legge al volo nella lista CARICA di EVO. */
        /* I GIRI della gara sono quelli del ROUND che stai correndo (6/11
           notte): chiesto «gara» su un weekend da 3 giri, il vecchio default
           10 produceva una carta da 23 L mentre ⚡ ne scriveva una da 6 — due
           carte per la stessa gara. Chi scrive i giri nella frase
           («gara a 12 giri») comanda sempre. */
        let cardLaps = null;
        try { const card = raceCard(ladder, state, { car: carEf }); cardLaps = card?.round?.laps ?? card?.baseLaps ?? null; } catch { /* senza scheda resta il chiamante */ }
        const giriGara = int.raceLaps ?? giriGaraDa({ cardLaps, bodyLaps: body.raceLaps });
        const nomeBase = nomeFileSetup({
          car: carEf,
          track: trackName || src.track || null,
          tipo: int.tipo,
          raceLaps: giriGara,
        });
        const piano = pianoSetup({
          tipo: int.tipo,
          raceLaps: giriGara,
          cur,
          sessione: Number(fuelPerLap) > 0 ? { fuelPerLap } : null,
          live: fixViva?.pressures ? { psi: fixViva.pressures } : null,
          tyreTarget: tyre?.target ?? null,
          nome: nomeBase,
        });
        if (!piano) return sendJson(res, 200, { ok: false, hint: tr({ it: 'Non sono riuscito a costruire il piano: apri il pannello del meccanico e riprova.', en: 'Could not build the plan: open the mechanic panel and retry.' }) });
        let scritto = null;
        /* 6/11 (la benzina che restava a 30 L): il piano SENZA nessuna leva
           reale NON tocca il disco — un file di soli 30 L col nome della sera
           era una promessa falsa. La risposta di pianoSetup lo spiega già:
           qui basta non scrivere. Il file nuovo (quando c'è) non sovrascrive
           mai: contatore « (2)» davanti all'esistente. */
        if (esegui && Object.keys(piano.edits).length) {
          // NOME GIUSTO e MAI distruzione: se «Qualifica.carsetup» esiste già
          // si sale col contatore « (2)», « (3)»… il file vecchio resta al posto suo.
          let nome = nomeBase;
          let dest = join(dirname(src.file), `${nome}.carsetup`);
          for (let i = 2; existsSync(dest); i++) {
            nome = `${nomeBase} (${i})`;
            dest = join(dirname(src.file), `${nome}.carsetup`);
          }
          const out = writeSetupCopy(bufBase, dest, piano.edits);
          /* VERIFICA SUL FILE SCRITTO (5/11 sera, «la benzina è rimasta 30 L»):
             non basta che il piano chieda i litri — si rilegge il file appena
             scritto e si confronta ogni campo toccato. Se un campo non è
             atterrato lo si dice nella risposta: mai una promessa che il disco
             non mantiene. */
          const dopoFile = out.setup ?? parseSetup(readFileSync(dest));
          const dec1v = (v) => Math.round(Number(v) * 10) / 10;
          const verifica = [];
          if (piano.edits.fuel?.liters != null) {
            const voluto = Number(piano.edits.fuel.liters);
            const atterrato = Number(dopoFile.fuel?.liters);
            verifica.push({ campo: 'benzina', voluto: dec1v(voluto), scritto: Number.isFinite(atterrato) ? dec1v(atterrato) : null, ok: Number.isFinite(atterrato) && Math.abs(atterrato - voluto) <= 0.06 });
          }
          (piano.edits.tires ?? []).forEach((t, i) => {
            if (t?.pressure == null) return;
            const voluto = Number(t.pressure);
            const atterrato = Number(dopoFile.tires?.[i]?.pressure);
            verifica.push({ campo: `gomma ${['LF', 'RF', 'LR', 'RR'][i] ?? i}`, voluto: dec1v(voluto), scritto: Number.isFinite(atterrato) ? dec1v(atterrato) : null, ok: Number.isFinite(atterrato) && Math.abs(atterrato - voluto) <= 0.06 });
          });
          const falliti = verifica.filter((v) => !v.ok);
          scritto = { nome, file: dest, changes: out.changes, verifica };
          if (falliti.length) {
            piano.risposta += tr({
              it: ` ⚠️ Ma ATTENZIONE: nel file scritto non tornano ${falliti.map((v) => `${v.campo} (${v.scritto ?? '?'} invece di ${v.voluto})`).join(', ')} — non fidarti di quei valori, li rivediamo insieme.`,
              en: ` ⚠️ But CAREFUL: in the written file ${falliti.map((v) => `${v.campo} (${v.scritto ?? '?'} instead of ${v.voluto})`).join(', ')} did not stick — do not trust those values.`,
            });
          }
          // il piano entra nel ciclo dell'allievo: con la sessione nuova il
          // round si chiude e il meccanico impara ANCHE dalle richieste a voce
          try {
            const giri = (sess?.laps ?? []).filter((l) => l.durationSec > 15);
            const bestLap = giri.length ? Math.min(...giri.map((l) => l.durationSec)) : null;
            if (bestLap > 0) registraRound({ carName: carEf, trackDisplay: trackName, advices: [{ vedi: int.tipo, prio: 1, text: `Setup «${nome}»: ${piano.note.join(' ')}` }], sessFile: sess?.file ?? null, bestLap });
            /* LA PROVA A/B (6/11): anche un setup a voce («Qualifica», «Gara 8
               giri») è una carta nuova da verificare col cronometro. */
            apriProva({
              car: carEf, track: trackName || src.track || null,
              baseFile: src.file, baseName: src.name,
              setupFile: dest, setupName: nome,
              changes: out.changes, bestPrima: bestLap, sessFile: sess?.file ?? null,
            });
          } catch { /* la memoria non ferma la scrittura */ }
        }
        return sendJson(res, 200, { ok: true, tipo: int.tipo, car: carEf, track: trackName, base: { file: src.file, nome: src.name }, nome: nomeBase, risposta: piano.risposta, righe: piano.righe, note: piano.note, scritto });
      } catch (e) {
        return sendJson(res, 500, { error: tr({ it: 'Il meccanico ha inciampato: ', en: 'The mechanic stumbled: ' }) + String(e?.message ?? e) });
      }
    }
    case 'setup-apply': {
      // IL CICLO dei setup: giro → MoTeC → patcha le pressioni consigliate DAI
      // DATI VERI su una COPIA del .carsetup in uso («… — EVO-consigliato»);
      // a gioco APERTO si carica con CARICA/SALVA → il gioco re-legge il disco.
      try {
        const savedDir = paths.dataDirs?.[0] ?? '';
        if (!savedDir) return sendJson(res, 409, { error: 'Cartella Saved Games/ACE non impostata (Impostazioni).' });
        const carName = String(body.car ?? '').trim();
        let trackName = String(body.track ?? '').trim();
        // GUARDIA «PISTA GIUSTA» (lezione 22/10 ore 20:49: la copia «— EVO-consigliato»
        // della RX-7 finì su Nürburgring mentre ai box Paul Ricard): se EVO è aperto
        // con una sessione attiva, la pista VERA del gioco comanda — richiesta per
        // un'altra pista ⇒ NON scrivo (il gioco non mostra i setup salvati di una
        // pista diversa); richiesta senza pista ⇒ uso quella live.
        // liveTrack serve anche al consiglio: con EVO in sessione la correzione
        // LIVE comanda su quella da telemetria (vedi startPsiFromLive più sotto).
        let liveTrack = null;
        let liveNow = null;
        try {
          if (await syncLiveReader() !== 'off') {
            // UN solo snapshot con i blocchi raw: pista, pressioni, freni,
            // temperature e consumo vengono dallo stesso tick.
            liveNow = liveReader()?.snapshot?.({ raw: true }) ?? null;
            liveTrack = liveNow?.session?.track ?? null;
          }
        } catch { /* live non disponibile: si decide senza */ }
          if (liveTrack) {
            if (trackName && !trkSame(liveTrack, trackName)) return sendJson(res, 200, { ok: false, track: trackName, liveTrack, hint: tr({ it: `Il gioco è su «${liveTrack}» ma la richiesta mira a «${trackName}»: non scrivo la copia «EVO-consigliato» su una pista diversa (in gioco la lista CARICA mostra solo auto + pista corrente). Aggiorna il pannello se la pista è cambiata.`, en: `The game is at «${liveTrack}» but the request targets «${trackName}»: I won't write the «EVO-consigliato» copy on a different track (in game the LOAD list shows only current car+track). Refresh the panel if the track changed.` }) });
            trackName = trackName || liveTrack;
          }
        // listSetups aggiunge già "Car Setups": gli va la radice di Saved Games
        const setupsRootDir = savedDir.replace(/[\\/]$/, '');
        let setups = carName ? listSetups(setupsRootDir, { car: carName, track: trackName }) : listSetups(setupsRootDir);
        if (!setups.length && carName) setups = listSetups(setupsRootDir, { car: carName });
        // il nome ladder ("Mazda RX-7 FD") e la cartella che EVO crea ("Mazda RX-7 FD
        // Spirit R") NON coincidono: fallback fuzzy con sameCar (match per prefisso)
        if (!setups.length && carName) {
          const all = listSetups(setupsRootDir);
          const fuzzy = all.filter((s) => carSame(s.car, carName) && (!trackName || trkSame(s.track, trackName)));
          if (fuzzy.length) setups = fuzzy;
        }
        console.log('[setup-apply] savedDir=', savedDir, '| setups trovati=', setups.length, setups.map((s) => s.file).slice(0, 3));
        if (!setups.length) return sendJson(res, 200, { ok: false, hint: tr({ it: `Nessun .carsetup per «${carName || 'questa auto'}»: DENTRO EVO, nel setup, salva una volta il setup con CARICA/SALVA (anche i valori default): poi l'applicazione funziona.`, en: `No .carsetup for «${carName || 'this car'}»: INSIDE EVO, in the setup screen, save the setup once with LOAD/SAVE (default values are fine): then the apply step works.` }) });
        // (stessa lezione) se la pista richiesta non è quella dei .carsetup trovati
        // (caso: pista chiesta e NO setup di quella pista → fallback «tutta la vita»),
        // la copia finirebbe NELLA CARTA SBAGLIATA e in gioco non si vedrebbe: rifiuto.
        // il pool del PONTE: tutti i base setup dell'auto su ALTRE piste, il più recente primo —
        // la GUI li propone nel menù del «🌉 PONTALO QUI» (se ne vuole uno preciso, non solo il primo)
        const bridgePool = setups.filter((s) => !s.name.includes('EVO-consigliato')).sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
        if (trackName && setups[0]?.track && !trkSame(setups[0].track, trackName)) return sendJson(res, 200, { ok: false, track: trackName, foundTrack: setups[0].track, hint: tr({ it: `Nessun .carsetup per questa auto su «${trackName}» (ho trovato solo il base su «${setups[0].track}»): salvare UNA volta un setup in EVO su quella pista e riprova — la copia «EVO-consigliato» va accanto alla sua base, altrimenti il gioco non la mostra.`, en: `No .carsetup for this car at «${trackName}» (found the base only at «${setups[0].track}»): save a setup in EVO on that track once and retry — the «EVO-consigliato» copy goes next to its base, or the game won't show it.` }), bridgeAvailable: true, bridgeOptions: bridgePool.map((s) => ({ name: s.name, track: s.track, file: s.file })), bridgeSrcFile: bridgePool[0]?.file ?? null });
        // la base del consiglio è SEMPRE il TUO setup: le copie «— EVO-consigliato»
        // generate dai click precedenti si escludono (altrimenti: doppio suffisso e
        // il consiglio parte dai valori già corretti, non dal tuo file)
        setups = setups.filter((s) => !s.name.includes('EVO-consigliato'));
        if (!setups.length) return sendJson(res, 200, { ok: false, hint: tr({ it: `C'è solo la copia «EVO-consigliato»: salva tu un setup col tuo nome in EVO (CARICA/SALVA) e riprova.`, en: 'There is only the «EVO-recommended» copy: save your own setup in EVO (LOAD/SAVE) and try again.' }) });
        setups.sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
        const src = body.file ? (setups.find((s) => s.file === body.file) ?? setups[0]) : setups[0];
        const srcBuf = readFileSync(src.file);
        const cur = parseSetup(srcBuf);
        const carEff = src.car || carName;
        /* UNA CARTA SOLA (6/11 notte, Mauro: «il meccanico mi dà 2 con nome
           diverso»). Se il file scelto è una carta GIÀ scritta dal meccanico
           (lo dice la memoria delle prove), ⚡ la AGGIORNA col suo nome invece
           di creare «… — EVO-consigliato»: sul Golf a Brands Hatch le due
           carte dicevano cose diverse sulla stessa gara (23 L contro 6 L,
           pressioni 31 contro 35 PSI) e in EVO non si sapeva quale caricare.
           Il base del pilota resta intoccato come sempre: quella strada fa la
           copia col suffisso. */
        const cartaMeccanico = cartaDelMeccanicoSuFile(src.file);
        /* GIRI DI GARA per la benzina: la SCHEDA DEL ROUND comanda sulla
           telemetria (che racconta un'altra sessione). Senza scheda resta il
           numero del chiamante, poi il default di sempre. */
        let cardLaps = null;
        try { const card = raceCard(ladder, state, { car: carName || null }); cardLaps = card?.round?.laps ?? card?.baseLaps ?? null; } catch { /* senza scheda resta il chiamante */ }
        const giriGara = giriGaraDa({ cardLaps, bodyLaps: body.raceLaps });
        // SUGGERIMENTO dalle telemetrie vere (stessi motori del pannello Telemetria);
        // SENZA .ld: fallback LIVE — le pressioni a caldo DALLA SHARED MEMORY di EVO
        // (stai girando adesso? il consiglio arriva da quel giro, serve il target di classe)
        const motecRoot = join(savedDir, 'MoTec');
        const resDir = paths.resultsDirs?.[0] ?? join(savedDir, 'Results');
        let sessions = collectSessions(motecRoot, resDir, { car: carEff, track: trackName || undefined, limit: 8 });
        if (!sessions.length) sessions = collectSessions(motecRoot, resDir, { car: carEff, limit: 8 });
        const tyre = tyreClassOf(carEff);
        const raceAdvice = sessions.length ? racePressureAdvice(sessions, { target: tyre?.target ?? null, raceLaps: giriGara }) : null;
        const advice = sessions.length ? pressureAdvice(sessions, { target: tyre?.target ?? null }) : null;
        // AI BOX COMANDA IL LIVE (4/11): la correzione dai dati di adesso
        // (pressioni a caldo + target classe, regola dei 4 PSI) scrive
        // l'«EVO-consigliato» anche quando esiste una telemetria vecchia: decide
        // il giro appena fatto, non il .ld di un'altra sessione.
        const liveSignals = liveNow?.live ? liveSetupSignals({ raw: liveNow.raw, player: liveNow.player }) : null;
        const liveFix = liveNow?.live
          ? startPsiFromLive({
            livePsi: liveSignals?.livePsi ?? null,
            target: tyre?.target ?? null,
            coldNow: Number(cur.tires?.[0]?.pressure),
            coldByWheel: cur.tires?.map((t) => Number(t.pressure)),
          })
          : null;
        const liveHot = liveFix?.hot ?? null;
        const startPsi = liveFix?.startPsi ?? raceAdvice?.raceStartPsi ?? advice?.suggestedStartPsi ?? null;
        const basis = liveFix
          ? tr({ it: `live (${liveFix.hot.length} gomme a caldo, media ${liveFix.hotAvg} PSI)`, en: `live (${liveFix.hot.length} hot tyres, avg ${liveFix.hotAvg} PSI)` })
          : raceAdvice?.basis?.kindLabel ?? advice?.basis?.kindLabel ?? (sessions.length ? 'telemetria' : null);
        if (startPsi == null || !Number.isFinite(startPsi)) {
          return sendJson(res, 200, { ok: false, hint: tr({ it: 'Serve una base per la pressione: O scarica una telemetria valida (sessione con registrazione attiva), O fai un giro adesso con questa auto (consiglio DAI DATI LIVE del gioco).', en: 'A base lap is needed for pressure: either download valid telemetry (a session with recording on), or do a lap now with this car (advised from the game LIVE DATA).' }) });
        }
        const nTire = Math.max(0, cur.tires?.length ?? 4);
        const tires = [];
        for (let i = 0; i < nTire; i++) {
          const now = Number(cur.tires[i]?.pressure);
          const perWheel = Number(liveFix?.pressures?.[i]);
          const want = Number.isFinite(perWheel) ? perWheel : startPsi;
          tires.push(Math.abs(now - want) < 0.05 ? {} : { pressure: Math.round(want * 10) / 10 });
        }
        /* OLTRE LE PRESSIONI (Mauro 21/10: «applica tutto assieme»): le regole
          SIONO dentro mechanicExtraEdits (setup.mjs) — ognuna legata a un SEEGNALO
           misurato e ogni patch solo SE il file contiene il campo. Le maniglie:
           aero (bumpstop→alta post, profilo→ala post), camber (proxy termico),
           bias freni (termico per asse), TC (quota d'intervento del flag .ld).
           Diff: la 296 non espone i campi nel save — non selezionabile qui. */
        const s0 = sessions[0] ?? null;
        const lastLap = (s0?.laps ?? []).filter((l) => l.durationSec > 15).slice(-1)[0] ?? null;
        const bumpOf = (ws) => Math.max(0, ...ws.map((w) => s0?.bump?.[w]?.contactPct ?? 0));
        const latest = {
          trackOk: !s0?.track || trkSame(s0.track, trackName || src.track || ''),
          bumpMax: Math.max(0, ...['LF','RF','LR','RR'].map((w) => s0?.bump?.[w]?.contactPct ?? 0)),
          // PER ASSE (meccanico 21/10 «tutti gli strumenti»): se tocca il fondo
          // DAVANTI si alza il davanti, non solo il posteriore
          bumpAxis: { front: bumpOf(['LF','RF']), rear: bumpOf(['LR','RR']) },
          camberProxy: s0?.camberProxy ?? {},
          brakes: lastLap?.brakes ?? {},
          tcPct: s0?.assist?.tcPct ?? null,
          // BENZINA di gara: consumo misurato × giri gara (+5% riserva)
          fuelPerLap: s0?.fuelPerLap ?? lastLap?.fuelUsed ?? null,
          raceLaps: giriGara,
        };
        // LIVE sopra la telemetria vecchia: freni, camber-proxy e consumo di
        // ADESSO decidono le patch; bumpstop/TC restano dal .ld perché il live
        // non ha la finestra del giro necessaria a misurarli.
        if (liveSignals) {
          if (liveSignals.brakes) latest.brakes = liveSignals.brakes;
          if (liveSignals.camberProxy) latest.camberProxy = liveSignals.camberProxy;
          if (liveSignals.fuelPerLap != null) latest.fuelPerLap = liveSignals.fuelPerLap;
          latest.live = true;
        }
        const tKey = trackName || src.track || null;
        const TRACK = tKey ? (TRACK_INFO[tKey] ?? Object.values(TRACK_INFO).find((t) => trkSame(t.name, tKey))) : null;
        // base di fabbrica per la regola 'raddrizzo l'asimmetria' (21/10)
        let setupDefaults = null;
        try {
          const dRaw = JSON.parse(readFileSync(join(DATA_DIR, 'setup-defaults.json'), 'utf8'));
          setupDefaults = (carEff && dRaw[carEff]) ?? Object.entries(dRaw).find(([k]) => !k.startsWith('_') && carSame(k, carEff))?.[1] ?? null;
        } catch { /* facoltativa */ }
        // tipo: il setup-apply è la copia che si carica in gara/pista — la
        // qualifica resta la carta a voce; se il chiamante lo dice, si usa.
        const mech = mechanicExtraEdits({ cur, latest, trackInfo: TRACK, defaults: setupDefaults, tipo: body.tipo ?? 'gara' });
        for (const te of mech.tiresExtra) {
          if (Number.isFinite(te.camber)) (tires[te.i] ??= {}).camber = te.camber;
          if (Number.isFinite(te.toe)) (tires[te.i] ??= {}).toe = te.toe;
        }
        const edits = { tires };
        for (const k of ['aero', 'brakes', 'elec', 'fuel', 'springs', 'dampers']) if (mech.patches[k] && Object.keys(mech.patches[k]).length) edits[k] = mech.patches[k];
        const extraChanges = mech.text;
        // ANTEPRIMA SENZA SCRITTURA (richiesta Mauro 21/10: prima di «installare»
        // il setup consigliato si vede CHIARA la lista delle migliorie).
        if (body.preview) {
          const dopo = cur.tires.map((t, i) => (tires[i]?.pressure ?? t.pressure));
          return sendJson(res, 200, {
            ok: true, preview: true, car: carEff, track: trackName || src.track,
            baseFile: src.file, baseName: src.name,
            startPsi, basis: basis ?? null,
            live: liveSignals,
            before: { pressures: cur.tires.map((t) => t.pressure) },
            after: { pressures: dopo },
            extraChanges,
            adviceText: (liveFix
              ? `Consiglio DAI DATI LIVE: a caldo ${liveFix.hot.map((v) => v.toFixed(1)).join('/')} PSI (media ${liveFix.hotAvg}), target ${tyre?.target ?? '?'} PSI a caldo → parti ${liveFix.startPsi} PSI da freddo (regola dei 4 PSI).`
              : null) ?? raceAdvice?.raceAdvice ?? advice?.advice ?? '',
          });
        }
        const dest = cartaMeccanico ? src.file : join(dirname(src.file), src.name + ' — EVO-consigliato.carsetup');
        const nomeDest = cartaMeccanico ? src.name : `${src.name} — EVO-consigliato`;
        const out = writeSetupCopy(srcBuf, dest, edits);
        /* LA PROVA A/B (6/11): il file scritto apre una prova con il giro di
           riferimento che ha generato il consiglio. Alla prima sessione nuova
           il pannello la chiude e dice se quella leva ha pagato. */
        let provaApertaOra = null;
        try {
          const ap = apriProva({
            car: carEff, track: trackName || src.track || null,
            baseFile: src.file, baseName: src.name,
            setupFile: dest, setupName: nomeDest,
            changes: out.changes, bestPrima: s0?.bestLapSec ?? null, sessFile: s0?.file ?? null,
          });
          if (ap.ok) provaApertaOra = ap.prova;
        } catch { /* la prova non blocca mai la scrittura */ }
        const after = parseSetup(readFileSync(dest));
        return sendJson(res, 200, {
          ok: true, file: dest, fileShort: `${nomeDest}.carsetup`, inPlace: !!cartaMeccanico,
          car: carEff, track: trackName || src.track, baseFile: src.file,
          prova: provaApertaOra,
          startPsi, changes: out.changes,
          live: liveSignals,
          extraChanges,
          aero: { before: { heightRear: cur.aero?.heightRear ?? null, wingRear: cur.aero?.wingRear ?? null }, after: { heightRear: after.aero?.heightRear ?? null, wingRear: after.aero?.wingRear ?? null } },
          before: { pressures: cur.tires.map((t) => t.pressure) },
          after: { pressures: after.tires.map((t) => t.pressure) },
          adviceText: (liveFix
            ? `Consiglio DAI DATI LIVE: a caldo ${liveFix.hot.map((v) => v.toFixed(1)).join('/')} PSI (media ${liveFix.hotAvg}), target ${tyre?.target ?? '?'} PSI a caldo → parti ${liveFix.startPsi} PSI da freddo (regola dei 4 PSI).`
            : null) ?? raceAdvice?.raceAdvice ?? advice?.advice ?? '',
          basis: basis ?? advice?.basis?.kindLabel ?? raceAdvice?.basis?.kindLabel ?? null,
          liveHot: liveHot ?? null,
        });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'setup-cover': {
      // QUADRO DI COPERTURA (1/11): per l'auto chiesta — quali piste hanno i
      // tuoi .carsetup (file e data dell'ultimo, per cartella EVO) e quali piste
      // hai GIRATO di recente senza setup: lì il ponte 🌉 è l'unica via senza
      // aprire EVO. Con body.all true: la STESSA computazione per TUTTE le auto
      // del garage (richiesta 1/11; overview in un colpo, senza spostare sedile).
      // Lettura pura; «pistaViva» (la pista della sessione LIVE, se c'è) arriva
      // a informativa — la guardia della scrittura resta in setup-bridge.
      try {
        const savedDir = paths.dataDirs?.[0] ?? '';
        if (!savedDir) return sendJson(res, 200, { ok: true, covered: [], missing: [] });
        const carReq = String(body.car ?? '').trim();
        const allReq = body.all === true;
        const rootDir = savedDir.replace(/[\\/]$/, '');
        const moTecRoot = join(savedDir, 'MoTec');
        const resultsRoot = paths.resultsDirs?.[0] ?? join(savedDir, 'Results');
        let pistaViva = null;
        try { if (await syncLiveReader() !== 'off') pistaViva = liveReader()?.snapshot?.()?.session?.track ?? null; } catch { /* live non disponibile: quadro senza */ }
        const carCover = (name) => {
          if (!name) return null;
          let setups = listSetups(rootDir, { car: name }).filter((s) => !s.name.includes('EVO-consigliato'));
          if (!setups.length) setups = listSetups(rootDir).filter((s) => carSame(s.car, name) && !s.name.includes('EVO-consigliato'));
          const byTrack = new Map();
          for (const s of setups) {
            let m; try { m = statSync(s.file); } catch { continue; }
            const e = byTrack.get(s.track) ?? { track: s.track, files: 0, last: 0, lastFile: null };
            e.files++;
            if (m.mtimeMs > e.last) { e.last = m.mtimeMs; e.lastFile = s.file; }
            byTrack.set(s.track, e);
          }
          const covered = [...byTrack.values()].map((e) => ({ ...e, last: new Date(e.last).toLocaleDateString('it-IT') })).sort((a, b) => a.track.localeCompare(b.track));
          // piste GIRATE di recente con quest'auto (motori MoTeC + Results): lì dove
          // giravi senza un .carsetup è là dove il ponte serve DAVVERO
          let sessions = collectSessions(moTecRoot, resultsRoot, { car: name, limit: carReq ? 40 : 12 });
          if (!sessions.length) sessions = collectSessions(moTecRoot, resultsRoot, { limit: carReq ? 60 : 80 }).filter((sn) => carSame(sn.car ?? '', name));
          const viste = [];
          for (const sn of sessions) { const tk = sn.track ?? null; if (tk && !viste.some((x) => trkSame(x, tk))) viste.push(tk); }
          // I SORGENTI DISPONIBILI (31/10, richiesta Mauro): non solo il più
          // recente — la GUI mette in tendina TUTTI i setup base dell'auto
          // (max 12, dal più nuovo), così si ponta quello che si vuole.
          const ordinati = setups.slice().sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
          const missing = viste.filter((tk) => !covered.some((c) => trkSame(c.track, tk))).slice(0, carReq ? 8 : 6).map((tk) => {
            const src = ordinati[0] ?? null;
            // SORGENTE ANCHE NEL QUADRO (1/11, richiesta Mauro: «proponi il
            // ponte diretto anche da lì»): il bottone 🌉 del quadro «Tutto il
            // garage» ha bisogno di srcFile (il base setup PIÙ RECENTE dell'auto
            // di quel chip) per pontare senza spostare il sedile.
            return { track: tk, srcName: src?.name ?? null, srcTrack: src?.track ?? null, srcFile: src?.file ?? null };
          });
          const srcs = [];
          if (!allReq) for (const s of ordinati.slice(0, 12)) {
            let m; try { m = statSync(s.file); } catch { continue; }
            srcs.push({ name: s.name, track: s.track, file: s.file, when: new Date(m.mtimeMs).toLocaleDateString('it-IT') });
          }
          return { car: name, covered, missing, sources: srcs };
        };
        // TUTTE le auto del garage: overview con i SORGENTI per il ponte
        // diretto (1/11, richiesta Mauro) — la GUI propone 🌉 in tendina sul
        // quadro stesso, senza più passare dal pannello dell'auto in mano
        if (allReq) {
          const cars = (state?.garage?.cars ?? []).map((g) => g.carName ?? null).filter(Boolean).map((name) => carCover(name)).filter(Boolean);
          return sendJson(res, 200, { ok: true, cars, pistaViva });
        }
        const me = carCover(carReq);
        return sendJson(res, 200, { ok: true, ...(me ?? { car: carReq, covered: [], missing: [] }), pistaViva });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'setup-history': {
      // la STORIA comparativa dei .carsetup dell'auto/pista (richiesta Mauro 21/10):
      // ogni riga = un salvataggio; i delta vs il RIGA PRECEDENTE cronologicamente
      // dicono con segno +/− se il meccanico (o tu) ha alzato o abbassato un campo.
      try {
        const savedDir = paths.dataDirs?.[0] ?? '';
        if (!savedDir) return sendJson(res, 200, { ok: true, rows: [] });
        const carReq = String(body.car ?? '').trim();
        let files = listSetups(savedDir, { car: carReq });
        if (body.track) {
          const onTrack = files.filter((s) => trkSame(s.track, body.track));
          if (onTrack.length) files = onTrack;
        }
        if (!files.length && carReq) files = listSetups(savedDir).filter((s) => carSame(s.car, carReq));
        files.sort((a, b) => statSync(a.file).mtimeMs - statSync(b.file).mtimeMs); // cronologico
        files = files.slice(-(Math.min(Number(body.limit) || 8, 12)));
        const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
        const dOf = (a, b, eps = 0.05) => (num(a) != null && num(b) != null && Math.abs(num(a) - num(b)) >= eps) ? Math.round((num(a) - num(b)) * 10) / 10 : null;
        const rows = [];
        let prev = null;
        for (const s of files) {
          let st = null;
          try { st = parseSetup(readFileSync(s.file)); } catch { continue; }
          const row = {
            name: s.name, when: new Date(statSync(s.file).mtimeMs).toLocaleString('it-IT'),
            pressures: (st.tires ?? []).map((t) => t.pressure ?? null),
            cambers: (st.tires ?? []).map((t) => t.camber ?? null),
            heightFront: st.aero?.heightFront ?? null, heightRear: st.aero?.heightRear ?? null,
            wingRear: st.aero?.wingRear ?? null, wingFront: st.aero?.wingFront ?? null,
            bias: st.brakes?.bias ?? null, tc1: st.elec?.tc1 ?? null, fuel: st.fuel?.liters ?? null,
            consigliato: s.name.includes('EVO-consigliato'),
          };
          if (prev) row.deltas = {
            pressures: row.pressures.map((v, i) => dOf(v, prev?.pressures?.[i])),
            cambers: row.cambers.map((v, i) => dOf(v, prev?.cambers?.[i])),
            heightRear: dOf(row.heightRear, prev.heightRear), heightFront: dOf(row.heightFront, prev.heightFront),
            wingRear: dOf(row.wingRear, prev.wingRear), wingFront: dOf(row.wingFront, prev.wingFront, 0.02), bias: dOf(row.bias, prev.bias),
            tc1: dOf(row.tc1, prev.tc1, 0.2), fuel: dOf(row.fuel, prev.fuel, 0.4),
          };
          rows.push(row);
          prev = row;
        }
        rows.reverse(); // la più recente prima (i delta restano vs la riga precedente cronologica)
        return sendJson(res, 200, { ok: true, rows });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'setup-bridge': {
      // PONTE FRA PISTE (1/11): il setup base della tua auto su un'altra pista
      // arriva in CARTELLA della pista di arrivo, byte per byte — così in EVO
      // puoi CARICARLO senza prima salvare a mano un setup finto a vuoto. Mai
      // overwriting: se il nome esiste già, il ponte lo sposta su « (2)».
      try {
        const savedDir = paths.dataDirs?.[0] ?? '';
        if (!savedDir) return sendJson(res, 409, { error: 'Cartella Saved Games/ACE non impostata (Impostazioni).' });
        const carName = String(body.car ?? '').trim();
        let destTrack = String(body.destTrack ?? '').trim() || String(body.track ?? '').trim();
        // STESSA GUARDIA dell'setup-apply: se EVO è aperto su una sessione, la
        // pista VIVA comanda — non scriviamo nella cartella di un'altra pista
        // che il gioco comunque non mostrerebbe.
        {
          let liveTrack = null;
          try { if (await syncLiveReader() !== 'off') liveTrack = liveReader()?.snapshot?.()?.session?.track ?? null; } catch { /* decide senza */ }
          if (liveTrack) {
            if (destTrack && !trkSame(liveTrack, destTrack)) return sendJson(res, 200, { ok: false, track: destTrack, liveTrack, hint: tr({ it: `Il gioco è su «${liveTrack}»: il ponte scrive solo su quella pista (lì EVO mostra i setup). Aggiorna il pannello se la pista è cambiata.`, en: `The game is at «${liveTrack}»: the bridge writes to that track only (that's where EVO shows setups). Refresh the panel if the track changed.` }) });
            destTrack = destTrack || liveTrack;
          }
        }
        if (!carName || !destTrack) return sendJson(res, 200, { ok: false, hint: tr({ it: 'Serve auto e pista di arrivo per il ponte.', en: 'Car and destination track are required for the bridge.' }) });
        // paranoia: la pista finisce in un percorso su disco — niente separatori né caratteri vietati da Windows
        if (/[\\/:*?"<>|]/.test(destTrack)) return sendJson(res, 400, { error: 'Nome pista non valido.' });
        const rootDir = savedDir.replace(/[\\/]$/, '');
        let all = listSetups(rootDir, { car: carName }).filter((s) => !s.name.includes('EVO-consigliato'));
        if (!all.length) all = listSetups(rootDir).filter((s) => carSame(s.car, carName) && !s.name.includes('EVO-consigliato'));
        if (!all.length) return sendJson(res, 200, { ok: false, hint: tr({ it: `Nessun setup base per questa auto: il ponte ha bisogno di UNA pista con almeno un .carsetup del tuo. Salva un setup in EVO (anche coi valori default) e riprova.`, en: `No base setup for this car: the bridge needs ONE track with at least a .carsetup of yours. Save a setup in EVO (default values are fine) and retry.` }) });
        // il setup c'è GIÀ su questa pista? il ponte non serve, si usa quello
        const onDest = all.filter((s) => trkSame(s.track, destTrack));
        if (onDest.length) return sendJson(res, 200, { ok: false, already: true, hint: tr({ it: `Sulla pista «${destTrack}» c'è già ${onDest.length === 1 ? 'un tuo setup' : 'tuo setup (' + onDest.length + ')'}: non serve il ponte — vai dritti al meccanico.`, en: `Track «${destTrack}» already has your setup: no bridge needed — go straight to the mechanic.` }) });
        all.sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
        const src = body.srcFile ? (all.find((s) => s.file === body.srcFile) ?? all[0]) : all[0];
        const r = bridgeSetup(rootDir, src.car, destTrack, src.file);
        if (!r.ok) return sendJson(res, 200, { ok: false, error: r.error, hint: tr({ it: `Il ponte non è riuscito: ${r.error}`, en: `The bridge failed: ${r.error}` }) });
        console.log('[setup-bridge]', src.car, ':', src.name, `(${src.track}) → «${destTrack}» =`, r.name);
        return sendJson(res, 200, { ok: true, file: r.file, name: r.name, bytes: r.bytes, fromTrack: src.track, destTrack, hint: tr({ it: `Pontato in pista: il tuo setup «${src.name}» di «${src.track}» è ora anche su «${destTrack}» («${r.name}», ${Math.round((r.bytes ?? 0) / 1024)} KB, termino identico). A gioco aperto: setup → CARICA → «${r.name}».`, en: `Bridged: your setup «${src.name}» from «${src.track}» is now also at «${destTrack}» («${r.name}», ${Math.round((r.bytes ?? 0) / 1024)} KB, byte-identical). In game: setup → LOAD → «${r.name}».` }) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'setup-save': {
      const patch = {};
      if (typeof body.dataDir === 'string' && body.dataDir.trim()) {
        const dir = body.dataDir.trim();
        let isDir = false; try { isDir = statSync(dir).isDirectory(); } catch { /* non esiste */ }
        if (!isDir) return sendJson(res, 400, { error: `La cartella dati non esiste: ${dir}` });
        patch.dataDir = dir;
      }
      if (typeof body.gameExe === 'string' && body.gameExe.trim()) {
        const exe = body.gameExe.trim();
        // da qui si lancia il gioco (cmd /c start): solo l'exe ufficiale di EVO,
        // solo un file esistente, mai una cartella di rete — così nessuna pagina
        // web può farsi eseguire un binario a scelta
        if (basename(exe).toLowerCase() !== GAME_EXE.toLowerCase()) return sendJson(res, 400, { error: tr({ it: `Serve il percorso completo di ${GAME_EXE}.`, en: `The full path to ${GAME_EXE} is required.` }) });
        if (exe.startsWith('//') || (exe[0] === '\\' && exe[1] === '\\')) return sendJson(res, 400, { error: 'Percorso di rete non consentito: il gioco deve stare su un disco locale.' });
        let isFile = false; try { isFile = statSync(exe).isFile(); } catch { /* non esiste */ }
        if (!isFile) return sendJson(res, 400, { error: `File non trovato: ${exe}` });
        patch.gameExe = exe;
      }
      if (!Object.keys(patch).length) return sendJson(res, 400, { error: tr({ it: 'Nessun percorso da salvare.', en: 'No path to save.' }) });
      const cfg = writeConfig(patch);
      const fresh = resolvePaths({ ...process.env, ACE_DATA: cfg.dataDir, ACE_ROOT: cfg.gameExe ? dirname(cfg.gameExe) : undefined });
      return sendJson(res, 200, { ok: true, setup: { dataDirs: fresh.dataDirs, resultsDirs: fresh.resultsDirs, gameExe: fresh.gameExe } });
    }
    case 'setup': return sendJson(res, 200, viewSetup(ladder));
    default: return false;
  }
}
