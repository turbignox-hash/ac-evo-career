# Diario di sviluppo

Il diario racconta IL FATTO (ciò che è fatto e verificato), la lista di sopra racconta
IL RESTO (da fare o da rivedere). Ogni giorno prendiamo qualcuna di queste e la
eseguiamo; a fine giornata il diario si arricchisce e la lista si accorcia o si
affina. Le voci hanno un ID (DA-1, DA-2…) per prenderle al volo («oggi prendo la DA-3»).

## Le regole del diario

1. **Una riga per gesto**: niente romanzi — data, cosa fatto, come lo sappiamo (test/prova).
2. **Gli ID della lista NON si riciclano**: una voce chiusa resta nella storia
   con la data di chiusura, e le nuove prendono l'ID successivo.
3. **Nessuna voce fantasma**: se un'idea che volevamo si è già realizzata, la lista
   è là per dirlo, non per illudere. Una voce di lista che non trova lavoro esce con la data.

---

## Cose da fare o da rivedere

### DA-1 — Prova in pista del copilota: bandiere + tagli · STATO: APPUNTAMENTO 1/11 (richiesta Mauro: «ricordamelo domani»)
La rossa/nera e i tagli veri ≤ ~2 s sono verificati SOLO in sandbox (`copilota-narratori.test.mjs`).
Il protocollo è scritto in [PROVA-COPILOTA.md §5](PROVA-COPILOTA.md): tre sequenze in
pista (restart con rossa a schermo, tagli veri a caccia del penalità del gioco, marcia
indietro per la nera) + il grep che smaschera i GREZZI del `flagCode` nel registro MMF.
**Criterio di chiusura**: se il sensore NON scrive la rossa nella MMF mentre a schermo
c'è, è un limite del sensore (uscirà dal grep) — la voce non può dire ciò che il gioco
non scrive, e in diario lo si annota come limite, non come bug.

### DA-2 — Commetti il lavoro delle bandiere · STATO: CHIUSA 31/10 (committ 41e6633) · ✅
7 file modificati e non committati: [src/voce-copilota.mjs](src/voce-copilota.mjs),
[src/uiapp-pub.mjs](src/uiapp-pub.mjs), [src/webui.mjs](src/webui.mjs),
[tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs),
[test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs),
[test/uiapp-pub-priorita.test.mjs](test/uiapp-pub-priorita.test.mjs),
[PROVA-COPILOTA.md](PROVA-COPILOTA.md).
Committare SOLO i file di questa lista, mai `git add -A`: il resto del progetto è già pulito.

### DA-3 — Semaforo «prepara» del cruscotto visto dentro il gioco vero · STATO: DA FARE
Il semaforo (ronda armata / gara al volo con finestre e scadenze) gira in sandbox ma
non è MAI stato visto caldo nel cruscotto in gioco: lanciare «prepara» e guardare le
card accendersi con i countdown, tutto in una sessione, senza ritocchi mancati.

### DA-4 — Banner di riavvio del server su un guasto REALE · STATO: DA FARE
Il filbar di servizio (due fallimenti di rete di fila → banner con bottone «Riavvia il
server») è testato in asciutto 4/4 ma mai cliccato su un guasto vero: con una gara in
corso, fermare a mano il webui e vedere il banner arrivare e il bottone riportare il
server a casa senza perdere l'istanza.

### DA-5 — Sessioni non-gara (practice/testday) davanti ai conteggi vivi · STATO: DA VERIFICARE
Practice e testday entrano nelle NOTE del verdetto (regola «una sola verità» con
archivio), ma i conteggi vivi in gioco (posizione, gap) non hanno mai visto un testday
reale: prima di un testday lungo, guardare se la radio e le card restano honesti
(niente annunci di posizione sparati fuori da una gara).

### DA-6 — Audit periodico dei dati di carriera · STATO: DA RI-PIANIFICARE (ultimo: 28/10)
Ultimo audit: [report/audit-dati-2026-10-28.md](report/audit-dati-2026-10-28.md) —
save coerente, garage map, pool. Da ripetere ogni ~2 settimane di gara viva e
SEMPRE dopo un update del gioco (nuovo DLC o reset del save).

### DA-7 — Release di pacchetto (aggiorna-zip + bump versione) · STATO: AL MOMENTO GIUSTO
Versione attuale 0.1.42 in `package.json`. Da chiamare SOLO dopo che DA-1, DA-3 e DA-4
sono verdi: il pacchetto è il pezzo che va agli amici
(pacchetto-amico + GUIDA-AMICO + FRIEND-GUIDE-EN).

### DA-8 — Rilegge IDEA-POST-PRESENTAZIONE e raccoglie le idee vive · STATO: DA FARE
[IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md) resta nel cassetto: rileggerlo,
decidere per ciascuna idea viva/morta/in sospeso, e spostare quelle vive in questa
lista con ID nuovo. Il resto va chiuso con la data.

### DA-9 — Stint-plan endurance: finestre di sosta e stint calcolate prima della gara · STATO: PRIMA FETTA VIVA (31/10 sera) — resta: annuncio «Finestra box entro 2 giri» del copilota e pannello webui
Oggi benzina e gomme le dice l'ingegnere DAL VIVO durante la sessione
(`engineer.mjs` + `usura-gomme.mjs`), ma la stint-plan di endurance NON ESISTE.

Dalle SERIE A TEMPO (durationMin 30–60, ronde a tempo in race.mjs) servono le
FINESTRE DI SOSTA calcolate prima del via. Ingredienti:

1. consumo stimato del sedile (dall'analisi delle gare passate del sedile);
2. capacità benzina dell'auto;
3. numero di stint e litri per sosta.

Deliverable:

- la raceCard di gara porta la riga «Sostituzioni: stint da ~X min (litri Y)»;
- il copilota annuncia l'ingresso in finestra («Finestra box entro 2 giri»);
- nel webui un pannello mostra il piano prima della gara, aggiornato con i
  dati veri di usura.

Creato il 31/10 su proposta Buffy, accettato da Mauro.
**Prima fetta 31/10 sera**: [src/stint-plan.mjs](src/stint-plan.mjs) puro —
`seatStintInputs` estrae consumo, ritmo e serbatoio OSSERVATO dalle uscite
MoTeC del sedile; `stintPlanOf` stima giri, stint, litri per sosta e le
FINESTRE di sosta (per ciascuna: da a fino a). Poi la riga «Piano stint»
nella raceCard delle ronde a tempo: il webui la calcola dal sedile con memo
120 s (chiave auto|durata: cambiare la durata ricalcola subito). Prova a vista
su un nodo a tempo vero del ladder (`node endurance_gt4`, sonda in tmp FUORI
dal pacchetto): riga leggibile, finestra di sosta centrata al giro giusto.
Test 6/6 in [test/stint-plan.test.mjs](test/stint-plan.test.mjs). Suite 562/562.
Restano: l'annuncio «Finestra box entro 2 giri» del copilota e il pannello
webui col piano aggiornato coi dati veri di usura.

---

## Registro del diario

### 31/10/2026 tarda sera — La finestra stint entra nella radio e nella vista (DA-9 seconda fetta)
Il piano stint esce dall'attesa: ora annuncia la finestra VIVA in gara.
Collegato:
- payload aggiornato di [src/webui.mjs](src/webui.mjs): `stintPlan` (piano intero)
  e `stintAlert` (prima sosta ANCORA raggiungibile con `lapsTo`, 0 = questo
  giro è la scadenza) dentro la variante pesante e leggera. Il leggero prende
  SOLO dal cache CALDO (`caldo:true`): il freddo vale le letture MoTeC, il
  tick radio non deve piombarci su (disco lento, lezione 26/10) — chi scalda
  la cache è il pannello (/api/ingegnere intero e /api/card).
- narratore «finestra» (n. 11) in [tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs):
  «Finestra sosta k: box entro N giri» e alla scadenza «Box entro QUESTO
  giro» (UNA frase per finestra, semina su slot.last.finestraK). «finestra»
  entra nei livelli essenziale/normale di [src/voce-copilota.mjs](src/voce-copilota.mjs).
- pannello nel panneau ingegnere della GUI ([gui/js/viste-a.js](gui/js/viste-a.js)):
  piano (giri, stint, litri, finestre) + banner della finestra alla mano.
  Fuori gara a tempo o senza dati del sedile NON esce — niente pannelli
  fantasmi: la stessa onestà di card e copilota.
- BUG FONDAMENTALE preso dai test: `stintPlanOf` usava `tr` SENZA importarlo
  → ogni piano cadeva in ReferenceError: il piano non era mai nato davvero.
  Aggiunto `import { tr }` in [src/stint-plan.mjs](src/stint-plan.mjs) e guardia
  «giri compiuti == null → null» in `stintStopAlert`.
Test: +3 in [test/stint-plan.test.mjs](test/stint-plan.test.mjs) (alert vivi e scaduti, null
  per input brutti), +3 in [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs)
  (primo annuncio, apertura dopo la sosta, si tace senza piano). **Suite 568/568.**

### 31/10/2026 sera — La stima provata a ponte spento (e la tessera committata)
La tessera dell'header committata (d859430, dopo riepilogo suite 556/556 e lint
pulita su 278 file). Poi la prova DELLA STIMA CHE NON ESISTERA: il webui rientrato
con `PADDOCK_JOURNAL_DIR="C:/no-such-paddock-dir"` (la root inesistente → il ponte
silenzia per progettazione, NON cade sui journal veri) — console e GUI dicono lo
stesso: API `source:"stima"`, chip «~Fuoriclasse» giallo col tooltip della stima
(rep 632 ≥ 490). Rientro pulito subito dopo: `source:"paddock", pct:100` di nuovo.
Domani (1/11): appuntamento in pista per la DA-1.

### 31/10/2026 sera — La tessera del livello anche nell'intestazione della GUI
La tessera che la card Paddock disegna da solo nell'app del gioco arriva ANCHE
nell'intestazione della GUI web (campo «Livello» accanto a Reputazione): VERA col
ponte (pd-home profile.level, nome+colore+pct del gioco), STIMA marcata «~» dalla
reputazione della NOSTRA carriera quando Paddock non parla — e sotto la soglia
osservata 490 niente chip: niente inventate. Clic → Statistiche.
Pezzi: `paddockLevelBadge(rep)` in [src/paddock.mjs](src/paddock.mjs), campo
`levelBadge` nell'header server ([src/webui-views.mjs](src/webui-views.mjs)), chip in
[gui/index.html](gui/index.html) + [gui/js/core.js](gui/js/core.js) con le stesse
regole di traduzione statica. 2 test nuovi nel ponte (13/13): reale dal journal,
soglia ferma a 490, stima sopra/sotto. **Suite 556/556, lint pulita.**

### 31/10/2026 — Paddock 1.0.2 e la tessera del livello
Paddock aggiornato alla **1.0.2** (l'estrazione richiedeva la chiusura dalla tray:
le carriere restano in Saved Games, l'app in gioco si è aggiornata da sola al primo
avvio; backup della 1.0.1 in Desktop\Paddock-1.0.1-bak-31-10). Verificato dal vivo:
la versione in app.json e i **12 journal riscritti** al primo giro.
Miglioria presa dalle novità: i journal ora portano `profile.level` con i NUOVI
colori dei driver level — la card Paddock del cruscotto mostra la tessera
(nome + livello col COLORE esatto del gioco, Fuoriclasse #f5c542 per Mauro).
Tessera in [src/paddock.mjs](src/paddock.mjs) (paddockOverview passa profile →
api/paddock) e [gui/js/viste-a.js](gui/js/viste-a.js).
La prova del vuoto: **Paddock NON installato non crea problemi** — piccolo
[test/paddock-assenza.test.mjs](test/paddock-assenza.test.mjs) (7/7) che replica
l'assenza col PADDOCK_JOURNAL_DIR impossibile: endpoint 200 col JSON ok:false,
niente card, import resta zitto, bonus gara pulita integra (è matematica pura),
schede auto perdono SOLO l'extra tecnico. **Suite 554/554**.
### 31/10/2026 — Le bandiere entrano nella storia (DA-2 chiusa)
Committ 41e6633: le 7 bandiere (30/10 notte) committate in un commit uno, tutto il resto
pulito; poi 5fbeca0 il diario. Mauro scarica Paddock 1.0.2 da OverTake (chiuso dalla tray,
estratto sopra la vecchia cartella: le carriere restano, la copia in gioco si rifà da sola
al primo avvio); a fronte i test di paddock-bridge per convalidare il ponte.

### 30/10/2026 pomeriggio — Giro di controlli a bordo fermo (preparazione DA-2)
Diff dei 7 file delle bandiere LETTO E VALIDATO: il fix della F40 a sorpresa era
lo stallo del pending scaduto che rimontava l'auto-evento a ogni lettura — ora il
canale evento vive SOLO nella finestra di 24 h armata dal click «Prepara tutto e
divertiti» (state.eventoPreparato scritto da event-prep in webui.mjs), test dedicati
(3 nuovi in uiapp-pub-priorita) e narratore coperto.
Copia installata del cruscotto ALLINEATA alle sorgenti (41261 byte, scritta 29/10 23:52):
l'app in gioco monta il codice nuovo.
Pitwall SPENTO DI PROPOSITO confermato (marcatore rinominato .disattivato, sorgente
tolta): non è un relitto, non si tocca.
Paddock: niente copia da allineare — leggiamo solo i journal dell'app del gioco.
Nessuno in ascolto sulle porte 8642–8644: al prossimo avvia.cmd il webui parte
COL CODICE NUOVO: nessun riavvio necessario prima di stasera.
Rimosso il relitto .webui.pid (datato 23/10, PID 14200 morto; nessun file nel
progetto lo legge — scritto da una versione vecchia).

### 30/10/2026 — Le bandiere che non risultavano da nessuna parte 🙂
Avevi ragione: stessa fontana del verde. Il narratore leggeva solo alcuni codici del
campo `flagCode` della MMF (verde 2, a scacchi 8) e la rossa (3) e la nera (6) cadeva
nel silenzio per costruzione, non perché il bello non le scriva mai. Da ora:
«Bandiera rossa!» sul passaggio a rossa (procedura di restart, sospensione),
«Bandiera nera: il gioco ti squalifica» sul passaggio a nera; sibile zitte alla prima
lettura, distanziello di 15 s condiviso tra le due, livello essenziale (sono ordini di
pista come il verde). Test dedicato: 27/27 verdi nel file del copilota.
Verifica di fine giornata: suite **547/547** pass (9270 ms), lint pulita (0 errori,
0 warning su 264 file). Protocollo di prova scritto in PROVA-COPILOTA.md §5 → DA-1.

### 30/10/2026 — Giornata di bug in pista, tutti con la loro mano
- **R5 → F40 a sorpresa a fine gara**: il cambio auto istantaneo riusciva a partire
  da un comando dell'app senza finestra armata (scappatoia trovata e tappata).
- **Gara ripartita da sola tornando al menu**: auto-via senza finestra → corretto con
  la finestra di 30 min dopo «Prepara tutto» + la lettura dello store che distingue
  «ack assente» da «lettura a metà scrittura». Test dedicati.
- **Penalità + rossa a schermo dopo il restart**: indagato nel registro del copilota —
  l'annuncio era vero e corretto nel tempo, la bandiera non c'era nel campo: rimanda
  a DA-1 (il grep del protocollo la smaschererà domani).

### 29/10/2026 — Giorno di radio, verdetto e bottoni
Riepilogo radio silenzioso sul rumore di servizio; verdetto di giornata (CLI +
webui, qualifiche in sezione a parte); bottoni «Prepara e divertiti» sul cruscotto;
gara al volo con pista/istantanea veri; finestra del via anti-riparto; verdetto
261029 rigenerato con le qualifiche a parte.

### 28/10/2026 — Giorno del trapianto
Weekend-roster (trapianto delle celle nel blocco weekend, idempotente con potatura e
verify di rilettura, 7/7 sandbox); riavvia-webui che scopre da solo il processo sulla
porta; banner di riavvio nella GUI; audit dei dati della carriera; gara al volo con
griglia dal pool.
