# COMANDI-BUFFY.md — i comandi fissi di Mauro (e cosa fanno)

I titoli che Mauro lancia in chat sono comandi fissi: ogni voce qui sotto è
il contratto del comando. Basta incollarlo (o cliccare la card) e l'agente
parte con l'intenzione già scritta, senza doverla rispiegare ogni volta.

---

## «Collaudo in gara»

> Collaudo in gara: prepara la prova radio come da casa (gara veloce in
> test-mode), fai girare il collaudo e dimmi il verdetto.

Cosa fa l'agente: attiva la modalità test (`EVO_TEST_MODE`), prepara una
**gara veloce** (mai una carriera vera), poi verifica la filiera della
radio END TO END:

1. **Server vivo**: tick `copilotaServerTick` che gira (STATO ogni 60 s nel
   registro `data/copilot-voce-24-10.jsonl`, zero «TICK BLOCCATO — ripartito»).
2. **Cosimo parla**: righe `SESSIONE VIVA` e frasi `chi/it` nel registro,
   voce server viva (System.Speech, it-IT) anche con la GUI chiusa.
3. **Una sola radio**: con la voce server viva la PAGINA resta muta
   (`!voceServer`), niente frasi doppie.
4. **Frasi sane**: nessuna ripetizione, niente «finendo il giro 1 mentre
   parti» — dopo la gara passato il riepilogo- **Cura livree chimere** (2/11): se un template o `last_grid` porta celle con
  coppie mai scritte da EVO (anteprima vuota, zona crash Gameface),
  `node tools/cura-livree.mjs` (dry run) → quadro; `--scrivi` cura: per ogni
  identità (carId+mech+visual) copia il f14 della variante PIÙ FREQUENTE nel
  parco di GameModes (last_grid + bak-*). Backup `bak-livree-*`; roster
  risincronizzato. Tocco solo di f14: PI e skill intatti. EVO chiuso per scrivere.
- **Cancellai delle coppie nel builder** (2/11): src/gridbuilder.mjs rifiuta le
  celle con f10/f11 di modelli diversi dal f3 (invariante del parco: 2530/2530).
    (`node tools/_monitor-copilota.mjs --riepilogo data/copilot-…jsonl`).

Verdetto finale: cosa ha parlato, cosa ha taciuto e perché, con la riga
del registro accanto a ogni voce. Test-mode spenta a fine collaudo.

---

## «Radio muta dal pannello»

> Radio muta dal pannello: controlla che le conferme dei comandi del
> pannello in gioco arrivino anche alla radio, e dimmi cosa tace e perché.

Cosa fa l'agente: quando il pannello **Cruscotto in gioco** esegue un
comando (imposta auto / avvia sessione / evento), la conferma oggi vive
SOLO in console (`assorbiAck` in `src/uiapp-pub.mjs` — «la radio del muro»
è una metafora stampata). Comanda di:

1. verificare nel registro che l'ack del pannello compaia (o non compaia)
   nella radio vera: la riga `confermato` sta nella memoria del pannello,
   ma la VOCE deve poterla annunciare;
2. tappare la buca trovata senza toccare la radio di gara (frasi del
   narratore UNICO, `gui/js/narratore-unito.js` — un solo costruttore per
   pannello e voce);
3. un test nuovo in `test/` per la buca tappata, e suite completa verde
   prima di chiudere.

---

## «Radio anche nel monitor GUI»

> Radio anche nel monitor GUI: le frasi della radio devono essere visibili
> anche nel pannello Ingegnere LIVE del Pitwall nel browser.

Cosa fa l'agente: il registro voce (`data/copilot-voce-24-10.jsonl`) ha
già la lettura pronta (`leggiRadioVoce` in `src/voce-copilota.mjs`, usata
da `miniPitwall` per il pannello in gioco). Comanda di portare la STESSA
lettura nel blocco 🎧 **Ingegnere LIVE** della GUI (`gui/js/viste-a.js`):
ultime frasi in ordine, gli eventi di sessione NON parlano, il limite
`last` vale, file assente = niente radio e nessun errore. Stessa regola
di casa per i test (EVO_DATA_DIR in sandbox, come `test/pitwall-radio.test.mjs`).

---

*Comandi aggiunti 30/10/2026 dopo il collaudo dal vivo: Oulton Park, il
copilota è risultato preciso in gara (verifica a voce di Mauro).*

---

## Secondo blocco — sempre 30/10/2026, dettatura di Mauro

### «Cancella storia se ora vecchia»

> Cancella storia se ora vecchia: la memoria del tooltip del pannello in
> gioco non deve mostrare voci sbiadite da giorni — le righe vecchie vanno purgate.

Cosa fa l'agente: la storia del comando vive in `data/cruscotto-storia.json`
(`src/uiapp-pub.mjs`: `storiaAggiungi` tiene al massimo 12 righe, ma il
tempo NON scade mai — una voce di tre giorni dopo è ancora in tooltip).
Il comando chiede: una scadenza vera (es. le voci oltre le 12 ore, o del
giorno prima, escono da sole alla prossima `storiaAggiungi`/lettura), con
regola in sandbox (`EVO_DATA_DIR`, test nuovo in `test/`) e senza
toccare la radio di gara. La memoria resta un plus: mai un errore in
vasta se il file non si apre.

### «Cambio auto segnalato»

> Cambio auto segnalato: quando il cambio auto esce (dal pannello in gioco
> o da CLI), la conferma deve arrivare anche alla RADIO, non solo in console.

Cosa fa l'agente: oggi l'ack del cambio auto (setcar) finisce in console
(`assorbiAck`, riga «la radio del muro…» suonata) e nel tooltip della
storia, ma la VOCE non lo dice. Il comando chiede di portare la conferma
nella radio vera: una riga nel formato del registro voce (firma
`chi/it/livello`, `data/copilot-voce-24-10.jsonl`) che Cosimo annuncia,
STATO: «cambio auto: [nome] è nel menu». Mai toccare i narratori di gara
(`narratore()` unico); test nuovo sulla riga emessa + suite completa verde.

### «Tuona Ferrari nel pool»

> Tuona Ferrari nel pool: controlla che la Ferrari scelta sia davvero nel
> pool della classe dell'iscritta, e se manca entrarla con le regole di casa.

Cosa fa l'agente: le classi vivono in [data/grid-classes.json](data/grid-classes.json)
(17 classi: `poolAuto` multi-marca e pescaggi random con regole per
preset — lezione 28/10: ogni preset pescato deve avere una regola).
Il comando chiede PRIMA di mostrare i candidati: quale classe gira ora
(serie/round attivo dal save) e con quali auto nel suo pool; le Ferrari
sono già in alcune (Daytona SP3, 296 GT3, 288 GTO). Se la Ferrari
voluta NON è nel pool della classe in gioco: entrarla con il preset
meccanico giusto, coprendola con una regola (ballast/restrictor coerenti
con la classe) e verificare il giro completo (griglia costruita, celle
uniche, test di casa verde). Se invece c'è già: verdetto «tuona già»
con la prova (quale regola la pesca e quando).

---

## Terzo blocco — 30/10 notte, dopo la P1 a Brands Hatch con l'Hyundai

### «Titoli aggressive»

> Titoli aggressive: i titoli delle gare di campionato (nomi delle ronde nel
> ladder e titoli della gazzetta) devono essere più aggressivi, stile
> «Moderne VS Epoca!!!».

Cosa fa l'agente: due molette. (1) I nomi delle ronde in [config/career.evo.ladder.json](config/career.evo.ladder.json)
prendono un epitetone CAPS con «!!!» (`Brands Hatch — MODERNE VS EPOCA!!!`,
`Imola — FINALE A COLTELLO!!!`). (2) I titoli della gazzetta in [src/gazzetta.mjs](src/gazzetta.mjs)
acquisiscono il malloppo d'esclamazioni e il verdetto col rivale, mantenendo
le testate fissate dai test (`GRANDE CHELEM A TRACK`, `BRUTTA SERIE`,
`PODIO A SERIE`… — `test/stampa.test.mjs` governa).

### «Controlla bilanciamenti e zavorre»

> Controlla bilanciamenti e zavorre: guarda l'ULTIMO file risultato di gioco,
> confronta le zavorre scritte sul vivo con le regole della classe, e delibera
> se il sistema ha fatto un buon lavoro.

Cosa fa l'agente: i campi `ballast` e `restrictor` stanno NEL file
resultato (`Saved Games/ACE/Results/*.sessionresults.json`, campo `drivers[]`),
non solo nella classe. Il comando confronta riga per riga con le `regole` di
[data/grid-classes.json](data/grid-classes.json) (base a 0/0, cap 100 kg/20%,
preset mech), poi giudica il CAMPO: spread dei giri per auto PARI (col
ballast), gap dal base, gruppi spaccati. Verdetto con la prova accanto.
Se la prima gara di una classe non è combattuta: va la nota per
griglia-calib — la classe decide i correttivi per-pista dalla gara dopo.

### «Racconta la ripresa della ronda»

> Racconta la ripresa della ronda nella storia: scrive un capitolo narrativo
> della stagione in data/journal/stagione-N.md con i fatti vergini dell'ultima
> gara.

Cosa fa l'agente: legge l'ultima gara (`Saved Games/ACE/Results/`), il save
(serie, stagione, round) e il garage (l'auto di oggi), poi scrive il capitolo
in [data/journal/stagione-12.md](data/journal/stagione-12.md) (o stagione-N
corrente): la ripresa, la gara con i numeri (grida, best lap, margine,
zavorre viste sul vivo) e la nota per griglia-calib. La rassegna ufficiale
a stagione chiusa sovrascriverà la pagina: il capitolo è la stampa di sera.

---

## Quarto blocco — 1/11/2026, i PROMPT RICORRENTI (collaudo della macchina, non del gioco)

Quattro prompt fissi da incollare una volta ogni tanto: il collaudo della
macchina quando nessuno chiede niente, e la cura puntuale di un settore
quando serve. Vengono DETTATI e l'agente parte senza doverli rispiegare.

### «Cuore di collaudo» (la suite, in sandbox)

> Cuore di collaudo: lancia la suite completa in sandbox, riporta il
> verdetto numerico e dimmi se qualcosa è peggiorato rispetto al conteggio
> precedente.

Cosa fa l'agente: gira `node --test test/*.test.mjs` in sandbox
(EVO_DATA_DIR/ACE_GAME_SAVEDIR, mai colpendo i file veri di EVO). Se un
test cade, NON lo riscrive: lo RILANCIA da solo (`--test-name-pattern`)
per capire se è rosso vero o maglietta (flaky), e nel secondo caso lo
dice come tale senza rattoppare a occhio. Verdetto numerico («650/650,
3 test nuovi da ieri») + lista dei rossi con la RIGA di errore copiata.
Se un rosso dipende dall'ora (fusi, giorni), lo rinforza e lo firma nel
diario: niente test che dipendono dall'OROLOGIO del PC.

### «Crepa il canarino» (il collaudo amico, vergine)

> Crepa il canarino: rifai la danza del PC amico vergine in
> tools/_collaudo-amico.mjs e riporta l'esito delle verifiche
> byte per byte.

Cosa fa l'agente: esegue il collaudo end-to-end (l'unico che prova ciò
che l'AMICO scaricherebbe): zipball del ramo corrente (`git ls-files` +
zip col tar di System32), server finto che serve la zipball,
installa.cmd, base Saved Games finta col loader ACEUIAppLoader + primo
avvio + secondo avvio. Verdetto: elenco delle 21 righe [x]/[!] col
punto esatto dove cade l'eventuale KO (in sandbox o nella danza).
Se un file manca dalla zipball, il colpevole è quasi sempre un file non
ancora tracciato nel git: si committa e si rilancia (lezione 1/11: i
cinque file dell'installazione automatica non erano nel git e il
pacchetto dell'amico ne resterebbe privo).

### «Che cosa fa la GUI peggio di ieri»

> Che cosa fa la GUI peggio di ieri: passeggia per le schede della GUI
> (Campionati, Garage, Rivali, pannello conflitti) e dimmi cosa è
> peggiore del collaudo vergine del 31/10.

Cosa fa l'agente (lanciabile ogni tanto, al volo): le 19 schede furono
collaudate sul PC vergine il 31/10 — 17 sane, 2 piegate e curate subito
(Risultati/Piste e system-health; la voce di collaudo è nel diario).
Le RILEGGE tutte e vede se è caduto qualcosa: le 2 curate SONO CONTINUE
sane? Le altre 17 RESISTONO al cambio? Verdetto scheda per scheda con
la prova accanto. NON ripara: solo REPORT — se un KO emerge (una scheda
che salta al posto sbagliato), lo firma nel diario senza rincorrerlo
oltre il verdetto.

### «Mai un test sazio»

> Mai un test sazio: cerca i test VERDE-SEMPRE (passano sempre, anche
> se rompi la cosa che proteggono) e propostane 2-3 da rinforzo.

Cosa fa l'agente (PRIMA la proposta, POI il permesso di Mauro): cerca i
test che passano SEMPRE — rompe a mano, dentro una copia, la cosa che
proteggono e guarda se il test cade: quello che NON cade è un test
sazio, da rinforzare. Propone la stesura di 2-3 test d'infarto:
(1) assenza di crolli, (2) protezione delle regole di casa,
(3) un caso-limite di rottura. Scrittura SOLO dopo il permesso: fino a
quel punto, REPORT puro.

### «Guardia delle app in gioco» (spunta standard, 3/11)

> Guardia delle app in gioco: gira genera-uiapp e la guardia, e dimmi se
> le app costruite e le copie in gioco sono al passo.

Cosa fa l'agente: la SPUNTA STANDARD dopo OGNI modifica alle app in
gioco (`uiapp/`: sagome `.src.js`, `app.json`, `menu.html` o il valore
`PERIODO_MS` del publisher). Due passi, nell'ordine:

1. `node tools/genera-uiapp.mjs` — costruiti freschi (PERIODO_MS dal
   publisher + firma BUILD_OK); se il costruito cambia, il generatore
   richiama da solo gli installatori e le copie in gioco seguono;
2. `node --test test/uiapp-installata.test.mjs` — la guardia intera:
   biome sulle sagome, firma BUILD_OK nel costruito, copia installata
   BYTE PER BYTE, le PAGINE D'INGRESSO (`app.json` installato =
   sorgente byte per byte, `menu.html` assente — lezione 27/10: il
   loader le rilegge a ogni avvio) e i COMMENTI HTML (regola 3/11:
   ogni `<!-- … -->` o è firmato con una data tipo «3/11», o va
   cancellato — markup sepolto vietato, anche nei commenti).

Esito non-zero NON si chiude: si diagnostica (solitamente riallinea con
il passo 1) e si rigira fino al verde. In release la soglia è già
automatica: il preflight di `tools/crea-release.mjs` gira gli stessi
due passi prima di confezionare la zip.

Riferimenti nel diario: DA-15 (1/11) per l'esito del collaudo completo,
DA-14 per le schede rivedute, DA-10 per le tinte ancora in corso.

### Guardia di layout (spunta standard, nel comando check, 3/11)

> Guardia di layout: gira il comando check e dimmi se i 21 tab della
> GUI (19 in nav + 2 nascosti) stanno in piedi a ogni larghezza.

Cosa fa l'agente: girare `npm run check` e leggere l'esito della guardia
di [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs),
CHE IL COMANDO PORTA GIÀ DENTRO: `"test": "node --test test/*.test.mjs"`
la scopre col glob, e `"check": "npm test && npm run lint"` la esegue a ogni
passata. 21 tab — i 19 in nav (Dashboard → Analisi) e i 2 NASCOSTI senza
bottone in nav (Calendario, Classifica Mondiale, aperti dalla sonda con la
stessa leva dei click vivi `tab = '…'; render()`, flag `nascosto`) — × 6
larghezze (256 · 320 · 360 · 480 · 1250 · 1920) = 126 misure: `assettaVista` clicka
via evaluate e aspetta il marcatore di vista (`#drv-messaggi` la Posta,
`#rv-registro` i Rivali, `#ch-carica` i Campionati, `#an-tetto` l'Analisi,
`#cal-titolo` il Calendario nascosto, `#mondo-vetrina` la Classifica
Mondiale nascosta, e così via);
`assettaRiempimentiImpostazioni` attende i tre riempimenti noti,
`assettaStabilitaGenerica` (due impression a 300 ms identiche, tetto 15 s)
i tab senza riempimenti noti. Orchestrazione e sonda separate:
[test/_layout-probe.mjs](test/_layout-probe.mjs).

Skip onesti: senza `playwright-core` installato, senza `chromium` nella
cache di Playwright o senza `data/evo-career.save.json` la misura NON cade
rossa ma resta `ok`, `# skipped 1`, col perché nel TAP («scaricalo con
`npx playwright install chromium`», «manca il save …»): verde che spiega,
non rosso che finge — la legge richiesta per la CI del comando check.

La prova del 3/11 (dopo le due voci del diario di questa giornata:
«senza ambiente si salta» e «prova del vivo») ha chiuso il
giro completo: suite `888/888` con la guardia dentro e Biome senza
errori (gli stessi 5 warning preesistenti e documentati), `npm run check`
exit 0 — la forma del 3/11 con i tab nascosti (2 tab
in più, 105 misure poi) e con la sesta larghezza 256 (126 misure, la
forma corrente) in [tmp/test-256.log](tmp/test-256.log) e la
guardia da sola in [tmp/layout-21tab.log](tmp/layout-21tab.log) (`ok 1`,
28 s). PC amico senza
chromium: la suite salta onesto (zero misure) e il check resta verde.

Quando si lavora a una vista singola vale lo stesso passo che per le app
in gioco: il `node --test` del file isolato durante il collaudo, e
`npm run check` intero PRIMA di dichiarare la spunta fatta.

Riferimenti nel diario: la voce 3/11 «senza ambiente si salta» per la
forma dello skip, le voci odierna «due tab nascosti» per Calendario e
Classifica Mondiale (105 misure, 21 tab × 5 larghezze) e la voce
«Guardia di layout nel comando check» per il legame dimostrato con la
«Guardia di layout nel comando check» per il legame dimostrato con la
spunta standard.

---

### Guardia della fitta-fitta Analisi (spunta standard, 3/11)

> Guardia Analisi a confronto: gira tetto-gui-json e dimmi se le due
> facce del tab Analisi (GUI e JSON) si stringono la mano a entrambe
> le lingue.

Cosa fa l'agente: la SPUNTA STANDARD dopo ogni tocco al tab Analisi —
grafica ([gui/js/viste-analisi.js](gui/js/viste-analisi.js)), server
([src/analisi.mjs](src/analisi.mjs) e i casi `tetto`/`autopsy`/`seat-mc`
del dispatcher webui) o la legge della lingua ([src/lang.mjs](src/lang.mjs)).
Un passo: `node --test test/tetto-gui-json.test.mjs` — 3 confronti ×
2 lingue (it · en, porte 8745–8750, ~18 s):

1. **Tetto teorico**: la tabella disegnata LETTA riga per riga contro
   `/api/tetto` — stessa lista di piste VERE (le piste senza riparto
   restano fuori, lezione Suzuka), stesse Gare, stessa busta, stessa
   mediana del reparto col SUO settore, stesso picco e stesso margine
   onesto;
2. **Autopsia della gara**: i SEI KPI uno a uno, le cagioni una per una
   (tag e testo entrambi in pannello) e la marcatura «griglia non in
   archivio» quando il JSON dice `hasRaceRow:false` — niente confronti
   finti sul campo-top;
3. **Monte Carlo del sedile**: la tabella riga per riga contro
   `/api/seat-mc` con gli STESSI sims della GUI (400) — legale perché la
   stima è deterministica (seme fisso `seatmc|nodo|stagione|diff|sims`).

A due lingue vale in più la misura della LINGUA: legenda e testate
tradotte («campione»/«champion»), secondi col SEPARATORE della lingua
(virgola a it, PUNTO a en), la prima etichetta KPI e le parole della
sottoriga MC giuste per lingua. I confronti restano a NUMERI, mai a
stringhe: `msDi`/`parseFloat`/`numera` decifrano entrambi i separatori.

Skip onesti: senza `playwright-core` o senza `chromium` nella cache di
Playwright la misura resta `ok` col perché nel TAP, come la guardia di
layout. Il save e la cartella del GIOCO vivono in sandbox
(`EVO_DATA_DIR`/`ACE_DATA`), mai sui file veri; le porte 8745–8750
devono stare libere (una per pannello e lingua).

Lo stesso passo per vista singola: il `node --test` del file isolato
durante il collaudo, e `npm run check` intero PRIMA di dichiarare la
spunta fatta.

Riferimenti nel diario: la voce 3/11 «La fitta-fitta del tab Analisi»
per le lezioni di sandbox (adozione della lingua, carriera finta e
decifratori numerici).

---

### Sonda audit dei dati (spunta standard, 3/11)

> Sonda audit dei dati: gira la sonda audit con --report e dimmi come
> stanno i dati di casa, con le soglie segnate.

Cosa fa l'agente: `node tmp/_audit-dati-1101.mjs --report` — SOLO
LETTURA dei dati (data/) e del save: l'unica carta scritta è
[report/audit-dati-AAAA-MM-GG.num.md](report/audit-dati-2026-11-03.num.md)
(quello del giorno), con potatura dei .num.md oltre i 3 più recenti.
Senza `--report` il diff esce SOLO a terminale, niente scritture.

La leva SOGLIE (3/11): le righe del diff che toccano o superano un
LIMITE NOTO del codice portano un ⚠ — che NON è un difetto: è
«riga al cap, guardaci tu»:

- **messaggi** cap 60 (`state.mjs` · `pushMessage slice(-60)`);
- **zips** cap MAX_ZIP (`tools/salva-save.mjs`) — la sonda LEGGE la
  costante VERA dal codice (dal 31/10 è 2), non lo ricorda (i report più
  vecchi stampavano «4», il valore di un altro giorno);
- **trim di serie** oltre ±20 (`cli.mjs` · `difficulty --trim`) — il
  save non dovrebbe mai portare oltre: se lo porta è anomalia;
- **doppie grafie di bestLaps** (cap 0, le esce appena compaiono) —
  criterio case-insensitive IMPORTATO dalla leva di cura
  [tools/normalizza-bestlaps.mjs](tools/normalizza-bestlaps.mjs), con la
  lista delle chiavi doppie nel blocco SAVE: bestLaps.

La riga FINE chiude col numero: «⚠ soglie toccate: messaggi, zip».

Le sezioni del diff, nell'ordine: DISCO (cartelle di data/, sempre, più
i file top-level da ≥ 0,1 MB), SAVE (carta d'identità · difficulty ·
raceSettings · garage · bestLaps), LADDER, CLASSI (grid-classes.json),
SALVA-SAVE (gli zip in slot-1/slot-2) e SOGLIE a fondo pagina.

Riferimenti nel diario: le voci 3/11 «Sonda audit ricostruita + leva
SOGLIE» (ricostruzione e decisioni guida) e «Leva bestLaps agganciata
al nodo di import» (il canone delle gare nuove); esempio di esito:
[report/audit-dati-2026-11-03.num.md](report/audit-dati-2026-11-03.num.md).

---

### Leva normalizza-bestlaps agganciata al nodo di import (spunta per le
gare nuove, 3/11)

> Normalizza le grafie di bestLaps nel save; poi dimmi se le gare nuove
> le possono ancora raddoppiare.

Due gesti separati:

1. **cura delle doppie GIA IN SAVE** — `node tools/normalizza-bestlaps.mjs
   [--dry]` fonde i gruppi di grafia case-insensitive col canone del
   ladder; GUARDIA ANTI-CORSA: webui col save in memoria vivo → NON
   scrive: prima `node tools/riavvia-webui.mjs`, poi si rilancia;
2. **prevenzione delle gare NOVE** — non serve più alcun gesto: la
   scrittura del record personale (src/state.mjs · applyRaceResult)
   passa da chiaveBestLaps (seme = nome attivo del ladder; grafia già
   presente riceve la gara nuova, altrimenti canone). Il criterio
   grafiaNorma vive in src/state.mjs e la leva fa il re-export (una
   sola copia). Guardia del canone: test/normalizza-bestlaps.test.mjs.

Riferimenti nel diario: la voce 3/11 «Leva bestLaps agganciata al nodo
di import: le gare nuove non riseminano più doppie grafie».
