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

- [ ] Danza del PC amico vergine: `node tools/_collaudo-amico.mjs` — 27/27
      (zipball vera, installer in sandbox, primo+secondo avvio). Dal 6/11 gira
      DA SOLA dentro il preflight di `tools/crea-release.mjs` (anche con
      `--solo-preflight`): se la danza si rompe, la release non parte.
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
      parte. Se l'albero non è pulito, `crea-release` si ferma subito
      (prima della guardia layout) e `pacchetto-amico` NON crea lo zip:
      i file modificati uscirebbero vecchi, i nuovi resterebbero fuori.
      Committa o rimuovi prima; prova a secco della soglia con
      `--solo-preflight` (niente GitHub, niente zip).
- [ ] Tag = `v` + versione del `package.json` (`npm run bump`), **esistente,
      che punta a HEAD e presente su offsite**: `crea-release` si ferma se
      il numero non combacia o se il tag manca/finisce su un altro commit,
      così una release non porta EXE o codice di un'altra build. Poi
      `node tools/crea-release.mjs <tag> <titolo> corpo.md --con-pacchetto`:
      la release GitHub esce con la zip del pacchetto-amico CONFEZIONATA
      DOPO il preflight e caricata come asset (sostituzione se il nome
      esiste); `--no-test` salta la prova npm test dentro lo zip, `--asset`
      resta per gli asset extra o per una zip già fabbricata a parte.
- [ ] EXE firmati, se c'è un certificato Authenticode: `EVO_SIGN_PFX` +
      `EVO_SIGN_PASSWORD` oppure `EVO_SIGN_THUMBPRINT` al build di
      `npm run installer` / `npm run installer:offline`; lo `.sha256` deve
      coprire il file firmato (il builder lo calcola DOPO la firma).
      Nota: un certificato self-signed NON toglie SmartScreen; serve un
      certificato OV/EV emesso a un'identità verificata. La firma toglie
      «Autore sconosciuto» su un PC che si fida della catena, ma SmartScreen
      può ancora avvisare finché il file non ha reputazione (EV: immediata;
      OV: cresce con i download). Verifica con `signtool verify /pa`.
      Il preflight di `crea-release` esegue questa verifica da solo quando
      una variabile `EVO_SIGN_*` è impostata (catena, corrispondenza dello
      `.sha256` e versione nel `.build.json`); se è verde, gli EXE e i loro
      `.sha256` salgono da soli come asset della release. A mano:
      `npm run verifica-firma`.
- [ ] NIENTE push a main da solo: la sincronizzazione passa da
      `sincronizza-git.cmd`.

## Criterio di chiusura

Quando ogni casella è verde (e i numeri della suite e del canarino sono
annotati nel CHANGELOG), la release è pronta.
