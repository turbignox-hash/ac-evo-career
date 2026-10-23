// prova-vergine.mjs — COLLAAUDO DISTRIBUZIONE (24/10, richiesta Mauro):
// «programma un campionato con un'auto che non esiste ancora e vediamo se
// funziona caricando solo dalla fabbrica».
//
// Simula il PC di un player vergine che ha SOLO il programma:
//   • ACE_GAME_SAVEDIR → data/test-vergine: last_grid.customgrid è una
//     COPIA della griglia attualmente sul disco (griglia di un'altra serie —
//     il replica del bug «al cambio campionato resta la griglia scorsa»);
//   • EVO_DATA_DIR → data/test-vergine: magazzino (grid-templates), snapshot
//     e backup VUOTI;
//   • EVO_FACTORY_DIR → config/griglie-fabbrica reale: l'UNICO candidato.
// tutto in sandbox: zero scritture nel gioco, zero scritture nel progetto
// (tranne che nella cartella di test). Uso:
//   node tools/prova-vergine.mjs            → dry-run + scrittura completa nel sandbox
//   node tools/prova-vergine.mjs --dry      → solo dry-run
import { readFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const SB = join(PROJECT, 'data', 'test-vergine');

// env PRIMA dei import dinamici: i moduli leggono process.env alla creazione
process.env.ACE_GAME_SAVEDIR = SB;
process.env.EVO_DATA_DIR = SB;
process.env.EVO_FACTORY_DIR = join(PROJECT, 'config', 'griglie-fabbrica');

const dryOnly = process.argv.includes('--dry');
const primaGara = process.argv.includes('--prima-gara');   // sandbox GameModes SENZA last_grid
const ladder = JSON.parse(readFileSync(join(PROJECT, 'config', 'career.evo.ladder.json'), 'utf8'));

// replica del disco reale: griglia di un'altra serie in piedi (come al cambio
// di campionato). Se non c'è, il test replica comunque (first try → throw).
const reale = 'C:/Users/Mauro/Saved Games/ACE/GameModes/last_grid.customgrid';
if (!existsSync(join(SB, 'GameModes'))) throw new Error('sandbox GameModes mancante: lancia mkdir prima');
const sbFile = join(SB, 'GameModes', 'last_grid.customgrid');
if (primaGara) { if (existsSync(sbFile)) renameSync(sbFile, sbFile + '.via'); }
else { if (existsSync(sbFile + '.via')) renameSync(sbFile + '.via', sbFile); else if (existsSync(reale)) copyFileSync(reale, sbFile); }

const { rebuildGridApply } = await import(pathToFileURL(join(PROJECT, 'src', 'grid-apply.mjs')));
const { gridFileOf } = await import(pathToFileURL(join(PROJECT, 'tools', 'evo-grid.mjs')));

for (const nodeId of primaGara
  ? ['coppa_alfa-romeo-giulia-gtam', 'coppa_audi-rs-3-sportback']   // GTAm: byte-scan dimostra che fuori fabbrica il disco non la possiede
  : ['coppa_alfa-romeo-giulia-gtam', 'coppa_audi-rs-3-sportback', 'coppa_audi-r8-lms-gt4-evo']) {
  try {
    const dry = rebuildGridApply({ ladder, nodeId, roundIndex: 0, dry: true });
    console.log(`✅ dry  ${nodeId} → source: ${dry.source}`);
    console.log(`   serie ${dry.report.serie} · celle ${dry.report.gridSize} · AI ${dry.report.ai ?? '(template)'}`);
    console.log(`   bilancio: ${dry.report.origine}`);
    if (dryOnly) continue;
    const realeOut = rebuildGridApply({ ladder, nodeId, roundIndex: 0, dry: false, force: true });
    console.log(`✅ FULL ${nodeId} → scritta in sandbox (source ${realeOut.source}), template appuntato`);

    // verifica il file scritto: nelle celle DEVONO esserci le auto della serie e
    // l'unico customgrid del magazzino sandbox deve essere quello appena appuntato
    const g = gridFileOf(readFileSync(join(SB, 'GameModes', 'last_grid.customgrid')));
    const ids = [...new Set(g.cells.map(c => c.carId).filter(Boolean))];
    const want = ladder.nodes.find(n => n.nodeId === nodeId).cars;
    const ok = want.every(w => ids.includes(w));
    console.log(`   celle ${g.cells.length} · modelli: ${ids.join(', ')} · auto della serie presenti: ${ok ? 'SÌ' : 'NO ❌'}`);
    const tpl = join(SB, 'grid-templates', nodeId + '.customgrid');
    console.log(`   appuntato nel magazzino sandbox: ${existsSync(tpl) ? 'SÌ' : 'NO ❌'} ${tpl}`);
  } catch (e) {
    console.log(`❌ ${nodeId}: ${String(e?.message ?? e).split('\n')[0]}`);
    console.log(`   (${e?.code ?? ''})`);
  }
}
