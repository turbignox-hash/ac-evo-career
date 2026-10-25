# EVO Pitwall — report build 0.1.30 (38e7342)
_Data: 2026-10-25 · Aggiornamento da **v0.1.30**_

## Correzioni e novità
- Pacchetto amico: i cataloghi statici dell'auto (25/10) non sono più "cialtroni". v0.1.30 · 2a4f75e
- Body release GitHub v0.1.30 in report/ · e7ea110
- Coda senza fiume: avviso di sblocco una volta per azione, allineamento griglia solo con conteggio credibile — v0.1.30 · 38e7342

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 252566 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
