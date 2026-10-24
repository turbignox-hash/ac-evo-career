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
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameTrack } from './tracknames.mjs';
import { tr } from './lang.mjs';
import { gameRunning, encodeMsg, gridFileOf } from '../tools/evo-grid.mjs';
import { balanceCells, dropCells, setAiRange, planFromClass, readCells, DEFAULT_FILE } from '../tools/grid-balance.mjs';
import { weekendCarCount } from '../tools/set-track.mjs';
import { loadClasses, pickClassInfo, buildGridMessage } from './gridbuilder.mjs';
import { resolvePaths } from './paths.mjs';
import { scanContentCached, carExists } from './content.mjs';
import { slotDataDir } from './state.mjs';

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
const HERE_DIR = dirname(fileURLToPath(import.meta.url));
// nido per-slot (24/10): magazzino e snapshot vivono con la SUA carriera (slot 1 =
// data/ come fino ad oggi, slot 2-3 = data/slot-N/ vergini); la FABBRICA resta
// condivisa com'era (config/griglie-fabbrica): fotocopia statica del progetto,
// non appartiene a nessuna carriera.
const APPLY_DATA_DIR = slotDataDir();
const TEMPLATES_DIR = join(APPLY_DATA_DIR, 'grid-templates');
const SNAPSHOTS_DIR = join(APPLY_DATA_DIR, 'customgrid-snapshots');
const FACTORY_DIR = process.env.EVO_FACTORY_DIR ?? join(dirname(HERE_DIR), 'config', 'griglie-fabbrica');

const templatePathOf = (nodeId) => join(TEMPLATES_DIR, String(nodeId).replace(/[^a-zA-Z0-9_.-]/g, '_') + '.customgrid');
const factoryFileOf = (nodeId) => join(FACTORY_DIR, basename(templatePathOf(nodeId)));

/** Appunta il buffer come template della serie. riscritture successive con byte
 *  identici non toccano nulla (a ogni giro di poll il file non cambia). */
function storeTemplate(nodeId, buf) {
  try {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
    const f = templatePathOf(nodeId);
    const nuovo = Buffer.from(buf);
    if (existsSync(f) && Buffer.compare(readFileSync(f), nuovo) === 0) return f;
    if (existsSync(f)) { copyFileSync(f, `${f}.bak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`); pruneBackups(f, { keep: 10 }); }
    writeFileSync(f, nuovo);
    return f;
  } catch { return null; }
}

/* ---------- DISCARICA DEI BACKUP (ottimizzazione 24/10) ---------- */
// I .bak-<file>-<data> crescono a ogni gara senza freno (28 nello stesso
// turno): qua ogni nuovo backup spazza via i più vecchi DELLO STESSO file,
// tenendone una pila recente (i backup restano una fonte della corsa dei
// candidati: tetto ALTissimo, non un minimo). La pulizia non deve MAI far
// fallire una gara: ignora tutto ciò che non riesce a togliere.
// FALLITO in debug 24/10: il solo mtime basta? NO — su Windows il clock dei
// file ha granularità turbolenta e backup scritti nello stesso tick escono con
// la STESSA mtime: l'ordine di taglio diventava imprevedibile (il test
// corrupt-inputs lo ha beccato: restava il secondo-vecchio, usciva un altro).
// Tie-break: nome desc — il nome contiene la data del backup, quindi nel
// pareggio l'ordine alfabetico discendente è il più recente in fila.
export function pruneBackups(file, { keep = 25 } = {}) {
  try {
    const dir = dirname(file), base = basename(file);
    const pila = readdirSync(dir)
      .filter((n) => { const dot = n.lastIndexOf('.bak-'); return n.startsWith(base + '.bak-') && Number.isFinite(Number(n.slice(dot + 5).split('-')[0])); })
      .sort((a, b) => (statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs) || (a < b ? 1 : a > b ? -1 : 0));
    for (const vecchio of pila.slice(keep)) { try { rmSync(join(dir, vecchio)); } catch { /* occupato: si rimuove la prossima gara */ } }
  } catch { /* niente da potare */ }
}

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
  const backup = `${file}.bak-apply-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
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
export function rebuildGridApply({ ladder, nodeId, roundIndex, file = GRID_FILE, force = false, dry = false } = {}) {
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
  let ladderUsa = ladder;
  try {
    const nativo = weekendCarCount();
    const round = (ladder.nodes ?? []).find((n) => n.nodeId === nodeId)?.calendar?.[roundIndex];
    if (nativo && round && nativo.track && sameTrack(nativo.track, round.track)) {
      const node0 = (ladder.nodes ?? []).find((n) => n.nodeId === nodeId);
      if (node0 && node0.gridSize !== nativo.cars) {
        const prima = node0.gridSize;
        ladderUsa = { ...ladder, nodes: ladder.nodes.map((n) => (n === node0 ? { ...n, gridSize: nativo.cars } : n)) };
        bridge = { from: prima, to: nativo.cars };
        console.log(`[griglia] conteggio allineato al gamemodesave: gridSize ${prima} → ${nativo.cars} («${nodeId}», ${nativo.cars} vetture native)`);
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
  try {
    const first = buildGridMessage({ ladder, nodeId, roundIndex, file });
    if (dry) return { report: first.report, written: false };
    const backup = writeSafe(first.buffer, file, { force });
    storeTemplate(nodeId, first.buffer);   // la griglia riuscita resta la memoria della serie
    return { report: first.report, written: true, backup, countAlign: bridge };
  } catch (firstErr) {
    // lezione vergine (24/10, collaudo prova-vergine): sul PC di un player
    // NUOVO last_grid.customgrid può NON ESISTERE (prima gara della vita,
    // ENOENT): non va bloccata la corsa dei candidati — anzi è LÌ che serve
    // la fabbrica. Solo i codici SEMANTICI del builder (CAR_MISSING ecc.)
    //iscono l'errore subito; ENOENT va avanti coi candidati.
    if (firstErr.code && firstErr.code !== 'ENOENT') throw noTemplateHint(firstErr, ladder, nodeId);
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
          const { buffer, report } = buildGridMessage({ ladder, nodeId, roundIndex, file: nomeFile });
          if (dry) return { report, written: false, source: label };
          const backup = writeSafe(buffer, file, { force });
          storeTemplate(nodeId, buffer);
          return { report, written: true, backup, source: label, countAlign: bridge };
        } catch (e) { lastErr = e; }
      }
      // La fabbrica era l'unica strada e qui l'installazione manca di auto:
      // il messaggio giusto è QUESTO, non il rituale generico.
      if (fabbricaBloccata.length) throw missingCarError(fabbricaBloccata);
      throw noTemplateHint(lastErr, ladder, nodeId);
    } catch (e) { throw noTemplateHint(e, ladder, nodeId); }
  }
}

/** Stato della griglia per la GUI: celle, config, classe combaciata e perTraccia attiva. */
export function gridStatus({ track = null, file = GRID_FILE } = {}) {
  let buf;
  try { buf = readFileSync(file); } catch { return { file, exists: false }; }
  const info = readCells(buf);
  const presets = [...new Set(info.cells.map((c) => c.preset).filter(Boolean))];
  const classi = loadClasses().classi ?? {};
  let classe = null, hits = -1;
  for (const [id, cls] of Object.entries(classi)) {
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
