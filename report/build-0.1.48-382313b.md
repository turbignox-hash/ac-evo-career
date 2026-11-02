# EVO Pitwall — report build 0.1.48 (382313b)
_Data: 2026-11-02 · Aggiornamento da **v0.1.47**_

## Correzioni e novità
- salvataggio 2/11: bottone «Punta la ronda in Agenda» nel pannello Eredità (agenda-choose della serie dell'impresa, verificato vivo sul save: risposta 200 {ok:true, nodeId:endurance_gt4} e ronda iscritta in Agenda); meteo automatico (wx-auto + registro) e icona meteo; margine sul 2° nel registro; cancellai livree chimere (tools/cura-livree); genera-uiapp con guardie e sorgenti src.js nel repo; note presentazione subreddit EN/IT; audit dati e banchi A/B del 1/11 — 782 test verdi — 0.1.48 · 382313b

- Biome quality-gate (src + gui): 2 diagnostiche ❌ (0 error, 2 warning)


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
