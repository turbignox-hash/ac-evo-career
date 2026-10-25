# EVO Pitwall — report build 0.1.33 (1319f1e)
_Data: 2026-10-25 · Aggiornamento da **v0.1.30**_

## Correzioni e novità
- Grid Type: forma canonica del menu (6=1 tenuto, 7=N aggiunto) e modo scelto dal Prepara — multiclasse CUSTOM, monomarca AUTOMATIC · b6f2e0c
- Corpo release GitHub v0.1.31 in report/ · 9ef2c8a
- Grid Type: CUSTOM per tutte le serie — selettore scritto da fuori al Prepara, riscrittura griglia sempre, piano B con guida a mano · e0c0b42
- Ottimizzazione post-Grid Type: import aut moti rimossi dal server, contatore della cartuccia rinominato · 1319f1e

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 675393 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
