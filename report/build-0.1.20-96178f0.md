# EVO Pitwall — report build 0.1.20 (96178f0)
_Data: 2026-10-25 · Aggiornamento da **v0.1.19**_

## Correzioni e novità
- Ko-fi link real (turbigno) and Assetto typo fixed in EN readme · 86250b2
- auto-backup of the EVO save (tools/salva-save.mjs): rotating zip slots, max 4, hooked into :aprigui · 443c71f
- GUI panel for the EVO save backup: status card + force button in the system tab · 96178f0


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
