# AUDIT.md — audit non distruttivo · turbignox-hash/ac-evo-career (EVO Pitwall)

Data: 1/11/2026 · metodo: lettura di README/package.json/struttura/diario
(+ collaudi e suite già girati nella stessa giornata). **Nessun file di
codice toccato.** Dove un punto non è stato verificato da fatto diretto c'è
il marcatore **DA VERIFICARE**.

---

## 1. Panoramica architetturale

App carriera per Assetto Corsa EVO, **Node 18+ ESM, zero dipendenze runtime**
(unica devDependency `@biomejs/biome`). Tutto gira in locale: server webui
integrato (`src/webui.mjs`) + GUI statica in `gui/` + app DENTRO il gioco
(`uiapp/cruscotto`, `uiapp/pitwall`) che EVO carica tramite la mod
`ACEUIAppLoader`. Cli (`src/cli.mjs`) e server condividono lo stato del save
(`data/evo-career.save.json`).

Fatti verificati (1/11):

- `package.json`: script `start`, `test` (`node --test`), `lint` (biome),
  `magazzino`, `bump`. **Non esistono `build` né `check`.**
- Branch locale `main`, remote `offsite` su GitHub.
- Node locale v22.22.3 (engines `>=18`: ok).
- Suite **650/650 verdi** al 1/11 (terzo giro consecutivo identico).
- Collaudo end-to-end PC amico (`tools/_collaudo-amico.mjs`): 21 verifiche
  verdi — installer one-file + zipball del ramo + app in gioco auto-installate.
- 915 `console.log` in src+tools: in siciliano la maggior parte è output CLI
  legittimo, non rumore — la pulizia va fatta per file, non a colpo d'onda.

## 2. Mappa dei moduli (69 src · 124 tools · 98 test)

**Stato e flussi**: `state.mjs` (save carriera), `flows.mjs`, `life.mjs`,
`world.mjs`, `weekend-roster.mjs`, `garage.mjs`, `catalog.mjs`,
`car-pool.mjs`, `import.mjs`, `integrity.mjs`, `report.mjs`.

**Gare e calendario**: `race.mjs` (card/nextRound, ore spostabili), `agenda.mjs`
(cadenza serie, override ora/ronda), `orario.mjs`, `testday.mjs`,
`test-mode.mjs`, `stint-plan.mjs`, `strategia.mjs`, `weather.mjs`.

**Griglie multi-classe**: `gridbuilder.mjs` (template AVL?), `grid-apply.mjs`,
`grid-calib.mjs` (apprendimento dal vivo), `grid-guard.mjs` (cancelli),
`classi-gt.mjs`, `car-match.mjs`, + `tools/raccogli-griglie.mjs`,
`tools/evo-grid.mjs` (decodifica/encode gamemodesave), `tools/grid-*.mjs`.
**DA VERIFICARE** il ramo C di griglia-calib (promesso per la gara 2 del
misto, in diario DA-14/DA-15).

**Meccanico e telemetria**: `motec.mjs` (analisi .ld vera), `analisi.mjs`,
`usura-gomme.mjs`, `setup.mjs`, `carsetup.mjs`, `maintenance.mjs`,
`watch.mjs` (watch setup), `telemetria-curve` (in tmp)? **DA VERIFICARE** la
posizione di telemetria-curve (visto solo in tmp/nome test).

**Voce copilota**: `voce-copilota.mjs` + `shmem.mjs` (shared memory EVO) +
`engineer.mjs` (`ingegnereLive`) + GUI `gui/js/narratore-unito.js` (narratore
UNICO per pannello e voce). TTS **System.Speech locale it-IT**: nessuna
chiamata cloud, nessun dato sensibile in giro — privacy già garantita di casa.

**Server e UI**: `webui.mjs` (4100 righe, endpoint API), `webui-views.mjs`,
`webui-static.mjs`, `webui-env.mjs`, `webui-telem.mjs`; GUI statica `gui/`
(viste a/b/c/d, griglia, analisi, mailbox, meccanico); uiapp `cruscotto`
(pannello in gioco) e `pitwall`.

**Installer / auto-update / pacchetto amico**: `installa.cmd` (one-file:
scarica la zipball del ramo via build-id + `git ls-files` in palude),
`avvia.cmd` (launcher: backup, scorciatoia, app in gioco `--silenzioso`),
`INSTALLA-GIOCO.cmd` + `tools/installa-gioco.mjs` (app nel loader),
`tools/_collaudo-amico.mjs` (danza end-to-end), `tools/pacchetto-amico.mjs`,
`tools/aggiornamenti.mjs`. **DA VERIFICARE** il canale di auto-update vero
(zipball remota vs push offsite) — l'installer legge da GitHub con token in
`data/.github-token` (file sensibile: toccato da NESSUN comando, obbligatorio
restare fuori dalla zipball: verificato per build l'app-pacchetto, non per
runtime — **DA VERIFICARE** anche il suo esilio in git).

**Cancelli anti anticompromesso**: `cancelli-anticheat.test.mjs` (131 righe di
guardie), `game-owned.test.mjs`, sandbox dei test (`EVO_DATA_DIR`,
`ACE_GAME_SAVEDIR`, `_game-sandbox.mjs`, `_flows-sandbox.mjs`) — la regola
«mai toccare i file veri di EVO durante i test» è IMPLEMENTATA, non promessa.

## 3. Problemi critici (verificati oggi)

1. **Test sazio garage** (`test/garage-buy.test.mjs`): l'asserzione della
   valutazione compara `sell.gain` con `salePrice(carValueKm(...).value)` —
   l'atteso è calcolato con la STESSA funzione sotto prova → con la
   valutazione completamente spenta il test resta verde. Nessun altro test
   copre `carValueKm`/`salePrice`.
2. **Test sazio agenda** (`test/agenda.test.mjs`): `cadenzaSerie()`
   disarmabile al livello base (sempre 3, hash 3–10 spento) e il test cade
   MAI. Grep: zero chiamate in test/.
3. **Test sazio lingua**: la mappa `DISPLAY_EN` di `src/lang.mjs` può essere
   spenta senza che `test/lingua-server.test.mjs` muova un muso.

Nessun crash noto in app oggi: il punto `ingegnere` 500-era (31/10) e le
casse del 27/10 sono già chiusi nel diario DA-13/DA-15.

## 4. Bug probabili / anomalie (in attesa, non nostri o in corso)

- Tinte monocolore avversari nel builder (DA-10 in corso, prima fetta):
  la LIVEREA resta quella del pool, no varianti.
- Due righe duplicate di gioco nel risultato (Adrian Palmer, Ryan
  Coleman): manina del GIOCO, non nostra — da non «sistemare» da parte nostra.
- **DA VERIFICARE**: copertura del ramo C griglia-calib sulla gara 2
  (scheduled 1/11, esito nel valore della NJ?). A oggi zero record in
  diario → resta aperto.

## 5. Miglioramenti consigliati (in ordine di utile, non di moda)

1. **npm run check** = `npm test && npm run lint` (una sola leva, zero
   dipendenze nuove; il `build` vero dell'insaccatura vive già in
   `tools/crea-release.mjs` — non duplicare).
2. Rinforzo dei 3 test sazio (vedi §6, fase 1): valori FISSI, niente
   attesi ricalcolati.
3. Palestra del campione sazio successivo (`analisi.mjs`, `garage.mjs`
   già casuali, `agenda.mjs` già casuali) con gesto di rottura a mano e
   revert: è la tecnica che oggi ha reso, ufficializzarla in
   `tools/_collaudo-sazio.mjs` (solo REPORT; DA VERIFICARE se convinta
   da Mauro prima di scrivere).
4. CHANGELOG.md: **DA VERIFICARE** che esista (non visto nella radice:
   ag disco non pane). Se assente: crearlo vuoto con cronologia dei build
   0.1.x (report/build-*.md già in repo).
5. Pulizia selettiva console.log nei soli file più rumorosi (audit
   file-per-file, non globale: in CLI sono la voce).
6. Doc dei comandi vocali nel README (richiesta anche dal Prompt 5 del
   pacchetto): i comandi già esistono (registro `data/copilot-*`), manca
   la pagina man.

## 6. Roadmap in 3 fasi

**Fase 1 — consolidare ciò che è verde (1–2 sedute)**
- Rinforzo dei 3 test sazio (valori fissi fissati a terra).
- `npm run check` (test+lint) + documento nel README.
- Campione sazio esteso con `_collaudo-sazio.mjs` (REPORT-only).
- Criterio: suite 652+/652+, rottura simulata CADE nei 3 punti chiusi.

**Fase 2 — chiudere le funzioni in corso (2–4 sedute)**
- DA-10: varianti di tinta nel template (pool + regole del 28/10).
- Ramo C griglia-calib: vederlo su campo nella gara 2 del misto.
- Doc comandi vocali + aggiungere `README` «i comandi tuoi».
- Criterio: DA-10 chiusa col test di tinte in gara SIMULATA; diario DA-… nuevo.

**Fase 3 — release stabile (1 seduta)**
- CHANGELOG.md (se assente) + libero `RELEASE_CHECKLIST.md` + bump semantico.
- Ripetere `tools/_collaudo-amico.mjs` + collaudo vergine delle schede.
- Criterio: canarino 21/21, suite verde, checklist completa.

## 7. Top-10 task (priorità · complessità · criterio di completamento)

| # | Task | Priorità | Complessità | Criterio |
|---|------|----------|-------------|----------|
| 1 | Rinforzo `garage-buy` (valori fissi) | alta | bassa | rottura simulata → test CADE |
| 2 | Test di `cadenzaSerie` in agenda.test | alta | bassa | rottura simulata → CADE |
| 3 | Test mappa DISPLAY_EN | alta | bassa | rottura simulata → CADE |
| 4 | `npm run check` + README | alta | bassa | script esiste e passa |
| 5 | Chiusura DA-10 (tinte varianti) | alta | media | tinte DIVERSE in gara sim |
| 6 | Ramo C griglia-calib a campo | media | media | nota nel diario con numeri |
| 7 | `tools/_collaudo-sazio.mjs` (REPORT) | media | media | rifinitura a mano + report |
| 8 | CHANGELOG.md + RELEASE_CHECKLIST.md | media | bassa | file creati e allineati |
| 9 | Pulizia console.log selettiva | bassa | media | audit per file, zero rumore CLI perso |
| 10 | Doc comandi vocali nel README | media | bassa | sezione «comandi» navigabile |

## 8. Conflitti col pacchetto di regole ricevuto (da decidere PRIMA dei prompt 2–8)

- **Branch `/feature` + PR**: il flusso di casa è **main committato con
  messaggi descrittivi** e nessun push senza ordine. Le regole business «PR
  verso main» non combaciano: teniamole per un eventuale contributo esterno.
- **`npm install` a ogni modifica**: qui non ci sono dipendenze runtime —
  `npm install` serve solo se si tocca `devDependencies` (biome).
- **CI GitHub Actions**: la repo ha il remote `offsite`; whether workflow in
  `.github/` esista non l'ho visto → **DA VERIFICARE** (e decidere se volerlo:
  la base di casa è la suite in sandbox, già più severa di una CI generica).
- **SESSION_REPORT.md a fine sessione**: creato (vedi file) — da aggiornare a
  ogni sessione, MA resta fuori dai commit di casa a meno che Mauro lo
  voglia tracciato.
- **«Non modificare i dati di gioco»**: già IL vincolo assorbito del progetto
  (cancelli-anticheat + sandbox dei test): nessun task di questo pacchetto
  lo viola IZEN, va solo mantenuto.

---

*File prodotto dall'audit del 1/11 secondo il Prompt 1 (solo REPORT, zero
modifiche al codice). Base: diario DA-10…DA-15, suite 650, canarino 21/21,
8 probe di rottura a mano con revert.*
