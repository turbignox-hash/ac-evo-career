# CHANGELOG — EVO Pitwall (ac-evo-career)

Le voci puntano alle fonti del repo: [report/](report/) (un file per build),
[DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md) (il registro completo). Il save in
`data/` non si tocca mai: gli aggiornamenti portano solo codice.

## v0.1.44 — 1/11/2026

- **DA-10 — il builder delle tinte è intero**: bilancio per FAMIGLIA (le
  regole `mech_1` pesano anche `mech_2`/`mech_3` della stessa auto),
  **tinte prestate** opt-in col flag `tintePrestate` in `grid-classes.json`
  (il parco del monocolore pesca celle vere degli altri template, cap 20
  file, dedup HEX, zero celle inventate), e la **vetrina** delle livree
  arriva a vista: CLI `griglia`, messaggi prep del WebUI, tab Griglia della
  GUI (colonna tinta, riquadro per modello, grido MONOCOLORE col gesto
  «più LIVERIES + APPLICA») e badge «tinte prestate (parco)» sulle Classi.
- **Palestra sazio** (`tools/_collaudo-sazio.mjs`): la tecnica dei
  campioni ufficializzata in tool — copia in sandbox, baseline, poi muta
  un modulo alla volta e confema che il test rinforzato CADE: baseline
  **660/0**, mutazioni garage/agenda/lang **3/3 cadute**.
- **Suite completa: 660 test verdi** (da 653), lint Biome 0 diagnostica.
- **Danza del PC amico vergine: 24 verifiche verdi** (contatore cresciuto
  per le 5 verifiche dell'installer delle app in gioco).

## v0.1.43 — 1/11/2026

- **Le app DENTRO il gioco si mettono a posto da sole**: `INSTALLA-GIOCO.cmd` e
  `avvia.cmd` le installano/agganciano a ogni apertura GUI; installer e guida
  amico allineate (README IT/EN, GUIDA-AMICO, FRIEND-GUIDE-EN).
- **Collaudo del PC amico vergine, dall'alto in fondo**:
  `tools/_collaudo-amico.mjs` costruisce la zipball vera del ramo, la serve da
  un server finto, gira `installa.cmd` in sandbox e simula primo+secondo
  avvio: **21 verifiche verdi**.
- **Ore spostabili per round**: se due gare cadono lo stesso giorno, il
  conflitto si risolve col selettore dell'ora (override per round in agenda)
  e arriva fino alla card e al gamemodesave.
- **Il doppio «Chiudi la stagione» trappato**: dopo una chiusura riuscita, un
  secondo click non proporne più lo svuotamento (`SEASON_ALREADY_CLOSED`).
- **Mai un test sazio — tre rinforzi alle fondamenta**: valori attesi di
  `carValueKm`/`salePrice` LITERALI, test di `cadenzaSerie` (banda 3–10 +
  cambia col contatore), mappa `DISPLAY_EN` assaggiata per nome. **Suite
  completa: 653 test verdi.**
- **Un solo cancellino**: `npm run check` = suite completa + Biome.

## v0.1.42 — 28/10/2026

Da `report/build-0.1.42-sessione-2026-10-28.md` (404 test verdi):

- La gazzetta impara a ricordare: titoli di stampa per round dallo storico
  vero del save + gazzetta di stagione in pagina unica.
- La classifica sim corre sul campo largo ovunque (`grigliaSimEstesa`).
- Il garage REALE del gioco nei premi (`gameOwnedCarIds()`).
- Bak al secondo + backup snello: zip del save da 746 MB a ~1 MB.
- Il pubblicatore UIApp tutto via interfaccia di gioco (guardie e priorità).
- Copilota: niente più loop in metà gara.
- README IT/EN allineati alla fascia 0.1.13–0.1.41.

## v0.1.25 — 25/10/2026

Da `report/release-0.1.25.md`:

- Aiuto in GUI («❓ Aiuto»: due righe per ognuno dei menu).
- Aggiornatore zip senza falsi «repo è privato»: la quota API esaurita dice
  quando si sblocca, invece di spingere l'amico a creare un token.
- `crea-release` carica la zip del pacchetto-amico come asset della release.

## v0.1.23 — 25/10/2026

Da `report/build-0.1.23-6d2716d.md` (207 test verdi):

- Triage dead-code della GUI, test di guardia delle viste, riga Biome nel
  report di build.

## Prima di qui

La storia completa dei build 0.1.x più vecchi è nella sezione «Novità delle
build recenti» del [README.it.md](README.it.md) / «What's new in the recent
builds» del [README.md](README.md) e nel diario.
