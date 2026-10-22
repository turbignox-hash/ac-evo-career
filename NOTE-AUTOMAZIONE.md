# Ricerca automazione gara — stato e conclusioni (18 settembre 2026)

Obiettivo: preparare la gara personalizzata di EVO da file, come fa su AMS2 il progetto di carriera da cui questo deriva.

## Cosa abbiamo imparato

### Il file del weekend si sa scrivere (ma non è letto dove speravamo)
- `Saved Games\ACE\GameModes\GameModeType_RACE_WEEKEND.gamemodesave` è protobuf, struttura completamente mappata:
  - `.3[i]` = sessioni (1 nome, 2 durata/giri, 4 data-ora, 5 pista: nazione/pista/layout/regione/lunghezza, 7 tipo partenza?, 11 griglia piloti con forza individuale, 30/31 difficoltà/aggressività AI nella prima sessione)
- Strumenti: `archive/ricerca-automazione/evo-session.mjs` (decodifica/confronto), `archive/ricerca-automazione/evo-write.mjs` (modifica con backup e verifica round-trip byte-identico), `tools/evo-prova-giri.mjs` (esperimento), `prova-giri.cmd` e `annulla-prova.cmd`.
- Esperimento: giri 10→12, campo A 88→61, campo B 100→48 scritti con successo.
- **Risultato**: la schermata di configurazione mostra i valori vecchi. Il gioco NON riscrive il file (mtime e contenuto restano nostri; ultimo salvataggio del gioco: 3 giugno). Quindi il file non viene letto all'avvio né usato come sorgente della UI di configurazione: viene letto in un momento non identificato (probabilmente alla conferma della gara o al caricamento di un percorso specifico).

### La porta 9264 è un canale binario proprietario
- `AssettoCorsaEVO.exe` tiene aperta una sola porta: `0.0.0.0:9264`.
- Parla PER PRIMO: 18 byte di benvenuto (`12 00 00 00 12 ea ee 00 ...`), con un intero a 32 bit in testa (`0x0000ea12` = 59922, plausibile dimensione/magic). HTTP puro, TLS e WebSocket vengono resettati (ECONNRESET).
- Nel log del gioco compaiono errori `gameModeClient: doesn't implement message handler for message BackendMessage`: è il canale fra interfaccia e motore (spie/controlli di gioco).
- Decodificarlo e pilotarlo richiederebbe settimane di reverse engineering fragile, che si romperebbe a ogni patch di Kunos: **non è la strada giusta per una carriera giocabile**.

### Cosa resta sconosciuto
- ESITO FINALE (18/9): con il file modificato a 12 giri/61/48, la gara configurata dalla UI è PARTITA COMUNQUE a 10 giri con le AI originali. Il file non viene letto né all'avvio, né nella UI, né alla conferma della gara: la via file è chiusa.
- Dove la UI persiste la configurazione fra le sessioni di gioco (non nei file di `Saved Games\ACE` né `Documents\ACE`: né il file weekend né `last_season.seasondefinition` toccati dal gioco oggi; forse memoria del processo o backend online).
- Dove sta l'auto scelta (non nel file weekend; forse in `ui_storage`/profilo).
- Meteo: enum visti nei risultati (`GameModeSelectionWeatherType_CLEAR`, `_SCATTERED_CLOUDS`, `_BROKEN_CLOUDS`), campo non ancora trovato nei file di configurazione.

## Decisione
- L'automazione completa del setup gara **non è attualmente raggiungibile** in modo robusto su EVO 0.x.
- La carriera resta sul flusso affidabile: scheda gara precisa + import automatico dei risultati JSON nativi (`Results\*.sessionresults.json`), che è il pezzo che conta per punti, premi, classifica e rivalsa.
- Se in futuro l'esperimento di conferma mostra che il file weekend viene letto alla conferma della gara, il comando `gara` (scrittura pista/sessioni/AI) può essere aggiunto in poche ore: tutta la scrittura è già pronta e verificata.

## Verifica server dedicato (18 settembre 2026, conclusiva)

Installato "Assetto Corsa EVO Dedicated Server" (App ID 4564210, Steam Tools) ed esaminato:

- File reali: `AssettoCorsaEVOServer.exe` (motore headless), `ServerLauncher.exe` (.NET), `cars.json` (token auto), `events_practice.json` / `events_race_weekend.json` (catalogo piste con nome esatto, layout, lunghezza, max_pit_slot).
- Config ufficiale (`server_launcher.json`), schema estratto dalle stringhe del launcher: `server_name`, `admin_password`, `driver_password`, `max_players`, porte TCP/UDP/HTTP, `game_type`, `event` (track, layout, event_name, track_length), `initial_grip`, `allowed_cars_list`, `practice/qualify/race_duration`, `race_duration_type`, `race_time_of_day`, `mandatory_pit_stop`, `pit_window`, `entry_list_path`, `results_path`, `mods`, `pi_min/pi_max`.
- **Nessun campo AI/bot nel config del server.** I riferimenti AI nell'eseguibile (`AI_SpawnVAICommand`, `current_ai`, `ai_data`...) sono interni al motore, non esposti alla configurazione. Il server è pensato per piloti umani.
- Le 19 piste del catalogo server (36 combinazioni pista+layout) includono TUTTE le 8 piste della scala carriera, con i nomi esatti attesi dal gioco.

### Verdetto finale
L'automazione della configurazione gara su EVO 0.9 **non è possibile** su nessuna delle tre vie:
1. gara offline: nessun ingresso file (verificato sperimentalmente);
2. porta locale 9264: protocollo proprietario non documentato;
3. server dedicato: configurabile via file, ma senza AI → griglia vuota, inutile per la carriera.

Quand'anche Kunos esponesse l'AI nel server (o file di sessione offline), l'infrastruttura di scrittura è già pronta in `tools/` e la carriera può adottarla in poche ore.

## GARE PERSONALIZZATE: la griglia SI comanda da file (18 ottobre 2026, CONFERMATO)

### Il file della griglia personalizzata
- `Saved Games\ACE\GameModes\last_grid.customgrid` = protobuf, mappato e VERIFICATO:
  - campo 1 (ripetuto) = celle auto (3 id, 4 nome, 6 anno, 9 marca, 10 preset meccanico, 11 visual, 14 livree)
  - campo 2 (ripetuto) = piloti AI: 1 nome, 2 cognome, 3 bandiera, 4 abilità (float 0–1), 5 nazione, 6 sesso, 8 età
  - campo 3 = setup: 1 n.celle, 5 filtri veicolo (byte pack), 20 atteggiamento, 21/22 abilità min/max %, **23/24 = FINESTRA PI (float LE)**
  - campo 4 = meteo
- Strumento: `tools/evo-grid.mjs` (dump / --verify round-trip byte-identico / --pi lo hi con backup)
  + `tools/watch-grid.mjs` (watchdog mtime/size/hash → data/grid-watch.log).

### Comportamento verificato in gioco (test dal vivo con Mauro)
1. Menu griglia aperto: il gioco NON rilegge il file a runtime (PI 15–17 in UI mentre il file diceva 16.5–17.5).
2. "GENERA GRIGLIA" RISCRIVE il file (watch: hash + size cambiati) col range in memoria della UI.
3. RIPRESA del menu (gioco riavviato): la UI si RIPOPPOA DAL FILE — i 15 piloti "Buffy Gridtest1..15"
   scritti fuori dal gioco compaiono nel menu. **ALLOCHE IL FILE È COMANDATO a gioco CHIUSO.**
4. Round-trip byte-identico anche sul file riscritto dal gioco: encoder conforme.

### Conseguenza: automazione multi-marca VIABILE
Le gare personalizzate dell'agenda carriera possono essere preparate fuori dal gioco:
- prendo la finestra PI della serie dal ladder;
- scelgo le auto varianti reali che cadono nel range (da cars.json del server dedicato: 9 varianti / 6 modelli nel 16.0–17.0);
- genero celle + piloti (roster carriera: abilità float, età, nazione) e scrivo il file
  **con EVO CHIUSO**;
- Mauro avvia EVO, apre la gara personalizzata: trova griglia, auto e piloti già pronti.
Caveat: dopo ogni "GENERA" dal menu il file torna scritto dal gioco — la scrittura nostra
deve avvenire SEMPRE a gioco chiuso e va ri-applicata se il menu rigenera.

### Le tre regole d'oro della griglia multi-marca (18/10, pomeriggio di test)
1. **Il preset visuale (f11) è obbligatorio e PER VARIANTE**: `preset_mcgt2_visual_1`
   non esiste (solo visual_2) → cella non istanziata in UI e CRASH se portata in gara.
   Ogni modello ha i SUOI indici visual (GT3 RS: visual_2 = Weissach).
2. **Mai id non verificato in UI**: `ks_maserati_mc20_gt2` era il candidato giusto
   (confermato poi dal GENERA del gioco), ma portare in gara una cella con id/preset
   non ancora visto istanziarsi in menu = crash del gioco.
3. **GENERA + cattura è il metodo di apprendimento**: per conoscere i campi veri di
   un modello (id, mech preset, visual preset, livree, campi f19/f26/f27/f28/f30/f33
   che EVO scrive e noi no) far generare UNA cella dal gioco, catturarla con il
   watch, e fotocopiarla nelle griglie nostre. Funziona al primo colpo.

### Stato finale del test (15:16)
Griglia multi-marca completa renderizzata in UI dopo riavvio del gioco:
Maserati GT2 SRO blu 16.7 ×2, AMG GT2 17.0, GT3 RS 16.6, 935 Gulf 16.9,
Cup 992 16.3, Daytona SP3 16.1… — il ciclo file→gioco→file funziona in
entrambe le direzioni. Resta solo la corsa in pista come prova ultima.

### GARA VERIFICATA IN PISTA (18/10, 15:2x) — OBBIETTIVO RAGGIUNTO
La griglia multi-marca scritta fuori dal gioco ha corso: Mauro ha lanciato la
gara personalizzata e ha girato un giro completo, griglia in pista composta
(Maserati GT2 SRO, AMG GT2, 935 Gulf, Cup 992, GT3 RS, Daytona SP3...),
nessun crash. La catena completa file→menu→griglia→PISTA è chiusa.
L'automazione delle gare personalizzate di EVO è OPERATIVA.

Prossimo passo naturale: comando carriera che prepara il customgrid della
serie del giorno (finestra PI della serie → auto reali del catalogo → celle
verifiche → file a gioco chiuso).

### PROVA PURISSIMA SUPERATA (18/10, 15:3x) — CERTIFICAZIONE COMPLETA
Riprova con griglia scritta interamente da noi (senza GENERA del gioco):
APPLICA → gara lanciata → giro completo senza crash, griglia in pista
multi-marca. Il file dopo la gara resulta INTATTO (watch: nessun cambio
hash dopo la nostra scrittura 5a64f9b494). La catena
file(nostro)→menu→APPLICA→gara→pista è chiusa e certificata.

## 7ª PROVA (19 ottobre 2026) — JACKPOT: il menu ricarica il file a ogni entrata
Scrittura di 15 Ferrari Daytona SP3 **con EVO APERTO alla schermata principale** (fuori dal menu griglia): al rientro nel menu Personalizzazione Griglia le celle mostrano le auto NUOVE (screenshot verificato).
**Conseguenza operativa**: griglie diverse a 2–3 gare di fila **senza mai chiudere EVO**.
Flusso serata: gara → esci in menu → toolRiscrivi → rientra nel menu → APPLICA → gara successiva.
Unica regola ferma: **mai standings dentro il menu griglia** con GENERA, e scrittura solo fuori dal menu.

## BALLAST + RESTRICTOR nel customgrid (19/10/2026) — IL BILANCIAMENTO SI MANDA DA FILE

### La scoperta
Dentro ogni CELLA (campo 1) del customgrid:
- **campo 24 (varint) = BALLAST in kg** (100 = 100 kg, come lo slider UI);
- **campo 25 (float32 LE) = RESTRICTOR, frazione 0–1** (0.10 = penalità 10%).
Le celle senza penalità NON hanno i due campi (default 0). Verificato sulla griglia
di Mauro (PI 8–9: GR86 / R5 GT Turbo / Escort RS Cosworth, 15 celle):
il set a mano "100 kg + 10% a tutti meno la Renault" era lampeggiato nel file esatto.

### Il tool
`tools/grid-balance.mjs`:
- `node tools/grid-balance.mjs` → dump ballast/restrictor di ogni cella;
- `--serie <id> --dry|--apply` → piano dalla convenzione in `data/grid-classes.json`;
- `--rule "Nome auto=kg,penalità%"` (ripetibile) → regole a mano;
- backup automatico a ogni scrittura, guardia EVO chiuso come gli altri tool.
`data/grid-classes.json` = convenzione classi: per ogni classe di serie (finestra PI,
auto base = l'auto di riferimento) le regole zavorra/penalità per auto.

### La convenzione 70/30 concreta di Mauro (classe 8–9, 19/10)
Prove empiriche di Mauro in pista, in ordine:
1. zavorra 100 kg a tutti meno la Renault → cambia poco;
2. zavorra + penalità 5% a tutti meno la Renault → va già meglio;
3. **zavorra 100 kg + penalità 10% a tutti meno la Renault → gara COMBATTUTA alla pari (regola adottata)**;
4. opzione in attesa di prova: Sierra (Escort) da 10% → **8%** per ancora più competizione.
Memorizzata in `data/grid-classes.json` come classe `gr86-r5-escort` (auto base: Renault 5 GT Turbo).

### Il salto di qualità: penalità a DECIMALI
Il selettore UI accetta solo interi (+1/−1); ma noi scrivendo il campo 25 possiamo
mettere QUALSIASI frazione: 8%, 6.5%, 0.7%… La finestra PI a ±0.7 che la UI non
dà diventa irrilevante: si bilancia con ballast/restrictor, non con la finestra.

### Prossimi passi naturali (quando Mauro vuole)
- prova in pista della variante Sierra al 8% (una riga di JSON + --apply);
- all'iscrizione a una serie multi-marca: la scheda gara propone la convenzione
di classe e il comando scrive griglia + bilanciamento in un colpo (EVO chiuso).

## CALIBRAZIONE AUTOMATICA (19/10/2026, serata) — grid-tune.mjs

### I due ancora di calibrazione (classe 8–9, gara confermata "alla pari")
Dai risultati reali (i JSON di Results contengono BALLAST e RESTRICTOR di ogni
pilota!): GR86 Edition PI 8.889 → 10%, GR86 Standard 8.858 → 5%, Renault base
8.492 → 0. Pendenza derivata: **≈ 25 punti di penalità % per punto di ΔPI**
(origine sul PI della base della classe). Zavorra fissa 100kg sulle non-base.

### Nuovo tool: tools/grid-tune.mjs
- `--propose <piMin> <piMax>`: per una classe NUOVA elenca i preset di cars.json
  nella finestra PI, elegge base il PI più basso e propone 100kg + ΔPI×25%. È
  il PUNTO DI PARTENZA: si convalida in pista e si fissa in grid-classes.json.
- `--report [nGare]`: legge le ultime gare in Results, scarta quelle di calibrazione
  (bilanciamento uniforme: non misurano nulla), raggruppa per modello e mostra
  posMedia, best-lap mediana, e la quota di presenze nel top-metà-campo contro
  quella ATTESA (~50% per auto in sesto). Suggerisce -3% o +2% sugli squilibri.
  Caveat: la base della classe non può scendere sotto 0% (il -3% va a mano nelle
  penalità delle altre); e le posizioni mescolano abilità AI diverse — il
  giudizio finale resta la sensazione in pista di Mauro.

### Il ciclo di lavoro per ogni classe Nuova
1. `--propose` → proposta da PI;
2. la si applica con `grid-balance --rule` (e si fissa in grid-classes.json
  come "in prova");
3. si corre: LA PISTA DICE LA VERITÀ;
4. `--report` → suggerimenti di affinamento, si ritocca col --rule;
5. combinazione confermata → si fissa in grid-classes.json come definitiva.
  Il tool non pensa AL POSTO di Mauro sulla sensazione: pensa i NUMERI al posto
  suo, la conferma resta umana.

## IL METEO SI COMANDA DA FILE (20/10/2026) — VERIFICATO IN PISTA

### Il meccanismo (reverse engineering con watcher + log di gioco)
La scelta del preset nel menu meteo NON scrive nessun file (17 snapshot di
`GameModeType_RACE_WEEKEND.gamemodesave` e 7 di `gamemode.lastgamemode`
byte-identici durante i click; la UI è stateless: "Registered CurrentWeatherData"
e "GameModeSelectionWeatherBehaviour_DYNAMIC" nel log). Il meteo che la sessione
applica parte dal PRESET SELEZIONATO scritto in:

- `Saved Games\ACE\GameModes\gamemode.lastgamode`, **top field 2** (varint 0-based):
  0 sereno · 1 nuvole sparse · 2 nuvoloso · 3 coperto · 4(pioggia leggera) · 5 pioggia · 6 pioggia intensa · 7 custom.
  Campo ASSENTE = preset 0 (default proto3): il gioco lo omette su "sereno" (visto
  reale dopo un cambio manuale a menu).
- La stessa lista log conferma a inizio sessione:
  `Game Started! ... GameModeSelectionWeatherType_HEAVY_RAIN` +
  `Initial weather type: heavy rain (6)`.
- Lo stesso file porta la TIMELINA PREVISIONI (9 sub field 3 con i float:
  f4=temp aria, f8=pioggia 0-1, f11=copertura, f12=nebbia, f2=step attivo).
  Scrittabile in-place (patch a stessa lunghezza) — ma il preset vince sui
  float: con preset 6 la gara parte HEAVY_RAIN anche con timeline a 0.35.
  I float contano davvero solo col preset 7 (custom, NON ancora collaudato).

### Le prove in pista (20/10, sera)
1. preset 6 scritto da fuori → gara partita HEAVY_RAIN (conferma meccanismo).
2. float timeline a 0.35 con preset ancora 6 → gara ANCORA HEAVY_RAIN:
   la selezione domina sui float. Non è un fallimento: è la mappa del campo.
3. preset 4 scritto da fuori con patch in-place → selettore UI mostra
   "Pioggia leggera" e la gara PARTE in `GameModeSelectionWeatherType_DRIZZLE`
   (log 18:30:15, stessi circuito/auto del test HEAVY_RAIN delle 18:21).
   **La filiera file→selettore→sessione è chiusa.**
4. Lettura/sovrascrittura a EVO APERTO: funziona (dopo riapertura modelli UI,
   "Registered CurrentWeatherData"); a sessione AVVIATA il valore in uso non
   cambia. La finestra giusta: scrivere PRIMA di entrare in sessione.

### Indici DIVERSI dalla ladder
`config/career.evo.ladder.json` dichiara i round con `weatherNames`:
0 Clear · 1 Scattered clouds · 2 Overcast · 3 **Light rain** · 4 Rain · 5 Heavy rain.
La numerazione NON coincide coi preset EVO (ladder 3="Light rain" ma il preset
pioggia leggera è il 4; ladder 4="Rain" è il preset 5). Tradurre SEMPRE per
etichetta con `presetForLabel()` — mai per numero.

### Il modulo (usato dal lancio gara)
`src/weather.mjs`:
- `currentWeatherPreset()` → 0-7 (campo assente letto come 0=sereno);
- `setWeatherPreset(idx)` → cambia il selettore, inserisce il campo 2 se
  assente (re-encode proto conforme, verify-test `tools/test-f2-insert.mjs`);
- `setWeatherCustom({rain,cloud,fog})` → preset 7 + patch float timeline in-place;
- `presetForLabel("Light rain")` → 4 (traduzione ladder→EVO);
- CLI: `node src/weather.mjs` (legge) · `<preset>` (imposta) · `--custom r c n`.
Backup `.bak-wx-*` automatico a ogni scrittura.
Nel `case race` di webui: il meteo della ronda (round.weather → label → preset)
viene scritto a ogni lancio gara, FUORI dal cancello EVO-chiuso (test del
20/10: scritta accettata a gioco aperto). Se il round non dichiara meteo,
non tocca nulla.

### Procedura di test per una ronda (come l'abbiamo fatta oggi)
1. `node src/weather.mjs` → preset attuale;
2. `node src/weather.mjs <preset>` → scrivi quello voluto (o lascialo se gia
   uguale: il prep della GUI fa da se);
3. NON toccare il menu meteo di EVO prima di partire (riscrive il file con
   la sua selezione);
4. avvia la sessione → in pista asfalto come da preset;
5. verifica post-hoc: log di gioco (`WeatherType_*`) + `node src/weather.mjs`
   (il file deve mantenere il preset scritto).

Prossimi passi naturali: collaudo del preset 7 custom in sessione; pannello
meteo nella GUI (i 7 preset + slider custom) che richiama weather.mjs.

## CRASH AL SESSION START: AI 99-100 CON GRIGLIA MISTA ZAVORRATA (20/10/2026, sera)
6 crash identici e deterministici (0xC0000005 su un Render Worker, stack in
cohtml/Gameface) SEMPRE nello stesso punto: ~1 ms dopo "Opponent [12] found"
al "Request session start" — prima della creazione del tracciato. Non era:
- il click veloce su INIZIA GARA (crash anche con la schermata completa);
- il meteo: bisecato con il campo meteo DEL CUSTOMGRID (campo 4, vince sul
  selettore a sessione start — scoperto a sua volta stanotte) a 0/Clear:
  crasha uguale;
- le zavorre: Monza 19/10 le ha corse (100kg, AI 99/100, sereno).
- la pista/la sede: Donington corrispondeva campo per campo al file scritto
  da EVO per la Donington vera del 18/10.
COLPEVOLE (CORRETTO IN SEGUENTI PROVE): NON era l'AI — la griglia 14×205 con
AI 88/93 ha crashato UGUALE e la STESSA AI 88/93 su 15 celle ha PARTE. La vera
differenza: la TAGLIA/Pattern della griglia scritta dal builder.
- crashano: 12 e 14 celle quando il builder RIPETE LA STESSA CELLA in loop
  (pool di 1-3 varianti: monomarca, pool ristretto) — celle cloni identiche;
- partono sempre: 15/16/17 celle con preset meccanici e VISUAL ALTERNATI
  (come le scrive il GENERA del gioco: visual_1/visual_2, mech varianti).
Conferma in pista (23:5x): il 5/5/5 (griglia 15, alternanza naturale) su
Suzuka è PARTITO al primo colpo — la pista scritta da noi (Suzuka con tag GP
e lunghezza ereditati dal cambio sede) era innocente.
Rimedì:
- gridbuilder.mjs ora ALTERNA il visual preset (1↔2) sulle celle pari quando
  costruisce la griglia (le cloni identiche non passano più);
- gr86-r5-escort resta con aiStandard 88-93 (provata in pista,non un rischio
  ma la conferma che l'AI non era la variabile);
- le griglie < 15 celle per serie ristrette: la vigia/builder con alternanza
  visuale valgono il post.
Lezioni di sidecar:
- il campo meteo (campo 4) dentro il customgrid VINCE sul selettore di
  gamemode.lastgamemode alla partenza; patcharlo con gli stessi tool del
  campo 4 del gamemodesave (decode → varint → encode, backup prima);
- quando una teoria di bisecata non regge alla prova seguente: tornare ai
  confronti byte-a-byte (qui è stato quello a smascherare l'AI innocente e
  il pattern-cella colpevole).

## NÜRBURGRING: LO SCREVINATO DEL TRACK ESTERNO (21/10/2026, nottata)
R1.5 della RX-7 (Nürburgring GP): crash C++ (0xE06D7363, GameThread) al load
della Practice, ripetuto identico ×3. Firma nel log:
- menu: `Failed loading resource: .../tracks/n%C3%BCrburgring_gp-gp.texture`
- sessione: `Exception thrown: Trying to load a message with an empty path`
  + `tracks/-.texture` → eccezione.
Rimedi TENTATI e non sufficienti: layout "Gp Strecke Time Attack" (lo stesso
che EVO scrive nelle sessioni vere di settembre) e nome senza "ü"
("Nurburgring", idem, dai Results). Il crash dimentica con il file ESTERNO:
un CAMPO NASCOSTO (id asset pista?) resta agganciato alla pista precedente
(Suzuka/Red Bull) sedilmente riscrivendo nome/tag/layout: EVO costruisce il
percorso risorsa da quel campo → combinazione inesistente → path vuoto.
SCAVINATO (da fare nel menu di EVO): al cambio-pista serve che EVO riscriva
il file dal SUO menu — le selezioni da menu producono sempre sessioni vere
(serata 18→20, fatta davvero a cata), mentre l'editor esterno NO.
RISOLTO (21/10, notte): il campo fantasma NON esisteva. Il diff col file
sano scritto dal menu EVO mostra che i campi bruti erano i nostri stessl —
TAG e LAYOUT sbagliati (ereditati da unendo piste diverse):
- Nürburgring GP: name "Nurburgring" (ASCII), tag "Gp Strecke",
  layout "Gp Strecke Race" (il layout di gara, non il "Time Attack" letto
  dai Results di settembre — le sessioni vere di settembre erano Time Attack).
La pista "tutta rossa" nel menu era la texture mancante per quel triplete;
ricliccando la pista dal menu EVO il file sano è tornato e la R1.5 è PARTITA.
set-track.mjs ora porta TRACK_SPECIALS (chiave/mail Nome) con i campi
f5.2/f5.3/f5.6 giusti per le piste che hanno asset dedicati: al prossimo
"set-track Nürburgring GP" la pista arriva già session-ready. Le sessioni
vere restano la fonte: quando EVO riscrive un weekend per altra pista
Session-ready", si aggiunge l'entry la TRACK_SPECIALS.
Prossimo passo: catturare il gamemodesave scritto da EVO a selezione fatta e
fare il diff col nostro: il campo mancante salta fuori e set-track si
completato (rimane UNA pista fantasma in più, non una sola).

## GARA-LETTE del PASSATO incassata a catena (21/10, notte) — vedo e sistemo
Su un import a post-gara il flusso ha incassato DUE file nello stesso gesto:
1. il vero (Tale) 21/10 00:46 Nürburgring RX-7 R5, P1 → corretto;
2. un VECCHIO risultato del 7/10 (Laguna Seca, R6 combaciante) MAI incassato
   fino a quel momento: la carriera gli ha dato 20 pt + 7000 € come se fosse
   lived lle. Il vela import accadda un file per giro: appena il primo entra,
   il ledger si ri-sbriglia e il secondo corrente passa nel medesimo comando.
Rimedio IMMEDIATO (fatto, verificato): restore dal backup automatico
(bak-22-47-56, preso 54" prima dell'incasso fantasma) + rimozione della
entry dal ledger: round 5, banca 300.802, 5 gare RX-7 — lo stato giusto.
REGOLA per il flusso: quando incassi a post-gara, GUARDA il log/ledger:
se il secondo file incassato è più vecchio del round appena assodato,
è fantasma. Il rimedio a doppio-boot: nel watch/import-later ir'cre CZÊ
impostata 'dall'ultimo round incassato' anche a stampa — da capire meglio
con Mauro; l'import a catena manchi verità (la default oggi è trattasi 1
per tick, va riesamina quando succede in fermo).

## SCHERMATA PISTE VUOTA (22/10, notte) — Laguna Seca col kit del Nürburgring
Causa: al cambio pista verso Laguna Seca (R6, lanciato dal browser) specFor
ha ereditato tag/layout/continente dal FILE PRECEDENTE (che era Nürburgring):
"Laguna Seca" dichiarata con tag "Gp Strecke", layout "Gp Strecke Race" e
continente "Europe" → la schermata selezione piste si svuota (stesso sintomo
del fantasma Nürburgring del 21/10).
Fix alla radice in tools/set-track.mjs: specFor ora scrive VALORI ASSOLUTI
per ogni pista del libro — tag "GP", layout "GP Race" (il catalogo del server
dedicato conferma: tutte le piste mono-layout si chiamano così) e continente
dalla mappa CONTINENTI[paese]. TRACK_SPECIALS resta solo per le piste con
layout propri (Nürburgring). Riparo applicato al vivo: 4 blocchi riscritti,
backup bak-track-2026-10-20T23-20.
REGOLA: dopo ogni cambio pista, controllare i 4 campi (nation/name/tag/
layout/continent/len) su TUTTI i blocchi — non solo il nome.

## PAUL RICARD: LA TESSERA Scura ERA IL TAG ERREDITATO (21/10 pomeriggio)
Il sintomo (ripetuto 3 volte in giornata): nel menu la tessera del weekend
di Paul Ricard restava SENZA preview (solo dati sotto: 5842 m, BOX 34),
anche col file riscritto dal gioco. Il log UI (Logs/log-*.txt, righe
"gameface | Failed loading resource: coui://uiresources/images/tracks/…")
rivelava il colpevole: il menu chiedeva `paul_ricard-gp.texture` — che non
esiste, perché Paul Ricard NON ha un layout "GP" (ha i 4 Layout X).
Causa: il tag f5.3 = "GP" ereditato dal file precedente (specFor generico).
VALORI VERI (prova: Results 17/10 22:19 e 19/10 23:40 della sessione voluta;
cartella MoTec "Paul RicardLayout 1C-V2", schema identico a
"NurburgringGp Strecke"): tag f5.3 = nome del layout ("Layout 1C-V2"),
layout f5.6 = nome + " Race" ("Layout 1C-V2 Race").
Fix in tools/set-track.mjs TRACK_SPECIALS.paul_ricard + riscrittura 4 blocchi
(backup bak-track-2026-10-21T15-06): DAL LOG dopo la riscrittura ZERO
richieste fallite e la tessera mostra la preview (conferma Mauro 17:0x).
REGOLA: le piste con layout propri vogliono tag = NOME DEL LAYOUT scelto,
non "GP"; il path asset della card è tracks/{asset}-{tag snake}.texture.
REGOLA 2: la card segue i campi del FILE, i layout del selettore interno
di EVO (screenshot 15:54) sono già tutti corretti: il selettore e la card
leggono la STESSA componente solo dopo la riscrittura del tag.


## PROVA CONTROLLI SETUP — FATTA e mappata (21/10, 21:03–21:21)
Spia attiva durante la prova: 297 righe in `data/setup-monitor.jsonl`
(711 cambi con la schermata setup APERTA contro 31 fuori). LA MAPPA:

**VISIBILI LIVE nella memoria condivisa (con uiSetup=true):**
- geometria: `p.rideHeight` ×248, `p.suspensionTravel` ×135, `p.camberRAD` ×113
  (fluttuano da sole: il simulatore assesta l'auto ferma — non è il pilota che muove)
- clima/pneumatici: `p.airTemp` ×110, `p.roadTemp`, `p.wheelPressure` ×17, `p.tyreCoreTemp`
- elettronica (i manopoli del MFD): `e.abs` (slider mosso da Mauro 7→4→8→10),
  `e.tc`/`e.tcCut`, `e.diffPower`/`e.diffCoast`, `e.frontBump`/`e.frontRebound`,
  `e.rearBump`/`e.rearRebound`, `e.brakeBias`, `e.ignition`, `e.pitLimiter`,
  `p.autoShifterOn`
- benzina: `g.fuelLiters` (98→120) e `g.lapsPossibleFuel` (la rampa del tab Carburante)

**SOLO-FILE (mai passati dalla memoria condivisa durante il setup):**
- AERODINAMICA (alettoni): ZERO campi aero in shmem — confermato il sospetto:
  si legge SOLO dal .carsetup salvato (o .ld di MoTec)
- `p.ballast` mai comparso (le 296 non avevano zavorra: da rifare su un'auto
  caricata per confermare che la zavorra sia leggibile live)
- file toccati da EVO in prova (lavorano da soli, fuori shmem):
  `last_season.seasondefinition`, `CarCameras.carcamerausersettings`,
  `AssistPresetListType_CUSTOM.racingsettingsassistpreset`,
  `GameModeType_RACE_WEEKEND.gamemodesave`, `gamemode.lastgamemode`,
  `last_grid.customgrid`

Dubi/dettagli: `p.fuel` in log mila valori IDENTICI a `p.roadTemp` → offset
sospetto nel filtro physics (da verificare prima di fidarsi); la spia
rilegge i filtri solo ari di campo già censiti (usa `p.rideHeight`, `p.camberRAD`,
`p.suspensionTravel`, `p.airTemp`, `p.roadTemp`, `p.wheelPressure`, `p.tyreCoreTemp`,
`p.brake`, `p.ballast`, `p.fuel`). LA SPENSA POLA LA PROVA: rilanci con
`node tools/watch-setup-changes.mjs`; mappe con `node tools/map-setup-spy.mjs`.
## MAGAZZINO BACKUP e COPERTURA OFF-SITE (22/10/2026)

Le copie del progetto sono quattro, indipendenti tra loro:

1. Disco: la cartella del progetto sul Desktop, con .git.
2. OneDrive: i due zip (backup completo e pacchetto portatile).
3. Disco L:, cartella CarrieraEVO: lo stesso coppia di zip, con impronte SHA-256.
4. Repository privato online (facoltativo): la sola storia git dei commit.

Strumenti:

- AggiornaMagazzino.cmd (su L:\CarrieraEVO): copia in magazzino lo zip più
  recente trovato in Desktop\Mod ac evo\dist\ e su OneDrive, solo se è cambiato,
  e riscrive LEGGIMI-MAGAZZINO.txt con le impronte SHA-256 rinfrescate.
- controlla-magazzino.cmd (progetto) oppure npm run magazzino: è un avviso.
  Allerta se l'ultimo backup ha più di 21 giorni (soglia variabile a riga di
  comando) o se ci sono commit git nati dopo il backup più recente.
- avvia.cmd lancia lo stesso check in forma breve quando apre la GUI: una riga
  sola se va tutto bene, avviso se no, silenzio con il disco L: staccato.
- sincronizza-git.cmd (progetto): la copia off-site. Configurazione una volta
  sola: repo privato vuoto su GitHub, poi
  git remote add offsite https://github.com/TUONOME/ac-evo-career.git
  poi doppio click sullo script. Il primo push chiede login nel browser.

Note tecniche:

- Il check dei commit confronta la data dell'ultimo commit HEAD con la data del
  file più recente del magazzino. Confronto per date, non per contenuto.
- Il zip completo si crea con bsdtar (il tar di Windows). Esclusioni: dist/,
  node_modules, demo, sessione-21-10. Dentro: .git, data/ (save personali),
  gui/carmaps, gui/trackmaps, COME-RIPRISTINARE.txt.
- Ripristino collaudato: estrazione in cartella di prova, git log a puntamento,
  npm test 93/93 passati, save e mappe al loro posto.
- Il zip completo NON si condivide: contiene save personali e mappe KUNOS,
  che sono ad uso personale; dettagli in LICENSE.md e in COME-RIPRISTINARE.txt.

## LINGUA DELLA GUI: infrastruttura pronta, traduzione "pigra" (22/10/2026)

Motivo: se un giorno il progetto viene pubblicato (PUBLICA-CHECKLIST.md, fase 4)
serve l'inglese. Tradurre tutto in una sessione sola avrebbe obbligato a estrarre
~770 testi in un colpo, con un alto rischio di regressioni. Deciso quindi:

- `gui/js/lang.js`: LINGUA letta dal localStorage (chiave `evo-lingua`), funzione
  `tr({ it: '...', en: '...' })` con le due voci, e `impostaLingua()` che salva
  e ricarica la pagina. Testo senza voce inglese → resta l'italiano: la GUI non
  resta mai vuota.
- Selettore Lingua in Impostazioni (viste-d.js): Italiano / English, vale per
  quel browser; nessun campo nuovo nel save, nessuna API nuova.
- Già bilingui: menu di navigazione (core.js TABS), banda Aggiornamenti al
  completo (testo, bottoni, toast), chip header "EVO aperto/chiuso".
- REGOLA PIGRA per Buffy (l'agente): ogni volta che una vista viene toccata per
  qualsiasi manutenzione, le sue stringhe si convertono in `tr({it,en})` nello
  stesso giro, con `npm test` dopo. Vista dopo vista la traduzione si completa
  senza sessione dedicata. La CLI e l'output del server (src/cli.mjs,
  src/webui.mjs) restano italiani fino alla fase 4 della checklist.
- Totale da convertire nelle viste: ~770 testi (conteggio 22/10/2026,
  core + 7 file viste in gui/js).

## MODULO STANTIO NEL LAUNCHER + BEST-LAP AI CORROTTI DAL WRITER EVO (22/10/2026, seoporanata)

### 1) Codice stantio nel launcher (webui.mjs)
- CHE COSA: due eventi Paul Ricard nel registro calibrazione nati "già rotti"
  (base false, delta nulli) NON per colpa del motore: erano scritti dal processo
  long-running del launcher con il VECCHIO grid-calib.mjs in memoria (import
  statico: il codice che c'era quando il processo era partito).
- LA LEVA: `src/hot.mjs` — hot-reload con cache-busting ESM sulla mtime:
  `await hot('./import.mjs')` in webui.mjs ricrea l'INTERO grafo (import.mjs →
  grid-calib.mjs) quando un file su disco cambia. Patch → il launcher si mette
  al passo da solo. Le utility di sola lettura (ledger/log) restano statiche.
- VERIFICATO: stessogmodulo se il file non cambia; nuovo modulo col nuovo
  contenuto dopo la scrittura (scritto via scratch, rimosso). npm test 103/103.

### 2) Il writer di EVO scrive best-lap/split delle AI che NON si fidano di (19:35)
- IL CASO: gara 19:35 Paul Ricard col customgrid 11-NSX. I best lap scritti
  delle top-AI mostrano S1/S2 combacianti i miei (±0,05–2,4s) e S3 da 46,8–58,2s
  dove la MIA S3 nella STESSA sessione è 67,0s: NSX-R (100kg + 11%) a 2:19.59
  mentre lo STESSO pilota chiude P1 a +84,77s da me. best scritto e totali di
  gara si contraddicono: impossibile che entrambi siano veri.
- RICOSTRUZIONE DEL RITMO: (totali − ~85s di trattenuta/partenza)/3 ≈ 161,3s,
  IL MEDIO MISURATO della gara 19:01 (162,4s). NESSUN nuovo regime di forza del
  campo: solo best-lap scritti gonfiati (~×0,87). La "NSX −4,73s" del 19:35 era
  artefatto; la proposta 19,5% NON va eseguita.
- CURA (grid-calib.mjs, testata): due guardie in analyzeRace —
  1) RIGA: best > (total_time/laps) + 8s → la riga esce dalla mediana
     (sui reali 0 scarti: con laps/totali veri non esistono). 
  2) EVENTO: massa di AI con S3 scritto più veloce del tuo di >8s (S1/S2 al
     bordo equivalenza) → evento.sospetto = settori-ai-impossibili, segnale
     'dati-sospetti', ZERO proposte, e nelle statistiche NON conta né come
     osservazione né nelle mediane ("1 scartate (dati impossibili)" in CLI; nel
     registro resta per trasparenza, append-only intatto).
- STATO CALIBRAZIONE dopo le guardie: Paul Ricard 1 misurazione reale (19:01,
  NSX −3,52s a 5%), confidenza bassa. L'11% resta NON MISURATO su dati veri:
  serve un round PR nuovo stesso impianto della 19:01, poi si valuta il timbro.
- Anche il backup del registro: data/backups/grid-calibrazione.bak-prima-guardie.json.

## SEBRING: IL BOOK DICE "Sebring", EVO VUOLE "Sebring International Raceway" (22/10/2026, sera)

Ronda RX-7 su Sebring GP: "prepara la gara" ha scritto il weekend con i campi
pista presi dal LIBRO, e il riquadro della pista nel menù è uscito VUOTO.

- CHE COSA: il riquadro della pista risultava VUOTO nel menù e il load crashava
  (stesso schema del Nürburgring del 21/10, path risorsa inesistente). Il file
  portava name "Sebring", id 29, 6019 m — i valori del LIBRO (TRACK_INFO),
  NON quelli dell'asset EVO.
- SCAVINO con il nuovissimo tools/watch-gamemode.tmp.mjs (fs.watch sul file
  weekend + dump dei campi 3.5.x a ogni riscrittura): guardato l'utente fare
  UN GIRO DI CLICK USA nel menù EVO (Road Atlanta 28, Laguna Seca 24, COTA 34,
  Watkins Glen 40, Sebring 45). Il file SANO che EVO scrive da solo porta:
  name "Sebring International Raceway", 5954 m, tag "GP", layout "GP Race"
  (COTA invece va col layout "National Race" e attr "National"; Watkins col
  "Short Inner Loop Race") — Sebring è UNICA ma NON è fuori standard: i suoi
  tag/layout combaciano i default mono-layout del book. SOLO name e length
  differiscono.
- FIX (set-track.mjs): TRACK_SPECIALS.sebring = { name: 'Sebring
  International Raceway', lengthM: 5954, tag 'GP', layout: 'GP Race',
  continente: 'North America' }. Spec verificato DRY su tutti e tre gli alias
  ("Sebring GP" / "Sebring" / il nome asset) e il file già sano su disco:
  0 campi da riscrivere.
- REGOLA VIVENTE: ogni pista che il launcher prepara col file vuoto/crash
  merita IL GIRO DI CLICK USA nel menù EVO col watch attivo, poi l'entry in
  TRACK_SPECIALS con i valori OSSERVATI (non dedotti). La lista comincia da
  nurburgring e paul_ricard e ora anche sebring.
