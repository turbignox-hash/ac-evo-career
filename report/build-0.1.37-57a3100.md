# EVO Pitwall — report build 0.1.37 (57a3100)
_Data: 2026-10-25 · Aggiornamento da **v0.1.36**_

## Correzioni e novità
- GUIDA-AMICO: nuova sezione 3-bis con la sequenza completa del primo avvio (per il video dell'amico). · da6b119
- GUIDA-AMICO: versione in inglese della sequenza del primo avvio (3-bis). · 18eeba4
- Sequenza del primo avvio in inglese anche nel README + guida amico solo in inglese (FRIEND-GUIDE-EN). · 4c83442
- README: sezione Language collegata a GUIDA-AMICO.md e FRIEND-GUIDE-EN.md. · 57a3100

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 677019 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
