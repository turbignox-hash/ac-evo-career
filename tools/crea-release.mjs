// crea-release.mjs — TAG + RELEASE GitHub locale (26/10): raccoglie anche la
// funzione che mancava da sempre («crea una GitHub Release e caricala»),
// usando le credenziali GIT già salvate sul PC (git credential fill):
// il token NON viene mai stampato né scritto da nessuna parte.
//
// Uso:
//   node tools/crea-release.mjs v0.1.24 "titolo" corpo.md                      (corpo DA FILE)
//   node tools/crea-release.mjs v0.1.24 "titolo" -- "corpo"                    (corpo INLINE,
//     con a-capo veri: ognuno deve gestire gli escape del suo shell)
//   node tools/crea-release.mjs v0.1.25 "titolo" corpo.md --asset pacchetti/x.zip --asset y.zip
//     --asset (ripetibile): carica il file NELL'asset della release; se un
//     asset con lo stesso nome esiste già, lo CANCELLA e lo ricarica (sostituzione).
//     Se EVO_SIGN_* è configurata, dopo la verifica gli EXE in dist/ (e gli
//     eventuali .exe passati con --asset) salgono da soli con i loro .sha256.
//   node tools/crea-release.mjs v0.1.25 "titolo" corpo.md --con-pacchetto [--no-test]
//     --con-pacchetto: la zip del pacchetto-amico NON si fa a mano prima:
//     qui viene CONFEZIONATA (node tools/pacchetto-amico.mjs) e caricata
//     come asset proprio (la prima); --no-test le salta la prova npm
//     test dentro la cartella estratta.
//   --solo-preflight: gira SOLO il preflight (genera-uiapp + guardia delle
//     app + lista di controllo della guardia di layout) ed esce senza toccare
//     GitHub: la prova a secco della soglia di release.
//
// IL PREFLIGHT (3/11, richiesta Mauro: "collega la guardia al flusso di
// release: crea-release deve far girare genera-uiapp + la guardia prima
// di confezionare lo zip"): PRIMA di ogni cosa — prima delle credenziali,
// prima della release, prima della zip — girano
//   1) node tools/genera-uiapp.mjs: costruiti freschi (PERIODO_MS dal
//      publisher + firma BUILD_OK) e copie in gioco riallineate;
//   2) node --test test/uiapp-installata.test.mjs: la GUARDIA delle app in
//      gioco (biome sulle sagome, BUILD_OK, copia .js byte per byte e le
//      PAGINE D'INGRESSO: app.json = sorgente, menu.html assente).
// Qualunque esito non-zero: la release NON parte. E se la build ha
// riscritto file non committati lo dico ad alta voce: lo zip esce da
// git archive HEAD — senza commit il pacchetto porta i costruiti VECCHI
// e pacchetto-amico si ferma prima di crearlo.
//
// LA LISTA DI CONTROLLO DELLA GUARDIA DI LAYOUT (3/11, richiesta Mauro:
// "scrivi una lista di controllo di rilascio automatica per la guardia di
// layout dentro crea-release, nello stesso modo del preflight uiapp"): due
// punti DURI e un avviso, subito dopo il preflight delle app.
//   1) il CONTRATTO degli skip (test/skip-guardia-layout.test.mjs): tre
//      `return t.skip(...)` ognuno col perché, e nessun presupposto tornato
//      assert rosso. Test sul TESTO: 90 ms, niente browser.
//   2) la GUARDIA VERA (test/layout-impostazioni.test.mjs): 21 tab × 6
//      larghezze = 126 misure. La guardia è onesta con l'ambiente — senza
//      playwright-core, chromium o save si salta UNA volta col perché ed
//      esce 0 — quindi qui non si trasforma uno skip in un rosso: si dice
//      AD ALTA VOCE che quella release esce senza layout misurato, perché
//      il silenzio farebbe credere a una prova che non c'è stata.
//   3) IL CANCELLO dei file sporchi: lo zip nasce da `git archive HEAD`.
//      Con --con-pacchetto crea-release si ferma SUBITO se l'albero non è
//      pulito (e di nuovo dopo genera-uiapp); pacchetto-amico ripete il
//      controllo prima di creare lo zip.
// IL PREFLIGHT FIRMA (4/11): se EVO_SIGN_PFX o EVO_SIGN_THUMBPRINT è
// impostata, prima di GitHub verifica gli EXE presenti in dist/ e negli
// --asset con `build-installer-exe --verifica-firma`: catena Authenticode +
// corrispondenza dello .sha256 e versione nel .build.json. Un EXE non
// firmato, una firma rotta o una build vecchia fermano la release. Se il
// controllo passa, gli EXE e i loro .sha256 diventano asset della release
// senza doverli ripetere con --asset. Senza variabili di firma il controllo
// si salta (EXE non firmati).
// LA VERSIONE (4/11): il tag deve essere `v` + il numero in package.json.
// Una release v0.1.56 col package a 0.1.55 (o con EXE 0.1.55) non parte:
// il numero si allinea con `npm run bump` e un commit, non a mano.
//
// Tag già presente → viene riusato; release già esistente → aggiorna il corpo.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caricaAssetRelease, pianoAssetRelease } from '../src/release-assets.mjs';

const argv = process.argv.slice(2);
const SOLO_PREFLIGHT = argv.includes('--solo-preflight');
const CON_PACCHETTO = argv.includes('--con-pacchetto');
const NO_TEST_PACCHETTO = argv.includes('--no-test');
// i flag tool non sono né tag né titolo né asset: puliti via prima di carcare
const puliti = argv.filter((a) => a !== '--con-pacchetto' && a !== '--solo-preflight' && a !== '--no-test');
const tag = puliti[0];
const titolo = puliti[1];
const stopAsset = puliti.indexOf('--asset');
const rest = (stopAsset === -1 ? puliti.slice(2) : puliti.slice(2, stopAsset)).join(' ');
const assets = [];
if (stopAsset !== -1) {
  for (let i = stopAsset + 1; i < puliti.length; i++) {
    if (puliti[i] === '--asset') continue;
    if (puliti[i]) assets.push(puliti[i]);
  }
}
if (!tag || !titolo || !rest) { console.error('uso: node tools/crea-release.mjs <tag> <titolo> <corpo-file|corpo-inline> [--asset file.zip ...] [--con-pacchetto [--no-test]] [--solo-preflight]'); process.exit(1); }

// ---- IL PREFLIGHT delle app in gioco: la soglia di release -------------
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8'));
const versioneTag = String(tag).replace(/^v/, '');
if (versioneTag !== pkg.version) {
  console.error(`✧ tag ${tag} ≠ package.json ${pkg.version}: allinea la versione (npm run bump) e committa prima della release.`);
  process.exit(1);
}
console.log(`✓ tag ${tag} = package.json ${pkg.version}`);
// L'ALBERO (4/11): con --con-pacchetto la zip nasce da HEAD. Fermarsi qui
// evita di far girare l'intero preflight per poi fallire nel pacchetto.
if (CON_PACCHETTO && !SOLO_PREFLIGHT) {
  const stato = spawnSync('git', ['status', '--porcelain'], { cwd: RADICE, encoding: 'utf8' });
  const righe = (stato.stdout ?? '').trim();
  if (stato.status !== 0 || righe) {
    console.error('✧ albero non pulito: la zip uscirebbe da HEAD e lascerebbe fuori i nuovi. Committa o rimuovi prima.\n'
      + (righe || `git status exit ${stato.status}`));
    process.exit(1);
  }
}
// IL CORPO (4/11): leggerlo prima del preflight evita di fare tutto il giro
// per poi scoprire che il file .md/.txt non esiste.
let corpo = null;
if (!SOLO_PREFLIGHT) {
  const corpoRaw = rest;
  const isFile = corpoRaw.endsWith('.md') || corpoRaw.endsWith('.txt');
  try {
    corpo = isFile ? readFileSync(corpoRaw, 'utf8') : corpoRaw.replace(/\\n/g, '\n');
  } catch {
    console.error(`✧ corpo della release non leggibile: ${corpoRaw} (file .md/.txt mancante?)`);
    process.exit(1);
  }
  if (!corpo.trim()) {
    console.error('✧ corpo della release vuoto: scrivi il corpo (file o inline) prima.');
    process.exit(1);
  }
}
// IL TAG (4/11): la release vera deve partire da un tag che esiste e punta
// a HEAD. Senza questo, GitHub potrebbe creare il tag sul commit sbagliato.
// --solo-preflight può girare anche senza tag (prova a secco).
if (!SOLO_PREFLIGHT) {
  const ref = `refs/tags/${tag}`;
  const trovato = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: RADICE, encoding: 'utf8' });
  const tagCommit = trovato.status === 0
    ? spawnSync('git', ['rev-list', '-n', '1', ref], { cwd: RADICE, encoding: 'utf8' }).stdout.trim()
    : '';
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: RADICE, encoding: 'utf8' }).stdout.trim();
  if (trovato.status !== 0) {
    console.error(`✧ tag ${tag} non esiste: crealo su HEAD e pushalo prima della release.`);
    process.exit(1);
  }
  if (!tagCommit || tagCommit !== head) {
    console.error(`✧ tag ${tag} non punta a HEAD (${head.slice(0, 7)}): la release uscirebbe dal commit sbagliato.`);
    process.exit(1);
  }
  // ANCHE SUL REMOTO: un tag solo locale non basta; GitHub potrebbe crearlo
  // sul commit sbagliato. `ls-remote --exit-code` dà 2 quando non lo trova.
  const remoto = spawnSync('git', [
    'ls-remote', '--tags', '--exit-code', 'offsite', `refs/tags/${tag}`,
  ], { cwd: RADICE, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (remoto.status === 2) {
    console.error(`✧ tag ${tag} non è su offsite: pushalo prima della release (git push offsite ${tag}).`);
    process.exit(1);
  }
  if (remoto.status !== 0) {
    console.error(`✧ non riesco a leggere il tag ${tag} da offsite (git ls-remote, exit ${remoto.status}).`);
    process.exit(1);
  }
  const righeTag = (remoto.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  const esatta = righeTag.find((r) => r.endsWith(`refs/tags/${tag}`));
  const peeled = righeTag.find((r) => r.endsWith(`refs/tags/${tag}^{}`));
  const remotoSha = (peeled ?? esatta)?.split(/\s+/)[0] ?? '';
  if (remotoSha !== head) {
    console.error(`✧ tag remoto ${tag} punta a ${remotoSha.slice(0, 7) || '?'}, non a HEAD (${head.slice(0, 7)}): pusha il tag giusto.`);
    process.exit(1);
  }
}
function preghiamo(detta, args, { stdio } = {}) {
  console.log(`↻ ${detta}`);
  const r = spawnSync(process.execPath, args, { cwd: RADICE, encoding: 'utf8', stdio: stdio ?? 'inherit' });
  if (r.status !== 0) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    console.error(`✧ preflight non superato (${detta}, exit ${r.status}): la release NON parte.`);
    process.exit(1);
  }
  return r;
}
console.log('—— PREFLIGHT UIAPP: la release esce solo con le app fresche e sorvegluate ——');
preghiamo('node tools/genera-uiapp.mjs — costruiti freschi (PERIODO_MS + BUILD_OK) e copie in gioco riallineate', [join('tools', 'genera-uiapp.mjs')]);
preghiamo('node --test test/uiapp-installata.test.mjs — la guardia delle app in gioco (sagome, costruiti, copie, pagine d\'ingresso)', ['--test', join('test', 'uiapp-installata.test.mjs')]);
// la build ha riscritto qualcosa? lo zip esce da HEAD: senza commit non entra
const sporca = spawnSync('git', ['status', '--porcelain', '--', 'uiapp'], { cwd: RADICE, encoding: 'utf8' });
if ((sporca.stdout ?? '').trim()) {
  console.log('⚠ la build ha riscritto i costruiti NON committati: il pacchetto (git archive HEAD) li porterebbe VECCHI, quindi la release con --con-pacchetto si fermerebbe.\n' + sporca.stdout.trim());
  if (CON_PACCHETTO && !SOLO_PREFLIGHT) {
    console.error('✧ la build ha lasciato file non committati: la release NON parte. Committa prima.');
    process.exit(1);
  }
}
/* ---- LA LISTA DI CONTROLLO DELLA GUARDIA DI LAYOUT (i tre punti sono
 * spiegati in testa al file): due gradi duri, uno che avvisa. */
console.log('—— LISTA DI CONTROLLO LAYOUT: la release esce solo con la guardia viva ——');
preghiamo('node --test test/skip-guardia-layout.test.mjs — il contratto dei tre skip (cosa manca, dove si guarda, cosa fare)', ['--test', join('test', 'skip-guardia-layout.test.mjs')]);
const guardia = preghiamo('node --test test/layout-impostazioni.test.mjs — la guardia: 21 tab × 6 larghezze = 126 misure (sovrapposizioni e pannelli fuori viewport)', ['--test', join('test', 'layout-impostazioni.test.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
const tapGuardia = `${guardia.stdout ?? ''}\n${guardia.stderr ?? ''}`;
// il TAP si stampa comunque: la prova del layout deve restare nel log della release
process.stdout.write(tapGuardia);
const saltata = /^ok \d+ - .*?# SKIP (.+)$/m.exec(tapGuardia);
if (saltata) {
  console.log(`⚠ la guardia di layout si è SALTATA in questa release: ${saltata[1].trim()}`);
  console.log('  La release esce lo stesso (la guardia è ambiente, non codice), ma su questo PC il layout NON è stato misurato: se la release parla di GUI, va riprovata con chromium e una carriera a posto.');
} else {
  const suiteVerde = /# pass (\d+)/.exec(tapGuardia)?.[1] ?? '?';
  console.log(`✓ guardia di layout misurata: ${suiteVerde} suite verde, 126 misure (TAP qui sopra).`);
}
// lo zip esce da HEAD: una GUI modificata e non committata esce vecchia
const sporcaLayout = spawnSync('git', ['status', '--porcelain', '--', 'gui', 'test/layout-impostazioni.test.mjs', 'test/_layout-probe.mjs'], { cwd: RADICE, encoding: 'utf8' });
if ((sporcaLayout.stdout ?? '').trim()) {
  console.log('⚠ GUI o sonda della guardia NON committate: lo zip (git archive HEAD) porterebbe i file VECCHI, non il layout appena misurato; la release con --con-pacchetto si fermerebbe.\n' + sporcaLayout.stdout.trim());
  if (CON_PACCHETTO && !SOLO_PREFLIGHT) {
    console.error('✧ GUI o sonda non committate: la release NON parte. Committa prima.');
    process.exit(1);
  }
}
console.log(saltata
  ? '✓ lista di controllo layout superata a metà: contratto degli skip ✓, guardia SALTATA (vedi sopra) — release possibile, layout non misurato.'
  : '✓ lista di controllo layout superata: contratto degli skip ✓, guardia misurata ✓ (126 misure).');
/* ---- LA DANZA DEL PC AMICO (6/11): la release esce solo se l'amico installa e
 * gioca DAVVERO. `RELEASE_CHECKLIST.md` la pretendeva già, ma la sonda era
 * finita in `tools/archivio/` e nessuno la chiamava più: qui diventa una soglia
 * vera del preflight (zipball del ramo, `installa.cmd` in sandbox, primo e
 * secondo avvio del pacchetto). Gira anche con `--solo-preflight`, così la
 * prova a secco misura anche questo. Se la danza si rompe, la release NON parte. */
console.log('—— DANZA DEL PC AMICO: la release esce solo se l\'amico installa e gioca ——');
preghiamo('node tools/_collaudo-amico.mjs — zipball del ramo, installa.cmd in sandbox, primo e secondo avvio', [join('tools', '_collaudo-amico.mjs')]);

// ---- PREFLIGHT FIRMA EXE: se c'è un certificato, gli EXE devono essere
// firmati, coerenti con il loro .sha256 e della versione del progetto. Un EXE
// non firmato, una firma rotta o una build vecchia non devono partire.
console.log('—— PREFLIGHT FIRMA EXE: con un certificato, firma e .sha256 devono tornare ——');
const firmaConfigurata = Boolean(process.env.EVO_SIGN_PFX || process.env.EVO_SIGN_THUMBPRINT);
let exeFirmati = [];
if (!firmaConfigurata) {
  console.log('Firma: non configurata → EXE non verificati (nessun EVO_SIGN_PFX/EVO_SIGN_THUMBPRINT).');
} else {
  const candidati = [...new Set([
    ...assets.filter((a) => /\.exe$/i.test(a)).map((a) => resolve(a)),
    join(RADICE, 'dist', 'EVO-Pitwall-Setup.exe'),
    join(RADICE, 'dist', 'EVO-Pitwall-Setup-Offline.exe'),
  ].filter((f) => existsSync(f)))];
  if (!candidati.length) {
    console.log('⚠ firma configurata ma nessun EXE in dist/ o in --asset: niente da verificare in questa release.');
  } else {
    preghiamo(`node tools/build-installer-exe.mjs --verifica-firma — catena, .sha256 e versione di ${candidati.length} EXE`, [join('tools', 'build-installer-exe.mjs'), '--verifica-firma', ...candidati]);
    // Firmati e della build giusta: salgono da soli, col loro .sha256.
    exeFirmati = candidati.flatMap((f) => [f, `${f}.sha256`]);
    console.log(`EXE in release: ${exeFirmati.map((f) => basename(f)).join(', ')}`);
  }
}
if (SOLO_PREFLIGHT) {
  const piano = pianoAssetRelease({ espliciti: assets, firmati: exeFirmati });
  console.log(`Asset release (${piano.length}): ${piano.map((f) => basename(f)).join(', ')}`);
  console.log('✓ preflight superato (--solo-preflight): niente GitHub, niente zip.');
  process.exit(0);
}

// --con-pacchetto: la zip si confeziona QUI, dopo il preflight, e sale come asset
let zipFresco = null;
if (CON_PACCHETTO) {
  const dett = `node tools/pacchetto-amico.mjs${NO_TEST_PACCHETTO ? ' --no-test' : ''} — confezione dello zip, DOPO il preflight`;
  const r = preghiamo(dett, [join('tools', 'pacchetto-amico.mjs'), ...(NO_TEST_PACCHETTO ? ['--no-test'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  zipFresco = /^Percorso: (.+)$/m.exec(r.stdout ?? '')?.[1]?.trim() ?? null;
  if (!zipFresco) { console.error('✧ non ho letto il Percorso dello zip dall\'output del pacchetto: la release NON parte.'); process.exit(1); }
  console.log(`   zip fresca: ${zipFresco}`);
}
// corpo già letto prima del preflight (fail-fast)
const fill = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n' });
const cred = {};
for (const line of String(fill.stdout).split('\n')) { const eq = line.indexOf('='); if (eq > 0) cred[line.slice(0, eq)] = line.slice(eq + 1); }
const token = cred.password;
if (!token) { console.error('nessuna credenziale GitHub nel credential manager di questo PC'); process.exit(1); }

const repo = process.env.ACE_REPO ?? 'turbignox-hash/ac-evo-career';
const h = { 'User-Agent': 'evo-tool', Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };

// release esistente? allora patch, altrimenti crea (il tag punta già al commit giusto)
const list = await (await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers: h })).json();
const payload = JSON.stringify({ tag_name: tag, name: titolo, body: corpo });
const res = await fetch(list?.id ? `https://api.github.com/repos/${repo}/releases/${list.id}` : `https://api.github.com/repos/${repo}/releases`, { method: list?.id ? 'PATCH' : 'POST', headers: h, body: payload });
const out = await res.json();
console.log(res.status, out.html_url ?? out.message);
if (res.status >= 300) process.exit(1);
const releaseId = out.id ?? list.id;

// asset: POST binario su uploads.github.com; 422 (nome già preso) → si cancella
// quello esistente e si ritenta, così la zip della release è SEMPRE l'ultima
// la zip di --con-pacchetto sale per prima; poi gli asset espliciti e gli EXE
// firmati, senza doppioni (vedi src/release-assets.mjs).
const dallaZip = pianoAssetRelease({ zip: zipFresco, espliciti: assets, firmati: exeFirmati });
console.log(`Asset release (${dallaZip.length}): ${dallaZip.map((f) => basename(f)).join(', ')}`);
let assetKo = 0;
for (const file of dallaZip) {
  const esito = await caricaAssetRelease({ file, repo, releaseId, headers: h });
  if (esito.sostituito) {
    console.log('asset esistente cancellato (' + esito.cancellato + '): rischio ' + esito.nome);
  }
  if (esito.ok) {
    console.log(`asset ok: ${esito.nome} (${esito.kb} KB) → ${esito.body.browser_download_url ?? ''}`);
  } else {
    assetKo++;
    console.error(`asset KO (${esito.status}): ${esito.nome} — ${esito.body.message ?? ''}`);
  }
}
if (assetKo) {
  console.error(`✧ ${assetKo} asset NON caricati: la release NON è completa.`);
  process.exitCode = 1;
}
