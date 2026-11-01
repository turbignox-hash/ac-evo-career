# CHANGELOG — EVO Pitwall (ac-evo-career)

Le voci puntano alle fonti del repo: [report/](report/) (un file per build),
[DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md) (il registro completo). Il save in
`data/` non si tocca mai: gli aggiornamenti portano solo codice.

## v0.1.45 — 1/11/2026

- **La banda di serie prende il posto del ladder preistorico nel customgrid**
  (richiamo Mauro: la scheda Griglia diceva «AI 82–92» per la Peugeot mentre
  i cursori di serie sono 84–85): nuovo rango `aiBandSerie` nel builder
  ([gridbuilder.mjs](src/gridbuilder.mjs)), aiBand (evento) > classe pinnata >
  banda di serie > ladder, calcolata con la STESSA formula del pannello
  Difficoltà — `bandaSerieSlider` ([state.mjs](src/state.mjs)) — e tirata sia
  dal «Prepara tutto» ([webui.mjs](src/webui.mjs)) sia da CLI `griglia`
  ([cli.mjs](src/cli.mjs)). Customgrid attuale già riallineato 82–92 → 84–85.
- **Il weekend ha l'orologio per sessione** (richiesta Mauro: «weekend
  realistici»): il Bollettino della scheda gara mostra un cielo per OGNI
  sessione e peggiosce verso la gara — piano deterministico
  (`weatherPlanFor` in [race.mjs](src/race.mjs): prove min(r−2, 2),
  qualifiche/warm-up r−1, gara r), EVO legge il preset a ogni avvio
  sessione. Il tasto «Metti» chiama la nuova rotta `wx-session`
  ([webui.mjs](src/webui.mjs)) e scrive il cielo sul gamemodesave; il
  «Prepara tutto» arma la PRIMA sessione da sé. Niente cielo scelto a
  mano: il numero arriva sempre dal piano del calendario, mai dalla GUI.
- **Il cielo si vede al colpo d'occhio** ([viste-a.js](gui/js/viste-a.js)):
  mappa `WX_ICON` (sole su bello, pioggia su pioggia) accanto al nome nei
  chip del piano — ☀️ sereno · 🌤️ nuvole sparse · ☁️ nuvoloso ·
  🌦️ pioggia leggera · 🌧️ pioggia · ⛈️ pioggia intensa — e STESSA icona
  nei toast di «Metti» (il codice arriva dalla risposta del server,
  niente doppio registro).
- **Orologio di giornata nelle app in gioco** (richiesta Mauro,
  «prossimi naturali»): il calendario da 1/11 ha l'ora (`agendaOra`) e
  ora la dicono pure il **Cruscotto** («⏰ ore 16 · mattino presto» +
  ora di partenza nella card gara, [cruscotto.js](uiapp/cruscotto/cruscotto.js) via
  [uiapp-pub.mjs](src/uiapp-pub.mjs)) e il **Pitwall** (giorno+ora nel
  payload piccolo; senza carriera niente blocco, mai un mucchio vuoto,
  [pitwall.js](uiapp/pitwall/pitwall.js)). In più le due PORTE del giorno: ⌛
  `portaChiusa` (orologio oltre l'ora della gara: la scaletta non torna
  indietro) e ⏳ «in ritardo» (gara di un altro giorno che si corre
  quando si vuole).
- **Il ponte 🌉 parte anche dal quadro «Tutto il garage»** (richiesta Mauro):
  l'endpoint `setup-cover` con `all:true` porta ora `srcFile`/`srcName`/
  `srcTrack` per ogni pista girata senza setup; dove l'auto del garage ha
  ALMENO UN base setup, il chip ✖ diventa «🌉 Pontalo» che chiama
  `setup-bridge` con LA SUA auto (dataset `data-cover-car`), non quella in
  mano al meccanico. Senza base setup il chip resta secco, com'è giusto.
  Test: [ponte-setup.test.mjs](test/ponte-setup.test.mjs) (copia byte per
  byte, mai sovrascrivere: secondo ponte stesso nome prende « (2)», rifiuti
  stessa pista/file assente/auto mancante) + prova live con dati fissi nel DOM
  (payload del click verificato elemento per elemento).
- **Pulizia della lint al passo**: `useOptionalChain` sul cruscotto
  chiuso — `npx biome lint` torna a 0 diagnostica sui 296 file.
- **Suite completa in sandbox: 697 test verdi** (da 682 di v0.1.44),
  0 cadute; test nuovi: [gridbuilder-banda-serie.test.mjs](test/gridbuilder-banda-serie.test.mjs)
  (la banda di serie nel builder) e [ponte-setup.test.mjs](test/ponte-setup.test.mjs)
  (il ponte byte per byte); test aggiornati/toccati:
  [race-card.test.mjs](test/race-card.test.mjs) (i quattro livelli del piano
  + payload), [pitwall-radio.test.mjs](test/pitwall-radio.test.mjs) (chiavi
  miniPitwall), [agenda.test.mjs](test/agenda.test.mjs) (ore spostabili),
  [diffesa-sonda.test.mjs](test/diffesa-sonda.test.mjs).

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
- **Difesa anti-colpo chiusa fino in fondo** (lezione dei DUE colpi del 31/10):
  la sonda `tools/_difesa-probe.mjs` è promossa in `tools/` — banco completo
  (carriera di MARCA «Prova Sonda», flussi, file di gioco e intera root
  «Saved Games» in sandbox) e sweep GET con impronta prima/dopo su TUTTE le
  118 rotte del dispatcher: qualsiasi GET che muti lo stato esiede smascherata
  PER NOME. La l'ultima ha rovistata fuori: `GET /api/life` eseguiva
  `ensureLife`/`ensureContract`/`checkSigils` che persistono il save — ora
  `life` è nel set SOLO_POST (la GUI mandava già tutto via POST via `api()`:
  zero impatto in vista). I log append-only in EVO_DATA_DIR (radio voce,
  errors.jsonl) sono dichiarati RUMORE CONSENTITO nel banco, il resto muta → colpo.
- **Test di regressione della difesa** ([test/diffesa-sonda.test.mjs](test/diffesa-sonda.test.mjs)):
  due guardie statiche (ogni rotta nel set SOLO_POST è un `case` VERO; `life`
  resta armato) + la sonda viva ENCASINATA al banco (prova di rottura: tolto
  `life` dal fonte, il test CADE — verificata su disco).
- **Suite completa: 682 test verdi** (da 660), lint Biome 0 diagnostica.
- **Danza del PC amico vergine: 24 verifiche verdi** (contatore cresciuto
  per le 5 verifiche dell'installer delle app in gioco; riprovata con la
  difesa in bordo: zip dal commit 505 file, installazione e primo/secondo
  avvio puliti).

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
