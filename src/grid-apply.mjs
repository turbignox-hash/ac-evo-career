// grid-apply.mjs — I GESTI DI SCRITTURA sulla griglia, condivisi.
//
// Nato perché watch (ripristino automatico) e GUI (tab Griglia) devono fare
// LE STEESSE operazioni del tool grid-balance senza rilanciare un processo:
//   • applicare il bilancio della classe (con supplementi perTraccia)
//   • rimuovere dal file le auto ESCLUSE (di classe o per-traccia)
//   • riscrivere l'intervallo AI (config 21/22)
// Ogni scrittura è protetta dal guardiano EVO-chiuso e fa backup automatico.
//
// uso:
//   import { applyBalance, applyAi, dropCellsApply, gridStatus, matchCurrentClass } from './grid-apply.mjs';
//   const out = applyBalance({ track: 'Sebring International Raceway' });  // classe auto-matchata
//   const out = applyAi([94, 99]);
//   const out = dropCellsApply(['preset_mk8gti_mech_1', 'BMW M3 E46 CSL']);
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { sameTrack } from './tracknames.mjs';
import { tr } from './lang.mjs';
import { gameRunning, encodeMsg, gridFileOf, bakName, pruneBackups, factoryDir } from '../tools/evo-grid.mjs';
// compat: cli.mjs e corrupt-inputs.test mordono pruneBackups da qua — ma la
// fonte è UNA (evo-grid, 31/10): re-export e NULLA si duplica più. Dal 3/11
// anche bakName passa di qui: webui (bak-evento) e cli (bak-griglia) sono passati
// dal nome a MINUTO ricostruito a mano al backup al SECONDO dell'unico bakName.
export { pruneBackups, bakName };
import { balanceCells, dropCells, setAiRange, planFromClass, readCells, DEFAULT_FILE } from '../tools/grid-balance.mjs';
import { weekendCarCount, weekendGridMode, setWeekendGridCustom, WEEKEND_FILE, GRIGLIA_CAMPIONATO, celleGrigliaCampionato } from '../tools/set-track.mjs';
import { loadClasses, pickClassInfo, buildGridMessage, classeMulticlasseSuPoolMono } from './gridbuilder.mjs';
import { resolvePaths } from './paths.mjs';
import { scanContentCached, carExists } from './content.mjs';
import { slotDataDir } from './state.mjs';
import { carPoolOf, carInPool } from './car-pool.mjs';
import { syncRoster, celleDiGrid, riduciSlotRoster } from './weekend-roster.mjs';
import { writeOrWarn } from './safe-write.mjs';

export const GRID_FILE = DEFAULT_FILE;

/* ---------- magazzino dei template PER SERIE ---------- */
// Lezione 23/10 sera (Coppa Audi RS 3 Sportback): a ogni NUOVO campionato la
// griglia sul disco è ancora quella della serie scorsa (14×F40) e il builder
// non può ricostruire niente, perché le CELLE sono fotocopiate da un template
// reale e per la serie nuova non ne esiste nessuno (verificato col byte-scan:
// zero file sul disco contiene ks_audi_rs_3_sportback). Da qui il rituale
// "una volta per serie: GENERA in EVO → APPLICA". Il magazzino lo rende
// EFFIMERO UNA VOLTA SOLA: la prima costruzione riuscita della serie resta
// sul disco (data/grid-templates/<nodeId>.customgrid) e TUTTI i round
// successivi (anche dopo che il customgrid sul disco è passato ad altra
// serie) si riscrivono da questo appunto, senza mai riaprire EVO per la griglia.
// nido per-slot (24/10): magazzino e snapshot vivono con la SUA carriera (slot 1 =
// data/ come fino ad oggi, slot 2-3 = data/slot-N/ vergini); la FABBRICA resta
// condivisa com'era (config/griglie-fabbrica): fotocopia statica del progetto,
// non appartiene a nessuna carriera.
const APPLY_DATA_DIR = slotDataDir();
const TEMPLATES_DIR = join(APPLY_DATA_DIR, 'grid-templates');
const SNAPSHOTS_DIR = join(APPLY_DATA_DIR, 'customgrid-snapshots');
// FABBRICA: VOCE UNA in evo-grid (3/11, stessa cura del magazzino dello stesso giorno);
// la ridirezione EVO_FACTORY_DIR dei sandbox vive là dove c'è l'interruttore.

// Esportata (3/11, revisione dei tre banchi): il path del magazzino è UNA VOCE SOLA —
// webui (contatore del modo custom quando la cartuccia è a 0 celle) lo legge
// QUI e non se lo ricostruisce più: due ricostruzioni dello stesso path erano
// due occasioni di split al primo cambio di fonte (slot, veste, magazzino).
export const templatePathOf = (nodeId) => join(TEMPLATES_DIR, String(nodeId).replace(/[^a-zA-Z0-9_.-]/g, '_') + '.customgrid');
const factoryFileOf = (nodeId) => join(factoryDir(), basename(templatePathOf(nodeId)));

/* bak e POTATURA: stessa ferrea memoria della lezione 28/10, ma la fonte è
 * UNA da 31/10 — tools/evo-grid.mjs (bakName + pruneBackups importati sopra).
 * Tutto il vecchio commento resta là col codice. */

/* ---------- PROVENIENZA DEL MAGAZZINO (4/11) ---------- */
// Ogni template appuntato porta accanto un .json con data, celle, tinte e
// provenienza: si sa da dove viene, e un magazzino stantio (pool cambiato)
// viene archiviato invece di essere riprovato a ogni build.
export const storeMetaPathOf = (nodeId) => templatePathOf(nodeId).replace(/\.customgrid$/, '.json');
function scriviMetaStore(nodeId, buf, meta = {}) {
  writeOrWarn('grid.meta', () => {
    const info = readCells(buf);
    const tinte = new Set(info.cells.map((c) => c.tinta).filter(Boolean)).size;
    writeFileSync(storeMetaPathOf(nodeId), JSON.stringify({
      nodeId, savedAt: new Date().toISOString(), cells: info.cells.length, tintes: tinte, source: meta.source ?? 'build',
    }, null, 2) + '\n');
  }); // la provenienza non è un blocco: il template resta valido
}

/** Appunta il buffer come template della serie. riscritture successive con byte
 *  identici non toccano nulla (a ogni giro di poll il file non cambia).
 *  Esportata SOLO per il test anti-regressione dei bak. */
export function storeTemplate(nodeId, buf, meta = {}) {
  return writeOrWarn('grid.template', () => {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
    const f = templatePathOf(nodeId);
    const nuovo = Buffer.from(buf);
    if (existsSync(f) && Buffer.compare(readFileSync(f), nuovo) === 0) { scriviMetaStore(nodeId, nuovo, meta); return f; }
    if (existsSync(f)) {
      copyFileSync(f, bakName(f));
      pruneBackups(f, { keep: 10 });
    }
    writeFileSync(f, nuovo);
    scriviMetaStore(nodeId, nuovo, meta);
    return f;
  });
}

/* ---------- GUARDIA CONTEGGIO (1/11 sera, Coppa MX-5 ND Cup) ---------- */
// Un allineamento custom del gate (14 → 19) o una ronda con più gente fa
// SCRIVERE meno celle di quante ne abbia il template appuntato: sovrascriverlo
// con la griglia ridotta CANCELLA le tinte curate dal magazzino (le 8 nere + 8
// blu di Mauro, sparite). Si appunta solo quando il conteggio NON
// rimpicciolisce; quando aumenta si aggiorna (livedoor GENERA + APPLICA
// curato). Sta FUORI da storeTemplate perché il test anti-regressione dei bak
// (28/10) lo chiama direttamente e vuole la scrittura libera: la pila dei bak
// al secondo è già la memoria di tutte le versioni attraversate.
export function storeTemplateSeNonRidotto(nodeId, buf, meta = {}) {
  try {
    const f = templatePathOf(nodeId);
    if (existsSync(f)) {
      const cellaVecchia = gridFileOf(readFileSync(f)).cells.length;
      const cellaNuova = gridFileOf(Buffer.from(buf)).cells.length;
      if (cellaNuova < cellaVecchia) return f;   // il magazzino resta com'era
    }
  } catch { /* se non si legge il vecchio, si appunta come prima: i bak proteggono */ }
  return storeTemplate(nodeId, buf, meta);
}

/* ---------- DISCARICA DEI BACKUP ---------- */
// La potatura della pila dei bak è in tools/evo-grid.mjs (pruneBackups,
// importato e re-exportato in cima quì: UNA fonte per tutti dal 31/10). Il suo
// commento-calla di lezione resta là col codice.

/* ---------- GRIGLIE DI FABBRICA ---------- */
// DISTRIBUZIONE (24/10, domanda Mauro: «chi lo installa al primo cambio di
// campionato si inceppa perché non trova i template delle auto, giusto?» —
// sì). La cura è spedire le griglie COL programma: config/griglie-fabbrica/
// <nodeId>.customgrid è l'ULTIMO ripiego della corsa dei candidati (prima il
// magazzino per serie, poi i backup, poi gli snapshot). Il primo successo
// appunta comunque il template in data/grid-templates, quindi da lì la
// fabbrica non serve più.
// LE CELLE sono fotografia reale presa da EVO (regola anti-crash rispettata,
// lesson Suzuka + Gran Finale), ma un'INSTALLAZIONE può mancare di un'auto
// citata dalla griglia: prima di provarla, ogni carId delle celle viene
// giudicato con carExists (la STESSA base di validateLadder). Catalogo non
// giudicabile (vuoto o illeggibile) → NESSUN blocco: si lascia la prova e
// l'eventuale eroismo del builder.
let installSnapshot = null;   // { cars: Set, carNames: Set } — solo i test la usano (niente scansione vera)
export function setInstallSnapshot(s) { installSnapshot = s; }

/** Le auto della griglia MANCANTI in questa installazione (nome leggibile). */
function missingCarsOnInstall(file, ladder) {
  try {
    const content = installSnapshot ?? scanContentCached(resolvePaths());
    if (!(content.cars?.size ?? 0) && !(content.carNames?.size ?? 0)) return [];   // nulla per giudicare: non blocchi niente
    const ids = [...new Set(gridFileOf(readFileSync(file)).cells.map((c) => c.carId).filter(Boolean))];
    return ids.filter((id) => !carExists(id, ladder, content)).map((id) => ladder.contentNames?.cars?.[id] ?? id);
  } catch { return []; }   // catalogo assente o file illeggibile: non blocca
}

/** Errore dedicato quando la griglia di fabbrica cita auto assenti qui. */
function missingCarError(mancanti) {
  const elenco = [...new Set(mancanti)].slice(0, 4).join(', ');
  return Object.assign(new Error(tr({
    it: `La griglia di fabbrica cita auto che NON ci sono in questa installazione (${elenco}). Installa il contenuto, oppure costruisci la griglia a mano UNA volta: menu griglia del round in EVO → GENERA con le auto della serie → APPLICA — da lì il tool la appunta da solo.`,
    en: `The factory grid cites cars MISSING from this installation (${elenco}). Install the car content, or build the grid by hand ONCE: the round's grid menu in EVO → GENERATE with the series' cars → APPLY — the tool records it from there.`,
  })), { code: 'CAR_MISSING' });
}

/** GRIGLIA DI UN'ALTRA SERIE (4/11, P0.3): i nomi delle auto sul disco che
 *  NON sono nel parco ammesso della ronda — anche quando una o più auto
 *  combaciano (il caso misto Hyper_road a Imola: GT3 RS fra i30/GR86/MX-5).
 *  null = file assente/vuoto/illeggibile o parco non dichiarato: la vigia
 *  resta muta e comanda il Prepara. La usano la card (avviso) e il preflight
 *  del Prepara (blocco quando la ricostruzione dal template non è possibile). */
export function grigliaDiAltraSerie(file, ammesse) {
  try {
    const pool = (ammesse ?? []).map((s) => String(s ?? '').toLowerCase().trim()).filter(Boolean);
    if (!pool.length || !existsSync(file)) return null;
    const nomi = [...new Set(readCells(readFileSync(file)).cells.map((c) => String(c.name ?? '').trim()).filter(Boolean))];
    if (!nomi.length) return null;
    const fuori = nomi.filter((n) => !pool.includes(n.toLowerCase().trim()));
    return fuori.length ? fuori : null;
  } catch { return null; }
}

/** Il messaggio builder "il template non contiene le auto della serie" diventa
 *  il RITUALE corretto, una volta per serie invece di un'ansia eterna. */
function noTemplateHint(e, ladder, nodeId) {
  const msg = e?.message ?? String(e);
  if (!/non contiene/.test(msg)) return e;
  const node = (ladder.nodes ?? []).find((n) => n.nodeId === nodeId);
  const cls = loadClasses().classi?.[nodeId] ?? null;
  const pool = Array.isArray(cls?.poolAuto) ? cls.poolAuto : (Array.isArray(node?.cars) ? node.cars : []);
  const names = ladder.contentNames?.cars ?? {};
  const auto = pool.map((id) => names[id] ?? id).join(', ') || '(auto della serie)';
  return Object.assign(new Error(tr({
    it: `SERIE NUOVA, griglia ancora da costruire: nessun template sul disco ha le auto della serie — sul customgrid resta la griglia della gara scorsa. RIMEDIO (UNA volta per serie): in EVO, nel round che stai per correre, apri il menu griglia del round → GENERA con le auto della serie (${auto}) → APPLICA. Il tool fotografa quella griglia per la serie (data/grid-templates) e da lì in poi la riscrive da solo a ogni round.`,
    en: `NEW SERIES, grid not built yet: no template on disk carries the series' cars — the previous race's grid stays on file. FIX (once per series): in EVO, in the round you are about to run, open the round's grid menu → GENERATE with the series' cars (${auto}) → APPLY. The tool snapshots that grid for the series and afterwards rewrites it by itself every round.`,
  })), { code: 'NO_TEMPLATE' });
}


const writeSafe = (buf2, file = GRID_FILE, { force = false } = {}) => {
  if (gameRunning() && !force) throw Object.assign(new Error('EVO è APERTO: chiudi il gioco prima di scrivere la griglia.'), { code: 'GAME_RUNNING' });
  // lezione vergine (24/10): senza file non c'è cosa da backuppare — prima gara
  // della vita sul PC nuovo: la griglia nasce da zero (fabbrica), non da un resto.
  const backup = bakName(file, 'apply-');
  if (existsSync(file)) { copyFileSync(file, backup); pruneBackups(file); }
  writeFileSync(`${file}.tmp`, buf2);
  renameSync(`${file}.tmp`, file);
  return backup || '(nessun backup: file assente prima della scrittura)';
};

/**
 * Classe combaciante per i preset del file corrente (riusa il match del
 * builder: preset in comune con le regole, ≥2). { id, cls, hits } o null.
 */
export function matchCurrentClass(file = GRID_FILE) {
  const buf = readFileSync(file);
  const { cells } = readCells(buf);
  const presets = [...new Set(cells.map((c) => c.preset).filter(Boolean))];
  return pickClassInfo(loadClasses(), presets);
}

/**
 * Applica il bilancio della classe combaciata (match automatico per preset),
 * con supplementi perTraccia quando `track` è dato. opts: { track, file, force, dry }.
 */
export function applyBalance({ track = null, file = GRID_FILE, force = false, dry = false } = {}) {
  const buf = readFileSync(file);
  const { cells } = readCells(buf);
  const presets = [...new Set(cells.map((c) => c.preset).filter(Boolean))];
  const classes = loadClasses();
  const matched = pickClassInfo(classes, presets);
  if (!matched) throw Object.assign(new Error('nessuna classe conosciuta combacia con le auto del customgrid'), { code: 'NO_CLASS' });
  const { rules, trkMsg } = planFromClass(classes, matched.id, track);
  const res = balanceCells(buf, { rules });
  if (dry) return { classe: matched.id, trkMsg, report: res.report, written: false };
  const backup = writeSafe(encodeMsg(res.fields), file, { force });
  return { classe: matched.id, trkMsg, report: res.report, written: true, backup };
}

/** Riscrive l'intervallo AI nel config (21/22). opts: { file, force, dry }. */
export function applyAi([min, max], { file = GRID_FILE, force = false, dry = false } = {}) {
  const { fields } = setAiRange(readFileSync(file), min, max);
  if (dry) return { ai: [min, max], written: false };
  const backup = writeSafe(encodeMsg(fields), file, { force });
  return { ai: [min, max], written: true, backup };
}

// MEMORIA DEL LOG (26/10): per ogni nodo tengo l'ultima coppia «prima→dopo»
// mostrata in console — l'allineamento viene ricalcolato a ogni chiamata,
// la riga identica non la ripeto (vedi GATE EXTRA in rebuildGridApply).
const _ultimoAllineamento = new Map();

/** Rimuove le auto (preset o nome) dal file. opts: { file, force, dry }. */
export function dropCellsApply(matchers, { file = GRID_FILE, force = false, dry = false } = {}) {
  const res = dropCells(readFileSync(file), matchers.map((v) => String(v).startsWith('preset_') ? { preset: v } : { carName: v }));
  if (res.empty) return { droppate: [], written: false };
  if (dry) return { droppate: res.droppate, written: false };
  const backup = writeSafe(encodeMsg(res.fields), file, { force });
  return { droppate: res.droppate, written: true, backup };
}

/**
 * Ricostruisce la griglia della RONDA (multiclasse/auto della serie) dallo
 * stesso template che c'è sul disco, con il match della classe del builder:
 * è il gesto del CLI `griglia --servo-prepara` (cli.mjs cmdGriglia) messo a
 * disposizione dell'app GUI. A differenza di applyBalance/applyAi NON
 * presuppoone una classe combaciante per preset: se il customgrid sul disco
 * appartiene a un'altra serie (lezione del 23/10 mattina: avevo ancora
 * GT3-vs-EXP ma il save era sulla Coppa RX-7), la classe matchata è l'altra
 * e le zavorre scritte erano per lei; ricostruisce da template PLUS la
 * ricollocazione della classe della serie e delle sue poolAuto.
 * opts: { ladder, nodeId, roundIndex, file, force, dry }.
 * Ritorna { buffer, report, written, backup } o throw (NO_GRID / serie
 * fuori ladder / senza pool: il throw ha un messaggio già pronto come
 * commando per l'utente).
 */
/* ---------- TRAPIANTO DEL ROSTER (29/10, le Caterham di Mauro) ---------- */
// Riscrivere il customgrid non basta: la ronda spawna gli avversari dal SUO
// gamemodesave (weekend-roster.mjs). Questo wrapper chiama syncRoster con le
// celle appena scritte ed è SILENTE: un errore non deve MAI bloccare la
// preparazione della griglia — il report porta la nota di cosa è successo.
function trapiantaRoster(buffer, { force, dry }) {
  try {
    const celle = celleDiGrid(buffer);
    if (!celle.length) return 'celle non leggibili dal buffer: roster non toccato';
    const r = syncRoster(celle, { force, dry });
    const primo = r.blocchi?.[0];
    return r.written
      ? `roster weekend scritto: ${primo?.slot ?? '?'} slot su «${primo?.nome ?? '?'}» → ${[...new Set(primo?.carId ?? [])].join(', ')}${r.backup ? ` · backup ${basename(r.backup)}` : ''}`
      : `roster weekend: ${r.nota ?? 'già allineato'}`;
  } catch (e) {
    return `roster weekend non sincronizzato (${e.message})`;
  }
}

export function rebuildGridApply({ ladder, nodeId, roundIndex, file = GRID_FILE, force = false, dry = false, aiBandSerie = null } = {}) {
  if (!ladder || !nodeId || roundIndex == null) throw Object.assign(new Error('rebuildGridApply: servono ladder, nodeId e roundIndex'), { code: 'NO_ARGS' });
  // GATE DEL CONTEGGIO (24/10 15:50, Coppa 500): la carriera EVO si aspetta
  // un numero FISSO di avversari per ronda (gamemodesave 3.7/3.10): 14 per
  // quasi tutte le coppe monomarca, non i 6/12/13 a caso che avevamo messo
  // nella scala. Se il customgrid viene scritto con un conteggio diverso,
  // EVO 0.9.1 termina il processo subito dopo «Opponent [N] found!»
  // (0xC0000005 nel Render Worker). La griglia DEVE avere TANTE celle quante
  // le vetture native. La sovrascrittura vale solo se la pista del
  // gamemodesave è la STESSA della ronda (siamo davvero «dentro» la ronda); se
  // il file cita un'altra pista, nessuna allineamento (ambiente di test, EVO
  // vergine, round diverso). Le tre strade di scrittura qui sotto parla
  // tutte da `ladderUsa`, clonato SOLO se serve correggere il nodo.
  let bridge = null;
  let rosterVale = false;   // il gate di pista (sotto) abilita anche il TRAPIANTO delle celle nel weekend (weekend-roster 29/10)
  let ladderUsa = ladder;
  try {    const nativo = weekendCarCount();
      const round = (ladder.nodes ?? []).find((n) => n.nodeId === nodeId)?.calendar?.[roundIndex];
      // GATE EXTRA (26/10, report Mauro: il fiume «[griglia] conteggio allineato
      // 12 → 0» in console): 0 vetture native NON È un conteggio credibile — è
      // la lettura che non ha capito il gamemodesave (pista di prova, EVO chiuso,
      // file colto a metà scrittura). Allineare la griglia a 0 vetture vorrebbe
      // dire usarne una VUOTA, giustamente vietato dal commento del gate sopra:
      // senza un numero sopra lo zero lascio la griglia del save CHIUSO ai livelli
      // della scala, e il conto resta l'allineamento di quando si capisce davvero.
      const contabile = Number.isFinite(nativo?.cars) && nativo.cars > 0;
      if (nativo && round && contabile && nativo.track && sameTrack(nativo.track, round.track)) {
        rosterVale = true;   // siamo davvero nella ronda (questa pista nel weekend): le celle del roster possono seguire il pool
        // LEZIONE 27/10 (DTM Legends, «Prepara tutto» scriveva 1 cella):
        // nel regime CUSTOM (tutte le serie dal 26/10 notte) il conteggio
        // SENSO PLENO sta nei blocchi GARA del gamemodesave (3.7=15 → 16 celle,
        // la tua è la sesta... la sedicesima): il primo blocco (Practice) può
        // portare solo il RESIDUO di una ronda rotta (1 vettura). Il bersaglio
        // è dunque la CELLATURA del menu: declared + 1, con il minimo sopra le
        // voci 3.10 native (weekendCarCount ora scansiona TUTTI i blocchi).
        // E in CUSTOM NON SI RISTRINGE MAI: solo se l'attesa nativa SCONFGE la
        // gridSize della scala (12 vs 14, lezione 24/10 = crash 0xC0000005) si
        // allinea — il restringimento 16 → 1 di stamattina era questa strada
        // mancante. In AUTOMATIC resta l'allineamento ESATTO della lezione 24/10.
        const node0 = (ladder.nodes ?? []).find((n) => n.nodeId === nodeId);
        let bersaglio, dato;
        const modo = (() => { try { return weekendGridMode(); } catch { return null; } })();
        if (modo?.mode === 'custom') {
          const atteso = Math.max(nativo.cars, (Number.isFinite(nativo.declared) ? nativo.declared : 0) + 1);
          const target = celleGrigliaCampionato(node0);   // IL numero della serie (12, 14, 16, 18, 20…)
          bersaglio = Math.min(target, Math.max(GRIGLIA_CAMPIONATO.min, atteso));
          dato = `riga 3.7 = ${nativo.declared} (+1: sei tu), voci 3.10 native ${nativo.cars}, griglia della serie ${target}`;
          if (bersaglio !== atteso) {
            // REGOLA CAMPIONATO (4/11/2026): ogni campionato porta IL SUO numero
            // di auto (gridSize della serie, 12-22) — niente tetto unico. Se il
            // weekend ne dichiara di più (i 26-28 nativi) deve ASPETTARSI la
            // griglia nuova PRIMA che le celle cambino: in CUSTOM EVO dimensiona
            // il via su 3.7 + la tua auto (race.mjs), ma weekendCarCount
            // scandisce anche le voci 3.10 — se restano 27 il gate rilancerebbe
            // il conto, e celle diverse dall'atteso sono il 0xC0000005 della
            // lezione 24/10. Quindi roster ridotto agli stessi avversari e
            // 3.7 = avversari, POI il builder scrive declared + 1 celle e
            // syncRoster le trapianta. Se il weekend non si lascia scrivere,
            // NON si cambia il conteggio.
            const avversari = bersaglio - 1;
            let allineato = !!dry;   // in dry si prova il piano, senza toccare il save
            if (!dry) {
              try {
                riduciSlotRoster(avversari, { file: WEEKEND_FILE, force });
                if (Number(modo.count) !== avversari) setWeekendGridCustom(avversari);
                allineato = true;
              } catch (e) {
                console.log(`[griglia] griglia di campionato non applicata (${e.message}): resto a ${atteso} auto, weekend non toccato`);
              }
            }
            if (allineato) {
              dato += ` · serie ${target}: ${avversari} avversari (${bersaglio} auto)`;
              const chiaveCap = `cap:${atteso}→${bersaglio}`;
              if (_ultimoAllineamento.get(`${nodeId}#cap`) !== chiaveCap) {
                _ultimoAllineamento.set(`${nodeId}#cap`, chiaveCap);
                console.log(`[griglia] griglia di campionato: ${atteso} → ${bersaglio} auto («${nodeId}»), weekend riallineato a ${avversari} avversari`);
              }
            } else {
              bersaglio = atteso;
            }
          }
        } else {
          bersaglio = nativo.cars;
          dato = `vetture native ${nativo.cars}`;
        }
        // Allineamento ESATTO in entrambi i modi: in CUSTOM il restringimento è
        // lecito da quando il weekend viene riallineato PRIMA (sopra); senza,
        // celle diverse dall'atteso = crash (lezione 24/10).
        const daAllineare = node0 ? bersaglio !== node0.gridSize : false;
        if (node0 && daAllineare) {
          const prima = node0.gridSize;
          ladderUsa = { ...ladder, nodes: ladder.nodes.map((n) => (n === node0 ? { ...n, gridSize: bersaglio } : n)) };
          bridge = { from: prima, to: bersaglio };
          // DEDUPLICAZIONE LOG (stesso momento del fiume): l'allineamento è in
          // MEMORIA per chiamata, quindi il log identico si ripeteva a ogni
          // ricostruzione. Lo stampo solo quando cambia davvero la coppia
          // (nodo: prima → dopo) rispetto all'ultimo messaggio emesso.
          const chiaveLog = `${nodeId}:${prima}→${bersaglio}`;
          if (_ultimoAllineamento.get(nodeId) !== chiaveLog) {
            _ultimoAllineamento.set(nodeId, chiaveLog);
            console.log(`[griglia] conteggio allineato al gamemodesave: gridSize ${prima} → ${bersaglio} («${nodeId}», ${dato})`);
          }
        }
      }
  } catch { /* il conteggio non è mai un blocco: se non si legge, si va come prima */ }
  ladder = ladderUsa;
  // il TEMPLATE è il file attuale; su una serie con poolAuto dichiarato il
  // template con quel pool può esistere solo nei backup .bak-griglia/.bak-apply
  // del passato (il file corrente appartiene a UN'altra serie). Provo il file
  // corrente e in sua mancanza a fondo la stringa pronunciata di backup più
  // recente che POSSIde il pool della serie — ma SEMPRE il file corrente resta
  // il file di partenza: la scrittura non tocca i backup, e no altro template
  // moderno venga usato.
  // La scelta del backup: cerco in ordine di mtime l'ultimo candidato
  // (bacgriglia/backu-apply) che passa una dry-run del builder col pool di
  // questa serie — quindi nessuna altra potrebbe scelcarsi da sé.
  /* GUARDIA ANTI-SINGLETON (3/11, Coppa MX-5 ND Cup): dopo un rientro del save
   * (weekend azzerato) il vivo del customgrid si è ridotto a UNA cella UNICA:
   * la prima corsa sul vivo il builder la passa LO STESSO — riempie con i cloni
   * ARMONICI della medesima livrea (MONOCOLORE, il vivo delle 23:54, 16 posti
   * tutti visual_1) — e la corsa dei candidati non parte mai. La misura giusta
   * NON è il byte-distinto (i cloni armonici lo sono per costruzione): è la
   * TINTA (campo 11, la stessa estrazione del builder via readCells). Se il
   * magazzino della serie (data/grid-templates/<nodeId>) possiede PIÙ tinte
   * del vivo, la prima corsa SALTA: si va dritti ai candidati, che provano
   * il magazzino per PRIMO e poi i backup (il vivo perso resta nei .bak di writeSafe).
   * Best-effort: se non si legge niente, si gareggia come prima. */
  let saltoIlVivo = null;
  try {
    const tPath = templatePathOf(nodeId);
    if (existsSync(tPath) && existsSync(file)) {
      const tinteDi = (buf) => new Set(readCells(buf).cells.map((c) => c.tinta).filter(Boolean)).size;
      const vivo = tinteDi(readFileSync(file)), tpl = tinteDi(readFileSync(tPath));
      if (vivo > 0 && tpl > vivo) saltoIlVivo = { vivo, tpl };
    }
  } catch { /* niente guardia: la corsa resta quella di prima */ }
  let firstErr = null;
  if (saltoIlVivo) {
    console.log(`[griglia] guardia anti-singleton: il vivo ha ${saltoIlVivo.vivo} tint${saltoIlVivo.vivo === 1 ? 'a' : 'e'}, il magazzino della serie ne ha ${saltoIlVivo.tpl} → riscrittura dal magazzino (candidati: prima il template della serie)`);
    firstErr = Object.assign(new Error('vivo povero di tinte: si va coi candidati'), { code: 'ENOENT' });
  }
  if (!firstErr) {
    try {
      const first = buildGridMessage({ ladder, nodeId, roundIndex, file, aiBandSerie });
      if (dry) return { report: first.report, written: false };
      const backup = writeSafe(first.buffer, file, { force });
      storeTemplateSeNonRidotto(nodeId, first.buffer, { source: 'file corrente' });   // la griglia riuscita resta la memoria della serie (guardia: niente sovrascritture con meno celle)
      if (rosterVale) first.report.roster = trapiantaRoster(first.buffer, { force, dry });
      return { report: first.report, written: true, backup, countAlign: bridge };
    } catch (e) { firstErr = e; }
  }
  // lezione vergine (24/10, collaudo prova-vergine): sul PC di un player
  // NUOVO last_grid.customgrid può NON ESISTERE (prima gara della vita,
  // ENOENT): non va bloccata la corsa dei candidati — anzi è LÌ che serve
  // la fabbrica. Solo i codici SEMANTICI del builder (CAR_MISSING ecc.)
  //iscono l'errore subito; ENOENT va avanti coi candidati.
  if (firstErr?.code && firstErr?.code !== 'ENOENT') throw noTemplateHint(firstErr, ladder, nodeId);
    // 2) template appuntato della serie + backup compatibili: stessa serie
    //    (poolAuto) presenti nel file.
    try {
      const cls = loadClasses().classi?.[nodeId] ?? null;
      const pool = Array.isArray(cls?.poolAuto) ? cls.poolAuto : (Array.isArray((ladder.nodes ?? []).find((n) => n.nodeId === nodeId)?.cars) ? ladder.nodes.find((n) => n.nodeId === nodeId).cars : null);
      // pool VUOTO: nessuno stimolo. La soglia prima era <2: per le serie
      // MONOMARCA (pool di 1 auto, come la Coppa RS 3) il template appuntato
      // veniva buttato via senza nemmeno provarlo — è lo stesso buco del 23/10.
      if (!pool || !pool.length) throw noTemplateHint(firstErr, ladder, nodeId);
      const dir = dirname(file);
      // corsa dei candidati: PRIMA il template APPUNTATO della serie
      // (data/grid-templates/<nodeId>.customgrid: sopravvive a ogni cambio di
      // campionato), poi i backup del customgrid in ordine di mtime (tutti:
      // il taglio a 40 fa perdere i più antichi, che sono proprio le memorie
      // delle serie passate), poi gli snapshot del progetto.
      const candidati = [];
      const tPath = templatePathOf(nodeId);
      if (existsSync(tPath)) candidati.push({ file: tPath, label: basename(tPath) });
      const baks = readdirSync(dir).filter((f) => f.startsWith(basename(file) + '.bak-'));
      baks.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
      candidati.push(...baks.map((n) => ({ file: join(dir, n), label: n })));
      if (existsSync(SNAPSHOTS_DIR)) {
        candidati.push(...readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.customgrid')).map((n) => ({ file: join(SNAPSHOTS_DIR, n), label: n })));
      }
      // ULTIMO ripiego: la griglia di fabbrica spedita col programma.
      if (existsSync(factoryFileOf(nodeId))) candidati.push({ file: factoryFileOf(nodeId), label: 'griglia di fabbrica: ' + basename(factoryFileOf(nodeId)), factory: true });
      const fabbricaBloccata = [];
      let lastErr = firstErr;
      for (const { file: nomeFile, label, factory } of candidati) {
        try {
          // GATE di fabbrica: i carId della griglia devono avere il contenuto
          // installato (verifica con la stessa base di validateLadder).
          if (factory) {
            const mancanti = missingCarsOnInstall(nomeFile, ladder);
            if (mancanti.length) { fabbricaBloccata.push(...mancanti); lastErr = missingCarError(mancanti); continue; }
          }
          // Giudice UNICO: buildGridMessage. Il pre-filtro per numero di
          // modelli del pool (il vecchio minimo = min(3, pool.length)) era un
          // falso vincolo (24/10): il builder accetta QUALUNQUE file con
          // almeno una auto della pool (griglie con auto non ancora
          // comprate = la normalità storica, Coppa Città inclusa) e possiede
          // TUTTE le regole vere: monomarca, poolAuto, esclusioni di classe,
          // celle uniche. Un pre-filtro qui, senza la semantica del builder,
          // butta via template validi — e coppaa-citta è la prova.
          const { buffer, report } = buildGridMessage({ ladder, nodeId, roundIndex, file: nomeFile, aiBandSerie });
          if (dry) return { report, written: false, source: label };
          const backup = writeSafe(buffer, file, { force });
          storeTemplateSeNonRidotto(nodeId, buffer, { source: label });
          if (rosterVale) report.roster = trapiantaRoster(buffer, { force, dry });
          return { report, written: true, backup, source: label, countAlign: bridge };
        } catch (e) {
          lastErr = e;
          // MAGAZZINO STANTIO (4/11): se il template della serie non contiene più
          // le auto della serie (pool cambiato) non si riprova a ogni build: si
          // archivia come bak (recuperabile) e la corsa continua su bak/snapshot/
          // fabbrica. Solo in scrittura: i dry-run della card non toccano niente.
          if (!dry && nomeFile === tPath && /non contiene le auto/.test(String(e?.message ?? ''))) {
            writeOrWarn('grid.stale', () => {
              const arch = bakName(nomeFile, 'stale-');
              renameSync(nomeFile, arch);
              console.log(`[griglia] magazzino stantio archiviato (${basename(arch)}): ${String(e.message).slice(0, 120)}`);
            }); // niente archivio: si continua come prima
          }
        }
      }
      // La fabbrica era l'unica strada e qui l'installazione manca di auto:
      // il messaggio giusto è QUESTO, non il rituale generico.
      if (fabbricaBloccata.length) throw missingCarError(fabbricaBloccata);
      throw noTemplateHint(lastErr, ladder, nodeId);
    } catch (e) { throw noTemplateHint(e, ladder, nodeId); }
}
/* Stato della griglia per la GUI: celle, config, classe combaciata e perTraccia attiva. */
export function gridStatus({ track = null, file = GRID_FILE } = {}) {
  let buf;
  try { buf = readFileSync(file); } catch { return { file, exists: false }; }
  const info = readCells(buf);
  const presets = [...new Set(info.cells.map((c) => c.preset).filter(Boolean))];
  const classi = loadClasses().classi ?? {};
  let classe = null, hits = -1;
  for (const [id, cls] of Object.entries(classi)) {
    // STESSA dogana del builder (1/11 sera): su un pool monomarca la classe
    // multiclasse non parla — so pannello Leggette come lo scrittore.
    if (classeMulticlasseSuPoolMono(cls, presets)) continue;
    const h = (cls.regole ?? []).filter((r) => r.preset && presets.includes(r.preset)).length;
    if (h >= 2 && h > hits) { classe = id; hits = h; }
  }
  let perTraccia = null, convalidato = null, escluseClasse = [], escluseTraccia = [];
  if (classe) {
    const cls = classi[classe];
    escluseClasse = (cls.escludiAuto ?? []).filter((p) => presets.includes(p));
    if (track) {
      for (const [trk, ov] of Object.entries(cls.perTraccia ?? {})) {
        if (trk.startsWith('_') || !sameTrack(trk, track)) continue;
        perTraccia = trk;
        convalidato = ov.convalidato === true;
        escluseTraccia = (ov.escludiAuto ?? []).filter((p) => presets.includes(p));
        break;
      }
    }
  }
  return { file, exists: true, ...info, classe, perTraccia, convalidato, escluseClasse, escluseTraccia };
}


/* ---------- MODELLO DEL GIOCO (4/11): il gioco genera, noi controlliamo ---------- */

/**
 * Una serie e' «generata dal gioco» quando e' MONOMARCA e non ha regole di
 * classe da applicare (zavorra/restrictor). In quel caso EVO sa gia' costruire
 * la griglia dal weekend (Single Make + conteggio nativo): scrivere le celle
 * e' il lavoro in piu' che ci ha portato magazzino e fabbrica. Le multiclasse
 * restano sul customgrid, dove le regole di classe servono davvero.
 */
export function serieGenerataDalGioco(ladder, nodeId) {
  const node = (ladder?.nodes ?? []).find((n) => n.nodeId === String(nodeId ?? '')) ?? null;
  if (!node || !Array.isArray(node.cars) || node.cars.length !== 1) return false;
  const cls = loadClasses().classi?.[String(nodeId ?? '')] ?? null;
  if (Array.isArray(cls?.regole) && cls.regole.length) return false;
  return true;
}

/**
 * Validazione post-gara della griglia (il `grid_problem` del gioco): non
 * riscrive niente, guarda il risultato. Ritorna null se tutte le auto in gara
 * rientrano nel parco della serie, altrimenti { tipo, fuori, ammesse }.
 * `tipo` distingue la monomarca («non era Single Make») dalla classe.
 */
export function grigliaGaraFuori(result, { ladder, node }) {
  const auto = [...new Set((result?.drivers ?? [])
    .map((d) => `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim())
    .filter(Boolean))];
  if (!auto.length) return null;
  const parco = carPoolOf(ladder, node?.nodeId);
  if (!parco.ammesse.length) return null;
  const fuori = auto.filter((a) => !carInPool(a, parco.ammesse));
  if (!fuori.length) return null;
  return {
    tipo: (node?.cars ?? []).length === 1 ? 'single_make' : 'classe',
    fuori,
    ammesse: parco.ammesse,
  };
}
