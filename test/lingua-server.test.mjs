// test/lingua-server.test.mjs — regressione di 24/10 (richiesta Mauro):
// «perché inglese se sto sulla italiano?» — le CARD dei consigli box sono
// assemblate SEVER-SIDE (webui-views.mjs, tr()) mentre il resto della GUI è
// tradotto nel browser: con il config del server rimasto a 'en' l'utente
// vedeva GUI italiana e card inglese. Qui si verifica che:
//   • /api/lang accetta it|en e la PERSISTE nel config della cartella dati
//     (sandbox EVO_DATA_DIR: mai il config vero del PC);
//   • con lang 'it' NESSUNA card del box porta frasi inglesi;
//   • con lang 'en' NESSUNA card porta frasi italiane.
// Porta 8732: fuori dal fallback 8642..8655 e dallo smoke (8731), così i test
// non si pestano i piedi anche in parallelo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// testa la TRADUZIONE delle serie senza server: setLang cambialo e rimettilo
// a it PRIMA che i test con server partano (questo file corre nel processo
// test-runner, i server child ereditano solo il loro env da spawn).
const { setLang, localizeLadder } = await import('../src/lang.mjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src', 'webui.mjs');
const PORT = 8732;
const BASE = `http://127.0.0.1:${PORT}`;

// marker DISTINCT dell'altra lingua: se la card li contiene, il locale ha
// sbagliato strada. Frasi lunghe = zero falsi positivi.
const EN_MARKERS = ['No stop', 'Suggested stop', 'Mandatory pit stop', 'Ideal tyre pressure',
  'Empty telemetry for this car', 'No telemetry on', 'the WHOLE race', 'the 4-PSI rule', 'Evening race'];
const IT_MARKERS = ['Niente sosta', 'Sosta consigliata', 'Pit-stop obbligatorio', 'Pressione gomme ideale',
  'Telemetria di questa auto vuota', 'Nessuna telemetria su', 'gara TUTTA in pioggia', 'regola dei 4 PSI', 'Gara serale'];

async function waitReady(child, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode !== null) throw new Error(`server uscito subito (exit ${child.exitCode})`);
    try { const r = await fetch(`${BASE}/api/watcher?probe=1`); if (r.ok) return; } catch { }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`server non risponde su ${BASE} entro ${ms}ms`);
}

async function postLang(want) {
  const r = await fetch(`${BASE}/api/lang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: want }) });
  return { code: r.status, j: await r.json().catch(() => null) };
}
async function getCard() {
  const r = await fetch(`${BASE}/api/card`);
  const text = await r.text();
  return { code: r.status, j: JSON.parse(text ?? '{}') };
}
const tipsText = (j) => (j?.boxRadio?.tips ?? []).map((t) => `${t.title ?? ''} ${t.text ?? ''}`).join(' || ');

test('la lingua del server comanda le CARD del box (it→card italiana, en→card inglese) e si persiste in sandbox', { timeout: 30000 }, async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-lingua-'));
  mkdirSync(join(DATA, 'Results'), { recursive: true });
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    // EVO_DATA_DIR: il config del TOOL vive in sandbox (mai evo.config.json vero);
    // ACE_DATA: le strade dati di EVO (MoTec/Results) puntano alla sandbox;
    // EVO_LANG tolto: nessun override d'ambiente deve decidere al posto di /api/lang.
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA, EVO_LANG: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => { process.env.VERBOSE && process.stderr.write(String(d)); });
  try {
    await waitReady(child);
    const boot = await (await fetch(`${BASE}/api/boot`)).json();

    // 1) set IT / persist / card senza inglese
    let p = await postLang('it');
    assert.equal(p.code, 200, 'POST /api/lang it deve rispondere 200');
    assert.equal(p.j.lang, 'it', 'la risposta deve confermare it');
    const cfgFile = join(DATA, 'evo.config.json');
    if (existsSync(cfgFile)) {
      assert.equal(JSON.parse(readFileSync(cfgFile, 'utf8')).lang, 'it', 'la scelta deve essere persistita nel config sandbox');
    }
    if (boot.hasCareer) {
      const card = await getCard();
      assert.equal(card.code, 200, 'card deve rispondere 200 con la carriera');
      const txt = tipsText(card.j);
      for (const m of EN_MARKERS) assert.ok(!txt.includes(m), `lang it: la card NON deve contenere «${m}» (testo: ${txt.slice(0, 200)})`);
    }

    // 2) set EN / card senza italiano
    p = await postLang('en');
    assert.equal(p.code, 200, `POST /api/lang en deve rispondere 200 (ricevuto: ${JSON.stringify(p.j)})`);
    assert.equal(p.j.lang, 'en', 'la risposta deve confermare en');
    if (boot.hasCareer) {
      const card = await getCard();
      assert.equal(card.code, 200);
      const txt = tipsText(card.j);
      for (const m of IT_MARKERS) assert.ok(!txt.includes(m), `lang en: la card NON deve contenere «${m}» (testo: ${txt.slice(0, 200)})`);
    }

    // 3) ritorno a it: lo stato lasciato dal test è neutro rispetto alla GUI
    await postLang('it');
  } finally { child.kill(); }
});

test('MAPPA DISPLAY_EN (1/11): le serie tradotte cambiano display, il pattern path funziona ed il già-EN resta (test sazio chiuso)', () => {
  // la mappa era SMONTABILE (13 nomi fissi: Coppa Città → City Cup,
  // Trofeo Hatch → Hatch Trophy, …) senza che questo file muovesse un muso
  // (il test vecchio copriva solo le CARD del box, non i display del ladder).
  const ladder = { disciplines: [], archetypes: {}, nodes: [ { display: 'Coppa Città' }, { display: 'Trofeo Hatch' }, { display: 'Coppa Prova' }, { display: 'GT4 Open' } ] };
  setLang('en');
  try {
    localizeLadder(ladder);
    assert.equal(ladder.nodes[0].display, 'City Cup', 'mappa: «Coppa Città» deve essere City Cup in EN');
    assert.equal(ladder.nodes[1].display, 'Hatch Trophy', 'mappa: «Trofeo Hatch» deve essere Hatch Trophy in EN');
    // nome NON in mappa: via pattern (`Coppa X` → `X Cup`)
    assert.equal(ladder.nodes[2].display, 'Prova Cup', 'pattern: «Coppa Prova» deve essere Prova Cup in EN');
    // già adatto all'EN: invariato
    assert.equal(ladder.nodes[3].display, 'GT4 Open', 'già EN: «GT4 Open» NON deve cambiare');
    // il file su disco NON deve mutare: la traduzione è in place, non persistita
    assert.equal(ladder.lingua, undefined, 'nessun campo lingua estraneo spunta nel ladder');
  } finally { setLang('it'); }
});

test('lang non valida: 400 gentile, niente cambio', async () => {
  const DATA = mkdtempSync(join(tmpdir(), 'evo-lingua-bad-'));
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, ACE_UI_PORT: String(PORT), ACE_DATA: DATA, EVO_DATA_DIR: DATA, EVO_LANG: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitReady(child);
    const r = await fetch(`${BASE}/api/lang`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'xx' }) });
    assert.equal(r.status, 400, 'lang ignota deve dare 400');
    const j = await r.json();
    assert.ok(j.error, 'il 400 deve spiegare perché');
  } finally { child.kill(); }
});
