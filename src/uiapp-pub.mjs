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
import { savedGamesRoots } from './paths.mjs';
import { agendaDay, racesOnDay, dateLabel, prossimoGiornoConGara, impegni } from './agenda.mjs';
import { context, SAVE_FILE } from './webui-env.mjs';
import { loadState, nodeById, standingsFor, playerStanding } from './state.mjs';
import { playerWorldSkill } from './world.mjs';
import { tr } from './lang.mjs';
// il libro delle piste (TRACK_INFO): il comando di cambio auto porta anche
// pista+layout come «Prepara tutto» li ha scritti — in gioco l'applet fa
// la SEQUENZA COMPLETA di Paddock (tipo di gara → pista → auto) (28/10 PM)
import { specFor } from '../tools/set-track.mjs';
import { eventCard } from './events.mjs';
import { leggiStoreJson } from './uiapp-store.mjs';

export const PERIODO_MS = 2500;          // il ritmo delle fasce: 2.5 secondi esatti
export const APP_KEY = 'cruscotto';      // il nome della cartella-app nel loader

// la scadenza di un «fresco»: il pending della ronda e la finestra della
// demo (vetrinaCustom = gara al volo) valgono UNO STESSO giorno — la
// costante era dentro comandoAuto; da qui la usa anche azioniPulsanti
// (i dati dei bottoni) per restare allineati senza copie da tenere in pari.
const PENDING_SCADENZA_MS = 24 * 3600 * 1000;

/** La cartella dell'app dentro il loader, o null se la mod non c'è:
 *  si prende il primo base «Saved Games» che ha l'App Loader installato
 *  (funziona pure con la cartella di sistema ricollocata). */
export function cartellaApp(env = process.env) {
  for (const root of savedGamesRoots(env)) {
    const dir = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', APP_KEY);
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
    azioni: azioniPulsanti(ladder, state),
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
    const demo = state?.vetrinaCustom;
    if (demo?.car) {
      const nomeDemo = ladder?.contentNames?.cars?.[demo.car] ?? null;
      if ((Date.now() - Number(demo.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        const idDemo = `demo:${demo.startedAt ?? 0}:${demo.car}`;
        if (confermati.has(idDemo)) return null;   // già nel menu di EVO: silenzio per tutta la finestra
        if (nomeDemo) return { id: idDemo, tipo: 'evento', nome: nomeDemo, pista: null, layout: null };
      }
    }
    if (p?.car) {
      const nome = ladder?.contentNames?.cars?.[p.car] ?? null;
      const idP = `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}`;
      // se quel comando è GIÀ stato eseguito dall'app (ack in ui_storage),
      // non torna in vetrina: si scende al ramo evento (27/10 19:30: il
      // pending vecchio confermato copriva per sempre il comando dell'evento
      // attivo — la F40 non arrivava mai al gioco)
      if (nome && !confermati.has(idP)) {
        const spec = p.trackNames?.[0] ? specFor(p.trackNames[0]) : null;
        const rondaComando = {
          id: idP, tipo: 'setcar', nome,
          pista: spec?.name ?? null, layout: spec?.layout ?? null,
        };
        // SCADENZA anche qui (lezione 27/10, la stessa dei ramoscelli più
        // sotto): il pending NON ancora confermato, se ha più di un giorno,
        // lascia il campo all'evento attivo; fresco = la ronda comanda e via.
        if ((Date.now() - Number(p.startedAt ?? 0)) < PENDING_SCADENZA_MS) return rondaComando;
        const cardEv = eventCard(ladder, state);
        if (cardEv?.acceptedAt && cardEv.carName) {
          return { id: `evento:${cardEv.theme?.id ?? cardEv.eventId ?? '?'}:${cardEv.carName}`, tipo: 'evento', nome: cardEv.carName, pista: null, layout: null };
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
      const nomeAvvia = ladder?.contentNames?.cars?.[p.car] ?? null;
      const idAvvia = `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}:avvia`;
      if (nomeAvvia && confermati.has(idAvvia.replace(/:avvia$/, '')) && !confermati.has(idAvvia)) {
        return { id: idAvvia, tipo: 'avvia', nome: nomeAvvia, pista: null, layout: null };
      }
    }
    const card = rondaViva ? null : eventCard(ladder, state);
    if (card?.acceptedAt && card.carName) {
      return { id: `evento:${card.theme?.id ?? card.eventId ?? '?'}:${card.carName}`, tipo: 'evento', nome: card.carName, pista: null, layout: null };
    }
    return null;
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
 */
export function azioniPulsanti(ladder, state) {
  try {
    const az = {};
    const demo = state?.vetrinaCustom;
    if (demo?.car) {
      const nomeDemo = ladder?.contentNames?.cars?.[demo.car] ?? null;
      if ((Date.now() - Number(demo.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        if (nomeDemo) az.demo = { id: `demo:${demo.startedAt ?? 0}:${demo.car}`, tipo: 'evento', nome: nomeDemo };
      }
    }
    const p = state?.pending;
    if (p?.car) {
      const nome = ladder?.contentNames?.cars?.[p.car] ?? null;
      if (nome && (Date.now() - Number(p.startedAt ?? 0)) < PENDING_SCADENZA_MS) {
        const spec = p.trackNames?.[0] ? specFor(p.trackNames[0]) : null;
        az.ronda = { id: `${p.startedAt ?? p.date ?? ''}:${p.car}:${p.node}`, tipo: 'setcar', nome, pista: spec?.name ?? null, layout: spec?.layout ?? null, serie: p.node ?? null };
      }
    }
    if (!az.demo) {
      const card = eventCard(ladder, state);
      if (card?.acceptedAt && card.carName) {
        az.evento = { id: `evento:${card.theme?.id ?? card.eventId ?? '?'}:${card.carName}`, tipo: 'evento', nome: card.carName, tema: card.theme?.name ?? null };
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
  const colpo = (acks?.commands ?? []).find((a) => a && a.id === c.id);
  if (!colpo) return;
  if (colpo.ok && !confermati.has(c.id)) {
    confermati.set(c.id, Date.now());
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
