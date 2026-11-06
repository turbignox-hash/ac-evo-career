// verifica-release.mjs — controllo post-release degli asset GitHub.
//
// Non si fida dei soli metadati: scarica i file pubblici, confronta la
// dimensione dichiarata e ricalcola lo SHA-256. Per EXE e bundle legge anche
// il sidecar e pretende che il nome dentro il sidecar sia quello giusto.
//
// Uso: node src/verifica-release.mjs v0.1.57
//      (senza tag usa la versione di package.json)
// Se il repository è privato, esporta GITHUB_TOKEN con accesso in lettura.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_DEFAULT = process.env.ACE_REPO ?? 'turbignox-hash/ac-evo-career';

/** Gli asset che una release Windows deve contenere, oltre al pacchetto amico. */
export function pianoAtteso(versione) {
  return [
    { kind: 'exe', nome: 'EVO-Pitwall-Setup.exe', sidecar: 'EVO-Pitwall-Setup.exe.sha256' },
    { kind: 'exe', nome: 'EVO-Pitwall-Setup-Offline.exe', sidecar: 'EVO-Pitwall-Setup-Offline.exe.sha256' },
    { kind: 'friend', prefisso: `ac-evo-career-amico-v${versione}-`, suffisso: '.zip' },
  ];
}

/** Legge un sidecar SHA-256 e pretende il nome file atteso. */
export function leggiSidecar(testo, nomeAtteso) {
  const trovato = String(testo).trim().match(/^([a-f0-9]{64})\s+\*?(.+?)\s*$/i);
  if (!trovato) throw new Error(`sidecar non valido: atteso "<sha256>  ${nomeAtteso}"`);
  const hash = trovato[1].toLowerCase();
  const nome = trovato[2];
  if (nome !== nomeAtteso) throw new Error(`sidecar per "${nome}", atteso "${nomeAtteso}"`);
  return hash;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Motivi per cui gli asset attesi non sono pronti, così li si può aspettare. */
function assetNonPronti(assets, versione) {
  const piano = pianoAtteso(versione);
  const perNome = new Map(Array.isArray(assets) ? assets.map((a) => [a.name, a]) : []);
  const amico = Array.isArray(assets)
    ? assets.filter((a) => a.name.startsWith(piano.at(-1).prefisso) && a.name.endsWith('.zip'))
    : [];
  const motivi = [];
  if (amico.length !== 1) motivi.push('pacchetto amico');
  for (const voce of piano) {
    if (voce.kind === 'friend') continue;
    for (const nome of [voce.nome, voce.sidecar]) {
      const asset = perNome.get(nome);
      if (!asset) motivi.push(`${nome} (mancante)`);
      else if (asset.state !== 'uploaded' || !(asset.size > 0)) motivi.push(`${nome} (${asset.state}, ${asset.size})`);
    }
  }
  return motivi;
}

export async function verificaRelease({ tag, repo = REPO_DEFAULT, fetchImpl = globalThis.fetch, log = console.log, attesaMassimaMs = 180000, intervalloMs = 15000 } = {}) {
  const versione = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const tagAtteso = `v${versione}`;
  const tagFinale = tag ?? tagAtteso;
  if (tagFinale !== tagAtteso) {
    throw new Error(`tag ${tagFinale} diverso dalla versione del progetto ${tagAtteso}`);
  }

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'User-Agent': 'evo-verifica-release',
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  async function leggiRelease() {
    const risposta = await fetchImpl(`https://api.github.com/repos/${repo}/releases/tags/${tagFinale}`, { headers });
    if (!risposta.ok) throw new Error(`API release ${tagFinale}: HTTP ${risposta.status}`);
    return risposta.json();
  }

  // Gli upload grossi finiscono dopo l'evento di pubblicazione: si aspetta
  // con sondaggi invece di dichiarare subito l'assenza (la run CI del
  // 5/11 è caduta così: v0.1.60 verificata a meno di un minuto dalla
  // pubblicazione, con l'EXE da 40 MB ancora in salita).
  let release = await leggiRelease();
  const termine = Date.now() + attesaMassimaMs;
  let motivi = assetNonPronti(release.assets, versione);
  while (motivi.length > 0 && Date.now() < termine) {
    log(`⏳ asset di ${tagFinale} ancora in arrivo: ${motivi.join(', ')} — nuovo sondaggio tra ${Math.round(intervalloMs / 1000)} s`);
    await new Promise((attesa) => setTimeout(attesa, intervalloMs));
    release = await leggiRelease();
    motivi = assetNonPronti(release.assets, versione);
  }
  if (release.tag_name !== tagFinale) throw new Error(`tag remoto ${release.tag_name}, atteso ${tagFinale}`);
  if (release.draft) throw new Error('la release è ancora una bozza');
  if (!release.prerelease) log('⚠ release non marcata pre-release');
  if (motivi.length > 0) throw new Error(`asset mancanti dopo l'attesa: ${motivi.join(', ')}`);

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const perNome = new Map(assets.map((a) => [a.name, a]));
  const piano = pianoAtteso(versione);
  const amico = assets.filter((a) => a.name.startsWith(piano.at(-1).prefisso) && a.name.endsWith('.zip'));
  if (amico.length !== 1) throw new Error(`pacchetto amico: trovati ${amico.length} asset, atteso 1`);
  const attesi = new Set([amico[0].name]);

  for (const voce of piano) {
    if (voce.kind === 'friend') continue;
    for (const nome of [voce.nome, voce.sidecar]) {
      const asset = perNome.get(nome);
      if (!asset) throw new Error(`asset mancante: ${nome}`);
      if (asset.state !== 'uploaded' || !(asset.size > 0)) throw new Error(`asset non pronto: ${nome} (${asset.state}, ${asset.size})`);
      attesi.add(nome);
    }
  }
  for (const asset of assets) {
    if (!attesi.has(asset.name)) log(`⚠ asset extra ignorato: ${asset.name}`);
  }

  async function scarica(nome) {
    const asset = perNome.get(nome) ?? amico[0];
    const r = await fetchImpl(asset.browser_download_url, { headers: { ...headers, Accept: 'application/octet-stream' } });
    if (!r.ok) throw new Error(`download ${nome}: HTTP ${r.status}`);
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length !== asset.size) throw new Error(`dimensione ${nome}: ${buffer.length}, attesa ${asset.size}`);
    return buffer;
  }

  log(`✓ release ${release.tag_name} · ${release.prerelease ? 'pre-release' : 'release'} · ${assets.length} asset`);
  for (const voce of piano) {
    if (voce.kind === 'friend') {
      const buffer = await scarica(amico[0].name);
      if (buffer.subarray(0, 2).toString('latin1') !== 'PK') throw new Error(`${amico[0].name}: non è uno ZIP`);
      log(`✓ ${amico[0].name} · ${buffer.length} byte · ZIP valido`);
      continue;
    }
    const buffer = await scarica(voce.nome);
    const sidecar = (await scarica(voce.sidecar)).toString('utf8');
    const atteso = leggiSidecar(sidecar, voce.nome);
    const calcolato = sha256(buffer);
    if (calcolato !== atteso) throw new Error(`${voce.nome}: SHA-256 ${calcolato}, atteso ${atteso}`);
    log(`✓ ${voce.nome} · ${buffer.length} byte · sha256 ${calcolato}`);
  }
  log(`✓ verifica completa: ${attesi.size} asset attesi, tutti coerenti`);
}

const invocato = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : '';
const modulo = fileURLToPath(import.meta.url).toLowerCase();
if (invocato === modulo) {
  verificaRelease({ tag: process.argv[2] }).catch((errore) => {
    console.error(`✧ verifica release fallita: ${errore.message}`);
    process.exitCode = 1;
  });
}
