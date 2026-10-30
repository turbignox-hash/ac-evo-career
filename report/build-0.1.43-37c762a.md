# EVO Pitwall — report build 0.1.43 (37c762a)
_Data: 2026-10-30 · Aggiornamento da **v0.1.42**_

## Correzioni e novità
- Radio copilota unica sul Pitwall: livelli voce (essenziale/normale/full), penalità tagli a voce, posizioni live, conto alla rovescia nelle gare a tempo, bandiera DI DOPO il giro del traguardo (8d); registro automazione alleggerito alle lezioni vive · 5a48301
- Prova la radio: la voce del Pitwall si collauda da Impostazioni col repertorio del livello scelto, senza correre una gara; server con il codice 8d in esercizio. · 39cccba
- riepilogo copilota: bilancio sulla radio reale, non sull'eco del monitor · a8f7175
- riepilogo copilota: contabilità estratta in statRiepilogo() pura e testata · 1a86754
- copilota: la voce «delta di ritmo» torna a parlare (era muta dal 27/10) · 575bf22
- note automazione: la lezione del delta di ritmo muto (vicolo cieco della semina) · 62186e9
- nota: correzione del riferimento al commit del fix delta (è 575bf22) · 5188459
- nota: refuso «spuzzatura» → «spazzatura» · b9bc4e8
- Monitor: anomalie banda calcolate per gara, non per file · 0e54b29
- Gap grezzi nel flusso: la diagnosi dei campi morti la fa la prossima gara · c24c3be
- Monitor: registra i gap grezzi tra i campi · 3dda320
- Delta di ritmo: finestra ±15 s e cadenza 45 s, e il monitor torna a vedere · 98a125b
- Via libera alla bandiera verde, e la posizione tace nei box · 7de1c42
- Diagnosi archiviata: gare SP etichettate TimeAttack, finestra sosta muta · 2a04119
- Finestra sosta riparata nelle gare SP: il gate ora legge la FASE del gioco, non il tipo che mente · f292b05
- Ascolto live arricchito: FASE del gioco quando cambia + frasi del registro voce una a una · 3e4f822
- Diagnosi archiviata: i gap della MMF sono morti in SP (misurato) · 5d1d1b6
- Conto alla rovescia delle gare a tempo parlato a tutti i livelli (minuto) · c292f55
- Protocollo di prova aggiornato alle modifiche del copilota di oggi · e74bf63
- Documenti allineati ai livelli della radio del copilota e al silenzio dei gap in SP · 3fbddf5
- Garage map aggiornata con l'hash Abarth 695 Biposto appreso live; tmp/ ignorata · d9a27b8
- Richiesta-auto nei consigli live letta senza warning Biome · 8ea1532
- Tendina del cruscotto con il livello spento e accensione in cascata; guida inglese completa · 38ea090
- Guida inglese completa dei livelli radio; checklist installazione pulita allineata · e0574ba
- Riepilogo radio silenzioso sul rumore di servizio (STATO/SILENZIO/TICK); motivi dei silenzi in lista unica · 28e35bb
- Prova decisamente a un comando: prova.cmd fa il pre-volo (webui, liveMode, livello con la regola del server) e apre monitor+ascolto · 7c1b7ac
- Prepara tutto scrive la durata gara delle ronde a tempo: le endurance non richiedono più l'impostazione a mano in EVO; scheda onesta sui minuti (niente giri/fabbricati) · a16e567
- Gara personalizzata al volo: un comando imposta giri/tempo, banda AI dell'istantanea (scrittore nuovo), sedile armato e griglia dal pool — resto a te solo pista e «parti» in EVO · 6892002
- Gara al volo nel cruscotto + griglia dal pool anche con auto MAI generate: garaVeloce() condivisa CLI/GUI (endpoint + pannello con dry-run), celle sintetiche dal donatore nel builder (opt-in celleNuove, report che dichiara), round-robin per modello perché ogni auto del pool entri in griglia; suite 484/484 · d69fd2d
- Gara al volo scrive anche la PISTA dell'istantanea: il blocco Race porta lo stesso campo pista del weekend (verificato a Monza'), --pista nazionale dal libro TRACK_INFO con riguardo a --force, dry e verifica di rilettura; endpoint GUI passa la pista; suite 488/488 · 39fbfdd
- Bottoni «Prepara e divertiti» sul cruscotto: ronda, evento e gara al volo come card con un tasto ciascuna · b042135
- Card «Prepara e divertiti» con i FATTI del sistema: finestra di freschezza, pista/giri/ora/banda evento e stato REALE dell'istantanea · 5328b65
- Finestra di freschezza a CONTEGGIO VIVO nelle card del cruscotto: scadeIn scorre anche tra le fasce e diventa arancione sotto le 2 ore · 40c2b79
- Riepilogo viv dell'istantanea anche nella GUI web: /api/istantanea (stessa fonte del cruscotto) e riga gv-stato sempre a giorno nel pannello Gara al volo · 3a311be
- Verdetto di giornata: tool CLI che agrega le gare del prefisso (aammgg), ora presa DOPO il trattino del nome Results, penalità EVO dentro la cella del giro e gap segnerato; test con file fidi 3/3 e corridato sui data veri di oggi (verdetto-261029.md). · 38b14f3
- Verdetto: una sola verità con carriera e archivio — resultDetail passa dalla stessa deduplica (driver_id poi nome) e le practice/quali NON pagano più l'aggregato (isRaceSession: stessa regola dell'import); restano NOTE sotto la tabella con ora, sessione e giro. Tests: practice non paga e resta nota, giornata di sole practice gentile, righe doppie contate UNA volta (5/5 verdi). · 2ba8f04
- Copilota: la voce delta parla SOLO con il best tracciato della sessione (source tracked — mai il falso delta HUD ancorato a una sessione precedente); gli annunci di posizione aspettano la verde in gara (partenza vista in ritardo = radio da subito) e la transizione da CLI legge il registro .jsonl e taglia il discorso in gare al silenzio ≥10min con ripetuti marcati. Tests: HUD muto in radio, postalk pre-via, transizione in gare. · c2fff4a
- Trapianto weekend: le celle delle serie (customgrid) si piantano anche nel blocco-celle del weekend — conteggio nativo rispettato, niente celle ripetute, idempotente con potatura e verify di rilettura; grid-apply pianta le stesse celle dopo ogni ricostruzione riuscita (silente su errore: la griglia non si rompe). Sonda _weekend-celle pulita dal vals morto. Tests sandbox 7/7. · c8d8460
- Finestra del via anti-riparto (esci da una gara → il menu non riparte più da solo): il comando auto-via vive SOLO nei 30 min dopo «Prepara tutto» (avviaFino in markPending) e la lettura dello store distingue «ack assente» da «lettura a metà scrittura» — store occupato dal gioco = fascia muta, mai un riparto su un insieme non letto. In gioco inoltre: semaforo «prepara» (ronda armata/gara al volo con finestre), verdetto di giornata in fascia con cache a chiave file, card arricchite (banda serie, premio evento, riga del registro). Tests: senza finestra mai un avvia, cache dietro ai file, preparaFascia. · 8aa38ea
- Gara al volo: il REGISTRO DELLA DURATA (gara-veloce.jsonl) conta solo le scritture vere, con i parametri che le hanno comandate — dry e idempotente non scrivono una riga (la storia del registro è ciò che è stato scritto davvero). La GUI lo legge: riepilogo con l'ultimo gesto (giri/tempo · banda · pista · ora), pista come campo a mano con solo APPLICA + VIA restati manuali, endpoint /api/verdetto e /api/riavvia, verdetto e copilota nella scheda (voce delta solo da fonte tracked, postalk dopo la verde). Tests: 15 min = 900 s nel file, tempo 0 rifiutato senza byte toccati, registro in asciutto vuoto. · 14f15d3
- Rientro in pista: riavvia-webui senza PID SCOPRE da solo il processo sulla porta (netstat, esportato pidSullaPorta con righe iniettabili per i test, esecuzione solo da isMain — importarlo non ammazza il server); la GUI porta il FILBAR DI SERVIZIO: due fallimenti di rete di fila mostrano il banner con età e bottone «Riavvia il server» (endpoint /api/riavvia), il poll su agg-info lo toglie quando il server torna. Tests: parser del riconoscitore 4/4. · baf5967
- Test: markPending arma la finestra del via (avviaFino) — la verifica della finestra anti-riparto era rimasta in coda al committamento. · 7bebcbb
- Verdetto 261029 rigenerato (19 gare · 11 vittorie · 14 podi · media 4.5 · giro 01:28.719 Monza) con le QUALI IN SEZIONE A PARTE (richiesta Mauro): la griglia della giornata ha la sua tabella, fuori dalle practice e fuori dal verdetto. NEL WEBUI anche (richiesta: «verdetto anche nel webui»): il pannello Verdetto di giornata nel cruscotto GUI, calcolato da solo al disegno della vista con bottone di ricalcolo — e il disegno della scheda esce da un helper unico (verdettoHtml): un aggregato, un disegno, mai due formule. Test: due sezioni separate nell'ordine giusto (7/7). · 561efd0
- Bandiere ROSSA e NERA nel copilota (flagCode 3 e 6, la stessa fontana del verde — 30/10 notte): «Bandiera rossa!» sul passaggio a rossa e «Bandiera nera: il gioco ti squalifica.» a nera, ordini di pista a qualunque livello (essenziale incluso), prima lettura semina zitta e distanziello di 15 s condiviso tra le due. LA F40 A SORPRESA chiusa per via: il canale auto-evento si ferma FUORI la finestra di 24 h armata dal click «Prepara tutto e divertiti» (state.eventoPreparato scritto da event-prep) — un invito accettato mai preparato è attesa, non una mano che ti cambia il sedile tornando al menu. Protocollo della prova 31/10 in PROVA-COPILOTA §5 (restart con rossa, tagli veri ≤ 2 s, anti-marcia per la nera, grep dei flagCode GREZZI). Tests: 3 nuovi in priorità (accettato senza preparare = silenzio; finestra scaduta = silenzio), narratore 27/27. · 41e6633
- DIARIO DI SVILUPPO (31/10, richiesta Mauro: «crea un diario e una lista di cose da fare o rivedere, ogni giorno ne prendiamo qualcuna»): 8 voci con ID (DA-1…DA-8) con stato, file e criterio di chiusura, registro delle giornate 28–30/10 scritto dai commit — una riga per gesto, ID non riciclati, nessuna voce fantasma; la DA-2 (le bandiere) si chiude proprio qui. · 722e98f
- diario: aggiunta DA-9 stint-plan endurance nel diario di sviluppo · 9348630
- Cruscotto: tessera profilo Paddock (1.0.2) + prova del vuoto · d2e053e
- Tessera del livello anche nell'intestazione della GUI (31/10 sera): paddockLevelBadge(rep) vera col ponte (pd-home profile.level: nome, colore, pct — Fuoriclasse #f5c542 visti in journal reale), stima marcata «~» dalla reputazione della NOSTRA carriera sopra la sola soglia OSSERVATA (490, ferma dai test) quando Paddock non parla, niente chip sotto soglia. Niente doppia verità: la stima non finge il ponte. Pezzi: chip Livello in header (index.html + core.js, clic → Statistiche, traduzione statica IT/EN), campo levelBadge in viewHeader. Test: 2 nuovi nel ponte (13/13) — reale dal journal, soglia 490 bloccata, stima sopra/sotto. Suite 556/556, lint pulita. · d859430
- Stint-plan endurance, PRIMA FETTA della DA-9 (31/10 sera, richiesta Mauro): src/stint-plan.mjs puro — seatStintInputs estrae consumo (media pesata per giri), ritmo (media dei migliori di sessione) e serbatoio OSSERVATO (max FUEL a inizio giro: il gioco non scrive la capacità, solo il vivo la mostra) dalle uscite MoTeC del sedile; stintPlanOf stima giri, stint, litri per sosta e le FINESTRE di sosta (per ciascuna: da a fino a, con centro suggerito). Niente inventate: manca un pezzo → ok:false + reason, la card non promette finestre che i dati non buttano fuori. La riga «Piano stint» entra nella raceCard SOLO delle ronde a tempo (SP ricostruito), calcolata dal webui con memo 120 s per auto|durata. Prova a vista su endurance_gt4 del ladder deposito (sonda in tmp/ fuori dal pacchetto). Test 6/6, suite 562/562, lint pulita su 280 file. · fa0f061
- Stint-plan endurance, SECONDA FETTA della DA-9 (31/10, richiesta Mauro: «copiota annuncia la finestra»): stintStopAlert(plan, lapsDone) in src/stint-plan.mjs — la FINESTRA VIVA (prima sosta ancora raggiungibile, lapsTo 0 = questo giro è la scadenza, finestre scadute saltate, contatore assente → null). Il piano entra nel payload /api/ingegnere (stintPlan + stintAlert, pesante e leggero); il leggero serve SOLO dal cache caldo (caldo:true) — le letture MoTeC a freddo valgono decine di secondi e il tick radio non deve piombarci: chi scalda è il pannello. Narratore n.11 «finestra» in _monitor-copilota.mjs («Finestra sosta k: box entro N giri», alla scadenza «Box entro QUESTO giro», una frase per finestra) + campo nel registro; «finestra» nei livelli essenziale/normale. Pannello piano stint nella vista ingegnere della GUI (viste-a.js): giri, stint, litri, finestre + banner della finestra alla mano — fuori gara a tempo o senza dati NON esce. BUG vero preso dai test: stintPlanOf usava tr SENZA importarlo (ReferenceError a ogni piano) e grazia perduta: import aggiunto e guardia «lapsDone == null → null». Test +6 (stint-plan 9, copilota-narratori +3), suite 568/568. · 0ebafbc
- Diario: DA-9 seconda fetta chiusa — la finestra stint in radio e nella vista (suite 568/568) · 1aa5bc4
- Commenti Italinglish del webui riscritti in italiano vero (area debole del giorno) · 00fcfaa
- Area debole #2: il primo test dedicato di analisi.mjs e frasi corrotte sistemate nei TESTI visibili · a2575a5
- Narratori unificati in una sola copia + scansione MoTeC estratta (31/10) · 862cbcf
- Fabbrica automatica delle griglie + multiclasse di fabbrica, guardie anti-cheat estese (orario e distanza), priorità ronda-vetrina, titoli aggressive della gazzetta e del ladder, pannello Gara al volo in cima alla vista Pratica (build 0.1.43) · 37c762a

- Biome quality-gate (src + gui): nessuna diagnostica ✅


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
