// crea-release.mjs — TAG + RELEASE GitHub locale (26/10): raccoglie anche la
// funzione che mancava da sempre («crea una GitHub Release e caricala»),
// usando le credenziali GIT già salvate sul PC (git credential fill):
// il token NON viene mai stampato né scritto da nessuna parte.
//
// Uso:
//   node tools/crea-release.mjs v0.1.24 "titolo" corpo.md        (da file)
//   node tools/crea-release.mjs v0.1.25 "titolo" -- "corpo...\n..." (inline)
// Tag già presente → viene riusato; release già esistente → aggiorna il corpo.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [tag, titolo, ...rest] = process.argv.slice(2);
if (!tag || !titolo || rest.length === 0) { console.error('uso: node tools/crea-release.mjs <tag> <titolo> <corpo-file|corpo-inline>'); process.exit(1); }
const corpoRaw = rest.join(' ');
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
