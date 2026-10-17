# Ricerca automazione gara — stato e conclusioni (18 settembre 2026)

Obiettivo: preparare la gara personalizzata di EVO da file, come Zero to Apex fa su AMS2.

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
