// uiapp-pub.mjs — il PUBLISHER dell'app «Cruscotto» in gioco (27/10/2026).
//
// L'app vive in Saved Games/ACE/mods/uiresources/ACEUIAppLoader/cruscotto/ e
// ci parla come Paddock parla col suo paddock.py: LEGGE file JSON dalla
// propria cartella, col nome `ui-<fascia>.json` dove <fascia> cambia ogni
// PERIODO_MS — il gioco tiene le risposte in cache, e il nome nuovo bypassa
// la cache (la stessa trucca è dentro paddock.js). Niente richieste HTTP
// verso il server del cruscotto (origine incrociata e il gioco non ce l'ha
// con le pagine statiche): solo lettura pura di un file, il lavoro pesante
// resta qui dentro.
//
// Il publisher NON tocca il save e NON tocca il gioco: costruisce da solo
// (ladder + stato, in processo) la vetrina di oggi e la scrive sul disco.
// Se la cartella del loader manca (mod non installata) resta zitto.

import { writeFileSync, readdirSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { savedGamesRoots, resolvePaths } from './paths.mjs';
import { agendaDay, racesOnDay, dateLabel, prossimoGiornoConGara, impegni } from './agenda.mjs';
import { context, SAVE_FILE, PROJECT } from './webui-env.mjs';
import { loadState, nodeById, standingsFor, playerStanding } from './state.mjs';
import { playerWorldSkill } from './world.mjs';
import { tr } from './lang.mjs';
// il libro delle piste (TRACK_INFO): il comando di cambio auto porta anche
// pista+layout come «Prepara tutto» li ha scritti — in gioco l'applet fa
// la SEQUENZA COMPLETA di Paddock (tipo di gara → pista → auto) (28/10 PM)
import { specFor, currentWeekendTrack } from '../tools/set-track.mjs';
// l'istantanea della gara al volo: la LETTURA del blocco Race è sempre
// innocua (anche a gioco aperto) e vale alla card del cruscotto i FATTI
// veri (durata, banda AI, pista) invece dei soli promé.
import { currentInstantRace, INSTANT_FILE } from '../tools/set-instantrace.mjs';
// IL REGISTRO DELLA DURATA (4/11, card arricchite): l'ultima scrittura vera
// del bottone «Gara al volo» arriva anche alla card demo del Cruscotto — la
// STESSA fonte della GUI (endpoint gara-veloce-registro), un solo formatter.
import { leggiRegistro, formattaRigaRegistro } from '../tools/_gara-veloce.mjs';
import { eventCard } from './events.mjs';
import { leggiStoreJson } from './uiapp-store.mjs';
// I CONSIGLI IN GIOCO (30/10, «consiglio anche in gioco»): la radio
// dell'ingegnere esce nel payload della vetrina. liveReader è il
// SINGOLETTO di shmem e il publisher gira NEL processo del webui
// (startUiappPublisher al boot): lo snapshot è già caldo, il costo per
// fascia è solo il calcolo puro di engineerLive (leggero, come il tick
// della voce). Un'altra lettura MMF? NESSUNA: stessa fonte, zero doppioni.
import { liveReader } from './shmem.mjs';
import { engineerLive } from './engineer.mjs';
// LA RADIO DEL COPILOTA («Pitwall con la radio», 31/10): le ultime frasi
// pronunciate dal narratore (già sul disco nel registro della voce) escono
// NELLA PITWALL in gioco — pannello che ascolta. File e lettura UNICI, da
// voce-copilota.mjs; il memo sotto evita una rilettura per fascia.
import { leggiRadioVoce, LOG_VOCE_FILE } from './voce-copilota.mjs';
import { statSync } from 'node:fs';
// il VERDETTO DI GIORNATA (29/10, «bottone verdetto sul cruscotto»): la
// STESSA fonte della CLI e dell'endpoint GUI — un aggregato, nessuna
// formula da duplicare. La LETTURA dei Results è sola lettura.
import { verdettoGiornata } from '../tools/verdetto-giornata.mjs';
// LA LINGUA DEI MESSAGGI (31/10, «integra maggiormente il cruscotto»): il
// traduttore dei messaggi vecchi (testo IT di nascita) è QUELLO della GUI —
// un solo libro di traduzione, niente copie da tenere in pari.
import { legacyMessageEn } from './webui-views.mjs';

export const PERIODO_MS = 2500;          // il ritmo delle fasce: 2.5 secondi esatti
export const APP_KEY = 'cruscotto';      // il nome della cartella-app nel loader

// la scadenza di un «fresco»: il pending della ronda e la finestra della
// demo (vetrinaCustom = gara al volo) valgono UNO STESSO giorno — la
// costante era dentro comandoAuto; da qui la usa anche azioniPulsanti
// (i dati dei bottoni) e la finestra dell'evento per restare allineati
// senza copie da tenere in pari.
const PENDING_SCADENZA_MS = 24 * 3600 * 1000;

// LA FINESTRA DELL'EVENTO (30/10, fine gara R5 e torna la F40 a sorpresa):
// lo STESSO taglio della ronda del 29/10 («appena esco da una gara, sul menu
// riparte la stessa gara: non deve essere così, solo quando lancio da
// Prepara e Divertiti») applicato all'evento speciale. Prima il comando auto
// «evento» era a STALLO: un invito accettato (nel save: dal 23/10!) montava
// la SUA auto nel menu OGNI volta che il pending moriva — esci da una gara
// con l'R5 e al ritorno trovi l'F40 del premio che non hai ancora chiesto.
// Ora l'auto comando evento esce SOLO dentro la finestra armata da
// «Prepara tutto e divertiti» dell'evento (event-prep in webui.mjs scrive
// state.eventoPreparato = l'ora del click): come la ronda, 24 ore di
// validità, poi il canale torna muto e il pannello in gioco (bottone)
// resta la via a mano.
const EVENTO_FIDUCIA_MS = PENDING_SCADENZA_MS;   // 24 h, la stessa della ronda

/** La cartella dell'app dentro il loader, o null se la mod non c'è:
 *  si prende il primo base «Saved Games» che ha l'App Loader installato
 *  (funziona pure con la cartella di sistema ricollocata). */
export function cartellaApp(env = process.env, appKey = APP_KEY) {
  for (const root of savedGamesRoots(env)) {
    const dir = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', appKey);
    if (existsSync(dir)) return dir;
  }
  return null;
}

let guiBaseUrl = null;
/** L'URL della GUI del cruscotto (server webui) per il collegamento «Mondiale
 *  completo»: lo start del server lo passa a startUiappPublisher. */
export function setGuiBaseUrl(url) {
  if (url && typeof url === 'string') guiBaseUrl = url.replace(/\/$/, '');
}

/** La vetrina di oggi: STESSO algoritmo dell'<agenda> del server
 *  (racesOnDay fa la stessa calibrazione per la GUI del browser) —
 *  niente logica nuova da tenere allineata, due file, una sola fonte. */
export function vetrina(ladder, state) {
  const giorno = agendaDay(state);
  if (state == null || giorno == null) {
    return { ok: 0, no_carriera: true, quando: new Date().toISOString(), giorno: null, iscritte: [], gare: [] };
  }
  const iscritte = (impegni(ladder, state).lista ?? []).map((x) => ({
    nodeId: x.nodeId, nome: x.display ?? x.nodeId ?? '',
    stagione: x.season ?? null, prossimoGiorno: x.nextRaceDay ?? null, track: x.track ?? null,
  }));
  const gare = (racesOnDay(ladder, state, giorno) ?? []).map((g) => {
    const cars = Array.isArray(g.node?.cars) ? g.node.cars : [];
    return {
      nodeId: g.node.nodeId, nome: g.node.display, disciplina: g.node.discipline,
      ronda: (g.index ?? 0) + 1, totalRonde: g.node.calendar?.length ?? 0,
      stagione: g.season, track: g.track, giri: g.laps ?? null, ora: g.hour ?? null,
      meteo: ladder.weatherNames?.[String(g.weather)] ?? null,
      stato: tr({
        it: g.stato === 'iscritto' ? 'iscritto' : (g.fattibile ? 'disponibile' : 'bloccata'),
        en: g.stato === 'iscritto' ? 'signed' : (g.fattibile ? 'available' : 'locked'),
      }),
      fattibile: !!g.fattibile, iscritto: g.stato === 'iscritto', isCorrente: !!g.isCurrent,
      inRitardo: !!g.late, sulProgramma: !!g.onSchedule,
      griglia: cars.length === 1 ? 'monomarca' : 'multimarca',
      premio: g.node.econ?.prize ?? 0,
      auto: cars.length ? (ladder.contentNames?.cars?.[cars[0]] ?? cars[0]) : null,
    };
  });
  return {
    ok: 1, quando: new Date().toISOString(),
    giorno, giornoLabel: dateLabel(giorno),
    prossimo: prossimoGiornoConGara(ladder, state),
    // INTEGRAZIONE 31/10 («integra maggiormente il cruscotto con il
    // server»): ciò che il server vede e il pannello NON mostrava — la
    // scheda della PROSSIMA ronda (stessa fonte di agenda: racesOnDay) e i
    // MESSAGGI DEL TEAM (stesso traduttore della GUI). Ogni blocco in try:
    // la vetrina non si rompe mai per un pezzo nuovo.
    prossimoApp: prossimoAppuntamento(ladder, state),
    messaggi: messaggiFascia(state),
    pilota: { nome: state?.driver?.name ?? '', saldo: state?.money ?? 0, rep: state?.rep ?? 0 },
    iscritte, gare,
    // MINI-CLASSIFICA della serie del giorno e PANNELLO mondiale (richieste
    // 28/10): entrambe calcolate con le funzioni UFFICIALI del server
    // (standingsFor / playerWorldSkill) così il numero in gioco è lo stesso
    // della GUI del browser. Ogni blocco in try: la vetrina non si rompe mai
    // per una statistica nuova.
    classifica: miniClassifica(ladder, state),
    mondo: pannelloMondo(ladder, state),
    // COMANDO IN DIRETTA (28/10, fa come Paddock): se c'è la gara
    // preparata col suo nome auto completo, il cruscotto in gioco la
    // imposta nel menu di EVO col canale menu (niente riavvio).
    comando: comandoAuto(ladder, state),
    // I BOTTONI «Prepara e divertiti» IN GIOCO (3/11, «implementalo sul
    // cruscotto per i bottoni prepara e divertiti di entrambi, anche eventi
    // speciali»): il SISTEMA immediato c'è già — il ponte comandi del
    // Cruscotto è lo stesso di Paddock installato sul PC (corriSetcar →
    // corriEvento → corriAvvia in cruscotto.js) e un comando AUTO esce
    // a ogni tick automaticamente (comandoAuto sopra). Le azioni sono l'ALTRA
    // metà, la MANUALE: i DATI per i due bottoni del pannello, uno per la
    // ronda preparata (sequenza completa: tipo gara → pista → auto → avvia,
    // come Paddock) e uno per l'evento speciale accettato (SOLO auto, il
    // weekend non si tocca). Il canale automatico resta VIVO: se la
    // presa automatica del comando manca (silenzio dall'ack, finestre
    // chiuse), l'amico preme il bottone e riparte la STESSA sequenza dal
    // pannello — con gli STESSI id, così l'ack fissa le ripubblicazioni.
    // LA STORIA DEL COMANDO nel tooltip («storia del comando nel tooltip»,
    // 31/10 notte): i righe di memoria dei comandi — scheda aperta = che
    // cosa è passata per il menu dell'auto, inviata e/o confermata.
    storia: storiaComandoFascia(),
    azioni: azioniPulsanti(ladder, state),
    // IL VERDETTO DI GIORNATA (29/10): riepilogo compatto di oggi per il
    // pannello in gioco (bottone «Verdetto di giornata»). null = giornata
    // senza gare (o senza carriera): il pannello resta nascosto, non ruvido.
    verdetto: verdettoFascia(state),
    // LA SINCRONIZZAZIONE «PREPARA E DIVERTITI» (29/10, «arricchisci il
    // semaforo»): il pallino della connessione in punta al pannello la legge
    // (cruscotto.js) e dice se il server è allineato con la preparazione
    // corrente — ronda armata con la sua finestra del via, o gara al volo.
    prepara: preparaFascia(state),
    // I CONSIGLI IN GIOCO (30/10): la radio dell'ingegnere, STESSA del
    // pannello GUI («Consigli dal BOX») e del copilota, in una firma leggera.
    // Tips vuoto a schermo spento: il gruppo in gioco è solo quando c'è.
    consigli: consigliFascia(),
    guiUrl: guiBaseUrl ?? (typeof process !== 'undefined' ? process.env.PITWALL_GUI_URL : null) ?? null,
  };
}

/** Il comando `setcar` per la vetrina: la gara del giorno preparata
 *  (state.pending) se il contenuto del campo car è un nome conosciuto,
 *  con l'impronta del pending (id) per far sì che l'applet la applichi
 *  SOLO UNA volta per preparazione; pista+layout (dal libro TRACK_INFO,
 *  gli stessi che «Prepara tutto» scrive per la ronda); il tutto null
 *  se l'auto non è riconosciuta o non c'è la gara del giorno.
 *  EVENTI SPECIALI (27/10 19:20, F40 rimasta R5 dal vivo): «Prepara e
 *  divertiti» NON scrive state.pending (l'evento vive in gara
 *  personalizzata, lezione 23/10) — quindi il comando esce dalla CARD
 *  dell'evento attivo, tipo `evento`: in gioco l'applet seleziona SOLO
 *  l'auto (niente tipo gara/pista: la gara personalizzata non si tocca). */
/** LA PROSSIMA RONDA COME CARD (31/10, «integra maggiormente il cruscotto
 *  con il server»): lo slot del calendario GIÀ calcolato (prossimoGiornoConGara)
 *  diventa una scheda pronta per il pannello: quando, e le prime gare con
 *  pista/giri/ora/meteo/auto — gli STESSI campi delle card «gare di oggi»
 *  (vetrina), così il pannello li disegna con lo stesso formatter. null se
 *  non c'è nessuna ronda futura (o carriera assente). */
export function prossimoAppuntamento(ladder, state) {
  try {
    const giorno = prossimoGiornoConGara(ladder, state);
    if (giorno == null) return null;
    const gare = (racesOnDay(ladder, state, giorno) ?? []).slice(0, 3).map((g) => {
      const cars = Array.isArray(g.node?.cars) ? g.node.cars : [];
      return {
        nome: g.node?.display ?? '', ronda: (g.index ?? 0) + 1,
        track: g.track ?? null, giri: g.laps ?? null, ora: g.hour ?? null,
        meteo: ladder?.weatherNames?.[String(g.weather)] ?? null,
        auto: cars.length ? (ladder?.contentNames?.cars?.[cars[0]] ?? cars[0]) : null,
      };
    });
    return { giorno, quando: dateLabel(giorno), quante: gare.length, gare };
  } catch { return null; }
}

/** I MESSAGGI DEL TEAM (31/10): le ultime poste della bacheca della
 *  carriera (state.messages, lo stesso archivio che la GUI legge in
 *  /api/messages) nella LINGUA attiva — stesso traduttore della GUI
 *  (legacyMessageEn): i messaggi con textEn o con frase leggata si traducono
 *  una sola volta, qui e là identici. Come tutto il resto della vetrina:
 *  il try restituisce [] e il gruppo nel pannello non si vede. */
export function messaggiFascia(state, n = 4) {
  try {
    return (state?.messages ?? []).slice(-n).reverse().map((m) => {
      const it = typeof m?.text === 'string' ? m.text : '';
      const en = m?.textEn ?? legacyMessageEn(it) ?? null;
      return { testo: en ? tr({ it, en }) : it, at: m?.at ?? null, kind: m?.kind ?? 'info' };
    });
  } catch { return []; }
}

/** Etichetta d'emergenza derivata dall'ID (1/11, «al volo come Paddock»):
 *  ks_mini_jcs_1990 → «Mini Jcs 1990». Serve SOLO come nome di vetrina quando
 *  il libro non ha l'auto: il riconoscimento VERO nel menu di EVO avviene per
 *  ID interno (car_model.name, cruscotto.js trovaAuto), non per questo nome. */
export function nomeDaCarId(id) {
  return String(id ?? '').replace(/^ks_/, '')
    .split('_').filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** L'ETICHETTA meteo (la card la porta dalle weatherNames della ladder, EN o
 *  IT indifferente) nel CODICE che il menu di EVO capisce: »Rain« → RAIN e
 *  via così. Le bagnate specifiche guarda PRIMA della pioggia generica (la
 *  stesso lezione del 2/11 in weather.mjs: 'light rain' contiene 'rain', con
 *  l'ordine sbagliato si partiva bagnato pesante al posto della drizzle).
 *  null = etichetta ignota: il comando esce SENZA meteo, come sempre. */
export const CODICI_METEO = [
  ['heavy rain', 'HEAVY_RAIN'], ['pioggia intensa', 'HEAVY_RAIN'], ['heavy', 'HEAVY_RAIN'],
  ['light rain', 'LIGHT_RAIN'], ['pioggia leggera', 'LIGHT_RAIN'], ['drizzle', 'LIGHT_RAIN'], ['light', 'LIGHT_RAIN'],
  ['rain', 'RAIN'], ['pioggia', 'RAIN'],
  ['scattered clouds', 'SCATTERED_CLOUDS'], ['nuvole sparse', 'SCATTERED_CLOUDS'], ['scattered', 'SCATTERED_CLOUDS'], ['few clouds', 'SCATTERED_CLOUDS'],
  ['overcast', 'OVERCAST'], ['nuvoloso', 'OVERCAST'], ['coperto', 'OVERCAST'], ['cloudy', 'OVERCAST'],
  ['clear', 'CLEAR'], ['sole', 'CLEAR'], ['sereno', 'CLEAR'], ['sunny', 'CLEAR'],
];
export function codiceMeteo(label) {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return null;
  const hit = CODICI_METEO.find((x) => s.includes(x[0]));
  return hit ? hit[1] : null;
}

export function comandoAuto(ladder, state) {
  try {
    const p = state?.pending;
    // la scadenza del pending (lezione 27/10 19:30) vive in testa al modulo:
    // azioniPulsanti (i bottoni) la condivide, nessuna coppia da tenere in pari.
    // VETRINA CUSTOM (28/10 sera, «deve farlo in automatico come paddock»):
    // una gara personalizzata (la demo endurance multi-classe) vive fuori
    // dalla carriera: la griglia la scrive il tool DIRETTAMENTE sul disco e
    // NIENTE passa da state.pending — che resta della ronda e comandava
    // sempre la SUA auto (R5 otto che si chiedeva la 296 GT3). Il campo
    // `vetrinaCustom` (car + startedAt, scritto da tools/vetrina-custom.mjs)
    // ha la PRIORITÀ su tutto per la SUA finestra (24h come il pending): il
    // comando esce tipo «evento» — SOLO SetCurrentCar, niente SetGameType/
    // SetTrack del weekend (la gara personalizzata adotta pista+griglia da
    // disco da solo). ACKato il comando il ramo TACE finché la finestra è
    // viva: senza il silenzio la ronda pendente riprimerebbe la SUA auto a
    // ogni fascia (ping-pong garage). Passata la finestra, le priorità
    // storiche (ronda → evento) tornano quelle.
    // LA PRIORITÀ DEL PREPARA NUOVISSIMO vale anche qui (30/10 sera, «no
    // c'è ancora la Ferrari»): una ronda nata DOPO l'armatura della demo
    // (pending.startedAt ≥ vetrinaCustom.startedAt) riprende la mano —
    // il ramo demo tace e il setcar della ronda esce lo stesso, ANCHE se
    // l'ack della demo è già nello store: la 296 GT3 armata prima del
    // «Prepara tutto» riportava la FERRARI a ogni fascia e, una volta
    // ackata, lasciava la ronda MUTA fino a scadenza (24 h). Demo armata
    // DOPO la ronda: la priorità resta alla demo (il gesto a mano vince,
    // com'era il 28/10). Nessun ping-pong col garage: la cura vive SOLO
    // nell'ordine di nascita.
    const demo = state?.vetrinaCustom;
    const rondaPiuFresca = (Date.now() - Number(p?.startedAt ?? 0)) < PENDING_SCADENZA_MS &&
      Number(p?.startedAt ?? 0) >= Number(demo?.startedAt ?? 0);
    if (demo?.car && !rondaPiuFresca) {
      const nomeDemo = ladder?.contentNames?.cars?.[demo.car] ?? (/^ks_[a-z0-9_]+$/.test(String(demo.car)) ? nomeDaCarId(demo.car) : null);
      if ((Date.now() - Number(demo.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        const idDemo = `demo:${demo.startedAt ?? 0}:${demo.car}`;
        if (confermati.has(idDemo)) return null;   // già nel menu di EVO: silenzio per tutta la finestra
        if (nomeDemo) return { id: idDemo, tipo: 'evento', nome: nomeDemo, carId: demo.car, pista: null, layout: null };
      }
    }
    if (p?.car) {
      const nome = ladder?.contentNames?.cars?.[p.car] ?? (/^ks_[a-z0-9_]+$/.test(String(p.car)) ? nomeDaCarId(p.car) : null);
      const idP = `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}`;
      // se quel comando è GIÀ stato eseguito dall'app (ack in ui_storage),
      // non torna in vetrina: si scende al ramo evento (27/10 19:30: il
      // pending vecchio confermato copriva per sempre il comando dell'evento
      // attivo — la F40 non arrivava mai al gioco)
      if (nome && !confermati.has(idP)) {
        const spec = p.trackNames?.[0] ? specFor(p.trackNames[0]) : null;
        // ORA + METEO AL VOLO (1/11, la STESSA scuola delle auto per id): la ronda
        // porta l'ora della card (p.hour, già nel pending) e l'ETICHETTA meteo
        // (p.weather, markPending); qui diventano codice comando ('RAIN' ecc.).
        // Vecchi pending senza meteo: campo null — il Cruscotto resta/a mano/là.
        const oraRonda = Number.isFinite(Number(p.hour)) && p.hour != null ? Number(p.hour) : null;
        const rondaComando = {
          id: idP, tipo: 'setcar', nome, carId: p.car,
          pista: spec?.name ?? null, layout: spec?.layout ?? null,
          ora: oraRonda, meteo: codiceMeteo(p.weather ?? null),
        };
        // SCADENZA anche qui (lezione 27/10, la stessa dei ramoscelli più
        // sotto): il pending NON ancora confermato, se ha più di un giorno,
        // lascia il campo all'evento attivo; fresco = la ronda comanda e via.
        if ((Date.now() - Number(p.startedAt ?? 0)) < PENDING_SCADENZA_MS) return rondaComando;
        // L'EVENTO NON MONTA PIÙ A STALLO (30/10, la F40 spuntata a fine gara):
        // serve l'armatura di «Prepara tutto e divertiti» dell'evento — solo
        // il click su quel tasto apre la finestra di 24 h. Senza, il ramo
        // evento esce e la ronda scaduta AUTO-NOTA torna SOPPRESSA (test 27/10:
        // «no silenzio» — gli id servono per l'ack); l'auto del premio si
        // mette a mano col bottone del pannello quando davvero la vuoi.
        const cardEv = eventCard(ladder, state);
        if (cardEv?.acceptedAt && cardEv.carName) {
          if (!eventoArmato(state)) return rondaComando;
          return { id: `evento:${cardEv.theme?.id ?? cardEv.eventId ?? '?'}:${cardEv.carName}`, tipo: 'evento', nome: cardEv.carName, carId: cardEv.prize?.carId ?? null, pista: null, layout: null };
        }
        return rondaComando;
      }
    }
    // evento attivo e accettato, auto nota: comando «evento» (solo auto).
    // id STABILE per evento (tema+auto), non a per-tick: altrimenti l'app
    // lo riproverrebbe a ogni fascia; l'ack in ui_storage lo spegne comunque.
    // PRIORITÀ ALLA RONDA (28/10 pomeriggio, "la Ferrari rientra"): mentre c'è
    // una ronda preparata (state.pending) l'evento NON riparte — chi sta per
    // correre la ronda trovava l'auto dell'evento impostata a sorpresa nel
    // menu (la Ferrari al posto dell'R5): il pend dei comandi confermati
    // lasciava scendere il ramo evento a ogni fascia. L'evento torna in
    // vetrina solo a ronda consumata (pending a null dall'import risultato).
    // MA LA RONDA NON IMMORTALE (lezione 27/10 19:30): un pending di risultati
    // mai importati (il pending muore SOLO al suo import) non deve seppellire
    // l'evento per sempre — scade dopo un giorno e lascia il campo al ramo
    // evento. Al «Prepara» nuovissimo invece torna la priorità della ronda
    // (il nuovo pending ha un nuovo startedAt e comanda).
    const rondaViva = state?.pending &&
      (Date.now() - Number(state.pending.startedAt ?? 0)) < PENDING_SCADENZA_MS;
    // LANCIO AUTOMATICO (28/10 sera, richiesta Mauro): se la ronda è viva MA
    // il suo comando setcar FU GIÀ CONFERMATO dall'app (ack in ui_storage —
    // l'auto nel menu di EVO è già quella), al posto del vecchio silenzio
    // esce il comando «avvia»: l'applet preme «Avvia sessione» da sola, lo
    // stesso comando del Paddock. Con l'ack dell'avvia già scritto si
    // torna al silenzio. L'EVENTO non riceve alcun avvia: lì le impostazioni
    // si mettono a mano dalla scheda — un avvio automatico partirebbe con
    // AI/ora/giri sbagliati (lezione 23/10). Solo ronda FRESCA: un pending
    // oltre la scadenza non deve mai riavviare una sessione da solo.
    if (rondaViva && p?.car) {
      // FINESTRA DELL'AVVIO (29/10, «appena esco da una gara, sul menu riparte
      // la stessa gara: non deve essere così, solo quando lancio da Prepara e
      // Divertiti»): il comando esce SOLO dentro la finestra armata da
      // markPending (FINESTRA_AVVIA_MS in race.mjs, 30 min). Pending nato
      // prima dello stampio o con la finestra chiusa: MAI un auto-via — le
      // tracce restano nella card del pannello, la si ripreme a mano.
      if (Date.now() > Number(p.avviaFino ?? 0)) return null;
      const nomeAvvia = ladder?.contentNames?.cars?.[p.car] ?? null;
      const idAvvia = `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}:avvia`;
      if (nomeAvvia && confermati.has(idAvvia.replace(/:avvia$/, '')) && !confermati.has(idAvvia)) {
        return { id: idAvvia, tipo: 'avvia', nome: nomeAvvia, pista: null, layout: null };
      }
    }
    const card = rondaViva ? null : eventCard(ladder, state);
    if (card?.acceptedAt && card.carName && eventoArmato(state)) {
      // stessa legge della scadenza: senza armatura il canale evento è MUTO
      // (la scheda evento sta nella GUI, l'auto del premio si mette a mano)
      return { id: `evento:${card.theme?.id ?? card.eventId ?? '?'}:${card.carName}`, tipo: 'evento', nome: card.carName, carId: card.prize?.carId ?? null, pista: null, layout: null };
    }
    return null;
  } catch { return null; }
}

// L'ARMATURA dell'evento: «Prepara tutto e divertiti» dell'evento (event-prep
// in webui.mjs) scrive state.eventoPreparato = l'ora del click. Dentro la
// finestra (24 h) il canale auto può montare l'auto dell'evento nel menu;
// fuori, MAI: un invito accettato e ancora non preparato è attesa paziente,
// non una mano che ti cambia il sedile (30/10, la F40 spuntata a fine gara).
function eventoArmato(state) {
  const at = Number(state?.eventoPreparato ?? 0);
  return Number.isFinite(at) && at > 0 && (Date.now() - at) < EVENTO_FIDUCIA_MS;
}

/** I DATI del VERDETTO DI GIORNATA per le fasce dell'app in gioco (29/10,
 *  richiesta Mauro: «bottone verdetto sul cruscotto»). Rispetto ai campi del
 *  tool CLI (md/gare/aggregato) spedisce una forma PIATTA e piccola per il
 *  pannello in gioco: prefisso, i quattro numeri e le righe già formattate.
 *
 *  Il calcolo pesa (scandisce tutti i Results del prefisso di oggi), quindi
 *  NON gira a ogni fascia: cache interna ricalcolata quando cambia la CHIAVE
 *  (prefisso + elenco dei file di oggi — una gara che finisce = chiave nuova
 *  = ricalcolo alla prossima fascia). Niente errore che ammazza la fascia:
 *  ogni tangente in try.
 */
const verdettoCache = { chiave: '', payload: null };

/** La MINI-PITWALL (31/10): il payload della seconda app, il pannello che
 *  ascolta. Solo i CAMPI alla mano (quando · slot · prepara · verdetto ·
 *  consigli · radio) e la radio presa dal memo (leggi il MEMO qui sotto):
 *  funzione PURA perché il test la collauda senza il gioco. */
export function miniPitwall(dati, fascia) {
  return { quando: dati?.quando ?? null, slot: fascia, prepara: dati?.prepara ?? null, verdetto: dati?.verdetto ?? null, consigli: dati?.consigli ?? null, radio: radioFascia() };
}

// IL MEMO della radio (31/10): il log del copilota cresce riga per riga, ma
// riga per riga NON cresce ogni fascia — si rilegge SOLO quando la sua
// dimensione cambia (statSync è l'unica lettura a tick). Il file assente è
// un memo vuoto, non un errore: il pannello senza radio resta un pannello.
const memoRadio = { size: -1, frasi: [] };
function radioFascia() {
  try {
    const size = statSync(LOG_VOCE_FILE).size;
    if (size !== memoRadio.size) {
      memoRadio.size = size;
      memoRadio.frasi = leggiRadioVoce({ last: 6 });
    }
  } catch { if (memoRadio.size !== -1) { memoRadio.size = -1; memoRadio.frasi = []; } }
  return memoRadio.frasi;
}
export function verdettoFascia(state, env = process.env) {
  try {
    const driver = state?.driver ?? null;
    if (!driver) return null;
    const oggi = new Date(); const due = (n) => String(n).padStart(2, '0');
    // IL PREFISSO è aammgg (261029), lo stesso ordine dei nomi dei file Results
    const prefisso = `${String(oggi.getFullYear()).slice(2)}${due(oggi.getMonth() + 1)}${due(oggi.getDate())}`;
    let chiave = prefisso;
    try {
      const dirs = resolvePaths(env).resultsDirs;
      // la chiave porta ANCHE le cartelle: due ambienti (test) con gli stessi
      // nomi file rimangono cache separate, non si prestano il riepilogo
      chiave += '|' + dirs.join(';') + '|' + dirs
        .flatMap((d) => { try { return readdirSync(d).filter((f) => f.startsWith(prefisso)); } catch { return []; } })
        .sort().join(',');
    } catch { /* cartella non letta: il prefisso da solo basta come chiave */ }
    if (verdettoCache.payload && verdettoCache.chiave === chiave) return verdettoCache.payload;
    const v = verdettoGiornata({ paths: resolvePaths(env), driver, prefix: prefisso });
    verdettoCache.chiave = chiave;
    verdettoCache.payload = v?.gare?.length
      ? {
        prefisso,
        gare: v.aggregato.gare,
        vittorie: v.aggregato.vittorie,
        podi: v.aggregato.podi,
        mediaPos: v.aggregato.mediaPos,
        giroTop: v.aggregato.giroTop,
        righe: v.gare.map((g) => ({
          ora: g.ora, pista: g.pista, posto: g.posto, partecipanti: g.partecipanti,
          gap: g.gap, giro: g.mioGiro, penalita: g.penalita, dsq: g.dsq ?? false,
        })),
      }
      : null;
    return verdettoCache.payload;
  } catch { return null; }
}

/** I DATI dei bottoni «Prepara e divertiti» del pannello in gioco (3/11,
 *  richiesta Mauro: «implementalo sul cruscotto per i bottoni prepara e
 *  divertiti di entrambi, anche eventi speciali»). Il ponte comandi è lo
 *  stesso di Paddock, già dentro cruscotto.js: qui (lato server) escono
 *  SOLO LE IMPRONTE dei gesti, con gli STESSI id di comandoAuto così le
 *  azioni del bottone si *coordinano* via ack: premere il bottone mette
 *  anch'essa un ack e il canale automatico tace per lo stesso gesto. Il bottone
 *  resta vivo anche con il comando già ackato (è il RIFUGIO del canale
 *  automatico), e ogni slot porta il suo gesto:
 *  - azioni.ronda: la ronda preparata (state.pending fresco con auto nota)
 *    → sequenza COMPLETA da bottone (tipo gara → pista → auto → avvia);
 *  - azioni.evento: l'evento speciale accettato → SOLO auto (lezione 23/10:
 *    pista/AI/ora/giri restano a mano dalla scheda);
 *  - azioni.demo: la gara al volo (vetrinaCustom) mentre la sua finestra
 *    è viva — anche lei SOLO auto (la griglia e l'istantanea sono già
 *    scritte sul disco e il menu del gioco le adotta). Con la finestra
 *    demo viva il bottone evento SI NASCONDE: resta un'ALTRA sola auto
 *    nel menu, mai due che si scambiano il sedile per ogni fascia.
 *  *  4/11: le card portano anche i FATTI che girano nel sistema — la finestra
 *  di freschezza (scadeIn, ms rimasti sulla finestra di 24h), per l'evento
 *  pista/giri/ora/banda della scheda, per la gara al volo lo stato REALE
 *  dell'istantanea (durata, banda, pista) letto con currentInstantRace:
 *  sola lettura, sicura anche a gioco aperto.
 */

/** Ms rimasti sulla finestra di 24h di un «fresco» (pending o demo). */
const scadeIn = (da) => Math.max(0, PENDING_SCADENZA_MS - (Date.now() - Number(da ?? 0)));

/** IL DATO DEL «PREPARA E DIVERTITI» per la sincro del semaforo (29/10,
 *  richiesta Mauro: «arricchisci il semaforo» — il pallino della connessione
 *  dice anche SE il server è allineato con la preparazione corrente). In
 *  fascia (cui campo `prepara`):
 *  - ronda: il pending armato da «Prepara tutto», con l'ora di arming e
 *    la FINESTRA del via automatico (avviaFino, race.mjs) — niente
 *    avviaFino (pending nato prima dello stampio) = via solo a mano;
 *  - gara al volo: la vetrinaCustom nella sua finestra (il via NON è
 *    automatico qui, resta il bottone del pannello).
 *  null = nessuna preparazione viva: la riga «nessuna» lo dice, e il
 *  colore del pallino resta quello della connessione (la sincro manca,
 *  non la corda server → loader → gioco).
 */
export function preparaFascia(state) {
  try {
    const p = state?.pending;
    if (p?.car && (Date.now() - Number(p.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
      return { tipo: 'ronda', auto: p.car, armataAlle: Number(p.startedAt ?? 0), viaFino: Number(p.avviaFino ?? 0), scadeIn: scadeIn(p.startedAt) };
    }
    const demo = state?.vetrinaCustom;
    if (demo?.car && (Date.now() - Number(demo.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
      return { tipo: 'gara al volo', auto: demo.car, armataAlle: Number(demo.startedAt ?? 0), viaFino: 0, scadeIn: scadeIn(demo.startedAt) };
    }
    return null;
  } catch { return null; }
}

/** I CONSIGLI IN GIOCO (30/10, «consiglio anche in gioco»): STESSI tips del
 *  pannello GUI e del copilota del browser (richiesta del själv costruttore,
 *  engineerLive) e firma LEGGERA (fuelPerLap/raceLaps null, come il tick
 *  della voce): la telemetria MoTeC resta nella GUI, qui l'HUD del gioco
 *  guida le stime. Vuoto (tips []) col gioco chiuso o fuori sessione: il
 *  gruppo si nasconde da solo, mai un'eccezione che ammazza la fascia. */
export function consigliFascia() {
  try {
    const live = engineerLive(liveReader().snapshot(), { fuelPerLap: null, raceLaps: null });
    return {
      live: !!live.live,
      tips: (live.tips ?? []).slice(0, 5).map((t) => ({
        icon: t.icon ?? '🔧', title: t.title ?? '', text: t.text ?? '', prio: t.prio ?? 3,
      })),
    };
  } catch { return { live: false, tips: [] }; }
}

/** Stato REALE della gara al volo, letto DALL'ISTANTANEA ({ durata:{giri|min},
 *  banda, pista }). null se il file manca (PC dove una gara custom non è mai
 *  stata aperta) o non si legge: mai un'eccezione che ammazza la fascia. */
export function statoIstantanea(file = INSTANT_FILE) {
  let cur = null;
  try { cur = currentInstantRace(file); } catch { cur = null; }
  if (!cur) return null;
  let pista = null;
  try { pista = currentWeekendTrack(file) ?? null; } catch { pista = null; }
  return {
    durata: cur.mode === 1
      ? { min: Math.round(Number(cur.durata ?? 0) / 60) || null }
      : { giri: Number(cur.durata) || null },
    banda: cur.aiMin != null && cur.aiMax != null ? `${cur.aiMin}–${cur.aiMax}` : null,
    pista,
  };
}

/* LA RIGA DEL REGISTRO per la card demo (4/11): l'ultima scrittura vera
   della durata (gara-veloce.jsonl) già formattata per una persona — la STESSA
   riga che la GUI mostra nel riepilogo «Gara al volo» (endpoint
   gara-veloce-registro). null se mai scritto: la card dice solo l'istantanea. */
function rigaRegistro() {
  try { return formattaRigaRegistro(leggiRegistro(1)[0]) ?? null; } catch { return null; }
}

export function azioniPulsanti(ladder, state) {
  try {
    const az = {};
    const demo = state?.vetrinaCustom;
    if (demo?.car) {
      const nomeDemo = ladder?.contentNames?.cars?.[demo.car] ?? (/^ks_[a-z0-9_]+$/.test(String(demo.car)) ? nomeDaCarId(demo.car) : null);
      if ((Date.now() - Number(demo.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        if (nomeDemo) az.demo = { id: `demo:${demo.startedAt ?? 0}:${demo.car}`, tipo: 'evento', nome: nomeDemo, carId: demo.car, scadeIn: scadeIn(demo.startedAt), istantanea: statoIstantanea(), registro: rigaRegistro() };
      }
    }
    const p = state?.pending;
    if (p?.car) {
      const nome = ladder?.contentNames?.cars?.[p.car] ?? (/^ks_[a-z0-9_]+$/.test(String(p.car)) ? nomeDaCarId(p.car) : null);
      if (nome && (Date.now() - Number(p.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        const spec = p.trackNames?.[0] ? specFor(p.trackNames[0]) : null;
        // BANDA della serie (4/11, card arricchite): gli override dei cursori
        // (state.raceSettings[node].sliderMin/sliderMax) quando ci sono — la
        // STESSA fonte di raceCard (rangeMin/rangeMax), quindi lo stesso numero
        // che la GUI del browser consiglia. null = nessun override: la card
        // non inventa una banda a caso.
        const ov = state?.raceSettings?.[p.node] ?? {};
        const banda = [ov?.sliderMin, ov?.sliderMax].every((x) => Number.isFinite(Number(x))) ? `${Number(ov.sliderMin)}–${Number(ov.sliderMax)}` : null;
        az.ronda = { id: `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}`, tipo: 'setcar', nome, carId: p.car, pista: spec?.name ?? null, layout: spec?.layout ?? null, ora: Number.isFinite(Number(p.hour)) && p.hour != null ? Number(p.hour) : null, meteo: codiceMeteo(p.weather ?? null), serie: p.node ?? null, scadeIn: scadeIn(p.startedAt), banda };
      }
    }
    if (!az.demo) {
      const card = eventCard(ladder, state);
      if (card?.acceptedAt && card.carName) {
        // PREMIO in palio (4/11, card arricchite): auto della vittoria + soldi,
        // presi dalla card evento (che porta il prize dell'evento attivo via
        // ...a). null quando l'evento non ha premio: mai una card che scrive
        // «undefined» nel gioco.
        const pr = card?.prize ?? null;
        const premio = pr?.carName
          ? (pr.money != null ? `${pr.carName} + €${Number(pr.money).toLocaleString('it-IT')}` : pr.carName)
          : null;
        az.evento = { id: `evento:${card.theme?.id ?? card.eventId ?? '?'}:${card.carName}`, tipo: 'evento', nome: card.carName, tema: card.theme?.name ?? null, pista: card.trackName ?? null, giri: card.laps ?? null, ora: card.hour ?? null, banda: card.diffMin != null && card.diffMax != null ? `${card.diffMin}–${card.diffMax}` : null, premio };
      }
    }
    return az;
  } catch { return {}; }
}

/** Classifica della serie CORRENTE del pilota (node), fino a 6 righe + la tua:
 *  stessa fonte del tab Campionati della GUI. */
function miniClassifica(ladder, state) {
  try {
    if (!state || !state.node) return null;
    const node = nodeById(ladder, state.node);
    if (!node) return null;
    const rows = standingsFor(ladder, state, node).slice(0, 7).map((r) => ({
      pos: r.position, nome: r.name, punti: r.points, tu: !!r.isPlayer,
    }));
    if (!rows.some((r) => r.tu)) {
      const me = playerStanding(ladder, state, node);
      if (me) rows.push({ pos: me.position, nome: me.name, punti: me.points, tu: true });
    }
    return { nodeId: node.nodeId, nome: node.display ?? node.nodeId, righe: rows };
  } catch { return null; }
}

/** Pannello mondiale: la tua posizione nel mondo per skill e la top-5.
 *  Stessa formula del calcolo della GUI (playerWorldSkill). */
function pannelloMondo(ladder, state) {
  try {
    if (!state) return null;
    const cur = nodeById(ladder, state.node);
    const tuaSkill = Math.round((cur ? playerWorldSkill(cur, state) : 0) * 100);
    const rows = (state.world?.drivers ?? [])
      .filter((d) => d.active !== false)
      .map((d) => ({ nome: state?.alias?.[`world:${d.id}`] || `${d.first} ${d.last}`, skill: Math.round((Number(d.skill) || 0) * 100), tu: false }));
    rows.push({ nome: state.driver.name, skill: tuaSkill, tu: true });
    rows.sort((a, b) => b.skill - a.skill);
    // la posizione VERA di ogni riga si calcola una volta sola: la tua riga
    // appesa in fondo (oltre il 5° posto) non deve prendere la posizione finta
    // della top-5
    rows.forEach((x, i) => { x.pos = i + 1; });
    const tuaPos = rows.findIndex((x) => x.tu) + 1;
    const top = rows.slice(0, 5);
    if (tuaPos > 5) top.push(rows[tuaPos - 1]);
    return { totale: rows.length, tuaPosizione: tuaPos, tuaSkill, top: top.map((x) => ({ pos: x.pos, nome: x.nome, skill: x.skill, tu: !!x.tu })) };
  } catch { return null; }
}

// ------------------------------------------------------------------ antifurto
// GUARDIA ANTI-DOPPIO-PUBLISHER (28/10 pomeriggio, due server in pista):
// accanto al webui vero sulla 8642 viveva un secondo webui (porta 8645,
// avviato alla mattina) che riscriveva le STESSE fasce: ora col comando,
// ora senza — e l'app in gioco beccava la fascia del doppione (o la fascia
// col comando riscritta a null). Il lock CARDINALE: il file `.publisher.pid`
// nella cartella dell'app tiene il PID del detentore; chi lo trova vivo TACE
// (e lo dice UNA volta), chi lo trova morto lo riprende. Un lock lascato
// lì da un crash non ostacola nessuno: il PID non c'è più, si riprende
// da solo al primo tick.
const PID_LOCK_FILE = '.publisher.pid';

// LA STORIA DEL COMANDO («storia del comando nel tooltip», 31/10 notte):
// il vantaggio di essere in gioco con il menu APERTO restava mutolo: il
// cambio auto avveniva, il console.log restava alla GUI e il pannello non
// diceva NIENTE di quello che era appena passato. Da qui una memoria
// piccola e persistente (data/cruscotto-storia.json, regola EVO_DATA_DIR
// della casa): ogni comando che esce in fascia (setcar · evento · avvia)
// e ogni ACK che torna dall'app finiscono qua, il pannello li scandisce
// nel TOOLTIP del pallino connessione. Un plus sempre in try: se il file
// non si apre, la fascia non sente niente.
const fileStoria = () => join(process.env.EVO_DATA_DIR ?? join(PROJECT, 'data'), 'cruscotto-storia.json');
const storiaMem = { fileLetto: null, righe: [] };
function storiaLeggi() {
  const file = fileStoria();
  if (storiaMem.fileLetto !== file) {
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      storiaMem.righe = Array.isArray(doc?.righe) ? doc.righe : [];
    } catch { storiaMem.righe = []; }
    storiaMem.fileLetto = file;
  }
  return storiaMem.righe;
}
/** Un giro nella storia (più recente in CODA; la fascia rovescia). each in try: mai un ammazzatick. */
export function storiaAggiungi(riga, { ora = Date.now() } = {}) {
  const righe = storiaLeggi();
  righe.push({ t: ora, ...riga });
  while (righe.length > 12) righe.shift();   // le ultime 12: il tooltip legge le ultime
  try { writeFileSync(fileStoria(), JSON.stringify({ righe, quando: new Date(ora).toISOString() }), 'utf8'); } catch { /* la storia è un plus */ }
  return righe;
}
/** Reset SOLO dei test: svuota la cache (il file lo tocca la sandbox). */
export function storiaReset() { storiaMem.fileLetto = null; storiaMem.righe = []; }
/** Le ultime N voci, la più recente PRIMA: il formato del tooltip. */
export function storiaComandoFascia({ last = 5 } = {}) {
  return storiaLeggi().slice(-last).reverse();
}
// i comandi GIÀ loggati come «inviato» in quest'ora: il comando vive
// diverse fasce finché non arriva l'ack — la storia lo registra UNA volta.
const storiaInviata = new Map();
let avvisatoDoppione = false;    // l'avviso al doppione: una volta sola, non ogni 2,5s

/** PID vivo? (signal 0: nessun colpo, solo un ping. EPERM = esiste, è vivo.) */
function pidVivo(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

/** true = posso pubblicare (lock tenuto o ripreso). false = un altro sta
 *  già facendo il lavoro: non toccare le fasce (niente scritture, niente
 *  ripuliture: il comando resta quello che il detentore pubblica). */
export function prendiLock(dir) {
  let det = 0;
  try { det = Number(String(readFileSync(join(dir, PID_LOCK_FILE), 'utf8')).trim()); } catch { /* assente o illeggibile: contenderemo da noi */ }
  if (det && det !== process.pid && pidVivo(det)) {
    if (!avvisatoDoppione) {
      avvisatoDoppione = true;
      console.log(`  App «Cruscotto» in gioco: un altro server (pid ${det}) sta già pubblicando le fasce — qui restiamo zitti per non battersci sopra.`);
    }
    return false;
  }
  if (det !== process.pid) {
    try { writeFileSync(join(dir, PID_LOCK_FILE), String(process.pid), 'utf8'); } catch { /* disco momentaneo: si ritocca al prossimo giro */ }
  }
  return true;
}

/** Un giro del publisher: scrive la fascia corrente e pulisce le vecchie. */
export function uiappTick(env = process.env) {
  const dir = cartellaApp(env);
  if (!dir || !existsSync(SAVE_FILE)) return { ok: false, motivo: 'no app o no carriera' };
  if (!prendiLock(dir)) return { ok: false, motivo: 'altro publisher attivo (stesse fasce)' };
  const fascia = Math.floor(Date.now() / PERIODO_MS);
  const { ladder } = context();
  const dati = vetrina(ladder, loadState(SAVE_FILE));
  dati.slot = fascia;
  try { assorbiAck(dati); } catch { /* l'ack è un plus: mai rompere il tick */ }
  // STORIA (31/10 notte): il comando che esce ORA in fascia va in memoria UNA
  // sola volta per id (il comando vive più fasce finché l'ack non lo spegne).
  try {
    const cc = dati.comando;
    if (cc && !storiaInviata.has(cc.id)) {
      storiaInviata.set(cc.id, Date.now());
      storiaAggiungi({ stato: 'inviato', tipo: cc.tipo ?? 'setcar', nome: cc.nome ?? null, id: cc.id });
    }
    const oraT = Date.now();
    for (const [id2, at] of storiaInviata) { if (oraT - at > 3_600_000) storiaInviata.delete(id2); }
  } catch { /* la storia è un plus: mai rompere il tick */ }
  dati.validaFino = new Date((fascia + 1) * PERIODO_MS).toISOString();
  writeFileSync(join(dir, `ui-${fascia}.json`), JSON.stringify(dati), 'utf8');
  // la spazzatura va a casa: tengo la fascia scritta e le 2 prima (se il gioco
  // arriva un attimo in ritardo, una fascia indietro resta leggibile)
  // la spazzatura va a casa: un ack consumato dopo un'ora si dimentica, e le
  // vecchie fasce si tolgono (il gioco si legge anche una in ritardo)
  if (confermati.size > 8) {
    const t = Date.now();
    for (const [id, at] of confermati) { if (t - at > 3_600_000) confermati.delete(id); }
  }
  const vecchi = readdirSync(dir).filter((f) => /^ui-\d+\.json$/.test(f) && f !== `ui-${fascia}.json`);
  for (const f of vecchi.slice(0, Math.max(0, vecchi.length - 2))) {
    try { unlinkSync(join(dir, f)); } catch { // di recente presa in lettura dal gioco: arriva al prossimo giro
    }
  }
  // LA PITWALL (ricostruzione 31/10): seconda app in gioco, pannello SOLO-IN
  // FORMAZIONI. Stessa fascia, mini-payload (consigli · verdetto · lasincro
  // «Prepare e Divertiti») in CARTELLA SUA: installata con
  // tools/installa-pitwall.mjs, qui si scrive SOLO se la cartella esiste —
  // senza la mod il tick resta quello di sempre. La scrittura è tutta in
  // try: la Pitwall è un plus, mai un ammazzatick.
  try {
    const dirP = cartellaApp(env, 'pitwall');
    if (dirP) {
      const pw = miniPitwall(dati, fascia);
      writeFileSync(join(dirP, `ui-${fascia}.json`), JSON.stringify(pw), 'utf8');
      const vecchiP = readdirSync(dirP).filter((f) => /^ui-\d+\.json$/.test(f) && f !== `ui-${fascia}.json`);
      for (const f of vecchiP.slice(0, Math.max(0, vecchiP.length - 2))) { try { unlinkSync(join(dirP, f)); } catch { } }
    }
  } catch { /* fasce Pitwall saltate: la principale non deve attese per niente */ }
  return { ok: true, file: `ui-${fascia}.json` };
}

/** Il percorso dello store del gioco (ack dell'app): null se non c'è. */
function percorsoStore(env = process.env) {
  for (const root of savedGamesRoots(env)) {
    const file = join(root, 'ACE', 'ui_storage.uistorage');
    if (existsSync(file)) return file;
  }
  return null;
}

// gli id confermati nell'ultima ora (l'app in gioco ha scritto l'ack nel
// persist del loader): smettiamo di ripubblicare quei comandi — l'auto nel
// menu di EVO è già quella, riproponendo sarebbe un giro di più per nulla.
const confermati = new Map();
// porticina SOLO per i test: simulare un ack già scritto (l'ack vero arriva
// dall'app in gioco via ui_storage). Nessun uso di produzione.
export function confermaAck(id, { at = Date.now() } = {}) { confermati.set(String(id), at); }
function assorbiAck(dati) {
  const c = dati.comando;
  if (!c) return;
  const store = percorsoStore();
  if (!store) return;
  const acks = leggiStoreJson(store, 'cruscotto.acks');
  // LETTURA AMBIGUA (store occupato dal gioco o troncato a metà scrittura —
  // 29/10, «appena esco da una gara riparte la stessa gara»): per l'AVVIA non
  // si rischia il riparto su un insieme che non abbiamo letto. Il comando
  // tace per QUESTA fascia; la rilettura del prossimo giro decide serena.
  if (acks === undefined) {
    if (c.tipo === 'avvia') dati.comando = null;
    return;
  }
  const colpo = (acks?.commands ?? []).find((a) => a && a.id === c.id);
  if (!colpo) return;
  if (colpo.ok && !confermati.has(c.id)) {
    confermati.set(c.id, Date.now());
    // (storia, 31/10 notte): la conferma entra ANCHE nella memoria del
    // pannello — il tooltip la racconta, la console resta la copia per te.
    try {
      storiaAggiungi({ stato: 'confermato', tipo: c.tipo ?? 'setcar', nome: c.nome ?? null, id: c.id, msg: colpo.msg || 'ok' });
    } catch { /* la storia è un plus */ }
    // LOG DELL'ACK (28/10 sera, «rendere inquieto il log dell'ack»): la
    // conferma non è più la riga fondata `auto impostata ✓` — è la radio
    // del muro che conferma e non spiega. Le informazioni RESTANO tutte
    // (tipo comando, auto, messaggio dell'app) — cambia solo la voce.
    let voce = "l'auto è già nel menu: chi la passa non resta a guardare";
    if (c.tipo === 'avvia') voce = 'il via è toccato — nessuno torna indietro dal via';
    else if (c.tipo === 'evento') voce = 'l\'evento si è scelto da solo — tu lo guardi solo';
    console.log(`  Cruscotto in gioco — ${(c.tipo ?? 'setcar').toUpperCase()} ✓ ${c.nome} (${colpo.msg || 'ok'}) — ${voce}.`);
  }
  if (colpo.ok) dati.comando = null;      // eseguita: niente ripubblicazione
}

let timer = null;
export function startUiappPublisher(baseUrl = null) {
  if (baseUrl) setGuiBaseUrl(baseUrl);
  if (timer) return timer;
  if (!cartellaApp()) {
    console.log('  App «Cruscotto» in gioco: la mod App Loader non è installata — publisher fermo (installa con tools/installa-cruscotto.mjs).');
    return null;
  }
  uiappTick();
  timer = setInterval(() => { try { uiappTick(); } catch { /* mai bloccare il server per la vetrina */ } }, PERIODO_MS);
  timer.unref?.();
  return timer;
}
