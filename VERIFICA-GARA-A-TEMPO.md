# Verifica guidata — la gara a tempo (la prossima ronda endurance)

La regola del 7/11 fa dichiarare la gara alla carriera: a **giri** confrontando i
giri in palio, a **tempo** confrontando i **minuti** del round con la durata
della sessione viva. La parte a tempo non è mai stata vista in pista (non
esiste una registrazione di una gara a tempo di carriera): questa è la verifica
da fare la prima volta che ne corri una. Dieci minuti, quattro passaggi.

Tutto quello che serve è già nel progetto:

```
node tools/registra-live.mjs          # registra (se non sta già registrando)
node tools/verifica-gara-tempo.mjs    # referto sulla registrazione
```

---

## 1. Prima del via — i minuti della scheda

Nella scheda gara deve esserci la riga **«a TEMPO: N minuti»** (con la distanza
al 50/75% il numero è già scalato). **Scrivi N.** È l'unico numero che conta:
la regola dichiara la gara solo se la sessione viva dura quei minuti.

Poi «Prepara tutto», come sempre: è lui che scrive N nel gioco.

## 2. Appena parte la sessione — il timer del gioco

Guarda il **conto alla rovescia della sessione** nel gioco, nel primo secondo
utile dopo il via:

| Cosa vedi | Cosa significa |
|---|---|
| `N:00` (o N:00 meno qualche secondo: il via costa secondi) | i minuti della carriera sono arrivati al gioco — la regola può funzionare |
| circa `10:00` mentre la scheda dice, per esempio, `20` | **il gioco usa un budget suo**, non i minuti del Prepara tutto: la regola resterà zitta (lato sicuro, nessun falso «gara») ma non potrà mai funzionare. Va scritto nel diario e la strada diventa leggere i minuti dal `gamemodesave` |
| nessun timer, schermata di attesa | sei ancora prima del via: aspetta che parta e guarda di nuovo |

Nota misurata il 6/11: il timer è **vuoto** durante l'attesa e compare pieno al
via. Quindi «nessun timer» all'inizio è normale, non è un difetto.

## 3. In gara — la radio e la scheda

Quello che la regola deve accendere, e che prima taceva:

- **finestra pit** nell'ingegnere (carburante/gomme) durante la gara;
- **«Ultimo giro!»** quando resta un giro. Attenzione: in una gara **a tempo**
  quel dato lo dà il gioco (`player.isLastLap`), non un conto nostro — l'unica
  regola nostra conta i giri compiuti contro i giri in palio, e una gara a tempo
  non ne ha. Quindi qui la dichiarazione garantisce che sei «in gara» (finestra
  pit, scacchi, cronaca), ma se il gioco non alza il flag dell'ultimo giro la
  voce non arriva: è un miglioramento diverso, da fare solo se lo vedi mancare;
- **«Bandiera a scacchi!»** al traguardo;
- **la cronaca** dei fatti in gara (sorpassi, giri, pit);
- scheda **«Sessione»** del Cruscotto: deve dire **Gara** (e il riepilogo di
  fine sessione deve etichettare la sessione «Race», non «TimeAttack»).

Se la radio tace del tutto: `curl -s http://127.0.0.1:8642/api/live` e cerca
`"race":true` nella sessione. Se è `false` mentre sei in pista, la
dichiarazione non è scattata: il referto del punto 4 dice perché.

## 4. A fine gara — il referto

La registrazione sta in `data/live-<data>.ndjson` (la prende il monitor; se
manca, avviala **prima** della gara con `node tools/registra-live.mjs`). Poi:

```
node tools/verifica-gara-tempo.mjs --pista <nome> --minuti N --prova <min> --qualifica <min>
```

Se `state.pending` nel save è ancora quello della gara puoi omettere
`--pista/--minuti`: la scheda viene letta da lì. `--prova` e `--qualifica`
servono a scartare l'ambiguità (se la prova dura quanto la gara, la regola tace
per costruzione e il referto lo dice).

Il referto stampa **le sessioni viste** (pista, giri in palio, durata misurata
dal massimo del timer) e poi uno dei tre esiti:

### ✓ «LA REGOLA DEI MINUTI HA DICHIARATO LA GARA»

Funziona. Controlla le due righe sotto:

- **«Ha fatto scattare: … 0 giri in palio · timer N:00»** — la sessione che ha
  fatto scattare la dichiarazione deve essere quella **a tempo** (0 giri). Se il
  referto dice «ha giri in palio» ha vinto la regola dei giri, non i minuti:
  vuol dire che stai guardando una ronda a giri.
- **la copertura**: sui dati del 6/11 la gara a giri copriva il 47% della
  registrazione (330 campioni su 697). Se una gara a tempo copre meno di un
  terzo, guarda le sessioni: potrebbe essere un'altra sessione con la stessa
  durata, oppure un cambio di stato che ha spezzato la dichiarazione a metà.

### ✗ «NON HA DICHIARATO NIENTE» + la prima condizione che manca

Il referto dice quale delle cinque è caduta:

| Righe del referto | Cosa fare |
|---|---|
| «la sessione ha N giri in palio» | stai guardando la sessione sbagliata (una a giri) con una scheda a tempo |
| «la sessione è su X, la scheda parla di Y» | `--pista` sbagliata, o il `pending` è di un'altra ronda |
| «la sessione dura X′, la scheda dice Y′» | il timer del gioco non usa i minuti della carriera (punto 2): non è un difetto della regola, è una scoperta da annotare |
| «combacia anche con la prova/qualifica (Z′)» | ambiguità vera: servono durate diverse nel weekend perché la regola possa parlare |
| «non riporta mai un timer» | la sessione non è mai partita, o la registrazione è del menu |

### ¬ «ronda a GIRI» — la regola dei minuti non c'entra

Hai passato una scheda a giri (o il `pending` è di una ronda a giri): il referto
verifica comunque la dichiarazione a giri, che è quella collaudata il 6/11.

## 5. Se non funziona — i tre numeri da portarmi

Non serve altro, bastano questi:

1. **i minuti della scheda** (`a TEMPO: N minuti`);
2. **il timer del gioco** al via (foto o numero: `20:00`, `9:59`, …);
3. **il file** `data/live-*.ndjson` di quella gara (la registrazione).

Con quelli il referto si rifà in un minuto e si sa se il colpevole è il gioco
(budget suo), l'ambiguità con prove/qualifiche, o la regola.

---

## Limiti noti, da leggere prima di allarmarsi

- **Prova abbandonata presto**: se lasci una prova con ancora molti minuti sul
  timer e la gara a tempo che segue è **più corta**, la memoria resta quella
  della prova e la gara non viene riconosciuta. Silenzio, non falso «gara».
- **Prova lunga come la gara**: la regola tace per costruzione (non è
  dimostrabile quale sessione sia).
- **Gare a tempo più corte del budget del gioco**: se al punto 2 il timer non è
  N, niente da fare finché non si legge la durata dal `gamemodesave`.
- **Giro d'arrivo a tempo**: l'«ultimo giro» in una gara a tempo non ha un
  numero di giri che lo annunci, quindi dipende dal flag del gioco. Se al
  traguardo arriva «Bandiera a scacchi!» ma non «Ultimo giro!», quello è il
  buco da chiudere (con un conto sul timer), non la dichiarazione: la
  dichiarazione è il motivo per cui le altre due voci parlano.
