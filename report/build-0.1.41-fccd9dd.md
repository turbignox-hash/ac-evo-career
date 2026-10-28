# EVO Pitwall — report build 0.1.41 (fccd9dd)
_Data: 2026-10-28 · Aggiornamento da **v0.1.40**_

## Correzioni e novità
- Pacchetto amico verde: bootstrap classi nel vergine + smoke garage dietro hasCareer (281/281 nell'estrazione) · 20326a7
- Tab Online a scheda propria: l'archivio multiplayer esce da Archivio, con guida community nei README · b802361
- Suite a 371: banda griglia ribaltata corretta in world.mjs + nove suite nuove (archivio online, identità pilota, grid-guard, stampa, meteo, world) e lint a zero · 69f2847
- Realismo simulato su tutte le griglie: forma stagionale ad ampiezza adattiva (cap 0,10) verificata a 60 stagioni da 6 a 20 sedili; meteo EN secchi mappati in presetFor; caccia ai commenti mentitori in world e grid-calib; misura di realismo in tools; README IT/EN e nota di automazione aggiornate · suite 372/372, build v0.1.41 · fccd9dd

- Biome quality-gate (src + gui): nessuna diagnostica ✅

- Esito suite di test: passati ✅ (372/372 test)

## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.

