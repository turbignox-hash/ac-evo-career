# EVO Pitwall — report build 0.1.11 (49a476e)
_Data: 2026-10-24 · Aggiornamento da **v0.1.9**_

## Correzioni e novità
- Armonica DI DEFAULT per tutte le serie: piu rifiuti col gesto delle 14 liveries · e2c7a6b
- lapNo in 'hud' pure: il narratore «giro finito» della copilota parla dal giro 1 · 84cf21d
- Vigia del parco auto + copilota curato + soldi e reputazione reintrodotti (v0.1.11) · 49a476e

- Esito suite di test: passati ✅ (riga corretta dopo il fix: il vecchio script misurava `npm` via execFileSync e su Windows falliva da solo — il ragionatore ora usa `node --test`; suite reale **181/181** — nota: il «187/187» scritto qui prima contava anche 6 file-helper di prova raccattati dalla scoperta default di node --test, vedi NOTE-AUTOMAZIONE 24/10)

## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
