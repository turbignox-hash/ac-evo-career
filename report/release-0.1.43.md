# Release v0.1.43 — build 37c762a → 5008f99

## Griglie di fabbrica e multiclasse
- **Fabbrica automatica delle griglie**: il guardiano delle griglie (raccogli-griglie) ora non fotografa solo il customgrid all'arrivo da EVO: rilancia da solo il generatore delle multiclasse, così ogni serie appena fotografata allatta subito le altre ancora senza materiale.
- **5 multiclasse di fabbrica** (config/griglie-fabbrica): campionato_aperto, campionato_epoca, campionato_moderno, campionato_strada, campionato_pista (più sport_moderno). **86 serie con calendario, 86 griglie di fabbrica**: nessun PC vergine resta a mani vuote.
- **Campionato Corsa** (pool da 2: BMW M4 GT3 vs Ferrari 296 GT3): griglia di fabbrica inclusa e regola del builder adeguata — un pool dichiarato da 2 vetture è valido quando il file porta l'INTERO pool, senza più il vincolo dei ≥3 modelli pensato per i pool multi più grandi.

## Guardie anti-cheat estese (DA-11)
Il cancello del meteo presidiava solo il meteo. Ora **le guardie valgono per orario e distanza**: le garanzie sul gamemodesave (durata, orario, giri/distanza) girano nello stesso cancello; spenta la modalità test tornano da sole. Il rifiuto del guardiano è visibile nel webui.

## Server/GUI
- **Pannello «Gara al volo» in cima alla vista Pratica** (▶ PARTE SUBITO con l'ultima ricetta registrata e campi durata/banda/sedile/pista).
- **Paddock app senza carriera**: `/api/paddock` risponde sempre col JSON composto (consigli { live:false, tips:[] } con l'app non installata) — prima in un'installazione vergine rispondeva 400 (5008f99).
- Priorità ronda-vetrina: la ronda corrente non viene più soffocata dalla vetrina.
- Titoli aggressivi del ladder e della gazzetta (26 raccomandate «Moderne vs Epoca» stile).

## Strumenti
- Narrazione voce: **narratori unificati in una sola copia** (gui/js/narratore-unito.js condivisa tra server e vista).
- Limiti push e pulizia: potatura .bak condivisa in UNA fonte (pruneBackups in evo-grid), guardie di riga/modello nella calibrazione.## Prove
- `npm test`: **642/642 verdi** (commessa 0.1.43 in forza).
- `pacchetto-amico`: **test nel pacchetto PASSANO** (npm test dentro la cartella estratta), 510 file · 9056 KB, SHA-256 del zip nell'asset.
- Paddock vergine: `/api/paddock` 200 senza carriera (test webui smoke dentro il pacchetto).
