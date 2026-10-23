# Garage: il catalogo prezzi e le FAQ per chi compra

Documentazione per chi usa il pannello **Garage** del tool. Tutto quello che
segue descrive il comportamento **reale** del codice (`src/garage.mjs`,
`src/cars.mjs`): se qualcosa diverge da questo testo, è un bug e va segnalato
col link «Segnala un problema» nella barra laterale del tool.

---

## Il catalogo prezzi, spiegato semplice

**Dove sta il prezzo.** Il tool non inventa cifre: per ogni auto c'è un
**prezzo reale indicativo** conservato in `data/car-prices.json` (79 auto al
giorno di questo testo). Dentro ci sono:

- il **listino nuovo** per le auto moderne (KTM X-Bow GT2 ~294.000 € netti,
  Alfa Romeo Giulia GTAm 110.000 €…);
- il **mercato delle classiche** per i pezzi storici (Alfa 75 Turbo Evo
  65.000 €, Abarth 695 Biposto 40.000 €…);
- i **costi di gara** per le racing, da listini e piani d'acquisto
  (Alfa Romeo Junior 48.500 €, Academy ~47.000 € pacchetto completo).

Valori **0 o assenti → auto non in commercio** (es. F1): non si possono
comprare, a nessun prezzo.

**Come il tool trova il prezzo dell'auto tua.** I nomi delle auto nel gioco
non combaciano mai perfettamente con quelli del catalogo ("Mazda MX-5 ND Cup"
vs "Mazda MX5 ND Cup (2017)"). Il tool toglie spazi e punteggiatura, ignora
l'anno in coda, usa **alias fatti a mano** per i casi ostici e infine prova
col **prefisso** (almeno 8 lettere in comune): così trovi quasi sempre il
prezzo giusto senza dover conoscere i nomi interni.

**Le vittorie non passano dalla cassa.** Le auto **vinte** negli eventi
speciali arrivano da sole nel garage (dalla vetrina eventi, una volta sola)
e **non costano nulla**: il premio è quello. Le **comprate**, invece, pagano
il **listino pieno** alla cassa e lasciano traccia nel registro dei flussi
(`data/flows.jsonl`, voce «acquisto … (prezzo di listino)»).

**Se il prezzo non è noto: si compra? No.** Il tool rifiuta con un messaggio
chiaro: *«Prezzo non noto per …: non si può comprare a prezzo inventato.
Aggiungila come "vinta"»*. Niente auto a cifre fantasma: o il prezzo è nel
catalogo, o si va per la strada della vittoria in evento.

**Cosa succede dopo le gare.** L'auto accumula un odometro, ma **solo delle
gare fatte mentre era nel garage**: giri completi × lunghezza della pista.
Le gare fatte in passato con la stessa vettura contano per statistiche e
record, ma non pesano sull'usura della tua auto.

**La valutazione per chilometraggio.** Il valore parte dal prezzo reale e
scende con l'usura:

| km con noi | % del prezzo reale |
|---|---|
| fino a 500 | 85% |
| 500–2.000 | 70% |
| 2.000–5.000 | 55% |
| oltre 5.000 | 40% |

Sopra c'è sempre un **pavimento di 4.000 €** (un'auto resta un'auto). Se il
prezzo reale è ignoto, il calcolo parte da 30.000 € (valore medio stimato di
un'auto EVO).

**Quanto ti torna vendere.** La **vendita porta il 70% della valutazione**:
rivendere non fa diventare ricchi. Vendendo, i soldi entrano, vengono
scritti nei flussi («vendita … valutata …»), l'auto esce dal garage e la
vetrina eventi la rilascia: non la vedi più in mostra.

### La matematica che vale conoscere

- **Comprare e rivendere subito:** ~59,5% del listino (85% di valutazione ×
  70% di vendita). Perdi quasi metà: la strada giusta è il campionato, non
  il commercio al minuto.
- **Soldi insufficienti:** l'acquisto si blocca e il tool dice quanto manca,
  confronto fra prezzo e saldo in banca.
- **Valore ≠ prezzo pagato:** la scheda garage mostra la **valutazione
  aggiornata ai km**, che è il numero usato per calcolare il ricavo di
  vendita; il prezzo storico resta nel registro flussi.

---

## I premi degli eventi speciali: come si sceglie l'auto in palio

Quando il paddock ti invita a un evento speciale, l'auto in palio non esce
dal cappello: il tool la sceglie con una regola a cascata (`choosePrize` in
`src/events.mjs`), pensata apposta per non metterti in palio auto che hai
già in garage.

**Il lotto del tema.** Ogni invito porta UN tema, e il tema dichiara
**un'auto in premio** e due **auto in riserva** — tutte auto reali di EVO,
mai inventate:

| Tema | Auto in premio | Auto in riserva | Cassa piena | rep |
|---|---|---|---|---|
| Ritorno del Gruppo B | Peugeot 205 T16 | Audi Sport quattro · Renault 5 GT Turbo | 7.500 € | 8 |
| Leggende GT | Ferrari 288 GTO | Porsche 935 · Porsche 911 Turbo 3.6 (964) | 9.000 € | 10 |
| Notte Sprint | Audi R8 LMS GT4 Evo | BMW M4 GT3 · KTM X-Bow GT2 | 6.000 € | 7 |
| Il Gran Finale dei Campioni | Lamborghini Countach LP5000 QV | Ferrari F40 LM · Dallara Stradale | 15.000 € | 15 |

**La cascata della scelta, alla generazione dell'invito.** I candidati sono
le auto del tema (premio in testa, poi le riserve in ordine) **che NON
possiedi già**: per il tool «posseduta» vale sia in **vetrina eventi** che
nel **garage**. Fra i candidati liberi se ne sceglie una con un po' di caso.
Se TUTTE le auto del tema sono già tue scatta l'unico caso ereditato dal
vecchio tool: **premio in liquidità extra**, la cassa del tema × 1,4
(es. 15.000 × 1,4 = 21.000 €) al posto dell'auto. La scelta si cuoce
nell'invito quando nasce: non si rimescola da sola ad ogni click, il premio
resta quello stabilito alla generazione.

**Come riconosci il premio nel pannello Eventi.** La scheda gara mostra
sempre l'auto in palio: se l'auto del premio è una tua (vinta in un evento
passato) vedrai la dicitura *«la tua, vinta in …»* — segno che l'invito è
nato prima della correzione, vedi sotto. Se il premio è ancora da vincere
leggi *«… è il premio: chi vince la porta a casa»*. L'auto che correrai è
quella che il tasto **Prepara tutto e divertiti** seleziona: la tua già in
vetrina, oppure la vincenda.

**Invito vecchio, premio doppione: la correzione a caldo.** Gli inviti nati
PRIMA della correzione del 23/10 potevano avere in palio un'auto già tua.
La correzione è l'endpoint `event-prize-refresh` del server del tool, e le
sue regole sono strette:

- **sostituzione SOLO se il premio in palio è già tuo e il tema ha una
  riserva che non possiedi**: il nuovo premio entra nel save subito e in
  bacheca arriva un messaggio tipo *«Premio aggiornato…»*;
- **idempotente**: richiamata quando il premio è già giusto risponde
  `already-ok` e non cambia niente (nemmeno la cassa);
- **premio giusto → cassa piena del tema**: se l'invito vecchio aveva
  gonfiato la cassa al ×1,4 (doppione), la sostituzione la riporta al valore
  pieno del tema;
- **nessuna riserva libera → resta la liquidità extra ×1,4**, com'è la
  regola generale per i temi esauriti.

Per gli inviti NUOVI non serve niente: nascono già giusti. Non c'è un
bottone in GUI per la correzione: se un invito vecchio mostra un premio
posseduto, chiedi a chi ti ha installato il tool di lanciarla (una chiamata
HTTP al server locale, che scrive il save e mette il messaggio in bacheca).

**E se vinco?** P1 = auto in vetrina **+ cassa piena**. P2–P3 = metà cassa,
P4–P6 = un quarto, oltre = niente soldi (la rep invece: P1 piena, dopo solo
40%). L'auto vinta entra in vetrina una volta sola. L'invito di stagione va
accettato e corso **entro 2 gare di campionato**: non lo accetti e
svanisce; il Gran Finale di fine stagione non ha scadenza.

---

## FAQ di chi compra nel garage

### 1. Quanto costa davvero un'auto?
Il listino di `data/car-prices.json`, pieno: niente sconti, niente
trattativa. La cifra che vedi sulla scheda è la cifra che esce dalla cassa.

### 2. C'è un'auto senza prezzo nel catalogo: posso averla?
Solo se la **vinci** in un evento speciale. Il tool non compra a cifre
inventate: è una scelta voluta per non spaccare la contabilità della
carriera (le auto senza prezzo sono quelle non in commercio, come la F1).

### 3. Ho girato molto con un'auto ma vale poco: perché?
Il valore scende con i **km fatti mentre era tua** (giri completi ×
lunghezza pista). Oltre 5.000 km la valutazione è il 40% del listino. I km
fatti con la stessa vettura **prima** di acquistarla non ti vengono però
addebitati: pesano solo le gare in possesso.

### 4. Vendere conviene?
Non per guadagno: 70% della valutazione, e l'usura ha già scalato prima.
La vendita serve a **recuperare liquidità** (fondo di cassa) o a staccare
un'auto inutilizzata; i soldi veri arrivano da premi di gara e contratti
sponsor.

### 5. Che cos'è il «PI» nel libretto del garage?
L'**indice di prestazione** (Performance Index) letto dal catalogo
ufficiale del server dedicato: la stessa metrica che bilancia le griglie di
gara. Ti serve per scegliere l'auto adatta alla serie in corso; **non entra
nel prezzo**.

### 6. L'auto venduta può tornare?
Puoi **ricomprarla** al listino (se ha un prezzo noto) o **vincerne** di
nuovo un evento con lo stesso premio. L'odometro però riparte da zero col
nuovo possesso: il passato resta solo nelle statistiche e nei record.

### 7. Perché la scheda mostra un valore diverso da quello che ho pagato?
Perché è la **valutazione ai km** (85/70/55/40%), non il costo storico. Il
prezzo che hai pagato è comunque scritto in `data/flows.jsonl`.

### 8. Ho venduto: valutata 28.000 €, ricevo 19.600 €: giusto?
Sì: **ricavo = 70% della valutazione** (0,70 × 28.000 = 19.600). Con usura
forte si moltiplicano i tagli: listino → valutazione per km → 70%. Il
pavimento di 4.000 € riguarda la valutazione, non il ricavo.

### 9. Posso comprare con una sponsor attiva o a fine stagione?
Sì: l'acquisto dipende **solo dal saldo in cassa**. Sponsor attive,
iscrizioni in corso o fine stagione non cambiano la regola.

### 10. Un'auto vinta che ho venduto risale da sola?
No: le vittorie arrivano **una sola volta** dall'evento (la vetrina segna
l'auto come importata). Se la vuoi di nuovo, devi ricomprarla o rivincere
un evento con lo stesso premio.

---

*Ultimo aggiornamento: 23/10/2026, dopo la correzione dell'acquisto gratuito
(bug 23/10: le comprate ora pagano il listino) e della scelta dei premi
evento: in palio solo auto che non possiedi già, con riserve a tema.*
