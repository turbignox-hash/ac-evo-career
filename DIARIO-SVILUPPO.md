# Diario di sviluppo

Il diario racconta IL FATTO (ciò che è fatto e verificato); la lista dei DA aperti
vive in [ROADMAP.md](ROADMAP.md). Ogni giorno prendiamo qualcuna di quelle voci e la
eseguiamo; a fine giornata il diario si arricchisce e la roadmap si accorcia o si
affina. Le voci hanno un ID (DA-1, DA-2…) per prenderle al volo («oggi prendo la DA-3»).

### 4/11 — Due bottoni: «Prepara tutto» e «Prepara tutto e avvia» (richiesta Mauro: «rinomina il pulsante prepara tutto e divertiti in Prepara tutto, e aggiungi sotto un bottone identico “prepara tutto e avvia” ma con una differenza, il primo prepara tutto e basta, dal gioco bisogna premere avvia sessione per partire, il secondo invece ti porta direttamente in pista»)

- **Le etichette**: «Prepara tutto e divertiti» → «Prepara tutto» nella scheda gara, nel pannello eventi, nei testi di reset e nelle guide (GUIDA-AMICO, FAQ-GARAGE).
- **I due gesti**: il primo chiama `race` con `preparaSolo: true` — iscrizione, weekend, griglia e card, NESSUN lancio, e `markPending(..., { autoAvvio: false })` lascia `avviaFino = 0` (l'app Cruscotto non preme mai «Avvia sessione»: il via è a mano). Il secondo chiama `race` senza flag — apre il gioco e arma la finestra di 30 minuti, così l'app preme «Avvia sessione» da sola appena il weekend è pronto.
- **Preflight**: il controllo della griglia di un'altra serie vale per entrambi i bottoni (il `noLaunch` interno del CLI resta esente).
- **Verifica**: `node --check` su race/webui/viste-a/test; test mirati **24/24**; suite **967/967** (0 fail/skip, con EVO aperto); `npm run lint` **370 file, 0 warning**.
- **Nota**: commit, non push; restano fuori le 5 modifiche preesistenti.

### 4/11 — Griglie per campionato: ognuna il suo numero (12, 14, 16, 18, 20), tetto 22 (richiesta Mauro: «aspetta, non per tutti i campionati 20-22 differenzia random, alcuni possono partire con 12,14,16,18,20 dipende dal tipo di auto e campionato scelto, non voglio tutte le griglie con lo stesso numero, varia in base al campionato»)

- **La correzione**: il tetto unico 20-22 appiattiva tutte le serie. La regola ora è per campionato: `celleGrigliaCampionato(node)` = `node.gridSize` del ladder (già diverso per tipo di auto: coppa città 12, trofeo MX-5 e campionato moderno 14, DTM Legends 16, Touring Pro 18, GT Apex 20), pari e dentro **[12, 22]**. Deterministico: la stessa serie porta sempre lo stesso numero, non un sorteggio che cambia a ogni round.
- **Il gate**: in CUSTOM il bersaglio è `min(target della serie, atteso nativo con minimo 12)`; quando il weekend dichiara più auto (27/28) si riducono prima le voci 3.10 e si porta il 3.7 agli avversari, poi si scrivono le celle e si trapianta il roster. L'allineamento del nodo è ora esatto in entrambi i modi (il restringimento è lecito perché il weekend è già stato riallineato).
- **Verifica**: dry-run sul save reale — `campionato_moderno`: **28 → 14 auto**, weekend a 13 avversari, `written:false`; varietà confermata (`coppa_citta` 12, `trofeo_mx5` 14, `dtm_legends` 16, `touring_pro` 18, `gt_apex` 20); `npm test` **966/966**, `npm run lint` **370 file, 0 warning**.
- **In scheda** (richiesta Mauro 4/11): la riga «Avversari» porta ora anche il numero del campionato accanto a quello del weekend quando divergono — sul save reale: `27 auto · … — serie: 13 · weekend: 27 (Prepara tutto allinea)`, con `card.gridSerie` e `gridSize`/`gridSource` a disposizione di GUI e CLI. Solo multiclasse: le monomarca restano generate da EVO (modello Paddock).
- **Coerenza**: anche il passo griglia del CLI `ronda` ora riduce le voci 3.10 con `riduciSlotRoster` (prima il 3.7 scendeva da solo e il weekend restava a 27 voci fino al Prepara).
- **Nota**: commit, non push; restano fuori le 5 modifiche preesistenti.

### 4/11 — Griglie di campionato 20-22 auto (richiesta Mauro: «26-28 auto sono troppe, fai in modo che i campionati generino griglie da 20-22»)

- **Da dove nascevano i 27/28**: non dal ladder (`gridSize` massimo 20), ma dal gate di `rebuildGridApply` che allineava il customgrid al conteggio NATIVO del weekend. Sul save reale (Monza): `3.7 = 27`, voci 3.10 = 27 → bersaglio 28 celle.
- **La regola**: una sola fonte in `tools/set-track.mjs` — `GRIGLIA_CAMPIONATO { min: 20, max: 22 }` e `celleGrigliaCampionato()`; `pianoGriglia` non supera più 21 avversari.
- **La discesa sicura**: in CUSTOM EVO dimensiona il via su `3.7 + la tua auto`, ma `weekendCarCount` scandisce anche le voci 3.10. Il gate ora scrive PRIMA il weekend — il nuovo `riduciSlotRoster` riduce le 3.10 agli stessi avversari e `setWeekendGridCustom` porta il 3.7 a 21 — e solo dopo scrive le 22 celle col trapianto roster. Se il weekend non si lascia scrivere, il cap non si applica (22 celle contro 27 attese è il 0xC0000005 della lezione 24/10).
- **Verifica**: dry-run sul save reale — `campionato_moderno`, Monza: piano **28 → 22 auto (21 avversari)**, report `gridSize 22`, `written:false`; `npm test` **966/966** (3 nuovi in `griglia-campionato`), `npm run lint` **370 file, 0 warning**.
- **Nota**: commit, non push; restano fuori le 5 modifiche preesistenti.

### 4/11 — suite con EVO aperto: test isolati dal save reale (richiesta Mauro: «Il passo successivo più utile sarebbe rendere la suite affidabile anche con EVO aperto, isolando i test che oggi leggono il save reale.»)

- **Griglie**: `test/grid-templates.test.mjs` aveva un `import { readCells }` statico in fondo; per l'hoisting ESM veniva valutato prima di `ACE_GAME_SAVEDIR`, caricava `evo-grid` col save vero e il gate leggeva 27 vetture. L'import è ora dinamico dopo l'ambiente sandbox; il test passa 17/17.
- **Semina**: la guardia `EVO è APERTO` bloccava anche la sandbox. `seminaCampionato` accetta ora `gameOpen` iniettabile (default `gameRunning`); il test passa `() => false` solo nella sua sandbox. CLI e chiamanti di produzione restano identici.
- **Sonda**: `diffesa-sonda` scambiava per colpo il battito `voce-panello.json`, aggiornato dal timer del server durante lo sweep lento; è ora rumore di fondo riconosciuto, mentre ogni altra scrittura resta sotto la lente.
- **Verifica**: `npm test` → **963/963**, 0 fail/skip in 45,6 s con `AssettoCorsaEVO.exe` aperto; `npm run lint` → **369 file, 0 warning**; `grid-templates` 17/17 e `diffesa-sonda` 4/4 in isolamento.
- **Nota**: commit di test/tool + diario, non push; restano fuori le 5 modifiche preesistenti.

### 4/11 — Dashboard a 256 px: le chip dei rivali restano dentro la scheda (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Il difetto**: il test `layout-impostazioni` era l'unico rosso della suite. A 256 px rilevava due sovrapposizioni `span.chip.gold ⟂ span.chip` dentro `#card-panel`: la chip esterna dei rivali era larga 144 px, ma il blocco «forma: 7 2 2 2 2» (un `inline-flex` senza wrap) arrivava a 219 px e usciva dal bordo destro (192 px). A 320, 360, 480, 1250 e 1920 px non succedeva.
- **La cura**: una sola riga in `gui/js/viste-a.js`: il blocco forma della chip rivale ora ha `flex-wrap:wrap`, `min-width:0` e `max-width:100%`. Le cinque chip della forma vanno a capo dentro la chip esterna; il desktop non cambia.
- **Verifica**: `node --test test/layout-impostazioni.test.mjs` → **1/1** (21 tab × 6 viewport, 45,1 s); `npm run lint` → **369 file, 0 warning**; `git diff --check` pulito. La suite completa (`npm test`) resta **951/963** (11 rossi, 1 skip) per cause esterne alla modifica: 8 in `grid-templates` (il gate legge 27 vetture dal save reale), 2 in `semina-campionato` (guardia `EVO è APERTO`, l'utente sta giocando) e 1 in `diffesa-sonda` (in isolamento passa 4/4). Il test di layout è verde da solo e nella suite.
- **Nota**: commit di `gui/js/viste-a.js` + questo diario, non push; restano fuori le 5 modifiche preesistenti.

### 4/11 — webui.mjs: estratta la Manutenzione col suo tick (P1.5, quinto dominio) (richiesta Mauro: «Ora che il contratto è protetto, il passo successivo più naturale è completare l’estrazione di maintenance con il suo tick periodico.»)

- **Il taglio**: maintenance vive in src/webui-actions-maintenance.mjs con la rotta, maintenanceTick, autoRepairEnabled, lastAutoRepairAt e startMaintenanceTicker (primo giro a 2,5 s, poi ogni 10 minuti). webui.mjs conserva il dispatcher e chiama solo l'avvio.
- **Confine**: nessun cambio a status, payload, conferme, persist o cadenze; il modulo integrità/backup aggiorna il commento che indicava la vecchia casa.
- **Contratto**: il test generico riconosce ora **5 moduli / 22 azioni**; maintenance ha il suo case e resta in SOLO_POST. Nessuna modifica al test.
- **Sonda HTTP** (sandbox con save copiato): scan 200 con 3 issue, auto-status 200 true, tick 200 skipped:true (sandbox), clear-messages senza conferma 409, op invalida 400, toggle off/on coerente.
- **Verifica**: node --check pulito; lint **369 file, 0 warning**. npm run check **non verde**: 962/963; l'unico rosso è layout-impostazioni a 256 px (due chip della Dashboard), riprodotto in isolamento e con una sola corsia. Nessun file GUI/CSS è stato toccato da questo refactor; il difetto va trattato a parte.
- **Misure**: webui.mjs **4.457 → 4.391 righe** (−66); nuovo modulo **96 righe**. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — webUI: boot leggero con carriera, contenuti solo in Impostazioni (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Problema**: con una carriera attiva il boot pagava la scansione contenuti dentro viewSetup, ma quei dati servono solo a Impostazioni (banner scala carriera); il primo boot con dati grandi restava il pezzo più lento.
- **Modifica**: viewSetup(..., { scan: false }) nel boot quando state esiste; /api/setup continua a restituire il setup completo. Impostazioni lo carica on demand con pannello «Controllo installazione…» e guardia contro render stantio; onboarding senza carriera resta completo.
- **Misure** (sandbox, cartella dati grande, save copiato): boot1 **357,7 → 171,8 ms** (prima un giro, dopo mediana di 3; −52%); boot2 **13,2 → 14,0 ms**; ready, status, card e ping stabili. Sonda con carriera: boot light:true, content 0/issues null; /api/setup light:false, 190 auto/19 piste, 190,1 ms.
- **Verifica**: npm run check exit 0; suite **963/963**; lint **368 file, 0 warning**; node --check su 4 file; sonda reale con hasCareer:true.
- **Limite**: la prima apertura di Impostazioni paga la scansione (fino a ~2,3s a freddo sul dataset di prova) e mostra il caricamento; il boot non la paga più.
- **Nota**: 5 modifiche preesistenti fuori; commit, non push.

### 4/11 — webUI: boot parallelo e cache, prima schermata più veloce (richiesta Mauro: «controlla la webUI, migliora velocità di avvio e risposta»)

- **Misure** (3 avvii, sandbox con copia del save): server pronto **341→332 ms** (sostanzialmente stabile); `/api/boot` a freddo **248→178 ms**; a caldo **159→15 ms**; status **9,1→9,1**; card **73,8→73,7** e **37,4→36,5**; ping **6,3→5,9**. Tempo fino al primo boot **589→510 ms** (−13,4%).
- **Boot**: `gameRunningMemo()` parte prima di setup/header/mailbox/feedback, così la tasklist (70–85 ms) corre in parallelo; il memo in-flight evita una seconda tasklist se watcher e boot coincidono.
- **Report**: memo per processo di `githubRepo` e `buildVersion`; il link di segnalazione non rilancia `git remote`/`rev-parse` (95 ms) a ogni boot.
- **Contenuti**: `scanContentCached` passa da 30 s a 5 min. Sul dataset di prova la scansione fredda è ~2,3 s, quella in cache 3,6 ms. Il primo scan a freddo può ancora costare; il TTL evita di ripagarlo a ogni riapertura ravvicinata.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **368 file, 0 warning**; `node --check` e Biome sui tre file puliti.
- **Nota**: nessun cambio di payload o status. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — test: contratto dei moduli azioni blindato (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Gap**: il test controllava solo le rotte di `SOLO_POST`; una rotta senza case, un case fuori dal set o una rotta condivisa da due moduli poteva passare inosservata.
- **Rinforzo**: per ogni `webui-actions-*` ora verifica che ogni azione abbia un case, che ogni case sia nel set, che nessun set sia vuoto e che la stessa rotta non appartenga a due moduli.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **368 file, 0 warning**; test da **105 a 120 righe**.
- **Nota**: test-only, nessuna modifica di produzione. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — webui.mjs: estratte integrità e backup (P1.5, quarto dominio) (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Il taglio**: `integrity`, `integrity-fix`, `backup` e `save-backup` vivono in `src/webui-actions-integrity-backup.mjs`; il dispatcher le intercetta prima dello switch. Status, payload e comportamento sono identici.
- **Confine**: `maintenance` resta in webui perché possiede `maintenanceTick` (auto-riparazione ogni 10 minuti) e i suoi helper; `listBackups` resta locale e viene passato al modulo.
- **Contratto statico**: il test generico riconosce ora **4 moduli / 21 azioni** e verifica anche `backup`, `save-backup` e `integrity-fix`; nessuna modifica al test è stata necessaria.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **368 file, 0 warning**; `node --check` e Biome sui due file modificati puliti.
- **Misure**: `webui.mjs` da **4.466 a 4.444 righe** (−22); nuovo modulo **54 righe**. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — webui.mjs: estratte le sei rotte del Garage (P1.5, terzo dominio) (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Il taglio**: `my-garage`, `garage-catalog`, `garage-add`, `garage-remove`, `garage-note` e `garage-sell` vivono in `src/webui-actions-garage.mjs`; il dispatcher le intercetta prima dello switch. Status, payload e `persist` sono identici: nessun cambio di comportamento.
- **Confine**: il `case 'garage'` rimasto in webui **non** è il garage personale, è l'aiuto-meccanico (pressioni/telemetria); `addCar` e `garageOverview` restano importati per il relic di famiglia.
- **Contratto statico**: il test generico riconosce ora **3 moduli / 17 azioni** e verifica anche `garage-add`, `garage-remove`, `garage-note` e `garage-sell`; nessuna modifica al test è stata necessaria.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **367 file, 0 warning**; `node --check` e Biome sui due file modificati puliti.
- **Misure**: `webui.mjs` da **4.499 a 4.466 righe** (−33); nuovo modulo **61 righe**. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — webui.mjs: estratte le azioni Evento (P1.5, secondo dominio) (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi,»)

- **Il taglio**: le cinque rotte di stato (`event-accept`, `event-decline`, `event-finish`, `event-abandon`, `event-prize-refresh`) vivono in `src/webui-actions-events.mjs`; il dispatcher le intercetta prima dello switch. Status, payload e `persist` sono identici: nessun cambio di comportamento.
- **Perché non tutto**: `events` è una vista e `event-prep` orchestra gridbuilder, backup, meteo e launcher; restano in `webui.mjs`, non sono azioni di stato pure. Estrarli avrebbe richiesto un passaggio di dipendenze troppo largo.
- **Contratto statico**: `test/diffesa-sonda.test.mjs` ora legge tutti i `webui-actions-*.mjs`, incrocia `*_ACTIONS` e i `case` e verifica che ogni rotta di `SOLO_POST` abbia un case vero. Copre **2 moduli / 11 azioni**.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **366 file, 0 warning**; `node --check` e Biome sui tre file modificati puliti.
- **Misure**: `webui.mjs` da **4.524 a 4.499 righe** (−25); nuovo modulo **52 righe**; test da **95 a 105 righe**. Commit, non push. Restano fuori le 5 modifiche preesistenti.

### 4/11 — potatura-fasce: il confine 2,5 s non falsa la finestra (richiesta Mauro: «scegli autonomamente cosa migliorare e procedi, sei autorizzato a modificare se porta benefici»)

- **Il flake**: il test seminava `attorno-1…attorno-40`. Se il tick attraversava il confine, scriveva `attorno+1` e le 12 fasce dietro restavano `attorno-12…attorno-1`: la più vecchia era 13 dietro il nuovo corrente. Non era la potatura rotta: era la semina che non conteneva lo slot corrente.
- **La cura**: `affollaFasce` semina ora lo slot corrente + 40 dietro (41 file); il tick può sovrascriverlo, ma se attraversa il confine quella fascia è già la prima dietro e la finestra resta esatta. Nessuna asserzione allentata.
- **Verifica**: 40 esecuzioni consecutive del test (**120 test eseguiti**) tutte verdi; `npm run check` exit 0; suite **963/963**; lint **365 file, 0 warning**; `node --check` e Biome sul test puliti.
- **Nota**: test-only, nessun codice di produzione. Committato, non pushato. Restano fuori le 5 modifiche preesistenti.

### 4/11 — documenti: AUDIT storico e ROADMAP dei soli DA aperti (P2.9) (richiesta Mauro: «P2.9 — documenti: AUDIT.md è fermo a “650 test, non esiste check”; andrebbe marcato storico e affiancato da un ROADMAP.md con i soli DA aperti.»)

- **AUDIT.md**: titolo e testa marcati **STORICO** — fotografia al 1/11/2026, quando la suite era 650/650 e `npm run check` non esisteva. Il corpo non è stato riscritto: resta la base dell'audit.
- **ROADMAP.md**: nuovo file con **soli 8 DA aperti** — DA-1, DA-3, DA-4, DA-5, DA-6, DA-7, DA-10, DA-19 — divisi in «in pista», «bloccate/dipendenze» e «periodiche», ognuno con prossimo passo e criterio di chiusura. Le DA chiuse restano nel diario.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **365 file, 0 warning**; `git diff --check` pulito. Nessun codice toccato.
- **Nota**: committato, non pushato. Restano fuori le 5 modifiche preesistenti.

### 4/11 — copertura: engineer.mjs ha 17 test, P1.7 è un falso positivo (richiesta Mauro: «P1.7 — copertura: la scansione dice “engineer.mjs 1 test”, ma test/ingegnere.test.mjs ne ha già più di dieci (fasi, pit, bandiere, postalk): non è la priorità che sembrava.»)

- **Verifica**: `test/ingegnere.test.mjs` ha **17 test** e importa direttamente `pitWindow` e `engineerLive` da `src/engineer.mjs`; `node --test test/ingegnere.test.mjs` → **17/17**, exit 0. Copre path/delta, finestra pit, fasi, bandiere e poll con EVO chiuso.
- **Perché il contatore diceva 1**: il modulo è `engineer.mjs`, il test è `ingegnere.test.mjs`; un match per nome file non li collega. La copertura vera sta negli import, non nel nome.
- **Decisione**: P1.7 chiusa come falso positivo; **nessun test aggiunto e nessun codice toccato**. La priorità resta su P1.5 (prossimo dominio da estrarre) e sul flake di `potatura-fasce`.
- **Nota**: diario committato, non pushato. Restano fuori le 5 modifiche preesistenti.

### 4/11 — catch muti: audit di scritture e salvataggi (P1.6) (richiesta Mauro: «P1.6 — catch muti: sono 308, ma molti sono letture opzionali legittime; serve un audit mirato su scritture e salvataggi, non una passata indiscriminata.»)

- **Il taglio**: nessuna passata indiscriminata. L'audit automatico su `src`+`tools` ha isolato **129 catch vicini a una scrittura** (molti falsi positivi: il catch è della lettura successiva); i **13 punti con un effetto su dati/backup** ora non spariscono: **12** passano da `writeOrWarn`, che conserva il fallback e annota il fallimento in `errors.jsonl`; la copia `.corrupt` del ledger usa `recordWarning` e distingue l'esito.
- **Salvataggi e registri coperti**: `journal.mirror` (calendario specchio), `uiapp.persist` (tick eredità), `import.backup`, `import.log`, `import.learn-car`, `grid.template`, `grid.meta`, `grid.stale`, `grid-calib.log`, `grid-calib.backup`, `orario.backup`, `report.markdown`. La copia `.corrupt` del ledger ora distingue anche il caso in cui la copia **non** riesce, invece di dire sempre «salvata».
- **Niente percorsi fantasma**: se il rapporto `.md` non si scrive, `rapportoGara` restituisce `salvatoMd: null`; prima restituiva un percorso che sul disco non esisteva.
- **Cosa resta muto per scelta**: tick delle fasce uiapp (ritenta al tick dopo), log di servizio (`flows`, `car-match`, `wx-registro`, voce webui), pulizie `unlink` e letture opzionali. Non sono salvataggi della carriera: allargarli produrrebbe rumore, non diagnosi.
- **Verifica**: `npm run check` exit 0; suite **963/963**; lint **365 file, 0 warning**; test mirati **85/85**; test del helper **1/1**; `node --check` e Biome puliti sui file toccati.
- **Nota**: committato, non pushato. Restano fuori le 5 modifiche preesistenti.

### 4/11 — webui.mjs: estratto il dominio Agenda (P1.5) (richiesta Mauro: «P1.5 — webui.mjs: 4.636 righe e 127 case; è il debito strutturale più grande. Va estratto un dominio per commit, senza cambiare le rotte.»)

- **Il taglio**: le sei rotte `agenda`, `agenda-advance`, `agenda-skip-to-next`, `agenda-shift`, `agenda-hour`, `agenda-choose` vivono in `src/webui-actions-agenda.mjs` (140 righe). `webui.mjs` scende da **4.636 a 4.524 righe** (−112) e conserva solo il dispatcher prima dello switch: `AGENDA_ACTIONS` + `agendaAction`, con `sendJson`, `persist` e `gridLabel` iniettati. Percorsi, payload e status identici; `agenda-detail` resta in webui.
- **Il contratto statico**: `test/diffesa-sonda.test.mjs` ora legge anche il modulo agenda e accetta una rotta se è un `case` webui **oppure** un `case` del modulo presente in `AGENDA_ACTIONS`; il controllo resta stretto (una rotta SOLO_POST senza case continua a fallire).
- **Verifica**: `npm run check` exit 0; suite **962/962**; lint **363 file, 0 warning**; smoke server e test collegati **6/6**; statico + potatura **7/7**. Una prima esecuzione della suite ha visto un flake del test potatura fasce al confine dei 2,5 s (poi 6/6 da solo e verde nella suite finale), non toccato dal refactor.
- **Nota**: committato, non pushato. Restano fuori le 5 modifiche preesistenti.

### 4/11 — Biome a zero e gate sui warning (richiesta Mauro: «guarda cosa hai fatto già e migliora il resto»)

- **44 → 0 warning**: cinque difetti veri (import inutilizzati in `webui.mjs`, optional chain in `core.js`, variabile morta nel test journal, due falsi positivi sul segnaposto `${avvisoGiro}`) e i 39 assert condizionali del plugin `assert-in-if`, riscritti come implicazioni incondizionate (`assert.ok(!cond || verifica, ...)`) o `.every(...)` nei loop. Nessun test indebolito: la suite resta **962/962**.
- **Gate**: `tools/biome/assert-in-if.grit` passa da `warn` a `error`; `npm run lint` ora usa `--error-on-warnings`, quindi un nuovo warning — compreso un assert dentro un if senza else — fa fallire `npm run check`.
- **Verifica**: `npm run check` exit 0; suite **962/962**; `npm run lint` su **362 file**, **0 warning**. `git diff --check` normale segnala il CR della riga modificata in `gui/js/core.js` (file CRLF preesistente); con `-c core.whitespace=cr-at-eol` è pulito e non ho convertito il file per non produrre un diff di fine riga.
- **Nota**: il lavoro è committato, non pushato. Restano fuori le 5 modifiche preesistenti (map.json, carsetup, tre tool).

### 4/11 — La griglia mista non passa più: basta UNA auto fuori parco (richiesta Mauro: «guarda cosa hai fatto già e migliora il resto»)

- **Il buco**: `grigliaDiAltraSerie` tornava i nomi solo quando NESSUNA auto del disco era nel parco. Con una sola auto giusta — il caso Hyper_road a Imola: Porsche GT3 RS fra i30/GR86/MX-5 — la card taceva e il preflight non scattava: la gara falsa passava.
- **La cura**: la funzione ora restituisce le auto FUORI dal parco anche quando altre combaciano (una fonte sola per card e Prepara). Il builder filtra le celle al pool (`poolCells = m.sel`) e la ricostruzione a secco riscrive la griglia pulita; se il template non basta, resta il 409 `GRID_SERIES_MISMATCH`. Messaggi aggiornati: «contiene auto di un'altra serie».
- **La prova**: `test/griglia-altra-serie.test.mjs` 5/5 (caso misto Hyper_road: 4 auto, 3 ammesse, fuori solo la GT3 RS; e «una sola auto del parco non basta»); `test/race-card.test.mjs` 25/25 (banner anche sulla griglia mista); suite **962/962**; Biome sui 5 file toccati: **0 errori**, resta il solo warning preesistente degli import inutilizzati in `webui.mjs:136`; `git diff --check` pulito.
- **Nota**: il fix è committato, non pushato. Restano fuori le 5 modifiche preesistenti (map.json, carsetup, tre tool).

### 4/11 — Numero avversari dal journal (pd-main) e audit fabbrica: 34/34 dal magazzino (richiesta Mauro: «Restano due passi naturali: leggere pd-main per allineare il numero avversari della card al journal, e verificare la fabbrica residua per le 34 serie a classe»)

- **pd-main**: `appRaceInfo()` + `journalRaceForNode()` in [src/app-carriera.mjs](src/app-carriera.mjs) leggono il `pd-main-<hash>.json` più recente (mtime/cache come gli altri journal) e lo accettano solo se la serie combacia col nodo. La card usa la priorità **gamemodesave → journal → ladder**: sul journal reale di Donington, 15 avversari, `single_make`, AI 80–85 → griglia 16.
- **Off-by-one nativo corretto**: le voci 3.10 sono AVVERSARI, non celle. Misura reale: `cars=25`, `declared=25`, customgrid 26; la card faceva `cars` → 25 (24 avversari) invece di `declared+1` → 26 (25). Ora `declared+1` in CUSTOM e `cars+1` in AUTOMATIC; `gridSource` dice se il numero viene da gamemodesave, journal o ladder.
- **Fabbrica residua**: audit dry su tutte le **34** serie che restano sul customgrid (33 multiclasse + `coppa_mazda-rx7-fd`, monomarca con 9 regole di classe): **34/34 ricostruite dal magazzino** con il vivo assente; la fabbrica (86 file) non è mai la fonte vincente in questo stato. Resta solo seme per installazione vergine; nessun file cancellato.
- **Verifica**: `test/pd-main.test.mjs` 2/2; race-card 21/21 nel mirato; suite **960/960**; Biome senza errori nuovi (resta il solo warning preesistente di `webui.mjs` riga 136). Nessun commit.


### 4/11 — Modello Paddock: la griglia la genera il gioco, non il magazzino (richiesta Mauro: «implementa pure e semplifica se c'è margine»)

- **La decisione**: `serieGenerataDalGioco()` in [src/grid-apply.mjs](src/grid-apply.mjs) riconosce le **monomarca senza regole di classe**: **52 serie su 86**. Per loro il Prepara non riscrive più il `customgrid`: scrive la banda AI nel gamemodesave e riporta `Grid Type` su **AUTOMATIC**, la forma in cui EVO genera da sé il conteggio di carriera (la stessa scelta di Paddock, che dichiara il weekend e lascia fare al gioco). Le **34 serie a classe** restano sul customgrid — zavorre/restrictor e livree curate servono davvero — e la fabbrica resta il paracadute.
- **Prepara**: webui e CLI seguono la stessa strada; il CLI conserva `--template` come via manuale. La card continua a nominare una griglia straniera, ma dice che per la monomarca la genera il gioco.
- **Validazione post-gara**: `grigliaGaraFuori()` (import) è il `grid_problem` di Paddock — «non era single-make» / «auto fuori classe» — non riscrive niente: la gara resta valida, il fatto va in Diagnostica e in un messaggio.
- **Il numero avversari**: in AUTOMATIC non si forza il campo 7; il conteggio è quello nativo del gamemodesave (3.10), la fonte che EVO usa. Non ho riaperto il crash del 24/10 scrivendo un 7 diverso dalle celle del customgrid. Leggere `pd-main` per allineare la card al 15 del journal resta il passo successivo.
- **Verifica**: `test/griglia-paddock.test.mjs` 5/5; suite **956/956**; Biome senza errori nuovi (resta il solo warning preesistente di `webui.mjs` riga 136). Nessun commit.


### 4/11 — Magazzino tracciato e template stantii archiviati (richiesta Mauro: «puoi migliorare questo sistema, fabbrica e magazzino hanno creato infiniti problemi»)

- **Provenienza**: ogni `storeTemplate` scrive accanto al `.customgrid` un `.json` con `savedAt`, `cells`, `tintes` e `source` (file corrente, bak, fabbrica). Niente più «da dove viene questo template?»: lo dice il file.
- **Stantio archiviato**: se il template della serie non contiene più le auto della serie (pool cambiato), la corsa dei candidati lo archivia come `.bak-stale-*` (recuperabile) e prosegue su bak/snapshot/fabbrica, invece di riprovarlo a ogni build. Solo in scrittura: i dry-run non toccano niente.
- **Test**: `test/grid-templates.test.mjs` — il caso «magazzino F40 per la serie RS 3» viene archiviato, la fabbrica vince, il magazzino si riscrive e il meta dichiara la provenienza.
- **Nota**: i 39 `.bak-*` dentro `config/griglie-fabbrica` sono untracked (non nel git): non li ho cancellati, sono recuperabili solo a mano. La fabbrica resta un seme di prima installazione, non una seconda memoria viva.
### 4/11 — Griglia fuori serie bloccante e fabbrica letta a ogni uso (richiesta Mauro: «guarda cosa hai fatto già e migliora il resto» — punti P0.3 e P0.4 della scansione)

- **P0.3 — preflight griglia**: la card avvisava già, ma il «Prepara» inghiottiva l'errore di ricostruzione e partiva lo stesso. Ora `grigliaDiAltraSerie(file, ammesse)` (una fonte sola, usata da card e server) dice se sul disco non c'è NEMMENO un'auto del parco; il caso `race` della webui, PRIMA di addebitare l'iscrizione, prova la ricostruzione a secco e se nessun template ha le auto della serie risponde 409 `GRID_SERIES_MISMATCH` col rimedio. `force` resta la via di fuga. Test: `test/griglia-altra-serie.test.mjs` (4 casi).
- **P0.4 — fabbrica**: `FACTORY_DIR` era una const di modulo: chi redirige `EVO_FACTORY_DIR` dopo il caricamento (runner dei test) restava sulla fabbrica vera e i tre casi «griglia di fabbrica» finivano su `NO_TEMPLATE`. Ora è `factoryDir()`, letta a ogni uso (grid-apply + gridbuilder). Il quarto rosso era un'attesa vecchia: dal 31/10 la cella sintetica usa il preset VERO del parco quando lo conosce, non più il token `preset_<carId>`; l'assert guarda che un preset ci sia.
- **Prova**: `node --test test/grid-templates.test.mjs test/griglia-altra-serie.test.mjs` → 20/20 verdi (i 4 rossi storici spariti).
### 4/11 — Posizione ufficiale a blocchi e classifica del sedile (audit delle 88 gare) (richiesta Mauro: «procedi» dopo la scansione del progetto — punti P0.1 e P0.2)

- **P0.1 — posizione ufficiale a blocchi**: `officialPositionOf` riordinava TUTTO il campo per `total_time`, ma il tempo vale solo dentro la classe. A Donington il 18/10 i primi 5 avevano 38-45 s più del giocatore (Pro-Am/altra classe): il file diceva P7, il ricalcolo P2 — e così in **16 gare su 88**. Ora `graduatoriaUfficiale` spezza l'ordine del file in blocchi (nuovo blocco quando i giri cambiano o il tempo scende, tolleranza 0,5 s) e ordina per giri e tempo+penalità **dentro** il blocco; fra blocchi non si scavalca. Cache WeakMap per gara.
- **P0.2 — classifica del sedile**: `standingsFor` filtrava le gare per `state.season`. dtm_legends ha 9 ronde a cavallo di stagione 9 (0-2) e 14 (3-8): la classifica ne vedeva 6, simulava le altre 3 per i rivali (Ruben 177 contro i 150 veri) e ignorava una ronda già corsa se il calendario a giorni era indietro. Nuova `rondeDellaSerie(state, node, season)`: ronde della stagione viva + le ronde precedenti alla prima corsa prese dall'ultima stagione anteriore (mai su una stagione appena aperta). `upTo` include l'ultima ronda vera.
- **La prova**: `test/posizione-blocchi.test.mjs` (blocchi: il giocatore resta P7; +5s dentro il blocco scende; senza penalità l'ordine del file resta; DSQ/giri zero fuori) e `test/classifica-sedile.test.mjs` (9 ronde a cavallo; stagione nuova vuota; nessun doppione; ronda ripetuta → la più recente).


### 4/11 — «Chiudi stagione» non dice più incompleta a calendario finito (richiesta Mauro: «Stagione completata ma chiudi stagione dice incompleta»)

- **La causa**: il gate contava `results[node].filter(r => r.season === state.season)`. dtm_legends ha 9 ronde ma il sedile le ha corse a cavallo di due stagioni globali (0-2 in stagione 9, 3-8 in stagione 14): il conteggio diceva **6/9** e chiedeva conferma a calendario finito. Stesso conteggio in [src/cli.mjs](src/cli.mjs).
- **La cura**: `seasonProgress(state, node)` in [src/state.mjs](src/state.mjs) — conta le ronde distinte della stagione viva e chiude il calendario anche quando è stata corsa la **ronda finale** (`lastRound >= total - 1`). Una stagione nuova appena aperta (0 risultati) resta incompleta: le gare vecchie non la chiudono. Webui e CLI usano entrambi la funzione.
- **La prova**: [test/season-progress.test.mjs](test/season-progress.test.mjs) — serie a cavallo di due stagioni (6 ronde, ultima la 8 → completa), stagione intera 9/9, stagione nuova 0 risultati (incompleta), stagione a metà (incompleta), ronde doppie contate una volta, e i due gate migrati (nessun `played < node.calendar.length` rimasto).

### 4/11 — Trim adattivo: il passo è UN punto, e adesso si legge (richiesta Mauro: «Il trim difficoltà non è sempre chiaro, per esempio ora ha proposto trim ++5 e non capivo se alzava la difficoltà di 1 punto o 5, poi ho visto 1... direi di lasciare solo +1 così a lungo andare si calibra più precisamente»)

- **Il motore faceva già ±1** (`proposeDifficulty` chiude le fasce con `Math.sign`): il salto non era di cinque, era il **trim assoluto** mostrato accanto al nuovo valore («trim +5 → +6») a sembrare il passo. Ora il passo è una costante nominata (`PASSO_TRIM = 1` in [src/state.mjs](src/state.mjs)) e non può scappare.
- **Le schermate dicono il passo**: card della scheda gara, banner del pannello Difficoltà, scheda risultati e CLI mostrano «trim +5 → +6 (passo +1)»: il numero grande non si confonde più col salto.
- **La prova**: [test/trim-passo-uno.test.mjs](test/trim-passo-uno.test.mjs) — sette casi di fascia (P1, podio, quartile, fondo griglia) con trim 5, 0, −5, 2, 4, 1: ogni proposta mossa vale **esattamente un punto**, e le quattro schermate devono citare il passo.

### 3/11 — Audit delle ultime gare: rivali, forma, classifica, distacchi, zavorre, penalità (richiesta Mauro: «Analizza le ultime gare e controlla che tutto funzioni alla perfezione, dai rivali, alla forma pilota, dalle classifiche ai distacchi, controllo generale approfondito. Vedi anche le zavorre e penalizzazioni se stanno funzionando in maniera ottimale.»)

- **Fonti controllate**: 88 file `.sessionresults.json` (18/9 → 3/11), `data/rivals.json` (88 gare, 77 rivali), `data/evo-career.save.json` (88 gare, 17 serie), `data/grid-classes.json` (17 classi), la classifica via CLI e i test.
- **Rivali: OK.** Totali, testa a testa e ultime 5 ricalcolati dall'archivio delle 88 gare → **0 derive**, 0 chiavi duplicate (stagione+ronda+serie), 0 `last5` incoerenti. La forma (media ultime 3 vs precedenti) parte dagli stessi dati.
- **Penalità: OK.** 5 gare hanno una penalità nel file (4× tempo, 1 DT). Il ricalcolo ufficiale (`officialPositionOf`) combacia col ricalcolo manuale (giri → tempo+penalità) in **88/88 file, 0 incoerenze**: Paul Ricard +5s P1→P6, COTA +10s P6→P7, DT e DSQ gestiti. La tabella `penalties` del file resta vuota, come previsto: il dato vero è `high_penalty`.
- **Zavorre: OK dove la classe le prevede.** Applicate e coerenti con le regole: campionato_epoca (i30 100kg/20%, GR86 100/9%, MX-5 100/14%, Renault 5 0/0), campionato_moderno (Junior 100/11%, 288 GTO 100/20%, Abarth 100/2,5%…), tutte dentro i cap 100 kg / 20%. La serie in corso (dtm_legends) è a 0/0 **per progetto**: le zavorre nascono dalla calibrazione sui risultati, non dalla serie.
- **Statistiche: OK.** 56 podi / 43 giri veloci salvati = ricalcolo 58/45 meno le **2 gare con `autoFuori`**, che per scelta non danno meriti (e spiegano anche i 2 podi a 0 punti).
- **Classifica: OK nei numeri.** Somma punti del giocatore giusta (150 pt sulle 6 gare della stagione 14), `upTo` 9/9: nessun ritardo del calendario. Ruben 177 include le 3 ronde della stagione 9 che il giocatore corse nello stesso sedile: la classifica filtra per `state.season` e ri-simula quelle ronde per i rivali — caso da decidere quando una serie attraversa due stagioni.
- **Settore debole: corretto con un cap.** 14 file hanno il «migliore del settore» a 3–22 s dal giocatore (giri rovinati/split non comparabili): senza limite la frase di ieri avrebbe detto «Perdi 12.5 nel settore 3». Aggiunto **cap 3 s** in [src/webui.mjs](src/webui.mjs) e nel narratore ([gui/js/narratore-unito.js](gui/js/narratore-unito.js)), con test: qualifica con delta 12,5 s → **nessuna frase**; 33/33 verdi.
- **Anomalia aperta 1 — griglia fuori serie**: hyper_road Imola 31/10, Porsche 911 GT3 RS contro 17 auto da campionato_epoca (i30/GR86/MX-5/Renault 5) **con le zavorre di quella classe**. Il customgrid era rimasto dalla gara precedente sullo stesso tracciato (13:21 → 14:46) e il vigia controlla il bilancio, non la classe della ronda. 1 caso su 88, ma rende la gara finta.
- **Anomalia aperta 2 — posizione del file ≠ tempo**: in 16/88 file il `position` mette il pilota dietro a chi ha tempo peggiore (Donington 18/10: file P7, tempo P2, 37 s più veloce della P0; stesse auto Porsche/Ferrari/Lamborghini). `officialPositionOf` riordina per tempo e quindi sposta posizioni usate da rivali e statistiche. Da decidere se vale il file (classi Pro/Am o ordine d'arrivo) e limitare il ricalcolo ai gruppi omogenei.
- **Dati storici da backfillare**: 3 gare con penalità importate prima del fix (RX-7 Paul Ricard +5s resta P1, Peugeot COTA +10s resta P6) e 8 gare con `gridSize` grezzo (17 invece di 15 dopo il dedupe). Le gare nuove sono corrette (Kyalami: 15 su 15).
- **Verifiche**: `node --test test/copilota-narratori.test.mjs` 33/33, `node --test test/rivals.test.mjs test/griglia-sim.test.mjs test/grid-guard.test.mjs test/gridclasses.test.mjs` 24/24, Biome pulito sui file toccati (resta il warning preesistente degli import inutilizzati alla riga 136 di webui.mjs).

### 3/11 — Copilota: il settore debole parla SOLO in qualifica (richiesta Mauro: «Settore debole: «Perdi 0.4 nel settore 2, lì il migliore è X». inserisci questo solo in qualifica»)

- **La frase**: nuovo narratore `settore` — «Perdi 0.4 nel settore 2 — lì il migliore è Luca Bianchi.» Il distacco si dice in decimi, il nome è quello di chi ha il settore migliore nel file risultato.
- **Il dato**: la MMF non porta i settori, esistono solo nel `.sessionresults.json` che EVO scrive a fine sessione. In [src/webui.mjs](src/webui.mjs) il payload leggero porta `settore` **solo se la fase (o il tipo) dichiara la qualifica**: legge il risultato più recente (scansione al più ogni 15 s, memo per file+mtime — il tick radio gira ogni ~2 s e non deve pesare sul giro), trova il pilota col `findPlayerDriver`, calcola `sectorAnalysis` e passa settore peggiore + `bestName`. Distacchi sotto 0,1 s o sessione «sola» (nessun rivale misurato) non parlano: «il migliore è X» con X inesistente sarebbe una bugia detta a voce.
- **I livelli**: `settore` entra in `normale` e `full` ([src/voce-copilota.mjs](src/voce-copilota.mjs)); `essenziale` resta com'è (è la radio degli ordini, non dei dettagli). In gara il narratore tace anche col campo presente (doppia guardia).
- **La prova**: test nuovo in [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs) — qualifica col settore: UNA frase, `Perdi 0.4 nel settore 2` + nome; gara con lo stesso campo: zero frasi. `node --test test/copilota-narratori.test.mjs` → **33/33 verdi**; `node --check` su webui/narratore OK; Biome sui file toccati pulito (resta il solo warning preesistente degli import inutilizzati alla riga 136 di webui.mjs).

### 3/11 — Copilota: la posizione persa/recuperata torna a parlare IN GARA (e resta muta in qualifica e prove) (richiesta Mauro: «Il copilot non dice più la posizione persa e guadagnata, ti ho detto di levare questa frase dalle qualifiche e prove, non gara»)

- **La causa**: il gate del postalk in [gui/js/narratore-unito.js](gui/js/narratore-unito.js) chiedeva `/race/` alla **sola fase del gioco** (`m.phase`). Quando la fase non arriva — o arriva vuota — restava il tipo del blocco STATIC, che nelle gare SP **mente**: `TimeAttack` (178 tick su 178 nelle due gare reali, annotato in [NOTE-AUTOMAZIONE.md](NOTE-AUTOMAZIONE.md)). Risultato: `inGara` falso anche in gara, postalk morto ovunque — la regola «solo gara» del 1/11 aveva spento pure la gara.
- **La cura**: la qualifica e la prova zittiscono **per nome** (fase o tipo che le dichiarano: `qualif|practice|pratic|test|hotlap|warm|outlap`); la gara parla per fase `Race`, per tipo `Race`, oppure per il segno che nessuna TimeAttack ha — `lapsTotal > 0` (la TimeAttack è a tempo, `lapsTotal` 0 nei registri 24/10–1/11). Restano intatte le guardie del 30/10: verde visto prima del via, pitlane e i 12 s dopo l'uscita, distanziello 30 s, anti-ripetizione 70 s.
- **La prova**: nuovo test in [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs) — gara SP etichettata `TimeAttack` senza fase → «posizione persa» ESCE; `Qualify` e `Practice` con la loro fase → zero postalk. `node --test test/copilota-narratori.test.mjs` → **32/32 verdi** (era 31); Biome sui due file toccati → «Checked 2 files — No fixes applied».

### 3/11 — Pannello Setup: l'anteprima ⚡ non si fa più cancellare dall'auto-refresh (richiesta Mauro: «Pannello setup mostra qualche difficoltà creare il setup, devo cliccare 2-3 volte per farlo apparire»)

- **La causa, due attese mute.** (1) Il timer dei 15 s di `drawSetup` ridisegna `#main` quando cambia la firma (ultimo `.ld` riscritto da EVO, giri validi, setup montato): il riquadro `#apply-out` con l'anteprima — o col «🌉 PONTALO QUI» — spariva sotto le mani e il click successivo cadeva su un nodo appena ricreato, da qui i «2-3 clic». (2) Dopo ⚡ e dopo ✅ CONFERMA il riquadro restava vuoto finché il server non rispondeva (la scansione MoTeC può prendersi secondi): il click sembrava perso.
- **La cura**, solo [gui/js/viste-c.js](gui/js/viste-c.js): il timer non ridisegna finché in pagina c'è un'anteprima non decisa (`#b-confirm-apply` / `#b-bridge-setup`) e riprova al giro dopo; ⚡ scrive subito «⟳ Preparo l'anteprima del setup…», ✅ scrive «⟳ Creo il file «EVO-consigliato»…».
- **Verifiche vere**: `node --check gui/js/viste-c.js` → OK; Biome sul file toccato → «Checked 1 file — No fixes applied» (0 errori); guardie della GUI `node --test test/viste-guard.test.mjs test/nav-bottoni.test.mjs` → **8/8 verdi**. Prova del vivo NON fatta: nessun server `node` in ascolto sulla 8642 al momento della correzione.

### 3/11 — Rottura rigiocata a 1250 e 1920: le due larghezze larghe beccano il difetto finto come a 480 (richiesta Mauro: «Ripeti la prova a rottura della guardia di layout a 1250 px e 1920 px, non solo a 480»)

- **Il gesto**: lo stesso della prova a ROTTURA del 2/11 (voce a data 2/11) e del suo replay del 3/11, con l'impianto di OGGI: sonda condivisa di [test/_layout-probe.mjs](test/_layout-probe.mjs), server con cartella dati finta, Chromium già in cache di Playwright. Il difetto finto è un bottone 97×10 appeso DENTRO `#main` a cavallo del bordo SUPERIORE della label «Lingua interfaccia» (le due regole del banco: dentro `#main`, e SBORDA dal rettangolo del vicino con 6 px di area comune in altezza). Ciò che cambia rispetto al replay è solo la larghezza: il replay girava a 480, le due larghezze LARGHE della guardia non erano mai state messe a rottura.
- **L'esito, larghezza per larghezza** (log di banco [tmp/rottura-1250-1920.log](tmp/rottura-1250-1920.log), assoluto: pagina sana → difetto → difetto tolto):
  - **1250 px**: PASSO 1 pagina sana 0 sovrapposizioni · 0 pannelli fuori; PASSO 2 beccata al primo colpo — `label.muted ⟂ #difetto-prova button DIFETTO DI PROVA · area comune 96×6 px`, con le scatole `[261,729 → 358,748] ⟂ [262,725 → 359,735]` e la catena degli antenati (`div.row < div.panel < #main < #shell`); PASSO 3 difetto tolto: torna 0/0.
  - **1920 px**: identico — beccata (`label.muted ⟂ difetto-prova button · area comune 96×6`, scatole `[553,732 → 650,751] ⟂ [554,728 → 651,738]`), e con il difetto tolto 0/0. ERRORI JS a entrambe le larghezze: 0.
- **Perché il gesto conta a UNA larghezza in più**: la sonda è la stessa a tutte le larghezze, ma il LAYOUT di Impostazioni cambia forma (le due colonne del 2/11 si allontanano fino a 1250 e oltre); una sonda che mordesse solo a 480 potrebbe avere un morso calibrato su una geometria che alle larghezze larghe si muove diversamente. Ora la rottura morde la guardia in ENTRAMBE le corse di mezze larghezze: il blocco 256–480 e le due larghe. Il verdetto di chiusura: il collaudo vale alle sei larghezze della lista, non solo a quelle dove il difetto è stato costruito.
- **Banco, non suite**: la prova resta in [tmp/_rottura-1250-1920.mjs](tmp/_rottura-1250-1920.mjs) (gitignored, uso e getta come la sonda-modali): il difetto finto NON deve girare nel collaudo della suite — la regola valeva il 2/11 e vale ora; il test della guardia (126 misure) resta quello che misura la pagina SANA.

### 3/11 — SALVATAGGIO 0.1.52: la giornata intera esce dal diario e entra nel codice (richiesta Mauro: «aggiungi la voce di diario del salvataggio 0.1.52 con il riepilogo della sessione»)

- **Il gesto**: commit `999acaf` (bump 0.1.51 → **0.1.52**) — la sessione del 3/11, dal mattino alla soglia di release, committata in un colpo. Report della build in [report/release-0.1.52.md](report/release-0.1.52.md), voce v0.1.52 in [CHANGELOG.md](CHANGELOG.md). Le versioni 0.1.53 e 0.1.54 che seguono (le date nei tab, il «Paddock nostro») hanno le loro voci: qui il riepilogo soltanto di QUESTA sessione.

Le tavole della giornata — ognuna ha la VOCE A DATA PROPRIA nel diario, qui la stesa in righe:

- **La guardia delle app in gioco, da prova a soglia di release**: [test/uiapp-installata.test.mjs](test/uiapp-installata.test.mjs) — sagome biome-pulite, firma BUILD_OK della build, copie in gioco UGUALI byte per byte, pagine d'ingresso (app.json/menu.html) e fasce JSON del publisher INTERE (7/7). **Preflight dentro [tools/crea-release.mjs](tools/crea-release.mjs)**: genera-uiapp + la guardia PRIMA di credenziali e zip — esito non-zero, la release NON parte; flag `--con-pacchetto` e `--solo-preflight`; la beffa della fascia a metà provata sul vivo (rossa col percorso reale, poi verde) e ripetuta ogni `npm test` con [test/beffa-preflight.test.mjs](test/beffa-preflight.test.mjs).

- **Il dizionario vivente**: la fattoria è `ui_storage.uistorage` — le skin in CHIARO (`paddock.skins`, car_guid già chiave del garage); nuova sorgente `learnCarFromStorage` (CLI `--from-storage` agganciata al boot); il tagliando «Mazda Mazda» diventa regola comune (`soloRaddoppio` tra learner e paddock); le voci CONTRADDETTE si rietichettano col nome vero (la sera dell'Endurance GT4 Audi R8, etichettata «Kunos Abarth 695 Biposto»: rientrata); il watch rinfresca a ogni tick con riga verde solo quando impara. E le catene di lettura una volta per tutte: calendario, garage e dizionario leggono SOLO file scritti dal gioco; il magazzino L: esce dal boot, resta backup zip.

- **I nomi puliti delle piste, ovunque**: chip di Pitwall e Cruscotto con `prettyTrackLabeled` (banco A/B 53/53), verdetto della GUI (61/61), test dei chip riscritti con la guardia VIVA invece delle stringhe attese, e i dati a server vivo (lastLd, garage/sessions, tetto: test 1/1); il dizionario si spiega anche nella FAQ — solo documentazione.

- **Il giro teorico VERO**: il margine torna leggibile dai LOG del gioco e non dal file risultato (nel Results EVO scrive solo i settori del best: il teorico è per costruzione ≡ best, il «margine 0,00» era falso); riga «Giro teorico» del rapporto con la fonte VERA o assente, il falso 0,00 tolto dal Tetto, teorico vero anche su hotlaps e Analisi; l'INDAGINE OUT-LAP di Monza chiude: le sessioni senza giri escono dai menu e tornano agli A/B come voci disabilitate «senza giri» (guardia 1/1). Picco del tetto nel tooltip; registro quadro-zone (23/23).

- **Il Bollettino meteo diventa AUTOMATICO**: `wx-auto` scrive per sessione e si autodichiara automatico nel pannello — senza il clic «Metti». wx-auto 9/9, attigue 17/17, smoke verde.

- **La griglia**: il banner VIGIA del cambio di campionato (la griglia della serie VECCHIA viene detta PRIMA del bottone); la guardia anti-singleton a TINTE (l'incidente Coppa MX-5: 19 celle una livrea — se il vivo ha meno tinte del magazzino, salta la prima corsa e vince il parco più ricco di livree); l'inciso «84–85» della banda demolito: la riga nasce calcolata al consiglio (semina 6/6, gridbuilder-banda-serie 10/10).

- **Il layout della GUI**: la sonda di layout estratta nel modulo condiviso; Impostazioni anche a 360 (con Setup e Analisi nella stessa misura); quarta larghezza per Dashboard; skip ONESTI senza ambiente (non rossi finti su CI vergine); i soprannomi in blocco con la guardia sui BOTTONI (il bottone 📝 si VEDeva ma NON era agganciato); il cap del miscuglio col `restrictorMaxPct` reale della classe; il banner del trim torna onesto. L'estensione ai 21 tab e la prova a rottura rigiocata: sono le voci che seguono, qui sotto.

Le verifiche in numeri: check intero **881/881** al giro di chiusura (tardo pomeriggio), **888/888** al salvataggio con la guardia di layout dentro il glob; Biome 0 errori e 5 warning preesistenti e documentati ([SESSION_REPORT.md](SESSION_REPORT.md)); prove del vivo registrate nel diario: `--from-storage` sul MX-5 doppio ripulito, preflight beffato e poi verde, dry-run griglia sul vivo reale (celle 16, 3 tinte, zero log di guardia), rapporto reale 261030-2117 senza errori.

Il pacchetto: zip CONFEZIONATA dal flusso (`node tools/crea-release.mjs v0.1.52 … --con-pacchetto`) — il preflight gira PRIMA, pacchetto-amico confeziona DOPO e carica la zip come asset. Il save `data/evo-career.save.json` resta INTATTO: gli aggiornamenti portano solo codice.


### 3/11 — La guardia a 21 tab: il censimento chiude la domanda delle viste nascoste, e il collaudo che la rende vera resta quello del 2/11 (richiesta Mauro: «aggiungi una voce di diario sulla guardia a 21 tab facendo riferimento alla prova a rottura del 2/11»)
- **Che copre oggi**: 21 tab (19 in nav + Calendario e Classifica Mondiale, i due senza bottone) × 6 larghezze (256 · 320 · 360 · 480 · 1250 · 1920) = **126 misure**, verde a passata sola (35,5 s cronometrati; mediana 34,79 s dell'[audit](report/audit-layout-95-105-2026-11-03.md)).
- **La domanda chiusa questa mattina**: «restano viste nascoste da coprire?» No. L'unico posto che decide che cosa è una vista è il dispatcher di `render()` in [gui/js/core.js:463](gui/js/core.js#L463): elenca ESATTAMENTE i 21 id della lista della guardia (`TABS` a [gui/js/core.js:302](gui/js/core.js#L302)). Il terzo colore orfano di `TAB_COLORS` (`catalog`, [gui/js/core.js:335](gui/js/core.js#L335)) è un'icona rimasta dalla fusione con Auto, non una vista: nessun `tab === 'catalog'` vive nel codice. Non c'è un 22° id da marcare: la copertura dei tab è COMPLETA.
- **Ma c'è un paese fuori dal recinto**: le schermate che vivono SOLO dentro una modale non passano da `render()` (nascono in `#modal-root` o appese al body). Censite e misurate questa mattina con la leva vera a 256/320/480: nessuna esce dalla viewport, una sola (Soprannomi in blocco) ha sovrapposizioni vere. La proposta è scritta e attende il via: [report/proposta-marcatori-modali-2026-11-03.md](report/proposta-marcatori-modali-2026-11-03.md).
- **Perché il verde di 126 misure vale: la prova a ROTTURA del 2/11** (voce di diario a data 2/11, più in basso). La guardia nasce quella sera come test del SOLO tab Impostazioni, a 480/1250/1920; lo stesso giorno prende il collaudo più onesto che un test di geometria possa avere: con la pagina sana (0 sovrapposizioni) si inietta a mano un difetto FINTO a cavallo del selettore lingua e la sonda lo becca al primo colpo («Lingua interfaccia ⟂ DIFETTO DI PROVA 97×10»); tolto il blocco, la misura torna a 0 da sola. Un test che non sa cadere non è una guardia, è un decoro: quella sera è diventata una guardia.
- **Rigiocata il 3/11, non citata**: il motore della sonda è cambiato tre volte da allora (estrazione nel modulo condiviso, righe vere degli inline, mozzica al contenitore scorrevole), quindi il gesto del 2/11 è stato RIGIOCATO sul vivo dell'impianto di OGGI (21 tab, stesso server con cartella dati finta, stesso Chromium — [tmp/_sonda-sovrapposizione-replay.mjs](tmp/_sonda-sovrapposizione-replay.mjs), log vicino): beccato ancora («label.muted ⟂ button DIFETTO DI PROVA · area comune 95×6»), poi 0 sovrapposizioni e 0 pannelli fuori viewport col difetto tolto.
- **Le due regole che quel banco ha insegnato, valide anche per i marcatori di domani**: (1) l'inject va DENTRO `#main` — la misura raccoglie solo `#main *`, un elemento appeso al body non esiste per lei; (2) il difetto finto deve SBORDARE dal rettangolo del vicino: del tutto contenuto dentro la sua scatola fa scattare a ragione la legge «contenuto in contenuto: sano» (un figlio che sta dentro il padre è la pagina che funziona, non un difetto).
- **La continuità per chi rilegge**: da Impostazioni (2/11) ai 21 tab di oggi la regola non è cambiata — stessa legge (>2 px per lato, senza che l'uno contenga l'altro), stessa leva (click sulla tab), stessa bisaccia (server con cartella dati temporanea, il save vero mai toccato). Quello che è cresciuto è solo l'ampiezza: i marcatori per tab (2/11), la stesa «tutti i tab» a cui è seguita la voce «Notizia: Messaggi e i tab del gruppo Gara sono GIÀ coperti» (2/11, aggiornata al 3/11), il contratto dei messaggi di skip (3/11) e la sesta larghezza a 256 px (3/11). Ogni volta che la sonda cambia motore, la prova a rottura si RIGIOCA: se un giorno non becca più il difetto finto, il verde di quelle 126 misure torna a essere una parola buona.

### 3/11 — Audit dei tempi: da 95 a 105 misure non costa NIENTE, il prezzo si paga per LARGHEZZA (richiesta Mauro: «Aggiungi una voce di report/audit su quanto il tempo della guardia di layout cresce passando da 95 a 105 misure»)
- **Il report**: [report/audit-layout-95-105-2026-11-03.md](report/audit-layout-95-105-2026-11-03.md), coi log grezzi in `tmp/tempi/` (gitignored).
- **Come**: 95 = 19 tab × 5 larghezze, 105 = 21 tab (i due nascosti in più) × le STESSE 5, 126 = la guardia vera di oggi (21 × 6, il 256 px). Giri ALTERNATI 95/105 tre volte a testa (così la deriva della macchina non premia una configurazione) + 2 giri a 126 in coda. Le due configurazioni sono una copia temporanea della guardia, col file vero ripristinato e verificato **byte-identico** (`cmp`). Tutti i giri verdi, 0 skip, 0 sovrapposizioni.
- **I numeri**: 95 → mediana **30,29 s** (29,55–30,30); 105 → **29,81 s** (29,62–29,85); **delta −0,47 s (−1,6%)**, dentro l'oscillazione di 0,75 s della stessa configurazione a 95: i due tab non si pagano. 126 → **34,79 s**, **+4,98 s (+16,7%)** per la sesta larghezza. Il tempo PER MISURA scende (319 → 284 → 276 ms).
- **Perché**: la guardia corre i tab in **3 corsie in rotazione** (`j % CORSIE === i`) dentro la stessa larghezza, e solo le larghezze sono in serie. 19 tab → corsie 7/6/6, 21 tab → 7/7/7: **il treno più lungo resta 7** in entrambi i casi, ed è lui a dettare il tempo.
- **Regola pratica**: +1 tab costa ≈ 0 finché la corsia più lunga non guadagna un tab (gradino al **22°**); +1 larghezza costa ≈ **+5 s**, sempre. Previsione NON ancora misurata: col 22° tab, corsie 8/7/7 → atteso ≈ +4 s su 5 larghezze.

### 3/11 — La guardia di layout entra nella soglia di release: lista di controllo automatica, e lo skip non passa più in silenzio (richiesta Mauro: «Scrivi una lista di controllo di rilascio automatica per la guardia di layout all'interno di tools/crea-release.mjs, nello stesso modo del preflight uiapp»)
- **Dove**: [tools/crea-release.mjs](tools/crea-release.mjs), subito dopo il preflight delle app in gioco e quindi dentro anche `--solo-preflight`. Stesso `preghiamo(...)` del preflight uiapp: exit non-zero → «preflight non superato … la release NON parte».
- **Punto 1 (duro)** — il CONTRATTO degli skip, [test/skip-guardia-layout.test.mjs](test/skip-guardia-layout.test.mjs): tre `return t.skip(...)` ognuno col perché e nessun presupposto tornato assert rosso. Test sul testo: 90 ms, niente browser.
- **Punto 2 (duro)** — la GUARDIA VERA, [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs): 21 tab × 6 larghezze = 126 misure. Il TAP si stampa nel log della release, così la prova resta scritta. Verde → «guardia di layout misurata: 1 suite verde, 126 misure». SALTATA → `⚠ la guardia di layout si è SALTATA in questa release: <perché>` e la release esce lo stesso («superata a metà»): uno skip è ambiente, non codice, e non lo si trasforma in rosso. Ma il silenzio è finito — prima una release senza chromium era indistinguibile da una con 126 misure dietro.
- **Avviso 3** — `git status --porcelain -- gui test/layout-impostazioni.test.mjs test/_layout-probe.mjs`: lo zip nasce da `git archive HEAD`, quindi una GUI modificata e non committata esce VECCHIA, non col layout appena misurato.
- **Le due prove a secco (`--solo-preflight`, zero chiamate a GitHub)**:
  - ambiente intero: `ok 1 …`, `# pass 1`, `# fail 0`, `# skipped 0`, **35,3 s**, poi `✓ guardia di layout misurata: 1 suite verde, 126 misure` e `✓ lista di controllo layout superata: contratto degli skip ✓, guardia misurata ✓ (126 misure)` → [tmp/preflight-layout.log](tmp/preflight-layout.log);
  - `LOCALAPPDATA` vuoto (niente chromium): `# skipped 1` in **89 ms**, `⚠ … si è SALTATA … chromium assente nella cache di Playwright (…): scaricalo con «npx playwright install chromium»`, `✓ lista di controllo layout superata a metà` → [tmp/preflight-layout-saltata.log](tmp/preflight-layout-saltata.log);
  - in entrambe l'avviso dei file sporchi ha abbaiato: `⚠ GUI o sonda della guardia NON committate … M gui/js/viste-a.js` (sporcizia PREESISTENTE, non di questa sera: l'avviso fa il suo mestiere).
- **Verifica**: `node --check` e `npx biome lint tools/crea-release.mjs` puliti; nessuna release creata, nessun tag, niente spedito.

### 3/11 — Il terzo presupposto (save assente) collaudato con l'ambiente VERO intorno: verde, ma il test dedicato ha due buchi (richiesta Mauro: «Verifica che il ramo skip della guardia di layout resti verde anche con playwright-core installato ma solo il save assente, e documenta se manca un test dedicato a quel caso»)
- **Il ramo, con gli altri due presupposti SODDISFATTI**: radice finta con `node_modules/playwright-core` in giunzione al progetto, `LOCALAPPDATA` vero (`chromium-1223` e `chromium_headless_shell-1223` in cache) e `data/` VUOTA → `ok 1 … # SKIP la tab Impostazioni si apre solo con una carriera (niente onboarding): manca il save …\radice\data\evo-career.save.json`, `# pass 0`, `# fail 0`, `# skipped 1`, **exit 0**, **93,5 ms**; nessun server, nessun browser (si ferma al terzo controllo). Ripetibile con `bash tmp/_collaudo-save-solo.sh` → [tmp/collau-skip-save.log](tmp/collau-skip-save.log).
- **Il test dedicato NON manca**: [test/layout-skip-save.test.mjs](test/layout-skip-save.test.mjs) sposta il save vero (con riserva), lancia la guardia come processo suo e pretende lo skip col percorso del save. Verde in **170 ms**, col save tornato al suo posto **byte per byte** (sha256 `3948d5c6…` identico prima e dopo).
- **Buco 1 (misurato)**: quel test non è «onesto con l'ambiente» come la guardia che collauda. Con `LOCALAPPDATA` su una cartella vuota (niente chromium) la guardia fa la cosa GIUSTA — `# SKIP chromium assente nella cache di Playwright …` — ma il test dedicato va **`not ok 1`**, perché il suo `assert.match(/manca il save …/)` non trova più quella frase. In una CI senza chromium è un rosso per mancanza d'ambiente: proprio ciò che la voce «senza ambiente si salta» aveva tolto alla guardia.
- **Buco 2 (misurato)**: la prima riga è `if (!existsSync(SAVE)) return;` — col save GIÀ assente il test passa con **zero asserzioni** (`# pass 1`, nessun controllo eseguito): verde che non ha verificato niente, il caso che il contratto sugli skip vieta alla guardia. Nessuno dei due buchi è corretto qui: la richiesta era verificarli e dirli.

### 3/11 — Il perché degli skip della guardia di layout adesso è un CONTRATTO, non una parola buona (richiesta Mauro: «Aggiungi un test che verifica che i tre messaggi di skip della guardia di layout contengano il perché, senza girare il browser»)
- **Il pezzo nuovo**: [test/skip-guardia-layout.test.mjs](test/skip-guardia-layout.test.mjs). Legge il SORGENTE della guardia con `readFileSync` e non la importa — importarla lancerebbe server e chromium. Costo della prova: **87 ms**, nessun browser, nessuna porta.
- **Test 1 — i tre skip dicono il perché**: prende le righe con `t.skip(` e pretende che siano **3**, nell'ordine in cui la guardia li controlla (playwright-core, chromium, save). Per ognuna: deve essere `return t.skip(` (senza `return` il codice sotto partirebbe lo stesso e il verde sarebbe una bugia) e il messaggio deve portare i frammenti del perché — cosa manca, dove si guarda, cosa fare: `playwright-core` + `npm install`; `chromium assente` + `ms-playwright` (il percorso della cache) + `npx playwright install chromium`; `carriera` + `manca il save` + `SAVE` (il percorso vero, non una frase generica). Poi: almeno 40 caratteri (un'etichetta non è un perché) e tre testi **distinti** — tre copie dello stesso testo non spiegano niente.
- **Test 2 — il difetto originale non torna**: nessuna riga che contenga insieme `assert.` e la chiave del presupposto (`playwright-core`, `CHROMIUM`, `SAVE`), cioè niente ritorno al rosso-per-mancanza-d'ambiente. Riga per riga, non una regex sul file intero: il primo abbozzo (`assert\.[a-z]+\([^;]*CHROMIUM[^;]*\)`) univa un assert lontano con un `chromium` più sotto e dava un falso rosso al primo giro.
- **Il morso, con tre mutazioni della guardia e ripristino byte-identico** (`cmp` col backup): via `npm install` dal primo messaggio → `not ok 1`; via `ms-playwright` dal secondo → `not ok 1`; rimesso un `assert.ok(CHROMIUM)` → `not ok 2`. Guardia rimessa a posto: `# pass 2`, `# fail 0`, `# skipped 0`.
- **Verifica**: `node --test test/skip-guardia-layout.test.mjs` → 1,9 ms + 0,7 ms, 2/2 verdi; `npx biome lint test/skip-guardia-layout.test.mjs` → nessun avviso.

### 3/11 — LA REGOLETTA CHE SORPRENDE IL TEST «IN ONORE»: `assert` dentro un `if` senza `else` non passa più inosservato (richiesta Mauro: «Aggiungi una regoletta biome che vieti if prima di un assert nei test di test/ (il test che passa "in onore" senza asserire va sorpreso)»)
- **Il pezzo nuovo**: [tools/biome/assert-in-if.grit](tools/biome/assert-in-if.grit), plugin GritQL per Biome 2.3. Una regola sola: un `assert.$metodo(…)` che ha per antenato un `if` SENZA `else` viene segnalato con «se la condizione è falsa l'asserzione non gira e il test resta verde senza aver verificato niente». Gira solo nei test: l'override in [biome.jsonc](biome.jsonc) lo aggancia con `includes: ["test/**"]`. Provato che il perimetro tiene — lo stesso file con la stessa violazione in `tools/` dà **0** segnalazioni, copiato in `test/` ne dà **1**.
- **Perché «senza else», e non «dentro un if» e basta**: il primo giro (`within JsIfStatement()`) ne segnalava **74**, e quasi la metà erano falsi positivi — gli `if/else` che asseriscono in ENTRAMBI i rami non sono test in onore, l'asserzione gira comunque (il `if (i < nIconic) assert.ok(…) else assert.ok(…)` di [world.test.mjs](test/world.test.mjs), i 15 punti su 17 di [tetto-gui-json.test.mjs](test/tetto-gui-json.test.mjs)). Chiedendo al pattern la forma senza else si scende a **39**, e quelli sono tutti del tipo vero: `if (boot.j.hasCareer) { assert… }` in [webui-smoke.test.mjs](test/webui-smoke.test.mjs) (11), `if (existsSync(cfgFile))` in [lingua-server.test.mjs](test/lingua-server.test.mjs), `if (st.fuelPace)` in [stinti.test.mjs](test/stinti.test.mjs), `if (e1.rookie != null)` in world.test — tutti casi in cui, se il dato manca, il test è verde senza aver guardato niente.
- **Le tre trappole di GritQL, misurate a mano prima di scegliere la forma**: `within \`if ($cond) $then\`` non matcha i corpi con le graffe, serve la variante `if ($cond) { $... }`; due pattern in cima al file **non si sommano** (in Biome le regole Girql girano in sequenza: la seconda vede solo i match della prima → zero segnalazioni); la forma che copre entrambe le sintassi è una regola sola con `within or { … }`.
- **Il morso, su una fixture di 8 casi**: segnalati i 4 giusti — `if (x) assert.ok(x);` secco, `if (x) { assert.equal(x, 1); }` col blocco, il blocco con un `for` dentro, il ramo `else if` senza assert suo — e **muti** i 4 che devono tacere: `if/else` che asserisce in entrambi i rami (2 forme, blocco e statement), `if (!x) return;` seguito dall'assert, e l'assert incondizionato con `||`.
- **Severità `warn`, non `error`**: i 39 punti esistenti (14 file) sono debito vero ma non li ho riscritti in questo giro, e `npm run lint` deve restare verde per non bloccare `npm run check`. Appena sono smaltiti si cambia una parola nel `.grit`. Stato di oggi: `npm run lint` → **44 avvisi, 0 errori, exit 0** (39 sono i nuovi, 5 erano già lì).
- **Limite dichiarato**: il pattern guarda l'antenato, non il parente più vicino — un `if` senza else che contiene a sua volta un `if/else` che asserisce in entrambi i rami viene comunque segnalato (falso positivo «rumoroso ma raro»: si vede a occhio dal messaggio), e un `if … else` in cui asserisce **solo** il ramo `then` non viene segnalato (falso negativo accettato per non tornare a 74).
- **Verifica**: `npx biome lint test` → 39 segnalazioni `plugin`, tutte su `assert.x` in if senza else; `npm run lint` verde; fixture e file di prova cancellati (nessun residuo in `test/` o `tools/`).

### 3/11 — L'AUTO-SCORTA DELL'EREDITÀ: `esitoEsitoNode` via, al suo posto gli EFFETTI osservabili (richiesta Mauro: «Elimina l'autogiudizio esitoEsitoNode in eredita-cruscotto.test.mjs e sostituiscilo con una verifica reale degli effetti osservabili di giraRichiesteEredità»)
- **Il difetto**: in [test/eredita-cruscotto.test.mjs](test/eredita-cruscotto.test.mjs) c'era `assert.equal(esitoEsitoNode(state), state.node)` con `function esitoEsitoNode(state) { return state.node; }` — un valore confrontato con sé stesso, vero qualunque cosa facesse `giraRichiesteEredità`. Peggio: l'impresa era puntata SULLA serie del sedile già attivo (`impresaSu(state, state.node)`), quindi `scegliRonda` prendeva la scorciatoia «già scelto» e il puntamento non si vedeva proprio.
- **Adesso**: la serie dell'impresa è un'ALTRA, cercata come la cerca il nucleo (giorni da oggi a +7, ordine di `racesOnDay`, prima fattibile ≠ sedile: sulla carriera nuova cade sulla `coppa_vintage-mini`, **giorno 5, R1**). Cinque effetti osservabili al posto dell'autogiudizio: la risposta al bottone (id, `ok`, titolo, `R1`); il **sedile** (`state.node` lascia la serie di prima e punta quella dell'impresa, `state.round` = ronda di quel giorno, `state.seats[...].day` = giorno della gara); la **scelta a registro** (`choicesForDay`); i **messaggi** che l'utente legge (serie + `R1`); il **save su disco** scritto da `persist(state)` — `node`, `round` e `agenda.choices[5]`.
- **Il morso provato**, due volte: tolto `persist(state)` da `giraRichiesteEredità` → `not ok 3`; sfalsato `state.round = g.index + 1` in `scegliRonda` → `not ok 3` con «la ronda è quella che il calendario assegna a quella serie quel giorno». File ripristinati dal backup byte-identico, verdi di nuovo.
- **Verifica**: `node --test test/eredita-cruscotto.test.mjs` → **8/8 verdi**; Biome pulito. `esitoEsitoNode` non esiste più (grep vuoto su test e src).

### 3/11 — DUE GUARDIE CHE NON GUARDAVANO: la riga Pista obbligatoria e il contratto INTERO di `out.dizionario` (richiesta Mauro: «Rinforza i due casi condizionali emersi nell'inchiesta di oggi: l'assert su rigaPista in race-card.test.mjs e il contratto di out.dizionario in cli-watch.test.mjs»)
- **Il primo buco**: in [test/race-card.test.mjs](test/race-card.test.mjs) la verifica della riga «Pista» era `if (rigaPista) assert.ok(…)`: se la riga spariva dalla scheda il test restava VERDE e la card perdeva la pista in silenzio. Adesso la riga è obbligatoria — `assert.equal(righePista.length, 1)`, col contenuto della scheda nel messaggio se non torna — e il valore è fissato INTERO: `Imola — layout GP`, la pista SEMINATA col suo layout, non la Monza della ladder e non «una stringa qualsiasi che contenga layout GP».
- **Il secondo buco**: in [test/cli-watch.test.mjs](test/cli-watch.test.mjs) lo stub del rinfresco restituiva `{ storage: {added, corrette, aggiornate}, paddock: {added, corrette, nota} }` — senza `paddock.aggiornate` — e le asserzioni guardavano due numeri e la nota: una chiave persa per strada dal tick sarebbe passata liscia e la riga «dizionario: …» del CLI sarebbe sparita senza che nessuno protestasse. Ora la lezione è il contratto intero e il tick la restituisce IDENTICA (`deepEqual`, con l'oggetto ricostruito a ogni chiamata per non confrontarlo con sé stesso).
- **La guardia che mancava**: test nuovo *refreshDizionario: il contratto di out.dizionario — chiavi e zeri che cli.mjs legge* — il rinfresco VERO (non iniettato) nel nido vuoto: `Object.keys` esatti (`storage`/`paddock`; `added, corrette, aggiornate` e in più `nota`), i sei contatori numeri finiti **≥ 0 anche a zero**, e `paddock.nota` SEMPRE una stringa (mai `undefined` da stampare).
- **Il nido che prima non c'era**: `watchOnce` chiama il rinfresco a ogni tick, e quello vero legge `ui_storage` e il journal del paddock dal Saved Games; la suite del watcher non aveva `ACE_GAME_SAVEDIR`/`APP_JOURNAL_DIR`, quindi guardava l'installazione vera e poteva scrivere `data/samples/garage/map.json`. I due env ora si fissano in testa al file, PRIMA di ogni import di `src/` (GAME_SAVEDIR è una costante decisa al load). Misurato: `map.json` md5 `88f34c0a…` e mtime 03:20 prima e dopo la run — intatto.
- **Il morso provato** (le due guardie devono mordere, non solo passare): tolto `aggiornate` da `paddock` in [src/watch.mjs](src/watch.mjs) → `not ok 7` sul test del contratto; tolta la riga Pista da [src/race.mjs](src/race.mjs) → `not ok 1` sulla scheda col MIRROR (e `not ok 15` sui layout reali). File ripristinati dal backup byte-identico, verdi di nuovo.
- **Verifica**: `node --test test/cli-watch.test.mjs test/race-card.test.mjs` → **26/26 verdi** (cli-watch 9/9 col test nuovo, race-card 17/17); Biome pulito sui due file.

### 3/11 — LA BEFFA DELLA FASCIA MEZZA AL BANCO FERMO: la sandbox dove SOLO la guardia morde (richiesta Mauro: «aggiungi la prova della beffa preflight al banco fermo: un test che scrive una fascia mezza JSON in una sandbox e aspetta che genera-uiapp + la guardia siano l'unica soglia che la prende»)
- **Il file**: [test/beffa-preflight.test.mjs](test/beffa-preflight.test.mjs), un test solo, ~1,2 s. La prova che in diretta avevamo fatto a mano sulla stanza del gioco (fascia mozzata + `crea-release --solo-preflight`) ora si ripete a ogni `npm test`, senza toccare la stanza vera.
- **Il banco**: radice Saved Games FINTA in temp comandata con `ACE_SAVEDIR` (in [src/paths.mjs](src/paths.mjs) l'override vince su ogni radice reale), popolata COME la stanza vera — le due app installate con `app.json` + costruito IDENTICO + il marcatore `Video/` del loader — e dentro una fascia `ui-3586822415.json` TAGLIATA A METÀ (`{"periodoMs":2500,"ora":"14:0`). Il test asserisce che non si parsa: se parsasse, non proverebbe niente.
- **Le due soglie del preflight, con la loro vera uscita**: `node tools/genera-uiapp.mjs` esce **0** e la mezza resta mezza (la build le fasce non le guarda e non le riscrive — le nasce solo il publisher) e non vede copie stantie; `node --test test/uiapp-installata.test.mjs` (TAP) esce **non-zero** con **UN SOLO `not ok`** — il test FASCE DEL PUBLISHER IN GIOCO, col percorso del file guasto nel messaggio — mentre COSTRUITI CON FIRMA, COPPIA IN GIOCO ALLINEATA e PAGINE D'INGRESSO IN GIOCO sono verdi **e non saltati** (la radice finta è presa per stanza installata: una sandbox ignorata darebbe skip, cioè falso-verde).
- **L'inciampo che il banco ha trovato subito**: dentro un test Node marca `NODE_TEST_CONTEXT` e un `node --test` annidato si rifiuta di partire («node:test run() is being called recursively within a test file. skipping running files») uscendo 0 — proprio il falso-verde che il test deve impedire. Il figlio gira con quella variabile tolta: è la STESSA run che fa crea-release. Secondo dettaglio: TAP scrive i messaggi d'errore a riga singola come stringhe JSON, i `\` di Windows arrivano raddoppiati; il confronto sul percorso si fa sul testo appiattito.
- **Il morso provato**: mutata la guardia (`assert.ok(true || …` sull'esito della fascia) il banco diventa ROSSO con «la guardia NON ha preso la fascia mezza al banco (exit 0): il preflight lascerebbe passare una fascia mozzata in gioco»; file ripristinato `cmp` byte-identico, verde di nuovo.
- **Verifica**: `node --test test/beffa-preflight.test.mjs` → 1/1 verde (guardia figlia: 7 pass, 1 fail = la fascia, **0 skip**); Biome pulito sul file nuovo.

### 3/11 — la fascia si scrive ATOMICA: `writeJsonAtomic` nel publisher (richiesta Mauro: «Cerca di far scrivere al publisher le fascie in modo atomico (writeJsonAtomic) come già fa il quaderno di calibrazione»)
- **Cosa cambia**: le TRE scritture di fascia di [src/uiapp-pub.mjs](src/uiapp-pub.mjs) — Cruscotto, mini-Pitwall e canale Paddock di `fasceApp` (5 slot per tick) — passano da `writeJsonAtomic` (tmp + rename) invece di `writeFileSync` direttamente sul file buono. Il gioco legge `ui-<slot>.json` a ogni slot: una scrittura interrotta lasciava sul disco un JSON mozzo, e il pannello mostrava vetrina vuota o «fascia scaduta» su una fascia che era fresca. Col rename il file è o la versione vecchia o la nuova, mai una via di mezzo.
- **Il formato non cambia**: [src/atomic.mjs](src/atomic.mjs) accetta un terzo argomento `{ pretty = true }`; le fasce si scrivono `{ pretty: false }`, compatte come prima — misurate 17 875/17 876 byte per il Cruscotto e 864 per la mini-Pitwall — mentre i registri che si leggono a occhio restano indentati. Se il rename non riesce (su Windows il gioco può tenere il file aperto nell'istante dello scatto) il `.tmp` non resta orfano: si toglie e l'errore risale, così il tick riprova allo slot dopo.
- **La guardia**: test nuovo in [test/uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs) — zero `writeFileSync` diretti su `ui-${…`, TRE scritture via `writeJsonAtomic`, e la principale compatta. Morso provato mutando la scrittura della Pitwall: rosso con «publisher: scrittura diretta di una fascia (writeFileSync(join(dirP, `ui-${)», poi file ripristinato `cmp` byte-identico.
- **Le prove**: `uiapp-periodo` 7/7 (col test nuovo), `potatura-fasce` 3/3 — il file non parsava, una virgoletta (`l'eccesso` dentro un apice singolo) e quel test non era mai stato eseguito: corretta, e i tre casi ora girano su `uiappTick` vero in sandbox — `fasce-app-stabili`, `uiapp-tick-coda`, `uiapp-pub-app` verdi, `atomic` 2/2, Biome pulito sui quattro file toccati.
- **In servizio**: rientro col publisher vero (`node tools/riavvia-webui.mjs`), porta 8642 sul PID nuovo **7200**, `/api/agg-info` 200. Poi 15 secondi di letture a raffica sulle due cartelle: **240 letture valide, 0 JSON mozzati, 0 fasce sparite fra `readdir` e `readFile`, 0 `.tmp` mai visibili**. La fascia continua a portare `guardia: {alive:true…}` e `validaFino` corretti: il battito della guardia non è stato toccato dal cambio di scrittura.

### 3/11 — chiusura del giro di verifiche: i due gusci d'anteprima spenti, il publisher intatto, le guardie verdi
- **Le anteprime**: `_preview-cruscotto` (9104) e `_preview-pitwall` (9107) NON rispondono più (`curl` → `000`, nessun `LISTENING` su quella fascia in `netstat`): erano già spenti, nessun processo d'anteprima da spegnere — e nessun `node.exe` vivo li porta in riga di comando. Il tab stantio d'anteprima è stato chiuso: nel browser restano solo schede sul publisher (8642).
- **Il publisher resta**: [src/webui.mjs](src/webui.mjs) PID 12648 in ascolto su 127.0.0.1:8642 — INTATTO, non toccato: è la GUI del progetto, non un'anteprima. Restano vivi anche l'osservatore del campionato e l'ascoltatore del copilota, estranei a questo giro.
- **Le verifiche, in chiaro** (tutte rifatte dopo l'ultimo edit): [test/wx-auto.test.mjs](test/wx-auto.test.mjs) 19/19 — lo scarto da `trackMatches` lascia la voce col perché, diario di sandbox e `data/wx-auto.jsonl` vero intatto; [test/nav-bottoni.test.mjs](test/nav-bottoni.test.mjs) 2/2 — il vero `drawNav` eseguito senza browser, un bottone per ogni tab di TABS — più [test/viste-guard.test.mjs](test/viste-guard.test.mjs) 6/6, 8/8 insieme; Biome pulito su `wx-registro`, `wx-auto`, `viste-a`, `nav-bottoni`. Il morso delle due guardie è provato mutando il codice e riportandolo `cmp` byte-identico.
- **Il launcher**: [avvia.cmd](avvia.cmd) senza le due righe di commento del magazzino (diff di soli commenti, `-2`); il controllo a mano resta [controlla-magazzino.cmd](controlla-magazzino.cmd), documentato nei README.
- **Nessun commit**: tutto il lavoro del giro è ancora sul disco, da leggere con `git diff` prima di committare.
- **Il prossimo giro**, proposto e non iniziato: il pre-volo di `rondaPaddock` ([tools/ronda-ladder.mjs](tools/ronda-ladder.mjs)) — piano incompleto = zero scritture, invece del `BAD_LAPS` al quarto passo — e la scelta del migliore in `findCar` ([tools/set-driver-car.mjs](tools/set-driver-car.mjs)), con l'alternativa dichiarata nel report.

### 3/11 — la guardia PICCOLA della sidebar: il vero `drawNav` eseguito senza browser (richiesta Mauro: «aggiungi una piccola guardia test che fallisce se #nav non contiene un bottone per ogni tab di TABS, così una futura edit di drawNav non può più svuotare la sidebar»)
- **Perché una seconda guardia**: [test/guardia-nav.test.mjs](test/guardia-nav.test.mjs) misura già la sidebar vera, ma vive di server + Chromium: senza `playwright-core` o il chromium in cache si SALTA dichiarata, e nel giro normale (`npm test`) la sidebar restava senza sentinella.
- **La legge nuova** ([test/nav-bottoni.test.mjs](test/nav-bottoni.test.mjs), 2 test, ~95 ms): legge `gui/js/core.js`, estrae il VERO corpo di `drawNav` (parentesi contate), lo esegue con un `$` minimale che cattura l'`innerHTML` scritto su `#nav`, e confronta i `data-tab` usciti con l'elenco `TABS` letto dal sorgente — UNA sola verità, nessuna lista a fotocopia (un tab nuovo entra da solo nella legge). Il secondo test vuole i `NAV_GROUPS` che coprono TABS per intero e nessun bottone muto (senza `data-tab`, salvo l'Aiuto).
- **Il morso provato due volte** (core.js copiato in `tmp/`, mutato, guardia fatta cadere, poi `cmp` byte-identico e `rm`): 1) tolta la riga `$('#nav').innerHTML = …` → «drawNav non scrive più niente su #nav: la sidebar nasce VUOTA»; 2) tolto `'gironi'` dal gruppo Studio → «SIDEBAR INCOMPLETA: #nav non ha il bottone di 1 tab su 19 — mancanti: gironi» + «tab fuori da ogni NAV_GROUPS: gironi». Ripristinato: 2/2 e 6/6 verdi con [test/viste-guard.test.mjs](test/viste-guard.test.mjs), Biome pulito.
- **Il buco che nominano i messaggi**: `drawNav` filtra `TABS` dentro i gruppi — un tab che sfugge a `NAV_GROUPS` resta in `TABS` e non ha bottone: è lo stesso vuoto dell'incidente, senza la riga sparita.

### 3/11 — lo scarto della pista entra nel diario del bollettino (richiesta Mauro: «aggiungi a wx-registro una voce nel diario quando una scrittura viene scartata da trackMatches, per capire cosa il bollettino non scrive»)
- **Il buco**: quando il Risultati era di un'altra pista il bollettino usciva in silenzio (`if (!trackMatches(…)) continue;`), sia a fine sessione sia al cambio ronda: sul diario restavano le sole scritture riuscite, e «non ha scritto» era indistinguibile da «non c'era niente da scrivere».
- **La voce** ([src/wx-registro.mjs](src/wx-registro.mjs)): nuovo export `registraScarto({ via, motivo, sessione, pista, attese, preset, label, verso, file })` — stesso file JSONL e stesso taglio a 300 righe, forma `{ at, via, esito: 'scarto', motivo: 'pista', sessione, pista, attese, preset, label, verso, file }`. `esito` vive SOLO sulle righe scartate: le voci vecchie restano valide, nessuna migrazione.
- **I due cancelli** ([src/wx-auto.mjs](src/wx-auto.mjs)): le due uscite del `trackMatches` — `wxAutoTick` (via `fine-sessione`, `verso` = la sessione che avrebbe ricevuto il meteo) e `wxAutoPrima` (via `cambio-ronda`, `verso` Practice) — registrano PRIMA di uscire. Il valore di ritorno del tick resta `null`: contratto invariato (nessuna scrittura), il diario è l'unico che parla.
- **La GUI** ([gui/js/viste-a.js](gui/js/viste-a.js)): nel pannello «Regole di questo weekend · meteo» la riga si legge `✕ scartata (pista «Imola» non tra le attese: Monza / Monza GP) ↳ Warmup 🌧 Pioggia · file` — uno scarto non si spaccia per una scrittura, una scrittura non si spaccia per uno scarto.
- **Verifica**: [test/wx-auto.test.mjs](test/wx-auto.test.mjs) 19/19 — due nuove asserzioni sul registro vero (scarto da fine-sessione con pista/attese/verso/preset/file; scarto da cambio-ronda: la Race di Imola non blocca le Prove di Monza e la voce lo dice) con `EVO_DATA_DIR` di sandbox, `data/wx-auto.jsonl` intatto; `node --check` sulla GUI e [test/viste-guard.test.mjs](test/viste-guard.test.mjs) 6/6 verdi.

### 3/11 — l'autocura AGGANCIATA al guardiano delle griglie: la griglia appena scritta da EVO si cura da sola (richiesta Mauro: «aggancia la cura al guardiano raccogli-griglie così ogni griglia appena scritta da EVO si autocura da sola»)
- **Il gancio** in [tools/raccogli-griglie.mjs](tools/raccogli-griglie.mjs): il guardiano importa `autocuraVivo` da [src/grid-cura.mjs](src/grid-cura.mjs) e la chiama nel tick dei 3 s quando il file cambia O quando resta un veleno in attesa (`ATTESA_AUTO`: `gioco-aperto` / `senza-donore`) — col gioco aperto la cura si riprova a ogni giro e scatta da sé alla chiusura, senza nessun comando a mano. I casi si raccontano in console coi verbi della cura (⚠ da guarire a gioco chiuso / ✅ fotocopiate con l'identità vera + backup e roster / ⚠ senza donatore).
- **Il buco che la prova ha trovato e chiuso**: al primo giro la prova end-to-end è andata ROSSA — un guardiano acceso con la griglia velenosa GIÀ sul disco (stesso mtime, nessuna scrittura nuova) non la visitava mai. Aggiunta la visita **al via**, prima del `setInterval`: ora si cura sia la griglia che arriva dopo, sia quella che il guardiano trova accendendosi (o riaccendendosi).
- **L'ordine conta**: la visita viene PRIMA della `fotografia`, quindi magazzino e fabbrica ricevono la griglia **curata**, non il veleno — e la foto di ciò che EVO ha scritto non si perde.
- **La guardia** ([test/grid-cura.test.mjs](test/grid-cura.test.mjs), test 7): legge la SORGENTE VIVA del guardiano e vuole quattro cose — l'import di `autocuraVivo`; due chiamate a `refisciAuto(autocuraVivo())` (al via E nel tick); quella del via prima del `setInterval`; quella del tick prima della fotografia; più `ATTESA_AUTO.has(statoAuto)` (un veleno in attesa non si dimentica). Prova del morso: tolta la riga del gancio il test cade rosso col colpevole nominato («il tick del guardiano non chiama più …»), ripristino byte-identico (`cmp`) → 7/7.
- **La prova end-to-end** ([tmp/_prova-gancio-autocura.mjs](tmp/_prova-gancio-autocura.mjs)): sandbox `ACE_GAME_SAVEDIR`, due fasi sul VERO guardiano — A) veleno già sul disco all'accensione, curata in 2,8 s; B) griglia velenosa scritta mentre il guardiano vigila, curata in 1,5 s. In entrambe: backup `.bak-autocura…` presente, f10 = «Supra MKIV Preset Base» (la Standard sparia), cella finta intatta byte per byte, una cella sola curata, grezze di prova rimosse a fine prova (nessuna traccia in magazzino o fabbrica).
- **Verifica**: node --test test/grid-cura.test.mjs → 7/7; Biome zero warning sui tre file toccati (tolto anche `veleniIn`/`gameRunning` rimasti inutilizzati nell'import); `node tools/raccogli-griglie.mjs --stampa` parte e stampa il quadro (il guardiano acceso resta a Mauro).

### 3/11 — chiusura della verifica delle fasce in gioco: i tre pannelli (richiesta Mauro: «chiudo la verifica della cura delle fasce: traffica i pannelli del Cruscotto, Pitwall e Paddock a EVO e dimmi se restano vivi senza errori di caricamento»)
- **Stanza**: EVO NON era vivo nel collaudo (già chiuso); la vetrina comunque sì (publisher di 8642, pid 12648 — fasce scritte nel secondo per tutti e tre i pannelli). Verifica in due piani: i log veri di gioco (4 sessioni di oggi-ieri) e le guardie/gusci come da protocollo del progetto.
- **EVO nel log**: loader 0.27.0 ha registrato 3 app (presets/bundled); cruscotto 1.2.0 e paddock 1.0.2 caricati alle 09:35 col blocco nav che ha preso i comandi del menu; NESSUNA riga [error]/[warning] riferita a apploader/uiresource/paddock su oggi (253 voci del loader) né ieri; il cruscotto porta solo note CSS di GameFace (pseudo-classe :disabled, word-wrap/border-collapse: parlate del motore, mica guasti di cruscotto.js) e una «Failed loading resource ui-717477969.json» = ROLLOVER della fascia dopo il riavvio del publisher, con la cura di recupero nella riga successiva («fascia scaduta … il publisher lo ripropone in fascia viva»). Sessione di gioco chiusa PULITA alle 09:46 (uninit Renoir/COHTML, nessun crash).
- **Le guardie verdi sul vivo**: uiapp-installata 8/8 (fasce JSON intere, tutte e tre le cartelle installate), app-bridge 13/13, fasce-app-stabili 2/2, uiapp-pub-app 8/8. NOTA: gli elenchi di test di altri appunti sono rimasti indietro — test/paddock-bridge, test/fasce-paddock-stabili e test/uiapp-pub-paddock NON ESISTONO PIÙ: omonimi rinominati (app-bridge, fasce-app-stabili, uiapp-pub-app); gli appunti che li nominano vanno aggiornati.
- **I gusci di anteprima sul vivo**: _preview-cruscotto (9104) e _preview-pitwall (9107) aperti nel browser, pannello col click del drawer come in EVO: cruscotto completo (guardia, registro cambio-auto, prepara, gare di oggi, classifica, mondiale, mail, eredità) e pitwall completo (radio del copilota + battito della guardia), tick di 2,5 s TUTTI 200 e console PULITA (3 righe di avvio, zero errori). La banner ⏳ «Fascia scaduta» nel guscio dell'anteprima è l'artefatto della scelta «più fresca sul disco», che a volte resta UN slot indietro dello slot che l'app domanda (misura nel browser: 600 ms oltre validafino; al giro dopo — slot combaciato, validafino 2 s avanti — rientra): in gioco NON esiste, l'app chiede il SUO slot.
- **Per il giro DENTRO il gioco**: resta a Mauro l'avvio di EVO (i pannelli sono già bevuti dal loader); il timestamp di gioco 09:34–09:46 ha comunque tenuto i tre pannelli saldamente senza errori di caricamento nel log.
- **Rimanenze**: le copie inerti _OFF-cruscotto/_OFF-pitwall nel loader restano da ripulire; tab di anteprima chiuse e i due gusci spenti (9104/9107), il publisher 8642 INTATTO.

### 3/11 — l'audit «altre fonti duplicate» dei PATH delle griglie: la FABBRICA e il NOME dei bak in voce UNA, la sonda dei candidati riscritta in prova (richiesta Mauro: « guarda se ci sono altre fonti duplicate del path delle griglie (snapshot, fabbrica, bak) da unire come fatto per il magazzino»)
- **Il quadro dell'audit** (ricerca a fasci: fabbrica, snapshot, magazzino, bak — src, tools, sandbox):
  * **SNAPSHOT**: già VOCE UNA (SNAPSHOTS_DIR in grid-apply) — nulla da curare, né in src né in webui (che da 3/11 legge templatePathOf dallo stesso modulo).
  * **FABBRICA**: TRE ricostruzioni in DUE moduli — grid-apply:53 e gridbuilder:344+357 (l'ultima copia incollata nello STESSO file), ognuna che ridefiniva `process.env.EVO_FACTORY_DIR ?? config/griglie-fabbrica`: la stessa ferita del magazzino prima del 3/11. VOCE UNA in [evo-grid.mjs](tools/evo-grid.mjs) (`FACTORY_DIR` esportata, sotto a entrambi: c'è il ciclo di import grid-apply → gridbuilder, la voce non poteva vivere in nessuno dei due, e entrambi importano già da lì); grid-apply e gridbuilder la leggono. I sandbox restano env EVO_FACTORY_DIR, come ACE_GAME_SAVEDIR.
  * **BAK**: bakName+pruneBackups erano già fonte UNA da 31/10, ma due costruzioni A MANO del nome erano rimaste al MINUTO: cli.mjs:1381 (`bak-griglia-`, nel flusso `griglia`) e webui.mjs:2066 (`bak-evento`, nel ramo evento) — due scritture nello stesso minuto si sovrascrivevano a vicenda (la lezione del 28/10 che bakName risolve). Entrambe passate a `bakName(file, tag)` (al SECONDO + anti-collisione -rN), re-exportato da grid-apply accanto a pruneBackups (cli e webui lo importano da lì, come già facevano per la potatura). I bak con tag di lavoro dei tool di manutenzione restano com'erano (ogni cura il SUO tag).
- **La sonda dei candidati riscritta** ([tmp/_prova-candidati-griglia.mjs](tmp/_prova-candidati-griglia.mjs)): in-process sul VERO modulo (rebuildGridApply force) con env di sandbox; 5 fasi dalla scozzese lunga: cartuccia spezzata VERA (tag + varint tagliata in due → «varint oltre fine») → magazzino → bak decodificabile davanti ai bak rotti (mtime desc) → snapshot → fabbrica col SUO prefisso → CANCELLA CAR_MISSING (auto inventata: errore col codice e l'auto nel messaggio, cartuccia intatta sul disco). 18/18 verdi in un solo giro, di nuovo verde DOPO l'unione della fabbrica (la voce unica letta dal sandbox env) — prova che la ridefinizione vive soltanto nel file dove c'è l'interruttore.
- **Verifica**: import vivo di webui ok (no secondo processo: l'istanza già attiva è riconosciuta); biome sui 5 file toccati = 1 warning preesistente (webui:135, `canChoose` inutilizzato nell'import agenda — non toccato).

### 3/11 — LA PROVA SUL VIVO del banner del giro singolo: la 296 di Monza 17:11 vs 17:54 (richiesta Mauro: «prova sul vivo del modale A/B con il banner del giro singolo montato sulla 296 di Monza 17:11 vs 17:54»)
- **La coppia sul banco**: A = ven 30/10 ore 17:11 — 1 beacon, «best» 332,70 s (5:32.7: la durata dell'USCITA senza cronometro, la stessa lezione della 18:13 — con un solo beacon il parser tiene la SESSIONE INTERA come unico giro) vs B = ven 30/10 ore 17:54 · 2 giri · 1:54.4. Stessa 296 GT3, stessi banco e preset (296gt3_mech, MonzaGP): confronto GIUSTO, auto e pista combaciano — nessun bordo arancio nei selettori. La benzina conferma il «best» spurio: 6.11 l «a giro» in A contro i 3.08 reali della B — il consumatore non raddoppia, è il contatore che copre la sessione intera.
- **Il montaggio sul vivo** (a server vivo, 8642, pagina nel browser): POST ab-setup col nome dei due .ld del disco → 200 ok (contratto: `A.laps = 1`, `bestLapSec 332.7` / `B.laps = 2`, `114.4`). I selettori del banco si autopuntano SOLI sulla coppia — è la legge del 2/11: la coppia riuscita resta nel save come `abBanco` e il banco la ripropone a riapertura. Zero righe di codice toccate: la legge senza-giri la convalida (1 beacon ≥ 1: la 17:11 entra nel selettore E nel confronto, e il banner la denuncia in testa).
- **Il banner, VIVO nel modale** (bottone «Confronta» del banco reale): in testa, sopra i due cartoncini — «⚠️ Attenzione: un solo giro valido — la sessione A ha un solo giro: il «best» può essere un out-lap senza transito cronometrato (nessun beacon), guardalo prima di fidarlo.» I cartoncini del modale datati: «A · 296gt3_mech · 332,70s · Fri Oct 30 171106 2026.ld · 30/10/2026 17:11 · 1 giri» / «B · 296gt3_mech · 114,40s · 175456 · 30/10/2026 17:54 · 2 giri». Console della pagina PULITA (zero errori).
- **Nota di consegna**: il montaggio SOVRASCRIVE l'ultima scelta del save (là c'era la coppia Imola MX-5 del 2/11): il banco ora apre con questa coppia — per la MX-5 basta ricliccare i selettori o il confronto giusto (i due file sono rimasti al disco, dove erano).
- **Il quadro-zone della coppia**: zoneTimeline ok MA check ok:false (tolleranza 0.08 s a zona · 0.15 s netto; frenata −3.32 · uscita +8.13 · gas −22.37) — la guardia d'allineamento resta la cura da prendere per NON leggere SCARTI FINTI (l'indagine del report 296 Monza del 3/11). Il banner NON sostituisce quella cura: dice QUANDO NON fidarsi delle fette, la guardia d'allineamento dirà DOVE si perde davvero lungo il giro.

### 3/11 — la guardia dell'avviso del giro singolo nel modale A/B (richiesta Mauro: «un guard test che fallisce se il modale A/B non porta l'avviso del giro singolo»)
- **Il perché** (la lezione del banco Monza 296 · 18:13): una sessione con un SOLO giro valido può essere un OUT-LAP senza cronometro — il `.ldx` senza beacon e il parser tiene la SESSIONE INTERA come unico giro ([motec.mjs:180](src/motec.mjs#L180)), così il «best» è la durata dell'uscita (133,10 s), non un giro. Il modale del confronto porta per questo un banner ⚠️ in testa, SEMPRE, quando A o B arriva con un solo giro valido ([viste-analisi.js:380](gui/js/viste-analisi.js#L380): `unSoloGiro` → `avvisoGiro`).
- **Il buco**: il banner era a vista ma SENZA GUARDIA — e le viste della GUI non girano in node (la lezione di [viste-guard.test.mjs](test/viste-guard.test.mjs)): la rottura è un cancello che si toglie con un backspace e Biome non la vede (compila ogni file isolato, senza il contratto con `d.A.laps`).
- **La guardia** ([test/ab-avviso-giro.test.mjs](test/ab-avviso-giro.test.mjs)), a SORGENTE VIVO: legge `gui/js/viste-analisi.js` TESTUALMENTE dentro la fetta del modale — dal titolo «Banco A/B — confronto» alla sezione 4) MONTE CARLO, tutta la veste resa dal modale, così nessun `${avvisoGiro}` può rifugiarsi fuori posto in altro file o altro modale. Tre leggi:
  1. il banner è DENTRO il modale: `${avvisoGiro}` cercato nella fetta — cancellarlo dal template = test rosso;
  2. il trigger è il CONTO GIRI: `d.A.laps === 1 || d.B.laps === 1` — niente banner di fondo a caso; `avvisoGiro` resta un ternario su `unSoloGiro`;
  3. l'avviso dice COSA guardare: out-lap e beacon nel testo del banner, in ENTRAMBE le lingue («out-lap», «nessun beacon» it / «no timed crossing», «no beacons» en) — l'avvertimento regge anche tradotto.
  Faro protetto: se il marker del titolo o la fine della sezione si muovono, la guardia esce SUBITO col messaggio giusto («sistemare il faro della guardia»), non con un falso verde.
- **Prova del morso**: `${avvisoGiro}` tolto dal template a sorgente → il test del banner cade ROSSO col colpevole nominato («GUARDIA COLPITA: il modale A/B non porta più ${avvisoGiro} — l'avviso del giro singolo è sparito dal confronto», 2 pass / 1 fail); ripristino byte-esatto (`cmp`) → 3/3.
- **Verifica**: node --test test/ab-avviso-giro.test.mjs → 3/3 verdi; biome: i 2 warning NOTI del file della guardia (i placeholder `${avvisoGiro}` letterali nel testo dell'attesa, la stessa nota `noTemplateCurlyInString` già registrata per la guardia GUI del 3/11) e nessuno nuovo.

### 3/11 — la guardia senza-giri arriva ANCHE all'endpoint del banco (richiesta Mauro: «anche l'endpoint ab-setup deve rifiutare le sessioni senza giri cronometrati, non solo il selettore»)
- **Il buco**: la legge del 2/11 chiudeva la porta del SELETTORE — ab-list esclude le 0 beacon dai menu e le guardie le tengono fuori da `sessions`/`senzaGiri`/`prefer`/`last`. Ma l'endpoint `ab-setup` (la costruzione del CONFRONTO) montava QUALSIASI coppia arrivata via POST — sia nome dal disco sia PATH ASSOLUTO (fallback isFile): l'ultima porta posteriore rimasta aperta dalla legge del 2/11. Il menu slamava la voce «disabilitata», ma il JSON di ab-setup la accettava comunque.
- **La cura** ([webui.mjs](src/webui.mjs), case `ab-setup`): dopo il pick delle due sessioni, la STESSA verifica del selettore — `parseLdx` sul `.ldx` di ogni lato; zero beacon = 400 «Sessione senza giri cronometrati (0 beacon nel .ldx): fuori dal banco A/B — <nomi>» (localizzata it/en, col nome dei file rifiutati). Le due porte chiuse assieme: nome dal disco E path assoluto del fallback. La coppia bocciata = niente setupAB, niente quadro-zone, niente persist: `state.abBanco` resta intoccato dai file morti.
- **La prova** (terzo test in [ab-senza-giri.test.mjs](test/ab-senza-giri.test.mjs), a server vivo): nome morto → 400 col nome in errore; path ASSOLUTO del .ld cieco → 400 uguale; il save NON toccato dai rifiuti; poi la coppia BUONA fila (200 ok, righe del banco) e si scrive nel save come sempre — la guardia non spegne il banco vero.
- **Il bug CHE LA PROVA HA SCOPERTO**: i test del file montavano la sandbox SOLO per il MoTeC (`ACE_DATA`), ma `persist`/`requireState` leggono `SAVE_FILE` che segue `EVO_DATA_DIR` (webui-env, la regola del bug 23/10) — la prova del banco buono ha scritto abBanco finto NEL SAVE VERO del progetto. Restauro dal backup automatico del 2/11 (coppia Imola MX-5, rimesso a posto SOLO il campo, formato identico). E la cura sul banco di prova: i TRE test del file ora portano ANCHE `EVO_DATA_DIR: DATA` — la sandbox è alzata a carriera intera; i due test vecchi leggevano il save vero in passivo (e passavano per i motivi sbagliati).
- **Il diff suite spiegato**: 901/901 verdi (exit 0, log tmp/suite-guarda-ab-setup.log) contro i 907 della sera — i 6 punti mancanti erano della copia-scratch tmp/pacco-test (non è più sul disco): fuori da test/ non c'è NESSUN file .test.mjs (132 file, tutti nel banco vero). Biome pulito (warning preesistente di webui.mjs).

### 3/11 — il discarico delle copie in blocco del 25/10 (richiesta Mauro: «discolpa le copie in blocco, verifica che la legge senza giri le copra, con voce al diario»)
- **Il necessario**: il blocco del 25/10 (ore 22:08:38–44) ha lasciato sul disco **29 file `.ld` SENZA il proprio `.ldx`** — file aridi da 20–21 KB sulle Apr 15/16/17 (Audi R8 GT4 Monza ×3 · Ferrari 296 Monza ×2, Red Bull Ring ×6, Suzuka ×1 · Ferrari 288 GTO Sebring ×1 · Countach Monza ×6, Sebring ×1 · Mini JCS Red Bull Ring ×2 · Peugeot 205 T16 Red Bull Ring ×7 · Porsche GT3 RS SuzukaEast ×1). Il conto chiude: 269 `.ld` a disco = 240 con `.ldx` + 29 aridi.
- **La legge vale e li copre TUTTI**: replica a sorgente della logica dell'endpoint A/B ([webui.mjs:1490-1511](src/webui.mjs#L1490-L1511)) sui file reali — il save corrente non porta `createdAt` (tutto visibile, il caso peggiore da buttirci dentro) e con 269 voci visibili il banco monta 229 `sessions` (beacon > 0) e **40 `senzaGiri`**: i 29 aridi ci cadono TUTTI (parseLdx su file mancante → `[]` → beacons 0, [motec.mjs:64](src/motec.mjs#L64)), più 11 voci morte con `.ldx` presente ma senza marker BCN (out-lap e `.ldx` cieco: la coppia out-lap 18:13 di Monza, Oulton 30/10, Donington 18/10, ecc.). Match arido-per-arido: **29/29 coperti, nessuno perso** — nessun arido può farsi A o B né entrare nell'autopuntamento (che leggi SOLE le sessions).
- **Niente da curare**: la difesa era già in piedi dalla legge del 2/11; la presente è la conferma a disco vivo. Lettura pura, nessun file toccato.

### 3/11 — la carta del CONFRONTO GIUSTO di Monza, e il difetto del giro-record che l'ha fermata
- **Il caso** (richiesta Mauro, già rimandata dal verdetto del 1/11: «confronto GIUSTO 17:54 (30/10) contro 14:31 (29/10, 1:42.6) — scrivi dove la serata perde»): la coppia è valida (2 giri pieni, stesso preset, nessun beacon morto) e le canali puntano tutti nel GAS: gas medio giro-best 73.7% vs 80.3%, gas pieno 65.8% vs 73.5%, TC 1.6% vs 0.5% — con pressioni (freddo 24.5/24.4, caldo 25.9/26.0), camber, benzina e costanza in frenata (nessuna zona calda: la matita non è il colpo) rimasti a parità. Δ best −11.8 s.
- **Il difetto emerso**: i riparto e le fette per zone DI QUESTA COPPIA sono artefatti di allineamento, da non leggere: la somma Σdt/vB sulle fette di A dà 114.14 s mentre il tempo atteso del record scalato (T_B·D_A/D_B) è 103.17 s (scarto 10.97 s); errore medio fra i profili di velocità 55.6 km/h e NESSUNO sfasamento fino a ±30% del giro lo sistema; nello stesso file B il secondo giro valido (1:43.6) si allinea invece a 14.8 km/h. Sospetto: wrap del canale distanza al traguardo nel giro-record (1:42.6 — distanza dichiarata 5.725 km vs 5.760 del giro gemello).
- **Il secondo difetto**: il registro `quadroZoneCheck` resta muto sul caso perché striscia e banco montano la STESSA mappa sbagliata (stesso `xs` dell'A): la guardia confronto due implementazioni dello stesso conto. Proposta: guardia di allineamento diretta — Σdt/vB vs T_B·D_A/D_B con tolleranza ~0.5 s a setupAB/zoneTimeline (qui avrebbe gridato 10.97 s).
- **La carta**: [report/banco-ab-ferrari296-monza-2026-11-03.md](report/banco-ab-ferrari296-monza-2026-11-03.md), verdetto a chiserve: la serata perde nel GAS (fiducia nel piede, non auto/gomme), il DOVE lungo il giro serve dopo la guardia d'allineamento.

### 3/11 — il contatore delle sessioni nel foot del banco A/B
- **Il caso** (richiesta Mauro: «senzaGiri (0 beacon) nel contatore delle sessioni del foot di ab-list, per accorgersene a colpo d'occhio»): i gruppi «senza giri cronometrati» dei menu A/B si vedono solo col menu APERTO — il numero di voci morte in coda restava invisibile a vista.
- **La cura** ([viste-analisi.js](gui/js/viste-analisi.js)): una riga contatore `#ab-cnt` sotto alla nota del banco, riempita DOPO la fetch di `ab-list`, conta DAL DISCO (non coi filtri): «N sessioni cronometrate» e — SOLO se ci sono — « · M senza giri (0 beacon)» col numero in evidenza col colore dell'avviso: la stessa dicitura della coda del menu, visibile anche a mano morta.
- **Verifica**: biome pulito; guardie a sorgente vivo verdi (10/10: [ab-senza-giri-gui.test.mjs](test/ab-senza-giri-gui.test.mjs) + [viste-guard.test.mjs](test/viste-guard.test.mjs)) — il contatore è markup dell'interfaccia, quello che conta non cambia: niente `opt` che nascono disabilitate in più.

### 3/11 — la prova del banco tutto morto a server vivo
- **Il caso** (richiesta Mauro: «quando un filtro non riesce — né A né B —
  aggiungi la prova, senzaGiri piena»): il banco può avere OGNI sessione
  0 beacon (copia in blocco senza .ldx, salvataggi senza marker BCN): il
  filtro del server non trova A né B; la GUI non deve però né cadere né
  perdere la coda disabilitata. A lettura del codice `last` torna già
  null col contratto `sessions.some(...)` su lista vuota, e
  `abPreferite([])` torna null senza lanciare (gruppo < 2,
  [analisi.mjs:557](src/analisi.mjs#L557)) — ma NESSUN test guardava un
  eventuale crash e il quadro dato alla GUI.
- **La prova**: secondo test in [ab-senza-giri.test.mjs](test/ab-senza-giri.test.mjs),
  sandbox a server vivo con 4 sessioni TUTTE morte (2 senza .ldx,
  2 .ldx cieco) e abBanco che punta un file morto: 200, ok true,
  `sessions` VUOTA, `senzaGiri` eredita TUTTE le 4 voci con la forma
  completa (car/track/when, per il gruppo muto della GUI), `prefer` null
  (niente autopuntamento: niente A, niente B) e `last` null (né il save
  può risuscitare la coppia).
- **Verifica**: node --test ↦ 2/2 verdi (i test girano in sequenza sulla
  stessa porta 8746: il child del primo è killato nel finally).

### 3/11 — la guardia delle voci senza giri, lato GUI (richiesta Mauro: «la stessa guardia del banco, ma per senzaGiri»)
- **Il buco**: la legge del banco 2/11 ha due metà — il SERVER esclude le
  sessioni 0 beacon in `senzaGiri` (coperta da [ab-senza-giri.test.mjs](test/ab-senza-giri.test.mjs)
  a server vivo) e la GUI le rimette in menu SOLO DISABILITATE sotto
  l'optgroup muto. La seconda metà non aveva NESSUNA guardia: se
  qualcuno smonta il `disabled`, le voci morte (out-lap, fermo in griglia,
  sessione abbandonata) tornano cliccabili e il banco si costruisce un
  confronto al buio — un difetto che Biome non vede (compila ogni file
  isolato, senza il contratto con il server).
- **La guardia**: [ab-senza-giri-gui.test.mjs](test/ab-senza-giri-gui.test.mjs),
  a SORGENTE VIVO come [viste-guard.test.mjs](test/viste-guard.test.mjs)
  (le viste non girano in node), quattro legami col nome riga per riga:
  1. la porta — `senza` nasce SOLO da `d.senzaGiri ?? []` del server
     (mai da `sessions`, mai da una variabile di commiato);
  2. la legatura — `opt(s, dis)` lega `disabled` al SECONDO ARGOMENTO,
     non a un valore fisso (`dis ? ' disabled' : ''`);
  3. il gruppo muto — nella finestra di ±400 caratteri attorno al
     letterale `'senza giri cronometrati'` stanno ENTRAMBE la mappa
     `escluse.length` e `opt(s, true)`: gruppo e disabled si muovono assieme;
  4. una sola corsia — le voci di banco chiamano `opt` nudo
     (`gr.ses.map(opt)`) e `opt(…, true)` esiste UNA volta sola in tutto
     il file: nessun'altra corsia eredita il disabled per errore.
- **Prova del morso**: `opt(s, true)` → `opt(s)` a sorgente = la guardia
  cade su 3 e 4 (come deve); ripristino byte-esatto (cmp) e torna 4/4.
- **Verifica**: node --test ↦ 4/4 verdi; biome senza warning (dopo la
  riformulazione del messaggio col `${…}` letterale, che il linter
  segnala come placeholder).

### 3/11 — le date di sessione nei tab del giro: voci A/B col giorno, data nel riquadro e nel modale, e il «picco» guarito (richieste Mauro)
- **Le cure** (a cavallo 2–3/11, chiuse e verificate a schermo):
  1. **GIORNO NELLE VOCI A/B** («mostra il giorno completo anche dentro le voci
     dei menu A/B, non solo nel titolo del gruppo»): ogni option del banco
     porta AUTO · PISTA · GIORNO ORA — con il menu chiuso la voce parla da
     sola, l'optgroup secondo giorno resta solo cornice
     ([viste-analisi.js:238](gui/js/viste-analisi.js#L238)). Le sessioni
     senza giri cronometrati restano in coda sotto il gruppo muto,
     disabilitate e con la STESSA scritta data.
  2. **DATA SESSIONE NEL RIQUADRO DEL CONFRONTO GIRI** («porta la data di
     sessione anche nel riquadro», come nel banco A/B): le option del menu
     Sessione del grafico portano `data-when` (token dal nome file, non il
     mtime — la lezione del datario 2/11 vale anche qua) e la dicitura sotto
     al grafico la ripete in grassetto («02/11/2026, 00:53:50 · Differenza
     media col giro…») ([viste-c.js:984](gui/js/viste-c.js#L984)) — STESSA
     fonte dei cartoncini del modale A/B (data di sessione, non mtime).
  3. **DATA NEL MODALE DEL BANCO A/B** («mostra anche la data di ogni
     sessione accanto al nome file»): helper dataDi sui due cartoncini A e
     B — sessione sparita dalla lista = niente data, il cartoncino resta
     leggibile col solo nome file ([viste-analisi.js:259](gui/js/viste-analisi.js#L259)).
- **L'etichetta «picco» del confronto, riparata** (colmata a striscio durante
  la verifica a schermo): nel ternario del `{MX}` della dicitura del grafico
  la precedenza mangiava il NUMERO quando il picco era positivo — usciva
  «picco +» senza valori. Ora `(d.dvMax >= 0 ? '+' : '') + d.dvMax.toFixed(1)`,
  stesso schema del `{D}` della differenza media accanto; il caso negativo
  (-15.0 km/h) non cambia ([viste-c.js:1009](gui/js/viste-c.js#L1009)).
- **Verifiche**: pagina viva sul server 8642, scheda Setup: dicitura letta
  dal grafico del giro «02/11/2026, 00:53:50 · … · picco +20.1 / minimo
  -15.0 km/h» e menu Sessione datato; console della pagina pulita. Zero
  unit test in più: le voci e la dicitura sono markup dell'interfaccia, la
  prova del vivo è la verifica — la legge del layout resta a controllo
  COMANDI-BUFFY.md.

### 3/11 — la sera dell'Endurance GT4: griglia giusta, auto ferma; dizionario auto-corretto
- **Il fatto**: Mauro cambia campionato (Endurance GT4) e preme «Prepa tutto»:
  la griglia si scrive dal template GT4 giusto, ma l'auto in garage resta la MX-5.
- **La diagnosi** (tutta a lettura, senza toccare il gioco): la scheda passava
  il nome GIUSTO («Porsche 718 Cayman GT4 RS», primo del parco della serie),
  ma il dizionario auto non ha NESSUNA GT4 — `findCar` torna null e il Prepa
  resta zitto (nota neutra al toast, la 25/10). La scritta MX-5 sul garage
  (00:54) è del tap precedente (iscrizione Coppa MX-5 R4, 23:30), che ha
  scritto la sua serie come doveva. La tabella ufficiale guid_map.carhashguid
  (data/car-guids.json) non ha i nomi: la Porsche non è assegnabile in blocco.
- **Il fallback scoperto**: la coppia dell'Audi R8 LMS GT4 Evo era GIÀ nel
  dizionario ma etichettata male («Kunos Abarth 695 Biposto», firma di
  campionatura a mano sbagliata): learnCarFromLogs scartava la contraddizione
  («già mappata») e la voce sbagliata non moriva mai; e un secondo difetto
  mostrava la correzione in console ma non la scriveva a disco (salvataggio
  solo a `added > 0`).
- **La correzione**: auto-correzione dai log (rientra solo a token-zero,
  i sinonimi legittimi restano) + salvataggio anche a sole correzioni
  ([tools/set-car-sample.mjs](tools/set-car-sample.mjs)); l'Audi ora esce da
  findCar. La Porsche 718 GT4 RS si auto-imparerà alla PRIMA sessione GT4
  («Loaded car» appare solo quando il gioco la carica): entra una volta nel
  weekend, poi il Prepa la seleziona da solo, come per le altre.<br>
  *Verifiche*: node --test test/learn-car.test.mjs → 6/6 (test nuovo: correzione sì,
  sinonimo no); `--from-logs` reale → corrette 1; backup map.json
  bak-1103-pre-correzione.

### 3/11 — pomeriggio: il tagliando delle etichette + il dizionario respira nel watch
- **Il fatto**: il dizionario reale di Mauro aveva la MX-5 come «Mazda Mazda
  MX-5 ND Cup»: nome ufficiale scritto DUE volte, firma dei provini passati
  per più fonti. Non è contraddizione (token tutti in comune col
  display_name del gioco), quindi l'apprendimento la lasciava stare per
  sempre e la scheda garage mostrava il nome raddoppiato.
- **La correzione**: learnCarFromStorage aggiorna il sinonimo quando
  l'eccedenza dei token è SOLO raddoppio del nome ufficiale (multiset:
  ogni token in più del dizionario è un token che il gioco ha già):
  «Mazda Mazda» → «Mazda». I sinonimi con RUMORE in più non si toccano
  («Kunos», «MXM», «992» sono token che il gioco NON ha: restano
  COM'ERANO).
- **Il secondo passo**: la ronda della guardia nel watch ri-aggiorna il
  dizionario a ogni tick: un'auto toccata nel MENU mentre il watch gira
  entra nel dizionario senza riavviare nulla, come le letture aggiornate
  del calendario e del garage.
- **Prova reale**: --from-storage sul ui_storage di Mauro col raddoppio
  rimesso a mano → «e ripulite 1 etichette col nome ufficiale», la mappa
  torna «Mazda MX-5 ND Cup»; e col rumore non duplicato aggiunto a mano
  il run non tocca niente (comportamento atteso).<br>
  *Verifiche*: node --test test/learn-car.test.mjs → 11/11 (raddoppio
  ripulito, rumore non duplicato resta, no-op se già pulita); le suite
  ronda/watch/world ripassano verdi.

### 3/11 — secondo pomeriggio: il paddock entra nel battito della guardia
- **Il fatto**: il rinfresco del dizionario nel watch copriva solo le auto
  toccate NEL MENU (ui_storage): una serie ISCRITTA a paddock mentre la
  guardia corre aspettava il prossimo processo per entrare a dizionario.
- **La modifica**: learnCarFromPaddock entra nello stesso rinfresco a ogni
  tick ([src/watch.mjs](src/watch.mjs)): pd-calendar e garage scritti nella
  STESSA finestra di 10 minuti insegnano la coppia anche a guardia accesa.
  Il rinfresco è iniettabile nei test (refreshDizionario, parametro di
  watchOnce) e un suo errore non ruba il tick alla raccolta gare.
- **Verifiche**: node --test test/cli-watch.test.mjs test/learn-car.test.mjs
  → 18/18 (rinfresco chiamato UNA volta per tick, errore senza conseguenze
  per la raccolta, contatori visibili nel riepilogo del watcher).

### 3/11 — terzo giro (tardo pomeriggio): la guardia dice quando impara
- **Il fatto**: il rinfresco del dizionario nel watch lavorava in completo
  silenzio: se ripuliva un'etichetta o imparava una coppia nuova nessuno
  se ne accorgeva, né in console né altrove: chi guarda il terminale non
  capisce cosa la guardia stia facendo mentre corre.
- **La modifica**: nel loop del watch ([src/cli.mjs](src/cli.mjs)) una riga
  verde UNA SOLA VOLTA per tick e SOLO quando il rinfresco cambia
  qualcosa: auto nuove dal menu, etichette corrette, etichette ripulite
  col nome ufficiale, auto da iscrizione in paddock. Zero rumore a
  vuoto: il secondo tick di seguito sullo stesso stato non stampa
  niente. Singolare/plurale rifinito (1 etichetta / 2 etichette).
- **Prova dal vivo**: raddoppio della MX-5 rimesso a mano nel dizionario
  vero, guardia accesa 20 secondi → «✓ dizionario: 1 etichetta ripulita
  col nome ufficiale» e la mappa torna pulita senza toccare nulla; tick
  successivo in silenzio completo.<br>
  *Verifiche*: node --test test/cli-watch.test.mjs test/learn-car.test.mjs
  → 18/18; node --check src/cli.mjs.

### 3/11 — quarto giro (sera): il tagliando diventa regola comune
- **Il fatto**: la regola che ripulisce l'etichetta raddoppiata («Mazda
  Mazda» → «Mazda») viveva SOLO dentro il learner da ui_storage: il
  paddock doveva aspettare il prossimo passaggio dell'auto nel menu per
  profittarne.
- **La modifica**: la regola esce in un helper condiviso (soloRaddoppio,
  [tools/set-car-sample.mjs](tools/set-car-sample.mjs)) estratto dal
  codice inline di learnCarFromStorage e usato ANCHE da
  learnCarFromPaddock: un'iscrizione che conferma una voce raddoppiata
  la riporta col nome ufficiale; un sinonimo con RUMORE resta COM'ERA
  (test nuovo dedicato). La logica del tagliando vive in un solo
  posto: se domani cambia, cambia qui.
- **Banco completo di prima**: npm test intero girato PRIMA del
  rifacimento → 878/878: zero regressioni su tutto il lavoro del giorno
  (storage + paddock tick + riga della guardia).
- **Verifiche dopo**: test/learn-car.test.mjs + test/cli-watch.test.mjs
  → 21/21; test/import-save.test.mjs + test/gara-veloce.test.mjs →
  17/17; node --check su src/cli.mjs e src/watch.mjs.

### 3/11 — quinto giro (tarda sera): chiusura con il banco pieno
- **Il fatto**: dopo il rifattoring del tagliando serviva il banco PIENO:
  solo le suite vicine non bastavano a dichiarare la giornata chiusa.
- **Le verifiche**: npm test intero dopo il rifattoring → 881/881
  (878 pre-rifattoring più i test nuovi del tagliando nel
  paddock); biome lint sui cinque
  file toccati oggi → un residuo tolto (la firma `multi` avanzata dentro
  learnCarFromStorage ora che la regola vive in soloRaddoppio) e
  l'import inutile di decodeMsg nei test: lint a zero warning,
  test/learn-car.test.mjs 14/14. Giornata chiusa.

### 3/11 — nono giro (notte): la guardia anche sul muro (pitwall)
- **Il fatto**: in gara il cruscotto non si guarda — il pitwall è il SOLO
  pannello leggibile; senza la riga guardia, chi sta in pista non sa più se
  la guardia corra e cosa abbia imparato.
- **Il modo**: `miniPitwall` riceve la vetrina INTERA in ingresso: il battito
  passa INVARIATO (`dati.guardia`, niente ricalcoli, zero letture in più);
  pitwall.src.js stampa il blocco a fianco dell'orologio, la stessa riga del
  CLI e del cruscotto. Fascie senza il campo: niente blocco, come l'orologio.
- **Le verifiche**: il test delle chiavi di miniPitwall (pitwall-radio) ora
  include `guardia` e fissa il caso NO-battito (null, non undefined) + test
  dell'oggetto passato uguale: file 26/26 insieme a eredita-cruscotto e le
  attigue uiapp; biome zero; genera-uiapp BUILD_OK + installatore pitwall
  richiamato: app in Saved Games al passo.
- **PROVA DAL VIVO (in anteprima, fasce vere)**: server webui riavviato
  (girava CODICE VECCHIO: le fasce non portavano la voce), poi i due gusci
  anteprima (_preview-cruscotto/pitwall) sulle fasce di Saved Games:
  cruscotto «👁 guardia ferma — controlla 149 s fa · dizionario: 1 auto nuova
  dal menu · 1 etichetta ripulita col nome ufficiale», pitwall identico.
  Battito dimostrativo scritto a mano: 45 s dopo il semaforo è scaduto in
  «ferma» da SOLO — la vita del semaforo segue il battito senza bug.

### 3/11 — decimo giro (notte): i nomi puliti anche nel verdetto della GUI
- **Il fatto**: le fasce del pitwall portano i nomi pista puliti da
  `pistaPulita` (VERDETTOWARE 261102), ma le righe del verdetto di
  giornata della GUI del browser uscivano COME LE SCRIVE il file Results —
  il token grezzo, senza il passaggio dal nome bello del ladder.
- **Il modo**: `pistaPulita` spostata in testday.mjs accanto a
  `prettyTrackLabeled` (UNA implementazione, come voleva il commento);
  `verdettoGiornata` ora riceve `ladder` e pulisce ALLA FONTE (righe,
  note quali/practice, aggregato e dossier md in un colpo); l'endpoint
  `/api/verdetto` del webui passa il ladder del carriera. Senza ladder
  (CLI, dossier in cartella): la voce grezza passa com'era — niente
  cambiamenti per chi stampa a mano.
- **Le verifiche**: test NOMI PULITI in verdetto-giornata.test.mjs (track
  «Fuji» col ladder → «Fuji Speedway (East Race)» in riga, aggregato e
  md; senza ladder resta «Fuji (East Race)») — i tre file del bancos
  61/61 (verdetto + uiapp-pub-priorita + uiapp-pub-guard). PROVA DAL VIVO:
  webui riavviato col codice nuovo, `/api/verdetto` con il prefisso di
  ieri (261102, 5 gare): «Mount Panorama (GP Race)», «Suzuka (East
  Race)», «Donington Park (National Race)»… e il giro migliore
  dell'aggregato pure «Suzuka (East Race)» — il layout resta in coda,
  mai dentro la variabile.

### 3/11 — decimo giro bis (notte): il test dei chip parla con la guardia VIVA
- **Il fatto**: nei test dei chip del pitwall (verdettoFascia) le attese
  erano STRINGHE INCOLLATE («Oulton Park (International Race)»): se un
  domani prettyTrackLabeled cambia una parola, il dato sul chip cambia
  e il test segue la formula morta — la divergenza test/dato la scopre
  Mauro a schermo, non il banco.
- **Il modo**: le attese ora escono dalle funzioni VIVE di testday.mjs
  (`prettyTrackLabeled` per il token di cartella, `pistaPulita` per la
  pista col layout) — la STESSA fonte che il server chiama sui chip, più
  il collegamento dichiarato «pistaPulita senza coda = prettyTrackLabeled»
  (una formula, due porte) e la conferma SENZA ladder (token intatto).
- **Le verifiche**: uiapp-pub-priorita 48/48, insieme a verdetto-giornata
  57/57; biome zero warning sul file del banco. Le stringhe attese restano
  COME CONTROPROVA (le due assert.equal contro la guardia viva): se la
  formula cambia, il banco lo dice PRIMA, non dopo la fascia in gioco.

### 3/11 — decimo giro ter (notte): la guardia anche sulle fascie del publisher
- **Il fatto**: le fascie `ui-<slot>.json` in gioco il publisher le scrive
  con UNA writeFileSync nuda (niente atomico) e l'app le JSON.parse a
  ogni tick: una fascia MEZZA in gioco (scrittura troncata, beffa a mano)
  è la stessa beffa del menu.html del 27/10 — l'app esce rotta a schermo.
- **Il modo**: nuova sottoprova FASCE DEL PUBLISHER IN GIOCO in
  test/uiapp-installata.test.mjs: nella STESSA stanza vera del gioco, ogni
  `ui-<slot>.json` presente nelle cartelle installate dev'essere un JSON
  intero (parsabile, un oggetto). Messaggio con la cura: col server aperto
  il publisher la riscrive intera al prossimo tick; una beffa di mano si
  cancella — LE fascie le nasce SOLO il publisher.
- **Le verifiche**: guardia verde 7/7 su stanza vera; poi la beffa sul
  vivo: `ui-999999999.json` corrotta scritta a mano in cruscotto → guardia
  rossa col percorso reale e la cura nel messaggio (1 fail) → fascia
  cancellata → di nuovo 7/7. Biome sul file del banco nel prossimo tagliando.

### 3/11 — ottavo giro (notte): la guardia esce nel cruscotto dentro il gioco
- **Il fatto**: la riga «👁 guardia attiva» dopo il settimo giro viveva SOLO nel
  `status` del CLI — chi gioca non apre un terminale: nel pannello dentro EVO
  c'era solo il pallino del SERVER (fascie fresche), che è un'altra cosa.
- **Il modo**: il publisher porta in fascia il battito della guardia
  (`watcherStatus`, un file JSON per fascia, dentro try) e il cruscotto a
  schermo la ristampa sotto l'orologio di giornata: verde «👁 guardia attiva —
  controlla Ns fa» + «dizionario: …» quando ha imparato. Fascie vecchie senza
  `guardia`: la riga non esce, nessun errore — fino al primo riavvio del server.
- **Le verifiche**: test VEDRINA (5-bis) in eredita-cruscotto.test.mjs (la voce
  `guardia` esiste sempre nella fascia, e col battito fresco arriva valorizzata
  con `alive` vero e `diz` con la lezione) — file 8/8; le attigue
  uiapp-pub-priorita/paddock 56/56;
  biome a zero warning sui tre file toccati (due import morti del file test
  portati fuori nel passaggio); genera-uiapp ha segnalato BUILD_OK e ha
  richiamato l'installatore: la app in Saved Games è aggiornata.

### 3/11 — sesto giro bis (notte): la lezione del dizionario arriva a `status`
- **Il fatto**: la riga verde «✓ dizionario: …» resta nella console della
  guardia: chi controlla solo da terminale (`status`) non sa SE e QUANDO la
  guardia ha imparato qualcosa.
- **Il modo**: il battito della guardia ([heartbeat](src/watch.mjs)) porta
  con sé l'ultima lezione (`msg` + `at`); la riga «👁 guardia attiva» di
  `status` la ristampa in dim — sempre in italiano/inglese secondo lingua.
  Niente scritture extra: il tracker della guardia è già il posticino
  giusto per questo ricordo.
- **Le prove**: nuovo test del battito (heartbeat + watcherStatus, il
  battito trasporta la lezione) in [test/cli-watch.test.mjs](test/cli-watch.test.mjs)
  (8/8); fumo status con cartella temporanea → exit 0 e riga
  «👁 guardia attiva — … · dizionario: 1 auto nuova dal menu · 1 etichetta
  ripulita col nome ufficiale» stampata come da disegno.

### 3/11 — sesto giro (notte): il dizionario si spiega nella FAQ
- **Il fatto**: il funzionamento del dizionario vivente era raccontato nel
  CHANGELOG ma non nella FAQ per i lettori: chi legge il README non
  sapeva che il dizionario si riempie da solo.
- **La modifica**: nel README italiano e in quello inglese, subito dopo
  la domanda «Prepara tutto / auto non nel dizionario», la nuova voce:
  le tre fonti (log, ui_storage, iscrizioni), la guardia che
  rinfresca a ogni giro e parla solo quando impara, il tagliando delle
  etichette raddoppiate e la regola del rumore estraneo.
- **Verifiche**: nessun codice toccato, solo documentazione; le due
  voci controllate a lettura nei rispettivi file.

### 3/11 — notte: la FATTORIA del dizionario (ui_storage.uistorage)
- **Il fatto**: i log del gioco (02:41) mostrano che la catena comandi nostra
  va («✓ SetCurrentCar ok: Audi R8 LMS GT4 Evo») e nello stesso log il gioco
  scrive da solo `paddock.skins` dentro **ui_storage.uistorage** (Saved Games\ACE).
  Abbiamo aperto il file a nudo: è protobuf **SENZA cifratura** — la sorgente
  di coppie guida↔nome che cercavamo nella kspkg (che invece è cifrata al
  100%) era qui accanto, scritta DAL GIOCO STESSO ad ogni auto toccata dal
  menu (vista, scelta, iscrizione).
- **Il contegno**: per ogni skin, `car_guid` è la GUID stabile dell'auto già
  SDOPPIATA (= carHash|guid2 del garage: il test «Audi R8 LMS GT4 Evo"
  0x47E9D2CE3DC1C366|0x432F24BD6F41ED82 batte IDENTICO) e `display_name` è
  il nome ufficiale del gioco ("Mini John Cooper S", "Audi R8 LMS GT4 Evo",
  "Mazda MX-5 ND Cup", "Abarth 695 Biposto").
- **La muratura**: nuova sorgente `learnCarFromStorage` in
  [tools/set-car-sample.mjs](tools/set-car-sample.mjs) (lettore `readUiStorage` +
  `pairDaGuid`), agganciata al boot dizionario nel [tools/set-driver-car.mjs](tools/set-driver-car.mjs)
  e in CLI con `--from-storage`. Regole consuete: coppie nuove entrandono,
  le CONTRADDETTE si correggono, i sinonimi legittimi restano.
  *Verifiche*: node --test test/learn-car.test.mjs → 9/9 (3 nuovi: aggiunta,
  correzione sinonimo/nota, file assente/brutto); `--from-storage` reale →
  0 aggiunte: le 4 voci della fattoria sono già sinonimi del dizionario
  (nessuna scritta superflua), e il garage attuale (Audi R8 GT4 Evo) è coerente.

### 3/11 — notte, dopo la fattoria: le catene di lettura, una volta per tutte
- **La paura di Mauro** (a parole sue): «così torniamo al magazzino e fattoria
  che ci hanno creato tanti problemi; ora abbiamo il mirror journal, dovremmo
  leggere tutto come paddock ed escluderli una volta per tutte». Verifica fatta
  con la grep su TUTTO il flusso di lettura:
  · «MAGAZZINO» su L:\CarrieraEVO è SOLO backup zip (completo + portabile,
    impronte SHA-256): non entra in NESSUNA catena di lettura; l'unico punto
    collegato    era l'avviso di stantio in avvia.cmd (solo messaggio, zero letture
    dati): RIMOSSO dal boot (3/11 notte) — il backup e il controllo si fanno
    a mano con controlla-magazzino.cmd, fuori da qualunque flusso.
  · Il «magazzino griglie» in [src/grid-apply.mjs](src/grid-apply.mjs) è un
    ALTRO magazzino: lo store interno dei template per serie. Niente a che
    vedere con il disco L:.
  · La «fattoria» VECCHIA (il dizionario di campioni a mano, set-car-sample --map
    con il sampler a battito) è FUORI dalla routine: nessun processo la chiama.
    Boot dizionario = letture SOLO da file del gioco (ui_storage + log), già
    dal commit di stanotte. Il sampler a mano resta come UTENSILE di EMERGENZA
    (auto che il menu non tocca mai), il messaggio d'errore di findCar ora lo
    dice: prima riprova del menu, il campione a mano come ultimo passo.
- **La catena di lettura che resta** (una sola, tutta read-only dai file del
  gioco): calendario = journal pd-calendar dell'app (fonte primaria, quando
  c'è) → mirror NOSTRO (stessa forma, scritto da [src/journal.mjs](src/journal.mjs),
  per chi NON ha l'app); garage = garage.drivergarage del profilo; dizionario
  auto = ui_storage + log di gioco al boot. NESSUN magazzino, NESSUN sampler
  in mezzo: le sorgenti sono dello STESSO tipo dell'app.

## Le regole del diario

1. **Una riga per gesto**: niente romanzi — data, cosa fatto, come lo sappiamo (test/prova).
2. **Gli ID della lista NON si riciclano**: una voce chiusa resta nella storia
   con la data di chiusura, e le nuove prendono l'ID successivo.
3. **Nessuna voce fantasma**: se un'idea che volevamo si è già realizzata, la lista
   è là per dirlo, non per illudere. Una voce di lista che non trova lavoro esce con la data.

---

## Cose da fare o da rivedere

### DA-13 — Ponte fra piste per i setup · richiesta Mauro 31/10 («i setup per macchina come sono organizzati? ogni pista ha la sua auto con dentro i setup? o condivisi per tutte le piste e auto») · STATO: fatto (31/10 tarda sera)
Prima l'audit (36 setup su 10 auto in Car Setups, copertura inegiale: Ferrari 296 su 4 piste, Hyundai su 1), poi la risposta: in EVO i .carsetup vivono SOLO per auto+pista — niente condivisione globale, è il formato del gioco. Il limite pratico: su una pista NUOVA l'app chiedeva finora di aprire EVO e salvare «una volta, anche a vuoto» prima che il meccanico potesse applicare consigli — ora lo fa lei. Toccato:
- [src/carsetup.mjs](src/carsetup.mjs): `bridgeSetup(savedDir, destCar, destTrack, srcFile)` — il setup base dell'auto (esclusi i «— EVO-consigliato») viene copiato BYTE PER BYTE nella cartella Car Setups/<auto>/<pista di arrivo>/; mai sovrascritture: se il nome esiste, il nuovo prende « (2)»; nessun parse/patch (round-trip identico per costruzione).
- [src/webui.mjs](src/webui.mjs): rotta POST `setup-bridge` (nel registro SOLO_POST) con la STESSA guardia «pista viva» dell'setup-apply — se EVO è in sessione, il ponte scrive solo SU QUELLA pista; e il vecchio rifiuto «nessun setup su questa pista» di setup-apply ora allega `bridgeAvailable` + `bridgeSrcFile`.
- [gui/js/viste-c.js](gui/js/viste-c.js): il rifiuto diventa bottone «🌉 PONTALO QUI» (funzione `bridgeOut`, usata sia dalla preview sia dalla conferma); dopo il ponte l'app ripropone ⚡ APPLICA e il consiglio parte dalla pista nuova.
Verifica: [test/ponte-setup.test.mjs](test/ponte-setup.test.mjs) 3/3 (copia identica, « (2)» senza overwrite, rifiuti); suite intera 691/691 verdi (22 s); biome pulito sui 4 file toccati.

Scelta del sorgente (subito dopo: il ponte partiva solo dal setup PIÙ RECENTE — se su un'altra pista ne hai tre con nomi diversi, non c'era modo di puntare quello giusto): setup-apply a rifiuto ora allega `bridgeOptions` (TUTTI i base setup dell'auto, esclusi i «— EVO-consigliato», dal più recente) e in [gui/js/viste-c.js](gui/js/viste-c.js) il bottone del ponte è preceduto da un menù quando le piste pontabili sono più di una; l'handler manda `#bridge-src`.value. Suite 691/691 ancora verdi.

Quadro di copertura [31/10 tarda notte, chiusura del giro]: rotta POST `setup-cover` in [webui.mjs](src/webui.mjs) (lettura pura, non aggiunta a SOLO_POST) — per l'auto chiesta ritorna `covered` (piste con .carsetup: file, data ultimo, file pontabile), `missing` (piste GIRATE di recente MoTeC/Results senza setup, max 8, con il sorgente consigliato = base più recente dell'auto) e `pistaViva` (solo informazione; la guardia della scrittura resta in setup-bridge). In [gui/js/viste-c.js](gui/js/viste-c.js) il pannello «🗺 Copertura dei setup» si innesta sotto la storia del meccanico (`__drawSetupCover`, ridisegno senza re-render come la storia) — chip ✔ verdi per coperte, chip ✖ rossi con bottone 🌉 per mancate; il click chiama setup-bridge e rinfresca quadro+storia da solo. PROVA SUL VIVO (riavvia-webui, guanta 0.1.45 + nuovo codice): Ferrari 296 GT3 → coperte Brands Hatch / Imola / Monza / Oulton Park, missing «Red Bull RingGP» con sorgente «Rerrari bagnato default» (Oulton Park) — il nome del file è quello vero dell'hard disk. Nessun unit test dedicato: la rotta mangia sessioni MoTeC vere; la prova live è la verifica.

Tutto il garage (31/10 notte, chiusura del giro): `setup-cover` con `all: true` rifà la STESSA computazione per ogni auto di [state.garage.cars](src/state.mjs) (helper `carCover` unico, limit MoTeC ridotto a 12/80 per non recalcolare a ogni apertura) — ritorna `cars: [{ car, covered, missing }]` SENZA sorgenti per pista: le piste pontabili restano solo nel pannello dell'auto corrente (i bottoni lì). In [gui/js/viste-c.js](gui/js/viste-c.js) il quadro ora ha il ripieghévole «🏢 Tutto il garage»: riga per auto con chips ✔/✖; auto del garage senza copertura né sessioni recenti si dicono a voce esplicita. PROVA SUL VIVO (riavvia-webui, seconda ripartenza): 2 auto — Peugeot 205 T16 e Lamborghini Countach LP5000 QV — entrambe `covered: []`, missing Brands HatchGP / COTA GP / Suzuka GP e MonzaGP rispettivamente: il quadro dice la verità dei file. Suite 691/691 verdi (16 s) dopo il passo, invariata a prima.

### DA-1 — Prova in pista del copilota: bandiere + tagli · STATO: APPUNTAMENTO 1/11 (richiesta Mauro: «ricordamelo domani»)
La rossa/nera e i tagli veri ≤ ~2 s sono verificati SOLO in sandbox (`copilota-narratori.test.mjs`).
Il protocollo è scritto in [PROVA-COPILOTA.md §5](PROVA-COPILOTA.md): tre sequenze in
pista (restart con rossa a schermo, tagli veri a caccia del penalità del gioco, marcia
indietro per la nera) + il grep che smaschera i GREZZI del `flagCode` nel registro MMF.
**Criterio di chiusura**: se il sensore NON scrive la rossa nella MMF mentre a schermo
c'è, è un limite del sensore (uscirà dal grep) — la voce non può dire ciò che il gioco
non scrive, e in diario lo si annota come limite, non come bug.

Prova sul vivo 30/10 sera (gara di test, registro voce): il TAGLIO ha superato la
prima attraversata in pista — «Penalità tagli: 2.5 secondi» annunciata, e ~9 s dopo
il gioco ha RIPORTATO l'auto in baia (boxopen che la radio ha raccontato a inPit vero,
non un'azione del mod: le ricette gara non scrivono regole di tagli/penalità). La
ROSSA a schermo in quella finestra NON è mai uscita nel payload — davanti il verde
(code 2) era visto e annunciato — terzo dato della rossa-invisibilità: il criterio
di chiusura si è già auto-dechiarato, limite del sensore da annotare. Nota del
gioco: penalità tagli cumulata che oltre soglia = stop-and-go da servire in baia,
con comandi bloccati (la seconda volta la sessione è andata live=false).

### DA-2 — Commetti il lavoro delle bandiere · STATO: CHIUSA 31/10 (committ 41e6633) · ✅
7 file modificati e non committati: [src/voce-copilota.mjs](src/voce-copilota.mjs),
[src/uiapp-pub.mjs](src/uiapp-pub.mjs), [src/webui.mjs](src/webui.mjs),
[tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs),
[test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs),
[test/uiapp-pub-priorita.test.mjs](test/uiapp-pub-priorita.test.mjs),
[PROVA-COPILOTA.md](PROVA-COPILOTA.md).
Committare SOLO i file di questa lista, mai `git add -A`: il resto del progetto è già pulito.

### DA-3 — Semaforo «prepara» del cruscotto visto dentro il gioco vero · STATO: DA FARE
Il semaforo (ronda armata / gara al volo con finestre e scadenze) gira in sandbox ma
non è MAI stato visto caldo nel cruscotto in gioco: lanciare «prepara» e guardare le
card accendersi con i countdown, tutto in una sessione, senza ritocchi mancati.

### DA-4 — Banner di riavvio del server su un guasto REALE · STATO: DA FARE
Il filbar di servizio (due fallimenti di rete di fila → banner con bottone «Riavvia il
server») è testato in asciutto 4/4 ma mai cliccato su un guasto vero: con una gara in
corso, fermare a mano il webui e vedere il banner arrivare e il bottone riportare il
server a casa senza perdere l'istanza.

### DA-5 — Sessioni non-gara (practice/testday) davanti ai conteggi vivi · STATO: metà sandbox chiusa 31/10 · prova live «una sola verità» CHIUSA 30/10 serale, RADIO RESTANTE
Practice e testday entrano nelle NOTE del verdetto (regola «una sola verità» con
archivio), ma i conteggi vivi in gioco (posizione, gap) non hanno mai visto un testday
reale: prima di un testday lungo, guardare se la radio e le card restano honesti
(niente annunci di posizione sparati fuori da una gara).
La metà in asciutto è CHIUSA 31/10: [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs)
ora guida la radio anche fuori gara — gap morto zitto, cambio sedile legittimo senza
verde, pitlane del testday zittito fino a 12 s dall'uscita.
PROVA LIVE «una sola verità» (30/10 serale): il verdetto di giornata sul prefisso
261030 con i file Practice reali di oggi (Donington 00:41/00:43, Monza 17:12/17:14
[report/gare/verdetto-261030.md](report/gare/verdetto-261030.md)) li tiene in NOTE
e non paga né posti né giri: solo le 3 gare entrano nell'aggregato. Resta la metà
RADIO: gli annunci in gioco sul testday lungo vero.

### DA-6 — Audit periodico dei dati di carriera · STATO: ronda 3 chiusa (1/11, senza interventi) — prossimo giro a ~2 settimane di gara viva
Ultimo audit: [report/audit-dati-2026-11-01.md](report/audit-dati-2026-11-01.md) —
ripetuto 1/11 a fine stagione 12 e apertura della 14, **sola lettura**
(sonda in tmp, zero scritture, lezione DA-16 del «fai quello che vuoi» del
1/11 precedente): save coerente (86 cursori tutti sani, posta al cap 60,
2 auto in garage senza doppioni), il disco di data/ precipitato da ~774 MB
a ~11 MB (la voce A1 del 28/10 chiusa di fatto), classi dentro cap del
restrictor, nessuna fuga Git. Due anomalie minori censite senza leva:
la chiave bestLaps morta «imola» (doppia grafia, lettori non la toccano mai)
e i due zip FULL d'epoca usciti per rotazione MAX_ZIP=4 (scelta fatta
in partenza). Precedente: [report/audit-dati-2026-10-28.md](report/audit-dati-2026-10-28.md).
Da ripetere ogni ~2 settimane di gara viva e a ogni update del gioco
(nuovo DLC o reset del save).

### DA-7 — Release di pacchetto (aggiorna-zip + bump versione) · STATO: AL MOMENTO GIUSTO
Versione attuale 0.1.42 in `package.json`. Da chiamare SOLO dopo che DA-1, DA-3 e DA-4
sono verdi: il pacchetto è il pezzo che va agli amici
(pacchetto-amico + GUIDA-AMICO + FRIEND-GUIDE-EN).

### DA-8 — Rilegge IDEA-POST-PRESENTAZIONE e raccoglie le idee vive · STATO: CHIUSA 1/11 · verdetto firmato nel file · ✅
Rilettura fatta 1/11 col permesso di Mauro (tipo «fai quello che vuoi»):
**11 su 12 claim vivi**, tutti con la via nel codice — tabella verdetto
claim per claim in [IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md)
(§VERDETTO DA-8). Claim MORTO uno: «in gioco c'è solo Cruscotto» — il
Pitwall in gioco (radio, verdetto, finestra, sincro) dal 31/10 l'ha sepolto;
la voce d'onestà nel file riformulata. Il POST vero (da scrivere quando si
crea la release pubblica) apre **DA-19**.

### DA-9 — Stint-plan endurance: finestre di sosta e stint calcolate prima della gara · STATO: CHIUSA (31/10 tarda sera) — see the diary entry «La finestra stint entra nella radio e nella vista»
Oggi benzina e gomme le dice l'ingegnere DAL VIVO durante la sessione
(`engineer.mjs` + `usura-gomme.mjs`), ma la stint-plan di endurance NON ESISTE.

Dalle SERIE A TEMPO (durationMin 30–60, ronde a tempo in race.mjs) servono le
FINESTRE DI SOSTA calcolate prima del via. Ingredienti:

1. consumo stimato del sedile (dall'analisi delle gare passate del sedile);
2. capacità benzina dell'auto;
3. numero di stint e litri per sosta.

Deliverable:

- la raceCard di gara porta la riga «Sostituzioni: stint da ~X min (litri Y)»;
- il copilota annuncia l'ingresso in finestra («Finestra box entro 2 giri»);
- nel webui un pannello mostra il piano prima della gara, aggiornato con i
  dati veri di usura.

Creato il 31/10 su proposta Buffy, accettato da Mauro.
**Prima fetta 31/10 sera**: [src/stint-plan.mjs](src/stint-plan.mjs) puro —
`seatStintInputs` estrae consumo, ritmo e serbatoio OSSERVATO dalle uscite
MoTeC del sedile; `stintPlanOf` stima giri, stint, litri per sosta e le
FINESTRE di sosta (per ciascuna: da a fino a). Poi la riga «Piano stint»
nella raceCard delle ronde a tempo: il webui la calcola dal sedile con memo
120 s (chiave auto|durata: cambiare la durata ricalcola subito). Prova a vista
su un nodo a tempo vero del ladder (`node endurance_gt4`, sonda in tmp FUORI
dal pacchetto): riga leggibile, finestra di sosta centrata al giro giusto.
Test 6/6 in [test/stint-plan.test.mjs](test/stint-plan.test.mjs). Suite 562/562.
Restano: l'annuncio «Finestra box entro 2 giri» del copilota e il pannello
webui col piano aggiornato coi dati veri di usura.

### DA-11 — Anti-cheat esteso: le guardie valgono anche per orario e distanza · STATO: fatto (31/10 sera) · richieste Mauro 31/10 («quando lancio la gara dal preparatutto, poi posso cambiare es il tempo, dobbiamo evitarlo», «estendi l'anti-cheat», «spente le guardie, prova»)
Il cancello del meteo (guardedMeteo) presidia SOLO il meteo: le altre
scritte del weekend restavano libere, e la baratteria che Mauro teme trova
lì il via: cambiare l'ORARIO delle sessioni (ore/scala) o la DISTANZA
(giri, o minuti sulle serie a tempo) DOPO che il preparatutto ha messo in
piedi la gara. Modello identico al meteo: `dry` e `previsto: true` (le
scritture del CALENDARIO dal «Prepara tutto») passano; fuori test-mode ogni
via manuale — CLI e bridge GUI — va in RIFIUTO esplicito. Toccato:
- [src/test-mode.mjs](src/test-mode.mjs): `cancelloOrario` / `cancelloDistanza`
  (era un booleano). Entrambi passano quando `meteoLibero()` è vero,
  cioè in modalità TEST — «guardie spente», come le vuole Mauro.
- [tools/set-racetime.mjs](tools/set-racetime.mjs): setRaceSessions e
  setRaceTime presidiate, con `previsto` nelle firme.
- [tools/weekend-laps.mjs](tools/weekend-laps.mjs): setWeekendLaps e
  setWeekendTimed presidiate; la chiamata interna (da gara a tempo torna
  a giri) PROPAGA `previsto`, così non si buca a valle.
- [src/webui.mjs](src/webui.mjs): event-prep dichiara `previsto: true` per
  ore/durata/giri (già scalati al % del pannello regole); il BOTTONCINO
  manuale giri/tempo del bridge resta senza previsto → 409 con il messaggio
  del cancello.
Limiti noti (li citiamo anche a Mauro): l'INSTANT RACE resta libera
(non è una gara di carriera, è banco di prova); le ORE sovrascrivibili a
mano nella card race-settings prendono lo STESSO trattamento del meteo —
il «Prepara tutto» accetta quel valore dal preparatutto col previsto (la
scrittura immediata della card fuori test va nel rifiuto mutato dal catch
del save). Verifica:
[test/cancelli-anticheat.test.mjs](test/cancelli-anticheat.test.mjs) 5/5,
weekend-laps-lib gira nel registro ISOLATO a attivo (test vecchi al passo,
28/28 con i test vicini). Prova DAL VIVO (tmp/probe-cancelli.mjs, COPIA del
RACE_WEEKEND reale in tmp — il file di gioco SOLO LETTO): con test-mode
ATTIVA sul PC (dal 27/10) distanza e orario PASSANO; col registro isolato a
spento — le guardie ACCESSE — distanza e orologio in RIFIUTO col messaggio
del cancello, e `previsto:true` passa al no-op. Il momento giusto: quando
si spegne test-mode (test-mode --off) le guardie si ACCENDONO da sole e le
gare si corrono COME dice il calendario, bagnate pure.

Chiusura GUI (31/10 più tardi): anche il rifiuto del cancello che arriva
al «Prepara tutto» del webui ora SI VEDE — `prep.gridError` (la vigia
bilancio/AI dopo il rebuild) finiva in un catch muta e il messaggio del
builder (SERIE NUOVA…) restava nel registro; in
[gui/js/viste-a.js](gui/js/viste-a.js) ora sale al toast come le altre righe ⚠.

### DA-12 — Priorità ronda vs vetrina custom: il «Prepara nuovissimo» riprende la mano · STATO: fatto (30/10 tarda notte)
La sera del 30/10 il cambio auto «in tempo reale» non attecchiva: nel menu di
EVO la FERRARI 296 GT3 tornava sempre, anche dopo «Prepara tutto». Le prove
in fascia + storica comando hanno mostrato il colpevole: la VETRINA CUSTOM
(demo 296 GT3 armata via [tools/vetrina-custom.mjs](tools/vetrina-custom.mjs))
nata PRIMA del pending della ronda comanda comunque per la SUA finestra (24 h),
e dopo il suo ack il ramo demo faceva `return null` lasciando la ronda MUTA
fino a scadenza (il setcar i30 N usciva solo dopo `--off`).

Cura in [src/uiapp-pub.mjs](src/uiapp-pub.mjs) (`comandoAuto`): la regola del
28/10 («al Prepara nuovissimo torna la priorità della ronda») vale anche per la
vetrina custom — conta l'ORDINE DI NASCITA: ronda nata dopo (o in pari con)
l'armatura → il ramo demo tace e il setcar della ronda esce, anche con l'ack
della demo nello store. Demo armata DOPO la ronda → priorità alla demo, com'era
(il gesto a mano vince). Nessun cambio al tool, nessun ping-pong in più.

Verificato: `node tools/vetrina-custom.mjs --off` → setcar i30 N in fascia a
23:33 e ACK dal gioco a 23:33:13; test nuovo nella famiglia priorità
([test/uiapp-pub-priorita.test.mjs](test/uiapp-pub-priorita.test.mjs), 3 casi:
ronda nata dopo senza ack · ronda nata dopo CON ack demo · demo armata dopo la
ronda resta il padrone) — 38/38 verdi.

### DA-13 — Titoli aggressive, bilancio della prima Epoca e il capitolo della ripresa · STATO: fatto (31/10 sera) · richieste Mauro 31/10 dopo la gara con l'Hyundai («rendi i titoli delle gare di campionato piu agressive, tipo Moderne VS Epoca!!!», «controlla bilanciamenti e zavorre per vedere che se ha fatto un buon lavoro il sistema», «Racconta la ripresa della ronda nella storia»)
La prima gara del Campionato Epoca (Brands Hatch, Round 1, vinta con la
i30 N) apriva tre fronti, tutti chiusi la stessa sera:

- **Titoli aggressive**: le ronde dei due campionati nel
  [config/career.evo.ladder.json](config/career.evo.ladder.json) prendono nomi
  a coltello (Brands Hatch «MODERNE VS EPOCA!!!», Donington «IL RETTILINEO NON
  PERDONA!!!», Oulton «CHI ESITA È PERDUTO!!!», Imola «FINALE A COLTELLO!!!»)
  e la gazzetta in [src/gazzetta.mjs](src/gazzetta.mjs) mette il malloppo di
  esclamazioni con il verdetto col rivale. Test: [test/stampa.test.mjs](test/stampa.test.mjs)
  12/12 con i titoli nuovi fissati.
- **Bilanciamento verificato**: zavorre scritte DAL SISTEMA rispettate alla
  lettera nel risultato di gioco (i30 N/Countach/MX-5 100 kg + 20%, GR86 100 kg
  + 9%, R5 GT Turbo 0/0). Ma il campo si spezza in due (01:47–01:57 sopra,
  02:06–02:12 sotto): il cap del restrittore a 20% non schiaccia il misto —
  primo dado per il ramo C di griglia-calib alla gara 2. Anomalia nota: due
  righe duplicate di gioco (Adrian Palmer, Ryan Coleman), manina del gioco,
  non nostra.
- **Capitolo della ripresa**: [data/journal/stagione-12.md](data/journal/stagione-12.md)
  — P1, giro veloce 01:47.934, traguardo 05:39.840, +17.9 s su Palmer, la
  i30 N arrivata nel garage sul vivo. La rassegna ufficiale riscriverà la
  pagina a stagione chiusa.

Integrità verdi dopo: [test/integrity.test.mjs](test/integrity.test.mjs) 14/14,
ladder riserializzato intatto (86 nodi), `node --check` su gazzetta.mjs.

Stessa sera, addendum «fabbrica automatica» (richiesta: «Automatizza la
fabbrica del template»): il guardiano
[tools/raccogli-griglie.mjs](tools/raccogli-griglie.mjs) non lascia più la
foto sola — su OGNI foto attecchita rilancia da solo
[tools/_genera-multi.mjs](tools/_genera-multi.mjs), così il materiale fresco
(donor magazzino/fabbrica/grezze) allatta subito le multiclasse ancora ⬜
senza il passaggio manuale «poi gira _genera-multi». Solo le foto davvero
salvate (o con griglia fissata nel ladder) fanno uscire il generatore:
rifiuti e griglie non riconosciute non vargono le coperture, e forzarlo a
vuoto dormirebbe per un «nessun bersaglio». `--no-multi` torna al guardiano
puro fotografo. Verifica: `node --check` su entrambi i tool il quadro
(`--stampa`), la fabbrica resta in attesa del prossimo scatto in EVO.

### DA-14 — Ore spostabili, poste operative, Campionati ricchi, Banco A/B nel Garage · STATO: fatto (1/11 notte) · richieste Mauro 1/11
Cinque fronti in una notte, tutti verificati con test a casa:

- **Ore spostabili per campionato** («se due gare si corrono lo stesso giorno,
  si potrebbe fare un weekend la mattina e poi verso sera un'altra corsa, che
  ne pensi?»): confermato l'idea e realizzata la leva — override di ORA per
  RONDA ([src/agenda.mjs](src/agenda.mjs): `oraRonda`/`impostaOraRonda`, vive in
  `state.agenda.ore` e muore da solo al cambio ronda), tema nel pannello dei
  conflitti del Centro gare (selettore 06–23 + «come calendario» + «sposta ⯈»)
  via endpoint `agenda-hour`. L'ora spostata scende fino alla CARD e al
  gamemodesave: [src/race.mjs](src/race.mjs) `nextRound` la preleva e la
  `raceCard` la usa al posto dell'ora di serie (priorità: ronda > serie >
  calendario). La serie resta a cadenza fissa: SI SPOSTA L'ORA, NON LA RONDA.
- **Posta del pilota**: il chip della serie dei bollettini NON porta più al
  Cruscotto ma al CENTRO GARE con la scheda già aperta (gui/js/viste-d.js)
  — il posto dove si sceglie il campionato e si corre.
- **Campionati arricchiti**: le card portano premio, tassa, griglia tipica,
  rep richiesta e la prossima ronda completa (data vera, ora, meteo — src/webui.mjs);
  il click su una card chiude gli altri pieghevoli e lo scroll non atterra più
  sotto l'header (`.champ-detail{scroll-margin-top:86px}`).
- **Avviso «Prima volta in EVO» tolto dalla scheda gara** (PC vergine, guerra
  finita): banner rimosso da gui/js/viste-a.js; il campo `weekendSeen` resta
  nel JSON per i collaudi.
- **Banco A/B MOSSO nel GARAGE** («da rivedere e spostare»): accanto al segna
  del meccanico — dove si lavora sui setup — non più nel tab Analisi.

Verifica: `npm test` 647/647 (incluso il test nuovo ORE SPOSTABILI in
[test/agenda.test.mjs](test/agenda.test.mjs): override, reset, override stante
pulito alla lettura, fuori banda → errore). Sintassi `node --check` ok su tutti
i file toccati (src e gui/js).

### DA-15 — Collaudo del PC amico vergine, dall'alto in fondo · STATO: fatto (1/11) · richiesta Mauro 1/11 («Ricontrollo installazione amico»)
Non bastava lo unitario di ieri sera: la domanda vera è «l'AMICO, col pacchetto scaricato dal GitHub, fa installa-e-gioca?». La prova della sequenza intera in
[tools/_collaudo-amico.mjs](tools/_collaudo-amico.mjs):

1. **zipball vera del ramo** — `git ls-files` in palude, zip col tar di System32: non la mini-zip dei test, TUTTO il codice tracciato (test e data esclusi);
2. **installazione.cmd come l'amico** — contro un server HTTP finto che serve solo l'endpoint zipball, `EVO_INSTALLER_NO...` per saltare scorciatoie e avvii; la cartella destinazione nasce vergine: build-id.txt, data/ senza token, e — 
   il punto che la danza ha TROVATO — all'inizio il pacchetto arrivato SENZA l'installatore delle app, perché i cinque file di ieri sera non erano ancora nel git (l'amico avrebbe cavalcato la zipball vecchia). Committo tutto e la ripresa va a segno;
3. **il PC dell'amico** — base Saved Games finta con la mod ACE UI App Loader installata e ZERO app nostre; primo avvio nel modo silenzioso (quello che avvia.cmd chiama a ogni apertura GUI);
4. **dopodiché** — app copiate IDENTICHE alle sorgenti (byte a byte), marcatori vuoti in ACE/Video, nessun menu.html, build-id coerente, e il SECONDO avvio tacca (nessuna copia ripetuta).

Esito: **danza completa, 21 verifiche verdi zero KO**.

⚠ di confine, come sempre: il server finto e le cartelle TMP stanno al posto di GitHub e del PC vero; il collaudo prova la catena del pacchetto, non il click umano.

### DA-16 — Le rotte di scrittura del server rispondono SOLO al POST · STATO: fatto (1/11) · lezione dell'incidente sonda 1/11 (vedi SESSION_REPORT)
La dispatcher unisce GET e POST nello stesso switch e molte scritture hanno
fallback a corpo vuoto: una GET «a lettura» poteva mutare il salvataggio:
- la sonda API del 1/11 mattina lo provò in pieno (iscrizione −450, sfida
  accettata, nodo attivo spostato, sponsor riassegnato sul save VERO —
  restauro idempotente in `tools/_ripara-sonda.mjs`, server riavviato con
  `riavvia-webui.mjs`, `/api/status` di nuovo 536.037);
- il dir: [src/webui.mjs](src/webui.mjs) `SOLO_POST` (43 rotte) + guardia 405
  PRIMA di leggere il corpo; le rotte miste restano GET-abili dove la
  scrittura richiede il campo del corpo (`wizard`, `weekend-track`); la GUI
  non è toccata (api() in core.js parla già tutto POST). Provino
  `tmp/_difesa-probe.mjs`: 7 GET-mutanti → 405, 5 GET-lettura → 200, POST
  regolare 400 gentile. Suite **660/660**, biome 0;
- onesta: il provino della difesa ha a sua volta ritoccato il save vero
  (POST race su tmp → carriera reale, −450 alle 12:30) — steso da
  `_ripara-sonda.mjs` e server riavviato di nuovo. Da ora ogni prova di
  server si fa col pattern `game-sandbox` o vergine copia.

### DA-17 — Verdetto webui «Gare 0»: il prefisso di default vive nella funzione · STATO: fatto (31/10 pomeriggio) · richiesta Mauro 31/10 («verdetto di gara oggi non va: Gare 0 · 0 vittorie · 0 podi»)
La GUI chiama /api/verdetto SENZA prefisso, l'endpoint passava `prefix: undefined`
in verdettoGiornata e la scansione dei Results cercava il NOME FILE letterale
«undefined…» (`f.startsWith(undefined)` non esplode: ToRegExp su undefined è falso,
e l'argomento diventa la STRINGA "undefined" → nessun match): 0 file → «Nessuna gara undefined» →
la scheda stampava l'aggregato a zero su una giornata PIENA. Il CLI era a posto
perché il default di oggi lo calcolava solo lui. Cura UNICA: [tools/verdetto-giornata.mjs](tools/verdetto-giornata.mjs)
— il default aammgg di oggi vive DENTRO verdettoGiornata (una sola fonte, chi
chiamava senza prefisso la riceve). Test di regressione in
[test/verdetto-giornata.test.mjs](test/verdetto-giornata.test.mjs) (chiamata
SENZA prefisso conta la gara di oggi): **8/8**; smoke webui 1/1; dal vivo
`/api/verdetto` dopo riavvio: **Gare 4 · 3 vittorie · 4 podi** (00:08 Brands
Hatch P1/15 · 00:19 Monza P1/15 · 13:55 Oulton Park P2/16 · 14:20 Imola P1/17,
giro migliore 01:47.934 Brands Hatch).

### DA-19 — Il POST di presentazione: dalla bozza al post vero · STATO: DA FARE · da DA-8 (1/11)
La bozza in [IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md) è verificata
(11/12 claim vivi, tabella verdetto nel file) ma resta una BOZZA, non un post.
Per andare in luce servono:

1. la release pubblica (DA-7: che dipende da DA-1, DA-3, DA-4 — i collaudi
   che solo la pista può dare): il PACCHETTO v0.1.45 è già costruito e
   provato (697/697 test, danza amico 24/24 — [report/release-0.1.45.md](report/release-0.1.45.md));
   manca SOLO il gesto: push + `crea-release.mjs` con la zip come asset
2. gli screenshot della GUI in docs/screenshots — il post li cita e la cartella
   oggi non li ha tutti;
3. allineare i NOMI del post ai VERI nomi degli schermi (claim n.1:
   «Campionati a miscuglio» la GUI NON lo dice — dice «Pools sorteggiati…»);
4. decidere il CANALE (forum, subreddit, entrambi) e l'apertura IT/EN — il
   doppio linguaggio è già vivo nella bozza bilingue rigo per rigo: resta l'ORDINE
   (IT in testa e EN rincodato, da fissare col canale) — RESIDUO a tabella
   R1–R3 in [IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md) (agg. 1/11).

Il momento giusto: DOPO la release pubblica. Finché no, il post resta
nel cassetto con il verdetto attaccato.

**Taccuino screenshots (inventario fatto 1/11, caccia 31/10 sera)**:
- ✅ **20-online.png FATTO** — fotografato dal vivo dalla GUI (tab Online
  col **libro dei rivali** aperto: Sting VG, Speedy Gonzales, 60 incrociati
e la lista sessioni sopra). README IT/EN aggiornati: la tab Online non
  ricicla più 14-archive.png.
- ○ **07-engineer.png** — attenzione al CONTESTO: il piano stint esiste
  SOLO per le ronde a tempo (durationMin del calendario; il piano rifiuta
  per design senza raceMin, vedi stint-plan.mjs «durata») e l'Ingegnere
  LIVE nasce e muore con una sessione vera. Il fotogramma si divide in
  DUE momenti (dettaglio nella ricetta qui sotto): la SCHEDA col piano
  pre-gara si fotografa SUBITO appena il sedile è su una ronda a tempo;
  il pannello Ingegnere LIVE con la finestra viva va preso in sessione
  (prove/qualifiche già bastano per il banner, la finestra viva in gara).
  1) iscriviti nella GUI a una enduro della tua scala (rep 699:
     **Endurance GT4** è già sbloccata, repRequired 450 e iscrizione
     3.500 €; GT3 Endurance invece serve rep 800 — ancora chiusa;
     scheda Campionati); 2) apri la scheda gara e leggi
     il piano stint pre-gara (riga «⛽ Piano stint» della scheda, memo 2 min);
  PRECISIONE DELL'ULTIMO GIRO (31/10, controllato nel codice): il piano
     segue il SEDILE, non la sessione (stintDurEff legge nextRound di
     webui.mjs) — il punto 2 vale SENZA essere in pista: l'iscrizione a
     GT4 Endurance basta perché la scheda mostri «⛽ Piano stint». Lo
     show del LIVE (Ingegnere) invece vuole una sessione vera, MA BASTA
     PROVE o QUALIFICHE per il banner; solo la «finestra viva» (giri
     mancanti alla sosta, stintStopAlert) cresce col CONTO DEI GIRI,
     cioè in gara. Foto la si fa in 2 fasi: scheda (offline, subito)
     e LIVE in qualifiche/gara (con cronologia MoTeC del sedile già in
     casa, il banner la scrive dal piano raccolto in punto 2).
  RICETTA PULITA (1/11): la versione ordinata a due fasi ora vive nel
  post, § «Le foto del post» — Fase A offline (iscrizione **Endurance
  GT4**, scheda col «⛽ Piano stint» senza pista) e Fase B in sessione
  (banner in prove/qualifiche, finestra viva col CONTO DEI GIRI in gara).
  Destinazione dichiarata: `docs/screenshots/07-engineer.png` — lo slot
  è libero (il README cita 06 e 08; `07-world.png` esiste su disco ma
  non è citato da nessuna tabella).
- ✅ **in-diretta/ FATTO (31/10 tarda sera)** — la finestra è tornata
  visibile e i due segnaposto sono scattati DALLE SONDE (non dal menù
  di EVO: sono anteprime fuori dal gioco su dati veri del server):
  [docs/screenshots/in-diretta/cruscotto.png](docs/screenshots/in-diretta/cruscotto.png)
  (panello del Cruscotto con registro cambio auto, consigli, ronda
  preparata) e [docs/screenshots/in-diretta/pitwall.png](docs/screenshots/in-diretta/pitwall.png)
  (Pitwall con la radio del copilota viva DURANTE una sessione reale:
  «Box chiuso: fuori dal pitlane», benzina per giri, ronda armata col
  via automatico). NEL POST vanno dichiarati come segnaposto dell'UI
  (il fotogramma «nel menù di EVO» resta da fare col gioco aperto); la
  nota «🤖 engine non disponibile» del Cruscotto è il simbolo
  dell'anteprima fuori dal gioco — in gioco non compare. Le sonde che
  servono: `node tools/_preview-cruscotto.mjs 9104` (+ `?loader=finto`
  per il semaforo) e `node tools/_preview-pitwall.mjs 9107`, click sul
  drawer e screenshot.
  **CHIUSA 1/11**: le due foto sono incastonate nel post —
  [IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md) § «Le foto
  del post», in linea e dichiarate segnaposto con la nota «🤖 engine»
  spiegata in didascalia. Unico residuo dichiarato nel post: il
  fotogramma «nel menù di EVO» da gioco aperto.

### DA-18 — MX-5 NA del pool «epoca» azzerata: da penalità doppia a zero · STATO: fatto (31/10 tarda mattinata) · richiesta Mauro 31/10 («il 14% è proprio la penalità, dovrebbe stare a 0 dato che è l'auto meno veloce»)
Nella classe `campionato_epoca` di [data/grid-classes.json](data/grid-classes.json)
(il pool 1990-2005: R5 GT Turbo base a 0, GR86 ~10, i30 N ~20, Countach cap 20)
il restrictor della `preset_mx5na_mech_1` era un 14% e il `mech_2` un 20% —
stime a tabula con la formula ΔPI×25, mai confermate in pista. Il punto di Mauro:
in pista la MX-5 è già l'auto MENO veloce del pool, il restrictor era una
penalità SOPRA (lezione già vista: 23/10 a RBR la MX-5 con 8,75% girava +26 s/lap).
Le due regole MX-5 ora sono a **restrictor 0** (zavorra 100 kg invariata, UNA leva
per volta come da metodo: se resta indietro, la leva successiva è la zavorra);
voce di storia [data/grid-classes.json](data/grid-classes.json) `campionato_epoca`
2026-10-31 con la motivazione. Verifica: `node --test test/gridclasses.test.mjs`
**7/7**, JSON valido. Attenzione pratica: le scritte vanno rigenerate dal menu
GENERAZIONE GRIGLIA di EVO (APPLICA a schermo) per vedere lo 0 nella finestra.

### DA-10 — Sistema le tinte nel builder · STATO: prima fetta (31/10 sera) · richiesta Mauro 30/10 («tienine nota nel diario»)
Il builder della griglia lascia gli avversari **monocolore**: in gara le auto
avversarie escono tutte con la STESSA livrea del pool, no varianti — già
denunciato nel vivo («controlla perché gli avversari hanno auto
monocolore»). Il materiale: nel builder ([src/gridbuilder.mjs](src/gridbuilder.mjs), con
la sua variazione byte-distinta) le celle cambiano ma la LIVEREA del
visual preset (campo 11 del layer griglia, decodificato in
`tools/evo-grid.mjs` come `cell.visualPreset`) resta una sola; la lezione
del turno 476 («griglia personalizzata con più LIVERIES della stessa
auto») dice che è il TEMPLATE che deve portare le varianti, ma il pool
multi-marca che ora gira non le cerca. Criterio di chiusura: in gara
vera vedere avversari con tinte DIVERSE nello stesso pool (la prova è a
vista sul via), template e griglia-cache coerenti, test di casa verde.
**Prima fetta 31/10 sera**: la CACCIA alle livree è nel builder —
`visualOf` legge il campo 11 di ogni cella scrittta (stessa estrazione di
`evo-grid`: il preset sta dopo `\x12`, `'(default)'` se il campo manca)
e il report porta la riga `tinte` per modello: `ks_f40_lm ×7 · 3 tinte`
o `×4 · 1 tinta (MONOCOLORE: più liveries in EVO + APPLICA per le
varianti)`. Le celle restano fotocopiate dal template — il builder NON
inventa tinte (zero rischio crash): se un modello esce monocolore è il
report a dirlo, col gesto. Verificato in casa:
`test/gridbuilder-tinte.test.mjs` 2/2 (3 livree nel template → 3 tinte
in griglia; 1 sola → MONOCOLORE gridato), suite vicine verdi (uniche,
templates, calib: 27/27).

**Seconda fetta (1/11, autorizzazione «migliorie» di Mauro)**: due leve
aggiuntive nel builder.

1. **Bilancio per FAMIGLIA**: il match del bilancio recita la lezione del
   27/10 (già in esclusioni): le regole col preset `mech_1` pesano ANCHE le
   varianti `mech_2`/`mech_3` della STESSA auto (`withoutMech` al livello
   modulo, `applyRulesToCell` matcha per famiglia). Il template RINUMERATO a
   mano (un'era di mech_1, poi mech_2/3) non fa più uscire una variante a
   0 kg: la regola segue l'auto, non il numero del preset.
2. **TINTE PRESTATE** — default SPENTO per serie, opt-in con
   `classi."<serie>".tintePrestate = true` in `grid-classes.json`: quando
   il pool ha un modello MONOCOLORE, il builder pesca le celle vere degli
   ALTRI template sulla stessa cartella (`data/grid-templates/`) e le
   fotocopia INTERE (byte a byte: zero inventate, cap 20 file in ordine
   alfabetico, dedup HEX, il filtro ESCLUSIONI per preset e la lezione
   zero-crash byte-unica restano intatte). Il report dichiara
   `tintePrestate: <n celle>` solo quando le usa; l'idempotente (celle
   identiche sul disco) non cambia un passo.

Verificato in casa: `test/gridbuilder-tinte.test.mjs` 5/5 (famiglia:
   regola del mech_1 pesa il mech_2; default OFF: la griglia resta
   monocolore e il report tace; ON: 3 tinte con 2 celle prestate e 3
   celle byte-uniche) — suite completa **656/656**, lint 0. Restano: il
   collaudo a vista sul via con un template RICCO di livree e un'altra
   serie col flag tintePrestate.
**Terza fetta (1/11 notte, la cura sul PROMPT reale di Mauro: «ora le
auto avversarie mx5 sono tutte identiche»)**: la coppa MX-5 ND Cup
portava la livrea 2 su 17 celle su 25 (4/17/4 — la «tutte identiche»
a vista). La norma è già nel builder (tinte prestate OFF, celle
copiate dal template), il sentiero era il TEMPLATE sbilanciato. Cura
si (tmp/_cura-mx5-tinte.mjs, schema tools/cura-livree.mjs):
   - Donori VERI dal parco: ogni cella convertita riceve INTERO il
     campo 11 e il run completo di f14 di una cella donatrice già
     scritta da EVO (zero chimere — la lezione del crash 16:51).
   - Guardia byte-uniche: le 25 celle post-cura son tutte distinte
     (lezione 20/10 e 23/10, i doppioni vanno rifiutati).
   - Riscritto coppa_mazda-mx5-nd-cup.customgrid: 4/17/4 → **9/8/8**,
     25 celle byte-uniche, backup bak-mx5-tinte2026-11-01T22-23-19.
     Bersaglio equo calcolato (total/3, il resto alle prime) — 18
     celle danno 6/6/6, il live del weekend aveva GIÀ questo
     equilibrio (APPLICA 23:18: 18 celle 6/6/6 uniche: la pista di
     Mauro mostra rosso/bianco/arancione — confermato a vista).
   - Il live NON si tocca col gioco aperto: il template curato
     vale dalle PROSSIME costruzioni del builder.
   - TROFEO MX-5: RIFIUTO con la cura giusta — la serie è mista
     (7 × NA, TUTTE visual_3, e 7 × ND Cup) e ha 4 DOPPIONI byte
     già presenti tra le NA (girate prima della cura, dal bagno
     delle 20:41). Non è materia di tinte: è da pulizia-celle da
     fare con cura dedicata. Sospesa qui.
   Test: copilota-narratori.test.mjs 31/31 verde (la parte radio).

### La cura deduplica: PULIZIA-CELLE (2/11, richiesta Mauro) — tool scritto, scritta in attesa di EVO chiuso

La cura promessa ai mx5 del 1/11 («da pulizia-celle da fare con cura
dedicata») è OUT dal tmp: tool permanente
[tools/pulizia-celle.mjs](tools/pulizia-celle.mjs), con le regole di casa
intatte:
- DOPPIONI byte: per ogni gruppo di celle byte-identiche la prima resta, le
  altre ricevono INTERO il run di f14 (livree in fila, ordine di EVO) di un
  donore VERO del parco di last_grid + bak-* (stessa identità carId+mech+vis,
  variante in ordine di QUORUM, mai un run già in uso nel file). Solo f14:
  f10/f11/skill/driver intatti (prostesi di cura-livree).
- GUARDIA byte-uniche a post-cura: se il risultato avrebbe ancora doppioni per
  parco avaro, il file NON si scrive e si gridano le celle (il limbo 2/11: nel
  dry-run su TUTTA la libreria 15+ template hanno doppioni seri con donori
  assenti nel parco — quella è la lista del gesto «più LIVERIES + APPLICA»).
- MONOCOLORE (opt-in --monocolore): tutte le celle di un modello su una sola
  livrea → le extra pescano le altre varianti reali del parco. Il default resta
  prudente: senza flag una tinta unica legittima non si tocca.
- Bersagli mirabili: passando un .customgrid esplicito si cura SOLO quello;
  senza argomenti fa quadro su tutta la libreria + last_grid. --scrivi solo con
  EVO chiuso (stessa guardia del parco), backup bak-pulizia-*, roster del
  weekend riscritto dopo la toccata del live.
- DRY che trova anomalia esce 3 (come cura-livree): i wrapper lo vedono.

Verificato: node --check 0; dry-run sul trofeo MX-5 grida ESATTAMENTE i
**4 doppioni** promessi (celle 3/5/9/11, il bagno del 20:41) e trova i donori
nel parco (4 varianti reali mx5, quorum sonda 2/11); ramo --monocolore on nel
trofeo: 0 monocolore (giusto, le NA sono già tinte diverse). LA SCRITTA è in
attesa: **EVO è APERTO** (tasklist 13324), la guardia di casa rifiuta — la
cura vera è `node tools/pulizia-celle.mjs --scrivi data/grid-templates/trofeo_mx5.customgrid`
a gioco chiuso.

### La vetrina delle tinte (1/11, autorizzazione migliorie): tinte/prestate alla vista

Il report del builder porta le livree per modello e le PRESTATE, ma nessuna
vetrina le mostrava: quando si lavora da finestrino la riga restava sepolta
nel JSON del report. Ora:
- **CLI `griglia`** ([src/cli.mjs](src/cli.mjs)) stampa una riga `tinte   ...`
  per modello (con il grido MONOCOLORE quando serve) e `prestate ...` quando
  il parco dona celle; DRY incluso: la lettura di una --dry porta pure la riga.
- **WebUI prep** ([src/webui.mjs](src/webui.mjs)): il messaggio dell'evento
  (`prep.guests`) e la riscrittura di livello (`prep.grid.rebuild`) dicono
  `N tinte prestate dal parco` e, se un modello esce monocolore, l'avviso
  completo col gesto «più LIVERIES + APPLICA» — niente decodifiche a mano.

Verificato: `--check` webui/cli, suite 656/656, biome sui due file 0.

### La vetrina in tavola: la GUI Grid racconta le tinte (1/11, autorizzazione migliorie)

Terza fetta della vetrina: la tab **Griglia** della GUI (
[viste-griglia.js](gui/js/viste-griglia.js)) ora mostra le LIVERIES del
file in attesa:
- **`readCells`** ([tools/grid-balance.mjs](tools/grid-balance.mjs)) porta
  la `tinta` di ogni cella (campo 11, stessa estrazione del builder:
  segmento dopo `\x12` taglio a `\x18`). Le varianti di formato si
  sistemano da sole: byte di lunghezza dopo il tag e, sui template
  sintetici dei test, l'intestazione `\n` + lunghezza. Il builder NON
  toccato (per i contatori il prefisso costante non cambia niente).
- **Tab Griglia**: colonna `Tinta` sul file e riquadro «Tinte (liverie):
  modello ×N …» sotto la classe combaciata; un modello con UNA sola
  livrea grida **MONOCOLORE** col gesto «più LIVERIES + APPLICA» e la
  leva dei rivali (`tintePrestate: true` in grid-classes.json).
- Test: [test/readcells-tinta.test.mjs](test/readcells-tinta.test.mjs) 4/4
  (sintetico pulito, `(default)` per il campo 11 assente, formato gioco
  reale\nessuna regressione preset/kg/count). Suite **660/660**, biome 0
  sui tre file toccati.
- **Badge del flag** (sopra): `api('grid')` porta `tintePrestate` della
  classe in pasto alla GUI e le Classi e regole mostrano il badge
  «tinte prestate (parco)» sulle serie che lo hanno attivo — chi non
  legge grid-classes.json a mano vede da solo chi pesca dal parco.

### DA-20 — Stato del test che lega PERIODO_MS di publisher e app di gioco · richiesta 1/11 («registra lo stato del test») · STATO: fatto (1/11, rifattore) 6/6 verdi · suite 782/782 (2/11)

Il test [test/uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs) è la legge
che tiene UNA sola voce del ritmo (il publisher) e le due app di gioco
sulla stessa riga. Dalla rifattore di oggi (le app prendono il valore
ALLA BUILD, vedi il registro del diario) controlla CINQUE cose:

1. **La sagoma non dichiara nulla a mano**: nessun `const PERIODO_MS =`
   scritto dentro le sagome (cruscotto.src.js / pitwall.src.js) — solo
   il segnaposto `__PERIODO_MS_DAL_PUBLISHER__`;
2. **I file costruiti portano il valore del publisher**: il numero nei
   costruiti (cruscotto.js / pitwall.js) è identico alla costante
   importata da [src/uiapp-pub.mjs](src/uiapp-pub.mjs);
3. **Nei costruiti il segnaposto è sparito**: `node --check` sulla
   sintassi dei due file passa, cioè l'innesto ha sostituito tutto;
4. **Il generatore segue il cambio di valore**: cambiato il numero nel
   publisher, un giro di [tools/genera-uiapp.mjs](tools/genera-uiapp.mjs)
   aggiorna entrambi i costruiti (e richiama da solo gli installatori, 3/11);
5. **Il ritmo MONTATO vale a numero** (1/11, dopo il rifattore): il ritmo
   del sondaggio `prendiSlot` nei costruiti, VALUTATO con la costante
   cucita dalla build, fa la metà esatta del periodo del publisher
   (PERIODO_MS/2) — non solo la forma della riga.

**Stato attuale: 6/6 verdi** nel file del periodo, e suite intera
**782/782** a sessione ferma (node --test, 2/11, dopo l'estensione della
prova runtime della coda ai tre sentieri di `applicaComando` — setcar,
evento e avvia — sonda scaduta + controprova viva per ciascuno, l'estensione
richiesta «anche ai comandi tipo evento e avvia sessione, non solo setcar»);
biome 0 sui file toccati.

Cosa il test NON copre (dichiarato, non nascosto): le copie installate
nei Saved Games NON sono ricontrollate a programma — gli installatori
(installa-cruscotto / installa-pitwall, che copiano i costruiti) girano
a mano dopo la build; a cambio di PERIODO_MS nel publisher va rifatto
«genera + installa» a mano (il generatore lo consiglia in output quando
il valore è cambiato).

**Quinto controllo (1/11 pomeriggio, per richieste di Mauro sul test stesso):
la VALIDITÀ — test al passo, 5/5.** Il publisher già marca ogni fascia con
`validaFino` = (slot+1)·PERIODO_MS, ma le app lo ignoravano. Ora entrambe
catturano la scadenza della fascia adottata e la rispettano: la fascia
scaduta (riserva slot-1 letta in ritardo o server fermo) si mostra a
schermo CON LA DICITURA «Fascia scaduta: dati di una fascia passata» — mai
venduta per fresca — e nel Cruscotto la guardia sta prima di tutto:
`applicaComando` NON fa partire setcar/avvia da una fascia morta (il
publisher li ripropone in ogni fascia viva, non si perde niente); il
semaforo porta la riga sull'anello (pitwall: pallino arancione). Toccate le
sagome (cruscotto.src.js, pitwall.src.js) e i costruiti rigenerati e
reinstallati nel gioco con gli installatori. Verifica:
[test/uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs) 5/5 (la prova
del quinto filo: scadenza scritta dal publisher, cattura in adotta, guardia
in applicaComando, avviso a schermo nelle due app); biome 0 sui 5 file
toccati; `node --check` sui costruiti ok.

---

## Registro del diario

### 2/11 — La carriera si chiama APP: il ponte di Paddock diventa app-carriera, e i letterali del gioco restano tali (richiesta Mauro: «aggiorna DIARIO-SVILUPPO.md con la voce di oggi sulla rinomina Paddock→App e la suite al verde su 867 test»)

La rinomina è COMPLETA in tutto il progetto:

- **Il ponte**: [src/paddock.mjs](src/paddock.mjs) → [src/app-carriera.mjs](src/app-carriera.mjs) — la sola lettura dei journal
  dell'app del gioco in Saved Games (niente copia da allineare, lezione 31/10),
  con [src/journal.mjs](src/journal.mjs) e [src/uiapp-store.mjs](src/uiapp-store.mjs) a passo; consumatori
  aggiornati: webui, webui-views, uiapp-pub, state, cars, race, import, analisi,
  gridbuilder, grid-calib, world, testday, cli, life.
- **I rinominati con lui**: [tools/ronda-ladder.mjs](tools/ronda-ladder.mjs),
  [tools/classi-da-app.mjs](tools/classi-da-app.mjs),
  [tools/cura-giri-app.mjs](tools/cura-giri-app.mjs),
  [tools/_prova-app.mjs](tools/_prova-app.mjs) e i test
  [test/app-assenza.test.mjs](test/app-assenza.test.mjs),
  [test/app-bridge.test.mjs](test/app-bridge.test.mjs),
  [test/classi-app.test.mjs](test/classi-app.test.mjs),
  [test/cura-giri-app.test.mjs](test/cura-giri-app.test.mjs),
  [test/fasce-app-stabili.test.mjs](test/fasce-app-stabili.test.mjs),
  [test/ronda-ladder.test.mjs](test/ronda-ladder.test.mjs),
  [test/uiapp-pub-app.test.mjs](test/uiapp-pub-app.test.mjs) (insieme a
  semina-bottone e uiapp-tick-coda di questo giro).
- **Cosa NON si rinomina** (contratto): i letterali funzionali dell'app del
  gioco — la cartella journal `Saved Games\ACE\mods\uiresources\ACEUIAppLoader\paddock\`, i journal `pd-*`,
  `paddock.js`, `engine: 'Paddock 1.0.2'`, `APP_PDKEY='paddock'` — e il
  PRODOTTO esterno vero (`Paddock.exe`, `Desktop\Paddock`, la versione
  1.0.2): il nome "Paddock" nei restanti punti dei sorgenti è SOLTANTO il suo
  catalogo e i suoi file; diario storico e POST-PRESENTAZIONE restano
  cronologia, non codice.
- **Cure di residuo**: `_classi-paddock-tmp` → `_classi-app-tmp`
  ([test/classi-app.test.mjs](test/classi-app.test.mjs)), tmpdir
  `ronda-ladder-` ([test/ronda-ladder.test.mjs](test/ronda-ladder.test.mjs)),
  backup `grid-classes.bak-classi-app-` ([tools/classi-da-app.mjs](tools/classi-da-app.mjs)),
  commento `isolazione identica a ronda-ladder.test`
  ([test/app-bridge.test.mjs](test/app-bridge.test.mjs)).

Verifica: la suite dei rinominati (app-assenza, app-bridge, classi-app,
cura-giri-app, fasce-app-stabili, journal-nostro, ronda-ladder,
uiapp-pub-app, uiapp-tick-coda, uiapp-pub-guard, uiapp-installata) **82/82**;
suite INTERA `node --test "test/*.test.mjs"` **867/867 verdi** (37 s).
Lezione di ambiente per il futuro: `node --test test/` su Node 22 prova a
caricare la CARTELLA come modulo (MODULE_NOT_FOUND brutta) — il glob dei
file, non la dir.

### 2/11 — Il tasto «Prepara tutto e avvia il campionato» esce dalla GUI (richiesta Mauro: «il nuovo tasto che non voglio, è da rimuovere»)

- [gui/js/viste-b.js](gui/js/viste-b.js): `seminaRigaHTML` + `seminaRigaWire`
  via con le DUE montature del tab Campionati (pagina piena e ramo vuoto).
- [src/webui.mjs](src/webui.mjs): via il case POST `semina` (consumatore
  unico era quel tasto), l'import del seminatore e la voce `semina` dai
  cancelli SOLO_POST.
- [test/semina-bottone.test.mjs](test/semina-bottone.test.mjs) cancellato:
  provava esattamente quel tasto+endpoint. Il seminatore resta DA RIGA DI
  COMANDO (`node tools/semina-campionato.mjs`, provato da
  [test/semina-campionato.test.mjs](test/semina-campionato.test.mjs)).
- **L'errore colto sul vivo** era quasi sicuro la guardia GAME_OPEN («Il
  gioco (EVO) è aperto: chiudilo prima di seminare» — Mauro era entrato in
  EVO col «Prepara e divertiti» un attimo prima): col tasto via, la questione
  muore comunque.

Verifica: `node --check` su webui.mjs e viste-b.js; test mirati
(webui-smoke, tetto-gui-json, guardia-nav, layout-impostazioni,
semina-campionato, webui-queue, semina-race-settings) **19/19**; webui
riavviata (nuovo processo su 8642, vecchio PID 6645 giù): home 200,
`/api/championships` con le serie vere, `/api/semina` → **404**; suite INTERA
**863/863** (i 4 mancanti su 867 sono i test cancellati col tasto).

### 1/11 notte — IL REGISTRO DELLE SCRITTURE AUTOMATICHE DEL BOLLETTINO, NELLA GUI (richiesta Mauro: «aggiungi nella GUI un piccolo registro delle scritture automatiche del bollettino») · ✅

Il bollettino (wx-auto) ormai scrive il cielo da solo al cambio ronda e a fine
di ogni sessione, ma chi lo ha visto? Finora la scrittura si raccontava una
volta sola nella lista messaggi e poi spariva. Ora ogni scrittura RIUSCITA
lascia una riga sul disco e la GUI la mostra:
- **[src/wx-registro.mjs](src/wx-registro.mjs)** (nuovo): il diario su
  `data/wx-auto.jsonl` — `{ at, via, sessione, preset, label, from, file }`:
  QUANDO (ISO, ora del PC), PERCHÉ (`cambio-ronda` | `fine-sessione`), che cosa
  (preset + nome nel catalogo), il preset che c'era prima (`from`) e il file
  Risultati che ha innescato. Append-only corazzato come warnings.mjs (se
  va storto si perde la voce, il bollettino non si ferma mai) con taglio
  dolce a 300 righe (resta l'ultima metà). `registra(voce)` scrive,
  `leggi({ n })` torna le ultime dal più recente col `total`. `EVO_DATA_DIR`
  lo isola nei test.
- **[src/wx-auto.mjs](src/wx-auto.mjs)**: al termine di OGNI scrittura
  automatica riuscita (sia `wxAutoTick` fine-sessione sia `wxAutoPrima`
  cambio-ronda) chiama `registra` (helper `attizza`): niente voci per
  «già a posto», errori o file fuori piano — solo le scritture vere. La
  lista messaggi del server resta com'era (notifica immediata), il registro
  è la memoria.
- **[src/webui.mjs](src/webui.mjs)**: casella `wx-log` (lettura pura, NON
  aggiunta alle azioni POST di scrittura) che torna `leggiWx({ n: 15 })`
  SENZA richiedere carriera (registro vuoto è legittimo).
- **[gui/js/viste-a.js](gui/js/viste-a.js)**: nel details «Regole di questo
  weekend · meteo» della scheda gara un details interno «📜 Registro delle
  scritture automatiche» (con contatore `wx-log-n`) che CARICA ASINCRONO via
  `api('wx-log')` DOPO il render (accanto all'aggancio dei tasti «Metti»):
  ogni riga «ora · sessione → preset (perché)» più le note lievi (file
  tratto, preset precedente). Vuoto (`total 0`) → «Ancora nessuna
  scrittura…»; un fallimento del fetch non tocca il resto della scheda.

Test: **[test/wx-registro.test.mjs](test/wx-registro.test.mjs)** (nuovo, 5
test: scrittura+lettura round-trip, ordine inverso, taglio oltre cap con
metà conservata, righe corrotte saltate, sandbox EVO_DATA_DIR) e
[test/wx-auto.test.mjs](test/wx-auto.test.mjs): la sandbox ora porta il suo
EVO_DATA_DIR TEMPORANEO così le asserzioni nuove (`via cambio-ronda`,
`via fine-sessione` con file e from) NON toccano `data/wx-auto.jsonl` vero.
`node --test` wx-registro + wx-auto 23/23 verdi; biome pulito sui 4 file
toccati. PROVA SUL VIVO: server su 8642 ripartito DOPO le modifiche
(PID 5960, 19:39), la scheda del Cruscotto apre il details con il pannello
che si riempie dall'API (`/api/wx-log` → `{voci:[], total:0}` finché il
bollettino non scrive il suo primo preset) e mostra l'empty-state.

### 1/11 notte — PROVA SUL VIVO del Prepara: tag giallo → verde SENZA ricarica (e due difetti colti in flagrante)

Prova chiesta («ripecorri la vera via del Prepara: simula la scrittura e verifica
che il tag giallo si smonta nel momento, senza ricarica del browser»), fatta per
intero con EVO CHIUSO: campo sganciato a [70,80] via API (la stessa del bottone),
tab Griglia aperto nel browser con **sentinella** (window.__sentinella = 42),
poi scrittura del vero ramo griglia del Prepara con
[tools/_prova-prepara.mjs](tools/_prova-prepara.mjs): banda [84,85] · cursori ·
21 celle scritti sul file vivo — e il battito di [gui/js/viste-griglia.js](gui/js/viste-griglia.js)
(beat 3 s, aggiunto in questa prova) ha RIDIPINTO il tab DA SOLO: prima
giallo (tag warn) sul 70–80, poi **verde** (tag green · «allineata al campo»)
su 84–85, **zero ricariche** (sentinella intatta 42 tutto il tempo).

Difetti colti DURANTE la prova (e curati subito):
1. **Cella tinta unica**: la **ricostruzione** dal template della scheda
   (22 celle) usciva con TUTTI Porsche 718 Cayman GT4 RS di UNA tinta sola —
   esattamente il quadro che manda in crash i celli ripetuti (report crash
   261101-16.51). NON è la via del Prepara dal vivo (il flusso diretto dal
   gioco scrive le sue 21 DIVERSE): è la ricostruzione dal template che
   restringe la varietà. Il backup del flusso vivo (`.bak-apply-…`) è
   RESTITUITO e ha ripristinato le 21 celle vere (verificato: la GUI mostra
   21, non più le 22). Follow-up aperto su gridbuilder/ricostituzione modelli
   (VA-APERTI: «ricca di varietà la ricostruzione» — da una scelta del
   template all'oracle del flusso dal vivo).
2. **Battito mioSmartTag corto**: la chiave del beat portava solo AI+banda —
   il RESTORE del backup sostituisce il file a STESSA AI ma serie DIVERSA
   (21 vs 22 celle): il tab resterà sulla vecchia stampa fino a clic. Cura:
   la chiave ora è una **impronta** che porta ANCHE piMin/piMax e il numero
   delle celle — ogni cambio di griglia a pari AI fa ridipingere.
   Verifica: biome pulito su viste-griglia.js.

Nota di chiarezza GUI dal vivo: il tag verde porta la scritta «allineata al
campo» (testo preesistente, non scritta di questa prova) — il COLORE è il
segnale (verde = in banda col campo).

### 1/11 tarda notte — IL METEO DELLA PRIMA SESSIONE ANCHE AUTOMATICO (richiesta Mauro: «si può sistemare in automatico il meteo della prima sessione, senza l'unico Metti manuale?») · ✅

Il wx-auto della mattina viveva SOLO del file Risultati (che per la prima
sessione della ronda NON esiste ancora): il trigger naturale mancante era il
CAMBIO RONDA, e ora è agganciato.
- [src/wx-auto.mjs](src/wx-auto.mjs): nuovo `wxAutoPrima(paths, costruisciPiano,
  chiaveRonda)` — al cambio di chiave `node#round` (o al primo battito dopo il
  riavvio) si valuta UNA volta: se nessun Risultati con sessione VALIDA del
  piano è già sul disco per QUESTA pista, si scrive il meteo delle Prove del
  piano (stesso cancello `previsto:true`, STESSA fonte card → weatherPlan).
  Al cambio DA VIVO contano solo i file apparsi col cambio (mtime >= momento):
  la Gara appena chiusa su ALTRA pista non blocca; la gara della STESSA pista
  conta e chiude. Al REIAVvio basta che un file della pista esista per tacere
  (i mtime non distinguono le ronde: conservativo, il Metti resta il ripiego
  di quei casi). Notifica alla GUI: «Bollettino in automatico: nuova ronda →
  meteo delle Prove libere».
- [src/webui.mjs](src/webui.mjs): nel battito del watcher il pianoDellaRonda
  (viewCard → weatherPlan, già la fonte del «Metti») è FACTORIZZATO e serve
  ENTRAMBI gli inneschi: wxAutoTick (file Risultati) + wxAutoPrima (chiave
  ronda). Misi per tick: la chiave uguale esce subito.
- Testi allineati al nuovo patto: weatherRitual nella card
  ([race.mjs](src/race.mjs)), chip del pannello bollettino («in automatico»
  anche per le Prove, il Metti = ripiego) in [gui/js/viste-a.js](gui/js/viste-a.js),
  paragrafo meteo di [GUIDA-AMICO.md](GUIDA-AMICO.md).
- Verifica: [test/wx-auto.test.mjs](test/wx-auto.test.mjs) 30/30 (9 nuovi:
  ronda senza storico → scrive Prove, stessa chiave → tace, file della pista →
  si tace, gara da altra pista → non blocca, cambio ronda su altra pista →
  scrittura seria, due ronde di fila sulla STESSA pista → resta a mano);
  race-card verde; smoke GUI verde; suite intera 1407/1408 pass + 2 rossi NOTI
  del pacco-fixture tmp/pacco-test; biome pulito sui 5 file toccati.
  PROVA SUL VIVO: riavvia-webui → server 0.1.47 in piedi, registro wx-auto
  fermo (0 voci dopo il riavvio, POST /api/warnings 200).

### 1/11 ancora sera — ALLINEAMENTO DRIVER: il pacchetto skill f10 segue la banda (a forma del GENERA)

Giro di controllo con la stessa lente d'ingrandimento sulle scritture del
gioco: customgrid VIVO di oggi 18:07, riscritto dal GENERA del gioco (21
driver — campione fresco): cella per
cella per campo.
- **La cura vera (skill)**: nel GENERA OGNI driver ha il f4 esterno = pacchetto
  skill interno f10 (f10.f1 = f10.f2 = f10.f4 = f10.f5 = f10.f6 = f4: 0.83, 0.86,
  0.85…; f10.f3 fisso 0.1 NON è skill; f10.f7 varint 1). Il nostro **0/21**:
  la banda scalava SOLO il f4 lasciando il pack al valore del template (0.95):
  banda dichiarata nel f4 ma le AI presumibilmente ancora al livello del
  template dentro il pack. Cura [src/gridbuilder.mjs](src/gridbuilder.mjs):
  `cambiaSkill`, toccata dalla scalatura e dal `nudgeSkill` — ogni scrittura
  del f4 trascina il pack con lo stesso valore (f3 e f7 intatti). Il GENERA:
  21/21 allineati (0.83–0.86); nel test con banda [88, 93] il builder scrive
  5/5 allineati.
- **Config confermata col vivo**: il GENERA scrive la config con 7 campi SENZA
  f2 (la cura «Auto senza foto» della sera regge sul campione fresco); la banda
  IA portata dal GENERA (f21/f22 in file) è sua, non della ronda: dentro il
  config la banda è scelta dal generatore, non un difetto delle nostre write.
- **Da capire (fili aperti)**:  (a) f8 varint dei driver: GENERA 142–176 vs
  tiling nostre 52–60 con fuori-scala 302–304 — presumibilmente ID pilota;
  (b) f4 meteo TOP-LEVEL del vivo 18:07 = **8**, valore mai visto nei
  template del GENERA (0–5 o assente) e fuori dal catalogo LGM 0–7;
  (c) f100 nelle f2-celle = due varint grandissime (presente da tutti e due
  i lati, contenuto da fotografare su un GENERA fresco).
- **Verifica**: test nuovo in
  [test/gridbuilder-banda-serie.test.mjs](test/gridbuilder-banda-serie.test.mjs):
  banda [88,93] con pack volutamente sfasato nel template → ALLINEATI 5/5
  (f4 + pack, f3 = 0.1, f7 = 1); suite `test/` **748: 747 pass + 1 skip,
  0 fail**; biome pulito sui due file toccati. (Due test rossi nel giro completo
  `node --test`: stanno SOLO nel pacco-fixture `tmp/pacco-test` — «senza .git»
  e `/api/app` nel sandbox — non toccati dalla cura.)

### 1/11 sera — La FORMA DEL GIOCO: scala a f4.f7 interno, piste e meteo verificate a byte

Il richiesto «sistema una volta per tutte» chiuso col criterio PIÙ FORTE possibile:
non «funziona», ma «l'encode di casa riproduce BYTE PER BYTE ciò che la mano del
Gioco scrive». Prova generale: decodifica→ricodifica del file vivo
GameModeType_RACE_WEEKEND.gamemodesave e di gamemode.lastgamemode via via
byte-identico (stesso codec di tutte le scritture).
- **Piste (set-track)**: re-encode del blocco pista (4 blocchi, spec VUOTA =
  valori correnti) **byte-identico** — la forma dei campi f5.1/2/3/5/6/8/9 che
  scriviamo è ESATTAMENTE quella del gioco. Niente da curare: già nella forma.
- **Scala del tempo (1ª cura vera)**: la mappa precedente teneva la scala nel
  f7-float A LIVELLO BLOCCO — il file riscritto da EVO alle 18:07 la porta
  invece come float DENTRO il sottoblocco data/ora (f4.f7, con anno/mese/giorno/ore):
  il f7 di blocco è un VARINT = il contatore delle slider della griglia custom
  (21 nel primo blocco, 15 negli altri). Il float di blocco l'avevamo scritto
  SOLO NOI nelle scritte di oggi pomeriggio: zavorra sovrapposta a un campo
  canonico, mai vista in NESSUN file scritto dal gioco (verify on entire disk).
  Cura [tools/set-racetime.mjs](tools/set-racetime.mjs): lettore `readBlockScale`
  (f4.f7 interno, ripiêgo sulla zavorra legacy) e scrittore `writeBlockScale`
  (scrive nella forma del gioco e RIMUOVE il f7-float di blocco se c'è); ora e
  minuti restano nel f4 interno come prima. Round-trip su copia del file vivo:
  **12 byte diversi, TUTTI dentro i f4** (4 ore varint + 8 del float 1.0→48),
  contatore griglia e tutto il resto byte-identici; dry-run invariato.
- **Meteo (2ª cura)**: gamemode.lastgamemode usa proto3 — il SERENO (0) NON
  porta il campo 2 (visto reale 20/10), ma noi lo scrivevamo come 2=0 (audit
  bytes NO su impost invariato). Cura [src/weather.mjs](src/weather.mjs):
  `setWeatherPreset(0)` ora RIMUOVE il campo 2 (forma del gioco) e non scrive
  GIÀ a posto → nessun backup/nessuna scrittura; `setWeatherCustom` riscrive
  SOLO se il risultato cambia un byte (2ª passata byte-identica). Il re-encode
  completo del lastgamemode era già byte-identico (audit), quindi la patch	ota
  il campo 2 e i float e nient'altro.
- Verifica: weather-preset 12/12; cancelli-anticheat + set-racetime-mode +
  weekend-laps-lib 16/16; suite intera **746/746 pass (1 skip)**; audit live
  `tmp/_audit-forme.mjs` (pista SI / lgm SI / custom 2ª passata SI / preset-0 SI).

### 1/11 — Auto senza foto in anteprima: la config del customgrid senza campo 2

La pista del photo-bug (auto SENZA anteprima nel menu griglia dopo il «Prepara
tutto», ricorrente da settimane e già portata a meteo e piste senza mordere):
il test discriminante di Mauro — griglia generata/applicata DAL GENERA del
gioco (menu griglia dello stesso weekend) — porta TUTTE le anteprime a
posto. Non è il contenuto delle celle: è la forma del file che noi scriviamo.
- OUTPUT del confronto byte (file del GIOCO alle 18:07 contro il nostro
  16:56, bak): la config del customgrid scritta dal builder porta UN DATO
  IN PIÙ, il campo `2 = 1` (36 byte contro 34). IL GENERA NON LO SCRIVE.
- Storia del campo: incastonato 23/10 «per uniformità con EVO» (VERDETTO
  rev. 4 di NOTE-AUTOMAZIONE: «non è la causa dei crash» — vero, ma NON
  sosteneva nemmeno le foto: l'uniformità invocata era l'inverso).
- Cura [src/gridbuilder.mjs](src/gridbuilder.mjs): il builder NON incastona
  più il campo 2 e, se un template legacy lo porta dentro la config, lo
  SCARTA prima della scrittura (stessa forma del gioco).
- Verifica: test griglia (grid-templates, gridbuilder-tinte,
  gridbuilder-banda-serie, gridclasses, readcells-tinta, griglia-sim,
  grid-calib) 53/53 verdi. PROVA SUL VIVO alla prossima scrittura griglia
  (node ac-evo-career.mjs griglia → APPLICA in EVO): se le anteprime restano
  nere, il campo 2 non era tutto — ma è l'UNICA differenza strutturale rimasta.

### 5/11/2026 — Le firme dei commenti HTML della Pratica (viste-b) si riconciliano col diario

Passo di ronda richiesto da Mauro («porta le date discordanti dei commenti HTML
viste-b (5/11 vs 30/10) al loro vero giorno controllando il diario e firmale
correttamente»). Esito della ronda: i TRE commenti HTML del pannello Gara al
volo in gui/js/viste-b.js portano la data GIUSTA, 30/10 — le tre voci del
diario la confermano (PARTE SUBITO ore 14:10, menu a tendina col PRESET DI
GRIGLIA ore 14:40, PRESET COL NOME la sera). Il «5/11» che il confronto faceva
temere non era di viste-b: sta nel FILBAR di servizio (core.js e index.html)
e lì resta a dire il fatto suo. Comunque le firme non recitavano le parole
del diario: «sarebbe una noia impostare ogni volta» era una parafrasi —
sostituita con la citazione VERA del diario («ogni volta ci sono sempre
problemi con auto, griglie, piste o gara tempo/giri»); il preset di griglia
ora porta la richiesta intera («dammi menu a tendina per piste, auto, griglie
mono o multiclasse»). Il preset col nome era già giusto («preset con la mia
auto», diario serale).

Verifica: test/viste-guard.test.mjs 6/6 (firme con data, niente markup
sepolto), Biome pulito su gui/js/viste-b.js.

#### 3/11 — La regola dei commenti HTML arriva anche alle app in gioco (richiesta Mauro: «estendi la stessa regola (firma con data, niente markup sepolto) ai file uiapp delle app in gioco: menu.html e le sagome src.js portano anch'esse markup»)

La regola nata per la GUI (test/viste-guard.test.mjs: ogni
`<!-- … -->` o è MEMORIA con la firma della casa — una data «3/11»
nel corpo — o è dubbia spazzatura da cancellare, e non tiene markup
sepolto) ora sta anche nella guardia delle app in gioco
([test/uiapp-installata.test.mjs](test/uiapp-installata.test.mjs),
quinto punto della stanza, test «COMMENTI HTML DELLE APP»): guarda
`uiapp/<app>/menu.html` e `uiapp/<app>/<app>.src.js` per cruscotto e
pitwall (pitwall non porta la pagina: la lezione 27/10 lo esclude).
Primo fuorilegge PRESO: la firma del menu del Cruscotto (2), che
portava `ui-<slot>.json` DENTRO il commento (il browser non lo usa, ma
noi lo spediamo lo stesso) e nessuna data — riscritta col «slot» detto
a parole e con la firma 3/11.

PROVA DI ROTTURA: commento ri-sporcato a mano (senza data, con
`ui-<slot>.json`), test name-pattern solo sul nuovo → 1 fail col
messaggio giusto, poi file ripristinato da `menu.html.bak`, stesso
comando (esito bene, nessun residuo). Verifica: la guardia intera
5/5 (quattro test precedenti + il nuovo), biome pulito su test e
menu.html.

### 3/11 — L'INDAGINE OUT-LAP di Monza 18:13: il «giro» che non c'era (richiesta Mauro: «aggiungi la voce dell'indagine out-lap Monza 18:13 al diario di sviluppo»)

- **IL FATTO SOSPETTO** (coppia Ferrari/Monza della serata 30/10, il B che
  offende il giro della casa): A = 17:54, 2 giri, best **1:54.40**; B = 18:13,
  un solo «giro», best **2:13.10** — un +18,70 s che nessun setup spiegava:
  ~25 s fuori scala dal personale della settimana (1:48.3–1:42.6).
- **L'INDAGINE** (sonde a sola lettura [tmp/_sonda-bmonza.mjs](tmp/_sonda-bmonza.mjs)
  e [tmp/_sonda-bmonza2.mjs](tmp/_sonda-bmonza2.mjs) sui file MoTeC VERI):
  il `.ldx` del B (`…_Fri Oct 30 181305 2026.ld`) ha **ZERO beacon di transito**
  (ClassName="BCN", Marker Time sul traguardo) e il parso ([motec.mjs](src/motec.mjs))
  allora gestisce la SESSIONE INTERA come un solo giro ([motec.mjs:180](src/motec.mjs#L180)).
  Quei 133,10 s non sono un giro: sono l'USCITA dai box — dal fermo (gas spinto),
  picco 255,5 km/h, **5,45 km su 5,79 percorsi, chiude a ~94 % del giro — il file
  finisce PRIMA del traguardo**. Un out-lap senza cronometro: nessun transito,
  nessuna linea sul traguardo, un «best» immaginario.
- **L'ARTEFATTO A COLLATERALE**: allineare quel «giro» nel riparto per zone
  produce un netto assurdo — «−51,99 s guadagnati da A» (perso 12,79 s,
  «guadagnato» 64,78 s) — aritmetica che si spiega SOLO col difetto, non lettura
  del pilota. Anche la fascia dei canali (Δ +18.70 s sul giro best) vale SOLO
  come documento del difetto (la colonna B misura un'uscita, l'evoluzione della
  pista non è misurabile lì).
- **LA CARTA**: [report/banco-ab-ferrari296-monza-2026-11-01.md](report/banco-ab-ferrari296-monza-2026-11-01.md)
  — archiviato come DOCUMENTO DEL DIFETTO, non come serata del pilota; targa
  copiata in gazzetta (data/news.json, occasionali).
- **IL DIFETTO NEL BANCO, nato proprio qui**: l'autopuntamento propose per
  Ferrari/Monza la coppia PEGGIORE disponibile — A = `Wed Apr 15 215138`, file
  arido da 21 KB SENZA `.ldx` (ILEGGIBILE, le copie in blocco del 25/10 lo sono
  anche a menu), B = l'out-lap delle 18:13. `abPreferite` non filtrava le
  sessioni senza giri tempestati: le 0 beacon potevano farsi A o B al buio.
- **LE CURE ARRIVATE, QUANDO CADAUNA**: l'avviso del giro singolo nel modale
  (1/11, «guardalo prima di fidarlo»); poi la LEGGE DEL BANCO (2/11, richiesta
  «escludi dal banco A/B le sessioni senza giro cronometratuale»): `ab-list`
  filtra `beacons > 0` ([webui.mjs](src/webui.mjs)), le 0 beacon restano in
  `senzaGiri` e la GUI le mostra DISABILITATE sotto «senza giri cronometrati»
  ([viste-analisi.js](gui/js/viste-analisi.js)); infine la GUARDIA CHE MORDE
  (3/11): [test/ab-senza-giri.test.mjs](test/ab-senza-giri.test.mjs) 1/1 —
  fallisce se ab-list propone una 0 beacon (sessioni sintetiche in sandbox:
  `.ldx` assente, `.ldx` cieco SENZA marker, e le buone CON marker) — coperte
  anche le porte di controllo `prefer` e `last`; prova del morso fatta davvero:
  la legge spaccata → test ROSSO col nome del colpevole, ristabilita → verde.
- VERIFICA: le sonde non toccano disco; test 1/1 in 0,7 s; biome pulita sui
  file della legge (warning preesistente: import inutilizzato webui.mjs:135).

### 3/11 — Il 84–85 inciso è demolito: audit degli sbocchi e verdetto (richiesta Mauro: «riscrivi la copia della banda viva senza la cifra 84–85 incisa, così segue il ladder alle release seguenti» + «voce al diario con l'audit degli sbocchi e il verdetto di demolizione»)

**L'audit.** La cifra 84–85 — la banda di serie del weekend PEUGEOT dell'epoca
1/11 — era scritta a mano in UN solo punto vivo, ma i rivi ne scendevano più giù:

- **La sorgente** — [state.mjs](src/state.mjs) `seminaRaceSettings`: al record
  assente la semina scriveva `bandaSerieLadder(ladder, n) ?? [84, 85]` — il
  fisso era l'«ultima rete» per un ladder d'epoca senza `aiSerie`;
- **lo sbocco della racecard** — la tile «Difficoltà AI» del Cruscotto
  (viste-a.js) non porta numeri: legge il card, e il card (race.mjs) computa
  `rangeMin/Max` dallo slider vivo con override a parte — la copia guasta
  arrivava dal monte, non da lì;
- **lo sbocco del pannello** — viewDifficulty (webui-views.mjs) sa già vivere
  senza record: `oMin ?? Math.round(d.slider)`, banda stretta 1 punto — il
  record assente NON resta a secco;
- **il difetto documentato** — il fisso aveva già la sua sentenza:
  [test/clear-consiglio.test.mjs](test/clear-consiglio.test.mjs) nasce per
  lui («↺» riempita dal seeding 84–85 al render dopo) — difetto chiuso
  dal 3/11 col primo strappo (semina estratta in state.mjs);
- **le cite storiche** — Peugeot 205 «82–92» del primo script d'impianto
  (gridbuilder, cli --template) e l'era del fisso in commenti e guardie:
  STORIA raccontata, non legge — restano dov'è.

**Il verdetto di demolizione.** La rete d'infanzia è DEMOLITA: è sceso
l'`?? [84, 85]` dalla semina e senza banda di ladder NON si semina affatto — la riga resta assente e la banda la calcola il consiglio a
ogni giro (viewDifficulty/difficultyFor), che segue il ladder via `aiSerie`
per nodo. La legge si dichiara nei commenti che la dicitano (state.mjs:
bandaSerieLadder e seminaRaceSettings; webui.mjs: la legge della stanza):
NESSUN punto del codice porta più una banda incisa — un dato inciso a mano
non poteva seguire i rilasci del ladder; ora può solo leggerlo.

Verifica: semina 6/6 (la guardia girata alla nuova legge: il vecchio test
«il ripiego è l'ultima rete» ora esige il CONTRARIO — ladder senza banda
NON seminato e «↺» vuoto anche lì); gridbuilder-banda-serie 10/10;
clear-consiglio 2/2 su server vivo (nessun ritorno del fisso); webui-smoke
1/1; biome pulita (warning preesistente: import inutilizzato webui.mjs:135,
non di questa mano).

### 3/11 — La guardia entra nel flusso di release: preflight di crea-release (richiesta Mauro: «collega la guardia al flusso di release: crea-release deve far girare genera-uiapp + la guardia prima di confezionare lo zip»)

Fino a ieri release e app in gioco parlavano due lingue: la guardia
(test/uiapp-installata.test.mjs) girava a chiamata di test, mentre la
release nasceva quando capitava — e uno zip uscito da `git archive HEAD`
poteva portare costruiti stanti o copie in gioco non riallineate. Ora la
soglia è UNA SOLO, dentro [tools/crea-release.mjs](tools/crea-release.mjs):
PRIMA delle credenziali, della release e di qualunque zip il tool fa
girare

1. `node tools/genera-uiapp.mjs` — costruiti fresh (PERIODO_MS dal
   publisher + firma BUILD_OK) e copie in gioco riallineate;
2. `node --test test/uiapp-installata.test.mjs` — la guardia intera
   (biome sulle sagome, BUILD_OK, copia .js byte per byte e le pagine
   d'ingresso: app.json = sorgente, menu.html assente).

Esito non-zero = la release NON parte (✧ preflight non superato). E se
la build ha riscritto file NON committati, avviso ad alta voce: lo zip
(git archive HEAD) li porta VECCHI — committa prima.

- NUOVI FLAG: `--con-pacchetto` confeziona la zip QUI (node
  tools/pacchetto-amico.mjs, con `--no-test` per saltare la prova npm
  dentro lo zip) DOPO il preflight e la carica come primo asset,
  leggendo il «Percorso:» dall'output del pacchetto — niente zip fatte a
  mano da un flusso fuori dal preflight. L'uso `--asset …` resta com'era
  per zip/asset già fabbricati (i flag tool vengono puliti via prima del
  parsing tag/titolo).
- `--solo-preflight`: prova a secco della soglia — gira il preflight ed
  esce senza toccare GitHub né fare zip: è il tasto di collaudo.
- Check-list aggiornata: RELEASE_CHECKLIST §5 ora dice che preflight e
  `--con-pacchetto` sono parte del passo 5.
- E nella check-list dei COMANDI ([COMANDI-BUFFY.md](COMANDI-BUFFY.md),
  quarto blocco dei prompt ricorrenti) entra la spunta standard
  «Guardia delle app in gioco»: genera-uiapp + guardia DOPO ogni tocco
  alle app — stessa soglia, anche fuori dalla release.

Prova col vivo: `node tools/crea-release.mjs` senza argomenti → uso ed
exit 1 (preflight non ancora in gioco); `--solo-preflight` → build «già
al passo», guardia 4/4, avviso onesto dei costruiti non committati (la
storia del disco), exit 0 senza chiamate a GitHub. Biome pulito sul tool.

Prova dal vivo della soglia (3/11, beffa preflight): `ui-999999999.json`
MEZZA JSON scritta a mano nella cartella cruscotto in gioco, poi
`--solo-preflight` → genera-uiapp passa «al passo» (di fascie non tocca:
il suo riallineamento copre solo .js/app.json/menu.html) e la guardia
cade sulla SOTTOPROVA FASCE con il percorso reale e la cura nel messaggio,
preflight senza stderr «✧ preflight non superato … la release NON parte»
e exit 1 SOPRA le credenziali — niente GitHub, niente zip. Fascia
cancellata (le fascie le nasce SOLO il publisher) → stesso comando →
7/7 e «✓ preflight superato». La soglia col vivo delle fascie in gioco
regge: la beffa passa solo se manca la guardia.

### 3/11 — La guardia delle app in gioco arriva alle PAGINE D'INGRESSO (richiesta Mauro: «estendi la nuova guardia uiapp anche a app.json e menu.html installati: il loader li legge a ogni avvio e curarsi lì è la beffa tipica»)

La guardia delle app ([test/uiapp-installata.test.mjs](test/uiapp-installata.test.mjs))
sorvegliava la copia del solo costruito .js; ma il loader rilegge a ogni
avvio del gioco ANCHE le due pagine d'ingresso di ogni app — una è
la carta d'identità (app.json) e se là resta una pagina vecchia (menu.html)
la beffa è servita. Quarto punto della stanza vera:

- app.json installato = sorgente `uiapp/<app>/app.json` BYTE PER BYTE:
  senza allineamento l'app in gioco dichiara pagine/script di un'altra
  versione (lo stesso guaio che la guardia già temeva per il .js);
- menu.html NON deve ESSERCI affatto: la lezione 27/10 ore 18:40 dice
  che il file dichiarato in app.json ma non più consegnato NON va
  rimesso — una copia stantia che resta
  nella cartella viene rilegata a ogni avvio e rimonta l'app nel SUO
  drawer spostando il menu di EVO. La cura è `node tools/installa-<chiave>.mjs`
  (cancella lui la pagina e riallinea), il fallimento del test lo dice;
- stesso skip del costruito: app non installata (cartella assente) o PC
  senza Saved Games → NON un falso-verde, salto dichiarato.
- STANZA VERA verificata subito: entrambi gli app.json in
  `Saved Games\ACE\mods\uiresources\ACEUIAppLoader\{cruscotto,pitwall}`
  sono identici alla sorgente e nessun menu.html è rimasto — la stanza
  era già a rigore, la guardia adesso se ne accorge se cessa di esserlo.

Verifica: [test/uiapp-installata.test.mjs](test/uiapp-installata.test.mjs)
4/4 (3 vecchi + 1 nuovo), biome pulito sul file toccato.

### 3/11 — La guardia dei nomi puliti a server vivo: lastLd, garage/sessions e tetto (richiesta Mauro: «un test dedicato a systemHealth, garage/sessions e tetto, come il test del banco A/B»)

Quando il nome bello (prettyTrackLabeled di test/tracknames, 1/11) era
entrato nel banco, la stessa cura era già passata SOPRA il server: Mauro
chiese la prova dedicata, «come il test del banco A/B», e il test è
arrivato EX FLUSSO invece che a campioncini. Nuovo
[test/nomi-puliti-server.test.mjs](test/nomi-puliti-server.test.mjs):
un server VERO ([src/webui.mjs](src/webui.mjs) sulla sua porta 8744) con
una carriera finta in sandbox (EVO_DATA_DIR + ACE_DATA in tmpdir, come
clear-consiglio e cover-ponte) e sessioni MoTeC SINTETICHE scritte a mano
allo stesso formato che [src/motec.mjs](src/motec.mjs) decodifica (header
64B, 5 canali da 124B, beacon nel .ldx). Tre piste con token VERI di
cartella, una delle quali ignota al ladder:

- `/api/system-health` → `telem.lastLd.track`: il chip MoTeC
  dell'header legge la CARTELLA («ImolaGP») e deve parlare col nome
  bello («Imola», con valid:true);
- `/api/garage {action:'sessions'}` → `sessions[].trackPretty` del
  selettore del pannello meccanico + `basisTrack` (dove è girata la
  telemetria del consiglio), entrambi puliti;
- `/api/tetto` → `perTrack[].track` e `worstSectors[].track`: la
  tabella dice «Imola», il token grezzo «ImolaGP» non deve comparire
  da nessuna parte;
- il token onesto resta il patto: la pista fuori dal ladder
  («Pista Fantasma») NON prende nomi, in garage come nel tetto.

Filo di autenticità: gli attesi NON sono stringhe copiate nel test ma
ricalcolati con lo STESSO import del server (prettyTrackLabeled + ladder
vero di config/career.evo.ladder.json) — se i due mondi divergono si
vede, se cambia una dicitura non rompe.

Verifica: il test nuovo 1/1 pass (~1,1 s, server vero compreso); biome
pulito. Due scontri col vivo sistemati DENTRO il test: su Windows
`utimesSync` con i numeri dà EINVAL (solo le `Date` passano) e la
cartella della pista va creata prima di scrivere il `.ld`.

### 3/11 — Il bollettino si dichiara automatico (richiesta Mauro: «non l'avevamo reso automatico questo?»)


Il meteo automatico c'era (3/11 mattina, wx-auto.mjs) ma il pannello
«🌦 Bollettino del weekend» nella GUI chiedeva ancora il rituale a mano
pieno («premuto Metti PRIMA» per TUTTE le sessioni) — la pagina raccontava
l'era vecchia. Ora dice la verità:
- [src/race.mjs](src/race.mjs): il rituale (una riga, weatherRitual) dice
  che il PRIMO cielo è a mano e poi si sistema da solo a fine di ogni
  sessione — niente più «PRIMA di entrare» richiesto per tutte.
- [src/webui-views.mjs](src/webui-views.mjs): la card porta anche
  `weatherNow` (currentWeatherPreset, la lettura del selettore che già
  usa il case wx-session) — la GUI vede il cielo già scritto.
- [gui/js/viste-a.js](gui/js/viste-a.js): ogni chip del piano porta il
  tag — «✓ a posto» verde quando il preset attuale combacia col piano,
  «a mano» sulla prima sessione, «in automatico» sulle successive; il
  tasto «Metti» resta per il ripiego a mano, col tooltip «ripiego a
  mano», e la coda del pannello spiega il gesto nuovo.

Verifica: wx-auto + race-card + layout-impostazioni → 23/23 verdi;
import nodali ok; server rientrato (riavvia-webui, nuovo PID) e
`/js/viste-a.js` servito col testo nuovo. I server webui erano nati
DOPO la scrittura di wx-auto.mjs e del suo aggancio: il bollettino
automatico era già attivo in gioco, solo non dichiarato in pagina.

### 3/11 — Il cap del miscuglio dai dati, non dal template (richiesta Mauro: «la GUI deve mostrare il restrictorMaxPct reale della classe»)

La riserva leggera dell'audit schede (il badge «N al cap 20%» delle
[serie a miscuglio](gui/js/viste-b.js#L367) scriveva il 20 nel template:
una classe con cap diverso l'avrebbe mentito) è scaricata:
- [src/stile-webui.mjs](src/stile-webui.mjs): ogni mazzo del pannello
  «Cinque campionati a miscuglio» ora porta `capPct`, letto da
  `cls.LIMITI_GIOCO.restrictorMaxPct` — gli STESSI limiti che clampa
  grid-calib e gridbuilder; fallback 20 solo per una classe senza
  limiti scritti.
- [gui/js/viste-b.js](gui/js/viste-b.js): il badge dice `al cap
  ${capPct}%` (en: `at ${capPct}% cap`) — niente più 20 inciso.

Verifica: probe di `stileOverview` con ladder
+ [grid-classes.json](data/grid-classes.json) veri → capPct=20 su
tutte e cinque le serie (il dato attuale è 20: il badge oggi si
legge uguale a prima, ma deriva); `node --check` ok, `biome check` pulita sui due
file; viste-guard + smoke → 7/7 verdi. Nota: il server vivo è
partito col modulo vecchio (import statico), quindi `api/stili`
porta `capPct` al prossimo rientro — il badge in mostra con le
classi attuali resta identico anche col vecchio payload.

### 3/11 — Banner del trim: la promessa ×5 tornata onesta (richiesta Mauro: «applica il fix del banner del trim»)

Il falso già diagnosticato (il banner della proposta in
[Difficoltà](gui/js/viste-a.js) prometteva «Accettare sposta anche la
banda EVO della serie di ×5 punti» quando la legge di casa dal 2/11
è 1 trim = 1 punto di banda) è riparato in entrambi i punti segnati:
- [gui/js/viste-a.js](gui/js/viste-a.js): il moltiplicatore del banner
della proposta è caduto da 5 a 1 — testo e traduzioni it/en invariati.
La cifra ora è quella che il server dispensa davvero
(`shift = (p.to - before) * 1` nel ramo accept,
[webui.mjs](src/webui.mjs#L3063)).
- [src/webui.mjs](src/webui.mjs): il commento del ramo accept dice ora
«+1 trim = +1 punto: legge del 2/11, il commento ×5 è morto» —
allineato col codice che dichiarava *1 da sempre.

Verifica: `node --check` ok su webui.mjs; `biome check` pulita su
[viste-a.js](gui/js/viste-a.js) e [webui.mjs](src/webui.mjs);
testo viste [test/viste-guard.test.mjs](test/viste-guard.test.mjs) +
smoke server [test/webui-smoke.test.mjs](test/webui-smoke.test.mjs)
→ 7/7 verdi. Grep di conferma: nessun altro «×5»/«5 punti» nel codice
(fuori che nel diario). Nota: il save vivo porta `difficulty.pending:
null`, quindi il banner non era mostrabile sul vivo in questo momento —
la promessa è verificata come espressione e contro la legge del server.

### 3/11 — Guard della semina dei cursori: la riga «↺» non si riempie (richiesta Mauro: «aggiungi una guardia che fallisce se la banda AI di una serie mostra un record vuoto riempito dal seeding»)

La legge del 2/11 nella semina dei cursori (il record VUOTO è una riga
tornata al consiglio, NON «senza impostazione») ora ha la sua sentinella.
Per poterla guardare, la semina è uscita dal blocco inline di
[webui.mjs](src/webui.mjs) che gira a ogni richiesta con carriera: vive
ora in `seminaRaceSettings(ladder, state)` in [src/state.mjs](src/state.mjs)
accanto a bandaSerieLadder e bandaSerieSlider — nessuna semantica
mutata, il server chiama la funzione al medesimo punto.

La guardia: [test/semina-race-settings.test.mjs](test/semina-race-settings.test.mjs),
6 test su ladder di PROVA con bande aiSerie DI PROPOSITO diverse da
84–85 (così se sulla riga appare 84–85 si SA che è venuto dal fisso, non
dal ladder):

- **il VUOTO non si riempie** — la riga «↺» resta a null dopo la semina:
  è la guardia della richiesta, il fisso [84, 85] NON risorge dal retro;
- il record ASSENTE nasce dalla banda del LADDER (aiSerie), mai dal fisso;
- il record MEZZO si completa solo sul cursore mancante, il valore
  dell'utente non si tocca;
- il ripiego [84, 85] sta SOLO sotto un ladder davvero senza aiSerie — e
  anche lì «↺» resta vuoto;
- idempotente: il server risemina a ogni richiesta, la seconda passata
  non muove niente;
- nel LADDER VERO del progetto ogni record nasce dalla SUA banda aiSerie.

Verifica: `node --test test/semina-race-settings.test.mjs` → 6/6 verdi;
webui-smoke 1/1 (il server parte con la semina estratta); `node --check`
sui due sorgenti; biome pulita sui tre file toccati (rimossa via anche
l'import di bandaSerieLadder dal server, ora inutile lì: la legge della
semina vive tutta in state.mjs).

#### 3/11 — Quarto tab nella guardia di layout: la Dashboard a 4 larghezze (richiesta Mauro: «estendi il guard di layout anche alla tab Setup e alla Dashboard»)

La guardia di [layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs)
sale a 16 misure (4 larghezze × 4 tab): il Setup era già dentro dal 3/11,
la Dashboard arriva col marcatore `#card-panel` (la racecard della
prossima gara — esiste SOLO nel Cruscotto) e l'attesa GENERICA di
stabilità: i riempimenti asincroni del tab sono tanti (card, paddock,
vita, eredità, verdetto) e la legge dei tetti li copre senza enumerarli.

- **Il primo morso a 360 è stato vero ma ha parlato di FIGURE**: 5
  segnalazioni nel Cruscotto, tutte con almeno un membro interno a un
  `<svg>` — i tratti (path/circle) delle icone kico/lico, che si
disegnano sovrapponendosi DENTRO la loro scatola di 22 px per
  costruzione, e il flagart decorativo dietro al testo (opacity .08,
  aria-hidden). Vista retta: nessuna sovrapposizione di testo;
- la terza lezione di misura vive in [test/_layout-probe.mjs](test/_layout-probe.mjs)
  accanto alle due del 3/11 (ritaglio overflow, righe inline):
  chi vive dentro un `<svg>` oppure fuori dalla lettura (aria-hidden)
  non è candidato; le misure degli altri tab restano tese.

Verifica: `node --test test/layout-impostazioni.test.mjs` → `ok`, 16/16
misure verdi (11 s); biome pulita sui due file; niente skip nuovo
(chromium era in gioco).

#### 3/11 — La sonda di layout incartata in un modulo condiviso (richiesta Mauro: «estrai la sonda di layout in un modulo condiviso per riusarla su altre viste»)

Il motore tecnico nato il 2/11 dentro
[test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs)
vive ora in [test/_layout-probe.mjs](test/_layout-probe.mjs), in fila
con i sandbox di casa (test/_flows-sandbox.mjs e simili). Tre pezzi:

- `assettaVista` — click via evaluate (la lezione del bottone sbagliato
  sotto la nav che si ridisegna) + attesa del marcatore della vista + i
  due frame dopo `document.fonts.ready`;
- gli arrivi asincroni — `assettaRiempimentiImpostazioni` (i tre
  riempimenti noti enumerati a mano) e `assettaStabilitaGenerica` (due
  impressioni a 300 ms identiche, tetto 15 s): le viste nuove senza
  marcatori dedicati usano la generica;
- `misuraSovrapposizioni` — il conto delle sovrapposizioni, con le due
  lezioni di misura incastonate (ritaglio degli oltre-overflow, righe
  vere `getClientRects` per gli inline multiriga) e il report leggibile
  `righeReport` condiviso.

Il modulo NON apre browser né server e non asserisce: chi chiama
porta la pagina pronta e decide cosa fare del risultato — la guardia
[layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs) resta
l'orchestrazione (server su porta sua, save COPIATO in cartella dati
temporanea, loop di larghezze e tab, assertion, pulizia) e si paga solo
gli investimenti in comune.

Verifica: ramo con ambiente (guardia al passo, chromium presente):
`node --test test/layout-impostazioni.test.mjs` → `ok`, 12/12 misure
passate (9 s), NESSUNA misura cambiata dal servizio; ramo skip
(simulato con `LOCALAPPDATA` vuoto) → `ok # SKIP chromium assente nella
cache di Playwright (…): scaricalo con npx playwright install chromium`
col perché nel TAP; `biome check` pulita sui due file; un solo cliente
al momento — le viste nuove della GUI si aggiungono alla costante `TAB`
della guardia col loro marcatore.

#### 3/11 — La pulizia del testo: «fallisce in silenzio» al posto delle frasi corrotte (richiesta Mauro: «Pulisci le stesse frasi corrotte «Falli silente» in webui.mjs righe 2341 e 2560» + «Aggiungi al diario la voce della pulizia del testo di cli.mjs (3/11)»)

Cinque commenti di casa parlavano un ITALIANO che non esiste: «Falli silente»,
«Errori silente», «Fallisce silente» — tentativi ammaccati di tradurre
*fail silently*, la lezione del try/catch che ingoia l'errore senza urlarlo.
Forma giusta incastonata in TUTTI e cinque: **«fallisce in silenzio»** —
il soggetto è l'operazione dentro il try, e la frase finalmente regge
senza perdere il senso.

Dove stava la lussazione:

- [src/webui.mjs](src/webui.mjs) — TRE frasi, non due: le righe indicate
  da Mauro (2341 e 2560) erano scivolate in avanti di 14 righe da quando
  erano state segnate, e la ricerca dietro ha fatto uscire anche la
  TERZA, stessa corruzione ma minuscola:
  - [webui.mjs:2355](src/webui.mjs#L2355) — la banda viva del tab
    Griglia («senza carriera (state assente) la GUI mostra solo il campo
    del file»);
  - [webui.mjs:2574](src/webui.mjs#L2574) — la ricostruzione della
    griglia al Prepara («un errore non blocca l'iscrizione — la card
    sotto resta il piano B»);
  - [webui.mjs:2588](src/webui.mjs#L2588) — la banda di serie del
    builder («senza banda voluta il builder resta su quella di prima»).
- [src/cli.mjs](src/cli.mjs) — DUE frasi, la stessa corruzione sotto
  altro nome:
  - [cli.mjs:693](src/cli.mjs#L693) — «Errori silente: non bloccano la
    ronda» → «Gli errori passano in silenzio: non bloccano la ronda»;
  - [cli.mjs:1307](src/cli.mjs#L1307) — «Fallisce silente: senza banda
    calcolata il builder resta sulla regola di prima» → «Fallisce in
    silenzio: …» (la stessa banda di serie che il Prepara dell'app porta
    dalla sera dell'1/11).

Verifica: `grep "silente" src/` → ZERO occorrenze rimaste; in cli.mjs
restano solo i «fallisci» veri (le sfide: «premio {R} € se ci riesci,
-{P} rep se fallisci») che sono italiano giusto e NON si toccano;
`npx biome lint src/cli.mjs src/webui.mjs` → 0 errori (l'unico warning,
gli import inutilizzati a webui.mjs:135, è preesistente: confermato col
bash del stash, era là anche prima). Nessun codice cambiato — SOLO
commenti, quindi niente suite da rigirare.

#### 3/11 — Guardia di layout alla QUINTA larghezza: 320 px sotto le altre, la lezione della sonda e la prova sul vivo (richiesta Mauro: «aggiungi la larghezza 320 px alla guardia di layout e verifica che non compaia nessuna sovrapposizione» + «aggiungi la voce del 3/11 al diario per la larghezza 320px, la lezione della sonda e la prova della guardia»)

**La quinta larghezza** entra SOTTO alle altre — 320 px, il regno del
telefono stretto e della finestra affiancata davvero piccola: 19 tab ×
**5 larghezze (320 · 360 · 480 · 1250 · 1920) = 95 misure**, verdi in 45
s, nessuna riga di `gui/` toccata.

**La lezione della sonda** (incastonata in [test/_layout-probe.mjs](test/_layout-probe.mjs)):
il primo morso a 320 era un FANTASMA di scorrimento, non un disegno — le
righe del calendario in Campionati toccavano la scatola del loro
contenitore scorrevole sporgendo SOTTO, dove il browser non disegna
nulla, e i rect fittizi infiltravano le sovrapposizioni con gli elementi
che seguono. La legge nuova di misura:

- ogni rettangolo si **MOZZA alla scatola del contenitore con clipping**
  (overflow auto/hidden/scroll), verticale E orizzontale: si misura SOLO
  la parte disegnata davvero;
- le **righe inline comprese**: per gli `display:inline` la misura usa le
  RIGHE vere (`getClientRects`, tetto 64), non l'unione che ingoia le righe
  vicine — la lezione del fantasma multiriga del 360;
- chi resta **interamente mozzato** scarta da solo sotto i 2 px: non è in
  vista, non si misura.

Stesso spirito dei details chiusi e delle figure (svg/aria-hidden): NON
in vista = NON candidato.

**La prova sul vivo che la guardia NOTA**: iniettata nel Cruscotto una
sovrapposizione finta a cavallo di un testo della racecard — la guardia
va ROSSA col perché nel messaggio dell'assert: `span.h-act ⟂ div · area
in comune 40×12 px + catena antenati`, e tolto il difetto (le stesse 3
righe di banchi azzerrate byte per byte) riparte VERDE 95/95. Sonda tab
singola di servizio `tmp/_sonda-tab.mjs` (a mano, non nella suite: il
difetto finto è un gesto di banco), poi finita nel pulito del tmp come
tutti gli attrezzi di banca.

Verifica: `node --test test/layout-impostazioni.test.mjs` → `ok`, 95/95
misure verdi (45 s); niente skip nuovo; biome pulita sul file di test;
la lezione sta tutta nella sonda condivisa, quindi ogni cliente nuovo
(eredita-bottone, fascie, ecc.) la porta gratis.

### 3/11 — Le corsie della guardia di layout a 4 o 5: la misurazione dice che non si guadagna (richiesta Mauro: «prova a portare le corsie della guardia di layout a 4 o 5 e misura se si guadagna ancora oppure il muro si sgombera»)

Le TRE corsie della guardia (treni di tab in parallelo alla
stessa larghezza) sono diventate una LEVA misurabile da fuori
(`EVO_LAYOUT_CORSIE` in test/layout-impostazioni.test.mjs, tetto 7,
per il banco: il default resta 3), così il banco può giocare senza toccare
codice per ogni passo. La misurazione, ogni passo verde (126/126):

| corsie | durata | esito |
|---|---|---|
| 3 (default) | 37,1 s da sola · 33,4 s dentro la suite | baseline della giornata |
| **4** | **32,5 s · 34,6 s (conferma)** | guadagno dentro il rumore (±2 s) |
| **5** | **37,7 s** | il rendimento torna INDIETRO |

La lettura: le attese in pagina sono timer, ma ogni pagina è un
processo-renderer e i reflow sono CPU — a 5 corsie i core della macchina
si saturano e la stabilità GENERICA (due impression a 300 ms identiche)
si trascina lunga. La consolazione: le 21 tab e le 126 misure restano
IDENTICHE al variare delle corsie; nessuna misura indebolita. Default 3
NON cambiato: con il guadagno dentro il rumore non si cambia la forma
collaudata.

Verifica: `EVO_LAYOUT_CORSIE=4/5 node --test test/layout-impostazioni.test.mjs`
→ `ok` SIA a 4 CHE a 5, con conferma a 4; biome pulita sul file di test;
nessuna riga della sonda o della GUI toccata.

### 3/11 — Guardia di layout alla SESTA larghezza: 256 px come limite estremo (richiesta Mauro: «aggiungi una larghezza 256 px alla guardia di layout come limite estremo e verifica che non compaiano sovrapposizioni»)

**La sesta larghezza** entra SOTTO alle 320 — 256 px, il limbo dei
pannelli laterali annidati e delle finestre strappate a quattro
affiancate: 21 tab × **6 larghezze (256 · 320 · 360 · 480 · 1250 · 1920)
= 126 misure**, verdi in 37 s.

Questa volta la guardia beccava un difetto vero alla prima corda: a 256
px il tab **Garage** sbordava 21 px a destra — le card del garage
(`#g-grid` in [viste-c.js](gui/js/viste-c.js)) nascono da una griglia
`minmax(240px,1fr)` e sotto i 240 px di contenitore `auto-fill` tiene la
colonna a 240: la card usciva dalla viewport (scatola misurata
[37 → 277] a viewport 256). Curata col pattern standard
`minmax(min(240px,100%),1fr)`: alla larghezza normale è lo stesso
tracciato, sotto la colonna si stringe col contenitore invece di
sbordare.

Verifica: il primo giro della guardia resta ROSSO col perché
(`a 256px il tab Garage ha 2 pannello/i fuori viewport · #g-grid <
div.panel < #main`); dopo la cura → `node --test
test/layout-impostazioni.test.mjs` → `ok`, **126/126 misure verdi
(37 s)**, zero sovrapposizioni e zero pannelli fuori viewport su tutte
le sei larghezze; le altre 20 viste passano a 256 al primo colpo.
Commento in testa al file di test aggiornato (SESTA
LARGHEZZA, 126 misure) e spunta standard di COMANDI-BUFFY aggiornata
(6 larghezze, 126 misure).

### 3/11 — Prova a rottura del TERZO STEP: sbordatura finta nella Griglia, rosso col perché, poi torna indietro (richiesta Mauro: «colpisci la guardia sul vivo: inietta una sbordatura finta in un pannello della Griglia e verifica che il terzo step vada rosso col perché, poi torna indietro»)

Banco della fuga in tmp/_sonda-fuga-griglia.mjs, come la _sonda-tab del 320 (gesto di banco, NON in suite): la fuga viene beccata nel suo habitat naturale, con gli stessi muscoli della guardia (importa `misuraPanelliFuoriViewport` da test/_layout-probe.mjs, non una copia).

- **partenza sana**: vista Griglia pulita a 320 px → 0 fughe (la guardia deve già dirlo);
- **l'iniet**: il primo .panel di #main allargato di 40 px oltre la viewport con `width: calc(100% + 40px)` — nessun antenato col clipping orizzontale (il caso garage/256 provava che i .panel di #main scavalcano il margine), quindi la sbordatura arriva davvero alla viewport e supera i 2 px di tolleranza: la legge «contenuto in contenuto: sano» non la può lasciare passare;
- **il rosso col perché**: il terzo step (`misuraPanelliFuoriViewport`) stampa la riga della guardia — `div («🏁 Griglia 18 celle…») sborda 24 px a destra (viewport 320px · scatola [16 → 344]) ↳ #main < #shell` — chi sborda, di quanto, la scatola e la catena antenati, già leggibile da solo;
- **coerente col resto**: lo step delle sovrapposizioni resta SILENTE durante la fuga (0 sovrapposizioni): la sbordatura non è un cinghio fra due testi, e i due scala non parlano l'un per l'altro;
- **tornando indietro**: levato l'iniet la misura riparte verde (0 fughe), e un RELOAD a vuoto conferma che l'ambiente è tornato com'era — l'iniet viveva SOLO nel DOM della pagina del banco, nessun file della GUI toccato; la lezione del banco: dopo il reload il boot ridisegna la nav, quindi si aspetta PRIMA la nav (il click via ?. sul bottone assente è no-op e la vista non arriva mai — il primo morso del banco diceva timeout);
- **chiusura di legge**: la guardia intera riparte 126/126 (33 s, exit 0).

Verifica: `node tmp/_sonda-fuga-griglia.mjs` → exit 0 con tutto il corteo; `node --test test/layout-impostazioni.test.mjs` → ok 126/126 (33 s). Nessun file `gui/` toccato.

### 3/11 — Guardia di layout: senza ambiente si salta, non si sbaglia
(richiesta Mauro: «nella CI del comando check esegui il guard della GUI
solo se il chromium è presente, altrimenti il test resta verde ma dice
il perché»)

I tre PRESUPPOSTI del guard di layout
([test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs))
— `playwright-core` installato, `chromium` nella cache di Playwright,
carriera sul disco — erano ASSERT rossi: su un PC vergine o in una CI
pulita (il save è gitignored, quindi in un checkout fresco non c'è)
la guardia sarebbe finita ROSSA senza che ci fosse codice da guardare.
Ora sono tre `t.skip()` dichiarati, ognuno col suo perché nel messaggio
(stessa legge dello skip onesto di
[test/uiapp-installata.test.mjs](test/uiapp-installata.test.mjs)):
verde che spiega, non rosso che finge.

Verifica, coi TRE log del collaudo in `tmp/` (3/11 pomeriggio: ognuno
esegue il test VERO, non uno stub — il ramo che si vuole provare è
l'unico che manca):
- **ramo con chromium presente**:
  `node --test test/layout-impostazioni.test.mjs` → `ok`, 1/1, 41,5 s,
  126 misure (6 larghezze × 21 tab): nessuna misura indebolita;
- **ramo senza `playwright-core`**: radice TEMPORANEA con `node_modules`
  VUOTA e test + sonda + aiutante copiati dentro → `ok # SKIP manca
  playwright-core: «npm install» e la guardia riparte`, `# pass 0`,
  `# fail 0`, `# skipped 1`, exit 0 →
  [tmp/collau-skip-playwright.log](tmp/collau-skip-playwright.log);
- **ramo senza chromium**: `LOCALAPPDATA` puntato a una cartella vuota,
  tutto il resto vero → `ok # SKIP chromium assente nella cache di
  Playwright (…\ms-playwright): scaricalo con «npx playwright install
  chromium»`, `# pass 0`, `# fail 0`, `# skipped 1`, exit 0 →
  [tmp/collau-skip-chromium.log](tmp/collau-skip-chromium.log);
- **ramo senza save**: radice TEMPORANEA incompleta DI PROPOSITO (test +
  sonda + aiutante copiati, `node_modules/playwright-core` in giunzione
  col progetto così il primo presupposto passa, chromium dalla cache
  globale così passa anche il secondo) e `data/evo-career.save.json`
  MANCA → `ok # SKIP la tab Impostazioni si apre solo con una carriera
  (niente onboarding): manca il save …\data\evo-career.save.json`,
  `# pass 0`, `# fail 0`, `# skipped 1`, exit 0 →
  [tmp/collau-skip-save.log](tmp/collau-skip-save.log).

Sui tre presupposti rimane la stessa legge: verde che spiega, non rosso
che finge. Il save vero non si è toccato — nel ramo del save la radice è
temporanea, e negli altri due la guardia si ferma al primo skip, PRIMA di
aprire server e browser (nessuna porta occupata, nessun processo lasciato
in giro).

Biome pulita sul file; `node --check` ok.

### 3/11 sera — Guardia di layout su tutta la nav: prova del vivo (19 tab, 76 misure, 36 s, verde)
(richiesta Mauro: «annota nel diario la prova del vivo di stasera della guardia 19 tab»)

La stesa «tutti i tab» della guardia
([test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs) —
la storia dei marcatori #mx-posta Messaggi, #rv-registro Rivali,
#ch-carica Campionati e #bn-libro Finanze sta nei commenti in testa al
file) ha portato le misure su TUTTA la nav: 19 tab (Dashboard → Analisi)
× 4 larghezze (360 · 480 · 1250 · 1920) = 76 misure in una suite sola,
col tetto di 15 s della stabilità GENERICA per i tab senza riempimenti noti.

Prova del vivo di stasera: `node --test test/layout-impostazioni.test.mjs`
→ `ok`, 76/76 misure verdi in 36 s — nessuna sovrapposizione e nessun
pannello fuori viewport su ogni tab e su ogni larghezza, con chromium in
gioco. Nessuna misura indebolita, niente skip nuovo.

**Aggiornamento (3/11, più tardi — la voce qui sopra resta com'era: racconta il fatto di quella sera, non la guardia di adesso)**: i 76 sono 4 larghezze (360 · 480 · 1250 · 1920) × 19 tab. Nella stessa giornata è arrivata la quinta larghezza, 320 px, e le misure sono diventate **95** (5 × 19, verdi in 45 s; voce «Guardia di layout alla QUINTA larghezza: 320 px sotto le altre», più sopra); da lì la stesa è cresciuta ancora — 21 tab con Calendario e Classifica Mondiale (105), poi la sesta larghezza 256 px — fino alle **126 misure** della guardia di oggi. Chi cerca il numero corrente non lo trovi qui: questo paragrafo è la fotografia di un'ora precisa.

### 3/11 — Guardia di layout: Impostazioni anche a 360 px, e i tab Setup e Analisi nella stessa misura (richiesta Mauro: «stessa guardia a Impostazioni: terza larghezza 360 px (schermo piccolo) e ai tab Setup e Analisi»)

La guardia di layout di [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs)
(nata 2/11, voce «Guardia di layout» più sotto) sorveglia ora 12 misure
invece di 3: 4 larghezze (360 · 480 · 1250 · 1920) × 3 tab (Impostazioni ·
Setup · Analisi). I due tab nuovi tienen il SUO marcatore di vista
(`#psi-panel` il Setup, `#an-tetto` l'Analisi — esistono solo in quella
vista, come `#agg-status` nelle Impostazioni), e al posto dei tre
riempimenti asincroni di Impostazioni (agg-info/savebk/import-log)
enumerati a mano usano un'attesa GENERICA di stabilità della geometria:
due impressioni a 300 ms identiche (rettangolo di ogni nodo di #main) o
15 s di tetto, poi si misura comunque — il momento della misura non
indebolisce l'assert.

- **La prova a 360 ha morso davvero**: 2 sovrapposizioni nel pannello
  «Salute sistema» del Setup (`b ⟂ span.muted`, `span.tag ⟂ span.muted`,
  in `#system-health`);
- **ma erano un fantasma dell'unione dei rettangoli, non un disegno**: la
  riga «Processo PowerShell: …» è testo inline; la nota lunga va a capo a
  360px e il suo `getBoundingClientRect` è l'UNIONE delle righe — copre la
  riga sopra (dove stanno l'etichetta e il tag di stato) e la coppia
  risulta sovrapposta senza che si siano mai disegnati insieme. Rimsa
  come serve: per gli `display:inline` la misura usa le RIGHE vere
  (getClientRects, tetto 64) invece dell'unione — il text flow non si
  sovrappone da solo, quindi il falso positivo resta fuori senza
  indebolire il caso vero della guardia (flex/grid/absolute, che
  mantengono il rettangolo intero).
- **La guardia vive**: era il primo morso geometrico della guardia da
  quando esiste (2/11); con le righe inline giuste le 12 misure passano
  pulite.

Verifica: [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs)
1/1 verde (12/12 misure, 9 s); biome pulita sul file (provato anche il
warning preesistente della catena `document.fonts`, che è stato cambiato
a catena opzionale — stessa semantica, stesso "suono"); node --check;
nessun file della GUI toccato (la segnalazione era un fantasma di misura,
non un difetto di vista).

### 3/11 — Guardia di layout nel comando check: la spunta standard la porta già dentro

Richiesta Mauro: «collega la guardia di layout alla spunta standard del
comando check nella CI». Il collegamento si è dimostrato in due passi.

1. **Scoperta col glob**: `npm test` esegue `node --test
   test/*.test.mjs`, e il glob trova da solo la guardia
   [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs) —
   nel TAP della suite completa: `ok 412 - tutti i 19 tab della GUI:
   niente sovrapposizioni né pannelli fuori viewport a 320, 360, 480,
   1250 e 1920` (19 tab × 5 larghezze = 95 misure; log
   [tmp/check-gui-scoperta.log](tmp/check-gui-scoperta.log)).
2. **Prova del comando intero**: `npm run check` (= `npm test && npm run
   lint`, [package.json](package.json)) → exit 0, `# tests 888`, `# pass
   888`, `# fail 0` con la guardia dentro, e Biome senza errori — i 5
   warning restati sono tutti preesistenti e documentati
   ([gui/js/core.js:488](gui/js/core.js#L488),
   [src/webui.mjs:135](src/webui.mjs#L135),
   [test/ab-avviso-giro.test.mjs:44](test/ab-avviso-giro.test.mjs#L44) ×2,
   il `mirrorJournal` inutilizzato in
   [test/journal-nostro.test.mjs:32](test/journal-nostro.test.mjs#L32) —
   importato e mai usato nel corpo dei test, preesistente al turno di
   oggi;
   log [tmp/check-collegamento.log](tmp/check-collegamento.log)).

Da qui in poi la spunta standard della guardia di layout in
[COMANDI-BUFFY.md](COMANDI-BUFFY.md) è il comando intero `npm run check`:
sta già dentro la CI, e si gira per intero prima di dichiarare concluso
un lavoro sulle viste della GUI (durante il collaudo di una vista singola
vale ancora il `node --test` del solo file — poi si deve rientrare nel
check completo). Su un PC senza chromium o senza il save la suite NON
fallisce: resta `ok` con `# skipped 1` e il perché nel TAP («scaricalo
con npx playwright install chromium», «manca il save …») — la voce
«senza ambiente si salta» di questa stessa giornata per la forma dello
skip; il check resta verde anche in CI vergine.

### 3/11 — La guardia di layout copre anche i tab nascosti: 21 tab (richiesta Mauro: «estendi la guardia di layout al tab nascosto Calendario e alla Classifica Mondiale, dandogli un marcatore di vista ciascuno»)

Le due viste senza bottone nel nav — `standings` (Classifica Mondiale) e
`calendar` (Calendario Stagionale) — esistono già in `render()`
([gui/js/viste-b.js](gui/js/viste-b.js): `standings` → `drawWorldRanking`,
`calendar` → `drawCalendar`) ma **non avevano né una voce nav né un
marcatore**, quindi erano le uniche che la guardia di layout non guardava:
una sovrapposizione lì non l'avrebbe mai vista nessuno finché non si
arriva al tab da codice. La TAB della guardia sale 19 → **21**, e le
misurano come le altre.

- **Marcatori nuovi** in [gui/js/viste-b.js](gui/js/viste-b.js):
  `#wr-panel` sul PANEL Solo di `drawWorldRanking` (non sull'`h2`, che
  vive in `worldRankingInner` riciclato anche da Campionati, quindi il
  marcatore andava lì fuori), `#cal-panel` sul panel di
  `drawCalendar`;
- **Sonda** [test/_layout-probe.mjs](test/_layout-probe.mjs): leva nuova
  `nascosto: true` in `assettaVista` — al posto del click nav valuta
  `tab='…'; render()` via `evaluate`: è la stessa leva dei click reali,
  per le viste assegnano la globale `tab` a quel modo
  (`viste-a.js`, riga 356);
- **Guardia** [test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs):
  TAB 19 → 21 con i due flag `nascosto: true`, misure totali **95 → 105**
  (21 tab × 5 larghezze), commento di testa aggiornato (21 tab, 105
  misure, marcatori nuovi).

**Prova del vivo**: `node --test test/layout-impostazioni.test.mjs` →
`ok 1`, 21 tab (19 nav + 2 nascosti), 0 sovrapposizioni over 105 misure,
28 s ([tmp/layout-21tab.log](tmp/layout-21tab.log)). Poi la legge di
casa, il comando check completo prima di dichiarare il lavoro concluso:
`npm run check` → exit 0, suite **888/888** con la guardia nel glob
(`ok 412` col nome nuovo «19 nav + 2 nascosti»), Biome 0 errori e gli
stessi 5 warning preesistenti
([tmp/check-collegamento.log](tmp/check-collegamento.log)).
Spunta in [COMANDI-BUFFY.md](COMANDI-BUFFY.md) aggiornata (19→21 tab,
95→105 misure).

### 3/11 — Le app leggono il SUCCESSO della build: firma BUILD_OK + generatore severo (richiesta Mauro)
Finora il generatore `tools/genera-uiapp.mjs` scriveva il numero e bastava:
un `.js` costruito a mano o un vecchio mai rigenerato girava in gioco senza
che niente lo dicesse. Ora il segnaposto riceve DUE cose — la costante
`PERIODO_MS` e la firma `const BUILD_OK = true` — e le app la LEGGono:
all'avvio logano «build ok: PERIODO_MS=… ms dal publisher», o l'avviso
«firma BUILD_OK assente» se il file non è prodotto dalla build.

- [tools/genera-uiapp.mjs](tools/genera-uiapp.mjs): la sostituzione scrive
  le due dichiarazioni; dopo la scrittura il file sul disco viene RILETTO e
  sorvegliato — segnaposto residuo o firma mancante = uscita 1 (mai un .js
  a metà segnalato come riuscito);
- [uiapp/cruscotto/cruscotto.src.js](uiapp/cruscotto/cruscotto.src.js) e
  [uiapp/pitwall/pitwall.src.js](uiapp/pitwall/pitwall.src.js): dopo `loga`
  la lettura della firma (ok/avviso), i costruiti rigenerati e reinstallati
  nel gioco con gli installatori.

Verifica: generatore verde con la firma (exit 0); prova del contrario con
segno rimosso a una sagoma (backup/ripristino) = errore «trovate 0» ed
"uscita 1"; i test di legge del ritmo [test/uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs)
e [test/uiapp-pub-guard.test.mjs](test/uiapp-pub-guard.test.mjs) 9/9 verdi;
firma `BUILD_OK` confermata dai grep nelle copie installate di entrambe.

### 3/11 — Soprannomi in blocco: il bottone non era agganciato (richiesta Mauro: «non funziona»)
Il difetto è semplice e imbarazzante: il bottone 📝 «Soprannomi in blocco»
nei «Tutti i rivali» si vedeva, la funzione `bulkRinomina` c'era (dichiarata
27/10 e completa: ricerca, caselle, «Salva tutti»), ma NESSUN aggancio la
chiamava — il click non faceva niente.

- [gui/js/viste-d.js](gui/js/viste-d.js) — il binding mancava: dopo quelli
  delle righe (clic riga, ✏️ per pilota) entra `$('#b-bulk-rn', m).onclick =
  () => bulkRinomina(rows)`; dalla GUI serve un refresh di pagina;
- [test/viste-guard.test.mjs](test/viste-guard.test.mjs) — la guardia delle
  viste non lo vedeva (copre solo le draw*): entra un collega in più, ogni
  BOTTONE id="b-…" del gui DEVE avere un aggancio (selettore '#id' oppure
  l'id come argomento di un helper, come `manutenzione('b-maint-board')`).

Verifica: viste-guard 5/5 verdi (guardia nuova che scatta SOLO sui bottoni,
per non falsare i pannelli-container); node --check e biome puliti.

### 3/11 — Tetto teorico: il margine 0,00 era falso per costruzione — rimosso (richiesta Mauro: «controlla il margine a 0.00»)
La verifica accende la luce: all'endpoint `tetto` TUTTE le 14 piste hanno
`marginBestMs` e `marginLastMs` = 0. Non è una misura,
è una costruzione: nei file risultato VERI (261029-1055 ecc.) EVO scrive nelle
splits i settori del GIRO MIGLIORE — la somma è `best_lap` alla centesima —
quindi il «giro teorico = somma dei tuoi best settori» è SEMPRE il giro
reale e il margine best − teorico è 0 per definizione. Solo con i settori
temporali giro-per-giro (MoTeC .ld) si potrebbe misurare davvero.

- [src/analisi.mjs](src/analisi.mjs) — tettoReport: fuori i campi morti
  (`bestLapMs`/`theoreticalMs`/`marginMs` dalla riga, `marginBestMs`/
  `marginLastMs` per pista); nota nel documento che spiega il perché; l'hint
  (stato vuoto) dice l'onestà: ciò che si misura resta il delta sul campione
  top per settore — conferma che il cambio colonne di ieri aveva
  individuato i valori giusti del server; l'unico tocco è togliere i
  campi morti dal calcolo, la GUI non cambia;
- [test/analisi.test.mjs](test/analisi.test.mjs) — il test del Tetto ora
  asserisce che i campi del margine NON ci sono più (undefined) e tiene
  le asserzioni vere (campTopDeltaMs, mediana bassa S1, peggiori carriera),
  titolo aggiornato a «delta sul campione top e settore peggiore».

Verifica: analisi.test.mjs 19/19 verdi, node --check e biome puliti sui due
file toccati. Il «Giro teorico» nel rapporto gara (rapporto-gara.mjs) segue
la stessa legge del file (teorico ≡ best) — resta com'è, ma è la stessa
limitazione della fonte, raccontata qui.

### 3/11 — Bollettino in AUTOMATICO: il «Metti» non si preme più (richiesta Mauro: «automatico senza l'intervento Metti»)

Il bollettino del weekend garantiva il cielo di OGNI sessione, ma a
mano: prima di entrare, si cliccava «Metti». Ora il cielo si sistema
solo: il TRIGGER è il file Risultati che EVO chiude a fine di ogni
sessione del weekend vero (`<aaaammgg-hhmmss>_SP_<Sessione>.sessionresults.json`)
— sessione finita → si scrive il meteo della sessione SUCCESSIVA del
piano, sempre a modo di EVO (che legge il preset del selettore a ogni
avvio sessione) quando l'utente clicca «entra».

- **Nuovo modulo [src/wx-auto.mjs](src/wx-auto.mjs)**: `wxAutoTick(paths, costruisciPiano)`.
  Garanzie: si scrive SOLO meteo del piano (weatherPlan della card, la
  STESSA fonte del «Metti», sempre con `previsto: true`), SOLO se la
  pista del Risultati combacia con quella della ronda (stessa regola del
  ponte qualifica→gara), UN file = UNA scrittura (impronta mtime a
  memoria). Gare veloci / hotlap / piste diverse non toccano nulla; dopo
  la Gara si tace; i Risultati nati prima del boot non innescano niente.
  La PRIMA practice resta a mano (nessun Risultati ancora: il «Metti»
  copre; dalla sessione 2 in poi cielo da solo).
- **Aggancio nel battito** ([src/webui.mjs](src/webui.mjs), dentro
  `watcherTick`, flag `wxBusy` proprio, try/catch con recordWarning):
  `costruisciPiano()` viene eseguito SOLO quando sul disco c'è un
  Risultati fresco — niente viewCard a ogni tick.
- **Il tasto «Metti» diventa come l'automazione**: il case `wx-session`
  ora passa `previsto: true` (il numero è sempre quello del piano, la
  guardia resta tesa per le scelte a mano fuori test-mode).

Verifica: test nuovo [test/wx-auto.test.mjs](test/wx-auto.test.mjs) 9/9
(trigger, idempotenza, hotlap fuori piano, pista sbagliata, fine piano,
preistoria, Rotto, già a posto); weather-preset + cancelli-anticheat
17/17; webui-smoke verde; node --check sui due file toccati.

### 2/11 — Analisi, Tetto teorico: colonne morte sostituite dal delta sul campione top (richiesta Mauro: «nascondi Margine migliore e Ultimo margine, tengo solo campagne con valori veri» e poi «sostituiscile col delta sul campione top già calcolato dal server»)

Le due colonne erano MORTI di nascita: «Margine migliore» mescolava le
marginalità di gare di serie/auto diverse (margine non confrontabile) e
«Ultimo margine» non era l'ultimo in ordine di tempo ma l'ultimo a caso
dell'ordine di Object.entries(state.results). Ora (gui/js/viste-analisi.js,
renderTetto):

- le due colonne escono; entra UNA colonna «Delta sul campione top» che
  legge campTopDeltaMs già calcolato dal server in tettoReport
  (src/analisi.mjs: la busta più grossa del riparto su quella pista —
  testata in test/analisi.test.mjs con 400 ms su Monza S2); la didascalia
  della testata spiega le due grandezze;
- righe mostrate: SOLE le campagne con valori VERI (worstSectorDeltaMs
  diverso da null = riparto settoriale reale); le piste senza settori
  incassati restano fuori con il CONTO (riga muta sotto la tabella);
- la prima incisione aveva lasciato una riga difforme nel template
  literal (un IIFE impastato dentro tr()): sistemata a mano — node --check
  pulito dopo.

Il server (tettoReport) NON cambia: marginBestMs/marginLastMs restano
nella risposta e i loro test continuano a valere; è solo la vista che non
li mostra più.

Verifica: node --check su viste-analisi.js, biome pulito. La guardia di
layout non copre l'Analisi (sorveglia il tab Impostazioni).

### 2/11 — Backup completo rigenerato: 208 commit coperti (richiesto dall'avviso dell'avvio)

L'avvio diceva verità: l'ultimo zip era del 24/10 e 208 commit di
storia non erano coperti. Nessuno script del progetto GENERAVA lo zip
(magazzino copia solo); scritto adesso [tmp/_crea-backup.ps1](tmp/_crea-backup.ps1)
riusabile: robocopy di tutto il progetto (fuori node_modules/dist/tmp/log
bak) + zip con bsdtar, e CONTROLLO VIVO del save, del .git/HEAD e delle
istruzioni PRIMA di chiudere lo zip (al primo giro il save della
carriera era rimasto fuori: ora lo script lo verifica prima di zippare).
Generato dist/CarrieraEVO-backup-completo-2026-11-01.zip (97 MB, 4.576
voci, impronta a3ee42f0…) con .git, data/, mappe KUNOS e
COME-RIPRISTINARE.txt; poi magazzino su L: aggiornato (copia verificata
per impronta) e magazzino-check ora verde: storia coperta, off-site
allineata, 0 giorni di vecchiaia. Il prossimo backup = ri-eseguire lo
script.

### 2/11 — Verifica dal vivo del tag «da riscrivere» (richiesta Mauro)

Collaudo vero, non schema sul foglio: campo AI del customgrid portato a
mano da 84–85 a 80–81 via grid-ai (backup bak-apply-…11-34-20, EVO
echiuso). GUI aperta nel browser, tab Griglia: la riga «Banda attiva
deì cursori del weekend: 84–85» porta la tag gialla «da riscrivere
(Prepara · «allinea al campo»)» subito dopo la scrittura. Poi
riallineato allo stato di partenza (84–85, tag verde «allineata al
campo» tornata) risultato: file 84–85, banda [84,85] — il tavolo è
ricominciato come l'avevo trovato.

### 2/11 — Scheda Gara: la banda viva dei cursori è visibile accanto a DIFFICOLTÀ AI (richiesta Mauro)

La scheda leggeva già il numero dai cursori (raceSettings), ma lo
etichettava "di serie" senza dirlo: chi muoveva il trim nel pannello
Difficoltà vedeva una riga senza la sua firma. Ora nel riquadro
«Regole di questo weekend» accanto al grezzo 84–85% ci sono la tag
verde «banda viva dei cursori» e la tag gialla «trim +N» quando è
attivo ([gui/js/viste-a.js](gui/js/viste-a.js)); nel riquadro dati
preparazione la riga diventa «84–85% — trim +N» quando il trim è vivo.
Solo GUI: la fonte resta raceSettings, nessuna modifica al server.

### 2/11 — Griglia: bottone «allinea al campo» (richiesta Mauro: «riscrive il campo AI con la banda viva dei cursori in un clic»)

Il tab Griglia mostrava già i DUE REGISTRI (campo AI del file e banda
viva dei cursori) con il tag «da riscrivere (Prepara)» — ma per
allinearli da GUI serviva copiare i due numeri a mano dentro «Imposta
intervallo AI». Ora c'è il bottone «Allinea al campo», accanto a
quello ([gui/js/viste-griglia.js](gui/js/viste-griglia.js)): chiama
l'azione `grid-ai` già esistente passando la banda di `data.bandaSerie`
che il server calcola con bandaSerieSlider. Zero numeri da battere,
stesso percorso di sempre: backup e guardia «EVO chiuso» inclusi.
Resta spento quando il campo del file è già allineato (tag verde),
perché allineare due volte non serve a niente.

### 2/11 — Difficoltà: la banda di serie vive nel ladder, non nel codice (richiesta Mauro: «scrivi la banda di serie nel ladder alla prossima release, copri i nodi con l'84–85 attuale»)

Il default 84–85 era inciso come fisso in codice (webui.mjs, ripiego per
serie senza banda) e finché il ladder non conosceva la banda di serie il
ripiego restava «preistorico» alla lettera: le gare dei ladder futuri
avrebbero ripartito la banda da quello di ieri, non da quello scritto
nella release che li genera. Ora:

- [tools/evo-grid.mjs](tools/evo-grid.mjs) scrive `aiSerie: [84, 85]` su
  ogni nodo del ladder alla release (helper `bandaSerieLadder`):
  la prossima uscita nasce già coperta;
- [src/webui.mjs](src/webui.mjs) legge l'`aiSerie` del ladder per default
  e per le mezze righe, con `?? [84, 85]` SOLO per un ladder vecchio
  effettivamente senza campi — il valore non è mai inciso;
- [src/state.mjs](src/state.mjs) e [src/gridbuilder.mjs](src/gridbuilder.mjs)
  convaliano il formato (pick `84, 85` con banda 1 punto);
- il ladder VIVO di oggi ([config/career.evo.ladder.json](config/career.evo.ladder.json))
  è scritto a mano 86/86 con lo stesso stile del builder, così anche le
  serie sopra restano coperte, senza ripiego preistorico.

Verifica: test banda serie 9/9 verdi (ladder finto senza aiSerie, pick
di `aiSerie` con banda a 1 punto), suite intera 719/719, biome pulito
sui 4 file toccati.

### 2/11 — Dal vivo: muovere il trim segue il Prepara in tempo reale (richiesta Mauro: «verifica dal vivo che muovendo il trim la banda scritta dal Prepara segue subito»)

Prova completa con il server vivo (0.1.47, rientro con tools/riavvia-webui.mjs):
serie viva Coppa Peugeot 205 T16 · Suzuka R2. Quattro passaggi, andata e ritorno:

- PANNELLO: API difficulty-action (op trim), la STESSA chiamata dei
  pulsanti ±1 della riga — trim da 0 a +1: la riga del pannello passa da
  84–85 a 85–86 NELLA STESSA risposta (la banda vive nei cursori del
  record, col +1 scritto al volo).
- PREPARA: il flusso del tasto, via CLI griglia (legge e scrive lo stesso
  salvataggio del server). Dry-run con trim +1: `abilità 85-86 (banda di
  serie (cursori))`. Scrittura vera: il customgrid di EVO porta aiMin/aiMax
  (campi 21/22) 85–86 — letti da file con gridFileOf di evo-grid.mjs.
- RITORNO: trim a 0 via API, pannello torna 84–85.
- Chiusura: nuovo flusso del Prepara — il customgrid torna 84–85, esattamente
  al punto di partenza.

Effetti collaterali veri: due voci di posta nel mailbox («Difficoltà
regolata a mano») e due backup nuova-faccia del customgrid (pruning
del solito); il save di carriera resta una parola: trim 0 come prima.

### 2/11 — Difficoltà: «↺» torna davvero al consiglio calcolato (richiesta Mauro: «che ↺ riporti la banda al consiglio calcolato invece del default fisso 84–85»)

Il «↺» sembrava giusto a primo colpo d'occhio: cancellava l'override
(state.raceSettings) e riscriveva nei cursori del gioco il consiglio di
difficultyFor. Era il RENDER dopo che lo tradiva: a capo di OGNI chiamata
API (webui.mjs, api()) un setting automatico riempiva le serie senza
cursori col fisso 84–85 — e il record VUOTO lasciato dal clear veniva
preso per «senza impostazione»: al primo trascinamento o al primo
aggiornamento il default tornava a galla. Il consiglio reggeva un render
solo.

Ora ([src/webui.mjs](src/webui.mjs)):

- il seeding salta le righe senza cursori: un record vuoto È una riga
  tornata al consiglio, non un valore mancante. Il fisso 84–85 resta solo
  per le serie che non hanno MAI avuto una banda;
- nuovo helper consiglioBand(ladder, state, nodeId): la banda del consiglio
  è [slider, slider+1] calcolata ADESSO da difficultyFor, non un fisso;
- trim e suggerimento accettato su una riga al consiglio scrivono la banda
  del consiglio RICALCOLATO col nuovo trim — niente shift doppio (il
  consiglio già parla col trim); sulle righe con cursori veri resta lo
  storico «1 punto di trim = 1 punto di banda», col vecchio fallback 84–85
  (ed 88–89) ora rimosso;
- testi in [gui/js/viste-d.js](gui/js/viste-d.js) aggiornati: niente più
  «centro ±5» (testo d'era vecchio), il ↺ dice banda di 1 punto
  [consiglio, consiglio+1] scritta anche nei cursori del gioco.

Nuova guardia ([test/clear-consiglio.test.mjs](test/clear-consiglio.test.mjs),
porta 8737, carriera finta in tmpdir): override 90–91 sulla prima serie,
poi «↺», poi UNA LETTURA IN PIÙ — il difetto riportava il fisso 84–85 qui;
l'altro prova il trim su riga al consiglio (consiglio post-trim, non
84+shift). Il consiglio atteso è ricalcolato nel test con lo STESSO import
del server (difficultyFor), così se i due divergono non si nasconde
dietro un numero diverso.

Verifica: test 2/2 verdi, biome pulito su webui.mjs, viste-d.js e il test.

### 2/11 — Impostazioni: la colonna destra è un riquadro unico «Manutenzione» (richiesta Mauro: «accorpa i pannelli della colonna destra in un riquadro unico, così le due colonne finiscono più vicino»)

La colonna destra era un solo pannello intitolato «Pilota» ma con CINQUE
intestazioni h2 interne che sembravano pannelli separati, ciascuna con
22 px in più di margine. Ora ([gui/js/viste-d.js](gui/js/viste-d.js)):

- il riquadro si chiama «Manutenzione» (era «Pilota»: sbagliato, lì dentro
  sta tutto ciò che cura il save, non solo il nome del pilota);
- le sezioni interne scendono a h3 con una nuova regola compatta in
  [gui/style.css](gui/style.css) (10,5 px, margine 16/8): Registro
  import, Carriera, Backup del save di EVO, Verifica integrità;
- la quinta («Manutenzione», identica al titolo del riquadro) si
  chiama «Riparazioni e pulizie»;
- a schermo le due colonne finiscono più vicine: niente intestazione
  doppione e margini più stretti fra le sezioni (stima di ordine ~80 px,
  non misurata al pixel).

La GUARDIA DI LAYOUT di quest'ora sorvegliava il cambio: tab
Impostazioni ancora senza sovrapposizioni a 480/1250/1920.

Verifica: biome pulito su viste-d.js e style.css, guardia commenti +
guardia layout 3/3 verdi.

### 2/11 — Guardia di layout: sovrapposizioni del tab Impostazioni a 480/1250/1920 (richiesta Mauro: «test che misura le sovrapposizioni e falla fallire se qualcuna ritorna»)

Prima nessun test guardava la GEOMETRIA: DOM e CSS statici non dicono se a
schermo piccolo un bottone finisce sopra un campo — lo decide solo un
browser vero. Il test nuovo ([test/layout-impostazioni.test.mjs](test/layout-impostazioni.test.mjs)):

- server della GUI su porta 8736 con cartella dati TEMPORANEA: il save
  slot 1 è una copia, il watcher relegato lì; il save vero non si tocca.
- Chromium (v148, già nella cache di Playwright del PC — zero download)
  guidato da `playwright-core` (devDependency nuova): apre la GUI e clicca
  la tab Impostazioni a 480, 1250 e 1920 px.
- La sonda misura nel browser: raccoglie le foglie e gli interattivi
  visibili di `#main`, e conta le coppie che si sovrappongono per più di
  2 px per lato SENZA contenersi una dentro l'altra. > 0 → FAIL con nome
  dei due elementi e area in comune.
- Guardia provata VIVA: un blocco injectato a mano sopra il selettore
  lingua viene beccato («Lingua interfaccia ⟂ DIFETTO DI PROVA 97×10»),
  quindi il verde vuol dire verde.

Verifica: sonda misurata (76 candidati per larghezza), test guardia
713/713 verdi, biome pulito su test e package.json.

### 2/11 — La guardia messa alla prova a ROTURA: la sovrapposizione finta
(richiesta Mauro: «aggiungi al diario la prova della guardia con sovrapposizione finta»)

La guardia esce dalla fabbrica con il collaudo più onesto che un test
di geometria possa avere: un DIFETTO FINTO injectato a mano DEVE essere
beccato, altrimento il verde non vale niente — un test che non sa cadere
non è una guardia, è un decoro.

**Come andò il 2/11**: con il tab Impostazioni aperto a 480 px e la pagina
sana (0 sovrapposizioni), si inietta nel DOM un blocco a cavallo del
selettore lingua — un elemento di prova 97×10 px messo fisso sopra la
label «Lingua interfaccia» — e la sonda lo becca al primo colpo:

> «Lingua interfaccia ⟂ DIFETTO DI PROVA 97×10»

Tolto il blocco, la misura torna a 0. La prova visse allora nella sonda
di banco `tmp/_sonda-sovrapposizione.mjs` (nessuna asserzione nella
suite: era UNA prova manuale, il difetto finto non deve mai girare nel
collaudo della suite), poi finita nel pulito del tmp come tutti i log di
banco.

**Riconferma del vivo del 3/11** (la richiesta lo chiedeva raccontato:
il motore della sonda è cambiato tre volte da allora — estrazione nel
modulo condiviso, righe vere degli inline, mozzica al contenitore
scorrevole — quindi il gesto del 2/11 va RIGIOCATO, non solo citato):
prova rigiocata in [tmp/_sonda-sovrapposizione-replay.mjs](tmp/_sonda-sovrapposizione-replay.mjs)
sullo stesso impianto della guardia di oggi (21 tab, stesso server con
cartella dati finta, stesso chromium) e girata a 480 px:

- PASSO 1 pagina sana: **0** sovrapposizioni;
- PASSO 2 bottone di prova injectato sopra la label del selettore
  lingua: beccato — `label.muted ⟂ #difetto-prova buttonDIFETTO DI PROVA
  · area comune 95×6` (il nome del campo nel report è cambiato col
  formato ETI del 3/11: i componenti senza id dicono tag+classi, non
  più il testo);
- PASSO 3 difetto tolto: **0** sovrapposizioni, **0** pannelli fuori
  viewport — la guardia torna verde da sola.

Log della riconferma: [tmp/sonda-sovrapposizione-replay.log](tmp/sonda-sovrapposizione-replay.log).
La sonda di replay resta in tmp (sopportata a mano, NON nella suite:
il difetto finto è solo un gesto di banco), e nella riconferma insegna
due regole concrete di chi la usa domani:

1. l'inject va DENTRO `#main` — la misura raccoglie solo `#main *`, un
   elemento appeso al body non esiste per lei;
2. il difetto finto deve SBORDARE dal rettangolo del vicino — del tutto
   contenuto dentro la sua scatola fa scattare a ragione la legge
   «contenuto in contenuto: sano» (un figlio che sta dentro il padre è
   la pagina che funziona, non un difetto): per questo la striscia è
   messa a cavallo del bordo della label (area comune 6 px in altezza,
   sborda sopra).

### 2/11 — Notizia: Messaggi e i tab del gruppo Gara sono GIÀ coperti dalla guardia
(richiesta Mauro: «registra nel diario che Messaggi e i tab del gruppo Gara sono già coperti dalla guardia e scrivi la notizia del 2/11»)

Da registrare perché conviene: NON c'è niente da aggiungere. Il gruppo
che un weekend di gara tocca sta TUTTO nella TAB della guardia di layout,
ognuno col SUO marcatore di vista e ciascuno con le 5 larghezze:

- **Messaggi** — `#mx-posta` ([layout-impostazioni.test.mjs:116](test/layout-impostazioni.test.mjs#L116)), 1 pannello;
- **Centro gare** — `#ag-advance`, 2 pannelli (hero + gare del giorno);
- **Griglia** — `#g-tbody`, 5 pannelli (celle, classi, sede weekend,
  calibrazione, azioni);
- **Garage** — `#g-mech`;
- **Risultati/Import** — `#imp-result`;
- più i vicini che il giorno di gara guarda: **Setup** `#psi-panel`,
  **Analisi** `#an-tetto`, **Piste** `#track-hist`, **Auto** `#cars-grid`.

La linea del tempo, per chi rilegge il diario tenendo d'occhio le date: la
guardia nasce il 2/11 proprio qui sopra (Impostazioni a 480/1250/1920,
poi la prova a rottura); Griglia e Garage entrano in giornata il 2/11
coi loro marcatori; Messaggi arriva con la stesa «tutti i tab» del 3/11
(#mx-posta esiste SOLO in quella vista) e oggi la TAB conta le 21 (19 in
nav + 2 nascosti) × 5 larghezze = **105 misure**, tutte verdi, anche a
320 px. Quindi la risposta alla domanda «sto per toccare le viste di
Messaggi o del giro Gara, la guardia è già lì?»: **sì, è già in
servizio** — si tocca la vista, si gira il check intero come da legge di
[COMANDI-BUFFY.md](COMANDI-BUFFY.md), e la guardia dice se il layout è
restato a posto.

### 2/11 — Termometro del battito: media dei 5 ping, non la singola lettura (richiesta Mauro: «fai scorrere i 5 tempi di ping più recenti e mostra la media, con tooltip che elenca i bassi e gli alti»)

Il termometro di un'ora prima leggeva un solo ping per volta: un ping fortunato
(o un colpo di GC) sembrava diagnosi. Ora [gui/js/core.js](gui/js/core.js) tiene
una finestra scorrevole dei 5 ping più recenti (solo i ping arrivati: un
timeout non è un tempo, non entra), la riga mostra la MEDIA colorata con la
stessa scala (verde < 150 ms, arancio ≤ 500 ms, rosso) e il tooltip del numero
elenca i singoli ping dal più recente, con il più basso e il più alto marcato.
Nota di mestiere due volte lo stesso male: la prima stesura usava `leggiPing`
SENZA dichiararlo — esattamente il `prevName` di ieri. Rileggo sempre il
blocco dopo la scrittura.

Verifica: biome pulito su core.js, guardia commenti 2/2 verde.

### 2/11 — Termometro del battito: ms colorati (richiesta Mauro: «verde sotto 150 ms, arancio fino a 500 ms, rosso sopra»)

Il ping del battito già misurava i ms ma li mostrava neutri: ora la cifra
si colora da sola in [gui/js/core.js](gui/js/core.js) — verde (sanità piena)
sotto 150 ms, arancio (`--warn`) fino a 500 ms (il server fa fatica: import
grosso o salvataggio in corso?), rosso — lo stesso rosso del server caduto — sopra.
Il pallino ● resta verde finché il server risponde: il colore del numero è
chi dice quanto fatica, il pallino dice se è vivo.

Verifica: biome pulito su core.js, guardia commenti 2/2 verde.

### 2/11 — Autopsia: margine sul precedente per P2 e P3 + commento sul gap dai giri corti (richiesta Mauro: «porta il margine sul pilota precedente anche per P2 e P3, e commenta il gap dal leader quando arrivi corto di giri»)

Prima il margine di battaglia c'era solo per il vincitore (sul secondo);
P2 e P3 vedevano solo il gap dal leader, che su 20 giri non dice la lotta
per il podio. Ora:

- [src/results.mjs](src/results.mjs) — `classify` calcola `prevGapMs/
  prevName/prevLaps`: il precedente è chi gli sta davanti nella classifica
  UFFICIALE (penalità comprese) e il conteggio usa i tempi REALI (totale +
  penalità a tempo): un +5s mio o suo pesa. DNF o P1 → niente precedente.
- [src/state.mjs](src/state.mjs) — BUG TROVATO IN PASSAGGIO: `applyRaceResult`
  costruisce l'entry campo per campo e **secondGapMs non era nella lista** —
  l'import lo calcolava e lo scartava: il KPI «Margine sul 2°» su un import
  fresco restava nullo (si vedeva solo sulle gare ricalcolate a mano).
  Ora entrano nel save dalla prima gara: secondGapMs + i tre campi nuovi.
- [src/analisi.mjs](src/analisi.mjs) — voce «Distanza»: il vecchio commento
  sospeso dei giri corti («l'età della gara fa il resto») diventa esplicito:
  «Arrivi N giro(i) corto dal leader (m su z): il gap X conta anche i giri
  mancanti — misura la distanza piena, non il ritmo»; e per P3+ aggiunge
  «Margine su P<n-1> (nome): X». Quando il precedente ha PIÙ giri il tempo
  non misura il ritmo: il margine tace (niente gap fra doppiati).
- [gui/js/viste-analisi.js](gui/js/viste-analisi.js) — il quarto KPI prende
  l'etichetta giusta: P1 «Margine sul 2°» (come prima), P2 «Margine su P1»,
  P3 «Margine su P2», P4+ invariato «Gap vincitore»; con giri in meno del
  precedente mostra «—» e lo spiega la voce Distanza.

Verifica: suite ufficiale **712/712 verdi** (test nuovi:
[penalties.test.mjs](test/penalties.test.mjs): precedenti con penalità
+5s = 1,471 s reali; [analisi.test.mjs](test/analisi.test.mjs): P3 a 2
giri corti dice margine + commento, doppiato → tace). Guardia commenti
verde, biome pulito sugli 8 file toccati. NOTA: un `node --test` senza
filtro pesca anche i test della copia in tmp/ — lì fuori dal gioco
(ambiente); la suite vera è `npm test` (test/*.test.mjs). Un server webui
di test rimasto vivo sulla porta di prova 8743 nascondeva i risultati:
chiuso.

### 2/11 — Autopsia della vittoria: giro veloce e griglia→arrivo in scheda (richiesta Mauro: «aggiungi anche il giro veloce e il gridPosition dell'arrivo per raccontare come è partita la gara»)

L'autopsia della vittoria non raccontava come era PARTITA la gara quando
il giro veloce non era firmato dal pilota: la voce «Partenza e primo giro"
esiste già, ma in scheda non si vedeva e il giro veloce compariva solo
nel Bonus del pilota. Ora:

- [src/analisi.mjs](src/analisi.mjs) — dall'archivio rivali esce `fastestOfRace`
  (tempo e nome del firmatario del giro veloce, griglia COMPLETA: pilota
  compreso); quando NON è il pilota, nuova voce «Giro veloce — il giro
  veloce della gara va a <nome>: <tempo>». Senza archivio: silenzio onesto
  (niente dati inventati). La partenza P1→vittoria ora dice «pole intoccata,
  mai ceduta la testa» invece del finto «guadagnate 0 posizioni».
- [gui/js/viste-analisi.js](gui/js/viste-analisi.js) + [style.css](gui/style.css)
  — due KPI nuovi nella scheda autopsia: «Giro veloce» (con 🏁 e nome del
  firmatario) e «Partenza → arrivo» (P griglia → P di arrivo, oppure «—»);
  la  griglia dei KPI passa da 4 a 6 caselle (nuova classe .grid6: tre colonne).

Verifica: [test/analisi.test.mjs](test/analisi.test.mjs) 17/17 verdi (vittoria:
fastestOfRace e voci Partenza/Giro veloce; senza archivio: null e niente
voce inventata), guardia commenti-render verde, biome pulito sui 4 file.

### 2/11 — Scheda «Prossima gara» compatta: regole e meteo in un dettaglio espandibile (richiesta Mauro: «rendila più compatta spostando regole weekend e meteo in un dettaglio espandibile»)

Il pannello «Regole di questo weekend» (orari delle sessioni, distanza,
temperatura aria/pista e bollettino meteo) occupava metà scheda anche
quando servivano solo l'auto, l'orario della gara ed eventuali ritiri.
Ora in [gui/js/viste-a.js](gui/js/viste-a.js) è un `<details>` chiuso di
default: in testa resta solo il sommario («Regole di questo weekend ·
meteo — clic per aprire»); orari, distanza, temperature e bollettino
tengono il posto che abbiamo sempre visto, ma da pannello a richiesta.

Nessun cambio di logica: i controlli (id rs-*) restano identici e le
callback continuano a trovarli via id, pannello chiuso o aperto che sia.
Lezione del 1/11 verificata sul vivo: il mio primo commento di spiegazione
è stato scritto per errore DENTRO il template literal e la guardia di ieri
l'ha beccato al primo colpo (viste-a.js riga 669) — il commento ora sta
sopra l'assegnazione, dove deve stare.

Verifica: race-card 13/13 + commenti-render 2/2 verdi, biome pulito.

ERRATA-CORREZIONE (2/11, stessa voce): la prima versione di questo
paragrafo aveva due frasi scritte corrotte («in testa restano il sommario,
orari e meteo stavolta a una riga, spostati sotto per apertura» e «Stessa
lezione del 1/11 ALL'ATTO») — sono riscritte come si leggono qui sopra. Nel
codice la GUI non è cambiata per l'errata: riguardava solo il testo del
diario — nessuna riga di codice toccata, nessun test mancato.

### 1/11 — Test di guardia: nessun commento /* … */ dentro i template della GUI (richiesta Mauro: «aggiungi un test di guardia che fallisce se una frase di commento /\* … \*/ finisce nel testo renderizzato della pagina»)

I commenti /* … */ nei file della GUI sono normali nel codice, ma i testi di
pagina nascono dentro template literal: un commento scritto DENTRO un
backtick non resta commento — esce come testo in innerHTML. Biome non lo
vede (sintassi valida). Nuovo [test/commenti-render.test.mjs](test/commenti-render.test.mjs):

- SCANNER A STATI: due modalità in stack — C (codice, con interpolazioni
  annidate) e T (corpo del template). In C si saltano stringhe, commenti e
  regex: un regex può portare [ e ] con apici dentro, i quali non devono
  aprire stringhe finte (il primo falso positivo della guardia nasceva
  esattamente lì, su core.js). In T un /* è il difetto: segnalato con riga
  ed estratto.
- Unica eccezione: dentro <style>…</style> il /* … */ è commento del CSS
  e non conta (il CSS non parla).
- AUTO-VERIFICA: due casi sintetici costruiti con il backtick concatenato
  (valore 96) — il difetto nel corpo del template viene segnalato (anche
  se sta alla riga 2); commenti veri, interpolazioni con commento dentro e
  regex con /* NON vengono segnalati. I sorgenti reali oggi escono puliti:
  la guardia pesca il difetto FUTURO, non il passato.

Verifica: test 2/2 verdi, biome pulito.

### 1/11 — Avviso di confronto NON giusto nel banco A/B (richiesta Mauro: «quando scelgo la sessione B, auto e pista devono coincidere con quelle di A: avvertimi se non sono un confronto giusto»)

Il banco A/B permetteva di confrontare un .ld della MX-5 con una RX-7 (o
Monza con Brands Indy) senza dire niente: «chi vince» era un numero senza
senso. Ora quando A e B sono scelte, [gui/js/viste-analisi.js](gui/js/viste-analisi.js)
li mette a confronto:

- auto e pista devono COINCIDERE con la stessa regola di tracknames.mjs:
  uguaglianza o prefisso in entrambe le direzioni («Mazda RX-7 FD» e
  «Mazda RX-7 FD Spirit R» sono la stessa auto; Imola e Brands Hatch Indy
  sono piste diverse). Lato sconosciuto NON nega il match.
- se NON coincidono: bordo di A e B giallo, e la nota sotto i menu diventa
  «⚠️ Non è un confronto giusto (auto X ≠ Y · pista U ≠ V)» — la scelta
  resta all'utente, il banco difetta. Nel MODALE del confronto esce la
  banner di avviso dello stesso tenore, così chi apre il risultato non
  vede i numeri senza il contesto.
- se il match torna (cambi B o si resettano i filtri): bordo e nota
  si ripristinano — i filtri reindirizzano alla stessa guardia, così il
  re-riempimento non lascia avvisi vecchi appesi.

Verifica: `node --check`, biome pulito, viste-guard 4/4, webui-smoke verde.

### 1/11 — Filtri auto e pista sul grafico del giro (richiesta Mauro: «Aggiungi i filtri auto e pista anche al selettore di sessione del grafico del giro nel meccanico»)

Il selettore «Sessione» del grafico del giro elencava TUTTE le sessioni di
TUTTE le auto (il meccanico segue l'auto più recente ma il menu no): una
decina di file .ld sparsi su più macchine diventavano lunghi da scorrere.
Ora sopra al menu ci sono i due filtri del banco A/B (stesso modello,
stesso testo «tutte le auto…/tutte le piste…»):

- [gui/js/viste-c.js](gui/js/viste-c.js): `lc-f-car` e `lc-f-track` prima
  del menu sessioni; ogni voce ora porta anche l'auto (etichetta e
  `data-car`). Il riempimento (`__lcFill`) cancela la scelta già fatta se
  la sessione è ancora visibile; il grafico si ridisegna da solo al cambio
  filtro. Nel re-riempimento dopo il laptrace: con un filtro attivo resta
  in mano ai filtri, senza cade sul lotto dell'auto campiata come prima
  (entrambi i casi ora portano `data-track`, che il meccanico del pannello
  leggeva dal markup/server e perdeva dopo il primo cambio sessione).
- L'auto passata al server (`laptrace`, `meccanico`) è quella della
  SESSIONE SCELTA, non più solo quella che il pannello segue: col filtro
  «tutte le auto» si può guardare un .ld di un'altra macchina e la telemetria
  + i consigli seguono l'auto giusta (il server trova il file MoTeC nella
  cartella col nome dell'auto).

Verifica: `node --check` della vista, biome pulito, webui-smoke verde.

### 1/11 — Nomi di pista puliti nel menu del banco A/B (richiesta Mauro: «mostra le piste con il nome pulito invece del token del file»)

I due menu del banco erano pieni di token da cartella («ImolaGP»,
«Oulton ParkInternational»). Ora [gui/js/viste-analisi.js](gui/js/viste-analisi.js)
non cambia niente: è la rotta `ab-list` a somministrare il nome già pulito —
nuovo export `prettyTrackLabeled` in [src/testday.mjs](src/testday.mjs),
acanto a `prettyTrack` del quaderno prove: bella voce del ladder + la
VARIANTE vera della cartella, mentre il «GP» generico cade («ImolaGP» →
«Imola», «Sebring International RacewayGP» → «Sebring International Raceway»);
le varianti vere si distinguono («Brands Hatch Indy», «Suzuka East», «Red Bull
Ring National», «Oulton Park International»). Su tutte le 19 cartelle
vere MoTec di disco la voce torna pulita; pista non conosciuta dal ladder
resta token (onestà). Bug corso durante la scrittura: il comparatore del
prefisso trattava «ü» come punteggiatura — le lettere accentate sono
alfanumerico dopo la trascrizione.

Verifica: [test/tracknames.test.mjs](test/tracknames.test.mjs) 6/6 (il test
nuovo copre 9 voci: GP in testa/in coda, varianti, accenti, sconosciuta);
biome pulito sui 3 file toccati.

### 1/11 — Quadro-zone dell'A/B nel pannello Analisi (richiesta Mauro: «Aggiungi il quadro-zone (frenata/uscita/gas lungo la giuda del giro) dell'A/B già in pannello Analisi»)

Il banco A/B diceva QUANTO si perde per zona (il totale) ma non DOVE lungo
il giro. Ora la fase si legge a colpo d'occhio nel modale del banco:

- [src/motec.mjs](src/motec.mjs): ogni punto campionato di `lapTrace` porta
  la sua `zone` (stesse soglie che usava il riparto A/B: freno > 25 % =
  frenata, gas sotto 92 % = uscita, altrimenti gas pieno) — taggata una
  volta sola alla fonte.
- [src/analisi.mjs](src/analisi.mjs): nuovo export `zoneTimeline(A, B)` —
  le fette attigue di STESSA zona e STESSO segno si fondono in tratti
  leggibili ({x1, x2, zone, s, pts}); le fette sotto 0,01 s sono rumore e
  restano fuori. `setupAB` legge la zona dal punto campionato (una sola
  soglia nel codice); `A vs A` = nessuna fetta (tutto pari).
- [src/webui.mjs](src/webui.mjs): la rotta `ab-setup` allega
  `zoneTimeline` (una delle due sessioni non ricampionabile → null, e il
  pannello non disegna niente).
- [gui/js/viste-analisi.js](gui/js/viste-analisi.js): striscia SVG nel
  modale del banco, sotto il banner del netto — segmenti colorati per zona
  (rosso frenata / ambra uscita / verde gas), altezza = tempo su quella
  fetta, sopra la riga perso da A, sotto (tratteggio) guadagnato; tooltip
  al passaggio con i secondi.

Verifica: [test/analisi.test.mjs](test/analisi.test.mjs) +2 (fette ordinate
non sovrapposte, tutte tempo perso con B dominante, somma = netto del
riparto a meno dello scarto, frenata in vista; A vs A → null).

### 1/11 tarda sera — Collaudo SUL VIVO del quadro-zone (la vittoria non era nel server)

Il modale del banco non disegnava la striscia con la coppia Ferrari/Monza: gli .ld si campionano entrambi (richiamata a mano di `sampleLap`: A 240 punti 114,4 s, B 133,1 s) e `zoneTimeline` restituisce 19 tratti — il codice era giusto, ma il processo webui era nato ALLE 09:16 e codice di oggi è stato toccato ALLE 11:24: girava il vecchio. `tools/riavvia-webui.mjs` e rientrato (nuovo PID 5176): la striscia si disegna (21 svg nella pagina, prima 0), 17 righe canali, banner zone e verdetto partenza corretti. Nota dati: B (18:13) ha 1 solo giro valido a 133,10 s — il −18,70 s del canale giro-migliore è un dato vero del file, non un difetto del pannello.

### 1/11 — Rapporto A/B MX-5 su Imola salvato in carta, targa in gazzetta (richiesta Mauro: «Salva il rapporto dell'A/B MX-5 su Imola in carta e allega la targa fasce nelle occasionali/news»)

- Le 11 sessioni MX-5 ImolaGP di MoTeC hanno tutte preset `mx5ndcup_mech_1`:
  un A/B di SETUP lì non esiste, il confronto è fra SESSIONI (serata 26/9
  19:37, best 135.0 — pomeriggio 27/9 17:20, best 133.9). Giri morti
  (293–298 s) e out-lap (1 solo giro) dichiarati fuori.
- **Carta**: [report/banco-ab-mx5-imola-2026-11-01.md](report/banco-ab-mx5-imola-2026-11-01.md)
  — Δ −1,10 s, canali completi, tempo perso a fasce (gas 1,23 s · uscita 0,48 s
  · frenata 0,41 s) e verdetto: la metà è a gas pieno, la leva è la pressione
  (+1,1 bar a freddo LF).
- **Targa in news occasionali**: item `kind: 'notice'` in testa a
  data/news.json via `publishNotice` (backup: data/news.json.bak-2026-11-01);
  la carta completa è citata nel corpo.

### 1/11 — PERIODO_MS in una sola voce: le app lo ricevono alla build (rifattore «fai importare da src/uiapp-pub.mjs»)

Il ritmo delle fasce era scritto TRE volte (publisher + cruscotto + pitwall)
e ogni cambio andava rincorso a mano. Ora una sola legge:

- Le app NON dichiarano più la costante: i sorgenti veri sono le sagome
  [cruscotto.src.js](uiapp/cruscotto/cruscotto.src.js) e
  [pitwall.src.js](uiapp/pitwall/pitwall.src.js), col segnaposto
  `__PERIODO_MS_DAL_PUBLISHER__` al posto del numero.
- Il generatore nuovo [tools/genera-uiapp.mjs](tools/genera-uiapp.mjs)
  importa `PERIODO_MS` da [src/uiapp-pub.mjs](src/uiapp-pub.mjs) e
  scrive i file costruiti (cruscotto.js / pitwall.js, con la riga
  `const PERIODO_MS = …  // [via build]`) — il repo NON resta mai
  senza i costruiti: il generatore gira a mano una volta e i due file
  tornano al loro posto.
- Installa-uiapp e gli installatori dell'app continuano a copiare i
  costruiti: il consiglio di reinstallare le app nel gioco vale solo a cambio del valore.

Verifica: [test/uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs) 4/4
(niente dichiarazioni scritte a mano nelle sagome, i costruiti portano il
valore del publisher, il generatore riscrive a cambio del numero) e il
gruppo uiapp-pub che ne dipende 62/62; biome pulito sui 6 file toccati.

### 1/11 — Prova in sandbox del bottone (🌉) del pannello Copertura (richiesta Mauro: «verifica che il .carsetup nuove compaia e la chip passi a ✔»)

Il pannello di DA-13 non aveva unit test («la rotta mangia sessioni MoTeC
vere, la prova live è la verifica»): ora ne ha uno SU SANDBOX intera:
[test/cover-ponte-sandbox.test.mjs](test/cover-ponte-sandbox.test.mjs).
Un server webui VERO su porta 8743 (stesso schema di webui-smoke) girando con
`ACE_DATA` = Saved Games finta: la Ferrari 296 GT3 ha il base setup su Imola
(`Car Setups/…/Imola/Mio setup.carsetup`) e un .ld sintetico — steso col forte
formato binario di laptrace/analisi (header 64 B, 5 canali, beacon nel .ldx) —
su Red Bull Ring GP. `ACE_LIVE=0` tiene spenta la guardia della pista viva,
così il test resta deterministico anche con EVO aperto sul PC.

Il ciclo verificato, col POST ESATTO che il gestore del click in
[viste-c.js](gui/js/viste-c.js) manda (`{ car, track: data-cover-bridge,
srcFile: data-src }`):

1. setup-cover → Red Bull Ring GP è in `missing` col `srcFile` che punta
   al base di Imola: la chip ✖ con bottone 🌉 è quella che il server annuncia;
2. setup-bridge col payload del bottone → `ok:true`, e il file NUOVO
   `Car Setups/…/Red Bull Ring GP/Mio setup.carsetup` esiste sul disco,
   byte per byte pari al base (payload letto e ricontrollato);
3. setup-cover daccapo → la pista passa in `covered` (chip ✔,Files ×1) e
   esce dalle mancanti; un secondo click sullo stesso bottone rifiuta in
   modo civile con `already: true` («già coperta»), non un errore.

Verifica: node --test del file 1/1 verde (~1 s), biome pulita. Nessun tocco
al codice di produzione: il test PROVA il flusso già vivo.

### 1/11 — A gara finita la GUI arrivava tardi: il ritiro delle cifre fisse (richiesta Mauro: «Paddock è molto più veloce»)

Percezione vera, indagine vera. Il Paddock beve fasce scritte ogni 2,5 s
([uiapp-pub.mjs](src/uiapp-pub.mjs)): parla e si disegna in pochi secondi.
La GUI invece doveva attraversare TRE cifre fisse, tutte in serie:

- tick del watcher **4 s** (fino a), attesa «grazia» **8 s FISSE** prima
  del primo tentativo d'incasso ([webui.mjs](src/webui.mjs)), poi il poll
  GUI del seq **5 s** (fino a) che fa `refreshBoot` + render
  ([viste-d.js](gui/js/viste-d.js)) — totale percepito ≈ 13–20 s dal
  traguardo al ridisegno.
- **Misura**: i due endpoint pollati (`watcher`, `live`) costano
  **30–190 ms** col server in piedi (3×curl a 8642): il collo di bottiglia
  NON è il costo delle chiamate — è il ritmo fisso. Nessun test agganciava
  quelle cifre (spazzata su test/).
- **La cura** (nessuna rete di sicurezza menosprezzata):
  1. grazia 8 s → **3 s**: dopo, l'incasso si RETENTA da solo a ogni tick
     (NO_CANDIDATE / PLAYER_NOT_FOUND / TRACK_MISMATCH restano silenziose)
     e i tetti dei tentativi salgono 20 → **30** per conservare l'attesa
     massima (~60 s) che c'era con tick 4 s;
  2. tick del watcher 4 s → **2 s** (il BUSY-FLAG interno già evita i giri
     che si incolano); il commento in testa al tick lo raccoglie;
  3. poll GUI 5 s → **2 s** (stesso contratto: il seq non cambia finché la
     gara non è incassata, il ridisegno non si moltiplica).
- Effetto atteso: ≈ **5–9 s** dal traguardo al ridisegno (2 s tick + 3 s
  grazia + incasso a ms + ≤2 s di poll) contro 13–20 s; SE il file esito
  arriva tardi, il tempo torna quello di prima ma NIENTE si perde: la
  ritenta c'è già.
- Verifica: `node --check` su webui e viste-d ✓, `npx biome lint` 296
  file a 0 diagnostica ✓, suite completa in sandbox **688/688** exit 0 ✓.
- **Le viste IN GIOCO ereditano la cura senza toccarle** (audit 1/11,
  «estendi lo stesso ritmo a Cruscotto e Pitwall, se qualcosa li rallenta»):
  nulla di proprio le frena. Il publisher ([uiapp-pub.mjs](src/uiapp-pub.mjs)
  `PERIODO_MS` 2500) scrive le fasce di ENTRAMBE a ogni tick dello stesso
  stato; Cruscotto e Pitwall prendono lo slot ogni 1,25 s (PERIODO_MS/2,
  due tacche per fascia) e contatori leggeri condizionati (pallino età 1 s,
  conto vivo 30 s SOLO con preparazione viva). Il tratto lento era lo STATO
  (tick+grazia+incasso): ora che la cura lo ha accorciato, la fascia dopo
  l'incasso porta i dati già nuovi. Catena percepita in gioco al traguardo:
  tick 2 s + grazia 3 s + incasso a ms + fascia ≤2,5 s + slot ≤1,25 s
  ≈ **6,5–9 s** (era 13–20 s + fascia). Canale Paddock a 500 ms separato
  e già vivo (`fasceApp`), non serve alle due app nostre.

### 1/11 — Release 0.1.45 preparata: il weekend col cielo per sessione e l'orologio nelle app

La parte LOCALE della checklist ([RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md))
chiusa in un colpo, su autorizzazione «fai quello che vuoi»:

- **Suite completa in sandbox: 697/697** (`EVO_DATA_DIR` temporanea, 14,2 s,
  exit 0) — il numero chiaro con l'inganno del diario (era l'attuale).
- **Lint Biome a 0 diagnostica**: l'unico avviso restante
  (`useOptionalChain` in [cruscotto.js](uiapp/cruscotto/cruscotto.js), fix
  «unsafe» che il fixer non applica da solo) chiuso a mano — e la copia
  installata nei Saved Games riallineata con `installa-cruscotto`.
- **[CHANGELOG.md](CHANGELOG.md)** voce v0.1.45 scritta dai fatti del delta:
  Bollettino meteo per sessione con WX_ICON e toast, orologio di giornata
  in Cruscotto/Pitwall con le due porte (⌛/⏳), ponte 🌉 dal quadro «Tutto
  il garage», test aggiornati + i due nuovi (banda di serie, ponte).
- **Bump**: `npm run bump` 0.1.44 → **0.1.45** (verificato con `--check`).
- **Prova live completa (1/11 tardi, sempre sul demo vuoto)**: riavvio del
  server (`riavvia-webui`), `boot` vivo sulla carriera vera e `setup-cover`
  `all:true` che porta `srcFile`/`srcName`/`srcTrack`/`sources`; quadro
  «Tutto il garage» fotografato sul demo [`screenshot/copertura-garage-0145.png`](screenshot/copertura-garage-0145.png)
  (chip ✖ secco dove non c'è base setup — come deve essere — e i bottoni
  «🌉 Pontalo» verificati con dati fissi nel DOM, payload del click con
  `car` dell'auto riga, pista e sorgente).
- **Ponte dal quadro «Tutto il garage»** (richiesta Mauro, «proponi il
  ponte diretto anche da lì, non solo dal pannello dell'auto corrente»):
  `setup-cover` `all:true` ora include per ogni pista mancante il sorgente
  (`srcFile`, `srcName`, `srcTrack`) — server in [webui.mjs](src/webui.mjs);
  in [gui/js/viste-c.js](gui/js/viste-c.js) i chip del quadro usano
  `chipGarageMiss`: con base setup disponibile il chip diventa «🌉 Pontalo»
  con `data-cover-car` = l'auto DELLA RIGA (il gestore delegato la
  rispetta: `btn.dataset.coverCar ?? ctx.car`), senza resta chip secco.
  Prova live della catena (fetch intercettato in pagina, niente scritto su
  disco): rendering dei bottoni coi dati fissi e click registrato al
  server con l'auto giusta; ritorno a dati veri e pannello ridisegnato
  pulito. Test: `test/ponte-setup.test.mjs` (3 casi).
- **README**: nessun riferimento alla versione da allineare (solo fasce
  storiche 0.1.13–0.1.41, giuste così).

CHIUSURA DEL RILASCIO (1/11 sera, su richiesta Mauro «registra la versione
0.1.45 e prepara il pacchetto»): commit locale delle modifiche di sessione,
danza del PC amico vergine (§3) e pacchetto-amico costruito dal commit della
testa (zip in `pacchetti/`, con `build-id.txt` dentro).
RESTANO NELLA MANO DI MAURO (come da checklist): `sincronizza-git.cmd`
(push su off-site, con il report di build generato dopo il push) e
`node tools/crea-release.mjs` (release GitHub con la zip come asset).

### 1/11 — Orologio di giornata nel cruscotto e nel pitwall (richiesta Mauro, «prossimi naturali»)
Il calendario da 1/11 ha il SUO orologio (`agendaOra`, 0–23 + mattino
presto): la GUI lo mostrava da sola, i due pannelli IN GIOCO no. Ora il
server spedisce e i due pannelli lo dicono:

- **Payload** ([uiapp-pub.mjs](src/uiapp-pub.mjs)): la vetrina porta
  `ora: agendaOra(state)` accanto a `giorno`; il miniPitwall trasporta
  giorno+ora nel payload piccolo (le sue chiavi sono chiuse dal test).
- **Cruscotto** ([cruscotto.js](uiapp/cruscotto/cruscotto.js)): nella
  intestazione sotto il pilota — «⏰ ore 16 · (mattino presto)» — e nella
  card gara l'ORA DI PARTENZA (il server la mandava già, la card la
  bevva da sempre, la card la mostrava mai).
- **Pitwall** ([pitwall.js](uiapp/pitwall/pitwall.js)): primo blocco del
  muro senza carriera = niente blocco, mai un mucchio vuoto.
- Installati entrambi nei Saved Games (installa-cruscotto + installa-pitwall);
  verificato che le copie in gioco portino il cambio.
- SECONDA MANATA (1/11 pomeriggio, sempre «fai quello che vuoi»): la card
  porta anche LE DUE PORTE del calendario — `portaChiusa` (⌛, calcolata
  dal server con portaGiornata: l'orologio è oltre l'ora della gara, la
  scaletta non torna indietro) e `inRitardo` (⏳, la gara di un altro
  giorno che si corre quando si vuole, come la scheda del CLI). Il server
  mandava inRitardo da sempre, la card lo beveva mai. Suite 688/688.
- Test nuovo in [pitwall-radio.test.mjs](test/pitwall-radio.test.mjs):
  le chiavi del miniPitwall aggiornate (giorno/ora in lista) e il passaggio
  giorno=3/ora=16, ora null = mattino, senza carriera = null. Suite 688/688.

### 1/11 — Bollettino del weekend: meteo per sessione (richiesta Mauro: «weekend realistici»)
Prima la ronda portava UN preset per TUTTO il weekend: prove, qualifiche,
warm-up e gara uscivano con lo stesso cielo. Ora il piano è DETERMINISTICO
in [race.mjs](src/race.mjs) (`weatherPlanFor`): il cielo peggiora verso la
gara (r = meteo della ronda) — prove min(r−2, 2), tetto «nuvoloso» così
le prove si possono sempre correre · qualifiche/warm-up r−1 · gara r —
con clamp a 0. La ronda bagnata (r=4) dà l'esempio letterale di Mauro:
prove nuvoloso, qualifiche pioggia leggera, gara pioggia.

- **Preparato tutto** ([webui.mjs](src/webui.mjs)): al via scrive il preset
  della PRIMA sessione (le prove); le sessioni successive si sistemano col
  tasto del bollettino (EVO legge il preset del selettore a ogni avvio
  sessione, verificato 20/10).
- **Tasto «Metti» nella scheda** ([viste-a.js](gui/js/viste-a.js)): il
  «Bollettino» mostra le 4 sessioni con cielo pianificato e ora; il bottone
  «Metti» chiama `wx-session` (sessione practice/qualify/warmup/race →
  endpoint POST in webui.mjs, aggiunto alle rotte che esigono carriera) e
  scrive il preset sul gamemodesave. Nessun cielo scelto a mano: non c'è
  `previsto:true` perché qui a premere è l'utente (non l'automazione), ma
  il numero arriva SEMPRE dal piano del calendario, mai dalla GUI.
- IT/EN complete (nomi sessione e rituale), test nuovo in
  [race-card.test.mjs](test/race-card.test.mjs) (i quattro livelli del piano + card),
  payload di card con `weatherPlan` e `weatherRitual`
  ([webui-views.mjs](src/webui-views.mjs)).

### 1/11 — Icona del meteo nel Bollettino (richiesta Mauro: «sole su bello,
pioggia su pioggia»)
I chip del piano mostrano solo il nome («sereno», «pioggia») senza segno:
si riconosce il cielo leggendo, non guardando. In [viste-a.js](gui/js/viste-a.js)
c'è ora `WX_ICON` — chiave = codice della ronda (0–5, la stessa tabella di
[race.mjs](src/race.mjs)): ☀️ sereno · 🌤️ nuvole sparse · ☁️ nuvoloso ·
🌦️ pioggia leggera · 🌧️ pioggia · ⛈️ pioggia intensa — accodato al nome
in ogni chip di sessione. Il codice resta SOLO server (nessun nuovo campo):
la GUI legge `s.weather` già in `weatherPlan`. POCO DOPO la stessa icona
anche nei toast di «Metti»: la mappatura legge `r.forecast` (il piano che
il server ricalcola) con la stessa `WX_ICON`, niente doppio registro.
Verifica: `node --check` su viste-a.js + guardie che camminano su gui/
(`viste-guard`, `diffesa-sonda`) in verde.

### 1/11 — Difesa POST-only sulle API di scrittura (lezione sonda) — DA-16
Colpo e restauro raccontati in [SESSION_REPORT.md](SESSION_REPORT.md) §Incidente;
la lezione applicata è il set `SOLO_POST` + 405 in [src/webui.mjs](src/webui.mjs):
qualsiasi GET su una rotta che scrive non muta più lo stato. Verifiche:
provino `tmp/_difesa-probe.mjs` (7×405, letture intatte, POST regolare),
suite **660/660** exit 0, biome 0, smoke key teste verdi.

### 1/11/2026 — Release 0.1.44 preparata: le tinte intere, la palestra e i contatori al passo

Chiuso il pacchetto della 0.1.44 (tutto di questa giornata di tinte + palestra),
seguendo [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md):

- **Verde con i contatori Homepage**: `npm run check` exit 0 — suite **660/660**
  (da 653 di v0.1.43), Biome 0 diagnostica su 291 file.
- **Danza del PC amico vergine** (`node tools/_collaudo-amico.mjs`): exit 0,
  **24 verifiche verdi** (il contatore di DA-15 è cresciuto a 21+3 col
  ramo «installa-gioco» delle app: zipball, installazione, primo/secondo
  avvio, marcatori). Log in tmp/ (fuori dal tracciato).
- **Pagella del campo sazio**: le 3 mutazioni del palestrato cadono tutte
  (garage 0.85→0.80, agenda %8→%1, DISPLAY_EN spenta) — i rinforzi di
  v0.1.43 garva.
- Bump semantico: patch `npm run bump` → **0.1.44**; [CHANGELOG.md](CHANGELOG.md)
  con la voce nuova, nulla citato che non abbia prove (fonti: diario 1/11,
  SESSION_REPORT.md).
- **Resta fuori da solo**: la creazione della release GitHub stessa
  (`node tools/crea-release.mjs v0.1.44 …` con la zip di pacchetto-amico
  come asset) la fa il flusso di casa (`sincronizza-git.cmd` e Mauro):
  la checklist dice che la publish NON è un passo dell'agente.
- **Non verde qui** (per onestà): il collaudo visuale delle Schede-GUI e il
  campo DA-1/DA-3/DA-4 in gioco — richiedono ACE di Mauro sul PC, fuori
  dalla sandbox. Il cierterio della DA-10 di caccia (avversari con livree
  diverse a vista sul via) resta l'appuntamento in gara (gara 2).

### 1/11 — Fase 1 chiusa: l'unica leva, il CHANGELOG e la lista della release

Chiusa la Fase 1 della roadmap di AUDIT.md, con dentro le adattate dei Prompt
2 e 8 del pacchetto esterno (regole di casa, non le loro):
- **`npm run check`**: una sola leva, `npm test && npm run lint` — la leva
  prima di ogni commit. Prova: in sandbox **653 pass / 0 fail**, lint exit 0
  (2 warning preesistenti: import inutili in `src/webui.mjs:133` e
  `tools/_collaudo-amico.mjs:23` — non di oggi, a costo di due righe se
  processo). Zero dipendenze nuove: la suite è ESM col runner di Node.
- **README IT/EN**: sezione nuova «Suite di test e l'unica leva» con le
  scelte dette in faccia: i test girano in sandbox (mai file veri di EVO),
  le prove di rottura fanno parte del rituale (il test che protegge deve
  CADE), e **niente CI GitHub Actions di proposito** — la suite in sandbox
  locale è più severa di una runner generica per un'app aggrappata al gioco.
- **[CHANGELOG.md](CHANGELOG.md)** creato (mancaeva davvero): voci 0.1.23,
  0.1.25, 0.1.42, 0.1.43 puntate ai veri report/ e al diario, niente
  inventato.
- **[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)**: il Prompt 8 ridetto con
  l'accento di casa — commit a main descrittivi, `npm run bump`, crea-release
  con la zip come asset, il token `data/.github-token` resta FUORI dal
  pacchetto, ronda sazio sull'ultima fetta obbligatoria.

Restano per la **Fase 2**: DA-10 (tinte varianti nel template) e la doc dei
comandi vocali nel README.

### 1/11/2026 — Mai un test sazio: tre rinforzi alle fondamenta

Dalla ronda «Mai un test sazio» (verde-sempre cacciati rompendo a mano i
moduli di casa) tre cure, ognuna con la sua prova di rottura:
- **[garage-buy.test.mjs](test%2Fgarage-buy.test.mjs)** — tolta
  l'auto-referenzialità: i valori attesi di `carValueKm` e `salePrice` sono
  ora LITERALI a mano (30000 km0 → 25500, 3000 km → 16500, vendita 70%,
  fondo 4000) e non ricalcolati dalle stesse funzioni che proteggono. Cade
  se si smonta il fattore chilometraggio.
- **[agenda.test.mjs](test%2Fagenda.test.mjs)** — nuovo test di
  `cadenzaSerie`: banda 3–10 rispettata per contatori 0, 1, 7, 1000 e
  2³¹ (l'hash che spalma non deve degenerare) e il valore CAMBIA col
  contatore. Prima nessuno proteggeva il ritmo della serie: con la
  cadenza costante il file restava 9/9 verde — ora la rottura lo fa cadere.
- **[lingua-server.test.mjs](test%2Flingua-server.test.mjs)** — mappa
  DISPLAY_EN assaggiata per nome: «Coppa Città» → City Cup, «Trofeo
  Hatch» → Hatch Trophy, e un nome ignoto («Coppa Prova») che passa dal
  pattern path → Prova Cup. Cade se la mappa va spenta.

Suite completa in sandbox **653/653** (prima 647), solo file di test toccati.

### 1/11/2026 notte — ORE SPOSTABILI nel Centro gare + quattro cure di agliedai di Mauro

Su richiesta di Mauro («se due gare si corrono lo stesso giorno, si potrebbe
fare un weekend la mattina e poi verso sera un'altra corsa, che ne pensi?»):

- **L'idea confermata e la leva costruita.** Il pannello dei conflitti era un
  bulbo con un solo pugno («sposta ⯈» = slitta l'intera serie di 7 giorni).
  Ora ogni gara del conflitto porta anche il SELETTORE DELL'ORA (06–23 +
  «come calendario»): dalla carriera del 1/11 (Red Bull Ring + Oulton lo
  stesso Sabato, Nürburgring ×2 la Domenica, Brands Hatch ×2 il Mercoledì)
  la giornata tipo della produzione reale si mette in piedi senza smontare
  nessun campionato. L'override vive per UNA ronda (`state.agenda.ore`,
  pulito alla LETTURA con ronda cambiata o valore stante): la serie resta a
  cadenza fissa.
- **La catena fina è al completo.** L'ora spostata esce dall'agenda
  (`nextUnplayedRound`, `racesOnDay`, `impegni`, `elencoCompleto`) e arriva
  nel gioco: `nextRound` in race.mjs la applica e la raceCard la usa per
  il raceHour e il piano orario delle sessioni (priorità: ronda > serie >
  calendario), così il «Prepara tutto» scrive il gamemodesave all'ora
  spostata. Test a casa in agenda.test.mjs (9/9: override, reset, override
  stante, fuori banda). Il primo giro del test era sbagliato: colpa IO, non il
  motore: la ronda pendente non è la R0, l'attesa va presa dal motore e non
  presumere la R0.
- **Le quattro cure di OGGI**: (1) il chip-auto della Posta porta al
  Centro gare, non al Cruscotto, col pannello giusto (scheda serie + «scegli
  per oggi»); (2) le schede di Campionati portano al pieghevole GIUSTO
  (chiusura dei vicini + `scroll-margin-top` lungo il header) e la sezione si
  arricchisce: premio, tassa, griglia tipica, rep, prossima con data/ora/meteo;
  (3) il banner «Prima volta in EVO» esce dalla scheda gara (PC vergine:
  istruzione ormai nella guida), `weekendSeen` resta nel JSON per i collaudi;
  (4) il Banco A/B dei setup si muove nel GARAGE, accanto al segna del
  meccanico — dove le sessioni MoTeC si leggono mentre si lavora sul settaggio.
- **Verifica**: `npm test` 647/647, `node --check` su src (agenda, race,
  webui) e su tutti e cinque i gui/js toccati.

Su richiesta («avvia la GUI della sandbox su 8799 e ripassa le schede
senza cartelle dati: rivali, campionati, garage, segnala le zone piegate»)
il banco vergine è tornato in piedi (sandbox %TEMP%\evo-giro SENZA ACE,
carriera falsa «GiroSchede» in Coppa 500, webui su 8799) e le 19 schede
girate di nuovo:

- **Le zone di ieri confermano le cure**: Rivali onesto («nessun rivale
  ancora»), Campionati pieno (carte serie + calendario + classifica),
  Garage col catalogo e contatori a zero, Risultati/Piste/system-health
  come ieri — tutto in 200, nessun crollo da nessuna parte.
- **La TROVATA nuova**: 12× 500 nel console del browser, tutte sulla
  STESSA rotta che la pagina chiede in loop:
  `/api/ingegnere` → 500 «Cannot read properties of null (reading
  'sessionPhase')» a ogni tick del Cruscotto con EVO CHIUSO. Causa:
  [engineer.mjs:143](src%2Fengineer.mjs) `engineerLive()` legge
  `player.sessionPhase` PRIMA della guardia `if (!player || !inSession)`:
  senza shared memory lo snapshot non ha player e la funzione scoppia
  ANZICHÉ rispondere «tace». Cura minima: `const faseGioco = player ?
  String(player.sessionPhase ?? '').trim() : ''` — player null = fase
  vuota e payload onesto `{ ok, live:false }`.
- **Controprova dal vivo** (file curato + server riavviato + pagina
  fresca sul Cruscotto): 12 secondi di poll TUTTI 200 (`/api/ingegnere`
  compreso, che ora vive nel flusso regolarmente),
  `performance.getEntriesByType` senza NESSUNA risposta ≥ 400, console
  MUTA. Suite intera 646/646 con il test nuovo
  (test/ingegnere.test.mjs: player null non rompe, col e SENZA blocco
  session); Biome pulita sui 2 file toccati.
- **Nota di classe**: è il SECONDO difetto del genere di poll — un API
  che si interroga a ogni tick e esplode solo quando la SORGENTE non
  c'è: ieri `/api/system-health` con path null, stanotte
  `/api/ingegnere` con shared memory spenta. Nei PROSSIMI collaudi
  vergine il giro console lo prende di default, non a campione.

### 31/10/2026 — Le varianti pesanti se ne vanno: Standard ovunque, prescritto vero e conteggio allineato
- **Celle sintetiche col preset VERO** ([src/gridbuilder.mjs](src/gridbuilder.mjs)):
  la sintesi non innesta più il token inventato `preset_<carId>` — scrive il
  preset VERO del server, come fa Paddock. Il pernio carId→preset NON sta nel
  cars.json (solo preset→display→PI): si MINA dalle CELLE REALI già in giro
  (f3 ↔ f10.f1) — template corrente, poi gli altri della stessa cartella
  (cap 20), poi le griglie di fabbrica. Preferita la variante `mech_1`
  (Standard); display completo del catalogo; PI (f42) preso dal catalogo
  quando il donatore non lo porta. Mina memoizzata: l'FTA cambia i file →
  firma di dir (somma dei mtime) → nuova mina. Prova sul 695:
  `preset_695b_mech_1` e «Abarth 695 Biposto - Standard» nel testo della cella.
- **Spazzata varianti pesanti**: scansione (tmp/_sonda-varianti.mjs) di
  griglie-fabbrica e grid-templates per `_mech_(2|3|4)`; le serie toccate
  riscritte tutte Standard — 40 file di griglie-fabbrica in ordine, incluso
  `coppa_vintage-mini` che ha dato la lezione (griglia da 12 quando il
  gamemodesave aspettava 24).
- **Lezione del conteggio nel CLI** ([src/cli.mjs](src/cli.mjs)): il GATE del
  conteggio sta SOLO nella corsa dei candidati di `rebuildGridApply` — con
  `buildGridMessage` diretto una serie il cui template combacia col file di
  turno restava MAI allineata. `ac-evo-career griglia` ora passa da
  `rebuildGridApply` (stessi candidati, backup e magazzino) e nel report appare
  `conteggi N → M (allineato al gamemodesave)`.
- **Ronda Mini riprovata sul LIVE**: carriera di Mauro, serie `coppa_vintage-mini`,
  ronda 1 Donington riscritta col builder — 25 celle tutte `preset_jcs_mech_1`,
  finestra PI 9–10 allineata alla config (prima restando 10.000–11.000 della
  vecchia variante Tune). La prima APPLICA in gioco resta la verifica.
- **Volante del centro gare che non copre più il bottone**
  ([gui/js/viste-b.js](gui/js/viste-b.js) ): la volante si ATTACCA ESTERNA alla card (a destra, altrimenti a sinistra; ricade
  solo se i fianchi mancano):
  «scegli per oggi» torna cliccabile con l'anteprima aperta.
- Suite **679/679** exit 0, Biome 0 sui 4 file toccati. Il lavoro è NON
  committato (serie di griglie-fabbrica in attesa di committatura con Mauro).

### 31/10/2026 notte — Giro completo delle schede sul vergine: DUE zone piegate prese e curate

Il collaudo libero prosegue su richiesta di Mauro: sfoglia TUTTE le 19
schede della GUI sulla sandbox (carriera attiva, ZERO cartelle ACE), una
scheda alla volta, con estrazione del testo, console e log del server:

- **17 schede su 19 sane e oneste**: Centro gare, Setup, Analisi,
  Messaggi, Campionati, Griglia, Rivali, Auto, Garage, Archivio, Online,
  Giri liberi, Statistiche, Finanze, Difficoltà, Impostazioni, Cruscotto
  — ogni pannello dice la sua verità («nessun rivale», «nessuna
  sessione», «apri il wizard»), niente crollo da nessuna parte. «Aiuto»
  invece NON è una scheda: apre un modale sopra la vista corrente —
  giusto così, era solo l'inganno della snapshot.
- **Zona 1 — schede Risultati E Piste in errore nudo**: entrambe
  rispondevano «Cannot read properties of null (reading
  'resultsDirs')». Causa: [results.mjs](src%2Fresults.mjs)
  `listResultFiles` legge `paths.resultsDirs` SENZA del punto
  interrogativo, e la scheda Piste arriva lì via
  `sessionStatsFromResults` (il suo try-catch protegge solo la prima
  chiamata, la seconda resta nuda). Cura: `paths?.resultsDirs ?? []` —
  con le schede sanate di conseguenza.
- **Zona 2 — /api/system-health 500 a OGNI poll** (il cruscotto la
  interroga ogni 2 s: la console si riempiva di 40+ errori rossi):
  [webui-telem.mjs](src%2Fwebui-telem.mjs) `telemScanLocale` faceva
  `paths.dataDirs ?? []` — il null-guard stava sulla PROPRIETÀ, non
  sull'OGGETTO: con `paths` null scoppiava uguamente. Cura:
  `paths = paths ?? { dataDirs: [] }` in testa alla funzione.
- **Controprova dal vivo DOPO le cure** (i due file curati copiati nella
  sandbox, server riavviato): `system-health` 200, `import-inspect` 200
  con `files:[]`, `tracks` 200 col libro delle piste completo; console
  PULITA e rete tutta 200. Suite 645/645 con 3 test nuovi in
  [test/percorsi-null.test.mjs](test%2Fpercorsi-null.test.mjs), Biome
  pulita sui 3 file toccati. Commit `b1fc769`.
- **Nota di lezione**: è il difetto di classe che NON si vede mai sul PC
  di sviluppo (dove ACE c'è): solo il vergine lo ha esposto — ragione in
  più per ogni collaudo su installazione pulita.


### 31/10/2026 notte — Collaudo LIBERO del vergine: carriera falsa + PC senza ACE

Le due prove restanti del collaudo vergine dello zip amico v0.1.43, fatte
TUTTE dal vivo in sandbox (%TEMP%\evo-sbiz):

- **Carriera falsa via CLI**: `new` (AmicoTest ITA) → Coppa 500, Rookie,
  6000 ¤; `next` stampa ronda, sfida della ronda e difficoltà proposta.
  webui della sandbox su 8799: `/api/boot` `hasCareer:true` + header del
  pilota, `/api/card` con la ronda vera (Brands Hatch R1/5), `/api/status`
  pieno, `/api/wizard` `career:true`. PRIMO AVVIO COMPLETO VERDE, da solo.
- **PC senza ACE** (USERPROFILE reindirizzato su temp vuoto): la CLI
  (`setup`, `status`) rifiuta con il messaggio educato (strade cercate +
  rinvio `ACE_DATA`); webui su 8798: `/api/wizard` `dataDir:null` con i
  candidati TUTTI rossi e content a zero, `/api/boot` `dataDirs:[]`. Il
  cruscotto (foto in tmp/) mostra la carriera con ogni pannello onesto:
  verdetto «apri il wizard», MOTEC vuoto — niente crollo, nessun 400.
- **Bonus scoperto e lasciato stare (di progetto)**: nella sandbox il badge
  di livello dice «Fuoriclasse»: NON è bug — `appLevelBadge` legge il
  journal Paddock installato sulla MACCHINA («una sola verità»); nella
  sandbox atterra solo perché sul PC di Mauro c'è la cartella ACE reale.
  Su un amico senza Paddock il chip resta nascosto (rep < 490). Anche la
  barra «Aggiornamenti su GitHub» nel pacchetto è design: l'amico senza
  .git è curato da `aggiorna-zip` (zipball → copia → test, data/ intatto).
- Casa chiusa bene: server della sandbox (PID Windows 5132 e 21968)
  fermati con taskkill per PID (mai per nome), porte 8798 e 8799 libere,
  webui REALE su 8642 toccata in nessun modo.

### 31/10/2026 notte — Secondo cambio live CONFERMATO + storia VISIBILE nel pannello

Chiusura della rama metà serale:

- **Secondo cambio auto a gioco APERTO:** `gara-veloce` col PRESET «R5 5 giri
  Oulton» e `--auto ks_ford_escort_rs_cosworth` (force, gioco aperto). Il comando
  `demo:<startedAt>:ks_ford_escort_rs_cosworth` esce in fascia, l'app del Cruscotto
  lo prende e **l'ack vero torna: «Ford Escort RS Cosworth — auto impostata nel
  menu di EVO»** (21:54). La memoria storia lo replica: inviato → confermato.
- **Storia VISIBILE in gioco** («storia visibile in gioco»): il tooltip lo diceva
  solo al pallino — da qui il blocco PANNElLO «Cambio auto: il registro»
  ([uiapp/cruscotto/cruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js), inserito
  subito sotto la striscia nota): le ultime 4 righe della stessa memoria
  (`S.dati.storia`, ⏳ inviata / ✓ confermata), stessa formattazione del tooltip.
  Memoria vuota = niente blocco.
- Up della verifica: `test/storia-comando.test.mjs` 4/4, Biome e `node --check`
  verdi sul pannello; blocco collaudato nell'anteprima (`?loader=finto`) con le
  RIGHE VERE della giornata (Escort ⏳×2, R5 ✓).
- **La lezione del doppio «inviato»**: la memoria ha segnato DUE inviati con id
  diversi (il CLI arma la vetrina due volte in pochi secondi: prima un
  startedAt, poi un altro). Non è un bacchettino del dedup né del publisher —
  i comandi erano davvero due e l'ack ha fatto chiudere l'ultimo. La storia
  resta fedele: anche i ticchetti doppioni sono roba vera.

### 31/10/2026 notte — La STORIA del comando va nel tooltip (cambio auto a gioco APERTO)

«Collaudo il cambio auto a gioco aperto» + «storia del comando nel tooltip»:
finora il cambio auto a menu APERTO (setcar/evento/avvia con ack in ui_storage)
lasciava la traccia solo nel console della GUI. Da qui la memoria persistente
che il pannello racconta:

- [src/uiapp-pub.mjs](src%2Fuiapp-pub.mjs): `data/cruscotto-storia.json` —
  ogni comando che esce in fascia (stato «inviato», UNA volta per id, non una a
  sola fascia) e ogni ack che torna («confermato» con il messaggio dell'app)
  entra nella memoria (ultime 12, taglio in testa)
- la fascia del Cruscotto porta il campo `storia` (ultime 5, più recente prima);
- [uiapp%2Fcruscotto%2Fcruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js): il tooltip
  del pallino connessione porta le righe `comando HH:MM · TIPO nome — ✓ msg`
  (memoria vuota = riga taccia, pannello sereno);
- [tools/_preview-cruscotto.mjs](tools%2F_preview-cruscotto.mjs): il loader finto
  attivabile con `?loader=finto` nella URL — il semaforo e il tooltip collaudati
  FUORI dal gioco con lo stesso codice.
- **Collaudo a gioco APERTO:** il riavvio del publisher registra l'ack VERO
  della gara al volo del pomeriggio (id `demo:…:ks_renault_5_gt_turbo`,
  «auto impostata nel menu di EVO») — il cambio auto è avvenuto con il gioco
  aperto, la memoria l'ha beccato alla prima fascia.

**Test: test/storia-comando.test.mjs 4/4 (ordine in coda, fascia rovesciata con
limite, taglio a 12, file assente = memoria vuota) — priorità 39/39 verdi;
Biome pulita; tooltip visto in anteprima con la riga della storia vera.**

### 31/10/2026 notte — La Pitwall la RICHEDE la radio: le frasi della copilota a schermo in gioco

«Pitwall con la radio» (Mauro): il pannello Pitwall in gioco ora mostra ALSO le
frasi che il narratore ha già detto in gara, finora SOLO nel pannello GUI del
browser. Il file già esiste (data/copilot-voce-24-10.jsonl): nessuna nuova
sorgente, solo un nuovo orecchio.

- [src/voce-copilota.mjs](src%2Fvoce-copilota.mjs): `LOG_VOCE_FILE` (il percorso
  definito UNA volta, regola `EVO_DATA_DIR` della casa) + `leggiRadioVoce()`: ultime
  frasi dal più recente, le righe evento NON parlano, file assente → `[]` (la radio
  è un plus, mai un ammazzatick). [src/webui.mjs](src%2Fwebui.mjs) NON definisce più
  il suo percorso: riceve da qui.
- [src/uiapp-pub.mjs](src%2Fuiapp-pub.mjs): la MINI-PITWALL (`miniPitwall`, payload
  quotato) porta il campo `radio` — ULTIME 6 frasi con un memo a statSync: si
  rilegge SOLO quando il file cresce (stessa lezione del cacheVerdetto).
- [uiapp%2Fpitwall%2Fpitwall.js](uiapp%2Fpitwall%2Fpitwall.js): gruppo «📻 Radio del
  copilota» (ora HH:MM · frase), sotto i Consigli dal BOX; nessuna frase = gruppo
  taccio, mai un mucchio vuoto. Reinstallato con tools/installa-pitwall.mjs.
- server webui riavviato con tools/riavvia-webui.mjs (il publisher vecchio aveva
  la payload di prima: senza riavvio la radio restava fuori — la respinta vecchia).

**Test: test/pitwall-radio.test.mjs 4/4 (ordine, eventi muto, file assente, chiavi
payload + aggiornamento live) — voce-copilota + uiapp-pub-priorità 42/42 verdi;
Biome su 5 file pulita; anteprima _preview-pitwall.mjs: gruppo radio VISIBILE con
le frasi vere di gara (P13, giro al best, ultimo giro), console solo le due log
aspettate.** In gioco: aprire la voce PITWALL del drawer APPS — la radio c'è dopo
il riavvio del server (fatto).

### 30/10/2026 notte — Il riquadro vuoto aveva un SECONDO colpevole: il TAG del layout

«Riavviato EVO e Oulton Park ancora senza la foto»: la riparazione di ieri sera
(pit slot 30→16) era giusta ma incompleta. Diff campo per campo tra il file che
il GIOCO ha riscritto da solo al pick manuale alle 18:31 (backup
bak-track-2026-10-30T18-31) e i due file riscritti dal tool dopo:

- **dal gioco alle 18:31**: tag `International` · layout `International Race`
  (tutti e 4 i blocchi weekend, campione per campione);
- **dal tool alle 19:05/19:46**: tag `GP` · layout `GP Race` (i DEFAULT di
  specFor, stavolta sbagliati — Oulton NON è mono-layout e "oulton_park-gp"
  non esiste come testo)

- [tools/set-track.mjs](tools%2Fset-track.mjs): `oulton_park` entra nei
  TRACK_SPECIALS con i valori OSSERVATI dal campo (tag/layout/nome), come già
  per Paul Ricard e Sebring; i default "GP"/"GP Race" non perdono più i valori
  veri
- riscritti WEEKEND (4 blocchi) e INSTANT_RACE (1 blocco) con backup
  `.bak-track-2026-10-30T20-03`, rilettura 0 campi ancora da cambiare
- test nuovo [test/set-track-spec.test.mjs](test%2Fset-track-spec.test.mjs), 3
  casi: Oulton sui valori osservati (tag/layout/pit/GBR/4333), Paul Ricard
  resta col suo special, Monza resta sui default GP/GP Race + pit 30

**Test: set-track-spec 3/3, grid-templates 9/9, lint Biome su 2 file pulita.**
Nella GUI la finestra pista torna con la tessera: basta RIAPRIRE la schermata
gara (o tornare indietro e rientrare nel menu) — il file sul disco è già in
forma sana. Se non la rilegge, un riavvio lo chiude: EVO tiene la schermata
aperta in memoria finché non la ricarica.

### 31/10/2026 — Rotazione bak AUTOMATICA + Pitwall RICOSTRUITO (solo informazioni)

Due richieste di Mauro dell'ultima sera di ottobre, sistemate in un colpo:

- **ROTAZIONE BAK AUTOMATICA**: la mietitura `pruneBackups` (tetto 25, in
  tools/evo-grid.mjs) girava già da grid-apply, set-instantrace, weekend-roster
  e gara-veloce, ma gli altri scrittori la tenevano appesa; ora la chiamata
  segue la scrittura del backup, dappertutto: set-track (bak-track, bak-ai,
  bak-gridmode), set-weekend (bak-weekend, 3 punti), set-racetime
  (bak-racetime, 2 punti), weekend-laps (bak-laps), set-car (bak-car),
  set-driver-car (bak senza tag), grid-balance (bak-bal), weather (bak-wx,
  2 punti) e il bak-evento del «Prepara» dell'evento dentro webui.mjs.
  Ragione della nota: UNA sola potatura per scrittura. Le copie one-shot di
  interventi umani (.bak-msggen, .bak-merge, .bak-ripara) NON si toccano:
  quelle restano cura del loro tool, e pota-bak.mjs RESTA il pulitore
  generale a mano (full-famiglia) per quando serve una grande pulizia.
- **PITWALL RICOSTRUITO**: la sorgente era stata tolta di proposito il 30/10
  pomeriggio e Mauro l'ha chiesta indietro con un perimetro NUOVO e chiaro:
  **pannello SOLO-INFORMAZIONI**. L'app pitwall (app.json + pitwall.js in
  uiapp/pitwall/ — pattern paddock/cruscotto: niente pagina consegnata,
  pannello position:fixed che si apre dalla voce PITWALL del drawer APPS)
  NON tocca window.engine: niente comandi al menu, nessuna auto cambiata per
  conto suo — quelle mani restano al Cruscotto. I DATI: il publisher del
  cruscotto (uiapp-pub.mjs) ora scrive a STESSA fascia una mini-payload
  pitwall (consigli · verdetto · la sincro «Prepara e Divertiti») nella
  cartella SUA, SOLO SE installata: un solo costruttore, due consumatori.
  tools/installa-pitwall.mjs copia app.json + pitwall.js nel loader e crea il
  marcatore settingspreset (lezione 27/10 17:55: senza marcatore l'app non
  esiste per il loader). FATTO: app installata in Saved Games.
  Anteprima browser: tools/_preview-pitwall.mjs (porta 9107, fasce vere da
  disco, shell col drawer finto) — provata nel thread: pannello aperto dal
  drawer, sincro della ronda col via, verdetto con la tabella che si apre,
  consigli che lasciano il posto quando la scheda del gioco è spenta.

Verifica: node --test sui file del publisher (uiapp-pub-guard / uiapp-card /
uiapp-pub-priorita, 47/47) e dei bak (pota-log + backup-rotation, 5/5).
Da fare al prossimo avvia.cmd: il webui riparte COL publisher nuovo e la
Pitwall riceve le sue fasce in gioco (per ora l'anteprima lavora già, con le
fasce vere).

---

### 30/10/2026 notte — Il collaudo migliore: radio precisa in gara vera (Oulton Park)

Mauro a fine gara: «finito gara Oulton Park, fantastico, il copilot è
preciso». Dopo la cura del ping (la voce era muta in pista per la guardia
sfasata) la gara vera ha confermato la filiera tutta in piedi: Cosimo in
pista, frasi al posto giusto, niente doppie. È la prova n.1 del «Collaudo
in gara» (vai in [COMANDI-BUFFY.md](COMANDI-BUFFY.md)) — riuscita senza
impianti extra: la voce parla col codice di casa e tiene tutta la gara. La serie dei comandi fissi di Mauro («Collaudo in gara»,
«Radio muta dal pannello», «Radio anche nel monitor GUI») è stata
documentata in [COMANDI-BUFFY.md](COMANDI-BUFFY.md) così si rilanciano
come card, senza rispiegarli ogni volta.

---

### 30/10/2026 sera — La radio del Pitwall non tace più per colpa di una scheda

Mauro: «il copilot non va in gioco, sul browser funziona». La diagnosi è nel
registro data/copilot-voce-24-10.jsonl: SESSIONE VIVA e poi, a 3'25",
«SILENZIO — la pagina ha la copilota OFF (ping)» fino a fine gara. La causa
era la GUARDIA del ping della 3ª cura del 29/10: due comandi sfasati
(chip della barra viste-d.js su localStorage e chip del pannello viste-a.js)
pingavano on:false ogni 10 s da una scheda GUI lasciata aperta in secondo
piano, la finestra di 20 s NON scadeva mai e Cosimo restava MUTO IN PISTA.
Nel browser invece la voce «funzionava» perché lì si sentiva l'altra fonte
(radio parlata dalla pagina), non Cosimo.

Cura: la guardia del ping RITIRATA dal tick (src/webui.mjs,
copilotaServerTickInterno). La radio la comanda SOLO il config
(evo.config.json voceCopilota, via POST voce-server o Impostazioni); il
ping resta SOLO diagnostica (riga STATO: paginaPingMs/paginaPingOn). Il
silenzio voluto esiste ancora: si dichiara col POST voce-server on:false,
che persiste nel config; non più col chip della barra, che ora muove solo
la radio locale.

Verifica: prova diretta della radio reale (POST /api/voce-prova su 8642,
config full) → ok; MMF sonda (tools/probe-mmf.ps1) con gioco vivo →
static/graphics presenti. Suite npm test e lint a seguire sotto.

---

### 30/10/2026 tardo pomeriggio — Prova vera dei bak, e il menu della griglia prende le CLASSI VIVE

Tre richieste di Mauro («prova vera dei bak», «menu con classi vive», «gira la
suite completa») sistemate in un colpo:

- **PROVA VERA dei bak** ([tmp/prova-bak.mjs](tmp/prova-bak.mjs), provino
  one-off): due scritture ravvicinate dell'INSTANT_RACE REALE col disco
  cambiato fra le due (31→32 min a tempo, banda 88–93→89–94), a gioco APERTO
  col canale della GUI (force + backup, come gara-veloce da webui). Esito:
  TRE bak distinti nello stesso minuto — `bak-temprace-…T16-22-50`,
  `bak-temprace-…T16-22-50-r2` (SUFFISSO -r2 sul pareggio dello stesso
  secondo: nessuna versione perduta) e `bak-instantai-…T16-22-51`; verificato
  byte a byte che il PRISTINE e lo stato di mezzo RESTANO dentro gli bak. A
  fine prova il file è ripartinuto ESATTO (ripristino tmp+rename, byte
  identici confermati). La regola 28/10 della mietitura dei bak, da oggi è
  provata sul campo anche a mano, non solo in sandbox.
- **MENU CON CLASSI VIVE**: il menu «griglia» della gara al volo NON è più
  un elenco scritto a mano (GT3+GT4 e le tre endurance tappate). Nuova
  funzione `griglieConClassiVive(perClasse)` in
  [src/classi-gt.mjs](src/classi-gt.mjs), chiamata dall'endpoint `gv-liste`:  
  UNA riga monoclasse per ogni classe con almeno un'auto del libro OGGI, una
  multiclasse per OGNI combinazione di 2–4 classi vive, e con oltre 4 classi
  l'endurance INTERA in coda. Sul ladder reale (GT1 1, GT2 1, GT3 6, GT4 2)
  il menu vive 15 combinazioni, non più le 5 fisse: se il ladder cambia, il
  menu cambia con lui.
- **SUITE COMPLETA**: npm test — 612 test, TUTTI verdi; lint Biome pulito
  (273 file). Il run dopo la chiamata giusta (npm test, non `node --test test/`:  
  in Windows quel glob non espande e urta MODULE_NOT_FOUND).

### 30/10/2026 sera — Preset «con la mia auto» e la durata consigliata per pista

Due richieste di Mauro in una botta unica («preset con la mia auto» + «durata
consigliata per pista»), entrambe sulla Gara al volo:

- **PRESET COL NOME su [tools/_gara-veloce.mjs](tools/_gara-veloce.mjs)**:
  `salvaPreset`/`leggiPreset`/`elencoPreset`/`cancellaPreset` su un JSON
  ATOMICO accanto al registro (data/preset-gara-veloce.json, in sandbox nei
  test). Una ricetta salvata passa per `ricettaNetta()` — la STESSA
  normalizzazione di `garaVeloce` (giri o tempo esclusivi, durata > 0 con
  arrotondamento, banda 0–100) con i SUOI codici di errore: un preset si
  «carica e parte» solo se è una gara che `garaVeloce` farebbe davvero.
  Il sedile entra COME TUTTO il resto: `auto: 'ks_ferrari_296_gt3'` dentro il
  preset. Ri-salvare è cura (sovrascrive), cancellare è idempotente.
- **Endpoint webui `gv-preset`** (salva / elenco / carica / cancella) e riga
  nel pannello Gara al volo di [gui/js/viste-a.js](gui/js/viste-a.js): menu e
  bottoni 💾/🗑 che parlano gli stessi ID auto del ladder già in gv-liste.
- **DURATA CONSIGLIATA**: `hotlapsPistaGiro(pista, auto?)` in
  [src/hotlaps.mjs](src/hotlaps.mjs) legge il quaderno dei giri e torna il PB
  della pista (tra prove e libere, MAI gara) — con auto nota il PB della SUA
  auto. Pista fuori dal libro o quaderno vuoto → null, silenzio, niente
  cifre inventate. Anche qui i dati reali: PB Monza 1:33.306 in SF-25.
  Endpoint `gv-giro-pista` e un suggerimento in GUI accanto alla durata.

Verifica: test/preset-gara-veloce.test.mjs 5/5 (round-trip col sedile,
validazione invariata al salvataggio, overwrite/ordine/idempotenza, PB di
pista e per-auto con quaderno e reali di Monza), suite vicine
gara-veloce + hotlaps + set-instantrace 34/34, Biome pulito sui 4 file toccati.

### 30/10/2026 (bis) — Il dottore riceve i suoi primi test (e un ramo morto esce)

Sonda di copertura completa: nella lista dei moduli MAI toccati da nessun test
c'era anche integrity.mjs, il revisore dei conti della carriera — probabilmente
il modulo più critico di tutti, e nessun test lo proteggeva. Fetta presa:

- **test/integrity.test.mjs (14 casi)**: senza gare → zero anomalie; carriera
  coerente → zero; statistiche storte → HIGH per ognuna dei contatori;
  giri storto → MEDIUM coi due dati nel testo; cassa/rep fuori dal registro
  → HIGH col segno della differenza (diff 1000 / diff -7 veri nel testo);
  ritiro con posizione 1 → MEDIUM «dati contraddittori» col nome del nodo;
  annuncio mancante con bacheca viva → LOW, annuncio spinto fuori dal cap
  → SILENZIO (la regola dei 60 annunci scappati), rawPos di penalità e match
  a due secondi con «premio» → SILENZIO; fixIntegrity in dryRun → cura elencata
  e stato IMMUTATO (anche il save non toccato), con lente vera → tutto
  sistemato, flows re-seeded, zero anomalie e save atomico presente nel nido.
- **BUG TROVATO E CORRETTO**: la regola «miglior giro in formato strano» era
  un ramo morto da sempre — lapMs ritorna Infinity sul formato sbagliato
  e `!Infinity` è falso, l'anomalia non si segnala MAI. In src/integrity.mjs
  ora matcha con `!Number.isFinite(lapMs(r.bestLap))`; il test la vede.
- **test/pota-log.test.mjs (3 casi)**: la potatura keep-last scritta in
  mattinata (car-match + flows watchdog) entra in suite: append normale sotto
  soglia non tocca il file; oltre 512 KB le righe vecchie dell'inizio vanno,
  le ultime e quelle appese DOPO il taglio restano; il watchdog del registro
  porta pid e ragione nella riga fresca. (Le fasi di soglia reali, 512 KB,
  non la soglia errata del primo giro di test.)

Verifiche: i due file nuovi 17/17 verdi, suite completa 605/605 (da 588),
biome pulita su tutti i file toccati.

### 30/10/2026 — La spazzata dei dati si fa (A2+A3) e i due log senza freno vengono cavati

Ultimo residuo dell'audit del 28/10: la spazzata manuale. Fatta sul vivo,
con due correzioni rispetto alle ipotesi di quel giorno (riportate nel
[report dell'audit](report/audit-dati-2026-10-28.md) aggiornato):

- **griglie-grezz/ non era un sospetto da mezz'ora: era il grosso** — 434
  file, 5,3 MB di customgrid grezzi del 23/24-10. Unico referente nel
  codice: tools/_merge-r5.mjs, operazione R5 chiusa il 25/10 (le celle
  uniche sono già fuse nel template). Cancellata tutta.
- **slot-3/ non era un fantasma: è il nido registri per-slot** (rivals,
  risultati, customgrid del 25/10). Resta tutto. E i 9 bak del customgrid
  restano anche loro: la potatura unica `pruneBackups` (keep=25) è il
  padrone di quella pila, non la spazzata.

Via (zero riferimenti nel codice, tutti verificati): tutto griglie-grezz,
zip arido slot-1 da 158 B, 2 `grid-classes.json.bak-stile-*`,
3 `career.evo.ladder.json.bak-{cal-,stile-*}`,`grid-classes.bak-zavorra-
28-10.json`. Restati gli zip FULL in rotazione (unica copia completa,
MAX_ZIP=4 li scarta da solo). Bilancio: ~5,4 MB e 439 file.

**E a casa la cavità vera**: match-auto.log aveva 19,9 MB e flows-debug
.jsonl 1,4 MB perché entrambi gli append erano senza freno (punto A3:
diagnosi giusta, rimedio mancato). Ora car-match.mjs e flows.mjs hanno
una potatura keep-last condivisa (se oltre 512 KB → tenute le ultime 600
righe, sempre MAI throw, il log non deve bloccare mai nessuno). Verificato
al banco in sandbox: file da 600 KB → 84 KB dopo la prima scrittura, le
righe vecchie vanno, le righe nuove e il watchdog restano. I due grossi
veri si accorciano da soli alla prima preparazione/import del gioco.

Verifiche: life.test 13/13, biome pulita su entrambi i file.

### 31/10/2026 — La prossima fetta di copertura: setupAB e seatMonteCarlo entrano nel test
La fetta promessa nella voce «L'area debole #2» (31/10 notte) è presa:
[test/analisi.test.mjs](test/analisi.test.mjs) passa da 7 a 14 casi e gli DUE
strumenti di analisi.mjs che restavano scoperti ora hanno i loro test:

- **Banco A/B (`setupAB`) — fixture MoTeC**: builder del `.ld` sintetico
  (stesso formato decodificato di laptrace.test.mjs: FUEL@20Hz +
  SPEED/THROTTLE/BRAKE/TYRE_PRESS_LF@60Hz, beacon nel `.ldx` in
  MICROSECONDI). Sessione A (base): 4 giri 20/21/22/23 s con l'ingresso in
  frenata che cambia per giro 270/260/250/240 — la «matita» che cammina;
  sessione B (prova): stesso profilo +40 km/h, mai freno. Test: file
  illeggibile → ok:false con messaggio (non crash); B più veloce →
  deltaBest +4 s esatto, gained 0 e il netto tutto «perso da A»; preset
  base/prova letti dal nome file; il freno di A pesa in zona frenata ma il
  grosso resta a gas pieno; matita in vista col messaggio «Costanza in
  frenata»; STESSO file due volte → pari sul best, zone tutte a zero,
  «niente dominante».
- **Monte Carlo del sedile (`seatMonteCarlo`) — fixture ladder+state**:
  stesso schema di life.test/race-card (parco 30 piloti con cons/aggr,
  perché il rumore del motore rivali li legge) + profilo osservato del
  pilota (5 gare, 1 ritiro → dnfRate 20%). Test: offerta di fine stagione
  simulata con aritmetica del saldo verificata (premio atteso − affitto −
  fee·ronde), DNF attesa entro ±6 punti dal 20% osservato, domini 0..100
  su tutti i % e disclaimer «ordine di GRANDEZZA» in pagina;
  DETERMINISTICO (due simulazioni identiche per gli stessi input, seed
  condiviso); senza offerte → serie aperte col gate superato + rinnovo,
  mai la serie sotto; serie corrente ignota → ok:false onesto; offerta
  fantasma → scartata in silenzio, zero sedili.

Verificato a scrivere i test: la regex STRETTA di `presetOf` in
[src/motec.mjs](src/motec.mjs) e il suo fallback greedy passano ANCHE
sui NOMI VERI. Misure sui 241 file `.ld` veri di Saved Games/ACE/MoTec:
regex STRETTA 241/241, fallback 0 — il nome vero è
`<auto>_preset_<preset>_<pista>_<giorno>…` (es. preset «695b_mech_1»,
senza spazi) e il preset esce intero con i suoi underscore. La cascata
sta com'è: il fallback è residuo di formati antichi, niente da riparare.
I fixture del test usano un nome nel formato che la regex stretta vuole
("_test_" fra preset e data).

Verifica: lint Biome pulita sul file toccato, node --test 14/14 verdi
(260 ms). Zero cambi in src: la fetta era soltanto di copertura.

### 31/10/2026 sera — La pila dei bak: UN nome, UNA potatura, applicata dappertutto (e il filtro che NON li vedeva)
Sul dirittivo dell'area di ieri: `bakName` copiato in TRE posti (grid-apply,
weekend-roster) e la potatura viveva SOLO in grid-apply — i bak di
`timedRace`, `setInstantAi` e `bak-veloce` crescevano senza freno.

- **Una fonte**: [tools/evo-grid.mjs](tools/evo-grid.mjs) ora porta `bakName`
  + `pruneBackups`; grid-apply re-esporta (cli e corrupt-inputs stare al posto
  loro), weekend-roster ha buttato le sue copie (bakName e potatura).
- **Il buco del filtro** (scoperto applicando la potatura): `pruneBackups`
  contava solo i bak col NUMERO ALL'INIZIO dopo `.bak-` (formato antico
  senza tag) — tutti i bak moderni col tag (`bak-veloce-2026-…`) uscivano NaN
  e NON venivano mai potati (l'audit 28/10 A3 aveva già beccato lo stesso
  difetto per `bak-ripara-*`). Ora il filtro cerca la DATA (4 cifre) in
  qualunque posizione dopo `.bak-`: taggati e senza tag in un'unica pila,
  i nomi senza data restano fuori.
- **Tetto 25 applicato** a: blocco Race a tempo/giri, banda AI dell'istantanea,
  griglia dal pool, roster weekend (che già aveva la sua copia, stessa soglia).

Verifica: lint pulito, 43/43 (corrupt-inputs con il TEST NUOVO dei bak taggati,
set-instantrace, gara-veloce), 22/22 grid-templates + gridbuilder-uniche +
webui-smoke + game-owned.

### 31/10/2026 tardo pomeriggio — La Gara al volo senza angoli ciechi: bak anti-collisione e segna-stato onesto
Giro di vigilanza sul flusso «gara personalizzata» (_gara-veloce + set-instantrace
+ GUI) del giorno prima. Sospetto ISSUTO (l'idempotenza «non nel codice») POTUTO
A FALSO: il confronto byte della griglia dal pool c'è (andava verificato prima di
correggere, non dopo). Le aree deboli vere erano altre tre, tutte riparate:

- **Bak al minuto si sovrascrivevano**: la lezione 28/10 di grid-apply (nomi
  bak con solo minuti → due scritture nello stesso minuto cancellano la pila)
  NON era arrivata agli altri scrittori. `evo-grid.bakName` condivide ora la
  cura (secondi + suffisso -rN sul pareggio di secondo) ed è usata da
  `timedRace` (bak-temprace), `setInstantAi` (bak-instantai) e la griglia dal
  pool (bak-veloce). Test: due scritture ravvicinate lasciano DUE bak.
- **Segna-stato mentitore**: garaVeloce ritorna 200 anche con passi KO (giusto:
  la lista ✓/✗ serve) ma la GUI tostava sempre verde «Scritto». Ora il toast
  diventa un warn che punta ai ✗ dell'esito ([gui/js/viste-a.js](gui/js/viste-a.js)).
- **Test mancanti dell'idempotenza griglia**: [test/gara-veloce.test.mjs](test/gara-veloce.test.mjs)
  ora prova la STESSA ricetta col pool due volte (seconda = «già identiche sul
  disco», zero bak nuovi — la regola 30/10 resta in piedi, non più solo promessa).

Verifica: lint Biome pulito, 27/27 gusti set-instantrace+gara-veloce (4 nuovi),
15/15 webui-smoke + grid-templates + gridbuilder-uniche.

### 30/10/2026 ore 14:10 — PARTE SUBITO: l'ultima ricetta della Gara al volo si rilancia con un bottone
La lamentela: «ogni volta ci sono sempre problemi con auto, griglie, piste o
gara tempo/giri» — reimpostare la stessa gara era noia e fonte d'errori (gli  id auto battuti a mano ieri l'hanno già pagata). Tre canali aggiunti al

- **Il registro è la RICETTA**: ogni scrittura vera di `garaVeloce` registra
  TUTTI i parametri (giri/tempo, banda, pista, sedile, pool). Nuova funzione
  `ultimaRicetta()` in tools/_gara-veloce.mjs la rilegge (null a registro
  vuoto, mai un'eccezione). Nota: la story FULL-FILE WRITE di oggi aveva
  perso `formattaRigaRegistro` (import di uiapp-pub): export
  rimessa a posto e il smoke card+paddock e webui-smoke passano di nuovo.
- **Endpoint webui `parti-subito`**: ri-esegue la ricetta con garaVeloce
  (force via bridge, come 'gara-veloce'); idempotente per costruzione — la
  STESSA ricetta due volte riscrive SOLO ciò che il menu di EVO ha cambiato
  nel frattempo, e la griglia dal pool ora collauda i byte PRIMA di
  scrivere: identici → «già identiche sul disco», niente backup né riga.
- **Endpoint webui `gv-liste` + datalist in GUI**: i campi SEDILE/POOL si
  appoggiano agli ID auto del libro ladder (value = id, label = nome) e il
  campo PISTA ai nomi del libro TRACK_INFO: niente più id battuti a mano
  sbagliati. La GUI precompila anche i campi VUOTI con l'ultima ricetta
  (una sola volta: i valori battuti a mano restano) e il bottone ▶ in cima
  al pannello mostra l'anteprima della ricetta in canna.

Resta fuori dal bottone: il menu griglia di EVO (APPLICA coi pool) e la
partenza — com'era per il CLI già dal 3/11.

### 30/10/2026 ore 14:40 — La Gara al volo si sceglie in MENU: auto, piste e preset di griglia mono/multiclasse
Seconda metà della stessa richiesta («dammi menu a tendina per piste, auto,
griglie mono o multiclasse»): i tre campi dell'istantanea diventano SELECT.

- **AUTO e PISTA**: menu costruiti dall'endpoint `gv-liste` (libro ladder +
  TRACK_INFO, ordinati per nome). Il datalist resta per il pool A MANO.
- **GRIGLIA**: un menu di PRESET riempie il pool a fianco (comunque
  modificabile). I preset sono le classi per NOME auto con `classeAuto`
  (classi-gt.mjs, la STESSA classificazione del rapporto di gara): mono per
  classe con almeno un'auto (GT1, GT2, GT3, GT4, …) e multiclasse sulle
  combinazioni attese — «GT3 + GT4», «Hypercar + GT3», «Hypercar + GT3 +
  GT4 — endurance», «Hypercar + LMP2 + GT3 + GT4 — endurance completa».
  Sul libro attuale escono: GT1 (1), GT2 (1), GT3 (6), GT4 (2) e GT3+GT4 (8).
- **Il pool resta la fonte**: preset scelto → riempie il campo pool; pool
  toccato a mano → il menu torna «personalizzata». Il prefill dell'ultima
  ricetta si applica quando i menu sono PRONTI (gvListeOk): un valore
  fuori menù si aggiunge marcato «(fuori menu)», mai rimpiazzato.

Verifica: lint pulito, gara-veloce+webui-smoke 14/14, preset collaudati
sul server vivo (46 auto, 18 piste, 5 preset). Riavvio webui fatto: F5 ella
GUI si vedono i menu.

### 30/10/2026 ore 12:42 — Il weekend REALE arma Monza + griglia endurance (pista, cartuccia, roster, banda AI)
Mauro era sul Weekend di Gara spinato: auto cambiata (Audi GT4 Evo, sedile del
Cruscotto) ma pista Donington e griglia GT3 di carriera ferme — l'istantanea
garaVeloce non tocca il RACE_WEEKEND (come da lezione 23/10). Il canale di
scrivere NEL weekend aperto è però collaudato (set-track 3 cicli 20/10,
setWeekendAi, trapianto roster 29/10). Tre scritture con backup:

- **Pista Monza** nei 4 blocchi (`set-track --track Monza`), rilettura 0 campi;
- **Cartuccia customgrid 16 celle** col pool endurance F40 LM + 296 GT3
  (builder, `noBalance` eventi ospiti, banda AI 88–93 nel customgrid,
  bersaglio = dichiarato 15 +1 in CUSTOM, mai sotto le 14 native il gate 24/10);
- **Trapianto roster**: le prime 14 celle nei 14 slot del Practice del
  gamemodesave (`syncRoster`), così la ronda NON spawna più le GT3 di carriera
  neanche al lancio senza APPLICA;
- **Banda AI weekend 88–93** (cursori 30/31).

Resta SOLO un gesto: nel menu griglia del round premere **APPLICA** (monta le
16 celle della cartuccia) e poi PARTI. La Race resta **3 giri** (per progetto:
la durata a tempo della Race del weekend non si scrive, `set-racetime` la
rifuta — canale di collaudo a tempo = gara personalizzata). Il tool one-off:
tmp/weekend-al-volo.mjs (temporaneo, rimosso: Il SUO pool peccava — vedi 12:55).

### 30/10/2026 ore 12:55 — Corretto: la griglia va fotocopiata dai TEMPLATE veri, non sintetizzata
Al menu griglia Mauro vede APPLICA grigio e senza anteprime auto: le celle che
avevo scritto al 12:42 erano celle SINTETICHE del builder (opt-in `celleNuove`:
id/nome/preset `preset_+id` innestati su una cella donatrice — per costruzione
crude: «la prima APPLICA è la verifica»), e in più l'id pool `ks_f40_lm` era
ERRATO: il vero è **`ks_ferrari_f40_lm`** (per questo il builder vedeva la F40
«mai in griglia» e la sintetizzava, con l'anteprima morta). La cura, in un colpo:

- **Celle byte-per-byte dai template VERI** di magazzino
  (`coppa_ferrari-f40-lm.customgrid` e `coppa_ferrari-296-gt3.customgrid`, la
  fotografia degli eventi con le STESSE auto): 16 celle interlacciate 8+8
  (pari F40, dispari 296), piloti veri allineati allo stesso interlacciamento,
  preset veri (`F40 LM Preset Base` / `296 GT3 SRO`), config con count 16,
  AI 88–93, finestra PI 19–22 (span copre entrambe). Cartuccia e roster
  riscritti, rilettura ok (preset e nomi veri).
- **Lezione principale**: i preset VERI non si inventano dal catalogo auto
  (cars.json porta nomi e PI, basta al Paddock per SCELGERE il pool ma non per
  GENERARE celle): le celle vere si fotocano SOLO dai template fotografati in
  EVO (GENERA→APPLICA una volta per pool). Il Paddock «Gara al volo» passa per
  gli STESSI canali (builder+template), con il catalogo come fonte di nomi/PI.
  Da qui in avanti: il pool «endurance» di garaVeloce/pannello va scritto con
  `ks_ferrari_f40_lm,ks_ferrari_296_gt3` e, se un'auto non ha template in
  magazzino, FOTOGRAFARLA prima (una volta sola); il sintetico resta solo
  collaudo, mai per le gare serie.
- **APPLICA grigio**: è il menu EVO che sblocca il bottone SOLO con una
  modifica dentro la griglia (trascina una cella o muovi un cursore): non è un
  guasto nostro. Con le celle NOSTRE non serve: PARTI dopo l'APPLICA di un
  gesto qualsiasi (o al PROSSIMO menu, se il round resta montato).

Il tool one-off del 12:55: `tmp/pool-templates-weekend.mjs` (temporaneo: la
buona regola per i flussi ora è «assegna il pool SOLO dai template di magazzino
+ interlacciamento», come fa _genera-multi.mjs per le multiclasse).

### 30/10/2026 pomeriggio — Prova del copilota IN PAGINA (nucleo + chip «♪ prova») e il collaudo onesto della radio
Tre prove fatte con la pagina viva su http://127.0.0.1:8642 (GUI servita con
narratore-unito.js loaded):

- **Nucleo sintetico in pagina**: la STESSA funzione `narratore(m, slot, ora)`
  che parla in gara è stata guidata con un payload di gara completa
  (giro 2 con delta, meta, benzina, gomme, bandiera, stint). Regole
  confermate in pagina: prima lettura = seme zitta (bandiera già a scacchi
  al primo tick NON parla); bandiera in coda esce al giro successivo o alla scadenza di
  10 s; le frasi «giro 1» e meta arrivano conservando il
  `lapsTotal` VERO (senza totale vale il ramo 8c, ronde a tempo).
- **Chip «♪ prova»**: clicca e parla sul vero: handler in
  [gui/js/viste-d.js](gui/js/viste-d.js) chiama
  `speechSynthesis.speak('Prova della voce copilota...')` (verificato con
  hook su speak, non solo col flag `speaking`).
- **Area debole trovata e chiusa**: il chip «♪ prova» collaudava SOLO la voce
  del BROWSER, ma in gara la copilota del Pitwall parla con la voce del
  SERVER (Cosimo/System.Speech via voceSrv) — timbro diverso, prova menzognera.
  Ora il chip prova PRIMA la radio vera (`POST /api/voce-prova`, lo stesso
  del bottone «prova la radio» nelle Impostazioni): risposta 200 con
  `livello: full` e il repertorio del livello in coda a Cosimo (provato:
  «Prova della radio, livello full... Bandiera a scacchi!»). Se la radio è
  spenta (400) o il server offline, cade sulla prova classica del browser,
  identica a prima. Il tooltip in [gui/index.html](gui/index.html) dice ora
  entrambe le cose.

**Suite 575/575, Biome pulita.**

### 31/10/2026 notte — I narratori UNIFICATI (una sola copia) e la scansione MoTeC estratta dal webui
Presi i tre compiti del momento: unificare i narratori, far girare la suite,
refactoring mirato. I duplicati erano veri, con un motivo di nascere: il nucleo
testato `narratore(m, slot, ora)` viveva in [tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs)
(e lo usano [src/voce-copilota.mjs](src/voce-copilota.mjs) e il test) mentre la
cruscotto ne teneva le GEMELLE manuali narratore per narratore in
[gui/js/viste-a.js](gui/js/viste-a.js) — ogni cura (bandiera prima del giro,
postalk gate a verde, delta solo da «tracked») andava applicata DUE volte.

- **Nucleo UNICO**: il narratore muove in [gui/js/narratore-unito.js](gui/js/narratore-unito.js)
  (23 KB, caricato come script classico → attacca `globalThis.__EVO_NARRATORE`,
  importato dal monitor come facciata Node → [voce-copilota.mjs](src/voce-copilota.mjs)
  e il test cambiano ZERO voci). Le frasi restano {chi, it}: la copilota parla
  sempre italiano (cpT).
- **viste-a.js**: ~320 righe di gemelli fuori (1 delta, 2 giro, 3/3b benzina,
  4 gomme, 5 gap, 6/6b/6c pit-box, 7 autofuori, 8/8b/8c/8d ultimogiro+bandiera,
  9/9-ter posizione+verde, 10 blu); resta la pagina SOLO le decisioni di
  visibilità (chip, radio server, grazia) e la chiamata al nucleo con lo slot
  `cp` (cp.said = alias rinfrescato di cp.detti). cpSay e bandParla orfani fuori.
- **autofuori**: il narratore 7 (auto fuori parco, 30 s) entra anch'esso nel
  nucleo — nel Pitwall resta zitto finché `m.auto` non arriva nel payload da
  lì, nella pagina parla come prima.
- **Refactoring mirato**: la scansione MoTeC del pannello di salute muove fuori
  da [src/webui.mjs](src/webui.mjs) (quasi 4000 righe) in [src/webui-telem.mjs](src/webui-telem.mjs):
  memo dei 10 s e lettura byte del `.ld` IDENTICHE — lancio a prova lo
  `systemHealth` continua a tornare gli stessi campi. nel server resta solo
  l'import
- **Niente riavvio del server** per questo giro: i file della GUI parte da
  disco a ogni request (revalidate via ETag) e il nucleo del server è lo stesso
  codice di prima, solo più in fondo in facciata.

**Suite 575/575, lint su 270 file pulita.**
### 31/10/2026 — Il cruscotto prende di più dal server: prossima ronda e bacheca del team
«Integra maggiormente il cruscotto con il server»: il pannello in gioco aveva
già consigli/bottoni/verdetto/classifica/mondo/sincro, ma la scheda della
PROSSIMA ronda (il numero `prossimo` era nel payload da sempre e MAI disegnato)
e la SCRITTA DELLA BACHECA restavano solo nella GUI del browser.
- [uiapp-pub.mjs](src%2Fuiapp-pub.mjs) ora spedisce `prossimoApp` (giorno +
  quando + le prime gare con pista/giri/ora/meteo/auto, STESSI campi delle card
  «gare di oggi», fonte agenda: racesOnDay) e `messaggi` (le ultime 4 di
  state.messages col traduttore della GUI, legacyMessageEn import: un solo
  libro di traduzione).
- [cruscotto.js](uiapp%2Fcruscotto%2Fcruscotto.js) li disegna: gruppo
  «Prossimo appuntamento» dopo Gare di oggi, gruppo «Dal team» prima della
  classifica — niente dati = niente gruppo, mai un buco.
- Installata con installa-cruscotto e letta con un probe dalla STESSA fascia appena scritta: già i campi
  VIVI (giorno 188: Endurance Elite Brands Hatch, GT2 Mount Panorama,
  Porsche Cup COTA; 4 messaggi, primo «Iscrizione Coppa Strada round 3 (-350)»).
  NEL GIOCO il pannello deve essere RICARICATO a mano dal drawer APPS →
  Cruscotto (il JS in gioco non si ricarica da solo).

**Test: uiapp-pub guard+priorità 39/39, node --check, lint Biome pulita.**
### 31/10/2026 — Collaudo a gioco acceso, i consigli anche nel Paddock
Gita in tre tappe, tutte chiuse con prove sul disco:
1. **Collaudo live dei consigli** — EVO acceso (ma in menu), server vivo:
   le fasce del [publisher](src%2Fuiapp-pub.mjs) escono regolari
   (`ui-7173xxxx.json` pochi secondi l'una) e il pacchetto consigli arriva
   nel payload con `live:false` e `tips:[]` — giusto: fuori sessione
   l'ingegnere sta zitto e il gruppo si nasconde da solo. Lo snapshot MMF
   dice `{"game":false}`: coerente con il menu.
2. **Verdetto di giornata** — rigenerato a mano e RILETTO dalle fasce:
   3 gare (Donington 5/13 +24,8s, doppia Monza in DSQ col giro
   01:54.380), [report/gare/verdetto-261030.md](report%2Fgare%2Fverdetto-261030.md).
   Il numero della fascia e quello della CLI coincidono: una sola verità.
3. **Consigli anche nel Paddock** — il bridge `/api/app` ora porta
   allegato il pacchetto consigli (`consigliFascia`, STESSA fonte del
   cruscotto in fascia: zero letture MMF aggiuntive) e [viste-a.js](gui%2Fjs%2Fviste-a.js)
   li disegna in fila sotto la tabella del meteo. Collaudato SU SERVER
   VERO dal smoke test: forma {live,tips[]} sempre presente, mai un 500.


Chiusura del cerchio: **riavvio del server vivo con [riavvia-webui.mjs](tools%2Friavvia-webui.mjs)**
— `/api/app` risponde col pacchetto consigli (live:false a menu, giusto)
E il publisher riparte col pitwall: le sue mini-fasce (`ui-7173558xx.json`)
cominciano a uscire nella SUA cartella, come promesso a teoria.

**Test: webui-smoke 1/1 (con le nuove asserzioni del payload), paddock +
uiapp + verdetto 59/59, lint Biome pulita sui file toccati.**
### 1/11/2026 — Il piede che respira e la tendina del ponte

- **Tendina del ponte nel quadro di copertura** (seguito di DA-13, richiesta
  Mauro 1/11: «menu a tendina per scegliere quale setup base pontare su una
  pista, non solo il più recente»): la rotta `setup-cover` ora porta anche
  `sources` (fino a 12 base setup dell'auto, nome · pista · data, dal più
  nuovo) e in [viste-c.js](gui/js/viste-c.js) per OGNI pista «girata, senza
  setup» c'è il `<select data-cover-src>` accanto al bottone 🌉; default resta
  il più recente (chi non apre il menu fa come prima), il click manda la voce
  scelta. La nota 🌉 del pannello è allineata. Verifica: node --check verde,
  nessun test dedicato (la rotta mangia .carsetup veri di disco).
- **Battito del server dentro il piede della GUI** (richiesta Mauro 1/11:
  «stato porta + build in tempo reale»): rotta `/api/ping` leggerissima in
  [webui.mjs](src/webui.mjs) ({ok, port: PORT, build memoizzato}) e riga viva
  `<span id="srv-live">` nel piede [core.js](gui/js/core.js) — 🟢 «server vivo
  · porta · build» aggiornato ogni 4 s (timeout 2 s), 🔴 «server non risponde»
  con la porta ricordata quando cade, torna verde da sola al rientro senza
  ricaricare la pagina. Utile anche durante il riavvio dell'aggiornatore:
  capisci a colpo d'occhio quando il server è tornato. Per attivarla serve
  riavvia-webui + F5 (cambia rotta server + JS della GUI).
- **Chiusura sul vivo** (riavvia-webui, server risalito PID 10856):
  `/api/ping` risponde `{ok:true, port:8642, build:{semver:0.1.45, hash:6a29f8b}}`;
  suite intera 691/691 verdi (22 s) e Biome pulita su 297 file.

### 31/10/2026 notte — L'area debole #2: analisi.mjs senza test (e frasi corrette anche nei TESTI)
Misurato con dati: lint pulita su 267 file e la scansione «chi importa cosa»
nei test ha pescato i moduli senza copertura. Il peggiore: [src/analisi.mjs](src/analisi.mjs)
(708 righe dal 23/10 — autopsia, dossier rivale, banco A/B, Monte Carlo, tetto)
non era importato da NESSUN test. E dentro, oltre ai commenti, venivano fuori
FRASI CORROTTE VENDUTE ALL'UTENTE:
- headline del ritiro EN «Race handed in» → «Race abandoned»;
- caveat della Monte Carlo IT «Servono per serietà numeriche, e si comanda con
  i reali» → «Prendi l'ordine di GRANDEZZA, non una promessa: il verdetto vero
  lo danno le gare reali»;
- tetto vuoto «l'import li collecchia» → «li raccoglie»;
- banco A/B «il lap va e issa in varie zone» → «il lap è bilanciato nelle
  varie zone»; più «presupuesto», «più piiano» e «i ona peggiori» nei testi di
  commento.
Il primo test dedicato: [test/analisi.test.mjs](test/analisi.test.mjs), 7 casi:
- raceAutopsy: null onesto senza risultati, l'autopsia IT completa (partenza
  P5→P2 «perse 3 posizioni», ritmo secco 2° di griglia a 0,40 s dal campo con
  giudizio «good», il racconto che apre con la headline), e il ritiro con la
  headline EN/IT — la frase corrotta non torna;
- tettoReport: aggregazione per pista (margine best − teorico, e su due campioni vale la MEDIANA BASSA → il peggiore è S1), vuoto onesto con hint;
- rivalDossier: due gare in archivio → h2h 2 sconfitte, mediana −0,4 s «PIÙ
  VELOCE», trend stabile, consistenza media P2/sdev 0; sconosciuto → null.
Prossima fetta: setupAB (fixture MoTeC) e seatMonteCarlo (fixture world).
**Suite 575/575, lint su 268 file pulita.**

### 31/10/2026 sera — Il crash 0xC0000005 della ronda Mini (Donington), annotato e ronda rifatta
Crash reale preso dai log di EVO: log-261031-153615, **17:59:04.764**, eccezione
0xC0000005 durante il CARICAMENTO di Donington Park `layout_grand_prix` (la
ronda R2 della Coppa Mini Vintage). Il pattern nel log:
- AISpline e pitlane di Donington caricati regolarmente (2324/412 punti);
- subito prima: `Loaded 0 TrackLayoutBezier points from ''` — **dichiarazione
  di layout VUOTA nel loader di scena**, linea che merita attenzione quando le
  piste tornano in mano;
- `World initialize took 2.15 s` + `Init camera manager` → eccezione sui
  **Physics Worker 1/2/3**, stesso RVA 0x2873F84, la STESSA firma flaky
  immortalata dal verdetto 23/10 (NOTE-AUTOMAZIONE, rev. 4: il crash NON
  dipende dal conto della griglia né dal file; sia il 5→8 sia il taglio 8→5
  giravano in processo vivo); più linee di crash (61) nel SOLO log di questo
  avvio, che ha chiuso al primo colpo.
Ripresa: EVO riaperto pulito DUE volte (18:41 e 20:08, entrambi i log senza
una sola riga di crash) poi la ronda ripreparata sul vivo: **round 3/3 Oulton
Park — Finale** via `prepara` (griglia scritta dal magazzino della serie, 12
celle `preset_jcs_mech_1` × 2 tinte, PI fine 9–10, iscrizione 250 € pagata,
card completa: 3 giri, AI 84–85, ora 15:00, pioggia fissa). Il rituale del
23/10 resta il protocollo: al crash all'Avvia, RIPROVA, poi
riavvia EVO — il file su disco resta a posto.
Chiusura dello scavo Bezier (stessa sera): il contenuto del gioco è tutto in un
unico `content.kspkg` (niente piste sfuse su disco), e nei log esaustivi la riga
«Loaded 0 TrackLayoutBezier points from 'brands_hatch\layouts\layout_1…'» esce
sempre nel canale `[gameplay] [info]` in ogni sessione, anche senza crash —
stesso schema di `found 0 TV cameras` ecc.: conteggio normale di elementi
opzionali, non pista corrotta né causa del 0xC0000005. Tutto il contenuto delle
piste sta dentro i pacchetti del gioco (`content.kspkg`, niente file sfusi); se
il caricamento piste dovesse sembrare di nuovo sotto accusa, si guardano le
righe `[crash]` in coda al log, non le info `Loaded 0`.
Chiesta «un'area debole da migliorare», scelta con dati e non a naso: suite verde,
lint quasi pulita (1 solo warning vero) e zero CJK residui — ma restavano nei
COMMENTI di [src/webui.mjs](src/webui.mjs) frasi Italinglish nate dalle sessioni
passate, fuorvianti per chi rilegge il codice. Scrivate in italiano vero:
- memo gameRunningMemo (26/10, PC 2): l'idea era «tasklist può appiccicarsi / un
  sondaggio inceppato resta in coda alle richieste del server».
- LEGGERO della voce (29/10): «il tick radio in gara si incartava dietro la
  spazzata (così il 28/10 la voce mutava)».
- battito voce→server (30/10): prima il 4° argomento di giroVoce era il FILE di
  registro passato fuori posto (l'opzione {log} non c'era), per questo una gara
  parlata restava indistinguibile da una muta nel diario.
- battito di avvio (29/10, MAI unref): l'interval unref smetteva di battere senza
  che il server sembrasse caduto (la prova dei 57 minuti) e la radio taceva
  proprio quando serve.
Insieme: tolto l'ultimo warning di lint — `stintPlanFor` non riceve più `ladder`
inutilizzato (firma e due call-site aggiornati). **Suite 568/568, lint su 68 file
pulita, node --check ok.**

### 31/10/2026 tarda sera — La finestra stint entra nella radio e nella vista (DA-9 seconda fetta)
Il piano stint esce dall'attesa: ora annuncia la finestra VIVA in gara.
Collegato:
- payload aggiornato di [src/webui.mjs](src/webui.mjs): `stintPlan` (piano intero)
  e `stintAlert` (prima sosta ANCORA raggiungibile con `lapsTo`, 0 = questo
  giro è la scadenza) dentro la variante pesante e leggera. Il leggero prende
  SOLO dal cache CALDO (`caldo:true`): il freddo vale le letture MoTeC, il
  tick radio non deve piombarci su (disco lento, lezione 26/10) — chi scalda
  la cache è il pannello (/api/ingegnere intero e /api/card).
- narratore «finestra» (n. 11) in [tools/_monitor-copilota.mjs](tools/_monitor-copilota.mjs):
  «Finestra sosta k: box entro N giri» e alla scadenza «Box entro QUESTO
  giro» (UNA frase per finestra, semina su slot.last.finestraK). «finestra»
  entra nei livelli essenziale/normale di [src/voce-copilota.mjs](src/voce-copilota.mjs).
- pannello nel panneau ingegnere della GUI ([gui/js/viste-a.js](gui/js/viste-a.js)):
  piano (giri, stint, litri, finestre) + banner della finestra alla mano.
  Fuori gara a tempo o senza dati del sedile NON esce — niente pannelli
  fantasmi: la stessa onestà di card e copilota.
- BUG FONDAMENTALE preso dai test: `stintPlanOf` usava `tr` SENZA importarlo
  → ogni piano cadeva in ReferenceError: il piano non era mai nato davvero.
  Aggiunto `import { tr }` in [src/stint-plan.mjs](src/stint-plan.mjs) e guardia
  «giri compiuti == null → null» in `stintStopAlert`.
Test: +3 in [test/stint-plan.test.mjs](test/stint-plan.test.mjs) (alert vivi e scaduti, null
  per input brutti), +3 in [test/copilota-narratori.test.mjs](test/copilota-narratori.test.mjs)
  (primo annuncio, apertura dopo la sosta, si tace senza piano). **Suite 568/568.**

### 31/10/2026 sera — La stima provata a ponte spento (e la tessera committata)
La tessera dell'header committata (d859430, dopo riepilogo suite 556/556 e lint
pulita su 278 file). Poi la prova DELLA STIMA CHE NON ESISTERA: il webui rientrato
con `APP_JOURNAL_DIR="C:/no-such-paddock-dir"` (la root inesistente → il ponte
silenzia per progettazione, NON cade sui journal veri) — console e GUI dicono lo
stesso: API `source:"stima"`, chip «~Fuoriclasse» giallo col tooltip della stima
(rep 632 ≥ 490). Rientro pulito subito dopo: `source:"paddock", pct:100` di nuovo.
Domani (1/11): appuntamento in pista per la DA-1.

### 31/10/2026 sera — La tessera del livello anche nell'intestazione della GUI
La tessera che la card Paddock disegna da solo nell'app del gioco arriva ANCHE
nell'intestazione della GUI web (campo «Livello» accanto a Reputazione): VERA col
ponte (pd-home profile.level, nome+colore+pct del gioco), STIMA marcata «~» dalla
reputazione della NOSTRA carriera quando Paddock non parla — e sotto la soglia
osservata 490 niente chip: niente inventate. Clic → Statistiche.
Pezzi: `appLevelBadge(rep)` in [src/app-carriera.mjs](src/app-carriera.mjs), campo
`levelBadge` nell'header server ([src/webui-views.mjs](src/webui-views.mjs)), chip in
[gui/index.html](gui/index.html) + [gui/js/core.js](gui/js/core.js) con le stesse
regole di traduzione statica. 2 test nuovi nel ponte (13/13): reale dal journal,
soglia ferma a 490, stima sopra/sotto. **Suite 556/556, lint pulita.**

### 31/10/2026 — Paddock 1.0.2 e la tessera del livello
Paddock aggiornato alla **1.0.2** (l'estrazione richiedeva la chiusura dalla tray:
le carriere restano in Saved Games, l'app in gioco si è aggiornata da sola al primo
avvio; backup della 1.0.1 in Desktop\Paddock-1.0.1-bak-31-10). Verificato dal vivo:
la versione in app.json e i **12 journal riscritti** al primo giro.
Miglioria presa dalle novità: i journal ora portano `profile.level` con i NUOVI
colori dei driver level — la card Paddock del cruscotto mostra la tessera
(nome + livello col COLORE esatto del gioco, Fuoriclasse #f5c542 per Mauro).
Tessera in [src/app-carriera.mjs](src/app-carriera.mjs) (appOverview passa profile →
api/app) e [gui/js/viste-a.js](gui/js/viste-a.js).
La prova del vuoto: **Paddock NON installato non crea problemi** — piccolo
[test/app-assenza.test.mjs](test/app-assenza.test.mjs) (7/7) che replica
l'assenza col APP_JOURNAL_DIR impossibile: endpoint 200 col JSON ok:false,
niente card, import resta zitto, bonus gara pulita integra (è matematica pura),
schede auto perdono SOLO l'extra tecnico. **Suite 554/554**.
### 31/10/2026 — Le bandiere entrano nella storia (DA-2 chiusa)
Committ 41e6633: le 7 bandiere (30/10 notte) committate in un commit uno, tutto il resto
pulito; poi 5fbeca0 il diario. Mauro scarica Paddock 1.0.2 da OverTake (chiuso dalla tray,
estratto sopra la vecchia cartella: le carriere restano, la copia in gioco si rifà da sola
al primo avvio); a fronte i test di paddock-bridge per convalidare il ponte.

### 30/10/2026 pomeriggio — Giro di controlli a bordo fermo (preparazione DA-2)
Diff dei 7 file delle bandiere LETTO E VALIDATO: il fix della F40 a sorpresa era
lo stallo del pending scaduto che rimontava l'auto-evento a ogni lettura — ora il
canale evento vive SOLO nella finestra di 24 h armata dal click «Prepara tutto e
divertiti» (state.eventoPreparato scritto da event-prep in webui.mjs), test dedicati
(3 nuovi in uiapp-pub-priorita) e narratore coperto.
Copia installata del cruscotto ALLINEATA alle sorgenti (41261 byte, scritta 29/10 23:52):
l'app in gioco monta il codice nuovo.
Pitwall SPENTO DI PROPOSITO confermato (marcatore rinominato .disattivato, sorgente
tolta): non è un relitto, non si tocca.
Paddock: niente copia da allineare — leggiamo solo i journal dell'app del gioco.
Nessuno in ascolto sulle porte 8642–8644: al prossimo avvia.cmd il webui parte
COL CODICE NUOVO: nessun riavvio necessario prima di stasera.
Rimosso il relitto .webui.pid (datato 23/10, PID 14200 morto; nessun file nel
progetto lo legge — scritto da una versione vecchia).

### 30/10/2026 — Le bandiere che non risultavano da nessuna parte 🙂
Avevi ragione: stessa fontana del verde. Il narratore leggeva solo alcuni codici del
campo `flagCode` della MMF (verde 2, a scacchi 8) e la rossa (3) e la nera (6) cadeva
nel silenzio per costruzione, non perché il bello non le scriva mai. Da ora:
«Bandiera rossa!» sul passaggio a rossa (procedura di restart, sospensione),
«Bandiera nera: il gioco ti squalifica» sul passaggio a nera; sempre zitte alla prima
lettura, distanza di 15 s condivisa tra le due, livello essenziale (sono ordini di
pista come il verde). Test dedicato: 27/27 verdi nel file del copilota.
Verifica di fine giornata: suite **547/547** pass (9270 ms), lint pulita (0 errori,
0 warning su 264 file). Protocollo di prova scritto in PROVA-COPILOTA.md §5 → DA-1.

### 2/11/2026 — Il meteo della gara non si paga più in corto (anti-cheat)
Richiesta Mauro: «quando lancio la gara dal preparatutto, poi posso cambiare es il
tempo… potrebbero prenderla tutti, si deve evitare, anche le gare sul bagnato si
devono fare». Il cambio meteo a mano della gara preparata (La scorciatoia
bagnata → secca) è ora rum del popolo solo in modalità test:

- [src/weather.mjs](src%2Fweather.mjs): guardia in `setWeatherPreset` e
  `setWeatherCustom` — fuori test-mode → rifiuto `WX_LOCKED` con messaggio
  che dice come sbloccare (`test-mode --on`). Passano solo: la prova
  asciutta (dry) e il meteo PREVISTO (`previsto:true`).
- [src/test-mode.mjs](src%2Ftest-mode.mjs): `meteoLibero()` + `EVO_TEST_MODE_FILE`
  (stesso schema di EVO_DATA_DIR/EVO_CLASSES_FILE) per collaudare la guardia
  on/off senza toccare la carriera vera.
- [src/webui.mjs](src%2Fwebui.mjs): i DUE call-site del preparatutto (event-prep
  e Prepara tutto della ronda) passano `previsto:true` — la scrittura porta
  solo il meteo che il calendario dichiara, che è il punto.
- Test: [test/weather-preset.test.mjs](test%2Fweather-preset.test.mjs) +2 casi
  (rifiuto fuori test, premio con test attiva). Suite completa 626/626, Biome
  pulita sui 4 file toccati.

### 30/10/2026 — Giornata di bug in pista, tutti con la loro mano
- **R5 → F40 a sorpresa a fine gara**: il cambio auto istantaneo riusciva a partire
  da un comando dell'app senza finestra armata (scappatoia trovata e tappata).
- **Gara ripartita da sola tornando al menu**: auto-via senza finestra → corretto con
  la finestra di 30 min dopo «Prepara tutto» + la lettura dello store che distingue
  «ack assente» da «lettura a metà scrittura». Test dedicati.
- **Penalità + rossa a schermo dopo il restart**: indagato nel registro del copilota —
  l'annuncio era vero e corretto nel tempo, la bandiera non c'era nel campo: rimanda
  a DA-1 (il grep del protocollo la smaschererà domani).
- **Foto pista vuota + crash 0xC0000005 al lancio, causa trovata**: il blocco pista
  (3.5) porta anche il campo 5 = max_pit_slot del layout (dal catalogo eventi del
  server dedicato: Monza GP=30, Oulton International=16, verificato contro i file
  sani riscritti dal gioco). Cambio pista riscriveva nome/tag/layout ma ereditava
  il pit slot del file precedente (Oulton con 30 di Monza): EVO non risolve più
  l'evento, finestra pista vuota e lancio che spiana. set-track ora scrive 3.5.5
  (tabella PIT_SLOTS, 18 piste del libro) e la INSTANT_RACE corrotta è stata
  riparata (pit 30→16, backup .bak-track-19-05).

### 1/11/2026 — La sonda anti-colpo è guardia regia: `life` chiusa, test incatenato
- **Rotta smascherata in vista** ([src/webui.mjs](src/webui.mjs)): `GET /api/life`
  eseguiva `ensureLife`+`ensureContract`+`checkSigils` con `persist(state)`
  — una GET di scrittura, l'ultima della sua specie secondo lo sweep. Ora
  'life' nel set SOLO_POST (pericolo zero per la GUI: `api()` in core.js manda
  TUTTO via POST, unica eccezione le letture dirette `/api/lang` e `/api/agg-info`).
- **Sonda promossa** ([tools/_difesa-probe.mjs](tools/_difesa-probe.mjs)): il banco
  isola TUTTO (EVO_DATA_DIR/EVO_FLOWS_DIR/ACE_DATA/ACE_GAME_SAVEDIR/ACE_SAVEDIR)
  e gira su una carriera di MARCA «Prova Sonda»; lo sweep coglie le 118 rotte
  `case` DEL FONTE (il set scritto a mano poteva divergiare: ora é letto
  direttamente dal source) e confronta l'impronta ricorsiva della sandbox
  prima/dopo dell'una GET. Suo trovare del 31/10: colpo 'life'. Nota onesta:
  i log append-only in EVO_DATA_DIR (copilot-voce-*.jsonl, errors.jsonl) sono
  rumore consentito e dichiarato, NON stato; il resto muta = colpo.
- **Test di regressione** ([test/diffesa-sonda.test.mjs](test/diffesa-sonda.test.mjs)):
  2 statici (nessun fantasma nel set; `life` resta armato) + la sonda viva
  (exit 0 atteso). Prova di rottura fatta sul disco: slegato `life` dal sources,
  il test CADE (2/3 pass) — e il ripristino è a backup file.
- Suite **682/682** in sandbox, lint Biome 0, danza amico 24/24 — release
  **v0.1.44** in uscita.

### 1/11/2026 — L'orologio ferma a 16: l'ultimo +8 muore nel persist sbagliato

Prova Mauro (1/11 mattina, dopo le gare di ieri sera alle 23:21/23:33/23:57): «ho fatto gare, guarda se l'orologio funziona, dopo una gara dovrebbe avanzare di 8 ore». Non era avanzato: save fermo a **giorno 223, ora 16** dopo ben CINQUE gare (Mini, MX5, R5, R5, Peugeot 205) — tre turni di +8 richiesti, ma solo i primi due sono arrivati sul disco.

- **Perché** (rassegna degli indizi, nessuna divinazione): le tre gare registrate dal server VECCHIO (sostituito solo alle 00:34) si incassavano con l'ordine sbagliato in [import.mjs](src/import.mjs): `persist(state)` a riga 449 e `avanzaGiornataDopoGara` DOPO a riga 494 — l'avanzamento del tempo toccava il SOLO oggetto in memoria; solo l'import successivo portava sul disco l'avanzamento del giro PRIMA, e l'ULTIMO +8 (Peugeot: 16→24, giornata chiusa) restò in memoria. Riavvio del server alle 00:34: oggetto perso, orologio congelato alle 16 sul disco.
- **La cura** ([src/import.mjs](src/import.mjs)): `avanzaGiornataDopoGara` spostato PRIMA del persist — l'avanzamento dell'orologio finisce nel SALVATAGGIO scritto dall'import stesso, nessun '+8 di memoria'. Commento con la lezione datata accanto al codice.
- **Rimedio sul vivo**: orologio riportato alla mattina del giorno 223 (ora null), backup di pronto soccorso in [data/backups/sonda-ora-pre.json](data/backups/sonda-ora-pre.json); il Cruscotto dice di nuovo «inizio giornata».
- Test nuovo ([test/import-save.test.mjs](test/import-save.test.mjs)): la gara importata lascia `agenda.ora` a 8 nel FILE con un secondo sedile ancora a programma — prima del fix l'assert leggeva `null`. **Suite intera 692/692** (13 s), Biome pulita sui 2 file toccati, riavvia-webui: `/api/agenda` ora dice mattina.

### 1/11/2026 — La Ferrari 296 nel menu «senza toccare nulla»: la suite riprameva il sedile
Prova Mauro 1/11 di sera (aveva la R5): «ero sul menu ed è rientrato da solo in gara, poi verifica perché ogni tanto appare la Ferrari GT3 nel menu principale senza toccare nulla».
- **La pista dei sospetti** (diario, nessuna divinazione): `startedAt` di `state.vetrinaCustom` nel save VERO = **00:07:37 di stanotte** — l'istante della suite di test (`data/flows-debug.jsonl`, npm test alle 00:07:18). Il registro `data/gara-veloce.jsonl` NON aveva scritture a quell'ora: nessuna gara al volo vera, quindi il re-arm non passava dall'endpoint.
- **La fontana**: [tools/_gara-veloce.mjs](tools/_gara-veloce.mjs) passo «sedile (vetrina custom)» — `garaVeloce` scriveva `state.vetrinaCustom` sul save VERO ANCHE a ricetta dry, e [test/gara-veloce.test.mjs](test/gara-veloce.test.mjs) era l'UNICA suite senza sandbox `EVO_DATA_DIR`. Ogni run della suite con un'auto nel libro re-armava la vetrina: nuovo `startedAt` = nuovo comando `demo:` non ancora ackato dal Cruscotto — la Ferrari 296 GT3 tornava sedile del menu «senza toccare nulla», ciclicamente. Il «rientra da solo in gara» della stessa ora è la finestra di 30 min armati da «Prepara tutto» (documentata e a sue norma: scade da sola); la Ferrari nel menu era IL BUG.
- **La cura** sul vivo: `node tools/vetrina-custom.mjs --off` (vetrina SPENTA, pending null); [tools/_gara-veloce.mjs](tools/_gara-veloce.mjs): in `dry` il sedile NON scrive niente (risposta «dry:»); sandbox del save in [test/gara-veloce.test.mjs](test/gara-veloce.test.mjs) (+2 asserzioni in dry del test: sedile in prova e `save-current.json` che NON nasce) — stessa casa di backup-rotation/garage-buy/integrity.
- Verifica: suite intera **691/691 verdi** (12 s) e — la prova chiave — DOPO la suite il save VERO resta senza `vetrinaCustom`; Biome pulita sui 2 file; riavvia-webui e `/api/ping` 0.1.45 OK.

### 1/11/2026 — La giornata ha l'orologio (Fase 1 + problema giorni)
Richiesta Mauro: «giornata in 3 fasce, ogni gara avanza l'ora di 8, la 3ª chiude e
salta direttamente al giorno dopo».
- **Orologio di giornata** ([agenda.mjs](src%2Fagenda.mjs), ORE_PER_GARA=8):
  `agendaOra` 0–23 con null = mattino appena aperto; a gara finita
  `avanzaGiornataDopoGara` (import.mjs) avanza +8 e alla terza (o se non restano
  gare a programma non passate) chiude e salta con la vecchia logica
  avanzaDopoGara; cambiando giorno l'orologio riparte da `null`.
- **La PORTA**: gara di OGGI con orario già oltre l'orologio resta visibile ma
  grigia (badge «orario passato», scelte rifiutate) — server la blocca anche a
  riguardo con 409 e messaggio contenuto (agenda-choose e agenda-hour). Le
  gare dei giorni futuri e le gare senza orario non la vedono mai.
- **Scaletta per ora** ([viste-b.js](gui%2Fjs%2Fviste-b.js)): le gare del giorno
  si ordinano dal mattino alla sera, con le passate evidentemente dietro in
  grigio; orologio + fascia in cima al Centro gare (a 8/16/23).
- **Fase 2 già lì**: il piano `tramontoalba` (ore 21, 48x) esiste in
  [orario.mjs](src%2Forario.mjs), arriva già nella select «Piano orario della
  serie» con etichetta EN (`PIANI_EN`) e con CLI (`orario tramontoalba --serie …`).
- **Il problema dei giorni risolto** ([state.mjs](src%2Fstate.mjs)):
  `applyRaceResult` NON avanza più il giorno di 1 a gara — avanzava pure
  `avanzaGiornataDopoGara` → doppio salto con le 3 gare al giorno; ora il
  TEMPO (orologio) comanda, solo la chiusura (o lo zero rimasto) muove il
  calendario.
- Test: [test/agenda.test.mjs](test%2Fagenda.test.mjs) riscritto sulla nuova
  semantica (orologio +8 con salto sullo slot; porta; 3 fasce al 24 riparte;
  override ora spiegato pure lui) — **suite completa 685/685**.

### 1/11/2026 — La barra della banda 84–85% torna nella sua colonna
Prova Mauro, pannello Difficoltà: «la barra 84–85% è troppo a destra». Non era
un problema di scala (84 su 0–100 sta lì, giusto): la riga era SPEZZATA.
- **Causa**: i bottoni trim ±1/±2/±3 (27/10) hanno aggiunto un 8° elemento a
  ogni riga senza toccare il template della griglia in
  [style.css](gui%2Fstyle.css), che ne definiva 7 — la barra banda scivola
  fuori colonna (la % di serie prendeva la sua ora) e casca su una seconda
  riga, staccata e schiacciata: la misurata dal vivo, duo a x=93 fuori dal
  pannello mentre la cella è larga 26px.
- **Cura**: template a 8 colonne (`26px minmax(0,1fr) 58 58 auto 64 64 240`),
  `auto` per i sei bottoni trim e nome con ellissi (tooltip col nome intero);
  le righe evento_ (senza trim) ricevono uno span segnaposto nascosto così le
  colonne restano in fila anche per loro.
- **Prove**: pagina aperta dal vivo su http://127.0.0.1:8642 — 87 righe tutte
  su una linea, barra banda ferma a +8/+9px dentro la riga, nessuno scroll
  orizzontale a 1400px; restringendo a 1050px resta intatta. Biome pulita sui
  due file toccati, viste-guard 4/4.

### 1/11/2026 — Banco A/B torna nell'Analisi (messo fuori dal Garage)
Domanda Mauro, provata a fondo: «Banco A/B dei setup — perché in garage? non
sta meglio in analizza o setup?».
- **Il perché era una vecchia idea mia, non sua**: dalla mattina il banco viveva
  nel Garage col commento «è il tab dove l'auto prepara la gara» — ma la sua
  materia non è preparazione: sono DUE SESSIONI MoTeC del passato, il diff dei
  canali e il tempo perso per zona. Lettura pura, nessun file di setup toccato
  (`ab-list`/`ab-cmp` non scrivono niente). Posto naturale: il tab Analisi,
  accanto ad autopsia, tetto teorico e Monte Carlo (in Setup non c'entra di
  più: là la materia è il disco dei preset, qui la uscita in pista).
- **Cura** ([viste-analisi.js](gui%2Fjs%2Fviste-analisi.js),
  [viste-c.js](gui%2Fjs%2Fviste-c.js)): host `#an-ab` in coda ai tre strumenti
  di Analisi e `renderAB('#an-ab')`; dal Garage via l'ancora `#g-ab`, il
  commento e la chiamata — il renderer resta UNO (renderAB di viste-analisi),
  niente copie.
- **Prove dal vivo** (server 8642): tab Analisi mostra «⚖️ Banco A/B dei
  setup» con i due menu A/B e «Confronta» sotto il Monte Carlo; tab Garage
  senza più `#g-ab` né menu A/B. Biome pulita sui due file, viste-guard 4/4.

### 1/11/2026 — La banda 82–92 preistoria non finisce più nel customgrid (banda di serie)
Seguito del richiamo di Mauro sulla scheda Griglia: «Peugeot 205 T16 ×1 —
AI 82–92 … perché 82–92?? è per tutti 85/86 per default». La cura vera (3–4
modifica), di sua autorizzazione («fai quello che vuoi»):
- **Nuovo rango nel builder** (`aiBandSerie` in
  [gridbuilder.mjs](src%2Fgridbuilder.mjs)): priorità aiBand (evento) > classe
  pinnata (perTraccia/aiStandard) > **banda di serie** > node.ai del ladder,
  col report che ci dice la fonte («banda di serie (cursori)»).
- **Formula unica con il pannello Difficoltà**: `bandaSerieSlider` in
  [state.mjs](src%2Fstate.mjs) — override dei cursori (state.raceSettings) o
  lo slider calcolato, banda stretta di 1 punto. Prepara dell'app
  ([webui.mjs](src%2Fwebui.mjs)) e CLI `griglia`
  ([cli.mjs](src%2Fcli.mjs)) la tirano entrambi: niente più scritture dove
  una strada porta 84–85 e l'altra 82–92.
- **One-shot sul disco**: customgrid scritto 82–92 → 84–85 con
  `applyAi` (EVO chiuso, backup
  `last_grid.customgrid.bak-apply-2026-11-01T00-17-08`); il vigia aiStandard
  delle classi NON si tocca.
- **Test** [gridbuilder-banda-serie.test.mjs](test%2Fgridbuilder-banda-serie.test.mjs):
  ladder senza banda di serie resta com'era, la banda di serie vince sul
  ladder, aiBand evento resta sopra, override cursori parla per primo,
  banda stretta segue lo slider. 5/5; race-card 18/18, griglia-sim compresa,
  webui-smoke ok.

### 30/10/2026 — Il doppio «Chiudi la stagione» trappato
- **Il vivo**: dopo aver chiuso la stagione (click riuscito: save avanzato,
  contratto saldato anche nel messaggio), la card del cruscotto restava sul
  video con «calendario completato 3/3» e un secondo click contava la stagione
  NUOVA (0/3) facendo comparire «Stagione incompleta: conferma per chiudere
  comunque» — con quel «comunque» che l'avrebbe svuotata nell'annuario.
- **Causa**: la chiusura riesce ma il modale chiuso con la ✕ (e i click su una
  card non ancora ridisegnata) non ridisegna la pagina; il secondo click arriva
  sul server fresco, che guarda la stagione 12 con 0 gare e propone di
  «chiudere» una stagione mai corsa.
- **Cura**: [state.mjs](src%2Fstate.mjs) espone `seasonJustClosed(state, node)`
  — puro, senza ladder né disco: stagione corrente a 0 gare E la STESSA serie
  chiusa subito prima nell'annuario. La usano lo stesso caso 'season-end' della
  webui (409 col codice `SEASON_ALREADY_CLOSED`, messaggio «Non devi chiudere
  nulla») e `cmdSeasonEnd` della CLI. Il client
  ([viste-d.js](gui%2Fjs%2Fviste-d.js)) traduce il codice in un dialogo «Stagione
  già chiusa» senza il bottone pericoloso, e al placare ridisegna la card
  stantia. La chiusura LEGITTIMA di una stagione vuota (iscrizione mai corsa,
  stagione saltata) resta possibile: la guardia morde solo sul doppio click.
- Test: [test/season-guard.test.mjs](test%2Fseason-guard.test.mjs), 6 casi puri
  (doppio click, chiusura legit con gare, vuota senza chiusura prima, altro
  nodo, annuario assente, round-trip con seasonEnd vero). Suite completa
  632/632, Biome pulita sui 5 file toccati.

### 29/10/2026 — Giorno di radio, verdetto e bottoni
Riepilogo radio silenzioso sul rumore di servizio; verdetto di giornata (CLI +
webui, qualifiche in sezione a parte); bottoni «Prepara e divertiti» sul cruscotto;
gara al volo con pista/istantanea veri; finestra del via anti-riparto; verdetto
261029 rigenerato con le qualifiche a parte.

### 28/10/2026 — Giorno del trapianto
Weekend-roster (trapianto delle celle nel blocco weekend, idempotente con potatura e
verify di rilettura, 7/7 sandbox); riavvia-webui che scopre da solo il processo sulla
porta; banner di riavvio nella GUI; audit dei dati della carriera; gara al volo con
griglia dal pool.

### 31/10/2026 — Giorno dello 0,00 finto (vittoria COTA Coppa Peugeot)
La scheda autopsia di COTA raccontava la VITTORIA col linguaggio della sconfitta:
«Gap 0,00s su 3 giri: ~0,00s al giro da ridare al vincitore» — cioè a me stesso
(gapMs per il vincitore È sempre 0: mio tempo − tempo vincitore).
- [results.mjs](src%2Fresults.mjs) — `classify` calcola `secondGapMs`: per P1 il
  margine VERO è il tempo di P2 − il mio (37,04s su COTA), non il gap nullo;
- [analisi.mjs](src%2Fanalisi.mjs) — l'autopsia nella vittoria: se il margine
  c'è dice «margine sul secondo 37,04s su 3 giri (~12,35s al giro di vantaggio)»,
  se manca meglio il silenzio che un 0,00 finto; la voce `entry` per la GUI porta
  anche position e secondGapMs;
- [viste-analisi.js](gui%2Fjs%2Fviste-analisi.js) — il KPI «Gap vincitore» diventa
  «Margine sul 2°» quando il vincitore sei tu;
- ritorno di mano sulla gara GIÀ importata: il file risultato normale di COTA
  (261031-2357, ancora in Saved Games\ACE\Results) ricalcolato e il solo campo
  `secondGapMs` scritto in save (backup `evo-career.save.json.bak-backfill-secondgap`).
- Prove: [test/analisi.test.mjs](test%2Fanalisi.test.mjs) 15/15 (nuovo caso vittoria
  con margine + caso senza margine = silenzio), classify reale sul file di ieri
  (P1/15, secondGapMs 37036), endpoint `/api/autopsy` vivo con il nuovo testo.

### 1/11 — Release 0.1.46 preparata: l'autopsia della vittoria e il battito coi ms
La parte LOCALE della checklist ([RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md))
su richiesta Mauro («segna questo fix nel CHANGELOG e prepara la release»):

- **[CHANGELOG.md](CHANGELOG.md)** voce v0.1.46 scritta dai fatti del delta:
  il fix dello 0,00 finto end-to-end ([results.mjs](src/results.mjs) calcola
  `secondGapMs`, l'autopsia lo racconta o tace, [viste-analisi.js](gui/js/viste-analisi.js)
  mostra «Margine sul 2°»; la gara già importata ricalcolata con backup),
  il battito del server col ping in ms ([core.js](gui/js/core.js)), i filtri
  auto/pista del banco A/B, l'icona meteo nel righello dell'agenda
  ([agenda.mjs](src/agenda.mjs) + [viste-b.js](gui/js/viste-b.js)), il
  commento uscito dal template della scheda «Prossima gara» e la legge del
  ritmo publisher↔app ([uiapp-periodo.test.mjs](test/uiapp-periodo.test.mjs)).
- **Suite completa in sandbox: 701/701** (da 697), exit 0; lint Biome a 0
  diagnostica sui 299 file.
- **Danza del PC amico vergine dal sorgente: 24/24** (zipball dal ramo,
  installer in sandbox, primo+secondo avvio, nessuna pagina consegnata al
  loader).
- **README.it.md e README.md**: verificati allineati tra loro — parlano a
  fasce storiche (0.1.13–0.1.41) e nessun rigo tocca la versione di
  release: niente da allineare.
- **Bump**: `npm run bump` 0.1.45 → **0.1.46**.
- Commit locale con messaggio di release, tag `v0.1.46`, pacchetto-amico
  costruito dal commit della testa (zip in `pacchetti/`, `build-id.txt`
  dentro) e corpo della release in `tmp/corpo-release-0.1.46.md`.
RESTA NELLA MANO DI MAURO (come da checklist: la sincronizzazione passa dal
suo script): push su off-site e poi la GitHub Release con la zip come asset
via `tools/crea-release.mjs`.

### 1/11 — Collaudo a mano dei cursori della banda AI (richiesta Mauro: «trascina min e max salva davvero sui cursori di EVO»)
Prova VIVA con il save di carriera vero e il gamemodesave vero
(la partenza è fotografata: banda Coppa Peugeot 205 T16 84–85,
override vivo, cursori EVO al disco 84–85).

- **Cursori fermi in adattiva** (disabled, giusto così): per il collaudo
  si passa a «fissa», che li sblocca, e a fine prova si torna alla foto.
- **Il rilascio del cursore salva davvero**: al mouse-up la GUI manda
  `difficulty-action {op:'range'}` con nodeId+min+max; il server di
  [webui.mjs](src%2Fwebui.mjs) scrive `state.raceSettings` e chiama la
  `setWeekendAi` di [tools/set-track.mjs](tools%2Fset-track.mjs) che
  riscrive i campi 30/31 del gamemodesave. Letti col lettore del tool:
  rilascio del min su 83 → banda 83–83 nel save E **cursori EVO al
  disco 83/83**; rilascio del max su 84 → save 83–84 E **disco 83/84**.
  La posta del tool registra «Scritti anche i cursori del gioco —
  valgono alla PROSSIMA apertura del weekend», e alla scrittura nasce
  il suo `.bak-ai` in GameModes.
- **La tastiera non salva (limite annotato, non da chiamare bug)**:
  le frecce muovono il pollice e la banda in pagina si aggiorna, ma il
  Chromium non emette il `change` che la GUI ascolta (né a blur/Tab):
  nessun POST, nessun salvataggio. Mauro guida col mouse e la scheda
  dice «si salvano al rilascio», per cui resta così; se un giorno si
  vuole la tastiera, basterà ascoltare anche `input` (con debounce).
- **Nebbia del «torna al consiglio» (↺)**: dopo il clear l'endpoint
  series risponde ancora 84–85 col vecchio override attivo, mentre il
  riavvio del server riscrive sul gamemodesave la banda del consiglio
  (99–100 col fisso 95). Scavato: NON è un difetto del test — ogni
  richiesta con carriera attiva RISEMINA le serie senza cursori con la
  banda predefinita 84–85 ([webui.mjs:778](src%2Fwebui.mjs%23L778),
  scelta di Mauro del 27/10): il ramo difensivo riempie il salvataggio
  a vuoto col default, quindi la fotografia del test era onesta. Da
  motivare se è il ritocco giusto per «↺ torna al consiglio calcolato».
- **Rimessa a zero**: server spento (PID preso con `pidSullaPorta` di
  [tools/riavvia-webui.mjs](tools%2Friavvia-webui.mjs)), save e
  gamemodesave rimessi dalle fotografie di partenza — MD5 del save
  ripristinato IDENTICO alla foto (`13d6489a1922533ea6491416158409de`),
  trim per serie intatti (coppa_r5-turbo +1, roadster_classic −5,
  coppa_mazda-rx7-fd +1) — server ripartito e risanato: modalità
  adattiva, Peugeot base 87 / banda 84–85 / override vivo, cursori EVO
  al disco 84–85. Puliti i due `.bak-ai` nati nel collaudo e due copie
  in `tmp/`: la rotazione di GameModes torna ai due baks vecchi.

### 1/11 — Sfoglata della GUI: righe/colonne disallineate sulle altre 19 viste
Audit live nel browser (i 19 tab della nav, pannello Difficoltà escluso:
è il caso di riferimento). Tre passate per tab: struttura delle tabelle
(testa contro le righe), griglie a righe ripetute, ripetizioni di valore
per tutto il corpo della vista.
- **Struttura pulita ovunque**: in tutte le 19 viste ogni riga di ogni
  tabella ha le colonne della testa (51 tabelle nella sola Griglia, il
  conto è per tab); nessuna riga fuori posto. Anche i form di
  Impostazioni/Gironi e i panel variabili di Rivali/Campionati
  sono varianti legittime per stato.
- **Un difetto reale dello stesso tipo del pannello Difficoltà**
  (colonna che risponde uguale per tutte le righe senza guardare la
  riga): il **Tetto teorico** in Analisi — «Margini migliore» e
  «Ultimo margine» = «0,00s» su tutte le 14 piste (confermato all'endpoint `analisi-tetto`:
  `marginBestMs:0`, mentre `campTopDeltaMs` e i settori
  hanno valori veri). Per costruzione:
  [results.mjs:361](src%2Fresults.mjs%23L361) calcola il «giro

  teorico» sommando i settori del giro che È già il best, quindi il
  margine vale meglio 0. L'onesto (somma dei migliori settori tra TUTTI
  i giri) non è calcolabile dal file risultato: driver porta solo gli
  split del giro migliore. Da decidere con Mauro: nascondere le due
  colonne o sostituirle con una metrica vera (es. il delta top già in
  pannello), perché oggi dicono un falso.
- **Lezione di metodo**: il render è asincrono; alla prima stesa
  fotografavo il tab PRECEDENTE (prime segnalazioni fantasma su
  Messaggi/Rivali). Con la sincron giusta (aspettare il titolo nuovo):
  i «0,00s»×36 sono del Tetto, l'«0–3»×14 dei rivali a 3 gare insieme
  (dati vivi: h2h variati, 74 rivali, nessun default), le colonne
  costanti di Piste (auto/preset/tinta/zavorra) sono reali — serie
  mono-auto.
- **Monte Carlo, «Titolo» 0% su tutte le sedie**: onesto — arrotonda
  sotto lo 0,25% (vittorie all'1% dietro un filo più forte). Non è un
  disallineamento: la sedia è triste, non morta.

### 1/11 — Verifica post-estrazione: il pannello setup del Garage senza il Banco A/B
Richiesta Mauro: «spazi vuoti o scrollbar strani dopo la rimozione del
Banco A/B?». Prova su GUI viva (porta 8642), stessa sonda tecnica
sintetizzata per entrambi i tab coinvolti:
- **Codice**: nel Garage non resta nessun riferimento `#ab-*` o «A/B»
  (i selector del banco vivono SOLO in
  [viste-analisi.js](gui%2Fjs%2Fviste-analisi.js), dove è tornato); nel
  [viste-c.js](gui%2Fjs%2Fviste-c.js) resta solo il commento del
  perché.
- **Tab Garage**: catalogo + meccanico + 2 auto — nessun blocco vuoto
  senza contenuto, nessun overflow orizzontale, nessuna scrollbar
  sospetta.
- **Tab Setup** (il pannello setup del garage): 7 pannelli (grafico
  del giro largo tutto, consigli del box, 4 PSI, auto della serie,
  diagnostica telemetria, salute sistema, registro errori) — gap
  interpannelli tutti sotto 30px, nessun «pannello fantasma» (vuoto
  ma visibile), nessuna scrollbar anomala.
- **Trovata lungo il tragitto (tab Rivali, non la domanda)**: la
  colonna SQUADRA è vuota per 74/74 rivali —
  [viste-d.js:704](gui%2Fjs%2Fviste-d.js#L704) usa `r.team ?? '—'`, ma
  con `team:""` il nullish non scatta. Verificato all'endpoint
  (`team:""` su tutte le 74 schede). Stessa questione del Tetto
  teorico: o si mette `r.team || '—'` (igiene del display) o si toglie
  la colonna finché la squadra dei rivali non arriva con un'import
  vero.

### 1/11 — Prova viva del filtro pista del Banco A/B (già nella 0.1.46)
Richiesta Mauro: «aggiungi un filtro per pista al Banco A/B». Era già
stato fatto con lo spostamento del banco in Analisi e commesso nella
0.1.46 (`c9d52bc`): verificato sul vivo, senza toccare codice.
- 40 sessioni in lista; menu «tutte le piste…» con 7 piste.
- Selezionando «KyalamiGP»: i menu A e B scendono da 41 a 4 voci (3
  sessioni MX-5 ND Cup + il segnaposto vuoto), e le scelte A/B fatte
  prima non si azzerano (il filtro ripristina la selezione se ancora
  visibile).
- Ogni voce porta auto · pista · data, quindi due gare diverse sulla
  STESSA pista restano distinguibili a mano nel menu: il filtro divide
  le piste, la data divide le gare.

### 1/11 — Il `--template` della CLI porta ora la banda di serie (e l'attesa verificata ancora a 84–85)
Completamento della voce «banda di serie» qui sotto: Mauro chiede «il
builder scriva 84–85 più trim, non la vecchia del ladder, e allinei
anche l'attesa». Ispezione di tutti i percorsi del builder:
- **Già a posto (senza toccare nulla)**: CLI `prepara`/`griglia` senza
  `--template` e Prepara dell'app passano già `aiBandSerie`
  ([grid-apply.mjs](src/grid-apply.mjs) 312/369,
  [webui.mjs](src/webui.mjs) 2535).
- **Gap vero**: il ramo `--template` di
  [cli.mjs](src/cli.mjs#L1311) chiamava `buildGridMessage` SENZA banda:
  con un template dichiarato la griglia sarebbe tornata al ladder
  preistorico (82–92 della Peugeot). Ora passa anche lì
  `aiBandSerie: bandaSeriePrep` (stessa banda dei cursori/trim già
  calcolata in testa alla funzione).
- **File in attesa — verificati dal vivo, NIENTE da riallineare**:
  customgrid `last_grid.customgrid` porta AI scritta **84–85** (19 celle
  Peugeot, una tinta) e il gamemodesave porta `weekendAi` **84–85** con
  griglia custom a 19. Banda viva calcolata con
  `bandaSerieSlider`: `[84,85]`, base 87, **trim 0** (quindi «84–85 più
  trim» oggi coincide; muovendo il trim la banda scritta dal builder
  lo segue).
- **Prova viva**: dry-run `node ac-evo-career.mjs griglia --template
  data/grid-templates/coppa_peugeot-205-t16.customgrid --dry` → riga
  abilità «**84-85 (banda di serie (cursori))**».
- **Test**: gridbuilder-banda-serie + grid-templates
  **15/15 verdi** (contratto invariato: senza banda di serie il builder
  resta sul ladder, la serie vince sul ladder, aiBand evento sopra
  tutti). Biome pulita su cli.mjs. Sonda in `tmp/_sonda-*.mjs`.

### 1/11 — I due registri a vista nel tab Griglia: campo AI del file accanto alla banda dei cursori
Richiesta Mauro: «accanto al campo AI del customgrid mostra anche la
banda attiva dei cursori del weekend, per non confondere i due
registri». La distinzione vera: il CAMPO AI scritto nel file (aiMin/
aiMax) è un registro, la banda dei CURSORI del weekend
(state.raceSettings / difficultyFor, trim incluso) è l'altro — l'uno
non comanda l'altro e un «Imposta intervallo AI» a mano può farli
divergere l'uno contro l'altro.
- **Server** (`case 'grid'`, [webui.mjs](src/webui.mjs#L2313)): payload
  con in più `bandaSerie` = banda viva della serie corrente da
  `bandaSerieSlider` (84–85, base 87, trim 0, override vivo) — fallisce
  in silenzio: senza carriera (state assente) resta `null` e la GUI mostra
  solo il campo del file.
- **GUI** ([viste-griglia.js](gui%2Fjs%2Fviste-griglia.js)) in DUE posti:
  - sotto il titolo: «**Banda attiva dei cursori del weekend: 84–85**
    [allineata al campo]» (tag green; o warn «da riscrivere
    (Prepara)» se il campo scorre diverso dal file), e nella riga del titolo l'etichetta «AI 84–85
    (campo del file)» per dire
    subito chi è chi;
  - nel pannello Azioni, sotto gli input «Imposta intervallo AI»:
    «banda viva dei cursori: 84–85 — il campo del file combacia» (o
    «il Prepara la scrive nel file»), così la banda live si legge
    accanto alla leva che la può sovrascrivere a mano.
- **Endpoint provato sul vivo**: `POST /api/grid` → `aiMin 84 · aiMax
  85` e `bandaSerie {banda:[84,85], base:87, trim:0, override:true}`;
  GUI riavviata (riavvia-webui): tab Griglia mostra ambo i registri
  con il tag verde «allineata al campo».
- **Test**: viste-guard + webui-smoke **5/5 verdi**, biome pulita sui
  due file toccati, parse dei due file ok (`node --check`).

### 2/11 — Secondo giro di audit GUI: numeri costanti o sospetti in card e badge (fuori dalle tabelle)
Metodo del primo giro (1/11, tabelle): prima i candidati finiti coi grep
mirati pei file della GUI, poi la verifica di ciascuno sul server o nel
save/config — niente codice toccato. Perimetro: card, badge, chip, KPI,
banner (le tabelle sono già state passate). Esito:

**Un falso intero — il banner del trim suggerito (scheda
Carriera, [viste-a.js:714](gui/js/viste-a.js#L714))**: «Accettare sposta
anche la banda EVO della serie di **X×5** punti» — computa
`Math.abs((to - from) * 5)`. Ma la regola DI CASA dal 27/10 è: 1 punto
trim = 1 punto banda (stessa scritta nel tooltip del pannello
Difficoltà, [viste-d.js:30](gui/js/viste-d.js#L30), e nel server:
[webui.mjs](src/webui.mjs#L2999) `shift = (val - before) * 1` sia nel
ramo trim sia nel ramo accept [webui.mjs:3035](src/webui.mjs#L3035)).
Con la proposta standard '+1 trim' il banner promette 5 punti che NON
vengono. Stesso falso nel SERVER: il commento sopra il ramo
accept dice ancora «(+1 trim = +5 slider)»
([webui.mjs:3034](src/webui.mjs#L3034)) mentre il codice sotto fa ×1 —
commento da rializzare col codice se si tocca. Proposta fix GUI:
spostare il moltiplicatore da 5 a 1 lasciando il testo («punti») e le
due traduzioni it/en invariato.

**Ogni altra card/badge/chip passata al setaccio risulta onesta**:
- «vendi al 70% della valutazione» (Garage, [viste-c.js:337](gui/js/viste-c.js#L337))
  — salePrice vale ×0.70 con minimo 2000
  ([garage.mjs:40-48](src/garage.mjs#L40)).
- «N al cap 20%» (Campionati miscuglio, [viste-b.js:367](gui/js/viste-b.js#L367))
  — le 12 classi di [grid-classes.json](data/grid-classes.json) sono
  tutte `restrictorMaxPct: 20`, e il fallback in [grid-calib.mjs:141](src/grid-calib.mjs#L141)
  è 20. RISERVA LEGGERA: il «20» è scritto nel template della GUI, non
  arriva dai dati — se una classe avesse un cap diverso, il badge
  mentirebbe.
- «trim ±20» (pannello Difficoltà, [viste-d.js:5](gui/js/viste-d.js#L5) —
  specchio del view [webui-views.mjs:511](src/webui-views.mjs#L511)) —
  il server clampa `Math.max(-20, Math.min(20, ...))`
  ([webui.mjs:2978](src/webui.mjs#L2978)).
- «↺ torna al consiglio [consiglio, consiglio+1]»
  ([viste-d.js:43](gui/js/viste-d.js#L43)) — il server scrive
  `baseBand` … `baseBand + 1` (banda STRETTA di 1 punto, 23/10),
  [webui.mjs:2969-2981](src/webui.mjs#L2969).
- KPI della carta riviale (Scontri · Tu-Lui · Vittorie · Suo best · DNF
  suoi, [viste-d.js:788-834](gui/js/viste-d.js#L788)) — tutti dai dati
  del server (`totals`, `h2h`, `consistency.dnfRate`), nessun default
  costante;
- «30′ ≈ N giri» / «10 giri ≈ M min» ([viste-b.js:1003-1008](gui/js/viste-b.js#L1003))
  — ricalcolate dal giro vero, non numeri fissi;
- badge di stato passati (attiva · iscritto · sedile aperto · rep
  x/y · finestra PI · seed), [viste-b.js:359-367](gui/js/viste-b.js#L359) —
  dati del server ([stile-webui.mjs](src/stile-webui.mjs)).

Niente fix toccati in questo giro: audit non distruttivo. Il tasto
scaldato (banner ×5 e commento) resta in attesa di un «sistema» da
Mauro.

### 2/11 — Colonna SQUADRA del tab Rivali tolta del tutto
Seguito della trovata del 1/11 (la colonna era vuota per 74/74 rivali:
[viste-d.js](gui/js/viste-d.js) usava `r.team ?? '—'`, ma con `team:""`
il nullish non scattava, e l'endpoint mostrava `team:""` su tutte le
schede). Richiesta Mauro di oggi: «togli del tutto la colonna SQUADRA
finché le squadre non arrivano davvero dagli import».
- **Fuori** dalla tabella «Tutti i rivali»: la testa `<th>Squadra</th>`
  e la cella di riga `<td>${esc(r.team ?? '—')}</td>` — la riga ora
  parte Rivale · Gare insieme · Tu–Lui · Momentum · Forma · Vittorie ·
  Podi.
- **Restano** le menzioni `r.team` inline nelle carte Nemesi/Vittime:
  non sono una colonna e con `team:""` non disegnano nulla — se la
  squadra arriva con un import vero, lì torna visibile senza toccare
  nulla.
- **Verifiche**: `node --check` ok su viste-d.js, biome pulita sul file.
  Il server non cambia: `team` resta nel payload riviali per quando
  servirà.

### 2/11 — Menu del Banco A/B raggruppati per giorno
Richiesta Mauro: «raggruppa le sessioni del Banco A/B anche per giorno,
oltre a auto e pista, così due gare sulla stessa pista restano separate
nel menu». Il menu portava già auto · pista · data nella voce (1/11),
ma la lista era piatta: sfogliare 40 sessioni in fila.
- **GUI** ([viste-analisi.js](gui/js/viste-analisi.js), `riempiMenu`):
  le voci di A e B vanno in `<optgroup>` per GIORNO (etichetta tipo
  «01/11/2026», dal `mtimeMs` dell'endpoint `ab-list` — `when` è una
  stringa 'it-IT' non affidabile da rianalizzare in EN, quindi I GIORNI
  li calcola il client). La voce si distingue per ORARIO:
  «auto · pista · 21:45».
- I gruppi seguono l'ordine di arrivo del server (più recente per
  primo): primo giorno visto primo gruppo, senza riordini inutili.
- **Restano**: i filtri auto/pista con la riconferma della selezione
  A/B (1/11), e l'avviso «Non è un confronto giusto» quando auto o
  pista non ci tornano. Due gare sulla STESSA pista nello stesso gruppo
  sono distinguibili per orario; in giorni diversi finiscono in gruppi
  diversi e si vedono subito.
- **Verifiche**: `node --check` ok su viste-analisi.js, biome pulita sul
  file. Server intoccato (l'endpoint `ab-list` ha già `mtimeMs`).

### 1/11 — Crash delle 16:51: la fabbrica del grid è assolta (sonda)
Ieri il gioco è morto 0xC0000005 dentro AssettoCorsaEVO.exe il solo
evento in 7 ore di Event Viewer; sospetto della griglia:
«sostituisci le celle Porsche con quelle di fabbrica». Richiesta
Mauro: «perché dalla fabbrica? a inizio sviluppo e superata dal
paddock — controlla bene». La sonda [tmp/_sonda-pool.mjs]
(tmp/_sonda-pool.mjs) ha invertito l'ipotesi:
- `last_grid.customgrid` ≡ `data/grid-templates/endurance_gt4.customgrid`
  (stesso sha1, 21 celle: `storeTemplate` lo scrive a ogni griglia
  riuscita) — la vittoria è SEMPRE del template appuntato in magazzino;
- la fabbrica (`config/griglie-fabbrica/endurance_gt4.customgrid`)
  ti viene toccata SOLO dopo template → backup → snapshot falliti, col
  suo gate CAR_MISSING; è inoltre recente (31/10 18:34, rifoto del
  guardiano DOPO la cura varianti `- Standard` del 28/10): non residuo
  di prototipo.
- Le celle Porsche della cartuccia sono BYTE-IDENTIche alle prime otto
  celle della fabbrica (stesso pool `R8 LMS GT4 Evo` + `718 Cayman
  GT4 RS - Standard`, visual 1/2/99): sostituirle era un no-op con
  rischio dietro.
Verdetto: griglia assolta, crash attribuito a glitch engine/driver
(transitorio thread UI in menu, decodificatore video sotto). Report
completo [report/crash-261101-16.51.md](report/crash-261101-16.51.md).
Protocollo di esclusione se si ripete: rientro → se torna, disattiva
una app UIAPP per volta → se non torna, Kunos con il log già pronto.

### 1/11 sera — Esclusione secondo il protocollo: le TRE app UIAPP fermate in un colpo
Alle 17:37 EVO era già chiuso (dovuto a un tentativo di taskkill
di 10724 che lo trovò sparito tra l'elenco dei processi e l'azione).
Le tre app («cruscotto», «paddock», «pitwall») sono stati fermati
TUTTE INSIEME (non una per volta come da protocollo ma in blocco,
per un colpo solo): le cartelle rinominate con prefisso `_OFF-` in
`Saved Games/ACE/mods/uiresources/ACEUIAppLoader/`:
- `_OFF-cruscotto`, `_OFF-paddock`, `_OFF-pitwall`.
La griglia NON si tocca: è la stessa che è girata (byte per byte
scoperte: le celle Porsche della cartuccia sono identiche a quelle
della fabbrica e del template in magazzino).
Il partito è: se il crash all'«Avvia sessione» NON si ripete con le
app disattivate, il colpevole è il codice delle app e si isolano
riattivandole UNA per volta (mv per ridare il nome, riavvio di EVO
tra i passi): così si conta. Se invece il crash chimbi senza chiama,
il responsabile non è il codice della nostra app ma l'engine (il bug
flaky conocciuto, il medesimo del 23/10): resta la via Kunos
(log-261031-153615.txt + Event Viewer già in mano).
Come si riattiva una app, esempio cruscotto:
```
cd "Saved Games/ACE/mods/uiresources/ACEUIAppLoader" &&
mv _OFF-cruscotto cruscotto
```

### 1/11 sera — La prova è completa: il crash NON è nostro (2ª caduta con le app SPENTE)
Alle 17:42, con le TRE app UIAPP ancora disattivate (i tre app.json falliti
si vedono nel log 174040 a 17:40:52), il crash è tornato allo stesso punto:
0xC0000005, 17:40:40 avvio → 17:40:50 carico del weekend → 17:41:07
CarTeleportCompleted → **17:41:51 caduta DENTRO cohtml.WindowsDesktop + v8**
(Gameface, la UI stock di EVO), poi le frame AssettoCorsaEVO. I due crash di
oggi (16:51 e 17:42) portano offset DIVERSI nell'exe (0xf24900 e 0x15b9459):
non un punto in rigore, ma la STESSA zona (UI engine) del verdetto flaky del
23/10.
- La frase di EVO nel log da portare a Kunos: «scene_actors collection
  doesn't contain track_limits_left splines, seems like we lack the right
  containers in this Gamemode» (17:40:50).
- La teoria del «21 vs 20» è MORTA a sua volta: il builder in dry-run dice
  21 celle = forma ALLINEATA (riga 3.7 = 20 aggiunte +1 sei tu). Conto,
  bilancio, banda e celle valide: NIENTE da sistemare nei dati.
- Rifarmi EVO (PID 12168 via Steam) e riprova secondo il protocollo flaky:
  stesso file crashato una volta, girato due volte dopo.
- Report aggiornato:
  [report/crash-261101-16.51.md](report/crash-261101-16.51.md) — sezione
  «SECONDA CADUTA». Ripiego pratico se la 3ª caduta RIPETE: gara
  PERSONALIZZATA su Imola con la stessa flotta, fuori dalla ronda, in attesa
  di Kunos.

### 1/11 serata — TROVATA E CURTA la causa vera: la cura variante del 28/10 aveva Rinominato IL PRESET PORSCHE (e EVO non lo conosce)
Mauro ricorda il pezzo mancante: «le anteprime nere erano state già
verificate e sistemate tempo fà». Infatti era la cura del
[30/10 ore 12:55](#30102026-ore-1255--corretto-la-griglia-va-fotocopiata-dai-template-veri-non-sintetizzata)
(«APPLICA grigio e senza anteprime → fotocopia dai template VERI»). Con
quella lente ho rifatto il confronto:
- Il magazzino di PRIMA della cura —
  `L:\CarrieraEVO\evo-pitwall-backup-25-10-2026\data-progetto\grid-templates\endurance_gt4.customgrid` —
  porta le celle veramente di EVO: preset Porsche **`preset_718gt4rs_mech_2`**,
  ZERO stringhe `…- Standard`, etichetta pulita «Porsche 718 Cayman GT4 RS».
- La cura variante del 28/10 ha riscritto il pool con il preset
  `preset_718gt4rs_mech_1` e l'etichetta «Porsche 718 Cayman GT4 RS
  - Standard». EVO non risolve quel preset: anteprime NERE, scritta slug
  `ks_porsche…standard` nel menu griglia — e al momento del carico della
  sessione il crash cade dentro la STESSA zona (cohtml/Gameface), con le app
  UIAPP già fuori da gioco.
- La cura (stessa ricetta del 12:55, applicata oggi): backup in `tmp/` dei
  due file attuali; `griglia --template` puntato al template sano su L:\ →
  cartuccia a 18 celle con SOLO celle vere; poi `griglia` senza template →
  allineamento automatico «18 → 21» (9 Audi + 10 Porsche + tu), banda AI
  84–85 mantenuta.
- VERIFICA DISCO: `last_grid.customgrid` = 21 celle (count 21 = 20+1
  allineato), preset Audi mech_1 e Porsche mech_2, **zero** `tandard` nel
  file vivo E nel template di magazzino (`storeTemplate` ha già scritto la
  forma sana). La teoria «21 vs 20» resta MORTA: era il NOME DEL PRESET, non
  il conto.
- LEZIONE: la cura che Rinomina i preset in piscine «… - Standard» va
  ABOLITA — EVO le celle si fotocopiano SOLO da template VERI e NON si
  rinominano i preset/visual originali dei slot di EVO. Report integrale:
  [report/crash-261101-16.51.md](report/crash-261101-16.51.md) sezione «LA
  CAUSA VERA» + «LA CURA APPLICATA».
- Le app UIAPP restano disattivate (cartelle `_OFF-*`) finché Mauro non
  conferma le anteprime vive e la sessione in piedi: POI si riattivano e si
  chiuda anche l'esclusione che le app non c'entrano (il crash è già caduto
  con esse SPENTE).



## 1/11 sera — le GRIGIE del 718
- IL FATTO: riaperto il gioco, la griglia del weekend porta le 22 Porsche 718 GT4 RS tutte identiche (giusto, monomarca voluta) ma TUTTE GRIGIE: il gioco carica il default senza livrea.
- LA CAUSA: il template attuale (riscritto dopo il cambio-serie alle 19:15) porta in ogni cella il campo 11 con preset_718gt4rs_visual_1 e «718 GT4 RS - Visual 1»: stringhe mai scritte dal gioco. I bak-apply autoritativi (15:57 e 16:56, scritti da EVO) fotografano per il 718 SOLO preset_718gt4rs_visual_2 «718 GT4 RS - Visual 2». Preset irrisolvibile = livrea di serie grigia su ogni cella. Stessa lezione del crash 16:51: EVO si fotocopia SOLO stringhe vere, i preset visual non si inventano.
- LA CURA (tmp/_cura-liveria-porsche.mjs, EVO chiuso): campo 11 fotocopiato INTATTO da una cella-vera del 718 (carId ks_porsche_718_cayman_gt4_rs) del bak-apply 16:56, applicato a template di magazzino, last_grid e roster del weekend (syncRoster, Practice a 22 slot). Backup bak-liveria su ogni file
- ERRORE FISSATO IN CORSO: la prima estrazione prendeva la prima cella del bak, una Audi R8 (preset_r8gt4_visual_1): liveria del modello sbagliato. La cura va per carId del 718 nel campo 3, non per prima-cella; il secondo giro ha sovrascritto ogni destinazione.
- VERIFICA DISCO: last_grid = 22 celle tutte 718 GT4 RS - Visual 2; template di magazzino idem; roster Practice 22 slot col carId del 718. Conteggio, preset meccanici, PI e abilità NON toccati: SOLO il campo 11.
- PROSSIMA VISTA IN GIOCO: riaprire la ronda (o menu griglia SENZA GENERA, poi APPLICA) e guardare le livree: ora portano il preset autorevole di EVO. Varietà fra le 22: la via del parco resta più livree del 718 nel menu livrea di EVO + APPLICA, così raccogli fotografa anche visual_3 e oltre.

------------------------------------------------------------------------------
- 1/11 ora 19:32 — ANTEPRIME VUOTE nella Personalizzazione Griglia (23 carte
  senza auto): la cura «liveria» di ieri sera 19:15 era CHIMERA. Aveva
  fotocopiato SOLO il campo 11 (preset visual_2 «gialla racing», vero e
  benigno) lasciando il blocco f14 (colori della livrea: EXT SKIN, caliper,
  decal, interni) ancora sulla visual_1 NERA di serie. Combo mai scritta da
  EVO (f11 giallo a f14 nere) → l'anteprima non si costruisce: carta vuota,
  possibile crash al carico (stessa zona Gameface del 16:51).
- DIAGNOSI: delta pre/post-cura = SOLO f11 cambiato (stessa forma, identica
  lunghezza) → il problema NON era corruzione ma INCOMPLETEZZA della
  fotocopia. Il mech preset f10 «mech_1» è risultato LEGITTIMO: è la coppia
  che EVO stessa ha scritto nel backup 15:57 con etichetta lunga e sana; non
  è stato lui il veleno stavolta.
- CURA: tmp/_cura-chimera-liveria.mjs (dry-run e --scrivi) — il blocco f14
  SPICCATO INTERO (31 posizioni) dalla cella GIOCO-AUTORE del backup
  bak-apply-15-57-51, la STESSA coppia che le celle dichiarano (mech_1 +
  visual_2). f10 e f11 intatti (PI e abilità invariati). Applicata a: last_grid
  vivo, template endurance_gt4, roster del weekend (syncRoster). Backup
  *.bak-chimera-2026-11-01T19-32-31 su ogni file.
- VERIFICA DISCO: 23/23 celle (vivo e template) con f11=visual_2 e f14
  IDENTICO AL BYTE al donore 15:57; roster riscritto. Ricontrollare col menu.
- LEZIONE (aggiunta alla regola le celle si fotocopiano SOLO da template
  VERI): quando si cura una LIVERIA si fotocopia TUTTO il blocco
  dell'aspetto (f10 mech + f11 preset + f14 colori, il run INTERO) da UNA
  CELLA GIOCO-AUTORE che la stessa coppia monta — non la singola etichetta.
  Cura parziale = chimera = anteprime morte.
- SONDA CHE COSTRUISCE: il template endurance_gt4 contava 23 celle (non 18)
  al 1/11 sera: le cure successive gli hanno appese celle — innocue anch'esse,
  e in cura non si tocca il conto.

### 3/11 sera — IL MARGINE VERO è tornato: si legge dai LOG del gioco, non dal file risultato
- LA DOMANDA: «il margine a 0.00» era vero per costruzione — nei file risultato
  EVO scrive SOLO i settori del giro migliore (somma = best_lap alla centesima):
  giro teorico ≡ best reale, margine impossibile lì. La colonna fu tolta.
- LA FONTE VERA: i log del gioco (Saved Games/ACE/Logs). Ogni attraversamento
  scrive «Split completed for car X: (M ms, splitindex N) lap:L» con N = S1/S2/S3
  e L = contatore della sessione (lap:0 = giro di uscita con ms cumulativi da
  scartare); ogni apertura weekend scrive «Game Started! … | <Pista> <tipo> …».
  La stessa riga la scrive 3 volte di fila: deduplicata.
- COME SI LEGA L'AUTO DEL PILOTA: la tripla dei splits del best_lap del file
  risultato compare IDENTICA alle righe log del giro — abbinamento esatto.
- NUOVO SRC/margine-log.mjs: parse dei log (cache mtime/size come analyzeLd,
  cap 14 file recenti), finestre dei weekend dai «Game Started!», giri segnati
  (lap ≥ 1), filtro anti-rumore: ogni settore entro 50%…130% del corrispondente
  del giro legato — le gare della stessa serate su piste diverse non si
  inquinano (il caso Brands/Donington del 31/10, carId riutilizzati).
- SEMANTICA FINALE: margine = best ACCREDITATO nel file risultato − somma dei
  minimi settoriali del log nella finestra della sessione legata. Positivo =
  tempo da recuperare assemblando i tuoi settori (Kyalami 23:00 → +1,63 s,
  Donington → +6,10 s dove il giro segreto più veloce non è stato accreditato);
  può uscire negativo se i settori non battono il giro accreditato.
- TETTO TEORICO: colonna «Margine vero» di ritorno (viste-analisi), per pista:
  margine dell'ultima sessione misurata + margineBestMs + margineSessioni;
  hint aggiornato su entrambe le lingue. I log più vecchi ruotati → «—».
- TEST: test/margine-log.test.mjs (scene synth: practice+race stessa pista,
  lap:0 cumulativi, righe triplicate, piste che non combaciano → 4/4);
  suite completa 766/766; biome pulito; endpoint /api/tetto su dati veri:
  Donington 6096, Imola 930, Oulton 624, Brands 312, Kyalami 0 (log presenti).

## 1/11 notte — LE CELLE SONO SOLO FOTOCOPIA: il cancellaio del builder (2/11)
- LA FEDE LEZIONE alla radice, stile Paddock: il builder non INVENTA NIENTA.
  Nomi (carId, mech_N, visual_N) e soprattutto l'INTERO blocco f14 — la livrea
  vera con i suoi colori interni, non l'etichetta — esistono SOLO dentro le
  celle che EVO scrive lui; la libreria «a parte» non esiste.
- CHIMERA del 1/11: template riscritto a mano dopo il cambio-serie ha
  accostato campi (f11 «visual_2» gialla del donore + f14 del DEFAULT nero).
  Coppia mai scritta da EVO → anteprima vuota in Personalizzazione Griglia e
  crash Gameface di ieri 16:51. Curata con tmp/_cura-chimera-liveria.mjs
  (--scrivi): f10 f11 f14 fotocopiati INTERI dalla cella gioco-autore
  del backup 15:57, che monta la STESSA coppia.
- IL GUARD (src/gridbuilder.mjs, hoistato carIdDi): ogni cella candidata della
  serie viene decodificata; il modulo mech (f10) e quello visual (f11) devono
  dichiarare lo STESSO ID-MODELLO dell'auto (f3). Se non combaciano →
  BuildError: «fotocopia una cella intera dal parco, non assemblare campi».
- INVARIANTE su tutto il parco reale: 2530/2530 celle parlano dello stesso
  modello in f10 e f11 (scansione tmp/_prova-tutte-le-celle, script monouso).
- CANCELLAIO NELL'OCCHIO giusto: il nucleo normalizza l'ID togliendo il
  suffisso `_(mech|visual).*`, così i placeholder dei test tipo «visual_v1»
  e i template dei test corrotti non fanno scattare il guard a sproposito.
- TEST: test/grid-templates.test.mjs #8-#9 (coppia mista rifiutata; celle
  sane distinte passano, in piedi ANCHE la regola anti-celle-identiche);
  suite completa 769/769; biome pulito su src/gridbuilder.mjs e test.

### 3/11 — Rapporto gara: la riga «Giro teorico» ora usa la fonte VERA o manca
- LA COSA ovvia a occhio: nel rapporto di gara «Giro teorico (i tuoi migliori
  settoriali)» ripeteva il best. Il motivo che già sapevamo: nel file risultato
  EVO scrive SOLO i settori del giro migliore, la somma È IL BEST per
  costruzione (lezione 3/11 in tettoReport), «scorta» sempre assente.
- LA SISTEMO (richiesta Mauro: «sistemala o togila»): la riga cambia SRC —
  non la somma dai splits del file, ma i minimi settoriali giro-per-giro dai
  LOG del gioco tramite margineVeroDaLog (legame sessione e log: la tripla
  del best accreditato, stessa finestra del marker, stessa regola 50%…130%).
  Etichetta: «Giro teorico (dal log del gioco, minimo per settore sui giri
  segnati) — su N giri»; la scorta si mostra SOLO se positiva.
- NESSUN numero quando il log non abbina (log ruotati o gara assente): la
  riga sparisce del tutto, il rapporto resta senza teorico falso.
- SORGENTI: src/rapporto-gara.mjs (rapportoGara aggiunge sect.vero da
  margineVeroDaLog; mdCompose mostra la riga solo con sect.vero). I campi
  theoreticalText ecc. restavano in sectorAnalysis per hotlaps/analisi (fuori
  da questo passo) — chiusi col punto sotto.
- TEST: test/rapporto-gara.test.mjs — senza log abbinati NESSUNA riga
  (prima asseriva il contrario); nuovo test il-log-ha-la-tripla: il MD mostra
  teorico 2:38.245 su 2 giri e scorta 0:00.410. Suite completa 770/770;
  biome pulito su i due file. Rapporto reale 261030-2117 generato senza errori.

### 3/11 (serata) — Il teorico VERO arriva anche all'hotlaps e alla scheda giri
- DOVE ERA STATO: la colonna «teorico» del quaderno dei giri liberi (tab
  Gironi, via hotlapsLog) e i campi theoretical* della scheda Analisi usavano
  ancora la somma dei splits del quaderno: il best stesso per costruzione,
  quindi un teorico finto (guadagno sempre 0). Restava l'ultima parte del
  passo «Giro teorico» del 3/11.
- LA LEGGE VERA (stessa di rapporto gara e tetto): hotlapsLog(n, { logsDirs })
  ora chiede a margine-log il minimo per settore sui giri segnati dei LOG del
  gioco, agganciando la sessione con la tripla del best accreditato e la
  finestra del marker. La sostituzione è a ogni render (in hotlapsLog):
  il quaderno su disco resta intero, il teorico si ricalcola a ogni lettura
  per le sessioni che i log ancora coprono.
- SENZA ABBINAMENTO niente numero: theoreticalText e compagni ESCONO NULL
  (la colonna smette di mentire) e le viste che li usano mostrano «—».
- LA SCHEDA DELL'IMPORT GARA (src/import.mjs, runImport): subito dopo
  sectorAnalysis il teorico della scheda viene sostituito con la legge vera
  del log (chiave: nome del file risultato, pista del risultato); con
  abbinamento si aggiunge anche veroLog (margineMs, giri); senza,
  theoretical* a null. La voce finisce PERSISTITA nell'entry: le gare importate d'ora
  in poi portano i VERI campi. viste-c.js mostra «—» sui campi null.
- LA FRASE dell'Autopsia (src/analisi.mjs): «rispetto al giro teorico
  (il minimo per settore sui giri segnati, dai log)» — niente più
  «somma dei settoriali», che con i splits del file sarebbe solo
  un ricalcolo del best.
- Il teorico del libro PB (idealLapMs) è UN'ALTRA STORIA, legittima:
  somma dei migliori settoriali presi tra sessioni diverse su quella
  auto × pista — può davvero essere più veloce del PB stesso e resta.
- SRC toccati: src/hotlaps.mjs, src/webui.mjs (logsDirs a hotlapsLog),
  src/import.mjs, src/analisi.mjs, gui/js/viste-c.js.
- TEST DI GUARDIA (test/import-teorico.test.mjs, forgia sintetica gemella del
  test del rapporto): con un log che abina la tripla, `runImport` restituisce
  la scheda con theoreticalText = 2:38.245 (minimo per settore), veroLog
  margine 0:00.410 su 2 giri; senza log abbinati (pista diversa dal marker)
  theoretical* = null. 2/2 pass, biome pulito.
- Un'eco del mattino diceva la riga «teorico» di viste-c ancora morta: era lo
  stato PRECEDENTE alla sostituzione — la legge attraversa runImport (il
  vero arriva anche PERSISTITO nell'entry via applyRaceResult) e il test di
  guardia ora lo impedisce per sempre.

### 2/11 sera — La cura delle livree diventa PROCEDURA PERMANENTE (e una scoperta sul parco)
- Da Mauro il via libera («continua»): la cura-chimera monouso del 1/11
  diventa tool di famiglia: [tools/cura-livree.mjs](tools/cura-livree.mjs).
- COME LAVA GLI ERRORI: per ogni identità dichiarata (carId + nome preset
  mech + nome preset visual — i BYTE dei moduli NON sono identità: cambiano
  dettaglio senza cambiare livrea) raccoglie le varianti di f14 dal parco di
  GameModes (last_grid.customgrid e tutta la pila bak-*) e sceglie la PIÙ
  FREQUENTE. Il f14 viene copiato PER RUN INTERO: livree in fila, ordine di
  EVO; f10 e f11 intatti (PI e skill si rimangono). Bersagli: i template in
  data/grid-templates + last_grid; dopo la scritta, roster del weekend
  risincronizzato. Se un'identità non c'è nel parco, la cella resta COM'È:
  auto fuori dal parco corrente, non verificabili — niente numeri inventati.
- LA SCOPERTA (sonda tmp/_sonda-donori.mjs, cancellata dopo l'uso): per la
  STESSA identità EVO scrive PIÙ varianti di f14 — nel parco 92 varianti
  per 30 identità. La livrea è generata per griglia, non unica: il "primo
  donore visto" era una lotteria, il quorum maggioritario dà una scelta
  stabile a ogni cambi-serie.
- LA PASSATA VERA (20:41, --scrivi, backup bak-livree-* su ogni file): 27
  template sistemati (gt4_serie_b 15, coppa_porsche-718 13, campionato_pista
  9, contati in output); endurance_gt4 e last_grid già a posto: 0/0 al
  secondo quadro. Scritture solo nei template.
- PROSSIMO CAMBI-SERIE: node tools/cura-livree.mjs (quadro) e --scrivi se
  l'anteprima resta vuota; il cancellaio del builder impedisce di crearne
  di nuove. COMANDI-BUFFY.md aggiornato.

### 3/11 (notte) — Il 0,00 del tetto: campione vero o campo vuoto

- FENOMENO (Mauro): nel Tetto teorico Suzuka e Laguna escono col delta
  0,00 e sembrano auree. Nell'archivio reale SONO campioni veri (top3
  negative, bestNames miei) — ma due casi diversi si nascondevano dietro lo
  stesso numero: «sono io il campione» (delta 0 con rivali che hanno i
  splits misurati: tutti i best settoriali della griglia sono miei) e
  «senza dati» (nessun avversario con split nel file: il best è mio PER
  COSTRUZIONE, il vecchio `?? 0` in tettoReport trasformava il campo vuoto
  in uno 0,00 identico al campione).
- [results.mjs](src/results.mjs) — `sectorAnalysis` porta la PROVENIENZA:
  per settore `fieldCount` (rivali veri col split misurato) e a sede
  `solo` (nessun campo vivo in tutta la sessione).
- [analisi.mjs](src/analisi.mjs) — `tettoReport` agrega solo i delta col
  campo vivo: la busta di un ingresso senza campo vale NULL (nessun dato),
  i suoi settori non entrano più né nella busta per pista né nella mediana
  del reparto né nella classifica dei peggiori. Con campo a 0,00: campione.
  Vecchi import senza fieldCount: campo presente, comportamento invariato.
- [viste-analisi.js](gui/js/viste-analisi.js) — la cella «Delta sul
  campione top» distingue: 0,00 + tag verde «🥇 campione» (con tooltip),
  pista senza alcun dato con campo = «— senza dati» stinto; il piede della
  vista dice la regola.
- Test di guardia in [analisi.test.mjs](test/analisi.test.mjs): le quattro
  forgie (campione vivo / campo vuoto / settore misto / vecchio import),
  28/28 pass. Biome pulito sui 4 file toccati.
- PROSSIMO GIRO: le tinte della cella campione e la nota piste-fuori
  (oggi contano il riparto, domani potrebbero distinguere le senza-dato).

### 3/11 — IL NOME PULITO DELLE PISTE ANCHE IN GIOCO: Pitwall e Cruscotto parlano come il banco A/B
- CHIESTO (Mauro): «Porta il nome pulito delle piste anche nei chip del
  Pitwall in-gioco, usando la stessa prettyTrackLabeled».
- DOVE ERA IL VELENO: non nelle card azioni (quelle portano già i nomi
  TRACK_INFO: `specFor().name` per la ronda, `eventTrackReal` per
  l'evento) ma nel VERDETTO DI GIORNATA — le righe speddite al pannello
  in gioco portavano la pista del file Results GREZZA (token di cartella
  tipo «OultonParkInternational») e il giro migliore « @ pista» grezzo.
- LA CURA ([uiapp-pub.mjs](src/uiapp-pub.mjs), publisher delle fasce):
  `verdettoFascia` prende il ladder in mano (stesso oggetto della
  vetrina) e le righe del verdetto escono con `prettyTrackLabeled` di
  testday.mjs — UNA sola implementazione, come chiesto. AVVERTENZA:
  il verdetto incolla il layout in coda («Mount Panorama (GP Race)») —
  la prima tentata andata lo strappava in fondo «Mount Panorama
  Race)» (fascia 261102): ora il layout si SCASTA prima (regex sulla
  coda tra parentesi) e si ripala dopo, identico com'era.
- COLPITI DALLA STESSA cura: le righe del verdetto e il giro migliore
  nel Cruscotto in gioco e nella Pitwall (miniPitwall porta la stessa
  `dati.verdetto` già pulita) — il pannello non cambia riga.
- TEST ([uiapp-pub-priorita.test.mjs](test/uiapp-pub-priorita.test.mjs)):
  col LADDER il token «OultonParkInternational» esce «Oulton Park
  (International Race)» e la pista già pulita col layout «Mount
  Panorama (GP Race)» resta INTATTA; senza ladder la firma resta quella
  di prima (pista grezza intatta, mai un nome inventato).
- Collaudo a fascia viva: riavvio del server (tools/riavvia-webui.mjs)
  e la fascia `ui-<slot>.json` della Pitwall porta «Mount Panorama (GP
  Race)» — la pista di notte già bella, il layout al suo posto.
- suite: uiapp-pub-priorita + pitwall-radio 53/53 pass; biome pulito sui
  2 file toccati.

### 3/11 — REGISTRO DEL QUADRO-ZONE: striscia vs riparto del banco, si dicono la verità
- CHIESTO (Mauro): «estendi il registro del quadro-zone: confronta il
  riparto del banco con quello del quadro-zone e segnala se non
  tornano» — la striscia e il riparto nascevano dalla STESSA coppia
  campionata, ma la striscia filtra le fette (soglia per punto +
  minSlivers), quindi i due numeri potevano divergere.
- ANALISI (`src/analisi.mjs`): la striscia (zoneTimeline) ora porta
  `somme` (secondi visibili per zona, firmati), `riparto` (grezzo,
  stesse soglie del banco) e `gained`; il registro vero è
  `quadroZoneCheck` (2/11, zona per zona): soglia ZONA max(0.08 s,
  20%) e netto 0.15 s (la stessa tolleranza già in piedi nel test
  della striscia); senza banco usa il riparto della striscia stessa.
- `src/webui.mjs` `ab-setup`: attacca `zoneTimeline.check` col banco
  (zones + netRiparto) sul vivo del confronto — una sola fonte del
  verdetto, la GUI non ricalcola nulla.
- `gui/js/viste-analisi.js`: la striscia legge zl.somme (niente più
  doppio conteggio) e mostra il VERDETTO giusto sotto la legenda:
  «✔ registro: striscia e riparto del banco tornano» o «⚠ NON
  tornano» con gli scarti in fila (zone o netto, striscia vs riparto).
- TEST + BIOME: `test/analisi.test.mjs` aggiunge quadroZoneCheck
  (coppia di finte fette coerente → ok, banco che dichiara più della
  striscia → scarti in frenata e netto, null senza striscia) e tutto
  il modulo passa 23/23;
  biome pulito sui 4 file toccati (messa a posto let→const di
  _vocePanelloSilAt, pre-esistente a questo giro).

### 3/11 (mattina) — LE 3 SKIN DELLA MX-5 ND CUP: parco confermato, caso chiuso
- CHIARIMENTO (Mauro, verificato a mano nel pannello Livree di EVO):
  l'auto ha SOLO 3 skin — la bianco/rossa e DUE rosse tra loro quasi
  gemelle. Il pool scritto nelle griglie del weekend (13 celle
  «bianco/rossa» Visual 2 + 3 Visual 1 + 3 Visual 99, tutte rosse) NON
  è un errore: è il parco livree reale dell'auto.
- La prima impressione «ho solo 2 skin deriva dal fatto che le due rosse
  (Visual 1 e Visual 99) si distinguono solo nei dettagli interni
  (banner/roll del f14), non nel colore: a occhio fanno un solo gruppo.
- NESSUN INTERVENTO sul tool: le celle e il builder sono a posto cosi.
  Il cancellaio del builder (1/11) impedisce comunque di assemblare
  coppie mai scritte da EVO.

### 2/11 notte — Crash 01:47:30 curato: il veleno del 718 era RIENTRATO dal magazzino; Paddock torna nel menu
- IL FATTO: caduta 0xC0000005 nella zona Gameface al carico del Race
  Weekend (stesso verdetto del 23/10 e delle due cadute del 1/11):
  `last_grid.customgrid` riscritto alle 01:47 portava 20 celle con
  `preset_718gt4rs_mech_1` ed etichetta «… - Standard» — LA STESSA
  ricetta del verdetto «LA CAUSA VERA» del 1/11 sera.
- DOVE ERA RIENTRATO: il magazzino della serie viva,
  data/grid-templates/endurance_gt4.customgrid, era tornato velenato
  (23 celle mech_1 + «Standard») da stanotte: ogni ricostruzione
  (builder, Prepara, vigia) da lì riboccava le celle morte in
  last_grid — e lo ha fatto di nuovo QUESTA NOTTE, poco prima del crash.
- LA CURA (rituale del 1/11 sera, rifatto fresco): template sano dal
  backup 25/10 su L: (9×718 mech_2 + 9×R8, zero «Standard»);
  `griglia --template` → cartuccia a 18 celle vere; `griglia`
  (magazzino) → allineamento 18 → 21 (20 avversari + tu), banda 84–85.
  Il fisso: il guard storeTemplateSeNonRidotto ha rifiutato
  l'appuntamento del template nuovo (21 < 23 celle) e il magazzino
  RESTAVA velenato — neutralizzato a mano, fotocopiando il vivo (sano)
  sopra il template: ora magazzino e vivo sono la stessa cosa, zero
  «Standard», 10×718 mech_2 + 11×R8 (mech_1, visual_1 + visual_99).
- FILE DI SICUREZZA: veleni salvati in
  tmp/bak-veleno-porsche-718-*.customgrid e
  tmp/bak-veleno-endurance-*.customgrid; su last_grid la consueta pila
  bak-griglia/bak-apply.
- AMBITO: le etichette «… - Standard» le scrive EVO anche da sé
  (bak-apply 15:57 e 16:40; per R8/695 ecc. sono legittime). Per il 718
  la coppia VERIFICATA da EVO resta: mech_2 + etichetta SENZA
  «Standard» (bak-apply 16:56 e 18:14/18:15/18:35, celle 718 pulite).
- LUNGO LA STRADA: il resto del magazzino (gt4_open, gt4_serie_b,
  campionato_pista, campionato_strada) porta ancora 718 con
  mech_1/«Standard» (8/9/4/2 celle: da curare con la STESSA ricetta
  prima di correre quelle serie). E il re-inquinamento delle 20:32–21:41
  di stanotte resta da attribuire (sospetto: cure/ripreparazioni dei
  template); rituale d'ora in poi: prima della serie col 718, grep
  «tandard» a zero sia in magazzino che nel vivo.
- PADDOCK: era finito in `_OFF-paddock` con il taglio DI BLOCCO delle
  tre app UIAPP (17:37 del 1/11, protocollo di esclusione del crash);
  stanotte a 01:53 cruscotto e pitwall erano di nuovo attivi ma il
  paddock era rimasto off. Ora `mv _OFF-paddock paddock`: torna nel
  menu di EVO. Nel loader restano le due copie `_OFF-cruscotto` /
  `_OFF-pitwall` (inerti, non caricate: da ripulire quando si vuole).
- PROSSIMA PROVA IN GIOCO: apri EVO → menu griglia (SENZA GENERA) →
  controlla → APPLICA → gara. Con le anteprime vive e la sessione che
  sale, la notte è chiusa; se cade di nuovo → protocollo di riprova e
  log già in mano, e si va a Kunos con il racconto dei 4 crash.

## 2/11 sera — DEBITO DI PULIZIA: via la rinomina singola col window.prompt
- NOTA (richiesta Mauro): tolto il bottone ✏️ di rinomina SINGOLA, ovunque
  usasse `window.prompt`: la casella ✏️ in ogni riga del registro «Tutti i
  rivali» (viste-d) e i bottoni «✏️ Rinomina» nella scheda rivale e nel
  dossier (viste-d) e nella scheda della classifica mondiale (viste-b).
- ELIMINATO anche `rinominaPilota` in core.js: era l'unico chiamante di
  `window.prompt` per i soprannomi — il pop-up nativo del browser è brutto
  e blocca l'app; zero riferimenti residui in gui/ (grep a vuoto).
- RESTA l'UNICA via:
  «📝 Soprannomi in blocco» (b-bulk-rn, viste-d bulkRinomina): un modal con
  ricerca e casella per ogni pilota + «Salva tutti», ciascun alias via
  `alias-set` come prima. Nota: il blocco vive nel registro rivali (scope
  'rival'); dalla classifica mondiale i nomi lì NON si possono più
  rinominare in loco (i modali lì hanno solo Chiudi) — serve il registro.
- NON TOCCATI: il form «Rinomina» del nome carriera (f-rename, è un campo
  testuale, non window.prompt) e gli altri prompt legittimi (nota setup in
  viste-c, nome preset in viste-b, rimozione preset in viste-griglia).
- SINTASSI: node --check OK su core/viste-a/b/c/d/viste-griglia.

### Il caso stantio del generatore entra in guardia (3/11, richiesta Mauro)

Richiesta: «Aggiungi al test anche il caso copia-in-gioco-stantia del
generatore, con un finto ACE_SAVEDIR popolato». Il richiamo (genera-uiapp
rivede la copia installata ≠ costruito → richiama da solo l'installatore
nella STESSA run, uscita non-zero = build fallita) non aveva il caso di prova:
la guardia guardava solo le stanza vere (uiapp-installata 3) e le sandbox dei
flussi (installa-gioco.test.mjs). Ora **test/uiapp-installata.test.mjs** porta
il test COPPIA STANTIA:
- radice Saved Games FINTA in temp, popolata COME la vera: mod ACEUIAppLoader
  installata (cartella app con app.json + costruito) + marcatore del loader
  (file vuoto ACE/Video/ACEUIAppLoader-cruscotto.settingspreset, lezione 17:55);
- la copia di cruscotto dentro è STANTIA (vecchio .js a mano ≠ costruito) e
  ACE_SAVEDIR comandata alla radice finta: genera-uiapp E l'installatore che
  richiama girano SOLO lì, mai nella stanza vera;
- prove: log gridato «non corrisponde alla costruita», uscita 0, in radice
  finta la copia consegnata è il costruito IDENTICO byte per byte, e alla
  SECONDA run «niente da reinstallare» (idempotente).
In bocca al lupo al test 1 il generatore gridava «non corrisponde all
costruita» (svista in genera-uiapp.mjs): corretta in «alla costruita» — la
guardia aspetta il messaggio vero, il tool parla bene.

Verificato: node --test test/uiapp-installata.test.mjs **6/6** (le 5 guardie
precedenti restano), biome su test+tool 0.

## 2/11 — ore 19:20 — chiusura della cura del save (round 3, terza volta buona)

- **Radice del ricaduto**: `test/ronda-ladder.test.mjs` importava `webui-env` in modo
  statico: ESM innalza gli import PRIMA dell'assegnazione `EVO_DATA_DIR`, quindi la
  suite scriveva sul save vero (rifinito alle 19:09 e di nuovo alle 19:17 sotto suite).
  Cura: dynamic import DOPO che l'env è puntato al banco, come già fa testday-margine.
- **Rientro gara (3ª volta)**: restore da `evo-career.save.bak-2026-11-01T23-54-04.auto.json`
  + hash 784ebfa906048458 rimosso dal registro + `import`. P4/20 su Mount Panorama,
  giro veloce, 13 punti, banca 630.392, rep 726, round 3, 416 piloti, ronda 2 nel book.
- **Server webui**: il vecchio (pid 23684→24324) teneva lo stato sporco in memoria ed
  era LUI le 19:09 (i tick del webui attivo hanno riscritto i campi poveri sopra il mio
  restauro). Riavviato con `tools/riavvia-webui.mjs` → nuovo pid 5440 (19:20:30) che
  ha letto lo save buono; lo save integro sotto tick 20 s (mtime/size fermi).
- **Suite conclusiva**: prima run 833/834 (sonda anti-colpo a 1 solo in suite; verde
  4/4 da sola — stesso quadro a rotazione del vecchio "tab Impostazioni", incastro
  parallelo ambientale). Seconda run: **834/834 pass, fail 0, exit 0**. Biome: 0 error,
  6 warning preesistenti.
- **Imparo**: nella suite ogni test che tocca `webui-env` DEVE girare l'import con
  dynamic-import a valle dell'assegnazione EVO_DATA_DIR — gli import statici sono
  innalzati e ignorano l'env.

### 3/11 (notte) — IL CERCHIO COL MIRROR: la card beve dalla ronda del calendario (pd-calendar o journal nostro), meteo a due scale, layout della card giusto
- CHIESTO (Mauro): chi NON ha l'app del gioco in gioco, la scheda della
  gara («Iscriviti e divertiti») la deve scrivere come la app ma con la
  ronda presa DAL MIRROR (src/journal.mjs), che a ogni saveState
  rispecchia la agenda del ladder accanto al save.
- L'UNICO CERCHIO (`src/app-carriera.mjs`): `rondaDelCalendario` è
  l'helper che ritorna la ronda «next» — pd-calendar dell'app O mirror
  journal nostro (appCalendar fall-back già in piedi) — con pista
  (pistaParola), trackId (trackIdDaNome), layout, giri, ora+minuto e
  meteo tradotto nelle DUE scale (weather: scala ladder per
  round.weather; idPreset: scala PRESETS di weather.mjs per
  setWeatherPreset). `stessaSerie` matcha PRIMA per AUTO (la lezione
  stasera sui due Trofei MX-5: display gemello, parco auto diverso),
  poi per nome display. La serie deve combaciare col nodo e la ronda
  avere la PISTA, senza: null e chi chiama resta sulla ladder grezza.
- `src/race.mjs`: `nextRound` beve dall'helper unico (mirror arriva da
  solo, senza app installata) e `raceCard` usa il LAYOUT seminato
  (round.layout) invece del solo GP-default della tabella: la scheda e
  la riga «Pista» seguono il National/Fosters del calendario.
- `tools/ronda-ladder.mjs` (SOLO CLI): le TRE funzioni duplicate sono
  sostituite dall'helper unico, via findTrackInfo, e CORRETTO
  meteoRonda alla lezione weather.mjs — le DUE scale non coincidono da
  3 in su (prima una ronda «Pioggia leggera» del calendario diventava
  «Coperto» nella riga CLI). Traduzione per NOME, mai per numero
  (tabella METEO_PD in app-carriera): scala ladder 3 (Light
  rain)→preset 4, 4 (Rain)→5, 5 (Heavy rain)→6; Coperto/Overcast resta
  ladder 2 ma preset 3 («Coperto» del selettore EVO), solo
  Nuvoloso/Cloudy cade sul preset 2.
- TEST: `test/journal-nostro.test.mjs` — rondaDelCalendario col mirror
  (Oulton Park «Pioggia leggera» → ladder 3 / preset 4) e null senza
  mirror. `test/race-card.test.mjs` — raceCard col mirror scritto accanto
  al save: la ronda «next» guida la scheda in tutto (roundIndex,
  layout seminato, giri, ora, meteo ladder, __pd true), con rmSync in
  finally (prima run: 4 ≠ 8 giri, il mirror del test persisteva
  nell'EVO_DATA_DIR condiviso e contaminava i test dopo).
  `test/ronda-ladder.test.mjs` — tabella meteo aggiornata alle DUE
  scale e meteoRonda alla lezione (i test che prima facevano da
  cavallo al bug, corretti alla verità).
- VERIFICA: node --test su race-card + journal-nostro + ronda-ladder
  **42/42 verdi**, webui-smoke 1/1. node --check OK su
  app-carriera.mjs e ronda-ladder.mjs.

## 3/11 — LA VIGIA DEL CAMBIO DI CAMPIONATO ([src/race.mjs](src/race.mjs))

- **Radice** (richiesta Mauro dopo la prova del 2/11 in sandbox: «che succede se
  cambio campionato e lancio Prepa tutto?»): il cambiamento di serie lascia sul
  disco la griglia della SERIE VECCHIA (lezione 23/10: la RX-7 col file GT3 in
  piedi), e la scheda gara lo raccontava SOLO DOPO il bottone — l'amico lo
  scopriva premendo.
- **Cura**: in [src/race.mjs](src/race.mjs), accanto alla vigia del parco (24/10),
  la vigia legge le auto in piedi su `GRID_FILE` CON la stessa `readCells` del
  builder; se NESSUN nome combacia col parco ammesso della serie (`carPoolOf`),
  la card porta `gridAltraSerie`, passthrough in [src/webui-views.mjs](src/webui-views.mjs)
  e banner gemello del gridRitual in [gui/js/viste-a.js](gui/js/viste-a.js):
  «la griglia sul disco è di un'altra serie (…): premendo «Prepa tutto» la riscrive
  dal template della serie — niente da fare a mano». Silente: file assente,
  illeggibile, parco vuoto o già combaciante.
- **TEST di regressione** in [test/race-card.test.mjs](test/race-card.test.mjs):
  customgrid di prova con F40 (convensione f3 id / f4 nome come i test del builder)
  → la card nomina la stirpe estranea; griglia già della serie o file assente →
  muta. Suite: race-card **17/17**.

## 3/11 notte — LE SKIN IDENTICHE: LA GUARDIA ANTI-SINGLETON A TINTE ([src/grid-apply.mjs](src/grid-apply.mjs))

- **Radice dell'incidente** (richiesta Mauro: «tasto prepara e divertiti... le skin
  delle auto sono identiche e l'auto già verificato ha 3 skin»): il rientro del save
  della sera (weekend azzerato) aveva ridotto il vivo `last_grid.customgrid` a UNA
  cella unica (prova: bak-apply 23:54 = 530 B). La PRIMA CORSA del rebuild (il builder
  sul vivo) NON fallisce: con il pool povero completa con il filler dell'ARMONICA — 15
  cloni della STESSA livrea (16× visual_1, MONOCOLORE) — e la corsa dei candidati
  (magazzino per serie → bak → snapshot → fabbrica)  non parte mai. Il parco giusto (19 celle, 3 tinte) stava nel magazzino della serie.
- **La misura giusta NON è il byte-distinto**: i cloni armonici lo sono PER
  COSTRUZIONE (passo 0,0003·k): una griglia monolivrea risulta «tutte celle uniche»
  venirci letta così. La misura è la TINTA (campo 11, la stessa estrazione del
  builder via `readCells(...).tinta`).
- **Cura atto 1 (riparo a secco, fuori dal codice)**: riscrittura del vivo dal
  magazzino della serie `coppa_mazda-mx5-nd-cup.customgrid` — 14 celle round 4
  Laguna Seca, banda 84–85 intatta, parco 9× visual_2 (bianco/rossa) + 3×
  visual_99 (rossa quadrifoglio) + 2× visual_1 (rossa standard); backup del vivo
  monocolore in `last_grid.customgrid.bak-liveria-2026-11-03-00-03-54` (7940 B).
- **Cura atto 2 (la guardia nel codice)**, in [src/grid-apply.mjs](src/grid-apply.mjs),
  prima della prima corsa di `rebuildGridApply`): conta le tinte del vivo e del
  magazzino della serie; se il magazzino ne ha PIÙ, la prima corsa SALTA
  (`firstErr` finto code ENOENT) e si va dritti ai candidati, che provano il
  magazzino per PRIMO — vince il parco con più tinte senza che il Giudice del
  builder cambi (resta lui l'unico a dire se un candidato vale). Best-effort:
  se il magazzino non esiste o non si legge si gareggia com'era. Log esplicito:
  `[griglia] guardia anti-singleton: il vivo ha N tinte, il magazzino della serie
  ne ha M → riscrittura dal magazzino (candidati: prima il template della serie)`.
  Il vivo perso resta comunque nei bak-apply di writeSafe.
- **TEST di regressione** in [test/grid-templates.test.mjs](test/grid-templates.test.mjs):
  «vivo POCO TINTATO perde la prima corsa, vince il magazzino» (source dichiara il
  magazzino, tinte ≥2 nella griglia scritta) e «vivo SANO (pariggiato di tinte):
  la prima corsa resta sul vivo» (source assente, niente candidati). Suite:
  grid-templates **16/16**; readcells-tinta + gridbuilder-tinte +
  gridbuilder-banda-serie + gridbuilder-uniche + weekend-roster **31/31**.
- **CONFERMA SUL VIVO**: dry-run reale (`node ac-evo-career.mjs griglia --dry`):
  `celle 16` dal vivo, NESSUN log di guardia — giusto: il vivo curato ha le sue
  3 tinte e la guardia deve stare zitta.
- **Imparo**: chi prende il vivo in prima corsa esce felice anche quando nella
  griglia piovono cloni della stessa livrea. La leva anti-crash dell'ARMONICA
  (sopravvissuta al crash F40 del 23/10) è anche la porta dell'omologia: quando
  il parco c'è da un'altra parte (magazzino), la misura non è «quante celle
  distinte ho scritto» ma «quante LIVERIE distinte restano in bocca al player».

### 3/11 (notte) — La curazione delle FIRME SICURE: le 13 parole mangiate dal dettato tornano al segno (richiesta Mauro: «correggi nel diario le 13 firme sicure del mio report»)
Il dettato di Mauro aveva lasciato nel diario parole rotte; il report di ieri
(indagine sotto la regola dei commenti HTML) le ha chiamate a voce e oggi
tornano al segno, FIRME SICURE nel disco:

1. **unisce** (firma dettata «munisce») — DA-16, la dispatcher NON
   «muniisce» più, *unisce* GET e POST nello stesso switch;
2. **collaudi** — DA-19, i «collaudii» che solo la pista può dare tornano
   *collaudi*;
3. **Mina memoizzata** — 31/10 varianti pesanti, «Mineo memoizzato» torna
   *Mina memoizzata* (l'FTA cambia i file → firma di dir → nuova mina);
4. **Volante** — 31/10, il «Vorante del centro gare» torna *Volante*;
5. **si ATTACCA ESTERNA** (firma dettata «attacca esterna») — la volante non
   si «APPICCA» più ESTERNA alla card;
6. **SUFFISSO** — i bak del 2/11 non portano più un «SOFFISSO -r2», porta
   il *suffisso* `-r2` sul pareggio di secondo;
7. **riportato** — 30/10 tagli, il gioco non ha più «PORTATO» l'auto in
   baia: l'ha *riportata* (la firma dettata «riportato»);
8. **si fotocopiano** — la lezione del 1/11: «EVO le celle si fotocopiano
   SOLO da template VERI» (era «si fotocopia»);
9. **alla scadenza di 10 s** — copilota 30/10, la bandiera in coda esce al
   giro successivo «o alla scadenza di 10 s» (era «soccorso»);
10. **sempre zitte** — le bandiere d'ordine «sempre zitte alla prima
    lettura» (era «sibile»);
11. **distanza di 15 s** — ritardi condivisi: *distanza di 15 s* tra le due
    (era «distanziello»);
12. **ramo morto ×2** — il dottore 30/10: nel titolo «e un ramo morto esce»
    e nel corpo «una brancha morta da sempre» → *un ramo morto* (era
    «brancha» in ambo i posti);
13. **propone** — la card della stagione chiusa: il server fresco «e propose
    di chiudere» (era «proporpone»).

La 13ª voce del report («vedi la voce del diario») era il rimando del
report a questa lista, non una frase da correggere.

**La firma**: curazione fatta a mano, 13 firme in 14 sostituzioni in [DIARIO-SVILUPPO.md](DIARIO-SVILUPPO.md) (il «ramo morto» era due, titolo e corpo),
verificate a zero con grep sui rotti originali (muniisce, collaudii,
Mineo, Vorante, APPICCA, SOFFISSO, ha PORTATO, soccorso di 10, sibile,
distanziello, brancha, proporpone: tutti a 0). Nessun file di codice
toccato, nessun test da girare.

### 3/11 — La fitta-fitta del tab Analisi: GUI e JSON si stringono la mano, it ed EN (richiesta Mauro: «confronta la tabella mostrata in GUI con il JSON di api/tetto e fallisci se una riga diverge», poi «porta lo stesso confronto anche a autopsia e Monte Carlo», poi «verifica che la vista Analisi e il tetto reggano anche a lingua EN»)

Le due facce del tab Analisi non si stringevano la mano: il JSON lo guardava
l'unit test, la CELLA disegnata solo gli occhi. La guardia è in
[test/tetto-gui-json.test.mjs](test/tetto-gui-json.test.mjs) e si scrive:
server vero su PORTA SUA (8745–8750: pannello E lingua, una ciascuna),
carriera FINTA che alimenta i pannelli, tab Analisi aperto a schermo e i
pannelli letti cella per cella e accostati all'API: una riga che mente =
test rosso, col nome della riga e l'atteso a schermo.

- **Impalcato comune** perché la scuola una volta sola:
  `carrieraFinta` (i campi dell'autopsia dentro le STESSE gare del tetto:
  i settori restano identici al bit), `avviaServerAnalisi` (battito via
  `/api/watcher?probe=1`, tetto 12 s, stderr collettata per dire chi ha
  spento il server), `presuppostiBrowser` con skip DICHIARATO col perché
  (la legge della guardia di layout: verde che spiega, non rosso che finge).
- **Le lezioni di sandbox**, dette e provate sul vivo:
  - `EVO_DATA_DIR` ridirige il save del TOOL e `ACE_DATA` la cartella dati
    del GIOCO (Results, log) — la lezione del 23/10: il vecchio data dir
    fisso leggeva il save VERO anche nei test;
  - il nodo NON si inventa: «serie_gt3» non esiste nel ladder e il boot
    urla «Serie sconosciuta» — si prende il PRIMO nodo vero del ladder;
  - il save finto parte SENZA parco piloti, ma `/api/boot` esplode
    «reading 'drivers'»: `world: { drivers: [] }` lo acqua;
  - la lingua ADOPTATA è una maglietta di tempo: il browser senza scelta
    adotta `/api/lang` con una RICARICA che sposta l'attesa delle viste —
    `evo-lingua` fissato in `addInitScript` PRIMA dei copioni del sito e
    la vista è stabile dalla prima letta;
  - le API si chiedono COME le chiede la GUI: POST col campo `lingua`, che
    il dispatcher applica per richiesta (una GET terrebbe la lingua del
    config e i due lati diverrebbero per legge, non per fortuna);
  - i confronti a NUMERI, mai a stringhe: `msDi` per i secondi (decifra
    virgola, punto e il meno stondato), `parseFloat` per la cella raw dei
    punti/ronda, `numera` per le percentuali e le valige con la
    punteggiatura di migliaia dei due locale;
  - la Monte Carlo del sedile è confrontabile SOLO perché deterministica:
    seme fisso `seatmc|nodo|stagione|diff|sims` in [src/analisi.mjs](src/analisi.mjs)
    — due chiamate identiche rispondono identiche;
  - il rebind della porta appena uscita non si conta: porte DISTINTE per
    confronto e lingua (8745–8750).
- **Il giro a due lingue**: ogni confronto itera `[['it', PORT], ['en', PORT_EN]]`
  con server e cartella dati SUA. Oltre ai confronti di cifra valgono le
  asserzioni della LINGUA: la legenda parla («campione»/«champion»), i
  secondi portano il SEPARATORE giusto (virgola a it, PUNTO a en — `dec()`
  del core), la prima etichetta KPI dichiara la lingua («Esito»/«Result»),
  la marcatura senza archivio esce nella lingua della pagina
  («griglia non in archivio»/«grid not in archive») e la MC parla le
  parole giuste («stagioni per sedile»/«seasons per seat»,
  «auto · ronde»/«cars · rounds»). Le tag del picco si cercano con la
  parola della lingua (`picco`/`peak`), settore e valore resta sul testo
  ORIGINALE.
- **Due maglie EN trovate sul vivo e curate** in [gui/js/viste-analisi.js](gui/js/viste-analisi.js):
  «— senza dati» e la tag «picco» stavano FUORI da `tr()` (il tooltip era
  già tradotto, la stringa VIVA no) — passate per `tr()` e la guardia EN
  le controlla con la parola della lingua (senza dati/no data, picco/peak).
- **Verifica**: `node --test test/tetto-gui-json.test.mjs` → 3/3 (~18 s
  con le due lingue), `npx biome check` sui due file → zero. Il passo di
  sempre resta: file isolato durante il collaudo, `npm run check` intero
  PRIMA di dichiarare la spunta fatta.


### 3/11 — La prova del banner trim al vivaio: il trim accettato SLITTA la banda, provato via ENDPOINT (`test/proposta-trim-banda.test.mjs`)

Il banco del 3/11 (sonda, poi smontata): il banner «Suggerimento in attesa»
promette che accettare sposta la banda EVO della serie. La guardia parla
AL VIVO del dispatcher: carriera vergine in sandbox (EVO_DATA_DIR + ACE_DATA + EVO_FLOWS_DIR, porte 8742), banda di partenza
88–89 scritta con la op `range` dell'endpoint stesso (record con cursori
veri: condizione della legge, la riga «↺» senza cursori seguirebbe il
consiglio ricalcolato), proposta pendente seminata DIRETTAMENTE nel save
(`proposeDifficulty` non ha endpoint di nascita: nasce da un risultato di
gara — il server rilegge il save a ogni richiesta, la semina al file
arriva a destinazione senza il tocco della carriera vera), accettazione
per `POST /api/difficulty-action` op `accept` — lo STESSO tasto della GUI.

- **La legge prova in AMBEDUE i sensi**: trim 0 → +2 = banda 90–91
  (|to−from| = 2); trim +2 → −1 = banda 87–88 (|to−from| = 3). Il trim
  della riga arriva a `pending.to`, la proposta si consuma (`pending`
  torna null) e il save a valle (riletto dal disco) regge i valori
  finali;
- **il cancello**: una seconda accettazione senza proposta è un 400 con
  «Nessun suggerimento in attesa», mai un crash;
- il codice di legge sta nel ramo `accept` di `/api/difficulty-action`
  (2/11: shift = (to − trim corrente) × 1 — il commento ×5 era morto).

Verifica: `node --test test/proposta-trim-banda.test.mjs` → 1/1 (~0,5 s,
server una singola tra le porte libere), `npx biome check` → zero.


### 3/11 — Banner del trim: la cifra di slittamento legge il TRIM CORRENTE, non il «from» della proposta

Il banner della scheda gara («🎯 Il tool suggerisce il trim») calcolava
lo slittamento della banda con `to − from`, dove `from` è FISSATO nella
proposta scritta in save al momento della nascita: se il trim era poi
mosso (bottone ± del cruscotto, o accettazione di un altro consiglio),
il banner prometteva punti che l'accept non avrebbe fatti — la legge
reale dell'accept è `(to − trim corrente) × 1` ([src/webui.mjs:3073](src/webui.mjs#L3073)).

- [src/webui-views.mjs](src/webui-views.mjs): la scheda ora allega al
  `pendingProposal` anche `cur` = trim corrente della serie, letto dal
  vivo del save al momento del payload;
- [gui/js/viste-a.js](gui/js/viste-a.js): cifra e direzione (salita/
  discesa) usano `cur`. Se `to` combacia col trim vivo il banner dice
  **0 punti** — onesto: quell'accettazione non muove la banda;
- il racconto della proposta (trim from → to) e il bottone resta così,
  cambia SOLO la cifra promessa.

Verifica: `npx biome check src/webui-views.mjs gui/js/viste-a.js` →
zero; `node --test test/viste-guard.test.mjs test/race-card.test.mjs`
→ 23/23 (~0,5 s), tetti della GUI in piedi.

**Ripulitura tmp/ (3/11 ore 07:13)**: smontate ~75 sonde e log di suite
(il nido di collaudo–dati: pacco-test, filbar-sandbox, gabbia-b, cover-gui,
dati-layout, _journal-prova, più dump/json/log e i backup JS ridondanti
con i commit del giorno). RIMANGONO: le copie di sicurezza del restauro
dei 2/11
(`tmp/_backup-rinomina`, `tmp/_diario-pre-restore.md`), i backup di
gioco `.customgrid` (pre-cura e «veleni»), e i due testi da pubblicare
(`anteprima-subreddit.html`, `corpo-release-0.1.46.md`). Riferimenti a
questi percorsi nel codice erano solo di STORIA (commenti), mai attivi.
tmp/ è ignorata da git: lo stato del deposito non cambia. Restano SOLO le
lavorazioni vere della sessione (8 file modificati +
test/proposta-trim-banda.test.mjs).


### 3/11 — Campionati: il cap parla SOLO in badge (dati), la nota smette di incisionare la cifra

Nel pannello Campionati il cap viveva in DUE posti col rischio di
smentirsi: il badge (dal 3/11 mattino legge dal DATO,
`LIMITI_GIOCO.restrictorMaxPct`) e il testo `nota` delle regole, che il
generatore cuciva col numero fisso («→ cap 20; la prima gara decide»).
Se una classe avesse un giorno portato un limite diverso, il badge avrebbe
detto una cifra e la nota un'altra.

- [tools/_genera-stili.mjs](tools/_genera-stili.mjs): le note al cap non
  portano più la cifra — «→ cap della classe; la prima gara decide»
  (e «cap della classe come l'Escort» per la variante fuori-finestra);
- [src/stile-webui.mjs](src/stile-webui.mjs): il rilevatore del tag cap
  capisce le note VECCHIE («→ cap 20») e le NUOVE («→ cap della classe»)
  con una sola fregola `/→ (?:al )?cap/`;
- [data/grid-classes.json](data/grid-classes.json) e
  [test/fixtures/grid-classes-sample.json](test/fixtures/grid-classes-sample.json):
  normalizzate le note esistenti (10 + 11 righe), zero residui «→ cap <n>».

Verifica: `npx biome check` sui due sorgenti → zero; `node --test` (cap-dati-guard, gridclasses, semina-campionato, grid-calib) → 34/34 (~2 s).

### 3/11 — File classi CORROTTO (JSON invalido): errore che NOMINA il file, non un mezzo tab Campionati

Se [data/grid-classes.json](data/grid-classes.json) si marciva (un editor
rompe il salvataggio, un disco che canta), `loadClasses` esplodeva col
SyntaxError secco («Unexpected token», senza dire QUALE file) e la
porticina `stili`, senza custodia, lasciava morire la richiesta: la GUI
allora `api('stili').catch(() => ({ stili: [] }))` seppelliva tutto e
spariva il pannello dei miscugli in silenzio — un mezzo tab Campionati
senza indizi del perché.

- [src/gridbuilder.mjs](src/gridbuilder.mjs): il `JSON.parse` è custodito —
  errore che APRE col nome del file, percorso e causa, e dice la cura
  («Sistema o elimina il file; al primo accesso torna la fixture»);
  il memo NON tiene il marcio: ogni rilettura ripropone l'errore finché
  il file non torna leggibile;
- [src/webui.mjs](src/webui.mjs) (`case 'stili'`): l'errore esce come
  risposta `{ error: «grid-classes.json CORROTTO…» }`, non come richiesta
  appesa;
- [gui/js/viste-b.js](gui/js/viste-b.js): nato `stileErrore` — un errore
  che il server RISPONDE esce in un pannello leggibile nel tab; il vecchio
  silenzio resta solo per la RETE in giù, che quella la racconta già il
  filbar;
- [test/cap-dati-guard.test.mjs](test/cap-dati-guard.test.mjs): ora copre
  ANCHE lo scenario corrotto — prima una lettura BUONA (la classe si
  accetta), poi LO STESSO percorso marcito SOTTO (il memo non maschera),
  poi un file corrotto FRESCO (stesso errore, nessun dramma diverso):
  l'errore deve APRIRE col nome del file, MAI un «Unexpected token» nudo.

Nota di battitura (per le future guardie): su questo Node
`assert.throws(fn)` SENZA l'argomento errore NON restituisce l'errore
(esce `undefined` in diretta): quando serve il messaggio si cattura in
try/catch.

Verifica: `npx biome check` sui 4 sorgenti → zero errori; `node --test`
(cap-dati-guard, gridclasses, semina-campionato, grid-calib,
grid-templates, car-pool) → 61/61 (~2 s); webui-smoke → 1/1.

### 3/11 — Sonda audit ricostruita + leva SOGLIE: le righe al cap escono con ⚠

La leva chiesta da Mauro («nella `--report` della sonda audit segnala le
SOGLIE attive nel diff») cadeva su una sonda GIÀ SMONTATA: la ripulitura
di tmp/ delle 07:13 aveva portato via `tmp/_audit-dati-1101.mjs` (e le
audit di casa la citano ancora). Ricostruita dal vivo: la STRUTTURA
dell'output è quella fedele di
[report/audit-dati-2026-11-02.num.md](report/audit-dati-2026-11-02.num.md),
letta sui campi VERO del save di oggi (endurance_gt4, 13 sedili firmati,
storico a 81 voci). Solo lettura come sempre: nulla tocca data/ né il save.

La leva nuova nel diff (a terminale come nel .num.md):

- sezione **== SOGLIE ==** a fondo report: le tre soglie di casa con la
  loro marcatura (⚠ non è un defect: «riga al cap, guardaci tu»);
- **messaggi** cap 60 (state.mjs · `pushMessage slice(-60)`) — a cap
  pieno il box scarta dal più vecchio: riga ⚠;
- **zips** cap MAX_ZIP in salva-save — la rotazione condanna il più
  vecchio;
- **trim di serie** cap ±20 (cli.mjs · `difficulty --trim`) — il save NON
  dovrebbe portare oltre: se lo porta è anomalia;
- la riga FINE chiude col numero: «⚠ soglie toccate: messaggi, zip».

Due decisioni guida:
- **MAX_ZIP si LEGGE, non si ricorda**: la sonda vecchia stampava
  «MAX_ZIP=4» di ricordo (era il valore del 25/10); dal 31/10
  (build 0.1.43) il salv-auto taglia a 2 (commit 37c762a) — la sonda ora
  importa la costante vera da [tools/salva-save.mjs](tools/salva-save.mjs);
- sezione DISCO filtrata: la vecchia riportava tutto l'elenco dei file
  (rumore di tmp/); qui il dato utile: cartelle sempre, file top-level
  da ≥ 0,1 MB.

Run dal vivo (3/11 ore 08:39, --report):
[report/audit-dati-2026-11-03.num.md](report/audit-dati-2026-11-03.num.md)
— ⚠ su messaggi (60 al cap) e zip (2 a cap: il più vecchio è condannato),
raceSettings 86 record tutte sane, classi dentro cap, trim vivo max −5
(lontano dal ±20); potatura .num.md: 2 voci, sotto il tetto dei 3.

### 3/11 — Audit + blocco bestLaps: le doppie grafie escono con ⚠ da sole

Ritocco alla leva SOGLIE (richiesta Mauro: «aggiungi il blocco bestLaps
con le doppie grafie segnalate con ⚠, così la prossima leva le vede da
sola»): la sonda ora porta un blocco **== SAVE: bestLaps ==** subito dopo
il garage — record presenti, piste uniche, e le doppie grafie
(CASE-INSENSITIVE, il criterio della leva di cura del 2/11) con la
propria marcatura e la lista «"imola" + "Imola"» accanto.

Due decisioni:
- **la normalizzazione di grafia si IMPORTA, non si riscrive**:
  `grafiaNorma` viene da [tools/normalizza-bestlaps.mjs](tools/normalizza-bestlaps.mjs)
  (con fallback in linea se la leva manca) — il criterio è UNO per ogni
  lettore di bestLaps, stessa lezione del MAX_ZIP sopra;
- la sezione **== SOGLIE ==** guadagna la riga «bestLaps cap 0 → ...» e
  la FINE chiude col nome («⚠ soglie toccate: messaggi, zip, bestLaps»):
  le doppie grafie al cap 0 si toccano appena compaiono.

Run dal vivo delle 08:49: la sonda COLLASSA il dato reale — il save
porta «imola» (02:17.115) + «Imola» (02:05.382): ⚠ 1 doppia grafia,
record nel blocco, nella SOGLIE e in FINE. La prossima leva di cura
(`node tools/normalizza-bestlaps.mjs --dry`) le vede da sola.
Esito: [report/audit-dati-2026-11-03.num.md](report/audit-dati-2026-11-03.num.md).

### 3/11 — Leva bestLaps agganciata al nodo di import: le gare nuove non riseminano più doppie grafie

Terzo passo della giornata sui bestLaps (richiesta Mauro: «aggancia la
leva normalizza-bestlaps al nodo di import»). Il dato era impietoso:
l'unico punto di scrittura dei record personali è
[src/state.mjs](src/state.mjs) · `applyRaceResult`, e scriveva
`s.bestLaps[track]` col VALORE DEL PAYLOAD — cioè l'ID del calendario
(`brands_hatch`) — mentre i lettori di casa (`race.mjs` · lapTarget,
`life.mjs` · trackMastery, `tracks.mjs`) cercano il NOME ATTIVO
(`ladder.contentNames.tracks[id]`, `Brands Hatch`): la chiave scritta
non la voleva MAI, e un eventuale doppio impianto era una gara di
distanza. Tre decisioni:

- **il criterio vive in src/state.mjs, la leva lo riusa**: `grafiaNorma`
  (case-insensitive; gli ACCENTI NON sono grafia, come per la leva
  del 2/11) è definita lì — tools/normalizza-bestlaps.mjs la re-importa
  e la re-esporta, così audit e test vecchi continuano a comprarla nella
  leva e non esiste nessuna copia del criterio in due posti;
- **`chiaveBestLaps(bl, seme, nomiCanon)`** è il canone di scrittura:
  il SEME è il nome attivo (`contentNames.tracks[track] ?? track`), poi
  la chiave atterra sulla grafia GIÀ PRESENTE se c'è (l'imola
  pre-canone del 23/9 riceve la gara nuova invece di farsi una gemella),
  altrimenti sul nome ladder — quello che i lettori cercano davvero;
- **il collaudo su UN ID REALE ha mostrato la Bertolli**: brands_hatch ≠
  «Brands Hatch» per il trattino basso — l'id NON è un seme: la prima
  stesura semava un TERZO impianto; con il seme sul nome attivo il
  record finisce nella grafia viva (verificato a mano con una probe
  buttata e giù). La guardia: test/normalizza-bestlaps.test.mjs +2 —
  chiaveBestLaps in puro e `applyRaceResult` non risemina doppie grafie.

Verifica: `node --test` su normalizza+agenda+race-card+life → 38/38
(agenda incluso, perché chiama applyRaceResult su ladder vero);
normalizza-bestlaps.test.mjs → 8/8; biome sui 3 sorgenti → zero errori
zero warning; la sonda --report (che ora LEGGE grafiaNorma dalla leva,
che a sua volta legge da state.mjs: doppia dipendenza voluta e
sorvegliata) segnala sempre l'imola doppia — il canone serve alle gare
DA OGGI, i record già in save restano doppie finché la leva non le
fonde, ed è per questo che la CURA RESTA: l'imola minuscola non la
trova NESSUNO dei lettori che cercano il nome attivo.

Nota in più: il messaggio della scrittura (pushMessage «Nuovo miglior
giro personale a X») ora usa la chiave canonica: la bacheca dice
«Brands Hatch», non «brands_hatch».

### 3/11 — chiusura: il POST FORUM LUNGO è montato
- **Il fatto**: chiesto da Mauro («Prepara anche la versione forum lungo
del post di presentazione, con il tono tecnico e le stesse claim
verificate dal verdetto DA-8»), subito dopo la suite piena 895/895.
- **Il montaggio**: [POST-PRESENTAZIONE-FORUM-LUNGO.md](POST-PRESENTAZIONE-FORUM-LUNGO.md) —
  apertura IT (scelta R3), tono tecnico per il forum EVO (scelta R2):
  le 11 claim vive del verdetto DA-8, una sezione ciascuna con l'aggancio
  tecnico vera (seed + ΔPI + cap 20% + ricalibrazione per pista; catena
  ESATTA→CONTIENE→PAROLE→ALIAS; backup/verifica pre-scrittura; le guardie
  anti-cheat del calendario) + una sezione in più «Come è fatto
  dentro» (CLI + GUI web + le due app in gioco, fonti SOLO i file di
  EVO in Saved Games) e claim 11 in più (il dizionario auto che impara
  da solo, i giorni scorsi).
- **Discipline del verdetto rispettate**: i NOMI DI SCHERMO veri («Pools
  sorteggiati a sorte dal catalogo · seed · cap 20%», mai «Campionati a
  miscuglio») e le due foto in-diretta DICHIARATE segnaposto con il bordo
  «🤖 engine non disponibile» spiegato in didascalia. Il fotogramma «nel
  menù di EVO» resta il residuo dichiarato (DA-19 taccuino).
- **Puntatore aggiornato**: la riga R2 della tabella residuo in
  [IDEA-POST-PRESENTAZIONE.md](IDEA-POST-PRESENTAZIONE.md) ora accenna la
  versione lunga (e il taglio corto resta POST-PRESENTAZIONE-IT.md).
- **Didascalie allineate (3/11, chiusura)**: la nota sulla fascia
  «engine non disponibile» era nell'EN e non nell'IT — portata anche in
  [POST-PRESENTAZIONE-SUBREDDIT.md](POST-PRESENTAZIONE-SUBREDDIT.md) sotto
  le due foto («della seconda immagine», che nell'ordine del taglio è il
  Cruscotto); l'EN del taglio ([POST-PRESENTAZIONE-SUBREDDIT-EN.md](POST-PRESENTAZIONE-SUBREDDIT-EN.md)
  diceva «first shot» col Cruscotto SECONDO nel suo ordine: rettificata
  «second shot (Cruscotto)». I post lunghi IT/EN restano corretti:
  lì il Cruscotto è PRIMO nell'ordine. Nessun codice toccato.
- **Verifiche**: nessun codice toccato (solo documenti); rilettura del
  post a schermo con le due grafie sbagliate restanti corrette; il dato
  «895/895» del post è il banco intero girato oggi pomeriggio (exit 0).
### 3/11 — Ronda «nostro»: il generatore che non bada al giornale (10:52)
- **Il gesto**: dal LADDER nasce il weekend NATIVO, senza che il
 GENERATORE debba aspettare o leggere il CATALOGO del Paddock: la
  ronda attiva si usa COSÌ COM'È (pista, giri, orari, layout dell'EXE
  MAI RICHIESTI: l'evento parte PRIMA che l'EXE finisca di parlare).
- **Il file**: `tools/ronda-nostro.mjs` — prende il nodo attivo, la
  ronda CORRENTE del calendario (ladder-pd-calendar già concordata),
  produce il WEEKEND completo (Prove libere/Warmup/Qualifying/Gara coi
  minuti VERI del pd-calendar, meteo tradotto LADDER→PRESET) e
  RIUSO della scrittura: le CELLE le scrive lo STESSO codice dei
  precedenti generatori (nessun duplicato delle regole).
- **Chi lo usa**: `rondaPaddock` ora prende la riga del pd-calendar del
  diario e LE PASSA al nuovo generatore (pass-through, senza rifare
  la mappatura): la voce «ronda del paddock» resta IDENTICA a vista.
- **Test**: `test/ronda-nostro.test.mjs` — 5 prove, tra cui quella
  CENTRALE: col catalogo-trappola del giornale dell'EXE (che un
  vecchio percorso avrebbe aspettato per sempre) il generatore
  PRODUCE lo stesso il weekend identico: zero dipendenze dal
  catalogo.
- **Ronda 4 del calendario ladder: è Paul Ricard, NON Imola** (mio
  refuso nel primo test, corretto). Minuti: la LADDER non li porta,
  arrivano DA ZERO dal piano orari del pd-calendar (13:30 ecc.).
- **Verifiche**: 5/5 prove del nuovo modulo; regressioni vicine
  (ronda-ladder, semina-campionato, journal-nostro, ponte) TUTTE
  VERIFICATE; un FALLIMENTO AMBIENTALE fuori dal mio perimetro: EVO era
  APERTO durante la suite (GAME_OPEN) e i due subtest del SEMINATORE
  che girano senza --force se la prendono (53/55, zero difetti sui
  file toccati); biome pulito sui file toccati; CHANGELOG aggiornato.

### 3/11 — Modali e viste nascoste: censimento e proposta di marcatori
- **La domanda**: le viste nascoste (fuori nav) e le schermate che
  vivono solo dentro una modale meritano un marcatore nella guardia di
  layout? Prima di rispondere: censimento + misure vere.
- **Viste nascoste: nessuna da aggiungere.** Il dispatcher di render()
  in gui/js/core.js conosce 21 id (19 nav + calendar + standings) e la
  guardia li copre tutti; il terzo colore di TAB_COLORS (catalog) e'
  un'icona orfana, non una vista.
- **Le modali: misurate, non immaginate.** Sonda temporanea (tmp/,
  gitignored) che apre ogni schermata con la sua leva VERA (click, hover)
  e misura con le stesse leggi della guardia a 256/320/480 px.
- **Trovato un difetto reale**: «Soprannomi in blocco» a 256 e 320 px
  l'input (width:200px fisso) scavalca il nome del pilota (flex:1,
  min-width:0): 5 righe sovrapposte, 21-37 px. A 480 sparisce.
- **Tutte le altre**: nessuna modale esce dalla viewport (max-width:560);
  scheda pilota, scheda auto, gazzetta, cercatore su disco e scheda gara
  modale sono pulite; classificazione, volante .ag-pop e dossier del
  rivale scorrono in orizzontale dentro la scheda (366/288/309 px a 256)
  e sono i candidati giusti se si vuole un budget DICHIARATO.
- **La proposta e' scritta, non applicata**:
  report/proposta-marcatori-modali-2026-11-03.md — 4 candidati in ordine
  di merito (soprannomi col suo id #br-list, classificazione, volante,
  dossier), i due pezzi da costruire nella sonda (scope + assettaModale),
  il costo (+12 misure ~+3,4 s su 126 in 35,5 s) e i limiti della misura.
- **Verifiche**: guardia di layout verde in 35,5 s cronometrati (126
  misure, exit 0); i numeri della proposta riprodotti due volte con lo
  stesso esito. Nessun file di produzione toccato.
