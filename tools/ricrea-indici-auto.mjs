// ricrea-indici-auto.mjs — LA BLINDATURA DEGLI INDICI AUTO (25/10).
//
// L'installazione pulita di oggi ha rivelato il punto fragile: `data/` NON è
// versionato, quindi un PC vergine perde `car-images.json` e la GUI resta
// muto sull'auto (nessuna foto, nessun blocco «Auto della giornata») con il
// puro carImageOf() che torna null per catalogo assente. Le FOTO però ci sono
// sempre (`gui/carmaps/`): da qui il tool — se l'indice manca lo RICOSTRUISCE
// dalle fotografia, con il nome ricavato dal nome-fotografia (normCar è l'unica
// verità nell'abbinamento: maiuscole e spazi sono già tolti da cars.mjs).
// Gli altri indici (prezzi, specifiche, guids, baseline, specs-extra) NON si
// ricavano dalle foto: se mancano il tool lo DICE e indica il backup, senza
// creare file a caso.
//
// uso:
//   node tools/ricrea-indici-auto.mjs            (ricrea car-images.json se assente)
//   node tools/ricrea-indici-auto.mjs --force    (ricostruisce anche se c'è già)
//   node tools/ricrea-indici-auto.mjs --check    (solo verifica, nessuna scrittura)
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOTO_DIR = join(RADICE, 'gui', 'carmaps');
const IDX_FILE = join(RADICE, 'data', 'car-images.json');

export const ALTRI_INDICI = ['car-prices.json', 'car-specs.json', 'car-specs-extra.json', 'car-guids.json', 'car-image-baseline.json'];

/* Nome presentabile ricavato dal nome-fotografia: abarth_695_biposto_2022.jpg
   → "Abarth 695 Biposto (2022)". L'anno in coda va tra parentesi (come i file
   originali): il match di carImageOf lo toglie (normCar), il nome resta
   leggibile. */
export function nomeDaFoto(file) {
  const base = basename(file, extname(file));
  const parti = base.split(/[_.-]+/).filter(Boolean);
  let anno = null;
  if (parti.length > 1 && /^(19|20)\d{2}$/.test(parti.at(-1))) anno = parti.pop();
  const parole = parti
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .filter(Boolean);
  const nome = parole.join(' ');
  return anno ? `${nome} (${anno})` : nome;
}

/** La ricostruzione pura: lista di voci {name, file, category} da una dir di foto. */
export function rebuildCarImages({ photosDir = FOTO_DIR, category = 'road' } = {}) {
  const jpgs = readdirSync(photosDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('_'))
    .filter((f) => statSync(join(photosDir, f)).isFile() && statSync(join(photosDir, f)).size > 0);
  const list = jpgs
    .sort()
    .map((f) => ({ name: nomeDaFoto(f), file: f, category }));
  return { list, photosScanned: jpgs.length };
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const FORCE = process.argv.includes('--force');
  const CHECK = process.argv.includes('--check');
  if (!existsSync(FOTO_DIR)) {
    console.error(`[!] niente foto: ${FOTO_DIR} non esiste (le foto restano fuori dal repo, punto 3 di LICENSE.md)`);
    process.exit(1);
  }
  if (!FORCE && existsSync(IDX_FILE)) {
    let n = 0;
    try { n = JSON.parse(readFileSync(IDX_FILE, 'utf8')).length; } catch { /* indice corrotto: sotto lo ricrea */ }
    if (n) {
      console.log(`indici auto al passo: car-images.json in piedi con ${n} voci (usa --force per ricostruire)`);
      process.exit(0);
    }
    console.log('[!] car-images.json illeggibile: lo ricostruisco.');
  }
  const { list, photosScanned } = rebuildCarImages();
  if (CHECK) {
    console.log(`[check] ricostruzione possibile: ${photosScanned} foto → ${list.length} voci (nessuna scrittura)`);
    process.exit(0);
  }
  if (!list.length) {
    console.error("[!] nessuna foto in gui/carmaps: non c'è nulla da ricostruire");
    process.exit(1);
  }
  writeFileSync(IDX_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log(`✓ data/car-images.json ricostruito: ${list.length} voci da ${photosScanned} foto (gui/carmaps)`);
  /* GLI ALTRI indici NON si ricavano dalle foto: la verità sta sul disco o nel
     backup del progetto — un "creato a caso" sarebbe peggio di nulla. */
  const mancano = ALTRI_INDICI.filter((f) => !existsSync(join(RADICE, 'data', f)));
  if (mancano.length) {
    console.log(`⚠ indici che NON si possono ricreare dalle foto, oggi assenti: ${mancano.join(', ')}`);
    console.log('   ripristinali dal backup del progetto (es. evo-pitwall-backup-*/data-progetto/):');
    console.log("   senza car-guids.json l'auto del garage resta «non nel dizionario» e il Prepara non la scrive.");
  } else {
    console.log('✓ gli altri indici (prezzi, specifiche, guids) sono a posto.');
  }
}
