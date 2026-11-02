# Post di presentazione — VERSIONE IT

> Scelte fatte sulla tabella R1–R3 (chiude il residuo da montare, 1/11):
> **R1** chiusa — release v0.1.45 esiste, tag sul commit giusto (`6f796e1`) e
> zip caricata come asset su GitHub Releases; main di GitHub al passo.
> **R2** canale scelto: **forum EVO** (tono lungo e tecnico, il pubblico che
> tiene al copilota e ai dettagli). Il taglio corto da subreddit resta
> un'opzione in coda: si può tagliare GIÙ da qui senza riscrivere.
> **R3** apertura: IT da solo; l'English rincoda in un secondo tempo.
>
> Su un forum in testo semplice (senza markdown) le due immagini del fondo
> vanno caricate a mano: i file sono in `docs/screenshots/in-diretta/`
> (cruscotto.png, pitwall.png).

---

## Pitwall (ac-evo-career) — la carriera di EVO si prepara dal desktop, e in pista parla il copilota

Ciao a tutti! In questi mesi ho costruito, tra una gara e l'altra, lo strumento
che volevo per me stesso e che oggi è pronto a girare anche sotto casa vostra:
**Pitwall (`ac-evo-career`)**, la carriera assistita per Assetto Corsa EVO,
gratuita, open source e aggiornata da sola:

**https://github.com/turbignox-hash/ac-evo-career**

L'interfaccia esiste sia in italiano sia in inglese; la copilota, quella,
parla **sempre** italiano.

### Compagno di Paddock, non rivale

Pitwall si tiene **accanto al gioco e accanto a Paddock**: prepara la carriera
dal PC (griglia, setup, pianificazione, statistiche), e dentro EVO attacca
**due app nostre** — il **Cruscotto** (piloti, gare del giorno, serie
iscritte, mini-classifica della ronda, orologio di giornata) e il **Pitwall**
in gioco (radio del copilota in sessione, verdetto di fine giornata, finestra
stint, sincro «Prepara e Divertiti»). Paddock resta il posto comodo per
*leggere* la carriera col gamepad sul divano — e qui ci tengo: da Paddock
abbiamo preso più di un'idea (il ponte ai journal `pd-*.json`, il match
graduale dei nomi auto, il bonus gara pulita e il tetto reputazione); eccone
una versione che, per progetto, **agisce** sul gioco invece di limitarsi
a guardarla.

### «Pools sorteggiati a sorte dal catalogo · seed · cap 20%» (Campionati)

I campionati non sono un elenco chiuso: sono **cinque livelli** (da «Epoca»
a «Corsa») nati da un **sorteggio riproducibile** dentro il catalogo del
gioco. La GUI ti mostra il **seed** (es. `819802402`): stesso seed, stessa
tiratura — serie **mono marca**, **multiclasse** e multiclasse con
**zavorre e penalità automatiche** calcolate dal ΔPI (non a occhio: cap
dichiarato 20%, e ricalibrate pista per pista sui risultati veri dal
griglia-calib). Un seed nuovo tira un miscuglio tutto suo: stradali, Cup, GT
e epiche battute insieme allo stesso livello. Il pannello dei Pools sorteggiati
si legge a colpo d'occhio: seed, pool sorteggiato, quadro zavorre col tag cap
e calendario — tutto cliccabile.

### Tutto è cliccabile, stile Football Manager

Dal 31/10 in poi ogni riferimento apre la sua scheda: il nome di un'auto apre
la **scheda del Libro delle auto** (la ricerca per parole capisce «Evo II»
anche se il render si chiama «Evolution II»), di un pilota il **dossier
rivale**, di una pista il **libro piste**, di una serie il tab **Campionati**;
e sul righello le voci di data, cassa, rep e stagione saltano al tab giusto.

### I nomi dei piloti sono editabili

Da qualunque scheda ricorrente (Mondiale in Campionati, dossier rivale) il
bottone **✏️ Rinomina** mette il soprannome tuo al posto del nome dell'AI:
il save con le storie reali resta intatto e il soprannome vale su tutte le
schermate (schede, statistiche, classifiche). I **Soprannomi in blocco**
aggiustano un'intera griglia in una schermata sola.

### La copilota parla sempre italiano

Durante la sessione il copilota vi detta **in italiano** (anche con l'UI in
inglese): delta, rimanenti di benzina, metà gara, meteo — a voce, niente da
leggere mentre guidate. Sul Cruscotto c'è la chip **«♪ prova»** per sentirlo
subito, senza partire in pista.

### La griglia che scrive davvero nel gioco

Qui sta la differenza: Pitwall non legge solo la carriera, **la costruisce**.
Sceglie le AI, le mette in macchina (match graduale ESATTA → CONTIENE →
PAROLE → ALIAS), applica zavorre per traccia calcolate dai risultati veri e
prepara i **customgrid** dei weekend di gara che EVO poi carica da solo.
Ogni scrittura va **dopo** backup e verifica: prima si copia e si controlla,
poi il gioco legge il result.

### Il meccanico fa sparire il «che pressione metto?»

Dalla telemetria dei **TUOI** giri il meccanico consiglia pressioni, aero e
benzina, mostra l'**anteprima** e scrive il `.carsetup` — che EVO accetta
**a caldo, senza riavvio** (l'estrai in CARICA). E per partire su una pista
nuova c'è il **🌉 ponte tra piste**: il base setup dell'auto si copia nella
pista dove quell'auto non era mai stata, in un gesto dal quadro garage.

### Sicurezza del save, sonni tranquilli

Backup automatico del save di EVO **prima di ogni import**, registro
anti-doppioni (lo stesso file non paga due volte), verifica d'integrità della
carriera con riparazioni sicure, e rassegna di fine stagione esportabile.

### Giri liberi con libro PB

Ogni sessione di pratica che EVO scrive si registra da sola: **libro PB per
auto × pista** e giro ideale sommato dai settori migliori di sempre.

### Installazione a un file

`installa.cmd` e il gioco è fatto: la release con lo zip dell'ultima build è
su GitHub ([v0.1.45](https://github.com/turbignox-hash/ac-evo-career/releases/tag/v0.1.45),
697 test in sandbox verdi), e da sola l'app si tiene aggiornata: la barra
«Aggiorna ora» scarica, gira i test e non tocca il tuo save. Tutto open
source, zero abbonamenti.

---

Fotogrammi della v0.1.45 — due **anteprime dell'interfaccia, rese fuori dal
gioco sul server vero** (il bordo «engine non disponibile» della prima lo
dichiara: in gioco non compare):

![Cruscotto — registro cambio auto, consigli dal box, «Prepara e Divertiti»](docs/screenshots/in-diretta/cruscotto.png)

![Pitwall — radio del copilota viva in sessione, ronda armata col via automatico](docs/screenshots/in-diretta/pitwall.png)

---

Grazie per l'attenzione — provato? Inciampato su un angolo che non va?
Fatelo sapere pure qui, o su GitHub issues.
