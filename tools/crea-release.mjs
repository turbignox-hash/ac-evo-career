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
// Tag già presente → viene riusato; release già esistente → aggiorna il corpo.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const argv = process.argv.slice(2);
const tag = argv[0];
const titolo = argv[1];
const stopAsset = argv.indexOf('--asset');
const rest = (stopAsset === -1 ? argv.slice(2) : argv.slice(2, stopAsset)).join(' ');
const assets = stopAsset === -1 ? [] : argv.slice(stopAsset + 1);
if (!tag || !titolo || !rest) { console.error('uso: node tools/crea-release.mjs <tag> <titolo> <corpo-file|corpo-inline> [--asset file.zip ...]'); process.exit(1); }
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
for (const file of assets) {
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
