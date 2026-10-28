// pacchetto-amico.mjs — lo zip di installazione per un amico (24/10).
//
// Cosa produce: un pacchetti/ac-evo-career-amico-vX.Y.Z-<hash>.zip che contiene
// ESATTAMENTE lo stato tracciato del repo al commit corrente (git archive):
//   DENTRO        → src/ gui/ tools/ test/ config/ docs/ report/ README*,
//                   LICENSE.md GUIDA-AMICO.md avvia.cmd apri-gui.cmd …
//   FUORI di sicuro (non tracciati) → data/ (il TUO save), .git/ (la storia),
//   gui/carmaps/ gui/trackmaps/ (KUNOS, licenza: punto 3 di LICENSE.md),
//   dist/ demo/ sessione-*/ e i log.
// L'amico con questo pacchetto NON riceve aggiornamenti automatici (quegli
// arrivano solo col clone, capitolo 2 di GUIDA-AMICO.md): nel textarea finale
// è scritto da solo.
//
// Uso:   node tools/pacchetto-amico.mjs [--no-test]
//        --no-test  salta la prova npm test nella cartella estratta
import { execFileSync, spawnSync } from 'node:child_process';
// tar dichiarato QUI (e non più giù): anche l'iniezione del build-id lo usa
const TAR = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(fileURLToPath(import.meta.url), '..', '..');
const PACCHETTI = join(RADICE, 'pacchetti');
const NO_TEST = process.argv.includes('--no-test');

function git(args) {
  return execFileSync('git', args, { cwd: RADICE, encoding: 'utf8' }).trim();
}

// 1) situazioni che renderebbero lo zip o la consegna sbagliati → le dico e fermo
const _descrive = git(['describe', '--tags', '--always']).replace(/^v/, '');
const head = git(['rev-parse', 'HEAD']).slice(0, 7);
const sporco = git(['status', '--porcelain']);
const avanti = (() => {
  try { return git(['rev-list', '--count', 'offsite/main..HEAD']); }
  catch { return '-1'; } // remote assente: non fermo, avviso dopo
})();

const avvisi = [];
if (sporco) {
  console.log('⚠ Git ha modifiche NON committate: lo zip esce dal commit HEAD, non dal tuo disco sporco.\n' + sporco);
  avvisi.push('c\'erano file non committati al momento dello zip');
}
if (avanti === '-1') avvisi.push('remote `offsite` assente: gli amici clonarono lì non potranno aggiornarsi finché non lo aggiungi');
else if (avanti !== '0') avvisi.push(avanti + ' commit NON ancora spinti su offsite: l\'amico non li avrà se ora non spingi');

// 2) versione leggibile dal package.json del disco (dove segna il numero versione)
const pkg = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'));
const versione = pkg.version ?? '0.x';

const nome = `ac-evo-career-amico-v${versione}-${head}.zip`;
mkdirSync(PACCHETTI, { recursive: true });
const zip = join(PACCHETTI, nome);
execFileSync('git', ['archive', '--format=zip', '--prefix=ac-evo-career/', '-o', zip, 'HEAD',
  ':(exclude)archive',        // script di ricerca interni: non servono a chi usa il programma
  ':(exclude)pacchetti',      // gli zip dentro lo zip, ché schifo
], { cwd: RADICE });

// 2b) BUILD-ID DENTRO LO ZIP (24/10): l'installazione-zip DEVE scoprire da
// sola che committò ha a bordo, iltrimenti l'auto-aggiornamento
// (tools/aggiorna-zip.mjs) non ha un predicato per il confronto. Estraggo
// l'archivio, inietto il commit e lo re-imballo con tar (bsdtar -a crea lo
// zip dal solo suffisso .zip).
{
  const tmp = mkdtempSync(join(tmpdir(), 'pacchetto-id-'));
  try {
    const dest = join(tmp, 'tree');
    mkdirSync(dest, { recursive: true });
    spawnSync(TAR, ['-xf', basename(zip), '-C', dest], { cwd: PACCHETTI });
    writeFileSync(join(dest, 'ac-evo-career', 'build-id.txt'), `${head}\n(v${versione})\n`, 'utf8');
    spawnSync(TAR, ['-a', '-cf', basename(zip), '-C', dest, 'ac-evo-career'], { cwd: PACCHETTI });
    if (spawnSync(TAR, ['-tf', basename(zip)], { cwd: PACCHETTI, encoding: 'utf8' }).stdout.includes('ac-evo-career/build-id.txt') === false) {
      throw new Error('build-id.txt non è dentro lo zip: l iniezione non ha funzionato');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// tar: su Windows serve il bsdtar di System32 (legge gli zip; il GNU tar di Git Bash no)
// (la definizione di TAR sta in cima: l'iniezione del build-id la usa prima)

// 3) controllo del contenuto: niente data/, .git/, carmaps, trackmaps, dist, demo, sessione-
//    (tar su Windows interpreta "C:\..." come host remoto: cwd + nome relativo)
const sbil = spawnSync(TAR, ['-tf', basename(zip)], { encoding: 'utf8', cwd: PACCHETTI });
if (sbil.status !== 0) throw new Error('tar non ha letto lo zip: ' + (sbil.stderr ?? ''));
const voci = sbil.stdout.split(/\r?\n/).filter(Boolean);
const conteggio = {}; // cartelle di primo livello, per il riepilogo
for (const v of voci) {
  const primo = v.replace(/^ac-evo-career\//, '').split('/')[0];
  if (primo) conteggio[primo] = (conteggio[primo] ?? 0) + 1;
}
// CATALOGHI STATICI (25/10, installazione pulita): senza questi la GUI nasce
// muta sull'auto → SONO CON IL PACCHETTO, specchiati sulla whitelist di
// .gitignore. Il resto di data/ resta vietato (il save, il token, le copie
// viventi che l'app genera col tempo).
const CATALOGHI = [
  'car-images.json', 'car-image-baseline.json', 'car-prices.json',
  'car-specs.json', 'car-specs-extra.json', 'car-guids.json',
  // DIZIONARIO garage (27/10, «e sul pc dell'amico che si fa?»): le 15 auto
  // già apprese dal sampler e da learnCar viaggiano col pacchetto — l'amico
  // non parte col dizionario vuoto e alle serie note il Prepara l'auto da
  // solo alla PRIMA gara (prima doveva farlo a mano). Le auto nuove restano
  // sul flusso consueto: pick a mano la prima volta, impara a fine gara.
  'samples/garage/map.json',
].map((f) => `ac-evo-career/data/${f}`);
const vietati = voci.filter((v) =>
  (!v.endsWith('/') && !CATALOGHI.includes(v) && /^ac-evo-career\/data\//.test(v))
  || /^ac-evo-career\/(\.git\/|dist\/|demo\/|archive\/|sessione-|_gui\/)/.test(v)
  || /^ac-evo-career\/gui\/(carmaps|trackmaps)\//.test(v)
  || /Mauro|C:\\Users|C:\/Users/.test(v));
if (vietati.length) {
  console.log('❌ cialtroni dentro lo zip (dati personali o risorse licenziate):');
  for (const v of vietati.slice(0, 10)) console.log('   ' + v);
  throw new Error('lo zip contiene elementi vietati: rimuoverli e riprovare');
}

// 4) impronta SHA-256 e dimensione
const buf = readFileSync(zip);
const sha = createHash('sha256').update(buf).digest('hex');
const kb = Math.round(buf.length / 1024);

// 5) prova davvero: estrazione in temp e npm test DENTRO la cartella estratta.
//    (checklist fase 3: il pacchetto deve girare da solo, senza node_modules.)
let testTxt = 'NON FATTO (--no-test)';
if (!NO_TEST) {
  const tmp = mkdtempSync(join(tmpdir(), 'pacchetto-amico-'));
  try {
    const dest = join(tmp, 'estrazione');
    mkdirSync(dest, { recursive: true });
    spawnSync(TAR, ['-xf', basename(zip), '-C', dest], { cwd: PACCHETTI });
    const dentro = join(dest, 'ac-evo-career');
    const prova = spawnSync('npm', ['test'], { cwd: dentro, encoding: 'utf8', timeout: 180000, shell: true });
    const coda = ((prova.stdout ?? '') + (prova.stderr ?? '')).split(/\r?\n/).filter(Boolean).slice(-4).join('\n   ');
    testTxt = prova.status === 0
      ? `PASSANO (exit ${prova.status ?? 0}) — npm test dentro la cartella estratta`
      : `NESSUNO (exit ${prova.status}) — coda output:\n   ${coda}`;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`✅ ${nome}`);
console.log(`   commit dell'archivio: ${head} · versione ${versione} · ${git(['log', '-1', '--format=%s', head])}`);
console.log(`   ${voci.length} file · ${kb} KB`);
console.log(`   SHA-256: ${sha}`);
console.log(`   cartelle/albero: ${Object.keys(conteggio).sort().map((k) => `${k}(${conteggio[k]})`).join(' ')}`);
console.log(`   test nel pacchetto: ${testTxt}`);
if (avvisi.length) { console.log('⚠ avvisi:'); for (const a of avvisi) console.log('   - ' + a); }
console.log('\nCome consegnarlo: condividi lo zip. Dentro c\'è GUIDA-AMICO.md, che spiega che',
  'col CLONE gli aggiornamenti arrivano dal launcher; con lo ZIP dal 24/10 siete\n',
  'AUTO pure lì: basta che l\'amico prenda una volta questo pacchetto (che porta',
  'build-id.txt) e — se il repo è privato — salvi un token di lettura in data/.github-token.');
console.log(`Percorso: ${zip}`);
