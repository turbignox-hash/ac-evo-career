# Proposta — marcatori per le viste nascoste e le schermate da modale (3/11/2026)

Richiesta di Mauro: «controlla se altre viste nascoste o leggere da modali
meritano un marcatore, e proponili». Qui non c'è nessuna modifica al codice:
c'è l'inventario, la misura, e la lista delle proposte in ordine di merito.
Sonda di prova (uso e getta, in `tmp/`, gitignored):
[tmp/_sonda-modali.mjs](../tmp/_sonda-modali.mjs).

---

## 1. Viste nascoste: non ce ne sono altre

La guardia di layout copre oggi **21 tab**: i 19 della nav e i due senza
bottone (Calendario `#cal-titolo`, Classifica Mondiale `#mondo-vetrina`).
Il controllo è stato fatto sull'unico posto che decide davvero cosa è una
vista — il dispatcher di `render()` in [gui/js/core.js](../gui/js/core.js#L463-L483):

```
dashboard · agenda · rivals · analisi · championships · calendar · standings
tracks · cars · garage · archive · online · gironi · stats · banca · import
griglia · setup · difficulty · messages · settings
```

**Ventuno id, nessuno fuori lista.** `calendar` e `standings` sono gli unici
due non presenti né in `TABS` né in `NAV_GROUPS`: sono già coperti. Il terzo
colore orfano in `TAB_COLORS` (`catalog`) non è una vista, è un'icona rimasta
dalla fusione con Auto — nessun `tab === 'catalog'` esiste.

**Conclusione: sui tab nascosti la risposta è «niente da aggiungere».**

---

## 2. Le schermate che vivono solo dentro una modale

Non passano dalla guardia perché la sonda misura `#main *` e loro nascono in
`#modal-root` (o appese al `<body>`). Inventario di chi le apre:

| Schermata | Dove nasce | Come si apre (leva vera) |
| --- | --- | --- |
| Scheda pilota | `viste-b.js:560` `showWorldPilot` | click su una riga `.wr-row` della Classifica |
| Scheda auto | `viste-c.js:210` `carDetail` | click su `#cars-grid .car-click` |
| Scheda rivale | `viste-d.js:792` `showRival` | click su `tr.rival-link` |
| Dossier del rivale | `viste-d.js:820` `openDossier` | scheda rivale → bottone «📄 Dossier completo» |
| Soprannomi in blocco | `viste-d.js:746` `bulkRinomina` | `#b-bulk-rn` in Rivali |
| Scheda gara (modale) | `viste-b.js:332` `raceCardModal` | click su `.ag-card` in Agenda |
| Volante scheda gara | `viste-b.js:256` `agPopHover` | **hover** su `.ag-card` → `.ag-pop` nel body |
| Classificazione gara | `viste-b.js:1123` `openResult` | click su `tr.arc-row` (Archivio/Online) |
| Rapporto gara Discord | `viste-b.js:1134` `apriRapporto` | Classificazione → «⚡ Rapporto Discord» |
| Banco A/B | `viste-analisi.js:203` `renderAB` | Analisi → «Confronta» (`#ab-go`) |
| Rassegna di stagione | `viste-a.js:366` `showReview` | tile `#b-review` nel Cruscotto |
| Gazzetta di stagione | `viste-a.js:391` `showGazzetta` | tile `#b-gazzetta` nel Cruscotto |
| Verifica integrità | `viste-a.js:357` (`#b-integrity-quick`) | bottone in Cruscotto |
| Cercatore su disco | `viste-d.js:263` `pathPicker` | Impostazioni → wizard |
| Firma sponsor | `viste-d.js:200` (`sponsor-sign`) | Messaggi |
| Firma dell'offerta | `viste-d.js:251` | Messaggi |

---

## 3. La misura (256 · 320 · 480 px)

Ogni caso è stato aperto con la sua leva viva e misurato alla geometria
reale, con le stesse leggi della sonda condivisa (figure e `aria-hidden`
esclusi, ritaglio dell'antenato scorrevole, inline misurati a righe).

| Schermata | Riquadro | Scorre in orizzontale | Sovrapposizioni |
| --- | --- | --- | --- |
| Scheda pilota | dentro | — | — |
| Scheda auto | dentro | — | — |
| Scheda rivale | dentro | 144 / 80 / — px | — |
| Dossier del rivale | dentro | 309 / 245 / 85 px | — |
| **Soprannomi in blocco** | dentro | 40 / — / — px | **5 · 5 · —** |
| Scheda gara (modale) | dentro | 4 / — / — px | — |
| **Volante `.ag-pop`** | dentro | **366 / 308 / 162 px** | — |
| **Classificazione gara** | dentro | **288 / 224 / 64 px** | — |
| Gazzetta di stagione | dentro | — | — |
| Cercatore su disco | dentro | — | — |

(Riquadro = `.modal` o `.ag-pop` contro la viewport; tre numeri = 256, 320, 480.)

**Il difetto vero è uno solo.** In «Soprannomi in blocco» a 256 e 320 px
l'input del soprannome (`width:200px` **fisso**) scavalca il nome del pilota,
che ha `flex:1;min-width:0` e quindi si riduce a zero: cinque righe su N hanno
`b ⟂ input` con 21–37 px di aria in comune, sempre a 6 px di altezza (la riga
testo del nome sotto la casella). A 480 sparisce. È il tipo di difetto che la
guardia esiste per vedere, e oggi non lo vede.

**Nessuna modale esce dalla viewport**, in nessuna delle tre larghezze:
`max-width:560px` + `padding:20px` del fondale le tengono dentro anche a 256.
Quindi una legge «riquadro dentro la viewport» sarebbe verde da subito (utile
come rete, non come caccia).

**Gli scorrimenti orizzontali interni** sono un'altra cosa: classificazione,
volante e tabelle del dossier hanno contenuto più largo della scheda e
`overflow:auto` glielo fa scorrere dentro. Non è una sovrapposizione, ed è in
parte voluto (le tabelle del dossier hanno un tetto di altezza e scorrono).
Ma il volante della scheda gara perde **366 px** di contenuto a 256: su un
riquadro che si legge col mouse, metà della scheda è invisibile.

---

## 4. Le proposte, in ordine di merito

### 4.1 Soprannomi in blocco — il primo da mettere sotto guardia

- **Marcatore:** non serve crearne uno, `#br-list` esiste già ed è unico.
- **Leva:** `#b-bulk-rn` (clic in Rivali).
- **Legge:** sovrapposizioni dentro `#modal-root`.
- **Esito di oggi:** **ROSSO** (5 coppie a 256 e 320). Andrebbe sistemato il
  CSS: `width:200px` → `width:min(200px,100%)` (o `flex:0 1 200px;min-width:0`)
  sulla casella di `bulkRinomina`.
- **Costo:** 3 misure (le tre larghezze strette), ~1 s.

### 4.2 Classificazione gara — la più densa, oggi senza nessun id

- **Marcatore:** da creare, `#cls-tavola` sulla `<table>` della classificazione.
- **Leva:** click su `tr.arc-row`.
- **Legge:** sovrapposizioni (oggi verde) + il numero di scorrimento
  **dichiarato** in un budget: a 256 scorre di 288 px, e va bene che scorra —
  otto colonne di tempi non entrano in 236 px — ma il numero deve stare scritto,
  così se un giorno diventa 400 lo vede la guardia.
- **Trappola:** la cartella dati del test nasce vuota (il save si copia, i
  `Results` no). Il caso va aperto solo dopo aver copiato **un** file
  `.sessionresults.json` vero nella cartella temporanea (sola lettura dalla
  cartella del gioco), altrimenti l'archivio è vuoto e la guardia deve
  dichiararsi skip, non verde.
- **Costo:** 3 misure, ~1,5 s (il `result-detail` è la chiamata più lenta).

### 4.3 Volante della scheda gara (`.ag-pop`) — il più caro di contenuto

- **Marcatore:** da creare, `id="ag-pop-card"` sul nodo che `agPopHover` crea
  nel `<body>` (oggi ha solo la classe `.ag-pop`).
- **Leva:** `page.hover('.ag-card')` — stessa leva del mouse vero.
- **Legge:** sovrapposizioni + riquadro dentro la viewport. **Non** una legge
  «zero scorrimento»: 366/308/162 px sono il suo stato attuale, e chiuderli
  vuol dire rifare il corpo della scheda (le righe del calendario hanno
  `min-width` fissi). Prima si misura, poi si decide.
- **Costo:** 3 misure, ~1 s.
- **Nota:** è nel `<body>`, non in `#modal-root`: la sonda deve poter cambiare
  radice, non solo aggiungere un caso.

### 4.4 Dossier del rivale — il più profondo, il meno urgente

- **Marcatore:** da creare, `#dz-scheda` sul primo contenitore del dossier.
- **Leva:** Rivali → riga → «📄 Dossier completo» (due chiamate).
- **Legge:** sovrapposizioni. Lo scorrimento interno (309/245/85) è **voluto**
  (`max-height` + `overflow:auto` su due tabelle) e non va stretto.
- **Costo:** 3 misure, ~1,5 s (due `api` in fila).

### Non proposte (e perché)

- **Scheda pilota, scheda auto, gazzetta, cercatore su disco, scheda gara
  modale:** misurate pulite a tutte e tre le larghezze. Metterle sotto guardia
  aggiunge tempo e zero protezione oggi; se un giorno cambiano, la prima
  modale rotta si porta dentro il caso suo.
- **Rapporto gara Discord, Banco A/B, Rassegna di stagione:** non misurate.
  Servono dati che la cartella dati del test non ha (un rapporto composto, due
  sessioni in A/B, una stagione chiusa). Restano candidate di seconda ondata,
  non «pulite».

---

## 5. Cosa serve costruire (e quanto costa)

Oggi [test/_layout-probe.mjs](../test/_layout-probe.mjs) ha `#main *`
scritto dentro la misura in tre punti e `assettaVista` che aspetta i `.panel`
di `#main`. Per le modali servono due pezzi, nessuna legge nuova:

1. **`scope` nella misura** (default `'#main'`): `misuraSovrapposizioni(page, { scope })`
   e `misuraPanelliFuoriViewport` → `#modal-root` o `.ag-pop`. La legge resta
   identica al pixel.
2. **`assettaModale(page, { apri, marker })`**: esegue la leva (click o
   `evaluate`), aspetta `#modal-root .modal` **e** il marcatore, poi la
   stabilizzazione generica — la stessa dei tab.

**Costo in tempo (stima, sulle misure contate):** la guardia oggi fa **126
misure** (21 tab × 6 larghezze: 256 · 320 · 360 · 480 · 1250 · 1920) in **35,5
s** cronometrati su una passata sola. Le 4 proposte alle sole tre larghezze
strette sono **12 misure** in più, ≈ **+3,4 s** se il costo per misura resta
quello attuale (0,28 s). A tutte e sei le larghezze: 24 misure, ≈ +7 s.

---

## 6. Limiti di questa misura

- Una macchina, un save, un giro: i numeri sono lo stato di oggi, non una
  legge della fisica. Le sovrapposizioni però sono binarie (ci sono o no) e
  quelle sì sono un fatto.
- Le larghezze provate sono le tre sotto i 500 px: a 1250 e 1920 il contenuto
  delle modali sta larghissimo (la scheda ha `max-width:560`), non c'è niente
  da scoprire lì.
- Il contenuto dipende dal save: con un'altra carriera il Dossier può avere
  zero scontri e la Classificazione una gara diversa. I casi proposti devono
  quindi **aspettare il marcatore**, non contare le righe.
- `#br-list` è un id che vive solo nella modale dei soprannomi, ma **non è
  stato messo lì per la guardia**: se un giorno quella lista cambia nome, il
  caso si rompe in silenzio. Se si adotta, va annotato nel commento del test
  come i marcatori dei tab.
