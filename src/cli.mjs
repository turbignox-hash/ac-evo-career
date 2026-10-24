// cli.mjs — i comandi di EVO Pitwall (la carriera per AC EVO). Lingua: EVO_LANG=it|en (src/lang.mjs).

import { tr, lang, applyLangConfig, hasEnvOverride, localizeLadder } from './lang.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths, isGameRunning } from './paths.mjs';
import { watchOnce, WATCH_INTERVAL_MS, heartbeat, watcherStatus } from './watch.mjs';
import { scanContent, validateLadder, searchContent } from './content.mjs';
import {
  createCareer, loadState, saveState, nodeById, disciplineName, tierOf, gateStatus,
  standingsFor, playerStanding, difficultyFor, seasonEnd,
  acceptOffer, pushMessage, sponsorTier, enterNode, renameDriver,
  savePath, activeSlot, slotDataDir,
} from './state.mjs';
import { paddock } from './world.mjs';
import { raceCard, markPending, chargeEntry, launch } from './race.mjs';
import { listResultFiles, readSessionResult, describeResult } from './results.mjs';
import { runImport, importedFiles, importLog, resetImportRegistry } from './import.mjs';
import { seasonReview, reviewableSeasons, exportReview } from './review.mjs';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { contractStatus, challengeFor, acceptChallenge, ensureLife, careerPlanner } from './life.mjs';
import { newsFeed } from './gazzetta.mjs';
import { ensureFlowsSeeded, resetFlows } from './flows.mjs';
import { scanCareer, autoRepair, clearBacheca, resetLedger, reseedFlows, flowDedup } from './maintenance.mjs';
import { resetNews } from './gazzetta.mjs';
import {
  agendaDay, gareDelGiorno, prossimoGiornoConGara, avanzaGiorno,
  elencoCompleto, racesOnDay, dateLabel, dateShort,
} from './agenda.mjs';
import { writeJsonAtomic } from './atomic.mjs';
import { buildGridMessage } from './gridbuilder.mjs';
import { gridGuardProposal } from './grid-guard.mjs';
import { zeroBalanceProposal, aiRangeProposal } from './grid-restore.mjs';
import { applyBalance, applyAi, pruneBackups } from './grid-apply.mjs';
import { calibSummary, calibFile, resetCalib, appuntaConvalida } from './grid-calib.mjs';
import { gameRunning, GAME_MODES_DIR } from '../tools/evo-grid.mjs';
import { testModeBanner, testModeOn, testModeOff } from './test-mode.mjs';
import { PIANI, applyPianoToCalendar } from './orario.mjs';
import { setRaceTime, currentRaceTime } from '../tools/set-racetime.mjs';
import { changeWeekendTrack, currentWeekendTrack } from '../tools/set-track.mjs';
import { setDriverCar, garageCurrent } from '../tools/set-driver-car.mjs';
import { renameSync, copyFileSync as copySyncGrid, statSync } from 'node:fs';
const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = dirname(HERE);
const LADDER_FILE = join(PROJECT, 'config', 'career.evo.ladder.json');
// Stessa regola di import.mjs/webui-env.mjs: EVO_DATA_DIR (solo per i test)
// ridirige la cartella dati. Senza questo il fumo CLI leggeva data/ del progetto
// e passava solo perché c'era un save vero (il pacchetto amico scopre il 24/10).
const DATA_DIR = process.env.EVO_DATA_DIR ?? join(PROJECT, 'data');
// SLOT di carriera (1..3): ACE_SLOT=2 sceglie il secondo salvataggio (o --slot via env).
// Lo slot risolve QUI (una volta, all'avvio del processo) e vale per tutto il giro.
const SLOT = activeSlot();
const SAVE_FILE = join(DATA_DIR, savePath(SLOT));
const CONFIG_FILE = join(DATA_DIR, 'evo.config.json');
// nido per-slot (24/10): l'archivio dei risultati vive con la SUA carriera
const ARCHIVE_DIR = join(slotDataDir(), 'results-archive');
// il customgrid “vista dal tool”: lo stesso file che il menu legge/applizza
const CUSTOMGRID_FILE = join(GAME_MODES_DIR, 'last_grid.customgrid');

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const money = (n) => `${n.toLocaleString('it-IT')}`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const pad = (text, width) => String(text).padEnd(width);

/* traccia del giro atteso: serve a grid-balance --track per i supplementi */
function trackOfCurrentRound(ladder) {
  try {
    const state = loadState(SAVE_FILE);
    const node = ladder.nodes.find((n) => n.nodeId === state.node);
    return node?.calendar?.[state.round ?? 0]?.track ?? node?.calendar?.[0]?.track ?? null;
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* argomenti                                                           */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args.flags[key] = next; i++; }
      else args.flags[key] = true;
    } else args._.push(a);
  }
  return args;
}

function loadLadder() {
  return localizeLadder(JSON.parse(readFileSync(LADDER_FILE, 'utf8')));
}

function appEnv() {
  const env = { ...process.env };
  if (existsSync(CONFIG_FILE)) {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.dataDir) env.ACE_DATA = cfg.dataDir;
    if (cfg.gameExe) env.ACE_ROOT = dirname(cfg.gameExe);
    if (!hasEnvOverride()) applyLangConfig(cfg.lang); // UNA lingua per CLI e server
  }
  return env;
}

function context() {
  const env = appEnv(); // legge anche la lingua salvata: prima della scala
  const ladder = loadLadder();
  const paths = resolvePaths(env);
  return { ladder, paths };
}

function writeConfig(patch) {
  mkdirSync(DATA_DIR, { recursive: true });
  const current = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
  const next = { ...current, ...patch };
  writeJsonAtomic(CONFIG_FILE, next); // atomico, come nel server web
  return next;
}

/* ------------------------------------------------------------------ */
/* comandi                                                             */
/* ------------------------------------------------------------------ */

function cmdHelp() {
  const rows = [
    ['setup', tr({ it: "mostra l'installazione rilevata e salva i percorsi trovati", en: 'shows the detected installation and saves the found paths' })],
    ['content [--validate|--list|--search <testo>]', tr({ it: "catalogo auto/piste visto nell'installazione e verifica della scala", en: 'car/track catalogue seen in the installation and ladder check' })],
    ['new --name "Nome" [--nation ITA] [--discipline gt]', tr({ it: 'comincia una carriera', en: 'starts a career' })],
    ['rinomina --name "Nome Cognome"', tr({ it: 'cambia il nome pilota (deve combaciare con quello in EVO)', en: 'changes the driver name (must match the one in EVO)' })],
    ['status', tr({ it: 'cruscotto: soldi, reputazione, sedile, tier, posizione', en: 'dashboard: money, reputation, seat, tier, position' })],
    ['series [--discipline gt] [--all]', tr({ it: 'la scala completa con gate e serie bloccate', en: 'the full ladder with gates and locked series' })],
    ['enter <nodeId> [--buy] [--force]', tr({ it: 'cambia serie, comprando o affittando il sedile', en: 'changes series, buying or renting the seat' })],
    ['calendar', tr({ it: 'calendario della stagione con ora e meteo di ogni round', en: 'season calendar with time and weather of each round' })],
    ['agenda [--fattibili] [--salta|--prossima] [--corri <nodeId>]', tr({ it: ' calendario a GIORNI: gare di ogni campionato iscritto, le fattibili per livello, salto di giornata', en: ' DAILY calendar: races of each joined championship, the level-feasible ones, day skip' })],
    ['standings', tr({ it: 'classifica della serie', en: 'series standings' })],
    ['paddock [--all]', tr({ it: "piloti rivali: archetipo, eta', banda di difficolta'", en: "rival drivers: archetype, age, difficulty band" })],
    ['messages', tr({ it: 'messaggi e notizie dal paddock', en: 'messages and news from the paddock' })],
    ['next [--car <id>]', tr({ it: 'la prossima gara in dettaglio: cosa impostare nel gioco', en: 'the next race in detail: what to set in the game' })],
    ['race [--car <id>] [--dry-run] [--no-launch]', tr({ it: "paga l'iscrizione, segna la gara attesa e apre il gioco", en: 'pays the entry, marks the awaited race and opens the game' })],
    ['prepara [--car <id>] [--dry] [--serie <nodeId>] [--round N] [--pista] [--auto]', tr({ it: 'iscrizione ronda + griglia zavorrata + vigia + card in un gesto; con --pista/--auto (o --tutto) scrive anche pista e auto del garage (di default si scelgono a mano in EVO)', en: 'round entry + ballasted grid + checker + card in one move; with --pista/--auto (or --tutto) it also writes track and garage car (by default you set them by hand in EVO)' })],
    ['import [--position N --cars M] [--dnf] [--fl] [--inspect] [--force]', tr({ it: 'legge il risultato e aggiorna la carriera', en: 'reads the result and updates the career' })],
    ['watch [--every N]', tr({ it: 'guardia automatica: incassa da solo ogni gara nuova scritta da EVO (ogni 15s)', en: 'automatic guard: collects every new race written by EVO by itself (every 15s)' })],
    ['difficulty [--mode adaptive|fixed|custom] [--value N] [--trim <serie|all> <valore>] [--lock/--unlock <node>] [--accept|--reject]', tr({ it: "difficolta' AI di tutte le serie (trim manuale -20..+20)", en: 'AI difficulty of all series (manual trim -20..+20)' })],
    ['season-end', tr({ it: "chiude l'anno, paga il titolo e apre il mercato", en: 'closes the year, pays the title and opens the market' })],
    ['review [--season N] [--export]', tr({ it: 'la rassegna della stagione: gare, rivali, duelli', en: 'the season review: races, rivals, duels' })],
    ['gazzetta', tr({ it: 'la stampa del paddock: titoli e voci dopo ogni gara', en: 'the paddock press: headlines and voices after each race' })],
    ['piano', tr({ it: "pianificatore: dove puoi correre l'anno prossimo", en: 'planner: where you can race next year' })],
    ['sfida [--accept]', tr({ it: 'la mini-sfida facoltativa della prossima gara', en: 'the optional mini-challenge of the next race' })],
    ['dottore', tr({ it: 'verifica l\'integrità della carriera (e --fix corregge)', en: 'checks the career integrity (and --fix repairs)' })],
    ['accept <n>', tr({ it: "accetta un'offerta di sedile", en: 'accepts a seat offer' })],
    ['griglia [--serie <nodeId>] [--round N] [--dry] [--force]', tr({ it: 'scrive il customgrid della GARA DEL GIORNO: auto del pool + bilanciamento (funziona anche a EVO aperto, dal menu principale; mai dal menu griglia, mai con GENERA)', en: 'writes the customgrid of the RACE OF THE DAY: pool cars + balance (works even with EVO open, from the main menu; never from the grid menu, never with GENERATE)' })],
    ['griglia-calib [--convalida "pista"] [--dry] [--reset]', tr({ it: 'calibrazione dai risultati reali: confidenza per classe+traccia, proposte, appunta la convalida con --convalida', en: 'calibration from real results: confidence per class+track, proposals, bookmarks the validation with --convalida' })],
    ['test-mode [--giri N] | --on | --off', tr({ it: 'modalità test: TUTTE le gare a N giri (default 3). Con --off tornano i giri originali dei calendari', en: 'test mode: ALL races at N laps (default 3). With --off the original calendar laps come back' })],
    ['pulisci [--bacheca] [--ledger] [--flows-reseed] [--flows-dedup] [--auto]', tr({ it: 'manutenzione: ripara ciò che si può (--auto), poi le liste volute: bacheca, registro import, flussi dal salvataggio, doppioni. Ogni pulizia chiede --yes', en: 'maintenance: repair what can be fixed (--auto), then the requested lists: board, import ledger, flows from the save, duplicates — every cleanup needs --yes' })],
  ];
  console.log(C.bold(tr({ it: '\nac-evo-career — carriera per Assetto Corsa EVO\n', en: '\nac-evo-career — career for Assetto Corsa EVO\n' })));
  console.log(tr({ it: 'Uso: node ac-evo-career.mjs <comando> [opzioni]\n', en: 'Usage: node ac-evo-career.mjs <command> [options]\n' }));
  for (const [cmd, desc] of rows) console.log(`  ${C.cyan(cmd.padEnd(52))} ${desc}`);
  console.log(`\n${C.dim(tr({ it: 'Flusso tipico: next -> race -> corri -> import', en: 'Typical flow: next -> race -> run -> import' }))}\n`);
  return 0;
}

function cmdSetup(args) {
  appEnv(); // la lingua del config vale anche qui
  const ladder = loadLadder();
  if (args.flags.data || args.flags.game) {
    const patch = {};
    if (typeof args.flags.data === 'string') patch.dataDir = args.flags.data;
    if (typeof args.flags.game === 'string') patch.gameExe = args.flags.game;
    writeConfig(patch);
    console.log(C.green(tr({ it: 'Percorsi salvati in data/evo.config.json', en: 'Paths saved in data/evo.config.json' })));
  }
  const paths = resolvePaths(appEnv());
  console.log(C.bold(tr({ it: '\nInstallazione rilevata\n', en: '\nDetected installation\n' })));
  console.log(`  ${tr({ it: 'cartelle dati', en: 'data folders' })}   ${paths.dataDirs.join('\n                  ')}`);
  console.log(`  ${tr({ it: 'risultati', en: 'results' })}        ${paths.resultsDirs.length ? paths.resultsDirs.join(', ') : C.red(tr({ it: 'nessuna cartella Results (avvia il gioco almeno una volta)', en: 'no Results folder (launch the game at least once)' }))}`);
  console.log(`  ${tr({ it: 'log', en: 'logs' })}             ${paths.logsDirs.length ? paths.logsDirs.join(', ') : `(${tr({ it: 'nessuna', en: 'none' })})`}`);
  console.log(`  ${tr({ it: 'eseguibile', en: 'executable' })}      ${paths.gameExe ?? C.yellow(tr({ it: 'non trovato (il lancio userà Steam)', en: 'not found (launch will use Steam)' }))}`);
  console.log(`  ${tr({ it: 'scala carriera', en: 'career ladder' })}  ${ladder.nodes.length} ${tr({ it: 'serie', en: 'series' })}, ${ladder.disciplines.length} ${tr({ it: 'discipline', en: 'disciplines' })}\n`);

  const content = scanContent(paths);
  console.log(`  ${tr({ it: 'contenuto visto', en: 'content seen' })} ${content.cars.size} ${tr({ it: 'auto', en: 'cars' })}, ${content.tracks.size} ${tr({ it: 'piste', en: 'tracks' })} (${tr({ it: 'da log e season definition', en: 'from logs and season definition' })})\n`);
  const issues = validateLadder(ladder, content);
  if (issues.length) {
    console.log(C.yellow(`  ${tr({ it: "{N} riferimenti della scala non trovati nell'installazione: usa \"content --validate\" per l'elenco.", en: '{N} ladder references not found in the installation: use "content --validate" for the list.' }).replace('{N}', issues.length)}`));
  } else {
    console.log(C.green(tr({ it: '  La scala carriera combacia con il contenuto installato.', en: '  The career ladder matches the installed content.' })));
  }
  console.log(`\n${C.dim(tr({ it: 'Puoi forzare i percorsi con:  node ac-evo-career.mjs setup --data "<cartella ACE>" --game "<AssettoCorsaEVO.exe>"', en: 'You can force paths with:  node ac-evo-career.mjs setup --data "<ACE folder>" --game "<AssettoCorsaEVO.exe>"' }))}\n`);
  return 0;
}

function cmdContent(args) {
  const { ladder, paths } = context();
  const content = scanContent(paths);
  if (args.flags.search) {
    const term = String(args.flags.search);
    const found = searchContent(content, ladder, term);
    console.log(C.bold(tr({ it: '\nRicerca "{T}"\n', en: '\nSearch "{T}"\n' }).replace('{T}', term)));
    console.log(`  ${tr({ it: 'auto:', en: 'cars:' })}  ${found.cars.join(', ') || C.dim(tr({ it: 'nessuna', en: 'none' }))}`);
    console.log(`  ${tr({ it: 'piste:', en: 'tracks:' })} ${found.tracks.join(', ') || C.dim(tr({ it: 'nessuna', en: 'none' }))}\n`);
    return 0;
  }
  if (args.flags.list) {
    console.log(C.bold(tr({ it: "\nAuto viste nell'installazione ({N})\n", en: '\nCars seen in the installation ({N})\n' }).replace('{N}', content.cars.size)));
    for (const id of [...content.cars].sort()) console.log(`  ${id.padEnd(42)} ${C.dim(ladder.contentNames?.cars?.[id] ?? '')}`);
    console.log(C.bold(tr({ it: "\nPiste viste nell'installazione ({N})\n", en: '\nTracks seen in the installation ({N})\n' }).replace('{N}', content.tracks.size)));
    for (const id of [...content.tracks].sort()) console.log(`  ${id.padEnd(42)} ${C.dim(ladder.contentNames?.tracks?.[id] ?? '')}`);
    console.log();
    return 0;
  }
  if (args.flags.validate) {
    const issues = validateLadder(ladder, content);
    console.log(C.bold(tr({ it: '\nVerifica della scala carriera\n', en: '\nCareer ladder check\n' })));
    if (!issues.length) {
      console.log(C.green(tr({ it: "  Nessun problema: {N} serie, tutte le auto e le piste esistono nell'installazione.\n", en: '  No problems: {N} series, every car and track exists in the installation.\n' }).replace('{N}', ladder.nodes.length)));
      return 0;
    }
    console.log(`  ${issues.length} ${tr({ it: 'problemi:', en: 'problems:' })}\n`);
    for (const issue of issues) {
      const label = { car: tr({ it: 'auto', en: 'car' }), track: tr({ it: 'pista', en: 'track' }), points: tr({ it: 'punti', en: 'points' }), profile: tr({ it: 'profilo', en: 'profile' }), gate: 'gate' }[issue.kind];
      console.log(`  ${C.yellow(issue.node.padEnd(22))} ${label.padEnd(7)} ${C.red(issue.id.padEnd(38))} ${C.dim(issue.display)}`);
      if (issue.suggestions?.length) console.log(`${' '.repeat(24)}${C.dim(tr({ it: 'forse intendevi: ', en: 'maybe you meant: ' }) + issue.suggestions.join(', '))}`);
    }
    console.log();
    return 1;
  }
  console.log(tr({ it: '\nContenuto visto: {A} auto, {T} piste.', en: '\nContent seen: {A} cars, {T} tracks.' }).replace('{A}', content.cars.size).replace('{T}', content.tracks.size));
  console.log(tr({ it: "Usa --validate per la verifica della scala, --list per l'elenco, --search <testo> per cercare.\n", en: 'Use --validate for the ladder check, --list for the list, --search <text> to search.\n' }));
  return 0;
}

function cmdNew(args) {
  const { ladder } = context();
  const name = typeof args.flags.name === 'string' ? args.flags.name : null;
  if (!name && !(args.flags.first && args.flags.last)) {
    throw new Error(tr({ it: 'Serve il nome del pilota: new --name "Mauro Sgamer" --nation ITA', en: 'The driver name is required: new --name "John Driver" --nation ITA' }));
  }
  if (existsSync(SAVE_FILE) && !args.flags.force) {
    throw new Error(tr({ it: 'Esiste già una carriera in {F}.\nAggiungi --force per ricominciare (il file viene sovrascritto).', en: 'A career already exists in {F}.\nAdd --force to start over (the file is overwritten).' }).replace('{F}', SAVE_FILE));
  }
  const state = createCareer(ladder, {
    name,
    first: typeof args.flags.first === 'string' ? args.flags.first : undefined,
    last: typeof args.flags.last === 'string' ? args.flags.last : undefined,
    nation: typeof args.flags.nation === 'string' ? args.flags.nation.toUpperCase() : 'ITA',
    discipline: typeof args.flags.discipline === 'string' ? args.flags.discipline : null,
  });
  resetImportRegistry(); // ledger e log appartenevano alla carriera precedente
  resetFlows();          // i flussi appartenevano alla carriera precedente
  resetNews();           // la gazzetta riparte pulita
  saveState(SAVE_FILE, state);
  const node = nodeById(ladder, state.node);
  console.log(C.bold(tr({ it: '\nBenvenuto {N} ({O})\n', en: '\nWelcome {N} ({O})\n' }).replace('{N}', state.driver.name).replace('{O}', state.driver.nation)));
  console.log(`  ${tr({ it: 'Prima serie:', en: 'First series:' })} ${C.cyan(node.display)} — ${disciplineName(ladder, node.discipline)}, ${tr({ it: 'livello', en: 'level' })} ${node.level} (${tierOf(ladder, node.level)})`);
  console.log(`  ${tr({ it: 'Soldi:', en: 'Money:' })} ${money(state.money)}   ${tr({ it: 'Reputazione:', en: 'Reputation:' })} ${state.rep}`);
  console.log(`\n${C.dim(tr({ it: 'Prossimo passo:  node ac-evo-career.mjs next', en: 'Next step:  node ac-evo-career.mjs next' }))}\n`);
  return 0;
}

function requireState() {
  return loadState(SAVE_FILE);
}

function cmdRinomina(args) {
  const state = requireState();
  const name = typeof args.flags.name === 'string' ? args.flags.name : null;
  const first = typeof args.flags.first === 'string' ? args.flags.first : null;
  const last = typeof args.flags.last === 'string' ? args.flags.last : null;
  if (!name && !first && !last) {
    throw new Error(tr({ it: 'Uso: rinomina --name "Mauro Turbigno"   oppure   rinomina --first Mauro --last Turbigno', en: 'Usage: rinomina --name "John Driver"   or   rinomina --first John --last Driver' }));
  }
  const { before, after } = renameDriver(state, { name, first, last });
  pushMessage(state, `${tr({ it: 'Nome pilota aggiornato:', en: 'Driver name updated:' })} ${before} -> ${after}.`, 'info');
  saveState(SAVE_FILE, state);
  console.log(C.green(tr({ it: '\nNome pilota: {N}', en: '\nDriver name: {N}' }).replace('{N}', after)));
  console.log(C.dim(tr({ it: '  Usa esattamente il nome con cui corri in EVO: serve a farti riconoscere nei risultati.', en: '  Use exactly the name you race with in EVO: it makes you recognizable in the results.' })));
  console.log(C.dim(tr({ it: '  Verifica con:  import --inspect --full\n', en: '  Check with:  import --inspect --full\n' })));
  return 0;
}

function header(state, ladder) {
  ensureFlowsSeeded(state); // carriere nate prima del registro flussi
  const node = nodeById(ladder, state.node);
  const standing = playerStanding(ladder, state, node);
  const sponsor = sponsorTier(state);
  return [
    C.bold(`\n${state.driver.name} (${state.driver.nation})`) + C.dim(`   ${tr({ it: 'stagione', en: 'season' })} ${state.season} · ${node.display}`),
    `  ${C.green(money(state.money))} ${tr({ it: 'in banca', en: 'in the bank' })}   ${C.cyan(state.rep + ' rep')}${sponsor ? C.dim(' (' + sponsor.name + ')') : ''}   ${C.yellow('P' + (standing?.position ?? '?') + '/' + node.gridSize)} ${tr({ it: 'in classifica', en: 'in standings' })}   ${tr({ it: 'round', en: 'round' })} ${Math.min(state.round + 1, node.calendar.length)}/${node.calendar.length}`,
  ].join('\n');
}

function cmdStatus() {
  const { ladder } = context();
  const state = requireState();
  const bannerTest = testModeBanner();
  if (bannerTest) console.log(C.yellow(bannerTest));
  const node = nodeById(ladder, state.node);
  const diff = difficultyFor(ladder, state, node, node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track);

  console.log(header(state, ladder));
  const guard = watcherStatus();
  if (guard.alive) console.log(`  ${C.green(tr({ it: '👁 guardia attiva', en: '👁 guard active' }))} — ${tr({ it: 'incassa da sola le gare nuove (ultimo controllo {S}s fa)', en: 'collects new races by itself (last check {S}s ago)' }).replace('{S}', Math.round(guard.ageMs / 1000))}`);
  else console.log(`  ${C.dim(tr({ it: '👁 guardia ferma — avvia guarda.cmd per incassare le gare in automatico', en: '👁 guard idle — run guarda.cmd to collect races automatically' }))}`);
  console.log(`\n  ${tr({ it: 'Sedile:', en: 'Seat:' })} ${node.display} — ${disciplineName(ladder, node.discipline)}, ${tr({ it: 'livello', en: 'level' })} ${node.level} (${tierOf(ladder, node.level)}), ${tr({ it: 'accesso', en: 'access' })} ${node.access}`);
  console.log(`  ${tr({ it: 'Modello economico:', en: 'Economy model:' })} ${node.econ.model}   ${tr({ it: 'Iscrizione', en: 'Entry' })} ${money(node.econ.entry)}   ${tr({ it: 'Premio', en: 'Prize' })} ${money(node.econ.prize)}${node.econ.champion ? `   ${tr({ it: 'Titolo', en: 'Title' })} ${money(node.econ.champion)}` : ''}`);
  console.log(`  ${tr({ it: 'Difficoltà AI: slider', en: 'AI difficulty: slider' })} ${diff.slider}% (${tr({ it: 'interna', en: 'internal' })} ${diff.total.toFixed(0)}, trim ${signed(diff.trim)})`);
  if (state.titles.length) {
    console.log(`\n  ${tr({ it: 'Titoli:', en: 'Titles:' })} ${state.titles.map((t) => `${t.display} (S${t.season})`).join(', ')}`);
  }
  ensureFlowsSeeded(state);
  const contr = contractStatus(ladder, state);
  if (contr) {
    console.log(`\n  ${tr({ it: 'Contratto', en: 'Contract' })} ${contr.contract.display} (${tr({ it: 'premio', en: 'payout' })} ${money(contr.contract.payout)}):`);
    for (const row of contr.rows) console.log(`    ${row.ok ? C.green('✓') : C.yellow('•')} ${row.text} — ${row.progress}`);
  }
  const L = ensureLife(state);
  if (L.duel?.season === state.season) {
    console.log(`  ${tr({ it: 'Duello di stagione:', en: 'Season duel:' })} ${C.cyan(L.duel.name)} — ${tr({ it: 'voi due a', en: 'you two at' })} ${L.duel.myPoints} pt ${tr({ it: 'contro', en: 'vs' })} ${L.duel.hisPoints} pt (${tr({ it: 'differenza', en: 'difference' })} ${L.duel.gap}).`);
  }
  const sp = state.life?.sponsor;
  if (sp?.takenSeason === state.season) console.log(`  ${tr({ it: 'Sponsor:', en: 'Sponsor:' })} ${C.cyan(sp.name)} — ${sp.perRace} € ${tr({ it: 'a gara', en: 'per race' })}${sp.missionDone ? '' : `, ${tr({ it: 'missione: podio entro il round', en: 'mission: podium by round' })} ${sp.deadlineRound + 1} ${tr({ it: 'per +', en: 'for +' })}${sp.bonus}`}`);
  const myResults = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season);
  if (myResults.length) {
    console.log(`\n  ${tr({ it: 'Stagione in corso:', en: 'Season so far:' })}`);
    for (const r of myResults.sort((a, b) => a.round - b.round)) {
      const track = ladder.contentNames?.tracks?.[r.track] ?? r.track;
      console.log(`    R${r.round + 1} ${track.padEnd(18)} ${r.dnf ? C.red(tr({ it: 'ritiro', en: 'DNF' })) : 'P' + r.position}  ${r.points} ${tr({ it: 'punti', en: 'points' })}  +${money(r.prize)}`);
    }
  } else {
    console.log(C.dim(tr({ it: '\n  Nessuna gara disputata in questa serie.', en: '\n  No races run in this series yet.' })));
  }
  console.log(`\n${C.dim(tr({ it: 'Prossima gara:  node ac-evo-career.mjs next', en: 'Next race:  node ac-evo-career.mjs next' }))}\n`);
  return 0;
}

/** agenda — il calendario a GIORNI (stile del modello originario).
 *  agenda                      gare di OGGI di tutti i campionati iscritti + fattibili
 *  agenda --fattibili          solo le serie a cui puoi iscriverti ORA (per livello/gate)
 *  agenda --salta              salta al giorno dopo
 *  agenda --prossima           salta direttamente alla prossima gara di campionato
 *  agenda --corri <nodeId>     segna la scelta di oggi: punta il sedile su quella serie
 */
function cmdAgenda(args) {
  const { ladder } = context();
  const state = requireState();
  const bannerTest = testModeBanner();
  if (bannerTest) console.log(C.yellow(bannerTest));

  // azioni che mutano il giorno
  if (args.flags.salta) {
    const before = agendaDay(state);
    const after = avanzaGiorno(state);
    saveState(SAVE_FILE, state);
    console.log(C.dim(tr({ it: '\n  Giorno {B} saltato: siamo al giorno {A}.', en: '\n  Day {B} skipped: we are on day {A}.' }).replace('{B}', before).replace('{A}', after)));
  } else if (args.flags.prossima) {
    const target = prossimoGiornoConGara(ladder, state);
    if (target == null) {
      console.log(C.yellow(tr({ it: '\n  Nessuna gara futura nei campionati iscritti (stagioni complete: usa season-end).', en: '\n  No future race in the joined championships (seasons complete: use season-end).' })));
      return 0;
    }
    const before = agendaDay(state);
    avanzaGiorno(state, target);
    saveState(SAVE_FILE, state);
    console.log(C.dim(tr({ it: '\n  Dal giorno {B} ({D1}) al giorno {A} ({D2}): si va alla prossima gara di campionato.', en: '\n  From day {B} ({D1}) to day {A} ({D2}): we jump to the next championship race.' }).replace('{B}', before).replace('{D1}', dateLabel(before)).replace('{A}', target).replace('{D2}', dateLabel(target))));
  }

  // scelta della gara di oggi: il sedile in corsa è già quello, altrimenti si firma e si punta
  const targetId = typeof args.flags.corri === 'string' ? args.flags.corri : null;
  if (targetId) {
    const target = gareDelGiorno(ladder, state).gare.find((g) => g.node.nodeId === targetId);
    if (!target) {
      const list = gareDelGiorno(ladder, state).gare.map((g) => g.node.nodeId).join(', ') || `(${tr({ it: 'nessuna', en: 'none' })})`;
      throw new Error(tr({ it: 'La serie "{S}" non ha gare oggi in agenda.\nGare di oggi: {L}\nUsa "agenda" per vedere la giornata.', en: 'The series "{S}" has no race today in the agenda.\nToday races: {L}\nUse "agenda" to see the day.' }).replace('{S}', targetId).replace('{L}', list));
    }
    if (state.node !== targetId) {
      state.node = targetId;                       // puntiamo su quella serie
      state.round = target.index;                  // alla sua ronda attesa
      // il sedile è già del pilota: nessun costo extra per la scelta di oggi
    }
    saveState(SAVE_FILE, state);
    console.log(C.green(tr({ it: '\n  Scelta per oggi: {D} R{R} ({T}).\n  Paga e corri con "race" (o controlla con "next"), poi l\'import avanza il giorno.', en: '\n  Pick for today: {D} R{R} ({T}).\n  Pay and run with "race" (or check with "next"), then the import moves the day forward.' }).replace('{D}', target.node.display).replace('{R}', target.index + 1).replace('{T}', target.track)));
    return 0;
  }

  const today = gareDelGiorno(ladder, state);
  console.log(C.bold(tr({ it: '\nAgenda — GIORNO {D} · {L}\n', en: '\nAgenda — DAY {D} · {L}\n' }).replace('{D}', today.day).replace('{L}', dateLabel(today.day))));

  // le gare di oggi dei campionati iscritti (una per serie)
  if (!Object.keys(state.seats ?? {}).length) {
    console.log(C.yellow(tr({ it: '  Nessun campionato in corso: firma un sedile con "enter <nodeId>" o "accept <n>".', en: '  No championship running: sign a seat with "enter <nodeId>" or "accept <n>".' })));
  } else if (!today.gare.length) {
    const fut = prossimoGiornoConGara(ladder, state);
    console.log(C.green(tr({ it: '  Oggi non ci sono gare.', en: '  No races today.' })));
    if (fut != null) console.log(C.dim(tr({ it: '  Prossima gara di campionato: giorno {D} (agenda --prossima per saltare).', en: '  Next championship race: day {D} (agenda --prossima to skip).' }).replace('{D}', fut)));
    console.log(C.dim(tr({ it: '  Salta la giornata: agenda --salta', en: '  Skip the day: agenda --salta' })));
  } else {
    for (const g of today.gare) {
      const when = g.onSchedule ? C.green(tr({ it: 'in calendario oggi', en: 'on schedule today' })) : C.yellow(tr({ it: 'in ritardo (era il giorno {D}, salta il tempo e corri quando vuoi)', en: 'overdue (it was day {D}, skip the time and run whenever you want)' }).replace('{D}', g.scheduledDay));
      console.log(`  ${g.onSchedule ? C.bold('►') : ' '} ${pad(g.node.display, 26)} R${g.index + 1}/${g.node.calendar.length} — ${g.track}${g.laps ? `, ${g.laps} ${tr({ it: 'giri', en: 'laps' })}` : ''}`);
      console.log(`    ${pad('', 24)} ${when}`);
    }
    console.log(C.dim(tr({ it: '\n  Scegli con "agenda --corri <nodeId>" (poi "race" come al solito): la gara finita avanza il giorno di 1.', en: '\n  Pick with "agenda --corri <nodeId>" (then "race" as usual): a finished race moves the day by 1.' })));
  }

  // sotto: la griglia COMPLETA di oggi — tutte le gare in programma (come le "serie reali")
  const griglia = racesOnDay(ladder, state, today.day);
  if (griglia.length) {
    console.log(C.bold(tr({ it: '\nGare in programma oggi ({N})\n', en: '\nRaces scheduled today ({N})\n' }).replace('{N}', griglia.length)));
    for (const g of griglia) {
      const tag = g.stato === 'iscritto' ? C.green(tr({ it: 'iscritto', en: 'joined' }))
        : g.fattibile ? C.cyan(tr({ it: 'fattibile', en: 'feasible' })) : C.red(tr({ it: 'bloccata', en: 'locked' }));
      console.log(`  ${pad(g.node.display, 28)} R${g.index + 1}/${g.node.calendar.length}  ${pad(g.track, 26)} ${String(g.laps ?? '—').padStart(2)} ${tr({ it: 'giri', en: 'laps' })}  ${tag}`);
      if (!g.fattibile && g.gateReasons.length) console.log(`       ${C.dim(g.gateReasons.join('; '))}`);
    }
    console.log(C.dim(tr({ it: '\n  Solo le gare fattibili (o dei campionati iscritti) si possono scegliere: agenda --corri <nodeId>.', en: '\n  Only feasible races (or joined championships) can be picked: agenda --corri <nodeId>.' })));
  }

  // l'elenco delle serie della scala, filtrabile su fattibili
  const fattibili = !!args.flags.fattibili;
  const rows = elencoCompleto(ladder, state, { fattibili });
  console.log(C.bold(`${tr({ it: '\nSerie della scala', en: '\nLadder series' })}${fattibili ? tr({ it: ' — solo fattibili con il tuo livello', en: ' — only feasible with your level' }) : tr({ it: ' (tutte)', en: ' (all)' })}\n`));
  for (const s of rows) {
    const tag = s.iscritto ? C.green(pad(tr({ it: 'iscritto', en: 'joined' }), 12)) : s.fattibile ? C.cyan(pad(tr({ it: 'fattibile', en: 'feasible' }), 12)) : s.stato === 'completata' ? C.dim(pad(tr({ it: 'completata', en: 'completed' }), 12)) : C.red(pad(tr({ it: 'bloccata', en: 'locked' }), 12));
    const nx = s.next ? `${tr({ it: 'prossima:', en: 'next:' })} ${s.next.track}, R${s.next.roundIndex + 1}, ${dateShort(s.next.scheduledDay)}` : tr({ it: 'stagione chiusa', en: 'season closed' });
    console.log(`  L${String(s.level).padEnd(2)} ${pad(s.display, 26)} ${tag} ${C.dim(nx)}`);
    if (fattibili && !s.fattibile) console.log(`       ${C.red(s.gateReasons.join('; '))}`);
  }
  if (!fattibili) console.log(C.dim(tr({ it: '\n  agenda --fattibili: solo le serie a cui puoi partecipare con il livello di maestria attuale.', en: '\n  agenda --fattibili: only the series you can join with your current mastery level.' })));
  return 0;
}

function cmdSeries(args) {
  const { ladder } = context();
  const state = requireState();
  const discipline = typeof args.flags.discipline === 'string' ? args.flags.discipline : null;
  const showAll = !!args.flags.all;

  console.log(C.bold(`${tr({ it: '\nScala carriera', en: '\nCareer ladder' })}${discipline ? ' — ' + disciplineName(ladder, discipline) : ''}\n`));
  for (const disc of ladder.disciplines) {
    if (discipline && disc.id !== discipline) continue;
    const nodes = ladder.nodes.filter((n) => n.discipline === disc.id).sort((a, b) => a.level - b.level);
    if (!nodes.length) continue;
    console.log(` ${C.bold(disc.name)} ${C.dim('· ' + disc.description)}`);
    for (const node of nodes) {
      const gate = gateStatus(ladder, state, node);
      const current = node.nodeId === state.node;
      const req = node.requires ? `${nodeById(ladder, node.requires.nodeId).display} top ${node.requires.top}` : '—';
      const mark = current ? C.green(pad(tr({ it: '◄ attuale', en: '◄ current' }), 12)) : gate.ok ? C.cyan(pad(tr({ it: 'aperta', en: 'open' }), 12)) : C.red(pad(tr({ it: 'bloccata', en: 'locked' }), 12));
      console.log(`   ${pad('L' + node.level, 3)} ${pad(node.display, 26)} ${mark} ${C.dim(`gate: ${req}`)}`);
      if (!gate.ok && (showAll || discipline)) console.log(`       ${C.red(gate.reasons.join('; '))}`);
      if (showAll) console.log(`       ${C.dim(`${node.gridSize} ${tr({ it: 'auto', en: 'cars' })} · ${node.points} · ${node.econ.model} · ${tr({ it: 'affitto', en: 'rent' })} ${money(node.econ.rent)} · ${tr({ it: 'premio', en: 'prize' })} ${money(node.econ.prize)}`)}`);
    }
    console.log();
  }
  console.log(C.dim(tr({ it: '  enter <nodeId> per firmare un sedile aperto. Le serie bloccate dicono cosa manca.\n', en: '  enter <nodeId> to sign an open seat. Locked series tell you what is missing.\n' })));
  return 0;
}

function cmdCalendar() {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const played = new Set((state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).map((r) => r.round));
  console.log(C.bold(tr({ it: '\nCalendario {D} — stagione {S}\n', en: '\nCalendar {D} — season {S}\n' }).replace('{D}', node.display).replace('{S}', state.season)));
  node.calendar.forEach((round, i) => {
    const weather = ladder.weatherNames[String(round.weather)];
    const mark = played.has(i) ? C.green('✓') : i === state.round ? C.yellow('►') : ' ';
    console.log(`  ${mark} R${i + 1} ${round.name.padEnd(34)} ${String(round.laps).padStart(2)} ${tr({ it: 'giri', en: 'laps' })}  ${String(round.hour).padStart(2)}:00  ${C.dim(weather)}`);
  });
  console.log();
  return 0;
}

function cmdStandings() {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const table = standingsFor(ladder, state, node);
  console.log(C.bold(tr({ it: '\nClassifica {D} — stagione {S}\n', en: '\nStandings {D} — season {S}\n' }).replace('{D}', node.display).replace('{S}', state.season)));
  table.forEach((row) => {
    const me = row.isPlayer ? C.green('◄ ') : '  ';
    const tag = row.isPlayer ? tr({ it: 'TU', en: 'YOU' }) : row.iconic ? 'ICON' : row.hot ? 'HOT ' : '';
    console.log(`  ${me}P${String(row.position).padStart(2)}  ${row.name.padEnd(24)} ${String(row.points).padStart(3)} ${tr({ it: 'pt', en: 'pts' })}  ${C.dim(row.country + ' ' + tag)}`);
  });
  console.log();
  return 0;
}

function cmdPaddock(args) {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const rows = paddock(state.world, ladder, node, state.season);
  const limit = args.flags.all ? rows.length : 12;
  console.log(C.bold(tr({ it: '\nPaddock {D} — {N} rivali (i primi {L})\n', en: '\nPaddock {D} — {N} rivals (first {L})\n' }).replace('{D}', node.display).replace('{N}', rows.length).replace('{L}', limit)));
  for (const r of rows.slice(0, limit)) {
    console.log(`  ${r.name.padEnd(24)} ${r.country}  ${String(r.age).padStart(2)} ${tr({ it: 'anni', en: 'yrs' })}  ${r.archetypeName.padEnd(14)} ${tr({ it: 'banda', en: 'band' })} ${r.bandValue.toFixed(0).padStart(3)} (${tr({ it: 'slider', en: 'slider' })} ${String(r.evoSlider).padStart(3)}%)  ${r.iconic ? C.yellow(tr({ it: 'iconico', en: 'iconic' })) : r.hot ? C.cyan(tr({ it: 'in forma', en: 'in form' })) : ''}`);
  }
  console.log(C.dim(`\n  ${tr({ it: 'Archetipi:', en: 'Archetypes:' })} ${Object.values(ladder.archetypes).map((a) => a.name).join(', ')}`));
  console.log(C.dim(tr({ it: '  Parco piloti totale: {N} ({A} attivi)\n', en: '  Total driver pool: {N} ({A} active)\n' }).replace('{N}', state.world.drivers.length).replace('{A}', state.world.drivers.filter((d) => d.active).length)));
  return 0;
}

function cmdMessages(args) {
  const { ladder } = context();
  const state = requireState();
  const unread = state.messages.filter((m) => !m.read);

  // inbox pulita: segna tutto letto (nessun testo perso, solo la spunta)
  if (args.flags['read-all']) {
    for (const m of state.messages) m.read = true;
    saveState(SAVE_FILE, state);
    console.log(C.bold(tr({ it: '\nMessaggi', en: '\nMessages' })) + C.dim(tr({ it: ' — {N} segnati come letti\n', en: ' — {N} marked as read\n' }).replace('{N}', unread.length)));
    return 0;
  }

  // digest: i non letti raggruppati per giorno, i più recenti prima
  if (args.flags.digest) {
    console.log(C.bold(tr({ it: '\nMessaggi — digest: {N} non letti\n', en: '\nMessages — digest: {N} unread\n' }).replace('{N}', unread.length)));
    if (!unread.length) { console.log(C.green(tr({ it: '  Inbox pulita: nessun messaggio da leggere.\n', en: '  Clean inbox: no messages to read.\n' }))); return 0; }
    const byDay = {};
    for (const m of unread) {
      const day = m.at.slice(0, 10);
      (byDay[day] ??= []).push(m);
    }
    const days = Object.keys(byDay).sort().reverse();
    const MAX_DAYS = 14;
    for (const day of days.slice(0, MAX_DAYS)) {
      const group = byDay[day];
      console.log(`  ${C.bold(day)}  ×${group.length}`);
      for (const m of group.slice(-3)) {
        const color = m.kind === 'good' || m.kind === 'title' ? C.green : m.kind === 'bad' ? C.red : m.kind === 'money' ? C.yellow : C.dim;
        console.log(`    ${C.dim(m.at.slice(11, 16))}  ${color(m.text)}`);
      }
      if (group.length > 3) console.log(C.dim(tr({ it: '    …e altre {N}', en: '    …and {N} more' }).replace('{N}', group.length - 3)));
    }
    if (days.length > MAX_DAYS) console.log(C.dim(tr({ it: '\n  …e altri {N} giorni', en: '\n  …and {N} more days' }).replace('{N}', days.length - MAX_DAYS)));
    console.log(C.dim(tr({ it: '\n  per segnare tutto letto:  messages --read-all\n', en: '\n  to mark all as read:  messages --read-all\n' })));
    return 0;
  }

  console.log(C.bold(`${tr({ it: '\nMessaggi', en: '\nMessages' })}${unread.length ? C.dim(tr({ it: ' — {N} non letti', en: ' — {N} unread' }).replace('{N}', unread.length)) : ''}\n`));
  console.log(C.dim(tr({ it: '  digest: messages --digest · segna letti: messages --read-all\n', en: '  digest: messages --digest · mark as read: messages --read-all\n' })));
  for (const m of state.messages.slice(-15)) {
    const day = m.at.slice(0, 10);
    const color = m.kind === 'good' || m.kind === 'title' ? C.green : m.kind === 'bad' ? C.red : m.kind === 'money' ? C.yellow : C.dim;
    console.log(`  ${C.dim(day)}  ${color(m.text)}`);
  }
  if (state.offers.length) {
    console.log(C.bold(tr({ it: '\nOfferte sul tavolo\n', en: '\nOffers on the table\n' })));
    for (const o of state.offers) {
      console.log(`  ${C.cyan(String(o.index) + ')')} ${o.display.padEnd(26)} L${o.level} ${disciplineName(ladder, o.discipline).padEnd(14)} ${C.dim(`${o.note} · ${tr({ it: 'affitto', en: 'rent' })} ${money(o.rent)}`)}`);
    }
    console.log(C.dim(tr({ it: '\n  accept <n> per firmare.\n', en: '\n  accept <n> to sign.\n' })));
  } else console.log();
  return 0;
}

function printCard(ladder, state, card) {
  console.log(C.bold(`\n${card.node.display} — ${tr({ it: 'round', en: 'round' })} ${card.roundIndex + 1}/${card.totalRounds}: ${card.round.name}\n`));
  console.log(`  ${C.dim(tr({ it: 'Imposta questo nel gioco:', en: 'Set this in the game:' }))}`);
  for (const [label, value] of card.settings) {
    console.log(`    ${label.padEnd(18)} ${value}`);
  }
  const o = card.outlook;
  if (o) {
    console.log(`\n  ${C.bold(tr({ it: 'Report pre-gara', en: 'Pre-race report' }))}`);
    console.log(`    ${tr({ it: 'classifica', en: 'standings' })} ${o.standingPosition ? 'P' + o.standingPosition : '—'} · ${o.racesRun}/${o.totalRounds} ${tr({ it: 'gare', en: 'races' })} · ${o.seasonPoints} ${tr({ it: 'punti', en: 'points' })}${o.mastery?.level ? ` · ${tr({ it: 'pista:', en: 'track:' })} ${o.mastery.name} (${o.mastery.races} ${tr({ it: 'gare', en: 'races' })})` : ''}`);
    if (o.lapTarget) console.log(`    ${tr({ it: 'obiettivo giro:', en: 'lap target:' })} ${o.lapTarget.time} (${tr({ it: 'tuo best con', en: 'your best with' })} ${o.lapTarget.car ?? tr({ it: 'n/d', en: 'n/a' })})`);
    if (o.duel) console.log(`    ${tr({ it: 'duello di stagione:', en: 'season duel:' })} ${o.duel.name} ${tr({ it: 'a', en: 'at' })} ${o.duel.gap} ${tr({ it: 'punti', en: 'points' })}`);
    if (o.contract?.length) for (const c of o.contract) console.log(`    ${tr({ it: 'clausola:', en: 'clause:' })} ${c.ok ? '✓' : '•'} ${c.text} (${c.progress})`);
  }
  if (card.challenge) {
    const c = card.challenge;
    console.log(`\n  ${C.yellow(tr({ it: 'Sfida della ronda', en: 'Round challenge' }))}: ${c.text}${c.accepted ? ` (${tr({ it: 'accettata', en: 'accepted' })})` : ''}`);
    console.log(`    ${C.dim(tr({ it: 'premio {R} € se ci riesci, -{P} rep se fallisci. Accetta con: sfida --accept', en: 'reward {R} € if you make it, -{P} rep if you fail. Accept with: challenge --accept' }).replace('{R}', c.reward).replace('{P}', c.penalty))}`);
  }
  if (card.warnings.length) {
    console.log(`\n  ${C.yellow(tr({ it: 'Note', en: 'Notes' }))}`);
    for (const w of card.warnings) console.log(`    - ${w}`);
  }
  console.log(`\n  ${C.dim(tr({ it: 'Difficoltà proposta: slider AI {S}% · aggressività {A}% · {O} avversari', en: 'Suggested difficulty: AI slider {S}% · aggression {A}% · {O} opponents' }).replace('{S}', card.difficulty.slider).replace('{A}', card.profile.aggr).replace('{O}', card.opponents))}`);
}

function cmdNext(args) {
  const { ladder } = context();
  const state = requireState();
  const bannerTest = testModeBanner();
  if (bannerTest) console.log(C.yellow(bannerTest));
  ensureFlowsSeeded(state);
  const car = typeof args.flags.car === 'string' ? args.flags.car : null;
  const card = raceCard(ladder, state, { car });
  if (car && !card.node.cars.includes(car)) {
    throw new Error(tr({ it: 'Auto "{C}" non ammessa in {D}.\nAmmesse: {L}', en: 'Car "{C}" not allowed in {D}.\nAllowed: {L}' }).replace('{C}', car).replace('{D}', card.node.display).replace('{L}', card.node.cars.join(', ')));
  }
  printCard(ladder, state, card);
  console.log(`\n${C.dim(tr({ it: "Quando sei pronto:  node ac-evo-career.mjs race   (paga l'iscrizione e apre il gioco)", en: 'When ready:  node ac-evo-career.mjs race   (pays the entry and opens the game)' }))}\n`);
  return 0;
}

async function cmdRace(args) {
  const { ladder, paths } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const node = nodeById(ladder, state.node);
  const card = raceCard(ladder, state, { car: typeof args.flags.car === 'string' ? args.flags.car : null });

  if (state.round >= node.calendar.length) {
    console.log(C.yellow(tr({ it: '\nStagione completata in {D}: chiudi l\'anno con "season-end".\n', en: '\nSeason completed in {D}: close the year with "season-end".\n' }).replace('{D}', node.display)));
    return 0;
  }
  if (args.flags['dry-run']) {
    printCard(ladder, state, card);
    console.log(`\n${C.dim(tr({ it: '(dry-run: nessuna iscrizione pagata, gioco non avviato)', en: '(dry-run: no entry paid, game not started)' }))}\n`);
    return 0;
  }
  if (await isGameRunning()) {
    console.log(`\n  ${C.yellow(tr({ it: 'Nota: Assetto Corsa EVO risulta già aperto.', en: 'Note: Assetto Corsa EVO appears to be already open.' }))} ${C.dim(tr({ it: 'Configura la gara nella finestra già aperta; il gioco non verrà avviato di nuovo.', en: 'Set the race in the window already open; the game will not be started again.' }))}`);
  }
  const fee = chargeEntry(ladder, state, node);
  markPending(ladder, state, card);
  saveState(SAVE_FILE, state);

  printCard(ladder, state, card);
  if (fee) console.log(`\n  ${C.yellow(tr({ it: 'Iscrizione pagata: ', en: 'Entry paid: ' }) + money(fee))}`);

  if (args.flags['no-launch']) {
    console.log(`\n${C.dim(tr({ it: '(gioco non avviato: --no-launch)  Apri Assetto Corsa EVO e imposta la gara.', en: '(game not started: --no-launch)  Open Assetto Corsa EVO and set the race.' }))}\n`);
    return 0;
  }
  try {
    const res = await launch(paths, { force: !!args.flags['force-launch'] });
    if (res.via === 'already-running') {
      console.log(`\n  ${C.green(tr({ it: 'Assetto Corsa EVO è già aperto', en: 'Assetto Corsa EVO is already open' }))}: ${tr({ it: 'non ne avvio un secondo, altrimenti il gioco mostra un errore.', en: 'I will not start a second one, otherwise the game shows an error.' })}`);
      console.log(`  ${C.dim(tr({ it: 'Imposta la gara qui sopra nella finestra già aperta.', en: 'Set the race above in the window already open.' }))}`);
      console.log(`  ${C.dim(tr({ it: '(se vuoi forzare una nuova istanza: race --force-launch)', en: '(to force a new instance: race --force-launch)' }))}`);
    } else {
      console.log(`\n  ${C.green(tr({ it: 'Gioco avviato', en: 'Game started' }))} ${C.dim(`(${res.via}: ${res.target})`)}`);
    }
  } catch (e) {
    console.log(`\n  ${C.yellow(tr({ it: 'Non sono riuscito ad aprire il gioco: ', en: 'Could not open the game: ' }) + e.message)}`);
    console.log(`  ${C.dim(tr({ it: 'Aprilo tu e imposta la gara qui sopra.', en: 'Open it yourself and set the race above.' }))}`);
  }
  console.log(`\n${C.dim(tr({ it: 'A fine gara:  node ac-evo-career.mjs import', en: 'After the race:  node ac-evo-career.mjs import' }))}\n`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* prepara: iscrizione della ronda + griglia + vigia + card, un gesto   */
/* ------------------------------------------------------------------ */

async function cmdPrepara(args) {
  const { ladder } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const dry = !!args.flags.dry;
  const gameOn = await isGameRunning();

  console.log(C.bold(tr({ it: '\nPrepara-ronda', en: '\nPrepare-round' })));
  console.log(C.dim(tr({ it: '  iscrizione della ronda · griglia zavorrata · vigia · card — niente riavvio del gioco (pista/auto solo con --pista/--auto).', en: '  round entry · ballasted grid · checker · card — no game restart (track/car only with --pista/--auto).' })));
  if (gameOn) console.log(C.dim(tr({ it: "  protocollo no-restart: resta sul menù di EVO e NON aprire l'editor griglia.", en: '  no-restart protocol: stay on the EVO menu and DO NOT open the grid editor.' })));

  // card della ronda una volta sola: serve al passo 0 (pista/auto) e al dry-run
  const card = raceCard(ladder, state, { car: typeof args.flags.car === 'string' ? args.flags.car : null });

  // 0) pista + auto del WEEKEND (set-track + set-driver-car) — ORA FACOLTATIVE
  //    (richiesta Mauro 23/10): le scritte attecchiscono solo al lancio FREDDO
  //    di EVO; col gioco già aperto l'utente continua a vedere pista/auto
  //    vecchie ("non attecchiscono", lezione 22–23/10). Default = come prima:
  //    pista e auto si scelgono a mano in EVO; con --pista / --auto (o --tutto)
  //    il tool le riscrive comunque. Errori silente: non bloccano la ronda.
  const wantPista = args.flags.pista != null || args.flags.tutto != null;
  const wantAuto = args.flags.auto != null || args.flags.tutto != null;
  const prepMsg = [];
  if (!wantPista && !wantAuto) {
    prepMsg.push(C.dim(`  ${tr({ it: '· pista e auto: si impostano a mano in EVO (com\'era prima — --pista/--auto per farle scrivere al tool)', en: '· track and car: set by hand in EVO (as before — --pista/--auto to have the tool write them)' })}`));
  }
  // Pista e auto SOLO se chieste a voce (--pista/--auto): senza, com'era prima
  // dell'automatismo — si impostano a mano in EVO e il flusso di lancio resta
  // quello_HW1 clearfixЧЕ che funzionava sattura.
  if (wantPista) try {
    if (card.trackName) {
      const t = changeWeekendTrack(card.trackName, { dry });
      if (t.written) prepMsg.push(C.green(`  ✓ ${tr({ it: 'pista', en: 'track' })}: ${C.bold(card.trackName)} — ${tr({ it: `scritta sul gamemodesave (${t.blocchi} sessioni)`, en: `written to the gamemodesave (${t.blocchi} sessions)` })}`));
      else prepMsg.push(C.dim(`  · ${tr({ it: 'pista', en: 'track' })}: ${card.trackName} — ${dry ? tr({ it: 'verrebbe scritta', en: 'would be written' }) : tr({ it: 'già in piedi', en: 'already in place' })} (${t.blocchi} ${tr({ it: 'sessioni', en: 'sessions' })})`));
    } else prepMsg.push(C.dim(`  · ${tr({ it: 'pista corrente', en: 'current track' })}: ${currentWeekendTrack() ?? tr({ it: 'non leggibile', en: 'unreadable' })}`));
  } catch (e) { prepMsg.push(C.yellow(`  ${tr({ it: 'pista:', en: 'track:' })} ${e.message}`)); }
  if (wantAuto) try {
    if (card.carName) {
      const c = setDriverCar(card.carName, { dry });
      if (c.written) prepMsg.push(C.green(`  ✓ ${tr({ it: 'auto del garage', en: 'garage car' })}: ${C.bold(c.name)} — ${tr({ it: 'scritta sul drivergarage', en: 'written to the drivergarage' })}`));
      else prepMsg.push(C.dim(`  · ${tr({ it: 'auto del garage', en: 'garage car' })}: ${c.name} — ${dry ? tr({ it: 'verrebbe scritta', en: 'would be written' }) : tr({ it: 'raggiunta senza scrittura', en: 'reached without writing' })}`));
    } else prepMsg.push(C.dim(`  · ${tr({ it: 'auto del garage', en: 'garage car' })}: ${garageCurrent().name ?? tr({ it: 'non nel dizionario', en: 'not in the dictionary' })}`));
  } catch (e) { prepMsg.push(C.yellow(`  ${tr({ it: 'auto:', en: 'car:' })} ${e.message}`)); }
  for (const m of prepMsg) console.log(m);
  if (gameOn) console.log(C.dim(tr({ it: "  (EVO aperto: pista e auto valgono al lancio del weekend, non a runtime)", en: '  (EVO open: track and car take effect at the weekend launch, not at runtime)' })));

  // 1) griglia della ronda (scrittura ok anche a gioco aperto: EVO rilegge
  //    il customgrid al lancio del weekend; backup automatico incluso)
  try {
    await cmdGriglia({ _: [], flags: { force: true, dry, serie: typeof args.flags.serie === 'string' ? args.flags.serie : undefined, round: args.flags.round, 'servo-prepara': true, car: args.flags.car } });
  } catch (e) {
    console.log(C.yellow(tr({ it: '\n  Griglia non preparata: ', en: '\n  Grid not prepared: ' }) + e.message));
    console.log(C.dim(tr({ it: '  (serve il customgrid generato dal GENERA a gioco chiuso; la carriera prosegue con la card qui sotto)', en: '  (the customgrid generated by GENERATE with the game closed is required; the career goes on with the card below)' })));
  }

  // 2) vigia del bilancio: dopo la scrittura il bilancio deve stare in piedi
  try {
    const zp = zeroBalanceProposal(CUSTOMGRID_FILE, { track: trackOfCurrentRound(ladder) });
    if (zp) {
      const out = applyBalance({ serie: zp.classe, track: zp.track ?? trackOfCurrentRound(ladder), force: gameOn });
      console.log(C.green(`\n  ✓ ${tr({ it: 'vigia: bilancio di', en: 'checker: balance of' })} "${out.classe}" ${tr({ it: 'riscritto sul customgrid', en: 'rewritten on the customgrid' })}${out.trkMsg ? out.trkMsg : ''}`));
      if (gameOn) console.log(C.dim(tr({ it: "  (EVO aperto: resta sul menù e NON aprire l'editor griglia, o un risalvataggio cancella di nuovo il bilancio)", en: '  (EVO open: stay on the menu and DO NOT open the grid editor, or a re-save wipes the balance again)' })));
    }
  } catch (e) { console.log(C.yellow(`  ${tr({ it: 'vigia:', en: 'checker:' })} ${e.message}`)); }

  // 3) iscrizione della ronda + card (il lancio resta a te: il gioco rilegge
  //    il customgrid al lancio del weekend — niente riavvii)
  if (dry) {
    console.log();
    printCard(ladder, state, card);
    console.log(C.dim(tr({ it: '\n(dry-run: nessun addebito, niente pista/auto/griglia scritte)', en: '\n(dry-run: no entry fee, no track/car/grid written)' })));
    console.log(C.dim(tr({ it: "Rilancia senza --dry per pagare l'iscrizione e preparare davvero.\n", en: 'Rerun without --dry to pay the entry and prepare for real.\n' })));
    return 0;
  }
  console.log();
  await cmdRace({ _: [], flags: { 'no-launch': true, car: args.flags.car } });
  console.log(`\n${C.bold(tr({ it: 'Tutto pronto', en: 'All ready' }))}: ${C.dim(tr({ it: `nel menù di EVO scegli il round e parti —${wantPista || wantAuto ? ' pista e auto scritti a freddo, apri il pannello pista prima di "Parti" (lezione 22/10) —' : ' pista e auto le scegli a mano in EVO;'} customgrid già a posto. La vigia custodisce la griglia.`, en: `in the EVO menu pick the round and go —${wantPista || wantAuto ? ' track and car were written cold, open the track panel before "Race" (Oct 22 lesson) —' : ' track and car you set by hand in EVO;'} the customgrid is already set. The checker guards the grid.` }))}\n`);
  console.log(C.yellow(tr({ it: '  ⚠ All\'avvio di EVO apri UNA volta la lista piste del weekend e torna indietro PRIMA di "Parti": a gioco freddo il pannello pista parte vuoto, e da lì "Parti" crasha il gioco (lezione 22/10).', en: '  ⚠ At EVO launch open the weekend track list ONCE and go back BEFORE "Race": from cold the track panel starts empty, and "Race" from there crashes the game (lesson of Oct 22).' })));
  console.log(C.dim(tr({ it: '  A fine gara:  node ac-evo-career.mjs import\n', en: '  After the race:  node ac-evo-career.mjs import\n' })));
  return 0;
}

function cmdImport(args) {
  const { ladder, paths } = context();
  const state = requireState();

  if (args.flags.inspect) {
    const files = listResultFiles(paths);
    if (!files.length) { console.log(C.yellow(tr({ it: '\nNessun file risultati in {P}\n', en: '\nNo result files in {P}\n' }).replace('{P}', paths.resultsDirs.join(', ') || `(${tr({ it: 'nessuna cartella', en: 'no folder' })})`))); return 0; }
    console.log(C.bold(tr({ it: '\nUltimi file di risultato ({N} totali)\n', en: '\nLatest result files ({N} total)\n' }).replace('{N}', files.length)));
    for (const f of files.slice(0, 5)) {
      let result;
      try { result = readSessionResult(f.file); } catch { continue; }
      console.log(`  ${f.name}  ${C.dim(new Date(f.mtime).toLocaleString(lang() === 'en' ? 'en-GB' : 'it-IT'))}`);
      console.log(`    ${tr({ it: 'sessione', en: 'session' })} ${result.session} · ${tr({ it: 'pista', en: 'track' })} ${result.track} · ${(result.drivers ?? []).length} ${tr({ it: 'piloti', en: 'drivers' })}`);
      if (args.flags.full) console.log(describeResult(result).split('\n').map((l) => '    ' + l).join('\n'));
    }
    console.log();
    return 0;
  }

  // registro anti-doppioni: cosa è già stato incassato e quando
  if (args.flags.ledger) {
    const files = importedFiles();
    console.log(C.bold(tr({ it: '\nRegistro import ({N} file già incassati)\n', en: '\nImport ledger ({N} files already collected)\n' }).replace('{N}', files.length)));
    for (const f of files.slice(0, 20)) {
      console.log(`  ${String(f.at ?? '').slice(0, 16).replace('T', ' ')}  ${f.file}  →  ${f.node ?? f.nodeId ?? '?'} R${(f.round ?? 0) + 1}${f.position ? ', P' + f.position : ''}`);
    }
    const log = importLog(10);
    if (log.length) {
      console.log(C.dim(tr({ it: '\nUltimi eventi:', en: '\nLatest events:' })));
      for (const l of log) console.log(`  ${C.dim(String(l.at ?? '').slice(0, 19).replace('T', ' '))}  ${l.outcome ?? '?'}  ${l.file ?? ''}${l.outcome === 'ignored' ? ' (' + (l.reason ?? '') + ')' : ''}`);
    }
    console.log();
    return 0;
  }

  const manual = args.flags.position
    ? { position: args.flags.position, gridSize: args.flags.cars, dnf: !!args.flags.dnf, fl: !!args.flags.fl, laps: null, bestLap: null }
    : null;

  // UNA sola logica di import, condivisa con la GUI e il watcher (src/import.mjs):
  // registro rivali, backup automatico e anti-doppioni funzionano anche da terminale.
  let out;
  try {
    out = runImport(ladder, paths, state, { manual, allowAny: !!args.flags['allow-any'], force: !!args.flags.force });
  } catch (e) {
    if (e.code === 'NO_CANDIDATE' && e.detail) {
      const lines = [tr({ it: `Nessuna gara da importare che combaci con la ronda attesa (${(e.detail.expected ?? []).join(' / ')}).`, en: `No result to import matching the expected round (${(e.detail.expected ?? []).join(' / ')}).` })];
      const files = e.detail.files ?? [];
      if (files.length) {
        lines.push(tr({ it: 'File recenti presenti:', en: 'Recent files found:' }));
        for (const f of files) lines.push(`  ${f.name} — ${tr({ it: `sessione ${f.session}, pista ${f.track}, ${f.drivers} piloti${f.isRace ? '' : ' (non una gara)'}`, en: `session ${f.session}, track ${f.track}, ${f.drivers} drivers${f.isRace ? '' : ' (not a race)'}` })}`);
      } else {
        lines.push(tr({ it: `Non ci sono file in ${paths.resultsDirs.join(', ') || '(nessuna cartella Results)'}.`, en: `There are no files in ${paths.resultsDirs.join(', ') || '(no Results folder)'}.` }));
      }
      lines.push(tr({ it: 'Se la gara è quella giusta usa --allow-any, oppure inserisci la posizione a mano con --position N.', en: "If it is the right race use --allow-any, or enter the position by hand with --position N." }));
      throw new Error(lines.join('\n'));
    }
    if (e.code === 'PLAYER_NOT_FOUND' && e.detail) {
      throw new Error([
          tr({ it: `Non ho riconosciuto il tuo pilota in ${e.detail.file ?? 'questo file'}.`, en: `I could not recognize your driver in ${e.detail.file ?? 'this file'}.` }),
          tr({ it: `Piloti senza contrassegno AI: ${(e.detail.candidates ?? []).join(', ') || 'nessuno'}.`, en: `Drivers without the AI badge: ${(e.detail.candidates ?? []).join(', ') || 'none'}.` }),
          tr({ it: `Inserisci la posizione a mano: import --position N --cars <numero-auto> [--dnf] [--fl]`, en: 'Enter the position by hand: import --position N --cars <car-count> [--dnf] [--fl]' }),
      ].join('\n'));
    }
    if (e.code === 'TRACK_MISMATCH' && e.detail) {
      throw new Error([
          tr({ it: `La gara trovata è su "${e.detail.actual}" ma la ronda attesa è su "${(e.detail.expected ?? []).join(' / ')}".`, en: `The found race is on "${e.detail.actual}" but the expected round is on "${(e.detail.expected ?? []).join(' / ')}".` }),
          tr({ it: 'Usa --force per importarla comunque, o --allow-any per cercare fra tutte le gare.', en: 'Use --force to import it anyway, or --allow-any to search all races.' }),
      ].join('\n'));
    }
    throw e;
  }

  if (out.duplicate) {
    console.log(C.yellow(tr({ it: '\nNessun nuovo risultato registrato\n', en: '\nNo new result recorded\n' })));
    console.log(`  ${C.dim(out.source)}`);
    console.log(`  ${C.dim(tr({ it: 'Per forzarlo comunque: import --force.   Registro: import --ledger', en: 'To force it anyway: import --force.   Ledger: import --ledger' }))}`);
    return 0;
  }

  const entry = out.entry;
  console.log(C.bold(tr({ it: `\nRisultato importato — ${out.node}, round ${out.round}\n`, en: `\nResult imported — ${out.node}, round ${out.round}\n` })));
  console.log(`  ${C.dim(out.source)}`);
  console.log(`  ${tr({ it: 'Posizione:', en: 'Position:' })} ${entry.dsq ? C.red(tr({ it: 'squalificato', en: 'disqualified' })) : entry.dnf ? C.red(tr({ it: 'ritiro', en: 'retired' })) : 'P' + entry.position} ${tr({ it: 'su', en: 'of' })} ${entry.gridSize}${entry.penalty && !entry.dnf && !entry.dsq ? C.yellow(tr({ it: ` · penalità ${entry.penalty}${entry.rawPos && entry.rawPos !== entry.position ? ` (da P${entry.rawPos})` : ''}`, en: ` · ${entry.penalty} penalty${entry.rawPos && entry.rawPos !== entry.position ? ` (from P${entry.rawPos})` : ''}` })) : ''}${entry.fl ? C.yellow(tr({ it: ' · giro veloce', en: ' · fast lap' })) : ''}`);
  console.log(`  ${tr({ it: 'Punti:', en: 'Points:' })} ${entry.points}   ${tr({ it: 'Premio:', en: 'Prize:' })} ${money(entry.prize)}   ${tr({ it: 'Reputazione:', en: 'Reputation:' })} +${entry.rep}`);
  console.log(`  ${tr({ it: 'Classifica:', en: 'Standings:' })} P${out.standing.before ?? '?'} -> ${C.cyan('P' + (out.standing.after ?? '?'))} (${out.standing.points} ${tr({ it: 'punti', en: 'points' })})`);
  console.log(`  ${tr({ it: 'Banca:', en: 'Bank:' })} ${C.green(money(out.money))}   ${tr({ it: 'Reputazione:', en: 'Reputation:' })} ${out.rep}`);
  if (out.backup) console.log(`  ${C.dim(tr({ it: 'Backup automatico: ', en: 'Automatic backup: ' }) + String(out.backup).replace(/^.*bak-auto-/, ''))}`);
  if (out.proposal) {
    console.log(`\n  ${C.yellow(tr({ it: 'Suggerimento difficoltà', en: 'Difficulty suggestion' }))}: ${out.proposal.reason} -> trim ${signed(out.proposal.from)} / ${signed(out.proposal.to)}`);
    console.log(`  ${C.dim(tr({ it: 'difficulty --accept   oppure   difficulty --reject', en: 'difficulty --accept   or   difficulty --reject' }))}`);
  }
  if (out.file) {
    const gg = gridGuardProposal(out.file);
    if (gg) console.log(`\n${C.yellow(gg.msg)}`);
  }
  // vigia del bilancio perso: dopo la gara il customgrid può essere stato
  // risalvato dal menu con i valori a 0/0 — lo ricontrollo qui e in watch
  const zp = zeroBalanceProposal(CUSTOMGRID_FILE, { track: trackOfCurrentRound(ladder) });
  if (zp) console.log(`\n${C.yellow(zp.msg)}\n`);
  // vigia del campo AI: il menu può perdere/modificare l'intervallo 21/22
  const ap = aiRangeProposal(CUSTOMGRID_FILE);
  if (ap) console.log(`\n${C.yellow(ap.msg)}\n`);
  stampaCalib(out.calibrazione);
  if (out.agenda?.jump) console.log(`\n  ${C.green(tr({ it: 'Calendario portato avanti', en: 'Calendar moved forward' }))}: ${tr({ it: 'salto al giorno ', en: 'jumping to day ' })}${out.agenda.day} — ${tr({ it: 'i tuoi sedili non avevano gare dopo questa.', en: 'your seats had no races after this one.' })}`);
  if (out.seasonDone) {
    console.log(`\n  ${C.green(tr({ it: 'Stagione completata!', en: 'Season completed!' }))} ${C.dim('node ac-evo-career.mjs season-end')}`);
  }
  console.log(`\n${C.dim(tr({ it: 'Prossima gara:  node ac-evo-career.mjs next', en: 'Next race:  node ac-evo-career.mjs next' }))}\n`);
  return 0;
}

async function cmdWatch(args) {
  const { ladder, paths } = context();
  const secs = Math.max(3, Number(args.flags.every) || Math.round(WATCH_INTERVAL_MS / 1000));
  const baseline = Date.now(); // niente gare precedenti al via del watcher

  console.log(C.bold(tr({ it: `\n👁 watcher attivo — controllo ogni ${secs}s · Ctrl+C per uscire\n`, en: `\n👁 watcher active — checking every ${secs}s · Ctrl+C to exit\n` })));
  console.log(C.dim(tr({ it: '  Incassa da solo ogni gara che EVO scrive da adesso in poi (registro anti-doppioni e backup inclusi).\n', en: '  Collects every race EVO writes from now on by itself (anti-duplicate ledger and backup included).\n' })));
  console.log(C.dim(tr({ it: '  File risultati: ', en: 'Result files: ' }) + (paths.resultsDirs.join(', ') || tr({ it: '(nessuna cartella Results)', en: '(no Results folder)' })) + '\n'));

  let stop = false;
  const onSigint = () => { stop = true; };
  process.on('SIGINT', onSigint);

  // vigia del bilancio perso (grid-restore.mjs): preflight all'avvio, poi
  // ri-controllo SOLO quando il customgrid cambia (mtime): il menu di EVO
  // può risalvarlo in qualunque momento e cannare zavorre/penalità.
  let gridMtime = 0, gridWarned = false;
  const checkGridFile = (force = false) => {
    let m = 0;
    try { m = statSync(CUSTOMGRID_FILE).mtimeMs; } catch { return undefined; }
    if (!force && m === gridMtime) return undefined;   // file immutato: niente annuncio
    gridMtime = m;
    return zeroBalanceProposal(CUSTOMGRID_FILE, { track: trackOfCurrentRound(ladder) });
  };
  const preflight = checkGridFile(true);
  if (preflight) console.log(`\n  ${C.yellow(tr({ it: 'alla partenza:', en: 'at startup:' }))} ${tr({ it: 'customgrid senza bilancio — viene proposto qui sotto al primo giro', en: 'customgrid without balance — it is proposed below on the first pass' })}\n`);
  try {
    while (!stop) {
      const t0 = Date.now();
      heartbeat(secs); // il cruscotto capisce da qui che la guardia è viva
      const out = watchOnce(ladder, paths, { baselineMs: baseline });
      if (out.imported) {
        const e = out.imported.entry;
        console.log(C.green(tr({ it: `\n  ✓ imported: ${out.imported.node} round ${out.imported.round} — ${e.dsq ? tr({ it: 'squalifica', en: 'DSQ' }) : e.dnf ? tr({ it: 'ritiro', en: 'retired' }) : 'P' + e.position}/${e.gridSize}${e.fl ? tr({ it: ' · giro veloce', en: ' · fast lap' }) : ''} · +${e.points} pt · +${e.prize} €`, en: tr({ it: `\n  ✓ imported: ${out.imported.node} round ${out.imported.round} — ${e.dsq ? tr({ it: 'squalifica', en: 'DSQ' }) : e.dnf ? tr({ it: 'ritiro', en: 'retired' }) : 'P' + e.position}/${e.gridSize}${e.fl ? tr({ it: ' · giro veloce', en: ' · fast lap' }) : ''} · +${e.points} pt · +${e.prize} €`, en: `\n  ✓ imported: ${out.imported.node} round ${out.imported.round} — ${e.dsq ? tr({ it: 'squalifica', en: 'DSQ' }) : e.dnf ? tr({ it: 'ritiro', en: 'retired' }) : 'P' + e.position}/${e.gridSize}${e.fl ? tr({ it: ' · giro veloce', en: ' · fast lap' }) : ''} · +${e.points} pt · +${e.prize} €` }) })));
        console.log(`  ${C.dim(tr({ it: 'Banca: ', en: 'Bank: ' }) + out.imported.money + ' · rep ' + out.imported.rep)}`);
        if (out.imported.proposal) console.log(`  ${C.yellow(tr({ it: 'Suggerimento difficoltà', en: 'Difficulty suggestion' }))}: trim ${signed(out.imported.proposal.from)} / ${signed(out.imported.proposal.to)} — ${tr({ it: 'decidilo con difficulty --accept / --reject', en: 'decide with difficulty --accept / --reject' })}\n`);
        else console.log();
        if (out.imported.file) {
          const gg = gridGuardProposal(out.imported.file);
          if (gg) console.log(`${C.yellow(gg.msg)}\n`);
        }
        stampaCalib(out.imported.calibrazione);
        if (out.imported.agenda?.jump) console.log(`  ${C.green(tr({ it: '✓ calendario auto-avanzato', en: '✓ calendar auto-advanced' }))} ${tr({ it: 'al giorno', en: 'to day' })} ${out.imported.agenda.day} (${tr({ it: 'nessuna gara dei sedili dopo questa gara', en: 'no seat races after this race' })})\n`);
      } else if (out.error) {
        console.log(`  ${C.red(tr({ it: 'watcher:', en: 'watcher:' }))} ${out.error.message}\n`);
      }
      // vigia del bilancio perso: se il menu di EVO ha risalvato il customgrid
      // e ha cannato zavorre/penalità, RIPRISTINA da solo. Anche a gioco aperto
      // (scelta Mauro 20/10/2026: sul menù principale la scrittura regge — il
      // gioco rilegge il file al lancio del weekend). Casi pericoloso solo per
      // l'editor griglia di EVO: un suo risalvataggio cancellerebbe di nuovo
      // tutto, quindi in quel caso la nota d'uso va col messaggio.
      const zp = checkGridFile();
      if (zp) {
        const trackVigia = zp.track ?? trackOfCurrentRound(ladder);
        try {
          const out = applyBalance({ serie: zp.classe, track: trackVigia, force: gameRunning() });
          gridWarned = true;
          const notaGame = gameRunning()
            ? tr({ it: "\n  (EVO aperto: resta sul menù e NON aprire l'editor griglia, o un suo risalvataggio cancella di nuovo il bilancio)", en: "\n  (EVO open: stay on the menu and DO NOT open the grid editor, or a re-save wipes the balance again)" })
            : '';
          console.log(C.green(tr({ it: `\n  ✓ ripristino automatico: bilancio di "${out.classe}" riscritto sul customgrid${out.trkMsg ? out.trkMsg : ''}${notaGame}\n`, en: `\n  ✓ automatic restore: balance of "${out.classe}" rewritten on the customgrid${out.trkMsg ? out.trkMsg : ''}${notaGame}\n` })));
        } catch (e) { console.log(`\n${C.yellow(zp.msg)}\n`); if (e.code !== 'GAME_RUNNING') throw e; }
      }
      else if (zp === null && gridWarned) { gridWarned = false; console.log(C.green(tr({ it: '\n  ✓ bilancio ripristinato sul customgrid\n', en: '\n  ✓ balance restored on the customgrid\n' }))); }
      // vigia del campo AI: se l'intervallo 21/22 combacia col pin di classe non dice nulla;
      // se diverge, applica (a gioco chiuso ripristina da solo, come il bilancio)
      const ap = aiRangeProposal(CUSTOMGRID_FILE);
      if (ap) {
        try {
          const airOut = applyAi(ap.atteso, { force: gameRunning() });
          console.log(C.green(tr({ it: `\n  ✓ ripristino automatico: campo AI ${airOut.ai[0]}-${airOut.ai[1]} riscritto sul customgrid (trovato: ${ap.trovato[0]}-${ap.trovato[1]})\n`, en: `\n  ✓ automatic restore: AI field ${airOut.ai[0]}-${airOut.ai[1]} rewritten on the customgrid (found: ${ap.trovato[0]}-${ap.trovato[1]})\n` })));
        } catch (e) { console.log(`\n${C.yellow(ap.msg)}\n`); if (e.code !== 'GAME_RUNNING') throw e; }
      }
      // niente rumore quando una scansione non trova niente di nuovo
      const elapsed = Date.now() - t0;
      if (stop) break;
      await new Promise((r) => setTimeout(r, Math.max(250, secs * 1000 - elapsed)));
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
  console.log(tr({ it: '\n  watcher chiuso.\n', en: '\n  watcher closed.\n' }));
  return 0;
}

function cmdReview(args) {
  const { ladder } = context();
  const state = requireState();
  const seasons = reviewableSeasons(state);
  if (!seasons.length) { console.log(C.yellow(tr({ it: '\nAncora nessuna gara: la rassegna arriva dopo la prima stagione.\n', en: '\nNo races yet: the review arrives after the first season.\n' }))); return 0; }
  let wanted = seasons[0];
  if (Number.isFinite(Number(args.flags.season))) {
    wanted = Number(args.flags.season);
    if (!seasons.includes(wanted)) throw new Error(tr({ it: `Della stagione ${wanted} non ci sono gare registrate. Disponibili: ${seasons.join(', ')}.`, en: `Season ${wanted} has no recorded races. Available: ${seasons.join(', ')}.` }));
  }
  const r = seasonReview(ladder, state, { season: wanted });
  console.log('\n' + r.text.split('\n').map((l) => l
    .replace(/^#{1,2} /, () => C.bold(''))
    .replace(/\*\*(.+?)\*\*/g, (m, s1) => C.cyan(s1)))
    .join('\n') + '\n');
  if (args.flags.export) {
    const file = exportReview(r);
    console.log(C.green(tr({ it: `Rassegna salvata in ${file}\n`, en: `Review saved to ${file}\n` })));
  }
  return 0;
}

function cmdGazzetta() {
  const items = newsFeed(15);
  console.log(C.bold(tr({ it: '\n📰 Gazzetta del paddock\n', en: '\n📰 Paddock gazette\n' })));
  if (!items.length) { console.log(C.dim(tr({ it: '  Nessuna notizia: arrivano dopo la prima gara importata.\n', en: '  No news yet: they arrive after the first imported race.\n' }))); return 0; }
  for (const n of items) {
    console.log(`  ${C.dim(String(n.at ?? '').slice(0, 10))}  ${C.bold(n.title)}`);
    if (n.body) console.log(`    ${C.dim(n.body.split('\n').join('\n    '))}`);
  }
  console.log();
  return 0;
}

function cmdPiano() {
  const { ladder } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const rows = careerPlanner(ladder, state);
  console.log(C.bold(tr({ it: `\nPianificatore — stagione ${state.season + 1} · banca ${money(state.money)} · rep ${state.rep}\n`, en: `\nPlanner — season ${state.season + 1} · bank ${money(state.money)} · rep ${state.rep}\n` })));
  for (const r of rows.filter((x) => x.open || x.blockers.length).slice(0, 18)) {
    const mark = r.current ? C.green(tr({ it: '◄ attuale', en: '◄ current' })) : r.open ? C.cyan(tr({ it: 'aperta  ', en: 'open    ' })) : C.red(tr({ it: 'bloccata', en: 'locked' }));
    console.log(`  ${mark} ${C.bold(r.display.padEnd(26))} L${r.level}  ${tr({ it: 'affitto', en: 'rent' })} ${money(r.rent).padStart(7)} · ${tr({ it: 'premio', en: 'prize' })} ${money(r.prize).padStart(7)}  ${C.dim(r.blockers.join('; ') || tr({ it: 'gate superato', en: 'gate passed' }))}`);
  }
  console.log(C.dim(tr({ it: "\n  \"series\" per l'elenco completo con i gate.\n", en: '\n  "series" for the full list with its gates.\n' })));
  return 0;
}

function cmdSfida(args) {
  const { ladder } = context();
  const state = requireState();
  const c = challengeFor(ladder, state);
  if (!c) { console.log(C.yellow(tr({ it: '\nNessuna sfida disponibile (stagione chiusa o sfida già valutata).\n', en: '\nNo challenge available (season closed or challenge already scored).\n' }))); return 0; }
  if (args.flags.accept) {
    if (c.accepted) { console.log(C.yellow(tr({ it: `\nSfida già accettata: ${c.text}\n`, en: `\nChallenge already accepted: ${c.text}\n` }))); return 0; }
    acceptChallenge(state, c);
    saveState(SAVE_FILE, state);
    console.log(C.green(tr({ it: `\nSfida accettata: ${c.text}`, en: `\nChallenge accepted: ${c.text}` })));
    console.log(C.dim(tr({ it: `  premio ${c.reward} € se ci riesci, -${c.penalty} rep se fallisci.\n`, en: `  reward ${c.reward} € if you make it, -${c.penalty} rep if you fail.\n` })));
    return 0;
  }
  console.log(C.bold(tr({ it: `\nSfida della ronda — ${c.text}\n`, en: `\nRound challenge — ${c.text}\n` })));
  console.log(`  ${C.dim(tr({ it: `facoltativa · premio ${c.reward} € · penale -${c.penalty} rep · accetta con: sfida --accept\n`, en: `optional · reward ${c.reward} € · penalty -${c.penalty} rep · accept with: challenge --accept\n` }))}`);
  return 0;
}

function cmdDottore(args) {
  const { ladder } = context();
  const state = requireState();
  const issues = checkIntegrity(ladder, state);
  if (!issues.length) {
    console.log(C.green(tr({ it: '\nCarriera sotto controllo: gare, statistiche, cassa e bacheca tornano.\n', en: '\nCareer under control: races, stats, bank and bulletin board all check out.\n' })));
    return 0;
  }
  console.log(C.yellow(tr({ it: `\nTrovate ${issues.length} anomalie:\n`, en: `\nFound ${issues.length} anomalies:\n` })));
  for (const i of issues) console.log(`  ${i.severity === 'high' ? C.red('•') : C.yellow('•')} ${i.text}`);
  if (args.flags.fix) {
    const out = fixIntegrity(ladder, state);
    if (out.fixed.length) {
      console.log(C.green(tr({ it: '\nCorretto:', en: '\nRepaired:' })));
      for (const f of out.fixed) console.log(`  ✓ ${f}`);
    }
    const rest = out.issues.filter((i) => !out.fixed.length || !i.text.includes('dice'));
    if (rest.length) {
      console.log(C.dim(tr({ it: '\nRestano da verificare a mano (nessuna correzione automatica possibile):', en: '\nStill to verify by hand (no automatic repair possible):' })));
      for (const i of rest) console.log(`  • ${i.text}`);
    }
  } else {
    console.log(C.dim(tr({ it: '\nCorreggi con:  node ac-evo-career.mjs dottore --fix\n', en: '\nRepair with:  node ac-evo-career.mjs dottore --fix\n' })));
  }
  return 0;
}

// PULISCI — manutenzione della carriera (23/10/2026): lo stesso rione Manutenzione
// della webui, da riga di comando. Il dottore che ripara e le liste che si puliscono.
function cmdPulisci(args) {
  const { ladder } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const persistState = () => saveState(SAVE_FILE, state);
  let did = false;

  if (args.flags.auto) {
    const out = autoRepair(ladder, state, { persist: persistState });
    if (!out.issues.length) console.log(C.green(tr({ it: '  Scansione completa: tutto torna.', en: '  Full scan: everything checks out.' })));
    else if (out.fixed.length) { console.log(C.green(tr({ it: `  Scansione + riparazione: corretti ${out.fixed.length} valori:`, en: `  Scan + repair: fixed ${out.fixed.length} values:` }))); for (const f of out.fixed) console.log(`    ✓ ${f}`); did = true; }
    else { console.log(C.yellow(tr({ it: `  ${out.issues.length} anomalie restano (verificabili con "dottore")`, en: `  ${out.issues.length} issues remain (check with "dottore")` }))); did = true; }
  } else if (!args.flags.bacheca && !args.flags.ledger && !args.flags['flows-reseed'] && !args.flags['flows-dedup'] && !args.flags.yes) {
    // senza nessuna opzione: solo la scansione (letta sempre dalle fonti vive) e il riepilogo di ciò che si può fare
    const { issues } = scanCareer(ladder, state);
    if (!issues.length) console.log(C.green(tr({ it: '\nScansione completa: tutto torna.\n', en: '\nFull scan: everything checks out.\n' })));
    else {
      console.log(C.yellow(tr({ it: `\nScansione completa: ${issues.length} anomalie:\n`, en: '\nFull scan: found anomalies:\n' })));
      for (const i of issues) console.log(`  ${i.severity === 'high' ? C.red('•') : C.yellow('•')} ${i.text}`);
      console.log(C.dim(`\n  ${tr({ it: 'Ripara ciò che si può:  node ac-evo-career.mjs pulisci --auto', en: 'Repair what can be fixed:  node ac-evo-career.mjs pulisci --auto' })}\n`));
    }
    console.log(C.dim(tr({ it: 'Pulizie con conferma:  --bacheca (svuota annunci) · --ledger (registro import) · --flows-reseed (flussi dal salvataggio) · --flows-dedup (doppioni) — tutte richiedono --yes.', en: 'Cleanups need confirmation:  --bacheca (clear posts) · --ledger (import ledger) · --flows-reseed (flows from the save) · --flows-dedup (duplicates) — all need --yes.' })));
    return 0;
  }

  const YES = !!args.flags.yes;
  const need = () => { if (!YES) { console.log(C.yellow(tr({ it: '  Serve --yes per confermare una pulizia (tocca liste di memoria: non tornano indietro).', en: '  Confirm with --yes (this touches memory lists: no way back).' }))); process.exitCode = 1; return false; } return true; };

  if (args.flags.bacheca && need()) {
    const r = clearBacheca(state, { persist: persistState });
    console.log(C.green(`  ${tr({ it: 'Bacheca svuotata:', en: 'Board cleared:' })} ${r.removed} ${tr({ it: 'annunci cancellati (la traccia resta in bacheca).', en: 'posts removed (a trace stays on the board).' })}`)); did = true;
  }
  if (args.flags.ledger && need()) {
    resetLedger();
    console.log(C.green(tr({ it: '  Registro anti-doppioni azzerato: da qui un file già incassato può volere un nuovo incasso se lo re-importi a mano.', en: '  Anti-duplicate ledger reset: from now on an already banked file can be banked again by hand.' }))); did = true;
  }
  if (args.flags['flows-reseed'] && need()) {
    reseedFlows(state, { persist: persistState });
    console.log(C.green(tr({ it: '  Registro flussi ricalcolato dal salvataggio attuale (una riga di seme, cassa e rep allineate).', en: '  Flow ledger re-seeded from the current save (one seed row; money and rep aligned).' }))); did = true;
  }
  if (args.flags['flows-dedup'] && need()) {
    const r = flowDedup();
    console.log(C.green(`  ${tr({ it: 'Doppioni esatti tolti:', en: 'Exact duplicates removed:' })} ${r.removed} (${tr({ it: 'restano', en: 'left' })} ${r.kept}).`)); did = true;
  }
  if (!did && !args.flags.auto) return 0;
  return 0;
}

function cmdDifficulty(args) {
  const { ladder } = context();
  const state = requireState();

  if (args.flags.mode) {
    const mode = String(args.flags.mode);
    if (!['adaptive', 'fixed', 'custom'].includes(mode)) throw new Error(tr({ it: "--mode vuole adaptive, fixed oppure custom.", en: '--mode wants adaptive, fixed or custom.' }));
    state.difficulty.mode = mode;
    state.difficulty.base ??= {};
    state.difficulty.trim ??= {};
    if (mode === 'fixed') {
      const value = Number(args.flags.value ?? 95);
      if (!Number.isFinite(value) || value < 70 || value > 120) {
        throw new Error(tr({ it: '--value vuole un numero fra 70 e 120 (scala interna, come nel modello originario).', en: '--value wants a number between 70 and 120 (internal scale, like the original model).' }));
      }
      for (const node of ladder.nodes) state.difficulty.base[node.nodeId] = value;
      state.difficulty.trim = {};
    }
    if (mode === 'adaptive') {
      state.difficulty.base = {};
      state.difficulty.pending = null;
    }
    pushMessage(state, tr({ it: `Difficoltà AI impostata su "${mode}"${args.flags.value ? ` (valore ${args.flags.value})` : ''}.`, en: `AI difficulty set to "${mode}"${args.flags.value ? ` (value ${args.flags.value})` : ''}.` }), 'info');
    saveState(SAVE_FILE, state);
    console.log(C.green(tr({ it: `\nModalità difficoltà: ${mode}\n`, en: `\nDifficulty mode: ${mode}\n` })));
    return 0;
  }
  if (args.flags.lock || args.flags.unlock) {
    const id = String(args.flags.lock ?? args.flags.unlock);
    nodeById(ladder, id); // valida
    const list = new Set(state.difficulty.locked);
    if (args.flags.lock) list.add(id); else list.delete(id);
    state.difficulty.locked = [...list];
    saveState(SAVE_FILE, state);
    console.log(C.green(tr({ it: `\n${id}: difficoltà ${args.flags.lock ? 'bloccata' : 'sbloccata'}.\n`, en: `\n${id}: difficulty ${args.flags.lock ? 'locked' : 'unlocked'}.\n` })));
    return 0;
  }
  if (args.flags.accept || args.flags.reject) {
    const pending = state.difficulty.pending;
    if (!pending) { console.log(C.yellow(tr({ it: '\nNessun suggerimento in attesa.\n', en: '\nNo pending suggestion.\n' }))); return 0; }
    if (args.flags.accept) {
      state.difficulty.trim[pending.nodeId] = pending.to;
      pushMessage(state, tr({ it: `Difficoltà di ${nodeById(ladder, pending.nodeId).display} portata a trim ${pending.to >= 0 ? '+' : ''}${pending.to} (${pending.reason}).`, en: `Difficulty of ${nodeById(ladder, pending.nodeId).display} moved to trim ${pending.to >= 0 ? '+' : ''}${pending.to} (${pending.reason}).` }), 'info');
      console.log(C.green(`\nTrim ${pending.nodeId}: ${pending.from} -> ${pending.to}\n`));
    } else {
      console.log(C.yellow(tr({ it: `\nSuggerimento rifiutato: trim resta a ${pending.from}.\n`, en: `\nSuggestion rejected: trim stays at ${pending.from}.\n` })));
    }
    state.difficulty.pending = null;
    saveState(SAVE_FILE, state);
    return 0;
  }

  // trim manuale:  difficulty --trim gt86_cup +12   (o "all" per tutte le serie, o solo il valore per la serie attuale)
  if (args.flags.trim != null) {
    const tokens = [String(args.flags.trim), ...args._.slice(1)].join(' ');
    const parts = tokens.split(/[=\s,:]+/).filter(Boolean);
    let id = typeof args.flags.node === 'string' ? args.flags.node : null;
    let val = null;
    for (const p of parts) {
      if (/^[+-]?\d+$/.test(p)) val = Number(p);
      else id = p;
    }
    if (val == null || !Number.isFinite(val)) {
      throw new Error(tr({ it: 'Uso: difficulty --trim <serie|all> <valore>   (es. difficulty --trim gt86_cup +12, intervallo -20..+20).', en: 'Usage: difficulty --trim <series|all> <value>   (e.g. difficulty --trim gt86_cup +12, range -20..+20).' }));
    }
    val = Math.max(-20, Math.min(20, Math.round(val)));
    const scopeAll = (id === 'all');
    const targets = scopeAll
      ? ladder.nodes.map((n) => n.nodeId)
      : [nodeById(ladder, id ?? state.node).nodeId];
    state.difficulty.trim ??= {};
    for (const t of targets) state.difficulty.trim[t] = val;
    state.difficulty.pending = null;
    pushMessage(state, tr({ it: `Difficoltà regolata a mano: trim ${val >= 0 ? '+' : ''}${val} su ${scopeAll ? 'tutte le serie' : nodeById(ladder, targets[0]).display}.`, en: `Difficulty set by hand: trim ${val >= 0 ? '+' : ''}${val} on ${scopeAll ? 'all series' : nodeById(ladder, targets[0]).display}.` }), 'info');
    saveState(SAVE_FILE, state);
    console.log(C.green(tr({ it: `\nTrim ${val >= 0 ? '+' : ''}${val} applicato a: ${targets.join(', ')}\n`, en: `\nTrim ${val >= 0 ? '+' : ''}${val} applied to: ${targets.join(', ')}\n` })));
    return 0;
  }

  console.log(C.bold(tr({ it: `\nDifficoltà AI — modalità ${state.difficulty.mode}\n`, en: `\nAI difficulty — mode ${state.difficulty.mode}\n` })));
  const byDiscipline = new Map();
  for (const node of ladder.nodes) {
    const track = node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track;
    const d = difficultyFor(ladder, state, node, track);
    byDiscipline.set(node.discipline, [...(byDiscipline.get(node.discipline) ?? []), { node, d }]);
  }
  for (const [disc, rows] of byDiscipline) {
    console.log(` ${C.bold(disciplineName(ladder, disc))}`);
    for (const { node, d } of rows.sort((a, b) => a.node.level - b.node.level)) {
      const lock = d.locked ? C.yellow(tr({ it: ' [bloccata]', en: ' [locked]' })) : '';;
      const current = node.nodeId === state.node ? C.green('◄') : ' ';
      console.log(`   ${current} ${node.display.padEnd(26)} base ${d.base.toFixed(0).padStart(3)}  trim ${(d.trim >= 0 ? '+' : '') + d.trim}  ${tr({ it: 'classe', en: 'class' })} ${(d.offClass >= 0 ? '+' : '') + d.offClass}  ${tr({ it: 'pista', en: 'track' })} ${(d.offTrack >= 0 ? '+' : '') + d.offTrack}  = ${d.total.toFixed(0).padStart(3)}  slider ${String(d.slider).padStart(3)}%${lock}`);
    }
    console.log();
  }
  if (state.difficulty.pending) {
    const p = state.difficulty.pending;
    console.log(`  ${C.yellow(tr({ it: 'In attesa', en: 'Waiting' }))}: ${nodeById(ladder, p.nodeId).display} — ${p.reason} -> trim ${p.to >= 0 ? '+' : ''}${p.to}`);
    console.log(C.dim(tr({ it: '  difficulty --accept   oppure   difficulty --reject\n', en: '  difficulty --accept   or   difficulty --reject\n' })));
  }
  return 0;
}

function cmdSeasonEnd(args) {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const played = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).length;
  if (played < node.calendar.length && !args.flags.force) {
    throw new Error(tr({ it: `Stagione ${state.season} in ${node.display}: ${played}/${node.calendar.length} gare disputate.\nUsa --force per chiudere comunque.`, en: `Season ${state.season} in ${node.display}: ${played}/${node.calendar.length} races run.\nUse --force to close anyway.` }));
  }
  const result = seasonEnd(ladder, state);
  saveState(SAVE_FILE, state);

  console.log(C.bold(tr({ it: `\nFine stagione ${state.season - 1} — ${node.display}\n`, en: `\nEnd of season ${state.season - 1} — ${node.display}\n` })));
  console.log(`  ${result.champion ? C.green(tr({ it: 'CAMPIONE', en: 'CHAMPION' })) : tr({ it: 'Posizione finale: P', en: 'Final position: P' }) + result.me.position} — ${result.me.points} ${tr({ it: 'punti', en: 'points' })}${result.bonus ? tr({ it: '  bonus titolo +' + money(result.bonus), en: '  title bonus +' + money(result.bonus) }) : ''}`);
  console.log(`\n  ${C.bold(tr({ it: 'Offerte di sedile per la stagione ' + state.season, en: 'Seat offers for season ' + state.season }))}`);
  for (const o of result.offers) {
    const notaOfferta = o.note + tr({
      it: ' · affitto ' + money(o.rent) + (o.access === 'closed' ? ' · parco chiuso' : ''),
      en: ' · rent ' + money(o.rent) + (o.access === 'closed' ? ' · closed grid' : ''),
    });
    console.log(`   ${C.cyan(String(o.index) + ')')} ${o.display.padEnd(26)} L${o.level} ${disciplineName(ladder, o.discipline).padEnd(14)} ${C.dim(notaOfferta)}`);
  }
  console.log(C.dim(tr({ it: '\n  accept <n> per firmare un contratto, oppure "series" per vedere tutto.\n', en: '\n  accept <n> to sign a contract, or "series" to see everything.\n' })));
  return 0;
}

function cmdAccept(args) {
  const { ladder } = context();
  const state = requireState();
  const index = Number(args._[1]);
  if (!Number.isFinite(index)) throw new Error(tr({ it: "Uso: accept <n> (il numero dell'offerta mostrato da season-end o messages).", en: 'Usage: accept <n> (the offer number shown by season-end or messages).' }));
  const node = acceptOffer(ladder, state, index);
  saveState(SAVE_FILE, state);
  console.log(C.green(tr({ it: `\nContratto firmato: ${node.display} (livello ${node.level}, ${disciplineName(ladder, node.discipline)})\n`, en: `\nContract signed: ${node.display} (level ${node.level}, ${disciplineName(ladder, node.discipline)})\n` })));
  console.log(C.dim('  node ac-evo-career.mjs next\n'));
  return 0;
}

function cmdEnter(args) {
  const { ladder } = context();
  const state = requireState();
  const id = args._[1];
  if (!id) throw new Error(tr({ it: 'Uso: enter <nodeId> [--buy] [--force]', en: 'Usage: enter <nodeId> [--buy] [--force]' }));
  const node = nodeById(ladder, id);
  enterNode(ladder, state, node, { buy: !!args.flags.buy, force: !!args.flags.force });
  saveState(SAVE_FILE, state);
  console.log(C.green(tr({ it: `\nSedile ${node.display}: ${node.econ.buy === 0 ? 'contratto ufficiale' : args.flags.buy ? 'comprato' : 'affittato'}.`, en: `\nSeat ${node.display}: ${node.econ.buy === 0 ? 'official contract' : args.flags.buy ? 'bought' : 'rented'}.` })));
  console.log(`  ${tr({ it: 'Banca:', en: 'Bank:' })} ${money(state.money)}   ${tr({ it: 'Round', en: 'Round' })} ${state.round + 1}/${node.calendar.length}\n`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* griglia: prepara il customgrid della gara del giorno                 */
/* ------------------------------------------------------------------ */

async function cmdGriglia(args) {
  const isGameOn = await isGameRunning();
  if (isGameOn && !args.flags.force) {
    // la 7ª prova (19/10) l'ha certificata: a EVO APERTO la scrittura funziona —
    // il menu ricarica il file a ogni entrata (verificato: 15 Daytona SP3 visti
    // in UI dopo la scrittura a gioco aperto). Le due regole ferme restano:
    // scrivere solo dalla schermata PRINCIPALE (mai dal menu griglia, il menu
    // griglia non rilegge a runtime) e mai col GENERA aperto (riscrive il file
    // col range in memoria della UI). In quelle condizioni: promemoria, e via.
    console.log(C.yellow(tr({ it: '\nEVO è aperto: ok scrivere lo stesso (menu ricarica il file a ogni entrata).', en: '\nEVO is open: writing anyway is fine (the menu re-reads the file on every entry).' })) + C.dim(tr({ it: '\nMa solo da (o verso) la schermata PRINCIPALE: non stare nel menu griglia, e non usare GENERA dopo la scrittura (riscriverebbe il file).\n', en: '\nBut only from (or to) the MAIN screen: do not stay in the grid menu, and do not use GENERATE after writing (it would rewrite the file).\n' })));
  }
  appEnv(); // la lingua del config vale anche qui
  const ladder = loadLadder();
  const state = loadState(SAVE_FILE);
  const nodeId = typeof args.flags.serie === 'string' ? args.flags.serie : state.node;
  if (!nodeId) throw new Error(tr({ it: 'nessuna serie corrente: usa --serie <nodeId>', en: 'no current series: use --serie <nodeId>' }));
  // round: quello segnato in attesa dallo stato (round corrente della serie)
  const roundIndex = typeof args.flags.round === 'string' ? Number(args.flags.round) : (state.round ?? 0);
  // --template: costruisce da un file DIVERSO dall'attuale (es. il backup
  // d'epoca multi-marca del 21/10 ore 12:34); la scrittura va SEMPRE su
  // last_grid.customgrid, con il suo backup (lezione 21/10 16:5x: nel primo
  // giro il flag sovrascriveva il template stesso — recuperato dal backup).
  const file = join(GAME_MODES_DIR, 'last_grid.customgrid');
  const tplFile = typeof args.flags.template === 'string' ? args.flags.template : file;

  const { buffer, report } = buildGridMessage({ ladder, nodeId, roundIndex, file: tplFile });
  const C_ = C;
  console.log(C_.bold(tr({ it: `\nGriglia della gara del giorno\n`, en: `\nGrid of the race of the day\n` })));
  console.log(`  serie   ${report.serie}`);
  console.log(`  celle   ${report.gridSize} da ${report.source.split('/').pop()}`);
  if (report.poolMulti) console.log(`  pool    ${report.poolMulti}`);
  console.log(`  bilanc. ${report.origine}`);
  if (report.ai) console.log(tr({ it: `  abilità ${report.ai} → i piloti vengono riscalati a quel campo`, en: `  skill ${report.ai} → drivers are rescaled to that field` }));
  const byCar = {};
  for (const c of report.celle) byCar[c.split(' →')[0]] = byCar[c.split(' →')[0]] ?? c;
  for (const [car, line] of Object.entries(byCar)) console.log(`    ${car.padEnd(34)} ${line.split('→ ')[1] ?? ''}`);
  if (args.flags.dry) { console.log(C_.dim(tr({ it: '\nDRY: niente scritto. Lancia senza --dry per scrivere.\n', en: '\nDRY: nothing written. Run without --dry to write.\n' }))); return 0; }

  const bak = `${file}.bak-griglia-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  copySyncGrid(file, bak);
  pruneBackups(file);
  writeFileSync(`${file}.tmp`, buffer);
  renameSync(`${file}.tmp`, file);
  console.log(C_.green(tr({ it: `\nScritto ${file}`, en: `\nWritten ${file}` })));
  if (args.flags['servo-prepara']) return 0;
  console.log(C_.dim(tr({ it: `  backup: ${bak}\n  prossimi passi: apri EVO → menu griglia (SENZA GENERA) → controlla → APPLICA → gara.\n`, en: `  backup: ${bak}\n  next steps: open EVO → grid menu (NO GENERATE) → check → APPLY → race.\n` })));
  return 0;
}

function stampaCalib(calib) {
  if (!calib) return;
  if (!calib.proposte?.length) {
    console.log(`  ${C.dim(tr({ it: `calibrazione: ${calib.segnale} · confidenza "${calib.confidenza}" su ${calib.obs} gare (${calib.traccia}) — registro: data/grid-calibrazione.json`, en: `calibration: ${calib.segnale} · confidence "${calib.confidenza}" over ${calib.obs} races (${calib.traccia}) — ledger: data/grid-calibrazione.json` }))}`);
    return;
  }
  console.log(`\n  ${C.bold(tr({ it: 'Calibrazione dai risultati', en: 'Calibration from results' }))} — ${calib.classe} · ${calib.traccia} (${C.yellow(calib.segnale)})`);
  for (const p of calib.proposte) {
    console.log(`    ${C.yellow('•')} ${p.perche}`);
    console.log(`      ${C.dim(p.leva === 'campo-ai' ? `campo AI ${p.da} → ${C.bold(p.a)}` : `${p.auto}: ${p.da} → ${C.bold(p.a)}`)}`);
    if (p.comando) console.log(`      ${C.dim('→ ' + p.comando)}`);
  }
  console.log(`  ${C.dim(tr({ it: 'riepilogo e storico: node ac-evo-career.mjs griglia-calib', en: 'summary and history: node ac-evo-career.mjs griglia-calib' }))}`);
}

const fmtSec = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + 's');

/** OROLOGIO DELLE GARE (orario.mjs): piani notte/crepuscolo/alba/tramontoalba/
 *  variabile per round di una serie, + patch diretta del gamemodesave per la
 *  gara corrente. Richiesta Mauro 21/10/2026. */
async function cmdOrario(args) {
  const { ladder } = context();
  const pianok = args._[1] ?? null;   // args._[0] è il comando "orario"
  // senza argomenti: mostra i piani e lo stato del round corrente
  if (!pianok) {
    console.log(C.bold(tr({ it: '\nOrario piani (orario.mjs):', en: '\nRace-time plans (orario.mjs):' })));
    for (const [id, p] of Object.entries(PIANI)) {
      console.log(`  ${C.yellow(id.padEnd(14))} ${p.desc}`);
    }
    const cur = currentRaceTime();
    if (cur) console.log(C.dim(tr({ it: `\n  Gamemodesave: gara ora ${cur.hour}:${String(cur.minute ?? 0).padStart(2, '0')} · scala tempo ${cur.scale}x (sessioni: ${cur.blocchi.join(', ')})`, en: `\n  Gamemodesave: race now ${cur.hour}:${String(cur.minute ?? 0).padStart(2, '0')} · time scale ${cur.scale}x (sessions: ${cur.blocchi.join(', ')})` })));
    console.log(C.dim(tr({ it: '\n  Uso: orario <piano> --serie <nodeId> [--da 0 --a 6] [--dry]', en: '\n  Usage: orario <plan> --serie <nodeId> [--da 0 --a 6] [--dry]' })));
    console.log(C.dim(tr({ it: "       orario --ora 21 --scala 48        (gara corrente: tramonto->alba)", en: '       orario --ora 21 --scala 48        (current race: sunset->dawn)' })));
    return 0;
  }
  const serie = args.flags.serie ?? null;
  const dry = !!args.flags.dry;
  if (serie) {
    const da = args.flags.da != null ? Number(args.flags.da) : 0;
    const a = args.flags.a != null ? Number(args.flags.a) : null;
    const rep = applyPianoToCalendar(ladder, serie, pianok, { da, a, dry });
    console.log(`\n  ${tr({ it: 'Piano', en: 'Plan' })} ${C.bold(rep.piano)} ${tr({ it: 'su', en: 'on' })} ${C.bold(serie)}${dry ? ' [dry]' : tr({ it: ' drafts ladder: hours e timeScale scritti nel calendario', en: ' drafts ladder: hours and timeScale written into the calendar' })}\n`);
    for (const r of rep.righe) {
      console.log(`    R${r.round + 1} ${r.name}: ${r.prima.hour ?? '—'}h/${String(r.prima.timeScale ?? '—')}x → ${C.bold(`${r.dopo.hour}h/${r.dopo.timeScale}x`)}`);
    }
    return 0;
  }
  // senza --serie: comanda ORA/scala del gamemodesave per la gara corrente
  const hour = args.flags.ora != null ? Number(args.flags.ora) : null;
  const scale = args.flags.scala != null ? Number(args.flags.scala) : null;
  const minute = args.flags.min != null ? Number(args.flags.min) : null;
  if (hour == null && scale == null && minute == null) {
    const cur = currentRaceTime();
    if (!cur) { console.log(C.red(tr({ it: '\n  gamemodesave non leggibile.\n', en: '\n  gamemodesave not readable.\n' }))); return 1; }
    console.log(`\n  ${tr({ it: 'Gara ora', en: 'Race now' })} ${cur.hour}:${String(cur.minute ?? 0).padStart(2, '0')} · ${tr({ it: 'scala', en: 'scale' })} ${cur.scale}x\n`);
    return 0;
  }
  const r = setRaceTime({ hour, minute, scale, dry });
  console.log(`\n  ${dry ? '[dry] ' : ''}${tr({ it: 'Ora=', en: 'Hour=' })}${r.spec.hour ?? '—'} ${tr({ it: 'scala=', en: 'scale=' })}${r.spec.scale ?? '—'}x → ${r.changed}/${r.blocchi} ${tr({ it: 'blocchi', en: 'blocks' })}${r.written ? ` · ${tr({ it: 'backup', en: 'backup' })} ${r.backup}` : ''}\n`);
  return 0;
}

function cmdTestMode(args) {
  if (args.flags.on || args.flags.giri) {
    const out = testModeOn({ giri: args.flags.giri ? Number(args.flags.giri) : 3 });
    if (out.already) {
      console.log(C.yellow(tr({ it: `\nModalità test già attiva a ${out.giri} giri.\n`, en: `\nTest mode already active at ${out.giri} laps.\n` })));
      return 0;
    }
    console.log(C.yellow(tr({ it: `\n⚠  MODALITÀ TEST ATTIVATA: tutte le gare della scala a ${out.giri} giri (${out.rond} rond toccate).`, en: `\n⚠  TEST MODE ON: every ladder race at ${out.giri} laps (${out.rond} rounds touched).` })));
    console.log(C.dim(tr({ it: '  Banner in status/next/agenda finché non spegni. Riattiva le distanze vere con: test-mode --off\n', en: '  Banner in status/next/agenda until you switch it off. Restore the real distances with: test-mode --off\n' })));
    try {
      context();
      const state = requireState();
      pushMessage(state, tr({ it: `Modalità test attiva: tutte le gare a ${out.giri} giri (richiesta Mauro 19/10). Riattiva con: node ac-evo-career.mjs test-mode --off`, en: `Test mode active: all races at ${out.giri} laps. Restore with: node ac-evo-career.mjs test-mode --off` }), 'info');
      saveState(SAVE_FILE, state);
    } catch { /* senza carriera il banner CLI basta */ }
    return 0;
  }
  if (args.flags.off) {
    const out = testModeOff();
    if (out.already) { console.log(C.dim(tr({ it: '\nModalità test non attiva (nulla da ripristinare).\n', en: '\nTest mode not active (nothing to restore).\n' }))); return 0; }
    console.log(C.green(tr({ it: `\n✓ Distanze originali ripristinate su ${out.ripristinate} rond${out.mancanti ? ` (${out.mancanti} senza riferimento originale: lasciate come sono)` : ''}.\n`, en: `\n✓ Original distances restored on ${out.ripristinate} rounds${out.mancanti ? ` (${out.mancanti} without an original reference: left as they are)` : ''}.\n` })));
    return 0;
  }
  const banner = testModeBanner();
  console.log(banner ? C.yellow('\n' + banner + '\n') : C.dim(tr({ it: '\nModalità test spenta: le gare seguono i giri originali dei calendari.\n', en: '\nTest mode off: races follow the original calendar laps.\n' }))); 
  return 0;
}

async function cmdGrigliaCalib(args) {
  if (args.flags.reset) { resetCalib(); console.log(`\n  ${tr({ it: 'Registro calibrazione azzerato (data/grid-calibrazione.json).', en: 'Calibration ledger reset (data/grid-calibrazione.json).' })}\n`); return 0; }
  if (args.flags.convalida !== undefined) {
    const track = typeof args.flags.convalida === 'string' ? args.flags.convalida : null;
    const out = appuntaConvalida({ trkKey: track, dry: !!args.flags.dry });
    if (!out.messaggio.length) {
      console.log(C.yellow(tr({ it: '\n  Nessuna classe+traccia con confidenza ALTA da appuntare.', en: '\n  No class+track with HIGH confidence to record.' })));
      console.log(C.dim(tr({ it: '  (la confidenza alta arriva dopo ≥2 gare con i supplementi in pace con la base)\n', en: '  (high confidence arrives after ≥2 races with the supplements in peace with the base)\n' })));
      return 0;
    }
    console.log('\n' + out.messaggio.map((m) => '  ' + m).join('\n') + '\n');
    if (args.flags.dry) console.log(C.dim(tr({ it: '  (dry run: niente scritto. Lancia senza --dry per applicare)\n', en: '  (dry run: nothing written. Run without --dry to apply)\n' })));
    return 0;
  }
  const sum = calibSummary();
  console.log(C.bold(tr({ it: `\nCalibrazione dai risultati — ${sum.eventi} gare in registro (${calibFile()})\n`, en: `\nCalibration from results — ${sum.eventi} races in the ledger (${calibFile()})\n` })));
  if (!sum.gruppi.length) {
    console.log(C.dim(tr({ it: '  Vuoto: il registro si riempe da solo ad ogni import di gara con auto di una classe conosciuta.\n', en: '  Empty: the ledger fills itself at every race import with cars from a known class.\n' })));
    return 0;
  }
  for (const g of sum.gruppi) {
    const conf = { alta: C.green, media: C.yellow, bassa: C.red, nessuna: C.dim }[g.confidenza] ?? C.dim;
    console.log(`  ${C.bold(g.classe)} · ${C.cyan(g.trkKey)} — ${g.obs} ${tr({ it: 'gare', en: 'races' })} (${g.ok} ${tr({ it: 'in tolleranza', en: 'in tolerance' })}) · ${tr({ it: 'confidenza', en: 'confidence' })} ${conf(g.confidenza)}${g.convalidatoAdesso ? C.green(tr({ it: ' · convalidata', en: ' · validated' })) : ''}${g.scartate ? C.red(tr({ it: ` · ${g.scartate} scartate (dati impossibili)`, en: ` · ${g.scartate} discarded (impossible data)` })) : ''}`);
    for (const a of g.perAuto.slice(0, 8)) {
      const mark = a.medSec <= -0.8 ? C.red : a.medSec < 0.8 ? C.green : C.dim;
      console.log(`      ${a.auto.padEnd(34)} ${mark(fmtSec(a.medSec))} ${tr({ it: 'dalla base', en: 'from the base' })}`);
    }
    if (g.ultimaProposta.length) {
      for (const p of g.ultimaProposta) {
        console.log(`      ${C.yellow(tr({ it: 'proposta', en: 'proposal' }))} ${p.leva === 'campo-ai' ? tr({ it: `campo AI ${p.da} → ${C.bold(p.a)}`, en: `AI field ${p.da} → ${C.bold(p.a)}` }) : tr({ it: `${p.auto}: ${p.da} → ${C.bold(p.a)}`, en: `${p.auto}: ${p.da} → ${C.bold(p.a)}` })}  ${C.dim(p.perche)}`);
        if (p.comando) console.log(`        ${C.dim('→ ' + p.comando)}`);
      }
    }
    if (g.suggerisciConvalida) console.log(`      ${C.green(tr({ it: 'convalidabile ora:', en: 'can be validated now:' }))} ${C.bold(`griglia-calib --convalida "${g.trkKey}"`)}  ${C.dim(tr({ it: '(o solo in lettura: --convalida --dry)', en: '(or read-only: --convalida --dry)' }))}`);
  }
  console.log();
  return 0;
}

/* ------------------------------------------------------------------ */
/* dispatch                                                            */
/* ------------------------------------------------------------------ */

export async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0] ?? 'help';
  try {
    switch (command) {
      case 'help': case '--help': case '-h': return cmdHelp();
      case 'setup': return cmdSetup(args);
      case 'content': return cmdContent(args);
      case 'new': return cmdNew(args);
      case 'rinomina': case 'rename': return cmdRinomina(args);
      case 'status': return cmdStatus(args);
      case 'series': return cmdSeries(args);
      case 'calendar': return cmdCalendar(args);
      case 'standings': return cmdStandings(args);
      case 'paddock': return cmdPaddock(args);
      case 'messages': return cmdMessages(args);
      case 'next': return cmdNext(args);
      case 'race': return await cmdRace(args);
      case 'prepara': case 'prep': return await cmdPrepara(args);
      case 'import': return cmdImport(args);
      case 'watch': return await cmdWatch(args);
      case 'difficulty': return cmdDifficulty(args);
      case 'season-end': return cmdSeasonEnd(args);
      case 'review': return cmdReview(args);
      case 'gazzetta': case 'news': return cmdGazzetta(args);
      case 'piano': case 'planner': return cmdPiano(args);
      case 'sfida': case 'challenge': return cmdSfida(args);
      case 'dottore': return cmdDottore(args);
      case 'pulisci': case 'clean': return cmdPulisci(args);
      case 'accept': return cmdAccept(args);
      case 'griglia': case 'grid': return await cmdGriglia(args);
      case 'griglia-calib': case 'grid-calib': return await cmdGrigliaCalib(args);
      case 'test-mode': case 'testmode': return cmdTestMode(args);
      case 'orario': case 'orari': return cmdOrario(args);
      case 'enter': return cmdEnter(args);
      case 'agenda': return cmdAgenda(args);
      default:
        console.log(C.yellow(tr({ it: `\nComando "${command}" non riconosciuto.`, en: `\nCommand "${command}" not recognized.` })));
        cmdHelp();
        return 1;
    }
  } catch (e) {
    console.error(`\n${C.red(tr({ it: 'Errore:', en: 'Error:' }))} ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    return 1;
  }
}

export { SAVE_FILE, ARCHIVE_DIR, C, money, writeConfig };
