# EVO Pitwall — report build 0.1.9 (8dcceef)
_Data: 2026-10-24 · Aggiornamento da **v0.1.9**_

## Correzioni e novità
- report: pubblicare i report da report/ alla radice (data/ resta ignorata) · 29c0e50
- Pacchetto amico + test autosufficienti: niente più dipendenze da data/ · 6e655ad
- Test githubRepo: senza .git (pacchetto amico estratto) aspetta l'assenza, senza crash · 9a99ba2
- NOTE: come si fa il pacchetto amico e la regola "test senza dipendenze da data/" · 2bf51e1
- Fix "Impossibile trovare il file 'EVO Pitwall Slot 3'": start senza titolo vuoto · 8dcceef


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
