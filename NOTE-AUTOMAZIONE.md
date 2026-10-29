## GARA DELLA SERATA: IL TICK AFAMATO — INTERVAL UNREF + PAYLOAD PESANTE (29/10, notte)

- **IL FATTO**: gara veloce (Monza 3 giri, P7, file `261029-0056_SP_Race`):
  voce zero dal server — ma all'uscita Mauro ha sentito «…niente gas».
  Quella frase è la `boxopen` del narratore, parlata dal BROWSER (pagina
  GUI non ancora ricaricata: radio vecchia, la via di prima). Il log voce
  meanwhile ZERO righe per 57 minuti di server vivo: la radio non era
  muta per errore — era il tick che NON GIRAVA.
- **LE CAUSE TROVATE**: (1) interval `unref` — sotto carico il loop può
  lasciarlo affamato per minuti: da qui ogni tick della voce è REFED;
  (2) il tick usava il payload PIENO (raceCard + albero MoTeC su disco
  lento), si appendeva e non parlava; (3) il tick leggtheaha la snapshot
  CACHED senza sync né vigia del sordo — con la GUI chiusa non si curava
  da solo. (4) il `catch` bianco nascondeva tutto (prima correzione).
- **ORA**: payload LEGGERO nel tick (niente MoTeC/raceCard: l'HUD já dice
  lapsTotal e fuel), sync + vigia dentro il tick, ogni silenzio/errore
  sul log `data/copilot-voce-24-10.jsonl` con il MOTIVO scritto. 31/31
  test verdi (voce + ingegnere + narratori + smoke).
- **PROVA VERA**: prossimo gara veloce — la mano del tick deve scrivere
  «SESSIONE VIVA» e le frasi in log (grazie 15 s dopo l'ingresso in pista);
  la GUI va ricaricata con Ctrl+F5 così il chip diventa «🔊 copilota
  (server)» e la radio passa alla mano del Pitwall anche a GUI chiusa.

- **IL FATTO**: Mauro ha corso una gara veloce a Monza (Instant Race, 3 giri,
  file `261029-0019_SP_Race.sessionresults.json`): P13, giro più veloce
  assoluto della sala (1:55.263). Voce zero — ma il Pitwall parlante l'ho
  scritto DOPO che il server era già partito: `node src\webui.mjs` carica
  il codice ALL'AVVIO, le modifiche a webui.mjs/voce-copilota.mjs fatte a
  server vivo restano su disco finché qualcuno non lo riavvia.
- **LA CURA**: riavvio col solito `node tools/riavvia-webui.mjs <pid>`
  (portata a termine: era l'unico momento sicuro, gara finita). Verifiche
  post-riavvio: `/api/ingegnere` risponde `voceServer:true`, `voce-server`
  risponde `{on:true}`, e due frasi di prova col relatore standalone sono
  USCITE (relatore PowerShell visto nascere e poi spegnersi pulito: quando
  lo stdin si chiude il suo ReadLine torna null e il processo esce da solo,
  niente orfani — a fine verifica restano presi solo il lettore
  `acevo-live.ps1` e la query di controllo).
- **REGOLA DI RIPASSO** (dopo una sessione di lavoro sul server): se in
  trasferta di gara la voce continua a tacere, la PRIMA cosa è chiedersi
  se il server gira col codice nuovo — il riavvio è niente odioso.

## LA VOCE DELLA COPILOTA PASSA NEL PITWALL — NON PIÙ SOLO NEL BROWSER (29/10, prima del mattino)

- **PERCHÉ TACEVA**: la voce viveva SOLO nella barra «🎧 Ingegnere LIVE»
  della GUI (gui/js/viste-a.js, speechSynthesis del browser). In gara con
  la pagina chiusa, tenuta su un'altra scheda, o col cruscotto non aperto,
  NESSUNO parlava — e il server non si accorgeva di niente: il registro
  `data/copilot-*.jsonl` della gara del 28/10 mostra giri, box e bandiera
  GIUSTI su dati PULITI (zero ripetizioni) e voce zero: la pipeline era
  sana, mancava solo l'altoparlante.
- **ORA**: `src/voce-copilota.mjs` (NUOVO) — relatore Windows con
  System.Speech di PowerShell: un processo PERSISTENTE che legge una riga
  alla volta da stdin e parla IN FILA (Speak bloccante sequenziale, niente
  frasi accavallate), rinasce da solo se muore, tace se la GUI è chiusa.
  Il Moro (`webui.mjs`) ha un tick ogni 4 s DOPPIO il battito del
  monitor: `copilotaServerTick()` costruisce il payload del suono
  `payloadIngegnere()` (estratto dal case 'ingegnere' — UN solo
  costruttore per pannello, monitor e voce) e parla le frasi NUOVE.
- **CHI PARLA**: l'UNICO narratore `narratore()` di tools/_monitor-copilota.mjs
  (già guidato dal test, già allineato 1:1 a viste-a.js). La voce server
  segue la STESSA fase del client (firma sessione = memoria a zero, 15 s
  di grazia sui dati bruciati dell'avvio, guardia 70 s anti-ripetizioni).
- **LOG**: `data/copilot-voce-24-10.jsonl` — quello del parlato veramente
  uscito dalla voce server, separato dal monitor.
- **NIENTE DOPPIA RADIO**: quando `/api/ingegnere` dice `voceServer:true`
  la pagina NON ripete i narratori in locale; il chip «🔊 copilota»
  comanda il Pitwall via POST `/api` (voce-server: on/off, persiste in
  evo.config.json `voceCopilota`, default ON). Spegnere il chip spegne
  entrambe le sorgenti; riaccenderlo riparte col server.
- **PER LE PROVE**: come chiesto da Mauro, usare sempre la modalità
  «gara veloce» — senza dover ripassare le prove.

## 29/10 SERA — LA VOCE: PAGINA PRINCIPALE E PITWALL RISERVA
- **FATTI DAL REGISTRO**: ieri il Pitwall aveva la mascella fissa («voce
  dai fattori») ma nel registro `copilot-voce-24-10.jsonl` la voce
  server NON ha MAI parlato in NESSUNA gara (nessuna riga SESSIONE VIVA mai
  scritta, tick appeso in pista), mentre la PAGINA ha parlato bene due
  giorni interi (le 3 frasi della gara del mattino: grazie 2, tempo giro
  2-3, a fine gara ai box).
- **DECISIONE**: la PAGINA torna radio PRINCIPALE: la soppressione
  `!voceServer` sui narratori in `gui/js/viste-a.js` è STATA TOLTA.
- **GUARDIA del Pitwall** (`copilotaServerTickInterno`): il tick della
  voce tace SOLO se la pagina GUI ha chiesto `/api/ingegnere` nei 15 s
  scorsi (poll ogni 2 s mientras la vista è aperta) — niente doppia radio
  e nessun buco quando la GUI si chiude: il Pitwall riprende subito con
  SRV voce vera (Cosimo). Spegnere il chip spegne TUTTO come prima.
- **VIGILANTE del tick voce**: un controllo ogni 5 s: se il tick non
  finisce per 15 s (`_voceTickAt` nel finally di `copilotaServerTick`) si
  RIPARTE da solo («TICK BLOCCATO — ripartito») e ogni 60 s una riga
  STATO (tick, snapshot game/live, età del poll pagina) nel registro.
- **VERIFICATO**: `node --test test/voce-copilota.test.mjs
  test/copilota-narratori.test.mjs test/ingegnere.test.mjs
  test/webui-smoke.test.mjs` — 31/31 pass.

## 29/10 POMERIGGIO (2ª CURA) — PING, NON POLL
- **GARA MUTA DELLE 11:36**: la 1ª cura era sbagliata in un punto: la guardia
  silenzia la voce server quando la pagina GUI «interroga /api/ingegnere»
  (poll ogni 2 s) — ma UNA SCHEDA VECCHIA (JS in cache con la vecchia
  soppressione) interroga, resta muta e intanto tiene muta ANCHE il server:
  radio zero per l'intera gara. Il tick del Pitwall era VIVO per tutta la
  gara (STATO ogni 60 s, tick 0,5–3,8 s, zero riparti): conferma che non
  era più lui il problema.
- **PROTOCOLLO PING**: la vista Ingegnere dichiara al server (ogni 10 s,
  POST /api/voce-pagina) chi tiene la radio: on=cp.on (chip acceso, parla
  la pagina) o on=false (chip spento, silenzio voluto → tace anche il
  server). Il tick guarda il PING (finestra 20 s), non il poll.
- **SCHEDA VECCHIA** = non pinga MAI → il server torna la radio lui
  (Cosimo). Nessun silenzio più possibile «per colpa del poll».
- **VERIFICA VIVA**: server ricaricato a porto (vecchio pid 18040 chiuso:
  girava ancora col codice di mezzogiorno), POST /api/voce-pagina →
  {"ok":true}, tick n1 → «la pagina GUI sta già parlando (ping)», STATO
  con paginaPingMs/paginaPingOn. Suite 31/31 prima del riavvio.

## 29/10 POMERIGGIO (3ª CURA) — RADIO UNICA = IL SERVER
- **COMMENTO**: gara TimeAttack muta ANCHE col protocollo ping (pagina col
  codice nuovo, chip ON, ping on:true ogni 10 s, giri tagliati, tick vivo
  tutto il tempo). La voce da browser (speechSynthesis) ha già taciuto in
  due gare anche così: cache, attese, voci, autoplay — non osservabile dal
  server e non ne vale la pena.
- **DECISIONE**: la RADIO è SOLO il Pitwall (System.Speech): Cosimo è
  MALE it-IT e È INSTALLATO (verificato live: Elsa Desktop F/it-IT,
  David M/en-US, Zira F/en-US, Cosimo M/it-IT). La PAGINA torna muta
  quando c'è la voce server (soppressione `!voceServer` ripristinata) e
  il PING ora serve SOLO a dichiarare il silenzio VOLUTO: chip OFF →
  on:false → il server tace; chip ON → il server parla, anche con la
  GUI chiusa.
- **REALIS** della voce server: ieri sera Mauro l'ha SENTITA («voce
  femminile dicendo gas» — era Elsa la fallback di System.Speech, perché
  la scelta maschile era andata male quella volta). System.Speech niente
  processi browser: il tick vivo in gara (STATO/STATO) è la sua salute.
- **NEXT TIME**: se anche il server tacesse in TimeAttack, il sospetto
  chicca è l'assenza di timing.lastLap/lapsTotal nei dati del TimeAttack:
  il monitor ora registra timing/delta/benzina live per dirlo al primo
  giro della prossima sessione.

## 29/10 PRANZO (4ª CURA) — REGISTRO ROTTO E VIGIA SORDO CIECO (indagine gara 12:06)
- **GARE MUTE 11:40 / 11:54 / 12:06**: ricostruite dal registro voce: il tick
  vedeva `live:true TimeAttack` e SILENZIO «la pagina GUI sta già parlando
  (poll/ping)» — quel server girava CODICE VECCHIO (la guardia poll è
  sparita con la radio unica). Dopo il riavvio 11:58 (pid 6660, codice
  nuovo) i tick durante le gare non registravano NULLA: né SESSIONE VIVA
  né frasi — indistinguibili da un tick morto.
- **BUG 1 — il registro: `giroVoce(..., LOGUE_VOCE)`**: il 4º argomento era
  l'oggetto `{file}` mentre la firma vuole `{log}` → default null → il
  registro dei narratori (SESSIONE VIVA, chi/it) non ha MAI ricevuto una
  riga. Chi e cosa ha parlato in una gara non si poteva ricostruire.
  Ora `giroVoce(..., { log: LOGUE_VOCE })`.
- **BUG 2 — vigiaSordo orfano=stale && game**: snapshot() con stale:true
  torna `{game:false, stale:true}` → la condizione vecchia (stale E game)
  non scattava MAI: lettore appeso a MMF morta resta per sempre e il tick
  stampava «gioco non è vivo» per tutta la gara. Ora `orfano = !!stale`,
  il guard banda  sotto (gameRunningMemo) umano che il riciclo avvenga solo
  col gioco davvero in esecuzione; e lo stale ha la SUA riga di registro
  («lettore stantio: la memoria condivisa non aggiorna da >20 s»).
- **LE 3 FRASI DELLE 01:21** confermate su carta: giro 2 (1:58.317), giro
  3 (1:54.246) e rientro box — la stessa traccia del TimeAttack di stamani.
- **VERIFICA**: suite intera 455/455 prima del ricarico; server rientrato
  coi rodevi (node tools/riavvia-webui.mjs 6660), porta viva su pid 17692,
  monitor di gara rismato (porta 8642, log in /tmp/monitor-voce.log).

## 29/10 PRANZO (5ª: VERIFICO VIVA) — GARA 12:23-12:30, LA RADIO FUNZIONA
- Gara TimeAttack reale col server del 4º codice: nel registro voce ora ci
  sono per la PRIMA volta SESSIONE VIVA del tick e le FRASI con chi/it:
  12:23:31 boxclose, 12:27:56 giro 2 (1:48.267), 12:29:52 giro 3 (1:56.724
  nuovo best) + benzina per 6.8 giri, 12:29:56 boxopen. Mauro conferma
  a orecchio le stesse phrase. Il pitwall (Cosimo) fa la intera radio.
- Voci collaudate: il motore una (tools/_voce-debug.ps1, 6 s col Add-Type
  freddo) e il trasporto pesante (tools/_prova-trasporto-log.mjs con
  impronte su %TEMP%\trasporto-letture.log) parlano ENTAMBI: la gargio è
  CHIUSA sulla vocalità.
- Diagnosi futuro: durante le gare di stamani il vecchio sillaretto
  (fino alle 11:58) silenzaiva con «la pagina GUI sta già parlando» — vecchia
  guardia poll rimossa dalla radio unica; non tornerà.

## 30/10 — POSITION RITROVATA: LA RADIO UNICA AVEVA PERSO IL SEDILE
- **SEGNALAZIONE**: «prima diceva anche la posizione ogni volta che perdevo
  e guadagnavo posizione, ora no». Indagata: in radio unica (3ª cura) la
  pagina tace di proposito e gli annunci di posizione erano rimasti SOLO
  in viste-a.js narratore 9 (chi 'postalk'): il narratore unico del server
  NON li aveva — ecco perché spariti dalla radio insieme alla pagina.
- **RIPARO**: narratore 9 replicato 1:1 in tools/_monitor-copilota.mjs
  (sezione 9, chi 'postalk' come la vista): cambia sedile → «P5, posizione
  persa/recuperata», la prima vista si SEMINA in silenzio, distanziello
  30 s per chiave (cpSay della vista), in solista (posizione sempre 1)
  mai un annuncio. giroVoce la manda in voce + registro: nessun'altra
  modifica server.
- **TEST**: test/copilota-narratori.test.mjs +1 caso (semina muto, P5→P6
  persa, P6→P3 recuperata oltre la finestra, restando non ripete, guardia
  30 s dentro la finestra zitta). Suite 12/12.
- **VERIFICA**: server rientrato coi rodevi (node tools/riavvia-webui.mjs
  17692), nuova porta viva su pid 22696, /api/agg-info 200. La posizione
  torna SOLO col server nuovo: pid 17692 avaita in memoria il narratore
  senza sezione 9.
- **DATI**: la catena era già sana: shmem.riga ~634 misurava currentPos
  da sempre, engineer.mjs:240 la portava in gauges.position, campi() la
  copiava nel registro — solo il narratore non la consumava.

## 30/10 sera — CONTO ALLA ROVESCIA: LE GARE A TEMPO HANNO ORA L'ORELINA
- **CARTA BIANCHE**: «mi assento, fai quello che vuoi» — completato il
  pezzo che restava in sospeso: nelle gare a TEMPO il tempo che resta è
  ANNUNCIATO a voce. Due tacche snelle che non disturbano i narratori
  di gara: **«1 minuto!»** a T-1:00 e **«10 secondi!»** a T-0:10
  (strascico gratuito il «Tempo scaduto!» quando il display scrive 0).
- **DOVE**: `_monitor-copilota.mjs` (radio unica del pitwall, sezione
  nuova dopo «ultimo giro»/«bandiera») e il gemello in `viste-a.js`
  (radio locale della GUI). Il campo di verità è `g.timeLeftStr`
  (stringa "m:ss" o "h:mm:ss" che il gioco scrive SOLO in gara a tempo,
  già filtrata in `shmem.mjs` come `timeLeft`: altrove esce null).
- **PERCHÉ NON Ogni TICK**: parsing pesante solo quando la stringa cambia
  di secondo; disarm dopo 3 s per blackout del display (li rivede quando
  torna); la tacca di 1 min scatta tra 59-61 s, quella di 10 s tra
  9-12 s — flapping tollerato. Reset a ogni sessione nova tramite
  `sessionId` dell'impronta del copilota.
- **TEST**: `copilota-narratori.test.mjs` +1 verifica (2 tacche, 1 min,
  disarm sotto blackout e fine gara) — 20/20 del modulo, 454/454 della
  suite completa. Server riavviato pulito col codice nuovo (PID 18236).

## 30/10 pomeriggio — GARA DI MONZA ZITTITA ALLA FINE: TAVOLO VUOTO, SLOT RESECO
- **SEGNALAZIONE**: gara del 13:52 conclusa, aggiornati solo giri (1:48.267,
  1:56.724 nuovo best) e box. MAI «Ultimo giro!», MAI «Bandiera!», MAI conto
  alla rovescia. Il registro copilot-8642 dice perché: per TUTTA la sessione
  lapsTotal=0, isLastLap=false, timeLeft=null — il gioco non ha scritto
  nessuna delle tre fonti che facevano parlare la fine; l'unica cosa certa
  scritta da EVO è il CAMBIO DI BANDIERA a scacchi al traguardo finale
  (flagCode 8), allora ignorato dal narratore.
- **CORREZIONE (8c, gemello in _monitor-copilota.mjs e viste-a.js)**: rete di
  sicurezza di fondo — in una gara senza totale (ltOk=false) la bandiera che
  diventa «a scacchi» con almeno un giro compiuto annuncia «Bandiera a
  scacchi!» UNA volta sola; entrare a sessione viva con la bandiera già in
  clima di scacchi si SEMINA in silenzio.
- **TITOLO PROBLEMA N.2 — gli stalli**: /api/ingegnere abortiva ogni ~60 s
  durante la gara e il catch dichiarava «SESSIONE FUORI» con m=null,
  azzerando said={} a ogni stallo (meta RIDETTA dopo 32 s, bilancio sbalzi
  ×138). Ora un fallimento di fetch SALTA il tick e basta (memoria resta);
  «SESSIONE FUORI» scatta SOLO con live=false risposto davvero dal server.
- **TEST**: 2 casi nuovi — la gara di Monza ripetuta frame per frame (bandiera
  1 volta sola al cambio flag) e il semino della bandiera già a scacchi al
  primo tick. 18/18 del modulo, 456/456 della suite completa. Server
  riavviato sul nuovo codice (PID 18128).

## 31/10 — BANDIERA DOPO IL GIRO (8d): la crocetta arriva alla MMF PRIMA del contatore
- **SEGNALAZIONE** (gara 14:24, mauro): «bandiera parlata PRIMA del "Giro 3
  fatto — nuovo best", 4 secondi dopo» — ordine sbagliato alla fine gara.
- **CAUSA**: EVO scrive il cambio bandiera a scacchi un istante PRIMA che il
  contatore giri salga; il narratore parlava ciò che vedeva per prima cosa.
- **RIPARO**: narratore unico (tools/_monitor-copilota.mjs) + gemello pagina
  (viste-a.js): se in tick il giro è GIÀ parlato, la bandiera esce subito
  dopo (ordine giusto nello stesso tick); altrimenti va in CODA
  (bandieraP) e parla al primo giro annunciato in tick successivo.
  Soccorso 10 s: se il giro non arriva mai (HUD muto), la bandiera esce
  comunque — non perde mai la fine gara. Test nuovo: copilota-narratori
  «LA BANDIERA DOPO IL GIRO (8d, gara delle 14:24)» — sequenza reale
  (crocetta al tick, contatore a +4 s) e ordine giroFatto < bandiera.
- Le chips di coda (benzina, meta ecc.) non toccate: solo i 3 punti bandiera
  usano bandParla(); le stringhe restano uguali, la guardia 70 s pure.

## 31/10 tardo — PROVA LA RADIO (Impostazioni): la voce vera si sente senza correre una gara
- Mauro aveva il bottone «🔊 Prova la voce» (27/10) che collaudava SOLO la
  voce del browser: quella che parla in gara è l'ALTRA (lo speaker Windows
  del Pitwall, Cosimo). Non c'era modo di sentirla senza lanciare una gara.
- Nuovo: bottone «📻 Prova la radio» accanto al selettore di livello →
  /api/voce-prova → la voce del Pitwall recita un briciolo di repertorio
  DEL LIVELLO SCELTO (essenziale/normale/full; off → 400 con il motivo).
  Stessa coda delle frasi reali, ordine rispettato. Server riavviato con
  il codice di oggi: anche la bandiera-dopo-il-giro (8d) è ORA in esercizio.
