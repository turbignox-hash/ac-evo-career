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
//   node tools/crea-release.mjs v0.1.25 "titolo" corpo.md --con-pacchetto [--no-test]
//     --con-pacchetto: la zip del pacchetto-amico NON si fa a mano prima:
//     qui viene CONFEZIONATA (node tools/pacchetto-amico.mjs) e caricata
//     come asset proprio (la prima); --no-test le salta la prova npm
//     test dentro la cartella estratta.
//   --solo-preflight: gira SOLO il preflight (genera-uiapp + guardia) ed
//     esce senza toccare GitHub: la prova a secco della soglia di release.
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
// git archive HEAD — senza commit il pacchetto porta i costruiti VECCHI.
// Tag già presente → viene riusato; release già esistente → aggiorna il corpo.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const assets = stopAsset === -1 ? [] : puliti.slice(stopAsset + 1);
if (!tag || !titolo || !rest) { console.error('uso: node tools/crea-release.mjs <tag> <titolo> <corpo-file|corpo-inline> [--asset file.zip ...] [--con-pacchetto [--no-test]] [--solo-preflight]'); process.exit(1); }

// ---- IL PREFLIGHT delle app in gioco: la soglia di release -------------
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
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
  console.log('⚠ la build ha riscritto i costruiti NON committati: il pacchetto (git archive HEAD) li porta VECCHI.\n' + sporca.stdout.trim());
}
if (SOLO_PREFLIGHT) { console.log('✓ preflight superato (--solo-preflight): niente GitHub, niente zip.'); process.exit(0); }

// --con-pacchetto: la zip si confeziona QUI, dopo il preflight, e sale come asset
let zipFresco = null;
if (CON_PACCHETTO) {
  const dett = `node tools/pacchetto-amico.mjs${NO_TEST_PACCHETTO ? ' --no-test' : ''} — confezione dello zip, DOPO il preflight`;
  const r = preghiamo(dett, [join('tools', 'pacchetto-amico.mjs'), ...(NO_TEST_PACCHETTO ? ['--no-test'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  zipFresco = /^Percorso: (.+)$/m.exec(r.stdout ?? '')?.[1]?.trim() ?? null;
  if (!zipFresco) { console.error('✧ non ho letto il Percorso dello zip dall\'output del pacchetto: la release NON parte.'); process.exit(1); }
  console.log(`   zip fresca: ${zipFresco}`);
}
const corpoRaw = rest;
const isFile = corpoRaw.endsWith('.md') || corpoRaw.endsWith('.txt');
const corpo = isFile ? readFileSync(corpoRaw, 'utf8') : corpoRaw.replace(/\\n/g, '\n');

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
const dallaZip = zipFresco ? [zipFresco, ...assets] : assets;   // la zip di --con-pacchetto sale per prima
for (const file of dallaZip) {
  const nome = basename(file);
  const buf = readFileSync(file);
  const carica = async () => fetch(`https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'User-Agent': 'evo-tool', Authorization: `token ${token}`, 'Content-Type': 'application/zip' },
    body: buf,
  });
  let up = await carica();
  if (up.status === 422) {
    // il nome esisteva: lo svuoto e riprovo UNA volta
    const dettaglio = await up.json().catch(() => ({}));
    const idAsset = (dettaglio?.errors?.map((e2) => e2.resource) ?? []).length ? null : null; // senza id diretto: passa dalla lista
    const lista = await (await fetch(`https://api.github.com/repos/${repo}/releases/${releaseId}/assets`, { headers: h })).json();
    const presente = (lista ?? []).find((a2) => a2.name === nome);
    if (presente) {
      const del = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${presente.id}`, { method: 'DELETE', headers: h });
      console.log('asset esistente cancellato (' + del.status + '): rischio ' + nome);
      up = await carica();
      void idAsset;
    }
  }
  const o = await up.json().catch(() => ({}));
  console.log(up.status === 201 ? `asset ok: ${nome} (${Math.round(buf.length / 1024)} KB) → ${o.browser_download_url ?? ''}` : `asset KO (${up.status}): ${nome} — ${o.message ?? ''}`);
}
