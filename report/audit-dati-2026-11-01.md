# Audit delle cartelle dati — 1/11/2026 (DA-6)

Ripetizione dell'audit [audit-dati-2026-10-28.md](audit-dati-2026-10-28.md) dopo un
fine settimana di gara viva (stagione 12 chiusa in vittoria alla Brands Hatch,
stagione 14 aperta con la R5). Metodo della casa, lezione DA-16:
**sola lettura** — la sonda [tmp/_audit-dati-1101.mjs](../tmp/_audit-dati-1101.mjs)
non scrive nulla su data/ né sul save; nessun tocco al server vivo.

## 1. Disco: data/ è snellita e resta sotto controllo

| Cartella | 28/10 | 1/11 | Nota |
| --- | --- | --- | --- |
| `salva-save/` | 746 MB · 2 zip FULL | **2,2 MB · 2 zip piccoli** | le esclusioni del 28/10 girano e la rotazione MAX_ZIP=4 ha già scartato da sola i due FULL del 27–28/10 (previsione dichiarata, qui confermata) |
| `backups/` | 5,9 MB | 3,9 MB (22 file) | stash incrementale in potatura |
| `match-auto.log` | 19,9 MB | **0,2 MB** | la potatura keep-last dei log (28/10) è già passata |
| `flows-debug.jsonl` | 1,4 MB | 0,4 MB | idem |
| `samples/` | 1,3 MB | 1,1 MB (57 file) | catalogo garage dentro Git, hex fuori |
| `grid-templates/` | 2,3 MB | 1,6 MB · 151 file | magazzino template live con potatura keep=25 (31/10) |
| `results-archive/` | 756 KB | 0,8 MB (79 file) | cresce a ogni import, corretto |
| `customgrid-snapshots`, `slot-3`, `journal`, `report`, `sniffer-campi` | — | < 0,5 MB | tutto idle |
| **nuove** | — | `data/bak` (0,6 MB · 4 file) | i backup «pre-ripara-sonda» del 31/10 dalla lezione DA-16 — copie di guardia LEGITTIME, restano finché una riparazione futura non attiva la potatura per-tag |
| **nuove** | — | `data/test-installazione-pulita` (0,1 MB) | sabbia dei test d'installazione — gitignored, zero rischi |

Totale `data/`: da ~774 MB del 28/10 a **~11 MB** — la voce A1 dell'audit
scorso è chiusa di fatto, non solo di codice.

## 2. Copertura Git — nessuna fuga

`git ls-files data` → 7 file (6 cataloghi + `samples/garage/map.json`), come nel
28/10. Le due cartelle nuove (`data/bak`, `data/test-installazione-pulita`)
sono correttamente ignorate da `git check-ignore`. Il save resta fuori
(volontario, «il save non si tocca»).

## 3. Coerenza del save (evo-career.save.json, 0,3 MB)

- **Parse** ok; `version`, `driver`, `money` (630.877 €), `rep` 724; stagione 14,
  ronda 1, nodo attivo `coppa_peugeot-205-t16`; stagioni vissute 13.
- **Sedili**: 12 firmati, tutti coerenti coi nodi del ladder e calendari
  presenti — nessun posto fantasma.
- **Garage**: 2 auto — Peugeot 205 T16 e Lamborghini Countach LP5000 QV —
  nessun doppione.
- **Difficulty**: trim su 4 serie (roadster −5 · rx7fd +1 · r5 +1 · peugeot 0),
  tutti entro ±20; `pending: null`; mode `adaptive`, 0 locked.
- **raceSettings**: 86 record — **tutti a cursore aperto, 0 fissi, 0 vuoti**
  (il «↺» esiste solo se nasce da semina: qui nessuno), banda 0–100 e
  min≤max sana in tutti. La legge della semina
  ([seminaRaceSettings](src/state.mjs)) non ha lasciato righe corrotte
  dalle richieste vive di questo fine stagione.
- **Storico**: results su 16 chiavi, 13 stagioni vissute, stats coerente
  (79 gare disputate, 43 vittorie = 54%, 49 podi = 62%, 12 pole, 37 giri veloci).
- **Posta**: 60 messaggi — esattamente al cap di [pushMessage](src/state.mjs#L1101)
  (`slice(-60)`): potatura attiva, la cassetta non cresce.

## 4. Classi e griglia

`data/grid-classes.json`: 17 classi legali e il **cap del restrictor è dentro**
in TUTTE le regole di tutte le classi (fallback 20 = limiti scritti). Niente
regole oltre il cap, pool e zavorre intatte dopo la cura MX-5 del 31/10
(DA-18: restrictor 0) e la vetrina tinte (default OFF).

## 5. Anomalie censite (piccole, niente leva)

### A1 — `bestLaps` con chiave in doppia grafia «imola» / «Imola» — senza cura

In `state.stats.bestLaps` convivono l'imola minuscola (23/9, era pre-canone
dei nomi pista; ha il nome della chiave in minuscolo da un vecchio percorso
import/registrazione) e la Imola corretta (31/10, fresca). Impatto **nullo**:
- i lettori ([life.mjs:413](../src/life.mjs#L413), [race.mjs:371](../src/race.mjs#L371),
  [tracks.mjs:196](../src/tracks.mjs#L196)) cercano per il nome della pista
  attuale («Imola») → la chiave morta non è mai trovata;
- il record fresco è pure il più veloce (02:05.382 vs 02:17.115): nemmeno le
  classifiche storiche sono disturbate.
Si annota perché la chiave morta resta nel save: un futuro normalizzatore
(merge case-insensitive delle chiavi) può prenderla. Una leva per volta e
l'audit non cura, misura.

### A2 — i due zip FULL dell'era 30-slot sono usciti per rotazione

Il 28/10 li avevamo mantenuti come unica copia d'epoca completa: la rotazione
MAX_ZIP=4 li ha scartati da soli ai backup successivi (previsione scritta
nell'ultimo audit; i due piccoli attuali 0,7 e 1,2 MB sono il regime nuovo).
Se serve una copia FULL oggi, va armata a mano — è una scelta fatta
in partenza, non una fuga.

## 6. Chiudo DA-6 senza interventi

Zero scritture, zero cure ritenute necessarie: il save è coerente
a fine delle gare vive, il disco è pulito, la potatura dei log e del backup è viva,
le classi sono dentro cap, i 86 cursori sono tutti sani. Prossima ripetizione:
dopo ~2 settimane di gara viva o SEMPRE dopo un update del gioco (DLC o reset
del save).
