# Prova con sistema pulito + save 3 — checklist per la sessione di prova

Due prove in una: (A) l'installazione a freddo che simula l'amico, (B) il test
griglia sul save 3 di questo PC. Spuntare a mano mentre si va.

---

## A. Installazione pulita (il PC «dell'amico»)

### Prima di partire
- [ ] **Node.js 18+ installato** (`node -v`): è l'unica dipendenza se si parte
      da zip/clone. Con la via installer NON serve: se lo scarica da solo.
- [ ] **La sorgente del codice, UNA delle tre** (consiglio: 1):
      1. **`installa.cmd` (dal 26/10 la via di DEFAULT, un file solo):** passa il
         file doppioclick dalla root alla macchina pulita e lancialo: scarica
         Node portatile se manca, chiede il token se il repo è privato, estrae
         la zipball, scrive `build-id.txt`, testa, scorciatoia e avvio.
         (Sostituisce il pacchetto-amico per gli amici: resta valida come via.)
      2. **Download ZIP da GitHub** (github.com → Code → Download ZIP): la via
         che agganciano oggi la maggior parte: se niente `build-id.txt`, al
         PRIMO avvio guarda `main` su GitHub e porta da solo l'installazione
         al passo (solo Windows vergine: serve Node già installato).
      3. **Clone** `git clone https://github.com/turbignox-hash/ac-evo-career.git`
         (repo privato → serve l'accesso GitHub di chi lo gesticisce) +
         `git remote rename origin offsite`.
### A-bis — disinstalla (facoltativa ma comodissima)
- [ ] copia anche `disinstalla.cmd` sulla chiavetta: a fine prove, doppio click
      sul vergine e controlla che tolga la cartella installata e la scorciatoia
      **solo se punta a quella** (la tua installazione dev qui non si tocca).
      È il primo test del disinstallatore VERO fuori dalla sandbox (i 5/5 sono
      già passati qua).
- [ ] MAI copiare `data/` nella macchina pulita: ogni PC deve farsi la SUA carriera vergine.

### Primo avvio (il vero test dell'amico)
- [ ] doppio click su `avvia.cmd` → l'installazione gira
- [ ] **scorciatoia «Carriera EVO» sul Desktop** creata da solo, con
      l'icona del programma (non il verde di Node) — se manca, vedi
      `tools/crea-scorciatoia.mjs`
- [ ] **wizard di prima apertura** trova da solo `Saved Games\ACE` e il gioco in
      Steam; se mancano, si forza con `setup --data ... --game ...` (GUIDA-AMICO §3)
- [ ] secondo doppio click sulla scorciatoia: non rifà niente, resta zitta (idempotenza)

### La griglia, il gioco, il resto
- [ ] avvia un campionato **con griglia** (serie con template pronto, in
      fabbrica/griglie-fabbrica): Prepara dalla UI con EVO CHIUSO poi aperto
      funziona, griglia **non ha bisogno del reapply manuale in EVO**
- [ ] avvia un campionato **senza template**: deve comparire l'instruzione
      «GENERA → APPLICA una-tappa» su quella serie (il rituale noto)
- [ ] import del risultato: la gara appare nell'archivio, flussi e rep calcolati
- [ ] copilota: VOCE sempre it-IT anche con la UI in inglese (dal 27/10), non
      parla due volte lo stesso messaggio entro 12 s
- [ ] telemetria: il .ld è pieno (62 canali), MoTec e setups leggono

### Autoaggiornamento
- [ ] con la via installer o il Download ZIP **la copia parte già al passo**:
      al primo avvio non deve chiedere niente (se GitHub è però avanti mentre
      testi, la domanda `s/N` deve comparire — Invio o 15s = no)
- [ ] se accetti con `s`: scarica, copia il codice, lancia `npm test` **dentro
      l'installazione**; ri-avvia il launcher una volta e la GUI mostra la
      build nuova nel piè di pagina (`build x.y.z · hash`)
- [ ] VERIFICA CHE NON HAI PERSO niente: `data/`, la scorciatoia col PNG e
      qualunque file tuo fuori dalle cartelle codice restano intatti prima e
      dopo l'aggiornamento

---

## B. Test griglia sul save 3 (QUESTO PC)

Il dubbio del 26/10: «la griglia del save 3 funzionerà davvero o era il save 1?»

La griglia che il gioco leggi non dipende dal SAVE — vive in
`Saved Games\ACE\GameModes\last_grid.customgrid` (per-PC). Dipende dallo slot
solo il MAGAZZINO dei template: `data/slot-3/grid-templates/` ha già
`coppa_500.customgrid` e `coppa_r5-turbo.customgrid`.

- [ ] avvia GUI slot 3 (`pilota-3.cmd`) → centro gare
- [ ] scegli la serie e **Prepara** (EVO può restare aperto, come dal 24/10): nel Live deve dirsi la corsa dei candidati (magazzino slot-3 → backup → fabbrica) e la griglia viene scritta
  — se è fabbrica, verginità di nessun registro toccato
- [ ] a parte la gara: il round in EVO parte con la griglia della SERIE, non con quella della gara scorsa
- [ ] corri, chiudi, importa: archivio, rivals e flussi devono finire NEI registri di slot-3 (`data/slot-3/`), NON nel `data/` radice
- [ ] nessuna fuga di slot: niente informazioni di slot-3 dentro `data/` root e viceversa
- [ ] serie SENZA template: rituale «GENERA + APPLICA» una-tappa; dopo la prima gara il template resta in `data/slot-3/grid-templates/` e i round seguenti si riscrivono da soli

---

## Esito del test (a fine sessione, qui sotto)
- esito installatore e auto-aggiornamento: ✔/✘ + note
- esito griglie slot 3: ✔/✘ + note
- anomalie trovate: (descrizione)
