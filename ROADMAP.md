# ROADMAP.md — DA aperti

Aggiornata al **5/11/2026**. Fonte: [DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md).
Contiene **solo i DA non chiusi**; le voci chiuse restano nel diario. Le P0/P1/P2
della scansione non sono DA e non entrano qui. L'audit del 1/11 è storico:
[AUDIT.md](AUDIT.md).

Stato di riferimento: versione **0.1.59**, suite **983/983**, `npm run check`
esiste ed è la leva unica test + lint. In CI su GitHub: `quality` (test + lint su
push) e `verifica-release` (dopo la pubblicazione: 2 EXE con sidecar + pacchetto
amico, SHA-256 ricalcolati — piano riallineato il 5/11, run verde).

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
| **DA-7** | Pacchetto amico 0.1.59 GIÀ in release (5/11, tag `v0.1.59`): zip amico + due EXE offline/online con sidecar SHA-256, verificatore in CI verde. Restano le prove in pista (DA-1, DA-3) prima di chiamarle «distribuibile a un amico» e agganciare il post (DA-19). | DA-1, DA-3, DA-4 verdi. | Checklist release 5/11 ripetuta e registrata nel diario, asset tutti verificati. |
| **DA-19** | Post di presentazione: dalla bozza al post pubblico. | DA-7; screenshot e nomi degli schermi allineati; canale IT/EN scelto. | Post pubblicato sul canale scelto. |

## Periodiche

| ID | Cosa manca | Cadenza | Chiusura |
|---|---|---|---|
| **DA-6** | Audit dei dati di carriera, in sola lettura. Ultimo: 1/11. | Circa 2 settimane di gara viva o un update del gioco. | Report `report/audit-dati-*.md` con esito e anomalie censite. |
