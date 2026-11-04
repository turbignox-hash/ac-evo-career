// cars.mjs — le auto del gioco con le loro foto ufficiali.
//
// Le immagini (74 render ufficiali Kunos) vivono in gui/carmaps/<file>.jpg e il
// catalogo nome→file in data/car-images.json (generato dal sito assettocorsa.gg).
// Qui si abbinano ai nomi delle auto del ladder (contentNames.cars): i nomi non
// combaciano mai al 100% ("Mazda MX-5 ND Cup" vs "Mazda MX5 ND Cup (2017)"),
// quindi si confronta la stringa normalizzata con tolleranza per l'anno in coda.

import { readFileSync, existsSync} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CARS_DIR = join(HERE, '..', 'gui', 'carmaps');
const IMAGES_JSON = join(HERE, '..', 'data', 'car-images.json');
const BASELINE_JSON = join(HERE, '..', 'data', 'car-image-baseline.json');
const SPECS_JSON = join(HERE, '..', 'data', 'car-specs.json');
const SPECS_EXTRA_JSON = join(HERE, '..', 'data', 'car-specs-extra.json');
const PRICES_JSON = join(HERE, '..', 'data', 'car-prices.json');const normCar = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&#[0-9]+;/g, '').replace(/&[a-z]+;/g, '')
  .replace(/[^a-z0-9]/g, '');

let _index = null;
/** Indice normalizzato → file immagine, costruito una volta sola. */
function imageIndex() {
  if (_index) return _index;
  const idx = new Map();
  try {
    const list = JSON.parse(readFileSync(IMAGES_JSON, 'utf8'));
    for (const c of list) {
      if (!c.file || !existsSync(join(CARS_DIR, c.file))) continue;
      // tolgo l'anno in coda (1987), il tag "tuned" resta come variante separata
      const base = normCar(c.name).replace(/(19|20)\d{2}$/, '');
      if (base && !idx.has(base)) idx.set(base, '/carmaps/' + c.file);
    }
  } catch { /* catalogo assente: nessuna immagine */ }
  _index = idx;
  return idx;
}

/** Alias noti: nomi del ladder che non combaciano per prefisso. */
const CAR_ALIASES = [
  { re: /trueno|ae86/i, file: 'toyota_ae86.jpg' },
  { re: /datsun|240z|fairlady/i, file: 'nissan_datsun_240z_s30.jpg' },
  { re: /mx-?5\s*na|mx5\s*na/i, file: 'mazda_mx_5_na_1994.jpg' },
  { re: /nd\s*cup/i, file: 'mazda_mx5_nd_cup_2017.jpg' },
  { re: /supra.*(mk4|mkiv|rz|turbo)/i, file: 'toyota_supra_turbo_rz_1998.jpg' },
  { re: /delta.*integrale|hf.*integrale/i, file: 'lancia_delta_hf_integrale_evoluzione_2_1993.jpg' },
  { re: /190e/i, file: 'mercedes_benz_190e_amg_2_5_16_evo_ii.jpg' },
  { re: /964.*turbo|911.*964/i, file: 'porsche_911_turbo_3_6_964_1993.jpg' },
  { re: /mini.*(jcs|john cooper)/i, file: 'mini_john_cooper_s_mk_vi_1990.jpg' },
  { re: /gt3\s*rs.*992|992.*gt3\s*rs/i, file: 'porsche_911_992_gt3_rs.jpg' },
  { re: /hurac/i, file: 'lamborghini_huracn_sto_2021.jpg' },
  { re: /rennsport/i, file: 'porsche_992_gt3_r_rennsport.jpg' },
  { re: /gt2\s*rs.*clubsport/i, file: 'porsche_991ii_gt2_rs_clubsport_evo.jpg' },
  { re: /golf\s*gti.*mk1|gti.*mk1/i, file: 'volkswagen_golf_gti_mk1.jpg' },
  { re: /golf.*8\s*r(?!s)/i, file: 'volkswagen_golf_8_r.jpg' },
  { re: /m3\s*e30|sport\s*evo/i, file: 'bmw_m3_sport_evo_e30.jpg' },
  { re: /75\s*turbo|alfa.*75/i, file: 'alfa_romeo_75_1_8_turbo_evoluzione_1987.jpg' },
  { re: /delta/i, file: 'lancia_delta_hf_integrale_evoluzione_2_1993.jpg' },
];

let _specs = null;
/** Schede tecniche: AC1 (tools/build-car-specs.mjs → car-specs.json, con curve motore)
 *  + dataset extra per le auto EVO senza corrispettivo AC1 (car-specs-extra.json, senza
 *  curve: Wikipedia/siti ufficiali). L'extra NON sovrascrive mai AC1. */
function specsIndex() {
  if (_specs) return _specs;
  try { _specs = JSON.parse(readFileSync(SPECS_JSON, 'utf8')); } catch { _specs = {}; }
  try {
    const extra = JSON.parse(readFileSync(SPECS_EXTRA_JSON, 'utf8'));
    for (const [k, v] of Object.entries(extra)) {
      if (k.startsWith('_')) continue;
      if (!_specs[k]) _specs[k] = v;
    }
  } catch { /* extra assente: pazienza */ }
  return _specs;
}

let _prices = null;
/** Prezzi reali indicativi (euro): listino nuovo o mercato per le classiche,
 * costi di gara per le racing. data/car-prices.json, chiavi normalizzate. */
function pricesIndex() {
  if (_prices) return _prices;
  try { _prices = JSON.parse(readFileSync(PRICES_JSON, 'utf8')); } catch { _prices = {}; }
  return _prices;
}

/** Prezzo reale indicativo di un'auto (nome EVO o id). Null se ignoto. */
export function carPriceOf(nameOrId) {
  const prices = pricesIndex();
  if (!prices || !nameOrId) return null;
  const key = normCar(nameOrId).replace(/(19|20)\d{2}$/, '');
  if (prices[key] != null) return prices[key];
  if (SPEC_ALIASES[key] && prices[SPEC_ALIASES[key]] != null) return prices[SPEC_ALIASES[key]];
  for (const [k, v] of Object.entries(prices)) {
    if (k.length < 8 || key.length < 8) continue;
    const shared = k.startsWith(key) ? key.length : key.startsWith(k) ? k.length : 0;
    if (shared >= 8 && Math.abs(k.length - key.length) <= 6) return v;
  }
  return null;
}

/* Nomi EVO che non combaciano per prefisso con quelli di AC1 (modelli identici):
 * si mappano a mano. I modelli DIVERSI non vanno mappati (GT86 ≠ GR86). */
const SPEC_ALIASES = {
  'toyotasprintertrueno1600gtapexae86': 'toyotaae86',
  'toyotasprintertrueno1600gtapexae86kouki': 'toyotaae86',
  'kstoyotaae86': 'toyotaae86',
  'mazdamx5na': 'mazdamiatana',
  'ksmazdamx5na': 'mazdamiatana',
  'mazdamx5ndcup': 'mazdamx5nd',
  'ksmazdamx5nd': 'mazdamx5nd',
  'mazdarx7fdspiritr': 'mazdarx7spiritr',
  'mazdarx7fd': 'mazdarx7spiritr',
  'ksmazdarx7fd': 'mazdarx7spiritr',
  'bmwm3sportevoe30': 'bmwm3e30sportevoevolutioniii',
  'nissandatsun240zs30': 'datsun240zs30',
  'nissandatsun240zs30tuned': 'datsun240zs30',
  'caterhamsevenacademyracer': 'caterhamacademy',
  'caterhamacmd': 'caterhamacademy',
  'porsche911gt2rsclubsportevo991ii': 'porsche991iigt2rsclubsportevo991ii',
  'porsche911gt3rrennsport992': 'porsche992gt3rrennsport',
  'lamborghinihuracnsto': 'lamborghinihuracanst',
  'lamborghinihuracnsupertrofeoevo2': 'lamborghinihuracanst',
  'lanciadeltahfintegraleevoluzione2': 'lanciadeltahfintegraleevoluzioneii',
  'porsche911992gt3rs': 'porsche911gt3rs',
  'toyotasupraturborz': 'toyotasupramkiv',
  'toyotasupraturborzv2drift': 'toyotasupramkiv',
  'alfaromeo7518turboevoluzione': 'alfaromeo75turboevoluzione',
  'alfaromeojuniorelettricaveloce': 'alfaromeojunior',
  'mercedesbenz190eamg2516evoii': 'mercedesbenz190eevoii',
  'volkswagengolf8gticlubsport': 'volkswagengolf8gti',
  'lamborghinicountach': 'lamborghinicountachlp5000qvx',
  'kslamborghinicountach': 'lamborghinicountachlp5000qvx',
  'audisportquattro83': 'audisportquattro',
  'lotusexigev6cup': 'lotusexigev6cupx',
  'lotusexigev6cup2014': 'lotusexigev6cupx',
  'porsche911992gt3rs992': 'porsche911gt3rs',
  'ferrarif40lm': 'ferrarif40lmx',
  'ferrarif40lm1993': 'ferrarif40lmx',
  'ferrarif2004': 'ferrarif2004x',
  'ferrarisf252025': 'ferrarisf25',
  'fordmustanggt3': 'fordmustanggt3x',
  'porsche911gt3cup992': 'porsche911gt3cup992x',
  'alfaromeogiuliagtam': 'alfaromeogiuliagtamx',
  'alfaromeogiuliasprintgta': 'alfaromeogiuliasprintgtax',
  'audir8v10performancequattro': 'audir8v10plus',
  'chevroletcamarozl1': 'chevroletcamarozl1x',
  'ferrari488challengeevo': 'ferrari488gt3',
  'fordescortrscosworth': 'fordescortrs1600x',
  'lamborghinicountachlp5000qv': 'lamborghinicountachlp5000qvx',
  'mercedesbenz190e2516evoii': 'mercedesbenz190eevoii',
  'porsche718caymangt4clubsport': 'porschecaymangt4clubsport',
  'porsche718caymangt4rs': 'porsche718caymangt4rsx',
  'porsche911turbo36964': 'porsche911turbo36964x',
};

/** Scheda tecnica di un'auto (dal nome EVO o dall'id). Null se assente. */
export function carSpecsOf(nameOrId) {
  const idx = specsIndex();
  if (!idx || !nameOrId) return null;
  const key = normCar(nameOrId).replace(/(19|20)\d{2}$/, '');
  if (idx[key]) return idx[key];
  if (SPEC_ALIASES[key] && idx[SPEC_ALIASES[key]]) return idx[SPEC_ALIASES[key]];
  // prefisso condiviso stretto: ≥8 caratteri e lunghezze simili (≤6 di differenza):
  // fa combaciare "Honda NSX-R" ↔ "Honda NSX-R 92R" ma NON "GT2 RS Clubsport" ↔ "GT3 Cup"
  for (const [k, v] of Object.entries(idx)) {
    if (k.length < 8 || key.length < 8) continue;
    const shared = k.startsWith(key) ? key.length : key.startsWith(k) ? k.length : 0;
    if (shared >= 8 && Math.abs(k.length - key.length) <= 6) return v;
  }
  return null;
}

/**
 * Foto ufficiale di un'auto (dal nome mostrato o dall'id). Null se non trovata.
 * Il matching per prefisso è consentito solo verso l'immagine più corta e solo
 * se il modello principale (i primi token) coincide: evita F2004 → F40 LM.
 */
export function carImageOf(nameOrId) {
  if (!nameOrId) return null;
  const idx = imageIndex();
  const n = normCar(nameOrId).replace(/(19|20)\d{2}$/, '');
  if (idx.has(n)) return idx.get(n);
  let best = null;
  for (const [k, v] of idx) {
    const shared = k.startsWith(n) || n.startsWith(k);
    if (!shared) continue;
    // il prefisso comune deve coprire il modello (≥8 caratteri) e nessuna delle due
    // stringhe aggiunge un MODELLO diverso (le cifre codici tipo f2004/f40 contano)
    const common = k.startsWith(n) ? n.length : k.length;
    if (common < 8) continue;
    if (!best || common > best.common) best = { common, v };
  }
  if (best) return best.v;
  for (const a of CAR_ALIASES) {
    if (a.re.test(String(nameOrId)) && existsSync(join(CARS_DIR, a.file))) return '/carmaps/' + a.file;
  }
  return null;
}

/**
 * Il libro delle auto: tutte le foto ufficiali con il nome ufficiale, più
 * l'abbinamento alle auto del ladder (quelle che usi davvero in carriera).
 */
export function carsBook(ladder, { catalog = null } = {}) {
  let list = [];
  try { list = JSON.parse(readFileSync(IMAGES_JSON, 'utf8')); } catch { return { rows: [], ladderCars: [] }; }
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')); } catch { baseline = {}; }
  const names = ladder?.contentNames?.cars ?? {};
  // Perf. index e varianti dal catalogo del server dedicato (se disponibile)
  const catByNorm = new Map();
  for (const c of catalog?.cars ?? []) {
    const k = normCar(c.name).replace(/(19|20)\d{2}$/, '');
    if (k && !catByNorm.has(k)) catByNorm.set(k, c);
  }
  const catFor = (name) => catByNorm.get(normCar(name).replace(/(19|20)\d{2}$/, '')) ?? null;
  const ladderCars = Object.entries(names).map(([id, display]) => {
    const cat = catFor(display);
    return {
      id,
      name: display,
      image: carImageOf(display) ?? carImageOf(id),
      pi: cat?.pi ?? null,
      variants: cat?.variants?.map((v) => v.variant) ?? [],
      specs: carSpecsOf(display) ?? carSpecsOf(id),
      realPrice: carPriceOf(display) ?? carPriceOf(id),
    };
  });
  const byNorm = new Map(ladderCars.map((c) => [normCar(c.name).replace(/(19|20)\d{2}$/, ''), c]));
  const rows = list
    .filter((c) => existsSync(join(CARS_DIR, c.file)))
    .map((c) => {
      const base = normCar(c.name).replace(/(19|20)\d{2}$/, '');
      const hit = byNorm.get(base) ?? null;
      const cat = catFor(c.name);
      return { name: c.name, image: '/carmaps/' + c.file, category: c.category ?? 'road', pi: cat?.pi ?? null, variants: cat?.variants?.map((v) => v.variant) ?? [], ladderId: hit?.id ?? null, ladderName: hit?.name ?? null, shTop: baseline[c.file] ?? null, specs: carSpecsOf(c.name) ?? (hit ? carSpecsOf(hit.id) : null), realPrice: carPriceOf(c.name) ?? (hit ? carPriceOf(hit.id) : null) };
    });
  return { rows, ladderCars };
}
