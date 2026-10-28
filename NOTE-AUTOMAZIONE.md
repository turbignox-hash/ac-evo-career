## GRIGLIA SIM ALLARGATA: LA CLASSIFICA CORRE LARGA QUANTO IL GIOCO (30/10)

- **Mandato Mauro**: «Ampliare la griglia sim». Risotto col filo del
  realismo del 28/10: quella volta si era curato il CHI vince nella
  sim (forma stagionale a ampiezza adattiva); stavolta il problema era
  il QUANTI correvano.

- **La misura che decide** (una-tantum col save vero, contati i
  gridSize nei risultati incassati): le griglie reali di EVO sono quasi
  sempre PIÙ ampie della stima del ladder — Alfa 75 ladder 7 con griglie
  reali 17, Golf Mk8 ladder 14 con reali 17, R5 Turbo 12 con 16. Mai il
  contrario in modo sistematico: la stima è sghemba in basso.

- **Cosa rompeva la stima corta**: la classifica simulata
  (standingsFor), il duello di stagione (postRaceEffects) e il
  monte-carlo del sedile giravano su griglie di node.gridSize: una
  P10/17 vera finiva spremuta dentro un campo da 7, i punti dei rivali
  venivano sottostimati e il campionato simulato sembrava meno
  affollato di quello del gioco.

- **La cura** (grigliaSimEstesa in state.mjs, una funzione, tre
  call-sites): la sim gira larga quanto il MASSIMO gridSize mai
  registrato per la serie nei risultati del save. Il massimo è robusto
  a file corrotte corte (la 2 della RX-7, letta a metà scrittura: col
  minimo spariva l'ampliamento); senza risultati resta la stima
  (niente cambi su carriere vergini); il nodo si muta SOLO in copia — il
  ladder su disco e i template già raccolti non si toccano.

- **Conti**: 5 test nuovi (test/griglia-sim.test.mjs): stima invariata
  senza history, allargamento al massimo visto e ladder intatto,
  corrotta corta filtrata, classifica a 17 righe col campo largo,
  determinismo fra letture. Suite 383/383, lint a 0. Commit d36d31b
  (non spinto).

- **Completamento stessa sessione** (commit 264ae47): portati sul campo
  largo anche il paddock della CLI e il respiro di metà stagione della
  GUI — prima enumeravano i rivali sulla griglia corta del ladder e
  discordanano dalla classifica. Restano lontani DAL BENE: le card
  rivali (rivals.mjs) raccontano i dati veri incassati e non la sim;
  challengeFor delude perché il "chiudi davanti a X" guarda al
  rivale più forte, che il campo largo NON cambia (l'ampliamento
  aggiunge solo sedili deboli in fondo).

- **Verifica col campo LARGO (stessa sessione)**: rieseguita la
  misura di realismo con nodo forzato a gridSize 17 (banda 80-90):
  vittorie sedili 0-2 96,5% e titoli 47-11-2 a 17 vetture contro
  48-11-1 a 14 — l'ampiezza adattiva della forma del 28/10 copre
  anche le griglie larghe, il campionato resta una meritocrazia e
  l'ampliamento non cambia la dinamica del titolo.

- **Titoli per-round** (gazzetta.mjs): finora il titolo parlava solo della
  gara di oggi; aggiunto lo STORICO VERO (le gare già nel save prima di
  quella corrente, lette da state.results) e il titolo lo decide la storia,
  con priorità dal fatto più raro: GRANDE CHELEM · LA POLE BUTTATA (pole
  e zero punti) · BRUTTA SERIE (ritiri consecutivi: nel titolo il numero,
  «3 ritiri consecutivi») · RITORNO DAL BOX (vittoria subito dopo il
  ritiro) e RITORNO SUL PODIO · DUE/TRE/QUATTRO DI FILO (vittorie di fila:
  la parola giusta) · PRIMA VOLTA A X (vittoria su pista mai vinta,
  stagioni comprese) · IL PRIMO GRADINO (primo podio della stagione) ·
  PODIO A SERIE (podi consecutivi). DETERMINISTICI: stesso storico,
  stesso titolo — test dedicato con re-run.

- **La gazzetta di stagione** (seasonPress, medesimo modulo): il volume
  che rilega i titoli dell'anno in pagina unica — sommario in testa (gare,
  vittorie, podi, ritiri) e ogni masthead in ordine di round. LEGGE
  news.json e non tocca altro: è la rilettura, non una nuova scrittura.
  Via d'ingresso solo la GUI per ora: da CLI non c'è ancora il comando.

- **GUI**: quarta tile nel cruscotto «Gazzetta di stagione», accanto alla
  rassegna: modal con targhetta R{round} · {track} colorata per esito
  (oro P1, rosso ritiro), cambio stagione e copia del foglio. Endpoint
  `gazzetta-season` con la stessa guardia di `season-review`.

- **Insegnamento di officina**: il primo giro di test ha fatto CADERE
  TUTTI i casi con storico — colpevole un `i++` dove serviva `i--` nel
  contatore delle serie (prevStreak), che usciva dall'array a metà
  lettura: diagnosticato con log passo-passo, non dedotto.

- **Conti**: suite 378/378 (6 test nuovi: 4 per-round, 2 del volume di
  stagione), lint a 0 sui 4 file toccati. Commit 04b05cd (non ancora
  spinto). I titoli scritti PRIMA del commit restano con la formula
  vecchia: il volume rilegge comunque tutto, ma i titoli speciali escono
  solo sulle gare da oggi in poi.

## FLAKY SMONTATO: IL TEST DELLA GAZZETTA SCRIVEVA NEL FOGLIO VERO (28/10)

- **Come è riaperto**: un fallito una volta sola su 372 (verde al re-run)
  è un test flaky, non un caso: rilanciata la suite in loop 6 volte e
  emerso UN solo colpevole, «gazzetta: il foglio si riempie fino a
  80 voci» — l'unico test che copriva la gazzetta.

- **Causa vera**: gazzetta.mjs scriveva `data/news.json` FISSO del
  progetto invece di rispettare `EVO_DATA_DIR` (la regola di 35 altri
  luoghi della suite). Il test del foglio stampava 85 notices nel
  foglio VERO: se il launcher nel frattempo pubblica una notizia della
  tua carriera, il feed del test vede 81 voci o un kind sbagliato.

- **La cura**: NEWS_FILE segue process.env.EVO_DATA_DIR; della cura la
  prova sono 5 corrida consecutive verdi (372/372) e lint a 0.
  Commit a4fe251.


## REALISMO SIM SU TUTTE LE GRIGLIE: FORMA STAGIONALE A AMPIEZZA ADATTIVA (28/10)

- **La fila di Mauro**: «verifica realismo griglia simulata · caccia ai
  commenti mentitori · documenta il fix nei README». Verifica fatta a 60
  stagioni per serie con `node tools/_misure-realismo.mjs`, poi estesa a
  mano su tutte le griglie GRANDI (18-20 sedili: Touring Pro, Formula 2004,
  GT Elite, GT3 Endurance, Endurance Elite).

- **Il fermo immagine**: prima del fix il sedile 1 di Formula Elite vincava
  il 91% delle gare e portava 59 titoli su 60 — il campionato simulato era
  una formalità perché lo scatto di skill per sedile valeva più del rumore
  di gara, e si ripeteva identico ogni round.

- **Fix in world.mjs**: ogni pilota porta una FORMA stagionale fissa
  (hash serie+stagione+driver) e la sua ampiezza ADATTIVA scala con lo
  scatto di skill tra i primi due sedili (×1,6, min 0,02, cap 0,10) — così
  qualsiasi taglia di griglia lascia spazio ai colpi di scena senza
  regalare il titolo ai deboli.

- **Misura DOPO (60 stagioni x serie)**: Coppa GT4 (14 sedili) sedile 1
  61% vittorie / 41 titoli, sedile 2 147 vittorie / 17 titoli; Formula
  Elite (6) 63% / 44 titoli, sedile 2 184 vittorie / 22 titoli; GT Elite
  (20) 53% / 38 e 15 (titolo arrivato fino al sedile 4); Touring Pro (18)
  46% e titoli 30/24/6.
  Ogni grandezza di griglia sta nei confini realistici: nessun ritocco
  aggiuntivo necessario. Suite 372/372 (con il nuovo test di realismo che
  blocca le regressioni), lint a 0.

- **Caccia ai commenti mentitori**: triple bugie trovate e sistemate —
  world.mjs diceva «cap 0,07» col codice che usa 0,10; grid-calib.mjs
  (corrotto: "LESSONEDELLE gare", "immanito alla horizon", "limiti __cap",
  "cere onde consistenti"); l'«al cap 20%» della GUI resta l'unica versione
  vera. README IT/EN con il nuovo bullet "Classifiche simulate
  realistiche" / "Realistic simulated standings" (e la stessa misura
  catturata come riferimento per il futuro).

## LA SUITE HA ARRESTATO UNA BANDA RIBALTATA (28/10) — world.mjs, la classe dei simulati ora corre nel verso giusto

- **Mandato Mauro**: «fai quello che vuoi, autorizzato a modificare se
  opportuno per migliorare la suite» — seguendo il laccio della suite
  è finito nel posto giusto: la conferma col ladder VERO mostrava che il
  bug era NEL MODULO, non nel test.

- **Il fermo immagine**: `sedile 2 (pilota più forte del parco) → simSkill
  0.16, sedile 12 → 0.36`. La forza simulata era INVERTITA: i più deboli
  in cima griglia, i fenomeni in fondo. Il ladder vero dichiara `ai:
  [78, 88]` ASCENDENTE (lo, hi) ma `gridFor` leggeva `[hi, lo]` al
  contrario — col commento originale «rank 0 = hi» che diceva il resto,
  in contraddizione con il formato del ladder.

- **Fix alla radice in world.mjs**: `bandValue` normalizza lo/hi, seat 2
  = cima banda, l'ordine dei sedili segue la forza. `standingsFor` e
  `finishOrder` dei rivali ereditano. Test riportati al nuovo contratto
  con due capisaldi veri: carriera vergine = base −6 (quota media scende,
  quirk documentata) e DNF non scende SOTTO il mai-gareggiato (pavimento
  condiviso, asserzione `<=` invece di `<`). Suite COMPLETA 371/371.

## L'ARCHIVIO ONLINE HA LA SUA SUITE (2/11) — e i test battono un bug vero del «cognome vuoto»

- **Mandato Mauro**: «fai quello che vuoi, autorizzato a modificare se
  opportuno per migliorare la suite» — col tab online appena fatto, la prima
  firma mancante era la SUA VERIFICA: il modulo di catalog ora ha la suite
  unit sui dati FINTI in una tmpdir, zero I/O del gioco (la data arriva dal
  NOME del file, mai dal mtime, grafia identica ai veri file di EVO).

- **`test/archivio-online.test.mjs`, 9 domande** a `onlineArchive` e
  `resultDetail` (catalog.mjs): lo SP separato (guardia `_MP_`), data VERA
  dal nome del file, io-in-gara (flag del gioco quando parla solo per me,
  riconoscimento per nome quando la fila è «tutti te»), identità dal
  driver_id che sopravvive al cambiamento nickname (TOINE e Antoine Laisne
  = una persona sola), il nome normalizzato per chi NON ha id (case e spazi
  fuori gioco), le righe doppie dei server contate UNA volta, la Forma col
  posto MIO, e il testa a testa del dettaglio per NICKNAME alternativo
  (tu = beaten, lui = beats, i due conti NON confusi).

- **IL BUG VERO TROVATO**: in una gara col flag `is_current_driver` generico
  (nei file _MP_ EVO lo marca spesso su più piloti), un nickname SENZA
  cognome («TOINE» — cognome vuoto, come nel file reale di Bremskiller)
  matchava il PRIMO nome cercato: in `findPlayerDriver` (results.mjs) la
  clausola `wantedLast.startsWith(last)` con `last = ''` vale TRUE, quindi
  ogni riga con cognome vuoto attaccava qualunque ricerca — io veniva letto
  come il primo della griglia e sta te stesso finiva nel libro rivali.
  Fix alla radice in results.mjs: un pezzo vuoto NON prova niente, si passa
  oltre. Trovare un bug di produzione con una suite nuova è esattamente il
  senso di «migliorare la suite».

- **SECONDA SUITE STESSA FILA** — `test/identita-pilota.test.mjs`, 10 domande:
  l'identità del pilota NON aveva test unit diretti (tanto indiretto in
  archivio e import). Contratto di results.mjs: flag quando parla solo per
  te, «tutti te» risolto per nome, regresso del cognome vuoto, accenti/MAIUS-
  COLE, nome di una parola sola, righe AI escluse, driver null col pool, e
  DUE capisaldi che nessun test julie: `dedupeDriverDiRiga` (una riga per
  identità, tenuta la migliore, file pulito INTATTO per riferimento) e
  `officialPositionOf` (la penalità a tempo RICALCOLA la classifica: 15:04
  +8s perde contro il 15:10 del terzo, DSQ senza posizione). 300/300.

- **TERZA SUITE, ANCHE IL GUARDIANO** — `test/grid-guard.test.mjs`, 7 domande:
  il guardiano delle classi non aveva nemmeno un test. Contratto: `misureDaGara` (mediana
  best per modello, min 3 righe con zavorra, min 2 set DIFFERENTI — la gara di
  calibrazione non misura niente), `matchClasse` (più hit vince, <2 null),
  `statoConvalida` (silenzio su pista convalidata, parlante fuori — e la
  messaggistica dipende da cosa manca: nessuna convalida ≠ supplemento per-
  traccia da confermare), e `gridGuardProposal` end-to-end su file finto con
  il doc classes fornito via opts (mai toccato grid-classes.json reale): proposta
  col perché, gap dal centro mediano (2.4s mediana Cortina − Imp), silenzio
  totale su pista già convalidata, e file rotto/senza pista/senza classe → null
  senza ambiente. 307/307.

- **QUARTA FILA: LA VITA FUORI DALLA PISTA** — `test/life.test.mjs`, 11 domande
  su life.mjs (contratti, sponsor, sfide, sigilli, maestria, piano di carriera),
  nome-pilota.mjs e warnings.mjs. Il mondo di test ricrea il minimo che le
  firme leggono: parco di 30 piloti attivi per gridFor, il sistema punti per
  pointsSystems, state.driver per la fanfara della classifica. Cosa prova:
  `settleContract` paga SOLO a contratto completo (verdetto 'failed' e zero €
  altrimenti), la sfida persa TOGLIE rep e registra il flow per il dottore,
  i sigilli NON si riassegnano, trackMastery 0–3 in 4 gare, careerPlanner
  blocca per best-finish, rep o affitto. **SECONDO BUG VERO**: l'anti-rumore
  di `recordWarning`
  (warnings.mjs) comparaba la RIGA INTERA del JSON, che porta "at" al
  millisecondo: due voci identiche in ms diversi passavano comunque e il
  filtro non filtrava niente. Fix: si compara l'IDENTITÀ della voce
  (modulo|messaggio|extra, senza tempo). 318/318.

- **QUINTA FILA: LA STAMPA DEL PADDOCK** — `test/stampa.test.mjs`, 6 domande
  su review.mjs (la rassegna di fine stagione) e gazzetta.mjs (titoli e citazioni
  in bacheca), entrambi SENZA nessun test unit. Entrambi i moduli leggono/
  scrivono SOLO dentro EVO_DATA_DIR: la suita lo ridirige a tmpdir all'import
  (stesso schema di rivals.test) e i dati veri del progetto non vengono mai
  toccati. Cosa prova: i conti di stagione di `seasonReview` (vittorie, podi,
  pole, finanziari, punti, premi), il DUELLO dell'anno calcolato dal registro
  rivali (più scontri = Antoine Laisne 1-1), la gara sparata (gap <2s) nel testo,
  silenzio e NON crash senza registro rivali, `exportReview` che scrive
  data/journal/stagione-N.md e la rassegna successiva che lo RIPRENDE senza
  riusarlo. Sul fronte gazzetta: il grand chelem e il ritiro hanno titoli
  propri, il FEED sta in ordine di round, refare il round con gli stessi dati →
  STESSA pulsante (la gazzetta è dichiarata deterministica, ora è provato),
  chi mi taglia il traguardo ottiene la voce «conto in sospeso», e la rivista
  scarta le voci oltre la 80ª in ordine di arrivo. NESSUN BUG VERO qui — ma la
  suite dei costruttori di testi è quella che regge i toni del gioco: ora anche
  la stampa ha le sue garanzie. 324/324.

- **SESTA FILA: IL PONTE CON PADDOCK** — `test/paddock-bridge.test.mjs`, 11
  domande su src/paddock.mjs (344 righe), il modulo che legge i journal
  JSON dell'app Paddock dentro EVO: ZERO test unit prima di oggi. Il nido
  isolabile è PADDOCK_JOURNAL_DIR con journal finti in tmpdir e
  paddockCacheClear() a ogni cambio — i journal VERI del gioco non vengono mai
  toccati (e il primo giro lo ha provato su se stesso: un typo nel nido faceva
  leggere Suzuka dell'installazione reale). Cosa prova: `paddockWet`
  (pioggia/rain/scrosci in qualunque lingua-caso, sereno no),
  `cleanRaceBonusOf` (10% del premio arrotondato, ZERO con penalità o premio
  nullo), `paddockNextRace` (la home vince; senza home il calendario pesca la
  ronda con state:"next"; pioggia → tips d'assetto bagnato; partenza serale →
  tip di raffreddamento; niente journal → niente scheda), `carPaddockSpecsOf`
  (scheda completa del 962, null per il fantasma, matching SENZA accenti —
  nurburgring contro Nürburgring — e per slug), il journal PIÙ RECENTE per
  mtime che vince a ogni hash con il dato che resta stabile, `paddockStats`
  (solo curve valide, la curva a 1 punto non è una curva) e `paddockLedger`.
  **MIGLIORAMENTO VERO QUI**: `paddockRoot`, con PADDOCK_JOURNAL_DIR che
  punta a una cartella inesistente, cadeva SILENZIOSAMENTE sui journal veri
  del gioco: il chiamante avrebbe letto i dati reali senza accorgersene di un
  errore di configurazione. Fix: cartella mancante → null (niente paddock,
  meglio che dati sbagliati). 335/335.

- **SETTIMA FILA: IL METEO SENZA EVO** — `test/weather-preset.test.mjs`, 10
  domande su src/weather.mjs (202 righe), il modulo che legge e PATCHA IN-PLACE
  il preset meteo in gamemode.lastgamemode: ZERO test unit. I file fixture
  sono costruiti con lo STESSO codec del tool (encodeMsg/decodeMsg, schema
  protobuf condiviso) e ACE_GAME_SAVEDIR/lessi lgmFile espliciti tengono
  TUTTO in tmpdir: il LGM vero del gioco non viene toccato. Cosa prova: gli
  8 preset in ordine, `presetFor` (per key/label/numero/varianti heavy-intense
  e drizzle), `presetForLabel` — la lezione del 20/10 tradotta in test
  (ladder 3 "Light rain" ≠ preset EVO 3 "Coperto": si traduce PER NOME,
  ma il numero sta ZERRO), `currentWeatherPreset` (assente = sereno proto3,
  file missing/vuoto = null), `setWeatherPreset` (dry non tocca niente, il
  write vero crea il backup con il registro ORIGINALE dentro, campo 2 assente
  → INSERTS prima della timeline e 9 step intatti, BAD_WEATHER
  su preset inesistente), `setWeatherCustom` (27 float patchati su 9 step,
  clamp 1.8→1.0 e -0.3→0.0, SOLO il parametro dato patcha gli ALTRI restano,
  NO_VALUES/NO_FILE/dry). **TERZO BUG VERO IN DUE GIORNI**: `presetFor('light
  rain')` — il nome ESATTO del menu inglese di EVO — rispondeva preset 5
  (pioggia SECCA) invece di 4: le bande alt-match si controllavano in ordine
  6-5-4 e 'light rain'.includes('rain') beccava la banda 5 prima della 4. Fix:
  ordine 6-4-5 (drizzle PRIMA della secca). Chi imposta il meteo in EN
  otteneva il doppio bagnato senza saperlo. 344/344.

- **OTTAVA FILA: LA SCHEDA GARA** — `test/race-card.test.mjs`, 10 domande su
  src/race.mjs (459 righe), l'ULTIMO modulo grosso senza unit (6ª e 7ª fila
  avevano coperto tutto il resto). Doppio nido: `ACE_GAME_SAVEDIR` via
  _game-sandbox per i file di gioco, `EVO_DATA_DIR` per la carriera,
  `PADDOCK_JOURNAL_DIR` in tmpdir (le specs Paddock della scheda non devono
  guardare il disco vero). Cosa prova: la card della ronda 0 (pista
  tradotta, auto, giri, griglia reale −1), la riga Grid Type SOLO sulle
  multiclasse (lezione 27/10 della Berline Moderne: «CUSTOM lo fissi una
  volta sola, poi l'app lo riscrive»), la DISTANZA 25% che scala giri/
  durate/premio col minimo 5', il piano orario REALISTICO P−6h/Q−3h/W−1h
  (lezione 31/10: niente più sessioni impastate sull'ora di gara) con le due
  eccezioni guardiane — ronda di NOTTE chi durerebbe col discard senza
  salire di giorno, override raceStart che vince, la banda STRETTA di
  difficoltà 1 punto ± override cursori, l'auto FUORI PARCO gridata prima
  che partisca (l'import le da 0 punti ma la scheda la svela SUBITO),
  l'outlook con obiettivo pista/punti stagione, chargeEntry UNA VOLTA per
  ronda (ricevuta in `paidEntries`, ronda nuova si ripaga, soldi corti →
  throw che NOMINA prezzo e saldo), markPending per il flusso di gara, e i
  layout REALI di EVO: Paul Ricard «Layout 1C-V2», Oulton «International»,
  Nürburgring «Gp Strecke», default GP ovunque la tabella non dice.
  355/355.

## TAB ONLINE (2/11) — l'archivio multiplayer esce dall'Archivio, guida community nei README

- **Richiesta**: «riprendi» dopo la tomba del pannello MP in fondo ad Archivio
  (nessuno lo guardava sepolto lì): tab proprio **Online**, guida per la
  community nei due README.
- **GUI**: `drawArchive` (viste-b.js) torna SOLO SP — un bottone piccolo
  «🌐 Le gare multiplayer sono nel loro tab» ci manda (`vai('online')`, non
  `renderTab` che non esiste). `drawOnline` (stesso file) tiene riga per riga
  le sessioni _MP_ CLICCABILI (stessa `openResult`: tempi, gap, penalità), il
  LIBRO DEI RIVALI ONLINE piegato col tooltip communities, e il toggle scope
  __arcAllPc condiviso. In core.js il tab, l'icona 🌐, il colore
  `online:'#5eead4'`, il gruppo Studio e l'aiuto nav erano già a posto.
- **README EN/IT**: riga del tab nella tabella Schermate (il conteggio 19 era
  già promesso dal titolo, la riga mancava) + sezione «Gare online
  (community)»: nessun punto/soldo (salvaguardia nel watcher e nell'import),
  riga = sessione intera col click sulla griglia completa, libro rivali con
  identity dal driver_id (nome a ripiego, solo griglie con ENTRAMBI), scope
  per PC col toggle, e la garanzia privacy per chi la propone alla community:
  tutto locale, zero connessioni in ingresso, legge solo i JSON del gioco.
- **Lezione**: i pannelli sepolti in fondo alle viste lunghe non esistono per
  l'utente — un tab costa una riga in TABS e salta fuori; e la documentazione
  di una feature va scritta  DUE volte (EN/IT) per la community.

## PACCHETTO AMICO VERDE (2/11) — classe bootstrap + smoke sul vergine: 281/281 NELL'ESTRAZIONE

- **Sintomo**: `npm test` dentro lo zip estratto (prova del pacchetto amico,
  checklist fase 3 di PUBLICA-CHECKLIST) cadeva su 3 test: (a) `webui-smoke`
  4-bis — garage `stinti`/`gomme` rispondevano 400; (b)(c) `gridclasses` —
  `campionato_aperto` / `campionato_sport_moderno` / i cinque `campionato_*`
  stile «classe presente» fallita.
- **Due mancanze di consegna, non bug**:
  1. `/api/garage` è azione needsCareer: nell'installazione SENZA salvataggio
     (l'amico al primo avvio) il server risponde 400 col messaggio gentile —
     comportamento GIUSTO che il test non copriva: la sezione 4-bis non aveva
     la stessa guardia `hasCareer` di status/card. FIX nel test: i check di
     garage girano solo `if (boot.j.hasCareer)` (test) — il server non si tocca.
  2. `data/grid-classes.json` è per PC (non tracciato): nell'estrazione le sette
     classi NUOVE (aperto, sport_moderno, 5 stili generati il 28/10) non
     esistevano né nel dato né nella fixture del 24/10. FIX a due mani:
     (i) la fixture `test/fixtures/grid-classes-sample.json` riceve le SETTE
     classi nuove coi loro `LIMITI_GIOCO` (base restata il contratto dei test
     di calibrazione — importare TUTTO il parco attuale rompeva `confidenza`
     e `regole fonte paddock`);
     (ii) BOOTSTRAP in `loadClasses()` (gridbuilder.mjs): se il file delle
     classi manca, al primo accesso la fixture copia in `data/grid-classes.json`
     — l'amico inizia con lo stesso parco classi e da lì la calibrazione del
     SUO PC scrive il SUO file. Verificato: dopo lo smoke, nella cartella
     estratta nasce `data/grid-classes.json`.
- **Esito**: 281/281 sia nel vergine estratto sia sul PC di Mauro. Lo stato per
  PC resta fuori dal repo: viaggio solo la fixture (tracciata) e il bootstrap.

## NOTA DOCUMENTAZIONE PUBBLICA (31/10, richiesta Mauro: «aggiungi una nota per scriverla sulla pagina principale di github e sulla pagina della presentazione»)

- **Dove**: README.md (EN), README.it.md (IT) e IDEA-POST-PRESENTAZIONE.md.
- **Sul GitHub pagina principale**: nuovo PRIMO punto in «Novità delle build recenti»/
  «What's new in the recent builds» — «Campionati interamente procedurali, col bilancio
  procedurale quanto il pescaggio»: cinque livelli (Epoca → Corsa) da un estrattore con
  seme riproducibile (`tools/_genera-stili.mjs`), pesca a sorte dal catalogo auto dentro
  la banda PI — serie mono marca, multiclasse, epoche e GT tirati liberamente insieme
  («quello che pesca sarà completamente random»); `--seed N` riproduce identico lo stesso
  tiro. Bilancio procedurale: zavorre e penalità dal ΔPI (pendenza calibrata sui dati
  veri, cap 20% dichiarato per le fuori formula — la prima gara decide), ricalibri per
  pista appresi da griglia-calib sui risultati di gara veri; e la sezione GUI con seed,
  pool e calendario cliccabili visibile anche prima di firmare il sedile.
- **Sella della presentazione (IDEA-POST-PRESENTAZIONE.md, «Punti di forza da citare nel
  post»)**: bullet in testa, bilingue come la casa. Testo it + coda EN, formula ispirata
  alla tesi di Mauro — mono marca, multiclasse e multiclasse con zavorre e penalità
  automatiche intelligenti procedurali — con l'esempio del seme 819802402 e il pannello
  GUI «Campionati a miscuglio» a pillola (seed, pool, quadro zavorre col tag cap, calendario).
- **Verifica**: lettura programmatica dei tre file — le parole chiave (procedural, seed,
  zavorre/penalità, pescaggio/miscuglio) presenti ovunque. Solo documenti: zero test.

## CINQUE CAMPIONATI PER STILE (28/10) — epoca, moderno, strada, pista, corsa, generati in maniera procedurale

- **Richiesta Mauro**: «campionati style epoca, moderno, strada, corsa, pista», poi la chiave del
  metodo: «creiamo campionati in maniera procedurale, includi anche questi». Quindi non a mano:
  **`tools/_genera-stili.mjs`** genera classe + nodo ladder dal catalogo del server dedicato
  (cars.json) con la stessa formula di grid-tune --propose: base PI minimo del pool, 100kg fisse,
  ΔPI×25 (pendenza 19/10), arrotondare a .5, cap 20%. Rifiuta sovrascritture, piste/id fuori
  ladder, e **--dry** stampa il piano prima di scrivere (backup automatico .bak-stile-*).
- **La traduzione preset→modello** (cars.json parla di preset, il ladder di id ks_) è la mappa
  `PRESET_MAP` a cima del generatore, verificata a mano: è l'unico dato non derivabile in
  automatico. Un pooled id senza mappa ferma la generazione con errore, niente pool muti.
- **I cinque nati**: campionato_epoca (L2, base 240Z Standard, 10 modelli), campionato_moderno
  (L3, base i30 N Performance), campionato_strada (L4, base RS3), campionato_pista (L5, base
  718 GT4 RS, con GT3 RS al cap come l'Escort), campionato_corsa (L6 GT3, base Mustang GT3,
  296 al cap). Calendari 4 rondre con SOLO piste del ladder; gate rep allineati al livello
  (90/150/450/800/1200); niente aiStandard: banda AI dal nodo ladder.
- **Difesa**: nuovo test parametrico in gridclasses.test.mjs per i cinque (poolAuto = nodo.cars,
  base 0/0, regole entro LIMITI_GIOCO, restrictor a passi 0.5%, nota sulle 0/0 non-base,
  preset non duplicati, calendario solo piste ladder). Suite 281/281.

## CINQUE MISCUGLI IN GUI (31/10, richiesta Mauro: «Porta i cinque stili in GUI»)

- Finora il tab Campionati mostrava SOLE le serie con sedile firmato: il pescaggio
  dei cinque restava invisibile finché non ti iscrivevi. Ora la GUI ha la sezione
  dedicata anche PRIMA dell'iscrizione: schede cliccabili (stile Football Manager)
  con seed, finestra PI, pool sorteggiato, regole zavorre (tag dei casi al cap 20%)
  e calendario delle quattro piste. I nomi auto/pista aprono le schede dei libri.
- Fatti: endpoint `/api/stili` (webui.mjs → stile-webui.mjs, fonte dati UNICA =
  loadClasses(), la STESSA che legge gridbuilder: in GUI vedi esattamente ciò che
  gira); pannello `stilePannello()` in gui/js/viste-b.js dentro drawChampionships
  (visibile anche nell'empty-state «nessun campionato iscritto»). conferma live:
  5 serie, seed 819802402, rep 628 apre Epoca/Moderno/Strada e lascia chiusi
  Pista/Corsa (richiedono 800/1200);

## CINQUE CAMPIONATI: PESCAGGIO COMPLETAMENTE RANDOM (28/10 sera, richiesta Mauro: «a questi devi mischiare tutto, anche le mono e multiclasse stesso livello, un miscuglio quello che pesca sarà completamente random»)

- **Da stile a sorte**: i cinque (epoca/moderno/strada/pista/corsa) non sono più pool per tema. Il generatore tools/_genera-stili.mjs ora: (1) costruisce la tabella preset→modello SOLA dal cars.json del server dedicato raggruppando i display_name e riscontrandoli nei contentNames del ladder (finito il PRESET_MAP scritto a mano); (2) per ogni livello sorteggia la banda PI ancorata a un modello a sorte (mai nei deserti del catalogo tipo tra Cup e GT3) e pesca a sorte TUTTI i modelli di quella banda — stradali, Cup, GT2/GT3, campioni d'epoca insieme, mono e multiclasse senza preferenza di categoria.
- **Maniglia GIOCABILE**: la banda sorteggiata è larga ~1.3 PI (BANDA_PI), estendibile a gradini fino a span 2.2 se pescati meno di 4 modelli. Oltre il cap 20% la zavorra non recupera più il divario (lezione R5/Escort): una banda da 5 PI scriverebbe mezza griglia al cap con gare decise dal campionato e non dal pilota.
- **Seme**: il pescaggio è seminabile — il tiro RISCRITTO ora è seed=819802402, il comando «node tools/_genera-stili.mjs --rigenera --seed 819802402» lo riproduce identico; senza --seed a ogni tiro un miscuglio NUOVO. `--rigenera` sostituisce SOLO le classi possedute dal generatore — mai le classi a mano (campionato_aperto, sport_moderno, hyper_road…).
- **Base nei test**: il test gridclasses «campionati stile» identificava la base col display_name — nel miscuglio i modelli multi-preset (AE86, Supra, GT4 RS) condividono il nome con PI diverse e la prima regola by-name poteva essere al cap. La base ora è la regola 0/0 SENZA nota (le varianti alla stessa PI portano sempre nota): asserzione robusta e rimane verde.
- **Che è uscito con seed 819802402** (miscuglio effettivo, esempi): Epoca L2 = R5 base + Escort Cosworth + GR86 + MX-5 NA + Countach + i30 N + AE86 (banda 8.49–9.79, span 1.08); Moderno L3 = 205 T16 base + MX-5 ND Cup + Abarth 695 + Junior + 288 GTO + Supra MKIV (la Supra porterà preset oltre la finestra al cap: prima gara decide); Strada L4 = M8 CsL base + A110 S + 718 GT4 RS + GTAm + ZL1 + M8+RS3; Pista L5 = GT4 RS base + GTAm + Emira; Corsa L6 = M4 GT3 base + 296 GT3 (la cima del catalogo è stretta: solo 2 modelli)
- La suite completa resta verde (281/281) e il seme PISTA resta in grid-classes.json: a ogni gara la griglia-calib ramo-C stabilisce la verità, ramo C-bis esclude le prove provate.

## LINGUA PER RICHIESTA (28/10) — il perché del mutismo EN dei box tips, trovato e risolto

- **Il sintomo**: GUI inglese, ma le CARD dei consigli box uscivano ITALIANE pure a pagina
  inglese — e in modo casuale: l'agenda alternativa funzionava, la card del box no.
- **Le due radici, entrambe tolte**:
  ① il browser ora DICHIARA la lingua in ogni richiesta POST (campo `lingua`, aggiunto in
  gui/js/core.js) e il dispatcher la applica DENTRO la coda serializzata — NON più in
  readBody, che gira a monte e veniva sovrascritta dai polling intermedi prima che la
  task in fila girasse davvero;
  ② `appEnv()` (webui-env.mjs) chiamava `setLang(cfg.lang)` a OGNI chiamata: la vista card
  lo invoca a metà assemblaggio dei tips (via `resolvePaths(appEnv())`) e così riportava
  la lingua al config ('it') DENTRO la richiesta già dichiarata inglese. Ora `appEnv()`
  NON tocca più la lingua: la impostano solo l'avvio del processo, `/api/lang` e il
  dispatcher per richiesta (che usa la nuova `configLang()`, lettura senza effetti).
- **Verificato sul server vero**: `/api/card` con `lingua:'en'` → tips «No stop», ripristino
  a `lingua:'it'` → «Niente sosta»: zero mescolanze. Suite 230/230 + regressione
  test/lingua-server.test.mjs 2/2. Probe temporanei (`MOD_TAG`, `__debug*`) tutti rimossi.

## GARA IN 2 + RESET 88–89 (27/10) — perché siamo partiti in 2, e il trim comandato da Mauro

- **«Partiti in 2»: non un bug del merge — la pista ha letto la griglia VECCHIA**. Il customgrid
  sul disco di gioco è ancora quello di prima delle 23:04 del 26/10: **1 sola cella E30**
  (l'ultimo Prepara tutto era stato fatto quando il template di fabbrica aveva solo E30). Il
  merge odierno ha allargato il template del progetto, ma `last_grid.customgrid` in GameModes
  si riscrive SOLO a un nuovo «Prepara tutto». Rimedio: EVO CHIUSO → Prepara tutto → parte la
  multiclasse (27 celle, E30+Mercedes+Alfa). Controllo rapido della griglia a disco:
  `node tools/_stato-griglia.mjs`.
- **DIFFICOLTÀ: due giri di reset nello stesso pomeriggio del 27/10**. Era 94–95 su TUTTE le 79
  serie (resto dell'era «tutti a 94»): il default del webui valeva solo per le serie mai
  impostate — e tutte erano già impostate, quindi non si vedeva mai.
  ① richiesta «tutti 88–89»: reset di massa a 88–89 (backup `.bak-88-26-10-27`),
  ② «per qualcuno potrebbe già essere difficile»: secondo reset a **84–85** (backup
  `.bak-84-26-10-27`). Webui ogni volta fermata, modificata e ripartita (HTTP 200).
  Default anche nel CODICE portato a 84–85 (webui: serie mai impostate).
  I trim adattivi esistenti restano (roadster_classic −5, coppa_mazda-rx7-fd +1): il trim
  segue le scelte di Mauro. La banda arriva al gioco SOLO con un nuovo «Prepara tutto»
  (setWeekendAi scrive i campi 30/31 del gamemode).
- **TRIM a passo ±3 (richiesta Mauro 27/10): «aggiungi al trim fino a +3 −3, 1,2,3»**.
  Fatto: • server `difficulty-nudge` clamp da ±5 a **±3**; • pagina Difficoltà (viste-d):
  per OGNI riga serie nuovi bottoni −3 −2 −1 / +1 +2 +3 (chiamano `difficulty-action
  op:trim` col trim corrente ± passo; gli spostano la banda di 1 punto slider per punto di
  trim, come già sembrava voluto); • le righe evento_* NON hanno i bottoni (banda fissa
  88–93). Suite 230/230 dopo le modifiche.
- **Nota Coppa GT86**: nelle note di codice resta la vecchia scelta «GT86 a 99–100»,ma il save l'aveva già a 94–95: ora è tornata a 88–89 come tutte; se la vuole alta di nuovo la
  segna dal pannello Difficoltà.

## GARAGE + DTM + PADDOCK (26/10 tarda sera) — tre verità rinforzate

> Aggiornamento 27/10: le celle Alfa 75 ESISTEVANO nel backup del progetto
> del 25/10 su L: (data-progetto/grid-templates/dtm_legends ×6 +
> coppa_alfa-romeo-75-turbo-evo ×14 + grezze) — perse nell'installazione
> pulita di Mauro. Il merge _merge-dtm le ripescano: il pool DTM ora è il
> COMPLETE E30+Mercedes+Alfa (27 celle, 22 byte-uniche). Niente rituale da
> fare per la 75.

- **GARAGE, il limite del 22/10 fa di nuovo scena**: «Prepara tutto» delle 23:44 ha scritto la Mercedes
  SU DISCO (il match a token funziona: `findCar('Mercedes 190E Evo II')` → Mercedes-Benz 190E 2.5-16
  Evo II) ma EVO era GIÀ APERTO (avviato 23:39) e il selettore non rilegge il garage rientrando:
  usa la copia in memoria caricata all'avvio. Come si vede adesso il disco dice Mercedes e il
  menu mostra RX-7. RIMEDIO UNICO: chiudere EVO COMPLETAMENTE e riaprire — il garage nasce
  già sulle celle del disco (conferma del 22/10 con la 75). Il toast «auto non ancora nel dizionario» resta neutro e giusto.
- **DTM «0 avversari»: doppia radice trovata e dirette entrambe** (serie dtm_legends, E30+Mercedes+Alfa75):

  ① il rebuild del builder legge SOLO il template di fabbrica `dtm_legends.customgrid`, che ha

  sole celle E30 — le celle Mercedes ESISTEVANO nei .bak-apply/-griglia/-bal di Saved Games
  (mercedes×2, e30×3, il 21-27 e il 22-39) e NON venivano usate; ② le celle Alfa 75 Turbo Evo
  NON erano in nessuna fonte DELL'INSTALLAZIONE PULITA (scansione con il nuovo
  `tools/scan-celle.mjs`), ma c'erano nel backup del progetto su L: (vedi aggiornamento sopra).
  FIX: `tools/_merge-dtm.mjs` (schema _merge-r5, idempotente) raccoglie le celle MERCEDES
  byte-uniche da tutto il disco e le ALFA dal backup L:, e le appende al template di
  fabbrica + copia in magazzino (backup `.bak-merge-…`). Al collaudo: pool 27 celle,
  22 byte-uniche, match completo Alfa×12 · E30×5 · Mercedes×10 — mancanti: NESSUNA.
- **DIZIONARIO garage NON è auto-mappabile**: l'archivio data/car-guids.json (468 coppie) NON si
  aggancia ai nomi senza il GUID-manifest per-auto. Verificato sul vivo: outer hash
  = FNV-1a-64("<carId>_<GUID-manifest>") con GUID DIVERSO per auto (l'Abarth conferma l'algoritmo;
  la Mercedes col GUID dell'Abarth NON batte 57d66c117761b44d) e il GUID NON è derivabile da
  carHash+guid2 (provate 4 forme). Cioè: il dizionario si allarga SOLO campionando (cambio auto
  in garage col sampler O la fine-gara `learnCar` — la via silenziosa già in piedi). La `E30`
  la mappa learnCar alla sua prima gara come pilota.
- **PADDOCK dal vivo: funziona**. Il ponte a sola lettura (src/paddock.mjs) legge i journal dell'app
  in gioco (pd-home/calendar/catalog/…) per mtime: con EVO aperto la sera il main/telemetry si
  riscrivono al minuto e il server vede TUTTO (home/calendar “Abarth Challenge” 6 ronde ·
  catalog 71 auto · ledger/teams/history ok). Prova ripetibile: `node tools/_prova-paddock.mjs`.
- Strumenti nuovi: `tools/scan-celle.mjs <ids…>` (dove stanno le celle di un'auto),
  `tools/_merge-dtm.mjs` (merge celle nel template fabbrica), `tools/_prova-paddock.mjs` (prova
  del ponte). Suite 230/230.

## MATCH GRADUALE + SNIFFER (27/10, dal Gufo Paddock, studio dalla stash@{0})

- `src/car-match.mjs` (nuovo): la catena ESATTA → CONTIENE → TUTTE LE PAROLE →
  ALIAS del `findModel` di Paddock, in versione libreria. Il builder della
  griglia (`src/gridbuilder.mjs`, branch wantCars) non filtra più con il set
  esatto: chiama `matchPool(wantCars, cells, labelsOf, aliases)`. Un nome
  RIVENDICA TUTTE le celle che matcha (primo tentativo ne prendeva una:
  il template monomarca con 6 varianti della stessa auto restava 1 cella e
  l'anti-crash spezzava la build — visto nei test del magazzino). I nomi
  mancanti finiscono in `data/match-auto.log` EARRORE coi NOMI VERI che il
  template ha sul disco: la fonte dati si sistema in un colpo.
- SNIFFER: `tools/sniffer-campi.mjs` — fotografia dei campi veri che EVO
  scrive in GameModeType_RACE_WEEKEND.gamemodesave (per sessione: nome, n
  avversari, dove sta il flag single-make e il LABIRINTO campo:wire) + celle
  del customgrid. `--diff` riporta SOLO le differenze di forma con la foto
  precedente; `--watch` segue il mtime. Su disco in `data/sniffer-campi/`
  (jsonl giornaliero + `ultimo.json`). SUL VERO SAVE del 27/10: flag nella
  cella 12 di OGNI blocco sessione (Practice/Qualifying/Warmup/Race), 14
  avversari, customgrid di guerra 1 cella.
- SINGLE MAKE (ripensamento del 27/10): il flagDiagnostic `singleMakeOf` in
  `tools/weekend-laps.mjs` resta (posizione-referente: primo varint 0/1 dopo
  la lista avversari), ma l'AZIONE delega al canonico
  `setWeekendGridMode('automatic'|'custom')` di tools/set-track.mjs — niente
  due scrittori che discostano. CLI: `node tools/weekend-laps.mjs
  --singlemake on|off` (on = riporta AUTOMATIC / off = CUSTOM con N=13).

## GATE DEL CONTEGGIO: il PRIMO blocco gamemode non è la verità (27/10, DTM Legends «griglia a 2»)

- SINTOMO (27/10, segnalazione Mauro): «Prepara tutto» → in griglia restano 2 vetture (1 cella). Causa:
  `weekendCarCount` leggeva SOLO il primo blocco 3 del gamemodesave — il blocco Practice, che portava il
  RESIDUO della ronda rotta (3.10=1, 3.7=1) mentre i blocchi Quali/Gara conservavano la dichiarazione VERA
  (3.7=15 → 16 celle). Il gate di `rebuildGridApply` restringeva la gridSize della scala al residuo (16 → 1).
- FIX (due pezzi):
  1. `tools/set-track.mjs · weekendCarCount`: scansiona TUTTI i blocchi 3 — cars = max voci 3.10,
     declared = max dei 3.7 presentisul PC di Mauro ora letta { cars:1, declared:15 }.
  2. `src/grid-apply.mjs · rebuildGridApply`: nel regime CUSTOM (tutte le serie dal 26/10) il bersaglio è
     declared + 1 (sei tu una cella) con minimo sopra le voci 3.10 native, e l'allineamento è SOLO
     SOPRA (mai restringere: la lezione 24/10 è «scrivere MENO celle di quante il gioco aspetta = crash»);
     in AUTOMATIC resta l'allineamento ESATTO alla 24/10.
- RISULTATO VERIFICATO A DISCO (27/10 ~1:30): cartuccia 16 celle (Turismo Legends, BMW M3 E30), selettore
  custom/15 riscritto (backup bak-gridmode-2026-10-26T23-31), dry-run: nessun allineamento (align null).
  Suite griglia 30/30 verde. Il server webui va RIAVVIATO per caricare il codice nuovo prima del prossimo «Prepara tutto».

## GRID TYPE SCRITTO DA FUORI (26/10 NOTTE, VERDETTO FINALE: CUSTOM PER TUTTE)

- VERDETTO FINALE (26/10 notte, Coppa 75 al Suzuka, confermato IN GIOCO):
  il modo CUSTOM lo portano COME ORA tutte le serie — monomarca compresa.
  L'elezione mono=automatic dell'ora prima è STATA RITIRATA: la cartuccia
  sul disco resta la sorgente della griglia  (il selettore nasce CUSTOM con
  la forma scritta da fuori) e questa strada serve ugualmente bene per
  mono e multi. Il parcheggio della cartuccia (monoGridAuto) è FUORI dal codice;
  il file con suffisso .ritirata resta in data/parcheggio-monomarca/ come
  memoria, ma la cartuccia buona da 14 celle è TORNATA al suo posto in
  GameModes/last_grid.customgrid (e in data/grid-templates/, che per la
  fabbrica è la sorgente primaria).
- PROVA VIVA DEL SELETTORE-ESTERNO (26/10 notte, 4 movimenti del Mauro):
  i TASTI SINTETICI (SendKeys e SendInput, AppActivate per PID) NON ARRIVANO
  a EVO — la prova si è chiusa per il contorno umano; MA la scrittura della
  forma canonica da fuori (setWeekendGridCustom) è STATA ADOTTATA dal menu
  anche a EVO APERTO: scritto custom/13 → rientrata nel weekend → selettore
  nato CUSTOM  (verificato a schermo dal Mauro). Attenzione: durante i toggle EVO
  riscrive il weekend SENZA righe-pilota (6209 B, ~1500 B per sessione)
  e il conteggio nativo si legge come 0 finché il weekend non viene
  risacca dal menu: in quell'ora la fabbrica cascava sulla stima del
  ladder (7 celle) — per questo la forma giusta da 14 celle è memorizzata
  nel template in magazzino, e la copia .ritirata resta come riferimento.

## STORICO (25/10 sera + 26/10 sera: forma canonica 6 RIMASTO + 7 aggiunto; Prepara: custom SOLO per le multiclasse — SOBITUITO dal verdetto sopra)

- LEZIONE DEFINITIVA 26/10 sera (toggle VIVO fotografato a menu aperto:
  `tools/_toggle-watch.mjs` su TUTTA la cartella ACE, esito in
  `data/samples/gridtype2/` — tre file toccati: gamemode.lastgamemode,
  GameModeType_RACE_WEEKEND.gamemodesave, last_grid.customgrid):
  la mappa dell'oneof scritta qui sotto era SBAGLIATA — veniva dai MIEI
  write a freddo, che STRAPPANO il campo 6 per metterci il 7, e il gioco
  al riavvio scarta quella forma e nasce AUTOMATIC (riproducibile:
  scritto custom/11 a EVO spento, menu su AUTOMATIC con disco rimasto
  custom/11). Il diff pulito del toggle dell'uomo (auto 19:35:57 →
  custom 19:39:53, file 6317 → 15515 B, differenza nei campi bassi =
  SOLO «7 = 14»):
  → AUTOMATIC: campo 3.6 (w0) = 1, e il campo 7 è ASSENTE;
  → CUSTOM:  campo 3.6 (w0) = 1 resta IN PIEDI, e il 3.7 (w0) = N si
    aggiunge SUBITO DOPO (N = Number of Opponents: 14 live, alto 11 e 7
    osservati prima sugli slider). CONFERMATO A RIAVVIO: riapre EVO e il
    menu nasce CUSTOM senza toccare niente — la forma sul disco è
    adottata, ma solo se il 6 ce l'ha (quello che scrive il menu).
  Gli altri blocchi sessione portano sempre campo 7 = 1 in entrambe le
  modalità; le file-piloti (campi 11) NON cambiano col toggle.
- IMPLEMENTO NUOVO: `setWeekendGridMode(mode, count)` (writer canonico:
  'custom' tiene il 6 = 1 e aggiorna/aggiunge il 7 = N; 'automatic' tiene
  6 = 1 e TOGLIE il 7) in `tools/set-track.mjs`, con wrapper
  `setWeekendGridCustom` (multiclasse) e `setWeekendGridAuto`
  (monomarca). Il Prepara tutto ELEGGE il modo: serie MONOMARCA
  (tipoGriglia → 'monomarca', richiesta Mauro 26/10 sera: auto tutte
  alla pari, zavorre e penalità non servono) → AUTOMATIC (se una gara
  multiclasse prima ha lasciato il custom, il modo torna quello di
  fabbrica, e il conteggio fisso di carriera lo porta EVO da sé —
  weekendCarCount/rebuild allineano); serie MULTICLASSE → CUSTOM
  sbloccato con N = celle-1 (l'utente è una cella). Idempotente, backup
  `bak-gridmode-*`.
- VERIFICA LIVE: scritta la forma canonica a EVO chiudo/aperto col flusso
  Prepara e riletta indietro custom/N; il test di persistenza È il
  riavvio di EVO dopo il toggle in menu (menu nato CUSTOM: fatto 26/10
  ore 19:4x). OGNUNO di questi pacchetti dist/ va rigenerato prima di
  dare il pacchetto all'amico.

- STORIA (mappa oneof SOSTITUITA da quella corretta sopra, mantenuta per
  continuità): gli snapshot 19:09–19:25 alternati 6-solo/7-solo venivano
  dai write a freddo di Buffy (6 rimpiazzato dal 7), non dal menu:
  erano stelle generate fuori dal gioco, e il gioco le scartava — come
  visible dal «riaperto sta su automatic» di ore 19:3x.

- ULTIMO RIMASTO: la sezione qui sotto diceva «il flag non si scrive da
  fuori QUI» — sbagliato, doveva solo essere TROVATO. La mappa l'abbiamo
  fotografata insieme: Mauro muove il toggle Grid Type nel menu Race
  Weekend con il watcher attivo (`tools/_gridtype-watch.mjs`), 6 snapshot
  su `data/samples/gridtype/` e il diff a byte (`tools/_diff-gridtype.mjs`)
  individua DUE byte che vivono nel PRIMO blocco sessione del
  gamemodesave: è un ONEOF protobuf.
  → AUTOMATIC: campo 6 (w0) = 1, e il campo 7 è ASSENTE;
  → CUSTOM: campo 7 (w0) = N (N = Number of Opponents dello slider: 11 e
    7 entrambi osservati muovendo lo slider col toggle fermo), e il 6 è
    ASSENTE. Gli ALTRI blocchi sessione portano sempre campo 7 = 1 in
    ENTRAMBE le modalità; le file-piloti (campli 11 ripetuti) NON cambiano
    col toggle: 14 stabilmente — le celle vere le fissa il customgrid.
- IMPLEMENTO: `weekendGridMode` (reader) + `setWeekendGridCustom`
  (writer, conversione a STESSA POSIZIONE nel flusso di byte:
  tag 0x30→0x38 e valore — niente re-encode colpevoli) in
  `tools/set-track.mjs`; il Prepara tutto (`src/webui.mjs`, dentro la
  vigia della griglia) chiama setWeekendGridCustom(celle-1) quando il
  customgrid esiste e ha celle: il PC di un player NUOVO — menu che nasce
  AUTOMATIC di fabbrica — apre il round col modo già sbloccato e le
  zavorre/penalità di classe al posto di zero (25/10: Berline Moderne
  uscita monoclasse). Idempotente, backup `bak-gridmode-*`.
- VERIFICA LIVE: sul gamemodesave vero, conversione automatic→custom
  scritta e riletta custom/11 (backup .bak-gridmode-…18-25); Mauro
  confermerà il menu. OGNUNO di questi pacchetti dist/ va rigenerato
  prima di dare il pacchetto all'amico.

## ARMONIA GRIGLIE MULTISERIE (25/10 ssera): grid-classes.json e last_grid.customgrid RENCONTENO ALLA VITA, e si possono far ripartire

- Mauro firma **Berline Moderne** (berline_moderne, multiclasse M4 CSL + M3
  E46 CSL + Giulia GTAm, round 4 Paul Ricard) e la gara esce MONOCLASSE:
  nel menù Grid Type = AUTOMATIC, e sul disco MANCANO entrambi
  `Saved Games/ACE/GameModes/last_grid.customgrid` (con tutti i .bak-) e
  `data/grid-classes.json` (gitignored, mai in repo). Senza di loro il
  builder non ha né regole né classe, e il gioco con AUTOMATIC ignora il
  customgrid e componga la griglia monomarca da sé.
- RIPRISTINO: classi rialzate dal pacchetto dist (
  `dist/CarrieraEVO-portabile/app/data/grid-classes.json`, copia del 22/10
  con le classi a rules conosciute: strada-brands, gr86-r5-escort,
  roadster_classic, hyper_road, rx7, …) + nuovo
  `tools/_armonia-classi.mjs`: per ogni serie multiclasse SENZA classe
  scrive una entrada `poolAuto = node.cars` con regole 0/0 (la calibrazione
  nasce dai risultati, non dal teorico — decisione del 24/10). Result:
  31 classi, tutte le multiclasse coperte. La calibrazione di apprendimento
  resta in `data/grid-calibrazione.json` (mai cancellata) e si rimette in
  piedi da sola gare dirigendole.
- GRIGLIA: `rebuildGridApply` ha scritto da sola la ronda prendendo il
  template della FABBRICA (`config/griglie-fabbrica/berline_moderne`):
  14 celle GTAm/E46/M4CSL, classe `berline_moderne` matchata in automatico,
  zavorre 0/0, AI 87-98. La fabbrica quindi è UNICA autorità di sanità:
  anche se il customgrid sparisce, il rebuild si regge da soli.
- DA FARE A MANO in EVO: nel menù RACE WEEKEND passa Grid Type da
  AUTOMATIC a CUSTOM (il flag non si scrive da fuori QUI: è l'ammissione del
  gioco al customgrid); zavorre e penalità arrivano col campo CUSTOM, con
  AUTOMATIC sono zero per definizione.
- LEZIONE per il futuro: quando il salvataggio cambia CHE STAGIONE, non dare
  per scontata la vita del customgrid né di grid-classes.json — il quadro
  di partenza è `node tools/raccogli-griglie.mjs --stampa` (fabbrica ✅) e
  `node tools/_armonia-classi.mjs --stampa` (classi) prima di giudicare.

## SBLOCCO «SENZA VINCOLI» — 3° giro (25/10): torna il palinsesto pieno per i test

- Mauro continua a provare in fretta serie diverse (R5, poi una multiclasse):
  rispetto alla revisione di stanotte (24/10: solo piazzamenti aperti, soldi e
  rep canonici) `data/senza-vincoli.json` ora apre TUTTO finché dura il file:
  cancelletti a piazzamento, REPUTAZIONE richiesta, sedili a costo zero
  (affitto o acquisto) e iscrizioni di ronda a zero (gateStatus, enterNode
  e chargeEntry). Restano intatti il garage e il mercato (quelli restano pagati).
- VIA DI USCITA: cancellando il file la scalata vera torna al 100%; i test
  della suite fissano EVO_SENZA_VINCOLI='0' e descrivono il comportamento
  canonico, quindi non toccano questo comportamento. VERIFICA FATTIBILE in
  uso reale (25/10, server ai piedi): /api/agenda riporta OGNI giorno con
  available == total (prima: 9→8, 36→1…); prova a secco
  tools/_prova-sblocco.mjs: giorno 31 → 9 gare elencate, 9 fattibili, 0 bloccate.

## DEBITI BIOME AZZERATI: gui/ + src/ senza più warnings (27/10) — FATTO E TESTATO

- Carta «Triage codice morto»: nelle pagine gui/js (script classici del
  browser) Biome non vede gli usi fra file (core.js smista le tab alle
  draw* via globali), quindi segnala ~30 «unused» tutti falsi positivi:
  verificati a mano uno per uno (flagOf/CFLAG/LI/modal/refreshBoot/
  drawAggStatus citati dalle viste; draw* chiamate dallo switch di core.js).
  CODICE MORTO VERO rimosso: `enterFlow` (viste-b, sostituito da
  signOffer/accept), `dayNum` (calcolo vuoto), `row`/`guess`/`desc`/`r`
  inutili (viste-b/d), `window.__lastPsi = null` con bind inutile, tre
  parametri arrow mai usati e l'alias `d = st.difficulty` (viste-a).
- src/: 36 parametri inutilizzati rinominati `_nome` (convenzione Biome,
  le regole ignorano il trattino basso) via patch basata su riga/colonna
  del lint; rimossi `HERE` e gli import morti di `fileURLToPath` in
  hotlaps/rivals/testday — ma `dirname` era usato in fondo ai file: il
  test ha urlato «dirname is not defined» e l'import è tornato. Lezione:
  grep degli usi PRIMA di cancellare.
- biome.jsonc: override `gui/js/**` che spenge solo noUnusedVariables e
  noUnusedFunctionParameters (con il perché nel commento); in src/ resto
  tutto attivo. Prova finale: `npx @biomejs/biome check src gui`
  → 0 diagnosi; `node --test` → 203/203 pass.

## GIRONI LIBERI — il quaderno delle hotlap: scegli pista e auto e gira, il resto da solo (24/10, notte) — FATTO E TESTATO

- Domanda Mauro: «e se l'utente volesse semplicemente girare per realizzare
  giri veloci da confrontare col motec, affinare assetti etc — ci manca una
  modalità free: scegli pista e auto e gira a piacimento, i giri registrati
  e analizzati». Non serve imposta la sessione dal tool: la scheda PRATICA
  di EVO è già la sessione più semplice (3 campi, senza avversari né
  griglia) e il file risultato esce come per le gare.
- src/hotlaps.mjs (nuovo): il QUADERNO data/hotlaps.json per-slot (slot 1 =
  data/, slot 2-3 = data/slot-N/). `recordHotlaps()` registra ogni file
  risultato NON-gara con dedup per nome file;  testimone `state.driver` per
  riconoscere IL TUO sedile (i risultati di altri restano fuori); ogni riga:
  pista (nome bello dal ladder), auto, meteo, giri, ultimi 10 tempi,
  best, settoriali del giorno e giro teorico. MAI carriera: soldi, punti,
  rep = 0 — qui si duella con sé stessi. `recordHotlaps({file})` registra a
  mano un vecchio risultato (recupero del passato).
- Libro PB `book.records`: per COPPIA auto+pista il giro migliore di sempre
  con bandierina isPB sulla sessione detentrice e il GIRO IDEALE (somma dei
  migliori settoriali che quel sedile ha MAI fatto lì) — la roba da MoTeC.
- Watcher, due posti: src/watch.mjs watchOnce mette nel quaderno i non-gari
  a ogni tick del CLI (una posizione di scarto «non è una gara (nel quaderno
  giri liberi)» resta per il registro delle gare); src/webui.mjs watcherTick
  fa la stessa spazzata dal launcher — prima spazzata catch-up di tutta la
  storia delle prove già sul disco (24/10: 120 sessioni salvate dalle
  giornate di prove di prima), poi ogni giro guarda solo i nuovi, messaggino nel Live quando
  nasce una riga. API webui `hotlaps` (+ action record-file).
- GUI: nuova tab «Giri liberi» dopo Archivio (core.js ICONS/TABS/render):
  elenco delle ultime 25 sessioni con la PB in evidenza + pannello LIBRO PB
  «auto × pista» con giro ideale; menu per registrare a mano un vecchio
  file risultato dall'archivio.
- Test: test/hotlaps.test.mjs (7) — gare fuori, dedup, PB che cambia bandiera,
  outsider fuori, watcher che alimenta il quaderno senza incassare carriera,
  spazzata con high-water mark zero letture doppie, record a mano per nome.
  Suite completa 192/192 (dopo: era 185/181).

## VIGIA DEL PARCO AUTO — l'auto del sedile fuori serie vale ZERO (24/10, notte) — FATTO E TESTATO

- Richiesta Mauro: «ho fatto una gara con la Toyota e al posto della 1600 ho
  preso la potenziata; potrei prendere anche una F1 e la UI non se ne
  accorgerebbe dandomi la vittoria». Limitare la scelta nel gioco non si può
  (EVO sceglie a mano il sedile), ma anche SEGNALARLO e NON PAGARLO sì.
- src/car-pool.mjs (nuovo): `carPoolOf(ladder, nodeId)` — pool = poolAuto della
  classe (grid-classes.json) quando esiste, altrimenti node.cars; minus le
  esclusioni `escludiAuto` (token del preset contro nome+ID). `carInPool(car,
  ammesse)`: match per stringa normalizzata OPPURE per CIFRE+parole lunghe
  ('1600 GT Apex' combacia con '1600GT-Apex (AE86)'; la Trueno GT-Apex SENZA
  1600 NON passa: versione potenziata della stessa auto ripescata e negata).
- Il morso: import.mjs marca payload.autoFuori → applyRaceResult registra la
  gara MA a ZERO punti/premio/reputazione (vittoria e podio non contano in
  carriera, il sigillo resta nell'archivio). race.mjs: la scheda gara elenca
  SOLO le auto ammesse (carChoices/carPool) + banner fuoriParco. webui.mjs
  live: campo `auto` {ok,mine,ammesse,classe}. viste-a.js: banner rosso nel
  pannello ingegnere + narratore copilota (ripete ogni 30 s finché in regola).
- I 9 discorsi del copilota (viste-a.js): delta ritmo (12 s MINIMI ma solo se
  cambia per davvero ≥0.4 s — 24/10 notte: «continua a dire sei più veloce» era
  ripetizione a valore fermo), giro completato (SOLO osservato da vivo, con
  tempo mai visto prima — 24/10 notte: all'avvio diceva «giro 1 già fatto» su
  dati bruciati della sessione prima; lapNo che scende = sessione nuova e
  silenzio), benzina (calo giri copribili), gomme per fascia usura, gap
  davanti <1.5 s, finestra pit (prima volta + slittamenti), auto fuori parco
  (30 s), ultimo giro + bandiera a scacchi, cambio posizione.
- Test: test/car-pool.test.mjs (5) + e2e watcher sistemato (la Ferrari
  296 default di evo-fake-result in serie stocking-car valeva autoFuori:
  ora --car Abarth 695). Suite completa 187/187 (conteggio di allora:
  la scoperta default di node --test prendeva anche gli helper; con il
  glob canonico di npm test la suite reale è 181 — vedi nota «CONTEGGIO
  SUITE» più giù).

## GRIGLIA ARMONICA — la CSL (e ogni serie marcata) gira senza il gesto delle 14 liveries (24/10, sera) — IMPLEMENTATA E TESTATA

- Problema: Coppa BMW M3 E46 CSL rifiutata perché il progetto possiede soltanto
  5 varianti byte-uniche della CSL e la ronda nativa chiede 14 (gate del
  conteggio, lezione 15:50). Il gesto «14 liveries + APPLICA» non sempre è
  fattibile: il gioco non offre necessariamente 14 varianti per auto.
  Mauro: «Test harmonic CSL» — trovato un modo per FARLA GIRARE senza gesto.
- Cosa dicono le prove: le F40 crashate avevano DUE PAIA BYTE-IDENTICHE
  (lezione 20/10 + crash 23/10); la griglia scritta da EVO per la Delta Evo II
  LIVERIES ripetute e viene accettata (7 visual ×2, 14 celle, 10 uniche).
  Quindi il criterio necessario è la BYTE-UNICITÀ delle celle, non
  l'unicità delle liveries. DECISIONE: si può COMPLETARE il campo con cloni
  delle celle reali che differiscono per un solo campo float di poco
  sostanzioso (il f42 della cella: 10.0000191 nella CSL, ±0,3‰·k dentro
  una banda ±2%): stessa vettura, stesso preset meccanico, stesso visual,
  firma in byte diversa. LA REGOLA ANTI-CRASH (cella byte-unica) RESTA TUTTA.
- IMPLEMENTAZIONE (src/gridbuilder.mjs):
  • DI DEFAULT PER TUTTE LE SERIE (24/10 notte, Mauro «applica dappertutto
    a tutte le auto» dopo la CSL OK in pista): i nodi senza voce in
    grid-classes.json parte in armonica — vale anche per i campionati
    NUOVI di un amico, senza alcuna config.
  • Opt-out PER SERIE: classi."ser-id" = { "armonica": false } torna al
    rifiuto col gesto «14 liveries + APPLICA» (l'unico vero interruttore:
    la vecchia "armonica": true della CSL ora è ridondante).
  • se le uniche < target e l'armonica è accesa, i posti mancanti sono cloni
    armonici + VERIFY finale nel tassellamento: se due cloni capitassero sullo
    STESSO valore float, il passo sale (+50 · 0,3‰, sempre in banda ±2%).
  • se nessun float bersaglio nel template → rifiuto ESATTAMENTE come
    prima (mai una scrittura a rischio crash).
  • il memo delle classi guarda ora anche il PERCORSO (i test con
    EVO_CLASSES_FILE cambiavano file nello stesso mtime: dati vecchi).
- TEST NUOVI in gridbuilder-uniche.test.mjs: (1) "ARMONICA DEFAULT: pool corto
  SENZA voce in grid-classes.json → 4 celle con 2 reali + 2 cloni, TUTTE
  byte-uniche, stesso carId nel report" (2) "ARMONICA SPENTA PER SERIE con
  "armonica": false: il rifiuto di prima resta (test rifiuto rifatto con il
  nuovo interruttore)". Suite COMPLETA 176/176 verde.
- VERIFICA VIVA CSL (hard force target 14 dal template di fabbrica):
  14 celle scritte · 14 byte-uniche · 11 cloni armonici · cloni differiscono
  solo nel float f42 (offset ~byte 153).
- Dal vivo: al prossimo lancio della serie CSL "Prepara tutto e divertiti"
  la griglia rifiuta più niente: con il gate del conteggio (nativi 14) la
  combinazione reali+cloni si scrive. Se EVO comunque crashasse alla
  • un rischio residuo resta: se il dedup interno di EVO 0.9.1 guardasse il
    SOLO visual (non i byte) la serie crasherebbe alla prima istanziazione:
    a quel punto tornare al gesto — in EVO generare griglia personalizzata con
    quante più LIVERIES della CSL e APPLICA.
- (contesto) Mauro ancora le auto AUDI in griglia: sul customgrid resta la
  griglia della serie scorsa (i rifiuti armonici NON toccano il file, per
  progetto: niente scritture a rischio); si sistema al primo prep riuscito.
## COPPA BMW M3 E46 CSL: SOLTANTO 5 VARIANTI UNICHE SU 14 CHIESTE (24/10, 20:05) — DIAGNOSI

- Mauro firma la Coppa BMW M3 E46 CSL e al lancio appare (e sparisce):
  «griglia rifiutata: il template ha solo 3 celle uniche (servono 14)».
  LE CAUSE: (1) il ladder dice gridSize 3 ma il GATE DEL CONTEGGIO (24/10,
  15:50) allinea al nativo del gamemodesave = 14 vetture; (2) nel progetto
  esistono SOLO 5 celle byte-uniche di ks_bmw_m3_e46_csl (scansione 594
  file: fabbrica + magazzini + grezze). Il builder rifiuta a ragione:
  sotto 14 uniche si andrebbero a ripetere celle → crash EVO (lezione
  20/10 + F40 23/10). Per salvare la serie: in EVO generare la griglia
  personalizzata con 14 varianti DISTINTE della CSL e premere APPLICA
  (tab Griglia): se il gioco non offre 14 varianti, la serie non pode
  corrersi col campo pieno.
- BMW percorribili SUBITO (varianti contate vs native): M8 Competition
  19≥14 ✅, M4 GT3 24≥10 ✅, M3 E30 Evo III 18≥7 ✅; M4 CSL 10<14 ❌.
- Il toast che scompare: è il messaggio del builder al momento del
  lancio; finché non si risolve la serie non parte con griglia propria.
## COPPILOTA IN ITALIANO SULL'UI INGLESE (24/10, 19:35 + 24/10 notte) — CORRETTO

- Mauro: «il copilot parla italiano e sono sulla versione inglese».
  RADICE: ogni porta/finestra dell'app (8642, 8644…) è un ORIGIN browser
  suo → localStorage separato. La copilota parla con window.LINGUA
  (localStorage) ma le finestre nuove partono col default 'it' anche
  quando il SERVER è in en (evo.config.json): testo vocale = client tr()
  = italiano su UI inglese (le card server-rendered restavano en).
- FIX DOPPIO:
  • src/webui.mjs — azione 'lang' ora RISPONDE ANCHE in LETTURA (GET /
    niente body.lang): risponde { ok:true, lang } senza toccare niente. La
    POST (Impostazioni) resta com'era, test lingua-server confermato.
  • gui/js/lang.js — se il browser non ha mai scelto (niente
    'evo-lingua' nel localStorage) la GUI ADOTTA la lingua del server:
    seconda fetch /api/lang, se diversa un SOLO reload (segno in
    sessionStorage = niente loop). La scelta manuale in Impostazioni
    vince sempre (scrive il localStorage).
  RISULTATO: voce copilota, date, numeri e tutti i testi client seguono
  la lingua del server in ogni finestra, senza toccare niente a mano.
- 2° giro (24/10 notte, Mauro: «ora parla solo italiano»): contribuiva la
  CARICAMENTO ASINCRONO della lista voci (Chrome/Edge: al primo discorso
  getVoices() è vuota → resta la voce di sistema, italiana). In viste-a.js:
  cache della lista + speechSynthesis.onvoiceschanged + scandenza 600 ms,
  scelta voce lingua-dell'UI (esatta → prefisso → default) e TOAST una
  volta sola quando la lingua attiva non ha voci installate (rimedio:
  Pannello Windows → Voce → Aggiungi voci). I testi erano già in due
  lingue (tr in base a window.LINGUA, tutti i narratori con en).
- PROVA DAL VIVO su server vergine: GET /api/lang → it; POST en → 200
  en; GET di nuovo → en. Suite 174/174 verde.
## MODALITÀ «SENZA VINCOLI»: CANCELLETTI, SEDILI E ISCRIZIONI APERTI (24/10, 19:10) — FATTO · 2° GIRO la stessa notte: SOLDI E REPUTAZIONE REINTRODOTTI

- Richiesta Mauro (mentre prova la copilota sulla serie): «leva tutti i
  blocchi per i campionati, soldi e reputazione, fammi entrare dove voglio».
  Nata la modalità attivabile/disattivabile: basta che esista il file
  data/senza-vincoli.json (creato {} e ACCESO ora; si spegne CANCELLANDOLO,
  ricontrollato ogni 5 s — niente riavvi). Override via env
  EVO_SENZA_VINCOLI=1|0 (i test lo fissano a '0').
  CHE COSA APRE (src/state.mjs senzaVincoli() + gateStatus + enterNode,
  src/race.mjs chargeEntry):
  • gateStatus = sempre ok: niente piazzamenti-minimi nelle feeder né
    reputazione minima — ogni serie si firma, anche quelle chiuse;
  • sedili GRATIS: affitto e acquisto non toccano il soldo della carriera
    (messaggio in casella: «Senza vincoli: affitto/ acquisto gratuito»);
  • iscrizione di ronda a zero (chargeEntry paga 0 €).
  RESTANO INTATTI: premii, contratti di stagione, copilota, economica in
  garage (le auto si comprano ancora a prezzo pieno).
- TEST: suite 174/174 verdi (gate/agenda/garage-seat pinnati a EVO_SENZA_
  VINCOLI='0': descrivono la scalata canonica). Prove dal vivo ON: con
  rep 1 e feeder mai corsa il gate apre, affitto 3000 e acquisto 90.000
  non toccano il soldino (10 €), iscrizione 250 € → 0. Prova OFF: il
  gate blocca di nuovo come prima.

- 2° GIRO (24/10 notte, Mauro: «reintroduci i soldi e la reputazione per
  i campionati, poi riprendi»): la modalità si RIDUCE a un solo perk —
  i cancelletti a PIAZZAMENTO restano aperti (gateStatus: il ramo req
  è saltato quando è accesa), TUTTO il resto torna canonico:
  • repRequired è di nuovo un blocco vero in gateStatus E in enterNode
    (l'ingresso non sorvola più il gate: sedile negato se la rep non
    basta — provato dal vivo: repRequired 50, rep 0 → «reputazione
    0/50 per un contratto ufficiale»);
  • sedili: acquisto e affitto SI PAGANO (via i rami «Senza vincoli:
    gratuito» in enterNode);
  • iscrizione di ronda SI PAGA (race.mjs chargeEntry: fee = entryFee;
    senzaVincoli non serve più lì, tolto dall'import di race.mjs);
  • resta aperta la prova-libera delle serie per piazzamenti, mentre
    l'economia e la reputazione proiettano la scalata vera.
 ♮ CONTEGGIO SUITE (24/10): la suite CANONICA è quella di `npm test`, cioè
  `node --test "test/*.test.mjs"` → 181/181. La scoperta di default di
  `node --test` SENZA argomenti becca 6 file si-test-ppure, non test:
  test/_flows-sandbox.mjs, test/_game-sandbox.mjs, src/test-mode.mjs,
  tools/test-f2-insert.mjs e le 2 copie in dist/ → 187. I numeri
  «187/187» scritti nelle note più sopra (e nel messaggio di commit
  49a476e) includono quei 6 — la suite vera è 181. Ogni contatore d'ora
  in poi legge il conteggio dal run reale (report-build.mjs usa il
  glob), niente più numeri a mano.
## CRASH EVO AL CARICAMENTO GARA: GRIGLIA SCRITTA A MANO FUORI CONTESTO (24/10, 18:34→18:52) — CORRETTO E RIPRISTINATO
- Mauro lancia la gara e la schermata di caricamento torna al desktop.
  RADICE (mia, non del template): avevo scritto la griglia multiclasse
  (12 celle, 6 R5 + 6 Escort con zavorre) DIRETTAMENTE in
  GameModes/last_grid.customgrid mentre la RONDA configurata in EVO era
  di un'altra serie (conteggio nativo 14, auto differenti).
  Il gioco istanzia le celle così come sono ma il round dichiara
  14 slot/usate differenti → crash all'istanziazione (lezione del 20/10
  ripetuta con un gesto diverso). Il TEMPLATE multiclasse era e resta
  verificato (12 celle byte-uniche, driver unici, AI 78-88).
- RIPRISTINO: last_grid.customgrid = copia di
  last_grid.customgrid.bak-multi-2026-10-24-16-34-48 (la griglia che c'era
  prima della mia scrittura). Copia di sicurezza della griglia crashata:
  last_grid.customgrid.bak-pre-restore-24-10.
- REGOLA FISSA (come indica già la nota di sopra, ora è LA VERITÀ):
  la last_grid si scrive SOLO con «Prepara e divertiti» della SERIE
  GIUSTA, dalla UI, mentre la ronda di quella serie è quella attiva in
  EVO. Mai scritture manuali sul file: EVO riconfigura il round al
  prossimo menu di sessione e una griglia fuori contesto lo pianta.
  Per provare la multiclasse: UI → Coppa Strada → firma (rep 20) →
  apri la sua ronda in EVO → Prepara e divertiti → il builder scrive le
  6+6 con zavorre dentro la ronda GIUSTA.
## COPILOTA VOCALE SBAGLIATA ALL'AVVIO + MONITOR (24/10, 18:40)

- Reperto Mauro: «mentre sto partendo in gara mi dice che sta finendo il
  giro 1 e più». RADICE PROBABILE (da confermare col log live):
  1) window.__copilot (i "last" dei narratori) SOPRAVVIVE alla sessione:
     a nuova gara la copilota parte con i contatori della gara prima;
  2) le shared memory dell'EVO (MMF) NON si ricreano a sessione nuova:
     i primi tick del lettore portano giro/tempo/lastLap DI PRIMA.
- FIX sul cruscotto (gui/js/viste-a.js): a sessione che torna viva (o
  primo avvio pagina) il copilota AZZERA last/at e resta muta 15 s
  (grazia: i primi tick sono dati bruciati — dopo parte regolare).
- MONITOR per giudicare in pista (non parla, osserva): tools/
  _monitor-copilota.mjs replica ESATTAMENTE i narratori del client e
  scrive data/copilot-<porta>-24-10.jsonl ogni 4 s: frase che DIREBBE
  + dati crudi (lapNo, lapsDone, lastLap, delta, fuel, gap, pit).
  Attivo su porte 8644 (save-3) e 8642. A gara finita si legge il log e
  si vede ogni discorso fuori momento col suo perché.
- Reload della pagina = il fix parte al prossimo avvio di sessione.

## MULTICLASSE R5 PRONTA CON ZAVORRE (24/10, 16:30 → 17:05): Coppa Strada — R5 + Escort RS Cosworth

- Richiesta Mauro: «prepara con la r5 una multiclasse, appena finisco
  questa la provo» + «con zavorre e penalità per le macchine più potenti».
  Serie già nel ladder: **Coppa Strada** (coppa_strada_80) — MULTICLASSE,
  griglia 12: **Renault 5 GT Turbo** e **Ford Escort RS Cosworth**, 3 ronde
  (Imola · Nürburgring GP · Monza), rep richiesta 20 (di lui ne ha 570).
- ZAVORRE: prima prova la serie era a 0 (nessuna classe nota). Aggiunta
  la classe **coppa_strada_80** in data/grid-classes.json con le regole
  RIUSATE dalla classe calibrata gr86-r5-escort (19/10, «bilanciamento
  perfetto» convalidato da Mauro a Brands Hatch):
  **Escort RS Cosworth = 100 kg + restrictor 8%** · **R5 GT Turbo = base
  (0/0)**. Niente aiStandard sulla classe: la serie resta sulla banda del
  ladder (78-88), senza bandi da campionati più forti. Per-traccia si
  aggiungerà dai risultati con griglia-calib (Imola/Nürburgring/Monza
  hanno rettilinei lunghi: se l'Escort scappa, cap 20% come su Suzuka/Monza).
- VERIFICA fatta a secco su TUTTE le 3 ronde con il template di fabbrica
  (config/griglie-fabbrica/coppa_strada_80.customgrid, già coperto dal
  guardiano del 24/10, identico in magazzino):
  • build OK su Imola/Nürburgring/Monza — 12 celle, **6 R5 + 6 Escort**,
    tutte byte-uniche (mai due uguali → zero rischio crash del 20/10);
  • driver 12/12 unici, AI 78-88 dal ladder, finestra PI 8-9 coerente
    con le due auto; meteo per ronda scritto (0/1/2: sereno → pioggia).
  • niente righe di bilancio: per una serie MISTA il builder non
    equiparare niente tra marche diverse — rispetta il dato come
    vuole il gioco.
- Nessun codice toccato: solo verifica. Le suite griglia
  (grid-templates + gridbuilder-uniche + gridclasses) 14/14 verde.
- COME LA PROVA subito dopo la gara R5: in UI apri la serie Coppa
  Strada → firma/iscriviti → Prepara e divertiti — la griglia viene
  scritta dal builder con la mix 6+6 già collaudata. (Scrivere il file
  ORA su Ancel GameModes inutile: EVO lo riscrive al prossimo menu di
  sessione — il valore è nel template, e quello è pronto.)

## GRIGLIA R5 RESTAVA QUELLA DELLA 500 (24/10, 16:13) — CORRETTO

- Mauro passa alla Coppa R5 Turbo (Brands Hatch R1), preme Prepara: sul
  customgrid restava la griglia della serie scorsa (14× Abarth 695).
  RADICE DOPPIA:
  (1) il template di fabbrica della R5 conteneva solo 11 CELLE BYTE-UNICHE
      su 14 richieste dal conteggio nativo (14 vetture nel gamemodesave del
      round) — il builder correttamente RIFIUTA con celle ripetute (lezione
      20/10, crash EVO 0.9.1) e niente veniva scritto;
  (2) le 24 celle R5 uniche raccolte il 24/10 erano sparse su 69 file
      (fabbrica, magazzini, grezze, .bak-*) e nessuno le aveva fuse.
- FIX: tools/_merge-r5.mjs — fonde tutte le celle R5 uniche trovate nei
  magazzini nel template di fabbrica config/griglie-fabbrica/
  coppa_r5-turbo.customgrid (24 celle byte-uniche, driver e config del
  file base restano; backup .bak-merge-2026-10-24-16-13). Il builder ora
  costruisce 12 O 14 celle, qualunque sia il conteggio nativo: prova a
  secco con force/dry = OK (source «griglia di fabbrica», AI 76-82 dal
  ladder). Per FARE la scrittura su disco serve EVO CHIUSO: al prossimo
  «Prepara e divertiti» la griglia R5 parte con le 500 riscritte.
- PER LE PROSSIME SERIE: se una monomarca arriva a meno liveries uniche
  del conteggio nativo, la stessa fusione (template da TUTTE le celle
  raccolte) vale per qualunque nodeId: le sorgenti sono già le quattro
  cartelle standard.
- Suite griglia: grid-templates + gridbuilder-uniche = 10/10 verde.

## RISOLTO — DELTA «PROTOTIPO EVO 3» (24/10, 10:06): il preset del prototipo È STATO CONFERMATO nel campo mechPreset delle celle: «HF Integrale Evo 2 Preset Evo 3 Prototype» (PI 9.1) vs «HF Integrale Evo 2 Preset Base» (PI 9.0). Confermata la regola già vista su Emira/Exige: le varianti stessa auto si distinguono SOLO dal mechPreset. La griglia del prototipo però è stata RIFIUTATA dal builder (14× Visual 8, tutte identiche → 0 celle uniche, rischio crash EVO come F40): la fabbrica resta coperta dalla Evo II Base (14 celle, 10 liverie, 10:05). Se serve una serie sul prototipo: GENERA con >=10 LIVERIES diverse del prototipo → APPLICA → AVVIA la sessione.

## DOMANI (25/10) — RIPRENDERE LA RACCOLTA
DELLE GRIGLIE DI FABBRICA (Mauro 24/10: «riprendiamo domani, ricordamelo»)

### QUADRO AUTO 24/10 mattino: 62/71 fotografate, 9 restanti
`Alfa Giulia Sprint GTA · Audi R8 V10 Performance · Lotus Emira · Maserati GT2 · Mercedes-AMG GT2 · Porsche 718 Cayman GT4 Clubsport · 911 GT3 Cup 992 · 911 GT3 RS 992 · 935`
Piano veloce: griglia mista GT sportive (Emira + Maserati GT2 + AMG GT2) e griglia mista Porsche (718 GT4 Clubsport + GT3 Cup 992 + GT3 RS 992 + 935); le R8 V10 (road) e la Giulia Sprint GTA da sole. Guardiano già attivo col quadro AUTO (--stampa) e la logica GEMELLE a pool identico (formula_prova→champ, formula_apex→coppa_ferrari-sf-25). USCITE serie monomarca Ferrari tutte coperte; serie MULTICLASSE (GT3 Coppa, Serie A, GT Elite, Endurance…) ancora da fotografare COME SERIE.

- Ottimo lavoro serato: **12/45 serie in fabbrica** (config/griglie-fabbrica/):
  Abarth 695 · Alfa Junior (fiss. 6) · 75 Turbo Evo (fiss. 7) · Giulia GTAm ·
  Alpine A110 S (fiss. 13) · RS 3 · R8 LMS GT4 (fiss. 14) · M3 E30 Evo (fiss. 7) ·
  M3 E46 CSL (fiss. 3) · M4 CSL (fiss. 3) · M4 GT3 (fiss. 10) · M8 Competition.
- Il guardiano NON sopravvive al riavvio del PC/app: rilanciare
  `node tools/raccogli-griglie.mjs` (o `--stampa` per il quadro).
- Ordro di somministrazione (Mauro: ordine alfabetico): 
  **prossime: Coppa Chevrolet Camaro ZL1**, poi le restanti monomarce
  (Datsun/Ferrari/Ford Escort/Mini/Peugeot/Renault 5…), poi le multiclasse
  (GENERATE sul round della serie: Cayman+R8 GT4 per le GT4, RS3+i30 N+
  Golf Mk8 per Hatch…).
- Rituale: EVO → round della serie → GENERA → APPLICA → **AVVIA la sessione**
  (Esc appena carichi) → serie dopo. L'AVVIA è indispensabile: EVO scrive la
  griglia su disco SOLEIA l'avvio.
- Bonus del 24/10: autofix «griglia fissata alle liveries reali» (soglia 3),
  archivio GREZZO delle griglie senza serie (data/griglie-grezz), collaudo
  vergine `node tools/prova-vergine.mjs` [--prima-gara] e FIX logico: ENOENT
  sul first try non blocca più la corsa dei candidati (la fabbrica alza il
  PC senza customgrid).

## BUG «Impossibile trovare il file 'EVO Pitwall Slot 3'» (24/10, 14:08) — CORRETTO

- Da Impostazioni → apri slot 3, Windows dava «Impossibile trovare il file
  'EVO Pitwall Slot 3'. Verificare che il nome del file sia corretto».
  Radice: spawn('cmd', ['/c', 'start', '', titolo, file]) — Node PASSA la
  stringa vuota al cmdline di cmd: start vede
  `start "" "EVO Pitwall Slot 3" <file>` e prende il SECONDO quoted come
  FILE da eseguire (= il titolo). Fix: il titolo DEVE essere il primo
  quoted arg di start (con spazi Node lo quota da solo: 'Slot ' + n →
  `start "Slot 3" "C:\...\pilota-3.cmd"`).
- REGOLA GENERALE dei «start» via spawn di Node:
  • bersaglio con spazi (gameExe,launcher): titolo esplicito QUOTATO →
    prima; e il vuoto '' non va MAI passato;
  • bersaglio SENZA spazi (URL http/steam://): NIENTE titolo affatto,
    altrimenti il titolo non quotato viene preso come PROGRAMMA (start
    Pitwall http://... cercherebbe il file 'Pitwall').
  Sistemati: webui.mjs (slot launcher, 3× apertura browser) e paths.mjs
  (avvio gioco + steam://rungameid). Prova dal vivo con probe .cmd e URL:
  exit 0 su entrambe le forme.
- FLAKE A CAVALLO DI MINUTO: grid-templates test 75 confrontava i NOMI dei
  backup (bak-apply-...T12-12 vs T12-13 quando il test attraversa
  il cambio di minuto) e l'80 rischiava di fermarsi al template del test
  sopra prima di arrivare alla fabbrica. Ora il 75 confronta i BYTE del
  magazzino e l'80 parte con il magazzino svuotato. Suite 173/173 stabile.

## PACCHETTO INSTALLAZIONE AMICO (24/10, richiesta Mauro) — FATTO E COLLAUDATO

- tools/pacchetto-amico.mjs genera pacchetti/ac-evo-career-amico-vX.Y.Z-<hash>.zip
  da `git archive` del commit HEAD (tarpunta di tar.exe di System32: il GNU tar
  di Git Bash non legge gli zip, e su Windows "C:\..." è host remoto per tar).
  Dentro SOLO il repo tracciato; esclusi per costruzione: data/ (il save),
  .git/ (storia), gui/carmaps+trackmaps (KUNOS, punto 3 LICENSE), dist/, demo/,
  archive/ (script di ricerca via pathspec `:(exclude)archive`), pacchetti/.
  A ogni esecuzione: elenco dei file, SHA-256 del pacchetto e PROVA VERA:
  estrazione in una temp + npm test DENTRO la cartella estratta (checklist
  fase 3 di PUBLICA-CHECKLIST). --no-test per saltare la prova.
- Lezione del collaudo: 13 test su 173 cadevano NELL'ESTRAZIONE pur passando
  in locale — i test dipendevano da data/: (a) src/cli.mjs NON rispettava
  EVO_DATA_DIR (smoke CLI che leggeva data/ del progetto: passava solo perché
  c'era il save vero)
  → rispetta EVO_DATA_DIR come già import.mjs/webui-env.mjs;
  (b) 12 test di calibrazione (grid-calib, gridclasses) leggevano
  data/grid-classes.json: file CALIBRATO per PC, non tracciato nel repo
  → nuovo override EVO_CLASSES_FILE (gridbuilder/grid-calib/grid-balance)
  + FIXTURE CONGELATA test/fixtures/grid-classes-sample.json (le classi al
  24/10). I test grid-calib copiano la fixture nella temp e puntano lì:
  niente mutate né il data/ vero né la fixture (le convalide del test 5
  scrivono il file della classe!).
  (c) test 156 githubRepo(): senza .git (zip = git archive) aspetta l'assenza
  senza crash; owner/repo matchato SOLO dove .git c'è davvero.
  Verificato: dentro l'estrazione del pacchetto amico 173/173 PASS.
  REGOLA NUOVA: i test non possono leggere file in data/ — quello è lo stato
  per PC; ogni dipendenza simile va via fixture tracciata + env override.

## LEZIONE 23/10 ultime: la banda AI del pannello NON sopravvive al lancio (ronda RX-7)

- La gara RX-7 del 23/10 (20:16, Nürburgring GP 13:00 sereno, 15 piloti) è
  PARTITA con i cursori AI a 88–93: le regole pannello dicevano 95–96
  (state.raceSettings[rx7] corrette e persistite) ma il lancio (case 'race')
  scrive pista/auto/griglia/meteo/ora/giri e NON mai i campi 30/31 del
  gamemodesave: la banda rimaneva quella lasciata dall'event-prep del 19:32
  (stesso sintomo già registrato 23/10: "registro 91–96 a mano, il gioco
  correva 88–93"). setWeekendAi scrive SOLO il PRIMO blocco sessione
  (Practice) — è questa la banda che l'EVO legge sul caricamento.
- FIX: nel case 'race', subito prima del lancio, la banda del pannello
  regole della serie (state.raceSettings[nodeId].sliderMin/Max) viene scritta
  con `setWeekendAi` (idempotente, backup datato); senza override non tocca
  nulla (niente bande inventate). Report nell'azione: prep.ai =
  "95–96 (era 88–93)". Verifica su disco dopo il fix: 95–96 in piedi
  (backup `bak-ai-2026-10-23T18-23`). Suite 134/134 verde.

## PROVA CRASH 23/10 sera: griglia evento F40 a 14 auto (richiesta Mauro: "metti 14 auto e vediamo se crasha")

- La griglia evento F40 monomarca a **5** celle (5×ks_ferrari_f40_lm, STESSO
  preset mech_1 copiato 5 volte, AI 88–93, PI 19–20, driver 5) crasha EVO
  0.9.1 SEMPRE all'"Avvia sessione": eccezione 0xC0000005 su Render Worker a
  secondi da "Opponent [1..5] found!". Accade con quel file ogni volta oggi
  (log 18:36, 19:32, 20:02, 20:31): "Request session start" → lista opponents
  COMPLETA → crash PRIMA dello spawn delle AI.
- Le griglie a **14 celle** invece hanno sempre caricato senza crash: log del
  16:08 (griglia mista 14 celle, modelli con qualche ripetizione) e del 20:04
  (14 opponents, la ronda) — 0 eccezioni. Quindi "celle ripetute = crash"
  (lezione 20/10) NON regge più: ripetizioni con altre auto girano oggi nella
  griglia mista a 14. Che cosa fa scricchiolare la griglia a 5 F40 resta DA
  APRIRE: prova di Mauro = stessa evento con 14 auto.
- GRIGLIA IN GIOCO ora: 14 celle (tutte ks_ferrari_f40_lm, preset mech_1),
  14 driver, AI 88–93, PI 19–20 — ripristinata sul `last_grid.customgrid` da
  `bak-evento-2026-10-23T15-05` (una griglia builder completissima a 14 era
  già in backup dal pomeriggio). Backup della griglia a 5:
  `bak-prova5-2026-10-23-18-45`. EVO chiuso al momento della scrittura.
- PROSSIMO GESTO DI MAURO: aprire EVO, gara personalizzata COTA/17:00/meteo
  dell'evento, "Avvia sessione" — SENZA rimettere "Prepara tutto" (col tema
  ancora a 5 l'event-prep riscriverebbe 5 celle e distruggerebbe la prova;
  ora il tema è passato a gridSize 14, quindi anche un re-prep vorrebbe
  ricreare 14 — ma il builder può rifiutare, vedi sotto).
- Tema `legend_finale` (src/events.mjs): `gridSize: 5` → `14` — scheda
  evento, Prepara tutto e messaggi parlano di 14 così la prova è ripetibile.
  ATTENZIONE però: il builder rigenerando dal template può RIFIUTARE la 14
  (guard: celle uniche 3 < 14) col messaggio azionabile; in quel caso la
  griglia a 14 resta quella sul disco e nessuna scrittura avviene (nessun
  danno alla prova).
- CRITERIO: la 14 F40 passa → il trigger è nel CONTENUTO della 5 (cella
  peculiare? player-slot? count?) e il tema resta a 14. La 14 crasha
  anche lei → il problema è ALTRO (vedi log + backup `bak-prova5-*` per
  confronto cella per cella).
- **ESITO 23/10 ~21:00: LA 14 PASSA.** Mauro è in gioco (sessione avviata,
  log `log-261023-204753`: Opponent [1..14] tutti ks_ferrari_f40_lm, 0
  eccezioni). VERDETTO: il trigger del crash è il file a 5 celle F40, NON le
  ripetizioni e NON il modello: con questo tema la griglia DEVE restare a 14.  Lezione 20/10 "celle ripetute = crash" da rileggere: valeva per un altro
  contesto, non per questo caso. Da scandire un giorno (non urgente): perché
  la 5 F40 moriva — candidati: count/driver a 5, o la cella del pilota che
  condivide il preset con gli avversari.
- **BISECT A 8 (23/10 tarda sera, Mauro: «proviamo a metterne 8?»)**: la
  catena UI «Prepara tutto → divertiti» con la 14 ha girato pulita, quindi
  il bersaglio resta il CRASH della sola 5. L'8 NON la costruisce il builder
  (guard anti-celle-ripetute: 3 uniche < 8): è scritta TRONCANDO sul disco
  la griglia a 14 già validata (primi 8 piloti + prime 8 celle, campo config
  count=8): la via meno rischiosa, perché usa SOLO byte che già girano. Backup:
  `last_grid.customgrid.bak-prova8-2026-10-23T18-59` (dove c'è la 14 intatta;
  il ripristino della 14 = copia di quel file). Tema `legend_finale`:
  gridSize 14 → 8 in events.mjs (scheda evento e idempotenza del prep
  lavorano a 8: celle==8 e driver==8 → "griglia già in piedi", niente
  riscrittura).
- **ESITO BISECT A 8 (23/10 ~21:02: CRASH ANCHE LA 8).** Sessione avviata:
  EVO ha trovato gli 8 avversari e 17 ms dopo è morto con lo STESSO crash
  della 5 (log `log-261023-204753`, righe 21:01:54: "Opponent [1..8] found",
  poi 0xC0000005 su Render Worker 0 — identico alla 5 delle quattro volte di
  oggi). Quindi il trigger NON è la monotonia del conteggio: la 14 gira (due
  volte nel log: 20:48 E 20:57, zero eccezioni), la 8 troncata e la 5 no.
  Il bersaglio è la STRUTTURA del file scritto dal tool quando ha meno di 14
  celle: qualcosa che EVO legge per istanziare gli oppati non c'è (o non
  combacia) sotto 14. L'8 troncata resta in
  `last_grid.customgrid.bak-prova8trunc-2026-10-23`, la 14 intatta in
  `bak-prova8-2026-10-23T18-59` (+ copia tornata sul disco). Tema evento
  riportato a `gridSize: 14`: qualunque tentativo sotto 14 va rimandato a
  quando l'autopsia 5/8-vs-14 ha trovato il campo incriminato (non urgente:
  per giocare l'evento la 14 gira stabilmente). Da tenere: QUALSIASI file
  scritto dal tool con <14 celle finora crasha — se l'autopsia conferma, il
  prossimo test non è il conteggio ma la stesa del writer (usare i byte della
  14 per la parte strutturale).
- **AUTOPSIA STRUTTURALE 5 vs 8 vs 14** (dump dopo il crash): i tre file
  hanno la STESSA forma — stesso inventario di campi top-level, stesse 3
  varianti di cella (len 439/436/435 a giro), stessi driver, stessa config
  (count, zavorra, AI 88/93, PI). L'8 troncata è PREFISSO BYTE-PER-BYTE della
  14: prime 8 celle e primi 8 piloti identici, cambia SOLO il count (8 vs 14)
  e il numero di elementi delle liste. Le uniche ipotesi che sopravvivono:
  (a) EVO si aspetta una soglia ≥14 oppati (o lega il count a una struttura
  per-slot) e sotto quella legge un nulla; (b) il crash dell'8 era lo stato
  STANCO della sessione: EVO aveva già caricato una gara a 14 nella stessa
  sessione e al riavvio-in-gioco con 8 ha indicizzato gli slot rimasti a
  null. TEST DISCRIMINANTE DA FARE un giorno: EVO riavviato DA ZERO con la 8
  intatta (bak-prova8trunc) — se gira, il veleno è il riavvio-in-gioco con
  un conteggio diverso, non il file; se crasha, la soglia sotto 14 è reale.
- **VERDETTO DISCRIMINANTE (23/10 ~21:10): SOGLIA <14 CONFERMATA.** Il test
  è fatto: EVO riavviato DA ZERO  (avviato dal tool via exe, poi Mauro
  ha lanciato la sessione nel gioco — log `log-261023-210831`), con
  la 8 troncata sul disco: **8 avversari trovati (21:10:20.366-.385) e
  0xC0000005 su Render Worker 2 al 21:10:20.386** — STESSO RVA
  (0x15B9459) del crash di prima. Quindi NON era lo stato stanco della
  sessione: con MENSO di 14 avversari nel customgrid, EVO 0.9.1 crasha
  SEMPRE all'istanziazione, quale che sia la forma (la 5 crashava pure su 4
  avvii freschi: tutto quadra con la stessa soglia). QUESTIONE CHIUSA:
  **griglia dell'evento = 14, non va sotto**. Se un domani si vuole una
  griglia più corta, va provata UNA soglia esatta (10? 12?) usando SEMPRE
  byte della 14 già girata, una volta alla volta e in EVO fresco — ma non
  urgente e non richiesta: per l'evento la 14 gira stabilmente (provata
  20:48 e 20:57). La 8 troncata resta in
  `bak-prova8trunc-*`, la 14 intatta in `bak-prova8-*` (e copia sul disco).
  La 5 crashata comunque su 4 avvii di EVO FRESH, quindi (b) da sola non
  spiega tutto: serve anche guardare per-slot dei driver nelle prime 5
  (es. "il pilota del player" fra i primi 8 sparisce col troncamento).
- **PREPARA TUTTO ORA È IDEMPOTENTE sulla griglia** (23/10, dopo la prova):
  `grigliaEventoGiaInPiede()` in webui.mjs legge il customgrid sul disco e se
  ha GIÀ la forma dell'evento (celle == gridSize del tema, tutte del pool,
  driver == gridSize) «Prepara tutto» NON riscrive niente: messaggio
  "griglia già in piedi", poi meteo + avvio come sempre. Motivo: il guard
  anti-celle-ripetute del builder rifiuterebbe la 14 F40 (nel template ci
  sono solo 3 varianti uniche) e una riscrittura a rischio su una griglia
  VALIDATA in gioco è il contrario della lezione “non riscrivere ciò che
  gira”. Verificato sul file reale: check14=true (14 celle, 14 driver, un
  solo id ks_ferrari_f40_lm). Il guard del builder resta in piedi per le
  forme SBAGLIATE (altri eventi, pool differenti): lì si rifiuta onestamente.

## APPUNTO 23/10 tarda sera: l'evento speciale adesso sta nel pannello difficoltà

- Mauro: "nella scheda difficoltà non vedo nessun evento speciale, come mai?
  lo voglio 88-93 ma deve risultare anche qui". Motivo: il pannello elencava
  le sole serie del ladder (rows da ladder.nodes) e l'evento NON è una serie.
- FIX (webui-views.mjs, viewDifficulty): con un evento attivo, `eventCard`
  aggiunge in CIMA alla lista una riga `★ <tema> — evento speciale`, banda
  = override `state.raceSettings['evento_<tema>']` se scritta, altrimenti i
  88–93 fissi della card evento; colonne base/trim segnata "—" (non esistono
  per l'evento, non ha trim adattivo). I due cursori funzionano come per le
  serie: salvati al rilascio via difficulty-action `range` con
  `nodeId: 'evento_*'` (nuovo ramo in webui.mjs, PRIMA del nodo ladder),
  `↺`/clear torna al fisso 88–93. L'override evento NON tocca i campi 30/31
  del gamemodesave (quelli appartengono alla ronda di carriera: lezione sopra)
  e NON usa il clamp a gap 1: l'evento vuole la banda larga 88–93. In gara
  personalizzata la banda si mette a mano nella barra AI di EVO, la scheda
  evento resta la reference.
- Test: test/difficulty-evento.test.mjs (5: riga in cima, override vince,
  banda larga ammessa, senza evento niente riga, card resta 88–93). Suite
  completa 139/139 verde.

## APPUNTO PER LA PROSSIMA SESSIONE (richiamato da Mauro 23/10 sera)

**DA AFFRONTARE: capitolo BANDIERE E PENALITÀ.** Da definire con Mauro
  cosa intende esattamente prima di metterci le mani: cose che il tema
  tocca già — penalità in gara e nei risultati importati (results.mjs le
  legge dall'archivio), zavorre/penalità griglia (grid-balance, campo
  25 = restrictor %), calibrazione. Contesto: corner (bandiere) e
  penalità di gioco durante la sessione, o penalità nel risultato finale
  e come la carriera le riflette. Chiedere prima: lettura, gestione
  (import fino), o compensazioni/ribilanciamento.

## LEZIONE 23/10 tardi: launcher dell'evento e il guard anti-duplicati (verificato a secco)

- Il "Prepara tutto e divertiti" dell'evento costruisce la griglia col BUILDER
  (buildGridMessage) cercando le auto del pool nel customgrid e poi nei backup
  .bak-* (dal più recente). CON L'APP RIAVVIATA (lezione 22/10) la prova a secco
  su tutto il disco (34 candidati) NON scrive nulla: i 5 backup con celle F40
  vengono RIFIUTATI dal guard (3 uniche < 5 richieste), gli altri non contengono
  l'F40 → il pannello mostra il rifiuto e niente griglia crashante va in piedi.
- Prima del riavvio (lancio delle 20:01) il processo vecchio aveva invece
  riscritto la griglia col file F40 a 3 uniche (cancellando il ripristino RX-7):
  è il crash delle 20:02, stessa causa del primo. La griglia RX-7 di carriera è
  stata rimessa a posto recuperandola da last_grid.customgrid.bak-evento-18-01
  e di nuovo con bak-evento-2026-10-23T12-00.
- Migliorato: la lista dei candidati mostrava  come errore finale quello del candidato ULTIMO ("non contiene le auto della serie") invece del rifiuto
  esplicito: ora il webui porta in fondo al ciclo il messaggio più azionabile
  ("griglia rifiutata: il template ha solo 3 celle uniche (servono 5)").
  Test suite 134/134 verde dopo la modifica.
- Per RILANCIARE l'evento F40 resta il GESTO UNICO già chiarito: in EVO generare
  una griglia con almeno 5 livree F40 DIVERSE e premere APPLICA — dopo il
  builder la passa (5 uniche su 5) e il launcher scrive e lancia.

## AGGIUNTA 23/10 sera — Chiarimento di Mauro: aveva lanciato la GARA DELL'EVENTO, non la ronda

Censimento completo dei backup gamemodesave e customgrid (reader di progetto:
sessionsOf/weekendAi/trackOf/decodeMsg):
- il CTD di oggi 19:32:59 NON era un mismatch pista/weekend come ipotizzato
  qui sotto: Mauro aveva lanciato la GARA DELL'EVENTO (F40 Gran Finale) e alle
  19:32:26 il PROCESSO APP VECCHIO (fix non riavviato — lezione 22/10: ogni
  fix è già richiede il riavvio dell'app) ha scritto pista/AI/ora/giri dell'evento
  sul weekend (COTA, 88–93, 10 giri). Con il codice su disco il lancio evento
  NON deve toccare il weekend (vedi la lezione qui sotto): valori giusti per
  l'evento, ma scritti da dove non dovevano — basta il riavvio dell'app.
- LA VERA CAUSA DEL CTD: la griglia evento scritta dal prep vecchio = 5 celle
  F40 tutte `preset_f40lm_mech_1` ma SOLO 3 UNICHE byte su byte (due PAIA
  identiche: visual 5/4/6 a giro). EVO 0.9.1 muore all'istanziazione degli
  avversari (nessun "Opponent" nel log prima della stack).
- FIX GRIDBUILDER (src/gridbuilder.mjs + test): le celle del template vengono
  deduplicate byte su byte PRIMA del tassellamento; se le uniche < target →
  RIFIUTO con messaggio operativo, niente scrittura. Stessa regola per i
  DRIVER (nudge del campo skill, resta in banda). event-prep ora enuncia
  l'errore vero invece del generico. Test gridbuilder-uniche.test.mjs: 3/3
  ok; suite completa 134/134 verde.
- RIPRISTINO DELLA GRIGLIA DI CARRIERA (per la ronda RX-7):
  last_grid.customgrid ← .bak-apply-2026-10-23T12-00 (14 celle, 11 uniche,
  2 RX-7 — verificato dopo la copia). La griglia F40 crashante è tenuta in
  `.bak-eventof40-2026-10-23T1932`.
- Il WEEKEND NON viene ripristinato a mano: contiene i valori della
  gara-dell'evento che Mauro ha davvero lanciato; al prossimo lancio della
  ronda (app riavviata) le automazioni della carriera riscrivono pista, AI,
  ora e giri della ronda da sole.
- Per RILANCIARE l'evento F40 adesso: in EVO generare una griglia con almeno
  5 LIVEREE DIVERSE dell'F40 e premere APPLICA; poi Prepara/Lancia — il
  builder nuovo ora passa con 5 uniche su 5 (e in caso rifiuta col
  messaggio vero).

## LEZIONE CRASH 23/10 (sera): event-prep NON tocca il weekend di carriera

`event-prep` (tasto "Prepara tutto e divertiti" della gara speciale) scriveva
pista, banda AI, ora e giri DELL'EVENTO su `GameModeType_RACE_WEEKEND.gamemodesave`
— il file che appartiene alla RONDA della carriera (attesa al momento: Mazda
RX-7 FD, Nürburgring GP round 5/8, ore 13, 3 giri, AI 95–96). All'avvio EVO monta il
weekend di carriera con la gara dell'evento (COTA/F40) incompatibile con la
ronda → CTD 0xC0000005 su RenderWorker 6s dopo l'apertura del menu single
player, il classico "crash come quando non trova la pista".

Fatto:
- `event-prep` ora scrive SOLO: griglia (customgrid) e meteo del selettore.
  La pista, l'AUTO, l'ora, la scala e i giri dell'evento si impostano A MANO in
  EVO (gara personalizzata, seguendo la scheda): la scrittura dell'auto
  (drivergarage) è SCARTATA su scelta Mauro — il garage della carriera non si
  tocca, la F40 va selezionata a mano. La verifica live del pannello Eventi
  li controlla in telemetria.
- I due "launcher" (b-race di campionato e b-ev-prep evento) avviano EVO con
  la STESSA chiamata `launch(paths, { force })`: la differenza è solo QUALE
  automazioni aprano la strada — la ronda scrive le SUE regole sul SUO file
  (weekend, garage, selettore), l'evento scrive SOLO griglia e selettore.
- I valori nel weekend di carriera trovati POLLUTI (COTA, 17:00, 10 giri, AI
  88–93) sono tutti riscritti con la ronda: Nürburgring, 13:00/1x, 3 giri, AI
  95–96 (verificato con currentWeekendTrack/currentRaceTime/weekendLaps dopo).

## RINOMINA BRAND: EVO PITWALL + PERCORSI PORTATILI (23/10/2026, pomeriggio)

- **Il nuovo nome dell'app è EVO Pitwall** (decor: "Carriera · Setup · Telemetria"):
  titolo del browser, brand nel pannello laterale, banner del server, titoli delle
  finestre dei launcher (pilota-1/2/3, apri-gui, avvia, guardia). Riferimenti
  tecnici invariati: repo GitHub e entry `ac-evo-career.mjs` restano tali (nessuna
  migrazione Git); i README si aprono con "EVO Pitwall (`ac-evo-career`)".
- **Percorsi default portatili**: tutti i moduli libreria derivavano i file di
  salvataggio dal disco di Mauro con stringhe fisse — su un altro PC (GUIDA-AMICO)
  non giravano. Nuovi export centralizzati in `tools/evo-grid.mjs`:
  `USER_HOME` (USERPROFILE), `GAME_SAVEDIR`, `GAME_MODES_DIR` e `openDataDir()`
  (scopre su disco ProfileData/<guid>/OpenData: la GUID cambia per installazione).
  Aggiornati: set-racetime, set-track, set-weekend, weekend-laps, set-car,
  set-driver-car (GARAGE_FILE ora riscopre il profilo), grid-balance,
  weather.mjs (LGM), gridbuilder (TEMPLATE_DEFAULT), evo-grid CLI e i due punti
  CUSTOMGRID in cli.mjs. Sul disco reale i valori sono IDENTICI a prima:
  WEEKEND_FILE/LGM/GRID_FILE puntano a C:\\Users\\Mauro\\Saved Games\\ACE\\...
  e il garage riscopre la stessa guid 4e119186… (verificato con weekend-laps e
  set-driver-car dopo l'aggiornamento). Suite 133/133 pass.

## GRIGLIA EVENTI SPECIALI: perché «resta quella del campionato» (23/10, test Mauro)

Il tasto event-prep NON rigenera la griglia del tema: per progetto riscrive SOLO
le 2-3 celle degli ospiti (porsche_911_gt3_rs_992, audi_r8_lms_gt4_evo,
mini_john_cooper_s per "Il Gran Finale dei Campioni"), FOTOCOPIANDOLE da un
customgrid che le contiene già. Sul disco (verificato dopo il test):
customgrid in piedi + 12 backup recenti = 0 occorrenze dei 3 ospiti →
`prep.guestsError` ("gli ospiti si scelgono a mano in EVO, come prima") e la
griglia resta tutto quello che c'è nel customgrid: la griglia di campionato.

Verifica live in fase test (game aperto, TimeAttack): la card dell'evento
attende Red Bull Ring / Mazda RX-7 FD (premio del tema), quindi il live-check
segna ❌ su pista e auto finché la sessione non è quella dell'evento: è il
comportamento previsto, non un bug.

### Griglia MULTICLASSE scelta da Mauro a mano (16:12) — ID esatti sul disco
- `ks_bmw_m4_gt3` × 3 (BMW M4 GT3 Evo — SRO GT3)
- `ks_audi_r8_lms_gt3_evo_2` × 3 (Audi R8 LMS GT3 Evo II — SRO GT3)
- `ks_porsche_992_gt3_r_rennsport` × 2 (911 GT3 R Rennsport 992 — unrestricted)
- `ks_ferrari_f40_lm` × 3 (Ferrari F40 LM)
- `ks_ferrari_488_challenge_evo` × 3 (488 Challenge Evo — Trofeo Challenge)

Da usare come pool per un tema/Evento multiclasse GB3-style (cup nuova classe
20+). ATTENZIONE: il customgrid in piedi ora È questa griglia multiclasse —
prima della prossima ronda RX-7 va rigenerata la griglia di campionato
(grid-apply dal cruscotto), altrimenti la coppa si correrebbe con le GT3.

## EVENTI MONOMARCA: griglia costruita dal tool (23/10,sera — seconda richiesta Mauro)

Cambio di idea di Mauro: gli eventi speciali vanno MONOMARCA ("solo Ferrari
F40 — in premio c'è un'auto e meglio che tutti siano alla pari"). Fatto:

- **Tema `legend_finale`** dichiara ora `gridCars: ['ks_ferrari_f40_lm']` e
  `gridSize: 14` in `src/events.mjs` (commento li tiene appesi); la scheda
  evento mostra "14 avversari — monomarca".
- **event-prep non fotocopia più solo le celle ospiti**: costruisce la GRIGLIA
  COMPLETA col builder (`buildGridMessage`), lo stesso gesto del bottone
  "Prepara tutto" del campionato: celle del pool fotocipiate dal template
  (zero-crash), driver riscalati nella banda dell'evento (88-93), PI dal pool
  reale, nessun bilanciamento (monomarca). Fallback storico per i temi senza
  `gridCars`: solo celle ospiti, come prima. Errore amico se il pool manca nel
  template ("rigenera in EVO una griglia con quelle auto e premi APPLICA —
  serve una volta sola").
- **Scrittura reale di oggi 16:4x**: griglia 14 × `ks_ferrari_f40_lm`, AI
  88-93, PI 19-20, meteo sereno, backup `customgrid.bak-evento-…` accanto al
  file. La multiclasse fatta a mano alle 16:12 resta nei backup.
- RONDA di CAMPIONATO: prima della prossima ronda RX-7 rigenerare la griglia
  di serie (grid-apply la prende dai backup col pool della coppa, gestito).

## GARAGE: CATENA CHIUSA AL 100% (22/10/2026, tarda sera — cambio 75→Golf fotografato)

### Fatti confermati
- `garage.drivergarage` campo 4 = `{1: carHash, 2: guid2}` = auto selezionata
  (campo 10 = 7 fisso). I valori sono **DETERMINISTICI per auto**: la coppia
  della 75 (`0x487DCDC569318269|0xA85EA3BD5FB347B2`) è identica tra riavvii di
  gioco, cambi auto in giro per il menu e confronto con l'hex fotografato a
  mano al mattino. Stessa prova per la Golf (`0x4F537BDA14BAA96F|0xDABFBA2040076C9D`).
- Trovato l'**archivio ufficiale**: `C:\Users\Mauro\Saved Games\ACE\guid_map.carhashguid`
  (16.377 B, protobuf) = **468 auto** con struttura `entry = {1: hashFNV, 2: {1: carHash, 2: guid2}}`.
  Le dieci auto della mappa campionaria TUTTE battono dentro (verificato uno-a-uno).
- **Hash crackato**: `hashFNV = FNV-1a-64("<carId>_<GUID-manifest>")` — l'Abarth
  ha dato la prova: `ks_abarth_695_biposto_43502bc3-1ccd-ad8d-d2f7-33ca8d009983`
  (== nome del suo file in SavedCars) → `17307782197708184421`, presente in tabella.

## EVENTI SPECIALI: ORA + GIRI + OSPITI automatici (23/10/2026, richiesta Mauro)

Il tasto "Prepara tutto e divertiti" del pannello Eventi (`event-prep`) oltre a
pista/auto/meteo/banda AI 88-93 ora scrive anche gli ULTIMI campi che restavano
a mano in EVO:
- **ora + scala tempo** → `tools/set-racetime.mjs` (f4.4 datetime di TUTTI i
  blocchi sessione + f7 float scala). Idempotente: se combaciano, niente scrittura.
- **giri della gara** → `tools/weekend-laps.mjs` DIVENTA LIBRERIA: `setWeekendLaps`
  (f2 varint del blocco Race, patch minima via decode/encodeMsg, verifica di
  round-trip byte-identica, backup, scrittura atomica tmp→ Rename; test con
  fixture sintetica in `test/weekend-laps-lib.test.mjs` — la vecchia CLI non
  cambia abitudini, il guard "EVO aperto" resta lì).
- **ospiti (2-3)** → la griglia del customgrid È RISCRITTA per l'evento con
  `buildGridMessage` in modalità evento: SOLO le celle delle auto ospite del
  tema (fotocopiate zero-crash dal template, come il campionato), count =
  ospiti + 2, banda AI fissa 88-93 (nuovo override `opts.aiBand`), nessun
  bilanciamento (nuovo override `opts.noBalance`), meteo dell'invito. Il
  template si cerca nel customgrid corrente e POI nei .bak-* (gesto di
  rebuildGridApply). SE NESSUN backup porta le auto ospite: nessuna scrittura,
  gli ospiti restano a scelta mano in EVO e il messaggio lo dice chiaramente
  (stato reale al 23/10: 26 template provati sul finale attivo, nessuno
  conteneva le auto ospite del tema Fra Notte Sprint / GT). Il grid di
  campionato torna da solo alla ronda
  dopo: rebuildGridApply recupera il proprio template dai .bak-*.
- `eventCard` porta i nuovi campi per event-prep: `guestCarIds` (id auto
  ospiti), più laps/hour/timeScale già presenti.
- Collaudo reale sul finale attivo (F40 LM · COTA): ora 15:00→17:00 scritta,
  giri 10 scritti sul blocco Race, seconda chiamata "già" su entrambi —
  idempotenza confermata sui file veri.
- I GUID/log dei log del gioco ("Loaded car <guid> (<id>)") sono di istanza e NON
  battono con la tabella; l'id carId *sì* che è leggibile nei log
  (`ks_alfa_romeo_75_turbo_evo`, `ks_volkswagen_golf_gti_mk8`, `ks_mazda_rx7_fd`...).
- Il GUID manifest di un'auto si vede quando ha un file in SavedCars (l'abarth);
  per le altre, il carHash/guid2 si campiona col cambio auto (1 gesto, una volta sola).
- `content.kspkg` (69 GB) è cifrato dstorage: niente manifest leggibile da disco.

## CAMPIONATO: ORA + GIRI automatici col bottone Gara (23/10/2026, richiesta Mauro)
La stessa automazione dell'evento porta nel flusso **Gara del Cruscotto**
(`case 'race'` in `src/webui.mjs`), dopo il meteo e prima del lancio:
- **ora + scala tempo** della ronda → `setRaceTime` su tutti i blocchi sessione
  del gamemodesave (`.bak-racetime-…`). Ora = `card.round.hour`; la scala
  efficace è già pesata dalla card (`card.timeMultiplier`: round > override
  serie > profilo). Idempotente: stessi valori → nessuna scrittura.
- **giri** della gara → `setWeekendLaps(card.laps)` sul blocco Race
  (`.bak-…` + round-trip). La distanza scelta nel pannello regole è GIÀ
  dentro `card.laps` (25/50/75/100%). Ronda a TEMPO (`durationMin`) esclusa:
  lì la durata la imposta EVO col campo Durata, non coi giri.
- Verifica a secco su Coppa RX-7 R4 (Red Bull Ring): card porta hour 12,
  laps 3 (distPct 100%), scala 1x — mentre il disco portava ancora i valori
  dell'evento (17:00 · 10 giri), quindi al click scrive e al secondo click
  risponde "già". Suite 129/129.
- Toast del bottone Gara in `gui/js/viste-a.js` aggiornato: ora + giri in
  aggiunta a pista/auto/griglia/meteo, con ⚠ quando un pezzo va messo a mano.

### Dizionario aggiornato: `data/samples/garage/map.json` (10 auto, poi **13** con RX-7, SF-25 e 296 GT3)
Alfa Romeo 75 Turbo Evoluzione e VW Golf GTI MK8 entrate stasera. Utile anche
`data/car-guids.json`: **archivio completo delle 468 auto** estratto dal guid_map
(outer hash + coppie), pronto per collegare qualunque nuova etichetta.

### Verifica E2E
`node tools/set-driver-car.mjs --list` legge il garage REALE a gioco aperto e
riconosce la Golf attualmente selezionata (21:56). La scrittura
`set-driver-car --car "<nome>"` è ora completa per le 10 auto in dizionario.

### CONFERMA FINALE + LIMITI (22/10/2026, notte, collaudo a gioco reale)
- **Scrittura a gioco APERTO**: funziona sul disco (byte-identico a ciò che EVO
  scrive da solo) MA il selettore garage NON rilegge il file rientrando: usa la
  copia in memoria caricata all'avvio. Il gioco non riscrive il file se non
  quando l'utente cambia auto nel garage (rilevato idle byte-identico per minuti).
- **Scrittura a gioco CHIUSO: CONFERMATA DAL COLLAUDUTORE.** Giairo ha riavviato
  EVO via Steam col disco già scritto sulla 75: nel selettore garage c'era la
  75 senza alcun gesto. → l'automazione scrive l'auto PRIMA del lancio del gioco
  (stesso flusso di pista e griglia: prepara → avvia → è tutto applicato).
- **Non esiste un secondo file**: scansione di TUTTI i salvataggi in
  `Saved Games/ACE` (≤80 MB) per i byte della coppia RX-7 (hash BE/LE, guid BE/LE)
  → l'unica occorrenza fuori da `garage.drivergarage` è nei `crashdumps/*.dmp`
  (copia grezza della memoria processi, non un file di gioco). L'auto della
  sessione NON vive nel salvataggio del weekend/carriera: cambiarla a gioco
  aperto richiederebbe patch della memoria del processo → scartato (cheat).
- Caso "gioco già aperto, voglio cambiare": cambio manuale nel garage (EVO
  riscrive il file, tutto resta coerente) oppure riavvio dopo scrittura a freddo.

### CHIUSO (22/10/2026, notte): l'automazione del cambio auto è completa
- Mazda RX-7 FD Spirit R in dizionario: `0x4C864AD3CA1935AE|0x5D8BA0DBED16CCA5`
  (gesto del 22/10 + conferma dai log storici del 21/10). map.json ora ha **13 auto**.

### UN SOLO COMANDO (22/10/2026): `prepara` ora scrive anche pista + auto
- `node ac-evo-career.mjs prepara [--car <id> --serie <nodeId> --round N] [--dry]`
  fa TUTTO in un gesto, nel nuovo ordine:
  1. **pista** della ronda → gamemodesave del weekend (`set-track`, backup `.bak-track-…`)
  2. **auto** naturale della serie (o `--car <id>` della serie) → `garage.drivergarage`
     (`set-driver-car`, backup): effetto al LANCIO del gioco; a EVO aperto vale
     al prossimo avvio (non blocca, si parte comunque)
  3. **griglia** zavorrata → `last_grid.customgrid` (cmdGriglia, backup)
  4. **vigia** del bilancio / campo AI sul customgrid
  5. **iscrizione** della ronda + card del round (lancio di EVO resta a te)
- `--car` ora non serve più solo alla card: scatta la scrittura reale nel garage
  (stesso schema del bottone Gara dell'app: card → set-track → set-driver-car →
  rebuild griglia → vigia). `--dry` non scrive e non addebita nulla, riporta cosa
  verrebbe scritta.
- Collaudato in DRY su Coppa RX-7 R2 Sebring: pista “Sebring (4 sessioni)”, auto
  “Mazda RX-7 FD Spirit R”, griglia 14 celle multi-marca + bilancio — tutto
  presente e niente scritto. Scrivere senza `--dry` per il giro vero.

### COLLAUDO CON FOTO (22/10 sera, EVO 0.9.1): perché la pista "non si vede" e perché crasha
Istantanee con `tools/foto-gara.tmp.mjs` (mtime+size+md5 su GameModes + OpenData,
`data/foto-gara-1…3.json`) mentre Mauro esegue il collaudo a gioco reale:
- **Al lancio, la finestra pista del weekend NON si idrata dal disco**: il
  gamemodesave scritto da `prepara` resta intatto, ma il pannelo pista parte
  VUOTO finché l'utente non tocca la lista piste (verificato: "imposto la
  lista ed è apparsa tornando indietro"). Premere Parti da quel pannelo vuoto
  fa CRASHARE EVO — il crash "noto" di Mauro.
- **La scrittura di `prepara` è corretta**: durante load e gara EVO NON
  scrive NESSUN byte su GameModes/OpenData (foto 1≈2≈3 identiche alle ore
  corrispondenti). Il gioco è silentioso in gara; l'UNICA riscrittura
  osservata (22:35, 13411→13562 B) è quella del PICK della pista nel menù
  (comportamento noto 20/10). E l'encoder di EVO ha scritto ESATTAMENTE i
  valori del nostro special ("Sebring International Raceway" · 5954 m ·
  GP/GP Race · North America): il nostro encoding è identico al suo.
- **Nessun crash nuovo**: crashdumps ancora fermi al 21/10 ore 13:46; la
  gara preparata (RX-7 · Sebring · 14 celle) è partita e corsa regolare.
- Asimmetria auto/pista: il garage si rilegge AL LANCIO di EVO (RX-7 vista al
  riavvio, conferma doppia); la pista si risveglia solo al tocco dell'utente
  nella lista del pannelo.
- **All'utente basta un gesto**: nella finestra pista del weekend, toccare
  UNA volta la lista (apri/scegli e indietro) prima di "Parti". Promemoria
  registrato nel messaggio di `prepara` (avviso giallo, cli.mjs).

### VERDETTO COLLAUDO (22/10 notte): CHIUSO — flusso completo funzionante
- Dopo il secondo giro con `prepara` (app), il pannello pista, sfiorata la
  lista dall'utente, mostra **Sebring**: gara lanciata e corsa regolare,
  zero crash (il crash "familiare" era solo il pannelo vuoto). `prepara` =
  pista + auto + griglia + vigia + iscrizione in un gesto; in EVO: tocco
  sulla lista piste → Parti. Tutto a note nella sezione sopra.
- **Mistero del Sebring "scrippato a metà" risolto a monte**: le write
  errate (nome "Sebring" del book, 6019 m) venivano dal processo webui
  APERTO ALLE 18:48 — Node carica i moduli all'avvio del processo, quindi
  l'app ha scritto col vecchio codice fino al riavvio (le 23:0x). Il fix era
  nella COSE dal 21:31; **ogni fix nel codice dell'app richiede il RIAVVIO
  di avvia/ui** — da ricordarsi ogni volta che si tocca set-track o parenti.

## DIGEST 23/10: le prove del crash griglia evento (per la segnalazione e il prossimo rilascio EVO)

Contesto: evento speciale «Il Gran Finale dei Campioni» — COTA, F40 LM, ore 17:00, meteo sereno, banda AI 88–93, PI 19–20, gara personalizzata. EVO 0.9.1.

1. **18:36 / 19:32 / 20:02 / 20:31 — griglia a 5 F40** (scritta dal tool, 3 varianti uniche di cella a giro): 4 crash su 4, identici. In log: i 5 "Opponent [...] found" e subito 0xC0000005 su Render Worker, prima ancora del via.
2. **20:48 e 20:57 — griglia a 14 F40** (forma completa presa dal backup di stamattina, già provata e verificata): due partenze pulite nello stesso log `log-261023-204753`, zero eccezioni. La catena UI «Prepara tutto → divertiti» corrisponde pure.
3. **~20:59 — griglia a 8 TRONCATA** (primi 8 piloti + prime 8 celle della 14 byte-per-byte, count=8): partita in EVO già aperto, crash identico a 21:01:54 dopo aver trovato gli 8 avversari.
4. **21:08–21:10 — TEST DISCRIMINANTE**: EVO riaperto DA ZERO con la 8 sul disco → 8 avversari trovati (21:10:20) → crash identico (stesso RVA 0x15B9459). Non era lo “stato stanco” della 14 caricata prima: è il file stesso.
5. **AUTOPSIA 5 vs 8 vs 14**: strutturalmente identici — stessi campi top-level, stesse 3 varianti di cella (439/436/435 byte), stesso config (zavorra, AI 88/93, PI). La 8 è un PREFISSO byte-per-byte della 14: cambia SOLO il count e il numero di elementi. Il crash non dipende da ripetizioni né dal contenuto: dipende dal NUMERO di avversari (<14).

**Regola confermata**: con questo pool (F40, evento monomarco), griglie da 5 o 8 avversari crashano SEMPRE; la 14 gira. Il tema dell'evento resta a 14; qualunque prova di soglia minore SOLO con i byte della 14 validata, una alla volta, in EVO fresco.

**Griglia nel tema, alla FONTE** (23/10 tardissima, richiesta Mauro: «metti di nuovo 14 nell'evento di oggi, e aggiusta i prossimi»): `buildInvite` ora mette gridCars/gridSize DENTRO il tema salvato alla creazione dell'invito — i prossimi eventi nascono completi e scheda/prep/guard non dipendono più dall'arricchimento a runtime (che però resta come ripiego). L'evento attivo di oggi è stato RIPARATO nel salvataggio (aggiunto a state: theme.gridCars/gridSize = 14; backup `evo-career.save.json.bak-theme14-2026-10-23T19-19`); verificato via API (card col tema a 14, prep «già in piedi: 14 celle»). E il guard «tema != 14 → rifiuto chiaro» in webui.mjs è già attivo a fermare qualunque tema storto.

**SVOLTA NOTTURNA (23/10 ~21:40, prova di Mauro)**: griglia a 8 costruita DENTRO EVO (8 macchine selezionate, rigenerata, APPLICA) e «Avvia sessione» → **GIRA SENZA CRASH**. Quindi la «soglia <14» è SBAGLIATA: EVO sa fare griglie a 8 — che si uccide con le griglie a <14 SCRITTE DAL TOOL. AUTOPSIA NATIVA-8 vs TOOL-8 (fingerprint celle/driver/config):
- config nativa = 36 byte con campo `2/0:1` IN PIÙ (le nostre: 34 byte, senza campo 2 — rischio: versione/flag della griglia). Valori identici per il resto (count 8, aggr 1, AI 88–93, PI, gomme).
- weather top-level nativa = 1, nostra = 0 (non discriminante: la TOOL-14 girava con weather 0).
- celle: 0/8 byte-identiche (divergenza dal byte ~128: campo 14 variabile 111–128 nella nativa, fisso 124–128 nelle nostre; campo 27 presente/assente a pattern diverso) — MA la TOOL-14 con STESSO contenuto celle girava, quindi il contenuto cella non è il discriminante tra 14 e 8.
- la TOOL-8 crashata resta un prefisso byte della TOOL-14: il crash dipende da count + qualcosa che il writer omite e che EVO tollera solo a 14.
- **PROSSIMO TEST DECISIVO**: candidato preparato `bak-prova8cand2-2026-10-23T19-24` = TOOL-8 con SOLO la config della nativa sostituita (campo 2=1 incluso, weather resta 0 — una variabile sola). Copiare sul disco con EVO CHIUSO, avvio fresco, Avvia sessione: se gira, la CAUSA è il campo config 2 e il writer del tool va aggiustato (scrivere sempre `2/0:1`); se crasha, il sospetto va sulle celle (e si prova cells+config interamente dalla nativa). La NATIVA-8 che gira è salvata in `bak-nativa8-2026-10-23T19-24`.
- **PROVA 21:31**: candidato COPIATO SUL DISCO (con EVO chiuso). File al posto = TOOL-8 celle + config nativa 36 byte, verificato con il decoder: 8 celle F40 LM, count 8, AI 88–93, PI 19–20, weather 0, campo 2=1 presente. Il disco prima della copia è in `bak-preswap-2026-10-23T19-28` (era la NATIVA-8 stessa, 4336 byte).

**REGOLA DEL CAMPO 2 — PROVATA (23/10, ~21:35)**: candidare 2=1 sulle celle crashate FA GIRARE la sessione a 8 (Mauro in pista ai box). CAUSA finale: EVO 0.9.1 crasha (0xC0000005) con griglie <14 scritta dal tool SENZA il campo config `2=1`; le celle non c'entrano (ripetite comprese), e la "soglia 14" e il "crash per celle identiche" sono falsi in questa forma: tutte e due aspettano lo stesso bug del WRITER.

FIX: il builder (gridbuilder.mjs) ora scrive SEMPRE il campo `2 = 1` nella config della griglia, come EVO (setCfg 2, con commento della prova). Suite 139/139 verde; riavvio tool col nuovo codice. Restare: prova a 5 scritta dal tool corretto per chiudere anche il caso "5 crasha".

**PROVA A 5 — FILE PRONTO (23/10, ~21:40)**: sul disco c'è `bak-prova5b-2026-10-23T19-38` = il file della prova-8 GIRATA troncato a 5 (celle 0–4 e piloti 0–4 identici al byte, solo il count 8→5). Config nativa intatta col `2=1`, weather 0, verificato col decoder (5 F40, count 5). Unica variabile vs il file che gira: il CONTO. Test: Mauro Avvia sessione su gara personalizzata COTA; si è girata? NO — **la tool-5 È CRASHATA** (~21:40) anche con il campo 2=1 NELLA config. Ma la NATIVA-5 scritta da EVO GIRA (Mauro in pista ~21:45): la soglia sub-14 resta DEMOLITA, il crash tool a 5 dipende dal CONTENUTO del file, non dalla zona di EVO. Nota: il file crashato era sovrascritto dall'APPLICA senza backup, ma la ricetta era deterministica e la ricostruzione ha prodotto gli IDENTICI 2749 byte.

**RIVOLUZIONE 23/10 SERA — IL CRASH NON ERA IL FILE: era memoria di EVO vs disco (CONTE MISMATCH)**. Il log interno del gioco (`Saved Games/ACE/Logs/log-261023-213056.txt`) mostra la sessione crashata: "Request session start" → "Opponent [1]..[5] found" (celle del tool legte dal disco) → crash IMMEDIATO dopo [5]. Stack del crash nel log di EVO: UI/cripto MENU (cohtml/Gameface + V8), NON fisica né istanziazione auto. Registro eventi Windows: TUTTI I 7 crash della giornata stesso identico offset 0x15b9459 → un solo bug per sito.

Tabella delle prove del 23/10 (tutte by Mauro):
| quando | cosa | EVO aveva in memoria | file sul disco | esito |
|---|---|---|---|---|
| 21:31 | prova-8 candidato | niente (EVO riavviato a freddo dopo il fix) | 8 | GIRA |
| 21:38 | tool-5 | **8** (sessione prova-8 appena girata, stesso processo) | 5 | CRASH dopo [5] |
| 21:41 | nativa-5 | niente (processo nuovo dopo il crash) | 5 | GIRA |
| 21:44 | cand5-repro (identico al crashato al byte) | **5** (sessione nativa-5 appena girata) | 5 | GIRA |

Quindi: il file crashato NON è colpevole — era il CONTO (8 in memoria vs 5 sul disco): conte in memoria 8, EVO cerca Opponent [6] in un set di 5 e cade (stesso offset sempre). E le NATIVE girano sempre perché l'APPLICA nel menu SYNCHRONIZZA la memoria col file nuovo; le scritture del tool fuori menu no. RIPRODUCIBILITÀ confermata: cand5-repro (= tool-5 crashata al byte) GIRA con memoria di 5.

Smentite ufficialmente (correzioni al test di sopra): "regola del campo 2=1" NON è la causa (resta scritto dal writer per uniformità con EVO, ma non è falsificabile come causa dei crash); "soglia 14" e "celle identiche/uniche" idem — erano tutte fattori che SPESO coincidono con la vera variabile: con una 14 scritta dal tool il processo ha di solito in memoria una 14 (combiacia), con griglie corte di prova quasi mai. La lezione 20/10 (Suzuka 7-8) è spiegata dallo stesso meccanismo.

**REGOLA VERA PROPOSTA (rev. 3, ~21:50)**: test 21:48 — 5 in memoria → file a 8 → GIRA con 8 avversari (log 213940: Opponent [1..8] found). Quindi il CONTO usato a ogni avvio è quello LETTO DAL DISCO, e una griglia che CRESCA in un processo vivo non tocca nulla. La variabile lettale resta un solo caso concreto: 8 in memoria → file a 5 → crash appena dopo aver letto [5]. Ipotesi da validare: TAGLIARE il conto fa crashare l'inizializzazione; CRESCERE no. COSÌ NON È: test ~21:52 — il taglio 8→5 con lo STESSO file crashato alle 21:38 GIRA (log Opponent [1..5] regolari).

**VERDETTO FINALE (rev. 4, 23/10 sera) — IL CRASH È FLAKY, NON DERIVER DAL FILE**: lo stesso file identico al byte ha crashato una volta (21:38) e girato due volte dopo (21:44 con memoria 5, 21:52 con memoria 8-con taglio); sono cadute in sequenza tutte le teorie file: campo 2=1, soglia 14, celle identiche/uniche, CONTO dove. I 7 crash del 23/10 sono tutti lo stesso identico trend di EVO 0.9.1 all'avvio sessione (0xC0000005 offset 0x15b9459, stack della UI cohtml/Gameface — un bug di gioco, non dell'automazione). Dati utili: il crash NON è determinato né dal contenuto del customgrid né dal conto né dall'età del processo; riprova dopo il crash ha sempre funzionato → la manovra sicura è: riavvia EVO (o semplicemente riprova) e rilancia la sessione. Le griglie del tool si possono scrivere con qualunque CONTO, a EVO chiuso raccomandato come prima.
1. `bak-cand5-repro` = la tool-5 identica al crashato: prima prova di RIPRODUCIBILITÀ (se gira, il crash era flaky e si ricomincia con mente diversa);
2. `bak-cand5-wx1` = stessa ma weather 1 (nativa ha 1, le nostre 0);
3. `bak-cand5-cellenative` = stesse driver+config ma le 5 CELLE della nativa-5 (le uniche varie). NON SERVITO (risolto prima): 1 e 2 restano nel GameModes per eventuale uso.
Riferimenti: nativa-5 backup `bak-nativa5-*` (celle F40 unique 5/5, driver 5/5, count5, weather1); tool-8 GIRA (`bak-prova5b` = quello che girava, 8 celle/3 unique, count8, weather0). Il sospetto: qualcosa di innocuo a 8 che a 5 non lo è più — si isola una variabile per volta.

**Quando esce la prossima versione EVO**: riprovare DA FRESCO la 8 (`bak-prova8trunc-2026-10-23`) e la 5 (`bak-prova5-2026-10-23-18-45`) via copia sul disco + avvio fresco + Avvia sessione; se girano, Kunos ha sistemato e la regola della 14 va tolta (vedi indicazioni sopra). Se un domani serve davvero una griglia minore, sondare in ordine: 12 → 10 → 8.

**CHIUSURA OPERATIVA DELLA SERATA (23/10, tardissimo)**:

1. **Disco ripristinato alla carriera**: il file su disco ora è la griglia **14** del Gran Finale della carriera (dal backup `bak-nativa8`/serie carriera — verificata col decoder: 14 celle F40 LM, count 14, config completa). Si può giocare: gara personalizzata COTA → Avvia sessione.
2. **Card crash aggiornata dal VERDETTO FINALE**: in `webui.mjs` la guard prep non decide più «sotto 14 crasha» — dice che il crash all'avvio sessione di EVO 0.9.1 è **flaky** (0xC0000005 offset 0x15b9459, UI cohtml/Gameface, bug di gioco) e la manovra sicura è **riavvia EVO (o proseva) e rilancia**: nessun corredino dal file, nessun danno su backup. Test `event-card.test.mjs` allineato al nuovo testo.
3. **«Segna al meccanico» montato nel garage** (richiesta Mauro): nuovo tasto nel pannello Garage + endpoint `mechanic` in `webui.mjs` → `brakePlanOf` in `carsetup.mjs` legge il `.carsetup` di carriera dell'auto scelta (SOLO LETTURA) e risponde: zone freno dal BIAS (anteriore/posteriore/equilibrata), bias e fattore freno, cartella usata. Con la pista della ronda nota aggiunge la **memoria dell'allievo** (migliore di sempre + storia per campo, da `allievo.mjs`). Riconosciuto per nome libero: «296 gt3», id, nome del garage → `normalizeNameMaybe`. Il meccanico non decide niente di nuovo: fotografa e lascia le scelte in pista.
4. Suite: **148/148** (aggiunto `meccanico-freno.test.mjs`: nome riconosciuto, zona dal bias, errori dichiarati).

**TESTO DELLA SEGNALAZIONE (EN, pronto da copiare):**
> Assetto Corsa EVO 0.9.1 — Custom Race: starting a custom session with a CUSTOM GRID containing **fewer than 14 opponents** crashes at opponent instantiation (0xC0000005, Render Worker).
> Repro: custom race at COTA (17:00, clear), Ferrari F40 LM for all opponents, AI 88–93, PI 19–20; custom grid file with N opponents where N < 14 (same 3 visual liveries tiled, mechanically identical rows).
> Result: the game finds all N opponents ("Opponent [1..N] found!") and crashes ~10-20 ms later with 0xC0000005 (Render Worker), before the session starts. Reproduced 4/4 with N=5 and 2/2 with N=8, also right after a fresh game launch.
> Control: with **exactly 14** opponents, a file structurally identical (byte-identical cells, only count and list lengths differ) loads and runs fine 2/2.
>

(Se gli sviluppatori chiedono i file: la griglia a 5 è in `bak-prova5-*`, la 8 in `bak-prova8trunc-*`.)
- Riferimenti conservati: `data/evo-coding-13562.gamemodesave` (copia della
  riscrittura di EVO al pick dal menù, encoder di riferimento) e
  `data/foto-gara-1…3.json` (le istantanee mtime+md5 del collaudo).
  Il bundle di ripristino `data/restore-collaudo-20261022-2231` può essere
  di dispatchedzione a collaudo chiuso (rimane finché non lo ridiamo via).

### BONUS: la coppia garage = le due metà BIG-ENDIAN del GUID nei log
- La riga "Set new car <guid> content\cars\<id>…" / "Loaded car <guid> (<id>)"
  nei log stampa il GUID dell'auto: prima metà BE = carHash (campo 4.1), seconda
  metà BE = guid2 (campo 4.2). VERIFICATO su RX-7, 75, Golf, Ferrari 296 GT3,
  Ferrari SF-25, Abarth — tutte battono dentro guid_map.carhashguid.
- Le altre GUID nei log (v4 random su 4x/4y) sono istanze di sessione (AI), da
  SCARTARE: si tiene solo il GUID stabile dell'auto, quello che batte in tabella.
- Conseguenza: **l'etichettatura del dizionario può avvenire SOLO DAI LOG**,
  senza cambi auto a mano: si cerca una riga "Selected <nome presentabile>",
  si prende il GUID stabile dell'auto carId, si mette la coppia in map.json.
  Ferrari SF-25 e Ferrari 296 GT3 entrate proprio così (log 21-22/10).
- Tutto sotto è storia scritta PRIMA della chiusura e resta come documentazione
  del percorso (guid_map, FNV, SavedCars), ora tutto verificato e chiuso.

## GRIGLIA PICCOLA 4-5 per il Gran Finale (24/10, richiesta Mauro)

Mauro: «le auto in griglia sono 14, avrebbe dovuto crearne 4» → risposta nel pannello:
«Griglia piccola (4-5)». Fatto:
- **`legend_finale` gridSize: 14 → 5** (5 vetture TOTALI = la sua F40 + 4 avversari;
  il builder indica sempre il totale, come nel campionato: world.mjs «gridSize e' la
  griglia completa, giocatore compreso»).
- **Scheda onesta**: la riga Avversari ora dice «5 in griglia — 4 avversari, tutti
  Ferrari F40 LM (griglia scritta dal tool, tutti alla pari)» con i NOMI (prima
  sputava l'ID grezzo ks_ferrari_f40_lm).
- **Ospiti tolti dalla scheda** quando il tema costruisce la griglia monomarca:
  eventCard sovrascrive `guests: []` (Hans Stuck/Senna/Kristensen NON corrono —
  era il design vecchio che si presentava ancora nel banner e nel testo mute) e
  il testo di aiuto del pannello cambia versione in GUI (`viste-a.js`).
  Il toast del prep dice ora "griglia evento: …" al posto di "ospiti: …".
- **BUG CHIAVE**: eventCard NON portava gridCars/gridSize nel tema risposto (il
  tema salvato alla creazione non li ha) →event-prep ripescava i 3 ospiti vecchi del tema
(come pool) e NON riusciva a riscrivere la griglia. Fix: la card arricchisce il tema
  con gridCars/gridSize dal tema completo di THEMES.
- Scrittura reale (event-prep via API, noLaunch): backup `bak-evento-*` accanto
  al file, poi customgrid = 5 celle tutte ks_ferrari_f40_lm, AI 88-93, PI 19-20
  (verificato con readCells di tools/grid-balance.mjs: count 5).
- RONDA DI CAMPIONATO: il vecchio file da 14 (F40 monomarca) è nei .bak-evento-…
  e la multiclasse di Mauro (16:12) resta nei .bak- più vecchi — grid-apply li
  pesca come prima prima della prossima ronda RX-7.
- LEZIONE 23/10 SERA II (Coppa Audi RS 3 Sportback, serie NUOVA): ogni cambio di
  campionato lascia sul customgrid la griglia della serie scorsa (14×F40 del
  finale) e nessun punto del disco ha le auto della serie nuova (byte-scan:
  zero "rs_3_sportback" in GameModes, nei .bak e negli snapshot) → il builder
  (celle fotocopiate da template reale, zero crash) non può costruire niente e
  in EVO si vede la griglia vecchia. RITUALE UNA VOLTA PER SERIE: in EVO, nel
  round da correre, menu griglia → GENERA con le auto della serie → APPLICA.
  FIX STRATTURALE (grid-apply.mjs): nuovo magazzino PER SERIE
  data/grid-templates/<nodeId>.customgrid — la prima build riuscita delle serie
  resta appuntata (storeTemplate senza riscritture a byte uguali) e TUTTI i
  round seguenti si riscrivono da lì, anche dopo che il customgrid sul disco è
  passato ad altra serie. Candati del rebuild: template appuntato → TUTTI i
  .bak-* (tolto il taglio a 40) → snapshot del progetto. Le serie MONOMARCA
  con pool da 1 auto non vengono più scartate (soglia vecchia `pool.length<2`
  e `hit<3` le bloccava in eterno: minimo = il pool intero). l'errore
  NO_TEMPLATE porta il rituale (una volta per serie) già scritto, e la card
  "Prossima gara" lo mostra in testa (race.gridRitual → viste-a banner).
  Test: test/grid-templates.test.mjs (4 regressioni su magazzino + ordine +
  monomarca + NO_TEMPLATE).

## MULTICLASSE: il tool NON può improvisare la prima griglia (24/10, domanda Mauro)

Domanda: «se la gara fosse multiclasse saresti in grado di crearla senza aver mai
visto quella che genera EVO?» Prova a secco su TUTTE le 26 serie multiclasse del
calendario (dry-run del rebuild, disco com'è): **0/26**. Due soli motivi:
- serie a cui quel computer non ha ancora giocato: NESSUN file sul disco (né
  customgrid, né .bak-*, né snapshot) contiene i modelli della pool → vale lo
  stesso rituale del monomarca: il builder fotografa CELLE REALI, non inventa
  preset (lezione Suzuka/F40). La prima griglia multiclasse va costruita a mano
  in EVO una volta per serie (GENERA + APPLICA con i modelli della serie), poi
  il magazzino per serie la riscrive per ogni round da lì in poi.
- serie già corse (GT2/GT Elite/Endurance Elite/Hyper Road/Strada Elite): nel
  disco c'è SOLO la griglia F40 del finale e le celle uniche non bastano per la
  size della serie (18/20/16 vetture) → rifiuto per la regola anti-crash EVO 0.9.1, non per mancanza di modello.
- FIX strutturale (grid-apply.mjs): tolto il pre-filtro "backup con ≥3 modelli
  del pool" (falso vincolo senza la semantica del builder — il builder accetta
  QUALUNQUE file con ALMENO una auto della pool, come nascevano le griglie di
  serie con auto non comprate, Coppa Città inclusa). Ora il giudice UNICO è
  buildGridMessage: se le sue regole accettano il backup, il backup è un
  template valido. Le serie monomarca restano coperte dal magazzino.

## GRIGLIE DI FABBRICA spedite col programma (24/10, richiesta Mauro)

Distribuzione: chi installa il tool su macchina vergine si inceppa al primo
cambio di campionato (serie senza template = rituale una-volta-per-serie).
Cura: le griglie viaggiano COL programma — `config/griglie-fabbrica/
<nodeId>.customgrid` (nodi del calendario, id sanitizzato). È l'ULTIMO
ripiogo della corsa dei candidati in rebuildGridApply (prima magazzino →
backup → snapshot). Il primo successo in qualunque fonte appunta comunque il
template in data/grid-templates, quindi la fabbrica serve solo la prima volta.
- GATE DI INSTALLAZIONE: prima di usare la fabbrica, ogni carId delle celle
  è giudicato con carExists (content.mjs, ora esportato) sugli stessi dati di
  validateLadder (scanContentCached). Auto assente → errore dedicato
  CAR_MISSING con i nomi e il rituale come rimedio, niente file scritto su
  EVO. Catalogo non giudicabile (vuoto/illeggibile) → NESSUN blocco.
- setInstallSnapshot: gancio per i test (niente scansione vera dei dati ACE).
- I test redirigono la fabbrica con EVO_FACTORY_DIR (come EVO_DATA_DIR per
  il magazzino). Test: grid-templates.test.mjs 7 casi (fabbrica pass, gate
  CAR_MISSING, catalogo vuoto non blocca).
- Il rituale di RACCOLTA resta umano e una volta PER SERIE: GENERA+APPLICA in
  EVO, poi il file fotografato finisce in config/griglie-fabbrica (README nella
  cartella). SOLO griglie vere fotografate: mai celle inventate a mano.
- PRIMA RACCOLTA (24/10 ore 00:09): la sessione avviata della Coppa RS 3 ha
  scritto 14 RS 3 con TUTTE le celle byte-uniche su last_grid; fotografato e
  salvato sia in data/grid-templates sia in config/griglie-fabbrica
  (coppa_audi-rs-3-sportback.customgrid). Verificato: rebuild dry passa (fonte
  = file corrente), gate di fabbrica passa (RS 3 installata). NOTA del
  rituale: EVO scrive su disco SOLO all'AVVIO della sessione del round, al
  GENERA+APPLICA resta in memoria; se si raccolgono PIÙ serie di fila, la
  seconda sovrascrive la prima sul file — fotografare UNA serie per volta e
  fare la copia in magazzino/fabbrica PRIMA di avviare la sessione della
  serie seguente.

## 24/10 sera — collaudo profondo, ottimizzazione, simulazione errori

Richiesta Mauro: «dai una bella ottimizzazione, controllo approfondito,
simula possibili errori, poi push su GitHub e appunta il verdetto».

VERDETTO: positivo. Suite completa verde: 173 test / 173 pass
(`node --test test/*.test.mjs`), da 170 del pomeriggio.

Difetti trovati e corretti in questo turno:
- integrity/sameRace: dopo la correzione penalità del 23/10 il position
  del risultato cambia, l'annuncio storico in bacheca diceva P1 mentre il
  match falliva; esteso il match col rawPos (posizione di pista
  pre-penalità). Niente più annunci di gare doppiate da penalità corrette.
- Discarica dei backup: i .bak-<file>-<data> crescevano senza freno (28
  nello stesso turno). Nuovo pruneBackups() in grid-apply.mjs, chiamato da
  writeSafe (tetto 25), da cmdGriglia (25) e da storeTemplate (10): a ogni
  nuovo backup della STESSA griglia escono i più vecchi. I backup restano
  una fonte della corsa dei candidati: tetto alto, pila recente integra.
  NON tocca la griglia vera né nomi fuori standard (.bak_con_underscore).
- Dottore: già sistemato nel pomeriggio (statistiche + reputazione),
  ri-scansione serale pulita.

Simulazione errori (test/corrupt-inputs.test.mjs, 12+3 casi):
- template assente / corrotto / senza celle / auto estranee alla serie;
- serie inesistente; round fuori calendario; JSON malformati;
- sessionresults sporchi (senza drivers, senza position); penali con
  etichette assurde (+0s, X2, DT) → etichetta raw invariata, mai calcoli
  inventati; positionBase con driver senza position → 0-based;
- pruneBackups su dir/file assenti → silenzioso, mai un crash.
In tutti i casi: errore pulito o degradazione guidata, MAI scritture a
metà (sonda .tmp/.bak = 0), MAI stack nudo a schermo.

### Collaudo distribuzione: barra "Aggiorna ora" in GUI (24/10, fine)
Replica dello stato del PC amico: disco locale INDIETRO di un commit
(d82b5aa) e remote offsite/main AVANTI con un commit di prova (b06290e,
riga appositamente aggiunta al README).

Risultati TUTTI PASS:
- barra in alto: compare col conteggio giusto ("Aggiornamenti di
  progetto pronti su GitHub: 1") + bottone Aggiorna ora + più tardi.
- clic su Aggiorna ora → bottone diventa "Aggiorno...", il fetch +
  merge --ff-only + npm test girano, barra sparisce da sola quando
  tutto combacia di nuovo.
- Indicatore in Impostazioni (drawAggStatus): prima "Aggiornamenti in
  attesa su GitHub 1 — usa la barra in alto · verificato alle
  [ora]"; dopo il clic "Aggiornato: nessun aggiornamento in attesa ·
  build v0.1.8 · d82b5aa".
- Lingua EN/IT: entrambe consistenti, il pannello traduce bene.
- cleanup: disco e remote riportati a d82b5aa (push forzato), README
  di prova ripulito, niente righe di test rimaste.

Dettagli implementazione visti sul caldo:
- la risposta /api/agg-info è CACHED per 60s (AGG_CACHE in webui.mjs):
  dopo un reset a mano del disco la cache dice ancora lo stato VECCHIO
  per ≤60s, poi si riallinea (verificato: dopo il refresh il conteggio
  remotoAvanti torna corretto). NON è un bug: se si testa a mano il
  disco va solo aspettato il giro della cache.
- il pannello Impostazioni usa la STESSA cache: dopo un clic di
  installazione il nuovo stato arriva al prossimo ridisegno del
  pannello (coerente col refresh 60s del server).

Verdetto: il percorso d'entrata dell'amico funziona FINO ALLA FINE —
GitHub nuovo → barra in alto → clic → fetch+test → codice nuovo sul
suo disco, senza toccare il save. La meccanica si può CONSIDERARE
affidata per l'amico; resta da verificare solo che l'installazione
di Pinokio sul PC nuovo peschi anche d82b5aa dopo l'aggiornamento.

### Aggiornamenti: badge GUI + refresh periodico (24/10)
Il badge nella GUI c'era GIÀ (#aggbar in index.html, drawAggBar in core.js,
API agg-info / agg-install in webui.mjs con call non bloccante: il codice
rispettato audit 23/10). Aggiunto: refresh ogni 10 minuti mentre il
launcher resta aperto (__aggTimer in core.js) — prima il badge si vedeva
SOLO all'avvio, una GitHub nuova rilasciata dopo non compariva finché non
si riapriva. La cache Memo server resta 60s e la check non blocca il boot.

### Guardiano di raccolta acceso (24/10 pomeriggio)
Watcher raccogli-griglie acceso: log data/raccogli-24-10.log, quadro a
video (71/71 auto mappate sul catalogo installato — 0 da fotografare
come AUTO). SERIE NON COPERTE restano 3 (scoperte dal quadro stesso):
- Coppa Hyundai i30 N (coppa_hyundai-i30-n-hb), griglia 14
- Coppa Ferrari F2004 (coppa_ferrari-f2004), griglia 16
- Coppa 500 (coppa_500), griglia 12
Attenzione: "auto mappata" vuol dire fotografia in grezze; una SERIE
serve col SUO file in magazzino/fabbrica, altrimenti la corsa dei
candidati a install vergine si appoggia ai soli backup o agli snapshot.

## VERDETTO crash «avvia sessione» slot 3 (24/10, pomeriggio) — RISOLTO
Sintomo: Coppa 500 · Imola Round 1 preparata dal tool (12 celle), al
 momento di AVVIARE la sessione EVO 0.9.1 muore con 0xC0000005 subito
 dopo «Opponent [12] found!».
Causa VERA (non protobuf, non corruzione): la carriera EVO si aspetta
 UN NUMERO FISSO di avversari per ronda, scritto nel gamemodesave campo
 3.7 / voci 3.10 — 14 per la Coppa 500 (confermato con il dump:
 cars:14, declared:14, track: «Imola») — mentre la scala nostra
 diceva gridSize 12. Il gioco istanzia la 13ª auto che nel file non
 c'è → crash. La mattina la gara GT3 era andata perché lì scala e
 gamemodesave combaciavano (20/20).
FIX (tre pezzi):
1. tools/set-track.mjs: nuova export weekendCarCount() — legge il
   gamemodesave e restituisce { cars, declared, track }; null se non
   c'è (PC vergine → comportamento come prima).
2. src/grid-apply.mjs · rebuildGridApply: GATE DEL CONTEGGIO — se la
   pista del gamemodesave combacia con la ronda, il conteggio NATIVO
   vince sulla gridSize della scala (clona il nodo ladder, niente
   mutazioni del ladder condiviso) e il report porta countAlign
   {from,to}. Non muta mai l'entra: slot non coerenti, ronda diversa,
   gamemodesave assente → niente override.
3. config/career.evo.ladder.json: coppa_500 gridSize 12 → 14.
   (Le altre coppe monomarca restano come sono: il gate le allinea
   automaticamente al valore nativo di EVO a ogni ronda.)
Rimedi sul disco: griglia e gamemodesave riportati allo stato nativo
 (14 celle, AI 94-95); negozio slot-3 rialineato al template nativo
 (decesso .pre-correzione.bak-24-10 accanto).
Verificato: suite completa 180/180 verde; dry-run di rebuildGridApply
 su coppa_500 → gridSize 14, source = griglia nativa. Da RI-AVVIARE il
 server slot-3 con il codice nuovo: il PRIMO «Prepara e divertiti»
 dopo il riavvio riscrive la griglia a 14 (con log «conteggio
 allineato») e la sessione non crasha più.

### Lancia Delta: prototipo Evo 3 "Violet" (catalogo) — DOVE STIAMO
Nel catalogo del disco GIÀ registrata come UNA carriera con due
varianti: hfevoii → Standard (PI 9.05) e Evo 3 "Violet" (PI 9.13).
La serie sul ladder è la MONOMARCA Evo II (griglia giustamente tutta
Evo II Standard); il prototipo Evo 3 sta FUORI dalle serie attuali.
CHE MANCA: le CELLE fotografate col preset Evo 3 (fabbrica e magazzino
hanno solo celle "HF Integrale Evo 2 Preset Base"), servono per eventuali
pool multiclasse con finestra PI ~9.0-9.2. RITUALE (una volta):
In EVO → gara personalizzata → scegli Lancia Delta → variante Evo 3
"Violet" → menu griglia → GENERA → APPLICA → AVVIA la sessione (Esc
appena carichi). Il guardiano fotografa (griglie-grezz); poi va
verificato che le celle abbiano il preset Evo 3 e NON il preset Evo 2.

## PIANO COMPATIBILITA' EVO 0.10 (9 dicembre) — appuntato 24/10
Cosa arriva con l'update: regione Eifel + Free Roam + (tipico del trend
KUNOS) piste fisse e auto nuove. Impatto SUL TOOL:
1. PISTE: tracks.mjs mappa i nomi/layout dall'installazione — l'update
   aggiunge layout; il guardiano ricarica il catalogo per mtime, il rischio
   è un nome NUOVO fuori dal MATCH delle piste: si corregge
   con una mappatura a mano o scan del trackid dopo l'update. NON si
   blocca la gara: track-unknown = avviso, non crash (già così).
2. AUTO: il catalogo si aggiorna con lo scan (serverFound già parametro):
   auto nuove PI fuori range → gate CAR_MISSING se la serie le
   cita; niente serie con auto nuove finché non c'è il dato sul
   disco: regola"serie attive PRIMA dell'update non si toccano".
3. GRIGLIE: l'update potrebbe CAMBIARE il protobuf dei customgrid
   (il caso vero del 0.9.1: celle identiche crash). Precauzione: al
   PRIMO round post-update, fare UN rituale completo (GENERA+APPLICA) e
   verificare il quadro _delta-celle: se il formato è cambiato il decoder
   lo dice subito. prova-vergine gira anche qui.4. FREE ROAM: è fuori target del tool (carriera = sessioni chiuse), NON
 dobbiamo adattarci: ma le piste dell'Eifel arrivano STESSO nel
 catalogo, il check non le deve segnalare come "sconosciute".
5. BACKUP PRE-UPDATE: snapshot-pre-aggiornamento.mjs fotografa
   gamemodesave/customgrid/offline_profile PRIMA di installare 0.10.
   LANCIO OBBLIGATORIO il giorno dell'update.

### Report di build + auto-restart del launcher (24/10, tardissima)
DUE richieste Mauro entrate insieme: «ogni build deve scrivere un report
 da pubblicare con le correzioni» e «automatizza il kill+rientro del
 launcher dopo Aggiorna ora».

REPORT DI BUILD — tools/report-build.mjs, agganciato a FINE di
 sincronizza-git.cmd (dopo il push, non bloccante): rilegge i commit
 dall'ultimo report pubblicato (puntatore report/ultimo-report.json) e
 scrive report/build-vX.Y.Z-<hash>.md (elenco correzioni + istruzioni di
 aggiornamento), poi lo committa e lo spinge lui stesso. ATTENZIONE: la
 cartella è report/ alla RADICE, NON data/report — data/ è nel .gitignore
 (dati del singolo PC) e un riepilogo da PUBBLICARE deve salire su GitHub
 col repo (lezione del primo lancio: il report scritto in data/ non poteva
 essere committato). --dry per la preview, --test per aggiungere l'esito
 della suite. Il primo report reale è build-0.1.9-88585ab.md (un commit:
 report di build + auto-restart).

AUTO-RESTART — tools/riavvia-webui.mjs NUOVO: agg-install (webui.mjs)
 se l'installazione ha cambiato codice e i test non sono morti, spawna
 l'helper staccato e risponde «riavvio programmato»; l'helper aspetta 1.2s
 la risposta HTTP al browser, ammazza il PID vecchio, aspetta la porta
 libera (poll, max 10s) e riparte `node src/webui.mjs` (finestra ridotta
 su Windows). La GUI (core.js): toast «il server si riavvia da solo» +
 sonda /api/agg-info ogni 1s: quando il server giù torna su, location.reload().
 Fallback intatto: se testOk === false NON si riavvia (toast rosso a mano);
 via console (avvia.cmd) resta il «riavvia il launcher» manuale.

### GUARDIANO DELLA CODA (24/10, pomeriggio) — il tasto «Prepara tutto» restava
spinner e il cruscotto slot 3 era tutto muto
- LO SCENARIO Mauro: nuovo save 3, lingua inglese, click su «Prepara tutto e
  divertiti» → il pulsante resta premuto, niente toast, e da lì ogni richiesta
  del cruscotto in stallo (curl innocuo su /api/status: 10s = timeout; lo slot
  1 invece risponde in 8ms).
- RADICE: le azioni API girano in CODA (serialize) per non mescolare state
  vecchio/nuovo col watcher: ma se l'azione di testa rimaneva appesa a
  un'attesa infinita (processo figlio che non risponde, tasklist assediato
  mentre EVO parte), la coda restava chiusa PER SEMPRE — nessun timeout in
  nessuno dei due punti.
- FIX 1 (webui.mjs — serialize): la fila si sblocca da sola dopo
  EVO_API_TIMEOUT_MS (default 20s): l'azione dormigliona continua in
  sottofondo (se un giorno si sblocca, la risposta in ritardo viene scartata
  dalla sendJson aggiornata: niente doppie scritture), ma le richieste dopo
  di lui girano subito.
- FIX 2 (webui.mjs — server): timeout HTTP a fianco +750ms: il browser
  riceve 504 con il nome dell'azione in stallo (bottone si riattiva, toast
  rosso) invece dello spinner eterno.
- FIX 3 (paths.mjs): tasklist (isGameRunning) e `cmd /c start` (avvio EVO)
  guadagnano timeout 10s: erano gli unici richiami figli senza rete di
  sicurezza.
- STRUMENTO DI INDAGINE (finestra DOS): ogni azione lenta (>300ms) stampa
  `[api] <azione> ← Nms`; un'azione appesa stampa `[coda] «azione» ferma da
  20s: sblocco la fila` — la prossima volta la colpa si legge in due righe.
- PROVA: test/webui-queue.test.mjs (hang-test, attiva SOLO con
  EVO_TEST_HANG=1): leader appeso → 504, poi /api/watcher risponde in
  fretta. Suite completa 174/174.
- Il server slot 3 girava col codice VECCHIO: va riavviato (chiudi la
  finestra nera e rilancia slot 3 da Impostazioni) per ricevere la
  correzione.

### NIDO PER-SLOT + CRUSCOTTO VERGINE (24/10, pomeriggio) — il save 3 vedeva tutte le
impronte del save 1 (LAP CHART, Garage advice, storia setup, Griglia, Archivio,
Analisi, Rassegna)
- IL FATTO Mauro: carriera nuova sul save 3 → il cruscotto mostrava LAP CHART con
  i giri del 11:26, presunzioni del meccanico del 21/10, tab Grid/Result/Archivio/
  Analisi pieni. Motivo doppio: (a) i registri del TOOL vivevano tutti in data/
  CONDIVISI fra gli slot; (b) MoTeC e Car Setups sono per-PC (EVO li scrive in
  Saved Games) e nessun filtro separava le carriere.
- FIX (a) — NIDO (state.mjs: nuovo export slotDataDir()): i registri della VITA
  di una carriera ora vivono per slot: slot 1 = data/ COM'È SEMPRE STATO (le
  carriere esistenti non si spostano di un byte), slot 2-3 = data/slot-2|3/
  nati vergini e restano vergini. Colpiti: rivals.json (rivals.mjs + state.mjs
  + review.mjs), archivio/ledger/log import + BACKUP_DIR (import.mjs + cli.mjs),
  magazzino griglie e snapshot customgrid (grid-apply.mjs), testdays.json
  (testday.mjs + webui.mjs), journal stagioni (review.mjs), flussi (flows.mjs),
  listing/backup dalla GUI (webui-env.mjs BACKUP_DIR → dall'Impostazioni dello
  slot 3 si vedono SOLO i backup di slot 3).
- RESTANO CONDIVISI le cose del PC o del progetto: grid-classes.json,
  griglie-fabbrica, calibrazione AI (grid-calib.mjs — è fisica dei rivali
  su QUESTO PC, non di una carriera), errors.jsonl, config e ladder.
- FIX (b) — CRUSCOTTO VERGINE: state.mjs createCareer ora scrive createdAt.
  listMotecSessions/collectSessions (motec.mjs) e listSetups (carsetup.mjs)
  accettano afterMs: le viste acetuttono la telemetria POST-nascita della
  carriera. Save vecchi SENZA createdAt (slot 1) vedono tutto com'era. Toccati:
  /api/card (webui-views), garage/sessions + staleness, azione setup, laptrace
  + selettore sessioni, banco A/B, ingegnere. La «Diagnostica telemetria»
  resta per-PC volutamente (è salute della macchina, non di un save).
- PATCH SAVE 3 ESISTENTE: il save 3 è nato prima dell'invento quindi senza
  createdAt: apposta con atomic write il campo = 24/10/2026 15:43 (script
  one-off: legge, completa, rinomina .tmp). Con la nascita oggi, la sessione
  11:26 di Laguna (save 1) esce dalla LAP CHART del save 3: vergine davvero.
- TOAST MUDO SULL'AVVIO (24/10, «Race marked. Game not launched»): la GUI diceva
  «aprilo tu» senza dire PERCHÉ. Ora il Web toasts viste-a.js (gara normale e
  gara speciale) porta in CODA motivo reale: r.launched.error (prima riga), IT/EN.
  Sonda fatta: resolvePaths vede E:\SteamLibrary\...\AssettoCorsaEVO.exe esistente
  → il motivo reale si légge al prossimo tentativo (se ricapita). Attenzione:
  questi fix valgono al RIAVVIO del server dello slot.
- VERIFICA: node --check su 13 file toccati ✓; suite completa 174/174 ✓
  (i test conservano EVO_DATA_DIR=root slot 1: zéro breakage).

## BUG «Command failed: cmd /c start EVO E:\...\AssettoCorsaEVO.exe» (24/10, sera) — CORRETTO
- Il toast col motivo reale ha subito aperto la cassa: l'amenda yesterday «start
  senza titolo vuoto» aveva PRONE anche l'avvio dell'exe del gioco. spawn('cmd',
  ['/c','start','EVO', exe]) — il titolo 'EVO' non conteneva SPACES, quindi Node
  NON lo citava. Regola di cmd start: SOLO il primo argomento QUOTATO è il titolo
  ("Slot 3" funzionava perché lo spazio faceva citare la citazione da Node);
  senza citazioni start cerca un PROGRAMMA chiamato EVO → «Command failed» e
  «Game not launched: open it yourself» col motivo vero nel toast.
- REGOLA DELLE CITAZIONI (la regola):
  · un argomento passa QUOTATO da Node ⇔ contiene uno spazio;
  · il TITOLO di start deve perciò CONTENERE UNO SPAZIO ('EVO Pitwall', "Slot 3"…);
  · i FILE con spazi si auto-citano e vanno bene com'erano;
  · gli URL (steam://, http://) restano SENZA titolo (la forma del commit 8dcceef).
- FIX (paths.mjs launchGame): titolo 'EVO' → 'EVO Pitwall'. Prova al vivo con
  bersaglio innocuo (cmd /c exit): 'EVO' → exit ERR «Command failed»,
  'EVO Pitwall' → exit 0. Suite 174/174 ✓ node --check ✓. Valido al riavvio
  della finestra DOS dello slot.

### Auto-refresh cruscotto su import manuale (24/10, sera)
La GUI segue watcher.importSeq (viste-d.js, poll 5s) ma SOLO il tick del
watcher lo incrementava: un import manuale («importa» a mano o via API con
EVO chiuso) lasciava la pagina sulla gara vecchia fino al refresh a mano.
FIX: case 'import' di webui.mjs muove il contatore UGUALE al tick (duplicati
e import a vuoto no). Prova dal vivo: import (inatteso: ha incassato anche
una Monza 20/10 mai depositata) seq 0→1, pagina si ricarica da sola.
Suite 180/180. Slot-3 riavviato col fix.

### Recovery: incassata per errore la Monza vecchia di slot 3 (24/10, sera)
Durante la prova dell'auto-refresh la chiamata d'import ha trovato nei
Results un file di gara mai incassato (261020-0015, Monza del 20/10,
griglia 13 — NON la Monza della coppa) e il runImport l'ha usata come
Round 2: il cruscotto saltava a Brands Hatch senza che la Monza 2 fosse
corsa. RIPRISTINO dal backup automatico dell'import
(data/slot-3/backups/...T14-49-20.auto.json): round 1, 6.322 ꜠.
Il LEDGER resta com'è: il file sbagliato resta marcato incassato  per hash, quindi l'«importa» manuale e il watcher NON lo ripiglieranno.
Copia di sicurezza dello stato errante:
evo-career.save.post-monza-errata.bak-2026-10-24.json (negozi slot-3).
LEZIONE: il bottone «importa» senza finestra temporale (since) scatta
qualunque file race fresco-newest nei Results: per gare fuori carboncopy
considerare un'etichetta  sul file o una conferma esplicita.


## BACKUP AUTOMATICO DEL SAVE DI EVO (26/10, pre-prova PC vergine) — FATTO E COLLAUDATO
- Il save di EVO (%USERPROFILE%\Saved Games\ACE, o Documents\ACE per le
  versioni vecchie) è l'unico dato del PC che il progetto NON protegge:
  un save corrotto o sbagliato a mano (slot sovrascritto, restore
  fallito) manda in fumo TUTTA la carriera. tools/salva-save.mjs lo
  zippa in data/salva-save/ con tar.exe di Windows (niente 7zip, niente
  PS): slot-1/slot-2 in rotazione (ogni backup va sullo slot alternato,
  scrive il vicino ?? salva-save.json), taglio automatico ai 4 zip
  PIÙ recenti su TUTTI gli slot, copia data/salva-save.json con slot,
  nome zip, size e prossimità.
- CLIENT a hook: in avvia.cmd :aprigui, DOPO magazzino-check:
  `node tools/salva-save.mjs 2>nul` — se il backup è più fresco di 36
  ore NON fa nulla (scorciatoria zlibila in loop: zero IO di troppo);
  se stantio zippa i lati in silenzio. --check per exit 0/1; --force;
  --stale-hours N; --data <cartella> per il test ACE_DATA override.
- PROVATO dal vivo (ACE_DATA su cartella finta in TEMP): zip valido
  leggibile da tar.exe di Windows (tar dell Git-Bash GNU NON legge gli
  zip: usare C:\Windows\System32\tar.exe), rotazione 5→4 su slot
  alternati, json scritto. DUE BUG di parsing presi al vivo:
  ① Number('0') è falsy → il `|| default` rimetteva 36h anche con
   --stale-hours 0 (stantio considerato fresco); ② Number(null) = 0 →
  la soglia era ZERO anche SENZA opzione, tutto sempre «stantio».
  Fix: null = assente, solo numero finito ≥ 0 valebr
- data/salva-save/ resta NEI GITIGNORE: gli zip backup di Mauro non
  finiscono MAI nel repo (sincronizza-git.cmd fa `git add -A`).
- Suite 203/203 ✓ (nessun test dedicato: tool di bootstrap, verificato
  solo dal vivo; ne vale uno reale se il backup un giorno fallisce).

## RECUPERO AUTOMATICO quando il watcher non guardava (24/10, 18:xx) — FATTO E COLLAUDATO

- Problema: finita una gara MENTRE il watcher non la guardava (server
  ripartito a gara in corso, lettore live fuori, EVO già al menu), l'import
  non partiva MAI: niente arm, niente racedEnd, niente bump della seq →
  la GUI (che si ricarica solo dopo un incasso riuscito) restava ferma.
  Caso reale: Red Bull (500 Cup R4, file delle 17:21) mai incassata finché
  il server non ripartiva col codice nuovo.
- Fix (webui.mjs, watcherTick):
  1) EVO CHIUSO con la gara appena finita: il tick non fa più return secco —
     prosegue all'import (il file dei Risultati è già lì).
  2) RECUPERO AUTOMATICO: se non si è armati, la ronda è pendente e nessun
     risultato combaciante è mai giunto, si incassa da solo ciò che combacia
     (stessa strada del bottone «importa» con registro anti-doppioni e backup
     automatico). Con `strict: true`: la finestra temporale resta VERA —
     niente file vecchi a pista uguale (lezione Monza del 20/10); se il file
     combaciante è già incassato si smette di riprovare (pendKey).
- `strict` nuovo flag di runImport (import.mjs): salta fallback `since: null`
  (quello che al click a mano può tirare dentro file vecchi). Il default è
  falso: i percorsi vecchi si comportano come sempre; doImport lo passa.
- COLLAUDATO DAL VIVO (slot 3, porta 8644): ripartito col codice nuovo, al
  secondo tick → «RISULTATO IMPORTATO (recuperato da solo): 500 Cup R4 — P14»
  · +0 pt · +324 €; il cruscotto è avanzato al FINALE · Fuji Speedway R5 di 5.
- Suite 174/174 verde. In più: i cinque test grid-templates dipendevano dal
  VERO gamemodesave del PC (il gate del conteggio 24/10 15:50 li allineava
  alla gara reale): aggiunta la sabbia `ACE_GAME_SAVEDIR` in quel test.

## NOTA «resta nel MENU PRINCIPALE» su Prepara e divertiti (24/10, richiesta Mauro)
- Sotto il pulsante 🏁 Prepara tutto e divertiti (sia gara di campionato che
  evento speciale, gui/js/viste-a.js) ora c'è un banner giallo: EVO deve stare
  nel MENU PRINCIPALE, NON nella schermata «Inizia sessione» (quella con la
  lista di piste e auto) — da lì pista e griglia non si scrivono e bisogna
  fare indietro e ripremere il bottone. Testo bilingue it/en, stile .banner
  warn già esistente. Basato sul caso reale del 24/10 (Imposta gara non
  applicata da schermata Inizia sessione). Basta un refresh della pagina:
  la GUI è statica, niente riavvio del server.
- RIMOSSO 28/10 (richiesta Mauro: «rimuovi questo, non serve»): entrambi i
  banner (viste-a.js, scheda evento e scheda gara di campionato) non
  descrivono più un rischio reale — la scrittura di pista e griglia non dipende
  più dalla schermata in cui si trova il gioco. Ci resta la lezione, non
  l'avviso: se la scrittura torna a fallire da quella schermata, si reagisce
  nel codice (riprova/ack), non con un cartello che scavalca l'utente.

## SCOPE CARRIERA IN SETUP/ARCHIVIO (24/10, sera) — FATTO E PROVATO
- Segnalazione Mauro: in Impostazioni la diagnostica telemetria mostrava
  18 auto / 191 file e l'archivio 238 risultati — tutto lo STORICO del PC
  (slot 1, prove di settembre/aprile) visto che MoTec e Results sono UNA
  cartella per PC condivisa dagli slot. Il save 3 (nato oggi alle 15:43)
  sembrava pieno di file "sue".
- SCOPE: ogni vista parte dal confine temporale della carriera
  (state.createdAt) con la stessa strada del garage (listMotecSessions
  afterMs, già del pomeriggio):
  • motec.mjs → telemDiagnostics(root, { afterMs }): le auto senza uscite
    post-nascita spariscono dal quadro;
  • catalog.mjs → listArchive(..., afterMs) + loadCatalog pass-through
    (archivio sempre ricalcolato, la cache resta per auto/piste);
  • webui.mjs → case 'catalog' e 'telem-diagnostics' passano
    state.createdAt; body.all = true mostra TUTTO il PC.
- GUI: riga di scope + interruttore («Mostra tutto il PC» / «Solo
  carriera») in Diagnostica telemetria (viste-c) e Archivio sessioni
  (viste-b); nessun refresh magico: il toggle ridisegna la vista.
- PROVATO VIVO su slot 3 (porta 8644, server riavviato): scoped → 1 auto
  (Abarth 695, le 5 uscite del campionato 500 di oggi) e archivio 5 file;
  all → 18 auto / 191 file e 238 risultati. Suite 174/174 verde.


## AGGIORNAMENTO AUTOMATICO VIA ZIP (24/10, tarda: "cioe' preso a mano? non si autoaggiorna?") — FATTO
- Il pacchetto-amico ora scrive `build-id.txt` alla radice dello zip
  (versione + HEAD, la stessa riga che la GUI mostra nel pie' di pagina).
- `tools/aggiorna-zip.mjs`: l'updater per le installazioni dezipdate
  (quelle SENZA .git, il caso dell'amico dello zip):
  • legge `ac-evo-career/build-id.txt` e interroga GitHub
    (GET api.github.com .../commits/main, timeout 2 s): avanti o al passo;
  • se GitHub e' avanti scarica il tarball (repo PRIVATO: token di lettura
    da `GITHUB_TOKEN` o `data/.github-token`), lo estrae in
    `tools/_update-<pid>` e copia SOLO le cartelle di codice e config
    (src/ tools/ gui/ config/ docs/ report/ test/) piu' i file radice con
    estensione;
  • `data/` NON viene MAI toccato (il save dell'amico resta suo);
  • se la build nuova ha file IN MENO (codice levato dal progetto), li
    elenca prima di applicare e chiede Invio (CTRL-C annulla); da webui la
    domanda passa in modalita' muto (applica direttamente, avvisa dopo);
  • alla fine scrive il `build-id.txt` nuovo: l'amico al prossimo avvio
    e' "al passo" senza fare nulla.
- `aggiornamenti.mjs`: se nella cartella non c'e' .git delega a
  aggiorna-zip; il clone continua a usare il flusso git di sempre.
  Aggiunto anche il comando diretto `node tools/aggiornamenti.mjs from-zip`.
- webui.mjs: il bottone Aggiorna ora AWAITA la risposta dell'aggiornamento
  (prima la banda spariva senza dire cosa fosse successo; ora dice cosa
  è accaduto: aggiornato / al passo / privato senza token / offline).
- test/aggiorna-zip.test.mjs: 5 test con fetch e tar FINTI ( nessuna rete
  vera nelle suite ): al passo, avanti con copia, protezione data/,
  avviso per file rimossi, repo privato senza token.
- Prova dal vivo: estrazione pulita del nuovo zip (senza .git) con un
  file sentinella in data/ ("un-save-caro.txt"): dopo il from-zip il
  sentinella resta intatto e lo strumento dice "sei al passo" (il pack
  era della HEAD corrente). Documentato in README.it.md ("Zip o clone?")
  e GUIDA-AMICO.md (6-bis token per repo privato).


## PANNELLO GUI «BACKUP DEL SAVE DI EVO» (26/10) — FATTO E COLLAUDATO
- tools/salva-save.mjs trasformato in LIBRERIA + CLI (pattern set-track:
  guard isMain su process.argv[1]): esporta statoBackup() (scan
  solo-lettura: zips, ultimo, ageHours, fresh, json slot) e
  forzaBackup({force, staleHours, data}) (tar + rotazione + json; torna
  {ok, zip, size, slot, zip_vivi, stato}). La CLI resta identica dal
  punto di vista esterno (--check / --force / --stale-hours / --data).
- webui.mjs: nuovo case `save-backup` (accanto a `backup`): op=status →
  stato; op=force → forzaBackup() in-process con la tar dell'avvio.
  BUG beccato al vivo: `const esito` dentro l'if non era visibile a
  lastRun sotto (ReferenceError) → hoist a `let esito = null`.
- viste-d.js (pannello Pilota della scheda Sistema, tra «Carriera» e
  «Verifica integrità»): h2 «Backup del save di EVO» con descrizione, i
  riquadro #savebk-out (banner verde fresco / giallo stantio: nome zip,
  età in min/ore, slot, KB, N zip vivi) e bottone #b-savebk «Forza il
  backup del save ora» (disattivo se il gioco non è mai partito; testo
  «Zippo…» durante; toast con il zip creato). Bilingue it/en lazy, come
  tutte le viste.
- PROVA dal vivo (server vera su porta 8799, ACE_DATA finta in TEMP, la
  pulizia di data/salva-save fra un test e l'altro): /api/save-backup
  status leggibile (zips con file/slot/size/at), op=force crea il zip
  sullo slot alternato e lo dichiara in lastRun. Nota operativa: il
  webui muore se la porta è occupata («già aperto, nessuna seconda
  istanza») — i test con server vanno SEMPI ripuliti di listener prima
  (netstat/taskkill), altrimenti curl risponde al server VECCHIO.
- Suite 203/203 ✓ · node --check su webui.mjs, salva-save.mjs, viste-d.js ✓

## CLASSI DA PADDOCK: i buchi del grid-classes.json, riempiti con i dati veri (27/10) — FATTO E COLLAUDATO
- Ripartito di Mauro (27/10): Paddock diventa la fonte primaria per le CLASSI.
  grid-classes.json nasce "pronta dal giorno uno" (pacchetto amico su PC
  vergine) e griglia-calib passa da costruttore a VERIFICATORE: le gare vere
  convalidano (o correggono), non costruiscono.
- tools/classi-da-paddock.mjs (import-safe, stessa scuola di grid-balance):
  dry-run di default, `--apply` scrive con backup in data/backups/,
  `--serie <id>` filtra, `--json` per GUI/test. Umbre: EVO_CLASSES_FILE,
  EVO_CARS_JSON, PADDOCK_JOURNAL_DIR.
- COSA USA (niente dati fittizi — tutti controllati sul dato reale del 27/10):
  PI da cars.json del DEDICATO (il `perf` di Paddock è rageno: r≈0.71, non si
  deriva), Δkw/t dal journal pd-catalog (predice le penalità misurate: 10–11
  [38→0.5, 72→5, 87→6], 9–10 [20→2, 34→5, 45→8] — monotono in ENTRAMBE), pendenza
  k calibrata per-classe con fit all'origine SUI PUNTI MISURATI (solo restrittore>0
  e Δkw/t>0); scarto>2.5 punti o una sola misurazione → classe NON derivabile e
  chiama griglia-calib. Zavorra: convenzione della classe (ballast>0 più fre-
  quente) scalata per MASSA reale (lezione 19/10: 100kg schiaccia le leggere).
- RAMO NEGATIVO (Δkw/t<0): PI ≤ base → 0/0 (parità fisica); PI sopra base →
  vince in presa/grip: NON derivabile (lezione Mini/Delta 21/10), niente numero.
- SCRITTA: SOLO regole fonte:'paddock' vengono sostituite (idempotente al
  secondo giro); le 46 regole di Mauro restano byte per byte; backup
  grid-classes.bak-classi-paddock-*.json prima. Prova reale --apply del
  27/10: 7 regole scritte (4 nella 10–11: Alfa Junior 100/4.5, Audi Sport
  quattro 100/4, MX-5 ND Cup ×2 100/2; 3 nella 9–10: Countach 100/8,
  Delta Evo 3 100/6, Alpine A290 0/0) e il secondo giù dichiara «nessun buco».
- Suite: test/classi-paddock.test.mjs (10 test, 264/264 verdi), biome ok.

## RAPPORTO GARA CONDIVISIBILE: il dossier da incollare su Discord (27/10) — FATTO E COLLAUDATO
- src/rapporto-gara.mjs: rapportoGara(paths, file, { driver, salva }) compone
  il dossier SOLO dai dati scritti dal gioco: griglia ufficiale, podio, giri,
  gap, penalità, giro veloce, testa a testa MP (resultDetail di catalog.mjs)
  + settori del tuo giro e giro teorico dal file NATIVO (sectorAnalysis di
  results.mjs). Output: MD (Discord-ready, classifica in blocco monospazio con
  colonne allineate — Discord non disegna le tabelle) + HTML d'anteprima. Il
  .md finisce in report/gare/<base>.rapporto.md (EVO_REPORT_DIR per i test).
- I doppiati: total_time di chi ha un giro in meno è MINORE del vincitore →
  gap negativo nel file (dato reale); la riga esce in GIRI dal leader («−2 giri»).
- Server: POST /api/rapporto-gara (webui.mjs). GUI: bottone «⚡ Rapporto Discord»
  nel modal Classificazione (viste-b.js) → modal con anteprima + copia (clipboard
  con fallback textarea) + percorso del file salvato.
- CLI/VERIFICA PADDOCK: griglia-calib segna ogni regola fonte:'paddock' con
  l'esito dalla misura reale (medSec del perAuto): ✓ confermata (entro la
  tolleranza), ✗ sballata (scarto fuori soglia — la correzione torna empìrica),
  ◌ da corse. Presente nel report console (cli.mjs) e nel pannello calib.
- Test: test/rapporto-gara.test.mjs — MD/HTML, salvataggio in cartella di test,
  file assente → errore, gara senza giri → niente settori inventati.

## COACH FUORI PARCO FALSO: il vigia live giudica solo con la serie giusta (27/10) — FATTO E TESTATO
- Segnalazione Mauro: il copilota «non fa altro che dire Ferrari F40 fuori
  parco» mentre le sue auto in Coppa Strada erano R5 GT Turbo / Escort Cosworth.
- CAUSA ve: l'F40 LM HA un suo parco legittimo (Leggende Stradali, Coppa
  Ferrari F40 LM) e NESSUNA gara sua è stata registrata fuori parco (il save
  conferma: Coppa Strada R1/R2 con la Renault 5, autoFuori 0). Il tocco live
  giudicava però il sedile col pool `state.pending?.node ?? state.node` — la
  serie DI CARRIERA corrente — anche quando la sessione in pista era d'altro
  tipo o d'altra serie (test griglie armoniche con le F40, MP, prove libere):
  false allerte ripetute ogni 30 s.
- FIX: `poolNodeForLive(ladder, { pending, node, round, smTrack, smType })`
  in car-pool.mjs. Il giudizio live è LEGITTIMO solo se la pista della SM è
  quella del round di carriera in giudizio: con pending (gara lanciata dal
  flusso) il nodo del pending; senza pending il nodo di carriera SOLO se la
  SM è sulla pista della ronda corrente E la sessione è Race (le prove li-
  bere non possono costare punti). In menu (pista null) o altrove: null →
  auto=null → la copilota tace e il pannello non mostra il rosso. L'IMPORT
  resta l'arbitro vero: giudica col file risultato e marca autoFuori a zero.
- webui.mjs live: usa poolNodeForLive (import aggiornato). Nessun cambio al
  discorso del copilota in viste-a.js: nell'auto vera fuori dalla SUA gara
  la dice ora solo quando conta.
- Test: 4 nuovi in test/car-pool.test.mjs (menu muto, pista/serie sbagliata
  muto, pending col suo round giudica e resta il vigia, gara a mano sulla
  ronda in Race giudica i 9/9 del file). Nessuna nuova dipendenza.

## DOSSIER STAGIONALE + CONTO ALLA SOSTA (27/10) — FATTO E TESTATO

### Forma stagionale per pista (dossier del rivale)
- `stagioneDelRivale(store, key)` in src/rivals.mjs: per ogni pista dove il
  pilota e tu vi siete incontrati — scontri, vittorie, podi, media/migliore
  posizione, delta best-lap SUO vs TUO (ms, best-vs-best) e i settori:
  media per indice del suo splits contro il tuo. settoreForte = dove il suo
  delta media è più negativo (lì ti batte), settoreDebole = dove perde
  (lì lo attacchi). DAI SOLI DATI che recordRaceGrid salva (bestLap + splits
  per ogni pilota): niente numeri inventati; mancano splits → settori vuoti.
- `rivalDetail().stagione` e `rivalDossier().stagione` la espongono; la GUI
  (scheda + dossier, viste-d.js) la disegna come tab «forma per pista» con
  chip per settore (rosso = lui più veloce, verde = tu) e riga forte/debole.
- NOTA ONESTA: i splits in griglia esistono solo dagli import di oggi —
  le gare vecchie mostrano il delta best-lap, i settori arrivano dai round
  che verranno. La qualifica vs gara resta impossibile dall'archivio
  (nessun file di qualifica salvato, solo race/practice/warmup).
- Test: 2 nuovi in test/rivals.test.mjs (aggregazione, delta best-vs-best,
  settori da splits di entrambi, niente inventati senza splits, firma scheda).

### Conto alla rovescia della sosta (copilota, modulo live)
- Narratore 6b in gui/js/viste-a.js: finché la finestra non si avvicina tace;
  a N=2 «sosta tra 2 giri», a N=1 «sosta QUESTO GIRO o il prossimo», a N=0
  «fermarsi adesso, baia costa ~Xs». Con le gomme oltre la prima soglia
  usura (banda ≥1, 55% dal narratore 4) la frase le nomina: la decisione
  sosta nasce da gomme+benzina insieme. Una voce per tacca (cpSay min 12 s),
  slitta la finestra → la tacca si azzera e il conto ridice da capo.

### Rivedi la radio + prova dal vivo (28/10, notte)
- RIVEDUTA la regola ante-doppioni della radio: narratore 6 (finestra pit)
  ora SEMINA la tacca del conto 6b quando la finestra arriva già vicina
  (lapsToWindow < 3 alla prima vista o allo slittamento) — così lo stesso
  giro non produce SIA «si apre tra 1 giro» SIA «questo giro o il prossimo».
  6 annuncia UNA volta, 6b conta da lì: tacche 2/1/0, min 12 s, gomme
  stanche nel discorso se banda usura ≥1.
- tools/_monitor-copilota.mjs RIALINIAITO alla vista: il delta adesso parla
  solo se il bucket di 400 ms cambia per davvero (min 20 s tra discorsi —
  prima ripeteva a valore fermo ogni 12 s: non era più la replica fedelle
  della copilota) e replica anche il conto alla rovescia 6b.
- PROVA DAL VIVO: server webui vivo su 8642 (POST /api/ingegnere ok,
  raceLaps 3 dalla ronda), monitor armato su data/copilot-8642-24-10.jsonl.
  Col gioco chiuso la radio è muta per DISEGNO (live:false) e il log resta
  vuoto: niente frasi di prova inventate — la prova vera arriva quando
  Mauro entra in pista; dopo la sessione il file jsonl dice riga per riga
  cosa la copilota avrebbe detto e con quali dati crudi accanto.

## AVVISO GRIGLIA RONDA SUL PANNELLO EVENTI (28/10) — FATTO
- Lezione bak-evento (27/10 21:40): l'event-prep riscrive last_grid.customgrid
  e il file della RONDA si sposta nei .bak-evento-*; al round successivo la
  griglia ronda torna SOLO col «Prepara tutto» del campionato (rebuildGridApply
  recupera dai backup). Prima di oggi il pannello Eventi non diceva niente:
  Mauro scopre lo scambio solo in pista con la griglia sbagliata (caso reale
  28/10: rilancio con l'F40 contro la ronda a Escort/R5).
- webui.mjs: `avvisoGrigliaEvento(eventoAccettato, card)` legge il customgrid
  su disco ed esita la FORMA (tutte le celle dentro il pool del tema = «evento»,
  altrimenti = «ronda») + l'ultimo .bak-evento-*. La risposta di POST /api/events
  porta `grigliaRonda`; lettura sola (nessuna scrittura, fallback silenzioso).
- viste-a.js: nella vetrina dell'invito accettato un banner 🗂️ pre-WARN con lo
  stato del disco PRIMA del «Prepara tutto e divertiti».
- contorno copilota di stanotte (28/10): lapsDone sensibile a doppio sensore
  (totalLapCount ∨ SessionState.currentLap — nel log 24/10 il graphics
  rimaneva a 0 per intera gara), isLastLap esposta per «Ultimo giro!»,
  sessionType nel payload /api/ingegnere, monitor riallineato ai narratori 8
  + reset per firma sessione.


## TUTTO CLICCABILE, SECONDA FILA (28/10) — FATTO E VERIFICATO AL VIVO
- Seconda fila del progetto "tutto cliccabile": le celle PISTA rimaste statiche
  nelle tabelle sono passate a window.trackLinkHtml() (helper di core.js,
  con la lezione di ieri: cerca col NOME DISPLAY, clic → vai('tracks'),
  la scheda pista si apre da sola col NAV_OPTS.search).
- Convertite: scheda evento (🏁 pista + premio, viste-a 420), outlook della
  card gara (trackName, viste-a 605), tabella gare della stagione della serie
  (viste-a 284) e il banner della serie (viste-a 221), CALENDARIO del
  campionato (rounds played/current, viste-c 432) e tabella del calendario
  (viste-b 6 e 451), card campionato (viste-b 245/255/347: la riga «R2 ·
  <pista>» nel pannello volante e in tabella), scheda rivali (viste-d 723
  «Ha vinto a», 727+780 incontri, 773 chips perTrack, 777 tabella stagione).
- NON convertite (a ragion veduta): le righe in cui il testo è la CHIAVE RAW
  del file risultato/sessione (viste-c ispezione file 21, log telemetria 555,
  opzioni select 101) — il link non troverebbe la scheda e starebbe morto;
  e `<option>` di select: per natura non cliccabili.
- PROVA AL VIVO (cursore VERO nel browser di Codebuff): hover su card →
  pannello volante appare a ~400 ms ancorato accanto alla card; il cursore che
  entra nel pannello disarma il timer di chiusura da 100 ms (il caso che
  sfarfallava col cursore sintetico: gli eventi fake non toccano lo stato
  :hover del CSS e il guard el.matches(':hover') bocciava la via sintetica);
  fuori da card/pannello si chiude dopo 100 ms. Lingua portata a it sia nel
  config server sia nel localStorage del browser (la scelta personale
  comanda sul server: senza la scelta personale il browser ripartiva ancora
  in inglese anche col server già impostato in italiano).
- Lezione di metodo per le edit: le stringhe vecchie vanno COPIATE esatte
  da un output del tool (search/read), mai riscritte a memoria: una
  ricostruzione sbagliata o si firma "non trovata" o peggio scrive #{ invece
  di ${ nei template literal e rompe il file. Giusto corretto; controllo
  finale `#{` = zero su tutte le viste.


## LE ZAVORRE NON PROPAGANO: OULTON PARK A 8% DOPO DONINGTON=20% (28/10) — FATTO, CAUSA E RIMEDIO
- Gara di stanotte (Oulton Park, Coppa Strada R3): le Escort di nuovo a
  100kg/8% e −14,0 s per giro dalla base R5 (mediane 1:37.7 vs 1:51.7).
- LA CAUSA DOPPIA:
  1) le gare Donington della sera PRIMA (23:23 e 00:33) sono pure uscite a 8%:
     l'override perTraccia[Donington]=20 era STATO scritto il 27/10, ma la
     griglia su disco non era stata RICOSTRUITA dopo («Prepara tutto» l'ha
     ripescata solo se girata DI NUOVO): patchPerTrack si applica al rebuild,
     non a un file già steso sul disco;
  2) le proposte dei risultati scrivono SOLO perTraccia[pista_gara]: ogni pista
     nuova (Oulton, e tutte le prossime) ricade a vita nella regola di BASE
     della classe (8%). Il default di classe non si estende mai da solo.
- RIMEDIO (e si applica adesso, con backup grid-classes.bak-zavorra-28-10.json):
  • regola di classe Escort 8%→20% in AMBEDUE le classi che la coprono
    (coppa_strada_80 e gr86-r5-escort): 20% è il cap di gioco e la proposta già
    firmata dal ledger il 27/10 e confermata da Oulton;
  • perTraccia["Oulton Park"] Escort=20 scritta con la nota della gara
    (−14,02 s mediana, campo 78-88) — la pista nuova entra nel registro;
  • la gara di stanotte è REGISTRATA NEL LEDGER PRIMA delle scritture:
    le regole lette dall'analisi devono essere quelle con cui la gara ha
    GIRATO (8%), non quelle di domani (20%): la storia resta vera;
  • il rebuild della GRIGLIA va fatto con «Prepara tutto e divertiti» alla
    prossima ronda: è quello che riprende i backup (.bak-evento) e applica
    classe+perTraccia sulle celle vere.
- RIMEDIO STRUTTURALE nel codice (src/grid-calib.mjs, leva nuova):
  ramo C «regola-classe»: quando ≥2 piste portano override per-traccia ALTI
  per la STESSA auto (OBS_ALTA) E la gara corrente dimostra lo scappamento
  (delta < −TOL) e l'auto non è già al cap, l'analisi firma una PROPOSTA di
  ALLINEAMENTO della regola di classe con comando pronto:
  `node tools/grid-balance.mjs --rule "<auto>=kg,pct" --apply`.
  Guardie del ramo: niente promozione dalla base nuda (delta=0), niente al
  cap (il ramo B propone già escludi), niente per le auto con una sola pista
  di prova (confidenza bassa). Test 2-bis in test/grid-calib.test.mjs (12/12).
