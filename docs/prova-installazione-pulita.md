# Prova con sistema pulito + save 3 — checklist per la sessione di prova

Due prove in una: (A) l'installazione a freddo che simula l'amico, (B) il test
griglia sul save 3 di questo PC. Spuntare a mano mentre si va.

---

## A. Installazione pulita (il PC «dell'amico»)

### Prima di partire
- [ ] **Node.js 18+ installato** (`node -v`): è l'unica dipendenza. Su un OS
      pulito manca sempre: senza lui `avvia.cmd` non parte.
- [ ] **La sorgente del codice, UNA delle tre** (in ordine di fedeltà):
      1. **`installa.cmd` (dal 26/10 la via di DEFAULT, un file solo):** passa il
         file doppioclick dalla root alla macchina pulita e lancialo: scarica
         Node portatile se manca, chiede il token se il repo è privato, estrae
         la zipball, scrive `build-id.txt`, testà, scorciatoia e avvio.
         (Sostituisce il pacchetto-amico per gli amici: resta valida come via.)
      2. **Pacchetto-amico**: copia `pacchetti/ac-evo-career-amico-v*.zip`
         su chiavetta nella macchina pulita e estrailo. È l'unico con
         `build-id.txt` dentro: **si autoaggiorna** col bottoncino del launcher.
      3. **Clone** `git clone https://github.com/turbignox-hash/ac-evo-career.git`
         (repo privato → serve l'accesso GitHub di chi lo gesticisce) +
         `git remote rename origin offsite`.
      3. **Download ZIP da GitHub** (github.com → Code → Download ZIP):
         dal 26/10 si autoporta al passo al PRIMO avvio (scarica main da solo
         e scrive il build-id): su repo privato serve il token di lettura §5-bis
         prima del primo avvio. Fedeltà inferiore al pacchetto (la copia parte
         dal commit di download, poi si uniforma al primo update).
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
- [ ] copilota: parla nella LINGUA della UI (uk = UI inglese), non parla due volte
      lo stesso messaggio entro 12 s
- [ ] telemetria: il .ld è pieno (62 canali), MoTec e setups leggono

### Autoaggiornamento (via pacchetto-amico LO SOLO)
- [ ] al primo avvio il launcher **chiede di aggiornare** (`s/N` + Enter = no)
      — GitHub main è avanti del pacchetto (0.1.14 → 0.1.15)
- [ ] con `s` si scarica, copia il codice, lancia `npm test` **dentro l'installazione**
- [ ] avvia il launcher un\'altra volta: la GUI scrive **0.1.15** e main
- [ ] VERIFICA CHE NON HAI TOCCATO niente: `data/` (le dir di slot) restano
      intatte prima e dopo l'aggiornamento — un PNG e un collegamento non si
      cancellano con l'update

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
- esito pacchetto-amico e auto-aggiornamento: ✔/✘ + note
- esito griglie slot 3: ✔/✘ + note
- anomalie trovate: (descrizione)
