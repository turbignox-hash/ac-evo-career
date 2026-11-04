# ROADMAP.md — DA aperti

Aggiornata al **4/11/2026**. Fonte: [DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md).
Contiene **solo i DA non chiusi**; le voci chiuse restano nel diario. Le P0/P1/P2
della scansione non sono DA e non entrano qui. L'audit del 1/11 è storico:
[AUDIT.md](AUDIT.md).

Stato di riferimento: versione **0.1.58**, suite **916/916**, `npm run check`
esiste ed è la leva unica test + lint.

## In pista / da verificare

| ID | Cosa manca | Prossimo passo | Chiusura |
|---|---|---|---|
| **DA-1** | Prova in pista del copilota: bandiere + tagli. La prova del 30/10 ha visto il taglio, non la rossa nella MMF. | Sessione ACE con il protocollo di [PROVA-COPILOTA.md](PROVA-COPILOTA.md) §5. | Esito registrato; se la rossa non è nella MMF, si annota il limite del sensore (non un bug). |
| **DA-3** | Semaforo «prepara» del cruscotto mai visto caldo in gioco. | Lanciare «prepara» e guardare card e countdown in una sessione vera. | Semaforo acceso e countdown corretti senza ritocchi mancati. |
| **DA-4** | Banner di riavvio del server mai cliccato su un guasto reale. | Fermare il webui con una gara in corso; vedere banner e riavvio. | Banner e bottone riportano il server senza perdere l'istanza. |
| **DA-5** | Testday/practice: la metà radio non è mai stata ascoltata in un testday lungo. | Testday reale; radio e card fuori gara. | Niente posizione/gap inventati; radio onesta per tutta la sessione. |
| **DA-10** | Tinte del builder: tre fette fatte, resta il collaudo a vista sul via. | Template ricco di livree + serie con `tintePrestate`; poi gara. | Avversari con tinte DIVERSE a vista; template e cache coerenti; test verdi. |

## Bloccate / dipendenze

| ID | Cosa manca | Dipende da | Chiusura |
|---|---|---|---|
| **DA-7** | Release del pacchetto amico (versione corrente 0.1.58). | DA-1, DA-3, DA-4 verdi. | Pacchetto creato con zip asset e checklist di release completata. |
| **DA-19** | Post di presentazione: dalla bozza al post pubblico. | DA-7; screenshot e nomi degli schermi allineati; canale IT/EN scelto. | Post pubblicato sul canale scelto. |

## Periodiche

| ID | Cosa manca | Cadenza | Chiusura |
|---|---|---|---|
| **DA-6** | Audit dei dati di carriera, in sola lettura. Ultimo: 1/11. | Circa 2 settimane di gara viva o un update del gioco. | Report `report/audit-dati-*.md` con esito e anomalie censite. |
