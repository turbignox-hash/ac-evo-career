#!/usr/bin/env node
// Anteprima browser del «Pitwall» (l'app nel menu di EVO, ricostruita il
// 31/10) per collaudo FUORI dal gioco. Guscio minimale («drawer» finto) col
// click che apre il pannello, che disegna pitwall.js.
//
// LE FASCE SONO VERE: il publisher del cruscotto (src/uiapp-pub.mjs, tick del
// webui) scrive già le fasce — la PRINCIPALE nella cartella installata del
// cruscotto, la MINI-PITWALL (consigli · verdetto · sincro) in quella della
// pitwall. Qui si serve la più fresca DISPONIBILE: prima la pitwall
// (se il server rinnovato l'ha già scritta), altrimenti quella del cruscotto
// (stessi campi d'interesse, payload più ricco di cuore). Solo LETTURA.
//
// uso: node tools/_preview-pitwall.mjs [porta]   (default 9107)

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(QUI, 'uiapp', 'pitwall');                       // sorgenti (script)
const RADICE = process.env.EVO_SAVED_GAMES || 'C:/Users/Mauro/Saved Games';
const PITWALL = join(RADICE, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', 'pitwall');
const CRUSCOTTO = join(RADICE, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader', 'cruscotto');
const PORTA = Number(process.argv[2]) || 9107;

// la fascia più fresca in una cartella: mtime decide, mai il numero nel nome.
function fasciaPiuFresca(dir) {
  try {
    if (!existsSync(dir)) return null;
    const voci = readdirSync(dir)
      .filter((f) => /^ui-\d+\.json$/.test(f))
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return voci.length ? { dir, nome: voci[0].f, eta: Date.now() - voci[0].m } : null;
  } catch { return null; }
}
function fasciaDaServire() {
  // prima la mini-pitwall (il payload esatto che l'app leggerà in gioco),
  // poi la principale del cruscotto (stessi campi, sempre disponibile)
  return fasciaPiuFresca(PITWALL) ?? fasciaPiuFresca(CRUSCOTTO);
}

const GUSCIO = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Anteprima Pitwall</title>
<style>html,body{margin:0;background:#1a1f2b;color:#e6edf3;font-family:'Segoe UI',system-ui,sans-serif}
#drawer{position:fixed;top:70px;right:24px;background:#25304a;border:1px solid #3b4a6b;border-radius:10px;padding:12px 18px;cursor:pointer;font-size:15px;letter-spacing:.5px}
#drawer:hover{background:#2f3d5e}
.nota{position:fixed;bottom:16px;left:16px;color:#8b98a9;font-size:12px;max-width:420px;line-height:1.5}</style></head>
<body>
<div id="drawer" title="simula la voce del drawer APPS di EVO: solo testo foglia, come la vuole agganciaDrawer">Pitwall</div>
<div class="nota">Anteprima fuori dal gioco: il pannello si apre col click sul
«drawer» qui a fianco, come la voce APPS del menu di EVO. Le fasce arrivano
dai dati veri del tuo server (cartelle installate, solo lettura).</div>
<script src="/ACEUIAppLoader/pitwall/pitwall.js"></script>
</body></html>`;

createServer(function (req, res) {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORTA);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(GUSCIO);
  }
  if (url.pathname === '/ACEUIAppLoader/pitwall/pitwall.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(readFileSync(join(APP, 'pitwall.js')));
  }
  const mUi = /^\/ACEUIAppLoader\/pitwall\/ui-(\d+)\.json$/.exec(url.pathname);
  if (mUi) {
    const f = fasciaDaServire();
    if (!f) { res.writeHead(404); return res.end('nessuna fascia mai scritta dal publisher'); }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'x-fascia-eta-ms': String(Math.round(f.eta)) });
    return res.end(readFileSync(join(f.dir, f.nome)));
  }
  if (url.pathname === '/ACEUIAppLoader/pitwall/health') {
    const f = fasciaDaServire();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, fascia: f?.nome ?? null, cartella: f?.dir ? f.dir.replace(/\\/g, '/').split('/').pop() : null, etaMs: f ? Math.round(f.eta) : null }));
  }
  res.writeHead(404); res.end('not found');
}).listen(PORTA, '127.0.0.1', function () {
  console.log(`anteprima pitwall: http://127.0.0.1:${PORTA}  (fasce da ${PITWALL} o ${CRUSCOTTO}, stop con CTRL-C)`);
});
