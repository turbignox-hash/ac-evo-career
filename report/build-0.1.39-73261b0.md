# EVO Pitwall — report build 0.1.39 (73261b0)
_Data: 2026-10-27 · Aggiornamento da **v0.1.38**_

## Correzioni e novità
- Sfide, diario e scheda degli eventi bilingui anche in EN nella GUI · 73261b0

- Biome quality-gate (src + gui): non leggibile qui (Bad control character in string literal in JSON at position 1043312 (line 1 column 1043313)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
