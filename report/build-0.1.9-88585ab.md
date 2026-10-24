# EVO Pitwall — report build 0.1.9 (88585ab)
_Data: 2026-10-24 · Aggiornamento da **v0.1.8**_

## Correzioni e novità
- Report di build automatico + aggiornamento che si riavvia da solo: report-build.mjs (data/report/build-vX.Y.Z-<hash>.md col riepilogo pubblicabile delle correzioni, agganciato a fine di sincronizza-git.cmd) e riavvia-webui.mjs (agg-install spawna l'helper staccato: ammazza il vecchio server, aspetta la porta libera e riparte col codice nuovo; la GUI sonda agg-info e ricarica la pagina). Suite 173/173 verde. · 88585ab


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
