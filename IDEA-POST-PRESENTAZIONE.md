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

- Pitwall non ha (ancora) la vivacità «da gioco» di Paddock: la GUI vive sul desktop, in gioco \
  c'è solo Cruscotto e i pennelli live. Paddock resta il posto per leggere la carriera col \
  gamepad sul divano.
- Pitwall does not have (yet) Paddock's in-game vivaciousness: the GUI lives on the desktop; \
  inside the game there is only Cruscotto and the live strips. Paddock stays the place to read \
  the career with a gamepad from the couch.
