# EVO Pitwall — report build 0.1.47 (7ac09ed)
_Data: 2026-11-01 · Aggiornamento da **v0.1.43**_

## Correzioni e novità
- Fabbrica completa: griglia di fabbrica del Campionato Corsa (pool da 2, BMW M4 GT3 vs Ferrari 296 GT3) e regola del builder che rifiuta solo i file che NON portano l'intero pool dichiarato da 2 vetture — le serie, 86 su 86 con calendario, hanno ora la loro griglia in config/griglie-fabbrica. · b4a8e9d
- Fissata la riga: /api/paddock risponde col JSON composto anche senza carriera (era nell'elenco needsCareer per sbaglio; il case non legge lo stato) — fatalità dell'installazione vergine dell'amico chi riceveva un 400 nudo e crudo al posto di consigli { live:false, tips:[] }. · 5008f99
- Corpo della release v0.1.43: riepilogo delle serie di fabbrica, guardie estese, gara al volo e prove del pacchetto amico. · 9cd4e35
- Diario: collaudo libero del vergine — carriera falsa via CLI e sim di PC senza ACE, con stato di errore onesto in ogni pannello (nessun 400 nudo); badge Fuoriclasse e barra aggiornamenti nel pacchetto confermati come design. · ab24159
- Collaudo dal vivo sul vergine senza ACE: /api/system-health 500 a ogni poll e schede Risultati/Piste in errore nudo — paths NULL ora dà liste vuote oneste in listResultFiles e telemScanLocale (test percorsi-null). · b1fc769
- Diario: giro completo delle 19 schede sul vergine — 17 sane, Risultati/Piste e system-health piegate e curate, controprova dal vivo verde. · dbf02b7
- Collaudo vergine ripasso sul 8799: /api/ingegnere 500 a ogni tick con EVO chiuso — engineerLive leggeva la fase prima della guardia sul player null; ora se ne sta muta con la risposta onesta {ok, live:false} (test nuovo, suite 646/646). · 7513928
- Ore spostabili per ronda (1/11): il conflitto del calendario si risolve col selettore dell'ora invece di slittare la serie — override per ronda in agenda (state.agenda.ore, muore al cambio ronda), catena fino alla card e al gamemodesave via race.mjs, endpoint agenda-hour e pannello conflitti aggiornato. Cura del giro di Mauro: chip-serie della Posta porta al Centro gare con la scheda aperta, card di Campionati arricchite (premio, tassa, griglia, rep, prossima con data/ora/meteo) e click a terra sul pieghevole giusto, banner «Prima volta in EVO» tolto dalla scheda gara, Banco A/B dei setup spostato nel Garage accanto al meccanico. Suite 647/647 con test nuovo ORE SPOSTABILI. · 32bafa8
- Le app DENTRO il gioco si mettono a posto da sole: INSTALLA-GIOCO.cmd con l'installatore delle app, avvia.cmd che le aggancia a ogni apertura GUI, GUIDA-AMICO/FRIEND-GUIDE-EN/README allineati. · db9ae3c
- 1/11 — collaudo del PC amico vergine dall'alto in fondo: tools/_collaudo-amico.mjs costruisce la zipball vera del ramo (git ls-files + tar di System32), la serve da un server finto, gira installa.cmd in sandbox e simula il primo e il secondo avvio sul pacchetto dell'amico: 21 verifiche verdi (app copiate identiche, marcatori del loader in ACE/Video, nessun menu.html consegnato, secondo avvio muto). KO iniziale scoperto e corretto: i cinque file dell'installazione automatica non erano nel git, quindi la zipball sarebbe uscita senza l'installatore (committati prima nel ramo, collaudo ripetuto a segno). Voce DA-15 nel diario e quarto blocco in COMANDI-BUFFY.md con i prompt ricorrenti (Cuore di collaudo, Crepa il canarino, Che cosa fa la GUI peggio di ieri, Mai un test sazio). · 2bb0855
- 1/11 — Mai un test sazio: tre rinforzi alle fondamenta dei test, ognuno con prova di rottura. garage-buy: valori attesi di carValueKm/salePrice LITERALI (30000 km0 → 25500, 3000 km → 16500, vendita 70%, fondo 4000), tolta l'auto-referenzialità che ricalcolava ciò che proteggeva. agenda: nuovo test di cadenzaSerie — banda 3–10 su contatori 0..2^31 e valore che cambia col contatore (prima nessuno proteggeva il ritmo: con la cadenza costante passava). lingua-server: mappa DISPLAY_EN assaggiata per nome («Coppa Città» → City Cup, «Trofeo Hatch» → Hatch Trophy, ignoto «Coppa Prova» → pattern path → Prova Cup). Suite completa in sandbox 653/653. · 2406ee7
- 1/11 — Fase 1 di AUDIT.md chiusa: l'unica leva e i documenti di casa. `npm run check` = npm test && npm run lint in package.json (653 pass / 0 fail, lint exit 0 con 2 warning preesistenti a src/webui.mjs:133 e tools/_collaudo-amico.mjs:23). README IT/EN: sezione nuova sulla suite (sandbox, prove di rottura, niente CI di proposito). CHANGELOG.md creato: voci 0.1.23/0.1.25/0.1.42/0.1.43 puntate ai report veri del repo. RELEASE_CHECKLIST.md: il Prompt 8 del pacchetto esterno adattato alle regole di casa (bump via npm run bump, crea-release con zip come asset, token data/.github-token sempre fuori dal pacchetto). · 36730b0
- 1/11 — Manuale della radio nel README IT/EN (Fase 2, Prompt 5): le 20 frasi del copilota pescate dall'unico narratore (gui/js/narratore-unito.js) e dai livelli veri (essenziale/normale/full), niente inventate. · fbfe124
- 1/11 — Import inutili via (webui.mjs: oraRonda non importata; _collaudo-amico.mjs: createWriteStream/writeFileSync): i 2 warning Biome preesistenti chilli a zero con l'autorizzazione migliorie. · 587692a
- 1/11 — DA-10 seconda fetta: bilancio PER FAMIGLIA (la regola del preset mech_1 pesa anche mech_2/mech_3 della stessa auto: lezione 27/10 estesa a applyRulesToCell) e TINTE PRESTATE (default SPENTO per serie, opt-in classi."<serie>".tintePrestate: le celle VERE degli altri template fotocopiate intere, cap 20 file, dedup HEX, filtro esclusioni e lezione zero-crash byte-unica intatte; report.tintePrestate solo quando le usa). gridbuilder-tinte 5/5 (famiglia, default OFF immutato, ON 3 tinte da 2 prestate), suite 656/656, lint 0. · c906fa3
- 1/11 — Report di sessione aggiornato (doc vocale chiusa, DA-10 seconda fetta in repo, 2 warning sanati) e AUDIT.md nell'albero del repo. · 9fb89f2
- feat(griglia): tinte e prestate a vista nel CLI griglia · 285a221
- feat(webui): tinte prestate e avviso monocolore nei messaggi di prep · 9bd90a4
- docs: diario e report sessione per la vetrina delle tinte · c0e8425
- feat(grid): readCells porta la tinta di ogni cella (vetrina DA-10 terza fetta) · 92e26ef
- feat(gui): la tab Griglia mostra le tinte del file in attesa · 5af4d48
- docs: diario e report sessione per la vetrina nella GUI Grid · bb22d7d
- feat(gui): badge «tinte prestate (parco)» sulle serie col flag attivo · 8917066
- docs: diario e report sessione per il badge tinte prestate · 4fc4c30
- test: palestra sazio tools/_collaudo-sazio.mjs — mutation testing dei 3 test rinforzati · c545101
- docs: SESSION_REPORT — palestra sazio chiusa (3/3 mutazioni cadute, 660/0) · 83b9e5c
- docs+build: release 0.1.44 preparata — bump patch, CHANGELOG e diario · e4f805b
- docs: SESSION_REPORT — release 0.1.44 preparata (check, danza amico, bump) · d3cc411
- feat(cruscotto): auto sconosciute per ID al volo (come Paddock, la Mini) + meteo/ora della ronda a comando · 0f2982f
- sessione 31/10: difesa API solo-POST, learn-car formato 3 (spawn del player), verdetto senza prefisso · 52ef20f
- uiapp-pub: kill-switch meteo/ora al volo (hint crash 0xC0000005) + fasce 500ms del Paddock nel tick · df05ce4
- griglie: celle sintetiche col preset vero (come Paddock), varianti pesanti tutte Standard, conteggio CLI allineato e volante centro gare esterna — sessione 31/10 · 879b09a
- difesa anti-colpo: la GET /api/life non scrive piu il save (SOLO_POST), sonda promossa e test di regressione — release 0.1.44 · 6a29f8b
- release 0.1.45: banda di serie nel customgrid (aiBandSerie), cielo per sessione del weekend (wx-session), orologio di giornata nel cruscotto e pitwall, ponte 🌉 anche dal quadro garage (srcFile in all:true) — 697 test verdi · 6f796e1
- rapporto release 0.1.45: prove complete (697 test,lint,prova live, danza amico 24/24) e zip con impronta · 16abeb4
- release 0.1.46: l'autopsia della vittoria racconta il margine sul secondo (secondGapMs dal file grezzo a results→import→save, ricalcolo della gara COTA gi importata con backup), KPI «Margine sul 2°» nella scheda Analisi, battito del server col ping in ms nel piede della GUI, filtri auto/pista nel banco A/B, icona meteo nel righello dell'agenda (wx calcolato dal preset della ronda), commento fuori dal template della scheda «Prossima gara», legge del ritmo publisher-cruscotto-pitwall nel test nuovo — 701 test verdi · c9d52bc
- prova in sandbox del ponte 8f6d dal quadro garage e chip Copertura a capo ordinato (test cover-ponte-sandbox, diario) · 7ac09ed

- Biome quality-gate (src + gui): nessuna diagnostica ✅


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
