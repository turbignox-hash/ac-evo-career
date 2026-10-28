# Audit delle cartelle dati — 28/10/2026

Verifica dell'inventario, della copertura Git e del motore di backup del save.
 Numeri misurati sul disco con `du`, copertura verificata con
 `git check-ignore` / `git ls-files`.

## 1. Inventario di `data/` (totale 774 MB)

| Cartella | Dimensione | Cosa contiene | Git |
| --- | --- | --- | --- |
| `salva-save/` | **746 MB** | zip di backup del save di EVO (slot-1/slot-2) + contatore | fuori (`data/*`) |
| `backups/` | 5,9 MB | backup incrementali dello stato carriera | fuori |
| `griglie-grezz/` | 5,2 MB | griglie provvisorie di bilanciamento | fuori |
| `samples/` | 1,3 MB | campioni garage (.hex/.log fuori, `garage/map.json` dentro) | parziale (voluta) |
| `slot-3/` | 1,3 MB | residuo del vecchio schema di rotazione (pre 25/10) | fuori |
| `grid-templates/` | 2,3 MB | magazzino dei template griglia per serie | fuori |
| `results-archive/` | 756 KB | copia dei risultati grezzi di ogni gara importata | fuori |
| `customgrid-snapshots/` | 96 KB | istantanee griglia personalizzata | fuori |
| `journal/`, `report/`, `sniffer-campi/` | < 30 KB | diario di stagione, report build, campi telemetria | fuori |
| file sciolti principali | ~7,7 MB | `match-auto.log` (4,6 MB), `flows-debug.jsonl` (0,9 MB), `rivals.json` (0,5 MB), `evo-career.save.json` (0,3 MB) | fuori |

La carriera attiva (`evo-career.save.json`, 292 KB) è leggera e sana.
 I cataloghi statici dell'auto (`car-images.json`, `car-specs.json`,
 `car-prices.json`, `car-guids.json` e altri) sono tracciati come previsto
 dalla whitelist di `.gitignore`: `git ls-files data` conferma 7 file (6
 cataloghi + `samples/garage/map.json`), tutto il resto è fuori.

## 2. Anomalie

### A1 — `salva-save/slot-2/save-2026-10-27T09-34-00.zip` pesa 782 MB

Il backup zippa l'INTERA cartella `Saved Games\ACE`, che dentro porta oltre
 al save carriera anche **MoTec, Replay, crashdump, Logs e mods** (fino ai
 782,01 MB misurati). È la voce dominante dell'audit: serve e basta il
 contenuto di salvataggio, il resto lo tiene il disco. Con le esclusioni
 a dovere (`tools/salva-save.mjs`: argomenti `--exclude` di `tar.exe` per
 MoTec/Replay/crashdumps/Logs/mods) il backup tipico precipita a pochi MB
 e la rotazione MAX_ZIP=4 resta gestibile.

### A2 — `salva-save/slot-1/save-2026-10-25T21-19-30.zip` pesa 158 byte

Il primo zip di rotazione (25/10, 21:19) è un tar quasi vuoto: probabilmente
 la cartella dati era appena nata (o il primo tentativo è andato a vuoto in
 silenzio). Non fa danni, ma è un falso backup. Da cancellare; a tutela
 futura, `tar.exe` può restituire 0 anche con sorgente strana — un controllo
 sul contenuto (almeno un file atteso dentro lo zip) sarebbe la garanzia
 vera di un backup tenuto.

### A3 — detriti di backfill e log in `data/` (~10–11 MB)

- `rivals.json.bak-ripara-2026-10-27T19-4x` × 3 (1,4 MB): residui di
  `tools/ripara-rivali.mjs`; la leva `pruneBackups` già usata dalla griglia
  non è qui applicata;
- `evo-career.save.json.bak-*` × 6 (1,6 MB): backup one-shot degli interventi
  msggen/dedup/corr-penalita del 23/10 — interventi conclusi, i bak sono
  ormai decorativi; pressoché identici tra loro;
- `griglie-grezz/` (5,2 MB) e `slot-3/` (1,3 MB): cartelle dell'era
  precedente, mai ripulite;
- `match-auto.log` (4,6 MB) e `flows-debug.jsonl` (0,9 MB): log runtime
  append-only, corretti fuori da Git via `*.log`, ma senza potatura.

Tutte le detriti risultati correttamente **fuori da Git** (`git check-ignore`
 conferma per ogni categoria).

## 3. Copertura Git — esito

- `.gitignore` blocca `data/*` con whitelist esplicita dei cataloghi statici
  e della catena `samples/garage` (riaperto e richiuso subito: i `.hex` e i
  `.log` restano esterna). Verificato con `git ls-files data`: 7 file.
- Nessuna fuga: `salva-save/`, `backups/`, `*.bak-*`, `*.log` tutti
  esclusi. Se `evo-career.save.json` è volutamente fuori (carriera
  personale, da copiare a mano) è coerente con la documentazione
  («il save non si tocca mai»).

## 4. Raccomandazioni (in ordine di rendimento)

1. **Esclusioni in `tools/salva-save.mjs`** (A1): zippare solo il
   contenuto di salvataggio; 782 MB → pochi MB, rotazione pulita e veloce.
2. **Potatura dei bak di `tools/ripara-rivali.mjs`**: riutilizzare la leva
   `pruneBackups` già assodata dalla griglia.
3. **Spazzata manuale delle detriti d'epoca** (A2 + A3): slot-1 arido,
   slot-3, griglie-grezz, bak del 23/10 — ~11 MB recuperati, zero rischi
   (sono copie di guardia di interventi chiusi).

## 5. Riflessi degli interventi (28/10 sera)

Messa in atto dopo l'audit, misurata sul vero:

- **A1 — FATTO**. `tools/salva-save.mjs` zippa ora con cinque esclusioni
  (`ESCLUSIONI_SAVE`: MoTec, Replay, crashdumps, Logs, mods — nessuna è
  dato di salvataggio). Attenzione trovata sul vivo: i tar POSIXLY-stili
  smettono di leggere opzioni al primo operando, gli `--exclude` dopo il
  `.` diventavano PATH da zippare — vanno PRIMA del `.`. Zip di prova
  18:48: **1,1 MB** (da 746 MB), lista contenuto verificata: le cinque
  cartelle sono assenti (0 righe in `tar -tf | grep`), ProfileData/
  GameModes/Results/setups presenti.
  **Incognita rimasta**: `2026.ld` (1,1 GB non compresso, 202 file) resta
  nel zip — schiacciato a pochi MB dal deflate, ma se il gioco lo
  rigenera da solo potrebbe uscire anche lui. Verifica proposta:
  simula il restore senza `2026.ld` su copia di sandbox prima di
  aggiungerlo alle esclusioni.
  Nota: lo slot-2 del 27/10 (746 MB, formato vecchio) resta l'unica
  copia che contiene Replay/crashdumps/MoTec originali; la rotazione
  MAX_ZIP=4 lo scarterà da sola ai successivi cicli di backup.
- **A3 (bak di ripara-rivali) — FATTO**. `tools/ripara-rivali.mjs` porta
  ora potatura per-tag: i `.bak-ripara-*` restano i 3 più freschi (la
  leva `pruneBackups` della griglia non li matchava: filtra solo bak
  col primo pezzo del nome numerico) e lo stamp passa al secondo
  (stesso standard del bak al secondo). Dry-run certificato: idempotente
  (griglie ripulite 0). La pila attuale (6 file, ~2,7 MB con doppi
  riporti `ls`) si potera al primo giro di riparazione reale.
- **A2 + resto di A3 — NON FATTO** (slot-1 arido da 158 B, bak d'epoca
  del 23/10, griglie-grezz, slot-3): spazzata manuale fuori da questi
  tre interventi; quando fatta, stornare le voci dell'inventario qui sopra.
