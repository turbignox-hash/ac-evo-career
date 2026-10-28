# EVO Pitwall — report build 0.1.40 (cca094c)
_Data: 2026-10-28 · Aggiornamento da **v0.1.39**_

## Correzioni e novità
- Dizionario auto nel pacchetto amico: l'amico non parte più col garage fuori dizionario · 678b945
- Prepara tutto: guard sul selettore auto e console che non cancella le righe · 15bf0b6
- Piano orario realistico delle sessioni del weekend · cd827a6
- Prepara tutto: veri tentativi di lettura per il contatore griglia · 82966cd
- Copilota: impronta di sessione dalla MMF, niente posizioni vecchie all'avvio gara · 10cb3b7
- Centro gare: la scheda nata dal hover si chiude appena esci dalla card · 2d04125
- Gamemodesave: lettura di riserva dagli snapshot quando il file vivo resta indecodificabile · b698f02
- Cambio auto in gioco: sequenza completa di Paddock (tipo gara, pista, auto) e riprova ragionata · 30eb85d
- Campionati procedurali: pescaggio a sorte i cinque livelli + schede in GUI (seed, pool, regole, calendario) · build di fine sessione · cca094c

- Biome quality-gate (src + gui): nessuna diagnostica ✅

- Esito suite di test: passati ✅ (281/281 test)

## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
