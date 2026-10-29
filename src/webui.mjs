// webui.mjs — l'interfaccia grafica della carriera: un piccolo server locale
// (nessuna dipendenza) che serve gui/index.html e parla con lo stesso motore della CLI.
//
//   node src/webui.mjs [--port 8642] [--open]
//
// Il browser si apre su http://127.0.0.1:<porta> — tutto resta sul tuo PC.

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync, appendFileSync, existsSync, copyFileSync, renameSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, extname, basename, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { requestFromLocalBrowser, serveStatic } from './webui-static.mjs';
import { resolvePaths, isGameRunning, GAME_EXE, dataDirCandidates, isDir, isFile, launchGame } from './paths.mjs';

import {
  createCareer, nodeById, disciplineName, nomeDisciplina, gateStatus,
  standingsFor, difficultyFor, seasonEnd,
  acceptOffer, pushMessage, enterNode, renameDriver, careerStats,
  slotDataDir, grigliaSimEstesa,
} from './state.mjs';
import { playerWorldSkill } from './world.mjs';
import { loadCatalog, resultDetail, onlineArchive } from './catalog.mjs';
import { rapportoGara } from './rapporto-gara.mjs';
import { liveReader } from './shmem.mjs';
import { creaVoceCopilota, nuovoSlotVoce, giroVoce, VOCE_LIVELLI } from './voce-copilota.mjs';
import { raceCard, markPending, chargeEntry, launch } from './race.mjs';
import { applyPianoToCalendar } from './orario.mjs';
import {
  listResultFiles, readSessionResult, isRaceSession, findPlayerDriver, classify,
} from './results.mjs';
import { rivalsOverview, rivalDetail } from './rivals.mjs';
// runImport sta FUORI dall'import statico: la catena import.mjs → grid-calib.mjs
// va nel launcher a CALDO (src/hot.mjs — lezione 22/10/2026: gli eventi nati rotti
// nel registro di calibrazione venivano dal codice stantio del processo long-running).
// Le quattro utility qui sotto invece sono snapshot di puro disco (ledger/log),
// incollate staticamente non c'è nulla di vivo da ricaricare.
import { alreadyImportedHash, importedFiles, importLog, resetImportRegistry } from './import.mjs';
import { hot } from './hot.mjs';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { stileOverview } from './stile-webui.mjs';
import { maybeSpawnEvent, acceptEvent, declineEvent, finishEvent, eventCard, eventsOverview, expireEvents, ensureEvents, refreshActivePrize, autoFinishEventFromFile, eventTrackReal } from './events.mjs';
import { seasonReview, reviewableSeasons, exportReview } from './review.mjs';
import { contractStatus, sponsorOffers, acceptSponsor, declineSponsor, challengeFor, acceptChallenge, sigilDefs, ensureLife, sponsorFor, ensureContract, checkSigils } from './life.mjs';
import { newsFeed, seasonPress } from './gazzetta.mjs';
import { recordTestDay, testDayLog, calibrationSummary } from './testday.mjs';
import { recordHotlaps, hotlapSweep, hotlapsLog, hotlapsStats, hotlapsProgress } from './hotlaps.mjs';
import { recordWarning, readWarnings } from './warnings.mjs';
import { fourPsi, setupBoard, setSetupNote, tyreClassOf, telemetryLapsFor, setupAdvice, boxChecklist, mechanicExtraEdits } from './setup.mjs';
import { listMotecSessions, analyzeLd, presetOf, collectSessions, pressureAdvice, racePressureAdvice, logPressureAdvice, readPressureLog, telemDiagnostics, lapTrace } from './motec.mjs';
// stinti.mjs e usura-gomme.mjs leggono la STESSA telemetria MoTeC: stint
// spezzati dai rifornimenti veri e usura gomme (degrado ritmo + temperature)
// entrano nel box e da terminale, sempre da file .ld reali (richiesta 28/10).
import { stintsFromLd } from './stinti.mjs';
import { tyreWearFromLd } from './usura-gomme.mjs';
import { trackBook, nextTrackOf, TRACK_INFO } from './tracks.mjs';
import { parseSetup, listSetups, writeSetupCopy, brakePlanOf, annotateAllyAdvice } from './carsetup.mjs';
import { engineerLive } from './engineer.mjs';
import { carPoolOf, carInPool, poolNodeForLive } from './car-pool.mjs';
import { changeWeekendTrack, currentWeekendTrack, setWeekendAi, weekendAi, setWeekendGridCustom, WEEKEND_FILE } from '../tools/set-track.mjs';
import { currentRaceTime, currentSessionTimes, setRaceSessions } from '../tools/set-racetime.mjs';
import { setWeekendLaps, setWeekendTimed, weekendLaps, raceBlockIndex } from '../tools/weekend-laps.mjs';
import { readCells } from '../tools/grid-balance.mjs';
// report.mjs: il bottone "Segnala un problema" costruisce l'URL della issue
// GitHub precompilata (versione, serie in corso, errori recenti) e il link
// Ko-fi dal config. Nessuna rete qui: il POST lo fa il browser.
import { feedbackLinks } from './report.mjs';
// paddock.mjs: il ponte con l'app Paddock del gioco (read-only): calendario
// della stagione con METEO/ORÀ scritti a monte, catalogo auto con curva di
// coppia e versus, registro contabile. Il cruscotto la pesca in `/api/paddock`.
import { paddockOverview } from './paddock.mjs';
// il bridge della gara custom a tempo (POST /api/instantrace): lettura +
// scrittura dell'INSTANT_RACE a gioco APERTO (force), come il ponte griglia
import { timedRace, currentInstantRace } from '../tools/set-instantrace.mjs';
import { statoAggiornamentiAsync, installaAggiornamenti } from '../tools/aggiornamenti.mjs';

// check degli aggiornamenti FUORI dal boot (audit freeze 23/10): qui prima
// girava statoAggiornamenti() sincrono (execFileSync · git ls-remote → fino a
// 8s: l'INTERO event loop del server si congela GUI alla mano) dentro /api/boot,
// quindi la prima schermata aspettava la rete. Adesso c'è la cache un giro
// al minuto con chiamata non bloccante, e la GUI lo pesca da /api/agg-info
// (drawAggBar senza argomento fa già questa fetch di contorno) senza
// fermare il primo pannello.
let AGG_CACHE = null, AGG_AT = 0, AGG_FLIGHT = null;
async function aggMemo() {
  if (AGG_CACHE && Date.now() - AGG_AT < 60000) return AGG_CACHE;
  AGG_FLIGHT ??= statoAggiornamentiAsync()
    .then((r) => { AGG_CACHE = r; })
    .catch(() => { AGG_CACHE = { skip: true, motivo: 'controllo non riuscito.' }; })
    .finally(() => { AGG_AT = Date.now(); AGG_FLIGHT = null; });
  await AGG_FLIGHT;
  return AGG_CACHE;
}

// ---------- VERSIONE DELLA BUILD (richiesta Mauro 23/10) ----------
// Sorgenti: package.json ("0.1.0") + 7 cifre dell'hash del commit corrente.
// Il numero cresce a ogni sincronizzazione (tools/bump-versione.mjs lo incrementa
// nel package.json PRIMA del commit) quindi due build mai uguali si vedono pure:
// lo stesso semver con hash diversi. Silenzioso se git manca (es. copia senza .git).
let BUILD_VERSION = null;
function buildVersion() {
  if (BUILD_VERSION) return BUILD_VERSION;
  let ver = '?', hash = '';
  try { ver = JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8')).version ?? '?'; } catch { /* package.json illeggibile */ }
  if (!/^\d+\.\d+\.\d+/.test(ver)) ver = '0.1.0';
  try { hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().slice(0, 7); } catch { /* senza git resta solo il semver */ }
  return (BUILD_VERSION = { semver: ver, hash: hash || null });
}
import { currentWeatherPreset, setWeatherPreset, PRESETS, presetForLabel } from './weather.mjs';
import { statoBackup, forzaBackup } from '../tools/salva-save.mjs';
import { setDriverCar, garageCurrent } from '../tools/set-driver-car.mjs';
import { sameTrack as trkSame, sameCar as carSame } from './tracknames.mjs';
import { tr, lang, setLang, hasEnvOverride } from './lang.mjs';
import { carsBook, carImageOf } from './cars.mjs';
import { garageOverview, catalogPicker, addCar, removeCar, setNote, sellCar } from './garage.mjs';
import { ensureFlowsSeeded, recentFlows, resetFlows } from './flows.mjs';
import { scanCareer, autoRepair, clearBacheca, resetLedger, reseedFlows, flowDedup } from './maintenance.mjs';
import { mailbox } from './mailbox.mjs';
import {
  agendaDay, prossimoGiornoConGara, avanzaGiorno,
  racesOnDay, calendarStrip, dateLabel, MAX_SCELTE_PER_GIORNO, CADENZA_GIORNI,
  choicesForDay, canChoose, recordChoice, impegni, shiftSeat,
  scheduledDay, nextUnplayedRound, hasSeat,
} from './agenda.mjs';
import { heritageOverview, claimMemory } from './memories.mjs';
import { resetNews } from './gazzetta.mjs';
// griglia: tab bilanciamento (celle, classi, perTraccia) + azioni di scrittura
import { loadClasses, buildGridMessage } from './gridbuilder.mjs';
import { gridStatus, applyBalance, applyAi, dropCellsApply, matchCurrentClass, rebuildGridApply, GRID_FILE } from './grid-apply.mjs';
// app «Cruscotto» in gioco: publisher della vetrina nella cartella del loader
import { startUiappPublisher } from './uiapp-pub.mjs';
import { gridFileOf } from '../tools/evo-grid.mjs';
import { zeroBalanceProposal, aiRangeProposal } from './grid-restore.mjs';
// analisi.mjs: i cinque strumenti del pilota (autopsia, dossier rivali, banco
// A/B, Monte Carlo sedili, tetto teorico) — letture pure, niente scritture.
// 30/10: entra il SESTO, il debrief di fine gara (raceDebrief).
import { raceAutopsy, raceDebrief, rivalDossier, setupAB, seatMonteCarlo, tettoReport } from './analisi.mjs';

/* TAG GRIGLIA all'iscrizione (richiesta Mauro 21/10: la coppa a un'unica auto
 * non deve più nascondere dietro il nome "Coppa X" cosa troverai in pista):
 *  - 2+ auto nel ladder            → 'multimarca' (misto naturale, NESSUN tag)
 *  - 1 sola auto + classe CON pool → "multi-marca d'epoca" (poolAuto dichiarato
 *    per la serie in grid-classes.json: la griglia mescola davvero)
 *  - 1 sola auto senza pool        → 'monomarca'
 */
function tipoGriglia(node) {
  if (!Array.isArray(node?.cars) || node.cars.length !== 1) return 'multimarca';
  // loadClasses ora memore per mtime in gridbuilder (22/10): si può chiamare
  // sempre, senza la cache qui che restava STANTIA dopo una convalida.
  return loadClasses().classi?.[node.nodeId]?.poolAuto?.length ? "multi-marca d'epoca" : 'monomarca';
}
// griglia: la calibrazione (calibSummary) va A CALDO dal nuovo hot.mjs, sotto nel
// pannello griglia — non c'è import statico di grid-calib.mjs qui in testa
import { midSeasonPulse } from './world.mjs';
// allievo: la memoria del meccanico — i round di consigli incassano l'esito del
// giro successivo e la generazione seguente annota la storia su ogni campo
import { memoOf, registraRound, annotaAdvice, semaforoAdvice } from './allievo.mjs';

// costanti di sessione, ladder e percorsi + appEnv/context stanno in webui-env.mjs;
// le VISTE (oggetti JSON per la GUI) stanno in webui-views.mjs
import { PROJECT, DATA_DIR, SAVE_FILE, CONFIG_FILE, GUI_DIR, BACKUP_DIR, SLOT, loadLadder, appEnv, context, writeConfig, configLang, requireState, persist } from './webui-env.mjs';
import { viewHeader, viewStatus, viewCalendar, viewStandings, viewMessages, viewCard, viewDifficulty, viewSetup } from './webui-views.mjs';

/* GRIGLIA EVENTO GIÀ IN PIEDI (esito prova 23/10): la griglia a 14 F40 scritta
 * sul disco è VALIDATA in gioco (log EVO 20:47: 14 avversari, zero eccezioni);
 * il guard anti-celle-ripetute del builder invece la rifiuterebbe (nel template
 * ci sono solo 3 varianti uniche della F40). IDEMPOTENZA DEL PREP: quando il
 * customgrid ha GIÀ la forma voluta dal tema (celle == gridSize, tutte del
 * pool, driver allineati) «Prepara tutto» la lascia sul posto e prosegue con
 * meteo/avvio — mai una riscrittura a rischio su una griglia che gira.
 * Il guard del builder resta in piedi per le forme SBAGLIATE: lì si rifiuta e
 * si scrive il messaggio, mai una griglia sospetta. */
function grigliaEventoGiaInPiede(file, gridSize, poolIds) {
  if (!existsSync(file)) return false;
  const g = gridFileOf(readFileSync(file));
  if (g.cells.length !== gridSize || g.drivers.length !== gridSize) return false;
  const ids = g.cells.map((c) => c.carId ?? c.carName ?? null);
  return ids.length === gridSize
    && ids.every((id) => id && poolIds.includes(id))
    && poolIds.every((id) => ids.includes(id));
}

/* AVVISO GRIGLIA RONDA SUL PANNELLO EVENTI (28/10, lezione bak-evento del
 * 27/10 21:40): l'event-prep riscrive last_grid.customgrid e il file della
 * ronda se ne va nei .bak-evento-*; al round successivo la griglia ronda torna
 * SOLO col «Prepara tutto» del campionato (rebuildGridApply recupera dai
 * backup). Il pannello Eventi legge qui lo stato REALE del disco e dice a
 * Mauro che cosa c'è sul file PRIMA che lo scopra in pista: la lettura non
 * tocca nulla (nulla di pericoloso anche in fallback). */
function avvisoGrigliaEvento(eventoAccettato, card) {
  const out = { presente: false, forma: null, celle: null, backupEvento: null, avviso: null };
  try {
    const bakBase = basename(GRID_FILE);
    for (const f of readdirSync(dirname(GRID_FILE)).filter((x) => x.startsWith(`${bakBase}.bak-evento-`)).sort().reverse()) {
      out.backupEvento = f.slice(bakBase.length + 1);   // «.bak-evento-2026-10-27T…»
      break;
    }
  } catch { /* niente cartella: nessun backup da mostrare */ }
  if (!eventoAccettato || !existsSync(GRID_FILE)) return out;
  try {
    const g = gridFileOf(readFileSync(GRID_FILE));
    out.presente = true;
    out.celle = g.cells.length;
    const pool = (card?.theme?.gridCars ?? card?.guestCarIds ?? []);
    const gridSizeEv = card?.theme?.gridSize ?? (pool.length + 2);
    out.forma = (pool.length && grigliaEventoGiaInPiede(GRID_FILE, gridSizeEv, pool)) ? 'evento' : 'ronda';
  } catch { out.forma = null; out.presente = false; }   // file a metà/illegibile: il pannello resta in silenzio
  if (out.forma === 'evento') {
    out.avviso = tr({
      it: `sul disco c'è la griglia DELL'EVENTO (${out.celle} celle): il tasto sotto non la tocca${out.backupEvento ? ` — prima di questo evento era qui la griglia di ronda (${out.backupEvento})` : ''}; per la prossima ronda di campionato la riscrive il «Prepara tutto» della carriera`,
      en: `the EVENT grid is on disk (${out.celle} cells): the button below will not touch it${out.backupEvento ? ` — before this event the round grid sat here (${out.backupEvento})` : ''}; the career's 'Prepare all' rewrites it for the next championship round`,
    });
  } else if (out.forma === 'ronda') {
    out.avviso = tr({
      it: `sul disco c'è la griglia della RONDA (${out.celle} celle): il tasto sotto la sposta nei backup (.bak-evento-*) e ci rimette la griglia dell'evento — per la prossima gara di campionato ripremi il «Prepara tutto» del pannello Prossima gara`,
      en: `the ROUND grid is on disk (${out.celle} cells): the button below stashes it into backups (.bak-evento-*) and writes the event grid — hit the Next race panel's 'Prepare all' again before the next championship race`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* infrastruttura comune alla CLI                                      */
/* ------------------------------------------------------------------ */



/** Elenco dei backup unificati in data/backups/ (dal più recente). */
function listBackups(limit = 8) {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('evo-career.save.bak-') && f.endsWith('.json'))
      .sort().reverse().slice(0, limit)
      .map((f) => {
        let size = 0;
        try { size = statSync(join(BACKUP_DIR, f)).size; } catch {}
        const m = f.match(/^evo-career\.save\.bak-(.+)\.(auto\.)?json$/);
        return { name: f, size, auto: !!m?.[2], at: (m?.[1] ?? f).replace(/T/, ' ').slice(0, 16) + (m?.[2] ? ' (auto)' : '') };
      });
  } catch { return []; }
}

/**
 * Salute del sistema: lettore live (versioni di gioco/sm, esito PowerShell,
 * ricicli, stderr) + telemetria (ultimo .ld scritto da EVO e se ha dati).
 * Se il gioco aggiorna i layout delle shared memory, è qui che lo si vede.
 */
/* scansione MoTec con memo 10s (21/10): il GUI la richiede ogni 2s ma l'albero
 * MoTec ha decine di cartelle — riscansarla a ogni richiesta era il vero costo
 * di fondo del LIVE, ben più del lettore PowerShell. */
let _telemAt = 0, _telemScan = null;
function telemScanLocale(paths) {
  if (_telemScan && Date.now() - _telemAt < 10000) return _telemScan;
  // ultimo file .ld tra le cartelle MoTeC note (Saved Games\ACE, Documents\ACE)
  let lastLd = null;
  const dirsState = [];
  for (const dir of paths.dataDirs ?? []) {
    const root = join(dir, 'MoTec');
    let cars = [];
    try { cars = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { dirsState.push({ root, exists: false }); continue; }
    dirsState.push({ root, exists: true, cars: cars.length });
    for (const car of cars) {
      // i .ld sono annidati per pista: MoTec\<auto>\<pista>\<file>.ld
      let trackDirs = [];
      try { trackDirs = readdirSync(join(root, car), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const track of trackDirs) {
        try {
          const files = readdirSync(join(root, car, track)).filter((f) => f.endsWith('.ld'))
            .map((f) => { const st = statSync(join(root, car, track, f)); return { car, track, f, path: join(root, car, track, f), mtime: st.mtimeMs, size: st.size }; });
          const best = files.sort((a, b) => b.mtime - a.mtime)[0];
          if (best && (!lastLd || best.mtime > lastLd.mtime)) lastLd = best;
        } catch { /* pista senza .ld: pazienza */ }
      }
    }
  }
  let lastLdInfo = null;
  if (lastLd) {
    // validità dall'header: come in motec.mjs, tabella canali + canali con dati
    let valid = false, channels = 0, withData = 0;
    try {
      const fd = openSync(lastLd.path, 'r');
      const head = Buffer.alloc(Math.min(lastLd.size, 65536));
      readSync(fd, head, 0, head.length, 0);
      closeSync(fd);
      const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const t0 = dv.getUint32(8, true);
      const t1 = Math.min(dv.getUint32(12, true), head.length);
      if (t1 > t0 && (t1 - t0) % 124 === 0) {
        const n = Math.min(Math.floor((t1 - t0) / 124), 500);
        for (let k = 0; k < n; k++) { channels++; if (dv.getUint32(t0 + k * 124 + 12, true) > 0) withData++; }
      }
      valid = withData > 0;
    } catch { valid = false; }
    lastLdInfo = { car: lastLd.car, track: lastLd.track, file: lastLd.f, size: lastLd.size, mtimeMs: lastLd.mtime, when: new Date(lastLd.mtime).toLocaleString('it-IT'), valid, channels, withData };
  }
  _telemAt = Date.now();
  return (_telemScan = {
    lastLd: lastLdInfo,
    dirsChecked: (paths.dataDirs ?? []).map((d) => join(d, 'MoTec')),
    dirsState,
  });
}

function systemHealth(paths, mode = null) {
  const rd = liveReader();
  const m = mode ?? liveMode();
  if (m !== 'off') { syncLiveReader().catch(() => {}); } // idempotente
  const h = rd.health();
  return {
    ...h,
    liveMode: m,
    telem: telemScanLocale(paths),
  };
}





// temporizzazioni del GUARDIANO DELLA CODA (24/10, bug slot 3): una sola
// azione rimasta appesa a un'attesa infinita teneva l'intero cruscotto in
// ostaggio — le richieste dopo di lei restavano in fila e il bottone
// «Prepara tutto» restava spinner senza mai rispondere. Variabile d'ambito
// EVO_API_TIMEOUT_MS: serve SOLO ai test (default 20s sul PC vero).
const API_TASK_TIMEOUT_MS = Math.max(250, Number(process.env.EVO_API_TIMEOUT_MS) || 20000);
const API_HTTP_TIMEOUT_MS = API_TASK_TIMEOUT_MS + 750;

/* ------------------------------------------------------------------ */
/* import: UNA sola logica per GUI, CLI e watcher (src/import.mjs)     */
/* ------------------------------------------------------------------ */

async function doImport(ladder, paths, state, { manual = null, allowAny = false, force = false, since = null, strict = false } = {}) {
  // hot('./import.mjs'): a ogni chiamata misura il mtime — se import.mjs o la sua
  // dipendenza grid-calib.mjs sono cambiati su disco, il launcher si mette al
  // passo SENZA riavvio (la stagione di gare non si spezza mai per una patch).
  const { runImport } = await hot('./import.mjs');
  const out = runImport(ladder, paths, state, { manual, allowAny, force, since, strict, persist });
  return { ...out, header: viewHeader(ladder, state) };
}

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, data) {
  // già risposta (es. il timeout HTTP del guardiano ha già parlato): mai due
  // scritture sulla stessa risposta — il browser segue la prima
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// Tetto alla dimensione del body: le API parlano JSON piccolo; oltre questa soglia
// la richiesta viene rifiutata (413) senza accumulare in memoria.
const BODY_MAX_BYTES = 1024 * 1024;
class BodyTooLarge extends Error {}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > BODY_MAX_BYTES) throw new BodyTooLarge("body troppo grande");
    chunks.push(c);
  }
  let body = {};
  if (chunks.length) {
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) ?? {}; }
    catch { body = {}; }
  }
  /* La lingua NON si applica qui: la readBody gira a monte della coda
     serialize, mentre le richieste intermediarie (polling del browser)
     sovrascriverebbero setLang prima che la task in fila giri davvero.
     L'applicazione vive nel dispatcher, dentro la task (28/10). */
  return body;
}

/* memo del controllo "il gioco è vivo?": tasklist costa ~200ms, il polling
   LIVE gira a ~1.2s — nella cache 10s il costo diventa trascurabile.
   26/10 (PC 2): tasklist può assisterarsi (WMI lento, antivirus) e ogni
   sondaggio appeso finisce IN CODA seria del server: se un sondaggio costa
   più di 3s la finestra cresce a 30s — meno tasklist, fila più libera. */
let _grAt = 0, _grVal = false, _grMs = 0;
// sessione telemetrica dell'ingegnere LIVE: memo 30s per auto (vedi case 'ingegnere')
let _engSess = null, _engSessAt = 0;
async function gameRunningMemo() {
  const finestra = _grMs > 3000 ? 30000 : 10000;
  if (Date.now() - _grAt < finestra) return _grVal;
  const t0 = Date.now(); _grAt = t0;
  _grVal = await isGameRunning();
  _grMs = Date.now() - t0;
  return _grVal;
}

/* ---------- LIVE: modalità del lettore shared memory (richiesta Mauro 21/10) ----------
 * Tre modalità, persistite in data/evo.config.json (chiave liveMode):
 *   'auto' (DEFAULT): il lettore PowerShell vive SOLO quando il processo del gioco
 *     è vivo — niente processi di sottofondo mentre non giri; il watcher di gara
 *     (import automatico dei risultati) riparte da solo appena apri EVO;
 *   'off': mai. Niente strip live, niente verifica live, niente ingegnere LIVE e
 *     niente watcher automatico: i risultati si importano a man da Centro gare;
 *   'sempre': lettore sempre vivo (come fino al 21/10).
 * Sbalzo onesto dei costi: da chiuso, il lettore fa 3 OpenFileMapping/s — quasi
 * zero CPU; il costo VERO era altrove: il polling GUI di system-health
 * ogni 2s che riscetsse TUTTO l'albero MoTec (memo 10s qui sotto). */
const LIVE_MODES = ['auto', 'off', 'sempre'];
function liveMode() {
  const env = process.env.ACE_LIVE;
  if (env === '0') return 'off';
  if (env === '1' || env === 'sempre') return 'sempre';
  let m = null;
  try { m = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).liveMode; } catch { /* prima volta */ }
  return LIVE_MODES.includes(m) ? m : 'auto';
}
// Auto-riparazione (23/10): ON di default (tutto il specchio del dottore, ma in
// gratuito). Si spegne da Impostazioni → Manutenzione. Letta A OGNI USO dal
// config: il toggle sopravvive al riavvio come il liveMode.
function autoRepairEnabled() {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).autoRepair !== false; }
  catch { return true; }
}

let lastAutoRepairAt = 0;
/** Un giro del dottore: scansiona la carriera e ripara SaFAMENTE ciò che si
 *  può correggere senza domande. Chiamato all'avvio del pannello e poi ogni
 *  10 minuti — con cache delle scansioni: al massimo una al periodo. */
function maintenanceTick({ force = false } = {}) {
  if (!existsSync(SAVE_FILE)) return null;
  if (!autoRepairEnabled()) return null;
  // Processo di test/sandbox (var d'ambiente per i test): niente auto-riparazione
  // su file veri — il 23/10 il boot della webui di un test ha percorso
  // fixIntegrity sul salvataggio reale del PC leggendo totali immaginari.
  if (process.env.EVO_DATA_DIR || process.env.EVO_FLOWS_DIR) return null;
  if (!force && Date.now() - lastAutoRepairAt < 10 * 60 * 1000) return null;
  lastAutoRepairAt = Date.now();
  try {
    const { ladder } = context();
    const state = requireState();
    ensureFlowsSeeded(state);
    const { issues } = scanCareer(ladder, state);
    if (!issues.length) return { issues, fixed: [] };
    const out = autoRepair(ladder, state, { persist });
    if (out.fixed.length) recordWarning('maintenance.auto', 'auto-riparazione applicata', out.fixed.join(', '));
    return out;
  } catch (e) {
    recordWarning('maintenance.auto', 'auto-riparazione non riuscita', e?.message ?? null);
    return null;
  }
}
async function syncLiveReader() {
  const mode = liveMode();
  const rd = liveReader();
  if (mode === 'off') { rd.stop(); return mode; }
  if (mode === 'sempre') { rd.start(); return mode; }
  if (await gameRunningMemo()) rd.start(); else rd.stop();
  return mode;
}

/* VIGIA DEL LETTORE SORDO (29/10, la serata del ripasso a manina): il lettore
 * PowerShell può restare VIVO e «attaccato» alla memoria di un processo di
 * gioco GÀ morto (o a MMF orfane):binarya game=true nel processo ma la sessione
 * vale «sconosciuta» (static vuoto, sessionType -1) e nessun dato fluisce — il
 * copilota mUTO anche in pista. La cura è nota da stanza (taskkill del PS e
 * il server lo rigenera, `restarts`+1): da questa sera la fa DA SOLO — se la
 * condizione persiste >15 s (con il processo del gioco morto «vivo»), il
 * vigia ferma e riparte il lettore al primo uso di /api/live o /api/ingegnere.
 * Niente ricicli nei test/sandbox e JIT quando non c'è sofferte/niente.
 */
let SORDO_AT = 0;
async function vigiaSordo(r, snap) {
  if (process.env.EVO_DATA_DIR || process.env.EVO_FLOWS_DIR) return false;   // test: niente azioni
  const sordo = !!snap?.game
    && (snap.session?.type ?? 'sconosciuta') === 'sconosciuta'
    && !snap.session?.track;
  // Orfano = LETTORE stantio (30/10, la gara muto del 29/10 12:06): snapshot()
  // con stale:true torna { game:false, stale:true } (dati freddi dal 20 s) — la
  // condizione vecchia (stale && game) NON scattava MAI e il lettore appeso a
  // una MMF morta restava lì per tutta la gara, con il tick che vedeva «gioco
  // non vivo» per sempre. Ora lo stale DA SOLO è il segnale di riparto: il
  // guardavalino sotto (gameRunningMemo) umano che il riciclo avvenga solo
  // davvero con il gioco PROCEDENTE — se invece il gioco è chiuso, il sync
  // giusto ferma il lettore e qui non si tocca nulla.
  const orfano = !!snap?.stale;
  if (!sordo && !orfano) { SORDO_AT = 0; return false; }
  if (!(await gameRunningMemo())) { SORDO_AT = 0; return false; }  // gioco fuori: il sync lo ferma già
  if (!SORDO_AT) { SORDO_AT = Date.now(); return false; }          // primo avvistamento: solo accosta
  if (Date.now() - SORDO_AT < 15000) return false;                 // il gioco peut avviarsi: grattile
  SORDO_AT = 0;
  r.stop();
  await sleep(400);
  r.start();
  return true;
}

/* ================= COPILOTA VOCE LATO PITWALL (29/10) =================
 * Prima la voce esisteva SOLO nella pagina «🎧 Ingegnere LIVE» della GUI:
 * in gara con la GUI chiusa o non sul cruscotto la copilota taceva del tutto
 * (la serata muta del 28/10). Da qui il Pitwall parla da solo: un relatore
 * PowerShell (voce-copilota.mjs) alimentato dall'UNICO narratore che già
 * replica 1:1 la vista e che il test guida. La chiave 'voceCopilota' nel
 * config la spegne (default ON); in test/sandbox NON parte mai. */
const voceSrv = creaVoceCopilota();
const slotVoceServo = nuovoSlotVoce();
const LOGUE_VOCE = { file: join(DATA_DIR, 'copilot-voce-24-10.jsonl') };
/* 29/10 sera — PING VOCE PAGINA: «the page interrogates» NON è «the page
   speaks». La prova (gara delle 11:36): il tick vivo per tutta la gara
   (STATO ogni 60 s, zero riparti), una pagina che interroga ogni 1–2 s
   e NESSUNA GARE parlata — la tecnica di questa mattina su un'IACETA vecchia
   (JS in cache con la soppressione) taceva e intanto mi faceva tacere il
   server. Da qui solo una pagina col codice VIVO discrive QUI (narratori
   della vista Vecchia che girano). Il tick guarda il PING, non il poll:
   vecchia scheda senza ping → la voce del server riparte. */
let _pingVocePagina = { at: 0, on: false };
/* Registro degli errori del tick voce: una riga al più al minuto per errore
   ripetuto (il tick gira ogni 4 s, un errore sistematico non deve riempire
   il file). Prima del 29/10 il catch era BIANCO: il difetto del body null
   restava invisibile con la copilota muta senza errori. */
let _voceErrSig = null, _voceErrAt = 0;
function logaVoce(dati) { try { appendFileSync(LOGUE_VOCE.file, JSON.stringify({ t: Date.now(), ...dati }) + '\n'); } catch { /* il log non è essenziale */ } }
function logaVoceErr(e, fresh = false) {
  try {
    const msg = String(e?.message ?? e);
    const sig = `${e?.stack?.split('\n')[1] ?? ''}|${msg}`;
    const ora = Date.now();
    if (sig === _voceErrSig && !fresh && ora - _voceErrAt < 60000) return;
    _voceErrSig = sig; _voceErrAt = ora;
        appendFileSync(LOGUE_VOCE.file, JSON.stringify({ t: ora, evento: 'ERRORE TICK VOCE', err: msg, at: e?.stack?.split('\n')[1]?.trim() ?? null }) + '\n');
  } catch { /* anche il log non deve rompere niente */ }
}
function voceServerAttiva() { // usata anche dalla guardia del ping qui sopra
  return voceServerLivello() !== 'off';
}
/** LIVELLO VOCE (30/10, richiesta Mauro: "minimo indispensabile, normale o
 *  full"): legge evo.config.json.voceCopilota — true/false dei giorni scorsi
 *  (true=normale, false=off) e i nuovi 'essenziale'|'normale'|'full'. Il
 *  default è 'normale', che è esattamente la copilota che girava finora. */
function voceServerLivello() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).voceCopilota;
    if (raw === false) return 'off';
    if (raw === true || raw == null) return 'normale';
    return ['off', ...VOCE_LIVELLI].includes(String(raw)) ? String(raw) : 'normale';
  } catch { return 'normale'; }
}
/** Il payload della radio dell'ingegnere, UNO per tutti: la risposta di
 *  /api/ingegnere (pannello + copilota del browser) e il tick della voce del
 *  Pitwall usano lo stesso costruttore — segue la firma del pegno 29/10:
 *  «un solo costruttore per tutti i consumatori» e niente vuoi-qui-vuoi-là. */
async function payloadIngegnere(context0, state, body, { leggero = false } = {}) {
  const { ladder, paths } = context0;
  const r = liveReader();
  await syncLiveReader();
  let snap = r.snapshot();
  // vigia del lettore sordo (29/10): live ma «sconosciuta» → riciclo al 15 s
  if (await vigiaSordo(r, snap)) snap = r.snapshot();  let raceLaps = null, fuelPerLap = null, telemTrack = null;
  /* LEGGERO (29/10 sera): quando serve SOLO la voce del Pitwall, niente raceCard
     né albero MoTeC — su disco lento valgono decine di secondi per richiesta e
     il tick in gara restava appeso a spaccare (il 28/10 muta). L'HUD says già
     lapsTotal e lapsOnFuel: delle estimate il narratore li già usa. */
  if (leggero) {
    const live0 = engineerLive(snap, { fuelPerLap: null, raceLaps: null });
    return {
      ...live0, auto: null,
    sessionId: snap.session?.id ?? null,
    sessionType: snap.session?.type ?? null,
    // 29/10: la FASE VERA della sessione (SMEvoSessionState.phase_name, es.
    // 'Race'/'Qualify') arriva al monitor nel payload leggero: il blocco STATIC
    // mente nelle gare SP («TimeAttack») e senza la fase nel registro non si
    // può dire se il gate inRace dell'ingegnere ià parlato giusto o tace per
    // il tipo sbagliato. Diagnosi: NOTE-AUTOMAZIONE.md (sezione TimeAttack).
    phase: live0.gauges?.sessionPhase ?? null,
    delta: snap.delta ?? null,
      timing: snap.player ? { currentLap: snap.player.currentLapText, lastLap: snap.player.lastLap, bestLap: snap.player.bestLap } : null,
      voceServer: voceServerAttiva(),
    };
  }
  try {
    const carRichiesta = typeof body?.car === 'string' ? body.car : null;
    const card = raceCard(ladder, state, { car: carRichiesta });
    raceLaps = card.round?.laps ?? card.baseLaps ?? null;
  } catch { /* senza scheda gara i consigli restano solo-live */ }
  if (snap.player?.car) {
    try {
      const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
      const resultsDir = paths.resultsDirs?.[0] ?? join(root, '..', 'Results');
      // MEMO 30s per auto (26/10, PC 2): l'albero MoTec su un disco lento
      // valgono decine di secondi per richiesta, e l'ingegnere parte ogni
      // ~2s dal cruscotto: una scansione appesa TRATTENE l'intera fila
      // delle API (è il circuito del flood «[coda] ferma da 20s»).
      if (!(_engSess?.car === snap.player.car && Date.now() - _engSessAt < 30000)) {
        const sess = collectSessions(root, resultsDir, { car: snap.player.car, limit: 1, afterMs: state.createdAt ?? 0 })[0] ?? null;
        _engSess = sess; _engSessAt = Date.now();
      }
      const sess = _engSess;
      if (sess && Number.isFinite(sess.fuelPerLap) && sess.fuelPerLap > 0) { fuelPerLap = sess.fuelPerLap; telemTrack = sess.track ?? null; }
    } catch { /* senza telemetria si stima dal HUD del gioco */ }
  }
  const live = engineerLive(snap, { fuelPerLap, raceLaps });
  // VIGIA DEL PARCO AUTO: mentre giri, copilota e pannello sanno SUBITO se
  // l'auto del sedile è una di quelle ammesse della serie — un'auto fuori
  // pool all'import vale zero (car-pool.mjs). Il giudizio live però vale
  // SOLO con la serie giusta (27/10, Mauro: «non fa altro che dire F40
  // fuori parco» — l'F40 LM ha un SUO parco e il coach lo giudicava col
  // pool della serie di carriera anche in sessioni d'altro tipo):
  // poolNodeForLive chiede pista del round (e, senza pending, una Race).
  // Menu, prove libere, MP e test con altre serie → auto null, la copilota
  // tace; l'import giudica col file risultato, che è la verità.
  let auto = null;
  try {
    const nodoLive = poolNodeForLive(ladder, {
      pending: state.pending ?? null,
      node: state.node ?? null,
      round: state.round ?? null,
      smTrack: snap.session?.track ?? null,
      smType: snap.session?.type ?? null,
      // vetrina custom viva (demo endurance ecc.): nessuno giudica il parco
      // con il pool della ronda pendente, è la lezione del 28/10 sera
      demo: state.vetrinaCustom ?? null,
    });
    if (nodoLive) {
      const parco = carPoolOf(ladder, nodoLive);
      if (parco.ammesse.length) auto = {
        ok: !snap.player?.car || carInPool(snap.player.car, parco.ammesse),
        mine: snap.player?.car ?? null,
        ammesse: parco.ammesse.slice(0, 6),
        classe: parco.classe,
      };
    }
  } catch { /* senza pool la copilota non giudica */ }
  return {
    ...live,
    auto,
    // impronta della sessione per il copilota (28/10): sessione nova
    // = memoria dei narratori azzerata senza voci sbagliate all'avvio
    sessionId: snap.session?.id ?? null,
    // tipo di sessione per il monitor del copilota (28/10): il log
    // copilot-*.jsonl lo registrava sempre null e non si poteva capire
    // perché i narratori tacevano; finalmente dalla MMF static
    sessionType: snap.session?.type ?? null,
    telemTrack,
    fuelPerLap: live.gauges?.fuelPerLap ?? null,
    delta: snap.delta ?? null,
    mapTrack: snap.map?.best ?? null,
    carPos: snap.map?.cur ?? null,
    timing: snap.player ? { currentLap: snap.player.currentLapText, lastLap: snap.player.lastLap, bestLap: snap.player.bestLap } : null,
    // voce della copilota gestita dal PITWALL (29/10): se vera, la barra del
    // browser NON replica i narratori in locale (niente doppia radio) e il
    // chip la comanda via POST /api (voce-server).
    voceServer: voceServerAttiva(),
    voceLevel: voceServerLivello(),
  };
}
/* UNO TICK della voce: parte dopo il listen (aggiunto giù, vicino a watcherTick).
   Fuori gara esce PRIMA del ciclo pesante: il payload costruito SOLO in pista.
   Ogni motivo di silenzio va sul log UNA volta al minuto (diagnostiche 29/10:
   senza motive scritti la muta non si poteva distinguere dal tick morto). */
let _voceSilAt = 0;
let _voceTickN = 0;
let _voceTickAt = 0;      // 29/10 sera: quando l'ULTIMO tick è finito DAVVERO
async function copilotaServerTick() {
  const n = ++_voceTickN;
  // diagnostica 29/10: i primi 3 tick di ogni partenza del serverスクivono che
  // stato vedono — se qui mancano righe, è il tick che non parte affatto
  if (n <= 3) logaVoce({ evento: 'TICK', n, ora: new Date().toISOString() });
  try { await copilotaServerTickInterno(); }
  catch (e) { logaVoceErr(e); }   // un async dentro setInterval non urla da solo: viaggio nel registro
  finally { _voceTickAt = Date.now(); }   // un tick APPESO non aggiorna MAI questa (è il segnale del vigilante)
}
async function copilotaServerTickInterno() {
  const PERCHE = [];
  const tacchio = () => {
    const ora = Date.now();
    if (PERCHE.length && ora - _voceSilAt > 60000) { _voceSilAt = ora; logaVoce({ evento: 'SILENZIO', motivi: PERCHE.join(' + ') }); }
  };
  if (!voceServerAttiva()) { PERCHE.push('voce config OFF'); tacchio(); return; }
  if (liveMode() === 'off') { PERCHE.push('liveMode off'); tacchio(); voceSrv.silenzio(); return; }
  /* GUARDIA del PING (29/10 sera, 3ª cura — gara TimeAttack muta col ping):
     la pagina AVEVA i narratori accesi (ping on:true ogni 10 s), giri tagliati
     e ritmo regolare, e NIENTE era uscito: la voce da browser resta
     irrispettabile (cache, attese, voci, autoplay) e fissarla è impossibile
     da fuori. DECISIONE: la radio vive SOLO qui (System.Speech, Cosimo —
     già sentito vivo ieri sera). Il ping serve SOLO a dichiara il silenzio
     VOLUTO: chip OFF → on:false → il server tace. Chip ON → pagina muta
     (panello) e il SERVER che parla, sempre, anche con la GUI chiusa. */
  if (_pingVocePagina.at && Date.now() - _pingVocePagina.at < 20000 && !_pingVocePagina.on) {
    PERCHE.push('la pagina ha la copilota OFF (ping)'); tacchio(); return;
  }
  /* Il tick è la voce SENZA browser: non può fidarsi della cache del lettore
     (la GUI con le sue richieste ogni 2 s non c'è a sinronizzarla). Sync e
     vigia del sordo qui dentro (29/10): con la GUI chiusa il lettore può
     restare «sordo» per sempre e la voce tacava alla festa. */
  const rd = liveReader();
  await syncLiveReader();
  let snap0 = rd.snapshot();
  if (await vigiaSordo(rd, snap0)) snap0 = rd.snapshot();
  // 30/10: lo stale (MMF fredda >20 s) merita la SUA riga di registro, così la
  // gara muto del 29/10 si leggeva subito invece di apparire «gioco non vivo».
  if (snap0?.stale) { PERCHE.push('lettore stantio: la memoria condivisa non aggiorna da >20 s'); tacchio(); return; }
  if (!snap0?.game) { PERCHE.push('gioco non è vivo nello snapshot'); tacchio(); return; }
  if (!snap0?.live) { PERCHE.push('sessione non in pista (live=false)'); tacchio(); return; }
  try {
    const state0 = existsSync(SAVE_FILE) ? requireState() : null;
    const m = await payloadIngegnere(context(), state0, null, { leggero: true });
    if (!m?.live) logaVoce({ evento: 'PAYLOAD NON VIVO', type: m?.sessionType ?? null, snapLiveOk: true });      // 30/10 BUG: qui il 4° argomento era LOGUE_VOCE gettona ({file}); giroVoce
      // lo scarta ({log} default null) e il registro dei narratori NON riceveva
      // le SESSIONE VIVA né le righe chi/it: una gara parlata uguale a una muta
      // era Indistinguibile sul carta. Adesso passa { log } e il registro giunge.
      giroVoce(m, slotVoceServo, voceSrv, { log: LOGUE_VOCE, livello: voceServerLivello() });
  } catch (e) {
    // la voce non deve MAI rompere il server, ma l'errore non deve sparire
    // nel niente (29/10: il catch bianco nascondeva il TypeError del body null
    // e la copilota restava «muta senza errori»): errore nel registro della voce.
    logaVoceErr(e);
  }
}
/** Riassunto in una riga delle ore distinte per sessione (Practice 10:00 · …): serve
 *  a card e preperare per dire all'amico COME sono posizionate le sessioni. */
function orarioSessioni(sessi) {
  // le durate (f2 in secondi) si mostrano in "NN min" accanto all'ora di inizio
  return Object.entries(sessi ?? {}).map(([k, h]) => `${k} ${String(h).padStart(2, '0')}:00`).join(' · ');
}

/** Riassunto anche DELLE DURATE per sessione (Practice 20 min · …): richiesta
 *  Mauro 31/10 — le sessioni seguono la distanza in %, oltre alle ore. */
function durataSessioni(sessi) {
  return Object.entries(sessi ?? {}).map(([k, v]) => `${k} ${Math.round(Number(v) / 60)} min`).join(' · ');
}

async function api(context0, _req, res, action, body) {
  const { ladder, paths } = context0;
  const hasCareer = () => existsSync(SAVE_FILE);
  const state = hasCareer() ? requireState() : null;    const needsCareer = ['agenda-detail', 'championships', 'world-ranking', 'status', 'series', 'calendar', 'standings', 'paddock', 'messages', 'card', 'difficulty', 'enter', 'accept', 'import', 'race', 'season-end', 'rename', 'difficulty-action', 'stats', 'rivals', 'rival-detail', 'alias-set', 'integrity', 'integrity-fix', 'season-review', 'life', 'gazzetta', 'gazzetta-season', 'planner', 'challenge-accept', 'sponsor-accept', 'sponsor-decline', 'review-export', 'flows', 'testday', 'garage', 'events', 'event-accept', 'event-prep', 'event-decline', 'event-finish', 'event-abandon', 'my-garage', 'garage-add', 'garage-remove', 'garage-note', 'garage-sell', 'event-prize-refresh', 'difficulty-nudge', 'nudge-dismiss', 'heritage', 'heritage-claim', 'race-settings', 'import-inspect', 'tracks', 'backup', 'grid-apply', 'grid-drop', 'grid-ai', 'mechanic', 'maintenance'];
  if (needsCareer.includes(action) && !state) {
    return sendJson(res, 400, { error: tr({ it: "Non c'è ancora una carriera: creane una dalla schermata iniziale.", en: 'There is no career yet: create one from the start screen.' }) });
  }
  if (state) {
    ensureFlowsSeeded(state); // carriere nate prima del registro flussi
    // difficoltà AI diretta per OGNI serie: 84–85% di default (richiesta Mauro
    // 27/10: prima il 88–89, poi «per qualcuno potrebbe già essere difficile»:
    // si parte TUTTI dalla stessa banda 84–85 e poi comanda il TRIM
    // adattivo a salire o scendere serie per serie) — la Coppa GT86 resta
    // un'eccezione della sua scelta se la risegnalata da lui. Chi ha già un
    // valore lo mantiene; le serie senza impostazione lo ricevono.
    const RS = (state.raceSettings ??= {});
    for (const n of (ladder.nodes ?? [])) {
      const cur = RS[n.nodeId];
      if (!cur) RS[n.nodeId] = { sliderMin: 84, sliderMax: 85 };
      else {
        if (cur.sliderMin == null) cur.sliderMin = 84;
        if (cur.sliderMax == null) cur.sliderMax = 85;
      }
    }
  }

  switch (action) {
    case 'hang-test': {
      // SOLO TEST (EVO_TEST_HANG=1, corre da webui-queue.test.mjs): un'azione
      // resta appesa, per provare che il guardiano della coda la segnala
      // come 504 senza congelare le richieste dopo di lei.
      // Fuori dai test risponde subito che non è prevista (niente buchi).
      if (!process.env.EVO_TEST_HANG) {
        return sendJson(res, 400, { error: tr({ it: 'Azione di test non attiva.', en: 'Test-only action is not active.' }) });
      }
      return new Promise(() => {});
    }
    case 'lang': {
      // UNA lingua per tutti: la scelta in Impostazioni vale anche per CLI e server.
      // Si salva in evo.config.json e si applica subito al server vivo. EVO_LANG
      // in ambiente resta arbitrato superiore (utile per forzare via terminale).
      // LETTURA (GET / niente body.lang): la GUI nuova resta d'accordo col
      // server quando il browser non ha mai scelto lui (24/10: la copilota
      // parlava italiano sull'interfaccia inglese perché ogni porta è un
      // ORIGIN suo con localStorage separato — vedi gui/js/lang.js).
      const v = String(body.lang ?? '').toLowerCase();
      if (!['it', 'en'].includes(v)) {
        if (!('lang' in body) || body.lang == null || body.lang === '') {
          return sendJson(res, 200, { ok: true, lang: lang() });
        }
        return sendJson(res, 400, { error: tr({ it: 'Lingua non riconosciuta (it|en).', en: 'Unknown language (it|en).' }) });
      }
      if (!hasEnvOverride()) setLang(v);
      writeConfig({ lang: v });
      return sendJson(res, 200, { ok: true, lang: lang() });
    }
    case 'weekendrace': {
      // LA GARA DEL WEEKEND VIA BRIDGE (28/10 tardissimo, «tramite loader non
      // riesci a dare il commando diretto?»: Mauro ha fatto a mano «5 muti»
      // + Applica nel menu e il file del save lo dice chiarissimo — f3=1,
      // f2=300). Stesso gesto dell'istantrace, ma sul gamemodesave del
      // weekend: LETTURA senza body ({sessioni}), scrittura con laps:
      // {laps} a giri (o converte una gara rimasta a tempo) / {tempo}
      // minuti a tempo. force è cosciente qui: via bridge si scrive a
      // gioco aperto come la griglia.
      try {
        const haGiri = body.laps != null;
        const haTempo = body.tempo != null;
        if (!haGiri && !haTempo) return sendJson(res, 200, { ok: true, sessioni: weekendLaps() });
        const r = haGiri
          ? setWeekendLaps(Number(body.laps), { force: true })
          : setWeekendTimed(Number(body.tempo));
        const dopo = weekendLaps();
        const quale = raceBlockIndex(dopo);
        return sendJson(res, 200, { ok: true, ...r, gara: quale >= 0 ? dopo[quale] : null, sessioni: dopo });
      } catch (e) {
        const h409 = ['NO_VALUES', 'BAD_LAPS', 'BAD_TEMP'].includes(e.code);
        return sendJson(res, h409 ? 409 : 500, { error: e.message });
      }
    }
    case 'instantrace': {
      // GARA CUSTOM A TEMPO, VIA BRIDGE (28/10 tardissimo, «siamo connessi
      // tramite loader, dovresti riuscire»): lettura e scrittura dell'
      // INSTANT_RACE come AZIONE API, così la modalità/durata si sistema
      // a gioco APERTO, come la griglia del ponte. Il gioco non rilegge il
      // file che all'avvio della sessione: la scrittura va fatta PRIMA di
      // premere «parti» nel menu. force:true è cosciente qui (il CLI senza
      // force rifiuta «EVO è APERTO»: via bridge la scelta è esplicita).
      // LETTURA (GET / body vuoto): solo lo stato, niente scritture.
      // Scrittura: minutes → a tempo; laps → a giri (ripristino).
      try {
        if (!('minutes' in body) && !('laps' in body)) {
          const cur = currentInstantRace();
          if (!cur) return sendJson(res, 200, { ok: true, presente: false });
          return sendJson(res, 200, { ok: true, presente: true, ...cur });
        }
        const r = timedRace({ minutes: body.minutes != null ? Number(body.minutes) : null, laps: body.laps != null ? Number(body.laps) : null, force: true });
        return sendJson(res, 200, { ok: true, ...r });
      } catch (e) {
        const h409 = ['AMBIGUOUS', 'BAD_DURATA', 'NO_VALUES'].includes(e.code);
        return sendJson(res, h409 ? 409 : 500, { error: e.message });
      }
    }
    case 'wizard': {
      // WIZARD del primo avvio (Mauro 22/10 stile «spunta verde»): stato del
      // percorso dati e dell'exe, salvataggio manuale persistito in
      // evo.config.json (appEnv lo rilegge a OGNI request: niente riavvio),
      // e preparazione = scansione dei contenuti EVO. Niente download: le
      // immagini auto (carmaps/) sono opzionali e restano asset locali.
      let envNow = appEnv();
      const wAct = body.action ?? 'check';
      if (wAct === 'explore') {
        // 📂 TASTO RAPIDO DEL WIZARD: apre Esplora risorse sulla cartella dati di
        // EVO (selezionata dentro la cartella madre, così la vedi evidenziata);
        // con un path esplicito apre quello — sempre esistente, sempre LOCALE
        // (niente percorsi di rete: explorer può condurre ovunque a vista ma non
        // esegue nulla di per sé). Fire-and-forget: explorer esce con codice 1
        // anche quando riesce, quindi non aspettiamo il suo exit code.
        let target = String(body.path ?? '').trim();
        if (!target) target = (() => { try { return resolvePaths(appEnv()).primary ?? ''; } catch { return ''; } })();
        if (!target) return sendJson(res, 400, { error: tr({ it: 'Nessuna cartella dati conosciuta: registra prima il percorso nel wizard.', en: 'No known data folder: register the path in the wizard first.' }) });
        if (target.startsWith('//') || (target[0] === '\\' && target[1] === '\\')) return sendJson(res, 400, { error: tr({ it: 'Percorso di rete non consentito.', en: 'Network paths are not allowed.' }) });
        if (!isDir(target)) return sendJson(res, 400, { error: tr({ it: `Cartella inesistente: ${target}`, en: `Folder does not exist: ${target}` }) });
        if (process.platform !== 'win32') return sendJson(res, 400, { error: tr({ it: `Apri a mano: ${target}`, en: `Open it by hand: ${target}` }) });
        import('node:child_process').then(({ spawn }) => {
          spawn('explorer', [`/select,${target}`], { detached: true, stdio: 'ignore' }).unref();
        });
        return sendJson(res, 200, { ok: true, opened: target });
      }
      if (wAct === 'launch') {
        // ▶ TASTO RAPIDO DEL WIZARD: avvia EVO con l'URI ufficiale di Steam
        // (steam://rungameid/<id>) — funziona anche SENZA exe ricavato dalla
        // Steam Library, e parte solo se il gioco non è già aperto.
        if (process.platform !== 'win32') return sendJson(res, 400, { error: 'Avvio automatico non supportato su questa piattaforma: apri EVO a mano.' });
        try {
          let paths = null;
          try { paths = resolvePaths(appEnv()); } catch { paths = { gameExe: null }; }
          const via = await launchGame(paths, { exe: false });
          return sendJson(res, 200, { ok: true, ...via });
        } catch (e) {
          return sendJson(res, 500, { error: tr({ it: `Avvio non riuscito: ${e.message}`, en: `Launch failed: ${e.message}` }) });
        }
      }
      if (wAct === 'set') {
        const dir = String(body.dataDir ?? '').trim();
        if (dir) {
          if (!isDir(dir)) return sendJson(res, 400, { error: tr({ it: `Cartella inesistente: ${dir}`, en: `Folder does not exist: ${dir}` }) });
          const somiglia = /(\\|\/)ACE$/i.test(dir) || ['Results', 'Logs', 'MoTec', 'SavedCars', 'mod', 'Content', 'compat'].some((n) => isDir(join(dir, n)));
          if (!somiglia) {
            return sendJson(res, 400, { error: tr({ it: "Questa cartella non assomiglia alla cartella dati di EVO (ci mancano sottocartelle come Results/MoTec). La cartella giusta è di solito …\\Saved Games\\ACE.", en: 'This folder does not look like the EVO data folder (subfolders such as Results/MoTec are missing). The right folder is usually …\\Saved Games\\ACE.' }) });
          }
          writeConfig({ dataDir: dir });
        }
        const exe = String(body.gameExe ?? '').trim();
        if (exe) {
          if (!isFile(exe)) return sendJson(res, 400, { error: tr({ it: `File non trovato: ${exe}`, en: `File not found: ${exe}` }) });
          if (!/AssettoCorsaEVO\\.exe$/i.test(exe)) return sendJson(res, 400, { error: tr({ it: 'Serve proprio AssettoCorsaEVO.exe (dentro la cartella della Steam Library).', en: 'It must be exactly AssettoCorsaEVO.exe (inside the Steam Library folder).' }) });
          writeConfig({ gameExe: exe });
        }
      }
      // lo Stato SI RILEGGE tutto DOPO l'eventuale 'set': la config nuova vale subito
      if (wAct === 'set') envNow = appEnv();
      let view = null;
      try { view = viewSetup(loadLadder(), resolvePaths(envNow)); } catch { /* folder data assente: resta null */ }
      const candidates = dataDirCandidates(process.env).map((d) => ({ dir: d, ok: isDir(d) }));
      let carmaps = 0;
      try { carmaps = readdirSync(join(GUI_DIR, 'carmaps')).filter((f) => f.toLowerCase().endsWith('.jpg')).length; } catch { /* niente foto: opzionale */ }
      return sendJson(res, 200, {
        action: wAct,
        dataDir: view?.dataDirs?.[0] ?? null,
        candidates,
        gameExe: view?.gameExe ?? null,
        career: existsSync(SAVE_FILE),
        content: view?.content ?? { cars: 0, tracks: 0 },
        carmaps,
        saved: view?.saved ?? {},
        // primo weekend (27/10): su un save vergine GameModeType_RACE_WEEKEND
        // .gamemodesave nasce solo alla prima apertura del round in EVO — lo
        // stato va nel wizard, così l'amico SA cosa manca prima di premere
        // «Prepara tutto» e non scopre a gara rimandata.
        weekendFile: existsSync(WEEKEND_FILE),
      });
    }
    case 'boot': {
      return sendJson(res, 200, {
        hasCareer: hasCareer(),
        header: state ? viewHeader(ladder, state) : null,
        setup: viewSetup(ladder, paths),
        gameRunning: await isGameRunning(),
        // barra aggiornamenti: FUORI dal boot (freeze 23/10) — la GUI la pesca
        // in contorno con /api/agg-info (drawAggBar(null) ultimata), così il
        // primo pannello non aspetta la rete di GitHub.
        aggiornamenti: null,
        // badge urgente sul menu Messaggi: email priorità alta della posta del pilota
        mailUrgent: state ? mailbox(ladder, state).mails.filter((m) => m.priorita === 'urgente').length : 0,
        // versione della build visibile in GUI (sidebar): package.json + breve hash git
        versione: buildVersion(),
        // footer: "Segnala un problema" (issue precompilata) + link donazioni (config)
        feedback: state ? feedbackLinks({ ladder, state }) : feedbackLinks(null),
      });
    }
    case 'agg-info': {
      // fresh ogni volta: il client lo ripete dopo un'installazione. Versione
      // ASINCRONA: git ls-remote non blocca più l'event loop (audit freeze 23/10).
      // Indicatore Impostazioni (24/10): accanto al puro stato porto BUILD locale
      // (semver + hash del disco) e il momento dell'ultima verifica — così la GUI
      // mostra "aggiornato a …" anche quando tutto combacia (prima il response
      // era SECCO: in stato di quiete l'utente non vedeva più nulla in giro).
      const stato = await aggMemo();
      return sendJson(res, 200, {
        ...stato,
        build: buildVersion(),
        verificato: AGG_AT ? new Date(AGG_AT).toLocaleTimeString('it-IT') : null,
      });
    }
    case 'agg-install': {
      // l'utente ha cliccato "Aggiorna ora": il consenso è già dato per definizione
      try {
        const r = await installaAggiornamenti();
        // AUTO-RESTART (24/10, richiesta Mauro): se il codice è davvero cambiato
        // e i test non sono morti, il server si riavvia DA SOLO: spawna l'helper
        // staccato (che ammazza questo processo, aspetta la porta e riparte con
        // node src/webui.mjs) e qui risponde al browser «riavvio programmato».
        if (r.ok && !r.nessuno && r.testOk !== false) {
          AGG_CACHE = null; AGG_AT = 0; // il prossimo agg-info parte fresco
          const { spawn } = await import('node:child_process');
          spawn(process.execPath, [join('tools', 'riavvia-webui.mjs'), String(process.pid)], {
            cwd: PROJECT, detached: true, stdio: 'ignore',
          }).unref();
          r.riavvio = true;
        }
        return sendJson(res, 200, r);
      }
      catch (e) { return sendJson(res, 200, { ok: false, messaggio: String(e.message ?? e) }); }
    }
    case 'agenda-sign-preview': {
      // ANTICIPO CONFLITTI alla firma: come cadrebbe il calendario della nuova serie
      // e le collisioni con le serie già iscritte (prima di spendere soldi/reputazione)
      const id = String(body.nodeId ?? '');
      const node = ladder.nodes.find((n) => n.nodeId === id);
      if (!node) return sendJson(res, 404, { error: tr({ it: 'Serie sconosciuta.', en: 'Unknown series.' }) });
      const today = agendaDay(state);
      // simula il sedile di oggi: ronda k → giorno anchor + k·7
      const fakeState = { ...state, seats: { ...state.seats, [id]: { day: today, season: state.season } } };
      const future = [];
      for (let i = 0; i < node.calendar.length; i++) {
        const day = Math.max(1, today + i * CADENZA_GIORNI);
        const collide = [];
        for (const otherId of Object.keys(state.seats ?? {})) {
          const on = nodeById(ladder, otherId);
          const sd = scheduledDay(ladder, fakeState, on);
          // collisione se la stessa settimana (±1 giorno di flessibilità)
          if (sd != null && Math.abs(sd - day) <= 1) {
            const r = nextUnplayedRound(ladder, state, on);
            collide.push({
              nodeId: otherId, display: on.display, day: sd,
              dateLabel: dateLabel(sd), roundIndex: r?.index ?? null, track: r?.track ?? null,
            });
          }
        }
        const names = ladder.contentNames?.tracks ?? {};
        const round = node.calendar[i];
        future.push({
          index: i, day, dateLabel: dateLabel(day),
          name: round.name ?? `Round ${i + 1}`,
          track: names[round.track] ?? round.track,
          laps: round.laps, hour: round.hour,
          conflicts: collide,
        });
      }
      const conflittiTotali = future.filter((f) => f.conflicts.length).length;
      return sendJson(res, 200, {
        nodeId: id, display: node.display, level: node.level ?? 0,
        calendarLen: node.calendar.length,
        cadenza: CADENZA_GIORNI,
        bollette: node.econ ?? null,
        startLabel: dateLabel(today),
        future, conflictsTotal: conflittiTotali,
      });
    }
    case 'status': return sendJson(res, 200, viewStatus(ladder, state));
    // PADDACK (richiesta Mauro 26/10 "punti correndo"): la scheda della
    // prossima gara + il calendario + l'economia dell'app Paddock, LETTA dal
    // disco (nessun avvio richiesto): gli extra sono ready per il cruscotto.
    case 'paddock': return sendJson(res, 200, paddockOverview(process.env));
    case 'catalog': return sendJson(res, 200, loadCatalog(paths, process.env, { driver: state?.driver ?? null, afterMs: body.all ? 0 : (state?.createdAt ?? 0) }));
    case 'mp':
      // ARCHIVIO ONLINE (31/10): sessioni _MP_ + libro dei rivali online, dal
      // stesso scopo carriera del catalog (afterMs = nascita della carriera).
      return sendJson(res, 200, onlineArchive(paths, { driver: state?.driver ?? null, afterMs: body.all ? 0 : (state?.createdAt ?? 0) }));
    case 'result-detail': return sendJson(res, 200, resultDetail(paths, String(body.file ?? ''), { driver: state?.driver ?? null }) ?? { error: tr({ it: 'File non trovato.', en: 'File not found.' }) });
    // RAPPORTO DI GARA (27/10): il dossier PRONTO DA INCOLLARE su Discord —
    // stessa fonte del resultDetail (resultDetail) + settori dal file nativo;
    // salva anche il .md in report/gare/ per l'allegato.
    case 'rapporto-gara': return sendJson(res, 200, paths ? rapportoGara(paths, String(body.file ?? ''), { driver: state?.driver ?? null }) : { error: tr({ it: 'Percorsi dati EVO non configurati: apri il wizard.', en: 'EVO data paths not configured: open the wizard.' }) });
    case 'watcher':
      return sendJson(res, 200, { active: true, armed: watcher.armed, racedEnd: watcher.racedEnd, lastMsg: watcher.lastMsg, events: watcher.events, seq: watcher.importSeq ?? 0 });
    case 'live': {
      const mode = await syncLiveReader();
      if (mode === 'off') return sendJson(res, 200, { game:false, liveMode:'off' });
      const r = liveReader();
      let snap = r.snapshot();
      // RECUPERO: il lettore PowerShell può restare "inciappato" in nogame (genere
      // avviato mentre EVO era chiuso, MMF già passate): se il PROCESSO del gioco
      // è vivo ma il lettore non lo vede, lo riciclo al volo e riprovo.
      if (!snap.game && await gameRunningMemo()) {
        r.stop();
        r.start();
        snap = r.snapshot();
      }
      // RECUPERO SORDO (29/10): vivo ma senza dati (sessione sconosciuta,stale)
      // per più di 15 s col gioco avviato → stesso riciclo, automatico.
      if (await vigiaSordo(r, snap)) snap = r.snapshot();
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
            { key: 'sessione', expected: 'Gara', live: live.type, ok: live.type === 'Race' },
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
      _pingVocePagina = { at: Date.now(), on: !!body.on };
      return sendJson(res, 200, { ok: true });
    }
    case 'stats': return sendJson(res, 200, careerStats(ladder, state));
    case 'alias-set': {
      // Nomi del pilota (26/10): soprannomi per RIVALI e PILOTI DEL MONDO,
      // salvati nel save (state.alias) così sopravvivono agli aggiornamenti.
      // scope 'rival' usa la chiave rivals.json, scope 'world' la chiave
      // world:NOME-COGNOME dell'elenco; alias vuoto = rimuovi il soprannome.
      const scope = String(body.scope ?? 'rival');
      const k = String(body.key ?? '').trim();
      const a = String(body.alias ?? '').trim();
      if (!k) return sendJson(res, 400, { error: tr({ it: 'Manca il pilota.', en: 'Missing driver.' }) });
      const key = scope === 'world' ? `world:${k}` : k;
      state.alias ??= {};
      if (a) state.alias[key] = a; else delete state.alias[key];
      persist(state);
      return sendJson(res, 200, { ok: true });
    }
    case 'rivals': return sendJson(res, 200, rivalsOverview(ladder, state, { q: typeof body.q === 'string' ? body.q : null }));
    case 'imports': return sendJson(res, 200, { ledger: importedFiles().slice(0, 30), log: importLog(20) });
    case 'rival-detail': return sendJson(res, 200, rivalDetail(String(body.key ?? ''), state) ?? { error: tr({ it: 'Rivale non trovato.', en: 'Rival not found.' }) });
    case 'rival-dossier': return sendJson(res, 200, rivalDossier(String(body.key ?? ''), state) ?? { error: tr({ it: 'Rivale non trovato.', en: 'Rival not found.' }) });
    // analisi (tab Analisi): autopsia dell'ultima gara, tetto teorico, banco A/B, Monte Carlo sedili
    case 'autopsy': return sendJson(res, 200, raceAutopsy(ladder, state) ?? { error: tr({ it: 'Nessuna gara ancora: dopo il primo import qui arriva la scomposizione del deficit.', en: 'No race yet: the deficit breakdown lands here after the first import.' }) });
    case 'tetto': return sendJson(res, 200, tettoReport(ladder, state));
    case 'seat-mc': return sendJson(res, 200, seatMonteCarlo(ladder, state, { sims: Number(body.sims) || 400 }));
    case 'ab-list': {
      // primo avvio senza cartelle dati: niente TypeError su join(undefined):
      // il root è una stringa vuota, listMotecSessions torno un elenco vuoto.
      const root = join(paths.dataDirs?.[0] ?? paths.dataDirs?.[1] ?? '', 'MoTec');
      const sessions = listMotecSessions(root).slice(0, 40).map((s) => ({
        file: s.name, path: s.file, car: s.car, track: s.track,
        when: new Date(s.mtime).toLocaleString('it-IT'), mtimeMs: s.mtime,
      }));
      return sendJson(res, 200, { ok: true, sessions });
    }
    case 'ab-setup': {
      try {
        const root = join(paths.dataDirs?.[0] ?? paths.dataDirs?.[1] ?? '', 'MoTec');
        const all = listMotecSessions(root, { afterMs: state.createdAt ?? 0 }); // solo sessioni della SUA carriera (24/10)
        const pick = (name) => all.find((s) => s.name === String(name ?? ''))
          ?? (isFile(String(name ?? '')) ? { file: String(name) } : null);
        const a = pick(body.fileA), b = pick(body.fileB);
        if (!a || !b) return sendJson(res, 400, { error: tr({ it: 'Seleziona due sessioni MoTeC (A e B).', en: 'Pick two MoTeC sessions (A and B).' }) });
        return sendJson(res, 200, setupAB(a.file, b.file, { points: Number(body.points) || 240 }));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'world-ranking': {
      // classifica MONDIALE per prestige: tutti i piloti del mondo ordinati per
      // skill innata (i più forti sono i "F1"), con la tua posizione in elenco
      const world = state.world;
      const archInfo = ladder.archetypes ?? {};
      const ADJ = [
        // aggettivi/citazione di forma: derivano da skill, archetipo, forma e età
        (s, a, hot, age) => {
          const out = [];
          if (hot) out.push(tr({ it: 'in forma 🔥', en: 'in form 🔥' }));
          if (s >= 0.95) out.push(tr({ it: 'fuoriclasse', en: "world-class talent" }));
          else if (s >= 0.90) out.push(tr({ it: 'velocissimo', en: 'blazing fast' }));
          else if (s >= 0.84) out.push(tr({ it: 'competitive', en: 'competitive' }));
          else out.push(tr({ it: 'in crescita', en: 'on the rise' }));
          if (a === 'AP') out.push(tr({ it: 'attaccante nato', en: 'born attacker' }));
          else if (a === 'CH') out.push(tr({ it: 'imprevedibile', en: 'unpredictable' }));
          else if (a === 'MT') out.push(tr({ it: 'metodico', en: 'methodical' }));
          else if (a === 'AM') out.push(tr({ it: 'regolarista', en: 'metronome' }));
          if (age != null && age <= 20) out.push(tr({ it: 'prodigio in ascesa', en: 'rising prodigy' }));
          else if (age != null && age >= 38) out.push(tr({ it: 'veterano affilato', en: 'sharp veteran' }));
          return out.slice(0, 3);
        },
      ][0];
      const rows = (world?.drivers ?? [])
        .filter((d) => d.active !== false)
        .map((d) => ({
          key: d.id ?? `${d.first}-${d.last}`, name: state?.alias?.[`world:${d.id ?? `${d.first}-${d.last}`}`] || `${d.first} ${d.last}`, realName: `${d.first} ${d.last}`, country: d.country,
          skill: Number(d.skill) || 0, age: d.age, archetype: d.archetype,
          cons: d.cons, aggr: d.aggr, hot: !!d.hot, iconic: !!d.iconic, seasons: d.seasons ?? 0,
          form: d.hot ? tr({ it: 'in forma', en: 'in form' }) : d.retired ? tr({ it: 'in declino', en: 'in decline' }) : '',
          traits: ADJ(Number(d.skill) || 0, d.archetype, !!d.hot, d.age),
          archName: archInfo[d.archetype]?.name ?? d.archetype,
          archDesc: archInfo[d.archetype]?.description ?? '',
        }))
        .sort((a, b) => b.skill - a.skill);
      // skill DEL GIOCATORE: UNA SOLA formula per tutto (vedi world.mjs):
      // base dalla serie corrente, ma cresce coi RISULTATI reali (vittorie e
      // podi spingono sopra la banda della serie): P1 in una serie bassa può
      // valere più di un P8 in una alta.
      const cur = nodeById(ladder, state.node);
      const mySkill = playerWorldSkill(cur, state);
      const me = { key: 'player', name: state.driver.name, country: state.driver.nation, skill: mySkill, age: null, archetype: 'TU', form: '' };
      const all = [...rows, me].sort((a, b) => b.skill - a.skill);
      const myPos = all.findIndex((r) => r.key === 'player') + 1;
      const top = all.slice(0, 40);
      // la tua riga è SEMPRE nell'elenco anche se il posto è oltre il 40°:
      // comparirà in fondo marcata "tu", per vedere il tuo blocco
      if (myPos > top.length) {
        const idx = all.findIndex((r) => r.key === 'player');
        top.push(all[idx]);
      }
      return sendJson(res, 200, {
        total: all.length,
        myPosition: myPos,
        me,
        rows: top.map((r) => ({
          position: all.indexOf(r) + 1, name: r.name, country: r.country, skill: Math.round(r.skill * 100),
          age: r.age, archetype: r.archetype, isPlayer: r.key === 'player', form: r.form,
          traits: r.traits ?? [], archName: r.archName, archDesc: r.archDesc,
          cons: r.cons != null ? Math.round(r.cons * 100) : null, aggr: r.aggr != null ? Math.round(r.aggr * 100) : null,
          hot: r.hot, iconic: r.iconic, seasons: r.seasons ?? 0,
        })),
      });
    }
    case 'championships': {
      // una sezione per ogni campionato ISCRITTO: calendario della stagione in
      // corso + classifica reale (solo ronde trascorse) + i tuoi risultati
      const out = [];
      for (const nodeId of Object.keys(state.seats ?? {})) {
        let node;
        try { node = nodeById(ladder, nodeId); } catch { continue; }
        // dettagli per i badge in cima alla pagina: auto della serie + prossimo round
        const names2 = ladder.contentNames?.cars ?? {};
        const nextR = nextUnplayedRound(ladder, state, node);
        const results = (state.results?.[nodeId] ?? []).filter((r) => Number(r.season) === state.season);
        const names = ladder.contentNames?.tracks ?? {};
        let table = null;
        try {
          table = standingsFor(ladder, state, node, state.season).map((r) => ({
            position: r.position, name: r.name, points: r.points, isPlayer: !!r.isPlayer,
          }));
        } catch { table = null; }
        out.push({
          nodeId, display: node.display, level: node.level ?? 0,
          discipline: disciplineName(ladder, node.discipline),
          season: state.season,
          seatDay: state.seats[nodeId].day ?? null,
          // dettagli per i badge in cima alla pagina: auto della serie + prossimo round
          cars: (node.cars ?? []).slice(0, 3).map((c) => names2[c] ?? c),
          nextRound: nextR ? { index: nextR.index, track: names[nextR.track] ?? nextR.track, day: nextR.scheduledDay ?? null } : null,
          calendar: node.calendar.map((round, i) => ({
            index: i,
            name: round.name ?? `Round ${i + 1}`,
            track: names[round.track] ?? round.track,
            laps: round.laps,
            hour: round.hour,
            played: results.some((r) => r.round === i),
          })),
          mine: results.map((r) => ({
            round: r.round, position: r.dnf ? 'DNF' : r.position, points: r.points,
            track: names[node.calendar[r.round]?.track] ?? node.calendar[r.round]?.track, fl: !!r.fl,
          })),
          standings: table,
          isCurrent: nodeId === state.node,
        });
      }
      return sendJson(res, 200, { championships: out });
    }
    case 'agenda-detail': {
      // scheda completa della gara cliccata in Agenda: serie, auto, calendario,
      // classifica in corso (se la stagione è iniziata), gate e meteo
      const id = String(body.nodeId ?? '');
      const day = Number.isFinite(Number(body.day)) ? Number(body.day) : agendaDay(state);
      const g = racesOnDay(ladder, state, day).find((x) => x.node.nodeId === id);
      if (!g) return sendJson(res, 404, { error: tr({ it: 'Nessuna gara di questa serie nel giorno richiesto.', en: 'No race of this series on the requested day.' }) });
      const node = g.node;
      const carNames = (ids) => (ids ?? []).map((c) => ladder.contentNames?.cars?.[c] ?? c);
      const results = (state.results?.[node.nodeId] ?? []).filter((r) => Number(r.season) === Number(g.season));
      const started = results.length > 0;
      let standings = null;
      if (started) {
        try {
          standings = standingsFor(ladder, state, node, g.season).slice(0, 10).map((r) => ({
            position: r.position, name: r.name, points: r.points, isPlayer: !!r.isPlayer,
          }));
        } catch { standings = null; }
      }
      // il mio risultato in questa stagione (se c'è)
      const mieGare = results.map((r) => ({ round: r.round, position: r.dnf ? 'DNF' : r.position, points: r.points, track: ladder.contentNames?.tracks?.[node.calendar[r.round]?.track] ?? node.calendar[r.round]?.track, fl: !!r.fl }));
      // gate: cosa manca per firmare (solo se non iscritto)
      const gate = state.seats?.[node.nodeId] ? { ok: true, reasons: [] } : gateStatus(ladder, state, node);
      return sendJson(res, 200, {
        nodeId: node.nodeId,
        display: node.display,
        discipline: disciplineName(ladder, node.discipline),
        level: node.level ?? 0,
        stato: g.stato,
        fattibile: g.fattibile,
        gateReasons: gate.reasons ?? [],
        isCurrent: !!g.isCurrent,
        roundIndex: g.index,
        roundName: g.name,
        track: g.track,
        trackId: g.trackId,
        laps: g.laps,
        hour: g.hour,
        weather: g.weather ?? null,
        scheduledDay: g.scheduledDay,
        dateLabel: dateLabel(g.scheduledDay),
        season: g.season,
        // CARD DELLA SERIE (30/10, completamento del campo largo): la griglia
        // mostrata non è più la stima del ladder ma la TIPICA, cioè il massimo
        // gridSize di griglia reale mai incassato in serie (grigliaSimEstesa):
        // i display della GUI («Griglia: N auto») combaciano con la classifica e
        // con la griglia che EVO corre davvero. serie VERGINI (niente risultati)
        // restano sulla stima del ladder, senza nuovi dati inventati.
        gridSize: grigliaSimEstesa(ladder, state, node).gridSize ?? null,
        prize: node.econ?.prize ?? null,
        entryFee: node.econ?.rent ?? node.econ?.buy ?? 0,
        repRequired: node.repRequired ?? 0,
        cars: carNames(node.cars),
        griglia: tipoGriglia(node),
        calendar: node.calendar.map((round, i) => ({
          index: i,
          name: round.name ?? `Round ${i + 1}`,
          track: ladder.contentNames?.tracks?.[round.track] ?? round.track,
          laps: round.laps,
          hour: round.hour,
          played: results.some((r) => r.round === i),
          current: i === g.index,
        })),
        // "started" per le serie NON iscritte va derivato dal ROUND del ciclo:
        // i rivali hanno già corso le ronde prima dell'indice del giorno. I risultati
        // del giocatore non esistono (non è iscritto) e non possono decidere questo.
        started: hasSeat(state, node.nodeId) ? started : g.index > 0,
        standings,
        // entri a stagione avviata? La R1 (o le ronde prima della corrente) sono
        // già scappate: se firmi ora quei punti valgono 0. Meglio le fasi R1.
        joinLate: hasSeat(state, node.nodeId) ? false : g.index > 0,
        joinNote: hasSeat(state, node.nodeId)
          ? (started ? `La tua stagione è in corso: hai ${results.length} gare all'attivo.` : null)
          : g.index > 0
            ? `La stagione è già partita: ${g.index} ronda${g.index === 1 ? '' : 'e'} scappata${g.index === 1 ? '' : 'e'}. Se firmi ora entri da questo round e quelle ronde valgono 0 punti per te. Meglio un campionato ALLA PARTENZA: guarda le fasi R1.`
            : 'R1: e questo campionato parte alla pari il giorno scelto — puoi firmare e correre la prima gara insieme a tutti.',
        mine: mieGare,
      });
    }
    case 'integrity': return sendJson(res, 200, { issues: checkIntegrity(ladder, state), seasons: reviewableSeasons(state) });
    case 'integrity-fix': {
      const out = fixIntegrity(ladder, state);
      return sendJson(res, 200, { ...out, header: viewHeader(ladder, state) });
    }
    case 'maintenance': {
      // Il rione MANUTENZIONE (richiesta Mauro 23/10: "il tool si ripari da solo,
      // con scansioni manuali e opzioni per togliere le liste sporche"):
      //   scan          → scansione completa (cache flussi svuotata, valori veri dal disco)
      //   fix/auto      → scansione + riparazione di ciò che si corregge senza chiedere
      //   auto-toggle   → lei parte da sola all'avvio e ogni 10 minuti (writeConfig)
      // e le pulizie CON CONFERMA (body.confirm === true, la GUI apre la modale):
      //   clear-messages (svuota bacheca) · reset-ledger (registro anti-doppioni)
      //   reseed-flows (ricalcola flussi dal salvataggio) · dedup-flows (doppio esatti)
      const op = String(body.op ?? 'scan');
      if (['clear-messages', 'reset-ledger', 'reseed-flows', 'dedup-flows'].includes(op) && body.confirm !== true) {
        return sendJson(res, 409, { error: tr({ it: 'Operazione irreversibile: serve la conferma (confirm=true).', en: 'This action cannot be undone: pass confirm=true.' }), needConfirm: true });
      }
      if (op === 'scan') return sendJson(res, 200, scanCareer(ladder, state));
      if (op === 'fix') { const out = autoRepair(ladder, state, { persist }); return sendJson(res, 200, out); }
      if (op === 'tick') { const out = maintenanceTick({ force: true }); return sendJson(res, 200, out ?? { issues: [], fixed: [], skipped: true }); }
      if (op === 'auto-toggle') {
        const on = !!body.on;
        writeConfig({ autoRepair: on });
        if (on) lastAutoRepairAt = 0;
        return sendJson(res, 200, { ok: true, autoRepair: on });
      }
      if (op === 'auto-status') return sendJson(res, 200, { autoRepair: autoRepairEnabled() });
      if (op === 'clear-messages') return sendJson(res, 200, clearBacheca(state, { persist }));
      if (op === 'reset-ledger') return sendJson(res, 200, resetLedger());
      if (op === 'reseed-flows') { reseedFlows(state, { persist }); return sendJson(res, 200, { ok: true }); }
      if (op === 'dedup-flows') return sendJson(res, 200, flowDedup());
      return sendJson(res, 400, { error: tr({ it: 'Operazione di manutenzione non valida.', en: 'Invalid maintenance op.' }) });
    }
    case 'season-review': {
      const seasons = reviewableSeasons(state);
      const wanted = Number.isFinite(Number(body.season)) && Number(body.season) > 0 ? Number(body.season) : seasons[0] ?? state.season;
      if (!seasons.includes(wanted)) return sendJson(res, 400, { error: tr({ it: `Nessuna gara registrata per la stagione ${wanted}.`, en: `No race recorded for season ${wanted}.` }) });
      return sendJson(res, 200, seasonReview(ladder, state, { season: wanted }));
    }
    /* LA GAZZETTA DI STAGIONE (28/10): i titoli dell'anno riletti in pagina
       unica. Stessa guardia della rassegna: senza gare registrate, 400. */
    case 'gazzetta-season': {
      const seasons = reviewableSeasons(state);
      const wanted = Number.isFinite(Number(body.season)) && Number(body.season) > 0 ? Number(body.season) : seasons[0] ?? state.season;
      if (!seasons.includes(wanted)) return sendJson(res, 400, { error: tr({ it: `Nessuna gara registrata per la stagione ${wanted}.`, en: `No race recorded for season ${wanted}.` }) });
      return sendJson(res, 200, seasonPress(state, { season: wanted }));
    }
    case 'backup': {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const target = join(BACKUP_DIR, `evo-career.save.bak-${stamp}.json`);
        copyFileSync(SAVE_FILE, target);
        const backups = listBackups(8);
        return sendJson(res, 200, { ok: true, created: target, backups });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'save-backup': {
      // Stato del backup del SAVE di EVO (quello del gioco, non della
      // carriera): vive in data/salva-save/ e si accomoda con tools/
      // salva-save.mjs — libreria usata IN-PROCESS (26/10): lo stato e'
      // uno scan solo-lettura, il forza chiama la stessa tar dell'avvio.
      try {
        const op = String(body.op ?? 'status');
        let esito = null; // (scope, bug al vivo 26/10: const dentro l'if era invisibile a lastRun)
        if (op === 'force') {
          esito = forzaBackup({ force: true });
          if (!esito.ok && esito.motivo !== 'save-dir-mancante') {
            return sendJson(res, 500, { error: tr({ it: `backup non riuscito (${esito.motivo}): ${esito.errore ?? ''}`, en: `backup failed (${esito.motivo}): ${esito.errore ?? ''}` }), ...esito.stato, forced: true, lastRun: esito });
          }
        }
        const st = statoBackup();
        return sendJson(res, 200, { ...st, forced: op === 'force', lastRun: esito });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'events': {
      // avviso griglia ronda (28/10, lezione bak-evento 27/10): la vetrina porta
      // con sé lo stato del customgrid come lo leggerà event-prep
      const ev = eventsOverview(ladder, state);
      ev.grigliaRonda = avvisoGrigliaEvento(!!ev.active?.acceptedAt, ev.card);
      return sendJson(res, 200, ev);
    }
    case 'my-garage': {
      // il garage personale: importa le auto vinte dagli eventi e arricchisce col catalogo
      try {
        const out = garageOverview(ladder, state, { paths });
        if (out.justImported.length) {
          for (const name of out.justImported) pushMessage(state, `🏆 ${name} entra nel garage (vinta in un evento speciale).`, 'title');
          persist(state);
        }
        return sendJson(res, 200, out);
      }
      catch (e) { recordWarning('webui.garage', 'vista garage non riuscita: ' + (e?.message ?? '')); return sendJson(res, 200, { cars: [], total: 0, won: 0, bought: 0, totalWins: 0, justImported: [] }); }
    }
    case 'mechanic': {
      // segna al meccanico (Mauro 23/10): la scheda freno dell'auto scelta.
      // Niente consulti in più: zona dal bias di carriera, torque, e la memoria
      // dell'allievo quando la pista della ronda è nota. La GUI la mostra come sta.
      try {
        const bp = brakePlanOf(body.car ?? body.carId, ladder, state, { paths });
        if (bp.ok) {
          const board = setupBoard(ladder, state);
          const trackKey = body.track === 'all' ? null : (body.track ?? board.track ?? null);
          const trackDisplay = trackKey ? (ladder.contentNames?.tracks?.[trackKey] ?? trackKey) : null;
          annotateAllyAdvice(bp, { trackDisplay });
        }
        return sendJson(res, 200, bp);
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    // I CINQUE MISCUGLI in GUI (28/10): schede dei cinque campionati stile anche
    // quando il sedile non è firmato (il tab Campionati mostra solo le serie
    // iscritte). Stesso schema di championships: finestra, pool sorteggiato con
    // seme, regole con cap, calendario, stato della sua iscrizione.
    case 'stili': return sendJson(res, 200, stileOverview(ladder, state));
    case 'garage-catalog': return sendJson(res, 200, { cars: catalogPicker(ladder, { paths }) });
    case 'garage-add': {
      try {
        const out = addCar(state, { carId: body.carId, carName: body.carName, how: body.how === 'won' ? 'won' : 'bought', note: body.note ?? null });
        if (!out.reused) pushMessage(state, out.car.how === 'won' ? tr({ it: `🏆 ${out.car.carName} entra nel garage (vinta).`, en: `🏆 ${out.car.carName} joins the garage (won).` }) : tr({ it: `${out.car.carName} entra nel garage (comprata a ${out.price.toLocaleString('it-IT')} €).`, en: `${out.car.carName} joins the garage (bought for ${out.price.toLocaleString('it-IT')} €).` }), 'money');
        persist(state);
        return sendJson(res, 200, { ok: true, reused: out.reused, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-remove': {
      try {
        const n = removeCar(state, String(body.carId ?? ''));
        if (n) persist(state);
        return sendJson(res, 200, { ok: n > 0, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-note': {
      try {
        setNote(state, String(body.carId ?? ''), body.note != null ? String(body.note) : null);
        persist(state);
        return sendJson(res, 200, { ok: true, garage: garageOverview(ladder, state, { paths }) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'garage-sell': {
      try {
        const out = sellCar(ladder, state, String(body.carId ?? ''));
        persist(state);
        return sendJson(res, 200, { ok: true, sold: out, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'difficulty-nudge': {
      // trim manuale dal cruscotto: ±1, ±2 o ±3 sulla banda della serie corrente
      // (Mauro 27/10: «fino a +3 −3, 1,2,3»). Vale per la serie, quindi per
      // qualsiasi auto di quella serie: la scheda si aggiorna.
      try {
        const node = nodeById(ladder, state.node);
        const RS = (state.raceSettings ??= {});
        const card0 = raceCard(ladder, state, {});
        const S = (RS[node.nodeId] ??= {});
        S.sliderMin ??= card0.difficulty.rangeMin;
        S.sliderMax ??= card0.difficulty.rangeMax;
        const delta = Math.max(-3, Math.min(3, Math.round(Number(body.delta) || 0)));
        S.sliderMin = Math.max(0, Math.min(100, S.sliderMin + delta));
        S.sliderMax = Math.max(S.sliderMin, Math.min(100, S.sliderMax + delta));
        // MAURO 27/10: il nudge manuale si REGISTRA per le prossime gare
        // simili — lo stesso delta conta in OGNI serie (registro `global`
        // in state.difficulty, mostrato in cima al pannello Difficoltà),
        // così un «+1» sulla serie di oggi è un «+1» anche sul campionato
        // che iscriverai domani. Simmetrico: il −1 ti riporta giù tutto.
        state.difficulty ??= {};
        state.difficulty.global = Math.max(-20, Math.min(20, (state.difficulty.global ?? 0) + delta));
        // anche il nudge arriva al gioco: banda del weekend riscritta per coerenza
        try { setWeekendAi(S.sliderMin, S.sliderMax); } catch { /* scheda valida comunque */ }
        // il suggerimento in sospeso (se c'è) è stato gestito: si chiude
        delete state.pendingNudge;
        persist(state);
        return sendJson(res, 200, { ok: true, card: viewCard(ladder, state, typeof body.car === 'string' ? body.car : null) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'nudge-dismiss': {
      // il pilota scarta il suggerimento: si chiude senza toccare la difficoltà
      try {
        delete state.pendingNudge;
        persist(state);
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-accept': {
      try { acceptEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-prep': {
      // «Prepara tutto e divertiti» per l'evento speciale: le AUTOMAZIONI
      // dell'evento scrivono SOLO griglia (customgrid) e meteo (selettore
      // lastgamemode) — tutto il resto (pista, auto, AI, ora, giri) si imposta a
      // mano in EVO con la scheda, come da lezione 23/10. E avvio di EVO se chiuso.
      try {
        const card = eventCard(ladder, state);
        if (!card) return sendJson(res, 409, { error: tr({ it: 'Nessun evento speciale attivo.', en: 'No special event active.' }) });
        if (!card.acceptedAt) return sendJson(res, 409, { error: tr({ it: "Accetta l'invito prima: il tasto prepara la gara già accettata.", en: 'Accept the invite first: the button prepares the race you already accepted.' }) });
        const running = await isGameRunning();
        const prep = { track: null, weather: null };
        // LEZIONE 23/10 (crash al tasto 'Lancia gara'): l'evento DEVE restare
        // un mondo il SUO: la gara si gioca in "Gara personalizzata", NON via il
        // weekend di carriera. QUI si scrivevano pista/AI/ora/giri su
        // GameModeType_RACE_WEEKEND, che appartiene alla RONDA DELLA CARRIERA — ma
        // quando la ronda avanzata (Mazda/Nürburgring) incontra il file dove
        // l'evento ha scritto COTA/F40, EVO muore al caricamento (0xC0000005 su
        // RenderWorker, il "crash da pista mancante"). La pista, l'AUTO, l'AI, l'ora e
        // i giri dell'evento si impostano A MANO in EVO come da scheda (pannelli
        // della gara personalizzata): la verifica live del pannello li controlla
        // comunque in telemetria. Resta scritto dal tool: la griglia (customgrid)
        // e il meteo del selettore.
        prep.track = card.trackName;
        prep.trackNote = tr({ it: 'pista da impostare a mano in EVO (gara personalizzata: non tocca il weekend di carriera)', en: 'track to set by hand in EVO (custom race: the career weekend is not touched)' });
        // — AUTO: si seleziona a mano in EVO (scelta Mauro: la scrittura del
        // drivergarage è scartata per non toccare il garage della carriera).
        prep.car = card.carName ?? null;
        prep.carNote = tr({ it: 'auto da selezionare a mano in EVO', en: 'car to pick by hand in EVO' });
        try {
          // weather dell'evento è un PRESET EVO (0 sereno, 1 sparse, 2 nuvoloso):
          // si scrive SOLO se il selettore dice altro (come la ronda): ogni scrittura
          // di setWeatherPreset solleva un file di backup, non la cumulare a ogni click
          const cur = currentWeatherPreset();
          if (card.weather != null && cur !== card.weather) {
            const wx = setWeatherPreset(card.weather);
            prep.weather = `${wx.preset.label} (era: ${PRESETS[wx.from]?.label ?? wx.from ?? '?'})`;
            prep.weatherWritten = wx.written;
          } else prep.weather = PRESETS[cur ?? card.weather]?.label ?? null;
        } catch (e) { prep.weatherError = e.message; }
        // — Le regole della gara (banda AI, ora/scala, giri) NON si scrivono QUI:
        // sono campi della RONDA e il round di carriera porta i SUOI valori.
        // In gara personalizzata si impostano a mano seguendo la scheda evento:
        // slider AI (diffMin-diffMax), ora (hour), scala (timeScale) e giri (laps).
        try {
          // GRIGLIA DELL'EVENTO (richiesta Mauro 23/10: «la deve creare da solo
          // come il bottone Prepara tutto del campionato»): costruita col BUILDER
          // (buildGridMessage) come la griglia della ronda di campionato — celle
          // del pool del TEMA fotocipiate dal template (zero-crash), driver scalati
          // nella banda AI dell'evento (88-93), PI dal pool reale, niente
          // bilanciamento (monomarca: zavorre di campionato sarebbero capricciose).
          // Il tema può dichiarare gridCars/gridSize (eventi monomarca); in sua
          // mancanza fallback storico = solo le celle ospiti del tema.
          // Il template deve CONTENERE le auto del pool: se non ci sono, la
          // griglia resta quella in piedi e il messaggio lo dice (niente scrittura).
          const ospitiPool = card.theme?.gridCars ?? card.guestCarIds ?? [];
          const gridSizeEv = card.theme?.gridSize ?? (ospitiPool.length + 2);
          // VERDETTO 23/10 (rev. 4, NOTE-AUTOMAZIONE): il crash 0xC0000005
          // all'Avvia sessione di EVO 0.9.1 è FLAKY e NON dipende né dal conto
          // della griglia né dal file: lo stesso file (al byte) è crashato una
          // volta e girato due volte dopo; 5→8 e taglio 8→5 girati entrambi in
          // processo vivo; le 7 cadute del 23/10 sono lo stesso identico offset
          // nella UI del menu (cohtml/Gameface). Il vecchio rifiuto «solo 14»
          // si leva: QUALUNQUE conto si prepara. Se EVO crolla all'avvio:
          // riprova, e se ripete riavvia EVO — il file resta a posto.
          prep.crashAdvice = tr({
            it: `se EVO crasha all'Avvia sessione (0xC0000005), è il bug flaky del gioco: riprova, e se ripete riavvia EVO — la griglia sul disco resta a posto`,
            en: `if EVO crashes at session start (0xC0000005), that's the game's flaky bug: retry, and if it repeats, restart EVO — the grid on disk is fine`,
          });
          // IDEMPOTENTE: se la griglia sul disco ha GIÀ la forma dell'evento
          // (prova a 14 F40 del 23/10 VALIDATA in gioco, log EVO 20:47) non si
          // tocca: il builder la rifiuterebbe (guard anti-celle-ripetute su un
          // template con poche varianti) e una riscrittura nuova rischierebbe di
          // rovinare una griglia già provata in gioco. Prepara tutto prosegue
          let giaInPiede = false;
          try { giaInPiede = grigliaEventoGiaInPiede(GRID_FILE, gridSizeEv, ospitiPool); } catch (_) { /* lettura: si va col builder */ }
          if (giaInPiede) {
            prep.guests = `griglia già in piedi: ${gridSizeEv} celle, tutte ${ospitiPool.join(', ')} — niente da riscrivere, si va in pista con quella`;
            prep.guestsWritten = false;
          }
          if (ospitiPool.length && existsSync(GRID_FILE) && !giaInPiede) {
            const evNode = {
              nodeId: `evento_${card.theme?.id ?? 'speciale'}`,
              display: card.theme?.name ?? 'Evento speciale',
              gridSize: gridSizeEv,
              cars: ospitiPool,
              calendar: [{ name: 'evento speciale', track: card.trackName, weather: card.weather ?? 0, laps: card.laps ?? null, hour: card.hour ?? null }],
            };
            // TEMPLATE: il customgrid corrente (celle reali del gioco), e se non
            // contiene le auto del pool si cercano i BACKUP .bak-* (i più recenti
            // prima) — il gesto di rebuildGridApply per il campionato. Alla
            // MONOMARCA basta un modello nel template (il vincolo ≥3 modelli vale
            // solo per i pool multi-marca del campionato).
            const bakDir = dirname(GRID_FILE), bakBase = basename(GRID_FILE);
            const candidati = [GRID_FILE,
              ...readdirSync(bakDir).filter((f) => f.startsWith(`${bakBase}.bak-`)).sort().reverse().map((f) => join(bakDir, f))];
            let built = null, sourceFile = null, ultimoErrore = null, errorePriore = null;
            for (const cand of candidati) {
              try { built = buildGridMessage({ ladder: { nodes: [evNode] }, nodeId: evNode.nodeId, roundIndex: 0, file: cand, aiBand: [card.diffMin ?? 88, card.diffMax ?? 93], noBalance: true }); sourceFile = cand; break; }
              catch (e) {
                // Il rifiuto esplicito del builder (celle uniche insufficienti,
                // lezione crash 23/10: EVO muore con celle ripetute) è il
                // messaggio più AZIONABILE per Mauro: portällo in finale al
                // posto dell'ultimo generico "non contiene le auto della serie"
                // che la lista dei backup fa emergere per ultimo.
                if (!errorePriore && /griglia rifiutata|MULTI-MARCA/.test(String(e.message ?? e))) errorePriore = e;
                ultimoErrore = e;
              }
            }
            if (!built) throw errorePriore ?? ultimoErrore ?? new Error(`nessuna auto del pool dell'evento (${ospitiPool.join(', ')}) nel customgrid né nei suoi backup (${candidati.length} file provati): rigenera in EVO una griglia personalizzata con quelle auto e premi APPLICA (serve una volta sola)`);
            const backup = `${GRID_FILE}.bak-evento-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
            copyFileSync(GRID_FILE, backup);          // il file di prima è il template della prossima ronda di campionato: rebuildGridApply lo recupera dai .bak-*
            writeFileSync(`${GRID_FILE}.tmp`, built.buffer);
            renameSync(`${GRID_FILE}.tmp`, GRID_FILE);  // scrittura atomica come i tool
            prep.guests = `griglia riscritta: ${built.report.gridSize} celle${built.report.poolMulti ? ` · ${built.report.poolMulti}` : ''}${built.report.ai ? ` · AI ${built.report.ai}` : ''}${sourceFile !== GRID_FILE ? ` · template ${basename(sourceFile)}` : ''}`;
            prep.guestsWritten = true;
          }
        } catch (e) {
          // messaggio già pronto quando il customgrid sul disco non contiene le
          // auto del pool: il resto del prep resta valido, la griglia si scrive dopo
          const raw = String(e.message ?? e);
          prep.guestsError = /non contiene le auto della serie|MULTI-MARCA|nessuna auto del pool|griglia rifiutata/.test(raw)
            ? `griglia non riscritta: ${raw}`
            : raw;
        }
        let launched = null;
        if (!body.noLaunch) {
          try { launched = await launch(paths, { force: !!body.forceLaunch }); }
          catch (e) { launched = { error: e.message }; }
        }
        return sendJson(res, 200, { ok: true, prep, gameRunning: running, launched, events: eventsOverview(ladder, state) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    case 'event-prize-refresh': {
      // correzione premio del vecchio invito attivo: se l'auto in palio è già
      // posseduta e il tema ha riserve, sostituisce il premio (richiesta Mauro
      // 23/10: "un'auto diversa che non ho già in garage"). Idempotente e scritta
      // subito su disco (persist), come gli altri comandi evento.
      // giudizio del possesso: SOLO garage del tool + vetrina (28/10). Lo scan
      // disco è uscito: i .carfinalstate restano anche per auto vendute e
      // noleggiate, e spingevano 13 falsi «già tua» nella scelta premio.
      try { const out = refreshActivePrize(ladder, state); persist(state); return sendJson(res, 200, { ok: true, ...out, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { ok: false, error: String(e.message ?? e) }); }
    }
    case 'event-decline': {
      try { declineEvent(ladder, state, String(body.eventId ?? '')); persist(state); return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) }); }
      catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-finish': {
      try {
        const out = finishEvent(ladder, state, { position: Number(body.position), bestLapSec: body.bestLapSec != null ? Number(body.bestLapSec) : null });
        persist(state);
        return sendJson(res, 200, { ok: true, result: out, events: eventsOverview(ladder, state), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'event-abandon': {
      // ripensamento: l'invito accettato torna libero (senza penali)
      try {
        const ev = ensureEvents(state);
        if (ev.active?.acceptedAt) { delete ev.active.acceptedAt; persist(state); }
        return sendJson(res, 200, { ok: true, events: eventsOverview(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'warnings':
      return sendJson(res, 200, readWarnings());
    case 'system-health': {
      const mode = await syncLiveReader();
      return sendJson(res, 200, systemHealth(paths, mode));
    }
    case 'agenda': {
      // calendario CONTINUO stile del modello originario: vista giornata + strip calendario + griglia filtri
      const day = agendaDay(state);
      const viewDay = Number.isFinite(Number(body.day)) && Number(body.day) >= 1 ? Math.floor(Number(body.day)) : day;
      const filter = typeof body.filter === 'string' ? body.filter : 'tutte';    // tutte|fattibili|iscritte|bloccate
      const disc = typeof body.discipline === 'string' ? body.discipline : null; // id disciplina o null
      const griglia = racesOnDay(ladder, state, viewDay).filter((g) => {
        if (filter === 'fattibili') return g.fattibile;
        if (filter === 'iscritte') return g.stato === 'iscritto';
        if (filter === 'bloccate') return !g.fattibile;
        return true;
      }).filter((g) => !disc || g.node.discipline === disc);
      return sendJson(res, 200, {
        day,
        viewDay,
        todayLabel: dateLabel(day),
        viewLabel: dateLabel(viewDay),
        nextRaceDay: prossimoGiornoConGara(ladder, state),
        maxScelte: MAX_SCELTE_PER_GIORNO,
        scelteOggi: choicesForDay(state, day),
        impegni: impegni(ladder, state),
        disciplines: ladder.disciplines.map((d) => ({ id: d.id, name: nomeDisciplina(d) })),
        strips: calendarStrip(ladder, state, { from: day - 3 < 1 ? 1 : day - 3, days: 21 }),
        gare: griglia.map((g) => ({
          nodeId: g.node.nodeId, display: g.node.display, level: g.node.level ?? 0,
          discipline: g.node.discipline, roundIndex: g.index, totalRounds: g.node.calendar.length,
          season: g.season, name: g.name, track: g.track, laps: g.laps, hour: g.hour,
          weather: g.weather ?? null, scheduledDay: g.scheduledDay,
          onSchedule: !!g.onSchedule, late: !!g.late, champStarted: !!g.champStarted, stato: g.stato,
          griglia: tipoGriglia(g.node),
          fattibile: g.fattibile, gateReasons: g.gateReasons ?? [], isCurrent: !!g.isCurrent,
          prize: g.node.econ?.prize ?? null,
          // CARD AGENDA (30/10): griglia tipica (massimo visto) come nella card serie
          gridSize: grigliaSimEstesa(ladder, state, g.node).gridSize ?? null,
          carName: (ladder.contentNames?.cars?.[g.node.cars?.[0]] ?? g.node.cars?.[0] ?? null),
        })),
      });
    }
    case 'agenda-advance': {
      const before = agendaDay(state);
      const to = Number.isFinite(Number(body.to)) ? Number(body.to) : null;
      const after = avanzaGiorno(state, to);
      persist(state);
      return sendJson(res, 200, { before, after });
    }
    case 'agenda-skip-to-next': {
      const target = prossimoGiornoConGara(ladder, state);
      if (target == null) return sendJson(res, 200, { error: tr({ it: 'Nessuna gara futura nei campionati iscritti.', en: 'No future race in the entered championships.' }) });
      const after = avanzaGiorno(state, target);
      persist(state);
      return sendJson(res, 200, { after });
    }
    case 'agenda-shift': {
      // risolve un conflitto spostando la serie: il suo sedile slitta di +1 cadenza
      // (tutte le sue prossime ronde si spostano con lui), con nota nel diario
      const id = String(body.nodeId ?? '');
      const inf = impegni(ladder, state);
      const m = inf.lista.find((x) => x.nodeId === id);
      if (!m) return sendJson(res, 400, { error: 'Non hai un impegno con questa serie.' });
      const now = shiftSeat(state, id, CADENZA_GIORNI);
      pushMessage(state, `${m.display} spostata in avanti: prossima gara ${dateLabel(now)} (conflitto di calendario risolto).`, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, nextDay: now });
    }
    case 'agenda-choose': {
      // sceglie la gara di OGGI (o del giorno che si sta guardando, se consentito):
      // solo gare fattibili, al massimo 3 per giornata — come le scelte del modello originario.
      // Rerscegliere la stessa serie è ok.
      const id = String(body.nodeId ?? '');
      // se la carta è di un giorno FUTURO in vista, si punta lì; mai nel passato
      const chooseDay = Math.max(agendaDay(state), Math.floor(Number(body.day) || 0) >= agendaDay(state) ? Math.floor(Number(body.day)) : agendaDay(state));
      let day0 = chooseDay >= agendaDay(state) ? chooseDay : agendaDay(state);
      const griglia = racesOnDay(ladder, state, day0);
      let g = griglia.find((x) => x.node.nodeId === id);
      // ROBUSTEZZA: se nel giorno richiesto la serie non è a programma, cerco la sua
      // prossima gara nei giorni a venire (max 7): se la trovo, iscrivo con anchor
      // sul VERO giorno di gara — niente più "non ha gare oggi" ambiguo.
      if (!g) {
        for (let dd = day0 + 1; dd <= day0 + 7 && !g; dd++) {
          const cand = racesOnDay(ladder, state, dd).find((x) => x.node.nodeId === id);
          if (cand?.fattibile) { g = cand; day0 = dd; }
        }
        if (!g) {
          // als ultima risorsa dico QUANDO cade: la sua prossima disputa entro 30 giorni
          let quando = null;
          for (let dd = day0; dd <= day0 + 30 && !quando; dd++) {
            if (racesOnDay(ladder, state, dd).some((x) => x.node.nodeId === id)) quando = dateLabel(dd);
          }
          return sendJson(res, 400, { error: quando
            ? `La prossima gara di questa serie va il ${quando}: apri quel giorno nella striscia calendario e premi "scegli per oggi".`
            : 'Nessuna gara programmata di questa serie nei prossimi 30 giorni.' });
        }
      }
      if (!g.fattibile) return sendJson(res, 403, { error: `Serie bloccata: ${g.gateReasons.join('; ')}` });
      const already = state.node === id;
      if (!already && !canChoose(state, day0, id)) {
        return sendJson(res, 409, { error: tr({ it: `Hai già scelto ${MAX_SCELTE_PER_GIORNO} gare per oggi: ne resta una sola da disputare (salta il tempo per cambiare giornata).`, en: `You already picked ${MAX_SCELTE_PER_GIORNO} races for today: only one is left to run (skip the time to change day).` }) });
      }
      if (state.node !== id) {
        state.node = id;
        state.round = g.index;
        // sedile nuovo o rinnovato: la cadenza della serie parte da oggi
        state.seats ??= {};
        if (!state.seats[id]) {
          const results = state.results?.[id] ?? [];
          let last = 0;
          for (const r of results) if (Number(r.season) > last) last = Number(r.season);
          const seatSeason = (last && results.filter((r) => Number(r.season) === last).length < g.node.calendar.length) ? last : state.season;
          state.seats[id] = { day: day0, season: seatSeason };
          pushMessage(state, tr({
            it: `Iscritto a ${g.node.display}: le sue gare partono sulla griglia del calendario da oggi.`,
            en: `Signed up for ${g.node.display}: its races start from today's calendar grid.`,
          }), 'info');
        }
        pushMessage(state, tr({
          it: `Scelta la gara del giorno: ${g.node.display} R${g.index + 1} (${g.track}).`,
          en: `Picked today's race: ${g.node.display} R${g.index + 1} (${g.track}).`,
        }), 'info');
      }
      recordChoice(state, day0, id);
      persist(state);
      return sendJson(res, 200, { ok: true, nodeId: id, roundIndex: g.index, choices: choicesForDay(state, day0).length });
    }
    case 'calendar': return sendJson(res, 200, viewCalendar(ladder, state));
    case 'standings': return sendJson(res, 200, viewStandings(ladder, state));
    case 'messages': return sendJson(res, 200, viewMessages(ladder, state));
    case 'card': {
      // (28/10) la vista parte dalla lingua GIÀ IMPPOSTATA dal dispatcher:
      // le lingue per richiesta si dichiarano nel campo 'lingua' del body.
      const card = viewCard(ladder, state, typeof body.car === 'string' ? body.car : null);
      // arricchisci la card col libro delle piste: record di sessione sulla stessa auto + scheda
      try {
        if (card.outlook) {
          const book = trackBook(ladder, paths, state, { testdayFile: join(slotDataDir(), 'testdays.json') });
          const row = book.rows.find((r) => r.track === card.trackName || r.id === card.round?.track);
          // miniatura dell'auto selezionata per la prossima gara
          card.carImage = carImageOf(card.carName) ?? carImageOf(card.car) ?? null;
          if (row) {
            card.outlook.trackRec = row.session ?? null;
            // pulisce il doppio marchio nei dati storici ("Abarth Abarth 695 Biposto")
            if (card.outlook.lapTarget?.car) {
              const p = String(card.outlook.lapTarget.car).trim().split(/\s+/);
              if (p.length >= 2 && p[0].toLowerCase() === p[1].toLowerCase()) card.outlook.lapTarget.car = p.slice(1).join(' ');
            }
            if (row.info) card.outlook.trackInfo = { nick: row.info.nick, nickEn: row.info.nickEn ?? null, country: row.info.country, countryEn: row.info.countryEn ?? null, lengthKm: row.info.lengthKm, corners: row.info.corners, opened: row.info.opened, history: row.info.history, historyEn: row.info.historyEn ?? null, fullName: row.info.fullName, outline: row.info.outline ?? null, map: row.info.map ?? null };
          }
        }
      } catch { /* il libro delle piste non deve mai rompere la card */ }
      return sendJson(res, 200, card);
    }
    case 'race-settings': {
      // override manuali per la ronda corrente: intervallo slider AI (min-max, come in EVO),
      // orari delle sessioni e moltiplicatore tempo. L'aggressività AI in EVO è bloccata.
      const node = nodeById(ladder, state.node);
      const o = (state.raceSettings ??= {});
      if (body.clear) { delete o[node.nodeId]; persist(state); return sendJson(res, 200, viewCard(ladder, state, typeof body.car === 'string' ? body.car : null)); }
      o[node.nodeId] ??= {};
      const S = o[node.nodeId];
      const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null; };
      if (body.sliderMin != null) S.sliderMin = num(body.sliderMin, 0, 100);
      if (body.sliderMax != null) S.sliderMax = num(body.sliderMax, 0, 100);        if (S.sliderMin != null && S.sliderMax != null && S.sliderMin > S.sliderMax) { const t = S.sliderMin; S.sliderMin = S.sliderMax; S.sliderMax = t; }
        // banda STRETTA (gap ≤1, Mauro 23/10) e coerenza col gioco: qualunque pagina
        // salvi (currencyDifficoltà o regole gara), i cursori di EVO finiscono sulla STESSA banda.
        if (S.sliderMin != null && S.sliderMax != null) {
          S.sliderMax = Math.min(S.sliderMax, S.sliderMin + 1);
          try { setWeekendAi(S.sliderMin, S.sliderMax); } catch { /* il gamemodesave può mancare: la card resta valida */ }
        }
      // ore distinte per sessione (richiesta Mauro 28/10): prove, qualifiche,
      // warm-up e gara si fissano a mano per serie. Campo VUOTO ('') = torna al
      // calcolo a ritroso per la sessione (raceStart vuoto = orario del round).
      const oraFor = (v) => {
        if (v === '' || v == null) return null; // il vuoto CANCELLA l'override
        return num(v, 0, 23);
      };
      const cancella = (k, v) => { if (v === '') delete S[k]; };
      if (body.practiceStart != null) { cancella('practiceStart', body.practiceStart); const v = oraFor(body.practiceStart); if (v != null) S.practiceStart = v; }
      if (body.qualifyStart != null) { cancella('qualifyStart', body.qualifyStart); const v = oraFor(body.qualifyStart); if (v != null) S.qualifyStart = v; }
      if (body.warmupStart != null) { cancella('warmupStart', body.warmupStart); const v = oraFor(body.warmupStart); if (v != null) S.warmupStart = v; }
      if (body.raceStart != null) { cancella('raceStart', body.raceStart); const v = oraFor(body.raceStart); if (v != null) S.raceStart = v; }
      if (body.timeScale != null) S.timeScale = Math.max(1, Math.min(60, Number(body.timeScale) || 1));
      if (body.distPct != null) S.distPct = [25, 50, 75, 100].includes(Number(body.distPct)) ? Number(body.distPct) : null;
      // le ore PER SESSIONE vanno anche sul gamemodesave del weekend, se esiste:
      // scrittura idempotente con backup, e se il file manca si va avanti (il
      // Prepara tutto le scrive appena il weekend nasce).
      try {
        if (existsSync(WEEKEND_FILE)) {
          const sessi = {};
          for (const [k, v] of Object.entries({ Practice: S.practiceStart, Qualifying: S.qualifyStart, Warmup: S.warmupStart, Race: S.raceStart })) {
            if (Number.isFinite(Number(v))) sessi[k] = Number(v);
          }
          if (Object.keys(sessi).length) setRaceSessions({ sessions: sessi, file: WEEKEND_FILE });
        }
      } catch { /* gamemodesave assente o illeggibile: la card resta valida comunque */ }
      // PIANO ORARIO della serie (orario.mjs, richiesta Mauro 21/10/2026): scrive
      // hour/timeScale nei round del calendario della serie. body.piano='' = rimuovi.
      if (body.piano != null) {
        try {
          if (body.piano === '') {
            for (const r of node.calendar ?? []) { delete r.hourPiano; delete r.timeScalePiano; }
          } else {
            applyPianoToCalendar(ladder, node.nodeId, String(body.piano), {});
            S.piano = String(body.piano);
          }
        } catch { /* piano sconosciuto: non bloccare il salvataggio regole */ }
      }
      // gli override restano legati alla serie finché non premi "Torna ai consigli":
      // così le fasce impostate dalla pagina Difficoltà per le altre serie non si perdono
      persist(state);
      return sendJson(res, 200, viewCard(ladder, state, typeof body.car === 'string' ? body.car : null));
    }
    case 'grid': {
      // tab Griglia: stato del customgrid + classi (regole/perTraccia/convalida)
      const out = gridStatus({ track: typeof body.track === 'string' && body.track ? body.track : null });
      const classes = loadClasses();
      const classi = Object.entries(classes.classi ?? {}).map(([id, c]) => ({
        id,
        autoBase: c.autoBase ?? null,
        aiStandard: c.aiStandard ?? null,
        convalidatoSu: c.convalidatoSu ?? [],
        match: (c.regole ?? []).filter((r) => r.preset && out.exists && r.preset === out.cells.find((ce) => ce.preset === r.preset)?.preset).length,
        regole: (c.regole ?? []).map((r) => ({ auto: r.auto, preset: r.preset ?? null, kg: r.ballastKg ?? 0, pct: r.restrictorPct ?? 0, escluso: r.escluso === true })),
        perTraccia: Object.entries(c.perTraccia ?? {}).filter(([k]) => !k.startsWith('_')).map(([trk, ov]) => ({
          traccia: trk, convalidato: ov?.convalidato === true,
          restrictorPct: ov?.restrictorPct ?? null, aiStandard: ov?.aiStandard ?? null,
          escludiAuto: ov?.escludiAuto ?? [], nota: ov?.nota ?? null,
        })),
      }));
      let calib = null;
      try { calib = (await hot('./grid-calib.mjs')).calibSummary(); } catch { /* il registro calibrazione non esiste ancora: va bene */ }
      return sendJson(res, 200, { ...out, classi, matched: out.exists ? matchCurrentClass() : null, calib: (out.exists ? calib : null) });
    }
    case 'grid-apply': {
      try {
        const out = applyBalance({ track: body.track ?? null, force: !!body.force });
        return sendJson(res, 200, { ...out, cells: gridStatus({ track: body.track ?? null, file: undefined }).cells });
      } catch (e) { return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code }); }
    }
    case 'grid-drop': {
      try {
        const out = dropCellsApply(body.matchers ?? body.presets ?? [], { force: !!body.force });
        return sendJson(res, 200, { ...out, cells: gridStatus({}).cells });
      } catch (e) { return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code }); }
    }
    case 'weekend-track': {
      // la sede del weekend: pista ATTUALE nel gamemodesave + pista ATTESA della
      // ronda corrente — e con track dato, la RISCRIVE (a gioco aperto: è il
      // unico gesto griglia provato con il menu EVO che adotta il file toccato)
      try {
        const cur = currentWeekendTrack();
        const node = nodeById(ladder, state.node);
        const roundTrackId = node?.calendar?.[Math.min(state.round ?? 0, (node?.calendar?.length ?? 1) - 1)]?.track ?? null;
        const expectedName = roundTrackId ? (ladder.contentNames?.tracks?.[roundTrackId] ?? roundTrackId) : null;
        if (!body.track) {
          return sendJson(res, 200, { file: WEEKEND_FILE, current: cur, expected: expectedName, same: cur && expectedName ? cur === expectedName : null });
        }
        const out = changeWeekendTrack(String(body.track), { dry: !!body.dry });
        return sendJson(res, 200, { ...out, current: currentWeekendTrack(), expected: expectedName });
      } catch (e) { return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code }); }
    }
    case 'grid-ai': {
      try {
        const out = applyAi([Number(body.min), Number(body.max)], { force: !!body.force });
        return sendJson(res, 200, { ...out, cells: gridStatus({}).cells });
      } catch (e) { return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code }); }
    }
    case 'difficulty': return sendJson(res, 200, viewDifficulty(ladder, state));
    case 'setup': return sendJson(res, 200, viewSetup(ladder));
    case 'telem-diagnostics': {
      const { paths: pNow } = context();
      // come negli altri punti del file: prima Saved Games\ACE, poi Documents\ACE
      const root = pNow.dataDirs?.[0] ? join(pNow.dataDirs[0], 'MoTec') : join(pNow.dataDirs?.[1] ?? '', 'MoTec');
      // SCOPE CARRIERA (24/10, slot 3): MoTec è UNA cartella per PC condivisa
      // da tutti gli slot — la diagnostica di una carriera vergine elencava
      // anche lo storico dello slot 1 e delle prove vecchie. Dalla
      // nascita della carriera (state.createdAt) in poi; body.all = 1 mostra
      // TUTTO il disco (interruttore nella vista).
      const dopo = body.all ? 0 : (state?.createdAt ?? 0);
      return sendJson(res, 200, { root, scoped: !!dopo, all: !!body.all, sinceLocal: dopo ? new Date(dopo).toLocaleString('it-IT') : null, cars: telemDiagnostics(root, { afterMs: dopo }) });
    }
    case 'new-career': {
      if (!body.name || !String(body.name).trim()) return sendJson(res, 400, { error: tr({ it: 'Serve il nome del pilota.', en: 'The driver name is required.' }) });
      if (hasCareer() && !body.force) return sendJson(res, 400, { error: tr({ it: 'Esiste già una carriera. Attiva "ricomincia da zero" per sovrascriverla.', en: 'A career already exists. Turn on "start from scratch" to overwrite it.' }) });
      const st = createCareer(ladder, {
        name: String(body.name).trim(),
        nation: String(body.nation ?? 'ITA').toUpperCase(),
        discipline: body.discipline ? String(body.discipline) : null,
      });
      resetImportRegistry(); // ledger e log appartenevano alla carriera precedente
      resetFlows();          // i flussi appartenevano alla carriera precedente
      resetNews();           // la gazzetta riparte pulita
      persist(st);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, st) });
    }
    case 'rename': {
      const before = state.driver.name;
      renameDriver(state, { name: String(body.name ?? '').trim() || null });
      pushMessage(state, `Nome pilota aggiornato: ${before} -> ${state.driver.name}.`, 'info');
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'enter': {
      const target = nodeById(ladder, String(body.nodeId ?? ''));
      enterNode(ladder, state, target, { buy: !!body.buy, force: !!body.force });
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'accept': {
      const target = acceptOffer(ladder, state, Number(body.index));
      persist(state);
      return sendJson(res, 200, { ok: true, signed: target.display, header: viewHeader(ladder, state) });
    }
    case 'race': {
      const node = nodeById(ladder, state.node);
      if (state.round >= node.calendar.length) return sendJson(res, 400, { error: 'Stagione completata: chiudi l\'anno dalla schermata Carriera.' });
      const card = raceCard(ladder, state, { car: typeof body.car === 'string' ? body.car : null });
      const running = await isGameRunning();
      state.pendingSettings = { ...(state.raceSettings?.[node.nodeId] ?? {}) };
      const fee = chargeEntry(ladder, state, node);
      markPending(ladder, state, card);
      persist(state);
      // PREPARAZIONE DEL WEEKEND prima del lancio: pista della ronda nel
      // gamemodesave + auto della ronda selezionata nel garage (rilegge all'avvio
      // di EVO, confermato in test). SEMPRE, anche a EVO APERTO: pista e auto si
      // scrivono a gioco aperto dal menu principale (verificato 20/10, lezione
      // della Donington R3: a EVO già aperto il bottone non preparava nulla).
      // Falli silenti: se la pista non è nota o l'auto manca nel dizionario si
      // parte com'era, niente blocco del flusso.
      const prep = { track: null, trackWritten: false, car: null, carWritten: false, grid: null };
      if (!body.noLaunch) {
        try {
          if (card.trackName) {
            const t = changeWeekendTrack(card.trackName);
            prep.track = card.trackName; prep.trackWritten = t.written;
            // 26/10 — changed===0 NON è un fallimento: il file può essere GIÀ
            // sulla pista della ronda (secondo tap del bottone). Lo diciamo:
            // senza questo il cruscotto resta muto e l'amico crede che l'app
            // non abbia fatto nulla (vale la lezione del PC 2 con Mount
            // Panorama: la scrittura c'era, il messaggio no).
            if (!t.written) {
              try {
                const cur = currentWeekendTrack();
                if (cur && String(cur).toLowerCase().includes(String(card.trackName).toLowerCase())) prep.trackSame = true;
              } catch { /* file illeggibile: resta il verdetto neutro */ }
            }
          } else prep.track = currentWeekendTrack();
        } catch (e) {
          // 26/10 (PC vergine, test da zero): il file del weekend NON esiste
          // ancora — l'errore secco ENOENT non diceva niente. Con la frase nuova
          // il toast SPIEGA cosa fare: entrare UNA volta nel weekend di EVO.
          const enoent = String(e?.code ?? '') === 'ENOENT' || String(e?.message ?? '').includes('ENOENT');
          prep.trackError = enoent
            ? tr({ it: "l'EVO non ha ancora il weekend di carriera: entra in EVO nel weekend del round UNA volta (basta la schermata del weekend, NON la sessione di pratica), poi ripremi Prepara tutto", en: 'EVO has no career weekend yet: enter the round weekend in EVO ONCE (the weekend screen is enough — not the practice session), then press Get ready again' })
            : e.message;
        }
        try {
          if (card.carName) {
            const c = setDriverCar(card.carName);
            prep.car = card.carName; prep.carWritten = c.written;
          } else prep.car = garageCurrent().name;
        } catch (e) {
          const enoent = String(e?.code ?? '') === 'ENOENT' || String(e?.message ?? '').includes('ENOENT');
          const unknown = String(e?.code ?? '') === 'UNKNOWN_CAR' || String(e?.message ?? '').includes('non nel dizionario');
          // 25/10 (Mauro: «se tutto ok dovrebbe restare bianco, rosso solo quando
          // ci sono problemi»): l'auto fuori dizionario NON è un problema — la
          // gara parte lo stesso e alla prima import l'app impara l'auto dal
          // garage. Prima finiva in carError e il rosso spurio faceva credere a
          // un blocco che non c'era (la gara C'ERA). Ora va in carNote: nota
          // neutra nel toast, nessun rosso.
          prep.carError = enoent
            ? tr({ it: "il garage di EVO è ancora vergine: scegli l'auto a mano nel weekend (è l'unica cosa da fare dentro il gioco); dalla gara dopo l'app la seleziona per te", en: "EVO's garage is still empty: pick the car by hand in the weekend (the only thing to do inside the game); from the race after the app picks it for you" })
            : (unknown ? null : e.message);
          if (unknown) prep.carNote = tr({ it: "auto non ancora nel dizionario dell'app: la gara parte lo stesso, scegli l'auto a mano in EVO; a fine gara l'app impara l'auto dal garage e dalle gare successive la seleziona da sola", en: "car not in the app dictionary yet: the race goes on anyway — pick it by hand in EVO; at the race end the app learns it from the garage and selects it by itself in later races" });
        }
        // VIGIA DELLA GRIGLIA (come la CLI 'prepara'): se il customgrid ha la
        // classe combaciante ma il bilancio o il campo AI sono persi, li
        // riscrive. NON ricostruisce la griglia: le celle (auto) restano quelle
        // già applicate — il rebuild dal template sbagliato ha scritto la
        // flotta sbagliata la notte del 20/10 (Donington). A EVO aperto si
        // scrive solo dal menu principale: regole della 7ª prova.
        try {
          // RICOSTRUZIONE DELLA GRIGLIA quando il customgrid sul disco è di
          // un'altra serie (23/10 mattina: si è passati a Coppa RX-7 col file
          // ancora GT3-vs-EXP; il tasto NON importava MAI la nuova serie).
          // Il CLI 'prepara' (cmdPrepara) lo ha sempre fatto via cmdGriglia:
          // porto lo stesso gesto nell'app, prima della vigia — che dopo la
          // scrittura trova il bilancio già in piedi (il builder applica le
          // regole delle poolAuto della classe della serie in grid-classes.json).
          // Falli silente: un errore non blocca l'iscrizione — la card sotto
          // resta il piano B (come fa il CLI: "la griglia non pronta: la
          // carriera prosegue con la card qui sotto").
          // RAMO GRIGLIA (26/10 notte, decisione finale di Mauro): il modo
          // CUSTOM lo portano COME ORA tutte le serie, mono compresa — la
          // riscrittura della griglia al Prepara resta per TUTTE (conteggio
          // allineato al gamemodesave, zavorre/penalità solo dove la classe
          // le chiede) e la cartuccia non si parcheggia più.
          try {
            const rb = rebuildGridApply({
              ladder,
              nodeId: state.node,
              roundIndex: Math.min(state.round ?? 0, node.calendar.length - 1),
              force: true,   // a EVO aperto si può scrivere dal menu principale (7ª prova 19/10, certificata in NOTE-AUTOMAZIONE)
            });
            if (rb.written) {
              prep.grid = prep.grid ?? {};
              prep.grid.rebuild = `riscritta per "${rb.report.serie}" — ${rb.report.gridSize} celle${rb.report.poolMulti ? ` (${rb.report.poolMulti})` : ''}${rb.source ? ` · template: ${rb.source}` : ''}`;
              prep.grid.written = true;
            }
          } catch (e) {
            prep.grid = prep.grid ?? {};
            prep.grid.rebuild = `non riuscita (${e.message})`;
          }
          if (existsSync(GRID_FILE)) {
            const zp = zeroBalanceProposal(GRID_FILE, { track: card.trackName ?? null });
            if (zp) {
              const out = applyBalance({ track: card.trackName ?? null, force: true });
              prep.grid.bilancio = `riscritto "${out.classe}"`; prep.grid.written = true;
            } else prep.grid.bilancio = 'ok';
            const ap = aiRangeProposal(GRID_FILE);
            if (ap?.trovato && (ap.trovato[0] !== ap.atteso[0] || ap.trovato[1] !== ap.atteso[1])) {
              const _out = applyAi(ap.atteso, { force: true });
              prep.grid.ai = `riscritto ${ap.atteso[0]}-${ap.atteso[1]} (trovato ${ap.trovato[0]}-${ap.trovato[1]})`; prep.grid.written = true;
            } else prep.grid.ai = ap?.atteso ? `ok (${ap.atteso[0]}-${ap.atteso[1]})` : null;
          }
        } catch (e) { prep.gridError = e.message; }
      }
      // TIPO GRIGLIA DEL MODO (26/10 sera, forme canoniche del toggle vivo
      // fotografato e confermato a riavvio: automatic = 3.6 = 1 solo;
      // custom = 3.6 = 1 TENUTO e 3.7 = N aggiunto — la forma del menu
      // che il gioco ADOPTA a riavvio; la vecchia forma «6 trasformato in
      // 7» veniva scartata e il menu rinascava AUTOMATIC).
      // DECISIONE FINALE (26/10 notte, dopo le gare di test di Mauro):
      // ritira l'elezione del modo — TUTTE custom: la forma scritta
      // qui è quella che vale per il menu EVO a riavvio, anche da un save
      // nato AUTOMATIC di fabbrica (verificato live: scritto custom/14 a
      // menu chiuso → menu nato CUSTOM da solo). Silente se il save manca.
      // La forma è la STESSA (N = celle-1) per mono e multiclasse.
      try {
        // LETTURA CON RESA (27/10, errori 00:06/00:11 «varint oltrefine») se il
        // menu griglia di EVO sta riscrivendo il file proprio in quell'istante,
        // la lettura parte a metà scrittura e il decoder muore con «varint
        // oltrefine». 4 tentativi a 250 ms: la corsa transitoria passa; se il
        // file è davvero illeggibile, dopo l'ultimo tentativo resta piano B.
        // FIX 31/10: prima dell'errore restava `null` dopo il catch e il
        // `celle === null → break` usciva al PRIMO fallo: il ritento per errore
        // non nasceva mai (per quello è risaltato sul vivo, a file sano). Ora
        // il break solo per file Assente ( uncomment non lo crea), l'errore riprova.
        let celle, letErr = null;
        for (let t = 0; t < 4 && !celle; t++) {
          if (t) await new Promise((r) => setTimeout(r, 250));
          try { celle = existsSync(GRID_FILE) ? (readCells(GRID_FILE)?.cells ?? []) : null; }
          catch (e) { letErr = e; }
          if (celle === null) break;   // file assente: un altro tentativo non lo crea
        }
        if (!celle) {
          if (letErr) throw new Error(`customgrid non leggibile (${letErr.message}) — se torna ripremi Prepara tutto: le griglia la riscribe intera`);
          throw new Error('nessun customgrid sul disco: ripremi Prepara tutto (il rebuild la ricostruisce) o usa tab Griglia / CLI griglia');
        }
        // CARTUCCIA a 0 CELLE decodificabili (26/10 notte, il weekend rigenerato
        // di EVO): non settle mai custom/1 — il contatore scende al template
        // in magazzino (la memoria VERA della serie) e solo in ultima analisi
        // si arresterà sul messaggio di errore con la guida (piano B).
        let contatore = celle.length > 0 ? celle.length - 1 : null;
        if (contatore == null) {
          const nod = String(state.node).replace(/[^a-zA-Z0-9_.-]/g, '_');
          const tPath = join(slotDataDir(), 'grid-templates', nod + '.customgrid');
          if (!existsSync(tPath)) throw new Error(`customgrid sul disco ma con ${celle.length === 0 ? '0 celle' : 'celle non decodificabili'} e nessun template di serie in magazzino: ripremi Prepara tutto`);
          let celleTemplate = 0;
          try { celleTemplate = readCells(readFileSync(tPath))?.cells?.length ?? 0; } catch { celleTemplate = 0; }
          if (celleTemplate <= 0) throw new Error(`template di serie (${tPath}) non decodificabile: ripremi Prepara tutto`);
          contatore = celleTemplate - 1;
        } else if (contatore < 1) contatore = 1;
        const gm = setWeekendGridCustom(contatore);
        prep.gridMode = gm?.written
          ? tr({ it: `custom sbloccato (contatore ${contatore})`, en: `custom unlocked (count ${contatore})` })
          : tr({ it: 'griglia custom già in piedi', en: 'custom grid already in place' });
      } catch (e) {
        // 27/10: il motivo VERO del piano B va nel registro (data/errors.jsonl):
        // il toast lo mostra in coda, ma sembra una recita e non si capisce il
        // perché. Così Diagnostica porta la riga con il motivo originale.
        recordWarning('webui.gridmode', e.message, `node ${state.node} round ${state.round}`);
        /* PIANO B (26/10 notte, richiesta Mauro): se la scrittura del modo non
        passa (file letto a metà scrittura dal gioco, blocco lock su disco,
        forma non decodificabile), l'amico NON resta indietro: il messaggio
        che sale fino al toast guida il gesto manuale, che risolve sempre —
        il menu EVO scrive la forma canonica esattamente come la scriveremmo noi. */
        prep.gridModeError = tr({
          it: `il selettore Grid Type non è stato scritto da fuori (${e.message}) — apri in EVO il menu Race Weekend del round: muovi Grid Type su CUSTOM e premi Applica (così le zavorre e le penalità di classe arrivano al via)`,
          en: `the Grid Type selector was not written from outside (${e.message}) — open the round's Race Weekend menu in EVO: move Grid Type to CUSTOM and press Apply (this brings the class ballast and penalties to the start)`,
        });
      }
      // meteo della ronda: FUORI dal cancello !running — la scrittura del selettore
      // in gamemode.lastgamemode è accettata anche a EVO aperto (verificato 20/10/2026:
      // scritta a menu aperto, la sessione avviata dopo la applica). Vale finché la
      // sessione NON è partita: se si scrive a sessione avviata questa parte col
      // meteo già in uso. Silente: se il round non dichiara meteo non tocca nulla.
      try {
        prep.weather = null;
        const round = node?.calendar?.[Math.min(state.round ?? 0, (node?.calendar?.length ?? 1) - 1)];
        const wxLabel = round?.weather != null ? (ladder.weatherNames?.[String(round.weather)] ?? round.weather) : null;
        if (wxLabel != null) {
          const wantIdx = presetForLabel(String(wxLabel));
          const cur = currentWeatherPreset();
          if (wantIdx != null && cur !== wantIdx) {
            const w = setWeatherPreset(wantIdx);
            prep.weather = `${w.preset.label} (era: ${PRESETS[cur]?.label ?? cur ?? '?'} — round vuole: ${wxLabel})`; prep.weatherWritten = w.written;
          } else prep.weather = PRESETS[cur ?? wantIdx]?.label ?? null;
        }
      } catch (e) { prep.weatherError = e.message; }
      // ORE DISTINTE per sessione (richiesta Mauro 28/10, evoluzione del gesto
      // "ora" del 23/10): prova, qualifica, warm-up e gara portano CIASCUNA il
      // proprio orologio (f4.4 del proprio blocco), presi dalla card della ronda
      // (override della serie, altrimenti calcolo a ritroso dal round) — non più
      // una sola ora ripetuta su tutti i blocchi. La scala del tempo resta una
      // sola (f7 su tutti i blocchi toccati): piani notte/crepuscolo la comandano.
      // Idempotente: se le ore e la scala combaciano già, nessuna scrittura.
      try {
        const roundHour = card.round?.hour ?? null;
        if (roundHour != null) {
          const cur = currentRaceTime();
          if (!cur) prep.hourError = existsSync(WEEKEND_FILE)
            ? tr({ it: "l'EVO non ha ancora il weekend di carriera: entra in EVO nel weekend del round (basta la schermata del weekend), poi premi di nuovo Prepara tutto — le ore si scrivono da sole", en: "EVO has no career weekend yet: enter the round's weekend in EVO once (the weekend screen is enough), then press Get ready again — the hours are written automatically" })
            : tr({ it: 'gamemodesave non trovato (EVO mai stato sul weekend?): apri il round in EVO una volta, poi premi di nuovo Prepara tutto', en: 'gamemodesave not found (EVO never reached the weekend?): open the round in EVO once, then press Get ready again' });
          else {
            const wantScale = card.timeMultiplier != null ? Math.max(1, Math.min(60, Number(card.timeMultiplier) || 1)) : null;
            // DURATE AL % (richiesta Mauro 31/10): prova/qualifica/warm-up portano
            // la durata EFFETTIVA della card (al % della distanza) — il Prepara
            // la scrive nei f2 dei blocchi, non solo le ore. La Race è fuori:
            // il suo f2 sono i GIRI (setWeekendLaps li gestisce).
            const durate = { Practice: card.practiceMinEff, Qualifying: card.qualifyMinEff, Warmup: card.warmupMinEff };
            const sessi = {};
            for (const [k, v] of Object.entries({ Practice: card.practiceStart, Qualifying: card.qualifyStart, Warmup: card.warmupStart, Race: roundHour })) {
              const hour = Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
              const durMin = k !== 'Race' && Number.isFinite(Number(durate[k])) ? Math.max(5, Math.round(Number(durate[k]))) : null;
              if (hour != null || durMin != null) sessi[k] = { ...(hour != null ? { hour } : {}), ...(durMin != null ? { durationSec: durMin * 60 } : {}) };
            }
            const ora = currentSessionTimes();
            const tuttoAPosto = ora != null && ora.length > 0 && ora.every((s) => {
              const w = sessi[s.name];
              if (w == null) return true; // sessione senza orario voluto: non si tocca
              const okOra = w.hour != null ? Number(s.hour) === w.hour : true;
              const okDur = w.durationSec != null ? Number(s.durSec) === w.durationSec : true;
              const okScala = wantScale == null || Math.abs(Number(s.scale) - wantScale) < 1e-6;
              return okOra && okDur && okScala;
            });
            const sommario = ora.filter((s) => sessi[s.name] != null).map((s) => `${s.name} ${String(s.hour ?? '?').padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`).join(' · ');
            const sommarioDur = durataSessioni(Object.fromEntries(Object.entries(sessi).filter(([, w]) => w.durationSec != null).map(([k, w]) => [k, w.durationSec])));
            if (tuttoAPosto) prep.hour = `già a posto — ${sommario}${sommarioDur ? ' · ' + sommarioDur : ''}${wantScale != null ? ` · scala ${wantScale}x` : ''}`;
            else {
              const rt = setRaceSessions({ sessions: sessi, scale: wantScale });
              prep.hour = orarioSessioni(Object.fromEntries(Object.entries(sessi).map(([k, w]) => [k, w.hour ?? '?']))) + ` · ${sommarioDur}` + (wantScale != null ? ` · scala ${wantScale}x` : '');
              prep.hourSessions = sessi;
              prep.hourWritten = rt.written;
              prep.hourToccati = rt.toccati;
            }
          }
        }
      } catch (e) { prep.hourError = e.message; }
      try {
        // GIRI della gara (f2 varint del blocco Race, come l'evento e il CLI
        // weekend-laps): la DISTANZA scelta nel pannello regole è già dentro
        // card.laps (25% → un quarto dei giri pieni della ronda). Idempotente,
        // con verifica di round-trip byte-identica e backup datato (lezione 19/10).
        if (card.laps != null && card.round?.durationMin == null) {
          const r = setWeekendLaps(card.laps);
          prep.laps = r.already ? `già ${r.giri} giri` : `${r.giri} giri (blocco "${r.block}")`;
          prep.lapsWritten = r.written;
        } else if (card.round?.durationMin != null) {
          // RONDE A TEMPO (1/11, serie endurance): prima la durata si lasciava
          // a mano in EVO col campo Durata — niente più: la scriviamo qui, bit a
          // bit come i giri (setWeekendTimed: f3=1, f2 = minuti×60). La cifra è
          // durationEff della card, GIÀ scalata al % di distanza del pannello
          // regole (25% su 40′ → 10′). Idempotente: stessa cifra → written:false.
          if (!Number.isFinite(Number(card.durationEff)) || Number(card.durationEff) <= 0) throw new Error(`durata gara non calcolabile (round.durationMin=${card.round.durationMin}): niente scrittura`);
          const r = setWeekendTimed(Number(card.durationEff));
          prep.laps = r.already
            ? tr({ it: `già a TEMPO per ${Math.round(r.durata / 60)} minuti`, en: `already BY TIME at ${Math.round(r.durata / 60)} minutes` })
            : tr({ it: `a TEMPO per ${Math.round(r.durata / 60)} minuti scritti (blocco "${r.block}")`, en: `BY TIME at ${Math.round(r.durata / 60)} minutes written (block "${r.block}")` });
          prep.lapsWritten = r.written;
          if (r.backup) prep.lapsBackup = r.backup.split(/[\\/]/).pop();
        }
      } catch (e) {
        prep.lapsError = (e.code === 'NO_RACE' || /ENOENT/.test(String(e.message ?? String(e))))
          ? tr({ it: "l'EVO non ha ancora il weekend di carriera: entra in EVO nel weekend del round (basta la schermata), poi premi di nuovo Prepara tutto — la durata/i giri si scrivono da soli", en: "EVO has no career weekend yet: enter the round's weekend in EVO once (the weekend screen is enough), then press Get ready again — the race duration/laps are written automatically" })
          : e.message;
      }
      try {
        // BANDA AI della ronda nei cursori del gioco (gamemodesave, campi 30/31 del
        // primo blocco sessione): quella che EVO legge sul loading screen, NON quella
        // salvata nel tool. Lezione 23/10: la ronda era partita con i cursori ereditati
        // 88–93 (valori usati dall'evento) mentre le regole del pannello dicevano
        // 95–96 — i settings del tool non sopravvivono a un event-prep e il Lancio
        // non li riscriveva. Come per pista/ora/giri: si scrive AL LANCIO, sempre,
        // dai valori del pannello regole della serie (sliderMin/Max); senza override
        // si resta come sta (niente bande inventate).
        const S = state.raceSettings?.[node.nodeId];
        if (S?.sliderMin != null && S?.sliderMax != null) {
          const cur = weekendAi();
          if (!cur || cur.min !== S.sliderMin || cur.max !== S.sliderMax) {
            const w = setWeekendAi(S.sliderMin, S.sliderMax);   // backup datato automatico
            prep.ai = `${S.sliderMin}–${S.sliderMax} (era ${cur ? `${cur.min}-${cur.max}` : '—'})`;
            prep.aiWritten = w.written;
          } else prep.ai = `già ${cur.min}–${cur.max}`;
        }
      } catch (e) { prep.aiError = e.message; }
      let launched = null;
      if (!body.noLaunch) {
        try {
          const r = await launch(paths, { force: !!body.forceLaunch });
          launched = r;
        } catch (e) {
          launched = { error: e.message };
        }
      }
      return sendJson(res, 200, { ok: true, fee, prep, gameRunning: running, launched, card: viewCard(ladder, state, typeof body.car === 'string' ? body.car : null), header: viewHeader(ladder, state) });
    }
    case 'import': {
      try {
        const out = await doImport(ladder, paths, state, {
          manual: body.position ? { position: body.position, gridSize: body.cars, dnf: !!body.dnf, fl: !!body.fl, laps: body.laps, bestLap: body.bestLap } : null,
          allowAny: !!body.allowAny, force: !!body.force,
        });
        // dopo una gara importata può nascere un invito speciale (e gli inviti
        // non accettati entro il termine scadono)
        let spawn = null;
        try { expireEvents(ladder, state); spawn = maybeSpawnEvent(ladder, state); } catch (e) { recordWarning('events.spawn', 'generazione invito fallita', e?.message ?? null); }
        if (spawn) persist(state);
        // AUTO-REFRESH del cruscotto (24/10): la GUI segue watcher.importSeq
        // (viste-d.js, poll ogni 5s) e si ricarica da sola al cambio. Fino ad
        // oggi SOLO il tick del watcher incrementava il contatore: un import
        // manuale (bottone «importa» del Centro gare, o chiamata API mentre il
        // gioco è chiuso) lasciava la pagina ferma sulla gara vecchia fino a un
        // refresh a mano. Segnamo il ritmo UGUALE a quello del watcher:
        // i duplicati e gli import vuoti NON toccano il contatore (niente
        // ricariche inutili a ogni giro di polling).
        // DEBRIEF DI FINE GARA (30/10): la scheda che Paddock mostra fra un
        // round e l'altro, qui costruita con i dati VERI: scomposizione del
        // deficit (raceAutopsy, in comune con tab Analisi) + benzina/gomma/
        // partenza dall'ultimo .ld di gara (i numeri che muoiono alla chiusura
        // del gioco) + il parere del meccanico. Solo sulla gara APPENA
        // importata: duplicati e vuoti non rigenerano nulla.
        if (!out?.duplicate && (out?.entry ?? out?.updated)) {
          watcher.importSeq = (watcher.importSeq ?? 0) + 1;
          const entry = out.entry ?? out.updated;
          try {
            const dataRoot = paths.dataDirs?.[0] ?? '';
            // il .ld di gara va cercato RETRODATATO dal momento della corsa,
            // non dall'ora dell'import: con afterMs = now un .ld di testday
            // fatto nel frattempo potrebbe scavalcare la gara vera.
            const atMs = Date.parse(entry?.at ?? entry?.importedAt ?? '') || Date.now();
            const dataRootMoTec = join(dataRoot, 'MoTec');
            const dataRootResults = paths.resultsDirs?.[0] ?? join(dataRoot, 'Results');
            const session = collectSessions(dataRootMoTec, dataRootResults, { limit: 6, afterMs: atMs - 3 * 3600000 })[0] ?? null;
            let analysis = null;
            if (session?.file) analysis = analyzeLd(session.file);
            const d = raceDebrief(ladder, state, { analysis });
            if (d) {
              out.debrief = d;
              // copia nel MERIDIANO: la scheda vive anche in Messaggi, come la
              // stagione di Paddock che ricorda a fondo round cosa è successo.
              const breve = [d.headline, d.telem[0]?.text ?? d.rows[0]?.text ?? d.pareri[0]].filter(Boolean).join(' — ');
              pushMessage(state, `🏁 ${breve}`, 'info');
              persist(state);
            }
          } catch (e) { recordWarning('debrief.post', 'debrief di fine gara fallito', e?.message ?? null); }
        }
        return sendJson(res, 200, { ...out, eventSpawned: spawn ? { id: spawn.id, theme: spawn.theme.name, track: spawn.trackDisplay } : null });
      } catch (e) {
        if (e.code) return sendJson(res, 409, { error: e.message, code: e.code, detail: e.detail });
        throw e;
      }
    }
    case 'import-inspect': {
      const files = listResultFiles(paths).slice(0, 8).map((f) => {
        try {
          const r = readSessionResult(f.file);
          const { driver, how } = findPlayerDriver(r, state.driver);
          const info = driver ? classify(r, { driver }) : null;
          return {
            name: f.name, mtime: f.mtime, session: r.session, track: r.track,
            drivers: (r.drivers ?? []).length, isRace: isRaceSession(r),
            me: driver ? { how, position: info.position, rawPos: info.rawPos, dnf: info.dnf, dsq: info.dsq, penalty: info.penalty, car: info.car } : null,
            already: alreadyImportedHash(f.file),
          };
        } catch { return { name: f.name, mtime: f.mtime, session: '?', track: '?', drivers: 0, isRace: false }; }
      });
      return sendJson(res, 200, { files });
    }
    case 'difficulty-action': {
      // Banda dell'EVENTO SPECIALE (richiesta Mauro 23/10: "88-93, e deve
      // risultare anche nel pannello difficoltà"): riga `★ evento` in scheda,
      // con i suoi due cursori e l'id `evento_*` (che NON è un nodo del ladder).
      // L'override si salva solo nel tool: in gara personalizzata l'EVO la legge
      // dalla barra AI che l'utente mette a mano — gamemodesave 30/31 appartiene
      // alla ronda di carriera (lezione 23/10): è il lancio della ronda a
      // riscriverla. L'evento NON usa il clamp a gap 1: vuole la banda LARGA
      // 88–93 (i rivali sono calibrati così).
      if (body.op === 'range' && /^evento_/.test(String(body.nodeId ?? ''))) {
        const evCard = eventCard(ladder, state);
        const evId = evCard ? `evento_${evCard.theme?.id ?? 'speciale'}` : null;
        if (!evId || String(body.nodeId) !== evId) return sendJson(res, 404, { error: tr({ it: 'Nessun evento speciale attivo con questo id.', en: 'No special event active with this id.' }) });
        if (body.clear) {
          if (state.raceSettings?.[evId]) { delete state.raceSettings[evId].sliderMin; delete state.raceSettings[evId].sliderMax; }
          pushMessage(state, tr({
            it: `Banda AI dell'evento ${evCard.theme?.name ?? 'special'} tornata al fisso ${evCard.diffMin}–${evCard.diffMax}%.`,
            en: `AI band of event ${evCard.theme?.name ?? 'special'} is back to the fixed ${evCard.diffMin}–${evCard.diffMax}%.`,
          }), 'info');
        } else {
          const num = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));
          let lo = num(body.min ?? 0), hi = num(body.max ?? 0);
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
          ((state.raceSettings ??= {})[evId] ??= {}).sliderMin = lo;
          state.raceSettings[evId].sliderMax = hi;
          pushMessage(state, tr({
            it: `Banda AI dell'evento ${evCard.theme?.name ?? 'special'} impostata a ${lo}–${hi}% (default ${evCard.diffMin}–${evCard.diffMax}%): in gara personalizzata mettila a mano nella barra AI di EVO, la scheda evento resta la reference.`,
            en: `AI band of event ${evCard.theme?.name ?? 'special'} set to ${lo}–${hi}% (default ${evCard.diffMin}–${evCard.diffMax}%): set it by hand on the EVO sliders in the custom race, the event card stays the reference.`,
          }), 'info');
        }
        persist(state);
        return sendJson(res, 200, { ok: true, view: viewDifficulty(ladder, state) });
      }
      const d = state.difficulty;
      if (body.op === 'mode') {
        if (!['adaptive', 'fixed', 'custom'].includes(body.mode)) return sendJson(res, 400, { error: tr({ it: 'Modalità non valida.', en: 'Invalid mode.' }) });
        d.mode = body.mode;
        d.base ??= {}; d.trim ??= {};
        if (body.mode === 'fixed') {
          const value = Number(body.value ?? 95);
          if (!Number.isFinite(value) || value < 70 || value > 120) return sendJson(res, 400, { error: 'Il valore vuole un numero fra 70 e 120.' });
          for (const nd of ladder.nodes) d.base[nd.nodeId] = value;
          d.trim = {};
        }
        if (body.mode === 'adaptive') { d.base = {}; d.pending = null; }
        pushMessage(state, tr({
          it: `Difficoltà AI impostata su "${body.mode}"${body.value ? ` (valore ${body.value})` : ''}.`,
          en: `AI difficulty set to "${body.mode}"${body.value ? ` (value ${body.value})` : ''}.`,
        }), 'info');
      } else if (body.op === 'lock' || body.op === 'unlock') {
        nodeById(ladder, String(body.nodeId));
        const list = new Set(d.locked);
        if (body.op === 'lock') list.add(String(body.nodeId)); else list.delete(String(body.nodeId));
        d.locked = [...list];
      } else if (body.op === 'range') {
        // intervallo slider EVO di una serie (min-max, come nel gioco); vuoto = torna al consiglio
        // La banda viene scritta ANCHE nei cursori del gioco (gamemodesave, campi 30/31):
        // senza quella scrittura l'utente vede i due valori solo nel tool, non sullo-loading
        // screen di EVO (23/10: registro 91–96 a mano, il gioco correva 88–93).
        const node = nodeById(ladder, String(body.nodeId ?? state.node));
        if (body.clear) {
          if (state.raceSettings?.[node.nodeId]) { delete state.raceSettings[node.nodeId].sliderMin; delete state.raceSettings[node.nodeId].sliderMax; }
        } else {
          const num = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));
          let lo = num(body.min ?? 0), hi = num(body.max ?? 0);
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) return sendJson(res, 400, { error: 'Min e max vogliono numeri fra 0 e 100.' });
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
          hi = Math.min(hi, lo + 1);   // banda STRETTA: gap massimo 1% (scelta Mauro 23/10)
          ((state.raceSettings ??= {})[node.nodeId] ??= {}).sliderMin = lo;
          state.raceSettings[node.nodeId].sliderMax = hi;
        }
        // esempio il band da scrivere nel gioco: l'override, altrimenti il consiglio (centro ±5)
        const track = node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track;
        const band = body.clear ? null : [state.raceSettings[node.nodeId].sliderMin, state.raceSettings[node.nodeId].sliderMax];
        const suggest = difficultyFor(ladder, state, node, track);
        const baseBand = Math.max(0, Math.min(100, Math.round(suggest.slider)));
        const want = band ?? [baseBand, Math.min(100, baseBand + 1)];
        let gioMsg = '';
        try {
          const w = setWeekendAi(want[0], want[1]);
          gioMsg = w.written
            ? tr({ it: ' Scritti anche i cursori del gioco — valgono alla PROSSIMA apertura del weekend: se il weekend era già avviato resta la vecchia banda fino alla riapertura (e lo screen di caricamento mostra quella del weekend avviato).', en: ' The game sliders are written too — they take effect at the NEXT weekend open: a weekend already running keeps the old band until reopened (and the loading screen shows that one).' })
            : tr({ it: ' I cursori del gioco sono già a posto.', en: ' The game sliders already match.' });
        } catch (e) {
          gioMsg = tr({ it: ` ⚠ Non scritti nel gamemodesave (${e.message}): la serie prende il valore solo nel tool.`, en: ` ⚠ Not written to the gamemodesave (${e.message}): only the tool holds the value.` });
        }
        pushMessage(state, tr({
          it: `Difficoltà EVO di ${node.display} impostata a ${body.clear ? 'consiglio automatico' : (state.raceSettings[node.nodeId]?.sliderMin ?? '?') + '–' + (state.raceSettings[node.nodeId]?.sliderMax ?? '?') + '%'}.${gioMsg}`,
          en: `EVO difficulty of ${node.display} set to ${body.clear ? 'auto suggestion' : (state.raceSettings[node.nodeId]?.sliderMin ?? '?') + '–' + (state.raceSettings[node.nodeId]?.sliderMax ?? '?') + '%'}.${gioMsg}`,
        }), 'info');
      } else if (body.op === 'trim') {
        const val = Math.max(-20, Math.min(20, Math.round(Number(body.value ?? 0))));
        if (!Number.isFinite(val)) return sendJson(res, 400, { error: 'Il trim vuole un numero fra -20 e +20.' });
        const targets = body.nodeId === 'all'
          ? ladder.nodes.map((n) => n.nodeId)
          : [nodeById(ladder, String(body.nodeId ?? state.node)).nodeId];
        d.trim ??= {};
        // la banda EVO della serie segue il trim: 1 punto di trim = 1 punto slider
        // (banda STRETTA di 1 punto, scelta Mauro 23/10). Così cruscotto e pagina
        // difficoltà mostrano SEMPRE la stessa banda anche quando il trim cambia.
        for (const t of targets) {
          const before = d.trim[t] ?? 0;
          d.trim[t] = val;
          const RS = (state.raceSettings ??= {});
          const S = (RS[t] ??= {});
          const shift = (val - before) * 1;
          S.sliderMin = Math.max(0, Math.min(100, (S.sliderMin ?? Math.round((state.raceSettings[t]?.sliderMin ?? 84))) + shift));
          S.sliderMax = Math.max(S.sliderMin, Math.min(100, (S.sliderMax ?? Math.round((state.raceSettings[t]?.sliderMax ?? 85))) + shift));
        }
        // il trim della serie corrente arriva anche ai cursori del gioco
        try { const cs = state.raceSettings[state.node]; if (cs?.sliderMin != null) setWeekendAi(cs.sliderMin, cs.sliderMax); } catch { /* se manca il file si va avanti */ }
        d.pending = null;
        pushMessage(state, tr({
          it: `Difficoltà regolata a mano: trim ${val >= 0 ? '+' : ''}${val} su ${body.nodeId === 'all' ? 'tutte le serie' : nodeById(ladder, String(body.nodeId ?? state.node)).display}.`,
          en: `Difficulty set by hand: trim ${val >= 0 ? '+' : ''}${val} on ${body.nodeId === 'all' ? 'all series' : nodeById(ladder, String(body.nodeId ?? state.node)).display}.`,
        }), 'info');
      } else if (body.op === 'accept' || body.op === 'reject') {
        const p = d.pending;
        if (!p) return sendJson(res, 400, { error: tr({ it: 'Nessun suggerimento in attesa.', en: 'No pending suggestion.' }) });
        if (body.op === 'accept') {
          const before = d.trim[p.nodeId] ?? 0;
          d.trim[p.nodeId] = p.to;
          // il suggerimento accettato sposta anche la banda EVO della serie (+1 trim = +5 slider)
          const shift = (p.to - before) * 1;
          if (shift) {
            const RS = (state.raceSettings ??= {});
            const S = (RS[p.nodeId] ??= {});
            S.sliderMin = Math.max(0, Math.min(100, (S.sliderMin ?? 88) + shift));
            S.sliderMax = Math.max(S.sliderMin, Math.min(100, (S.sliderMax ?? 89) + shift));
          }
          // accettare il suggerimento sulla serie corrente riscrive anche i cursori del gioco
          try { if (p.nodeId === state.node) { const cs = state.raceSettings[p.nodeId]; if (cs?.sliderMin != null) setWeekendAi(cs.sliderMin, cs.sliderMax); } } catch { /* se manca il file si va avanti */ }
          pushMessage(state, tr({
            it: `Difficoltà di ${nodeById(ladder, p.nodeId).display} portata a trim ${p.to >= 0 ? '+' : ''}${p.to} (${p.reason}): banda EVO ora ${state.raceSettings[p.nodeId]?.sliderMin ?? '?'}–${state.raceSettings[p.nodeId]?.sliderMax ?? '?'}%.`,
            en: `Difficulty of ${nodeById(ladder, p.nodeId).display} moved to trim ${p.to >= 0 ? '+' : ''}${p.to} (${p.reason}): EVO band now ${state.raceSettings[p.nodeId]?.sliderMin ?? '?'}–${state.raceSettings[p.nodeId]?.sliderMax ?? '?'}%.`,
          }), 'info');
        }
        d.pending = null;
      } else {
        return sendJson(res, 400, { error: tr({ it: 'Operazione di difficoltà non valida.', en: 'Invalid difficulty operation.' }) });
      }
      persist(state);
      return sendJson(res, 200, { ok: true, view: viewDifficulty(ladder, state) });
    }
    case 'life': {
      const node = nodeById(ladder, state.node);
      const L = ensureLife(state);
      // backfill per carriere in corso: contratto e sigilli esistono da prima di questa stagione
      const backfill = ensureContract(ladder, state, node);
      const newSigils = checkSigils(ladder, state);
      if (backfill || newSigils.length) persist(state);
      const pulse = midSeasonPulse(state.world, ladder, grigliaSimEstesa(ladder, state, node), state.season, Math.min(state.round, node.calendar.length - 1));
      const contr = contractStatus(ladder, state);
      return sendJson(res, 200, {
        contract: contr ? { display: contr.contract.display, season: contr.contract.season, payout: contr.contract.payout, rows: contr.rows, metrics: contr.metrics } : null,
        sponsor: sponsorOffers(ladder, state),
        sponsorActive: sponsorFor(state),
        challenge: (() => { const c = challengeFor(ladder, state); return c ?? null; })(),
        sigils: (L.sigils ?? []).map((s) => ({ ...(sigilDefs(ladder).find((d) => d.id === s.id) ?? {}), ...s })),
        sigilDefs: sigilDefs(ladder),
        challengeStats: L.challengeStats,
        duel: (L.duel && L.duel.season === state.season) ? L.duel : null,
        pulse,
        round: state.round,
      });
    }
    case 'heritage':
      return sendJson(res, 200, heritageOverview(ladder, state));
    case 'heritage-claim': {
      try {
        const out = claimMemory(ladder, state);
        // il relic: l'auto dell'antenato entra nel garage con la sua nota di famiglia
        try {
          const H = state.heritage ?? {};
          const done = (H.completed ?? [])[((H.completed ?? []).length) - 1];
          if (done?.carId) {
            addCar(state, { carId: done.carId, carName: done.carName ?? done.carId, how: 'won', note: `relic di famiglia — ${done.title} (${done.era})` });
            pushMessage(state, `📜 Il relic di famiglia entra nel garage: ${done.carName ?? done.carId}.`, 'title');
          }
        } catch { /* il relic non deve bloccare l'incasso */ }
        persist(state);
        return sendJson(res, 200, { ok: true, ...out, garage: garageOverview(ladder, state, { paths }), header: viewHeader(ladder, state) });
      } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    case 'gazzetta': return sendJson(res, 200, { items: newsFeed(30) });
    case 'garage': {
      // aiuto-meccanico: target pressioni classe, regola 4 PSI, note per auto+pista
      try {
        if (body.action === 'psi') return sendJson(res, 200, fourPsi({ cold: body.cold, hot: body.hot, target: body.target }));
        if (body.action === 'sessions') {
          // storico telemetrie per auto (e pista se nota): tipo sessione, giri, benzina,
          // pressioni vere e assetto in pratica — la materia prima del suggeritore
          // (senza auto esplicita si usa l'auto più recente con telemetria, non la prima della lista)
          const board = setupBoard(ladder, state);
          // MoTeC è per-PC: per un save con createdAt si mostrano solo le sessioni
          // POST-nascita della carriera — il vergine non incassa quelle dei vecchi (24/10)
          const afterMs = state.createdAt ?? 0;
          const carName = body.car ?? null;
          // 'all' = esplicitamente SENZA filtro pista (il pannello segue la
          // macchina in pista anche da gioco chiuso): niente fallback sulla pista
          // della serie, che filtrerebbe le sessioni dell'ultima auto uscita.
          const trackKey = body.track === 'all' ? undefined : (body.track ?? board.track ?? undefined);
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          const resultsDir = paths.resultsDirs?.[0] ?? join(root, '..', 'Results');
          let sessions = collectSessions(root, resultsDir, { car: carName, track: trackKey, limit: body.limit ?? 10, afterMs });
          if (!sessions.length && trackKey) sessions = collectSessions(root, resultsDir, { car: carName, limit: body.limit ?? 10, afterMs });
          if (!sessions.length && !carName) sessions = collectSessions(root, resultsDir, { limit: body.limit ?? 10, afterMs });
          // senza auto richiesta si usa solo l'auto più recente: mai consigli da telemetrie miste
          if (!carName && sessions.length > 1) sessions = sessions.filter((s) => s.car === sessions[0].car);
          const usedCar = sessions[0]?.car ?? carName;
          const tyre = usedCar ? tyreClassOf(usedCar) : null;
          // BASE DI FABRICA (data/setup-defaults.json) qui NON serve: questo percorso
          // consiglia SOLO pressioni (dice nulla su camber/molle); il default-setup
          // lo carica il percorso BILANCIA sotto (2177) per mechanicExtraEdits.
          // (prima si leggeva il JSON a ogni chiamata API SENZA usarlo: lettura morta,
          //  audit 24/10)
          const advice = pressureAdvice(sessions, { target: body.target ?? tyre?.target });
          // consiglio specifico GARA: usa i giri della ronda corrente (o 10 di default)
          // e privilegia uscite lunghe; le qualifiche da sole sottraggono ~0.2 PSI
          const nodeNow = nodeById(ladder, state.node);
          const raceLaps = nodeNow?.calendar?.[Math.min(state.round ?? 0, (nodeNow?.calendar?.length ?? 1) - 1)]?.laps ?? 10;
          const raceAdvice = racePressureAdvice(sessions, { target: body.target ?? tyre?.target, raceLaps });
          /* STALENESS (Mauro 21/10, «il meccanico non sa quale setup era montato»):
             l'analisi usa l'ultima sessione COME È, senza sapere con quale setup era
             girata. Se il file .carsetup attivo è cambiato DOPO l'ultima telemetria,
             la base dati (giri, bump, camber, freni) parla del vecchio assetto:
             lo dichiariamo, così in GUI si sa di fidarsi a metà finché non girano 2 giri. */
          let stale = null;
          try {
            const savedSetupDir = paths.dataDirs?.[0] ?? '';
            if (savedSetupDir) {
              const cand = listSetups(savedSetupDir, { car: usedCar, track: trackKey ?? sessions[0]?.track, afterMs })
                .filter((s) => !s.name.includes('EVO-consigliato'));
              if (cand.length) {
                cand.sort((a, b) => statSync(b.file).mtimeMs - statSync(a.file).mtimeMs);
                const newestSetupMs = statSync(cand[0].file).mtimeMs;
                const lastLdMs = sessions[0]?.mtimeMs ?? 0;
                if (newestSetupMs > lastLdMs + 2000) {
                  stale = {
                    changed: true,
                    file: cand[0].name,
                    setupWhen: new Date(newestSetupMs).toLocaleString('it-IT'),
                    lastSession: sessions[0]?.whenLocal ?? null,
                  };
                }
              }
            }
          } catch { /* lo staleness non deve mai bloccare il pannello */ }
          // registro il consiglio (una sola volta per base dati: se la telemetria non è cambiata, non duplico)
          if (advice.ok && advice.suggestedStartPsi != null && sessions[0]) {
            const lastLog = readPressureLog(1)[0];
            const sig = (advice.basis?.when ?? '') + '|' + advice.suggestedStartPsi;
            if (!lastLog || ((lastLog.basisWhen ?? '') + '|' + lastLog.suggestedStartPsi) !== sig) {
              try {
                logPressureAdvice({
                  car: usedCar, track: sessions[0].track ?? trackKey ?? null,
                  suggestedStartPsi: advice.suggestedStartPsi, range: advice.range, target: advice.target,
                  basisKind: advice.basis?.kind ?? null, basisKindLabel: advice.basis?.kindLabel ?? null, basisWhen: advice.basis?.when ?? null,
                });
              } catch { /* il log non deve bloccare la risposta */ }
            }
          }
          return sendJson(res, 200, {
            ok: true, car: usedCar ?? null, track: trackKey ?? null,
            // trasparenza su DOVE è stata girata la telemetria usata per il consiglio:
            // se pista del round e pista della telemetria divergono, la GUI lo dice
            trackDisplay: board.trackDisplay ?? null, basisTrack: sessions[0]?.track ?? null,
            target: tyre ? tyre.target : (body.target ?? null), classLabel: tyre?.label ?? null,
            telemetryLaps: telemetryLapsFor(usedCar ?? carName ?? ''),
            sessions: sessions.map((s) => ({
              file: s.file, car: s.car, track: s.track, when: s.whenLocal, kindLabel: s.kindLabel, weather: s.weather, preset: s.preset, validLaps: s.validLaps, durationSec: s.durationSec, bestLapSec: s.bestLapSec, fuelPerLap: s.fuelPerLap, cold: s.coldPressures, hot: s.hotPressures, sus: s.sus, bump: s.bump, camberProxy: s.camberProxy,
              airTemp: s.airTemp, roadTemp: s.roadTemp, laps: s.laps,
            })),
            stale,
            raceLaps,
            advice,
            raceAdvice,
            // la lista colorata del box: stato per area dai dati veri,
            // «auto a punto» quando tutto è verde (Mauro 21/10)
            // il box sa della GARA (non dell'uscita): i giri del round vanno nel
            // checklist, così il consiglio benzina pianifica lo stint VERO — "5 giri"
            // fisso consigliava benzina metà gara per una gara da 10 (richiesta Mauro 24/10)
            checklist: sessions.length ? boxChecklist(sessions, { target: tyre ? tyre.target : (body.target ?? null), raceLaps }) : null,
          });
        }
        if (body.action === 'meccanico') {
          // il meccanico: consigli di setup per pista — base dal carattere della
          // pista + correzione dai dati veri dell'ultima sessione telemetrica
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const trackDisplay = body.track ?? board.trackDisplay ?? null;
          const TRACK = TRACK_INFO[trackDisplay] ?? Object.values(TRACK_INFO).find((t) => trkSame(t.name, trackDisplay)) ?? null;
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          let telem = null, sessFile = null;
          try {
            // senza filtro pista: la correzione telemetrica usa l'ultima sessione dell'auto
            // (come il grafico del giro) — con base pista dichiarata nel pannello
            const sess = collectSessions(root, paths.resultsDirs?.[0] ?? '', { car: carName, limit: 1, afterMs: state.createdAt ?? 0 })[0] ?? null;
            if (sess) { telem = sess; sessFile = sess.file; }
          } catch { /* senza telemetria la base resta pista-solo */ }
          const adv = setupAdvice(TRACK && { ...TRACK, car: carName }, telem && {
            bump: telem.bump, camberProxy: telem.camberProxy, lastPressures: telem.hotPressures,
          }, { laps: telem?.laps ?? null });
          /* -- IL CICLO D'APPRENDIMENTO (allievo.mjs, richiesta Mauro 21/10): --
           * il meccanico ora incassa gli esiti: il round di consigli chiusi con
           * una sessione più recente riceve il delta del giro migliore e la
           * generazione di oggi porta la storia su ogni campo (confermato/
           * perso/neutro), più il semaforo se sei peggio del best di sempre. */
          const lapsValidi = (telem?.laps ?? []).filter((l) => l.durationSec > 15);
          const bestLap = lapsValidi.length ? Math.min(...lapsValidi.map((l) => l.durationSec)) : null;
          let consigli = adv.consigli, semaforo = null, storie = null;
          // l'allievo lavora solo se la telemetria di riferimento è della STESSA
          // pista del pannello: un giro su un'altra pista non giudica questo setup
          const pistaOk = telem?.track && TRACK && (trkSame(TRACK.name, telem.track) || trkSame(TRACK.name, trackDisplay));
          if (carName && trackDisplay && bestLap != null && pistaOk) {
            registraRound({ carName, trackDisplay, advices: adv.consigli, sessFile, bestLap });
          }
          // il memo si legge SEMPRE (anche senza telemetria), il pannello
          // mostra storia del round e il migliore
          let mem = null;
          if (carName && trackDisplay) mem = memoOf(carName, trackDisplay);
          if (mem && bestLap != null && pistaOk) {
            const ann = annotaAdvice(consigli, mem);
            consigli = ann.consigli; storie = ann.storie;
            semaforo = semaforoAdvice({ best: mem.best, bestLap });
            if (semaforo) consigli.unshift(semaforo);
          }
          const allievo = mem ? {
            best: mem.best,
            rounds: mem.rounds.slice().reverse().map((r) => ({
              at: r.at, sessFile: r.sessFile, bestBefore: r.bestBefore, bestAfter: r.bestAfter,
              delta: r.delta, campi: [...new Set(r.advice.map((a) => a.campo))],
            })),
          } : null;
          return sendJson(res, 200, { ok: true, car: carName, track: trackDisplay, sessFile, tipo: adv.tipo, densita: adv.densita, consigli, storie, allievo, bestLap: bestLap != null ? Math.round(bestLap * 1000) / 1000 : null, hasTelem: !!telem });
        }
        if (body.action === 'stinti') {
          // analisi dei stint dalla telemetria REALE: blocco dei rifornimenti,
          // ritmo e carburante per stint, secondi AL LITRO misurati sui giri
          // veri (stinti.mjs) — la strategia prima del prossimo pit stop.
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          const pick = listMotecSessions(root, { car: carName, track: body.track ?? undefined, afterMs: state.createdAt ?? 0 })[0] ?? null;
          const out = pick ? stintsFromLd(pick.file, { refillLitri: Number.isFinite(body.refillLitri) ? body.refillLitri : undefined }) : null;
          if (!out) return sendJson(res, 200, { ok: false, hint: tr({ it: 'Nessuna telemetria MoTeC per questa auto: fai una sessione e EVO la salverà in Saved Games\\ACE\\MoTec.', en: 'No MoTeC telemetry for this car yet: run a session and EVO will save it to Saved Games\\ACE\\MoTec.' }) });
          return sendJson(res, 200, { ok: true, file: pick.name, car: pick.car, track: pick.track, ...out });
        }
        if (body.action === 'gomme') {
          // usura gomme dallo STESO .ld: degrado del ritmo, trend termico per
          // ruota, ruota più calda e slittamento di trazione (usura-gomme.mjs).
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          const pick = listMotecSessions(root, { car: carName, track: body.track ?? undefined, afterMs: state.createdAt ?? 0 })[0] ?? null;
          const out = pick ? tyreWearFromLd(pick.file) : null;
          if (!out) return sendJson(res, 200, { ok: false, hint: tr({ it: 'Nessuna telemetria MoTeC per questa auto: fai una sessione e EVO la salverà in Saved Games\\ACE\\MoTec.', en: 'No MoTeC telemetry for this car yet: run a session and EVO will save it to Saved Games\\ACE\\MoTec.' }) });
          return sendJson(res, 200, { ok: true, file: pick.name, car: pick.car, track: pick.track, ...out });
        }
        if (body.action === 'laptrace') {
          // grafico del giro: profilo SPEED/THROTTLE/BRAKE di un giro (e la
          // differenza allineata a distanza col giro di confronto) — stesso
          // slot telemetria della vista Setup, una sessione alla volta
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const trackKey = body.track ?? null; // senza pista esplicita: l'auto, TUTTE le sue piste
          const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
          let pick = null;
          if (body.file) pick = listMotecSessions(root, { car: carName ?? undefined, track: undefined, afterMs: state.createdAt ?? 0 }).find((s) => s.name === body.file) ?? null;
          if (!pick) pick = listMotecSessions(root, { car: carName, track: trackKey, afterMs: state.createdAt ?? 0 })[0] ?? null;
          if (!pick) return sendJson(res, 200, { ok: false, hint: tr({ it: 'Nessuna telemetria MoTeC per questa auto: fai una sessione e EVO la salverà in Saved Games\\ACE\\MoTec.', en: 'No MoTeC telemetry for this car yet: run a session and EVO will save it to Saved Games\\ACE\\MoTec.' }) });
          const trace = lapTrace(pick.file, { lap: body.lap, compare: body.compare, points: body.points });
          const a = trace ? analyzeLd(pick.file) : null;
          if (!trace) return sendJson(res, 200, { ok: false, hint: 'File MoTeC senza giri validi o senza canale SPEED: ' + pick.name });
          // elenco sessioni dell'auto per il SELETTORE (la più recente prima):
          // quando/data/pista + numero giri validi — il client ricade su/lui quando gira il select
          const allSessions = listMotecSessions(root, { car: carName, afterMs: state.createdAt ?? 0 }).slice(0, 30).map((s) => {
            let lapsN = 0;
            try { lapsN = (analyzeLd(s.file)?.validLaps) ?? 0; } catch { lapsN = 0; }
            return { file: s.name, track: s.track, when: new Date(s.mtime).toLocaleString('it-IT'), validLaps: lapsN };
          });
          return sendJson(res, 200, {
            file: pick.name, car: pick.car, track: pick.track,
            sessions: allSessions,
            laps: (a?.laps ?? []).filter((l) => l.durationSec > 15).map((l) => ({ lap: l.lap, durationSec: l.durationSec })),
            ...trace,
          });
        }
        if (body.action === 'motec') {
          // ultima sessione MoTeC per l'auto corrente (+ pista se indicata): benzina e pressioni vere
          const board = setupBoard(ladder, state);
          const carName = body.car ?? (board.rows[0]?.carName ?? null);
          const sessions = listMotecSessions(paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec'), { car: carName, track: body.track ?? board.trackDisplay ?? undefined });
          const alt = sessions.length ? null : listMotecSessions(join(paths.dataDirs?.[0] ?? '', 'MoTec'), { car: carName });
          const pick = (sessions.length ? sessions : alt)?.[0] ?? null;
          if (!pick) return sendJson(res, 200, { ok: true, found: false, hint: tr({ it: 'Nessuna telemetria MoTeC per questa auto: fai una sessione e EVO la salverà in Saved Games\\ACE\\MoTec.', en: 'No MoTeC telemetry for this car yet: run a session and EVO will save it to Saved Games\\ACE\\MoTec.' }) });
          const a = analyzeLd(pick.file);
          if (!a) return sendJson(res, 200, { ok: true, found: false, hint: 'File MoTeC non leggibile: ' + pick.name });
          const tyre = tyreClassOf(carName);
          const advice = (tyre && a.lastPressures) ? fourPsi({ cold: a.coldPressures?.LF ?? a.coldPressures?.RR, hot: a.lastPressures.LF ?? a.lastPressures.RR, target: tyre.target }) : null;
          return sendJson(res, 200, {
            ok: true, found: true,
            session: { file: pick.name, car: pick.car, track: pick.track, preset: presetOf(pick.name), durationSec: a.durationSec, validLaps: a.validLaps, airTemp: a.airTemp, roadTemp: a.roadTemp, sus: a.sus, bump: a.bump, camberProxy: a.camberProxy },
            fuelPerLap: a.fuelPerLap,
            coldPressures: a.coldPressures, hotPressures: a.lastPressures,
            laps: a.laps.map((l) => ({ lap: l.lap, durationSec: l.durationSec, fuelUsed: l.fuelUsed, pressures: l.pressures, tair: l.tair, surf: l.surf })),
            advice,
            target: tyre ? tyre.target : null,
          });
        }
        if (body.action === 'note') {
          const saved = setSetupNote(body.car, body.track ?? setupBoard(ladder, state).track, body.text);
          return sendJson(res, 200, { ok: true, note: saved, board: setupBoard(ladder, state) });
        }
        return sendJson(res, 200, setupBoard(ladder, state));
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }
    case 'testday': {
      // giornate di prove: rapporti che NON toccano la carriera + quaderno di calibrazione
      try {
        if (body.action === 'import-file') {
          const out = recordTestDay(ladder, paths, state, { importFile: body.file, trackNames: body.trackNames, allowAny: !!body.allowAny, rangeMin: body.rangeMin, rangeMax: body.rangeMax, note: body.note });
          return sendJson(res, 200, { ok: true, entry: out.entry, updated: !!out.updated, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
        }
        if (body.action === 'manual') {
          const out = recordTestDay(ladder, paths, state, { manual: { car: body.car, rangeMin: body.rangeMin, rangeMax: body.rangeMax, position: body.position, gridSize: body.gridSize, bestLap: body.bestLap, note: body.note } });
          return sendJson(res, 200, { ok: true, entry: out.entry, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
        }
        return sendJson(res, 200, { ok: true, log: testDayLog(30), calibration: calibrationSummary(ladder, state, { nodeId: body.nodeId ?? null }) });
      } catch (e) {
        return sendJson(res, e.code ? 409 : 500, { error: e.message, code: e.code, detail: e.detail });
      }
    }
    case 'hotlaps': {
      // quaderno dei giri liberi (data/hotlaps.json): elenco sessioni non-gara
      // catturate dal watcher + libro PB per auto+pista. Con 'record-file' si
      // registra a mano un vecchio file risultato (import del passato).
      try {
        if (body.action === 'record-file') {
          const out = recordHotlaps(ladder, paths, state, { file: String(body.file ?? '').trim(), since: 0 });
          const reg = out.registered[0] ?? null;
          return sendJson(res, 200, { ok: true, registered: out.registered.length, entry: reg, log: hotlapsLog(40) });
        }
        // le analisi della gita (26/10): numeri, curva di progresso — il delta
        // per settore lo fa il browser dai dati che già spedisce qui
        return sendJson(res, 200, { ok: true, log: hotlapsLog(40), stats: hotlapsStats(), progress: hotlapsProgress() });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
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
        {
          let liveTrack = null;
          try { if (await syncLiveReader() !== 'off') liveTrack = liveReader()?.snapshot?.()?.session?.track ?? null; } catch { /* live non disponibile: si decide senza */ }
          if (liveTrack) {
            if (trackName && !trkSame(liveTrack, trackName)) return sendJson(res, 200, { ok: false, track: trackName, liveTrack, hint: tr({ it: `Il gioco è su «${liveTrack}» ma la richiesta mira a «${trackName}»: non scrivo la copia «EVO-consigliato» su una pista diversa (in gioco la lista CARICA mostra solo auto + pista corrente). Aggiorna il pannello se la pista è cambiata.`, en: `The game is at «${liveTrack}» but the request targets «${trackName}»: I won't write the «EVO-consigliato» copy on a different track (in game the LOAD list shows only current car+track). Refresh the panel if the track changed.` }) });
            trackName = trackName || liveTrack;
          }
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
        if (trackName && setups[0]?.track && !trkSame(setups[0].track, trackName)) return sendJson(res, 200, { ok: false, track: trackName, foundTrack: setups[0].track, hint: tr({ it: `Nessun .carsetup per questa auto su «${trackName}» (ho trovato solo il base su «${setups[0].track}»): salvare UNA volta un setup in EVO su quella pista e riprova — la copia «EVO-consigliato» va accanto alla sua base, altrimenti il gioco non la mostra.`, en: `No .carsetup for this car at «${trackName}» (found the base only at «${setups[0].track}»): save a setup in EVO on that track once and retry — the «EVO-consigliato» copy goes next to its base, or the game won't show it.` }) });
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
        // SUGGERIMENTO dalle telemetrie vere (stessi motori del pannello Telemetria);
        // SENZA .ld: fallback LIVE — le pressioni a caldo DALLA SHARED MEMORY di EVO
        // (stai girando adesso? il consiglio arriva da quel giro, serve il target di classe)
        const motecRoot = join(savedDir, 'MoTec');
        const resDir = paths.resultsDirs?.[0] ?? join(savedDir, 'Results');
        let sessions = collectSessions(motecRoot, resDir, { car: carEff, track: trackName || undefined, limit: 8 });
        if (!sessions.length) sessions = collectSessions(motecRoot, resDir, { car: carEff, limit: 8 });
        const tyre = tyreClassOf(carEff);
        const raceAdvice = sessions.length ? racePressureAdvice(sessions, { target: tyre?.target ?? null, raceLaps: Number(body.raceLaps) || 10 }) : null;
        const advice = sessions.length ? pressureAdvice(sessions, { target: tyre?.target ?? null }) : null;
        let startPsi = raceAdvice?.raceStartPsi ?? advice?.suggestedStartPsi ?? null;
        let basis = raceAdvice?.basis?.kindLabel ?? advice?.basis?.kindLabel ?? (sessions.length ? 'telemetria' : null);
        let livePsi = null, liveHot = null;
        if (startPsi == null || !Number.isFinite(startPsi)) {
          // fallback LIVE: gira ora + pressioni a caldo esposte dal gioco (physics)
          livePsi = liveReader()?.last?.physics?.wheelPressure ?? null;
          const pOk = Array.isArray(livePsi) && livePsi.filter((v) => Number.isFinite(v) && v > 15).length >= 3;
          if (pOk && tyre?.target != null) {
            liveHot = livePsi.filter((v) => Number.isFinite(v) && v > 15);
            const hotAvg = liveHot.reduce((a, b) => a + b, 0) / liveHot.length;
            // la regola dei 4 PSI: nuova partenza = vecchia + (target − hot)
            const curPsi = Number(parseSetup(srcBuf).tires?.[0]?.pressure);
            const coldNow = Number.isFinite(curPsi) && curPsi > 10 ? curPsi : hotAvg - 4;   // stima termica se il file non la dichiara
            startPsi = Math.round((coldNow + (tyre.target - hotAvg)) * 10) / 10;
            basis = 'live (stai girando ora)';
          }
        }
        if (startPsi == null || !Number.isFinite(startPsi)) {
          return sendJson(res, 200, { ok: false, hint: tr({ it: 'Serve una base per la pressione: O scarica una telemetria valida (sessione con registrazione attiva), O fai un giro adesso con questa auto (consiglio DAI DATI LIVE del gioco).', en: 'A base lap is needed for pressure: either download valid telemetry (a session with recording on), or do a lap now with this car (advised from the game LIVE DATA).' }) });
        }
        const nTire = Math.max(0, cur.tires?.length ?? 4);
        const tires = [];
        for (let i = 0; i < nTire; i++) {
          const now = Number(cur.tires[i]?.pressure);
          tires.push(Math.abs(now - startPsi) < 0.05 ? {} : { pressure: Math.round(startPsi * 10) / 10 });
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
          raceLaps: raceAdvice?.raceLaps ?? (Number(body.raceLaps) >= 3 ? Number(body.raceLaps) : null),
        };
        const tKey = trackName || src.track || null;
        const TRACK = tKey ? (TRACK_INFO[tKey] ?? Object.values(TRACK_INFO).find((t) => trkSame(t.name, tKey))) : null;
        // base di fabbrica per la regola 'raddrizzo l'asimmetria' (21/10)
        let setupDefaults = null;
        try {
          const dRaw = JSON.parse(readFileSync(join(DATA_DIR, 'setup-defaults.json'), 'utf8'));
          setupDefaults = (carEff && dRaw[carEff]) ?? Object.entries(dRaw).find(([k]) => !k.startsWith('_') && carSame(k, carEff))?.[1] ?? null;
        } catch { /* facoltativa */ }
        const mech = mechanicExtraEdits({ cur, latest, trackInfo: TRACK, defaults: setupDefaults });
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
            before: { pressures: cur.tires.map((t) => t.pressure) },
            after: { pressures: dopo },
            extraChanges,
            adviceText: raceAdvice?.raceAdvice ?? advice?.advice ?? (liveHot ? `Consiglio DAI DATI LIVE: a caldo ora ${liveHot.map((v) => v.toFixed(1)).join('/')} PSI (media ${(liveHot.reduce((a, b) => a + b, 0) / liveHot.length).toFixed(1)}), target ${tyre?.target ?? '?'} PSI a caldo.` : ''),
          });
        }
        const dest = join(dirname(src.file), src.name + ' — EVO-consigliato.carsetup');
        const out = writeSetupCopy(srcBuf, dest, edits);
        const after = parseSetup(readFileSync(dest));
        return sendJson(res, 200, {
          ok: true, file: dest, fileShort: `${src.name} — EVO-consigliato.carsetup`,
          car: carEff, track: trackName || src.track, baseFile: src.file,
          startPsi, changes: out.changes,
          extraChanges,
          aero: { before: { heightRear: cur.aero?.heightRear ?? null, wingRear: cur.aero?.wingRear ?? null }, after: { heightRear: after.aero?.heightRear ?? null, wingRear: after.aero?.wingRear ?? null } },
          before: { pressures: cur.tires.map((t) => t.pressure) },
          after: { pressures: after.tires.map((t) => t.pressure) },
          adviceText: raceAdvice?.raceAdvice ?? advice?.advice ?? (liveHot ? `Consiglio DAI DATI LIVE: a caldo ora ${liveHot.map((v) => v.toFixed(1)).join('/')} PSI (media ${(liveHot.reduce((a, b) => a + b, 0) / liveHot.length).toFixed(1)}), target ${tyre?.target ?? '?'} PSI a caldo.` : ''),
          basis: basis ?? advice?.basis?.kindLabel ?? raceAdvice?.basis?.kindLabel ?? null,
          liveHot: liveHot ?? null,
        });
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
    case 'tracks': {
      // il libro delle piste: record personali e di sessione PER LAYOUT (tempi dai
      // file risultato, nomi e lunghezze ufficiali dal catalogo) + schede storiche
      let catalog = null;
      try { catalog = loadCatalog(paths); } catch { catalog = null; } // il catalogo non deve rompere il libro
      const book = trackBook(ladder, paths, state, { testdayFile: join(slotDataDir(), 'testdays.json'), catalog });
      return sendJson(res, 200, { ...book, next: nextTrackOf(ladder, state), driver: state.driver ?? null });
    }
    case 'cars': {
      // libro delle auto + Perf. index e varianti dal catalogo del server dedicato
      let catalog = null;
      try { catalog = loadCatalog(paths); } catch { catalog = null; }
      // economia reale delle serie (dal ladder): acquisto/noleggio del sedile, iscrizione, premio.
      // Se un'auto compare in più serie si tengono le condizioni migliori per il pilota
      // (spesa minima, premio massimo) e si elencano tutte le serie.
      const economy = {};
      const better = (cur, val, min = true) => {
        const v = Number.isFinite(Number(val)) ? Number(val) : null;
        if (v == null) return cur;
        if (cur == null) return v;
        return min ? Math.min(cur, v) : Math.max(cur, v);
      };
      for (const n of ladder.nodes ?? []) {
        for (const cid of n.cars ?? []) {
          const e = (economy[cid] ??= { buy: null, rent: null, entry: null, prize: null, series: [] });
          e.buy = better(e.buy, n.econ?.buy, true);
          e.rent = better(e.rent, n.econ?.rent, true);
          e.entry = better(e.entry, n.econ?.entry, true);
          e.prize = better(e.prize, n.econ?.prize, false);
          if (!e.series.includes(n.display)) e.series.push(n.display);
        }
      }
      const inGarage = (state?.garage?.cars ?? []).map((c) => c.carId);
      return sendJson(res, 200, { ...carsBook(ladder, { catalog }), economy, inGarage });
    }
    case 'challenge-accept': {
      const c = challengeFor(ladder, state);
      if (!c) return sendJson(res, 400, { error: tr({ it: 'Nessuna sfida disponibile per questa ronda.', en: 'No challenge available for this round.' }) });
      if (c.verdict) return sendJson(res, 400, { error: tr({ it: 'La sfida di questa ronda è già stata valutata.', en: 'This round\'s challenge has already been scored.' }) });
      acceptChallenge(state, c);
      persist(state);
      return sendJson(res, 200, { ok: true, challenge: c, header: viewHeader(ladder, state) });
    }
    case 'sponsor-accept': {
      const list = sponsorOffers(ladder, state);
      const wanted = Number(body.tier);
      const offer = list.find((o) => o.tier === wanted) ?? list[list.length - 1];
      if (!offer) return sendJson(res, 400, { error: tr({ it: 'Nessuna offerta di sponsor disponibile.', en: 'No sponsor offer available.' }) });
      acceptSponsor(state, offer);
      pushMessage(state, tr({ it: `Contratto sponsor firmato: ${offer.name}. ${offer.note}.`, en: `Sponsor contract signed: ${offer.name}. ${offer.noteEn ?? offer.note}.` }), 'money');
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'sponsor-decline': {
      declineSponsor(state);
      persist(state);
      return sendJson(res, 200, { ok: true, header: viewHeader(ladder, state) });
    }
    case 'review-export': {
      const seasons = reviewableSeasons(state);
      const wanted = Number.isFinite(Number(body.season)) && Number(body.season) > 0 ? Number(body.season) : seasons[0] ?? state.season;
      const rev = seasonReview(ladder, state, { season: wanted });
      const file = exportReview(rev);
      return sendJson(res, 200, { ok: true, file, season: wanted });
    }
    case 'flows': return sendJson(res, 200, { flows: recentFlows(40) });
    case 'season-end': {
      const node = nodeById(ladder, state.node);
      const played = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).length;
      if (played < node.calendar.length && !body.force) {
        return sendJson(res, 409, { error: tr({ it: `Stagione incompleta: ${played}/${node.calendar.length} gare disputate. Conferma per chiudere comunque.`, en: `Season incomplete: ${played}/${node.calendar.length} races run. Confirm to close anyway.` }), code: 'SEASON_INCOMPLETE' });
      }
      const result = seasonEnd(ladder, state);
      // chiuso il campionato: invito garantito al Gran Finale dei Campioni
      let finale = null;
      try { finale = maybeSpawnEvent(ladder, state, { seasonJustEnded: true }); } catch (e) { recordWarning('events.spawn', 'invito finale non generato', e?.message ?? null); }
      persist(state);
      const memNow = state.heritage?.active ?? null;
      return sendJson(res, 200, {
        ok: true,
        champion: result.champion,
        me: result.me,
        bonus: result.bonus,
        offers: result.offers.map((o) => ({ ...o, discipline: disciplineName(ladder, o.discipline) })),
        eventSpawned: finale ? { id: finale.id, theme: finale.theme.name, track: finale.trackDisplay } : null,
        memoryAssigned: memNow ? { title: memNow.title, titleEn: memNow.titleEn ?? null, ancestor: memNow.ancestor, relation: memNow.relation, relationEn: memNow.relationEn ?? null, era: memNow.era, series: memNow.series, objective: memNow.objective?.text ?? '', objectiveEn: memNow.objective?.en ?? null, inherit: memNow.inherit, carName: memNow.carName ?? null } : null,
        header: viewHeader(ladder, state),
      });
    }
    case 'browse': {
      // CERCATORE SU DISCO per i percorsi da configurare (cartella ACE, exe di gioco):
      // un dialog del sistema dal browser non restituisce il percorso scelto, quindi
      // lo costruiamo noi: l'endpoint elenca unità e sottocartelle di un percorso.
      // Paranoia standard: risponde SOLO a letture read-only, niente scrittura.
      const q = String(body.path ?? '').trim();
      let target = null, driveList = [];
      if (!q || q === 'root:') {
        // radice: lista unità Windows (A-Z che esistono) + home
        driveList = [];
        for (let c = 65; c <= 90; c++) {
          const d = String.fromCharCode(c) + ':\\';
          try { if (statSync(d).isDirectory()) driveList.push(d); } catch { /* unità assente */ }
        }
        const home = homedir();
        return sendJson(res, 200, { kind: 'root', drives: driveList, home, entries: [{ name: tr({ it: '🏠 Cartella utente (home)', en: '🏠 User folder (home)' }), path: home, up: false }] });
      }
      target = q;
      if (target.startsWith('drive:')) target = target.slice(6);
      // gating anti-fuga: solo percorsi assoluti windows/unix, niente UNC di rete
      if (!/^[a-zA-Z]:[\\/]/.test(target) && !target.startsWith('/')) return sendJson(res, 400, { error: 'Percorso non valido.' });
      if (target.startsWith('//') || (target[0] === '\\' && target[1] === '\\')) return sendJson(res, 400, { error: 'Percorso di rete non consentito.' });
      let st; try { st = statSync(target); } catch { return sendJson(res, 404, { error: `Percorso non trovato: ${target}` }); }
      if (!st.isDirectory()) return sendJson(res, 400, { error: tr({ it: "Serve una cartella, non un file. Se cercavi l'exe di gioco: entra prima nella cartella e poi selezionalo.", en: 'A folder is needed, not a file. If you were looking for the game exe: enter the folder first, then pick it.' }) });
      const entries = [];
      try {
        for (const name of readdirSync(target)) {
          // sappiamo nascondere le cartelle di sistema che non servono a nessuno qui
          if (['$Recycle.Bin', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData'].includes(name)) continue;
          const full = join(target, name);
          let s2; try { s2 = statSync(full); } catch { continue; }
          if (s2.isDirectory()) entries.push({ name, path: full, up: false, dir: true });
        }
      } catch { return sendJson(res, 403, { error: 'Cartella non leggibile (permessi).' }); }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      // "salta su" di uno: prendo la cartella superiore
      const parent = dirname(target);
      const canUp = parent !== target;
      return sendJson(res, 200, { kind: 'dir', path: target, parent: canUp ? parent : null, entries });
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
    case 'slot-launch': {
      // click su uno slot in Impostazioni: lancia il lanciatore del pilota
      // (pilota-N.cmd nella cartella del progetto). Paranoia sui parametri:
      // solo 1..3 letterali (niente troncamenti: 9 rifiutata, non "3") e
      // verifica che il file esista, per non far eseguire nulla a scelta.
      const n = Math.floor(Number(body.slot));
      if (![1, 2, 3].includes(n)) return sendJson(res, 400, { error: 'Slot non valido: i lanciatori sono 1, 2, 3.' });
      const launcher = join(PROJECT, `pilota-${n}.cmd`);
      if (!existsSync(launcher)) return sendJson(res, 400, { error: tr({ it: `Lanciatore non trovato: pilota-${n}.cmd (è nella cartella del programma?)`, en: `Launcher not found: pilota-${n}.cmd (is it in the program folder?)` }) });
      // se lo slot è quello di QUESTA sessione, non riavviamo niente: solo il suo browser
      if (n === SLOT) {
        const addr = `http://127.0.0.1:${PORT}`;
        import('node:child_process').then(({ spawn }) => {
          // URL senza spazi: start lo esegue come command e apre il browser — niente titolo
          if (process.platform === 'win32') spawn('cmd', ['/c', 'start', addr], { detached: true, stdio: 'ignore' }).unref();
          else spawn('xdg-open', [addr], { detached: true, stdio: 'ignore' }).unref();
        });
        return sendJson(res, 200, { ok: true, note: tr({ it: 'Slot già attivo: apro solo il browser.', en: 'Slot already active: opening just the browser.' }) });
      }
      import('node:child_process').then(({ spawn }) => {
        // il titolo (con spazi → Node lo quota) resta il primo quoted arg di start:
        // il vuoto "" si perde e start leggerebbe 'EVO Pitwall Slot 3' come file (24/10)
        spawn('cmd', ['/c', 'start', 'Slot ' + n, launcher], { detached: true, stdio: 'ignore', cwd: PROJECT }).unref();
      });
      return sendJson(res, 200, { ok: true, note: tr({ it: `Lanciato pilota-${n}.cmd: si apre la sua carriera sulla sua porta (${8641 + n}). Questa finestra resta quello che è (slot ${SLOT}).`, en: `Launched pilota-${n}.cmd: its career opens on its own port (${8641 + n}). This window stays as it is (slot ${SLOT}).` }) });
    }
    default:
      return sendJson(res, 404, { error: `Azione "${action}" non prevista.` });
  }
}

// porta robusta e PER SLOT: slot 1 → 8642, slot 2 → 8643, slot 3 → 8644.
// Così si possono tenere aperti più piloti insieme, ognuno con la sua carriera
// e il suo watcher, senza che un'istanza agganci la porta di un'altra.
// "--port N" resta l'override manuale (senza --port argv[idx+1] sarebbe undefined/NaN).
const _portIdx = process.argv.indexOf('--port');
const PORT_SLOT = 8641 + SLOT; // 8642/8643/8644
let PORT = Number(_portIdx > 0 ? process.argv[_portIdx + 1] : NaN) || Number(process.env.ACE_UI_PORT) || PORT_SLOT;
const OPEN = process.argv.includes('--open');

/* ------------------------------------------------------------------ */
/* watcher: import automatico quando la gara termina                   */
/* ------------------------------------------------------------------ */
/* Polling leggero: quando il gioco è in Race e la pista combacia con
   la ronda attesa, monitora il flag "gara finita" (checkered o ritorno
   al menu col risultato nei Results). Appena un risultato compatibile
   appare nei Results, lo deposita in carriera con la logica standard. */

const watcher = {
  timer: null,
  busy: false,
  armed: false,      // vero quando siamo dentro la gara giusta
  armedAt: null,     // quando ci si è armati (per il filtro "solo file nuovi")
  sinceImport: null, // limite temporale per l'import dopo la gara
  seenNonRace: false,// già avvisato che la sessione vista non è la gara
  racedEnd: false,   // gara vista e terminata: cerca il file
  lastMsg: null,
  events: [],        // ultimi eventi per la GUI
  push(msg, kind = 'info') {
    this.lastMsg = { msg, kind, at: new Date().toISOString() };
    this.events.unshift(this.lastMsg);
    this.events = this.events.slice(0, 5);
  },
};

/* chiave stabile della ronda attesa: il recupero automatico smette di riprovare
   una volta segnalata come duplicata, senza riprovarla a ogni giro del tick */
function pendingKeyOf(p) {
  try { return `${p.node}#${p.round}#${p.startedAt}`; } catch { return null; }
}

function watcherTick() {
  if (watcher.busy) return;
  watcher.busy = true;
  (async () => {
    try {
      await syncLiveReader(); // il watcher vive senza browser aperto — ma solo nella modalità scelta
      const { ladder, paths } = context();
      if (!existsSync(SAVE_FILE)) return;
      const state = requireState();
      const snap = liveReader().snapshot();

      /* GIRI LIBERI (24/10, Mauro: «se l'utente volesse semplicemente girare
         per realizzare giri veloci»: i risultati NON-gara che EVO scrive in
         Results non finiscono più nel nulla — ogni sessione di prove si
         registra da sola nel quaderno data/hotlaps.json (dedup per nome,
         MAI carriera / soldi / punti). Prima spazzata = catch-up di tutte le
         sessioni di prove già sul disco; poi ogni giro guarda solo i nuovi.
         Un errore qui non tocca l'import della carriera. */
      if (!watcher.hotlapsBusy) {
        watcher.hotlapsBusy = true;
        try {
          const h = hotlapSweep(ladder, paths, state, { since: watcher.hotlapsSince ?? 0 });
          watcher.hotlapsSince = Date.now();
          if (h.registered.length) {
            const last = h.registered[0];
            watcher.push(h.registered.length === 1
              ? `Giro libero nel quaderno: ${last.carPretty ?? last.car} @ ${last.trackPretty ?? last.track} — best ${last.bestLap}${last.isPB ? ' (PB!)' : ''}`
              : `${h.registered.length} giri liberi nel quaderno (ultimo: ${last.carPretty ?? last.car} @ ${last.trackPretty ?? last.track}${last.bestLap ? ` — best ${last.bestLap}` : ''}).`, 'good');
          }
        } catch (e) {
          recordWarning('hotlaps', 'spazzata giri liberi fallita', e.message);
        } finally {
          watcher.hotlapsBusy = false;
        }
      }

      if (!snap.game) {
        if (watcher.armed) {
          // chiuso il gioco mentre eravamo in gara: la gara è finita lo stesso
          watcher.armed = false;
          watcher.seenNonRace = false;
          watcher.sinceImport = (watcher.armedAt ?? Date.now()) - 60 * 1000;
          watcher.racedEnd = true;
          watcher.push('Gioco chiuso in gara: cerco il risultato nei file del gioco…', 'info');
        } else if (watcher.racedEnd) {
          watcher.push('Gioco chiuso.', 'info');
        }
        watcher.seenNonRace = false;
        if (!watcher.racedEnd) return;
        // EVO chiuso MA la gara è appena finita: il file dei Risultati è già
        // lì — si prosegue all'import qui sotto senza aspettare la riapertura
        // del gioco (24/10: il risultato restava appeso finché EVO
        // non ripartiva, e la pagina non si aggiornava mai da sola).
      }

      // EVO chiuso: nessuna sessione — detection inerte, l'import qui sotto basta
      const g = snap.session ?? {};
      const player = snap.player ?? {};
      const pending = state.pending;
      const node = pending ? nodeById(ladder, pending.node) : nodeById(ladder, state.node);
      const rnd = pending ? node.calendar[pending.round] : node.calendar[state.round];
      const expectedTrack = rnd?.track ?? null;
      // "Donington Park" (gioco) e "donington_park" (ladder) devono combaciare:
      // si eguagliano spazi/underscore e si scarta l'evento quando il game mode
      // mostra la pista senza layout ("Donington Park GP"), non la pista attesa
      const normTrack = (s) => norm(s).replace(/[_-]+/g, ' ').replace(/\s+gp$/,'').replace(/\s+/g, ' ').trim();
      const trackOk = g.track && expectedTrack && (
        normTrack(g.track).includes(normTrack(expectedTrack)) || normTrack(expectedTrack).includes(normTrack(g.track))
      );
      // EVENTO SPECIALE: quando c'è un invito accettato la gara da incassare è
      // quella dell'evento, su una pista DIVERSA da quella del round di carriera.
      // La pista attesa diventa quella dell'evento: senza questo l'armî della
      // gara evento non avveniva mai e il risultato andava cliccato a mano.
      const evActive = (() => { const ev = ensureEvents(state); const a = ev.active; return (a?.acceptedAt) ? a : null; })();
      const evTrack = evActive ? eventTrackReal(evActive) : null;
      const evTrackOk = Boolean(evActive && g.track && evTrack && (
        normTrack(g.track).includes(normTrack(evTrack)) || normTrack(evTrack).includes(normTrack(g.track))
      ));

      /* Nel "weekend di gara" EVO etichetta prove/qualifica come TimeAttack/Practice:
         la gara vera si riconosce dal nome ("Race"/"Gara") o dal numero di giri
         prefissato (le sessioni a tempo non ce l'hanno). Copre entrambe le modalità. */
      const raceish = g.type === 'Race'
        || /race|gara/i.test(String(g.name ?? ''))
        || (Number(player.lapsTotal) > 0 && Number(player.lapsTotal) < 100);

      if (snap.live && trackOk && !raceish && !watcher.armed && !watcher.racedEnd && !watcher.seenNonRace) {
        watcher.seenNonRace = true;
        watcher.push(`Vedo ${g.track}: ${g.name ?? g.type} (prove/qualifica). Registro solo quando inizia la gara.`, 'info');
      }

      if (snap.live && (evTrackOk || trackOk) && raceish) {
        if (!watcher.armed) {
          watcher.armed = true;
          watcher.armedAt = Date.now();
          watcher.racedEnd = false;
          watcher.seenNonRace = false;
          watcher.expectEvent = evTrackOk; // se poi corri quella di carriera il flag torna falso al prossimo arm
          watcher.push(evTrackOk
            ? `Gara dell'evento rilevata: ${g.track} ${g.layout ?? ''}. Registrerò il risultato dell'evento da solo.`
            : `Gara di carriera rilevata: ${g.track} ${g.layout ?? ''}. Sto registrando.`, 'good');
        }
      } else if (watcher.armed && ((!snap.live && !snap.paused) || !(evTrackOk || trackOk))) {
        // usciti dalla gara armata (menu, schermata risultati, gioco chiuso):
        // la PAUSA non conta come fine gara — restiamo armati
        watcher.armed = false;
        watcher.seenNonRace = false;
        watcher.sinceImport = (watcher.armedAt ?? Date.now()) - 60 * 1000;
        watcher.racedEnd = true;
        watcher.push('Gara terminata: cerco il risultato nei file del gioco…', 'info');
      }

      if (watcher.racedEnd) {
        // dai al gioco il tempo di scrivere il file risultato, poi importalo
        if (!watcher.wait) watcher.wait = Date.now();
        if (Date.now() - watcher.wait < 8000) return;
        try {
          // in coda con le richieste API: nessuno sovrascrive lo state dell'altro
          const out = await serialize(async () => {
            // EVENTO SPECIALE (richiesta Mauro 23/10: niente più click a mano):
            // con un invito accettato il risultato si regista da solo dal file,
            // posizione ufficiale e penalty incluse. Il modulo a mano resta come riserva.
            const evAuto = watcher.expectEvent
              ? autoFinishEventFromFile(ladder, state, { paths, sinceMs: (watcher.armedAt ?? Date.now()) - 10 * 60 * 1000 })
              : null;
            if (evAuto === null) {
              const out = await doImport(ladder, paths, state, { allowAny: false, force: false, since: watcher.sinceImport ?? null });
              persist(state);
              return { career: out };
            }
            if (evAuto.waiting) return { waiting: evAuto.waiting };
            persist(state);
            return { event: evAuto };
          });
          if (out?.waiting) {
            // il gioco non ha ancora scritto un file leggibile: si rimarta, con limite
            watcher.tries = (watcher.tries ?? 0) + 1;
            if (watcher.tries > 20) {
              watcher.racedEnd = false;
              watcher.wait = null;
              watcher.tries = 0;
              watcher.push('Risultato della gara speciale non ancora leggibile: chiudilo a mano dal pannello Eventi (Posizione d\'arrivo + Registra il risultato).', 'warn');
            }
            return;
          }
          watcher.tries = 0;
          watcher.racedEnd = false;
          watcher.wait = null;
          watcher.expectEvent = false; // incassata: pronti per la prossima
          watcher.importSeq = (watcher.importSeq ?? 0) + 1; // la GUI se ne accorge e si ricarica da sola
          if (out?.event) {
            const r = out.event.result ?? {};
            watcher.push(r.won
              ? `🏆 ${r.position === 1 ? 'EVENTO VINTO' : 'Evento chiuso P' + r.position} — ${r.carName ? r.carName + ' in vetrina! ' : ''}${r.money ? `+${r.money} €` : ''}${r.rep ? ` · +${r.rep} rep` : ''} — registrato da solo${out.event.file ? ` (${out.event.file})` : ''}.`
              : `Evento chiuso P${r.position}${r.money ? `, +${r.money} €` : ''}${r.rep ? `, +${r.rep} rep` : ''} — registrato da solo.`, r.won ? 'good' : 'info');
          } else {
            const c = out?.career ?? out;
            watcher.push(c.duplicate
              ? `Import ignorato: ${c.node} R${c.round} era già in carriera (nessun doppio premio).`
              : `RISULTATO IMPORTATO: ${c.node} R${c.round} — ${c.entry.dsq ? 'squalifica' : c.entry.dnf ? 'ritiro' : 'P' + c.entry.position}${c.entry.penalty && !c.entry.dnf && !c.entry.dsq ? ` (penalità ${c.entry.penalty})` : ''} · +${c.entry.points} pt · +${c.entry.prize} €`, (out?.career ?? out).duplicate ? 'warn' : 'good');
          }
        } catch (e) {
          // niente risultati ancora scritti: riprova al prossimo giro per un po', poi molla
          if (!watcher.tries) watcher.tries = 0;
          watcher.tries += 1;
          if (watcher.tries > 20) {
            watcher.racedEnd = false;
            watcher.wait = null;
            watcher.tries = 0;
            watcher.push(`Nessun risultato importabile trovato (${e.message.slice(0, 80)}). Importa a mano dai Risultati.`, 'warn');
          }
        }
      } else if (!watcher.armed && state?.pending?.startedAt && !(watcher.retroDup === pendingKeyOf(state.pending))) {
        /* RECUPERO AUTOMATICO (24/10 — Mauro: «finita la gara, la UI non si
           aggiorna da sola»): gara finita MENTRE il watcher non guardava
           (server ripartito a gara in corso, lettore live fuori, EVO già al
           menu) → nessun arm → l'import non partiva né mai il bump della seq
           che fa ricaricare la pagina. Qui si incassa da solo ciò che combacia:
           la stessa strada del bottone «importa» con le reti di sempre (match
           della pista attesa, registro anti-doppioni, backup automatico) ma la
           finestra temporale STRETTA (strict): niente file vecchie a pista
           uguale (lezione Monza del 20/10). Dopo l'incasso il pending va via e
           la GUI, al prossimo giro, vede il nuovo importSeq e si ricarica da solino. */
        const pendKey = pendingKeyOf(state.pending);
        try {
          const out = await serialize(async () => {
            const st = requireState();
            const o = await doImport(ladder, paths, st, { allowAny: false, force: false, since: st.pending?.startedAt ?? null, strict: true });
            persist(st);
            return { career: o };
          });
          const c = out?.career ?? out;
          if (c?.duplicate) {
            // già incassata (registro anti-doppioni): niente bump della seq
            // (la GUI non deve ricaricarsi a ogni giro) e si smette di
            // riprovare finché la ronda resta la stessa.
            watcher.retroDup = pendKey;
          } else {
            watcher.retroDup = null;
            watcher.importSeq = (watcher.importSeq ?? 0) + 1; // la GUI si ricarica da sola
            watcher.push(c?.node
              ? `RISULTATO IMPORTATO (recuperato da solo): ${c.node} R${c.round} — ${c.entry?.dsq ? 'squalifica' : c.entry?.dnf ? 'ritiro' : 'P' + c.entry?.position} · +${c.entry?.points} pt · +${c.entry?.prize} €`
              : 'Risultato della gara recuperato e incassato da solo.', 'good');
          }
        } catch (e) {
          // nessun file combaciante = la norma fuori gara (prove, gare private):
          // silenzio; un guasto vero va nel diario degli errori, una volta sola
          if (!['NO_CANDIDATE', 'PLAYER_NOT_FOUND', 'TRACK_MISMATCH'].includes(e.code)) {
            const msg = `Recupero automatico non riuscito: ${String(e?.message ?? e).slice(0, 110)}`;
            if (watcher.lastMsg?.msg !== msg) {
              recordWarning('watcher.retro', 'recupero automatico non riuscito', e?.message ?? String(e));
              watcher.push(msg, 'warn');
            }
          }
        }
      }
    } catch (e) {
      const msg = `Watcher: ${e?.message ?? e}`;
      if (watcher.lastMsg?.msg !== msg) watcher.push(msg, 'warn');
    }
    finally { watcher.busy = false; }
  })();
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Le richieste API si mettono in coda: ogni azione lavora su una fotografia dello
// state caricata dal file. Senza coda, un'azione lenta (es. "race" che attende
// isGameRunning/launch) può sovrascrivere con il suo state vecchio un import
// appena finito dal watcher — e la gara sparirebbe dal salvataggio.
let _apiChain = Promise.resolve();
// RICORDA-BUCHI ACQUA (26/10, report Mauro: «la finestra dos è un fiume»):
// l'avviso come Jest di sblocco della fila è UTILE UNA VOLTA — quando un'azione
// diventa la nuova testa appesa, non ad ogni poll live della GUI (che a colpa
// del disco lento arriva lì da solo). Per la STESSA azione ripeto il messaggio
// solo dopo 5 minuti di silenzio in console: lo sblocco della fila LA FA
// puntuto, non si smette di farlo funzionare.
const _codaUltimoAvviso = new Map(); // label → Date.now() del log mostrato

function serialize(task, label = 'azione') {
  const run = _apiChain.then(task, task);
  // GUARDIANO DELLA CODA (24/10, bug slot 3): la fila si sblocca da sola anche
  // se l'azione in testa resta appesa a un'attesa infinita. L'azione dormigliona
  // continua in sottofondo (la sua risposta, se un giorno arriva, va guardata da
  // sendJson — niente doppie scritture), ma il server non resta più muto: le
  // richieste dopo di lei proseguono e il browser riceve sempre un verdetto.
  _apiChain = Promise.race([
    run.catch(() => {}),
    sleep(API_TASK_TIMEOUT_MS).then(() => {
      const VEDI_OGNI = 5 * 60 * 1000; // 5 min per ETICHETTA: niente fiume in console
      const scaduto = Date.now() - (_codaUltimoAvviso.get(label) ?? 0) >= VEDI_OGNI;
      if (scaduto) {
        _codaUltimoAvviso.set(label, Date.now());
        console.log(`[coda] «${label}» ferma da ${Math.round(API_TASK_TIMEOUT_MS / 1000)}s: sblocco la fila (l'azione continua in sottofondo).`);
      }
      return null;
    }),
  ]).then(() => {}, () => {});
  return run;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) {
      if (!requestFromLocalBrowser(req, PORT)) {
        return sendJson(res, 403, { error: 'Richiesta rifiutata: origine non locale (Host/Origin non riconosciuti).' });
      }
      if (req.method === 'POST') {
        const ct = String(req.headers['content-type'] ?? '');
        const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
        if (hasBody && !ct.includes('application/json')) {
          return sendJson(res, 415, { error: 'Le API parlano solo application/json.' });
        }
      }
      const action = url.pathname.slice('/api/'.length);
      let body;
      try { body = req.method === 'POST' ? await readBody(req) : {}; }
      catch (e) {
        if (e instanceof BodyTooLarge) return sendJson(res, 413, { error: 'Richiesta troppo grande.' });
        throw e;
      }
      // il CONTESTO non fa schioffare il cruscotto: al PRIMO AVVIO senza cartella
      // dati EVO resolvePaths lancia, e sotto ogni API sparisce. In quel caso degradi
      // con paths null — il wizard (/api/wizard) è lì per sistemare il percorso.
      const t0 = Date.now();
      const out = await Promise.race([
        serialize(() => {
          /* Lingua dichiarata dal BROWSER in ogni richiesta POST (campo 'lingua',
             aggiunto in core.js 28/10): si applica QUI dentro la coda, non nella
             readBody — che gira a monte e si vede sovrascrivere dai polling
             intermedi prima che la task in fila giri davvero. Ogni richiesta
             parla con la sua lingua dalla prima all'ultima riga: discipline,
             box tips e ingegnere seguono la GUI anche se evo.config.json dice
             altro. POST senza 'lingua' (test, script, uiapp) tornano alla
             lingua del config; le GET ereditano la corrente (per l'adozione al
             primo avvio, 24/10, che cammina con /api/lang GET). */
          if (!hasEnvOverride()) {
            if (body.lingua === 'en' || body.lingua === 'it') setLang(body.lingua);
            else { const L = configLang(); if (L) setLang(L); } // default: la lingua del config, SENZA effetti collaterali
          }
          let context0;
          try { context0 = context(); }
          catch (e) { context0 = { ladder: loadLadder(), paths: null, pathsError: e.message }; }
          return api(context0, req, res, action, body);
        }, action),
        sleep(API_HTTP_TIMEOUT_MS).then(() => ({ __httpTimeout: true })),
      ]);
      // log SOLO delle azioni lente (il polling LIVE gira ogni ~2s: la finestra
      // DOS resta leggibile) — le colpe si leggono in due righe
      if (Date.now() - t0 > 300) console.log(`[api] ${action} ← ${Date.now() - t0}ms`);
      if (out?.__httpTimeout) {
        console.log(`[api] ${action} NON ha risposto entro ${Math.round(API_HTTP_TIMEOUT_MS / 1000)}s (in stallo).`);
        return sendJson(res, 504, { error: tr({
          it: `L'azione «${action}» non ha risposto entro ${Math.round(API_HTTP_TIMEOUT_MS / 1000)}s: era in stallo, riprova. La finestra nera del server dice quale azione è ferma.`,
          en: `The action “${action}” did not answer within ${Math.round(API_HTTP_TIMEOUT_MS / 1000)}s: it stalled, try again. The server's black console shows which action is stuck.`,
        }) });
      }
      return out;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const file = join(GUI_DIR, 'index.html');
      if (!existsSync(file)) { res.writeHead(500); return res.end('gui/index.html mancante'); }
      return serveStatic(req, res, file, 'text/html; charset=utf-8');
    }
    const safe = url.pathname.replace(/\.\./g, '').replace(/^\/+/, '');
    const file = join(GUI_DIR, safe);
    const rel = relative(GUI_DIR, file);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel) &&
        serveStatic(req, res, file, MIME[extname(file)] ?? 'application/octet-stream')) return;
    res.writeHead(404); res.end('non trovato');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    // GUARDIA ANTI-DOPPIO SERVER (28/10 sera — il doppione della mattina
    // finì sulla 8645): riconoscere il server NOSTRO anche quando l'API
    // non risponde ok. Quattro casi:
    //   1. /api/watcher ok → build attuale viva: aggancio (browser) ed esci;
    //   2. /api/watcher NON-ok (404/405…) → HTTP c'è ma l'endpoint no:
    //      chiedo la radice e se porta il nostro marchio («EVO Pitwall»,
    //      build precedente) esci — MAI occupare un'altra porta;
    //   3. il fetch solleva (reset, socket chiuso) → stessa verifica alla
    //      radice prima di dichiararla porta di stratola;
    //   4. niente di nostro (echo di radice straniero) → la porta di
    //      riserva, ora COL MESSAGGIO: prima scivolava in silenzio ed era
    //      proprio la nascita silenziosa del doppione.
    const radice = async () => {
      try { const g = await fetch(`http://127.0.0.1:${PORT}/`); return g.ok ? (await g.text()) : ''; }
      catch { return ''; }
    };
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/watcher`, { method: 'POST' });
      if (!r.ok) {
        const html = await radice();
        if (!html.includes('EVO Pitwall')) throw new Error('porta di altro software');
      }
      const addr = `http://127.0.0.1:${PORT}`;
      console.log(`\n  Il tool è già aperto su ${addr}.`);
      console.log(`  Apro solo il browser — nessuna seconda istanza (il watcher è unico).\n`);
      if (OPEN) {
        const { spawn } = await import('node:child_process');
        // URL senza spazi: start lo esegue come command e apre il browser — niente titolo
        if (process.platform === 'win32') spawn('cmd', ['/c', 'start', addr], { detached: true, stdio: 'ignore' }).unref();
        else spawn('xdg-open', [addr], { detached: true, stdio: 'ignore' }).unref();
      }
      process.exit(0);
    } catch {
      try {
        const html = await radice();
        if (html.includes('EVO Pitwall')) {
          console.log(`\n  Il tool (build precedente) è già aperto su http://127.0.0.1:${PORT}.`);
          console.log(`  Apro quello e chiudo qui — nessun doppione sul canale comando.\n`);
          if (OPEN) {
            const { spawn } = await import('node:child_process');
            if (process.platform === 'win32') spawn('cmd', ['/c', 'start', `http://127.0.0.1:${PORT}`], { detached: true, stdio: 'ignore' }).unref();
            else spawn('xdg-open', [`http://127.0.0.1:${PORT}`], { detached: true, stdio: 'ignore' }).unref();
          }
          process.exit(0);
        }
      } catch { /* niente radice leggibile: si segue sulla via di riserva */ }
      // porta occupata da altro software: prova la successiva — a voce, non
      // in silenzio (il doppione della 8645 nacque proprio qui zitto)
      console.log(`  Porta ${PORT} occupata da un altro programma: provo la ${PORT + 1}.`);
      if (PORT < 8642) { PORT += 1; server.listen(PORT, '127.0.0.1'); return; }
      if (PORT < 8655) { PORT += 1; server.listen(PORT, '127.0.0.1'); return; }
    }
  }
  console.error(`\n  Impossibile avviare l'interfaccia: ${e.message}`);
  console.error(`  Se un'altra finestra del tool è già aperta, usa quella.`);
  process.exit(1);
});

try { appEnv(); } catch { /* percorso sistemabile dal wizard */ } // lingua salvata: subito valida
server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`\n  EVO Pitwall — interfaccia grafica   [slot ${SLOT} di 3]`);
  console.log(`  ${addr}  (tieni questa finestra aperta; Ctrl+C per chiudere)`);
  console.log(`  Watcher import automatico: attivo (deposita il risultato quando la gara finisce)\n`);
  if (OPEN) {
    import('node:child_process').then(({ spawn }) => {
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', addr], { detached: true, stdio: 'ignore' }).unref();
      else spawn('xdg-open', [addr], { detached: true, stdio: 'ignore' }).unref();
    });
  }
});

// il watcher parte solo quando il server è davvero in ascolto (prima il primo
// tick poteva scattare prima del listen)
setInterval(watcherTick, 4000);
// la VOCE DEL PITWALL parte da qui: primo giro dopo il listen (prima il
// payload poteva scattare mentre il server era ancora tenuto in gola), ogni
// 4 s — stesso battito del monitor e del cruscotto. MAI senza "unfref" dal
// 29/10 sera: un interval unref può restare AFFAMATO nel loop (la prova:
// 57 minuti di server vivo, zero scatti in log, mentre il tick qui accanto
// a watcherTick non unref'ed t batteva regolarmente) — e con la radio che
// tace proprio quando serve.
// BATTITO DI AVVIO della voce (29/10, diagnostica della muta): una riga
// nel registro al boot dice CHE CODICE gira davvero e da chi è parlato
// (senza questo, server vecchio + codice nuovo su disco si confondevano
// con «muta senza errori»).
logaVoce({ evento: 'SERVER VOCE PRONTO', pid: process.pid, build: 'voce-ge 29/10' });
/* VIGILANTE DEL TICK VOCE (29/10 sera, la gara muta delle 10:47): il registro
   mostra un tick vivo all'avvio e poi NULLA per l'intera gara mentre il server
   rispondeva regolarmente (il loop vivо somministrava le API) — il tick era
   APPESO da qualche parte (primo await sospetto) e non si sa dove. Il vigilante
   non serve saperlo: se il tick non finisce per 15 s riparte da solo e lo
   scrive; ogni 60 s una riga STATO col quadro completo (età del tick, snapshot,
   riparti) — la prossara gara muta non sarà più indovinare. */
let _voceInterval = null;
let _voceLastRiparto = 0, _voceLastStato = 0, _voceRipartiN = 0;
function avviaTickVoce() {
  clearInterval(_voceInterval);
  _voceInterval = setInterval(copilotaServerTick, 4000);
}
setTimeout(() => { copilotaServerTick(); avviaTickVoce(); }, 4000);   // interval REFED: la voce non resta mai affamata
setInterval(() => {                                                  // vigilante: REFED anche lui
  if (!voceServerAttiva() || !_voceTickAt) return;
  const ora = Date.now();
  const bloccatoDaMs = ora - _voceTickAt;
  if (bloccatoDaMs > 15000 && ora - _voceLastRiparto > 60000) {
    _voceLastRiparto = ora; ++_voceRipartiN;
    logaVoce({ evento: 'TICK BLOCCATO — ripartito', bloccatoDaMs, ripartiN: _voceRipartiN });
    avviaTickVoce();
  }
  if (ora - _voceLastStato > 60000) {
    _voceLastStato = ora;
    try {
      const s = liveReader().snapshot();
      logaVoce({ evento: 'STATO', tickEtaMs: bloccatoDaMs, tickN: _voceTickN, ripartiN: _voceRipartiN,
        paginaPingMs: _pingVocePagina.at ? ora - _pingVocePagina.at : null, paginaPingOn: _pingVocePagina.at ? _pingVocePagina.on : null,
        game: s?.game ?? null, live: s?.live ?? null, sessionType: s?.session?.type ?? null });
    } catch { /* il vigilante non deve rompere il server */ }
  }
}, 5000);
// Auto-riparazione: un giro del dottore all'avvio e poi ogni 10 minuti (con la
// cache delle scansioni, e solo se la carriera esiste e l'auto-riparazione è ON
// — si può spegnere da Impostazioni → Manutenzione). Silence se è tutto pulito.
// AUDIT FREEZE 23/10: lo scavo sincrono non sta più A IMPORT (prima eseguiva
// ancora prima del listen: il primo click della GUI aspettava il dottore);
// parte dopo 2.5s di server aperto, quando il cruscotto è già dipinto.
setTimeout(() => maintenanceTick({ force: true }), 2500).unref();
setInterval(() => maintenanceTick(), 10 * 60 * 1000);  // App «Cruscotto» in gioco (27/10): il publisher scrive la vetrina del giorno
  // nella cartella della mod (loader ACE), stessa aerodinamica del Paddock —
  // file statico JSON nuovo ogni 2.5s, il gioco non deve fare richiesta alcuna.
  // Passo anche l'URL della GUI: serve per il collegamento «Mondiale completo»
  // dentro il widget (request 28/10).
  startUiappPublisher(`http://127.0.0.1:${PORT}`);

