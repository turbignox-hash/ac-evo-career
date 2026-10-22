# ac-evo-career — carriera automatizzata per Assetto Corsa EVO

Una carriera persistente automatizzata per **Assetto Corsa EVO**, ispirata a un'app
di carriera per Automobilista 2.

Il modello d'origine non è un mod di contenuti: è un'applicazione che sta *fuori* dal gioco. Decide la gara,
avvia il simulatore, poi rilegge i risultati e aggiorna soldi, reputazione, classifica e mercato.
Per EVO si fa la stessa cosa, con una differenza importante e detta subito:

> **EVO non accetta argomenti da riga di comando e non legge un file di sessione scritto da fuori.**
> Non esiste l'equivalente di `race.ini` di Assetto Corsa 1. Quindi la gara si prepara nella sua
> interfaccia: l'app ti dice *esattamente* cosa impostare (una schermata, due click) e apre il gioco
> per te. Tutto il resto è automatico: **il risultato lo legge dai file nativi del gioco**.
>
> **L'unico intervento che resta in carico a te è selezionare l'auto a mano:** al momento non è
> possibile impostarla in automatico, quindi la scegli tu nell'interfaccia del gioco —
> e sulla scheda gara trovi già indicato quale.

**Il modello di carriera è ricavato dall'installazione reale del progetto d'ispirazione per AMS2**
(con campi di `career`, ladder, economia, punti, profili, classi e serie).

## Il ciclo di gioco

```
node ac-evo-career.mjs next      cosa mi aspetta, e cosa impostare nel gioco
node ac-evo-career.mjs race      paga l'iscrizione, segna la gara attesa, apre EVO
   ... corri ...
node ac-evo-career.mjs import    legge il risultato e aggiorna la carriera
```

Niente da digitare a mano a fine gara: EVO scrive la classifica da solo e l'app la legge.

Con l'interfaccia grafica (`apri-gui.cmd`) il ciclo è ancora più semplice:
scheda gara con checklist e verifica live, **import automatico** a fine gara
(watcher), pagina **Rivali** con testa a testa e forma, statistiche complete
(pole, rimonte, gare in testa), consiglio auto per indice di prestazione e
backup carriera con un click.

## Installazione

Serve solo **Node.js 18 o superiore**. Nessuna dipendenza da installare. Assetto Corsa EVO
installato e avviato almeno una volta (perché crei le sue cartelle dati).

```bash
node ac-evo-career.mjs setup
```

`setup` trova da solo:

| Cosa | Dove viene cercato |
| --- | --- |
| cartelle dati | `%USERPROFILE%\Saved Games\ACE` (dalla 0.5) e `%USERPROFILE%\Documents\ACE` (versioni precedenti) |
| risultati | `<cartelle dati>\Results\*.sessionresults.json` |
| log | `<cartelle dati>\Logs` |
| eseguibile | `AssettoCorsaEVO.exe` in tutte le librerie Steam (`libraryfolders.vdf`) |

Percorsi diversi? Si forzano una volta sola:

```bash
node ac-evo-career.mjs setup --data "D:\Dati\ACE" --game "D:\Steam\steamapps\common\Assetto Corsa EVO\AssettoCorsaEVO.exe"
```

Poi verifica che la scala carriera citi contenuto che **hai davvero**:

```bash
node ac-evo-career.mjs content --validate   # problemi + i tre ID più simili per ognuno
node ac-evo-career.mjs content --list       # tutto il contenuto visto nell'installazione
node ac-evo-career.mjs content --search gt3
```

### Interfaccia grafica (consigliata)

Doppio click su **`apri-gui.cmd`** (o voce **1** del menu `avvia.cmd`): la carriera si apre
nel browser come un pannello professionale, con barra laterale, identità pilota in testa,
cruscotto con statistiche stagione (vittorie, podi, punti, grafico round), scheda gara con
**checklist spuntabile campo per campo** e copia negli appunti, calendario, classifica,
serie, paddock, import dei risultati con un click, difficoltà, messaggi e impostazioni.
Tutto resta sul tuo PC: il server ascolta solo su `127.0.0.1:8642` e usa lo stesso
file di salvataggio della CLI.

E sopra il Cruscotto c'è la banda **Aggiornamenti**: all'apertura la GUI confronta il
repository GitHub privato con il disco; se GitHub è più avanti (per esempio dopo un
ripristino, o su un secondo PC) appare la banda gialla «Ci sono N aggiornamenti» con
un bottone **Aggiorna ora** che installa tutto (fetch + `git merge --ff-only` + test)
dopo un tuo clic. Il consenso è sempre chiesto: niente aggiornamenti silenziosi,
e il save in `data/` resta fuori dal repo, quindi l'installazione tocca solo codice.

### Live: verifica automatica della gara (memoria condivisa)

Il tool legge i tre blocchi di **memoria condivisa ufficiale** di EVO (`Local\acevo_pmf_*`, sola
lettura, come fanno SimHub e gli overlay) tramite un piccolo helper PowerShell (`tools/acevo-live.ps1`):

- nella scheda gara del Cruscotto, una **banda Live** mostra in diretta se pista, sessione e auto
  impostate in EVO combaciano con quelle della carriera: pallini ✅/❌ campo per campo;
- nell'header, il chip "In pista" mostra posizione, giro e gap mentre corri.

Non serve nessuna configurazione: apri EVO e la banda si accende da sola.

### Catalogo e Archivio (stile Content Manager)

La GUI ha due sezioni di consultazione che leggono in sola lettura l'installazione:

- **Catalogo**: tutte le **71 auto con indice di prestazione** e le **18 piste con 35 layout**
  (dal catalogo del server dedicato), con ricerca istantanea, e la sezione **MoTec** che
  indicizza le tue sessioni di telemetria `.ld` per auto e pista, più il conteggio livree salvate.
- **Archivio**: tutte le sessioni presenti nei Results di EVO (gare, qualifiche, online e offline)
  con ricerca, e la **classificazione completa di ogni gara**: piloti, auto, giri, miglior giro,
  tempo totale e gap al vincitore al centesimo.

### Cominciare

```bash
node ac-evo-career.mjs new --name "Il Tuo Nome" --nation ITA
node ac-evo-career.mjs status
```

Si può cominciare anche direttamente dall'interfaccia grafica: apre sul modulo di
iscrizione dove scrivi il nome pilota (uguale a quello usato in EVO) e la nazione.

Si entra da una serie di livello 1 con 6.000 in tasca. La disciplina d'ingresso si sceglie con
`--discipline entry|touring|single|gt|endurance|strada`, altrimenti si comincia da Coppa Città.

```bash
node ac-evo-career.mjs series --discipline gt    # la scala: cosa è aperto, cosa manca
node ac-evo-career.mjs enter gt4_open            # cambia serie pagando affitto o acquisto
node ac-evo-career.mjs enter gt4_open --buy      # la compri invece di affittarla
```

**Nome pilota:** il nome che dai a `new` serve anche a riconoscerti nei risultati del gioco.
Se in EVO ti chiami diversamente, usa quello **del gioco** (`new --name "Mauro Turbigno"`, oppure
correggilo dopo con `rinomina --name "Mauro Turbigno"`): l'import riconosce prima la bandierina del
gioco, poi il nome, poi l'unico pilota senza contrassegno `•` (gli AI di EVO hanno il pallino
davanti al nome). Il nome che EVO usa per te si legge in `Logs\log-*.txt` alla riga
`Creating Car (Nome Cognome ...)`.

## La carriera: come è fatta

**79 serie, 6 discipline, 7 livelli, 4 tier** — non una linea retta, ma un albero che si attraversa
con le offerte di sedile.

| Tier | Livelli | Cosa si guida |
| --- | --- | --- |
| Rookie | 1–2 | compatte, monomarca, MX-5, GT86 |
| Semi-pro | 3–4 | storiche turbo, turismo, GT4, gruppo B |
| Pro | 5–6 | GT3, GT2, turismo pro, Formula 2004, endurance |
| Elite | 7 | Formula Elite (SF-25), GT Elite, Endurance Elite, Strada Elite |

Le sei discipline sono **Entry Level, Turismo, Monoposto, Gran Turismo, Endurance, Strada e Rally**.

- **Gate per posizione.** Ogni serie chiede un piazzamento nei primi *N* in una serie inferiore
  (es. `top: 5`). Senza quel risultato il sedile non è disponibile, e `series` ti dice cosa manca.
- **Accesso aperto o chiuso.** Le serie `open` si comprano o si affittano; quelle `closed`
  (Formula Elite, GT Elite, Endurance Elite, Strada Elite) sono parco chiuso: servono reputazione e un
  contratto. Con un contratto ufficiale non paghi il sedile, vieni pagato.
- **Economia per serie.** Modelli `pocket`, `sponsor`, `factory`, `heritage` con prezzo d'acquisto,
  affitto, iscrizione a gara, premio per posizione, bonus titolo e premio maggiorato (×1,5) nelle
  **prove iconiche** (Sebring 12h, Bathurst 12h).
- **Sistemi punti reali.** `club`, `one_make`, `f1_2003` (9-6-4-3-2-1 nella variante storica),
  `f1_modern` (giro veloce valido solo nei primi 10), `sro_gtwc`, `wec`, `historic_endurance`.
- **Calendario con formato.** Ogni round ha ora del giorno, giri e livello di meteo: l'ora e il meteo
  finiscono nella scheda gara, il profilo della serie decide durata di prove, qualifiche, partenza e
  pit obbligatorio.
- **Mondo vivo.** 240 piloti con **skill, aggressione, costanza**, archetipo di carattere
  (Attaccante, Metodico, Incontenibile, Regolarista), età che avanza, crescita fino ai 23 anni,
  calo dopo i 33, ritiri e nuovi rookie. Le serie alte pescano i piloti più forti del parco, quelle
  basse i rookie. Alcuni sono `hot` (in forma) e due per serie sono gli `iconici`.
- **Difficoltà a strati.** `totale = base + trim + offClass + offTrack` con un solo clamp su
  70–120, con un solo clamp su tutta la banda, convertito nello slider AI del gioco
  (70 → 30%, 120 → 100%: la serie d'ingresso sta intorno al 50%, l'apice al 95%).
  Il `trim` si adatta a te (±10) e ogni risultato anomalo non viene applicato in silenzio:
  resta in attesa e decidi con `difficulty --accept` o `--reject`.
- **Sponsor** che arrivano a soglie di reputazione, **contratti** e **offerte** di fine stagione
  ordinate per livello: le prime proposte sono i sedili più alti a cui puoi aspirare.
- **Contratti con obiettivi.** Firmato il sedile porti 3 clausole di stagione (podi, punti,
  vittorie, niente ritiri nelle prime gare, posizione in classifica): rispettate valgono il
  premio contrattuale, mancate il premio evapora. Il bilancio arriva a `season-end` e la storia
  resta nel palmarès.
- **Sponsor dinamici.** A inizio stagione può arrivare una proposta reale (quota a gara + missione
  "podio entro il round N"): la firmi, la rifiuti, e ogni euro entra nel registro flussi.
- **Sfide per round.** Una mini-sfida facoltativa a gara ("chiudi davanti a Anderson", "almeno
  terzo"): premio se ci riesci, penale di reputazione se fallisci. `sfida --accept` dalla CLI,
  un bottone nella scheda gara.
- **Sigilli.** Sfide personali permanenti (Luci spente, Grand Chelem, Sottano, Anno senza
  macchie…): si sbloccano da soli dopo ogni gara e vivono nella pagina Statistiche.
- **Duello della stagione.** Il tool elegge il rivale con cui ti combatti la classifica e tiene
  il conto aggiornato gara dopo gara.
- **Nemesi e vendetta.** Due scontri persi di fila fanno di un rivale una nemesi dichiarata:
  batterlo chiude la faida (e vale un trofeo).
- **Voci dal paddock.** A ogni round due piloti sono in forma, due in declino, e a metà
  calendario può debuttare un esordiente dal parco piloti.
- **Gazzetta.** Titoli e battute generate dai dati veri dopo ogni gara e a fine stagione,
  in pagina Gazzetta e col comando `gazzetta`.
- **Maestria delle piste.** Gare corse e miglior giro personale diventano un livello
  (novizio/conoscente/maestro) mostrato nel report pre-gara.
- **Pianificatore.** `piano` (o il bottone 🎯 nel cruscotto) dice dove puoi firmare l'anno
  prossimo, con gate mancanti, affitto e premio di ogni serie.
- **Registro flussi.** Ogni premio, sponsor, contratto, iscrizione e bonus è scritto in
  `data/flows.jsonl`: il dottore ricostruisce cassa e reputazione da lì, non più dalle regex
  sulla bacheca.
- **Journal.** La rassegna di fine stagione si esporta in `data/journal/stagione-N.md`
  (`review --export` da CLI, bottone "Salva su file" dalla GUI).

## Perché non si può lanciare la gara via file

Verificato sull'installazione reale, non per sentito dire:

- `AssettoCorsaEVO.exe` **non accetta argomenti** che carichino una sessione o una stagione.
- La definizione della sessione è **protobuf binario**: `last_season.seasondefinition` e
  `GameModes\GameModeType_*.gamemodesave`. Il gemello `.json` che trovi accanto è una copia
  leggibile scritta dal gioco, non un file di ingresso documentato.
- Il **formato dei risultati invece è JSON semplice e affidabile**:
  `Results\<aaaammgg-hhmmss>_SP_<Sessione>.sessionresults.json`, con classifica, giri, miglior giro,
  distacchi, soste e penalità. È quello che l'app legge. Le posizioni nel file sono 0-based
  (0 = vincitore): l'import lo rileva da solo.

Quindi il compromesso è: **una schermata di impostazioni da applicare in gioco (la scheda gara),
tutto il resto automatico.** Se Kunos in futuro esporrà un ingresso per le sessioni, l'unico pezzo da
sostituire è `src/race.mjs`.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `setup [--data <percorso>] [--game <exe>]` | rileva e salva i percorsi dell'installazione |
| `content [--validate\|--list\|--search <testo>]` | contenuto visto nell'installazione e verifica della scala |
| `new --name "Nome" [--nation ITA] [--discipline gt] [--force]` | comincia una carriera |
| `rinomina --name "Nome Cognome"` | cambia il nome pilota (deve combaciare con quello in EVO) |
| `status` | cruscotto: soldi, reputazione, sedile, tier, posizione |
| `series [--discipline gt] [--all]` | la scala completa, con gate e serie bloccate |
| `enter <nodeId> [--buy] [--force]` | cambia serie pagando affitto o acquisto |
| `calendar` | calendario della stagione, con ora e meteo di ogni round |
| `standings` | classifica della serie |
| `paddock [--all]` | piloti rivali: archetipo, età, banda di difficoltà |
| `messages` | messaggi dell'agente e notizie dal paddock |
| `next [--car <id>]` | la prossima gara con la scheda da impostare nel gioco |
| `race [--car <id>] [--dry-run] [--no-launch] [--force-launch]` | paga l'iscrizione, segna la gara attesa, apre EVO (se è già aperto non ne avvia una seconda istanza) |
| `import` | legge il risultato nativo e aggiorna la carriera |
| `import --position N --cars M [--dnf] [--fl]` | inserimento manuale se il file non basta |
| `import --inspect [--full]` | mostra i file di risultato trovati (segnando quelli già incassati) |
| `import --ledger` | registro degli import: file già incassati, eventi, doppi bloccati |
| `import --allow-any` / `--force` | cerca fra tutte le gare / forza un re-import (solo se sai perché) |
| `difficulty [--mode adaptive\|fixed\|custom] [--value N]` | come si calcola l'AI |
| `difficulty --lock <node>` / `--unlock <node>` | blocca la difficoltà di una serie |
| `difficulty --accept` / `--reject` | risponde a un suggerimento in attesa |
| `season-end [--force]` | chiude l'anno, paga il titolo e apre il mercato |
| `review [--season N]` | la rassegna della stagione: gare, rivali, duelli, premi |
| `dottore [--fix]` | verifica l'integrità della carriera e corregge le anomalie |
| `accept <n>` | accetta un'offerta di sedile |

## Personalizzare la scala

Tutto è in `config/career.evo.ladder.json`: discipline, livelli, gate, economia, sistemi punti, profili di
sessione, pool dei nomi e le 79 serie. Auto e piste si indicano con l'ID della cartella dentro
`content\cars` e `content\tracks` (per capirci: `ks_ferrari_296_gt3`, `imola`), e i nomi che vedi
nel menu stanno in `contentNames`.

```json
{
  "nodeId": "gt3_serie_a",
  "display": "GT3 Serie A",
  "discipline": "gt",
  "level": 5,
  "access": "open",
  "requires": { "nodeId": "gt3_coppa", "top": 5 },
  "points": "sro_gtwc",
  "profile": "feature",
  "gridSize": 20,
  "ai": [90, 101],
  "econ": { "buy": 550000, "rent": 55000, "entry": 8000, "prize": 65000, "champion": 190000, "model": "sponsor", "icon": "" },
  "cars": ["ks_ferrari_296_gt3", "ks_bmw_m4_gt3"],
  "calendar": [{ "track": "imola", "name": "Imola - Apertura", "laps": 11, "hour": 13, "weather": 0 }]
}
```

**`ai` è la banda della griglia**: il più forte sta in alto, il più debole in basso (nel progetto
d'origine è la `CurveSkill`). La difficoltà media della serie è il centro della banda, e da lì si applicano
trim adattivo e offset. La conversione verso lo slider del gioco è in `aiSlider`: se il gioco cambia
scala, si regola lì.

**Con contenuto EVO moddato**: il catalogo si costruisce dai file che il gioco scrive (log e
definition), quindi i mod arrivati dopo l'ultimo avvio potrebbero non comparire in `content --list`.
Scrivi comunque il loro ID nel ladder: `content --validate` ti dirà solo che non l'ha ancora visto, e
tu sai perché. Il mod in sé si installa come sempre, come `.kspkg` in `Saved Games\ACE\mods`.

## Provare tutto senza avere il gioco installato

```bash
node tools/evo-demo.mjs                     # installazione finta con dentro il contenuto della scala
ACE_DATA="demo/ace" node ac-evo-career.mjs content --validate
ACE_DATA="demo/ace" node ac-evo-career.mjs new --name "Mauro Sgamer" --nation ITA
ACE_DATA="demo/ace" node ac-evo-career.mjs race --no-launch
ACE_DATA="demo/ace" node tools/evo-fake-result.mjs --position 3 --cars 12 --track Imola --fl
ACE_DATA="demo/ace" node ac-evo-career.mjs import
```

`tools/evo-fake-result.mjs` scrive un file di risultato **nel formato reale** (posizioni 0-based,
pallino `•` sugli AI, `total_time` vuoto per il ritiro) e ha tre modalità:

| Opzione | Cosa scrive |
| --- | --- |
| `--position N --cars M` | gara completa con te alla posizione N |
| `--fl` | giro veloce tuo |
| `--dnf` | ritiro: finisci in fondo senza tempo totale |

Così si prova tutto il ciclo — punti, premi, ritiri, giro veloce, mercato di fine stagione —
senza guidare. `ACE_DATA` è un override esclusivo: con quello impostato l'app guarda **solo** quella
cartella e non tocca i tuoi dati veri.

## File del progetto

Il server dell'interfaccia grafica è `src/webui.mjs` (API JSON + pagina in `gui/index.html`):
stesse viste della CLI, stesso file di salvataggio `data/evo-career.save.json`. I launcher
`apri-gui.cmd` e `gui-run.cmd` servono solo ad avviare Node e aprire il browser.

```
ac-evo-career.mjs                      entry point
config/career.evo.ladder.json         la scala: discipline, livelli, gate, economia, punti, serie
src/paths.mjs                          rilevamento cartelle dati, eseguibile e lancio del gioco
src/content.mjs                        catalogo contenuto, verifica ID, suggerimenti
src/world.mjs                          piloti rivali, banda di serie, simulazione, evoluzione
src/state.mjs                          salvataggio, gate, classifica, economia, difficoltà
src/results.mjs                        lettura dei file di risultato nativi
src/import.mjs                         import unico (GUI+CLI+watcher): anti-doppioni, backup auto, log
data/imports-ledger.json               registro dei file risultato già incassati (per hash)
data/imports.log.jsonl                 log append-only di ogni tentativo di import
src/race.mjs                           scheda gara, iscrizione, gara attesa, lancio
src/cli.mjs                            i comandi
src/integrity.mjs                      revisore dei conti: coerenza gare/stats/cassa/bacheca
src/review.mjs                         rassegna di fine stagione (GUI + CLI)
tools/evo-demo.mjs                     installazione EVO finta per i test
tools/evo-fake-result.mjs              risultato di gara finto nel formato reale
tools/repair-20260924.mjs              riparazione una-tantum del doppio import di Fuji
tools/archive/                         sonde e script di prova storici
data/evo-career.save.json              la tua carriera (un file, da copiare o condividere)
data/evo.config.json                   percorsi forzati a mano (se servono)
data/results-archive/                  copia dei risultati grezzi di ogni gara importata
```

## Limiti, detti chiaramente

- **La gara non si può lanciare via file.** EVO ignora argomenti da riga di comando e legge le
  sessioni solo dalla sua interfaccia (definizioni protobuf binarie). L'app ti dà la schermata esatta
  da impostare e apre il gioco: due click e corri. L'unico intervento che resta in carico a te è
  **selezionare l'auto a mano** (non è fattibile da fuori al momento): quale, lo vedi nella scheda gara.
  Se questo cambierà, cambia solo `src/race.mjs`.
- **La difficoltà AI si imposta in gioco.** L'app la calcola (slider + aggressività + banda dei
  rivali) e la adatta a strati dopo ogni gara, ma lo slider lo muovi tu: il gioco non lo accetta da
  fuori. Il suggerimento adattivo resta in attesa finché non lo accetti o lo rifiuti.
- **Niente pannello dentro il gioco o in VR.** Il progetto d'origine usa una DLL per disegnare la sua
  interfaccia dentro AMS2. Qui non si tocca il processo del gioco: si alternano terminale e simulatore.
- **Il career nativo di EVO resta intatto.** Questa è una progressione parallela, non la sostituisce.
- **Meteo e nomi dei preset.** L'app indica il meteo bersaglio (es. "Scattered clouds" → "Overcast");
  i nomi esatti nell'interfaccia possono cambiare fra versioni.
- **Partenza lanciata e pit obbligatorio** sono nei profili delle serie endurance, ma restano note:
  non c'è modo di imporli da fuori, e l'app te lo scrive nella scheda.
- **La disciplina Strada e Rally usa i circuiti.** EVO ha il rally, ma non è pilotabile da un'app:
  le auto da rally e le stradali leggendarie corrono su pista, con profilo e meteo dedicati.
- **Il catalogo contenuto è ricostruito**, non letto da un manifest: il contenuto ufficiale è
  impacchettato in `content.kspkg`. L'app legge gli ID che il gioco scrive nei suoi file, quindi è
  una vista *osservata* dell'installazione, non un elenco certificato da Kunos.
- **Il formato del salvataggio è legato a questa versione** (`data/evo-career.save.json`, `version: 1`):
  se il modello cambia, l'app te lo dice e ti chiede di ricominciare invece di rompersi a metà.

## Backup: il magazzino

Il progetto è protetto da quattro copie indipendenti. Se una riparte ridotta a zero, le altre tre non muoiono con lei.

| copia              | cosa salva                                                            | dove                                 |
|--------------------|-----------------------------------------------------------------------|--------------------------------------|
| disco              | codice, dati e documenti di lavoro, storia git                        | cartella del progetto sul Desktop    |
| OneDrive           | zip completo (codice, git, save personali, mappe) e pacchetto portatile | cartelle OneDrive                   |
| magazzino su L:    | le stesse due zip, con impronte SHA-256 ricontrollate                 | disco L:, cartella CarrieraEVO       |
| off-site (configurata) | la sola storia git dei commit | repository privato su GitHub (`ac-evo-career`) |

Strumenti, in ordine di uso:

- AggiornaMagazzino.cmd sta nella cartella CarrieraEVO del disco L:  Un doppio click
  copia in magazzino gli ultimi zip (solo se sono cambiati), ricalcola le impronte
  SHA-256 e riscrive LEGGIMI-MAGAZZINO.txt con le impronte vere, non vecchie.
- controlla-magazzino.cmd sta nella cartella del progetto (oppure npm run magazzino).
  Dice se l'ultimo backup è vecchio oltre 21 giorni o se ci sono commit non ancora
  coperti dal backup. È un avviso: non tocca e non rompe nulla.
- avvia.cmd lancia in versione breve lo stesso controllo quando apre la interfaccia:
  parla solo se c'è un problema, resta muto se il disco L: è staccato di proposito.
- aggiornamenti.mjs (via avvia.cmd o il bottone nella GUI) è il controllo aggiornamenti:
  al lancio guarda il repository GitHub privato e se è avanti del disco chiede
  «Installare ora?» — sì = fetch + `git merge --ff-only` + `npm test`,
  no/Invio/15 s = si parte com'è. Nessun aggiornamento silenzioso in nessun caso,
  e il save in `data/` resta fuori dal repo: un aggiornamento tocca solo il codice.
- sincronizza-git.cmd è la copia off-site, già attiva: il remote `offsite` punta al
  repository privato su GitHub. A ogni esecuzione spinge la storia aggiornata; le
  credenziali browser (Git Credential Manager) sono già salvate. Solo se il remote
  si dovesse perdere: ricrearlo una volta con `git remote add offsite <url>`.

Ogni zip completo contiene la guida COME-RIPRISTINARE.txt con i passi per rimettere
in piedi il progetto (estrarre, npm test, avvia.cmd).

## Riferimenti

- **Il progetto di carriera per Automobilista 2** da cui nasce il modello: struttura ricavata
  leggendo la sua installazione (ladder, economia, punti, profili, classi e serie).
- **Assetto Corsa EVO**, formato dei risultati: `Results\*.sessionresults.json` nella cartella dati.
- **ACE Career Mode** (`acecareermode.com`), carriera di terze parti per EVO che usa i replay `.rpy`:
  utile come termine di paragone — qui si legge il risultato nativo, senza upload né account.

## Licenza

Opera privata: **© 2026 Mauro Turbigno — tutti i diritti riservati** (testo completo in
[LICENSE.md](LICENSE.md)). Niente ridistribuzione, pubblicazione o riuso in altri
prodotti senza autorizzazione scritta; le immagini ufficiali di auto e piste
(`gui/carmaps/`, `gui/trackmaps/`) restano di KUNOS e non sono ridistribuibili.
