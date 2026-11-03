# Orientamento — leggere questo PRIMA di proporre soluzioni

Riassunto dell'architettura VIVA (3/11). Se un appunto vecchio dice «genera la
griglia con la fabbrica» o «prendila dal magazzino», l'appunto è SUPERATO: la
griglia si prende dal GIOCO. Nel dubbio, il codice qui sotto comanda.

## 1. La griglia si PRENDE dal gioco (non si genera)

- Fonte unica: `…\Saved Games\ACE\GameModes\last_grid.customgrid`, il file che
  **EVO scrive da solo** quando si genera/applica una griglia in gioco.
- [src/grid-apply.mjs](src/grid-apply.mjs) (`griglia`): il primo tentativo è
  `buildGridMessage(...)` SUL VIVO — le celle sono quelle scritte da EVO,
  riallineate alle regole della serie (pool, piloti, celle uniche). Solo se il vivo manca o non regge partono
  i ripieghi: template della serie → backup del customgrid → snapshot del
  progetto → (ULTIMO) griglia di fabbrica spedita col programma.
- [tools/raccogli-griglie.mjs](tools/raccogli-griglie.mjs) sorveglia quello
  stesso file: a ogni scrittura lo **cura** ([src/grid-cura.mjs](src/grid-cura.mjs),
  fotocopia di f10/f11 per la Supra che il client non risolve, a gioco chiuso,
  con backup) e poi ne fa la **foto** in `data/grid-templates/` e
  `config/griglie-fabbrica/`.
- Quindi: **fabbrica e magazzino sono ARCHIVIO e ultimo ripiego, non la
  strada.** Non riproporre `_genera-multi`/`gridbuilder` per «risolvere» una
  griglia mancante se il gioco può scriverla. Il guardiano dev'essere acceso
  (`node tools/raccogli-griglie.mjs`) perché la cura sia automatica: visita al
  via, a ogni scrittura, e ripete finché resta un veleno in attesa.

## 2. Il mirror (`data/`): copie dei file del gioco, in sola lettura

- `data/griglie-grezz/` — griglie ripatriate dal gioco (qui vive il *donatore*
  della cura d'identità, la foto Supra del 23/10). Non è un magazzino: è la
  memoria di ciò che il gioco ha scritto.
- `data/customgrid-snapshots/` — snapshot delle griglie del progetto.
- `data/evo-calendar*.json` — lo specchio del calendario (v. §3).
- Regola: il mirror si **legge**; sul file del gioco si scrive solo passando
  dallo scrittore unico `writeSafe` di [src/grid-apply.mjs](src/grid-apply.mjs)
  (backup `.bak-…` + scrittura atomica `.tmp` → rename). I nomi dei backup si
  fanno con `bakName()` ([tools/evo-grid.mjs](tools/evo-grid.mjs), secondo +
  anti-collisione), mai a mano.

## 3. Il journal (`evo-calendar[-N].json`): il calendario è NOSTRO

- [src/journal.mjs](src/journal.mjs): a ogni `saveState` ([src/state.mjs](src/state.mjs))
  si riscrive `evo-calendar[-N].json` **accanto al save**, con le ronde del
  sedile attivo prese dal `config/career.evo.ladder.json` e il flag
  `mirror: true` che marca la copia nostra.
- Lo slot nel nome è UNA regola sola: `slotSuffix(saveFile)` (slot 1 → `''`,
  2 → `-2`, 3 → `-3`). Chi scrive altri file per slot (la traccia della ronda
  del 3/11) riusa quella.
- I consumatori (webui, GUI `drawAppPanel`, `ronda-ladder.mjs`, `import.mjs`)
  leggono il journal e **delegano al ponte** (app di carriera del gioco) solo
  se il journal manca: il ponte resta la fonte «più ricca», non la base.

## 4. Come si prova (senza toccare i dati veri)

- File di gioco in sandbox: `ACE_GAME_SAVEDIR=<cartella temp>` (il guardiano, i
  test e le prove usano questa); la fabbrica ha `EVO_FACTORY_DIR`.
- Verifica minima: `node --test test/<file>.test.mjs` del pezzo toccato; Biome
  sui soli file cambiati; le prove end-to-end vivono in `tmp/_prova-*.mjs`.
- Il diario racconta IL FATTO: ogni lavoro fatto e verificato va in
  [DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md), in cima, con la richiesta di Mauro
  tra virgolette e le verifiche vere (numeri, non «sembra ok»).
