# EVO Pitwall — release v0.1.30 (74573c4)
_Data: 2026-10-25 · Aggiornamento da **v0.1.29** · Zip del pacchetto-amico dentro: `ac-evo-career-amico-v0.1.30-2a4f75e.zip`_

## Correzioni e novità
- **Copilota: posizioni giuste, come l'HUD** — fino a ieri la gara di Imola P5/10 viaggiava a 4 nella memoria condivisa di EVO (la SM conta la posizione da 0): il copilota diceva «sei sesto» quando eri quinto. A sorgente la posizione LIVE esce già 1-based con test di regressione (`test/posizione-live.test.mjs`) che bloccano 0 = leader e i valori fuori griglia come "nessuno".
- **L'app impara l'auto dal garage** —fare la prima gara con un'auto che non è nel dizionario mostra il rosso «auto NON aggiornata» e tocca scegliere l'auto a mano; dalla gara DOPO la coppia è imparata (`learnCar` nell'import) e il Prepara la scrive da solo, discorso sopra una volta (toast rosso a tempo lungo, non più un lampo).
- **Toast rossi duraturi** (core.js/style.css): «Prepara tutto» ora riferisce la pista («pista Imola scritta: rientra nel weekend dal menu di EVO», «pista già Imola: nulla da scrivere», «⚠ pista NON aggiornata…») e sta a schermo quanto serve.
- **Pacchetto-amico**: i 6 cataloghi statici dell'auto di `data/` (necessari dopo il reset di ieri) NON sono più di divieto; il resto di `data/`– save, token, coppie generate – resta fuori. Zip usata: **npm test dentro la cartella della zip estratta in temp: PASSANO.**

## Come si aggiorna
- **Installazione-zip (pacchetto-amico)**: barra in alto «Aggiornamenti di progetto pronti su GitHub» → **Aggiorna ora** (zipball + copia + test; il server si riavvia da solo). Se il repo è privato: token di lettura in `data/.github-token`.
- **Clone git**: barra «Aggiorna ora» o `sincronizza-git.cmd`.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
