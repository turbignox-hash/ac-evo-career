# Post di presentazione — VERSIONE FORUM LUNGO (tono tecnico)

> Montato sul verdetto DA-8 (1/11): le 11 claim vive della bozza,
> dichiarate per come vivono nel codice — niente di più. Il canale è il
> forum EVO (scelta R2), apertura IT (scelta R3): per il taglio corto da
> subreddit c'è già POST-PRESENTAZIONE-IT.md, da qui si taglia GIÙ senza
> riscrivere. I nomi degli schermi sono i VERI nomi della GUI («Pools
> sorteggiati a sorte dal catalogo · seed · cap 20%», non «Campionati a
> miscuglio», come impone il verdetto claim n.1).
>
> Nota forum: in testo semplice le due immagini in fondo si caricano a
> mano; i file sono in `docs/screenshots/in-diretta/cruscotto.png` e
> `docs/screenshots/in-diretta/pitwall.png`.

---

## Pitwall (ac-evo-career) — la carriera di EVO si prepara dal desktop, e in pista parla il copilota

Ciao a tutti. Presento lo strumento che ho costruito tra una gara e
l'altra per la mia carriera su EVO e che oggi gira anche da voi:
**Pitwall (`ac-evo-career`)**, la carriera assistita per Assetto Corsa
EVO — gratuita, open source, senza abbonamenti, e si aggiorna da sola:

**https://github.com/turbignox-hash/ac-evo-career**

Due parole su dove sta, prima dei dettagli, perché la domanda che torna
sempre è la stessa: «ma invece di X?».

### Dove sta: dentro e fuori dal gioco

Pitwall si tiene **accanto al gioco**: prepara la carriera dal desktop —
griglia, setup, automazioni di preparazione — e staffetta con te durante
il weekend.

E dentro EVO, oggi, girano **due app nostre**:
E dentro EVO, oggi, girano **due app nostre** accanto alle altre:

- il **Cruscotto**: piloti, gare del giorno, serie iscritte,
  mini-classifica della ronda corrente (col link al Mondiale della GUI)
  e orologio di giornata;
- il **Pitwall in gioco**: la radio del copilota durante la sessione, il
  verdetto di fine giornata, la finestra stint in corsa e la sincro
  «Prepara e Divertiti».

Entrambe si installano in
`Saved Games\ACE\mods\uiresources\ACEUIAppLoader` e girano col loader
che già conoscete, leggendo le stesse fonti del gioco (Results, telemetria, journal) senza scrivere nulla che il gioco non si
aspetti.

---

## Come è fatto dentro (per chi chiede i dettagli)

Una codebase Node.js, tre superfici:

1. **CLI** (`ac-evo-career.mjs`): import dei Results, preparazione del
   weekend, manutenzione del save, guardie e diagnostica — tutto ciò che
   fa il desktop lo fa anche da terminale.
2. **GUI web** servita in locale sul PC (browser, niente cloud): la
   carriera si legge e si comanda da lì — campionati, griglie, garage,
   meccanico, statistiche, analisi.
3. **Le due app in gioco** (Cruscotto e Pitwall), che parlano con un
   piccolo publisher locale: le fasce che leggono vengono riscritte in
   modo atomico dal server, e un battito della guardia dice se il
   watcher del dizionario auto è vivo e cosa ha imparato.

Nessun account obbligatorio, nessun dato inviato fuori dal PC: le fonti
sono i file di EVO in `Saved Games` (Results, sessioni MoTeC, journal
journal del gioco, ui_storage) e basta quello.

---

## Le claim, una a una — e come vivono nel codice

### 1. Campionati procedurali — «Pools sorteggiati a sorte dal catalogo · seed · cap 20%»

I campionati non sono un elenco chiuso scritto a mano: sono **cinque
livelli** (da «Epoca» a «Corsa») nati da un **sorteggio con seme
riproducibile** dentro il catalogo del gioco. Il seed (es. `819802402`)
riproduce la STESSA tiratura; un seed nuovo tira un miscuglio tutto suo
— stradali, Cup, GT e epiche battute insieme allo stesso livello. Serie
**mono marca**, **multiclasse**, e multiclasse con **zavorre e penalità
automatiche** calcolate dal ΔPI (non a occhio: cap dichiarato 20%) e
**ricalibrate pista per pista** sui risultati veri (griglia-calib). Il
pannello dei Pools sorteggiati ti mostra seed, pool sorteggiato, quadro
zavorre col tag cap e calendario — tutto cliccabile.

### 2. La griglia che scrive davvero nel gioco

Qui sta la differenza col «leggere solo»: Pitwall **costruisce** la
griglia. Sceglie le AI, le mette in macchina con il match graduale
**ESATTA → CONTIENE → PAROLE → ALIAS** (i nomi di render non combaciano
mai alla lettera col nome ufficiale: la catena li risolve per gradi),
applica zavorre per traccia dal dato reale e prepara i **customgrid**
dei weekend di gara che EVO poi carica da solo. Ogni scrittura va
**dopo** backup e verifica: prima si copia il file e si controlla che ci
sia, poi il gioco legge. Il weekend lo prepara il preparatutto («Prepara
tutto»), con le ore di sessione, il meteo e la griglia già dentro.

### 3. Tutto è cliccabile, stile Football Manager

Ogni riferimento apre la sua scheda: il nome di un'auto apre la **scheda
del Libro delle auto** (ricerca per parole: capisce «Evo II» anche se il
render si chiama «Evolution II»), un pilota apre il **dossier rivale**,
una pista il **libro piste**, una serie il tab **Campionati**; sul
righello le voci di data, cassa, rep e stagione saltano al tab giusto.

### 4. I nomi dei piloti sono editabili (e in blocco)

Da qualunque scheda ricorrente — Mondiale in Campionati, dossier
rivale — il bottone **✏️ Rinomina** mette il soprannome tuo al posto del
nome dell'AI: il save con le storie reali resta INTATTO, e il
soprannome vale su tutte le schermate (schede, statistiche,
classifiche). I **Soprannomi in blocco** aggiustano un'intera griglia in
una schermata sola.

### 5. La copilota parla sempre italiano — anche in pista

Durante la sessione il copilota detta **in italiano** (anche con l'UI in
inglese): delta, benzina per giri, metà gara, meteo — a VOCE, niente da
leggere mentre guidi. Sul Cruscotto c'è la chip **«♪ prova»** per
sentirlo senza partire in pista. La stessa radio vive nel Pitwall dentro
il gioco.

### 6. Il meccanico prepara il file, tu lo carichi

Dalla telemetria dei **TUOI** giri (sessioni MoTeC del sedile) il
meccanico consiglia pressioni, aero e benzina, mostra l'**anteprima** e
scrive il `.carsetup`, che EVO accetta **a caldo, senza riavvio**. Per
partire su una pista nuova c'è il **🌉 ponte tra piste**: il base setup
dell'auto si copia NELLA pista dove quell'auto non era mai stata, dal
quadro «Tutto il garage» (con menù di sorgente se ne hai più di una, e
mai sovrascritture: dove il nome esiste già, il nuovo arriva come
« (2)»). Per l'endurance, la scheda gara porta il **⛽ Piano stint**
pre-gara — finestre di sosta e litri per stint calcolati da consumo e
serbatoio OSSERVATI sul sedile — e in sessione l'Ingegnere LIVE annuncia
la finestra con il conto dei giri.

### 7. Bilanciamento con le classi giuste + Mondiale skill-based

Le zavorre per traccia restano **rare e leggere** (proposte automatiche
dai risultati reali: «questa auto scappa di X sec: +Y%»), l'economia si
legge a colpo d'occhio in Statistiche (€/gara e rep/gara per stagione) e
il **Mondiale** è skill-based, coi piloti iconici e la FORMA che sale e
scende coi risultati veri.

### 8. Sicurezza del save, sonni tranquilli

Backup automatico del save di EVO **prima di ogni import**, registro
**anti-doppioni** (lo stesso file NON paga due volte), verifica
d'integrità della carriera con riparazioni guidate, e **rassegna di fine
stagione** esportabile. E le guardie valgono anche per il futuro: le
scritte del calendario (meteo, ore, durata) passano SOLO dal
preparatutto — le vie manuali fuori modalità test si fermano col
cancello, così la gara si corre COME dice il calendario.

### 9. Giri liberi con libro PB

Ogni sessione di pratica che EVO scrive si registra da sola: **libro PB
per auto × pista**, con il giro ideale sommato dai migliori settori di
sempre. Niente fogli a mano dopo il testday.

### 10. Installazione a un file, aggiornamenti da soli

`installa.cmd` e si gioca. La release con lo zip è su GitHub
([v0.1.45](https://github.com/turbignox-hash/ac-evo-career/releases/tag/v0.1.45)),
e la barra **«Aggiorna ora»** della GUI scarica, gira la suite di test e
non tocca il tuo save (merge, niente overwrite). Tutto open source: il
banco di test del progetto oggi gira **895/895 verdi**.

### 11. Il dizionario auto che impara da solo

Aggiunta degli ultimi giorni: il dizionario guida↔auto che serve alla
griglia si riempie SOLO dai file del gioco — i log di sessione, la
ui_storage (le skin toccate nel menù) e le iscrizioni del gioco — e una
guardia lo rinfresca a ogni giro del watcher mentre giochi,
correggendo anche le etichette sbagliate («Mazda Mazda MX-5» → «Mazda
MX-5»). Risultato pratico: la prima volta dentro una serie nuova,
l'auto della serie si impara da sola alla prima sessione, e il «Prepara
tutto» del giro dopo la seleziona da solo.

---

## Cosa NON facciamo (onestà)

- **Non viviamo al posto del gioco**: niente patch binarie, niente
  overlay sul rendering, niente di ciò che può andare in conflitto col
  gioco. Leggiamo e scriviamo SOLO file che EVO già usa, con backup e
  verifica prima di ogni scrittura.
- Il fotogramma dell'app «dentro il menù di EVO» è ancora da fotografare
  col gioco aperto: le due immagini sotto sono rese fuori dal gioco sul
  server vero (segnaposto dichiarati) — il bordo «🤖 engine non
  disponibile» della prima lo dice, e in gioco NON compare.

---

## Le foto

Due fotogrammi dell'interfaccia, per ora resi fuori dal gioco sul server
vero: il Cruscotto con registro cambio auto, consigli dal box e «Prepara
e Divertiti»; il Pitwall con la radio del copilota viva in sessione
(«box chiuso: fuori dal pitlane», benzina per giri) e la ronda armata
col via automatico.

![Cruscotto — registro cambio auto, consigli dal box, «Prepara e Divertiti»](docs/screenshots/in-diretta/cruscotto.png)

![Pitwall — radio del copilota viva in sessione, ronda armata col via automatico](docs/screenshots/in-diretta/pitwall.png)

---

Grazie per l'attenzione. Provato? Inciampato su un angolo che non va, o
sul dizionario che non impara la tua auto? Fatelo sapere qui o su GitHub
issues — e se vi piace, una stella sul repo è il complimento giusto al
meccanico.
