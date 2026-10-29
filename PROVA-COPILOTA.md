# PROVA LIVE DEL COPILOTA — protocollo di stasera (28/10)

La questione del copilota si affronta su pista vera: questa pagina è tutto
quello che serve. Prima la correzione è già dentro (il contatore giri è
MONOTONO: niente più reset della metà gara), il test sintetico la copre
11/11 (28/10 notte: + reset a spunto live, + bandiera blu, + contratto
ingegnere in test a parte), e il vecchio registro della sera accusa il
difetto a confronto:
`metà gara annunciata ×33` — ogni frame i litri calavano, la frase cambiava
testo e scavalca la guardia, e il flag veniva riaperto dal contatore che
tornava indietro. Prova a riprodurre: quella famiglia di loop è morta.

## 1. Prima di partire (2 minuti)

1. **WebUI acceso** — se il browser Pitwall su `127.0.0.1:8642` risponde, ok;
   altrimenti doppio click su `avvia.cmd` (o `node src/webui.mjs`).
2. **Monitor acceso** in un terminale della cartella progetto:
       node tools/_monitor-copilota.mjs 8642
   Scrive ogni frase candidata in `data/copilot-8642-24-10.jsonl`.
   Copia le righe qui sotto quando something appare strano.

   ⚠ AUTODIFESA (28/10 notte): se a schermo esce «il codice è cambiato su
   disco da quando sono partito», il monitor è appena uscito da solo —
   un istanza vecchia non deve più scrivere il log con la voce di ieri
   (il registro della gara muto di stanotte non conteneva la chiave
   `flag` per questo, e non per un bug del gioco). Rilancia semplicemente
   il comando di qui sopra (o attendi l'aggiornamento del diario).
3. **Copilota ON** nella scheda Cruscotto (pill `🔊 copilota ON`, o la barra
   «🎧 Ingegnere LIVE» → click `copilota`): ascolta la frase di attivazione
   («Copilota attivo»).
4. Nel gioco la pagina Cruscotto (o il browser) resta VISIBILE: la voce nasce
   lì, non dal gioco.

## 2. La gara di prova (qualunque, ma di 3 giri)

Carica una sessione RACE nuova (anche griglia avversari ridotta). La firma
della sessione nuova vede memoria a zero e 20 s di silenzio: la prima mezza
minuta non conta.

Che cosa DEVE sentire, in ordine e una volta sola:

- **Giro 1 in 12.3 s** … ecc. al passaggio sul traguardo (con il tempo, al
  massimo un giro di ritardo se l'HUD aggiorna tardi — controlla il log);
- **Benzina per N giri** solo se i giri copribili scendono davvero;
- **Meta gara: X litri, per Y giri** UNA sola volta, al primo giro della
  seconda metà (su 3 giri: al taglio del giro 1 — non è in anticipo: la
  seconda metà parte lì);
- **Ultimo giro!** UNA volta, quando si entra nell'ultimo giro;
- **Bandiera a scacchi!** UNA volta al taglio del giro finale;
- posizioni perse/guadagnate: al massimo una ogni 30 s.

- su una gara A TEMPO (il HUD mostra i secondi che restano): inoltre
  **«1 minuto!»** a T-1:00 e **«10 secondi!»** a T-0:10, una volta sola
  ciascuna — tacche snelle che non spostano ordine al resto; se il
  display resta a zero si sente «Tempo scaduto!» (30/10 sera).

- su una gara ENDURANCE (multi-classe, griglia mista): al primo
  doppietto, **Bandiera blu: chi ti doppietta ti sta sotto…** UNA volta
  a doppietta aperta, il silenzio mentre resta aperta, e il RIDIRE alla
  doppiettina successiva (guardia 70 s). Controprova sul registro: la
  riga della doppietta porta `"flag":"blu"` e il GREZZO `flagCode:4`
  (28/10: `flagCode`/`globalFlagCode` nel log, per distinguere un
  «campo assente» da un «valore nuovo di EVO fuori mappa»). Se la riga
  NON c'è e nessun blu arriva: guardare prima l'AVVIO MONITOR (una
  vecchia istanza è la prima sospetta) e poi il `flagCode` grezzo —
  se la cifra è fuori da 0–10 la mappa FLAG vuole una riga nuova e il
  registro ce l'ha denunciata da solo (i flagCode restano nel log).

Cosa NON deve sentire (i sintomi di stasera):

- «Meta gara …» ripetuto più di una volta (il loop ×33 di stasera);
- «Giro 4» o «Ultimo giro» su una gara da 3 che è già finita (il taglio in
  più è artefatto telemetria: la voce ora non lo riceve mai);
- annunci in ritardo di minuti: la coda della voce ora si svuota da sola
  (oltre i 2 discorsi in coda, i vecchi cedono il posto).

## 3. Verdetto (a gara finita, 30 secondi)

       node tools/_monitor-copilota.mjs --riepilogo data/copilot-8642-24-10.jsonl

Legge tutta la prova e chiude il cerchio: frasi in ordine, ripetizioni
vicine denunciate con `⚠ RIPETUTA dopo Ns`, bilancio finale in fondo
(`metà gara ×1 · ultimo giro ×1 · bandiera ×1` = prova piena). Se esce
«nessuna anomalia», la questione copilota è chiusa per iscritta
e va applicata pure alla nota nel diario (NOTE-AUTOMAZIONE.md).

## 4. Se qualcosa spuria ancora

1. Copia e incolla le righe del log che circondano la frase (con `dati:` se
   c'è): contengono lapsDone / lapsTotal / fuel del frame esatto.
2. NON ri-scrivere la logica a mano: la vista e il monitor sono gemelli
   (stesso narratore) e il test li tiene uniti — cambiare uno spezza l'altro
   (test/copilota-narratori.test.mjs nelle 6 gare sintetiche).
