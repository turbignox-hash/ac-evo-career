# Griglie di fabbrica

Questa cartella viaggia COL programma: è l'ultimo ripiego della corsa dei
candidati della griglia (prima il magazzino per serie `data/grid-templates`,
poi i backup del disco, poi gli snapshot). Serve a chi riceve il programma
installato su una macchina vergine: al primo cambio di campionato la griglia
della serie nuova parte senza nessun rituale manuale in EVO.

**Auto con POCHE liveries (24/10): fissata da solo.** Se il modello esiste con
meno varianti delle 14 vetture richieste (es. Junior: 6 liveries, non si possono
inventare — EVO crasha sulle celle ripetute), il guardiano NON chiede più di
rifare il GENERA: **fissa la griglia della serie al numero di liveries reali**
(es. 6 vetture), aggiorna il ladder con backup (career.evo.ladder.json
.bak-griglia-*) e fotografa comunque. UIS/UI/premi si riscaldano da soli al
nuovo numero. La raccolta di quelle serie è quindi AUTOMATICA: GENERA+APPLICA
con le liveries che il gioco offre, AVVIA, fine.

## Come si riempie (una volta per serie)

**Modo consigliato (24/10): il guardiano.** Da un terminale:
`node tools/raccogli-griglie.mjs` — prima stampa il quadro (✅ coperte / ⬜ da
raccogliere, con auto e size), poi veglia su last_grid.customgrid: ogni volta
che EVO scrive la griglia all'avvio della sessione, riconosce LA SERIE dalle
auto, la valida col builder e la fotografa da solo in magazzino + fabbrica.
Lavoro tuo: solo GENERA+APPLICA+AVVIA, una serie per volta (Ctrl+C per uscire).
Con `--stampa` rivedi solo il quadro senza vigilare.

In EVO, sul round della serie da raccogliere: menu griglia del round →
**GENERA** con le auto della serie (liveries diverse a giro: le celle devono
rimanere tutte UNICHE, la regola anti-crash di EVO 0.9.1) → **APPLICA**.
Il tool fotografa quella griglia in `data/grid-templates/<nodeId>.customgrid`.

Poi copi qui il file con il nome della serie:
`<nodeId>.customgrid` (nodeId dalla config `career.evo.ladder.json`, esempio
`coppa_audi-rs-3-sportback.customgrid` — critici sostituiti con `_`).

## Regole

- SOLO griglie vere fotografate da EVO: mai celle inventate a mano (crash).
- Prima dell'uso il tool verifica che ogni auto citata dalle celle esista
  nell'installazione (stesso criterio di `validateLadder`); manca qualcosa →
  messaggio chiaro con le auto, niente file scritto a casaccio su EVO.
- Catalogo non leggibile/instanza senza contenuti → nessun blocco: la corsa
  dei candidati e il builder restano i giudici.
- Il primo successo in qualsiasi fonte appunta il template per la serie: da
  lì in poi la fabbrica non serve più.
