// release-assets.mjs — il piano degli asset di una release GitHub.
//
// Sta fuori da crea-release.mjs per due motivi: si prova senza rete (un file
// alla volta, niente upload) e la deduplica è UNA sola — se un EXE arriva sia
// da --asset sia dal preflight firma, sale una volta sola.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/**
 * Ordine: zip fresca, asset espliciti, EXE firmati (col loro .sha256).
 * La chiave di deduplica è il percorso assoluto (case-insensitive su Windows).
 */
export function pianoAssetRelease({ zip = null, espliciti = [], firmati = [] } = {}) {
  const visti = new Set();
  const piano = [];
  for (const file of [zip, ...espliciti, ...firmati]) {
    if (!file) continue;
    const assoluto = resolve(file);
    const chiave = process.platform === 'win32' ? assoluto.toLowerCase() : assoluto;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    piano.push(file);
  }
  return piano;
}

/** Content-Type per l'upload: GitHub non deve servire un .sha256 come zip. */
export function tipoAssetRelease(nome) {
  const n = String(nome).toLowerCase();
  if (n.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (n.endsWith('.sha256') || n.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/zip';
}

/**
 * Carica un asset e, se il nome è già preso (422), cancella quello esistente
 * e riprova UNA volta. `fetchImpl` esiste per provare tutto senza rete.
 */
export async function caricaAssetRelease({
  file, repo, releaseId, headers = {}, fetchImpl = globalThis.fetch,
}) {
  const nome = basename(file);
  const buf = readFileSync(file);
  const urlUpload = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(nome)}`;
  const carica = () => fetchImpl(urlUpload, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': tipoAssetRelease(nome) },
    body: buf,
  });

  let up = await carica();
  let sostituito = false;
  let cancellato = null;
  if (up.status === 422) {
    // il nome esisteva: lo svuoto e riprovo UNA volta
    const lista = await (await fetchImpl(`https://api.github.com/repos/${repo}/releases/${releaseId}/assets`, { headers })).json();
    const presente = (lista ?? []).find((a) => a.name === nome);
    if (presente) {
      const del = await fetchImpl(`https://api.github.com/repos/${repo}/releases/assets/${presente.id}`, { method: 'DELETE', headers });
      cancellato = del.status;
      up = await carica();
      sostituito = true;
    }
  }
  const body = (await up.json().catch(() => ({}))) ?? {};
  return {
    nome, bytes: buf.length, kb: Math.round(buf.length / 1024),
    status: up.status, ok: up.status === 201, body, sostituito, cancellato,
  };
}
