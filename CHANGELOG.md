# CHANGELOG — EVO Pitwall (ac-evo-career)

Le voci puntano alle fonti del repo: [report/](report/) (un file per build),
[DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md) (il registro completo). Il save in
`data/` non si tocca mai: gli aggiornamenti portano solo codice.


## v0.1.61 — 5/11/2026

- **Meccanico vivo, parlante e pentito**: la sezione «Dal vivo» legge i veri
  che EVO scrive in memoria (gomme con pressioni e temperature per bordo,
  carico, slittamento e angolo di deriva, danno sospensioni, freni,
  elettronica di bordo, motore, aria/asfalto — niente stime: campo mancante
  = casella a vuoto). Parla: nel pannello del meccanico si chiede a voce
  «qualifica», «gara con N giri», «bagnato» e il file `.carsetup` nasce col
  nome auto-pista («Ferrari 296 GT3 - Brands Hatch - Qualifica»), non più
  «EVO-consigliato». Si corregge: se una leva consigliata ha perso tempo,
  lo ammette una volta sola e indica dove tornare. Classifiche reali di
  EVO (ultime 3 sessioni con piloti) nella scheda Rivali.
- **Copilota in qualifica**: settore peggiore detto dal vivo a cambio giro
  e i «best» letti dalla HUD del gioco (primo best e miglioramenti con il
  guadagno, mai doppietta con la frase del giro).
- **Benzina onesta**: il dialogo del meccanico chiamava l'endpoint
  sbagliato e il setup non veniva mai scritto (in gioco restava il file
  vecchio a 30 L) — ora la rotta è giusta (con guardia regressione), il
  server rilegge il file scritto e verifica i campi (avviso visibile se
  qualcosa non atterra), e il blocco carburante si crea quando il file
  non lo ha. Senza consumo misurato la nota dice i litri che restano,
  non un «com'è».
- **Scheda Setup**: la scheda del setup creato appare subito sotto la
  scheda del meccanico (nome VERO, verifica, «Vedi nella lista») senza
  scrollare a fondo pagina; riparato il guasto «r.advices is not
  iterable» che toglieva di mezzo tutto il pannello.
- **Installazione**: l'icona parte da un VBS nascosto (più finestre nere
  all'avvio) e il disinstallatore riconosce le scorciatoie nuove di
  altre installazioni senza toccarle.
- **CI**: la quality di Windows esce sotto i 45 minuti spaccando la suite
  in 3 frammenti paralleli con la lint in un job suo; riparati i quattro
  guasti veri (ora di registro, copia stantia, LADDER col campione,
  publisher senza carriera) e il flake del bollettino alla radice
  (mtime dei test). Verificatore release paziente sui caricamenti lenti.
  In modalità test i due test che leggono il ladder reale saltano col
  motivo scritto.
- Suite completa **1031 test, 1028 pass, 0 guasti** (2 salti onesti con
  la modalità test); Biome 0 warning; collaudo in pagina con scrittura
  reale del setup verificata a disco.
## v0.1.60 — 5/11/2026

- **«Punta la ronda in Agenda» riparato**: il bottone del pannello Eredità
  restava col 400 «Nessuna gara programmata di questa serie nei prossimi 30
  giorni» mentendo la verità: la ricerca copriva solo 7 giorni (30 per
  l'avviso) mentre le serie non iscritte proiettano a ciclo completo (fino
  a 80). La finestra si allinea al ciclo reale e il sedile parte sul VERO
  giorno di gara; col gate chiuso dice la data vera. Guardia nuova
  `agenda-punta-lontano` (3/3).
- **Cruscotto tostato**: i due «Prepara tutto» tornano in fondo alla scheda
  (il gesto della gara riporta a leggere obiettivo, rivali, mappa ed
  eredità); spariti la riga fissa del trim (−1/+1), lo stato «App in gioco»
  e il banner «Griglia sul disco di un'altra serie» — resta la finestra oro
  del suggerimento, solo quando c'è una proposta. Le guardie pesano le
  regole nuove (trim-tile-gui riscritta).
- **Agenda**: il 400 col messaggio cheto quando non c'è proprio niente non
  nomina più «30 giorni»; e il taglio del marchio di terzi è completo: la
  guardia `nessun-riferimento-esterno` era CIECA dal 4/11 (confine parola
  scritto col backspace) — riparata, e con lei chiusi i riferimenti in
  diario, commenti, ps1 e build; nel game loader restano solo Cruscotto e
  Pitwall. «Paddock Hill» resta: è la curva di Brands Hatch.
- Verifica release in CI riallineata (niente più bundle unico nel piano).
- Suite completa **986/986**; Biome 0 warning.

## v0.1.59 — 5/11/2026

- **Griglia allineata al parco che EVO accetta**: la preparazione «Prepara tutto»
  accosta la lista modelli al numero di avversari che il gioco accetta (17 modelli
  → 16, tetto o posto del giocatore) e riempie i posti scoperti a giro dal parco
  (17 modelli → 18 posti), solo con echo completo e scarto piccolo; il via è
  bloccato su QUALSIASI griglia sbilanciata — lo stato che uccideva EVO alla
  creazione della griglia (0xC0000005, Brands Hatch multiclasse).
- **Ripiego meteo**: se la variante della ronda non è nella lista del gioco
  (LIGHT_RAIN assente a Brands Hatch), si sceglie la famiglia più vicina
  (RAIN/CLOUDY) e l'ack dichiara «ripiego» al posto di lasciare il cielo invariato.
- **Riquadro del suggerimento trim di ritorno**: il banner con Accetta/Rifiuta
  torna nella scheda gara dopo le gare; la guardia trim-passo-uno ne pesa la presenza.
- Suite completa **983/983**; Biome 385 file, 0 warning.
- Nota: l'exe offline in `dist/` va rigenerata con `crea-release` per portare v0.1.59.

## v0.1.58 — 4/11/2026

- **La tab Griglia torna viva** (difetto arrivato fino alla v0.1.57):
  `$(...).forEach is not a function` — `$` restituisce un nodo, la lista è
  `$$`. Corretti i sei riquadri; il pannello Costruzione weekend riassume
  sessioni, meteo, ronde e dettagli.
- **Bollettino del weekend senza «Metti»**: le quattro sessioni restano con
  etichetta, orario e stato; il rituale non promette più un tasto rimosso.
- **Cruscotto**: via il secondo pannello «Verdetto di giornata» (stesso
  titolo, azione doppia); resta quello che si calcola da solo.
- **Leggibilità**: 117 token `font-size` sotto 11.5px portati al pavimento in
  viste e CSS; in Analisi la tabella dei sedili sfondava di 38px e ora scorre
  in `.tscroll`. Misurate 16 schede con 0 overflow.
- **Collaudo GUI automatico**: `test/tab-sane-gui.test.mjs` apre le 19 tab e
  pretende contenuto, zero errori JS e zero overflow; `test/guardia-dollar-lista.test.mjs`
  blocca `$(...).forEach/.map/.filter`, la classe di errore della Griglia.
- **Verifica**: `npm test` **915 pass + 1 skip, 0 fail**, `npm run lint` **374 file, 0 warning**.

## v0.1.55 — 4/11/2026

- **Progetto indipendente, taglio completo** (richiesta Mauro): rimosso il
  ponte ai journal esterni e ogni dato derivato; il calendario legge solo
  `evo-calendar[-N].json` scritto da `src/journal.mjs`, non esistono più le
  7 regole `fonte:"app"` in `data/grid-classes.json`, il canale fasce
  esterno e i tool/test collegati. Rinominate le chiavi interne e il comando
  `rivals`; documentazione e presentazione riscritte senza confronti o
  ammissioni di prestito.
- **Guardia anti-regressione**: nuovo test che scansiona codice e
  documentazione e fallisce se ricompare un riferimento al prodotto
  esterno, con l'unica eccezione del nome reale della curva di Brands Hatch.
- **Verifica**: `npm test` **891/891**, `npm run lint` **358 file, 0 warning**;
  app in gioco riallineate (`test/uiapp-installata.test.mjs` 8/8).

## v0.1.54 — 3/11/2026

- **IL GENERATORE DI ROUND DEL CALENDARIO NOSTRO** (richiesta Mauro): dal
  LADDER, e solo da lei, crea il weekend NATIVO con i GIRI e la TRACCIA
  della ronda da girare, senza dipendere da journal esterni. Il percorso
  usa i quattro protobuf del campione e i passi di `preparaRonda`; la
  traccia vive in `evo-ronda-nostro[-N].json` accanto al save.

## v0.1.52 — 3/11/2026

- **Le catene di lettura, una volta per tutte**: calendario, garage e
  dizionario leggono SOLO file scritti dal gioco (journal del gioco, con fall-back sul mirror nostro —
  [src/app-carriera.mjs](src/app-carriera.mjs); garage.drivergarage;
  ui_storage + log di boot). Fuori dai dati per sempre: il magazzino L:
  è solo backup zip (e non gira più né al boot — [avvia.cmd](avvia.cmd) —
  né in lettura, solo a mano con controlla-magazzino.cmd), la fattoria
  dei campioni a mano è utensile di emergenza (il messaggio d'errore di
  [findCar](tools/set-driver-car.mjs) ora rimanda prima al menu del gioco).
- **La fattoria del dizionario: ui_storage.uistorage** (3/11 notte): il gioco
  scrive IN CHIARO Saved Games\ACE\ui_storage.uistorage con dentro
  le skin del gioco — car_guid (già SDOPPIATA come chiave del garage) e
  display_name ufficiale per ogni auto TOCCATA DAL MENU, senza log e senza
  iscrizioni. Nuova sorgente `learnCarFromStorage` (CLI `--from-storage`,
  [tools/set-car-sample.mjs](tools/set-car-sample.mjs)) agganciata al boot
  del dizionario in [tools/set-driver-car.mjs](tools/set-driver-car.mjs):
  le coppie nuove entrano, quelle contraddette si correggono, i sinonimi
  restano. La kspkg cifrata non serviva più: la fonte era qui. Test in
  [test/learn-car.test.mjs](test/learn-car.test.mjs) (9/9).
- **Il tagliando del dizionario dal menu del gioco** (3/11 pomeriggio):
  `learnCarFromStorage` non si ferma più alle voci NUOVE e CONTRADDETTE:
  se una voce è solo il nome ufficiale scritto DUE volte («Mazda Mazda
  MX-5 ND Cup») si aggiorna col nome pulito — l'etichetta doppia mente
  alla scheda garage, che mostrava «Mazda Mazda» col nome ripetuto.
  I sinonimi con RUMORE in più («Kunos Abarth 695 Biposto» del vecchio
  campionamento) NON si toccano: solo l'eccedenza interamente fatta di
  ripetizioni di token che il gioco stesso ha si puliscono. E la
  ronda della guardia ora ri-aggiorna il dizionario a ogni tick: un'auto
  toccata DAL MENU mentre il watch gira entra nel dizionario senza
  riavviare nulla ([tools/set-car-sample.mjs](tools/set-car-sample.mjs),
  [src/cli.mjs](src/cli.mjs)). Prova reale: --from-storage sul
  ui_storage di Mauro ripulisce la Mazda raddoppiata (1 aggiornata);
  Test in [test/learn-car.test.mjs](test/learn-car.test.mjs) (11/11).
- **L'iscrizione esterna entra nel tick della guardia**: anche l'apprendimento per
  iscrizione (journal + garage freschi nella stessa finestra di 10
  minuti) gira a ogni tick del watch: una serie iscritta MENTRE la guardia
  corre arriva a dizionario senza aspettare il prossimo processo. Il
  rinfresco del dizionario è iniettabile nei test (`refreshDizionario`,
  parametro di [watchOnce](src/watch.mjs)), si spegne da solo con una nota
  se non c'è niente di fresco e un suo errore non ruba il tick alla
  raccolta gare. Test in [test/cli-watch.test.mjs](test/cli-watch.test.mjs)
  (18/18 con [test/learn-car.test.mjs](test/learn-car.test.mjs)).
- **La guardia dice quando impara** (terzo giro del pomeriggio): se il
  rinfresco del dizionario cambia qualcosa, il watch stampa UNA riga
  verde — auto nuove dal menu, etichette corrette o ripulite, auto da
  iscrizione esterna; a vuoto resta zitta
  ([src/cli.mjs](src/cli.mjs)). Prova dal vivo: raddoppio della MX-5
  rimesso a mano, guardia accesa → riga + mappa ripulita
  automaticamente, tick successivo in silenzio.
- **La lezione arriva anche a `status`** (settimo giro): il battito della
  guardia porta con sé l'ultima riga verde del dizionario e la riga
  «👁 guardia attiva» di `status` la ristampa — chi controlla da
  terminale vede se e quando la guardia ha imparato, senza leggerne la
  console ([src/watch.mjs](src/watch.mjs), [src/cli.mjs](src/cli.mjs)).
  Test in [test/cli-watch.test.mjs](test/cli-watch.test.mjs).
- **La guardia in gioco** (ottavo giro): lo stato della guardia e l'ultima
  lezione del dizionario arrivano ANCHE nel cruscotto dentro EVO — il
  publisher porta il battito in fascia
  ([src/uiapp-pub.mjs](src/uiapp-pub.mjs)) e la riga a schermo esce sotto
  l'orologio di giornata: 👁 verde con «controlla Ns fa» + «dizionario: …»
  quando la guardia impara. Le fascie vecchie senza `guardia` non rompono
  niente (la riga esce solo con battito a bordo). Prima lo stato si vedeva
  SOLO nel CLI: chi gioca non apre un terminale.
  ([uiapp/cruscotto/cruscotto.src.js](uiapp/cruscotto/cruscotto.src.js)).
  Test in [test/eredita-cruscotto.test.mjs](test/eredita-cruscotto.test.mjs).
- **La guardia anche sul muro** (nono giro): il pitwall — il pannello che in
  gara è il SOLO testo leggibile — riceve il battito passato INVARIATO dalla
  vetrina ([miniPitwall](src/uiapp-pub.mjs), niente ricalcoli) e stampa il
  blocco guardia a fianco dell'orologio: stessa riga verde/ferma e lezione
  del dizionario ([uiapp/pitwall/pitwall.src.js](uiapp/pitwall/pitwall.src.js)).
  Il test delle chiavi del payload in
  [test/pitwall-radio.test.mjs](test/pitwall-radio.test.mjs) adesso include
  `guardia` (e ferma senza battito: null, non undefined).
- **Il tagliando diventa regola comune** (quarto giro): la regola del
  nome ufficiale raddoppiato esce dal learner di ui_storage in un
  helper condiviso ([soloRaddoppio](tools/set-car-sample.mjs)) usato
  anche dalle iscrizioni esterne: un'iscrizione che conferma una voce doppia la
  riporta col nome ufficiale; i sinonimi con rumore restano COM'ERANO.
  La logica vive in un solo posto. Test in
  [test/learn-car.test.mjs](test/learn-car.test.mjs) (21/21 con la
  guardia) e suite di import/gara veloce verdi (17/17).
- **Auto-correzione del dizionario auto** (la sera dell'Endurance GT4: la
  griglia si è scritta giusta, l'auto è rimasta quella del garage): il
  Prepara non può selezionare un'auto che il dizionario non conosce, e una
  voce etichettata male la bloccava per sempre — la Audi R8 LMS GT4 Evo
  compariva come «Kunos Abarth 695 Biposto». Ora l'apprendimento dai log
  rietichetta le voci CONTRADDETTE (nessun token in comune) col nome vero
  ([tools/set-car-sample.mjs](tools/set-car-sample.mjs)) e il disco riceve
  le correzioni anche a `added` = 0 (prima il salvataggio scattava solo con
  voci nuove). Test in [test/learn-car.test.mjs](test/learn-car.test.mjs).

- **Vigia del cambio di campionato** (la prova della serata incastonata):
  se sul disco resta la griglia della serie VECCHIA, la scheda gara ora
  lo dice PRIMA del bottone ([src/race.mjs](src/race.mjs)): banner
  gemello del rituale in [src/webui-views.mjs](src/webui-views.mjs) e
  [gui/js/viste-a.js](gui/js/viste-a.js). Silente con file assente,
  illeggibile o già combaciante. Test in [test/race-card.test.mjs](test/race-card.test.mjs).

## v0.1.51 — 3/11/2026

- **Il cerchio col mirror** (richiesta Mauro): la scheda della gara
  («Iscriviti e divertiti») segue la ronda del CALENDARIO anche per chi
  NON ha l'app del gioco: [src/app-carriera.mjs](src/app-carriera.mjs)
  porta `rondaDelCalendario`, l'helper unico che ritorna la ronda «next»
  dal calendario del gioco O dal mirror journal nostro
  ([src/journal.mjs](src/journal.mjs), scritto accanto al save a ogni
  saveState) — con pista, trackId, layout, giri, ora+minuto e meteo
  tradotto nelle DUE scale (weather scala ladder per `round.weather`;
  idPreset scala PRESETS per `setWeatherPreset`). `stessaSerie` matcha
  prima per AUTO, poi per nome display (i due Trofei MX-5 hanno display
  gemello e parco auto diverso); pista senza app → null e chi chiama
  resta sulla ladder grezza. Consumata in [src/race.mjs](src/race.mjs)
  (`nextRound` e `raceCard`) e in [tools/ronda-ladder.mjs](tools/ronda-ladder.mjs)
  che ha perso le TRE funzioni duplicate e `findTrackInfo`.
- **Meteo a due scale** — il fix che chiude il bug della riga CLI
  ([tools/ronda-ladder.mjs](tools/ronda-ladder.mjs)): le due scale
  (ladder 0..5 vs PRESETS di weather.mjs 0..6) NON coincidono da 3 in su;
  `meteoRonda`/`meteoPdIndex` (tabella `METEO_PD`) traducono per NOME, mai
  per numero: 3→Pioggia leggera (preset 4), 4→Pioggia (5), 5→Pioggia
  intensa (6), Coperto/Overcast→ladder 2 ma preset 3 («Coperto» del
  selettore), solo Nuvoloso/Cloudy cade sul preset 2 — come già insegna
  `presetForLabel` in [src/weather.mjs](src/weather.mjs).
- **Layout della card** — `raceCard` usa il LAYOUT seminato della ronda
  (round.layout) al posto del solo GP-default della tabella: la scheda e
  la riga «Pista» seguono il National/Fosters del calendario.
- **Verifica**: node --test su race-card + journal-nostro +
  ronda-ladder **42/42 verdi**, webui-smoke 1/1; node --check OK su
  app-carriera.mjs e ronda-ladder.mjs. La griglia scritta a Prepare
  non toccata: `rebuildGridApply` scrive solo sul Prepara, come sempre.
- **Guardia anti-singleton** (le skin identiche dopo il tasto Prepara,
  incidente Coppa MX-5 ND Cup — diario 3/11 notte): il rientro del save
  (weekend azzerato) lasciava il vivo `last_grid.customgrid` ridotto a UNA
  cella unica; la PRIMA CORSA del rebuild sul vivo non fallisce (il builder
  completa con i cloni ARMONICI della stessa livrea: griglia MONOCOLORE,
  16× visual_1) e la corsa dei candidati (magazzino per serie → bak →
  snapshot → fabbrica) non parte mai. In [src/grid-apply.mjs](src/grid-apply.mjs)
  `rebuildGridApply` conta le TINTE (campo 11 — non il byte-distinto: i
  cloni armonici lo sono per costruzione) del vivo e del magazzino della
  serie; se il magazzino ne possiede di più, la prima corsa SALTA e si va
  dritti ai candidati (prima il template della serie): vince il parco più
  ricco di livree, il Giudice `buildGridMessage` resta l'unico a validare
  i candidati, e se il magazzino non si legge si gareggia com'era
  (best-effort). Log esplicito: `[griglia] guardia anti-singleton: ...`.
  Cura a secco dell'incidente: riscrittura del vivo MX-5 dal magazzino
  (9× visual_2 bianco/rossa, 3× visual_99, 2× visual_1, banda di serie
  84–85 intatta), backup `bak-liveria-2026-11-03-00-03-54`.
- **Verifica della guardia**: node --test grid-templates **16/16**
  (2 test nuovi: «vivo POCO TINTATO perde la prima corsa, vince il
  magazzino» e «vivo SANO: la prima corsa resta sul vivo»);
  readcells-tinta + gridbuilder-tinte + gridbuilder-banda-serie +
  gridbuilder-uniche + weekend-roster **31/31**; dry-run sul vivo reale
  SENZA log di guardia (vivo sano, 3 tinte): `celle 16`.

## v0.1.50 — 2/11/2026

- **Il modulo della carriera si chiama APP** — rinomina completa in
tutto il progetto: il ponte [src/app-carriera.mjs](src/app-carriera.mjs) (la sola lettura dei journal dell'app del gioco in Saved
Games), con [src/journal.mjs](src/journal.mjs) e [src/uiapp-store.mjs](src/uiapp-store.mjs)
a passo e consumatori aggiornati (webui, webui-views, uiapp-pub, state, cars,
race, import, analisi, gridbuilder, grid-calib, world, testday, cli, life).
Rinominati con lui [ronda-ladder.mjs](tools/ronda-ladder.mjs),
[classi-da-app.mjs](tools/classi-da-app.mjs), [cura-giri-app.mjs](tools/cura-giri-app.mjs),
[_prova-app.mjs](tools/_prova-app.mjs) e i test `app-*` di [test/](test/).
- **Il tasto «Prepara tutto e avvia il campionato» esce dalla GUI** (richiesta
Mauro: «il nuovo tasto che non voglio, è da rimuovere»): via la riga da
ENTRAMBE le montature del tab Campionati ([viste-b.js](gui/js/viste-b.js)), via
il case POST `semina`, l'import del seminatore e la voce `semina` dai cancelli
SOLO_POST di [webui.mjs](src/webui.mjs); l'endpoint risponde 404. Il seminatore
resta da riga di comando (`node tools/semina-campionato.mjs`, test
[semina-campionato.test.mjs](test/semina-campionato.test.mjs) intatto);
test [semina-bottone.test.mjs](test/semina-bottone.test.mjs) cancellato —
provava esattamente quel tasto+endpoint.
- **Verifica**: suite dei moduli rinominati 82/82, suite intera `npm test`
**867/867** (37 s); webui riavviata, `/api/semina` → 404. Nota d'ambiente:
`node --test test/` su Node 22 prova a caricare la CARTELLA come modulo — vale
il glob `test/*.test.mjs`.

## v0.1.48 — 2/11/2026

- Il salvataggio del giorno ([report](report/build-0.1.48-382313b.md)): bottone
«Punta la ronda in Agenda» nel pannello Eredità (endpoint `agenda-choose`,
verificato vivo sul save), meteo automatico (wx-auto) col suo registro,
margine sul 2° nel registro, livree chimere cancellate,
[genera-uiapp.mjs](tools/genera-uiapp.mjs) con guardie e sorgenti `src.js` nel
repo, note presentazione subreddit EN/IT, audit dati e banchi A/B del 1/11 —
782 test verdi.

## v0.1.47 — 1/11/2026

- Il grande ripasso da v0.1.43 ([report](report/build-0.1.47-7ac09ed.md)):
collaudo del PC amico vergine dal sorgente (installa.cmd in sandbox, 24/24),
schede sane sul save vuoto (Risultati/Piste/system-health/ingegnere curati),
ore spostabili per ronda in Agenda, installatore delle app in gioco in
INSTALLA-GIOCO.cmd, rinforzi ai test (garage-buy, agenda, lingua-server),
tinte prestate DA-10, Fase 1 di [AUDIT.md](AUDIT.md) (`npm run check`,
CHANGELOG nato, RELEASE_CHECKLIST) e preparazione delle release
0.1.44–0.1.46.

## v0.1.46 — 1/11/2026

- **Autopsia della vittoria senza più lo 0,00 finto** (il caso COTA del
  31/10): `gapMs` per chi vince è SEMPRE 0 (tempo mio − tempo vincitore),
  quindi la scheda raccontava la VITTORIA col linguaggio della sconfitta —
  «Gap 0,00s su 3 giri: ~0,00s al giro da ridare al vincitore», cioè a me
  stesso. Ora [results.mjs](src/results.mjs) calcola anche `secondGapMs`:
  per P1 il margine vero è il tempo del SECONDO classificato meno il mio
  (37,04s a COTA). [analisi.mjs](src/analisi.mjs) nella vittoria lo dice
  («Vittoria: margine sul secondo 37,0s su 3 giri (~12,3s al giro di
  vantaggio)») e, se manca, meglio il silenzio che uno 0,00 finto;
  [import.mjs](src/import.mjs) porta il campo nel save a ogni import.
  La gara già importata (file risultato di COTA ancora in
  `Saved Games\ACE\Results`) ricalcolata per la mano: in save il solo
  campo nuovo, con backup.
- **KPI «Gap vincitore» → «Margine sul 2°» quando il vincitore sei tu**
  ([viste-analisi.js](gui/js/viste-analisi.js)): stessa casella, la cifra
  giusta; per i posti da 2 in poi la voce resta com'era.
- **Battito del server col tempo di risposta** (richiesta Mauro): il piede
  della GUI misura anche il ping in ms — «server vivo · porta 4689 · build
  0.1.46 · a1b2c3d · 12 ms» ([core.js](gui/js/core.js)), il titolo della
  voce lo racconta.
- **Filtri auto e pista nel banco A/B** (richiesta Mauro: «i due menu di
  sessione diventano lunghi»): sopra ai selettori due tendine che
  restringono l'elenco SENZA azzerare le scelte già fatte (A e B restano
  selezionati finché la sessione è visibile); se i filtri escludono tutto
  la nota lo dice invece di lasciare menu vuoti muti.
  [viste-analisi.js](gui/js/viste-analisi.js).
- **Icona del meteo nel righello dell'agenda** (richiesta Mauro): accanto
  all'ora di ogni ronda la STESSA mappa `WX_ICON` del piano di gara —
  ☀️🌤️☁️🌦️🌧️⛈️ — con nel tooltip il meteo previsto
  ([viste-b.js](gui/js/viste-b.js)). Il codice preset della ronda lo calcola
  [agenda.mjs](src/agenda.mjs) (`wx`), il nome resta in parole accanto.
- **Un commento si stampava in pagina**: nella scheda «Prossima gara» la
  nota di cancellazione dell'avviso «Prima volta in EVO» era rimasta
  DENTRO il template literal e usciva come testo della pagina; rimessa
  fuori, dove deve stare ([viste-a.js](gui/js/viste-a.js)).
- **La legge del ritmo fra publisher e app in gioco** (test nuovo):
  `PERIODO_MS` vive in TRE file senza nessun import fra loro —
  il publisher ([uiapp-pub.mjs](src/uiapp-pub.mjs)), il Cruscotto e il
  Pitwall — e i soli commenti dicevano «se lo cambi, cambia là» come
  fiducia orale.
  [uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs) la rende una
  spunta con nome: STESSO numero, STESSA formula dello slot
  (`ui-<slot>.json` da ENTRAMBE le parti) e sondaggio a metà periodo (le
  app leggono ogni `PERIODO_MS/2`, il publisher scrive ogni `PERIODO_MS`).
- **Il teorico diventa una legge, un solo fonte** (richiesta Mauro, lezione
  3/11): la somma dei splits del file è il best per costruzione (EVO scrive
  nei splits i settori del GIRO MIGLIORE), quindi ovunque l'interfaccia
  diceva «teorico» su quella somma mentiva. Ora il teorico VERO (minimo per
  settore sui giri segnati nei log del gioco, con margine e giri) arriva in
  tre posti: la riga «teorico» del Gironi ([hotlaps.mjs](src/hotlaps.mjs),
  sostituzione al momento di lettura — il quaderno su disco non cambia), la
  scheda dell'import gara ([import.mjs](src/import.mjs), persistito nel
  save) e la frase dell'Autopsia ([analisi.mjs](src/analisi.mjs)), che ora
  dice «minimo per settore sui giri segnati, dai log». Senza log abbinati la
  riga mostra «—»: niente più best travestito da teorico. Test di guardia
  sull'import vero: [import-teorico.test.mjs](test/import-teorico.test.mjs).
- **Il 0,00 del Tetto non è quasi sempre un no-score** (richiesta Mauro:
  «distingui 'sono io il campione' dal caso senza dati»): nel Tetto
  teorico Suzuka e Laguna mostravano delta 0,00 indistinguibili da uno
  0,00 finto — il vecchio `?? 0` in [analisi.mjs](src/analisi.mjs)
  trasformava un campo VUOTO (nessun avversario con split misurato nel
  file) in uno 0,00 identico al campione detenuto. Ora
  [results.mjs](src/results.mjs) porta per settore `fieldCount` (rivali
  veri col settore) e `solo`: [tettoReport](src/analisi.mjs) agrega SOLO i
  delta col campo vivo (un ingresso senza campo vale nessun-dato, fuori
  da busta, mediana e peggiori), e la cella della GUI
  ([viste-analisi.js](gui/js/viste-analisi.js)) distingue: 0,00 + «🥇
  campione» col campo vivo, «— senza dati» quando il campo non c'è.
  Test di guardia nelle quattro forgie in
  [analisi.test.mjs](test/analisi.test.mjs).
- **Suite completa in sandbox: 701 test verdi** (da 697 di v0.1.45), 0
  cadute; test nuovi: caso vittoria con margine (e senza margine =
  silenzio) in [analisi.test.mjs](test/analisi.test.mjs), più la legge del
  ritmo. Lint Biome secca sui 299 file. Danza del PC amico vergine dal
  sorgente: **24/24 verifiche verdi**.

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
