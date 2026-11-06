# Audit dei numeri mostrati in WebUI — 6/11/2026

Richiesta di Mauro: «Fai un audit delle schede visibili e scova ogni numero ancora
stimato o generato dal modello».

Metodo: per ognuna delle **19 schede** ho seguito il percorso
`vista GUI → azione API → modulo server` e classificato il numero in una delle
quattro famiglie:

- **REALE** — letto da file, log o telemetria di EVO (o dal catalogo del gioco);
- **DERIVATO** — aritmetica onesta su dati reali (somme, medie, percentili, gap);
- **STIMA** — calcolo del tool, dichiarato come stima o valutazione;
- **MODELLO** — simulazione/generazione del tool, non un dato del gioco.

## Esito per scheda

| Scheda | Numeri principali | Fonte | Esito |
|---|---|---|---|
| Risultati (import) | posizione, giri, best, settori, sorgente file | `.sessionresults.json` | REALE |
| Archivio | sessioni, piazzamenti, tempi | file Results + archivio locale | REALE |
| Online | sessioni `_MP_`, piloti, tempi | file Results MP | REALE |
| Rivali | forma, testa a testa, vittorie, podi, giro veloce | file Results di tutte le sessioni | REALE + DERIVATO |
| Piste | layout, lunghezze, record personali | catalogo + file Results | REALE |
| Auto | PI, specifiche, varianti | catalogo del server dedicato + AC1 | REALE |
| Auto — prezzo | «prezzo reale indicativo (listino o mercato)» | listino statico | STIMA (dichiarata) |
| Auto — percentili flotta | posizione nel catalogo | calcolo sui dati reali | DERIVATO |
| Griglia | celle, piloti, AI/PI del file | `customgrid` scritto dal gioco | REALE |
| Griglia — proposte | campo AI, bilanciamento | modello del tool | MODELLO (proposta) |
| Setup | giri, settori, telemetria, storico file | MoTeC + `Car Setups` | REALE |
| Setup — consigli | leve, valori, priorità | modello del meccanico | MODELLO (consiglio) |
| Setup — Prove | migliorato/peggiorato/neutro | delta misurato sui giri veri | REALE |
| Analisi — autopsia | perdi/recuperi per zona | telemetria reale | REALE + DERIVATO |
| Analisi — tetto | somma dei migliori settori | settori reali | DERIVATO (dichiarato «teorico») |
| Analisi — banco A/B | diff canali, tempo per zona | due sessioni MoTeC | REALE |
| Analisi — Monte Carlo sedile | probabilità, posizioni attese | simulazione | MODELLO (dichiarato «Estimate») |
| Giri liberi | sessioni, best, giro ideale | file Results non-gara | REALE + DERIVATO |
| Giri liberi — preset | giri/minuti consigliati | PB reale, tace se manca | STIMA (dichiarata) |
| Statistiche | vittorie, podi, DNF, premi, piste | risultati importati | REALE + DERIVATO |
| Finanze | entrate/uscite, saldo | registro del tool | MODELLO (economia di carriera) |
| Difficoltà | trim proposto, banda AI | formula sui risultati | MODELLO (proposta) |
| Messaggi | offerte, contratti, premi | generati dal tool | MODELLO (contenuto) |
| Agenda | giorni, ore, eventi | calendario virtuale del tool | MODELLO (contenuto) |
| Campionati — calendario | date, ore, meteo | ladder + piano orario | MODELLO (piano) |
| Campionati — classifica | punti e posizioni | **rivali simulati**, tuoi punti dalle gare | **MODELLO non dichiarato → corretto** |
| Campionati — card | premio, iscrizione, rep richiesta, griglia | ladder | MODELLO (regolamento) |
| Campionati — Mondiale | skill, età, profilo | generati | MODELLO (dichiarato «stima») |
| Cruscotto | prossima gara, difficoltà, soldi, rep | ladder + economia del tool | MODELLO (contenuto) |
| Cruscotto — stagione | posizione in classifica | classifica del modello | **MODELLO non dichiarato → corretto** |
| Cruscotto — pubblico | spettatori attesi | formula sulla pista | STIMA (dichiarata) |
| Impostazioni | slot, backup, integrità, lingua | stato reale del tool | REALE |

## Difetti trovati (tutti corretti il 6/11)

1. **Classifica di campionato spacciata per misura.** In `standingsFor()`
   (`src/state.mjs`) i punti degli avversari vengono da `finishOrder()`, un
   modello deterministico (hash di pilota/pista/round); i punti del giocatore
   sono calcolati dal regolamento sulle gare importate. La tabella non lo diceva:
   aggiunta la nota sotto ogni classifica, in IT ed EN.
2. **Posizione in classifica prima della prima gara.** Il Cruscotto mostrava
   `P…` calcolata su round che il giocatore non aveva corso. Ora la posizione
   compare solo dopo almeno una gara nella serie (`standingPending` in
   `raceCard`), e la card del campionato dice «prima gara da correre».
3. **Storia dell'allievo con lo stesso guadagno su campi diversi.** Il delta del
   giro veniva intestato a ogni leva toccata nello stesso round (aero, assetto,
   camber con lo stesso «1.30s»). Ora l'esito si attribuisce solo ai round con
   una sola leva; gli altri sono dichiarati «condivisi» (vedi `src/allievo.mjs`).

## Cosa resta dichiarato e non va cambiato

- Monte Carlo, giro ideale, tetto teorico, percentili, valutazione dell'usato:
  calcoli su dati reali o simulazioni già etichettate.
- Messaggi, eventi, sponsor, eredità, gazzetta, difficoltà, griglia: contenuto di
  carriera del tool, non letture del gioco; il testo li presenta come proposte.
- Meteo del weekend e piano orario: sono piani scritti nel menu di EVO, non
  previsioni.

## Limiti dell'audit

- Non ho potuto verificare i numeri «dal vivo» con EVO in sessione: la mappa è
  statica (codice + dati su disco).
- Le schede con contenuto generato non sono state giudicate nel merito della
  qualità narrativa, solo nella distinzione fra dato e modello.
