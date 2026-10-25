# EVO Pitwall — report build 0.1.30 (74573c4)
_Data: 2026-10-25 · Aggiornamento da **v0.1.29**_

## Correzioni e novità
- Prova di aggiornamento remoto: commit fittizio per la prova del launcher (payload vuoto, nessun file toccato) · b834732
- Test percorsi: GAME_SAVEDIR tollera il PC vergine (ACE non ancora creato) — guardia sulla radice, non sul save · fcdc0a8
- Copilota on pitch: posizioni live 1-based come l'HUD, l'app impara l'auto dal garage — v0.1.30 · 74573c4

- Biome quality-gate (src + gui): non leggibile qui (Unexpected non-whitespace character after JSON at position 42259 (line 2 column 1)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
