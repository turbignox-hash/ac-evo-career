# Banco A/B — Ferrari 296 GT3 su Monza (carta del 1/11/2026)

**Anche qui l'A/B di SETUP non esiste**: le 25 sessioni della 296 su MonzaGP
portano tutte lo stesso preset (`296gt3_mech`) — un confronto fra SESSIONI,
la serata venerdì 30/10 (17:54) contro l'uscita successiva (18:13).

| Fascia | Sessione | Data | Giri | Best | Preset |
|---|---|---|---|---|---|
| A (base) | `…_Fri Oct 30 175456 2026.ld` | ven 30/10 ore 17:54 | 2 | **1:54.40 (114.4 s)** | 296gt3_mech |
| B (prova) | `…_Fri Oct 30 181305 2026.ld` | ven 30/10 ore 18:13 | 1 | ⚠ **2:13.10 (133.1 s)** | 296gt3_mech |

**⚠ B è un out-lap senza cronometro — il confronto NON tiene.** Perché
l'indagine è qui: [tmp/_sonda-bmonza.mjs](../tmp/_sonda-bmonza.mjs) e
[tmp/_sonda-bmonza2.mjs](../tmp/_sonda-bmonza2.mjs) (sola lettura). Il `.ldx`
di B ha **0 beacon di transito**, quindi il parser gestisce la SESSIONE
INTERA come unico giro ([motec.mjs:180](../src/motec.mjs#L180)): quei
133,10 s sono la durata dell'uscita — dal fermo dei box (0 km/h, gas spinto),
picco 255,5 km/h, **5,45 km su 5,79 percorsi** (chiude a ~94 % del giro) —
non un giro. Il file finisce PRIMA del traguardo. Il best reale della stessa
garage su questa pista è un altro: **1:48.3 nel pomeriggio (29/10 12:29)**
e il record del disco **1:42.6 (29/10 14:31)** — i 133,1 s sono ~25 s
fuori scala, incoerenti con tutto il resto.

## La fascia dei canali (Δ = B − A)

Numeri veri dei file, MA da leggere con l'avviso in testa: la colonna B
misura un out-lap.

| Canale | A (17:54) | B (18:13) | Δ |
|---|---:|---:|---:|
| giro migliore (s) | 114.40 | 133.10 | +18.70 |
| benzina per giro (l) | 3.08 | 3.10 | +0.02 |
| psi a freddo LF | 24.5 | 24.5 | 0.0 |
| psi a caldo LF | 25.9 | 25.2 | −0.7 |
| camber a effetto LF (L−R °C) | 0.5 | 0.3 | −0.2 |
| bumpstop LF % | 14.2 | 13.6 | −0.6 |
| sospensione media LF | −39.5 | −39.6 | −0.1 |
| TC attiva % | 1.6 | 0.1 | −1.5 |
| ABS attiva % | 0.3 | 0.0 | −0.3 |
| slittamento trazione % | 0.8 | 1.5 | +0.7 |
| gas medio giro best % | 73.7 | 68.2 | −5.5 |
| a gas pieno giro best % | 65.8 | 60.6 | −5.2 |
| gas medio sessione % | 70.2 | 68.2 | −2.0 |

(partenza da fermo, evoluzione pista e costanza in frenata: non misurabili —
A non parte da fermo, una sola osservazione per sessione.)

## Il riparto per zone — ARTEFATTO, da non fidare

Il «netto col giro-best» di questa coppia viene **−51,99 s guadagnati da
A** — assurdo, e la meccanica lo dice da sola: allineare un giro vero
distanza-distanza a un out-lap tagliato al 94 % produce un netto senza
senso (perso 12,79 s · «guadagnato» 64,78 s). Le fasce (2,38 s frenata ·
7,02 s uscita · 3,39 s a gas) sono aritmetica esposta a conferma del
difetto, non misura del pilota.

## Verdetto

Il confronto 17:54 vs 18:13 va archiviato come DOCUMENTO DEL DIFETTO, non
come lettura del pilota: il B è l'out-lap studiato oggi e i banchi A/B da
questo in poi lo escludono (l'avviso del modale per un solo giro valido è
già in). La vera lettura della serata: la 296 girava **1:54.4**, mentre nel
pomeriggio dei giorni prima lo stesso giro plebe **1:48.3–1:42.6** — ~12 s
sopra il personale della settimana. Sospetto principale: pista più lenta
di sera (evoluzione non misurabile qui) — DA RIVEDERE col confronto GIUSTO:
**A = 17:54 (30/10) vs B = 29/10 14:31 (1:42.6)**, stessa pista e giri
pieni, per dire DOVE la serata perde.

## Nota tecnica per il banco (difetto nato qui)

L'autopuntamento del banco propose per Ferrari/Monza una coppia DOPPIA
storpio: A = `Wed Apr 15 215138` — file arido da 21 KB senza `.ldx`,
ILEGGIBILE (le copie in blocco del 25/10 lo sono anche a menu) —
e B = l'out-lap delle 18:13. `abPreferite` non filtra le sessioni senza
giri tempestati: così il banco apre sulla coppia peggiore disponibile.
Leva proposta: filtrare all'autopuntamento le sessioni senza giro
tempestato (beacons 0 o file ILEGGIBILE), come già fatto a menu per
l'avviso del giro singolo.

*Carta scritta dai file MoTeC veri di EVO (lettura pura, `setupAB` di
src/analisi.mjs). Targa copiata in gazzetta (news occasionali): vedi
data/news.json.*
