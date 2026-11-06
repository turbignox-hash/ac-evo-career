#!/usr/bin/env node
// Anteprima browser del «Cruscotto» (l'app nel menu di EVO) per collaudo
// FUORI dal gioco. La pagina di gioco non c'è: qui un guscio minimale
// («drawer» finto) col click che apre il pannello, che disegna cruscotto.js
// per gli stessi dati.
//
// LE FASCE SONO VERE: il server webui in macchina (src/uiapp-pub.mjs) scrive
// già ui-<slot>.json ogni 2,5 s nella cartella installata di Saved Games,
// qui SOLO LETTI, e serviti a qualunque slot — così l'app prende sempre la
// fascia più fresca scritta dal publisher, e l'anteprima mostra i dati vivi.
//
// uso: node tools/_preview-cruscotto.mjs [porta]   (default 9104, dopo curl)

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(QUI, 'uiapp', 'cruscotto');                    // sorgenti (script)
const INST = process.env.EVO_SAVED_GAMES
  ? join(process.env.EVO_SAVED_GAMES, 'mods', 'uiresources', 'ACEUIAppLoader', 'cruscotto')
  : 'C:/Users/Mauro/Saved Games/ACE/mods/uiresources/ACEUIAppLoader/cruscotto';
const PORTA = Number(process.argv[2]) || 9104;

// la fascia più fresca nella cartella installata: il nome ui-<slot>.json è
// un numero che corre coi tempi — mtime decide, mai il numero nel nome.
function fasciaPiuFresca() {
  try {
    const voci = readdirSync(INST)
      .filter((f) => /^ui-\d+\.json$/.test(f))
      .map((f) => ({ f, m: statSync(join(INST, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!voci.length) return null;
    const eta = Date.now() - voci[0].m;
    if (eta > 20 * 1000) return { nome: voci[0].f, eta };
    return { nome: voci[0].f, eta };
  } catch { return null; }
}

const GUSCIO = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Anteprima Cruscotto</title>
<style>html,body{margin:0;background:#1a1f2b;color:#e6edf3;font-family:'Segoe UI',system-ui,sans-serif}
#drawer{position:fixed;top:24px;right:24px;background:#25304a;border:1px solid #3b4a6b;border-radius:10px;padding:12px 18px;cursor:pointer;font-size:15px;letter-spacing:.5px}
#drawer:hover{background:#2f3d5e}
.nota{position:fixed;bottom:16px;left:16px;color:#8b98a9;font-size:12px;max-width:420px;line-height:1.5}</style></head>
<body>
<div id="drawer" title="simula la voce del drawer APPS di EVO: solo testo foglia, come la vuole agganciaDrawer">Cruscotto</div>
<div class="nota">Anteprima fuori dal gioco: il pannello si apre col click sul
«drawer» qui a fianco, come la voce APPS del menu di EVO. Le fasce arrivano
dai dati veri del tuo server (cartella installata, solo lettura).
Con <b>?loader=finto</b> nella URL il semaforo/tooltip gira come IN
GIOCO (persist ✓): utile per collaudare il tooltip e la storia comando.</div>
<script>
  // IL LOADER FINTO (31/10, collaudo del tooltip fuori dal gioco): con
  // ?loader=finto nella URL cruscotto.js trova window.ACEUIAppLoader come
  // nel menu di EVO — le righe del semaforo si accendono senza il gioco.
  if (location.search.includes('loader=finto')) {
    window.ACEUIAppLoader = {
      app: (k) => ({ base: '/ACEUIAppLoader/' + k + '/' }),
      persist: { storeLoaded: () => true },
    };
  }
</script>
<script src="/ACEUIAppLoader/cruscotto/cruscotto.js"></script>
<script>
  // il drawer IMITATO di EVO: cruscotto.js aggancia la riga col testo
  // «Cruscotto» via capture-listener (agganciaDrawer). Qui basta passarvi il click.
</script>
</body></html>`;

createServer(function (req, res) {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORTA);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(GUSCIO);
  }
  if (url.pathname === '/ACEUIAppLoader/cruscotto/cruscotto.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(readFileSync(join(APP, 'cruscotto.js')));
  }
  const mUi = /^\/ACEUIAppLoader\/cruscotto\/ui-(\d+)\.json$/.exec(url.pathname);
  if (mUi) {
    const f = fasciaPiuFresca();
    if (!f) { res.writeHead(404); return res.end('nessuna fascia mai scritta dal publisher'); }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'x-fascia-eta-ms': String(Math.round(f.eta)) });
    return res.end(readFileSync(join(INST, f.nome)));
  }
  if (url.pathname === '/ACEUIAppLoader/cruscotto/health') {
    const f = fasciaPiuFresca();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, fascia: f?.nome ?? null, etaMs: f ? Math.round(f.eta) : null }));
  }
  res.writeHead(404); res.end('not found');
}).listen(PORTA, '127.0.0.1', function () {
  console.log(`anteprima cruscotto: http://127.0.0.1:${PORTA}  (fasce da ${INST}, stop con CTRL-C)`);
});
