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
   parti» — dopo la gara passato il riepilogo
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

Riferimenti nel diario: DA-15 (1/11) per l'esito del collaudo completo,
DA-14 per le schede rivedute, DA-10 per le tinte ancora in corso.
