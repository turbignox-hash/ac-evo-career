import { existsSync, readFileSync, statSync } from 'node:fs';

/** Solo richieste nate dal proprio browser: l'Host è sempre il loopback locale
 *  (chiude il DNS rebinding) e l'Origin, quando il browser lo manda, deve essere
 *  il proprio (chiude il CSRF da qualunque sito aperto nel browser). Nessun
 *  Origin = client locale (curl, CLI, il probe di porta): consentito. */
function requestFromLocalBrowser(req, PORT) {
  const host = String(req.headers.host ?? '');
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}` && host !== `[::1]:${PORT}`) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(String(origin));
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.port !== String(PORT)) return false;
    } catch { return false; }
  }
  return true;
}

// cache statica invece della rilettura dal disco a ogni richiesta: i JS/CSS del
// cruscotto non cambiano finché non li tocchi. L'ETag (mtime+size) rende il
// revalidate quasi gratuito: browser manda If-None-Match, noi rispondiamo 304
// SENZA leggere nemmeno il file. index.html resta no-store (punto d'ingresso).
const STATIC_CACHE_MAX = 40;
const staticCache = new Map(); // file → { mtimeMs, size, buf }
function serveStatic(req, res, file, type = 'application/octet-stream') {
  if (!existsSync(file)) return false;
  const st = statSync(file);
  if (!st.isFile()) return false;
  const isHtml = file.toLowerCase().endsWith('.html');
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const revalidate = !isHtml; // html sempre fresco: da lì parte tutta l'app
  if (revalidate && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { 'Cache-Control': 'no-cache', ETag: etag });
    res.end();
    return true;
  }
  // NB: niente valori undefined negli header: writeHead rifiuta l'intero messaggio
  const hit = revalidate ? staticCache.get(file) : null;
  if (hit && hit.mtimeMs === Math.floor(st.mtimeMs) && hit.size === st.size) {
    res.writeHead(200, revalidate ? { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag } : { 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end(hit.buf);
  }
  const buf = readFileSync(file);
  if (revalidate) {
    if (staticCache.size >= STATIC_CACHE_MAX) staticCache.clear();
    staticCache.set(file, { mtimeMs: Math.floor(st.mtimeMs), size: st.size, buf });
  }
  res.writeHead(200, revalidate ? { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag } : { 'Content-Type': type, 'Cache-Control': 'no-store' });
  return res.end(buf);
}


export { requestFromLocalBrowser, serveStatic };
