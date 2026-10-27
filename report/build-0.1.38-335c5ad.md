# EVO Pitwall — report build 0.1.38 (335c5ad)
_Data: 2026-10-27 · Aggiornamento da **v0.1.37**_

## Correzioni e novità
- Copilota di nuovo parlante in italiano (+ prova sul cruscotto) e widget in gioco + Paddock · 3f88f4e
- Guide aggiornate: copilota sempre italiano (♪ prova sul cruscotto) e widget in gioco · a1dd68c
- Statistiche con medie per gara, classifica mondiale spiegata nel README e due bachi Biome · a523ca2
- Mondiale più visibile dal Cruscotto, economia per serie in Statistiche e soprannomi in blocco · 435ec15
- Documento di presentazione bilingue IT/EN: punti di forza di Pitwall, con la storiella del confronto su Paddock · facde13
- Widget Cruscotto in gioco: mini-classifica della serie, pannello mondiale e collegamento alla GUI · b631b8f
- Ore distinte per sessione (prove, qualifica, warm-up, gara): scritti nei blocchi del gamemodesave con setRaceSessions, warm-up e ora gara come override in regole gara, pannello GUI coi due nuovi campi · 086f4c7
- Navigazione stile Football Manager: tutto cliccabile · a486e67
- Prova senza fallimenti: auto cliccabile nel pannello Regole del weekend + note di navigazione nelle guide · dd3cbaa
- Auto cliccabile in tutta la GUI: aiutante carLinkHtml + Cruscotto completo · e69e649
- Libro delle auto: ricerca per parole invece che letterale · c54783d
- Serie e piste cliccabili ovunque + guida amica allineata + post con punti di forza · b1c0d01
- Auto della giornata: selettore nel riquadro + nota cliccabile nella guida EN · bb886f1
- Giri liberi: il meteo dei vecchi capitoli si ripulisce dal nome enum di EVO · 05d7aa2
- Serie del cruscotto che apre la scheda nei Campionati + footer con lingua copilota e cause di cassa tradote · 335c5ad

- Biome quality-gate (src + gui): non leggibile qui (Bad control character in string literal in JSON at position 1043319 (line 1 column 1043320)) — controllare a mano con npx @biomejs/biome@2.3.12 check src gui


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
