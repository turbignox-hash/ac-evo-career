
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
- I GUID/log dei log del gioco ("Loaded car <guid> (<id>)") sono di istanza e NON
  battono con la tabella; l'id carId *sì* che è leggibile nei log
  (`ks_alfa_romeo_75_turbo_evo`, `ks_volkswagen_golf_gti_mk8`, `ks_mazda_rx7_fd`...).
- Il GUID manifest di un'auto si vede quando ha un file in SavedCars (l'abarth);
  per le altre, il carHash/guid2 si campiona col cambio auto (1 gesto, una volta sola).
- `content.kspkg` (69 GB) è cifrato dstorage: niente manifest leggibile da disco.

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
