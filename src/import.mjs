// import.mjs — il cuore dell'import: UNA sola strada per GUI, CLI e watcher.
// Prende il file risultato di EVO, riconosce il tuo pilota, aggiorna carriera,
// rivali e statistiche. Qui vivono anche le tre reti di sicurezza nate dopo
// l'incidente del doppio import di Fuji (2026-09-24):
//
//   1. REGISTRO ANTI-DOPPIONI (data/imports-ledger.json): ogni file importato
//      è ricordato per hash del contenuto. Lo stesso file non può pagare due
//      volte, nemmeno se la carriera è cambiata di serie nel frattempo.
//   2. BACKUP AUTOMATICO: prima di ogni registrazione copia il salvataggio in
//      data/evo-career.save.json.bak-auto-<data> (ne tiene gli ultimi 10).
//   3. LOG APPEND-ONLY (data/imports.log.jsonl): una riga per ogni tentativo
//      di import, riuscito o ignorato: si può sempre ricostruire cosa è
//      successo e quando.

import { readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, appendFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listResultFiles, readSessionResult, isRaceSession, pickCandidate,
  findPlayerDriver, bestLapInfo, classify, archiveResult, findQualiResult,
  sectorAnalysis,
} from './results.mjs';
import { nodeById, applyRaceResult, playerStanding, saveState, postRaceEffects, pushMessage } from './state.mjs';
import { nextRound } from './race.mjs';
import { recordRaceGrid, rivalKey, rivalsForNode } from './rivals.mjs';
import { settleChallenge } from './life.mjs';
import { raceCrowdFor } from './memories.mjs';
// BONUS GARA PULITA + AVVISO REP-CAP (28/10): i due extra portati dal sistema
// di Paddock — l'auto-fix pulito dà un +10% del premio della ronda, il tetto
// reputazione su una ronda chiusa va ripetuto alla fine come invito alla
// categoria più alta.
import { cleanRaceBonusOf, padRepCapNote, paddockNextRace } from './paddock.mjs';
import { publishRaceNews } from './gazzetta.mjs';
import { recordFlows } from './flows.mjs';
import { tr } from './lang.mjs';
import { recordWarning } from './warnings.mjs';
import { writeJsonAtomic } from './atomic.mjs';
import { slotDataDir, savePath, activeSlot } from './state.mjs';
import { recordRaceFromResult } from './grid-calib.mjs';
import { avanzaDopoGara } from './agenda.mjs';
import { carPoolOf, carInPool } from './car-pool.mjs';
// APPRENDIMENTO AUTO (25/10): a fine gara coppiamo il garage sul disco con il
// nome dell'auto corsa — così il dizionario perso da un'installazione pulita
// si ricostruisce da solo, senza sampler a mano.
import { learnCar } from '../tools/set-car-sample.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = dirname(HERE);
// EVO_DATA_DIR: solo per i test (ridirige i registri in una cartella temporanea)
export const DATA_DIR = process.env.EVO_DATA_DIR ?? join(PROJECT, 'data');
// nido per-slot (24/10): archivio, ledger, log e backup vivono con la SUA carriera
// (slot 1 = data/ com'è sempre stato, slot 2-3 = data/slot-N/ vergini)
const SLOT_DIR = slotDataDir();
export const ARCHIVE_DIR = join(SLOT_DIR, 'results-archive');
// il SAVE carriera resta in data/ root (il nome file è già per-slot via savePath)
export const SAVE_FILE = join(DATA_DIR, savePath(activeSlot()));
const LEDGER_FILE = join(SLOT_DIR, 'imports-ledger.json');
const LOG_FILE = join(SLOT_DIR, 'imports.log.jsonl');
// backup unificati: data[/slot-N]/backups/evo-career.save.bak-<data>.(auto.)json
// (prima c'erano bak-auto-* in data/, bak-* manuali dalla GUI e ladder.backup-*
// degli script: ora tutti vivono qua, con una sola rotazione; PER SLOT dal 24/10)
const BACKUP_DIR = join(SLOT_DIR, 'backups');
const BACKUP_KEEP = 10;

const trackName = (ladder, id) => ladder.contentNames?.tracks?.[id] ?? id;

/* ------------------------------------------------------------------ */
/* registro anti-doppioni (per hash del file)                          */
/* ------------------------------------------------------------------ */

export function fileHash(path) {
  return createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 16);
}

function loadLedger() {
  if (!existsSync(LEDGER_FILE)) return { imported: {} }; // carriera nuova: registro vuoto, non è un errore
  try {
    const l = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
    if (l && typeof l === 'object' && l.imported && typeof l.imported === 'object') return l;
    throw new Error('struttura inattesa');
  } catch (e) {
    // copia di recupero prima di ripartire da vuoto: il registro non si butta via in silenzio
    try { copyFileSync(LEDGER_FILE, `${LEDGER_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`); } catch { /* pazienza */ }
    recordWarning('import.ledger', 'registro anti-doppioni illeggibile (copia .corrupt salvata): riparto da vuoto', e?.message ?? null);
  }
  return { imported: {} };
}

function saveLedger(ledger) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeJsonAtomic(LEDGER_FILE, ledger); // atomico: il registro anti-doppioni non deve mai restare a metà
}

/** Info del file già importato (o null). Utile anche per l'ispezione CLI. */
export function alreadyImportedHash(path) {
  try {
    const h = fileHash(path);
    return loadLedger().imported[h] ?? null;
  } catch { return null; }
}

/** Elenco dei file risultati già importati, per la GUI. */
export function importedFiles() {
  return Object.entries(loadLedger().imported)
    .map(([hash, e]) => ({ hash, ...e }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
}

/* ------------------------------------------------------------------ */
/* backup automatico (rolling)                                         */
/* ------------------------------------------------------------------ */

/**
 * Rotazione dei backup AUTOMATICI: guarda solo i .auto.json (i backup manuali
 * creati dalla GUI non si toccano mai) e ordina per data di MODIFICA, non per
 * nome — i nomi hanno mescolato formati di data nel tempo (20260923-… contro
 * 2026-09-23T…) e per nome il file più vecchio risultava il più recente.
 */
export function pruneAutoBackups(dir, keep = BACKUP_KEEP) {
  let files = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.startsWith('evo-career.save.bak-') && f.endsWith('.auto.json'))
      .map((f) => { let mtime = 0; try { mtime = statSync(join(dir, f)).mtimeMs; } catch { /* file sparito */ } return { f, mtime }; })
      .sort((a, b) => b.mtime - a.mtime);
  } catch { /* la cartella non esiste: niente da pulire */ }
  for (const { f } of files.slice(Math.max(0, keep))) {
    try { unlinkSync(join(dir, f)); } catch { /* meglio niente che rompere tutto */ }
  }
}

/** Copia il salvataggio in data/backups/evo-career.save.bak-<stamp>.auto.json e tiene gli ultimi BACKUP_KEEP. */
export function backupBeforeImport() {
  if (!existsSync(SAVE_FILE)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = join(BACKUP_DIR, `evo-career.save.bak-${stamp}.auto.json`);
  try { mkdirSync(BACKUP_DIR, { recursive: true }); } catch { /* la dir esiste già */ }
  copyFileSync(SAVE_FILE, target);
  try { pruneAutoBackups(BACKUP_DIR, BACKUP_KEEP); } catch { /* la pulizia non deve mai far fallire l'import */ }
  return target;
}

/* ------------------------------------------------------------------ */
/* log append-only                                                     */
/* ------------------------------------------------------------------ */

function appendLog(entry) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* il log non deve mai rompere l'import */ }
}

/** Ultimi n eventi di import, dal più recente. Per la GUI. */
export function importLog(n = 20) {
  try {
    return readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
      .slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean).reverse();
  } catch { return []; }
}

/** Nuova carriera: il registro e il log riguardano la carriera vecchia. */
export function resetImportRegistry() {
  for (const f of [LEDGER_FILE, LOG_FILE]) {
    try { unlinkSync(f); } catch { /* già assenti: ok */ }
  }
}

/* ------------------------------------------------------------------ */
/* l'import vero (unica logica)                                        */
/* ------------------------------------------------------------------ */

function duplicateResult(_ladder, state, targetNode, before, { reason, source, round, file }) {
  appendLog({
    at: new Date().toISOString(), outcome: 'ignored', reason, file: file ?? null,
    node: targetNode.display, season: state.season, round: round ?? null,
  });
  return {
    ok: true, duplicate: true, reason,
    source,
    node: targetNode.display,
    round: (round ?? 0) + 1,
    entry: null,
    standing: { before: before?.position ?? null, after: before?.position ?? null, points: before?.points ?? 0 },
    money: state.money, rep: state.rep,
    seasonDone: state.round >= targetNode.calendar.length,
  };
}

/**
 * Importa l'ultima gara compatibile (o un inserimento manuale) nella carriera.
 * Usa la stessa logica per GUI, CLI e watcher: chi chiama non tocca lo stato
 * se non tramite qui. `persist` è intercettabile nei test.
 */
// persist ha la firma (state): per default salva con saveState(SAVE_FILE, state) —
// NON passa lo state come fosse un percorso.
export function runImport(ladder, paths, state, { manual = null, allowAny = false, force = false, since = null, strict = false, persist = (s) => saveState(SAVE_FILE, s) } = {}) {
  const node = nodeById(ladder, state.node);
  let payload = null;
  let sourceInfo = null;
  const ctx = {}; // contesto raccolto durante la scelta del file (raw result, qualifica…)

  if (manual) {
    const position = Number(manual.position);
    const gridSize = Number(manual.gridSize ?? node.gridSize);
    if (!Number.isFinite(position) || position < 1) throw new Error('Posizione non valida.');
    payload = {
      position: manual.dnf ? gridSize : position,
      gridSize, dnf: !!manual.dnf, fl: !!manual.fl,
      track: node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track ?? null,
      round: state.round,
      laps: Number.isFinite(Number(manual.laps)) && manual.laps != null ? Number(manual.laps) : null,
      bestLap: typeof manual.bestLap === 'string' && manual.bestLap.trim() ? manual.bestLap.trim() : null,
      durationMin: node.calendar[Math.min(state.round, node.calendar.length - 1)]?.durationMin ?? null,
    };
    sourceInfo = 'inserimento manuale';
  } else {
    const pending = state.pending;
    const rnd = nextRound(ladder, state, node);
    const trackNames = pending?.trackNames ?? [trackName(ladder, rnd.round.track), rnd.round.track];
    let candidates = pickCandidate(paths, { since: pending?.startedAt ?? since, trackNames, allowAny });
    // Niente fallback senza filtro temporale: il watcher (ri-armatosi dopo una gara
    // già importata) riprenderebbe un file vecchio — es. la finale della stagione
    // appena chiusa — e lo registerebbe come gara nuova, con premio e punti fantasma.
    // `strict` (24/10, recupero automatico del watcher): la finestra temporale
    // resta VERA — un file VECCHIO combaciante con la pista attesa NON vale una
    // gara (lezione del 20/10: un Monza vecchio mai incassato è avanzato la
    // carriera da solo). Il fallback da `since: null` resta per l'import a mano
    // (lì c'è un occhio umano e la conferma del cruscotto), dal recupero
    // automatico no: riskierrebbe di «recuperare» una gara di settimane fa.
    if (!strict && !candidates.length && !allowAny && (pending?.startedAt ?? since)) candidates = pickCandidate(paths, { since: null, trackNames, allowAny: false });
    if (!candidates.length) {
      const files = listResultFiles(paths);
      const seen = files.slice(0, 6).map((f) => {
        try {
          const r = readSessionResult(f.file);
          return { name: f.name, session: r.session, track: r.track, drivers: (r.drivers ?? []).length, isRace: isRaceSession(r) };
        } catch { return { name: f.name, session: '?', track: '?', drivers: 0, isRace: false }; }
      });
      const err = new Error(`Nessuna gara da importare che combaci con la ronda attesa (${trackNames.join(' / ')}).`);
      err.code = 'NO_CANDIDATE';
      err.detail = { expected: trackNames, files: seen };
      throw err;
    }
    const candidate = candidates[0];
    const result = candidate.result;
    // RETE 4 — una "gara" finita quasi subito (uscita dopo pochi secondi, prova
    // abbandonata, menu) non deve pagare la stagione. Il controllo è sul LEADER,
    // non sul tuo pilota (così un ritiro presto resta un DNF legittimo): deve aver
    // completato almeno la METÀ dei giri previsti (minimo 3), altrimenti il file
    // viene ignorato senza toccare né carriera né archivio.
    const driverLapsOf = (d) => Number(d?.laps ?? d?.lap_count ?? 0) || 0;
    const leaderLapsNow = Math.max(0, ...(result.drivers ?? []).map(driverLapsOf));
    const expectedLaps = Number(pending?.laps ?? rnd.round?.laps ?? 0) || 0;
    const minLaps = expectedLaps ? Math.ceil(expectedLaps * 0.5) : 3;
    if (!allowAny && leaderLapsNow > 0 && leaderLapsNow < minLaps) {
      const err = new Error(`Sessione scartata: il leader ha percorso ${leaderLapsNow} giri su ${expectedLaps || '?'} previsti (minimo la metà). Se era una prova o una gara abbandonata, nessun problema: la carriera non è toccata.`);
      err.code = 'SESSION_TOO_SHORT';
      err.detail = { leaderLaps: leaderLapsNow, expectedLaps };
      throw err;
    }
    const { driver, how, candidates: notAI } = findPlayerDriver(result, state.driver);
    if (driver) {
      // IMPARIAMO L'AUTO qui, non nel Prepara: in gara è appena passata su
      // quella macchina e il garage sul disco combacia. È il rimedio al
      // dizionario perso di un'installazione pulita (25/10): alla gara dopo
      // il Prepara la seleziona da solo. Fallo SILENZIOSO: un fallimento qui
      // non deve sospendere un import di gara.
      try { learnCar(`${driver.car_brand ?? ''} ${driver.car_name ?? ''}`.trim() || null); } catch { /* mai bloccare l'import */ }
    }
    if (!driver) {
      const err = new Error(`Non ho riconosciuto il tuo pilota in ${candidate.name}.`);
      err.code = 'PLAYER_NOT_FOUND';
      err.detail = {
        candidates: (notAI ?? []).map((d) => `${d.driver_name} ${d.driver_surname}`),
        suggestion: `import --position N --cars ${(result.drivers ?? []).length}`,
        file: candidate.name,
      };
      throw err;
    }
    const info = classify(result, { driver });
    const lap = bestLapInfo(result, driver);
    const secAnalysis = sectorAnalysis(result, driver); // "dove guadagno / dove perdo"
    // la ronda della serie era a TEMPO? allora nel payload ci va anche la durata (per l'evento memoria e i consigli)
    payload = {
      position: info.position, gridSize: info.gridSize, dnf: info.dnf,
      penalty: info.penalty, rawPos: info.rawPos, dsq: info.dsq,
      fl: lap.playerHasIt && !info.dnf,
      track: candidate.trackMatch ? result.track : (rnd.round.track ?? result.track),
      round: pending?.round ?? state.round,
      laps: info.laps, winnerLaps: info.winnerLaps, bestLap: info.bestLap,
      totalTime: info.totalTime, gapMs: info.gapMs, car: info.car, carNumber: info.carNumber,
      sectors: secAnalysis,
      durationMin: rnd.round?.durationMin ?? null,
    };
    const posNote = !info.dnf && !info.dsq && info.penalty
      ? (info.rawPos && info.position !== info.rawPos
        ? tr({ it: `, penalità ${info.penalty} (P${info.rawPos} → P${info.position})`, en: `, ${info.penalty} penalty (P${info.rawPos} → P${info.position})` })
        : tr({ it: `, penalità ${info.penalty}`, en: `, ${info.penalty} penalty` }))
      : '';
    sourceInfo = `${candidate.name} (${tr({ it: 'pilota riconosciuto da', en: 'driver recognised via' })}: ${how}${info.dnf ? tr({ it: ', ritiro', en: ', retirement' }) : ''}${info.dsq ? tr({ it: ', SQUALIFICA', en: ', DISQUALIFIED' }) : ''}${posNote}${lap.playerHasIt && !info.dnf ? tr({ it: ', giro veloce', en: ', fastest lap' }) : ''})`;

    // dati di contesto per il registro rivali e le statistiche complete:
    // qualifica abbinata (stesso weekend, stessa pista) → posizione di partenza, pole, rimonta
    ctx.qualiMtime = candidate.mtime;
    ctx.qualiTrackNames = trackNames;
    ctx.rawResult = result;
    ctx.playerDriver = driver;
    ctx.candidateFile = candidate.name;
    ctx.candidatePath = candidate.file;

    if (!candidate.trackMatch && !force) {
      const err = new Error(`La gara trovata è su "${result.track}" ma la ronda attesa è su "${trackNames.join(' / ')}".`);
      err.code = 'TRACK_MISMATCH';
      err.detail = { actual: result.track, expected: trackNames };
      throw err;
    }

    // RETE 1 — registro anti-doppioni: questo file è già stato incassato?
    if (!force) {
      const seen = alreadyImportedHash(candidate.file);
      if (seen) {
        return duplicateResult(ladder, state, node, playerStanding(ladder, state, node), {
          reason: 'hash',
          source: `${candidate.name} — file già importato il ${String(seen.at ?? '').slice(0, 16).replace('T', ' ')} (${seen.node ?? seen.nodeId ?? 'serie n/d'}): nessun effetto`,
          round: seen.round ?? payload.round,
          file: candidate.name,
        });
      }
    }

    archiveResult(candidate.file, ARCHIVE_DIR);
  }

  const targetNode = state.pending ? nodeById(ladder, state.pending.node) : node;
  // VIGIA DEL PARCO AUTO (24/10, richiesta Mauro: «potrei prendere una F1 e la UI
  // non se ne accorgerebbe dandomi la vittoria»): qui si accorge. L'auto scritta
  // dal risultato deve rientrare nel parco della serie (classe multiclasse con
  // poolAuto in grid-classes.json, altrimenti node.cars); fuori → la gara SI
  // REGISTRA ma valendo ZERO punti e ZERO premio (payload.autoFuori, gestito in
  // applyRaceResult). Niente giudizio quando l'archivio non scrive l'auto.
  let autoFuori = null;
  if (payload.car && !manual) {
    const parco = carPoolOf(ladder, targetNode.nodeId);
    if (parco.ammesse.length && !carInPool(payload.car, parco.ammesse)) autoFuori = payload.car;
  }
  if (autoFuori) {
    payload.autoFuori = { car: autoFuori, ammesse: carPoolOf(ladder, targetNode.nodeId).ammesse };
  }
  const before = playerStanding(ladder, state, targetNode);
  const isNew = !state.results[targetNode.nodeId]?.some((r) => r.season === state.season && r.round === payload.round);
  // RETE 1b — stessa stagione/ronda già in carriera (anche da un file diverso):
  // il watcher ri-armato non deve poter registrare una seconda volta la gara.
  if (!force && !state.pending && !isNew) {
    return duplicateResult(ladder, state, targetNode, before, {
      reason: 'already-in-career',
      source: `${sourceInfo} — già importata in carriera: nessun effetto`,
      round: payload.round,
      file: ctx.candidateFile ?? null,
    });
  }

  // RETE 2 — backup automatico appena prima di toccare la carriera
  let backupFile = null;
  try { backupFile = backupBeforeImport(); } catch { /* mai bloccare l'import per un backup */ }

  const { entry, proposal, crowdBonus, cleanBonus } = applyRaceResult(ladder, state, targetNode, payload);
  // AVVISO REP-CAP (28/10): se il journal di Paddock dice "reputazione al
  // massimo" per questa serie, la ripeti alla carriera dopo l'import — la
  // serie chiusa non può far crescere la reputazione: il consiglio è l'invito
  // a salire in una categoria più alta.
  try {
    const pn = paddockNextRace();
    if (pn?.repCapped) pushMessage(state, `📊 ${padRepCapNote()}`, 'info');
  } catch { /* mai bloccare l'import */ }

  // risultati dei rivali di questa serie (per sfida e gazzetta), letti prima di toccare altro
  let beatenNames = [], beatMeNames = [], rivalCards = [];
  if (ctx.rawResult && !entry.dnf) {
    try {
    const sorted = (ctx.rawResult.drivers ?? []).slice().sort((a, b) => Number(a.position) - Number(b.position));
    const myPos = entry.position;
    const meRow = ctx.playerDriver;
    beatenNames = sorted.filter((d) => d !== meRow && Number(d.position) > (myPos - 1)).map((d) => `${d.driver_name ?? ''}`.trim().split(/\s+/)[0]).filter(Boolean).slice(0, 8);
    beatMeNames = sorted.filter((d) => d !== meRow && Number(d.position) < myPos).map((d) => `${d.driver_name ?? ''}`.trim().split(/\s+/)[0]).filter(Boolean).slice(0, 8);
      rivalCards = rivalsForNode(targetNode.nodeId).map((r) => ({ name: r.name, h2h: { beats: r.beatenMe, losses: r.beatenByMe } }));
    } catch { /* la gazzetta può fare a meno dei nomi */ }
  }

  // griglia completa → registro rivali; qualifica abbinata → pole e rimonta.
  // Solo per gare nuove (niente doppi record quando il watcher o l'utente ripassano).
  let vendetta = null;
  if (isNew && ctx.rawResult) {
    entry.beatenNames = beatenNames; entry.beatMeNames = beatMeNames;
    try {
      // la stagione vera è quella scritta da applyRaceResult nell'entry: usare
      // state.round/state.season qui sotto è già "avanzato" (round++ e season++ a fine anno)
      const raceRowRef = recordRaceGrid(ctx.rawResult, { ...payload, driverFirst: String(ctx.playerDriver?.driver_name ?? '').trim(), driverLast: String(ctx.playerDriver?.driver_surname ?? '').trim() }, {
        season: entry.season, round: payload.round, nodeId: targetNode.nodeId, nodeDisplay: targetNode.display,
        trackDisplay: trackName(ladder, payload.track ?? targetNode.calendar[payload.round]?.track),
      });
      vendetta = raceRowRef?.vendetta ?? null;
      const quali = findQualiResult(paths, ctx.qualiMtime, ctx.qualiTrackNames ?? []);
      if (quali && !entry.dnf) {
        const q = quali.result;
        const zeroQ = Math.min(...(q.drivers ?? []).map((x) => Number(x.position)).filter(Number.isFinite), 9) === 0;
        // Attenzione: nelle qualifiche SP il gioco a volte marca is_current_driver
        // su TUTTI i piloti: in quel caso il flag non vale e si cerca per nome.
        const flaggedAll = (q.drivers ?? []).filter((x) => x.is_current_driver === true).length;
        const meRow = flaggedAll === 1
          ? (q.drivers ?? []).find((x) => x.is_current_driver === true)
          : (q.drivers ?? []).find((x) => rivalKey(x.driver_name, x.driver_surname) === rivalKey(ctx.playerDriver?.driver_name, ctx.playerDriver?.driver_surname));
        if (meRow) {
          const qPos = zeroQ ? Number(meRow.position) + 1 : Number(meRow.position);
          entry.gridPosition = qPos;
          entry.pole = qPos === 1;
          entry.recovery = entry.position - qPos;
          if (qPos === 1) {
            state.stats ??= {}; state.stats.poles = (state.stats.poles ?? 0) + 1;
          }
        }
      }
    } catch (e) {
      try { console.error('[import] rivals/quali:', e.message); } catch {}
    }
  }

  // vita fuori pista: verdetto sfida, duello di stagione, sigilli
  let challengeOut = null, duelOut = null, newSigils = [];
  try {
    challengeOut = settleChallenge(ladder, state, { ...entry, nodeId: targetNode.nodeId }, { pushMessage: (_s, t, k) => pushMessage(state, t, k), recordFlows });
  } catch { /* mai bloccare l'import */ }
  try {
    const eff = postRaceEffects(ladder, state, targetNode);
    duelOut = eff.duel; newSigils = eff.newSigils ?? [];
  } catch { /* mai bloccare l'import */ }

  persist(state);

  // RETE 1 (scrittura) — il file incassato oggi non potrà pagare due volte
  let hash = null;
  if (!manual && ctx.candidatePath) {
    try {
      hash = fileHash(ctx.candidatePath);
      const ledger = loadLedger();
      ledger.imported[hash] = {
        file: ctx.candidateFile, at: new Date().toISOString(),
        season: entry.season, round: payload.round, nodeId: targetNode.nodeId,
        track: payload.track ?? null, position: entry.dnf ? null : entry.position,
      };
      saveLedger(ledger);
    } catch { /* senza ledger resta la guardia isNew: meglio di niente */ }
  }

  // RETE 3 — log append-only di quello che è successo
  appendLog({
    at: new Date().toISOString(),
    outcome: manual ? 'manual' : 'imported',
    source: sourceInfo, file: ctx.candidateFile ?? null, hash,
    node: targetNode.display, season: entry.season, round: payload.round,
    position: entry.dnf ? null : entry.position, points: entry.points,
    prize: entry.prize, money: state.money, backup: backupFile,
  });

  // calibrazione dai risultati reali (grid-calib.mjs): per-auto vs base e campo
  // AI contro di te → proposte appese a data/grid-calibrazione.json. Gare manuali
  // e inserite a mano non hanno il file grezzo: si lasciano perdere (mai bloccare l'import).
  let calibrazione = null;
  if (isNew && ctx.rawResult) {
    try {
      calibrazione = recordRaceFromResult({
        result: ctx.rawResult, playerDriver: ctx.playerDriver,
        track: payload.track ?? null, sourceFile: ctx.candidateFile ?? null,
      });
    } catch { /* la calibrazione non ferma mai la carriera */ }
  }

  // giornata auto-avanzata dopo la registrazione (richiesta Mauro 19/10): se i
  // sedili iscritti non hanno gare oggi, il calendario salta al prossimo giorno con gare
  let agendaJump = null;
  try { agendaJump = avanzaDopoGara(ladder, state); } catch { /* mai bloccare l'import */ }

  // gazzetta: la stampa del paddock commenta la gara (solo gare nuove)
  let newsItem = null;
  if (isNew && !manual) {
    try {
      newsItem = publishRaceNews({
        ladder, state, node: targetNode, entry,
        trackDisplay: trackName(ladder, payload.track ?? targetNode.calendar[payload.round]?.track),
        rivals: rivalCards, beaten: beatenNames, beatMe: beatMeNames,
      });
    } catch { /* la stampa non ferma la carriera */ }
  }

  const after = playerStanding(ladder, state, targetNode);
  // "troppo facile": vittoria con margine > 10s sulla P2. ATTENZIONE: entry.gapMs per il
  // vincitore è SEMPRE 0 (tempo mio - tempo vincitore), il margine vero va letto dal file
  // grezzo: tempo P2 - tempo P1. Il trim adattivo NON si attiva su vittorie strette:
  // propone il nudge +1 solo quando la P2 non era davvero in gara.
  let nudgeSuggested = null;
  try {
    if (isNew && !entry.dnf && entry.position === 1 && ctx.rawResult) {
      const drivers = [...(ctx.rawResult.drivers ?? [])]
        .map((d) => ({ pos: Number(d.position), time: d.total_time, laps: Number(d.laps ?? 0) }))
        .filter((d) => Number.isFinite(d.pos))
        .sort((a, b) => a.pos - b.pos);
      const toMs = (t) => { const m = String(t ?? '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$|^(\d+):(\d+(?:\.\d+)?)$/); if (!m) return null; return m[1] != null ? (+m[1]*3600 + +m[2]*60 + +m[3]) * 1000 : (+m[4]*60 + +m[5]) * 1000; };
      const p1 = drivers[0], p2 = drivers[1];
      const t1 = toMs(p1?.time), t2 = toMs(p2?.time);
      if (p1 && p2 && t1 != null && t2 != null && t2 > t1) {
        const margin = t2 - t1;
        if (margin > 10000) {
          nudgeSuggested = { delta: 1, marginMs: margin, reason: tr({ it: `vittoria con ${Math.round(margin / 1000)}s di margine sulla P2`, en: `win with a ${Math.round(margin / 1000)}s gap on P2` }) };
          // DAL 27/10: niente più nudge persistente nel save — l'offerta del +1
          // vive SOLO nel debrief di questa gara (banner dell'import). Prima il
          // consiglio restava appeso alla serie e riusciva a comparire sulla
          // scheda del campionato DOPO (visto dal vivo: nudge RX-7 sopra la
          // scheda del campionato nuovo).
        }
      }
    }
  } catch { /* mai bloccare l'import per il suggerimento */ }
  return {
    ok: true,
    source: sourceInfo,
    node: targetNode.display,
    round: entry.round + 1,
    entry: { position: entry.dnf ? null : entry.position, gridSize: entry.gridSize, dnf: entry.dnf, fl: entry.fl, points: entry.points, prize: entry.prize, rep: entry.rep, sectors: entry.sectors ?? null, autoFuori: entry.autoFuori ?? null },
    standing: { before: before?.position ?? null, after: after?.position ?? null, points: after?.points ?? 0 },
    money: state.money, rep: state.rep,
    proposal: proposal ? { reason: proposal.reason, from: proposal.from, to: proposal.to } : null,
    crowd: (raceCrowdFor(payload.track) || crowdBonus > 0) ? { spectators: raceCrowdFor(payload.track), bonus: crowdBonus } : null,
    nudgeSuggested,
    calibrazione,
    agenda: agendaJump,
    seasonDone: state.round >= targetNode.calendar.length,
    backup: backupFile,
    news: newsItem ? { title: newsItem.title, body: newsItem.body } : null,
    challenge: challengeOut ? { won: challengeOut.won, text: challengeOut.challenge.text, reward: challengeOut.challenge.reward, penalty: challengeOut.challenge.penalty } : null,
    duel: duelOut ? { name: duelOut.name, gap: duelOut.gap, myPoints: duelOut.myPoints, hisPoints: duelOut.hisPoints } : null,
    newSigils: newSigils.map((s) => s.id),
    vendetta,
  };
}

