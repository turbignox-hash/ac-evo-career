# EVO Pitwall — report build 0.1.16 (690c564)
_Data: 2026-10-25 · Aggiornamento da **v0.1.15**_

## Correzioni e novità
- Prova friend-install: estrazione dello zip amico e colpo d'occhio della scorciatoia in un desktop di prova · 900b2b6
- Checklist della prova a freddo: simulazione amico da pacchetto/clone e test griglia sul save 3 · 41db04a
- Primo avvio da Download ZIP: l'installazione si porta da sola al passo con main (stile ZtA) · 38a656d
- installa.cmd: installazione con un doppio click (stile Windows), in guardie al test sandbox · 690c564


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
