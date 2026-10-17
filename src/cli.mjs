// cli.mjs — i comandi della carriera EVO.

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
  savePath, activeSlot,
} from './state.mjs';
import { paddock } from './world.mjs';
import { raceCard, nextRound, markPending, chargeEntry, launch } from './race.mjs';
import { listResultFiles, readSessionResult, describeResult } from './results.mjs';
import { runImport, importedFiles, importLog, resetImportRegistry } from './import.mjs';
import { seasonReview, reviewableSeasons, exportReview } from './review.mjs';
import { checkIntegrity, fixIntegrity } from './integrity.mjs';
import { contractStatus, challengeFor, acceptChallenge, ensureLife, careerPlanner } from './life.mjs';
import { newsFeed } from './gazzetta.mjs';
import { ensureFlowsSeeded, recentFlows, resetFlows } from './flows.mjs';
import { resetNews } from './gazzetta.mjs';import {
  agendaDay, gareDelGiorno, prossimoGiornoConGara, avanzaGiorno,
  elencoCompleto, racesOnDay, calendarStrip, dateLabel, dateShort, CADENZA_GIORNI,
} from './agenda.mjs';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = dirname(HERE);
const LADDER_FILE = join(PROJECT, 'config', 'career.evo.ladder.json');
const DATA_DIR = join(PROJECT, 'data');
// SLOT di carriera (1..3): ACE_SLOT=2 sceglie il secondo salvataggio (o --slot via env).
// Lo slot risolve QUI (una volta, all'avvio del processo) e vale per tutto il giro.
const SLOT = activeSlot();
const SAVE_FILE = join(DATA_DIR, savePath(SLOT));
const CONFIG_FILE = join(DATA_DIR, 'evo.config.json');
const ARCHIVE_DIR = join(DATA_DIR, 'results-archive');

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
const colored = (text, width, colorFn) => colorFn(pad(text, width));

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
  return JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
}

function appEnv() {
  const env = { ...process.env };
  if (existsSync(CONFIG_FILE)) {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.dataDir) env.ACE_DATA = cfg.dataDir;
    if (cfg.gameExe) env.ACE_ROOT = dirname(cfg.gameExe);
  }
  return env;
}

function context() {
  const ladder = loadLadder();
  const paths = resolvePaths(appEnv());
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
    ['setup', 'mostra l\'installazione rilevata e salva i percorsi trovati'],
    ['content [--validate|--list|--search <testo>]', 'catalogo auto/piste visto nell\'installazione e verifica della scala'],
    ['new --name "Nome" [--nation ITA] [--discipline gt]', 'comincia una carriera'],
    ['rinomina --name "Nome Cognome"', 'cambia il nome pilota (deve combaciare con quello in EVO)'],
    ['status', 'cruscotto: soldi, reputazione, sedile, tier, posizione'],
    ['series [--discipline gt] [--all]', 'la scala completa con gate e serie bloccate'],
    ['enter <nodeId> [--buy] [--force]', 'cambia serie, comprando o affittando il sedile'],
    ['calendar', 'calendario della stagione con ora e meteo di ogni round'],
    ['agenda [--fattibili] [--salta|--prossima] [--corri <nodeId>]', ' calendario a GIORNI: gare di ogni campionato iscritto, le fattibili per livello, salto di giornata'],
    ['standings', 'classifica della serie'],
    ['paddock [--all]', 'piloti rivali: archetipo, eta\', banda di difficolta\''],
    ['messages', 'messaggi e notizie dal paddock'],
    ['next [--car <id>]', 'la prossima gara in dettaglio: cosa impostare nel gioco'],
    ['race [--car <id>] [--dry-run] [--no-launch]', 'paga l\'iscrizione, segna la gara attesa e apre il gioco'],
    ['import [--position N --cars M] [--dnf] [--fl] [--inspect] [--force]', 'legge il risultato e aggiorna la carriera'],
    ['watch [--every N]', 'guardia automatica: incassa da solo ogni gara nuova scritta da EVO (ogni 15s)'],
    ['difficulty [--mode adaptive|fixed|custom] [--value N] [--trim <serie|all> <valore>] [--lock/--unlock <node>] [--accept|--reject]', 'difficolta\' AI di tutte le serie (trim manuale -20..+20)'],
    ['season-end', 'chiude l\'anno, paga il titolo e apre il mercato'],
    ['review [--season N] [--export]', 'la rassegna della stagione: gare, rivali, duelli'],
    ['gazzetta', 'la stampa del paddock: titoli e voci dopo ogni gara'],
    ['piano', 'pianificatore: dove puoi correre l\'anno prossimo'],
    ['sfida [--accept]', 'la mini-sfida facoltativa della prossima gara'],
    ['dottore', 'verifica l\'integrità della carriera (e --fix corregge)'],
    ['accept <n>', 'accetta un\'offerta di sedile'],
  ];
  console.log(C.bold('\nac-evo-career — carriera per Assetto Corsa EVO\n'));
  console.log('Uso: node ac-evo-career.mjs <comando> [opzioni]\n');
  for (const [cmd, desc] of rows) console.log(`  ${C.cyan(cmd.padEnd(52))} ${desc}`);
  console.log(`\n${C.dim('Flusso tipico: next -> race -> corri -> import')}\n`);
  return 0;
}

function cmdSetup(args) {
  const ladder = loadLadder();
  if (args.flags.data || args.flags.game) {
    const patch = {};
    if (typeof args.flags.data === 'string') patch.dataDir = args.flags.data;
    if (typeof args.flags.game === 'string') patch.gameExe = args.flags.game;
    writeConfig(patch);
    console.log(C.green('Percorsi salvati in data/evo.config.json'));
  }
  const paths = resolvePaths(appEnv());
  console.log(C.bold('\nInstallazione rilevata\n'));
  console.log(`  cartelle dati   ${paths.dataDirs.join('\n                  ')}`);
  console.log(`  risultati       ${paths.resultsDirs.length ? paths.resultsDirs.join(', ') : C.red('nessuna cartella Results (avvia il gioco almeno una volta)')}`);
  console.log(`  log             ${paths.logsDirs.length ? paths.logsDirs.join(', ') : '(nessuna)'}`);
  console.log(`  eseguibile      ${paths.gameExe ?? C.yellow('non trovato (il lancio userà Steam)')}`);
  console.log(`  scala carriera  ${ladder.nodes.length} serie, ${ladder.disciplines.length} discipline\n`);

  const content = scanContent(paths);
  console.log(`  contenuto visto ${content.cars.size} auto, ${content.tracks.size} piste (da log e season definition)\n`);
  const issues = validateLadder(ladder, content);
  if (issues.length) {
    console.log(C.yellow(`  ${issues.length} riferimenti della scala non trovati nell'installazione: usa "content --validate" per l'elenco.`));
  } else {
    console.log(C.green('  La scala carriera combacia con il contenuto installato.'));
  }
  console.log(`\n${C.dim('Puoi forzare i percorsi con:  node ac-evo-career.mjs setup --data "<cartella ACE>" --game "<AssettoCorsaEVO.exe>"')}\n`);
  return 0;
}

function cmdContent(args) {
  const { ladder, paths } = context();
  const content = scanContent(paths);
  if (args.flags.search) {
    const term = String(args.flags.search);
    const found = searchContent(content, ladder, term);
    console.log(C.bold(`\nRicerca "${term}"\n`));
    console.log(`  auto:  ${found.cars.join(', ') || C.dim('nessuna')}`);
    console.log(`  piste: ${found.tracks.join(', ') || C.dim('nessuna')}\n`);
    return 0;
  }
  if (args.flags.list) {
    console.log(C.bold(`\nAuto viste nell'installazione (${content.cars.size})\n`));
    for (const id of [...content.cars].sort()) console.log(`  ${id.padEnd(42)} ${C.dim(ladder.contentNames?.cars?.[id] ?? '')}`);
    console.log(C.bold(`\nPiste viste nell'installazione (${content.tracks.size})\n`));
    for (const id of [...content.tracks].sort()) console.log(`  ${id.padEnd(42)} ${C.dim(ladder.contentNames?.tracks?.[id] ?? '')}`);
    console.log();
    return 0;
  }
  if (args.flags.validate) {
    const issues = validateLadder(ladder, content);
    console.log(C.bold('\nVerifica della scala carriera\n'));
    if (!issues.length) {
      console.log(C.green(`  Nessun problema: ${ladder.nodes.length} serie, tutte le auto e le piste esistono nell'installazione.\n`));
      return 0;
    }
    console.log(`  ${issues.length} problemi:\n`);
    for (const issue of issues) {
      const label = { car: 'auto', track: 'pista', points: 'punti', profile: 'profilo', gate: 'gate' }[issue.kind];
      console.log(`  ${C.yellow(issue.node.padEnd(22))} ${label.padEnd(7)} ${C.red(issue.id.padEnd(38))} ${C.dim(issue.display)}`);
      if (issue.suggestions?.length) console.log(`${' '.repeat(24)}${C.dim('forse intendevi: ' + issue.suggestions.join(', '))}`);
    }
    console.log();
    return 1;
  }
  console.log(`\nContenuto visto: ${content.cars.size} auto, ${content.tracks.size} piste.`);
  console.log('Usa --validate per la verifica della scala, --list per l\'elenco, --search <testo> per cercare.\n');
  return 0;
}

function cmdNew(args) {
  const { ladder } = context();
  const name = typeof args.flags.name === 'string' ? args.flags.name : null;
  if (!name && !(args.flags.first && args.flags.last)) {
    throw new Error('Serve il nome del pilota: new --name "Mauro Sgamer" --nation ITA');
  }
  if (existsSync(SAVE_FILE) && !args.flags.force) {
    throw new Error(`Esiste già una carriera in ${SAVE_FILE}.\nAggiungi --force per ricominciare (il file viene sovrascritto).`);
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
  console.log(C.bold(`\nBenvenuto ${state.driver.name} (${state.driver.nation})\n`));
  console.log(`  Prima serie: ${C.cyan(node.display)} — ${disciplineName(ladder, node.discipline)}, livello ${node.level} (${tierOf(ladder, node.level)})`);
  console.log(`  Soldi: ${money(state.money)}   Reputazione: ${state.rep}`);
  console.log(`\n${C.dim('Prossimo passo:  node ac-evo-career.mjs next')}\n`);
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
    throw new Error('Uso: rinomina --name "Mauro Turbigno"   oppure   rinomina --first Mauro --last Turbigno');
  }
  const { before, after } = renameDriver(state, { name, first, last });
  pushMessage(state, `Nome pilota aggiornato: ${before} -> ${after}.`, 'info');
  saveState(SAVE_FILE, state);
  console.log(C.green(`\nNome pilota: ${after}`));
  console.log(C.dim('  Usa esattamente il nome con cui corri in EVO: serve a farti riconoscere nei risultati.'));
  console.log(C.dim('  Verifica con:  import --inspect --full\n'));
  return 0;
}

function header(state, ladder) {
  ensureFlowsSeeded(state); // carriere nate prima del registro flussi
  const node = nodeById(ladder, state.node);
  const standing = playerStanding(ladder, state, node);
  const sponsor = sponsorTier(state);
  return [
    C.bold(`\n${state.driver.name} (${state.driver.nation})`) + C.dim(`   stagione ${state.season} · ${node.display}`),
    `  ${C.green(money(state.money))} in banca   ${C.cyan(state.rep + ' rep')}${sponsor ? C.dim(' (' + sponsor.name + ')') : ''}   ${C.yellow('P' + (standing?.position ?? '?') + '/' + node.gridSize)} in classifica   round ${Math.min(state.round + 1, node.calendar.length)}/${node.calendar.length}`,
  ].join('\n');
}

function cmdStatus() {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const standing = playerStanding(ladder, state, node);
  const diff = difficultyFor(ladder, state, node, node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track);

  console.log(header(state, ladder));
  const guard = watcherStatus();
  if (guard.alive) console.log(`  ${C.green('👁 guardia attiva')} — incassa da sola le gare nuove (ultimo controllo ${Math.round(guard.ageMs / 1000)}s fa)`);
  else console.log(`  ${C.dim('👁 guardia ferma — avvia guarda.cmd per incassare le gare in automatico')}`);
  console.log(`\n  Sedile: ${node.display} — ${disciplineName(ladder, node.discipline)}, livello ${node.level} (${tierOf(ladder, node.level)}), accesso ${node.access}`);
  console.log(`  Modello economico: ${node.econ.model}   Iscrizione ${money(node.econ.entry)}   Premio ${money(node.econ.prize)}${node.econ.champion ? '   Titolo ' + money(node.econ.champion) : ''}`);
  console.log(`  Difficoltà AI: slider ${diff.slider}% (interna ${diff.total.toFixed(0)}, trim ${signed(diff.trim)})`);
  if (state.titles.length) {
    console.log(`\n  Titoli: ${state.titles.map((t) => `${t.display} (S${t.season})`).join(', ')}`);
  }
  ensureFlowsSeeded(state);
  const contr = contractStatus(ladder, state);
  if (contr) {
    console.log(`\n  Contratto ${contr.contract.display} (premio ${money(contr.contract.payout)}):`);
    for (const row of contr.rows) console.log(`    ${row.ok ? C.green('✓') : C.yellow('•')} ${row.text} — ${row.progress}`);
  }
  const L = ensureLife(state);
  if (L.duel?.season === state.season) {
    console.log(`  Duello di stagione: ${C.cyan(L.duel.name)} — voi due a ${L.duel.myPoints} pt contro ${L.duel.hisPoints} pt (differenza ${L.duel.gap}).`);
  }
  const sp = state.life?.sponsor;
  if (sp?.takenSeason === state.season) console.log(`  Sponsor: ${C.cyan(sp.name)} — ${sp.perRace} € a gara${sp.missionDone ? '' : `, missione: podio entro il round ${sp.deadlineRound + 1} per +${sp.bonus}`}`);
  const myResults = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season);
  if (myResults.length) {
    console.log(`\n  Stagione in corso:`);
    for (const r of myResults.sort((a, b) => a.round - b.round)) {
      const track = ladder.contentNames?.tracks?.[r.track] ?? r.track;
      console.log(`    R${r.round + 1} ${track.padEnd(18)} ${r.dnf ? C.red('ritiro') : 'P' + r.position}  ${r.points} punti  +${money(r.prize)}`);
    }
  } else {
    console.log(C.dim('\n  Nessuna gara disputata in questa serie.'));
  }
  console.log(`\n${C.dim('Prossima gara:  node ac-evo-career.mjs next')}\n`);
  return 0;
}

/** agenda — il calendario a GIORNI (stile Zero to Apex).
 *  agenda                      gare di OGGI di tutti i campionati iscritti + fattibili
 *  agenda --fattibili          solo le serie a cui puoi iscriverti ORA (per livello/gate)
 *  agenda --salta              salta al giorno dopo
 *  agenda --prossima           salta direttamente alla prossima gara di campionato
 *  agenda --corri <nodeId>     segna la scelta di oggi: punta il sedile su quella serie
 */
function cmdAgenda(args) {
  const { ladder } = context();
  const state = requireState();

  // azioni che mutano il giorno
  if (args.flags.salta) {
    const before = agendaDay(state);
    const after = avanzaGiorno(state);
    saveState(SAVE_FILE, state);
    console.log(C.dim(`\n  Giorno ${before} saltato: siamo al giorno ${after}.`));
  } else if (args.flags.prossima) {
    const target = prossimoGiornoConGara(ladder, state);
    if (target == null) {
      console.log(C.yellow('\n  Nessuna gara futura nei campionati iscritti (stagioni complete: usa season-end).'));
      return 0;
    }
    const before = agendaDay(state);
    avanzaGiorno(state, target);
    saveState(SAVE_FILE, state);
    console.log(C.dim(`\n  Dal giorno ${before} (${dateLabel(before)}) al giorno ${target} (${dateLabel(target)}): si va alla prossima gara di campionato.`));
  }

  // scelta della gara di oggi: il sedile in corsa è già quello, altrimenti si firma e si punta
  const targetId = typeof args.flags.corri === 'string' ? args.flags.corri : null;
  if (targetId) {
    const target = gareDelGiorno(ladder, state).gare.find((g) => g.node.nodeId === targetId);
    if (!target) {
      const list = gareDelGiorno(ladder, state).gare.map((g) => g.node.nodeId).join(', ') || '(nessuna)';
      throw new Error(`La serie "${targetId}" non ha gare due in agenda.\nGare di oggi: ${list}\nUsa "agenda" per vedere la giornata.`);
    }
    if (state.node !== targetId) {
      state.node = targetId;                       // puntiamo su quella serie
      state.round = target.index;                  // alla sua ronda attesa
      // il sedile è già del pilota: nessun costo extra per la scelta di oggi
    }
    saveState(SAVE_FILE, state);
    console.log(C.green(`\n  Scelta per oggi: ${target.node.display} R${target.index + 1} (${target.track}).\n  Paga e corri con "race" (o controlla con "next"), poi l'import avanza il giorno.`));
    return 0;
  }

  const today = gareDelGiorno(ladder, state);
  console.log(C.bold(`\nAgenda — GIORNO ${today.day} · ${dateLabel(today.day)}\n`));

  // le gare di oggi dei campionati iscritti (una per serie)
  if (!Object.keys(state.seats ?? {}).length) {
    console.log(C.yellow('  Nessun campionato in corso: firma un sedile con "enter <nodeId>" o "accept <n>".'));
  } else if (!today.gare.length) {
    const fut = prossimoGiornoConGara(ladder, state);
    console.log(C.green('  Oggi non ci sono gare.'));
    if (fut != null) console.log(C.dim(`  Prossima gara di campionato: giorno ${fut} (agenda --prossima per saltare).`));
    console.log(C.dim('  Salta la giornata: agenda --salta'));
  } else {
    for (const g of today.gare) {
      const when = g.onSchedule ? C.green('in calendario oggi') : C.yellow(`in ritardo (era il giorno ${g.scheduledDay}, salta il tempo e corri quando vuoi)`);
      console.log(`  ${g.onSchedule ? C.bold('►') : ' '} ${pad(g.node.display, 26)} R${g.index + 1}/${g.node.calendar.length} — ${g.track}${g.laps ? `, ${g.laps} giri` : ''}`);
      console.log(`    ${pad('', 24)} ${when}`);
    }
    console.log(C.dim(`\n  Scegli con "agenda --corri <nodeId>" (poi "race" come al solito): la gara finita avanza il giorno di 1.`));
  }

  // sotto: la griglia COMPLETA di oggi — tutte le gare in programma (come le "serie reali")
  const griglia = racesOnDay(ladder, state, today.day);
  if (griglia.length) {
    console.log(C.bold(`\nGare in programma oggi (${griglia.length})\n`));
    for (const g of griglia) {
      const tag = g.stato === 'iscritto' ? C.green('iscritto')
        : g.fattibile ? C.cyan('fattibile') : C.red('bloccata');
      console.log(`  ${pad(g.node.display, 28)} R${g.index + 1}/${g.node.calendar.length}  ${pad(g.track, 26)} ${String(g.laps ?? '—').padStart(2)} giri  ${tag}`);
      if (!g.fattibile && g.gateReasons.length) console.log(`       ${C.dim(g.gateReasons.join('; '))}`);
    }
    console.log(C.dim('\n  Solo le gare fattibili (o dei campionati iscritti) si possono scegliere: agenda --corri <nodeId>.'));
  }

  // l'elenco delle serie della scala, filtrabile su fattibili
  const fattibili = !!args.flags.fattibili;
  const rows = elencoCompleto(ladder, state, { fattibili });
  console.log(C.bold(`\nSerie della scala${fattibili ? ' — solo fattibili con il tuo livello' : ' (tutte)'}\n`));
  for (const s of rows) {
    const tag = s.iscritto ? C.green(pad('iscritto', 12)) : s.fattibile ? C.cyan(pad('fattibile', 12)) : s.stato === 'completata' ? C.dim(pad('completata', 12)) : C.red(pad('bloccata', 12));
    const nx = s.next ? `prossima: ${s.next.track}, R${s.next.roundIndex + 1}, ${dateShort(s.next.scheduledDay)}` : 'stagione chiusa';
    console.log(`  L${String(s.level).padEnd(2)} ${pad(s.display, 26)} ${tag} ${C.dim(nx)}`);
    if (fattibili && !s.fattibile) console.log(`       ${C.red(s.gateReasons.join('; '))}`);
  }
  if (!fattibili) console.log(C.dim('\n  agenda --fattibili: solo le serie a cui puoi partecipare con il livello di maestria attuale.'));
  return 0;
}

function cmdSeries(args) {
  const { ladder } = context();
  const state = requireState();
  const discipline = typeof args.flags.discipline === 'string' ? args.flags.discipline : null;
  const showAll = !!args.flags.all;

  console.log(C.bold(`\nScala carriera${discipline ? ' — ' + disciplineName(ladder, discipline) : ''}\n`));
  for (const disc of ladder.disciplines) {
    if (discipline && disc.id !== discipline) continue;
    const nodes = ladder.nodes.filter((n) => n.discipline === disc.id).sort((a, b) => a.level - b.level);
    if (!nodes.length) continue;
    console.log(` ${C.bold(disc.name)} ${C.dim('· ' + disc.description)}`);
    for (const node of nodes) {
      const gate = gateStatus(ladder, state, node);
      const current = node.nodeId === state.node;
      const req = node.requires ? `${nodeById(ladder, node.requires.nodeId).display} top ${node.requires.top}` : '—';
      const mark = current ? C.green(pad('◄ attuale', 12)) : gate.ok ? C.cyan(pad('aperta', 12)) : C.red(pad('bloccata', 12));
      console.log(`   ${pad('L' + node.level, 3)} ${pad(node.display, 26)} ${mark} ${C.dim('gate: ' + req)}`);
      if (!gate.ok && (showAll || discipline)) console.log(`       ${C.red(gate.reasons.join('; '))}`);
      if (showAll) console.log(`       ${C.dim(`${node.gridSize} auto · ${node.points} · ${node.econ.model} · affitto ${money(node.econ.rent)} · premio ${money(node.econ.prize)}`)}`);
    }
    console.log();
  }
  console.log(C.dim('  enter <nodeId> per firmare un sedile aperto. Le serie bloccate dicono cosa manca.\n'));
  return 0;
}

function cmdCalendar() {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const played = new Set((state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).map((r) => r.round));
  console.log(C.bold(`\nCalendario ${node.display} — stagione ${state.season}\n`));
  node.calendar.forEach((round, i) => {
    const track = ladder.contentNames?.tracks?.[round.track] ?? round.track;
    const weather = ladder.weatherNames[String(round.weather)];
    const mark = played.has(i) ? C.green('✓') : i === state.round ? C.yellow('►') : ' ';
    console.log(`  ${mark} R${i + 1} ${round.name.padEnd(34)} ${String(round.laps).padStart(2)} giri  ${String(round.hour).padStart(2)}:00  ${C.dim(weather)}`);
  });
  console.log();
  return 0;
}

function cmdStandings() {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const table = standingsFor(ladder, state, node);
  console.log(C.bold(`\nClassifica ${node.display} — stagione ${state.season}\n`));
  table.forEach((row) => {
    const me = row.isPlayer ? C.green('◄ ') : '  ';
    const tag = row.isPlayer ? 'TU' : row.iconic ? 'ICON' : row.hot ? 'HOT ' : '';
    console.log(`  ${me}P${String(row.position).padStart(2)}  ${row.name.padEnd(24)} ${String(row.points).padStart(3)} pt  ${C.dim(row.country + ' ' + tag)}`);
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
  console.log(C.bold(`\nPaddock ${node.display} — ${rows.length} rivali (i primi ${limit})\n`));
  for (const r of rows.slice(0, limit)) {
    console.log(`  ${r.name.padEnd(24)} ${r.country}  ${String(r.age).padStart(2)} anni  ${r.archetypeName.padEnd(14)} banda ${r.bandValue.toFixed(0).padStart(3)} (slider ${String(r.evoSlider).padStart(3)}%)  ${r.iconic ? C.yellow('iconico') : r.hot ? C.cyan('in forma') : ''}`);
  }
  console.log(C.dim(`\n  Archetipi: ${Object.values(ladder.archetypes).map((a) => a.name).join(', ')}`));
  console.log(C.dim(`  Parco piloti totale: ${state.world.drivers.length} (${state.world.drivers.filter((d) => d.active).length} attivi)\n`));
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
    console.log(C.bold('\nMessaggi') + C.dim(` — ${unread.length} segnati come letti\n`));
    return 0;
  }

  // digest: i non letti raggruppati per giorno, i più recenti prima
  if (args.flags.digest) {
    console.log(C.bold(`\nMessaggi — digest: ${unread.length} non letti\n`));
    if (!unread.length) { console.log(C.green('  Inbox pulita: nessun messaggio da leggere.\n')); return 0; }
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
      if (group.length > 3) console.log(C.dim(`    …e altre ${group.length - 3}`));
    }
    if (days.length > MAX_DAYS) console.log(C.dim(`\n  …e altri ${days.length - MAX_DAYS} giorni`));
    console.log(C.dim('\n  per segnare tutto letto:  messages --read-all\n'));
    return 0;
  }

  console.log(C.bold(`\nMessaggi${unread.length ? C.dim(` — ${unread.length} non letti`) : ''}\n`));
  console.log(C.dim(`  digest: messages --digest · segna letti: messages --read-all\n`));
  for (const m of state.messages.slice(-15)) {
    const day = m.at.slice(0, 10);
    const color = m.kind === 'good' || m.kind === 'title' ? C.green : m.kind === 'bad' ? C.red : m.kind === 'money' ? C.yellow : C.dim;
    console.log(`  ${C.dim(day)}  ${color(m.text)}`);
  }
  if (state.offers.length) {
    console.log(C.bold('\nOfferte sul tavolo\n'));
    for (const o of state.offers) {
      console.log(`  ${C.cyan(String(o.index) + ')')} ${o.display.padEnd(26)} L${o.level} ${disciplineName(ladder, o.discipline).padEnd(14)} ${C.dim(o.note + ' · affitto ' + money(o.rent))}`);
    }
    console.log(C.dim('\n  accept <n> per firmare.\n'));
  } else console.log();
  return 0;
}

function printCard(ladder, state, card) {
  console.log(C.bold(`\n${card.node.display} — round ${card.roundIndex + 1}/${card.totalRounds}: ${card.round.name}\n`));
  console.log(`  ${C.dim('Imposta questo nel gioco:')}`);
  for (const [label, value] of card.settings) {
    console.log(`    ${label.padEnd(18)} ${value}`);
  }
  const o = card.outlook;
  if (o) {
    console.log(`\n  ${C.bold('Report pre-gara')}`);
    console.log(`    classifica ${o.standingPosition ? 'P' + o.standingPosition : '—'} · ${o.racesRun}/${o.totalRounds} gare · ${o.seasonPoints} punti${o.mastery?.level ? ` · pista: ${o.mastery.name} (${o.mastery.races} gare)` : ''}`);
    if (o.lapTarget) console.log(`    obiettivo giro: ${o.lapTarget.time} (tuo best con ${o.lapTarget.car ?? 'n/d'})`);
    if (o.duel) console.log(`    duello di stagione: ${o.duel.name} a ${o.duel.gap} punti`);
    if (o.contract?.length) for (const c of o.contract) console.log(`    clausola: ${c.ok ? '✓' : '•'} ${c.text} (${c.progress})`);
  }
  if (card.challenge) {
    const c = card.challenge;
    console.log(`\n  ${C.yellow('Sfida della ronda')}: ${c.text}${c.accepted ? ' (accettata)' : ''}`);
    console.log(`    ${C.dim(`premio ${c.reward} € se ci riesci, -${c.penalty} rep se fallisci. Accetta con: sfida --accept`)}`);
  }
  if (card.warnings.length) {
    console.log(`\n  ${C.yellow('Note')}`);
    for (const w of card.warnings) console.log(`    - ${w}`);
  }
  console.log(`\n  ${C.dim(`Difficoltà proposta: slider AI ${card.difficulty.slider}% · aggressività ${card.profile.aggr}% · ${card.opponents} avversari`)}`);
}

function cmdNext(args) {
  const { ladder } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const car = typeof args.flags.car === 'string' ? args.flags.car : null;
  const card = raceCard(ladder, state, { car });
  if (car && !card.node.cars.includes(car)) {
    throw new Error(`Auto "${car}" non ammessa in ${card.node.display}.\nAmmesse: ${card.node.cars.join(', ')}`);
  }
  printCard(ladder, state, card);
  console.log(`\n${C.dim('Quando sei pronto:  node ac-evo-career.mjs race   (paga l\'iscrizione e apre il gioco)')}\n`);
  return 0;
}

async function cmdRace(args) {
  const { ladder, paths } = context();
  const state = requireState();
  ensureFlowsSeeded(state);
  const node = nodeById(ladder, state.node);
  const card = raceCard(ladder, state, { car: typeof args.flags.car === 'string' ? args.flags.car : null });

  if (state.round >= node.calendar.length) {
    console.log(C.yellow(`\nStagione completata in ${node.display}: chiudi l'anno con "season-end".\n`));
    return 0;
  }
  if (args.flags['dry-run']) {
    printCard(ladder, state, card);
    console.log(`\n${C.dim('(dry-run: nessuna iscrizione pagata, gioco non avviato)')}\n`);
    return 0;
  }
  if (await isGameRunning()) {
    console.log(`\n  ${C.yellow('Nota: Assetto Corsa EVO risulta già aperto.')} ${C.dim('Configura la gara nella finestra già aperta; il gioco non verrà avviato di nuovo.')}`);
  }
  const fee = chargeEntry(ladder, state, node);
  markPending(ladder, state, card);
  saveState(SAVE_FILE, state);

  printCard(ladder, state, card);
  if (fee) console.log(`\n  ${C.yellow('Iscrizione pagata: ' + money(fee))}`);

  if (args.flags['no-launch']) {
    console.log(`\n${C.dim('(gioco non avviato: --no-launch)  Apri Assetto Corsa EVO e imposta la gara.')}\n`);
    return 0;
  }
  try {
    const res = await launch(paths, { force: !!args.flags['force-launch'] });
    if (res.via === 'already-running') {
      console.log(`\n  ${C.green('Assetto Corsa EVO è già aperto')}: non ne avvio un secondo, altrimenti il gioco mostra un errore.`);
      console.log(`  ${C.dim('Imposta la gara qui sopra nella finestra già aperta.')}`);
      console.log(`  ${C.dim('(se vuoi forzare una nuova istanza: race --force-launch)')}`);
    } else {
      console.log(`\n  ${C.green('Gioco avviato')} ${C.dim('(' + res.via + ': ' + res.target + ')')}`);
    }
  } catch (e) {
    console.log(`\n  ${C.yellow('Non sono riuscito ad aprire il gioco: ' + e.message)}`);
    console.log(`  ${C.dim('Aprilo tu e imposta la gara qui sopra.')}`);
  }
  console.log(`\n${C.dim('A fine gara:  node ac-evo-career.mjs import')}\n`);
  return 0;
}

function cmdImport(args) {
  const { ladder, paths } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);

  if (args.flags.inspect) {
    const files = listResultFiles(paths);
    if (!files.length) { console.log(C.yellow(`\nNessun file risultati in ${paths.resultsDirs.join(', ') || '(nessuna cartella)'}\n`)); return 0; }
    console.log(C.bold(`\nUltimi file di risultato (${files.length} totali)\n`));
    for (const f of files.slice(0, 5)) {
      let result;
      try { result = readSessionResult(f.file); } catch { continue; }
      console.log(`  ${f.name}  ${C.dim(new Date(f.mtime).toLocaleString('it-IT'))}`);
      console.log(`    sessione ${result.session} · pista ${result.track} · ${(result.drivers ?? []).length} piloti`);
      if (args.flags.full) console.log(describeResult(result).split('\n').map((l) => '    ' + l).join('\n'));
    }
    console.log();
    return 0;
  }

  // registro anti-doppioni: cosa è già stato incassato e quando
  if (args.flags.ledger) {
    const files = importedFiles();
    console.log(C.bold(`\nRegistro import (${files.length} file già incassati)\n`));
    for (const f of files.slice(0, 20)) {
      console.log(`  ${String(f.at ?? '').slice(0, 16).replace('T', ' ')}  ${f.file}  →  ${f.node ?? f.nodeId ?? '?'} R${(f.round ?? 0) + 1}${f.position ? ', P' + f.position : ''}`);
    }
    const log = importLog(10);
    if (log.length) {
      console.log(C.dim('\nUltimi eventi:'));
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
      const lines = [`Nessuna gara da importare che combaci con la ronda attesa (${(e.detail.expected ?? []).join(' / ')}).`];
      const files = e.detail.files ?? [];
      if (files.length) {
        lines.push('File recenti presenti:');
        for (const f of files) lines.push(`  ${f.name} — sessione ${f.session}, pista ${f.track}, ${f.drivers} piloti${f.isRace ? '' : ' (non una gara)'}`);
      } else {
        lines.push(`Non ci sono file in ${paths.resultsDirs.join(', ') || '(nessuna cartella Results)'}.`);
      }
      lines.push('Se la gara è quella giusta usa --allow-any, oppure inserisci la posizione a mano con --position N.');
      throw new Error(lines.join('\n'));
    }
    if (e.code === 'PLAYER_NOT_FOUND' && e.detail) {
      throw new Error([
        `Non ho riconosciuto il tuo pilota in ${e.detail.file ?? 'questo file'}.`,
        `Piloti senza contrassegno AI: ${(e.detail.candidates ?? []).join(', ') || 'nessuno'}.`,
        `Inserisci la posizione a mano: import --position N --cars <numero-auto> [--dnf] [--fl]`,
      ].join('\n'));
    }
    if (e.code === 'TRACK_MISMATCH' && e.detail) {
      throw new Error([
        `La gara trovata è su "${e.detail.actual}" ma la ronda attesa è su "${(e.detail.expected ?? []).join(' / ')}".`,
        'Usa --force per importarla comunque, o --allow-any per cercare fra tutte le gare.',
      ].join('\n'));
    }
    throw e;
  }

  if (out.duplicate) {
    console.log(C.yellow('\nNessun nuovo risultato registrato\n'));
    console.log(`  ${C.dim(out.source)}`);
    console.log(`  ${C.dim('Per forzarlo comunque: import --force.   Registro: import --ledger')}`);
    return 0;
  }

  const entry = out.entry;
  console.log(C.bold(`\nRisultato importato — ${out.node}, round ${out.round}\n`));
  console.log(`  ${C.dim(out.source)}`);
  console.log(`  Posizione: ${entry.dnf ? C.red('ritiro') : 'P' + entry.position} su ${entry.gridSize}${entry.fl ? C.yellow(' · giro veloce') : ''}`);
  console.log(`  Punti: ${entry.points}   Premio: ${money(entry.prize)}   Reputazione: +${entry.rep}`);
  console.log(`  Classifica: P${out.standing.before ?? '?'} -> ${C.cyan('P' + (out.standing.after ?? '?'))} (${out.standing.points} punti)`);
  console.log(`  Banca: ${C.green(money(out.money))}   Reputazione: ${out.rep}`);
  if (out.backup) console.log(`  ${C.dim('Backup automatico: ' + String(out.backup).replace(/^.*bak-auto-/, ''))}`);
  if (out.proposal) {
    console.log(`\n  ${C.yellow('Suggerimento difficoltà')}: ${out.proposal.reason} -> trim ${signed(out.proposal.from)} / ${signed(out.proposal.to)}`);
    console.log(`  ${C.dim('difficulty --accept   oppure   difficulty --reject')}`);
  }
  if (out.seasonDone) {
    console.log(`\n  ${C.green('Stagione completata!')} ${C.dim('node ac-evo-career.mjs season-end')}`);
  }
  console.log(`\n${C.dim('Prossima gara:  node ac-evo-career.mjs next')}\n`);
  return 0;
}

async function cmdWatch(args) {
  const { ladder, paths } = context();
  const secs = Math.max(3, Number(args.flags.every) || Math.round(WATCH_INTERVAL_MS / 1000));
  const baseline = Date.now(); // niente gare precedenti al via del watcher

  console.log(C.bold(`\n👁 watcher attivo — controllo ogni ${secs}s · Ctrl+C per uscire\n`));
  console.log(C.dim('  Incassa da solo ogni gara che EVO scrive da adesso in poi (registro anti-doppioni e backup inclusi).\n'));
  console.log(C.dim('  File risultati: ' + (paths.resultsDirs.join(', ') || '(nessuna cartella Results)') + '\n'));

  let stop = false;
  const onSigint = () => { stop = true; };
  process.on('SIGINT', onSigint);
  try {
    while (!stop) {
      const t0 = Date.now();
      heartbeat(secs); // il cruscotto capisce da qui che la guardia è viva
      const out = watchOnce(ladder, paths, { baselineMs: baseline });
      if (out.imported) {
        const e = out.imported.entry;
        console.log(C.green(`\n  ✓ imported: ${out.imported.node} round ${out.imported.round} — ${e.dnf ? 'ritiro' : 'P' + e.position}/${e.gridSize}${e.fl ? ' · giro veloce' : ''} · +${e.points} pt · +${e.prize} €`));
        console.log(`  ${C.dim('Banca: ' + out.imported.money + ' · rep ' + out.imported.rep)}`);
        if (out.imported.proposal) console.log(`  ${C.yellow('Suggerimento difficoltà')}: trim ${signed(out.imported.proposal.from)} / ${signed(out.imported.proposal.to)} — decidilo con difficulty --accept / --reject\n`);
        else console.log();
      } else if (out.error) {
        console.log(`  ${C.red('watcher:')} ${out.error.message}\n`);
      }
      // niente rumore quando una scansione non trova niente di nuovo
      const elapsed = Date.now() - t0;
      if (stop) break;
      await new Promise((r) => setTimeout(r, Math.max(250, secs * 1000 - elapsed)));
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
  console.log('\n  watcher chiuso.\n');
  return 0;
}

function cmdReview(args) {
  const { ladder } = context();
  const state = requireState();
  const seasons = reviewableSeasons(state);
  if (!seasons.length) { console.log(C.yellow('\nAncora nessuna gara: la rassegna arriva dopo la prima stagione.\n')); return 0; }
  let wanted = seasons[0];
  if (Number.isFinite(Number(args.flags.season))) {
    wanted = Number(args.flags.season);
    if (!seasons.includes(wanted)) throw new Error(`Della stagione ${wanted} non ci sono gare registrate. Disponibili: ${seasons.join(', ')}.`);
  }
  const r = seasonReview(ladder, state, { season: wanted });
  console.log('\n' + r.text.split('\n').map((l) => l
    .replace(/^#{1,2} /, (m) => C.bold(''))
    .replace(/\*\*(.+?)\*\*/g, (m, s1) => C.cyan(s1)))
    .join('\n') + '\n');
  if (args.flags.export) {
    const file = exportReview(r);
    console.log(C.green(`Rassegna salvata in ${file}\n`));
  }
  return 0;
}

function cmdGazzetta() {
  const items = newsFeed(15);
  console.log(C.bold('\n📰 Gazzetta del paddock\n'));
  if (!items.length) { console.log(C.dim('  Nessuna notizia: arrivano dopo la prima gara importata.\n')); return 0; }
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
  console.log(C.bold(`\nPianificatore — stagione ${state.season + 1} · banca ${money(state.money)} · rep ${state.rep}\n`));
  for (const r of rows.filter((x) => x.open || x.blockers.length).slice(0, 18)) {
    const mark = r.current ? C.green('◄ attuale') : r.open ? C.cyan('aperta  ') : C.red('bloccata');
    console.log(`  ${mark} ${C.bold(r.display.padEnd(26))} L${r.level}  affitto ${money(r.rent).padStart(7)} · premio ${money(r.prize).padStart(7)}  ${C.dim(r.blockers.join('; ') || 'gate superato')}`);
  }
  console.log(C.dim('\n  "series" per l\'elenco completo con i gate.\n'));
  return 0;
}

function cmdSfida(args) {
  const { ladder } = context();
  const state = requireState();
  const c = challengeFor(ladder, state);
  if (!c) { console.log(C.yellow('\nNessuna sfida disponibile (stagione chiusa o sfida già valutata).\n')); return 0; }
  if (args.flags.accept) {
    if (c.accepted) { console.log(C.yellow(`\nSfida già accettata: ${c.text}\n`)); return 0; }
    acceptChallenge(state, c);
    saveState(SAVE_FILE, state);
    console.log(C.green(`\nSfida accettata: ${c.text}`));
    console.log(C.dim(`  premio ${c.reward} € se ci riesci, -${c.penalty} rep se fallisci.\n`));
    return 0;
  }
  console.log(C.bold(`\nSfida della ronda — ${c.text}\n`));
  console.log(`  ${C.dim(`facoltativa · premio ${c.reward} € · penale -${c.penalty} rep · accetta con: sfida --accept\n`)}`);
  return 0;
}

function cmdDottore(args) {
  const { ladder } = context();
  const state = requireState();
  const issues = checkIntegrity(ladder, state);
  if (!issues.length) {
    console.log(C.green('\nCarriera sotto controllo: gare, statistiche, cassa e bacheca tornano.\n'));
    return 0;
  }
  console.log(C.yellow(`\nTrovate ${issues.length} anomalie:\n`));
  for (const i of issues) console.log(`  ${i.severity === 'high' ? C.red('•') : C.yellow('•')} ${i.text}`);
  if (args.flags.fix) {
    const out = fixIntegrity(ladder, state);
    if (out.fixed.length) {
      console.log(C.green('\nCorretto:'));
      for (const f of out.fixed) console.log(`  ✓ ${f}`);
    }
    const rest = out.issues.filter((i) => !out.fixed.length || !i.text.includes('dice'));
    if (rest.length) {
      console.log(C.dim('\nRestano da verificare a mano (nessuna correzione automatica possibile):'));
      for (const i of rest) console.log(`  • ${i.text}`);
    }
  } else {
    console.log(C.dim('\nCorreggi con:  node ac-evo-career.mjs dottore --fix\n'));
  }
  return 0;
}

function cmdDifficulty(args) {
  const { ladder } = context();
  const state = requireState();

  if (args.flags.mode) {
    const mode = String(args.flags.mode);
    if (!['adaptive', 'fixed', 'custom'].includes(mode)) throw new Error('--mode vuole adaptive, fixed oppure custom.');
    state.difficulty.mode = mode;
    state.difficulty.base ??= {};
    state.difficulty.trim ??= {};
    if (mode === 'fixed') {
      const value = Number(args.flags.value ?? 95);
      if (!Number.isFinite(value) || value < 70 || value > 120) {
        throw new Error('--value vuole un numero fra 70 e 120 (scala interna, come Zero to Apex).');
      }
      for (const node of ladder.nodes) state.difficulty.base[node.nodeId] = value;
      state.difficulty.trim = {};
    }
    if (mode === 'adaptive') {
      state.difficulty.base = {};
      state.difficulty.pending = null;
    }
    pushMessage(state, `Difficoltà AI impostata su "${mode}"${args.flags.value ? ` (valore ${args.flags.value})` : ''}.`, 'info');
    saveState(SAVE_FILE, state);
    console.log(C.green(`\nModalità difficoltà: ${mode}\n`));
    return 0;
  }
  if (args.flags.lock || args.flags.unlock) {
    const id = String(args.flags.lock ?? args.flags.unlock);
    nodeById(ladder, id); // valida
    const list = new Set(state.difficulty.locked);
    if (args.flags.lock) list.add(id); else list.delete(id);
    state.difficulty.locked = [...list];
    saveState(SAVE_FILE, state);
    console.log(C.green(`\n${id}: difficoltà ${args.flags.lock ? 'bloccata' : 'sbloccata'}.\n`));
    return 0;
  }
  if (args.flags.accept || args.flags.reject) {
    const pending = state.difficulty.pending;
    if (!pending) { console.log(C.yellow('\nNessun suggerimento in attesa.\n')); return 0; }
    if (args.flags.accept) {
      state.difficulty.trim[pending.nodeId] = pending.to;
      pushMessage(state, `Difficoltà di ${nodeById(ladder, pending.nodeId).display} portata a trim ${pending.to >= 0 ? '+' : ''}${pending.to} (${pending.reason}).`, 'info');
      console.log(C.green(`\nTrim ${pending.nodeId}: ${pending.from} -> ${pending.to}\n`));
    } else {
      console.log(C.yellow(`\nSuggerimento rifiutato: trim resta a ${pending.from}.\n`));
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
      throw new Error('Uso: difficulty --trim <serie|all> <valore>   (es. difficulty --trim gt86_cup +12, intervallo -20..+20).');
    }
    val = Math.max(-20, Math.min(20, Math.round(val)));
    const scopeAll = (id === 'all');
    const targets = scopeAll
      ? ladder.nodes.map((n) => n.nodeId)
      : [nodeById(ladder, id ?? state.node).nodeId];
    state.difficulty.trim ??= {};
    for (const t of targets) state.difficulty.trim[t] = val;
    state.difficulty.pending = null;
    pushMessage(state, `Difficoltà regolata a mano: trim ${val >= 0 ? '+' : ''}${val} su ${scopeAll ? 'tutte le serie' : nodeById(ladder, targets[0]).display}.`, 'info');
    saveState(SAVE_FILE, state);
    console.log(C.green(`\nTrim ${val >= 0 ? '+' : ''}${val} applicato a: ${targets.join(', ')}\n`));
    return 0;
  }

  console.log(C.bold(`\nDifficoltà AI — modalità ${state.difficulty.mode}\n`));
  const byDiscipline = new Map();
  for (const node of ladder.nodes) {
    const track = node.calendar[Math.min(state.round, node.calendar.length - 1)]?.track;
    const d = difficultyFor(ladder, state, node, track);
    byDiscipline.set(node.discipline, [...(byDiscipline.get(node.discipline) ?? []), { node, d }]);
  }
  for (const [disc, rows] of byDiscipline) {
    console.log(` ${C.bold(disciplineName(ladder, disc))}`);
    for (const { node, d } of rows.sort((a, b) => a.node.level - b.node.level)) {
      const lock = d.locked ? C.yellow(' [bloccata]') : '';
      const current = node.nodeId === state.node ? C.green('◄') : ' ';
      console.log(`   ${current} ${node.display.padEnd(26)} base ${d.base.toFixed(0).padStart(3)}  trim ${(d.trim >= 0 ? '+' : '') + d.trim}  classe ${(d.offClass >= 0 ? '+' : '') + d.offClass}  pista ${(d.offTrack >= 0 ? '+' : '') + d.offTrack}  = ${d.total.toFixed(0).padStart(3)}  slider ${String(d.slider).padStart(3)}%${lock}`);
    }
    console.log();
  }
  if (state.difficulty.pending) {
    const p = state.difficulty.pending;
    console.log(`  ${C.yellow('In attesa')}: ${nodeById(ladder, p.nodeId).display} — ${p.reason} -> trim ${p.to >= 0 ? '+' : ''}${p.to}`);
    console.log(C.dim('  difficulty --accept   oppure   difficulty --reject\n'));
  }
  return 0;
}

function cmdSeasonEnd(args) {
  const { ladder } = context();
  const state = requireState();
  const node = nodeById(ladder, state.node);
  const played = (state.results[node.nodeId] ?? []).filter((r) => r.season === state.season).length;
  if (played < node.calendar.length && !args.flags.force) {
    throw new Error(`Stagione ${state.season} in ${node.display}: ${played}/${node.calendar.length} gare disputate.\nUsa --force per chiudere comunque.`);
  }
  const result = seasonEnd(ladder, state);
  saveState(SAVE_FILE, state);

  console.log(C.bold(`\nFine stagione ${state.season - 1} — ${node.display}\n`));
  console.log(`  ${result.champion ? C.green('CAMPIONE') : 'Posizione finale: P' + result.me.position} — ${result.me.points} punti${result.bonus ? '  bonus titolo +' + money(result.bonus) : ''}`);
  console.log(`\n  ${C.bold('Offerte di sedile per la stagione ' + state.season)}`);
  for (const o of result.offers) {
    console.log(`   ${C.cyan(String(o.index) + ')')} ${o.display.padEnd(26)} L${o.level} ${disciplineName(ladder, o.discipline).padEnd(14)} ${C.dim(o.note + ' · affitto ' + money(o.rent) + (o.access === 'closed' ? ' · parco chiuso' : ''))}`);
  }
  console.log(C.dim('\n  accept <n> per firmare un contratto, oppure "series" per vedere tutto.\n'));
  return 0;
}

function cmdAccept(args) {
  const { ladder } = context();
  const state = requireState();
  const index = Number(args._[1]);
  if (!Number.isFinite(index)) throw new Error('Uso: accept <n> (il numero dell\'offerta mostrato da season-end o messages).');
  const node = acceptOffer(ladder, state, index);
  saveState(SAVE_FILE, state);
  console.log(C.green(`\nContratto firmato: ${node.display} (livello ${node.level}, ${disciplineName(ladder, node.discipline)})\n`));
  console.log(C.dim('  node ac-evo-career.mjs next\n'));
  return 0;
}

function cmdEnter(args) {
  const { ladder } = context();
  const state = requireState();
  const id = args._[1];
  if (!id) throw new Error('Uso: enter <nodeId> [--buy] [--force]');
  const node = nodeById(ladder, id);
  enterNode(ladder, state, node, { buy: !!args.flags.buy, force: !!args.flags.force });
  saveState(SAVE_FILE, state);
  console.log(C.green(`\nSedile ${node.display}: ${node.econ.buy === 0 ? 'contratto ufficiale' : args.flags.buy ? 'comprato' : 'affittato'}.`));
  console.log(`  Banca: ${money(state.money)}   Round ${state.round + 1}/${node.calendar.length}\n`);
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
      case 'import': return cmdImport(args);
      case 'watch': return await cmdWatch(args);
      case 'difficulty': return cmdDifficulty(args);
      case 'season-end': return cmdSeasonEnd(args);
      case 'review': return cmdReview(args);
      case 'gazzetta': case 'news': return cmdGazzetta(args);
      case 'piano': case 'planner': return cmdPiano(args);
      case 'sfida': case 'challenge': return cmdSfida(args);
      case 'dottore': return cmdDottore(args);
      case 'accept': return cmdAccept(args);
      case 'enter': return cmdEnter(args);
      case 'agenda': return cmdAgenda(args);
      default:
        console.log(C.yellow(`\nComando "${command}" non riconosciuto.`));
        cmdHelp();
        return 1;
    }
  } catch (e) {
    console.error(`\n${C.red('Errore:')} ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    return 1;
  }
}

export { SAVE_FILE, ARCHIVE_DIR, C, money, writeConfig };
