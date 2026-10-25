# EVO Pitwall — report build 0.1.29 (31cf461)
_Data: 2026-10-25 · Aggiornamento da **v0.1.24**_

## Correzioni e novità
- Wizard: stato del weekend di carriera + release-tool + residui Biome; version 0.1.25 · a9b14c9
- Aiuto in GUI + limiti falsi-privato fuori dallo strumento asset-release senza involucri · 3af19ee
- Note release v0.1.25: tokenless updater, Aiuto in GUI, asset dentro la release · 5021089
- Prepara tutto: verita sulla pista nel toast + fila API senza scuse stack (PC 2) · 880ff3b
- Report release v0.1.26 (880ff3b): lezione del PC 2 — pista che parla, fila API libera. · 4720352
- Prepara tutto: le guide ENOENT dicono il rimedio (entra nel weekend UNA volta), test sandbox tollera il PC vergine — v0.1.27 · 29a9013
- Indici auto blindati: data/ selettivo + tool di ricostruzione — v0.1.29 · 31cf461

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 41831 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
