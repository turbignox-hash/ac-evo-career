# EVO Pitwall — report build 0.1.42 (a39740b)
_Data: 2026-10-28 · Aggiornamento da **v0.1.41**_

## Correzioni e novità
- gazzetta.mjs rispetta EVO_DATA_DIR come gli altri registri: il flaky del test 80 voci nasceva dal foglio condiviso col launcher vero (stesso data/news.json in lettura/scrittura durante la suite) · a4fe251
- Nota di automazione: la lezione del flaky della gazzetta (foglio condiviso col launcher vero, cura con EVO_DATA_DIR) · 65753cb
- gazzetta: titoli per-round dallo storico + gazzetta di stagione in pagina unica · 04b05cd
- diario: la gazzetta impara a ricordare (titoli per-round + foglio di stagione) · 7fac658
- griglia sim: la classifica corre larga quanto il massimo visto nei risultati reali · d36d31b
- nota di automazione: la griglia sim allargata alla griglia vera (30/10) · 99a1cc8
- paddock e respiro di metà stagione sul campo largo della classifica · 264ae47
- nota: completata la coerenza del campo largo (paddock + pulse) · b3ab4d4
- nota: verifica del campo largo alla misura di realismo (titoli restano in gioco) · 2ad1a11
- griglia tipica nelle card: serie, agenda e CLI series sul campo largo · e1a898c
- test: UCCIDE il flaky del test CAR_MISSING (bak-apply del minutato) · 6c961c5
- Audit dati 28/10: rapporto esportato e nota data/ nei README · 5c4de1c
- README IT/EN: gazzetta di stagione, campo largo della sim e backup automatico del save · 8e55a6c
- campo largo anche nelle viste: header, elenco serie e clausole di contratto · f53bdc7
- nota: scrittura garage del Prepara tulata dal save del gioco aperto (28/10) · d26406f
- nota: coerenza card rivali sul campo largo riversa (28/10) · 4d8acbc
- Scan garage-reale fuori dal premio (falsi posseduti), guardia anti-doppio server, esclusioni salva-save, spazzata 295 bak, test restore 701 file · a39740b

- Biome quality-gate (src + gui): nessuna diagnostica ✅


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
