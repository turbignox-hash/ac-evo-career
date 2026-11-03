# Banco A/B — Ferrari 296 GT3 su Monza (carta del 3/11/2026) — IL CONFRONTO GIUSTO

La coppia chiesta dal verdetto del 1/11: **A = ven 30/10 17:54 (la serata) vs
B = gio 29/10 14:31 (1:42.6, il record del disco)**. Coppia VALIDA, questa
volta: entrambe con 2 giri pieni cronometrati, stesso preset
(`296gt3_mech`), stesso banco, e la legge dei 0 beacon (senza-giri) non
rileva voci morte in nessuna delle due — niente out-lap qui. I numeri sono
di sonda a lettura pura:
[tmp/_prova-banco-monza-serata.mjs](../tmp/_prova-banco-monza-serata.mjs)
(`setupAB` di [src/analisi.mjs](../src/analisi.mjs)).

| Fascia | Sessione | Data | Giri validi | Best | Preset |
|---|---|---|---|---|---|
| A (serata) | `…_Fri Oct 30 175456 2026.ld` | ven 30/10 ore 17:54 | 2 | **1:54.4** | 296gt3_mech |
| B (record) | `…_Thu Oct 29 143107 2026.ld` | gio 29/10 ore 14:31 | 2 | **1:42.6** | 296gt3_mech |

**Δ best = −11.8 s**: la serata perde quasi 12 secondi col giro-best. Qui
sotto, gli indizi veri per dire DOVE.

## La fascia dei canali (Δ = B − A)

| Canale | A (17:54 serata) | B (14:31 record) | Δ |
|---|---:|---:|---:|
| giro migliore (s) | 114.40 | 102.60 | **−11.80** |
| benzina per giro (l) | 3.08 | 3.01 | −0.07 |
| psi a freddo LF | 24.5 | 24.4 | −0.05 |
| psi a caldo LF | 25.9 | 26.0 | +0.05 |
| camber a effetto LF (L−R °C) | 0.5 | 0.4 | −0.1 |
| bumpstop LF % | 14.2 | 15.6 | +1.4 |
| sospensione media LF | −39.5 | −39.2 | +0.3 |
| TC attiva % | 1.6 | 0.5 | **−1.1** |
| ABS attiva % | 0.3 | 0.5 | +0.2 |
| slittamento trazione % | 0.8 | 0.7 | −0.1 |
| **gas medio giro best %** | **73.7** | **80.3** | **+6.6** |
| **a gas pieno giro best %** | **65.8** | **73.5** | **+7.7** |
| gas medio sessione % | 70.2 | 68.8 | −1.4 |

(partenza da fermo ed evoluzione pista: non misurabili — A non parte da
fermo, come già annotato nella carta del 1/11.)

Letta la fascia: **pressioni freddo/caldo e camber combaciano** (non è
una storia di gomme o di inflazione: 24.5 vs 24.4 freddo, 25.9 vs 26.0
caldo), **benzina a giro paragonabile** — e la **frenata non racconta
niente**: la costanza in frenata di A non produce zone «calde» (nessuna
staccata che cambia giro per giro), quindi **la matita non è il colpo**.
Il colpo sta nel GAS: la serata apre **6.6 punti di gas in meno sul giro
best** (73.7% vs 80.3%) e **7.7 punti in meno a gas pieno** (65.8% vs
73.5%), col tasto di trazione che porta il doppio dell'assistenza del
record (TC 1.6% vs 0.5%). Cioè: dove il record tiene il piede giù e
frena tardi per tenersi in gas, la serata toglie gas prima e più a
lungo — è questione di CONFIANZA nel piede, non di auto o gomme.

## Dove lungo il giro: NON MISURABILE in onestà con questa coppia

Il riparto per zone del banco (frenata 2.50 s · uscita 8.01 s · gas
8.12 s, «dominante a gas pieno») e il quadro-zone (fette grandi: uscita
+3.56 s a 15.7–17.0%, gas +4.56 s a 17.0–25.6%…) sono qui un
**ARTEFATTO DI ALLINEAMENTO**, e la prova è aritmetica:

- la somma Σdt/vB sulle fette di A dà **114.14 s** mentre il tempo
  atteso del record scalato alla distanza di A (T_B·D_A/D_B) è
  **103.17 s** — scarto **10.97 s**, quasi l'intero Δ (−11.8 s) in specchio;
- l'errore medio banda a banda tra i due profili di velocità è di
  **55.6 km/h** a offset zero, e NESSUNO sfasamento fino al ±30% del
  giro lo riduce (best cross-correlazione: errore 76.3 km/h);
- nello STESSO file B il secondo giro valido (1:43.6) si allinea coi
  profili di A a **14.8 km/h di errore medio** (scarto 3.46 s) —
  quindi il difetto è del GIRO-RECORD (1:42.6), non del banco nel suo
  insieme.

Sospetto principale: **wrap del canale distanza al traguardo** nel
giro-record — il giro attraversa lo start/finish a metà campionamento,
il canale distanza riparte da 0 e il mappaggio distanza→frazione-campo
dei [src/motec.mjs](../src/motec.mjs) lo gestisce male (il record copre
5.725 km dichiarati mentre il suo giro gemello nello stesso file copre
5.760 km, e le sezioni ad alta velocità del record si materializzano
sbagliate lungo la mappa). Il riparto e le fette del banco con
questo B mischiano sezioni diverse del tracciato: le cifre paiono
plausibili zona per zona MA non discriminano dove si perde davvero.

## Verdetto

**La serata perde ~12 s nel GAS, non in frenata né nelle gomme.** Le
pressioni e il camber combaciano, la costanza in frenata è pulita e le
zone «calde» non esistono; il manometro del gas è l'unico canale che si
si muove netto in favore del record (−6.6 a giro best, −7.7 a
gas pieno, TC a metà). L'indirizzo a rileggere: per il DOVE lungo il
giro serve prima sistemare il mapping del giro-record (difetto scritto
sotto) — fino ad allora le fette di questa coppia vanno lette come
artefatto, non come diagnosi del piede.

## Difetto da registro (nato ora, da non perdere)

Il riparto/quadro della coppia col giro-record è andato in errore silenzioso
per due strati:

1. **il mapaggio distanza→frazione del giro-record (1:42.6) è
   distorto** — profili non allineabili (55.6 km/h di errore medio, e
   nessuna sfasatura che li risolva) mentre lo stesso file ha un secondo
   giro che si allinea; sospetto wrap del canale distanza al passaggio
   start/finish;
2. **il registro quadroZoneCheck non si accorge di niente**, perché
   striscia e banco valgono la STESSA mappa sbagliata (stesso `xs`
   dell'A): il guard confronta due implementazioni dello stesso conto
   e verde non corri. Serve una guardia di allineamento: Σdt/vB vs
   T_B·(D_A/D_B) come scarto (tolleranza ~0.5 s) a `setupAB` /
   `zoneTimeline` — con questa coppia avrebbe gridato 10.97 s.

*Carta scritta dai file MoTeC veri di EVO (lettura pura, `setupAB` +
`zoneTimeline` di src/analisi.mjs, sondes sola lettura in
tmp/_prova-banco-monza-serata.mjs).*
