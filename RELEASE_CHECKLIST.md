# RELEASE_CHECKLIST.md — come si prepara una release di casa

Adattata al flusso di EVO Pitwall (il «Prompt 8» del pacchetto esterno, entro
le regole reali del progetto: commit a main con messaggi descrittivi, zero
dipendenze runtime, i file di gioco NON si toccano mai). Nessun passo è
opzionale; se uno non si può girare, la release non si prepara.

## 1. Pulizia del contenuto

- [ ] `git status` pulito: nessuna modifica pendente non voluta; i file di
      sistema (`AUDIT.md`, `SESSION_REPORT.md`, report, diario) vengono
      committati solo se esplicitamente richiesti.
- [ ] Nessun segreto nella zip del pacchetto: confrontare `tools/pacchetto-amico.mjs`
      con la lista `git ls-files` — il token in `data/.github-token` resta FUORI.
- [ ] `console.log` dei file non da CLI toccati nell'ultima fase: audit a mano
      per file (in CLI sono la voce, altrove devono giustificarsi per uno) —
      mai a colpo d'onda.

## 2. Verde, con prove di rottura

- [ ] Suite completa in sandbox: `EVO_DATA_DIR=<tmp> node --test test/*.test.mjs`
      — tutti verdi (653+ al 1/11/2026), contatore riportato nel CHANGELOG.
- [ ] `npm run check` (suite + `npm run lint` Biome) — exit 0.
- [ ] Ronda «Mai un test sazio» sull'ultima fetta: ogni test nuovo ha la sua
      prova di rottura (la fonte smontata → il test CADE) e la fonte è
      ripristinata dopo (`git diff` pulito).

## 3. Collaudo sul campo

- [ ] Danza del PC amico vergine: `node tools/_collaudo-amico.mjs` — 21/21
      (zipball vera, installer in sandbox, primo+secondo avvio).
- [ ] Collaudo vergine delle schede GUI (tutte le tab, nessuna regredita).
- [ ] I file di gioco: nessuna scrittura fuori dai gesti consentiti
      (`test/cancelli-anticheat.test.mjs` verde è la prima guardia).

## 4. Documenti

- [ ] `CHANGELOG.md` aggiornato con la nuova voce (titolo, data, fonte).
- [ ] README.it.md e README.md allineati tra LORO (stessa sostanza, due lingue),
      incluse le istruzioni per aggiornare.
- [ ] `DIARIO-SVILUPPO.md` con la voce della release.

## 5. Versione e pacchetto

- [ ] Bump semantico con `npm run bump` (tools/bump-versione.mjs): patch per
      fix, minor per feature, major solo per breaking.
- [ ] PREFLIGHT APP IN GIOCO dentro il flusso (3/11, il preflight di
      `tools/crea-release.mjs`): PRIMA di ogni cosa il tool fa girare
      `node tools/genera-uiapp.mjs` (costruiti fresh + copie in gioco
      riallineate) e la guardia `node --test test/uiapp-installata.test.mjs`
      (sagome biome, BUILD_OK, copia .js byte per byte, pagine d'ingresso:
      app.json = sorgente, menu.html assente). Esito non-zero = release NON
      parte. Se dopo la build restano file non committati lo zip (git
      archive HEAD) li porta vecchi: committa prima; prova a secco della
      soglia con `--solo-preflight` (niente GitHub, niente zip).
- [ ] `node tools/crea-release.mjs <tag> <titolo> corpo.md --con-pacchetto`:
      la release GitHub esce con la zip del pacchetto-amico CONFEZIONATA
      DOPO il preflight e caricata come asset (sostituzione se il nome
      esiste); `--no-test` salta la prova npm test dentro lo zip, `--asset`
      resta per gli asset extra o per una zip già fabbricata a parte.
- [ ] NIENTE push a main da solo: la sincronizzazione passa da
      `sincronizza-git.cmd`.

## Criterio di chiusura

Quando ogni casella è verde (e i numeri della suite e del canarino sono
annotati nel CHANGELOG), la release è pronta.
