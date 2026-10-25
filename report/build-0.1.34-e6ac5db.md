# EVO Pitwall — report build 0.1.34 (e6ac5db)
_Data: 2026-10-25 · Aggiornamento da **v0.1.33**_

## Correzioni e novità
- Nota amico Grid Type: riga CUSTOM sulla scheda multiclasse e paragrafo nella guida; collaudo vergine ri-verde · e6ac5db

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 675393 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
