# EVO Pitwall — report build 0.1.53 (19c7d57)
_Data: 2026-11-03 · Aggiornamento da **v0.1.52**_

## Correzioni e novità
- salvataggio 3/11 (sera): voce di diario «Notizia del 2/11» — Messaggi e i tab del gruppo Gara (Centro gare #ag-advance, Griglia #g-tbody, Garage #g-mech, Risultati #imp-result, più Setup/Analisi/Piste/Auto) sono GIÀ coperti dalla guardia di layout, insieme a tutti i vicini del giorno di gara: registrazione della copertura con la linea del tempo (guardia nata il 2/11 per Impostazioni, Griglia/Garage entro il 2/11 coi loro marcatori, Messaggi nella stesa «tutti i tab» del 3/11 con #mx-posta) e la regola operativa: si tocca la vista, si gira il check intero come da legge di COMANDI-BUFFY.md. Nessun file di codice toccato — solo registrazione · bump 0.1.52->0.1.53 · 19c7d57

- Biome quality-gate (src + gui): 2 diagnostiche ❌ (0 error, 2 warning)


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
