# Idea — post di presentazione della suite (da scrivere quando si crea)
# Idea — post to present the suite (to write when publishing it)

Soggetto: **Pitwall** (`ac-evo-career`), la carriera automatizzata per Assetto Corsa EVO.
Subject: **Pitwall** (`ac-evo-career`), the automated career for Assetto Corsa EVO.

## Perché ce l'abbiamo: il confronto con Paddock — Why we built it: the Paddock comparison

Paddock fa molto bene la parte «in gioco»: la career si vive dentro EVO, col mouse e col volante.
Pitwall fa ciò che Paddock per progetto NON fa: **agisce** sul gioco (griglia, setup, automazioni)
e staffetta con te dal desktop. Sono compagni, non rivali — e ci tengo a dirlo: da Paddock abbiamo
preso più di un'idea: il ponte ai journal `pd-*.json`, il match graduale dei nomi auto, il bonus gara pulita
e il tetto reputazione.

Paddock does the in-game part very well: the career lives inside EVO, mouse and wheel only.
Pitwall does what Paddock by design does NOT: it **acts on the game** (grids, setups, automation)
and switches with you from the desktop. They are companions, not rivals — and we took our hat off
to Paddock more than once: the bridge to the `pd-*.json` journals, the gradual car-name matching,
the clean-race bonus and the reputation cap all came from there.

## Punti di forza da citare nel post — Strengths to mention in the post

- **Campionati procedurali, con misuglio totalmente random** — Fully procedural
  championships. Cinque livelli (Epoca → Corsa) nati da un pescaggio con seme
  riproducibile dentro il catalogo del gioco: serie **mono marca**, **multiclasse**
  e multiclasse con **zavorre e penalità automatiche intelligenti, procedurali**
  (calcolate dal ΔPI, cap 20% dichiarato, ricalibri per pista dal griglia-calib
  sui risultati veri). Il seme (es. 819802402) riproduce esattamente la stessa
  tiratura; un random a nuovo tira un miscuglio tutto suo: stradali, Cup, GT e
  epiche battuti insieme allo stesso livello. In GUI, il pannellino dei cinque
  «Campionati a miscuglio» si legge a pillola: seed, pool sorteggiato, quadro
  zavorre col tag cap e calendario — tutto cliccabile,schede auto e piste.
  In English: five tiers born from a seeded, reproducible draw through the
  game's catalog — mono-brand series, multiclass, and multiclass with smart,
  procedural automatic ballast/penalty rules (PI-delta formula, declared 20%
  cap, per-track recalibration from real results via grid-calib). The seed
  (e.g. 819802402) reproduces the exact same draw; a new one draws its own mix
  of road cars, Cup, GT and classics at the same level. The GUI's «Random-mix
  championships» panel tells it in one glance: seed, drawn pool, ballast table
  with cap tag and calendar — all clickable.

- **Tutto è cliccabile, stile Football Manager (dal 29/10)** — Everything is clickable, Football-Manager style. \
  Il nome di un'auto apre la sua scheda nel Libro delle auto (ricerca per parole: capisce \
  «Evo II» anche se il render si chiama «Evolution II»), un pilota apre la scheda rivali, \
  la pista il suo libro, la serie il tab Campionati, data/money/rep/season del righello \
  saltano al tab giusto. Nomen omen: il cruscotto è un cruscotto — premi e parti. \
  A car name opens its spec sheet in the Car book (word-based search: it understands «Evo II» \
  even if the render is called «Evolution II»), a driver opens the rival dossier, a track the \
  track book, a series the Championships tab, and the ruler's date/money/rep/season jumps to \
  the right tab.

- **I nomi dei piloti sono editabili** — Driver names are editable. Da qualunque scheda ricorrente — \
  Mondiale in Campionati, dossier rivale — il bottone «✏️ Rinomina» mette il soprannome tuo al posto \
  del nome dell'AI: il save con le storie reali resta intatto, il soprannome vale su tutte le \
  schermate (schede, statistiche, classifiche). Con i «Soprannomi in blocco» li aggiusti in fila. \
  From any recurring sheet — World Ranking, rival dossier — the «✏️ Rename» button puts your \
  nickname over the AI name: the save with the real stories stays intact, the nickname applies to \
  every screen (sheets, stats, rankings). «Nicknames in bulk» fixes a whole grid in one screen.

- **La copilota parla sempre italiano** — The copilot always speaks Italian (anche con \
  l'interfaccia in inglese), col chip «♪ prova» sul cruscotto per la verifica al volo. \
  (even with the UI in English), with the «♪ test» chip on the Dashboard for a quick check.

- **Il widget «Cruscotto» dentro il gioco** — The «Cruscotto» widget inside the game: pilota, \
  gare del giorno e serie iscritte senza uscire da EVO — e dal 28/10 anche la mini-classifica \
  della ronda corrente col collegamento al Mondiale della GUI. \
  driver, today's races and signed series without leaving EVO — and since 28/10 also the \
  mini-standings of the current round, with the link to the GUI's World Ranking.

- **La griglia che scrive davvero nel gioco** — The grid that really writes into the game. \
  Paddock legge la tua carriera; Pitwall la costruisce: sceglie le AI, le mette in macchina \
  (match graduale ESATTA→CONTIENE→PAROLE→ALIAS), applica zavorre per traccia da dati veri e \
  prepara i customgrid per i weekend di gara del gioco, con backup e verifica prima di scrivere. \
  Paddock reads your career; Pitwall builds it: it picks the AI, puts them in cars (gradual match \
  EXACT→CONTAINS→WORDS→ALIAS), applies per-track ballast from real data and prepares the game's \
  race-weekend customgrids — with a backup and a check before every write.

- **Il meccanico prepara il file, tu lo carichi** — The mechanic writes the file, you load it. \
  Pressioni, aero e benzina consigliate dalla telemetria dei TUOI giri, anteprima prima di \
  scrivere il `.carsetup`, caricamento a caldo in EVO senza riavvio. \
  Pressures, aero and fuel advised from YOUR laps' telemetry, a preview before the `.carsetup` \
  is written, hot load into EVO with no restart.

- **Bilanciamento con le classi auto giuste** — Balance with the right car classes. \
  Zavorre per traccia rare e leggere (proposte automatiche dai risultati reali: «questa auto \
  scappa di X sec: +Y%»), economia a colpo d'occhio in Statistiche (€/gara e rep/gara per \
  stagione), Mondiale skill-based con piloti iconici e forma. \
  Per-track ballast kept rare and light (proposals computed from real results: «this car escapes \
  by Xs: +Y%»), the economy at a glance in Stats (€/race and rep/race per season), a skill-based \
  World Ranking with iconic drivers and form.

- **La copilota non esiste in Paddock** — The copilot exists in no other career app: delta, \
  fuel, metà gara e meteo in vocale italiano durante la sessione. \
  delta, fuel, half-race and weather in Italian speech during the session.

- **Sicurezza del save** — Save safety: backup automatico del save di EVO prima di ogni import, \
  registro anti-doppioni (lo stesso file non paga due volte), verifica d'integrità della carriera \
  e rassegna di fine stagione esportabile. \
  automatic EVO save backup before every import, an anti-double-import ledger (the same file \
  never pays twice), a career integrity check and an exportable end-of-season review.

- **Giri liberi con libro PB** — Free practice with a PB book: ogni sessione di pratica che EVO \
  scrive si registra da sola, con libro PB per auto×pista e giro ideale sommato dai settori. \
  every practice session EVO writes gets logged by itself, with a car×track PB book and the \
  ideal lap summed from best-ever sectors.

- **Installazione per l'amico a un file** — Friend install in one file (`installa.cmd`), \
  aggiornamenti da soli (auto-update), tutto open source e aggiornato su GitHub. \
  self-updating (auto-update), open source and kept current on GitHub.

## Punti da NON citare (onestà) — Things NOT to mention (honesty)

- «In gioco c'è solo Cruscotto» NON si dice più (DA-8, verdetto 1/11):
  da 31/10 in gioco girano DUE app nostre — il **Cruscotto** (comandi
  e vetrina) e il **Pitwall** (radio del copilota, verdetto, finestra
  stint, sincro «Prepara e Divertiti») — più Paddock accanto. La vivacità
  «da gioco» non è più un limite da nascondere; resta vero che Paddock
  resta il posto COMODO per leggere la carriera col gamepad sul divano,
  e quello honesto si può ancora citare.
- The old claim "inside the game there is only the Dashboard" is DEAD
  (see above): in-game we now ship TWO apps of ours (Cruscotto + Pitwall)
  alongside Paddock. The remaining honest note: Paddock still owns the
  couch/gamepad reading experience — that much we can still say.

## Le foto del post — The post's photos

Due fotogrammi «in-diretta» già in canna (31/10): **segnaposto dell'UI**, da
dichiarare nel post come anteprime corse fuori dal gioco sul server vero
(sonde `tools/_preview-cruscotto.mjs` / `tools/_preview-pitwall.mjs`).
The two «live» shots already in the can (placeholders, flagged in the post
as previews rendered outside the game on real server data).

![Cruscotto in-diretta](docs/screenshots/in-diretta/cruscotto.png)
*Cruscotto — registro cambio auto, consigli dal box, «Prepara e Divertiti»*

![Pitwall in-diretta](docs/screenshots/in-diretta/pitwall.png)
*Pitwall — radio del copilota viva in sessione («box chiuso», benzina per
giri), ronda armata col via automatico*

La nota «🤖 engine non disponibile» della foto Cruscotto è il simbolo
dell'anteprima fuori dal gioco: in gioco non compare — va detto nella
didascalia. Il fotogramma «nel menù di EVO» (l'app vista DENTRO il gioco)
resta da fotografare col gioco aperto.
The «engine not available» strip is the out-of-game marker: say it in the
caption; the in-game frame (app inside EVO's menu) still needs the game open.

### Ricetta «07-engineer» — Recipe for the 07-engineer shot

Destinazione: `docs/screenshots/07-engineer.png` (slot libero: il README
cita 06 e 08, il 07 manca). Il fotogramma si scatta in DUE fasi —

**Fase A (offline, subito) — la scheda col piano stint pre-gara:**
1. iscriviti nella GUI a una enduro della tua scala: **Endurance GT4**
   (tab Campionati) è sbloccata — rep required 450 (la tua 699),
   iscrizione 3.500 €; GT3 Endurance resta chiusa (rep 800);
2. apri la scheda gara della ronda a tempo: la riga «⛽ Piano stint»
   compare SENZA partire in pista — il piano segue il SEDILE, non la
   sessione (`stintDurEff` legge `nextRound` di webui.mjs);
3. screenshot della scheda.

**Fase B (in sessione) — l'Ingegnere LIVE:**
4. in EVO entra in PROVE o QUALIFICHE della ronda: bastano per il banner
   LIVE (con la cronologia MoTeC del sedile già in casa, il calcolo viene
   dal piano raccolto in Fase A);
5. in GUI apri il pannello Ingegnere: banner di sessione + finestra viva;
6. la «finestra viva» (giri mancanti alla sosta, `stintStopAlert`) cresce
   col CONTO DEI GIRI: fotografa in GARA per il fotogramma completo —
   in qualifica il banner già basta per il segnaposto.

The two-phase recipe: Phase A (offline) — subscribe to **Endurance GT4**
(rep 450, €3,500 entry), open the race sheet, the «⛽ Stint plan» row shows
without driving (the plan follows the seat, not the session). Phase B (in
session) — enter PRACTICE/QUALIFYING for the LIVE banner (lap-count window
only fills during the race itself); photograph in the race for the full
frame, the banner alone is enough as a placeholder.

## VERDETTO DA-8 (1/11, rilettura di casa) — Claim verdict (1/11, DA-8)

Contro il codice, claim per claim — la bozza NON si pubblica finché il
verdetto resta fresco:

| # | Claim della bozza | Verdetto | Dove vive nel codice |
|---|---|---|---|
| 1 | Campionati procedurali (seed, cap 20%, zavorre intelligenti) | **VIVO** | viste-b.js «Pools sorteggiati a sorte dal catalogo · seed · cap 20%» · tools/_genera-stili.mjs · grid-calib.mjs. NEL POST usare il nome reale («Campionati a miscuglio» NON è il nome del UI) |
| 2 | Tutto cliccabile, stile Football Manager | **VIVO** | core.js + viste-*.js (schede auto/pilota/pista/serie dal 29/10) |
| 3 | Nomi piloti editabili + soprannomi in blocco | **VIVO** | core.js rinominaPilota (26/10) · viste-d.js bulkRinomina |
| 4 | Copilota in italiano + chip «♪ prova» | **VIVO** | voce-copilota.mjs · radio del Pitwall in gioco |
| 5 | Widget «Cruscotto» in gioco (mini-classifica 28/10) | **VIVO** | uiapp/cruscotto + uiapp-pub.mjs (miniClassifica) — e ora PURE l'orologio di giornata (1/11) |
| 6 | Griglia che scrive davvero nel gioco (prepara customgrid) | **VIVO** | gridbuilder.mjs + grid-apply.mjs + backup/verifica pre-scrittura |
| 7 | Meccanico: telemetria → .carsetup, caricamento a caldo | **VIVO** | carsetup.mjs + webui anteprima · hot.mjs |
| 8 | Zavorre per traccia dai risultati veri + Mondiale skill | **VIVO** | grid-calib.mjs · world.mjs (skill + forma) |
| 9 | Sicurezza save: backup, anti-doppioni, integrità, rassegna | **VIVO** | integrity.mjs · import.mjs (registro anti-doppioni) · review.mjs · backup-rotation.test.mjs |
| 10 | Giri liberi con libro PB | **VIVO** | hotlaps.mjs (carro×pista, giro ideale dai settori) |
| 11 | Install amico un file + auto-update GitHub | **VIVO** | installa.cmd · core.js barra «Aggiorna ora» (fetch+merge+test, save intatto) — v0.1.45 in package.json |
| 12 | (ex) «in gioco c'è solo Cruscotto» | **MORTO** | Pitwall in gioco da 31/10 (radio, verdetto, finestra, sincro) — visto sopra |

## RESIDUO DA-19 (agg. 1/11, dopo la v0.1.45) — Remaining items before the real post

Tre cose separano la bozza dal post VERO — una è garantita, due sono un gesto/una scelta:

| # | Residuo | Stato 1/11 | Cosa serve per chiudere |
|---|---|---|---|
| R1 | **Release pubblica** (DA-7 al suo turno) | Il pacchetto c'È e prova: `pacchetti/ac-evo-career-amico-v0.1.45-6f796e1.zip` su [report/release-0.1.45.md](report/release-0.1.45.md) — 697/697 test, danza amico 24/24 | il gesto di Mauro: `sincronizza-git.cmd` (push) + `node tools/crea-release.mjs v0.1.45 … --asset pacchetti/ac-evo-career-amico-v0.1.45-6f796e1.zip`. Il post segue la release, mai il contrario |
| R2 | **Canale** | NON deciso | forum EVO, subreddit (o entrambi): il TONO e la lunghezza cambiano — forum lungo e tecnico, subreddit corto con le foto in testa. Da scegliere PRIMA di montare il post. AGG. 3/11: la versione FORUM LUNGO è montata — [POST-PRESENTAZIONE-FORUM-LUNGO.md](POST-PRESENTAZIONE-FORUM-LUNGO.md) (tono tecnico, claim del verdetto, nomi veri degli schermi; il taglio corto resta POST-PRESENTAZIONE-IT.md) |
| R3 | **Apertura IT/EN** | IL DOPPIO ESISTE: la bozza è bilingue rigo per rigo — resta solo l'ORDINE | l'apertura IT (il pubblico EVO italiano è quello del copilota) e l'EN rincodata; si fissa insieme a R2 |

Restano fuori dalla tabella (già tracciate altrove): la caccia agli screenshot
della GUI (taccuino nel diario, § DA-19) e l'assicurazione che i nomi del
post usano i VERI nomi degli schermi (claim n.1 del verdetto: nel post si
dice «Pools sorteggiati…» NON «Campionati a miscuglio»).
