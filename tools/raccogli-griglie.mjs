// raccogli-griglie.mjs — il GUARDIANO delle griglie di fabbrica (24/10).
//
// Problema (Mauro): per la distribuzione servono i template di TUTTE le serie,
// ma EVO scrive la griglia su disco SOLO all'avvio della sessione del round e
// ogni avvio sovrascrive il file: raccolte fatte "a memoria" si perdono.
//
// Questo ciclo veglia su last_grid.customgrid: a ogni NUOVA scrittura
//   1. decodifica le celle e riconosce LA SERIE dai carId (sottinsieme del
//      poolAuto/serie, preferendo la copertura esatta del pool);
//   2. valida la griglia col BUILDER (celle uniche, regole anti-crash,
//      monomarca/multiclasse) — niente scrittura se il builder rifiuta;
//   3. fotografa il file in data/grid-templates/<nodeId>.customgrid
//      E in config/griglie-fabbrica/<nodeId>.customgrid (backup se esiste).
//
// uso:
//   node tools/raccogli-griglie.mjs          → vigilanza (Ctrl+C per uscire)
//   node tools/raccogli-griglie.mjs --stampa → solo il quadro coperte/da raccogliere
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_MODES_DIR, gridFileOf } from './evo-grid.mjs';
import { buildGridMessage, loadClasses } from '../src/gridbuilder.mjs';
import { resolvePaths } from '../src/paths.mjs';
import { scanContentCached, normId } from '../src/content.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LADDER_FILE = join(HERE, '..', 'config', 'career.evo.ladder.json');
const MAGAZZINO = join(HERE, '..', 'data', 'grid-templates');
const FABBRICA = join(HERE, '..', 'config', 'griglie-fabbrica');
const FILE = join(GAME_MODES_DIR, 'last_grid.customgrid');
// griglie di auto SENZA serie nel ladder (richiesta Mauro 24/10: "ci servono
// tutte"): non equipaggiano nessuna serie corrente, ma sono materiale per serie
///eventi futuri — quelle perse non si rifanno. Archivio in data/griglie-grezz.
const GREZZE = join(HERE, '..', 'data', 'griglie-grezz');
// voci di content/cars/ che NON sono pacchetti auto reali (cartelle tecnica)://
// il quadro auto le esclude dal «da fotografare».
const IGNORED_NON_AUTO = new Set(['common_assets', 'common_phsx', 'interns', 'commos', 'commod']);

const ladder = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
const classi = loadClasses().classi ?? {};
const nomeAuto = (id) => ladder.contentNames?.cars?.[id] ?? id;
const nodeIdSan = (nodeId) => String(nodeId).replace(/[^a-zA-Z0-9_.-]/g, '_');
const poolOf = (n) => (Array.isArray(classi[n.nodeId]?.poolAuto) ? classi[n.nodeId].poolAuto : (n.cars ?? []));
const coperta = (n) => existsSync(join(MAGAZZINO, nodeIdSan(n.nodeId) + '.customgrid')) || existsSync(join(FABBRICA, nodeIdSan(n.nodeId) + '.customgrid'));

function quadra() {
  console.log('=== GRIGLIE DI FABBRICA — quadro ===');
  for (const n of ladder.nodes) {
    const pool = poolOf(n);
    if (!pool.length) continue;
    const stato = coperta(n) ? '✅ coperta' : '⬜ da raccogliere';
    const tipo = pool.length > 1 ? 'multiclasse' : 'monomarca';
    console.log(`${stato}  ${n.display} [${n.nodeId}] — ${tipo}, griglia ${n.gridSize} — auto: ${pool.map(nomeAuto).join(', ')}`);
  }
  console.log('====================================');
  console.log('Rituale per serie: EVO → round della serie → menu griglia → GENERA (liveries varie) → APPLICA → AVVIA la sessione (Esc appena carichi). Il guardiano fa il resto.');
  autoQuadra();
}

/** AUTO fotografate vs auto installate (richiesta Mauro 24/10: «dobbiamo
 *  mappare tutte le auto anche se non in campionato»). L'unione degli scatti
 *  viene da TRE fonti — fabbrica, magazzino, grezze — decodificando i carId
 *  di ogni cella; il totale installato dal catalogo dell'installazione
 *  (scan content). Con l'installazione non leggibile si mostra comunque la
 *  copertura raccolta, senza finte certezze sul «mancano». */
function autoQuadra() {
  const mappate = new Map();   // carId → nome letto nelle celle
  for (const dir of [FABBRICA, MAGAZZINO, GREZZE]) {
    if (!existsSync(dir)) continue;
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.customgrid')); } catch { continue; }
    for (const f of files) {
      try {
        const g = gridFileOf(readFileSync(join(dir, f)));
        for (const c of g.cells) {
          if (c.carId && !mappate.has(c.carId)) mappate.set(c.carId, c.carName ?? nomeAuto(c.carId));
        }
      } catch { /* file rotti: non fermano il quadro */ }
    }
  }
  // installate = catalogo ufficiale per NOME (l'installazione non espone le
  // cartelle auto: i token ks_* che girano nei file includono le liveries).
  let installate = null;
  try { installate = [...scanContentCached(resolvePaths()).carNames]; } catch { }
  const fotografateNome = new Set([...mappate.values()].map(normId).filter(Boolean));
  console.log('=== AUTO MAPPATE (scatti in fabbrica + magazzino + grezze) ===');
  if (installate && installate.length) {
    const dentro = installate.filter((n) => fotografateNome.has(n));
    const fuori = installate.filter((n) => !fotografateNome.has(n));
    console.log(`auto fotografate almeno una volta: ${dentro.length} su ${installate.length} installate (catalogo ufficiale)`);
    console.log(`ancora da fotografare: ${fuori.length}`);
    for (const n of fuori) console.log(`⬜ ${n}`);
  } else {
    console.log(`catalogo ufficiale non leggibile — auto fotografate almeno una volta: ${els.length}`);
    for (const [id, n] of els) console.log(`✅ ${n} [${id}]`);
  }
  console.log('================================================================');
}

/** Riconosce la serie: tutte le celle devono cadere nel pool; preferisce la copertura ESATTA, poi il pool più piccolo.
 *  Le serie GEMELLE a pool identico (24/10: EVO genera monomarca e multi con lo stesso pool per i filtri di
 *  prestazioni, es. Formula Elite e Coppa Ferrari SF-25 entrambe a ks_ferrari_sf_25) TUTTE partecipano:
 *  la foto va in ognuna, non solo nella prima. */
function serieDi(ids) {
  const cands = [];
  for (const n of ladder.nodes) {
    const pool = poolOf(n);
    if (!pool.length) continue;
    if (ids.every((id) => pool.includes(id))) cands.push({ n, esatta: pool.length === ids.length, len: pool.length, pool });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (b.esatta - a.esatta) || (a.len - b.len));
  const sig = (pool) => [...pool].sort().join('|');
  const gemelle = cands.slice(1).filter((c) => sig(c.pool) === sig(cands[0].pool));
  const altri = cands.slice(1).filter((c) => !gemelle.includes(c));
  return { prima: cands[0].n, gemelle: gemelle.map((c) => c.n), altri: altri.map((c) => c.n) };
}

/** Le auto con meno liveries di gridSize NON si possono allargare (EVO crasha
 *  sulle celle ripetute): si fa il contrario, si FISSA la griglia della serie al
 *  numero di liveries reali (richiesta Mauro 24/10). Patch del ladder con
 *  backup; ritorna il messaggio per il log o null se non applicabile. */
function fissaGrigliaCorta(s, e) {
  const m = String(e.message).match(/solo (\d+) celle uniche \(servono (\d+)\)/);
  if (!m) return null;
  const uniche = Number(m[1]), richieste = Number(m[2]);
  const n = ladder.nodes.find((x) => x.nodeId === s.prima.nodeId);
  // soglia ABBASSATA a 3 (richiesta Mauro 24/10 sulle BMW M3 E46 CSL / M4 CSL:
  // con sole 3 liveries reali il campo corto va bene — meglio griglia garantita
  // sul PC vergine che serie senza fabbrica)
  if (!n || n.gridSize !== richieste || uniche < 3) return null;   // sotto 3 vetture: rifiuto resta
  const bak = LADDER_FILE + '.bak-griglia-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  copyFileSync(LADDER_FILE, bak);
  n.gridSize = uniche;
  writeFileSync(LADDER_FILE, JSON.stringify(ladder, null, 2));   // senza newline finale: byte-fidelem col file attuale
  return `⚠ ${n.display}: griglia fissata a ${uniche} vetture — il modello ha ${uniche} liveries reali e non si possono inventare (celle ripetute = crash EVO). Ladder aggiornato, backup ${basename(bak)}.`;
}

/** Archivio GREZZO per le griglie che non combaciano con nessuna serie:
 *  ogni file diverso dal precedente viene salvato con timestamp + auto. */
let grezzaPrecedente = null;
function archiviaGrezza(buf, ids) {
  try {
    if (grezzaPrecedente && Buffer.compare(grezzaPrecedente, buf) === 0) return null;
    grezzaPrecedente = buf;
    if (!existsSync(GREZZE)) mkdirSync(GREZZE, { recursive: true });
    const tag = ids.slice(0, 3).map((id) => String(id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24)).join('-');
    const nome = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '__' + tag + '.customgrid';
    const dest = join(GREZZE, nome);
    writeFileSync(dest, buf);
    return dest;
  } catch { return null; }
}

function fotografia(buf) {
  const g = gridFileOf(buf);
  const ids = [...new Set(g.cells.map((c) => c.carId).filter(Boolean))];
  if (!ids.length) return { stampa: 'griglia senza carId leggibili: salto.' };
  const s = serieDi(ids);
  if (!s) {
    const dove = archiviaGrezza(buf, ids);
    return { stampa: `🅦 griglia non riconosciuta (carId: ${ids.map(nomeAuto).join(', ')}): nessuna serie del calendario combacia.${dove ? `\n   → archiviata comunque in ${dove}` : '\n   (uguale alla precedente: non risalvo)'}` };
  }
  const nodeId = s.prima.nodeId;
  // validazione col builder: niente foto se le regole dicono no (celle uniche & co.)
  let notaFissa = '';
  try { buildGridMessage({ ladder, nodeId, roundIndex: 0, file: FILE }); }
  catch (e) {
    // monomarca con poche liveries → fissa la griglia al reale e riprova una volta
    const fissata = fissaGrigliaCorta(s, e);
    if (fissata) { notaFissa = fissata + '\n'; try { buildGridMessage({ ladder, nodeId, roundIndex: 0, file: FILE }); } catch (e2) { notaFissa = ''; return { stampa: `❌ ${s.prima.display}: griglia fissata ma il builder rifiuta ancora (${String(e2.message).split('\n')[0]}).` }; } }
    else return { stampa: `❌ ${s.prima.display}: il builder RIFIUTA questa griglia (${String(e.message).split('\n')[0]}). Rifai il GENERA con più liveries uniche e riavvia la sessione.` };
  }
  const uniq = new Set(g.cells.map((c) => Buffer.from(c.raw).toString('hex'))).size;
  // foto in OGNI serie gemella a pool identico (stessa griglia per tutte),
  // + copia per la serie scelta: righe indipendenti per magazzino e fabbrica
  const bersagli = [s.prima, ...s.gemelle];
  const copie = [];
  for (const b of bersagli) {
    for (const dir of [MAGAZZINO, FABBRICA]) {
      const dest = join(dir, nodeIdSan(b.nodeId) + '.customgrid');
      const vecchio = existsSync(dest) ? readFileSync(dest) : null;
      if (vecchio && Buffer.compare(vecchio, buf) === 0) { copie.push(dest + ' (byte uguali, invariato)'); continue; }
      if (vecchio) copyFileSync(dest, dest + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16));
      writeFileSync(dest, buf);
      copie.push(dest);
    }
  }
  const gemellaNota = s.gemelle.length ? `\n   (gemelle a pool identico: ${s.gemelle.map((x) => x.display).join(', ')} — la foto
   va a tutte)` : '';
  return { stampa: `${notaFissa}✅ ${s.prima.display} fotografata: ${g.cells.length} celle (${ids.length} modelli, ${uniq} uniche) →\n   ${copie.join('\n   ')}${gemellaNota}${s.altri.length ? `\n   (nota: le auto combaciano anche per ${s.altri.map((x) => x.display).join(', ')} — se la serie è un'altra, dimmelo)` : ''}` };
}

if (process.argv.includes('--stampa')) { quadra(); process.exit(0); }

quadra();
let ultimo = null, ultimoMtime = 0;
if (existsSync(FILE)) { ultimo = readFileSync(FILE); ultimoMtime = statSync(FILE).mtimeMs; }
console.log(`vigilo su ${FILE} — crea la griglia in EVO e AVVIA la sessione: la foto parte da sola. Ctrl+C per uscire.`);
setInterval(() => {
  try {
    if (!existsSync(FILE)) return;
    const mt = statSync(FILE).mtimeMs;
    if (mt === ultimoMtime) return;
    ultimoMtime = mt;
    const buf = readFileSync(FILE);
    if (ultimo && Buffer.compare(ultimo, buf) === 0) return;   // scrittura a byte uguali
    ultimo = buf;
    console.log('\n— cambio griglia sul disco (' + new Date().toLocaleTimeString() + ') —');
    console.log(fotografia(buf).stampa);
  } catch (e) { console.log('vigilanza: errore (continuo):', String(e.message).split('\n')[0]); }
}, 3000);
