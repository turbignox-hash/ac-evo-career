# EVO Pitwall — report build di sessione 28/10 (base v0.1.41 · fccd9dd)
_Data: 2026-10-28 · Aggiornamento prossimo: **v0.1.42** (lo fa salire `sincronizza-git.cmd` insieme al commit)_

## Correzioni e novità

- **La gazzetta impara a ricordare.** Titoli di stampa per-round dallo STORICO
  vero del save (GRANDE CHELEM, POLE BUTTATA, DUE/TRE/QUATTRO DI FILO, IL
  PRIMO GRADINO, BRUTTA SERIE…) e **gazzetta di stagione** in pagina unica:
  sommario (gare, vittorie, podi, ritiri) più ogni masthead in ordine di
  round, cambio stagione e copia del foglio. Titoli deterministici.
- **La classifica sim corre sul campo largo ovunque.** La
  griglia simulata prende il MASSIMO campo visto nelle gare reali
  (`grigliaSimEstesa`): adesso anche paddock, respiro di metà stagione, viste
  (header, elenco serie, clausole di contratto), duello della stagione,
  montecarlo dei sedili e la **griglia tipica** nelle card (serie, agenda, CLI
  `series`). Re-verifica di realismo a campo largo: vittorie dei primi tre
  sedili ~97%, titoli 47-11-2 a 17 vetture vs 48-11-1 a 14 — meritocrazia.
- **Il garage REALE del gioco nei premi.** EVO lascia per ogni auto con
  garage/livery salvata un file in `ProfileData/…/SavedCars/`: la scansione
  `gameOwnedCarIds()` porta quella lista alla scelta dei premi, che non
  ripropongono più auto già tue in gioco. Test nuovo: `test/game-owned.test.mjs`.
- **Bak al secondo + backup snello (audit dati 28/10).** I bak di griglia si
  scrivono col SECONDO nel nome (doppie scritture ravvicinate proteggono con
  suffisso `-r2`/`-r3`; test anti-regressione in `test/grid-templates.test.mjs`
  e flaky CAR_MISSING ucciso), i `.bak-ripara-*` si potano da soli (restano i
  3 più freschi) e il backup automatico del save esclude
  MoTec/replay/crashdumps/Logs/mods: **zip da 746 MB a 1,1 MB** (A1 chiusa;
  resta l'incognita `2026.ld` — dettagli nel §5 dell'audit).
- **Il pubblicatore UIApp tutto via interfaccia di gioco.** Il lancio via «Avvia sessione» del gioco entra per `src/uiapp-pub.mjs`: guardie di scrittura
  e priorità (test nuovi `test/uiapp-pub-guard.test.mjs`,
  `test/uiapp-pub-priorita.test.mjs`).
- **Copilota: niente più loop in metà gara.** Il monitor del copilota non
  ripete all'infinito «metà gara, litri benzina e giri» e non tarda più sui
  messaggi dell'ultimo giro (posizioni perse/guadagnate).
- **README IT/EN allineati.** La sezione «Novità delle build recenti» salita
  alla fascia **0.1.13–0.1.41** con le due voci di oggi (garage reale nei
  premi, bak al secondo) in ENTRAMBE le lingue; note del backup e della
  cartella `data/` ora raccontano lo stato post-audit (esclusioni fatte,
  potatura autonesto dei `.bak-ripara-*`, zip ~1 MB) e non più le cure
  «da fare».
- Rapporto italiano aggiornato di conseguenza: `report/audit-dati-2026-10-28.md`.
- Nota di automazione a fine giornata in `NOTE-AUTOMAZIONE.md`.
- Biome quality-gate (src + gui): 75 file verificati, 0 diagnostica ✅

- Esito suite di test: passati ✅ (404/404 test)

## Come si aggiorna

- **Dalla GUI:** la barra in alto dice «Aggiornamenti di progetto pronti su
  GitHub» → bottone **Aggiorna ora** (fetch + merge + test; il server si
  riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- **Dalla zip:** riestrai il pacchetto di GitHub sulla cartella
  dell'installazione (sovrascrive il codice, `data/` col save resta intatto).

Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
