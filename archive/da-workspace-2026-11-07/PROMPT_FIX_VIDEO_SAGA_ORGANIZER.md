# Richiesta di fix — Video Saga Organizer (7 bug trovati nei test reali)

Ho testato il programma su un progetto reale: 41 clip video verticali 928×1376 generate con Grok, esportate come "Atomic_Wasteland_output". Ho verificato i risultati con ffprobe (metadati) e SHA-256 (integrità file). Analisi, ordinamento, report e sanitizzazione funzionano bene, ma ho trovato questi problemi. Sistemali tutti con modifiche mirate, senza rifattorizzare il resto.

---

## BUG 1 (CRITICO) — Incorporamento metadati MP4 sempre fallito, silenziosamente
**Evidenza reale**: con "Iniezione FFmpeg" attiva, tutte le 41 clip esportate sono bit-identical agli originali (SHA-256 identico), `metadata_embedded=false` su 41/41 e ffprobe non mostra alcun tag aggiunto.

**Cause nel codice**:
- `server.ts`, endpoint `/api/embed-metadata`: `fs.existsSync('/usr/bin/ffmpeg')` è un percorso **Linux hardcoded**. Dove ffmpeg non è lì (Windows locale con ffmpeg nel PATH, o container senza ffmpeg), `spawn('ffmpeg')` fallisce con ENOENT e il codice cade nel fallback che streama l'originale intatto, senza alcun errore visibile all'utente.
- Il test #6 in `/api/run-backend-tests` e il check ffmpeg in `/api/health` hanno lo stesso difetto (cercano solo `/usr/bin/ffmpeg`).
- In `ExportView.tsx` il flag `embedMetadataOption` parte `false`: se ci si dimentica di attivarlo, l'export esce senza metadati senza avviso.

**Fix richiesti**:
1. Risoluzione binario cross-platform: `const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';` eliminando il controllo hardcoded `/usr/bin/ffmpeg`. In `/api/health` verificare l'eseguibilità REALE con `ffmpeg -version` (spawn + exit code 0), non l'esistenza di un path.
2. Self-check post-embed: dopo un embed con exit code 0, verificare con `ffprobe -show_entries format_tags` che i tag scritti (title/comment) siano DAVVERO presenti nell'output; se mancano, rispondere `x-metadata-embedded: false` includendo lo stderr di ffmpeg nel warning.
3. All'export, se l'utente aveva attivato l'embed e alla fine risultano 0 clip embedded, mostrare un avviso ben visibile ("Embed metadati non riuscito su tutte le clip: ffmpeg non disponibile?").
4. In ExportView, pre-impostare `embedMetadataOption` in base a `/api/health`: true se ffmpeg funziona, false altrimenti (con nota esplicativa).

---

## BUG 2 (ALTO) — Prompt ricostruiti con aspect ratio fittizio "16:9" su video verticali
**Evidenza reale**: 39/41 prompt ricostruiti contengono "16:9 aspect ratio" mentre tutte le clip sono verticali 928×1376.

**Cause**: il prompt di `/api/analyze-clip` contiene l'istruzione fissa "..., aspect ratio 16:9" (hardcoded). Lo stesso testo fisso è in `/api/regenerate-prompt` e in `src/utils/intelligentFallback.ts` (`generateIntelligentPrompt`). Le dimensioni reali sono già estratte in `mediaFrames.ts` e salvate in `resolution`/`width`/`height`, ma non vengono passate al modello né usate nel testo.

**Fix**: passare `width`/`height` reali a `/api/analyze-clip` e sostituire l'istruzione con: "Indica l'aspect ratio corretto in base alla risoluzione fornita (${width}x${height}; verticale se height>width, orizzontale altrimenti). NON inventare un aspect ratio diverso." Applicare la stessa correzione in `/api/regenerate-prompt` (aggiungere width/height alla request) e in `intelligentFallback.ts` (usare `clip.width`/`clip.height`, che esistono già sul tipo).

---

## BUG 3 (MEDIO) — manifest.txt dichiara "Metadati Incorporati: SÌ" anche quando è fallito
**Evidenza reale**: `MANIFEST_SEQUENZA.txt` diceva "SÌ (FFmpeg stream copy)" mentre `project_summary.txt` diceva correttamente "0 su 41".

**Causa**: in `src/utils/exporters.ts`, `generateManifestTxt()` usa `project.settings.embed_metadata` (il SETTING) invece del risultato reale.

**Fix**: usare il conteggio effettivo: `${project.editable_items.filter(i => i.metadata_embedded).length} su ${project.editable_items.length}`.

---

## BUG 4 (ALTO, UX) — Impossibile ripristinare l'ordine cronologico di creazione prima dell'export
**Evidenza reale**: dopo il riordino narrativo AI, 40/41 posizioni deviano dall'ordine di creazione (es. le clip CLIP_040 e CLIP_041, create per ULTIME, vengono esportate come posizioni 002 e 003; la CLIP_002 esce come 004). In UI non esiste modo di tornare all'ordine di creazione:
- "Ordina per nome originale (A→Z)" è inutile per file con nomi UUID random (ordine alfabetico ≠ creazione).
- "Ordina per data metadati" è un no-op quando i file NON hanno il tag `creation_time` (tutte le date = 0 → nessun riordino). Le mie clip Grok non hanno quel tag.

**Fix richiesti**:
1. Nuovo bottone "Ripristina ordine di creazione (CLIP_001 → N)" nella vista Ordinamento: ordina `editable_items` per `clip_id` numerico e rigenera `position` + `new_filename`.
2. In `handleSortByMetadataDate` (e Desc), aggiungere il fallback quando `metadata.creation_time` è assente: usare `(blob as File).lastModified` e infine `clip_id` numerico — la stessa logica già usata all'import in `App.tsx` (il sort cronologico iniziale).
3. Nella fase di ricostruzione ordine, aggiungere l'opzione "Non riordinare con l'AI: mantieni l'ordine di creazione" (checkbox o bottone), così la numerazione dell'export può coincidere con l'inventario quando serve.
4. (Nice to have) Nella vista export, un badge "ordine: narrativo / cronologico" per chiarire che i numeri dei file indicano la posizione finale, non la creazione.

---

## BUG 5 (MEDIO) — L'ordinamento narrativo AI vede poche immagini
**Evidenza**: in `App.tsx` la chiamata a `/api/reconstruct-order` invia solo `contact_sheets.slice(0, 2)`: con 41 clip (~5 contact sheet), Gemini vede le immagini di ~20 clip e per le altre si affida solo al testo delle descrizioni.

**Fix**: inviare tutti i contact sheet (con limite di sicurezza sul payload, es. max 8 e JPEG quality ~0.6), oppure — meglio — includere per OGNI clip una miniatura 320px (sono già generate in `mediaFrames.ts`) direttamente nell'array delle clip nel JSON, così il modello vede tutte le clip e non solo metà.

---

## Note minori
- Il campo copyright nelle impostazioni è arrivato corrotto ("� 2026"): verificare la gestione UTF-8 nel salvataggio/lettura delle settings.
- In `/api/embed-metadata` aggiungere nel warning al client il codice di errore e un estratto dello stderr di ffmpeg (oggi il client vede solo "false", impossibile diagnosticare).

## BUG 7 (CRITICO — scoperto il 07/10/2026) — "Analizza" sovrascrive i prompt veri con 5 template fissi
**Evidenza reale**: su 7304 asset, 2769 clip hanno il campo prompt sovrascritto da uno di 5 template generici («Cinematic 4k heavy metal masterpiece, Heavy Metal Titan…», «Iron Berserker Warrior…», «Midnight Thunder Sorcerer…», «Undead Pharaoh King…», «Eddie The Head…»), perdendo i prompt originali Grok. Il backup `vault-catalog.backup-234437.json` è POSTUMO: è stato salvato quando i prompt erano già template, quindi non serve al ripristino.

**Cause**: la funzione "Analizza" (Gemini) scrive il prompt generato sull'asset senza controllare se esiste già un prompt vero; il backup del catalogo viene creato DOPO il danno, non prima dell'operazione rischiosa. Inoltre Gemini non aveva API key attiva (log server: `false`): i 5 template vengono dal fallback senza che l'utente se ne accorga.

**Fix richiesti**:
1. "Analizza" NON deve mai sovrascrivere un prompt esistente non vuoto: se l'asset ha già un prompt, chiedere conferma o scrivere in un campo separato (es. `aiPrompt`).
2. Se l'API key Gemini non è configurata, BLOCCARE l'analisi con un messaggio chiaro invece di riempire il vault con fallback generici.
3. Backup AUTOMATICO del catalogo PRIMA di ogni operazione che scrive in massa (analisi, rinomina massiva), con timestamp: `vault-catalog.json.pre-analisi-<TS>.json`.
4. (Consigliato) Rinominare in una sottocartella "output" invece che in place, così l'originale resta intatto.

*Ripristino già fatto (07/10/2026)*: 231 prompt veri recuperati dai prompts.txt delle cartelle Acero Y Destino (46), Atomic Wasteland (41), Canto dell eternità (45), Carica nel tuono (45), Cavalca dove il cielo (54) + 99 successivi (Cavalco con i fantasmi 43, Cavaliere del deserto 56) tramite lo script `vault_importa_prompt.py`, ora integrato nel programma col pulsante **🔄 Import da Disco (Rinomine + Prompt)** nella vista Archivio (endpoint `/api/vault/import-from-disk`, backup pre-scrittura automatico, idempotente).

---

## BUG 8 (MEDIO — GIÀ SISTEMATO in locale) — Dedup del registro batch falliva per separatori `/` vs `\`
**Evidenza reale**: risegnando `D:\Video musicale\EDDIE` dal browser, TUTTI i file venivano registrati una seconda volta: il client manda `originalPath` con separatori `/`, il catalogo li ha memorizzati con `\`, quindi `knownPaths.has(itemPath)` non trovava mai corrispondenze.

**Fix applicato** in `server/archive-vault.ts` (`registerMetadataBatch`): normalizzazione dei separatori prima del confronto — `const normSep = (p) => p.replace(/\\/g, '/')` — su entrambi i lati. Verificato dal vivo: POST con asset di prova + montaggio da 264 MB → 7304 asset prima e dopo, zero doppioni.

---

## BUG 9 (CRITICO — trovato e SISTEMATO il 07/10/2026) — Montaggi con sequenze video identiche
**Evidenza reale**: "Cavalco con i fantasmi" (ieri) e "Cavaliere del deserto" (oggi) sono usciti con **83/84 shot identici nella stessa posizione**: solo la canzone cambiava. Causa nel motore Eddie (`server/eddie-engine.ts`): la selezione era 100% deterministica (rotazione fissa `pickI*7+si*13+k` su cartelle in ordine alfabetico + indici pool deterministici) e non esisteva memoria tra montaggi: stessa struttura sezioni ⇒ stesso video.

**Fix applicato (motore semantico locale, senza Gemini)**:
1. **Struttura utente**: il formato incollato «0:39 – Verse 1 (...); 2:08 – Guitar Solo (...)» viene riconosciuto da `/api/audio/parse-lyrics` (funzione `parseStructureSections`) e usato come struttura del montaggio al posto dell'analisi automatica, con lyrics e descrizioni per sezione.
2. **Cervello semantico**: ogni clip riceve un punteggio dal testo della sezione: match lyrics (×3), profilo d'energia del ruolo (intro/outro → clip CALME: cammina/osserva/silenzio; chorus → EPICHE: carica/fuoco/tempesta; solo → CHITARRA: chitarr/suona/palco; breakdown → tensione), bonus +4 per le clip della cartella del brano stesso, micro-casualità tie-break.
3. **Memoria anti-identici**: `data/eddie-montage-history.json` registra le clip dei montaggi completati (ultimi 50); i successivi evitano quelle finché il pool lo permette.
4. **Audit**: il piano salva `src` (clip originale) e `score` per capire perché ogni shot è stato scelto.

Verificato dal vivo: 2 montaggi identici in struttura → **0 clip in comune**; assolo → clip con "guitarist/playing electric guitar" nei prompt; intro → "Eddie emerges from ash storm". Lo zero-copertura metadata degrada in ordine casuale (mai più identico).

---

## Priorità di implementazione
BUG 7 → BUG 1 → BUG 2 → BUG 4 → BUG 3 → BUG 5. Il BUG 8 è già risolto in locale (riportare la patch se il codice viene rigenerato). Il BUG 9 è risolto col motore semantico locale (vedi sopra). Dopo le modifiche, aggiorna anche i test #6 e #12 della suite interna per riflettere i nuovi controlli.

Restituisci i file modificati: `server.ts`, `src/utils/exporters.ts`, `src/components/ExportView.tsx`, `src/App.tsx`, `src/utils/intelligentFallback.ts` (anche solo le parti coinvolte, ma indicando con precisione posizione e righe).
