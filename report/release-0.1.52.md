## EVO Pitwall v0.1.52

La giornata intera del 3/11/2026 — dal mattino alla notte — dal diario
di sviluppo: dizionario vivente, la guardia delle app in gioco che diventa
una sola soglia di release, il giro teorico VERO e le guardie che prendono
i difetti sul vivo.

### In questa build

**La guardia delle app in gioco, da prova a soglia di release**

- Nuova guardia `test/uiapp-installata.test.mjs`: sagome/pitwall costruiti
  biome-puliti, firma `BUILD_OK` della build, copia `.js` in gioco uguale
  byte per byte. Estesa alle PAGINE D'INGRESSO che il loader rilegge a ogni
  avvio: `app.json` = sorgente, `menu.html` assente (4/4) — e alle FASCE del
  publisher: ogni `ui-<slot>.json` in gioco dev'essere un JSON intero (7/7),
  perché il publisher scrive con una `writeFileSync` nuda e l'app fa
  `JSON.parse` a ogni tick.
- **Preflight dentro `tools/crea-release.mjs`**: PRIMA di credenziali,
  release e zip girano `node tools/genera-uiapp.mjs` + la guardia; esito
  non-zero = la release NON parte. Nuovi flag: `--con-pacchetto` (zip
  confezionata DOPO il preflight e caricata come asset), `--solo-preflight`
  (prova a secco, niente GitHub niente zip). Check-list aggiornata (§5).
  Prova dal vivo della soglia: fascia mezza JSON scritta a mano in gioco →
  guardia rossa col percorso reale e la cura nel messaggio, «✧ preflight
  non superato … la release NON parte», exit 1 sopra le credenziali →
  fascia cancellata → 7/7 e «✓ preflight superato».
- **Le app leggono il successo della build**: il segnaposto riceve la
  costante E la firma `const BUILD_OK = true`; il generatore è severo
  (segnaposto DEVE essere uno, verifiche a disco, riallineamento delle
  copie in gioco con richiamo dell'installatore nella stessa run). Test
  [test/uiapp-pub-guard.test.mjs](test/uiapp-pub-guard.test.mjs) 9/9.
- **La guardia esce a schermo, dove gioca**: nel cruscotto dentro EVO la
  riga «👁 guardia attiva» con «controlla Ns fa» e la lezione del dizionario
  (battito portato in fascia dal publisher; file
  [test/eredita-cruscotto.test.mjs](test/eredita-cruscotto.test.mjs) 8/8,
  attigue 56/56) e nel pitwall — il pannello che in gara è l'unico —
  lo stesso blocco (pitwall-radio 26/26).

**Il dizionario vivente**

- **La fattoria è `ui_storage.uistorage`**: il gioco scrive IN CHIARO
  `paddock.skins` (car_guid già sdoppiata come chiave del garage + display
  name ufficiale), senza kspkg cifratura: nuova sorgente
  `learnCarFromStorage` (CLI `--from-storage`) agganciata al boot
  (learn-car 9/9, poi 11/11 col tagliando).
- **Il tagliando diventa regola comune** (helper `soloRaddoppio` usato da
  learner e paddock): «Mazda Mazda» → «Mazda», sinonimi con rumore NON
  toccati (learn-car 21/21; import + gara-veloce 17/17).
- **Auto-correzione**: le voci CONTRADDETTE vengono rietichettate col nome
  vero e il disco riceve le correzioni anche a `added` = 0 (la sera
  dell'Endurance GT4 Audi R8 «Kunos Abarth 695 Biposto»: rientrata;
  learn-car 6/6).
- **Il watch respira**: il rinfresco del dizionario gira a ogni tick
  (anche l'apprendimento per iscrizione in paddock), chiamato UNA volta
  per tick, con riga verde quando impara e zitto a vuoto; il battito
  arriva a `status` (8/8) e in gioco. Test cli-watch 18/18.
- **Le catene di lettura, una volta per tutte**: calendario, garage,
  dizionario leggono SOLO file scritti dal gioco (pd-calendar con
  fall-back sul mirror journal); il magazzino L: esce dal boot, resta solo
  backup zip; la fattoria dei campioni a mano è utensile di emergenza.
- **Il cerchio col mirror**: la scheda gara segue la ronda del calendario
 anche per chi non ha l'app (helper unico `rondaDelCalendario` + meteo a
  due scale tradotte per NOME, layout della card dalla ronda; race-card +
  journal-nostro + ronda-ladder 42/42; smoke 1/1).

**I nomi puliti delle piste, ovunque**

- In gioco (chip di Pitwall e Cruscotto con `prettyTrackLabeled`, come nel
  banco A/B: 53/53), nel verdetto della GUI (61/61), nei test dei chip
  riscritti con la guardia VIVA invece delle stringhe attese (48/48 +
  verdetto-giornata 57/57), e a server vivo (lastLd, garage/sessions e
  tetto: test dedicato 1/1). Il dizionario si spiega anche nella FAQ
  (solo documentazione).

**Il giro teorico VERO**

- **Il margine torna leggibile dai LOG del gioco**, non dal file risultato
  (nel risultato EVO scrive solo i settori del best, per costruzione il
  teorico ≡ best): sonde sui log (4/4, suite 766/766), riga «Giro teorico»
  del rapporto gara con la fonte VERA o assente (770/770), teorico vero
  anche su hotlaps e scheda Analisi (2/2). Il «margine 0,00» falso per
  costruzione viene RIMOSSO dal Tetto (analisi 19/19) e il 0,00 restante
  distingue campione vero da campo vuoto (28/28). Picco del tetto nel
  tooltip; registro quadro-zone che confronta striscia e riparto del banco
  (23/23). L'INDAGINE OUT-LAP di Monza: le sessioni 0-beacon escono dai
  menu e tornano agli A/B come voci disabilitate «senza giri» (guardia
  [test/ab-senza-giri.test.mjs](test/ab-senza-giri.test.mjs) 1/1).

**Il Bollettino meteo diventa AUTOMATICO**

- Il cielo delle sessioni si sistema da solo, senza clic «Metti»: `wx-auto`
  scrive per sessione e si autodichiara automatico nel pannello
  (wx-auto 9/9; attigue 17/17; smoke verde).

**La griglia: vigie e il ritorno delle livree**

- **Vigia del cambio di campionato**: se sul disco resta la griglia della
  serie VECCHIA, la scheda gara lo dice PRIMA del bottone (banner gemello;
  race-card 17/17).
- **Guardia anti-singleton a tinte** (incidente Coppa MX-5: 19 celle una
  livrea): quando il vivo ha meno TINTE del magazzino della serie, la
  prima corsa salta e il parco più ricco di livree vince; log esplicito;
  best-effort se il magazzino non si legge (grid-templates 16/16, attigue
  31/31). Il parco MX-5 (3 skin, confermate a mano nel pannello Livree)
  resta la verità.
- **L'inciso «84–85» è demolito**: la banda di serie non si semina più
  nel ladder con la cifra incisa, la riga nasce calcolata al consiglio
  (semina 6/6; gridbuilder-banda-serie 10/10; clear-consiglio 2/2 su
  server vivo). Guard della semina: la riga «↺» non si riempie dal
  seeding (semina-race-settings 6/6).

**Layout GUI — la sonda cresce**

- Sonda di layout estratta in modulo condiviso (12/12), Impostazioni anche
  a 360 px con i tab Setup e Analisi nella stessa misura (12/12, 9 s),
  quarta larghezza per Dashboard (16/16 misure, 11 s); senza ambiente
  (chromium assente) il guard si SALTA spiegando il perché, non finge.
  Soprannomi in blocco: il bottone 📝 si VEDeva ma NON era agganciato — guardia
  che scatta solo sui bottoni (viste-guard 5/5). Il cap del miscuglio
  mostra il `restrictorMaxPct` reale della classe (viste-guard + smoke
  7/7); il banner del trim torna onesta («+1 trim = +1 punto», grep con la
  promessa ×5 fuori dal codice, 7/7).

### Verifiche

- **Banco pieno al giro di chiusura: 881/881** (`npm test` intero, tardo
  pomeriggio); le suite complete internee lungo la strada: 766/766,
  770/770 e 845 al salvataggio di notte. Zero cadute dichiarate nel diario.
- Biome pulita sui file toccati, sezione per sezione (un warning
  PREESISTENTE segnalato dal diario resta in `src/webui.mjs:135`,
  import inutilizzato, fuori dal tagliando di oggi).
- Prove del vivo citate dal diario: raddoppio MX-5 ripulito in console
  e a schermo (`--from-storage`, watch in gioco), preflight beffato
  (rosso → verde 7/7), dry-run griglia sul vivo reale SENZA log di
  guardia (`celle 16` dal vivo sano, 3 tinte), rapporto reale 261030-2117
  generato senza errori, smoke `webui-smoke` verde su ogni appendice
  server.
- I file di gioco non toccati dai gesti consentiti: nessuna scrittura
  fuori dai canali, le guardie anti-anticheat sempre in piedi.

### Pacchetto

- La zip esce CONFEZIONATA dal flusso: `node tools/crea-release.mjs
  v0.1.52 "..." report/release-0.1.52.md --con-pacchetto` — il preflight
  gira PRIMA della zip (genera-uiapp + guardia delle app in gioco), il
  pacchetto-amico la confeziona DOPO e la carica come primo asset
  (sostituzione se il nome esiste).
