# EVO Pitwall — release v0.1.26 (880ff3b)
_Data: 2026-10-25 · Aggiornamento da **v0.1.25**_

## Correzioni e novità
- **«Prepara tutto» parla davvero** (la lezione del PC 2, pista Mount Panorama): il bottone ora riferisce la pista — «pista Imola scritta: rientra nel weekend dal menu di EVO», «pista già Imola: nulla da scrivere» oppure «⚠ pista NON aggiornata: apri il weekend in EVO dal menu e ripremi Prepara». Prima tacendo spingeva a credere che non avesse fatto nulla (la scrittura c'era, il messaggio no).
- **Toast completo**: nel bottone di gara ora compaiono anche l'auto («pronta al prossimo avvio di EVO») e gli errori pista/auto, oltre a ora e giri già noti.
- **Fila API senza ingorgo** (il flood «[coda] ferma da 20s»): la scansione MoTec dell'ingegnere LIVE va in memo 30s per auto — su un disco lento tratteneva l'intera fila del server; il sondaggio «il gioco è vivo?» allarga la finestra a 30s quando `tasklist` è lento (WMI assediato, antivirus).
- **Collaudo dell'installazione pulita**: nuovo `tools/_sim-prepara.mjs` — simula l'intero ramo «Prepara» su un save sandbox con campioni reali (pista, contatori nativi 3.7/3.10, griglia dalla fabbrica, ora/scala). Succede così che un difetto vien fuori sul disco di casa, non sul PC di un amico.
- Suite completa **217/217**; i test girano anche dentro la zip del pacchetto.

## Come si aggiorna
- **Installazione-zip (pacchetto-amico)**: la barra in alto dice «Aggiornamenti di progetto pronti su GitHub» → bottone **Aggiorna ora** (zipball + copia + test; il server si riavvia da solo). Se il repo è privato serve un token di lettura in `data/.github-token` — la barra lo dice e non forza nient'altro.
- **Chi ha la vecchia 0.1.23 sul disco**: l'aggiornatore DI QUELLA build si ferma col falso «repo è privato» — scarica la zip di QUESTA release ed estraila sulla cartella d'installazione (sovrascrive il codice, `data/` col save resta intatto).
- **Clone git**: barra «Aggiorna ora» o `sincronizza-git.cmd`.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
