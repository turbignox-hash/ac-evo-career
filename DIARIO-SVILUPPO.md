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

Prova sul vivo 30/10 sera (gara di test, registro voce): il TAGLIO ha superato la
prima attraversata in pista — «Penalità tagli: 2.5 secondi» annunciata, e ~9 s dopo
il gioco ha PORTATO l'auto in baia (boxopen che la radio ha raccontato a inPit vero,
non un'azione del mod: le ricette gara non scrivono regole di tagli/penalità). La
ROSSA a schermo in quella finestra NON è mai uscita nel payload — davanti il verde
(code 2) era visto e annunciato — terzo dato della rossa-invisibilità: il criterio
di chiusura si è già auto-dechiarato, limite del sensore da annotare. Nota del
gioco: penalità tagli cumulata che oltre soglia = stop-and-go da servire in baia,
con comandi bloccati (la seconda volta la sessione è andata live=false).

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

### DA-5 — Sessioni non-gara (practice/testday) davanti ai conteggi vivi · STATO: metà sandbox chiusa 31/10 · prova live «una sola verità» CHIUSA 30/10 serale, RADIO RESTANTE
Practice e testday entrano nelle NOTE del verdetto (regola «una sola verità» con
archivio), ma i conteggi vivi in gioco (posizione, gap) non hanno mai visto un testday
reale: prima di un testday lungo, guardare se la radio e le card restano honesti
(niente annunci di posizione sparati fuori da una gara).
La metà in asciutto è CHIUSA 31/10: [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs)
ora guida la radio anche fuori gara — gap morto zitto, cambio sedile legittimo senza
verde, pitlane del testday zittito fino a 12 s dall'uscita.
PROVA LIVE «una sola verità» (30/10 serale): il verdetto di giornata sul prefisso
261030 con i file Practice reali di oggi (Donington 00:41/00:43, Monza 17:12/17:14
[report/gare/verdetto-261030.md](report/gare/verdetto-261030.md)) li tiene in NOTE
e non paga né posti né giri: solo le 3 gare entrano nell'aggregato. Resta la metà
RADIO: gli annunci in gioco sul testday lungo vero.

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

### DA-9 — Stint-plan endurance: finestre di sosta e stint calcolate prima della gara · STATO: CHIUSA (31/10 tarda sera) — see the diary entry «La finestra stint entra nella radio e nella vista»
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

### DA-11 — Anti-cheat esteso: le guardie valgono anche per orario e distanza · STATO: fatto (31/10 sera) · richieste Mauro 31/10 («quando lancio la gara dal preparatutto, poi posso cambiare es il tempo, dobbiamo evitarlo», «estendi l'anti-cheat», «spente le guardie, prova»)
Il cancello del meteo (guardedMeteo) presidia SOLO il meteo: le altre
scritte del weekend restavano libere, e la baratteria che Mauro teme trova
lì il via: cambiare l'ORARIO delle sessioni (ore/scala) o la DISTANZA
(giri, o minuti sulle serie a tempo) DOPO che il preparatutto ha messo in
piedi la gara. Modello identico al meteo: `dry` e `previsto: true` (le
scritture del CALENDARIO dal «Prepara tutto») passano; fuori test-mode ogni
via manuale — CLI e bridge GUI — va in RIFIUTO esplicito. Toccato:
- [src/test-mode.mjs](src/test-mode.mjs): `cancelloOrario` / `cancelloDistanza`
  (era un booleano). Entrambi passano quando `meteoLibero()` è vero,
  cioè in modalità TEST — «guardie spente», come le vuole Mauro.
- [tools/set-racetime.mjs](tools/set-racetime.mjs): setRaceSessions e
  setRaceTime presidiate, con `previsto` nelle firme.
- [tools/weekend-laps.mjs](tools/weekend-laps.mjs): setWeekendLaps e
  setWeekendTimed presidiate; la chiamata interna (da gara a tempo torna
  a giri) PROPAGA `previsto`, così non si buca a valle.
- [src/webui.mjs](src/webui.mjs): event-prep dichiara `previsto: true` per
  ore/durata/giri (già scalati al % del pannello regole); il BOTTONCINO
  manuale giri/tempo del bridge resta senza previsto → 409 con il messaggio
  del cancello.
Limiti noti (li citiamo anche a Mauro): l'INSTANT RACE resta libera
(non è una gara di carriera, è banco di prova); le ORE sovrascrivibili a
mano nella card race-settings prendono lo STESSO trattamento del meteo —
il «Prepara tutto» accetta quel valore dal preparatutto col previsto (la
scrittura immediata della card fuori test va nel rifiuto mutato dal catch
del save). Verifica:
[test/cancelli-anticheat.test.mjs](test/cancelli-anticheat.test.mjs) 5/5,
weekend-laps-lib gira nel registro ISOLATO a attivo (test vecchi al passo,
28/28 con i test vicini). Prova DAL VIVO (tmp/probe-cancelli.mjs, COPIA del
RACE_WEEKEND reale in tmp — il file di gioco SOLO LETTO): con test-mode
ATTIVA sul PC (dal 27/10) distanza e orario PASSANO; col registro isolato a
spento — le guardie ACCESSE — distanza e orologio in RIFIUTO col messaggio
del cancello, e `previsto:true` passa al no-op. Il momento giusto: quando
si spegne test-mode (test-mode --off) le guardie si ACCENDONO da sole e le
gare si corrono COME dice il calendario, bagnate pure.

Chiusura GUI (31/10 più tardi): anche il rifiuto del cancello che arriva
al «Prepara tutto» del webui ora SI VEDE — `prep.gridError` (la vigia
bilancio/AI dopo il rebuild) finiva in un catch muta e il messaggio del
builder (SERIE NUOVA…) restava nel registro; in
[gui/js/viste-a.js](gui/js/viste-a.js) ora sale al toast come le altre righe ⚠.

### DA-12 — Priorità ronda vs vetrina custom: il «Prepara nuovissimo» riprende la mano · STATO: fatto (30/10 tarda notte)
La sera del 30/10 il cambio auto «in tempo reale» non attecchiva: nel menu di
EVO la FERRARI 296 GT3 tornava sempre, anche dopo «Prepara tutto». Le prove
in fascia + storica comando hanno mostrato il colpevole: la VETRINA CUSTOM
(demo 296 GT3 armata via [tools/vetrina-custom.mjs](tools/vetrina-custom.mjs))
nata PRIMA del pending della ronda comanda comunque per la SUA finestra (24 h),
e dopo il suo ack il ramo demo faceva `return null` lasciando la ronda MUTA
fino a scadenza (il setcar i30 N usciva solo dopo `--off`).

Cura in [src/uiapp-pub.mjs](src/uiapp-pub.mjs) (`comandoAuto`): la regola del
28/10 («al Prepara nuovissimo torna la priorità della ronda») vale anche per la
vetrina custom — conta l'ORDINE DI NASCITA: ronda nata dopo (o in pari con)
l'armatura → il ramo demo tace e il setcar della ronda esce, anche con l'ack
della demo nello store. Demo armata DOPO la ronda → priorità alla demo, com'era
(il gesto a mano vince). Nessun cambio al tool, nessun ping-pong in più.

Verificato: `node tools/vetrina-custom.mjs --off` → setcar i30 N in fascia a
23:33 e ACK dal gioco a 23:33:13; test nuovo nella famiglia priorità
([test/uiapp-pub-priorita.test.mjs](test/uiapp-pub-priorita.test.mjs), 3 casi:
ronda nata dopo senza ack · ronda nata dopo CON ack demo · demo armata dopo la
ronda resta il padrone) — 38/38 verdi.

### DA-13 — Titoli aggressive, bilancio della prima Epoca e il capitolo della ripresa · STATO: fatto (31/10 sera) · richieste Mauro 31/10 dopo la gara con l'Hyundai («rendi i titoli delle gare di campionato piu agressive, tipo Moderne VS Epoca!!!», «controlla bilanciamenti e zavorre per vedere che se ha fatto un buon lavoro il sistema», «Racconta la ripresa della ronda nella storia»)
La prima gara del Campionato Epoca (Brands Hatch, Round 1, vinta con la
i30 N) apriva tre fronti, tutti chiusi la stessa sera:

- **Titoli aggressive**: le ronde dei due campionati nel
  [config/career.evo.ladder.json](config/career.evo.ladder.json) prendono nomi
  a coltello (Brands Hatch «MODERNE VS EPOCA!!!», Donington «IL RETTILINEO NON
  PERDONA!!!», Oulton «CHI ESITA È PERDUTO!!!», Imola «FINALE A COLTELLO!!!»)
  e la gazzetta in [src/gazzetta.mjs](src/gazzetta.mjs) mette il malloppo di
  esclamazioni con il verdetto col rivale. Test: [test/stampa.test.mjs](test/stampa.test.mjs)
  12/12 con i titoli nuovi fissati.
- **Bilanciamento verificato**: zavorre scritte DAL SISTEMA rispettate alla
  lettera nel risultato di gioco (i30 N/Countach/MX-5 100 kg + 20%, GR86 100 kg
  + 9%, R5 GT Turbo 0/0). Ma il campo si spezza in due (01:47–01:57 sopra,
  02:06–02:12 sotto): il cap del restrittore a 20% non schiaccia il misto —
  primo dado per il ramo C di griglia-calib alla gara 2. Anomalia nota: due
  righe duplicate di gioco (Adrian Palmer, Ryan Coleman), manina del gioco,
  non nostra.
- **Capitolo della ripresa**: [data/journal/stagione-12.md](data/journal/stagione-12.md)
  — P1, giro veloce 01:47.934, traguardo 05:39.840, +17.9 s su Palmer, la
  i30 N arrivata nel garage sul vivo. La rassegna ufficiale riscriverà la
  pagina a stagione chiusa.

Integrità verdi dopo: [test/integrity.test.mjs](test/integrity.test.mjs) 14/14,
ladder riserializzato intatto (86 nodi), `node --check` su gazzetta.mjs.

Stessa sera, addendum «fabbrica automatica» (richiesta: «Automatizza la
fabbrica del template»): il guardiano
[tools/raccogli-griglie.mjs](tools/raccogli-griglie.mjs) non lascia più la
foto sola — su OGNI foto attecchita rilancia da solo
[tools/_genera-multi.mjs](tools/_genera-multi.mjs), così il materiale fresco
(donor magazzino/fabbrica/grezze) allatta subito le multiclasse ancora ⬜
senza il passaggio manuale «poi gira _genera-multi». Solo le foto davvero
salvate (o con griglia fissata nel ladder) fanno uscire il generatore:
rifiuti e griglie non riconosciute non vargono le coperture, e forzarlo a
vuoto dormirebbe per un «nessun bersaglio». `--no-multi` torna al guardiano
puro fotografo. Verifica: `node --check` su entrambi i tool il quadro
(`--stampa`), la fabbrica resta in attesa del prossimo scatto in EVO.

### DA-14 — Ore spostabili, poste operative, Campionati ricchi, Banco A/B nel Garage · STATO: fatto (1/11 notte) · richieste Mauro 1/11
Cinque fronti in una notte, tutti verificati con test a casa:

- **Ore spostabili per campionato** («se due gare si corrono lo stesso giorno,
  si potrebbe fare un weekend la mattina e poi verso sera un'altra corsa, che
  ne pensi?»): confermato l'idea e realizzata la leva — override di ORA per
  RONDA ([src/agenda.mjs](src/agenda.mjs): `oraRonda`/`impostaOraRonda`, vive in
  `state.agenda.ore` e muore da solo al cambio ronda), tema nel pannello dei
  conflitti del Centro gare (selettore 06–23 + «come calendario» + «sposta ⯈»)
  via endpoint `agenda-hour`. L'ora spostata scende fino alla CARD e al
  gamemodesave: [src/race.mjs](src/race.mjs) `nextRound` la preleva e la
  `raceCard` la usa al posto dell'ora di serie (priorità: ronda > serie >
  calendario). La serie resta a cadenza fissa: SI SPOSTA L'ORA, NON LA RONDA.
- **Posta del pilota**: il chip della serie dei bollettini NON porta più al
  Cruscotto ma al CENTRO GARE con la scheda già aperta (gui/js/viste-d.js)
  — il posto dove si sceglie il campionato e si corre.
- **Campionati arricchiti**: le card portano premio, tassa, griglia tipica,
  rep richiesta e la prossima ronda completa (data vera, ora, meteo — src/webui.mjs);
  il click su una card chiude gli altri pieghevoli e lo scroll non atterra più
  sotto l'header (`.champ-detail{scroll-margin-top:86px}`).
- **Avviso «Prima volta in EVO» tolto dalla scheda gara** (PC vergine, guerra
  finita): banner rimosso da gui/js/viste-a.js; il campo `weekendSeen` resta
  nel JSON per i collaudi.
- **Banco A/B MOSSO nel GARAGE** («da rivedere e spostare»): accanto al segna
  del meccanico — dove si lavora sui setup — non più nel tab Analisi.

Verifica: `npm test` 647/647 (incluso il test nuovo ORE SPOSTABILI in
[test/agenda.test.mjs](test/agenda.test.mjs): override, reset, override stante
pulito alla lettura, fuori banda → errore). Sintassi `node --check` ok su tutti
i file toccati (src e gui/js).

### DA-15 — Collaudo del PC amico vergine, dall'alto in fondo · STATO: fatto (1/11) · richiesta Mauro 1/11 («Ricontrollo installazione amico»)
Non bastava lo unitario di ieri sera: la domanda vera è «l'AMICO, col pacchetto scaricato dal GitHub, fa installa-e-gioca?». La prova della sequenza intera in
[tools/_collaudo-amico.mjs](tools/_collaudo-amico.mjs):

1. **zipball vera del ramo** — `git ls-files` in palude, zip col tar di System32: non la mini-zip dei test, TUTTO il codice tracciato (test e data esclusi);
2. **installazione.cmd come l'amico** — contro un server HTTP finto che serve solo l'endpoint zipball, `EVO_INSTALLER_NO...` per saltare scorciatoie e avvii; la cartella destinazione nasce vergine: build-id.txt, data/ senza token, e — 
   il punto che la danza ha TROVATO — all'inizio il pacchetto arrivato SENZA l'installatore delle app, perché i cinque file di ieri sera non erano ancora nel git (l'amico avrebbe cavalcato la zipball vecchia). Committo tutto e la ripresa va a segno;
3. **il PC dell'amico** — base Saved Games finta con la mod ACE UI App Loader installata e ZERO app nostre; primo avvio nel modo silenzioso (quello che avvia.cmd chiama a ogni apertura GUI);
4. **dopodiché** — app copiate IDENTICHE alle sorgenti (byte a byte), marcatori vuoti in ACE/Video, nessun menu.html, build-id coerente, e il SECONDO avvio tacca (nessuna copia ripetuta).

Esito: **danza completa, 21 verifiche verdi zero KO**.

⚠ di confine, come sempre: il server finto e le cartelle TMP stanno al posto di GitHub e del PC vero; il collaudo prova la catena del pacchetto, non il click umano.

### DA-16 — Le rotte di scrittura del server rispondono SOLO al POST · STATO: fatto (1/11) · lezione dell'incidente sonda 1/11 (vedi SESSION_REPORT)
La dispatcher muniisce GET e POST nello stesso switch e molte scritture hanno
fallback a corpo vuoto: una GET «a lettura» poteva mutare il salvataggio:
- la sonda API del 1/11 mattina lo provò in pieno (iscrizione −450, sfida
  accettata, nodo attivo spostato, sponsor riassegnato sul save VERO —
  restauro idempotente in `tools/_ripara-sonda.mjs`, server riavviato con
  `riavvia-webui.mjs`, `/api/status` di nuovo 536.037);
- il dir: [src/webui.mjs](src/webui.mjs) `SOLO_POST` (43 rotte) + guardia 405
  PRIMA di leggere il corpo; le rotte miste restano GET-abili dove la
  scrittura richiede il campo del corpo (`wizard`, `weekend-track`); la GUI
  non è toccata (api() in core.js parla già tutto POST). Provino
  `tmp/_difesa-probe.mjs`: 7 GET-mutanti → 405, 5 GET-lettura → 200, POST
  regolare 400 gentile. Suite **660/660**, biome 0;
- onesta: il provino della difesa ha a sua volta ritoccato il save vero
  (POST race su tmp → carriera reale, −450 alle 12:30) — steso da
  `_ripara-sonda.mjs` e server riavviato di nuovo. Da ora ogni prova di
  server si fa col pattern `game-sandbox` o vergine copia.

### DA-17 — Verdetto webui «Gare 0»: il prefisso di default vive nella funzione · STATO: fatto (31/10 pomeriggio) · richiesta Mauro 31/10 («verdetto di gara oggi non va: Gare 0 · 0 vittorie · 0 podi»)
La GUI chiama /api/verdetto SENZA prefisso, l'endpoint passava `prefix: undefined`
in verdettoGiornata e la scansione dei Results cercava il NOME FILE letterale
«undefined…» (`f.startsWith(undefined)` non esplode: ToRegExp su undefined è falso,
e l'argomento diventa la STRINGA "undefined" → nessun match): 0 file → «Nessuna gara undefined» →
la scheda stampava l'aggregato a zero su una giornata PIENA. Il CLI era a posto
perché il default di oggi lo calcolava solo lui. Cura UNICA: [tools/verdetto-giornata.mjs](tools/verdetto-giornata.mjs)
— il default aammgg di oggi vive DENTRO verdettoGiornata (una sola fonte, chi
chiamava senza prefisso la riceve). Test di regressione in
[test/verdetto-giornata.test.mjs](test/verdetto-giornata.test.mjs) (chiamata
SENZA prefisso conta la gara di oggi): **8/8**; smoke webui 1/1; dal vivo
`/api/verdetto` dopo riavvio: **Gare 4 · 3 vittorie · 4 podi** (00:08 Brands
Hatch P1/15 · 00:19 Monza P1/15 · 13:55 Oulton Park P2/16 · 14:20 Imola P1/17,
giro migliore 01:47.934 Brands Hatch).

### DA-18 — MX-5 NA del pool «epoca» azzerata: da penalità doppia a zero · STATO: fatto (31/10 tarda mattinata) · richiesta Mauro 31/10 («il 14% è proprio la penalità, dovrebbe stare a 0 dato che è l'auto meno veloce»)
Nella classe `campionato_epoca` di [data/grid-classes.json](data/grid-classes.json)
(il pool 1990-2005: R5 GT Turbo base a 0, GR86 ~10, i30 N ~20, Countach cap 20)
il restrictor della `preset_mx5na_mech_1` era un 14% e il `mech_2` un 20% —
stime a tabula con la formula ΔPI×25, mai confermate in pista. Il punto di Mauro:
in pista la MX-5 è già l'auto MENO veloce del pool, il restrictor era una
penalità SOPRA (lezione già vista: 23/10 a RBR la MX-5 con 8,75% girava +26 s/lap).
Le due regole MX-5 ora sono a **restrictor 0** (zavorra 100 kg invariata, UNA leva
per volta come da metodo: se resta indietro, la leva successiva è la zavorra);
voce di storia [data/grid-classes.json](data/grid-classes.json) `campionato_epoca`
2026-10-31 con la motivazione. Verifica: `node --test test/gridclasses.test.mjs`
**7/7**, JSON valido. Attenzione pratica: le scritte vanno rigenerate dal menu
GENERAZIONE GRIGLIA di EVO (APPLICA a schermo) per vedere lo 0 nella finestra.

### DA-10 — Sistema le tinte nel builder · STATO: prima fetta (31/10 sera) · richiesta Mauro 30/10 («tienine nota nel diario»)
Il builder della griglia lascia gli avversari **monocolore**: in gara le auto
avversarie escono tutte con la STESSA livrea del pool, no varianti — già
denunciato nel vivo («controlla perché gli avversari hanno auto
monocolore»). Il materiale: nel builder ([src/gridbuilder.mjs](src/gridbuilder.mjs), con
la sua variazione byte-distinta) le celle cambiano ma la LIVEREA del
visual preset (campo 11 del layer griglia, decodificato in
`tools/evo-grid.mjs` come `cell.visualPreset`) resta una sola; la lezione
del turno 476 («griglia personalizzata con più LIVERIES della stessa
auto») dice che è il TEMPLATE che deve portare le varianti, ma il pool
multi-marca che ora gira non le cerca. Criterio di chiusura: in gara
vera vedere avversari con tinte DIVERSE nello stesso pool (la prova è a
vista sul via), template e griglia-cache coerenti, test di casa verde.
**Prima fetta 31/10 sera**: la CACCIA alle livree è nel builder —
`visualOf` legge il campo 11 di ogni cella scrittta (stessa estrazione di
`evo-grid`: il preset sta dopo `\x12`, `'(default)'` se il campo manca)
e il report porta la riga `tinte` per modello: `ks_f40_lm ×7 · 3 tinte`
o `×4 · 1 tinta (MONOCOLORE: più liveries in EVO + APPLICA per le
varianti)`. Le celle restano fotocopiate dal template — il builder NON
inventa tinte (zero rischio crash): se un modello esce monocolore è il
report a dirlo, col gesto. Verificato in casa:
`test/gridbuilder-tinte.test.mjs` 2/2 (3 livree nel template → 3 tinte
in griglia; 1 sola → MONOCOLORE gridato), suite vicine verdi (uniche,
templates, calib: 27/27).

**Seconda fetta (1/11, autorizzazione «migliorie» di Mauro)**: due leve
aggiuntive nel builder.

1. **Bilancio per FAMIGLIA**: il match del bilancio recita la lezione del
   27/10 (già in esclusioni): le regole col preset `mech_1` pesano ANCHE le
   varianti `mech_2`/`mech_3` della STESSA auto (`withoutMech` al livello
   modulo, `applyRulesToCell` matcha per famiglia). Il template RINUMERATO a
   mano (un'era di mech_1, poi mech_2/3) non fa più uscire una variante a
   0 kg: la regola segue l'auto, non il numero del preset.
2. **TINTE PRESTATE** — default SPENTO per serie, opt-in con
   `classi."<serie>".tintePrestate = true` in `grid-classes.json`: quando
   il pool ha un modello MONOCOLORE, il builder pesca le celle vere degli
   ALTRI template sulla stessa cartella (`data/grid-templates/`) e le
   fotocopia INTERE (byte a byte: zero inventate, cap 20 file in ordine
   alfabetico, dedup HEX, il filtro ESCLUSIONI per preset e la lezione
   zero-crash byte-unica restano intatte). Il report dichiara
   `tintePrestate: <n celle>` solo quando le usa; l'idempotente (celle
   identiche sul disco) non cambia un passo.

Verificato in casa: `test/gridbuilder-tinte.test.mjs` 5/5 (famiglia:
   regola del mech_1 pesa il mech_2; default OFF: la griglia resta
   monocolore e il report tace; ON: 3 tinte con 2 celle prestate e 3
   celle byte-uniche) — suite completa **656/656**, lint 0. Restano: il
   collaudo a vista sul via con un template RICCO di livree e un'altra
   serie col flag tintePrestate.
### La vetrina delle tinte (1/11, autorizzazione migliorie): tinte/prestate alla vista

Il report del builder porta le livree per modello e le PRESTATE, ma nessuna
vetrina le mostrava: quando si lavora da finestrino la riga restava sepolta
nel JSON del report. Ora:
- **CLI `griglia`** ([src/cli.mjs](src/cli.mjs)) stampa una riga `tinte   ...`
  per modello (con il grido MONOCOLORE quando serve) e `prestate ...` quando
  il parco dona celle; DRY incluso: la lettura di una --dry porta pure la riga.
- **WebUI prep** ([src/webui.mjs](src/webui.mjs)): il messaggio dell'evento
  (`prep.guests`) e la riscrittura di livello (`prep.grid.rebuild`) dicono
  `N tinte prestate dal parco` e, se un modello esce monocolore, l'avviso
  completo col gesto «più LIVERIES + APPLICA» — niente decodifiche a mano.

Verificato: `--check` webui/cli, suite 656/656, biome sui due file 0.

### La vetrina in tavola: la GUI Grid racconta le tinte (1/11, autorizzazione migliorie)

Terza fetta della vetrina: la tab **Griglia** della GUI (
[viste-griglia.js](gui/js/viste-griglia.js)) ora mostra le LIVERIES del
file in attesa:
- **`readCells`** ([tools/grid-balance.mjs](tools/grid-balance.mjs)) porta
  la `tinta` di ogni cella (campo 11, stessa estrazione del builder:
  segmento dopo `\x12` taglio a `\x18`). Le varianti di formato si
  sistemano da sole: byte di lunghezza dopo il tag e, sui template
  sintetici dei test, l'intestazione `\n` + lunghezza. Il builder NON
  toccato (per i contatori il prefisso costante non cambia niente).
- **Tab Griglia**: colonna `Tinta` sul file e riquadro «Tinte (liverie):
  modello ×N …» sotto la classe combaciata; un modello con UNA sola
  livrea grida **MONOCOLORE** col gesto «più LIVERIES + APPLICA» e la
  leva dei rivali (`tintePrestate: true` in grid-classes.json).
- Test: [test/readcells-tinta.test.mjs](test/readcells-tinta.test.mjs) 4/4
  (sintetico pulito, `(default)` per il campo 11 assente, formato gioco
  reale\nessuna regressione preset/kg/count). Suite **660/660**, biome 0
  sui tre file toccati.
- **Badge del flag** (sopra): `api('grid')` porta `tintePrestate` della
  classe in pasto alla GUI e le Classi e regole mostrano il badge
  «tinte prestate (parco)» sulle serie che lo hanno attivo — chi non
  legge grid-classes.json a mano vede da solo chi pesca dal parco.

---

## Registro del diario

### 1/11 — Difesa POST-only sulle API di scrittura (lezione sonda) — DA-16
Colpo e restauro raccontati in [SESSION_REPORT.md](SESSION_REPORT.md) §Incidente;
la lezione applicata è il set `SOLO_POST` + 405 in [src/webui.mjs](src/webui.mjs):
qualsiasi GET su una rotta che scrive non muta più lo stato. Verifiche:
provino `tmp/_difesa-probe.mjs` (7×405, letture intatte, POST regolare),
suite **660/660** exit 0, biome 0, smoke key teste verdi.

### 1/11/2026 — Release 0.1.44 preparata: le tinte intere, la palestra e i contatori al passo

Chiuso il pacchetto della 0.1.44 (tutto di questa giornata di tinte + palestra),
seguendo [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md):

- **Verde con i contatori Homepage**: `npm run check` exit 0 — suite **660/660**
  (da 653 di v0.1.43), Biome 0 diagnostica su 291 file.
- **Danza del PC amico vergine** (`node tools/_collaudo-amico.mjs`): exit 0,
  **24 verifiche verdi** (il contatore di DA-15 è cresciuto a 21+3 col
  ramo «installa-gioco» delle app: zipball, installazione, primo/secondo
  avvio, marcatori). Log in tmp/ (fuori dal tracciato).
- **Pagella del campo sazio**: le 3 mutazioni del palestrato cadono tutte
  (garage 0.85→0.80, agenda %8→%1, DISPLAY_EN spenta) — i rinforzi di
  v0.1.43 garva.
- Bump semantico: patch `npm run bump` → **0.1.44**; [CHANGELOG.md](CHANGELOG.md)
  con la voce nuova, nulla citato che non abbia prove (fonti: diario 1/11,
  SESSION_REPORT.md).
- **Resta fuori da solo**: la creazione della release GitHub stessa
  (`node tools/crea-release.mjs v0.1.44 …` con la zip di pacchetto-amico
  come asset) la fa il flusso di casa (`sincronizza-git.cmd` e Mauro):
  la checklist dice che la publish NON è un passo dell'agente.
- **Non verde qui** (per onestà): il collaudo visuale delle Schede-GUI e il
  campo DA-1/DA-3/DA-4 in gioco — richiedono ACE di Mauro sul PC, fuori
  dalla sandbox. Il cierterio della DA-10 di caccia (avversari con livree
  diverse a vista sul via) resta l'appuntamento in gara (gara 2).

### 1/11 — Fase 1 chiusa: l'unica leva, il CHANGELOG e la lista della release

Chiusa la Fase 1 della roadmap di AUDIT.md, con dentro le adattate dei Prompt
2 e 8 del pacchetto esterno (regole di casa, non le loro):
- **`npm run check`**: una sola leva, `npm test && npm run lint` — la leva
  prima di ogni commit. Prova: in sandbox **653 pass / 0 fail**, lint exit 0
  (2 warning preesistenti: import inutili in `src/webui.mjs:133` e
  `tools/_collaudo-amico.mjs:23` — non di oggi, a costo di due righe se
  processo). Zero dipendenze nuove: la suite è ESM col runner di Node.
- **README IT/EN**: sezione nuova «Suite di test e l'unica leva» con le
  scelte dette in faccia: i test girano in sandbox (mai file veri di EVO),
  le prove di rottura fanno parte del rituale (il test che protegge deve
  CADE), e **niente CI GitHub Actions di proposito** — la suite in sandbox
  locale è più severa di una runner generica per un'app aggrappata al gioco.
- **[CHANGELOG.md](CHANGELOG.md)** creato (mancaeva davvero): voci 0.1.23,
  0.1.25, 0.1.42, 0.1.43 puntate ai veri report/ e al diario, niente
  inventato.
- **[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)**: il Prompt 8 ridetto con
  l'accento di casa — commit a main descrittivi, `npm run bump`, crea-release
  con la zip come asset, il token `data/.github-token` resta FUORI dal
  pacchetto, ronda sazio sull'ultima fetta obbligatoria.

Restano per la **Fase 2**: DA-10 (tinte varianti nel template) e la doc dei
comandi vocali nel README.

### 1/11/2026 — Mai un test sazio: tre rinforzi alle fondamenta

Dalla ronda «Mai un test sazio» (verde-sempre cacciati rompendo a mano i
moduli di casa) tre cure, ognuna con la sua prova di rottura:
- **[garage-buy.test.mjs](test%2Fgarage-buy.test.mjs)** — tolta
  l'auto-referenzialità: i valori attesi di `carValueKm` e `salePrice` sono
  ora LITERALI a mano (30000 km0 → 25500, 3000 km → 16500, vendita 70%,
  fondo 4000) e non ricalcolati dalle stesse funzioni che proteggono. Cade
  se si smonta il fattore chilometraggio.
- **[agenda.test.mjs](test%2Fagenda.test.mjs)** — nuovo test di
  `cadenzaSerie`: banda 3–10 rispettata per contatori 0, 1, 7, 1000 e
  2³¹ (l'hash che spalma non deve degenerare) e il valore CAMBIA col
  contatore. Prima nessuno proteggeva il ritmo della serie: con la
  cadenza costante il file restava 9/9 verde — ora la rottura lo fa cadere.
- **[lingua-server.test.mjs](test%2Flingua-server.test.mjs)** — mappa
  DISPLAY_EN assaggiata per nome: «Coppa Città» → City Cup, «Trofeo
  Hatch» → Hatch Trophy, e un nome ignoto («Coppa Prova») che passa dal
  pattern path → Prova Cup. Cade se la mappa va spenta.

Suite completa in sandbox **653/653** (prima 647), solo file di test toccati.

### 1/11/2026 notte — ORE SPOSTABILI nel Centro gare + quattro cure di agliedai di Mauro

Su richiesta di Mauro («se due gare si corrono lo stesso giorno, si potrebbe
fare un weekend la mattina e poi verso sera un'altra corsa, che ne pensi?»):

- **L'idea confermata e la leva costruita.** Il pannello dei conflitti era un
  bulbo con un solo pugno («sposta ⯈» = slitta l'intera serie di 7 giorni).
  Ora ogni gara del conflitto porta anche il SELETTORE DELL'ORA (06–23 +
  «come calendario»): dalla carriera del 1/11 (Red Bull Ring + Oulton lo
  stesso Sabato, Nürburgring ×2 la Domenica, Brands Hatch ×2 il Mercoledì)
  la giornata tipo della produzione reale si mette in piedi senza smontare
  nessun campionato. L'override vive per UNA ronda (`state.agenda.ore`,
  pulito alla LETTURA con ronda cambiata o valore stante): la serie resta a
  cadenza fissa.
- **La catena fina è al completo.** L'ora spostata esce dall'agenda
  (`nextUnplayedRound`, `racesOnDay`, `impegni`, `elencoCompleto`) e arriva
  nel gioco: `nextRound` in race.mjs la applica e la raceCard la usa per
  il raceHour e il piano orario delle sessioni (priorità: ronda > serie >
  calendario), così il «Prepara tutto» scrive il gamemodesave all'ora
  spostata. Test a casa in agenda.test.mjs (9/9: override, reset, override
  stante, fuori banda). Il primo giro del test era的来说 sbagliato IO, non il
  motore: la ronda pendente non è la R0, l'attesa va presa dal motore e non
  presumere la R0.
- **Le quattro cure di OGGI**: (1) il chip-auto della Posta porta al
  Centro gare, non al Cruscotto, col pannello giusto (scheda serie + «scegli
  per oggi»); (2) le schede di Campionati portano al pieghevole GIUSTO
  (chiusura dei vicini + `scroll-margin-top` lungo il header) e la sezione si
  arricchisce: premio, tassa, griglia tipica, rep, prossima con data/ora/meteo;
  (3) il banner «Prima volta in EVO» esce dalla scheda gara (PC vergine:
  istruzione ormai nella guida), `weekendSeen` resta nel JSON per i collaudi;
  (4) il Banco A/B dei setup si muove nel GARAGE, accanto al segna del
  meccanico — dove le sessioni MoTeC si leggono mentre si lavora sul settaggio.
- **Verifica**: `npm test` 647/647, `node --check` su src (agenda, race,
  webui) e su tutti e cinque i gui/js toccati.

Su richiesta («avvia la GUI della sandbox su 8799 e ripassa le schede
senza cartelle dati: rivali, campionati, garage, segnala le zone piegate»)
il banco vergine è tornato in piedi (sandbox %TEMP%\evo-giro SENZA ACE,
carriera falsa «GiroSchede» in Coppa 500, webui su 8799) e le 19 schede
girate di nuovo:

- **Le zone di ieri confermano le cure**: Rivali onesto («nessun rivale
  ancora»), Campionati pieno (carte serie + calendario + classifica),
  Garage col catalogo e contatori a zero, Risultati/Piste/system-health
  come ieri — tutto in 200, nessun crollo da nessuna parte.
- **La TROVATA nuova**: 12× 500 nel console del browser, tutte sulla
  STESSA rotta che la pagina chiede in loop:
  `/api/ingegnere` → 500 «Cannot read properties of null (reading
  'sessionPhase')» a ogni tick del Cruscotto con EVO CHIUSO. Causa:
  [engineer.mjs:143](src%2Fengineer.mjs) `engineerLive()` legge
  `player.sessionPhase` PRIMA della guardia `if (!player || !inSession)`:
  senza shared memory lo snapshot non ha player e la funzione scoppia
  ANZICHÉ rispondere «tace». Cura minima: `const faseGioco = player ?
  String(player.sessionPhase ?? '').trim() : ''` — player null = fase
  vuota e payload onesto `{ ok, live:false }`.
- **Controprova dal vivo** (file curato + server riavviato + pagina
  fresca sul Cruscotto): 12 secondi di poll TUTTI 200 (`/api/ingegnere`
  compreso, che ora vive nel flusso regolarmente),
  `performance.getEntriesByType` senza NESSUNA risposta ≥ 400, console
  MUTA. Suite intera 646/646 con il test nuovo
  (test/ingegnere.test.mjs: player null non rompe, col e SENZA blocco
  session); Biome pulita sui 2 file toccati.
- **Nota di classe**: è il SECONDO difetto del genere di poll — un API
  che si interroga a ogni tick e esplode solo quando la SORGENTE non
  c'è: ieri `/api/system-health` con path null, stanotte
  `/api/ingegnere` con shared memory spenta. Nei PROSSIMI collaudi
  vergine il giro console lo prende di default, non a campione.

### 31/10/2026 notte — Giro completo delle schede sul vergine: DUE zone piegate prese e curate

Il collaudo libero prosegue su richiesta di Mauro: sfoglia TUTTE le 19
schede della GUI sulla sandbox (carriera attiva, ZERO cartelle ACE), una
scheda alla volta, con estrazione del testo, console e log del server:

- **17 schede su 19 sane e oneste**: Centro gare, Setup, Analisi,
  Messaggi, Campionati, Griglia, Rivali, Auto, Garage, Archivio, Online,
  Giri liberi, Statistiche, Finanze, Difficoltà, Impostazioni, Cruscotto
  — ogni pannello dice la sua verità («nessun rivale», «nessuna
  sessione», «apri il wizard»), niente crollo da nessuna parte. «Aiuto»
  invece NON è una scheda: apre un modale sopra la vista corrente —
  giusto così, era solo l'inganno della snapshot.
- **Zona 1 — schede Risultati E Piste in errore nudo**: entrambe
  rispondevano «Cannot read properties of null (reading
  'resultsDirs')». Causa: [results.mjs](src%2Fresults.mjs)
  `listResultFiles` legge `paths.resultsDirs` SENZA del punto
  interrogativo, e la scheda Piste arriva lì via
  `sessionStatsFromResults` (il suo try-catch protegge solo la prima
  chiamata, la seconda resta nuda). Cura: `paths?.resultsDirs ?? []` —
  con le schede sanate di conseguenza.
- **Zona 2 — /api/system-health 500 a OGNI poll** (il cruscotto la
  interroga ogni 2 s: la console si riempiva di 40+ errori rossi):
  [webui-telem.mjs](src%2Fwebui-telem.mjs) `telemScanLocale` faceva
  `paths.dataDirs ?? []` — il null-guard stava sulla PROPRIETÀ, non
  sull'OGGETTO: con `paths` null scoppiava uguamente. Cura:
  `paths = paths ?? { dataDirs: [] }` in testa alla funzione.
- **Controprova dal vivo DOPO le cure** (i due file curati copiati nella
  sandbox, server riavviato): `system-health` 200, `import-inspect` 200
  con `files:[]`, `tracks` 200 col libro delle piste completo; console
  PULITA e rete tutta 200. Suite 645/645 con 3 test nuovi in
  [test/percorsi-null.test.mjs](test%2Fpercorsi-null.test.mjs), Biome
  pulita sui 3 file toccati. Commit `b1fc769`.
- **Nota di lezione**: è il difetto di classe che NON si vede mai sul PC
  di sviluppo (dove ACE c'è): solo il vergine lo ha esposto — ragione in
  più per ogni collaudo su installazione pulita.


### 31/10/2026 notte — Collaudo LIBERO del vergine: carriera falsa + PC senza ACE

Le due prove restanti del collaudo vergine dello zip amico v0.1.43, fatte
TUTTE dal vivo in sandbox (%TEMP%\evo-sbiz):

- **Carriera falsa via CLI**: `new` (AmicoTest ITA) → Coppa 500, Rookie,
  6000 ¤; `next` stampa ronda, sfida della ronda e difficoltà proposta.
  webui della sandbox su 8799: `/api/boot` `hasCareer:true` + header del
  pilota, `/api/card` con la ronda vera (Brands Hatch R1/5), `/api/status`
  pieno, `/api/wizard` `career:true`. PRIMO AVVIO COMPLETO VERDE, da solo.
- **PC senza ACE** (USERPROFILE reindirizzato su temp vuoto): la CLI
  (`setup`, `status`) rifiuta con il messaggio educato (strade cercate +
  rinvio `ACE_DATA`); webui su 8798: `/api/wizard` `dataDir:null` con i
  candidati TUTTI rossi e content a zero, `/api/boot` `dataDirs:[]`. Il
  cruscotto (foto in tmp/) mostra la carriera con ogni pannello onesto:
  verdetto «apri il wizard», MOTEC vuoto — niente crollo, nessun 400.
- **Bonus scoperto e lasciato stare (di progetto)**: nella sandbox il badge
  di livello dice «Fuoriclasse»: NON è bug — `paddockLevelBadge` legge il
  journal Paddock installato sulla MACCHINA («una sola verità»); nella
  sandbox atterra solo perché sul PC di Mauro c'è la cartella ACE reale.
  Su un amico senza Paddock il chip resta nascosto (rep < 490). Anche la
  barra «Aggiornamenti su GitHub» nel pacchetto è design: l'amico senza
  .git è curato da `aggiorna-zip` (zipball → copia → test, data/ intatto).
- Casa chiusa bene: server della sandbox (PID Windows 5132 e 21968)
  fermati con taskkill per PID (mai per nome), porte 8798 e 8799 libere,
  webui REALE su 8642 toccata in nessun modo.

### 31/10/2026 notte — Secondo cambio live CONFERMATO + storia VISIBILE nel pannello

Chiusura della rama metà serale:

- **Secondo cambio auto a gioco APERTO:** `gara-veloce` col PRESET «R5 5 giri
  Oulton» e `--auto ks_ford_escort_rs_cosworth` (force, gioco aperto). Il comando
  `demo:<startedAt>:ks_ford_escort_rs_cosworth` esce in fascia, l'app del Cruscotto
  lo prende e **l'ack vero torna: «Ford Escort RS Cosworth — auto impostata nel
  menu di EVO»** (21:54). La memoria storia lo replica: inviato → confermato.
- **Storia VISIBILE in gioco** («storia visibile in gioco»): il tooltip lo diceva
  solo al pallino — da qui il blocco PANNElLO «Cambio auto: il registro»
  ([uiapp/cruscotto/cruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js), inserito
  subito sotto la striscia nota): le ultime 4 righe della stessa memoria
  (`S.dati.storia`, ⏳ inviata / ✓ confermata), stessa formattazione del tooltip.
  Memoria vuota = niente blocco.
- Up della verifica: `test/storia-comando.test.mjs` 4/4, Biome e `node --check`
  verdi sul pannello; blocco collaudato nell'anteprima (`?loader=finto`) con le
  RIGHE VERE della giornata (Escort ⏳×2, R5 ✓).
- **La lezione del doppio «inviato»**: la memoria ha segnato DUE inviati con id
  diversi (il CLI arma la vetrina due volte in pochi secondi: prima un
  startedAt, poi un altro). Non è un bacchettino del dedup né del publisher —
  i comandi erano davvero due e l'ack ha fatto chiudere l'ultimo. La storia
  resta fedele: anche i ticchetti doppioni sono roba vera.

### 31/10/2026 notte — La STORIA del comando va nel tooltip (cambio auto a gioco APERTO)

«Collaudo il cambio auto a gioco aperto» + «storia del comando nel tooltip»:
finora il cambio auto a menu APERTO (setcar/evento/avvia con ack in ui_storage)
lasciava la traccia solo nel console della GUI. Da qui la memoria persistente
che il pannello racconta:

- [src/uiapp-pub.mjs](src%2Fuiapp-pub.mjs): `data/cruscotto-storia.json` —
  ogni comando che esce in fascia (stato «inviato», UNA volta per id, non una a
  sola fascia) e ogni ack che torna («confermato» con il messaggio dell'app)
  entra nella memoria (ultime 12, taglio in testa)
- la fascia del Cruscotto porta il campo `storia` (ultime 5, più recente prima);
- [uiapp%2Fcruscotto%2Fcruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js): il tooltip
  del pallino connessione porta le righe `comando HH:MM · TIPO nome — ✓ msg`
  (memoria vuota = riga taccia, pannello sereno);
- [tools/_preview-cruscotto.mjs](tools%2F_preview-cruscotto.mjs): il loader finto
  attivabile con `?loader=finto` nella URL — il semaforo e il tooltip collaudati
  FUORI dal gioco con lo stesso codice.
- **Collaudo a gioco APERTO:** il riavvio del publisher registra l'ack VERO
  della gara al volo del pomeriggio (id `demo:…:ks_renault_5_gt_turbo`,
  «auto impostata nel menu di EVO») — il cambio auto è avvenuto con il gioco
  aperto, la memoria l'ha beccato alla prima fascia.

**Test: test/storia-comando.test.mjs 4/4 (ordine in coda, fascia rovesciata con
limite, taglio a 12, file assente = memoria vuota) — priorità 39/39 verdi;
Biome pulita; tooltip visto in anteprima con la riga della storia vera.**

### 31/10/2026 notte — La Pitwall la RICHEDE la radio: le frasi della copilota a schermo in gioco

«Pitwall con la radio» (Mauro): il pannello Pitwall in gioco ora mostra ALSO le
frasi che il narratore ha già detto in gara, finora SOLO nel pannello GUI del
browser. Il file già esiste (data/copilot-voce-24-10.jsonl): nessuna nuova
sorgente, solo un nuovo orecchio.

- [src/voce-copilota.mjs](src%2Fvoce-copilota.mjs): `LOG_VOCE_FILE` (il percorso
  definito UNA volta, regola `EVO_DATA_DIR` della casa) + `leggiRadioVoce()`: ultime
  frasi dal più recente, le righe evento NON parlano, file assente → `[]` (la radio
  è un plus, mai un ammazzatick). [src/webui.mjs](src%2Fwebui.mjs) NON definisce più
  il suo percorso: riceve da qui.
- [src/uiapp-pub.mjs](src%2Fuiapp-pub.mjs): la MINI-PITWALL (`miniPitwall`, payload
  quotato) porta il campo `radio` — ULTIME 6 frasi con un memo a statSync: si
  rilegge SOLO quando il file cresce (stessa lezione del cacheVerdetto).
- [uiapp%2Fpitwall%2Fpitwall.js](uiapp%2Fpitwall%2Fpitwall.js): gruppo «📻 Radio del
  copilota» (ora HH:MM · frase), sotto i Consigli dal BOX; nessuna frase = gruppo
  taccio, mai un mucchio vuoto. Reinstallato con tools/installa-pitwall.mjs.
- server webui riavviato con tools/riavvia-webui.mjs (il publisher vecchio aveva
  la payload di prima: senza riavvio la radio restava fuori — la respinta vecchia).

**Test: test/pitwall-radio.test.mjs 4/4 (ordine, eventi muto, file assente, chiavi
payload + aggiornamento live) — voce-copilota + uiapp-pub-priorità 42/42 verdi;
Biome su 5 file pulita; anteprima _preview-pitwall.mjs: gruppo radio VISIBILE con
le frasi vere di gara (P13, giro al best, ultimo giro), console solo le due log
aspettate.** In gioco: aprire la voce PITWALL del drawer APPS — la radio c'è dopo
il riavvio del server (fatto).

### 30/10/2026 notte — Il riquadro vuoto aveva un SECONDO colpevole: il TAG del layout

«Riavviato EVO e Oulton Park ancora senza la foto»: la riparazione di ieri sera
(pit slot 30→16) era giusta ma incompleta. Diff campo per campo tra il file che
il GIOCO ha riscritto da solo al pick manuale alle 18:31 (backup
bak-track-2026-10-30T18-31) e i due file riscritti dal tool dopo:

- **dal gioco alle 18:31**: tag `International` · layout `International Race`
  (tutti e 4 i blocchi weekend, campione per campione);
- **dal tool alle 19:05/19:46**: tag `GP` · layout `GP Race` (i DEFAULT di
  specFor, stavolta sbagliati — Oulton NON è mono-layout e "oulton_park-gp"
  non esiste come testo)

- [tools/set-track.mjs](tools%2Fset-track.mjs): `oulton_park` entra nei
  TRACK_SPECIALS con i valori OSSERVATI dal campo (tag/layout/nome), come già
  per Paul Ricard e Sebring; i default "GP"/"GP Race" non perdono più i valori
  veri
- riscritti WEEKEND (4 blocchi) e INSTANT_RACE (1 blocco) con backup
  `.bak-track-2026-10-30T20-03`, rilettura 0 campi ancora da cambiare
- test nuovo [test/set-track-spec.test.mjs](test%2Fset-track-spec.test.mjs), 3
  casi: Oulton sui valori osservati (tag/layout/pit/GBR/4333), Paul Ricard
  resta col suo special, Monza resta sui default GP/GP Race + pit 30

**Test: set-track-spec 3/3, grid-templates 9/9, lint Biome su 2 file pulita.**
Nella GUI la finestra pista torna con la tessera: basta RIAPRIRE la schermata
gara (o tornare indietro e rientrare nel menu) — il file sul disco è già in
forma sana. Se non la rilegge, un riavvio lo chiude: EVO tiene la schermata
aperta in memoria finché non la ricarica.

### 31/10/2026 — Rotazione bak AUTOMATICA + Pitwall RICOSTRUITO (solo informazioni)

Due richieste di Mauro dell'ultima sera di ottobre, sistemate in un colpo:

- **ROTAZIONE BAK AUTOMATICA**: la mietitura `pruneBackups` (tetto 25, in
  tools/evo-grid.mjs) girava già da grid-apply, set-instantrace, weekend-roster
  e gara-veloce, ma gli altri scrittori la tenevano appesa; ora la chiamata
  segue la scrittura del backup, dappertutto: set-track (bak-track, bak-ai,
  bak-gridmode), set-weekend (bak-weekend, 3 punti), set-racetime
  (bak-racetime, 2 punti), weekend-laps (bak-laps), set-car (bak-car),
  set-driver-car (bak senza tag), grid-balance (bak-bal), weather (bak-wx,
  2 punti) e il bak-evento del «Prepara» dell'evento dentro webui.mjs.
  Ragione della nota: UNA sola potatura per scrittura. Le copie one-shot di
  interventi umani (.bak-msggen, .bak-merge, .bak-ripara) NON si toccano:
  quelle restano cura del loro tool, e pota-bak.mjs RESTA il pulitore
  generale a mano (full-famiglia) per quando serve una grande pulizia.
- **PITWALL RICOSTRUITO**: la sorgente era stata tolta di proposito il 30/10
  pomeriggio e Mauro l'ha chiesta indietro con un perimetro NUOVO e chiaro:
  **pannello SOLO-INFORMAZIONI**. L'app pitwall (app.json + pitwall.js in
  uiapp/pitwall/ — pattern paddock/cruscotto: niente pagina consegnata,
  pannello position:fixed che si apre dalla voce PITWALL del drawer APPS)
  NON tocca window.engine: niente comandi al menu, nessuna auto cambiata per
  conto suo — quelle mani restano al Cruscotto. I DATI: il publisher del
  cruscotto (uiapp-pub.mjs) ora scrive a STESSA fascia una mini-payload
  pitwall (consigli · verdetto · la sincro «Prepara e Divertiti») nella
  cartella SUA, SOLO SE installata: un solo costruttore, due consumatori.
  tools/installa-pitwall.mjs copia app.json + pitwall.js nel loader e crea il
  marcatore settingspreset (lezione 27/10 17:55: senza marcatore l'app non
  esiste per il loader). FATTO: app installata in Saved Games.
  Anteprima browser: tools/_preview-pitwall.mjs (porta 9107, fasce vere da
  disco, shell col drawer finto) — provata nel thread: pannello aperto dal
  drawer, sincro della ronda col via, verdetto con la tabella che si apre,
  consigli che lasciano il posto quando la scheda del gioco è spenta.

Verifica: node --test sui file del publisher (uiapp-pub-guard / uiapp-card /
uiapp-pub-priorita, 47/47) e dei bak (pota-log + backup-rotation, 5/5).
Da fare al prossimo avvia.cmd: il webui riparte COL publisher nuovo e la
Pitwall riceve le sue fasce in gioco (per ora l'anteprima lavora già, con le
fasce vere).

---

### 30/10/2026 notte — Il collaudo migliore: radio precisa in gara vera (Oulton Park)

Mauro a fine gara: «finito gara Oulton Park, fantastico, il copilot è
preciso». Dopo la cura del ping (la voce era muta in pista per la guardia
sfasata) la gara vera ha confermato la filiera tutta in piedi: Cosimo in
pista, frasi al posto giusto, niente doppie. È la prova n.1 del «Collaudo
in gara» (vai in [COMANDI-BUFFY.md](COMANDI-BUFFY.md)) — riuscita senza
impianti extra: la voce parla col codice di casa e tiene tutta la gara. La serie dei comandi fissi di Mauro («Collaudo in gara»,
«Radio muta dal pannello», «Radio anche nel monitor GUI») è stata
documentata in [COMANDI-BUFFY.md](COMANDI-BUFFY.md) così si rilanciano
come card, senza rispiegarli ogni volta.

---

### 30/10/2026 sera — La radio del Pitwall non tace più per colpa di una scheda

Mauro: «il copilot non va in gioco, sul browser funziona». La diagnosi è nel
registro data/copilot-voce-24-10.jsonl: SESSIONE VIVA e poi, a 3'25",
«SILENZIO — la pagina ha la copilota OFF (ping)» fino a fine gara. La causa
era la GUARDIA del ping della 3ª cura del 29/10: due comandi sfasati
(chip della barra viste-d.js su localStorage e chip del pannello viste-a.js)
pingavano on:false ogni 10 s da una scheda GUI lasciata aperta in secondo
piano, la finestra di 20 s NON scadeva mai e Cosimo restava MUTO IN PISTA.
Nel browser invece la voce «funzionava» perché lì si sentiva l'altra fonte
(radio parlata dalla pagina), non Cosimo.

Cura: la guardia del ping RITIRATA dal tick (src/webui.mjs,
copilotaServerTickInterno). La radio la comanda SOLO il config
(evo.config.json voceCopilota, via POST voce-server o Impostazioni); il
ping resta SOLO diagnostica (riga STATO: paginaPingMs/paginaPingOn). Il
silenzio voluto esiste ancora: si dichiara col POST voce-server on:false,
che persiste nel config; non più col chip della barra, che ora muove solo
la radio locale.

Verifica: prova diretta della radio reale (POST /api/voce-prova su 8642,
config full) → ok; MMF sonda (tools/probe-mmf.ps1) con gioco vivo →
static/graphics presenti. Suite npm test e lint a seguire sotto.

---

### 30/10/2026 tardo pomeriggio — Prova vera dei bak, e il menu della griglia prende le CLASSI VIVE

Tre richieste di Mauro («prova vera dei bak», «menu con classi vive», «gira la
suite completa») sistemate in un colpo:

- **PROVA VERA dei bak** ([tmp/prova-bak.mjs](tmp/prova-bak.mjs), provino
  one-off): due scritture ravvicinate dell'INSTANT_RACE REALE col disco
  cambiato fra le due (31→32 min a tempo, banda 88–93→89–94), a gioco APERTO
  col canale della GUI (force + backup, come gara-veloce da webui). Esito:
  TRE bak distinti nello stesso minuto — `bak-temprace-…T16-22-50`,
  `bak-temprace-…T16-22-50-r2` (SOFFISSO -r2 sul pareggio dello stesso
  secondo: nessuna versione perduta) e `bak-instantai-…T16-22-51`; verificato
  byte a byte che il PRISTINE e lo stato di mezzo RESTANO dentro gli bak. A
  fine prova il file è ripartinuto ESATTO (ripristino tmp+rename, byte
  identici confermati). La regola 28/10 della mietitura dei bak, da oggi è
  provata sul campo anche a mano, non solo in sandbox.
- **MENU CON CLASSI VIVE**: il menu «griglia» della gara al volo NON è più
  un elenco scritto a mano (GT3+GT4 e le tre endurance tappate). Nuova
  funzione `griglieConClassiVive(perClasse)` in
  [src/classi-gt.mjs](src/classi-gt.mjs), chiamata dall'endpoint `gv-liste`:  
  UNA riga monoclasse per ogni classe con almeno un'auto del libro OGGI, una
  multiclasse per OGNI combinazione di 2–4 classi vive, e con oltre 4 classi
  l'endurance INTERA in coda. Sul ladder reale (GT1 1, GT2 1, GT3 6, GT4 2)
  il menu vive 15 combinazioni, non più le 5 fisse: se il ladder cambia, il
  menu cambia con lui.
- **SUITE COMPLETA**: npm test — 612 test, TUTTI verdi; lint Biome pulito
  (273 file). Il run dopo la chiamata giusta (npm test, non `node --test test/`:  
  in Windows quel glob non espande e urta MODULE_NOT_FOUND).

### 30/10/2026 sera — Preset «con la mia auto» e la durata consigliata per pista

Due richieste di Mauro in una botta unica («preset con la mia auto» + «durata
consigliata per pista»), entrambe sulla Gara al volo:

- **PRESET COL NOME su [tools/_gara-veloce.mjs](tools/_gara-veloce.mjs)**:
  `salvaPreset`/`leggiPreset`/`elencoPreset`/`cancellaPreset` su un JSON
  ATOMICO accanto al registro (data/preset-gara-veloce.json, in sandbox nei
  test). Una ricetta salvata passa per `ricettaNetta()` — la STESSA
  normalizzazione di `garaVeloce` (giri o tempo esclusivi, durata > 0 con
  arrotondamento, banda 0–100) con i SUOI codici di errore: un preset si
  «carica e parte» solo se è una gara che `garaVeloce` farebbe davvero.
  Il sedile entra COME TUTTO il resto: `auto: 'ks_ferrari_296_gt3'` dentro il
  preset. Ri-salvare è cura (sovrascrive), cancellare è idempotente.
- **Endpoint webui `gv-preset`** (salva / elenco / carica / cancella) e riga
  nel pannello Gara al volo di [gui/js/viste-a.js](gui/js/viste-a.js): menu e
  bottoni 💾/🗑 che parlano gli stessi ID auto del ladder già in gv-liste.
- **DURATA CONSIGLIATA**: `hotlapsPistaGiro(pista, auto?)` in
  [src/hotlaps.mjs](src/hotlaps.mjs) legge il quaderno dei giri e torna il PB
  della pista (tra prove e libere, MAI gara) — con auto nota il PB della SUA
  auto. Pista fuori dal libro o quaderno vuoto → null, silenzio, niente
  cifre inventate. Anche qui i dati reali: PB Monza 1:33.306 in SF-25.
  Endpoint `gv-giro-pista` e un suggerimento in GUI accanto alla durata.

Verifica: test/preset-gara-veloce.test.mjs 5/5 (round-trip col sedile,
validazione invariata al salvataggio, overwrite/ordine/idempotenza, PB di
pista e per-auto con quaderno e reali di Monza), suite vicine
gara-veloce + hotlaps + set-instantrace 34/34, Biome pulito sui 4 file toccati.

### 30/10/2026 (bis) — Il dottore riceve i suoi primi test (e una brancha morta esce)

Sonda di copertura completa: nella lista dei moduli MAI toccati da nessun test
c'era anche integrity.mjs, il revisore dei conti della carriera — probabilmente
il modulo più critico di tutti, e nessun test lo proteggeva. Fetta presa:

- **test/integrity.test.mjs (14 casi)**: senza gare → zero anomalie; carriera
  coerente → zero; statistiche storte → HIGH per ognuna dei contatori;
  giri storto → MEDIUM coi due dati nel testo; cassa/rep fuori dal registro
  → HIGH col segno della differenza (diff 1000 / diff -7 veri nel testo);
  ritiro con posizione 1 → MEDIUM «dati contraddittori» col nome del nodo;
  annuncio mancante con bacheca viva → LOW, annuncio spinto fuori dal cap
  → SILENZIO (la regola dei 60 annunci scappati), rawPos di penalità e match
  a due secondi con «premio» → SILENZIO; fixIntegrity in dryRun → cura elencata
  e stato IMMUTATO (anche il save non toccato), con lente vera → tutto
  sistemato, flows re-seeded, zero anomalie e save atomico presente nel nido.
- **BUG TROVATO E CORRETTO**: la regola «miglior giro in formato strano» era
  una brancha morta da sempre — lapMs ritorna Infinity sul formato sbagliato
  e `!Infinity` è falso, l'anomalia non si segnala MAI. In src/integrity.mjs
  ora matcha con `!Number.isFinite(lapMs(r.bestLap))`; il test la vede.
- **test/pota-log.test.mjs (3 casi)**: la potatura keep-last scritta in
  mattinata (car-match + flows watchdog) entra in suite: append normale sotto
  soglia non tocca il file; oltre 512 KB le righe vecchie dell'inizio vanno,
  le ultime e quelle appese DOPO il taglio restano; il watchdog del registro
  porta pid e ragione nella riga fresca. (Le fasi di soglia reali, 512 KB,
  non la soglia errata del primo giro di test.)

Verifiche: i due file nuovi 17/17 verdi, suite completa 605/605 (da 588),
biome pulita su tutti i file toccati.

### 30/10/2026 — La spazzata dei dati si fa (A2+A3) e i due log senza freno vengono cavati

Ultimo residuo dell'audit del 28/10: la spazzata manuale. Fatta sul vivo,
con due correzioni rispetto alle ipotesi di quel giorno (riportate nel
[report dell'audit](report/audit-dati-2026-10-28.md) aggiornato):

- **griglie-grezz/ non era un sospetto da mezz'ora: era il grosso** — 434
  file, 5,3 MB di customgrid grezzi del 23/24-10. Unico referente nel
  codice: tools/_merge-r5.mjs, operazione R5 chiusa il 25/10 (le celle
  uniche sono già fuse nel template). Cancellata tutta.
- **slot-3/ non era un fantasma: è il nido registri per-slot** (rivals,
  risultati, customgrid del 25/10). Resta tutto. E i 9 bak del customgrid
  restano anche loro: la potatura unica `pruneBackups` (keep=25) è il
  padrone di quella pila, non la spazzata.

Via (zero riferimenti nel codice, tutti verificati): tutto griglie-grezz,
zip arido slot-1 da 158 B, 2 `grid-classes.json.bak-stile-*`,
3 `career.evo.ladder.json.bak-{cal-,stile-*}`,`grid-classes.bak-zavorra-
28-10.json`. Restati gli zip FULL in rotazione (unica copia completa,
MAX_ZIP=4 li scarta da solo). Bilancio: ~5,4 MB e 439 file.

**E a casa la cavità vera**: match-auto.log aveva 19,9 MB e flows-debug
.jsonl 1,4 MB perché entrambi gli append erano senza freno (punto A3:
diagnosi giusta, rimedio mancato). Ora car-match.mjs e flows.mjs hanno
una potatura keep-last condivisa (se oltre 512 KB → tenute le ultime 600
righe, sempre MAI throw, il log non deve bloccare mai nessuno). Verificato
al banco in sandbox: file da 600 KB → 84 KB dopo la prima scrittura, le
righe vecchie vanno, le righe nuove e il watchdog restano. I due grossi
veri si accorciano da soli alla prima preparazione/import del gioco.

Verifiche: life.test 13/13, biome pulita su entrambi i file.

### 31/10/2026 — La prossima fetta di copertura: setupAB e seatMonteCarlo entrano nel test
La fetta promessa nella voce «L'area debole #2» (31/10 notte) è presa:
[test/analisi.test.mjs](test/analisi.test.mjs) passa da 7 a 14 casi e gli DUE
strumenti di analisi.mjs che restavano scoperti ora hanno i loro test:

- **Banco A/B (`setupAB`) — fixture MoTeC**: builder del `.ld` sintetico
  (stesso formato decodificato di laptrace.test.mjs: FUEL@20Hz +
  SPEED/THROTTLE/BRAKE/TYRE_PRESS_LF@60Hz, beacon nel `.ldx` in
  MICROSECONDI). Sessione A (base): 4 giri 20/21/22/23 s con l'ingresso in
  frenata che cambia per giro 270/260/250/240 — la «matita» che cammina;
  sessione B (prova): stesso profilo +40 km/h, mai freno. Test: file
  illeggibile → ok:false con messaggio (non crash); B più veloce →
  deltaBest +4 s esatto, gained 0 e il netto tutto «perso da A»; preset
  base/prova letti dal nome file; il freno di A pesa in zona frenata ma il
  grosso resta a gas pieno; matita in vista col messaggio «Costanza in
  frenata»; STESSO file due volte → pari sul best, zone tutte a zero,
  «niente dominante».
- **Monte Carlo del sedile (`seatMonteCarlo`) — fixture ladder+state**:
  stesso schema di life.test/race-card (parco 30 piloti con cons/aggr,
  perché il rumore del motore rivali li legge) + profilo osservato del
  pilota (5 gare, 1 ritiro → dnfRate 20%). Test: offerta di fine stagione
  simulata con aritmetica del saldo verificata (premio atteso − affitto −
  fee·ronde), DNF attesa entro ±6 punti dal 20% osservato, domini 0..100
  su tutti i % e disclaimer «ordine di GRANDEZZA» in pagina;
  DETERMINISTICO (due simulazioni identiche per gli stessi input, seed
  condiviso); senza offerte → serie aperte col gate superato + rinnovo,
  mai la serie sotto; serie corrente ignota → ok:false onesto; offerta
  fantasma → scartata in silenzio, zero sedili.

Verificato a scrivere i test: la regex STRETTA di `presetOf` in
[src/motec.mjs](src/motec.mjs) e il suo fallback greedy passano ANCHE
sui NOMI VERI. Misure sui 241 file `.ld` veri di Saved Games/ACE/MoTec:
regex STRETTA 241/241, fallback 0 — il nome vero è
`<auto>_preset_<preset>_<pista>_<giorno>…` (es. preset «695b_mech_1»,
senza spazi) e il preset esce intero con i suoi underscore. La cascata
sta com'è: il fallback è residuo di formati antichi, niente da riparare.
I fixture del test usano un nome nel formato che la regex stretta vuole
("_test_" fra preset e data).

Verifica: lint Biome pulita sul file toccato, node --test 14/14 verdi
(260 ms). Zero cambi in src: la fetta era soltanto di copertura.

### 31/10/2026 sera — La pila dei bak: UN nome, UNA potatura, applicata dappertutto (e il filtro che NON li vedeva)
Sul dirittivo dell'area di ieri: `bakName` copiato in TRE posti (grid-apply,
weekend-roster) e la potatura viveva SOLO in grid-apply — i bak di
`timedRace`, `setInstantAi` e `bak-veloce` crescevano senza freno.

- **Una fonte**: [tools/evo-grid.mjs](tools/evo-grid.mjs) ora porta `bakName`
  + `pruneBackups`; grid-apply re-esporta (cli e corrupt-inputs stare al posto
  loro), weekend-roster ha buttato le sue copie (bakName e potatura).
- **Il buco del filtro** (scoperto applicando la potatura): `pruneBackups`
  contava solo i bak col NUMERO ALL'INIZIO dopo `.bak-` (formato antico
  senza tag) — tutti i bak moderni col tag (`bak-veloce-2026-…`) uscivano NaN
  e NON venivano mai potati (l'audit 28/10 A3 aveva già beccato lo stesso
  difetto per `bak-ripara-*`). Ora il filtro cerca la DATA (4 cifre) in
  qualunque posizione dopo `.bak-`: taggati e senza tag in un'unica pila,
  i nomi senza data restano fuori.
- **Tetto 25 applicato** a: blocco Race a tempo/giri, banda AI dell'istantanea,
  griglia dal pool, roster weekend (che già aveva la sua copia, stessa soglia).

Verifica: lint pulito, 43/43 (corrupt-inputs con il TEST NUOVO dei bak taggati,
set-instantrace, gara-veloce), 22/22 grid-templates + gridbuilder-uniche +
webui-smoke + game-owned.

### 31/10/2026 tardo pomeriggio — La Gara al volo senza angoli ciechi: bak anti-collisione e segna-stato onesto
Giro di vigilanza sul flusso «gara personalizzata» (_gara-veloce + set-instantrace
+ GUI) del giorno prima. Sospetto ISSUTO (l'idempotenza «non nel codice») POTUTO
A FALSO: il confronto byte della griglia dal pool c'è (andava verificato prima di
correggere, non dopo). Le aree deboli vere erano altre tre, tutte riparate:

- **Bak al minuto si sovrascrivevano**: la lezione 28/10 di grid-apply (nomi
  bak con solo minuti → due scritture nello stesso minuto cancellano la pila)
  NON era arrivata agli altri scrittori. `evo-grid.bakName` condivide ora la
  cura (secondi + suffisso -rN sul pareggio di secondo) ed è usata da
  `timedRace` (bak-temprace), `setInstantAi` (bak-instantai) e la griglia dal
  pool (bak-veloce). Test: due scritture ravvicinate lasciano DUE bak.
- **Segna-stato mentitore**: garaVeloce ritorna 200 anche con passi KO (giusto:
  la lista ✓/✗ serve) ma la GUI tostava sempre verde «Scritto». Ora il toast
  diventa un warn che punta ai ✗ dell'esito ([gui/js/viste-a.js](gui/js/viste-a.js)).
- **Test mancanti dell'idempotenza griglia**: [test/gara-veloce.test.mjs](test/gara-veloce.test.mjs)
  ora prova la STESSA ricetta col pool due volte (seconda = «già identiche sul
  disco», zero bak nuovi — la regola 30/10 resta in piedi, non più solo promessa).

Verifica: lint Biome pulito, 27/27 gusti set-instantrace+gara-veloce (4 nuovi),
15/15 webui-smoke + grid-templates + gridbuilder-uniche.

### 30/10/2026 ore 14:10 — PARTE SUBITO: l'ultima ricetta della Gara al volo si rilancia con un bottone
La lamentela: «ogni volta ci sono sempre problemi con auto, griglie, piste o
gara tempo/giri» — reimpostare la stessa gara era noia e fonte d'errori (gli  id auto battuti a mano ieri l'hanno già pagata). Tre canali aggiunti al

- **Il registro è la RICETTA**: ogni scrittura vera di `garaVeloce` registra
  TUTTI i parametri (giri/tempo, banda, pista, sedile, pool). Nuova funzione
  `ultimaRicetta()` in tools/_gara-veloce.mjs la rilegge (null a registro
  vuoto, mai un'eccezione). Nota: la story FULL-FILE WRITE di oggi aveva
  perso `formattaRigaRegistro` (import di uiapp-pub): export
  rimessa a posto e il smoke card+paddock e webui-smoke passano di nuovo.
- **Endpoint webui `parti-subito`**: ri-esegue la ricetta con garaVeloce
  (force via bridge, come 'gara-veloce'); idempotente per costruzione — la
  STESSA ricetta due volte riscrive SOLO ciò che il menu di EVO ha cambiato
  nel frattempo, e la griglia dal pool ora collauda i byte PRIMA di
  scrivere: identici → «già identiche sul disco», niente backup né riga.
- **Endpoint webui `gv-liste` + datalist in GUI**: i campi SEDILE/POOL si
  appoggiano agli ID auto del libro ladder (value = id, label = nome) e il
  campo PISTA ai nomi del libro TRACK_INFO: niente più id battuti a mano
  sbagliati. La GUI precompila anche i campi VUOTI con l'ultima ricetta
  (una sola volta: i valori battuti a mano restano) e il bottone ▶ in cima
  al pannello mostra l'anteprima della ricetta in canna.

Resta fuori dal bottone: il menu griglia di EVO (APPLICA coi pool) e la
partenza — com'era per il CLI già dal 3/11.

### 30/10/2026 ore 14:40 — La Gara al volo si sceglie in MENU: auto, piste e preset di griglia mono/multiclasse
Seconda metà della stessa richiesta («dammi menu a tendina per piste, auto,
griglie mono o multiclasse»): i tre campi dell'istantanea diventano SELECT.

- **AUTO e PISTA**: menu costruiti dall'endpoint `gv-liste` (libro ladder +
  TRACK_INFO, ordinati per nome). Il datalist resta per il pool A MANO.
- **GRIGLIA**: un menu di PRESET riempie il pool a fianco (comunque
  modificabile). I preset sono le classi per NOME auto con `classeAuto`
  (classi-gt.mjs, la STESSA classificazione del rapporto di gara): mono per
  classe con almeno un'auto (GT1, GT2, GT3, GT4, …) e multiclasse sulle
  combinazioni attese — «GT3 + GT4», «Hypercar + GT3», «Hypercar + GT3 +
  GT4 — endurance», «Hypercar + LMP2 + GT3 + GT4 — endurance completa».
  Sul libro attuale escono: GT1 (1), GT2 (1), GT3 (6), GT4 (2) e GT3+GT4 (8).
- **Il pool resta la fonte**: preset scelto → riempie il campo pool; pool
  toccato a mano → il menu torna «personalizzata». Il prefill dell'ultima
  ricetta si applica quando i menu sono PRONTI (gvListeOk): un valore
  fuori menù si aggiunge marcato «(fuori menu)», mai rimpiazzato.

Verifica: lint pulito, gara-veloce+webui-smoke 14/14, preset collaudati
sul server vivo (46 auto, 18 piste, 5 preset). Riavvio webui fatto: F5 ella
GUI si vedono i menu.

### 30/10/2026 ore 12:42 — Il weekend REALE arma Monza + griglia endurance (pista, cartuccia, roster, banda AI)
Mauro era sul Weekend di Gara spinato: auto cambiata (Audi GT4 Evo, sedile del
Cruscotto) ma pista Donington e griglia GT3 di carriera ferme — l'istantanea
garaVeloce non tocca il RACE_WEEKEND (come da lezione 23/10). Il canale di
scrivere NEL weekend aperto è però collaudato (set-track 3 cicli 20/10,
setWeekendAi, trapianto roster 29/10). Tre scritture con backup:

- **Pista Monza** nei 4 blocchi (`set-track --track Monza`), rilettura 0 campi;
- **Cartuccia customgrid 16 celle** col pool endurance F40 LM + 296 GT3
  (builder, `noBalance` eventi ospiti, banda AI 88–93 nel customgrid,
  bersaglio = dichiarato 15 +1 in CUSTOM, mai sotto le 14 native il gate 24/10);
- **Trapianto roster**: le prime 14 celle nei 14 slot del Practice del
  gamemodesave (`syncRoster`), così la ronda NON spawna più le GT3 di carriera
  neanche al lancio senza APPLICA;
- **Banda AI weekend 88–93** (cursori 30/31).

Resta SOLO un gesto: nel menu griglia del round premere **APPLICA** (monta le
16 celle della cartuccia) e poi PARTI. La Race resta **3 giri** (per progetto:
la durata a tempo della Race del weekend non si scrive, `set-racetime` la
rifuta — canale di collaudo a tempo = gara personalizzata). Il tool one-off:
tmp/weekend-al-volo.mjs (temporaneo, rimosso: Il SUO pool peccava — vedi 12:55).

### 30/10/2026 ore 12:55 — Corretto: la griglia va fotocopiata dai TEMPLATE veri, non sintetizzata
Al menu griglia Mauro vede APPLICA grigio e senza anteprime auto: le celle che
avevo scritto al 12:42 erano celle SINTETICHE del builder (opt-in `celleNuove`:
id/nome/preset `preset_+id` innestati su una cella donatrice — per costruzione
crude: «la prima APPLICA è la verifica»), e in più l'id pool `ks_f40_lm` era
ERRATO: il vero è **`ks_ferrari_f40_lm`** (per questo il builder vedeva la F40
«mai in griglia» e la sintetizzava, con l'anteprima morta). La cura, in un colpo:

- **Celle byte-per-byte dai template VERI** di magazzino
  (`coppa_ferrari-f40-lm.customgrid` e `coppa_ferrari-296-gt3.customgrid`, la
  fotografia degli eventi con le STESSE auto): 16 celle interlacciate 8+8
  (pari F40, dispari 296), piloti veri allineati allo stesso interlacciamento,
  preset veri (`F40 LM Preset Base` / `296 GT3 SRO`), config con count 16,
  AI 88–93, finestra PI 19–22 (span copre entrambe). Cartuccia e roster
  riscritti, rilettura ok (preset e nomi veri).
- **Lezione principale**: i preset VERI non si inventano dal catalogo auto
  (cars.json porta nomi e PI, basta al Paddock per SCELGERE il pool ma non per
  GENERARE celle): le celle vere si fotocano SOLO dai template fotografati in
  EVO (GENERA→APPLICA una volta per pool). Il Paddock «Gara al volo» passa per
  gli STESSI canali (builder+template), con il catalogo come fonte di nomi/PI.
  Da qui in avanti: il pool «endurance» di garaVeloce/pannello va scritto con
  `ks_ferrari_f40_lm,ks_ferrari_296_gt3` e, se un'auto non ha template in
  magazzino, FOTOGRAFARLA prima (una volta sola); il sintetico resta solo
  collaudo, mai per le gare serie.
- **APPLICA grigio**: è il menu EVO che sblocca il bottone SOLO con una
  modifica dentro la griglia (trascina una cella o muovi un cursore): non è un
  guasto nostro. Con le celle NOSTRE non serve: PARTI dopo l'APPLICA di un
  gesto qualsiasi (o al PROSSIMO menu, se il round resta montato).

Il tool one-off del 12:55: `tmp/pool-templates-weekend.mjs` (temporaneo: la
buona regola per i flussi ora è «assegna il pool SOLO dai template di magazzino
+ interlacciamento», come fa _genera-multi.mjs per le multiclasse).

### 30/10/2026 pomeriggio — Prova del copilota IN PAGINA (nucleo + chip «♪ prova») e il collaudo onesto della radio
Tre prove fatte con la pagina viva su http://127.0.0.1:8642 (GUI servita con
narratore-unito.js loaded):

- **Nucleo sintetico in pagina**: la STESSA funzione `narratore(m, slot, ora)`
  che parla in gara è stata guidata con un payload di gara completa
  (giro 2 con delta, meta, benzina, gomme, bandiera, stint). Regole
  confermate in pagina: prima lettura = seme zitta (bandiera già a scacchi
  al primo tick NON parla); bandiera in coda esce al giro successivo o al
  soccorso di 10 s; le frasi «giro 1» e meta arrivano conservando il
  `lapsTotal` VERO (senza totale vale il ramo 8c, ronde a tempo).
- **Chip «♪ prova»**: clicca e parla sul vero: handler in
  [gui/js/viste-d.js](gui/js/viste-d.js) chiama
  `speechSynthesis.speak('Prova della voce copilota...')` (verificato con
  hook su speak, non solo col flag `speaking`).
- **Area debole trovata e chiusa**: il chip «♪ prova» collaudava SOLO la voce
  del BROWSER, ma in gara la copilota del Pitwall parla con la voce del
  SERVER (Cosimo/System.Speech via voceSrv) — timbro diverso, prova menzognera.
  Ora il chip prova PRIMA la radio vera (`POST /api/voce-prova`, lo stesso
  del bottone «prova la radio» nelle Impostazioni): risposta 200 con
  `livello: full` e il repertorio del livello in coda a Cosimo (provato:
  «Prova della radio, livello full... Bandiera a scacchi!»). Se la radio è
  spenta (400) o il server offline, cade sulla prova classica del browser,
  identica a prima. Il tooltip in [gui/index.html](gui/index.html) dice ora
  entrambe le cose.

**Suite 575/575, Biome pulita.**

### 31/10/2026 notte — I narratori UNIFICATI (una sola copia) e la scansione MoTeC estratta dal webui
Presi i tre compiti del momento: unificare i narratori, far girare la suite,
refactoring mirato. I duplicati erano veri, con un motivo di nascere: il nucleo
testato `narratore(m, slot, ora)` viveva in [tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs)
(e lo usano [src/voce-copilota.mjs](src/voce-copilota.mjs) e il test) mentre la
cruscotto ne teneva le GEMELLE manuali narratore per narratore in
[gui/js/viste-a.js](gui/js/viste-a.js) — ogni cura (bandiera prima del giro,
postalk gate a verde, delta solo da «tracked») andava applicata DUE volte.

- **Nucleo UNICO**: il narratore muove in [gui/js/narratore-unito.js](gui/js/narratore-unito.js)
  (23 KB, caricato come script classico → attacca `globalThis.__EVO_NARRATORE`,
  importato dal monitor come facciata Node → [voce-copilota.mjs](src/voce-copilota.mjs)
  e il test cambiano ZERO voci). Le frasi restano {chi, it}: la copilota parla
  sempre italiano (cpT).
- **viste-a.js**: ~320 righe di gemelli fuori (1 delta, 2 giro, 3/3b benzina,
  4 gomme, 5 gap, 6/6b/6c pit-box, 7 autofuori, 8/8b/8c/8d ultimogiro+bandiera,
  9/9-ter posizione+verde, 10 blu); resta la pagina SOLO le decisioni di
  visibilità (chip, radio server, grazia) e la chiamata al nucleo con lo slot
  `cp` (cp.said = alias rinfrescato di cp.detti). cpSay e bandParla orfani fuori.
- **autofuori**: il narratore 7 (auto fuori parco, 30 s) entra anch'esso nel
  nucleo — nel Pitwall resta zitto finché `m.auto` non arriva nel payload da
  lì, nella pagina parla come prima.
- **Refactoring mirato**: la scansione MoTeC del pannello di salute muove fuori
  da [src/webui.mjs](src/webui.mjs) (quasi 4000 righe) in [src/webui-telem.mjs](src/webui-telem.mjs):
  memo dei 10 s e lettura byte del `.ld` IDENTICHE — lancio a prova lo
  `systemHealth` continua a tornare gli stessi campi. nel server resta solo
  l'import
- **Niente riavvio del server** per questo giro: i file della GUI parte da
  disco a ogni request (revalidate via ETag) e il nucleo del server è lo stesso
  codice di prima, solo più in fondo in facciata.

**Suite 575/575, lint su 270 file pulita.**
### 31/10/2026 — Il cruscotto prende di più dal server: prossima ronda e bacheca del team
«Integra maggiormente il cruscotto con il server»: il pannello in gioco aveva
già consigli/bottoni/verdetto/classifica/mondo/sincro, ma la scheda della
PROSSIMA ronda (il numero `prossimo` era nel payload da sempre e MAI disegnato)
e la SCRITTA DELLA BACHECA restavano solo nella GUI del browser.
- [uiapp-pub.mjs](src%2Fuiapp-pub.mjs) ora spedisce `prossimoApp` (giorno +
  quando + le prime gare con pista/giri/ora/meteo/auto, STESSI campi delle card
  «gare di oggi», fonte agenda: racesOnDay) e `messaggi` (le ultime 4 di
  state.messages col traduttore della GUI, legacyMessageEn import: un solo
  libro di traduzione).
- [cruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js) li disegna: gruppo
  «Prossimo appuntamento» dopo Gare di oggi, gruppo «Dal team» prima della
  classifica — niente dati = niente gruppo, mai un buco.
- Installata con installa-cruscotto e letta con un probe dalla STESSA fascia appena scritta: già i campi
  VIVI (giorno 188: Endurance Elite Brands Hatch, GT2 Mount Panorama,
  Porsche Cup COTA; 4 messaggi, primo «Iscrizione Coppa Strada round 3 (-350)»).
  NEL GIOCO il pannello deve essere RICARICATO a mano dal drawer APPS →
  Cruscotto (il JS in gioco non si ricarica da solo).

**Test: uiapp-pub guard+priorità 39/39, node --check, lint Biome pulita.**
### 31/10/2026 — Collaudo a gioco acceso, i consigli anche nel Paddock
Gita in tre tappe, tutte chiuse con prove sul disco:
1. **Collaudo live dei consigli** — EVO acceso (ma in menu), server vivo:
   le fasce del [publisher](src%2Fuiapp-pub.mjs) escono regolari
   (`ui-7173xxxx.json` pochi secondi l'una) e il pacchetto consigli arriva
   nel payload con `live:false` e `tips:[]` — giusto: fuori sessione
   l'ingegnere sta zitto e il gruppo si nasconde da solo. Lo snapshot MMF
   dice `{"game":false}`: coerente con il menu.
2. **Verdetto di giornata** — rigenerato a mano e RILETTO dalle fasce:
   3 gare (Donington 5/13 +24,8s, doppia Monza in DSQ col giro
   01:54.380), [report/gare/verdetto-261030.md](report%2Fgare%2Fverdetto-261030.md).
   Il numero della fascia e quello della CLI coincidono: una sola verità.
3. **Consigli anche nel Paddock** — il bridge `/api/paddock` ora porta
   allegato il pacchetto consigli (`consigliFascia`, STESSA fonte del
   cruscotto in fascia: zero letture MMF aggiuntive) e [viste-a.js](gui%2Fjs%2Fviste-a.js)
   li disegna in fila sotto la tabella del meteo. Collaudato SU SERVER
   VERO dal smoke test: forma {live,tips[]} sempre presente, mai un 500.


Chiusura del cerchio: **riavvio del server vivo con [riavvia-webui.mjs](tools%2Friavvia-webui.mjs)**
— `/api/paddock` risponde col pacchetto consigli (live:false a menu, giusto)
E il publisher riparte col pitwall: le sue mini-fasce (`ui-7173558xx.json`)
cominciano a uscire nella SUA cartella, come promesso a teoria.

**Test: webui-smoke 1/1 (con le nuove asserzioni del payload), paddock +
uiapp + verdetto 59/59, lint Biome pulita sui file toccati.**
### 31/10/2026 notte — L'area debole #2: analisi.mjs senza test (e frasi corrette anche nei TESTI)
Misurato con dati: lint pulita su 267 file e la scansione «chi importa cosa»
nei test ha pescato i moduli senza copertura. Il peggiore: [src/analisi.mjs](src/analisi.mjs)
(708 righe dal 23/10 — autopsia, dossier rivale, banco A/B, Monte Carlo, tetto)
non era importato da NESSUN test. E dentro, oltre ai commenti, venivano fuori
FRASI CORROTTE VENDUTE ALL'UTENTE:
- headline del ritiro EN «Race handed in» → «Race abandoned»;
- caveat della Monte Carlo IT «Servono per serietà numeriche, e si comanda con
  i reali» → «Prendi l'ordine di GRANDEZZA, non una promessa: il verdetto vero
  lo danno le gare reali»;
- tetto vuoto «l'import li collecchia» → «li raccoglie»;
- banco A/B «il lap va e issa in varie zone» → «il lap è bilanciato nelle
  varie zone»; più «presupuesto», «più piiano» e «i ona peggiori» nei testi di
  commento.
Il primo test dedicato: [test/analisi.test.mjs](test/analisi.test.mjs), 7 casi:
- raceAutopsy: null onesto senza risultati, l'autopsia IT completa (partenza
  P5→P2 «perse 3 posizioni», ritmo secco 2° di griglia a 0,40 s dal campo con
  giudizio «good», il racconto che apre con la headline), e il ritiro con la
  headline EN/IT — la frase corrotta non torna;
- tettoReport: aggregazione per pista (margine best − teorico, e su due campioni vale la MEDIANA BASSA → il peggiore è S1), vuoto onesto con hint;
- rivalDossier: due gare in archivio → h2h 2 sconfitte, mediana −0,4 s «PIÙ
  VELOCE», trend stabile, consistenza media P2/sdev 0; sconosciuto → null.
Prossima fetta: setupAB (fixture MoTeC) e seatMonteCarlo (fixture world).
**Suite 575/575, lint su 268 file pulita.**

### 31/10/2026 tarda sera — L'area debole del giorno: i commenti corrotti del webui
Chiesta «un'area debole da migliorare», scelta con dati e non a naso: suite verde,
lint quasi pulita (1 solo warning vero) e zero CJK residui — ma restavano nei
COMMENTI di [src/webui.mjs](src/webui.mjs) frasi Italinglish nate dalle sessioni
passate, fuorvianti per chi rilegge il codice. Scrivate in italiano vero:
- memo gameRunningMemo (26/10, PC 2): l'idea era «tasklist può appiccicarsi / un
  sondaggio inceppato resta in coda alle richieste del server».
- LEGGERO della voce (29/10): «il tick radio in gara si incartava dietro la
  spazzata (così il 28/10 la voce mutava)».
- battito voce→server (30/10): prima il 4° argomento di giroVoce era il FILE di
  registro passato fuori posto (l'opzione {log} non c'era), per questo una gara
  parlata restava indistinguibile da una muta nel diario.
- battito di avvio (29/10, MAI unref): l'interval unref smetteva di battere senza
  che il server sembrasse caduto (la prova dei 57 minuti) e la radio taceva
  proprio quando serve.
Insieme: tolto l'ultimo warning di lint — `stintPlanFor` non riceve più `ladder`
inutilizzato (firma e due call-site aggiornati). **Suite 568/568, lint su 68 file
pulita, node --check ok.**

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

### 2/11/2026 — Il meteo della gara non si paga più in corto (anti-cheat)
Richiesta Mauro: «quando lancio la gara dal preparatutto, poi posso cambiare es il
tempo… potrebbero prenderla tutti, si deve evitare, anche le gare sul bagnato si
devono fare». Il cambio meteo a mano della gara preparata (La scorciatoia
bagnata → secca) è ora rum del popolo solo in modalità test:

- [src/weather.mjs](src%2Fweather.mjs): guardia in `setWeatherPreset` e
  `setWeatherCustom` — fuori test-mode → rifiuto `WX_LOCKED` con messaggio
  che dice come sbloccare (`test-mode --on`). Passano solo: la prova
  asciutta (dry) e il meteo PREVISTO (`previsto:true`).
- [src/test-mode.mjs](src%2Ftest-mode.mjs): `meteoLibero()` + `EVO_TEST_MODE_FILE`
  (stesso schema di EVO_DATA_DIR/EVO_CLASSES_FILE) per collaudare la guardia
  on/off senza toccare la carriera vera.
- [src/webui.mjs](src%2Fwebui.mjs): i DUE call-site del preparatutto (event-prep
  e Prepara tutto della ronda) passano `previsto:true` — la scrittura porta
  solo il meteo che il calendario dichiara, che è il punto.
- Test: [test/weather-preset.test.mjs](test%2Fweather-preset.test.mjs) +2 casi
  (rifiuto fuori test, premio con test attiva). Suite completa 626/626, Biome
  pulita sui 4 file toccati.

### 30/10/2026 — Giornata di bug in pista, tutti con la loro mano
- **R5 → F40 a sorpresa a fine gara**: il cambio auto istantaneo riusciva a partire
  da un comando dell'app senza finestra armata (scappatoia trovata e tappata).
- **Gara ripartita da sola tornando al menu**: auto-via senza finestra → corretto con
  la finestra di 30 min dopo «Prepara tutto» + la lettura dello store che distingue
  «ack assente» da «lettura a metà scrittura». Test dedicati.
- **Penalità + rossa a schermo dopo il restart**: indagato nel registro del copilota —
  l'annuncio era vero e corretto nel tempo, la bandiera non c'era nel campo: rimanda
  a DA-1 (il grep del protocollo la smaschererà domani).
- **Foto pista vuota + crash 0xC0000005 al lancio, causa trovata**: il blocco pista
  (3.5) porta anche il campo 5 = max_pit_slot del layout (dal catalogo eventi del
  server dedicato: Monza GP=30, Oulton International=16, verificato contro i file
  sani riscritti dal gioco). Cambio pista riscriveva nome/tag/layout ma ereditava
  il pit slot del file precedente (Oulton con 30 di Monza): EVO non risolve più
  l'evento, finestra pista vuota e lancio che spiana. set-track ora scrive 3.5.5
  (tabella PIT_SLOTS, 18 piste del libro) e la INSTANT_RACE corrotta è stata
  riparata (pit 30→16, backup .bak-track-19-05).

### 30/10/2026 — Il doppio «Chiudi la stagione» trappato
- **Il vivo**: dopo aver chiuso la stagione (click riuscito: save avanzato,
  contratto saldato anche nel messaggio), la card del cruscotto restava sul
  video con «calendario completato 3/3» e un secondo click contava la stagione
  NUOVA (0/3) facendo comparire «Stagione incompleta: conferma per chiudere
  comunque» — con quel «comunque» che l'avrebbe svuotata nell'annuario.
- **Causa**: la chiusura riesce ma il modale chiuso con la ✕ (e i click su una
  card non ancora ridisegnata) non ridisegna la pagina; il secondo click arriva
  sul server fresco, che guarda la stagione 12 con 0 gare e proporpone di
  «chiudere» una stagione mai corsa.
- **Cura**: [state.mjs](src%2Fstate.mjs) espone `seasonJustClosed(state, node)`
  — puro, senza ladder né disco: stagione corrente a 0 gare E la STESSA serie
  chiusa subito prima nell'annuario. La usano lo stesso caso 'season-end' della
  webui (409 col codice `SEASON_ALREADY_CLOSED`, messaggio «Non devi chiudere
  nulla») e `cmdSeasonEnd` della CLI. Il client
  ([viste-d.js](gui%2Fjs%2Fviste-d.js)) traduce il codice in un dialogo «Stagione
  già chiusa» senza il bottone pericoloso, e al placare ridisegna la card
  stantia. La chiusura LEGITTIMA di una stagione vuota (iscrizione mai corsa,
  stagione saltata) resta possibile: la guardia morde solo sul doppio click.
- Test: [test/season-guard.test.mjs](test%2Fseason-guard.test.mjs), 6 casi puri
  (doppio click, chiusura legit con gare, vuota senza chiusura prima, altro
  nodo, annuario assente, round-trip con seasonEnd vero). Suite completa
  632/632, Biome pulita sui 5 file toccati.

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
