# Caccia alle calamità rare — 30/10/2026 serale

Fonti lette: `data/errors.jsonl`, `data/flows-debug.jsonl`, `data/match-auto.log`,
`tmp/webui-live.log`, `data/spia-gamemodes.log`, `data/monitor-29-10.err.log`,
`data/webui.log`, Event Viewer (crash nativi 7 h), `data/copilot-*.jsonl` (coda).

## 1. Registro errori sporco dai TEST (GRAVE · trovata · sistemabile subito)
**Fenomeno.** 437 voci su 411 in `data/errors.jsonl` cadono nell'unica ora UTC 18
di oggi — la finestra della suite completa (19:13–19:14 locali) e del verdetto
di giornata (19:22). Dopo la rotazione a 500 righe, il file mantiene 32 voci, e
tutte sono del tipo «righe pilota duplicate nel file risultato».
**Radice.** [src/warnings.mjs:19](../src/warnings.mjs) appoggia le voci su
`EVO_DATA_DIR` se impostato, ma **34 test file non lo imposto**; quelli che
passano da [src/results.mjs:73](../src/results.mjs) (dedupe piloti, che per design emette voci) scrivono direttamente nel registro vero del progetto, cosi
come `test/cli-watch.test.mjs` (provato dal pid in `flows-debug.jsonl`).
**Impatto.** Il pannello Diagnostica in Setup mostra voci di test come guasti
vivi; la rotazione a 500 righe rischia di cestinare voci vere.
**Rimedio proposto.** Nella suite (`npm test`) impostare `EVO_DATA_DIR` su una
cartella tmp condivisa per manu — una riga nello script `test`
(`node --test --env-file` o un `test/_sandbox-prelude.mjs` importato in cima ai
test). Alternativa più piccola: aggiungerlo solo ai 4–5 test che toccano
direttamente `results.mjs` (corrupt-inputs, identita-pilota, penalties,
tracknames, cli-watch).

## 2. Monitor copilota uscito per codice cambiato su disco (MEDIO · raro · per design)
`data/monitor-29-10.err.log` (29/10 16:25): «il codice è cambiato su disco da
quando sono partito: esco, rilanciarmi a mano». Guardia corretta ma
**silenziosa**: è l'unico canale a sapere del monitor morto se non si guarda il
file `.err`. Rimedio piano (opzionale): far dire al webui «monitor copilota giù
da X» se il heartbeat non torna.

## 3. Crash nativi di EVO nelle ultime 7 ore (NIENTE)
`_crashlog.ps1` su Event Viewer (Id 1000 filtrato AssettoCorsaEVO): zero eventi.
`match-auto.log` (191 KB, vivo 19:14): zero ⚠/✗ — solo le righe attese delle
serie di prova (`serie_*_test` con auto in minetest, suffisso «| Auto di prova»).

## 4. Catalogo illeggibile → sanifica riuscita (MINORE · sorvegliata)
Due sole voci in `errors.jsonl`: cataloghi temporanei `verdetto-*` in Temp
ingressi in sanifica con successo. Raro, gestito, non blocca.

## Pulizia fatta in caccia
- [report/gare/verdetto-261030.md](gare/verdetto-261030.md) rigenerato (prove in NOTE, 3 gare).
- Suite completa: 613/613 pass (tmp/suite-3010.log).
